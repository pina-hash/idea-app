<script lang="ts">
	/**
	 * THE ONE FORM FOR A TOURNAMENT'S NAME, DESCRIPTION AND FORMAT (ledger
	 * 0298, report R02). `/tournaments/new` mounts it to create, the host
	 * console's Settings card mounts it to edit, and `/dev/tournament-settings`
	 * mounts the identical thing. Presentation plus one callback: the parent
	 * owns the RPC (`tournament_create` / `tournament_update`) and hands back
	 * `busy` and the refusal, which renders HERE, verbatim, where the host was
	 * working.
	 *
	 * The arithmetic lives in `settings.ts`: the draft, the whole config it
	 * becomes, and the locks. A lock is a sentence, never a silent grey-out:
	 * once the bracket exists the format is shown as TEXT with the reason
	 * above it, and a single locked toggle keeps its label at full ink with
	 * the reason under it.
	 *
	 * THE DRAFT FOLLOWS THE STORED VALUES FIELD BY FIELD (`rebaseDraft`).
	 * The host console refetches on every co-host write (its realtime
	 * channel), so re-seeding the whole draft on every new prop would wipe a
	 * half-typed change the moment somebody else added an entry, and keeping
	 * the whole draft would put a co-host's rename back the next time this
	 * host saved a description. When the stored values actually move, every
	 * field this host has not edited takes the new value and every field they
	 * have edited keeps theirs; a save of its own coming back is the case
	 * where the two agree.
	 */
	import { untrack } from 'svelte';
	import {
		bestOfChoices,
		draftFromStored,
		draftSignature,
		hiddenRoundOverrides,
		OPEN_LOCKS,
		rebaseDraft,
		settingsChanges,
		TEAM_SIZES,
		teamSizeLabel,
		validateSettings,
		type SettingsDraft,
		type SettingsLocks
	} from './settings';

	let {
		mode,
		name = '',
		description = '',
		config = {},
		locks = OPEN_LOCKS,
		minTeamSize = 1,
		busy = false,
		error = '',
		saved = '',
		submitLabel,
		onsubmit
	}: {
		/** `create` for a new tournament, `edit` for the host console. */
		mode: 'create' | 'edit';
		/** The STORED values (edit). A new tournament passes nothing. */
		name?: string;
		description?: string;
		config?: unknown;
		locks?: SettingsLocks;
		/** The largest roster already registered: smaller team sizes are
		 * refused by `tournament_update`, so they are not offered. */
		minTeamSize?: number;
		busy?: boolean;
		/** The RPC's refusal, rendered verbatim. */
		error?: string;
		/** The acknowledgement of a landed save, with its clock time. */
		saved?: string;
		submitLabel?: string;
		onsubmit: (draft: SettingsDraft) => void;
	} = $props();

	const stored = $derived(draftFromStored(name, description, config));
	const storedSig = $derived(draftSignature(stored));

	let draft = $state<SettingsDraft>(untrack(() => ({ ...draftFromStored(name, description, config) })));
	// Plain, not $state: the stored draft the form last followed.
	let base: SettingsDraft = untrack(() => draftFromStored(name, description, config));

	$effect(() => {
		const next = stored;
		const sig = storedSig;
		untrack(() => {
			if (sig === draftSignature(base)) return;
			draft = rebaseDraft(base, draft, next);
			base = next;
		});
	});

	const changes = $derived(settingsChanges(stored, draft, locks));
	const anyChange = $derived(changes.name || changes.description || changes.format);
	const label = $derived(submitLabel ?? (mode === 'create' ? 'Create tournament' : 'Save settings'));
	const defaultChoices = $derived(bestOfChoices(draft.bestOfDefault));
	const grandFinalChoices = $derived(bestOfChoices(draft.bestOfGrandFinal));
	const hidden = $derived(hiddenRoundOverrides(config));

	let formError = $state('');
	// The parent's refusal is about the draft that was sent. Discarding that
	// draft puts the stored values back on screen, so the refusal beside them
	// would describe something no longer there; it is set aside until the
	// next press (the parent clears it then anyway).
	let setAside = $state('');

	function submit() {
		formError = '';
		setAside = '';
		const problem = validateSettings(draft);
		if (problem) {
			formError = problem;
			return;
		}
		// The same predicate that marks the control: nothing to send is said,
		// not silently ignored.
		if (mode === 'edit' && !anyChange) {
			formError = 'Nothing has changed yet.';
			return;
		}
		onsubmit({ ...draft });
	}

	function discard() {
		formError = '';
		setAside = error;
		draft = { ...stored };
	}

	const shownError = $derived(formError || (error && error !== setAside ? error : ''));
