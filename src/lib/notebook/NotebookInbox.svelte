<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import {
		entryTitle,
		type CreateEntryResult,
		type EntryActionResult,
		type NotebookEntry,
		type NotebookSession,
		type NotePayload
	} from '$lib/notebook';
	import { docSummary, noteThreads } from '$lib/notebook-notes';
	import { filedWhen } from '$lib/notebook/capture';
	import {
		draftTouchedAt,
		fileDraft,
		inboxDrafts,
		inboxFileBlock,
		inboxFileBlockReason,
		inboxTargetLabel,
		inboxTargets,
		removeInboxCopy,
		type InboxTarget
	} from '$lib/notebook/quick-note';
	import { quickNoteWritingEntry } from '$lib/notebook/quick-note-state.svelte';

	/**
	 * THE INBOX (ledger 0298, R33): every draft of the viewer's that answers no
	 * check-in yet, newest first -- which is where each quick note lands -- with
	 * a one-press way to put each one where it counts.
	 *
	 * PRESENTATION ONLY, like every notebook surface. The rows come from the
	 * notebook's own `entries` (already the caller's own, by RLS), the targets
	 * from `inboxTargets`, and the one write is `fileDraft` over the two
	 * transports the notebook already holds. Absent transports remove the File
	 * controls: a read-only mount lists and offers nothing.
	 *
	 * DRAFTS STAY PRIVATE (0118). Filing moves a draft to a class or a check-in
	 * and it is STILL a draft there; turning it in remains the student's own
	 * separate press in the notebook, never a side effect of filing.
	 */
	let {
		entries,
		sessions,
		classes = [],
		scopeSectionId = null,
		scopeLabel = null,
		today,
		createNote = undefined,
		deleteEntry = undefined,
		onOpen = undefined,
		onChanged = undefined,
		quickNoteShown = null,
		onQuickNoteShown = undefined
	}: {
		entries: NotebookEntry[];
		sessions: NotebookSession[];
		classes?: { id: string; label: string }[];
		scopeSectionId?: string | null;
		scopeLabel?: string | null;
		today: string;
		createNote?: (payload: NotePayload) => Promise<CreateEntryResult>;
		deleteEntry?: (entryId: string) => Promise<EntryActionResult>;
		/** Open an entry in the notebook, by id. */
		onOpen?: (entryId: string) => void;
		onChanged?: () => void;
		/** Whether the header's Note button is shown; null when this mount cannot say. */
		quickNoteShown?: boolean | null;
		onQuickNoteShown?: (shown: boolean) => void;
	} = $props();

	const drafts = $derived(inboxDrafts(entries));
	const canFile = $derived(!!createNote && !!deleteEntry);

	/** The classes a draft with no class may go to: the scope's one, or every class. */
	const offerClasses = $derived(
		scopeSectionId ? [{ id: scopeSectionId, label: scopeLabel ?? 'this class' }] : classes
	);

	function classLabel(sectionId: string | null): string | null {
		if (!sectionId) return null;
		if (sectionId === scopeSectionId && scopeLabel) return scopeLabel;
		return classes.find((c) => c.id === sectionId)?.label ?? 'a class';
	}

	function excerpt(entry: NotebookEntry): string {
		const thread = noteThreads(entry.notes ?? [])[0];
		return thread ? docSummary(thread.current.content, 140) : '';
	}

	function targetsFor(entry: NotebookEntry): InboxTarget[] {
		return inboxTargets(entry, { sessions, entries, classes: offerClasses, today });
	}

	/** Per row: filing in flight, or a failure the row has to show. */
	type RowState =
		| { kind: 'busy' }
		| { kind: 'error'; message: string }
		| { kind: 'orphan'; filedEntryId: string; filedTo: string; message: string };
	const rows = new SvelteMap<string, RowState>();

	/** THE ACKNOWLEDGEMENT OUTLIVES THE ROW: a filed draft leaves this list, so the note sits above it. */
	let lastFiled = $state<{ title: string; to: string; entryId: string } | null>(null);

	/** More destinations than this and a picker replaces the row of buttons. */
	const BUTTON_LIMIT = 3;
	const picks = new SvelteMap<string, number>();

	function targetName(t: InboxTarget): string {
		return t.kind === 'class' ? t.label : t.classLabel ? `${t.label} (${t.classLabel})` : t.label;
	}

	async function file(entry: NotebookEntry, target: InboxTarget) {
		if (!createNote || !deleteEntry || rows.get(entry.id)?.kind === 'busy') return;
		rows.set(entry.id, { kind: 'busy' });
		const title = entryTitle(entry);
		const outcome = await fileDraft({ createNote, deleteEntry }, entry, target);
		if (outcome.ok) {
			rows.delete(entry.id);
			lastFiled = { title, to: targetName(target), entryId: outcome.entryId };
			onChanged?.();
			return;
		}
		if (outcome.stage === 'create') {
			rows.set(entry.id, { kind: 'error', message: outcome.error });
			return;
		}
		// Filed, and the old copy is still here. Never offered as "file again".
		rows.set(entry.id, {
			kind: 'orphan',
			filedEntryId: outcome.entryId,
			filedTo: targetName(target),
			message: outcome.error
		});
		onChanged?.();
	}

	async function removeCopy(entry: NotebookEntry, state: Extract<RowState, { kind: 'orphan' }>) {
		if (!deleteEntry) return;
		rows.set(entry.id, { kind: 'busy' });
		const outcome = await removeInboxCopy({ deleteEntry }, entry.id, state.filedEntryId);
		if (outcome.ok) {
			rows.delete(entry.id);
			lastFiled = { title: entryTitle(entry), to: state.filedTo, entryId: state.filedEntryId };
			onChanged?.();
			return;
		}
		rows.set(entry.id, { ...state, message: outcome.error });
	}
