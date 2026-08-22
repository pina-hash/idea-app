<script lang="ts">
	import CheckInGuidance from '$lib/CheckInGuidance.svelte';
	import type { TiptapNode } from '$lib/rich-text';
	import {
		CHECK_IN_UNIT_MAX,
		CHECK_IN_UNIT_MIN,
		checkInDraftIssue,
		type CheckInDraft
	} from '$lib/classroom/class-check-ins';

	/**
	 * A NOTEBOOK CHECK-IN, AUTHORED BESIDE THE THING IT IS ABOUT.
	 *
	 * Three fields -- unit, day, name -- which is exactly what a check-in IS
	 * (`notebook_admin_upsert_session`'s authored columns). The CLASSES it runs
	 * in are deliberately not among them: a check-in attached to an item runs
	 * where that item is posted, and asking twice is how the two come to
	 * disagree.
	 *
	 * IT DECIDES NOTHING AND WRITES NOTHING. The parent says what "confirm"
	 * means: the composer stages the draft and applies it when the item exists,
	 * the item page hands it straight to an RPC. That split is why one component
	 * serves both without either of them owning a copy of the form.
	 *
	 * VALIDATION IS `checkInDraftIssue`, the shared function that mirrors the
	 * RPC's own three refusals -- not a second opinion written in a component.
	 * The RPC re-checks everything regardless; this exists so somebody finds out
	 * while they are typing.
	 *
	 * THE GUIDANCE PROMPT (0123) IS A FOURTH FIELD AND IS NOT A FOURTH REFUSAL.
	 * It rides the draft rather than the payload, because the payload goes to
	 * `notebook_admin_upsert_session` -- a whole-row replace that reconciles the
	 * section list -- and a prompt must never be able to unpost a class. It is
	 * written by the narrow RPC, by whoever the parent hands the draft to. The
	 * word counter beside it never gates anything, here or anywhere.
	 *
	 * IT IS OFFERED ONLY WHERE IT CAN BE WRITTEN. `guidanceAvailable` false
	 * removes the field outright -- a project whose schema predates 0123, or a
	 * caller with no transport for it -- rather than collecting prose that has
	 * nowhere to go.
	 */
	let {
		staged = null,
		busy = false,
		label = 'Notebook check-in',
		submitLabel = 'Attach check-in',
		hint = null,
		guidanceAvailable = false,
		onstage,
		onremove = null
	}: {
		/** The draft currently held, or null while the form is open. */
		staged?: CheckInDraft | null;
		busy?: boolean;
		label?: string;
		submitLabel?: string;
		hint?: string | null;
		/**
		 * Whether a guidance prompt can be WRITTEN from this mount. False removes
		 * the field, which is the honest state on a deployment without 0123.
		 */
		guidanceAvailable?: boolean;
		/** A valid draft, confirmed. What happens to it is the parent's business. */
		onstage: (draft: CheckInDraft) => void;
		/** Absent removes the control -- a surface that cannot take it back. */
		onremove?: (() => void) | null;
	} = $props();

	let open = $state(false);
	// `string | number`, because bind:value on a number input COERCES and an
	// emptied field binds to '' -- the repo's three-times trap.
	let unit = $state<string | number>('');
	let date = $state('');
	let name = $state('');
	let issue = $state<string | null>(null);
	/** The editor's own document, or null before it has mounted. */
	let guidance = $state<TiptapNode | null>(null);
	/**
	 * Bumped to REMOUNT the editor on a reset. Tiptap is seeded once, on mount,
	 * so clearing `guidance` alone would empty the variable and leave the
	 * paragraph on screen -- the same reason the composer keys its body editor.
	 */
	let guidanceKey = $state(0);

	function reset() {
		unit = '';
		date = '';
		name = '';
		issue = null;
		guidance = null;
		guidanceKey += 1;
	}

	function confirm() {
		const draft: CheckInDraft = {
			unit_number: unit,
			session_date: date,
			session_label: name,
			// Only when this mount can write one, so a draft can never carry a
			// prompt the parent has no transport to apply.
			guidance: guidanceAvailable ? guidance : null
		};
		const problem = checkInDraftIssue(draft);
		issue = problem;
		if (problem) return;
		onstage(draft);
		reset();
		open = false;
	}
</script>

