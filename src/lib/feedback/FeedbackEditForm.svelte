<script lang="ts">
	import { untrack } from 'svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState, type SaveOutcome } from '$lib/save-state.svelte';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import {
		FEEDBACK_KINDS,
		FEEDBACK_MAX_LEN,
		FEEDBACK_TRIED_MAX,
		feedbackEditRefusalWords,
		type FeedbackEdit,
		type FeedbackEditTransport,
		type FeedbackRow
	} from './feedback';
	import { rowEdit, rowKind, rowMessage, rowTried } from './console';

	/**
	 * AN ADMIN'S CORRECTION OF ONE FILED REPORT (report d362bfb3): its kind, its
	 * message and what the reporter tried. Mounted by the feedback console for
	 * the ONE row being edited, so its save machine and its single navigation
	 * guard live and die with the form, and the console never carries two.
	 *
	 * A DELIBERATE SAVE, NEVER AN AUTOSAVE. Every save mints a numbered revision
	 * other admins read, so `autosave: false` (CLAUDE.md: a write that mints a
	 * record somebody else reads), and nothing is sent when the tab hides: half
	 * a correction is not a correction.
	 *
	 * THE REPORTER'S ROW IS NEVER TOUCHED. The database keeps their words and
	 * adds the correction beside them as a revision; this form only ever sends
	 * the words it wants and the revision it opened on, so a correction another
	 * admin saved meanwhile is refused rather than written over.
	 *
	 * PRESENTATION + ONE TRANSPORT. It fetches nothing; the console hands it the
	 * transport, and the console only has one when the load proved the database
	 * can take an edit.
	 */
	let {
		row,
		editFeedback,
		onsaved,
		oncancel,
		ondirty = null,
		now = () => Date.now()
	}: {
		row: FeedbackRow;
		editFeedback: FeedbackEditTransport;
		/** The correction that landed (or null when the save changed nothing). */
		onsaved: (edit: FeedbackEdit | null) => void;
		oncancel: () => void;
		/** Told from the input handlers (never an effect) whether there is unsaved work. */
		ondirty?: ((dirty: boolean) => void) | null;
		now?: () => number;
	} = $props();

	// WHAT THE FORM OPENS ON: what the report says now (the latest correction,
	// else the reporter's own words), read once. Untracked on purpose: a reload
	// of the list behind an open form must not replace what an admin is typing.
	const start = untrack(() => ({
		kind: rowKind(row),
		message: rowMessage(row),
		tried: rowTried(row) ?? '',
		revision: rowEdit(row)?.revision ?? 0,
		id: row.id
	}));

	let kind = $state(start.kind);
	let message = $state(start.message);
	let tried = $state(start.tried);
	let revision = start.revision;
	let refusal = $state<string | null>(null);

	/** The comparison, in the shape the database compares in: trimmed, kind lower-cased. */
	function signature() {
		return { kind: kind.trim().toLowerCase(), message: message.trim(), tried: tried.trim() };
	}

	const baseline = new EditBaseline();
	baseline.seed(untrack(() => signature()));
	const changed = $derived(baseline.changed({ kind: kind.trim().toLowerCase(), message: message.trim(), tried: tried.trim() }));
	const messageEmpty = $derived(message.trim() === '');
	const canSave = $derived(changed && !messageEmpty);

	async function persist(): Promise<SaveOutcome> {
		const sent = signature();
		let res;
		try {
			res = await editFeedback(start.id, {
				kind: sent.kind,
				message: sent.message,
				tried: sent.tried ? sent.tried : null,
				baseRevision: revision
			});
		} catch (e) {
			return { ok: false, retryable: true, message: (e as Error).message || 'That edit did not send.' };
		}
		if (!res.ok) {
			if (res.reason) {
				// A CONSIDERED REFUSAL, answered once and shown verbatim beside the
				// form: retrying "somebody else saved first" five times changes nothing.
				refusal = feedbackEditRefusalWords(res.reason);
				return { ok: false, retryable: false, message: refusal };
			}
			return {
				ok: false,
				retryable: res.retryable ?? false,
				message: res.message || 'That edit was not saved.'
			};
		}
		revision = res.revision;
		baseline.advance(sent);
		ondirty?.(false);
		onsaved(
			res.changed
				? {
						revision: res.revision,
						kind: sent.kind,
						message: sent.message,
						tried: sent.tried ? sent.tried : null,
						edited_by: null,
						edited_at: new Date(now()).toISOString()
					}
				: null
		);
		return { ok: true };
	}

	const save = new SaveState({
		save: persist,
		autosave: false,
		fallbackMessage: 'That edit was not saved.'
	});

	// ONE GUARD, THIS FORM'S: a navigation away flushes a pending save first and
	// asks only when the save cannot land.
	guardSaveNavigation(save, {
		warning: 'Your edit to this report has not been saved.'
	});

	// AN OPEN EDIT WITH WORK IN IT HOLDS OFF A DEPLOY RELOAD (CLAUDE.md, deploy
	// safety), and lets go the moment it is saved or put back.
	$effect(() => {
		if (!save.dirty) return;
		return holdDeployReload('a feedback edit is open');
	});

	$effect(() => () => save.destroy());

	/**
	 * DIRTY ON A REAL CHANGE, NEVER ON AN EVENT: typing a word and deleting it
	 * again is not an edit, and the machine goes back to clean.
	 */
	function touched() {
		refusal = null;
		const differs = baseline.changed(signature());
		if (differs) save.markDirty();
		else if (save.phase === 'dirty' || save.phase === 'failed') save.reset();
		ondirty?.(differs);
	}

	let why = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (save.phase === 'writing') return;
		if (!canSave) {
			// aria-disabled, never disabled, so the control can say why.
			why = messageEmpty
				? 'The message cannot be empty.'
				: 'Nothing has changed yet, so there is nothing to save.';
			return;
		}
		why = null;
		await save.saveNow();
	}

	function cancel() {
		save.reset();
		ondirty?.(false);
		oncancel();
	}

	/** Focus the message the moment the form exists, keyed on the element. */
	function focusOnMount(node: HTMLTextAreaElement) {
		node.focus({ preventScroll: true });
	}