</script>

<section class="ib" aria-labelledby="nb-inbox-heading" data-testid="nb-inbox">
	<div class="ib-head">
		<h3 id="nb-inbox-heading" class="ib-heading">Inbox</h3>
		<span class="ib-count" data-testid="nb-inbox-count"
			>{drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}</span
		>
	</div>

	{#if lastFiled}
		<p class="ib-ack" role="status" data-testid="nb-inbox-filed">
			Filed “{lastFiled.title}” to {lastFiled.to}. It is still a draft there.
			{#if onOpen}
				{@const id = lastFiled.entryId}
				<button type="button" class="ib-link" onclick={() => onOpen?.(id)}>Open it</button>
			{/if}
		</p>
	{/if}

	{#if drafts.length === 0}
		<p class="ib-empty" data-testid="nb-inbox-empty">
			Nothing waiting. Quick notes from the Note button land here until you file them.
		</p>
	{:else}
		<ol class="ib-list">
			{#each drafts as entry (entry.id)}
				{@const state = rows.get(entry.id)}
				{@const block = inboxFileBlock(entry)}
				{@const targets = canFile && !block ? targetsFor(entry) : []}
				{@const writing = quickNoteWritingEntry() === entry.id}
				{@const where = classLabel(entry.section_id)}
				<li class="ib-row" data-testid="nb-inbox-row" data-entry-id={entry.id}>
					<div class="ib-main">
						{#if onOpen}
							<button type="button" class="ib-title" onclick={() => onOpen?.(entry.id)}>{entryTitle(entry)}</button>
						{:else}
							<span class="ib-title">{entryTitle(entry)}</span>
						{/if}
						<span class="ib-meta">
							<span class="ib-class" class:none={!where}>{where ?? 'No class yet'}</span>
							<span aria-hidden="true">·</span>
							<span>{filedWhen(draftTouchedAt(entry))}</span>
						</span>
						{#if excerpt(entry)}<p class="ib-excerpt">{excerpt(entry)}</p>{/if}
					</div>

					<div class="ib-actions">
						{#if writing}
							<span class="ib-chip" data-testid="nb-inbox-writing">Still open in Quick note</span>
						{:else if state?.kind === 'busy'}
							<span class="ib-status">Filing...</span>
						{:else if state?.kind === 'orphan'}
							<p class="ib-status" role="alert">
								Filed to {state.filedTo}, but this copy is still here: {state.message}
							</p>
							<button type="button" class="ib-btn" data-testid="nb-inbox-remove-copy" onclick={() => removeCopy(entry, state)}>
								Remove this copy
							</button>
						{:else if block && canFile}
							<span class="ib-status" data-testid="nb-inbox-blocked">{inboxFileBlockReason(block)}</span>
						{:else if targets.length > BUTTON_LIMIT}
							{@const choice = Math.min(picks.get(entry.id) ?? 0, targets.length - 1)}
							<label class="ib-pick">
								<span class="ib-pick-word">File to</span>
								<select
									value={choice}
									onchange={(e) => picks.set(entry.id, Number((e.currentTarget as HTMLSelectElement).value))}
								>
									{#each targets as t, i (i)}
										<option value={i}>{targetName(t)}</option>
									{/each}
								</select>
							</label>
							<button type="button" class="ib-btn ib-file" data-testid="nb-inbox-file" onclick={() => file(entry, targets[choice])}>
								File
							</button>
						{:else}
							{#each targets as t (t.kind === 'class' ? `c:${t.sectionId}` : `s:${t.sessionId}:${t.sectionId}`)}
								<button type="button" class="ib-btn ib-file" data-testid="nb-inbox-file" onclick={() => file(entry, t)}>
									{inboxTargetLabel(t)}
								</button>
							{/each}
						{/if}
						{#if state?.kind === 'error'}
							<p class="ib-error" role="alert" data-testid="nb-inbox-error">{state.message}</p>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}

	{#if quickNoteShown !== null && onQuickNoteShown}
		<label class="ib-toggle" data-testid="nb-inbox-quicknote-toggle">
			<input
				type="checkbox"
				checked={quickNoteShown}
				onchange={(e) => onQuickNoteShown?.((e.currentTarget as HTMLInputElement).checked)}
			/>
			<span>Show the Note button in the page header</span>
		</label>
	{/if}
</section>

<style>
	.ib {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	.ib-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.ib-heading {
		margin: 0;
		font-size: 1.05rem;
	}
	.ib-count {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.ib-ack,
	.ib-empty {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.4;
		color: var(--text-2);
	}
	.ib-ack {
		color: var(--text-1);
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--status-ok-fill);
	}
	.ib-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.ib-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		min-width: 0;
	}
	.ib-main {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.ib-title {
		appearance: none;
		align-self: flex-start;
		max-width: 100%;
		min-height: 44px;
		padding: 0;
		background: none;
		border: none;
		color: var(--text-1);
		font: inherit;
		font-weight: 600;
		text-align: left;
		overflow-wrap: anywhere;
		cursor: pointer;
	}
	button.ib-title:hover {
		text-decoration: underline;
	}
	span.ib-title {
		min-height: 0;
	}
	.ib-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.ib-class.none {
		font-style: italic;
	}
	.ib-excerpt {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.35;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.ib-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}
	.ib-btn,
	.ib-pick select {
		appearance: none;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		max-width: 100%;
		padding: 0 0.75rem;
		box-sizing: border-box;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font: inherit;
		font-size: 0.84rem;
		text-align: left;
		cursor: pointer;
	}
	.ib-file {
		border-color: var(--green);
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.ib-btn:hover {
		border-color: var(--gold);
	}
	.ib-pick {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		max-width: 100%;
	}
	.ib-pick-word {
		font-size: 0.84rem;
		color: var(--text-2);
	}
	.ib-chip,
	.ib-status {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-2);
	}
	.ib-chip {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.ib-error {
		margin: 0;
		flex-basis: 100%;
		font-size: 0.84rem;
		color: var(--status-danger, var(--crimson));
	}
	.ib-link {
		appearance: none;
		background: none;
		border: none;
		padding: 0 0.2rem;
		min-height: 44px;
		color: var(--text-1);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 0.2em;
		cursor: pointer;
	}
	.ib-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		font-size: 0.86rem;
		color: var(--text-1);
		cursor: pointer;
	}
	.ib-toggle input {
		width: 1.1rem;
		height: 1.1rem;
		margin: 0;
	}
</style>
