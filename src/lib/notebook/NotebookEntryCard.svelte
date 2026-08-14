<script lang="ts">
	import NotebookPhotos from '$lib/notebook/NotebookPhotos.svelte';
	import PhotoStager from '$lib/notebook/PhotoStager.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import EntryNotes from '$lib/notebook/EntryNotes.svelte';
	import EntryThumb from '$lib/notebook/EntryThumb.svelte';
	import { tiptapHasText, type TiptapNode } from '$lib/notebook-notes';
	import { onDestroy } from 'svelte';
	import {
		entryPlainText,
		entryTitle,
		flagReasonLabel,
		isPinned,
		isUntitled,
		orderedPhotos,
		photoCountLabel,
		photoPages,
		sessionMeta,
		showsStatus,
		statusLabel,
		type EntryActionResult,
		type NoteSaveResult,
		type NotebookEntry,
		type StagedPhoto
	} from '$lib/notebook';
	import {
		entryPreview,
		folderById,
		foldersInOrder,
		type FolderResult,
		type NotebookFolder
	} from '$lib/notebook-folders';

	/**
	 * ONE ENTRY, either as a collapsed tab or as the full card.
	 *
	 * Extracted out of NotebookView (which owned every entry inline and was
	 * already 1100 lines before folders, search and selection landed on it), so
	 * that file goes back to being about orchestration -- what to show, in what
	 * order -- while this one is about a single entry.
	 *
	 * COLLAPSED IS A REAL VIEW, NOT A HIDDEN ONE. The tab carries a thumbnail,
	 * the title, the note's opening words, the date, the counts, its folder and
	 * its status, which between them answer "is this the one I am looking for"
	 * without expanding anything. That is the whole point: the old feed put
	 * every page at full column width, so twenty entries was a scroll and forty
	 * was unusable.
	 *
	 * THE PANEL STATE IS THIS CARD'S OWN. NotebookView used to hold one
	 * "which panel is open" for the whole feed; per-card is both simpler and
	 * better -- with entries collapsed, a panel can only exist inside an
	 * expanded card anyway, and two open at once is harmless.
	 *
	 * SEQUENCING IS STILL NOT THIS CARD'S BUSINESS. Which upload creates what,
	 * and how a corrected photo lands adjacent to its own original, is one
	 * rule and it stays in NotebookView; this calls the injected `onAddPhotos`
	 * with the staged set and reports what comes back.
	 *
	 * READ-ONLY IS THE ABSENCE OF A TRANSPORT, not a flag. Every write handler
	 * is optional; an omitted one removes its control from the markup AND
	 * leaves the handler with nothing to call, so a surface that hands in no
	 * transports (view-as-student) cannot write even if a control leaked
	 * through. That is the ContractsView `readOnly` idea taken one step
	 * further -- there is no boolean to get wrong.
	 */

	let {
		entry,
		folders,
		collapsed,
		onToggle,
		selectMode = false,
		selected = false,
		onSelectChange,
		uploadReady = true,
		notesReady = true,
		foldersReady = true,
		pinsReady = true,
		onAddPhotos,
		onAddNote,
		onEditNote,
		onMove,
		onPin
	}: {
		entry: NotebookEntry;
		folders: NotebookFolder[];
		collapsed: boolean;
		onToggle: () => void;
		selectMode?: boolean;
		selected?: boolean;
		onSelectChange?: (next: boolean) => void;
		uploadReady?: boolean;
		notesReady?: boolean;
		/** 0088 applied; false hides filing without touching anything else. */
		foldersReady?: boolean;
		/** 0091 applied; false hides pinning without touching anything else. */
		pinsReady?: boolean;
		/** Omitted on a read-only surface: no control, and nothing to call. */
		onAddPhotos?: (
			entryId: string,
			staged: StagedPhoto[],
			onProgress: (message: string) => void
		) => Promise<{ ok: boolean; error?: string; notice?: string }>;
		onAddNote?: (entryId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		onEditNote?: (noteId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		onMove?: (entryId: string, folderId: string | null) => Promise<FolderResult>;
		onPin?: (entryId: string, pinned: boolean) => Promise<EntryActionResult>;
	} = $props();

	/**
	 * What this card may DO, derived from which transports it was handed. Each
	 * gates both a control and its handler, so the two can never disagree.
	 */
	const canAddPhotos = $derived(!!onAddPhotos);
	const canAddNote = $derived(!!onAddNote);
	const canMove = $derived(foldersReady && !!onMove);

	const photos = $derived(orderedPhotos(entry));
	const pages = $derived(photoPages(photos));
	const notes = $derived(entry.notes ?? []);
	/** Distinct logical notes, not revisions: an edit is not a second note. */
	const noteCount = $derived(new Set(notes.map((n) => n.note_id)).size);
	const freeForm = $derived(entry.session_id === null);
	const title = $derived(entryTitle(entry));
	const preview = $derived(entryPreview(entry));
	const folder = $derived(folderById(folders, entry.folder_id));
	const orderedFolders = $derived(foldersInOrder(folders));

	// ---- adding to this entry ----------------------------------------------

	let panel = $state<'photos' | 'note' | null>(null);
	let staged = $state<StagedPhoto[]>([]);
	let settling = $state(false);
	let stager = $state<ReturnType<typeof PhotoStager> | null>(null);
	let noteDraft = $state<TiptapNode | null>(null);
	let busy = $state(false);
	let progress = $state('');
	let error = $state<string | null>(null);
	let noteKey = $state(0);
	let moveError = $state<string | null>(null);
	let moving = $state(false);

	// ---- pin + copy ---------------------------------------------------------

	/**
	 * Gated on pinsReady for the same reason the folder chip is: with 0091
	 * unapplied `pinned_at` cannot arrive at all, so there is nothing to show.
	 * NOT gated on `onPin` -- a read-only preview must report a student's own
	 * pins accurately while offering no control, so "is it pinned" and "can I
	 * unpin it" are deliberately two questions.
	 */
	const pinned = $derived(pinsReady && isPinned(entry));

	let pinning = $state(false);
	/**
	 * `copied` and `copyNote` are the VISIBLE confirmation: the clipboard
	 * write succeeds silently by design, so an action with no feedback reads
	 * as a dead button. Both clear on a timer.
	 */
	let copied = $state(false);
	let copyNote = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	function flashCopy(ok: boolean, note: string | null) {
		copied = ok;
		copyNote = note;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => {
			copied = false;
			copyNote = null;
			copyTimer = null;
		}, 2400);
	}

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
	});

	async function togglePin() {
		if (!onPin || pinning) return;
		pinning = true;
		try {
			const result = await onPin(entry.id, !pinned);
			// The feed reloads on success, so `pinned` follows the row rather
			// than being guessed here.
			if (!result.ok) flashCopy(false, result.error);
		} finally {
			pinning = false;
		}
	}

	async function copyEntry() {
		const text = entryPlainText(entry);
		try {
			// The async Clipboard API only: the old execCommand path needs a
			// live selection and a hidden textarea, and every browser this
			// runs on has had writeText for years.
			await navigator.clipboard.writeText(text);
			flashCopy(true, 'Copied');
		} catch {
			// A denied permission or an insecure origin, neither of which the
			// student can do anything about from here -- so say what happened
			// rather than failing silently.
			flashCopy(false, 'Could not copy');
		}
	}

	function togglePanel(kind: 'photos' | 'note') {
		if (busy) return;
		panel = panel === kind ? null : kind;
		staged = [];
		noteDraft = null;
		error = null;
		noteKey += 1;
	}

	async function savePhotos() {
		if (busy || !staged.length || !onAddPhotos) return;
		busy = true;
		error = null;
		try {
			const result = await onAddPhotos(entry.id, staged, (m) => (progress = m));
			if (!result.ok) {
				error = result.error ?? 'The upload failed.';
				return;
			}
			stager?.reset();
			panel = null;
			staged = [];
		} catch (err) {
			error = (err as Error).message || 'The upload failed to send.';
		} finally {
			busy = false;
			progress = '';
		}
	}

	async function saveNote() {
		if (busy || !tiptapHasText(noteDraft) || !onAddNote) return;
		busy = true;
		error = null;
		try {
			const result = await onAddNote(entry.id, noteDraft as TiptapNode);
			if (!result.ok) {
				error = result.error;
				return;
			}
			panel = null;
			noteDraft = null;
		} catch (err) {
			error = (err as Error).message || 'The note failed to save.';
		} finally {
			busy = false;
		}
	}

	async function move(value: string) {
		if (moving || !onMove) return;
		moving = true;
		moveError = null;
		try {
			const result = await onMove(entry.id, value === '' ? null : value);
			if (!result.ok) moveError = result.error;
		} finally {
			moving = false;
		}
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}

	/** Short form for the collapsed row, where the full stamp is too much. */
	function shortWhen(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}