</script>

<form class="fbe" data-testid="fbc-edit-form" onsubmit={submit} novalidate>
	<p class="fbe-lead">
		Correct what this report says. The reporter's own words are kept, and stay one press away under
		As sent.
	</p>
	<div class="fbe-row">
		<div class="fbe-field fbe-kind">
			<label class="fbe-label" for="fbe-kind-{start.id}">Kind</label>
			<select
				id="fbe-kind-{start.id}"
				class="fbe-control fbe-input"
				bind:value={kind}
				onchange={touched}
				data-testid="fbe-kind"
			>
				{#each FEEDBACK_KINDS as k (k.id)}
					<option value={k.id}>{k.label}</option>
				{/each}
			</select>
		</div>
	</div>
	<div class="fbe-field">
		<label class="fbe-label" for="fbe-message-{start.id}">Message</label>
		<textarea
			id="fbe-message-{start.id}"
			class="fbe-control fbe-input fbe-text"
			rows="5"
			maxlength={FEEDBACK_MAX_LEN}
			bind:value={message}
			oninput={touched}
			use:focusOnMount
			data-testid="fbe-message"
		></textarea>
	</div>
	<div class="fbe-field">
		<label class="fbe-label" for="fbe-tried-{start.id}">What they tried (optional)</label>
		<textarea
			id="fbe-tried-{start.id}"
			class="fbe-control fbe-input fbe-text"
			rows="2"
			maxlength={FEEDBACK_TRIED_MAX}
			bind:value={tried}
			oninput={touched}
			data-testid="fbe-tried"
		></textarea>
	</div>
	{#if refusal}
		<p class="fbe-refusal" role="alert" data-testid="fbe-refusal">{refusal}</p>
	{/if}
	<div class="fbe-actions">
		<button
			type="submit"
			class="fbe-control btn"
			aria-disabled={!canSave || save.phase === 'writing'}
			aria-describedby={why ? `fbe-why-${start.id}` : undefined}
			data-testid="fbe-save"
		>
			{save.phase === 'writing' ? 'Saving...' : 'Save edit'}
		</button>
		<button type="button" class="fbe-control btn secondary" onclick={cancel} data-testid="fbe-cancel">
			{changed ? 'Discard edit' : 'Cancel'}
		</button>
		<SaveIndicator state={save} />
	</div>
	{#if why}
		<p class="fbe-why" id="fbe-why-{start.id}" aria-live="polite">{why}</p>
	{/if}
</form>

<style>
	.fbe {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		margin: 0 0 var(--space-2, 0.5rem);
		padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
		background: var(--surface-2);
		min-width: 0;
	}
	.fbe-lead {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.fbe-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.fbe-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.fbe-kind {
		flex: 0 1 14rem;
	}
	.fbe-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	/* The tap-target floor, stated once for every control in the form. */
	.fbe-control {
		min-height: 44px;
		min-width: 44px;
	}
	.fbe-input {
		width: 100%;
		box-sizing: border-box;
		padding: 0 0.6rem;
		background: var(--surface-1, var(--bg1));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
	}
	.fbe-text {
		padding: 0.5rem 0.6rem;
		line-height: 1.5;
		resize: vertical;
	}
	.fbe-input:focus-visible {
		outline: 1px solid var(--green);
		outline-offset: 1px;
	}
	.fbe-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
	}
	/* A refusal an admin has to read: the register's warning ink, and the
	   sentence carries the meaning, never the colour alone. */
	.fbe-refusal {
		margin: 0;
		font-size: 0.85rem;
		color: var(--amber);
	}
	.fbe-why {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
</style>