<div class="ci-stager">
	<span class="mini-label">{label}</span>

	{#if staged}
		<p class="ci-line" data-testid="staged-check-in">
			<span class="ok-dot"></span>
			<strong>{staged.session_label}</strong>
			<span class="ci-meta">
				Unit {staged.unit_number} &middot; {staged.session_date}
				{#if !busy}&middot; attaches on save{/if}
			</span>
		</p>
		{#if guidanceAvailable && staged.guidance}
			<!-- Named, not rendered. The prompt is authored on the form above and
			     read by students on the check-in itself; repeating it here would be a
			     second copy of the same paragraph on the same screen. -->
			<p class="ci-meta" data-testid="staged-check-in-guidance">Guidance written.</p>
		{/if}
		{#if onremove && !busy}
			<span class="ci-actions">
				<button
					type="button"
					class="btn secondary tiny"
					data-testid="staged-check-in-remove"
					onclick={onremove}
				>
					Remove check-in
				</button>
			</span>
		{/if}
	{:else if open}
		<!-- Not a <form>: this is inside the composer's own form, and a nested
		     one is invalid HTML that submits the wrong thing. -->
		<div class="ci-fields">
			<label class="ci-field">
				<span>Unit</span>
				<input
					type="number"
					min={CHECK_IN_UNIT_MIN}
					max={CHECK_IN_UNIT_MAX}
					step="1"
					bind:value={unit}
					data-testid="check-in-unit"
				/>
			</label>
			<label class="ci-field ci-date">
				<span>Day</span>
				<input type="date" bind:value={date} data-testid="check-in-date" />
			</label>
			<label class="ci-field ci-name">
				<span>Name</span>
				<input
					type="text"
					maxlength="120"
					placeholder="Bearing teardown"
					bind:value={name}
					data-testid="check-in-label"
				/>
			</label>
		</div>

		<!-- STAGED, NOT SAVED: there is no check-in to write to until the item
		     exists, so no `onsave` is handed in and the field carries no save
		     machinery at all. Whoever takes the draft applies it. -->
		{#if guidanceAvailable}
			<div class="ci-guidance">
				{#key guidanceKey}
					<CheckInGuidance
						disabled={busy}
						hint="Optional. Students read this in their notebook, above the entry they are about to file."
						testId="check-in-guidance"
						onchange={(doc) => (guidance = doc)}
					/>
				{/key}
			</div>
		{/if}
		<span class="ci-actions">
			<button
				type="button"
				class="btn secondary tiny"
				data-testid="check-in-confirm"
				disabled={busy}
				onclick={confirm}
			>
				{submitLabel}
			</button>
			<button
				type="button"
				class="btn secondary tiny"
				data-testid="check-in-cancel"
				disabled={busy}
				onclick={() => {
					reset();
					open = false;
				}}
			>
				Cancel
			</button>
		</span>
		{#if issue}
			<p class="feedback error" data-testid="check-in-issue">{issue}</p>
		{/if}
	{:else}
		{#if hint}
			<p class="hint">{hint}</p>
		{/if}
		<span class="ci-actions">
			<button
				type="button"
				class="btn secondary tiny"
				data-testid="check-in-open"
				disabled={busy}
				onclick={() => (open = true)}
			>
				Add a check-in
			</button>
		</span>
	{/if}
</div>

<style>
	/* `ci-` prefixed, per the house rule: app.css owns a global `.callout`,
	   `.row` and friends, and an unprefixed class here would inherit a layout
	   nothing in this component asked for. */
	.ci-stager {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.ci-fields {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.ci-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		/* An automatic minimum is min-content, which would push the composer
		   wider than its pane on a narrow screen. */
		min-width: 0;
		flex: 0 0 auto;
	}
	.ci-field span {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.ci-field input {
		min-height: 44px;
	}
	.ci-field input[type='number'] {
		width: 5.5rem;
	}
	.ci-date {
		flex: 0 1 12rem;
	}
	.ci-name {
		flex: 1 1 14rem;
	}
	.ci-name input {
		width: 100%;
	}
	.ci-line {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		font-size: 0.9rem;
	}
	.ci-meta {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.ok-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--green);
		display: inline-block;
	}
	.ci-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.ci-guidance {
		/* Its own block under the three inline fields: the prompt is prose and
		   wrapping it into the same flex row would give it a 14rem measure. */
		min-width: 0;
	}
</style>