</script>

<div
	class="entry"
	class:flagged={entry.status === 'flagged'}
	class:open={!collapsed}
	class:pinned
>
	<div class="row">
		{#if selectMode}
			<label class="pick">
				<input
					type="checkbox"
					checked={selected}
					data-testid="entry-select"
					onchange={(e) => onSelectChange?.(e.currentTarget.checked)}
				/>
				<span class="sr-only">Select {title}</span>
			</label>
		{/if}

		<button
			type="button"
			class="disclosure"
			aria-expanded={!collapsed}
			data-testid="entry-disclosure"
			onclick={onToggle}
		>
			<EntryThumb {entry} size={collapsed ? 56 : 44} />

			<span class="row-main">
				<span class="row-title" class:untitled={isUntitled(entry)}>{title}</span>
				{#if collapsed && preview}
					<span class="row-preview">{preview}</span>
				{/if}
				<span class="row-meta">
					<span class="stamp">{collapsed ? shortWhen(entry.upload_timestamp) : when(entry.upload_timestamp)}</span>
					{#if pages.length}
						<span class="dot" aria-hidden="true">·</span>
						<span>{photoCountLabel(pages.length)}</span>
					{/if}
					{#if noteCount}
						<span class="dot" aria-hidden="true">·</span>
						<span data-testid="note-count">{noteCount === 1 ? '1 note' : `${noteCount} notes`}</span>
					{/if}
					<!-- Gated on foldersReady as well as on having one: with 0088
					     unapplied the load cannot return folder_id at all, so this
					     would never fire in practice -- but a component that
					     renders filing while filing is turned off is one stale
					     prop away from lying, and the guard costs nothing. -->
					{#if foldersReady && folder}
						<span
							class="folder-chip"
							style="--dot: var(--nb-folder-{folder.color ?? 'none'})"
							data-testid="entry-folder"
						>
							{folder.name}
						</span>
					{/if}
					{#if showsStatus(entry.status)}
						<span
							class="status"
							class:warn={entry.status === 'flagged'}
							class:pending={entry.status === 'pending_review'}
						>
							{statusLabel(entry.status)}
						</span>
					{/if}
				</span>
			</span>

			<span class="chev" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M6 9l6 6 6-6" />
				</svg>
			</span>
		</button>

		<!-- SIBLINGS of the disclosure, never inside it: a button nested in a
		     button is invalid markup and its clicks would toggle the row. The
		     group sits in .row, which renders in BOTH states, so pinning and
		     copying are one click away collapsed or expanded. -->
		<div class="tools">
			{#if copyNote}
				<span class="tool-note" class:ok={copied} role="status">{copyNote}</span>
			{/if}
			{#if pinsReady && onPin}
				<button
					type="button"
					class="tool"
					class:on={pinned}
					aria-pressed={pinned}
					disabled={pinning}
					title={pinned ? 'Unpin this entry' : 'Pin this entry to the top'}
					aria-label={pinned ? `Unpin ${title}` : `Pin ${title} to the top`}
					data-testid="entry-pin"
					onclick={togglePin}
				>
					<svg
						viewBox="0 0 24 24"
						fill={pinned ? 'currentColor' : 'none'}
						stroke="currentColor"
						stroke-width="1.7"
						aria-hidden="true"
					>
						<path
							d="M9 3.6h6l-.7 5.1 3 2.6v1.5H6.7v-1.5l3-2.6z"
							stroke-linejoin="round"
						/>
						<path d="M12 12.8V20.4" stroke-linecap="round" fill="none" />
					</svg>
				</button>
			{/if}
			<button
				type="button"
				class="tool"
				class:on={copied}
				title="Copy this entry’s text"
				aria-label="Copy {title} as text"
				data-testid="entry-copy"
				onclick={copyEntry}
			>
				{#if copied}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<path d="M5 12.6l4.4 4.4L19 7.4" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
						<rect x="9" y="9" width="11" height="11.5" rx="2" />
						<path d="M15.4 5.6a2 2 0 0 0-2-1.6H6a2 2 0 0 0-2 2v7.4a2 2 0 0 0 1.6 2" />
					</svg>
				{/if}
			</button>
		</div>
	</div>

	{#if !collapsed}
		<div class="body">
			{#if entry.session}
				<p class="entry-session">{sessionMeta(entry.session)}</p>
			{/if}

			{#if entry.status === 'flagged' && (entry.flag_reason || entry.instructor_comment)}
				<div class="callout">
					{#if entry.flag_reason}
						<strong>{flagReasonLabel(entry.flag_reason)}.</strong>
					{/if}
					{#if entry.instructor_comment}
						<span>{entry.instructor_comment}</span>
					{/if}
					<span class="callout-hint">Add another photo below to send it back for review.</span>
				</div>
			{/if}

			<NotebookPhotos {photos} label={title} />

			{#if notes.length}
				<div class="entry-notes">
					<!-- canEdit is TWO conditions: a check-in's notes are never
					     editable (0078 refuses it), and with the migration
					     unapplied nothing can be saved at all. -->
					<!-- The third condition is the read-only one: with no save
					     transport there is no edit control, and EntryNotes has
					     nothing to call either. -->
					<EntryNotes
						{notes}
						canEdit={freeForm && notesReady && !!onEditNote}
						onSave={onEditNote}
					/>
				</div>
			{/if}

			{#if canAddPhotos || (notesReady && canAddNote) || canMove}
			<div class="entry-add">
				<div class="entry-add-actions">
					{#if canAddPhotos}
						<button
							type="button"
							class="add-btn"
							data-testid="add-photos"
							aria-pressed={panel === 'photos'}
							disabled={busy || !uploadReady}
							onclick={() => togglePanel('photos')}
						>
							{panel === 'photos' ? 'Cancel' : 'Add photos'}
						</button>
					{/if}
					{#if notesReady && canAddNote}
						<button
							type="button"
							class="add-btn"
							data-testid="add-note"
							aria-pressed={panel === 'note'}
							disabled={busy}
							onclick={() => togglePanel('note')}
						>
							{panel === 'note' ? 'Cancel' : 'Add a note'}
						</button>
					{/if}

					{#if canMove}
						<label class="move" data-testid="entry-move">
							<span class="move-label">Folder</span>
							<select
								value={entry.folder_id ?? ''}
								disabled={moving || busy}
								onchange={(e) => move(e.currentTarget.value)}
							>
								<option value="">Unfiled</option>
								{#each orderedFolders as f (f.id)}
									<option value={f.id}>{f.name}</option>
								{/each}
							</select>
						</label>
					{/if}

					{#if !freeForm && notes.length}
						<span class="add-hint" data-testid="no-edit-hint">
							Notes on a check-in cannot be edited. Add another instead.
						</span>
					{/if}
				</div>

				{#if moveError}
					<p class="feedback error" role="alert">{moveError}</p>
				{/if}

				{#if panel === 'photos'}
					<div class="entry-panel" data-testid="panel-photos">
						{#if error}
							<p class="feedback error" role="alert">{error}</p>
						{/if}
						<PhotoStager
							bind:this={stager}
							bind:staged
							bind:settling
							disabled={busy}
							{uploadReady}
							captureContext={{ entryId: entry.id }}
							testPrefix="nbe"
						/>
						<div class="actions">
							<button
								type="button"
								class="btn"
								disabled={busy || !staged.length || settling}
								onclick={savePhotos}
							>
								{busy ? 'Saving...' : 'Add to this entry'}
							</button>
							{#if progress}<span class="progress">{progress}</span>{/if}
						</div>
					</div>
				{:else if panel === 'note'}
					<div class="entry-panel" data-testid="panel-note">
						{#if error}
							<p class="feedback error" role="alert">{error}</p>
						{/if}
						{#key noteKey}
							<NoteEditor
								onchange={(doc) => (noteDraft = doc)}
								disabled={busy}
								autofocus
								label="New note"
								placeholder="What did you work through?"
							/>
						{/key}
						<div class="actions">
							<button
								type="button"
								class="btn"
								disabled={busy || !tiptapHasText(noteDraft)}
								onclick={saveNote}
							>
								{busy ? 'Saving...' : 'Add this note'}
							</button>
						</div>
					</div>
				{/if}
			</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.entry {
		border: 1px solid transparent;
		border-radius: var(--nb-radius);
		/* Belt-and-braces with `.entries > li { min-width: 0 }` in the feed:
		   whatever this card is placed inside, it must be allowed to narrow
		   past the nowrap row below rather than push its container wider. */
		min-width: 0;
	}
	/* An expanded entry is a raised card; a collapsed one is a row in a list,
	   so a long feed reads as a list rather than as a stack of boxes. */
	.entry.open {
		border-color: var(--nb-hairline);
		background: var(--nb-surface);
		box-shadow: var(--nb-shadow);
		padding: 0.2rem 0.9rem 1rem;
	}
	.row {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		min-width: 0;
	}
	/* The box itself stays small, but the LABEL is the hit target and is padded
	   out to a thumb-sized one -- this is the control a student taps repeatedly
	   while sorting a backlog on a phone. */
	.pick {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.75rem;
		padding: 0 0.2rem;
		cursor: pointer;
	}
	.pick input {
		width: 1.15rem;
		height: 1.15rem;
		accent-color: var(--nb-accent-ink);
		cursor: pointer;
	}

	.disclosure {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-align: left;
		padding: 0.6rem 0.35rem;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		cursor: pointer;
		border-radius: var(--nb-radius-control);
	}
	.disclosure:hover {
		background: var(--nb-surface-dim);
	}
	.entry.open .disclosure:hover {
		background: transparent;
	}

	.row-main {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.14rem;
	}
	.row-title {
		font-weight: 700;
		font-size: 1.02rem;
		line-height: 1.25;
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.entry.open .row-title {
		font-size: 1.2rem;
		white-space: normal;
	}
	.row-title.untitled {
		color: var(--nb-ink-faint);
		font-style: italic;
		font-weight: 500;
	}
	.row-preview {
		font-size: 0.82rem;
		color: var(--nb-ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.dot {
		color: var(--nb-hairline-strong);
	}
	.folder-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.05rem 0.45rem 0.05rem 0.4rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		color: var(--nb-ink-soft);
		max-width: 11rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.folder-chip::before {
		content: '';
		width: 0.45em;
		height: 0.45em;
		border-radius: 50%;
		background: var(--dot, var(--nb-folder-none));
		flex: 0 0 auto;
	}
	.status {
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		border: 1px solid currentColor;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-size: 0.62rem;
		font-weight: 600;
	}
	/* The flag status carries the gold thread; awaiting-review stays a quiet gray. */
	.status.warn {
		color: var(--nb-accent-ink);
	}
	.status.pending {
		color: var(--nb-ink-soft);
	}

	/* --- pin + copy --------------------------------------------------------
	   A quiet pair at the end of the row. They sit outside the disclosure so
	   they work in both states, and they stay muted until they mean something:
	   the pin only takes the gold thread once the entry is actually pinned. */
	.tools {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.15rem;
		padding-right: 0.1rem;
	}
	.tool {
		display: grid;
		place-items: center;
		/* 44px, the same thumb-sized target the select checkbox is padded to:
		   this is a control a student taps on a phone. */
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: none;
		border-radius: var(--nb-radius-control);
		background: none;
		color: var(--nb-ink-faint);
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.tool:hover:not(:disabled) {
		color: var(--nb-ink);
		background: var(--nb-surface-dim);
	}
	.tool.on {
		color: var(--nb-accent-ink);
	}
	.tool:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.tool svg {
		width: 1.15rem;
		height: 1.15rem;
	}
	.tool-note {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--nb-error);
		white-space: nowrap;
	}
	.tool-note.ok {
		color: var(--nb-accent-ink);
	}

	/* The collapsed tab's own pin indicator: the filled glyph says it, and
	   this edge says it from across a scrolling feed without adding a chip to
	   an already-dense meta row. */
	.entry.pinned {
		border-left: 3px solid var(--nb-accent);
		border-radius: var(--nb-radius);
		padding-left: 0.35rem;
	}
	.entry.pinned.open {
		padding-left: 0.85rem;
	}

	.chev {
		flex: 0 0 auto;
		color: var(--nb-ink-faint);
		display: grid;
		place-items: center;
		width: 1.4rem;
	}
	.chev svg {
		width: 1.1rem;
		height: 1.1rem;
		transition: transform 0.15s ease;
	}
	.entry.open .chev svg {
		transform: rotate(180deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.chev svg {
			transition: none;
		}
	}

	.body {
		padding: 0.3rem 0.35rem 0;
	}
	.entry-session {
		margin: 0 0 0.7rem;
		font-size: 0.78rem;
		color: var(--nb-ink-faint);
	}
	.callout {
		border-left: 2px solid var(--nb-accent);
		padding: 0.55rem 0.8rem;
		margin: 0 0 0.8rem;
		background: var(--nb-accent-wash);
		border-radius: 0 var(--nb-radius-control) var(--nb-radius-control) 0;
		font-size: 0.88rem;
		display: grid;
		gap: 0.2rem;
	}
	.callout strong {
		color: var(--nb-accent-ink);
	}
	.callout-hint {
		color: var(--nb-ink-soft);
		font-size: 0.8rem;
	}
	.entry-notes {
		margin-top: 1.2rem;
	}

	.entry-add {
		margin-top: 1.1rem;
	}
	.entry-add-actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.add-btn {
		padding: 0.3rem 0.8rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		background: var(--nb-surface);
		color: var(--nb-ink-soft);
		font: inherit;
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
	}
	.add-btn:hover:not(:disabled) {
		border-color: var(--nb-accent);
		color: var(--nb-accent-ink);
	}
	.add-btn[aria-pressed='true'] {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
		color: var(--nb-accent-ink);
	}
	.add-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.move {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.76rem;
		color: var(--nb-ink-faint);
	}
	.move select {
		font: inherit;
		font-size: 0.76rem;
		padding: 0.24rem 0.4rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		background: var(--nb-surface);
		color: var(--nb-ink-soft);
		max-width: 11rem;
	}
	.add-hint {
		font-size: 0.74rem;
		color: var(--nb-ink-faint);
	}
	.entry-panel {
		margin-top: 0.9rem;
		padding: 0.9rem;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 1.1rem;
		flex-wrap: wrap;
	}
	.progress {
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.feedback {
		font-size: 0.84rem;
		padding: 0.55rem 0.8rem;
		border-radius: var(--nb-radius-control);
		margin: 0.7rem 0 0;
	}
	.feedback.error {
		color: var(--nb-error);
		border: 1px solid color-mix(in srgb, var(--nb-error) 40%, transparent);
		background: color-mix(in srgb, var(--nb-error) 5%, transparent);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