</script>

<div
	class="ts-form"
	data-testid="tournament-settings"
	data-mode={mode}
	data-format-locked={locks.format ? 'true' : 'false'}
>
	<label class="ts-row">
		<span>Name</span>
		<input
			type="text"
			maxlength="80"
			bind:value={draft.name}
			placeholder="Tournament name"
			data-field="name"
		/>
	</label>
	<label class="ts-row">
		<span>Description</span>
		<textarea
			rows="3"
			bind:value={draft.description}
			placeholder="What is this tournament?"
			data-field="description"
		></textarea>
	</label>

	{#if mode === 'edit'}
		<p class="ts-group" id="ts-format-label">Format</p>
	{/if}

	{#if locks.format}
		<p class="ts-lock" data-testid="settings-format-lock">{locks.format}</p>
		<dl class="ts-summary" data-testid="settings-format-summary" aria-labelledby="ts-format-label">
			<div>
				<dt>Qualifying pools</dt>
				<dd>{stored.qualsEnabled ? 'On' : 'Off'}</dd>
			</div>
			<div>
				<dt>Results</dt>
				<dd>{stored.scoreEntry ? 'Per-game scores' : 'Win or loss only'}</dd>
			</div>
			<div>
				<dt>Best of (default, per match)</dt>
				<dd>Best of {stored.bestOfDefault}</dd>
			</div>
			<div>
				<dt>Registrants per entry</dt>
				<dd>{teamSizeLabel(stored.teamSize)}</dd>
			</div>
			<div>
				<dt>Grand final</dt>
				<dd>
					{stored.bestOfGrandFinal > 0 ? `Best of ${stored.bestOfGrandFinal}` : 'Same as default'}
				</dd>
			</div>
		</dl>
	{:else}
		<div class="ts-format" data-testid="settings-format-fields">
			<label class="ts-row ts-toggle">
				<input
					type="checkbox"
					bind:checked={draft.qualsEnabled}
					disabled={!!locks.quals}
					data-field="quals_enabled"
				/>
				<span>Qualifying pools before the bracket (head-to-head round robin, seeds the bracket)</span>
			</label>
			{#if locks.quals}
				<p class="ts-lock" data-testid="settings-quals-lock">{locks.quals}</p>
			{/if}
			<label class="ts-row ts-toggle">
				<input
					type="checkbox"
					bind:checked={draft.scoreEntry}
					disabled={!!locks.score}
					data-field="score_entry"
				/>
				<span>Record per-game scores (off = win/loss only)</span>
			</label>
			{#if locks.score}
				<p class="ts-lock" data-testid="settings-score-lock">{locks.score}</p>
			{/if}
			<label class="ts-row">
				<span>Best of (default, per match)</span>
				<select bind:value={draft.bestOfDefault} data-field="best_of_default">
					{#each defaultChoices as n (n)}<option value={n}>Best of {n}</option>{/each}
				</select>
			</label>
			<label class="ts-row">
				<span>Registrants per entry</span>
				<select bind:value={draft.teamSize} data-field="team_size">
					{#each TEAM_SIZES as n (n)}
						<option value={n} disabled={n < minTeamSize}>{teamSizeLabel(n)}</option>
					{/each}
				</select>
			</label>
			{#if minTeamSize > 1}
				<p class="ts-hint" data-testid="settings-team-floor">
					An entry already has {minTeamSize} registrants, so the size cannot go below {minTeamSize}.
				</p>
			{/if}
			<label class="ts-row">
				<span>Grand final</span>
				<select bind:value={draft.bestOfGrandFinal} data-field="grand_final">
					<option value={0}>Same as default</option>
					{#each grandFinalChoices as n (n)}<option value={n}>Best of {n}</option>{/each}
				</select>
			</label>
		</div>
	{/if}

	{#if hidden.length}
		<p class="ts-hint" data-testid="settings-hidden-overrides">
			Round lengths set elsewhere ({hidden.join(', ')}) are not shown here, and saving keeps them.
		</p>
	{/if}

	{#if shownError}<p class="ts-error" role="alert" data-testid="settings-error">{shownError}</p>{/if}
	{#if mode === 'edit' && saved && !anyChange && !shownError}
		<p class="ts-saved" role="status" data-testid="settings-saved">{saved}</p>
	{/if}

	<div class="btn-row">
		<button
			type="button"
			class="btn ts-submit"
			onclick={submit}
			disabled={busy}
			aria-disabled={mode === 'edit' && !anyChange ? 'true' : undefined}
			data-action="settings-submit">{label}</button
		>
		{#if mode === 'edit' && anyChange}
			<button
				type="button"
				class="btn secondary"
				onclick={discard}
				disabled={busy}
				data-action="settings-discard">Discard changes</button
			>
			<span class="ts-dirty" data-testid="settings-dirty">Unsaved changes</span>
		{/if}
	</div>
</div>

<style>
	/* A form, not a listing: capped at the design system's form measure so a
	 * select does not stretch across the host console's split measure. The
	 * new-tournament page already sits in that measure, so this changes
	 * nothing there. */
	.ts-form {
		max-width: var(--measure-form, 48rem);
	}
	.ts-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.9rem;
	}
	.ts-row > span,
	.ts-group {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.ts-group {
		margin: 1.2rem 0 0.7rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--line, rgba(0, 255, 65, 0.25));
	}
	/* 44px floor on every field (CLAUDE.md, the student-facing tap target):
	 * any signed-in account can open the new-tournament page and a host runs
	 * the console from a phone. `min-height`, never a height, so a textarea
	 * still grows; border-box so the floor is the box a finger meets. */
	.ts-row input[type='text'],
	.ts-row textarea,
	.ts-row select {
		box-sizing: border-box;
		min-height: 44px;
		background: var(--bg0);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	/* A checkbox is measured at its label (the thing a finger hits), and a
	 * one-line label is about 19px tall: the same 44px floor, on the label. */
	.ts-row.ts-toggle {
		flex-direction: row;
		align-items: center;
		gap: 0.6rem;
		min-height: 44px;
	}
	.ts-row.ts-toggle > span {
		text-transform: none;
		letter-spacing: 0;
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		color: var(--white);
	}
	/* A locked toggle keeps its words at full ink: the setting is still true
	 * and still worth reading. Only the box says it cannot move. */
	.ts-row.ts-toggle:has(input:disabled) {
		cursor: default;
	}
	.ts-lock,
	.ts-hint {
		margin: -0.4rem 0 0.9rem;
		font-size: 0.9rem;
		color: var(--dim);
	}
	.ts-lock {
		color: var(--white);
		border-left: 2px solid var(--amber);
		padding-left: 0.6rem;
	}
	.ts-summary {
		margin: 0 0 0.9rem;
		display: grid;
		gap: 0.1rem;
	}
	.ts-summary > div {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.2rem 1rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.12));
	}
	.ts-summary dt {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.ts-summary dd {
		margin: 0;
		color: var(--white);
	}
	.ts-error {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
	.ts-saved {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
	.btn-row {
		align-items: center;
	}
	.ts-dirty {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
	}
	/* Nothing to save: it still takes the press and says so (the handler and
	 * the mark read one predicate), so it is aria-disabled, never disabled. */
	.ts-submit[aria-disabled='true'] {
		color: var(--dim);
		border-color: var(--dim);
		cursor: not-allowed;
	}
	.ts-submit[aria-disabled='true']:hover {
		background: transparent;
		color: var(--dim);
		box-shadow: none;
	}
</style>
