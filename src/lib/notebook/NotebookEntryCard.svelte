<script lang="ts">
	import NotebookPhotos from '$lib/notebook/NotebookPhotos.svelte';
	import PhotoStager from '$lib/notebook/PhotoStager.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import EntryNotes from '$lib/notebook/EntryNotes.svelte';
	import EntryThumb from '$lib/notebook/EntryThumb.svelte';
	import { docSummary, noteThreads, tiptapHasText, type TiptapNode } from '$lib/notebook-notes';
	import { entryTimeline, hasTimeline, type NotebookEvent } from '$lib/notebook-history';
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
		removedPhotos,
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
	 * ONE ENTRY, in one of two VARIANTS.
	 *
	 * `full` (the default) is everything below: the collapsed tab, the
	 * expand-in-place body, the photos, the note thread, the add-photos and
	 * add-note panels, and the folder / pin / copy tools. It is what a phone
	 * shows -- unchanged, entry for entry -- and what the two-pane shell's
	 * DETAIL pane shows for the entry you picked.
	 *
	 * `row` is the compact list item the NAVIGATION pane shows above the
	 * breakpoint. Two lines, never more: a title with its state chips inline and
	 * truncating, then one meta line whose counts are small inline indicators
	 * with screen-reader text beside them -- the classroom's row contract,
	 * because at 26rem a third line per entry is ten rows a screen instead of
	 * eighteen. It renders NO expand affordance, NO note thread and NO editor of
	 * any kind: clicking it selects into the detail pane, which carries all of
	 * that plus every control this variant leaves out. Nothing is lost, because
	 * the thing those controls act on is one click away and open.
	 *
	 * The two variants are one component rather than two because `full` is the
	 * complete rendering and `row` is a strict subset of its top line -- and
	 * because the next bundle folds EntryReview into `full`, which is a wrapper
	 * only while there is one card to wrap.
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
		variant = 'full',
		current = false,
		onOpen,
		collapsed,
		onToggle,
		selectMode = false,
		selected = false,
		onSelectChange,
		uploadReady = true,
		notesReady = true,
		foldersReady = true,
		pinsReady = true,
		historyReady = true,
		viewerId,
		onAddPhotos,
		onAddNote,
		onEditNote,
		onMove,
		onPin,
		onDelete,
		onRemovePhoto,
		onRetitle,
		onRestorePhoto,
		onSubmit,
		onUnsubmit,
		onDeleteNote,
		onRestoreNote
	}: {
		entry: NotebookEntry;
		folders: NotebookFolder[];
		/** See the header: `full` is the whole card, `row` is the list item. */
		variant?: 'row' | 'full';
		/** `row` only: this is the entry open in the detail pane beside the list. */
		current?: boolean;
		/** `row` only: clicking the row asks for it to be opened. */
		onOpen?: () => void;
		/** `full` only. Ignored by `row`, which has nothing to expand. */
		collapsed?: boolean;
		/** `full` only, for the same reason. */
		onToggle?: () => void;
		selectMode?: boolean;
		selected?: boolean;
		onSelectChange?: (next: boolean) => void;
		uploadReady?: boolean;
		notesReady?: boolean;
		/** 0088 applied; false hides filing without touching anything else. */
		foldersReady?: boolean;
		/** 0091 applied; false hides pinning without touching anything else. */
		pinsReady?: boolean;
		/**
		 * 0119 applied: a note can be deleted, and this card can show a HISTORY
		 * disclosure. False hides both -- no removed-notes disclosure inside
		 * EntryNotes, no entry-history disclosure below -- exactly the card this
		 * was before 0119, on a project with no column to mark either in.
		 */
		historyReady?: boolean;
		/**
		 * The signed-in caller's own id (0119). Threaded straight to EntryNotes,
		 * which is the only thing that reads it: telling a self-deleted note
		 * thread from a staff-deleted one, so the removed-notes disclosure offers
		 * Restore on exactly the ones that would not refuse it.
		 */
		viewerId?: string;
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
		/**
		 * `full` variant only (0116, notebook_delete_entry). Omitted on a
		 * read-only surface or once the entry has been reviewed -- the RPC
		 * refuses the latter itself; this only removes the control where it can
		 * never succeed at all.
		 */
		onDelete?: (entryId: string) => Promise<EntryActionResult>;
		/**
		 * A single photo (0116, notebook_remove_photo). Handed straight to
		 * NotebookPhotos, whose own presence-gates-the-control rule this mirrors.
		 */
		onRemovePhoto?: (photoId: string) => Promise<EntryActionResult>;
		/**
		 * A free-form entry's own title (0116, notebook_set_entry_label). Never
		 * offered on a check-in entry -- its title IS the check-in's label, and
		 * the RPC refuses a session-linked entry outright.
		 */
		onRetitle?: (entryId: string, label: string | null) => Promise<EntryActionResult>;
		/**
		 * One removed photo, back (0117, notebook_restore_photo). OWNER ONLY --
		 * this is never handed in on a staff-review or view-as surface, so the
		 * disclosure it drives simply does not render there. Omitted removes the
		 * disclosure's Restore control entirely, not just the count.
		 */
		onRestorePhoto?: (photoId: string) => Promise<EntryActionResult>;
		/**
		 * `full` variant only, owner only (0118, notebook_submit_entry). Turns a
		 * DRAFT in. Omitted on a read-only surface or for a viewer who does not
		 * own the entry -- there is no other kind of surface this ever mounts on,
		 * since a draft is invisible to everyone else in the first place.
		 */
		onSubmit?: (entryId: string) => Promise<EntryActionResult>;
		/**
		 * `full` variant only, owner only (0118, notebook_unsubmit_entry). Moves a
		 * TURNED-IN entry back to a draft. The RPC itself refuses this once an
		 * instructor has reviewed the entry; this control does not try to predict
		 * that client-side (the `onDelete` precedent above) -- it stays offered
		 * and the RPC's own refusal is what the student sees.
		 */
		onUnsubmit?: (entryId: string) => Promise<EntryActionResult>;
		/**
		 * The owner removing one note thread (0119, notebook_delete_note). Handed
		 * straight to EntryNotes, which mirrors it on exactly the notes `canEdit`
		 * already governs.
		 */
		onDeleteNote?: (noteId: string) => Promise<EntryActionResult>;
		/**
		 * The owner putting a self-deleted note back (0119, notebook_restore_note).
		 * Drives EntryNotes' own removed-notes disclosure; a staff-deleted thread
		 * there shows the RPC's refusal instead, regardless of this transport.
		 */
		onRestoreNote?: (noteId: string) => Promise<EntryActionResult>;
	} = $props();

	/**
	 * What this card may DO, derived from which transports it was handed. Each
	 * gates both a control and its handler, so the two can never disagree.
	 */
	const canAddPhotos = $derived(!!onAddPhotos);
	const canAddNote = $derived(!!onAddNote);
	const canMove = $derived(foldersReady && !!onMove);
	const canDelete = $derived(variant === 'full' && !!onDelete);

	/** submitted_at is null on a project without 0118 too, but only ever for a
	    row created before it -- see NotebookEntry.submitted_at. */
	const isDraft = $derived(entry.submitted_at === null);
	const canTurnIn = $derived(variant === 'full' && isDraft && !!onSubmit);
	const canMoveToDrafts = $derived(variant === 'full' && !isDraft && !!onUnsubmit);

	const photos = $derived(orderedPhotos(entry));
	const pages = $derived(photoPages(photos));
	/** Owner-only (0117): the entry's own removed photos, for the disclosure below. */
	const removed = $derived(removedPhotos(entry.photos));
	const notes = $derived(entry.notes ?? []);
	/**
	 * The LIVE notes, as threads. Through `noteThreads` rather than off the raw
	 * rows (0119), which does two jobs at once: it drops a deleted note's whole
	 * chain, and it collapses revisions to logical notes -- an edit is not a
	 * second note, and a removed note is not a note. The hand-rolled
	 * `new Set(notes.map(n => n.note_id)).size` this replaces got the second
	 * right and could not have got the first, since a deleted chain is exactly
	 * as distinct as a live one.
	 */
	const threads = $derived(noteThreads(notes));
	const noteCount = $derived(threads.length);
	/**
	 * Whether ANYTHING belongs under the notes heading (0119): a live note, or
	 * a removed one whose disclosure still needs somewhere to render. Without
	 * this, deleting an entry's only note would drop the whole `.entry-notes`
	 * block -- disclosure included -- the moment `noteCount` reached zero.
	 */
	const hasNoteContent = $derived(
		noteCount > 0 || (historyReady && notes.some((n) => !!n.deleted_at))
	);
	const timeline = $derived(historyReady ? entryTimeline(entry) : []);
	const showHistory = $derived(historyReady && hasTimeline(entry));
	const freeForm = $derived(entry.session_id === null);
	/** Never on a check-in: its title IS the check-in's label (0116). */
	const canRetitle = $derived(freeForm && !!onRetitle);
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

	// ---- delete + rename -----------------------------------------------------

	/** Two-step confirm (the FolderManager convention): armed, then confirmed. */
	let deleteArmed = $state(false);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);

	async function deleteEntry() {
		if (!onDelete || deleting) return;
		if (!deleteArmed) {
			deleteArmed = true;
			deleteError = null;
			return;
		}
		deleting = true;
		deleteError = null;
		const result = await onDelete(entry.id);
		deleting = false;
		if (!result.ok) {
			deleteError = result.error;
			deleteArmed = false;
			return;
		}
		// The feed reloads and this card's entry stops existing; nothing else
		// to do here.
		deleteArmed = false;
	}

	let renaming = $state(false);
	let titleDraft = $state('');
	let retitling = $state(false);
	let retitleError = $state<string | null>(null);

	function startRename() {
		renaming = true;
		titleDraft = entry.custom_label ?? '';
		retitleError = null;
	}

	function cancelRename() {
		renaming = false;
		retitleError = null;
	}

	async function saveTitle() {
		if (!onRetitle || retitling) return;
		retitling = true;
		retitleError = null;
		const result = await onRetitle(entry.id, titleDraft.trim() || null);
		retitling = false;
		if (!result.ok) {
			retitleError = result.error;
			return;
		}
		renaming = false;
	}

	// ---- removed photos, restore (0117) --------------------------------------

	let restoringPhotoId = $state<string | null>(null);
	let restorePhotoErr = $state<string | null>(null);

	async function restorePhotoOne(photoId: string) {
		if (!onRestorePhoto || restoringPhotoId) return;
		restoringPhotoId = photoId;
		restorePhotoErr = null;
		const result = await onRestorePhoto(photoId);
		restoringPhotoId = null;
		if (!result.ok) restorePhotoErr = result.error;
	}

	// ---- draft state (0118): turning in, and moving back ---------------------

	let submitting = $state(false);
	let submitErr = $state<string | null>(null);

	/** No confirm: turning in is reversible (moveToDrafts undoes it), and a
	    confirm on a reversible action just trains people to dismiss the ones
	    that matter. */
	async function turnIn() {
		if (!onSubmit || submitting) return;
		submitting = true;
		submitErr = null;
		const result = await onSubmit(entry.id);
		submitting = false;
		if (!result.ok) submitErr = result.error;
	}

	let unsubmitting = $state(false);
	let unsubmitErr = $state<string | null>(null);

	async function moveToDrafts() {
		if (!onUnsubmit || unsubmitting) return;
		unsubmitting = true;
		unsubmitErr = null;
		const result = await onUnsubmit(entry.id);
		unsubmitting = false;
		if (!result.ok) unsubmitErr = result.error;
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

	/**
	 * One line per event kind (0119). `entryTimeline` itself states no kind
	 * beyond what a stamp already on the row can prove, so this only labels
	 * what it hands back -- it invents nothing (a title change or a re-file has
	 * no stamp and is silent here, exactly as $lib/notebook-history documents).
	 */
	function eventLabel(event: NotebookEvent): string {
		switch (event.kind) {
			case 'entry_created':
				return 'Entry created';
			case 'photo_added':
				return `Added ${event.photo?.original_filename ?? 'a photo'}`;
			case 'note_written':
				return event.note
					? `Wrote a note: "${docSummary(event.note.content, 50)}"`
					: 'Wrote a note';
			case 'note_edited':
				return event.note
					? `Edited a note: "${docSummary(event.note.content, 50)}"`
					: 'Edited a note';
			case 'entry_submitted':
				return 'Turned in';
			case 'entry_reviewed':
				return 'Reviewed by your instructor';
			case 'photo_removed':
				return `Removed ${event.photo?.original_filename ?? 'a photo'}`;
			case 'note_deleted':
				return 'Removed a note';
			case 'entry_deleted':
				return 'Entry deleted';
		}
	}
</script>

{#if variant === 'row'}
	<!--
		THE COMPACT ROW. Two lines, and the rule that holds it is the same one
		ClassView's row uses: the line is `nowrap` and the NAME is the only
		shrinkable child, so chips and indicators keep the width they need and the
		title gives way, ellipsised, rather than the line becoming two.

		No disclosure, no body, no note thread, no editor. The bulk-select
		checkbox stays, because selecting a run of entries to re-file is done from
		the list; every other control lives on the open entry.
	-->
	<div
		class="entry entry-row"
		class:flagged={entry.status === 'flagged'}
		class:pinned
		class:current
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
				class="disclosure row-open"
				aria-current={current ? 'true' : undefined}
				data-testid="entry-open"
				data-selected={current ? 'true' : undefined}
				onclick={() => onOpen?.()}
			>
				<EntryThumb {entry} size={40} />

				<span class="row-main">
					<span class="row-title">
						<span class="row-name" class:untitled={isUntitled(entry)}>{title}</span>
						{#if isDraft}
							<span class="chip draft-chip" data-testid="row-draft">Draft</span>
						{/if}
						{#if pinned}
							<span class="chip pin-chip" data-testid="row-pinned">Pinned</span>
						{/if}
						{#if showsStatus(entry.status)}
							<span
								class="chip status"
								class:warn={entry.status === 'flagged'}
								class:pending={entry.status === 'pending_review'}
							>
								{statusLabel(entry.status)}
							</span>
						{/if}
					</span>
					<span class="row-meta">
						<span class="stamp">{shortWhen(entry.upload_timestamp)}</span>
						{#if pages.length}
							<span class="ind" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
									<rect x="3" y="5.5" width="18" height="14" rx="2" />
									<circle cx="8.5" cy="10.5" r="1.6" />
									<path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" stroke-linejoin="round" />
								</svg>{pages.length}
							</span>
						{/if}
						{#if noteCount}
							<span class="ind" aria-hidden="true" data-testid="note-count">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
									<path d="M5 4.5h11l3 3V19.5H5z" stroke-linejoin="round" />
									<path d="M8 10h8M8 13.5h8M8 17h5" stroke-linecap="round" />
								</svg>{noteCount}
							</span>
						{/if}
						{#if foldersReady && folder}
							<span
								class="ind folder-ind"
								style="--dot: var(--nb-folder-{folder.color ?? 'none'})"
								data-testid="entry-folder"
							>
								<span class="folder-dot" aria-hidden="true"></span>{folder.name}
							</span>
						{/if}
						<!-- The counts read as text to assistive tech, where a glyph and a
						     bare number would not. -->
						<span class="sr-only">
							{#if pages.length}{photoCountLabel(pages.length)}.{/if}
							{#if noteCount}{noteCount === 1 ? '1 note' : `${noteCount} notes`}.{/if}
						</span>
					</span>
				</span>
			</button>
		</div>
	</div>
{:else}
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
					{#if isDraft}
						<span class="draft-chip" data-testid="entry-draft-chip">Draft</span>
					{/if}
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
					<!-- Read-only surfaces ONLY. Where filing is offered, the
					     control in .tools below is the single indicator, and showing
					     the name twice in one row would read as two different
					     things. -->
					{#if foldersReady && !canMove && folder}
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
		     group sits in .row, which renders in BOTH states, so filing, pinning
		     and copying are one click away collapsed or expanded.

		     EVERY CONTROL HERE CARRIES ITS OWN VISIBLE WORD. Pin and copy used
		     to be bare glyphs with a `title`, which means the only way to learn
		     what they do is to hover one -- unavailable on the phones most of
		     these students are on, and invisible to anyone who never thinks to
		     try. The icon is the shorthand you learn second, not the label. -->
		<div class="tools">
			{#if copyNote}
				<span class="tool-note" class:ok={copied} role="status">{copyNote}</span>
			{/if}

			<!-- FILING LIVES IN THE ROW, so it is offered on a collapsed entry as
			     well as an expanded one. It used to sit at the foot of the
			     expanded card under the photos and the notes, which means a
			     student had to open an entry and scroll past everything in it to
			     discover that filing an existing entry was possible at all. The
			     folder's own colour rides the select's left edge, so the cue the
			     chip used to carry survives a control a native select cannot
			     draw a dot inside. -->
			{#if canMove}
				<label
					class="folder-pick"
					data-testid="entry-move"
					style="--dot: var(--nb-folder-{folder?.color ?? 'none'})"
				>
					<span class="folder-pick-label">Folder</span>
					<select
						aria-label="Folder for {title}"
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

			{#if canTurnIn}
				<button
					type="button"
					class="tool draft-action"
					disabled={submitting}
					title="Turn this entry in to your instructor"
					aria-label="Turn in {title}"
					data-testid="entry-turn-in"
					onclick={turnIn}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
						<path d="M4 12.5l5 5L20 6" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<span class="tool-label">{submitting ? 'Turning in...' : 'Turn in'}</span>
				</button>
			{/if}
			{#if canMoveToDrafts}
				<button
					type="button"
					class="tool"
					disabled={unsubmitting}
					title="Move this entry back to your drafts"
					aria-label="Move {title} back to drafts"
					data-testid="entry-move-to-drafts"
					onclick={moveToDrafts}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
						<path d="M12 19V5M6 10l6-6 6 6" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<span class="tool-label">{unsubmitting ? 'Moving...' : 'Move to drafts'}</span>
				</button>
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
					<span class="tool-label">{pinned ? 'Pinned' : 'Pin'}</span>
				</button>
			{/if}
			<button
				type="button"
				class="tool"
				class:on={copied}
				title="Copy this entry’s title, date and notes as plain text"
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
				<span class="tool-label">{copied ? 'Copied' : 'Copy'}</span>
			</button>

			{#if canRetitle}
				<button
					type="button"
					class="tool"
					class:on={renaming}
					aria-pressed={renaming}
					disabled={retitling}
					title="Rename this entry"
					aria-label="Rename {title}"
					data-testid="entry-rename"
					onclick={() => (renaming ? cancelRename() : startRename())}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
						<path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" stroke-linejoin="round" stroke-linecap="round" />
					</svg>
					<span class="tool-label">Rename</span>
				</button>
			{/if}

			{#if canDelete}
				<button
					type="button"
					class="tool danger"
					disabled={deleting}
					title="Delete this entry"
					aria-label="Delete {title}"
					data-testid="entry-delete"
					onclick={deleteEntry}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
						<path
							d="M5 6.5h14M9.5 6.5V4.7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.8M7 6.5l.8 12.3a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 6.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<span class="tool-label">
						{deleting ? 'Deleting...' : deleteArmed ? 'Confirm delete' : 'Delete'}
					</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- Outside .row, so a move started from a COLLAPSED entry can still report
	     what went wrong: the old error line lived in the expanded body, which is
	     exactly where the control no longer is. -->
	{#if moveError}
		<p class="row-error" role="alert">{moveError}</p>
	{/if}
	{#if submitErr}
		<p class="row-error" role="alert" data-testid="entry-turn-in-error">{submitErr}</p>
	{/if}
	{#if unsubmitErr}
		<p class="row-error" role="alert" data-testid="entry-move-to-drafts-error">{unsubmitErr}</p>
	{/if}

	{#if canRetitle && renaming}
		<div class="rename-row" data-testid="entry-rename-form">
			<label class="sr-only" for="rename-{entry.id}">Title for this entry</label>
			<input
				id="rename-{entry.id}"
				type="text"
				bind:value={titleDraft}
				maxlength="200"
				placeholder="e.g. Gearbox sketches"
				disabled={retitling}
			/>
			<button type="button" class="btn" disabled={retitling} onclick={saveTitle}>
				{retitling ? 'Saving...' : 'Save'}
			</button>
			<button type="button" class="link" disabled={retitling} onclick={cancelRename}>Cancel</button>
		</div>
		{#if retitleError}
			<p class="row-error" role="alert">{retitleError}</p>
		{/if}
	{/if}

	{#if canDelete && deleteArmed}
		<p class="row-error" data-testid="entry-delete-confirm">
			Delete "{title}"? This can't be undone here.
			<button type="button" class="link" onclick={() => (deleteArmed = false)}>Cancel</button>
		</p>
	{/if}
	{#if canDelete && deleteError}
		<p class="row-error" role="alert">{deleteError}</p>
	{/if}

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

			<NotebookPhotos {photos} label={title} onRemove={onRemovePhoto} />

			{#if onRestorePhoto && removed.length}
				<details class="removed-photos" data-testid="removed-photos">
					<summary>
						{removed.length === 1 ? '1 removed photo' : `${removed.length} removed photos`}
					</summary>
					<ul>
						{#each removed as photo (photo.id)}
							<li>
								<span class="removed-name">
									{photo.original_filename ?? `Photo ${photo.sequence_order}`}
								</span>
								<span class="removed-when">Removed {when(photo.removed_at ?? '')}</span>
								<button
									type="button"
									class="btn secondary restore-photo-btn"
									disabled={restoringPhotoId === photo.id}
									data-testid="restore-photo"
									onclick={() => restorePhotoOne(photo.id)}
								>
									{restoringPhotoId === photo.id ? 'Restoring...' : 'Restore'}
								</button>
							</li>
						{/each}
					</ul>
					{#if restorePhotoErr}
						<p class="row-error" role="alert">{restorePhotoErr}</p>
					{/if}
				</details>
			{/if}

			{#if hasNoteContent}
				<div class="entry-notes">
					<!-- canEdit is NO LONGER gated on freeForm (0116 relaxed
					     notebook_edit_note: a revision never overwrites what an
					     instructor already reviewed, so a check-in's note is
					     editable too). What is left is whether the migration is
					     applied, and whether there is a save transport at all --
					     with none, there is no edit control and EntryNotes has
					     nothing to call either. -->
					<EntryNotes
						{notes}
						canEdit={notesReady && !!onEditNote}
						onSave={onEditNote}
						onDelete={historyReady ? onDeleteNote : undefined}
						onRestore={historyReady ? onRestoreNote : undefined}
						{viewerId}
					/>
				</div>
			{/if}

			{#if showHistory}
				<!-- Closed by default, the same rule the removed-photos and
				     removed-notes disclosures follow: what happened to this entry
				     is not the first thing a returning student or an admin
				     previewing it needs to see. -->
				<details class="entry-history" data-testid="entry-history">
					<summary>History</summary>
					<ol class="history-list">
						{#each timeline as event, i (i)}
							<li>
								<span class="stamp">{when(event.at)}</span>
								<span class="event-label">{eventLabel(event)}</span>
							</li>
						{/each}
					</ol>
				</details>
			{/if}

			{#if canAddPhotos || (notesReady && canAddNote)}
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
				</div>

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
{/if}

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
	/* UNMISTAKABLE ON PURPOSE: a draft must never read as turned-in work, so it
	   gets the warning thread rather than a neutral chip a reader could skim
	   past. Same shape as .status so it reads as one family of markers. */
	.draft-chip {
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		border: 1px solid currentColor;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-size: 0.62rem;
		font-weight: 700;
		color: var(--nb-warn);
	}

	/* --- folder + pin + copy ------------------------------------------------
	   A quiet group at the end of the row. They sit outside the disclosure so
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		/* 44px TALL, the same thumb-sized target the select checkbox is padded
		   to; the width now follows the word, since this is a control a student
		   taps on a phone and must be able to read without hovering it. */
		min-width: 2.75rem;
		height: 2.75rem;
		padding: 0 0.55rem;
		border: none;
		border-radius: var(--nb-radius-control);
		background: none;
		color: var(--nb-ink-faint);
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.tool-label {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		white-space: nowrap;
	}

	/* The filing control. Styled as a pill so it reads as one thing with the
	   two buttons beside it, and carrying the folder's own colour on its left
	   edge -- the one cue the chip it replaced had that a native select cannot
	   draw inside itself. */
	.folder-pick {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 2.75rem;
		padding: 0 0.2rem 0 0.45rem;
		color: var(--nb-ink-faint);
		cursor: pointer;
	}
	.folder-pick-label {
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;
	}
	.folder-pick select {
		font: inherit;
		font-size: 0.74rem;
		max-width: 8.5rem;
		padding: 0.3rem 0.35rem;
		border: 1px solid var(--nb-hairline-strong);
		border-left: 3px solid var(--dot, var(--nb-folder-none));
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface);
		color: var(--nb-ink-soft);
		cursor: pointer;
	}
	.folder-pick select:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.folder-pick:hover .folder-pick-label,
	.folder-pick:focus-within .folder-pick-label {
		color: var(--nb-ink);
	}
	.folder-pick select:focus-visible {
		outline: none;
		border-color: var(--nb-accent);
	}
	.row-error {
		margin: 0 0 0.5rem;
		padding: 0.4rem 0.6rem;
		font-size: 0.8rem;
		color: var(--nb-error);
		border: 1px solid color-mix(in srgb, var(--nb-error) 40%, transparent);
		border-radius: var(--nb-radius-control);
	}
	.rename-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin: 0 0 0.6rem;
		padding: 0.1rem 0.35rem;
	}
	.rename-row input {
		flex: 1 1 12rem;
		min-width: 8rem;
		min-height: 2.75rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface);
		color: var(--nb-ink);
		font: inherit;
		font-size: 0.95rem;
	}
	.rename-row input:focus-visible {
		outline: none;
		border-color: var(--nb-accent);
	}
	.link {
		min-height: 2.75rem;
		min-width: 2.75rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		padding: 0 0.5rem;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--nb-accent-ink);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.link:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.tool:hover:not(:disabled) {
		color: var(--nb-ink);
		background: var(--nb-surface-dim);
	}
	.tool.on {
		color: var(--nb-accent-ink);
	}
	.tool.danger {
		color: var(--nb-error);
	}
	.tool.danger:hover:not(:disabled) {
		color: var(--nb-error);
		background: color-mix(in srgb, var(--nb-error) 8%, transparent);
	}
	/* Turning a draft in is the primary thing to do with it, so it carries the
	   same warning thread as the draft chip rather than sitting neutral among
	   the quieter tools beside it. */
	.tool.draft-action {
		color: var(--nb-warn);
	}
	.tool.draft-action:hover:not(:disabled) {
		color: var(--nb-warn);
		background: color-mix(in srgb, var(--nb-warn) 8%, transparent);
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

	/* Closed by default (0119), the same rule as .removed-photos below. */
	.entry-history {
		margin-top: 1.2rem;
	}
	.entry-history summary {
		cursor: pointer;
		font-size: 0.84rem;
		font-weight: 600;
		color: var(--nb-ink-soft);
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.entry-history summary:hover {
		color: var(--nb-accent-ink);
	}
	.history-list {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
		border-left: 1px dashed var(--nb-hairline-strong);
	}
	.history-list li {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0 0 0 0.8rem;
		font-size: 0.82rem;
	}
	.history-list .stamp {
		flex: none;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.history-list .event-label {
		color: var(--nb-ink-soft);
	}

	/* Closed by default: a page a student removed is not the first thing they
	   came back to see, but it has to be reachable and restorable. */
	.removed-photos {
		margin-top: 1rem;
	}
	.removed-photos summary {
		cursor: pointer;
		font-size: 0.84rem;
		font-weight: 600;
		color: var(--nb-ink-soft);
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.removed-photos ul {
		list-style: none;
		margin: 0.3rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.removed-photos li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
	}
	.removed-name {
		font-size: 0.84rem;
		color: var(--nb-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 12rem;
	}
	.removed-when {
		font-size: 0.72rem;
		color: var(--nb-ink-faint);
		margin-right: auto;
	}
	.restore-photo-btn {
		min-height: 2.75rem;
		flex: 0 0 auto;
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

	/* --- the `row` variant --------------------------------------------------
	   TWO LINES, HELD BY THE SAME RULE THE CLASSROOM'S ROW USES: `nowrap` on
	   the title line with the NAME as the only shrinkable child, so a chip
	   never wraps the line and a long title ellipsises instead. */
	.entry-row {
		border-radius: var(--nb-radius-control);
	}
	.entry-row .disclosure {
		gap: 0.6rem;
		padding: 0.45rem 0.4rem;
		align-items: center;
	}
	.entry-row .row-title {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: nowrap;
		min-width: 0;
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1.3;
		/* The wrapper is a flex line now, so the ellipsis lives on .row-name. */
		white-space: normal;
		overflow: visible;
	}
	.entry-row .row-name {
		flex: 1 1 auto;
		min-width: 2.5rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.entry-row .row-name.untitled {
		color: var(--nb-ink-faint);
		font-style: italic;
		font-weight: 500;
	}
	.entry-row .row-meta {
		flex-wrap: nowrap;
		gap: 0.5rem;
		overflow: hidden;
		white-space: nowrap;
	}
	.entry-row .stamp {
		flex: none;
	}
	/* Counts as INDICATORS, not pills: a glyph and a number in the meta colour,
	   no border and no padding, so two of them cost about 34px between them. */
	.entry-row .ind {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		flex: none;
	}
	.entry-row .ind svg {
		width: 0.78rem;
		height: 0.78rem;
		display: block;
	}
	.entry-row .folder-ind {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 0 1 auto;
	}
	.entry-row .folder-dot {
		width: 0.45em;
		height: 0.45em;
		border-radius: 50%;
		background: var(--dot, var(--nb-folder-none));
		flex: 0 0 auto;
	}
	.entry-row .chip {
		flex: none;
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.08rem 0.42rem;
		border: 1px solid currentColor;
		border-radius: 999px;
		white-space: nowrap;
	}
	.entry-row .pin-chip,
	.entry-row .status.warn {
		color: var(--nb-accent-ink);
	}
	.entry-row .status.pending {
		color: var(--nb-ink-soft);
	}
	/*
	 * THE ROW YOU ARE READING, indicated the way the classroom indicates it: a
	 * lifted surface plus a rule down its leading edge, never colour alone, with
	 * aria-current on the control itself. Gold is the notebook's own thread for
	 * an active state, where the classroom spends green.
	 */
	.entry-row.current {
		background: var(--nb-surface-dim);
		box-shadow: inset 3px 0 0 var(--nb-accent);
	}
	.entry-row.current .row-name {
		color: var(--nb-accent-ink);
	}
	/* The pinned edge would fight the selected one; the chip carries it here. */
	.entry-row.pinned {
		border-left: none;
		padding-left: 0;
	}

	/*
	 * Below this width three labelled controls and a readable title cannot
	 * share one line, so the group takes its own. A DELIBERATE TRADE: a
	 * collapsed row on a phone is taller than it was, and in exchange filing,
	 * pinning and copying are legible rather than three grey glyphs. Shrinking
	 * the words back out is what created the problem this pass exists to fix.
	 */
	@media (max-width: 42rem) {
		.row {
			flex-wrap: wrap;
		}
		.tools {
			flex: 1 0 100%;
			/* WRAP, not nowrap: this row can hold a folder pick plus up to five
			   labelled buttons, and none of that fits one line at 375px. Without
			   this the row pushed the whole card wider than the viewport instead
			   of taking a second line -- a pre-existing bug found and left alone
			   during the PhotoViewer bundle, fixed here alongside 0119's own new
			   tool. */
			flex-wrap: wrap;
			justify-content: flex-end;
			padding: 0 0.1rem 0.3rem 0;
			gap: 0.1rem;
		}
		.folder-pick select {
			max-width: 7rem;
		}
	}
</style>
