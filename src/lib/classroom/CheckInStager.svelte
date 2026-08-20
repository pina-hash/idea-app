<script lang="ts">
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
	 */
	let {
		staged = null,
		busy = false,
		label = 'Notebook check-in',
		submitLabel = 'Attach check-in',
		hint = null,
		onstage,
		onremove = null
	}: {
		/** The draft currently held, or null while the form is open. */
		staged?: CheckInDraft | null;
		busy?: boolean;
		label?: string;
		submitLabel?: string;
		hint?: string | null;
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

	function reset() {
		unit = '';
		date = '';
		name = '';
		issue = null;
	}

	function confirm() {
		const draft: CheckInDraft = {
			unit_number: unit,
			session_date: date,
			session_label: name
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
</style>
