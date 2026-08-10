<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import NotebookPhotos from '$lib/notebook/NotebookPhotos.svelte';
	import PhotoStager from '$lib/notebook/PhotoStager.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import EntryNotes from '$lib/notebook/EntryNotes.svelte';
	import { clearPendingCapture, fitForUpload, takePendingCapture } from '$lib/notebook/camera';
	import '$lib/notebook/notebook-theme.css';
	import { tiptapHasText, type TiptapNode } from '$lib/notebook-notes';
	import {
		entryTitle,
		flagReasonLabel,
		isUntitled,
		nearestOutstanding,
		newestFirst,
		orderedPhotos,
		outstandingSessions,
		photoCountLabel,
		photoPages,
		sessionMeta,
		showsStatus,
		statusLabel,
		todayIso,
		type AddPhotoResult,
		type CreateEntryResult,
		type NoteSaveResult,
		type NotebookEntry,
		type NotebookSession,
		type NotePayload,
		type StagedPhoto
	} from '$lib/notebook';

	/**
	 * The whole student-facing notebook screen, factored out of /notebook so a
	 * dev harness mounts the SAME component against sample data (the
	 * CoinBalanceView / CoinDeskTool convention).
	 *
	 * IT OWNS THE SAVE SEQUENCING, NOT THE TRANSPORT. Photo 1 creates a new
	 * entry and every later photo joins it; a corrected version rides
	 * immediately after its own original so the pair lands on adjacent
	 * sequence numbers, which is the adjacency photoPages() groups back into
	 * one page. The five transports are injected, so the real page points them
	 * at the API routes while the harness answers in memory -- that split is
	 * what lets the orchestration itself be exercised with no network.
	 *
	 * AN ENTRY IS SOMETHING YOU KEEP ADDING TO. Every entry in the feed can
	 * take another photo or another note without starting a new one, through
	 * the same PhotoStager and NoteEditor the top form uses; the capture flow
	 * exists once, in PhotoStager, and both places mount it.
	 *
	 * EDITING A NOTE IS OFFERED ONLY ON A FREE-FORM ENTRY -- a scheduled
	 * check-in is reviewed work, and rewriting it after the fact would change
	 * what an instructor read. That is 0078's notebook_edit_note refusing it;
	 * hiding the control here is the courtesy, not the rule.
	 */

	let {
		entries,
		sessions,
		sectionLabel = null,
		canReview = false,
		configured = true,
		notesReady = true,
		uploadReady = true,
		createEntry,
		addPhoto,
		createNote,
		addNote,
		editNote,
		onUploaded
	}: {
		entries: NotebookEntry[];
		sessions: NotebookSession[];
		/** The student's own class, when they have pinned one. */
		sectionLabel?: string | null;
		/** Instructor of at least one section, or a site admin (0067 chair tier). */
		canReview?: boolean;
		/** 0069 applied; false renders the fail-soft card instead of a broken page. */
		configured?: boolean;
		/**
		 * 0078 applied. False turns the WRITTEN NOTE half off on its own --
		 * photos keep working -- rather than blanking a notebook because one
		 * hand-applied migration has not landed yet.
		 */
		notesReady?: boolean;
		/**
		 * The Drive integration is configured server-side; false disables PHOTO
		 * submits only. A note needs no Drive, so the note path stays usable.
		 */
		uploadReady?: boolean;
		createEntry: (form: FormData) => Promise<CreateEntryResult>;
		addPhoto: (form: FormData) => Promise<AddPhotoResult>;
		createNote: (payload: NotePayload) => Promise<CreateEntryResult>;
		addNote: (entryId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		editNote: (noteId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		/** Called after a successful save so the page can refresh its data. */
		onUploaded?: () => void;
	} = $props();

	// ---- new-entry form state ----------------------------------------------

	/** `null` is the deliberate free-form path: no session, title optional. */
	let selectedSession = $state<string | null>(null);
	let sessionTouched = $state(false);
	/**
	 * Free-form only: photos (the original path, unchanged and the default) or
	 * a written note with no photo at all. Held as a plain preference and read
	 * through `noteOnly` below, so picking a session can never leave the form
	 * in a note mode that the session-linked path does not offer.
	 */
	let freeMode = $state<'photos' | 'note'>('photos');
	/** A short TITLE for the entry. Since 0078 it is never the note's text. */
	let title = $state('');
	let noteDraft = $state<TiptapNode | null>(null);
	let staged = $state<StagedPhoto[]>([]);
	let stagerSettling = $state(false);
	let stager = $state<ReturnType<typeof PhotoStager> | null>(null);
	let busy = $state(false);
	let progress = $state('');
	let errorMsg = $state<string | null>(null);
	let successMsg = $state<string | null>(null);
	/** Set when a previous load's capture never came back (see camera.ts). */
	let recoveryNote = $state<string | null>(null);

	const open = $derived(outstandingSessions(sessions, entries));
	const feed = $derived(newestFirst(entries));
	/** The note tier exists on the free-form path ONLY, and only once 0078 is applied. */
	const noteOnly = $derived(selectedSession === null && freeMode === 'note' && notesReady);
	const canSubmit = $derived(
		noteOnly
			? tiptapHasText(noteDraft)
			: staged.length > 0 && !stagerSettling && uploadReady
	);

	// Default to the outstanding session nearest today, and otherwise leave
	// the student's own pick alone as `entries` refreshes underneath -- with
	// one exception. A pick that is no longer OUTSTANDING is stale: it just
	// received this upload (the feed reloads after every save) or the roster
	// moved, and silently keeping it would file the next entry against an
	// already-covered check-in. A stale pick therefore drops back to the
	// default rather than persisting.
	$effect(() => {
		const stale = selectedSession !== null && !open.some((s) => s.id === selectedSession);
		if (sessionTouched && !stale) return;
		sessionTouched = false;
		selectedSession = nearestOutstanding(sessions, entries, todayIso())?.id ?? null;
	});

	function chooseSession(id: string | null) {
		sessionTouched = true;
		selectedSession = id;
	}

	function chooseMode(mode: 'photos' | 'note') {
		freeMode = mode;
		// Staged photos are meaningless in note mode and would be silently
		// dropped on submit; clearing them makes that visible instead.
		if (mode === 'note') {
			staged = [];
			stager?.reset();
		}
	}

	/**
	 * THE ONE READER of the pending-capture marker. PhotoStager writes it (it
	 * can be mounted several times on this page), and only one reader can
	 * consume a marker that clears itself -- so the decision about where the
	 * student lands is made here, once.
	 *
	 * A marker still present on a FRESH load means the previous load opened
	 * the camera and never got to clear it, i.e. the browser was killed for
	 * memory while the camera app was in front. Put the student back where
	 * they were and say what happened, because the alternative is a blank form
	 * and no explanation at all.
	 */
	$effect(() => {
		const pending = takePendingCapture() as
			| { session?: string | null; mode?: 'photos' | 'note'; title?: string; entryId?: string }
			| null;
		if (!pending) return;
		if (pending.entryId) {
			// They were adding to an existing entry, not starting a new one.
			panel = { entryId: pending.entryId, kind: 'photos' };
		} else {
			if (pending.session !== undefined) {
				sessionTouched = true;
				selectedSession = pending.session;
			}
			if (pending.mode) freeMode = pending.mode;
			if (typeof pending.title === 'string') title = pending.title;
		}
		recoveryNote =
			'Your photo did not make it back from the camera app, which can happen when the phone is low on memory. Everything you typed is still here. Please take the photo again.';
	});

	function resetForm() {
		staged = [];
		stager?.reset();
		title = '';
		noteDraft = null;
		noteKey += 1;
		recoveryNote = null;
	}

	/**
	 * Remounts the editor. Tiptap seeds its document once, on mount, so
	 * clearing a saved note means giving it a fresh instance rather than
	 * fighting its internal state.
	 */
	let noteKey = $state(0);

	/**
	 * Shrink an original to something the upload route will accept, and say so
	 * if it could not be. A real 12 MP phone capture is 4-7 MB against a 4 MB
	 * server cap, so without this the camera path fails at the route with a
	 * size error the student can do nothing about -- while the smaller images
	 * a gallery pick tends to produce go straight through, which is exactly
	 * the "gallery works, camera does not" shape of the bug.
	 */
	async function prepared(file: File): Promise<File> {
		try {
			return await fitForUpload(file);
		} catch {
			return file;
		}
	}

	/**
	 * One staged photo onto an existing entry: the original, then -- only if
	 * that landed -- its corrected version, so a pair can never form against
	 * the WRONG preceding original.
	 *
	 * `skipOriginal` is for the photo that CREATED the entry: its original is
	 * already stored, and only the corrected version is still owed.
	 */
	async function uploadPair(
		entryId: string,
		photo: StagedPhoto,
		num: number,
		total: number,
		skipOriginal = false
	): Promise<{ originalOk: boolean; enhancedOk: boolean }> {
		if (!skipOriginal) {
			progress = total > 1 ? `Uploading photo ${num} of ${total}...` : 'Uploading...';
			const form = new FormData();
			form.set('photo', await prepared(photo.file));
			form.set('entry_id', entryId);
			form.set('variant', 'original');
			if (!(await addPhoto(form)).ok) return { originalOk: false, enhancedOk: true };
		}
		if (!photo.enhanced) return { originalOk: true, enhancedOk: true };
		progress = `Uploading corrected photo ${num}...`;
		const form = new FormData();
		form.set('photo', await prepared(photo.enhanced));
		form.set('entry_id', entryId);
		form.set('variant', 'enhanced');
		return { originalOk: true, enhancedOk: (await addPhoto(form)).ok };
	}

	/** "photo 2" / "photos 2, 4" -- shared by both save paths. */
	function photoList(nums: number[]): string {
		return `${nums.length === 1 ? 'photo' : 'photos'} ${nums.join(', ')}`;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy || !canSubmit) return;
		busy = true;
		errorMsg = null;
		successMsg = null;
		progress = noteOnly
			? 'Saving...'
			: staged.length > 1
				? `Uploading photo 1 of ${staged.length}...`
				: 'Uploading...';

		try {
			// A note has no photo and so no sequencing at all: one call, done.
			// It never carries a session -- the mode is only reachable on the
			// free-form path, and a check-in still requires a page.
			if (noteOnly) {
				const saved = await createNote({
					content: noteDraft as TiptapNode,
					custom_label: title.trim() || null
				});
				if (!saved.ok) {
					errorMsg = saved.error;
					return;
				}
				successMsg = 'Note saved.';
				resetForm();
				onUploaded?.();
				return;
			}

			// Photo 1 creates the entry. A blank title is sent as nothing at all:
			// 0071 made it optional and the upload route falls back to the file's
			// own name, so the UI must not re-impose a required-title rule.
			const first = new FormData();
			first.set('photo', await prepared(staged[0].file));
			if (selectedSession) first.set('session_id', selectedSession);
			const trimmed = title.trim();
			if (!selectedSession && trimmed) first.set('custom_label', trimmed);

			const created = await createEntry(first);
			if (!created.ok) {
				errorMsg = created.error;
				return;
			}

			// Failures are reported honestly rather than rolled back: the entry
			// and its first photo really do exist, and the student can add the
			// rest from the entry itself.
			const failed: number[] = [];
			const failedEnhanced: number[] = [];
			for (let i = 0; i < staged.length; i++) {
				const result = await uploadPair(
					created.entryId,
					staged[i],
					i + 1,
					staged.length,
					i === 0
				);
				if (!result.originalOk) failed.push(i + 1);
				else if (!result.enhancedOk) failedEnhanced.push(i + 1);
			}

			if (failed.length) {
				errorMsg = `Saved your entry, but ${photoList(failed)} did not upload. Add ${
					failed.length === 1 ? 'it' : 'them'
				} again from this page.`;
			} else {
				successMsg =
					staged.length === 1
						? 'Entry saved.'
						: `Entry saved with ${photoCountLabel(staged.length)}.`;
				if (failedEnhanced.length) {
					successMsg += ` The corrected version of ${photoList(
						failedEnhanced
					)} did not upload; the original is saved.`;
				}
			}
			resetForm();
			onUploaded?.();
		} catch (err) {
			errorMsg = (err as Error).message || 'The upload failed to send.';
		} finally {
			busy = false;
			progress = '';
		}
	}

	// ---- adding to an existing entry ---------------------------------------

	/** At most one entry panel is open at a time, so one set of state serves. */
	let panel = $state<{ entryId: string; kind: 'photos' | 'note' } | null>(null);
	let panelStaged = $state<StagedPhoto[]>([]);
	let panelSettling = $state(false);
	let panelStager = $state<ReturnType<typeof PhotoStager> | null>(null);
	let panelNote = $state<TiptapNode | null>(null);
	let panelBusy = $state(false);
	let panelProgress = $state('');
	let panelError = $state<string | null>(null);
	let panelNoteKey = $state(0);

	function togglePanel(entryId: string, kind: 'photos' | 'note') {
		if (panelBusy) return;
		if (panel && panel.entryId === entryId && panel.kind === kind) {
			closePanel();
			return;
		}
		panel = { entryId, kind };
		panelStaged = [];
		panelNote = null;
		panelError = null;
		panelNoteKey += 1;
	}

	function closePanel() {
		panel = null;
		panelStaged = [];
		panelNote = null;
		panelError = null;
		panelProgress = '';
	}

	async function savePanelPhotos(entryId: string) {
		if (panelBusy || !panelStaged.length) return;
		panelBusy = true;
		panelError = null;
		errorMsg = null;
		successMsg = null;
		const total = panelStaged.length;
		try {
			const failed: number[] = [];
			const failedEnhanced: number[] = [];
			for (let i = 0; i < total; i++) {
				panelProgress = total > 1 ? `Uploading photo ${i + 1} of ${total}...` : 'Uploading...';
				const result = await uploadPair(entryId, panelStaged[i], i + 1, total);
				if (!result.originalOk) failed.push(i + 1);
				else if (!result.enhancedOk) failedEnhanced.push(i + 1);
			}
			if (failed.length === total) {
				panelError = `That ${total === 1 ? 'photo' : 'set of photos'} did not upload. Try again.`;
				return;
			}
			successMsg = failed.length
				? `Added ${total - failed.length} of ${total} photos; ${photoList(failed)} did not upload.`
				: `Added ${photoCountLabel(total - failed.length)} to this entry.`;
			if (failedEnhanced.length) {
				successMsg += ` The corrected version of ${photoList(
					failedEnhanced
				)} did not upload; the original is saved.`;
			}
			panelStager?.reset();
			closePanel();
			onUploaded?.();
		} catch (err) {
			panelError = (err as Error).message || 'The upload failed to send.';
		} finally {
			panelBusy = false;
			panelProgress = '';
		}
	}

	async function savePanelNote(entryId: string) {
		if (panelBusy || !tiptapHasText(panelNote)) return;
		panelBusy = true;
		panelError = null;
		errorMsg = null;
		successMsg = null;
		try {
			const result = await addNote(entryId, panelNote as TiptapNode);
			if (!result.ok) {
				panelError = result.error;
				return;
			}
			successMsg = 'Note added to this entry.';
			closePanel();
			onUploaded?.();
		} catch (err) {
			panelError = (err as Error).message || 'The note failed to save.';
		} finally {
			panelBusy = false;
		}
	}

	/** EntryNotes hands back a saved revision; the feed then reloads. */
	async function saveNoteEdit(noteId: string, doc: TiptapNode): Promise<NoteSaveResult> {
		const result = await editNote(noteId, doc);
		if (result.ok) {
			successMsg = 'Note updated. The earlier version is still on this entry.';
			onUploaded?.();
		}
		return result;
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

<svelte:head>
	<title>My Notebook // IDEA</title>
</svelte:head>

<!-- Coming back to a page that is still alive proves nothing was lost to the
     camera app, so the marker for the next load is dropped here. -->
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'visible') clearPendingCapture();
	}}
/>

<!-- .nb-root scopes the notebook's editorial light theme (notebook-theme.css)
     and keeps it out of every other surface. -->
<div class="nb-root">
<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="notebook-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Notebook</div>
		<h1>My Notebook</h1>
		<p class="lead">
			Photograph your engineering notebook pages and keep them here, and write down what you
			worked through. Everything on this page is
			<strong>yours</strong>: only you, your section instructor, and the department chair can see it.
		</p>
		<div class="hero-meta">
			{#if sectionLabel}
				<span class="chip">{sectionLabel}</span>
			{/if}
			{#if canReview}
				<a class="chip chip-link" href="/notebook/review">Section review &rsaquo;</a>
			{/if}
		</div>
	</section>

	{#if !configured}
		<section class="card">
			<h2>Notebook is not available yet</h2>
			<p class="note">
				The notebook tables are not in place on this project yet. Apply migration
				<code>0069_notebook.sql</code> (plus <code>0071</code>, <code>0075</code> and
				<code>0078_notebook_entry_notes.sql</code>) in the Supabase SQL editor, then reload.
			</p>
		</section>
	{:else}
		<!-- ---------------------------------------------------------------- -->
		<!-- Add an entry                                                      -->
		<!-- ---------------------------------------------------------------- -->
		<section class="card">
			<h2>Add an entry</h2>

			{#if errorMsg}
				<p class="feedback error" role="alert">{errorMsg}</p>
			{/if}
			{#if successMsg}
				<p class="feedback ok" role="status">{successMsg}</p>
			{/if}
			{#if !uploadReady}
				<p class="feedback error">
					Photo storage is not configured on the server yet, so photo uploads are turned off.
					You can still write a note.
				</p>
			{/if}
			{#if !notesReady}
				<p class="feedback error" data-testid="nb-notes-unavailable">
					Written notes are not available on this project yet. Apply migration
					<code>0078_notebook_entry_notes.sql</code> in the Supabase SQL editor. Photos work
					as normal.
				</p>
			{/if}
			{#if recoveryNote}
				<p class="feedback error" role="status" data-testid="nb-recovery">{recoveryNote}</p>
			{/if}

			<form onsubmit={submit}>
				<fieldset class="picker">
					<legend>What is this for?</legend>
					{#if open.length}
						<div class="quick-picks">
							{#each open as s (s.id)}
								<button
									type="button"
									class="pick"
									class:selected={selectedSession === s.id}
									aria-pressed={selectedSession === s.id}
									onclick={() => chooseSession(s.id)}
								>
									<span class="pick-label">{s.session_label}</span>
									<span class="pick-meta">{sessionMeta(s)}</span>
								</button>
							{/each}
							<button
								type="button"
								class="pick free"
								class:selected={selectedSession === null}
								aria-pressed={selectedSession === null}
								onclick={() => chooseSession(null)}
							>
								<span class="pick-label">Something else</span>
								<span class="pick-meta">No session needed</span>
							</button>
						</div>
					{:else}
						<p class="note no-sessions">
							{sessions.length
								? 'You are up to date on every check-in for your class. This entry will be saved on its own.'
								: 'You have no scheduled check-ins, so this entry will be saved on its own.'}
						</p>
					{/if}
				</fieldset>

				{#if selectedSession === null}
					<!-- Free-form only. A scheduled check-in exists because an
					     instructor asked for a page, so it never offers this. -->
					<fieldset class="picker mode-picker">
						<legend>How do you want to save it?</legend>
						<div class="quick-picks">
							<button
								type="button"
								class="pick"
								class:selected={!noteOnly}
								aria-pressed={!noteOnly}
								onclick={() => chooseMode('photos')}
							>
								<span class="pick-label">Photos</span>
								<span class="pick-meta">Shoot a page</span>
							</button>
							{#if notesReady}
								<button
									type="button"
									class="pick"
									class:selected={noteOnly}
									aria-pressed={noteOnly}
									onclick={() => chooseMode('note')}
								>
									<span class="pick-label">Write a note</span>
									<span class="pick-meta">No photo needed</span>
								</button>
							{/if}
						</div>
					</fieldset>

					<label class="field label-field">
						<span>Title <span class="optional">(optional)</span></span>
						<input
							type="text"
							bind:value={title}
							maxlength="200"
							placeholder="e.g. Gearbox sketches"
							disabled={busy}
						/>
						<span class="hint">
							{#if noteOnly}
								A short name for this entry. Leave it blank and we will use the note's opening
								words.
							{:else}
								Leave this blank and we will use the photo's own filename.
							{/if}
						</span>
					</label>
				{/if}

				{#if noteOnly}
					<div class="field note-field">
						<span class="photo-label">Note</span>
						{#key noteKey}
							<NoteEditor onchange={(doc) => (noteDraft = doc)} disabled={busy} />
						{/key}
						<span class="hint">
							Write as much as you like. You can add photos to this entry later, and come back
							and edit this note whenever you want.
						</span>
					</div>
				{:else}
					<PhotoStager
						bind:this={stager}
						bind:staged
						bind:settling={stagerSettling}
						disabled={busy}
						{uploadReady}
						captureContext={{ session: selectedSession, mode: freeMode, title }}
					/>
				{/if}

				<div class="actions">
					<button class="btn" type="submit" disabled={busy || !canSubmit}>
						{busy ? 'Saving...' : noteOnly ? 'Save note' : 'Save entry'}
					</button>
					{#if progress}<span class="progress">{progress}</span>{/if}
				</div>
			</form>
		</section>

		<!-- ---------------------------------------------------------------- -->
		<!-- My entries                                                        -->
		<!-- ---------------------------------------------------------------- -->
		<section class="card">
			<h2>My entries</h2>

			{#if entries.length === 0}
				<p class="note empty-state">
					No entries yet. Photograph a page or write a note above and it will show up here.
				</p>
			{:else}
				<ol class="entries">
					{#each feed as entry (entry.id)}
						{@const photos = orderedPhotos(entry)}
						{@const notes = entry.notes ?? []}
						{@const freeForm = entry.session_id === null}
						{@const openPanel = panel && panel.entryId === entry.id ? panel.kind : null}
						<li class="entry" class:flagged={entry.status === 'flagged'}>
							<header class="entry-head">
								<h3 class="entry-title" class:untitled={isUntitled(entry)}>{entryTitle(entry)}</h3>
								<div class="entry-meta">
									<span class="stamp">{when(entry.upload_timestamp)}</span>
									<span class="dot" aria-hidden="true">·</span>
									<!-- Logical pages, so an original + its corrected variant count
									     once; identical to the row count for all-original entries. -->
									<span>{photoCountLabel(photoPages(photos).length)}</span>
									{#if notes.length}
										<span class="dot" aria-hidden="true">·</span>
										<span data-testid="note-count">
											{new Set(notes.map((n) => n.note_id)).size === 1
												? '1 note'
												: `${new Set(notes.map((n) => n.note_id)).size} notes`}
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
								</div>
								{#if entry.session}
									<p class="entry-session">
										{sessionMeta(entry.session)}
									</p>
								{/if}
							</header>

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

							<NotebookPhotos {photos} label={entryTitle(entry)} />

							{#if notes.length}
								<div class="entry-notes">
									<!-- canEdit is TWO conditions: a check-in's notes are never
									     editable (0078 refuses it), and with the migration
									     unapplied nothing can be saved at all. -->
									<EntryNotes {notes} canEdit={freeForm && notesReady} onSave={saveNoteEdit} />
								</div>
							{/if}

							<!-- Adding to THIS entry rather than starting a new one. -->
							<div class="entry-add">
								<div class="entry-add-actions">
									<button
										type="button"
										class="add-btn"
										data-testid="add-photos"
										aria-pressed={openPanel === 'photos'}
										disabled={panelBusy || !uploadReady}
										onclick={() => togglePanel(entry.id, 'photos')}
									>
										{openPanel === 'photos' ? 'Cancel' : 'Add photos'}
									</button>
									{#if notesReady}
										<button
											type="button"
											class="add-btn"
											data-testid="add-note"
											aria-pressed={openPanel === 'note'}
											disabled={panelBusy}
											onclick={() => togglePanel(entry.id, 'note')}
										>
											{openPanel === 'note' ? 'Cancel' : 'Add a note'}
										</button>
									{/if}
									{#if !freeForm && notes.length}
										<span class="add-hint" data-testid="no-edit-hint">
											Notes on a check-in cannot be edited. Add another instead.
										</span>
									{/if}
								</div>

								{#if openPanel === 'photos'}
									<div class="entry-panel" data-testid="panel-photos">
										{#if panelError}
											<p class="feedback error" role="alert">{panelError}</p>
										{/if}
										<PhotoStager
											bind:this={panelStager}
											bind:staged={panelStaged}
											bind:settling={panelSettling}
											disabled={panelBusy}
											{uploadReady}
											captureContext={{ entryId: entry.id }}
											testPrefix="nbe"
										/>
										<div class="actions">
											<button
												type="button"
												class="btn"
												disabled={panelBusy || !panelStaged.length || panelSettling}
												onclick={() => savePanelPhotos(entry.id)}
											>
												{panelBusy ? 'Saving...' : 'Add to this entry'}
											</button>
											{#if panelProgress}<span class="progress">{panelProgress}</span>{/if}
										</div>
									</div>
								{:else if openPanel === 'note'}
									<div class="entry-panel" data-testid="panel-note">
										{#if panelError}
											<p class="feedback error" role="alert">{panelError}</p>
										{/if}
										{#key panelNoteKey}
											<NoteEditor
												onchange={(doc) => (panelNote = doc)}
												disabled={panelBusy}
												autofocus
												label="New note"
												placeholder="What did you work through?"
											/>
										{/key}
										<div class="actions">
											<button
												type="button"
												class="btn"
												disabled={panelBusy || !tiptapHasText(panelNote)}
												onclick={() => savePanelNote(entry.id)}
											>
												{panelBusy ? 'Saving...' : 'Add this note'}
											</button>
										</div>
									</div>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}

	<VersionBadge app="portal" />
</main>
</div>

<style>
	/* Editorial column: a touch narrower than the old technical page, with
	   more air between cards. The photo stays the widest thing on screen. */
	.notebook-page {
		max-width: 47rem;
		margin: 0 auto;
		padding: 0 1.4rem 4.5rem;
	}
	.notebook-page > .card {
		margin-bottom: 1.6rem;
	}
	.notebook-page h2 {
		margin-top: 0;
	}
	.lead strong {
		color: var(--nb-ink);
		font-weight: 600;
	}
	.hero-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}
	.chip {
		font-size: 0.74rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		color: var(--nb-ink-soft);
	}
	.chip-link {
		color: var(--nb-accent-ink);
		border-color: color-mix(in srgb, var(--nb-accent) 45%, transparent);
		text-decoration: none;
	}
	.chip-link:hover {
		border-color: var(--nb-accent-ink);
		background: var(--nb-accent-wash);
		text-decoration: none;
	}
	.note {
		color: var(--nb-ink-soft);
		font-size: 0.9rem;
	}
	.empty-state {
		padding: 0.6rem 0;
	}
	.feedback {
		font-size: 0.84rem;
		padding: 0.55rem 0.8rem;
		border-radius: var(--nb-radius-control);
		margin-bottom: 0.9rem;
	}
	.feedback.error {
		color: var(--nb-error);
		border: 1px solid color-mix(in srgb, var(--nb-error) 40%, transparent);
		background: color-mix(in srgb, var(--nb-error) 5%, transparent);
	}
	.feedback.ok {
		color: var(--nb-ok);
		border: 1px solid color-mix(in srgb, var(--nb-ok) 35%, transparent);
		background: color-mix(in srgb, var(--nb-ok) 5%, transparent);
	}

	/* ---- add an entry ---- */
	.picker {
		border: none;
		padding: 0;
		margin: 0 0 0.9rem;
	}
	.picker legend {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--nb-ink-faint);
		padding: 0;
		margin-bottom: 0.5rem;
	}
	.quick-picks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.5rem;
	}
	.pick {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		text-align: left;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
		color: var(--nb-ink);
		cursor: pointer;
		font: inherit;
	}
	.pick:hover {
		border-color: var(--nb-hairline-strong);
	}
	/* Gold is the active state -- the one thread back to the platform. */
	.pick.selected {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
	}
	.pick-label {
		font-weight: 600;
	}
	.pick-meta {
		font-size: 0.73rem;
		color: var(--nb-ink-faint);
	}
	.pick.free .pick-label {
		color: var(--nb-accent-ink);
	}
	.no-sessions {
		margin: 0;
	}
	.mode-picker .quick-picks {
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	}
	.label-field .optional {
		color: var(--nb-ink-faint);
		font-weight: 400;
	}
	.hint {
		display: block;
		color: var(--nb-ink-faint);
		font-size: 0.8rem;
		margin-top: 0.3rem;
	}
	/* The shared .field class is a ROW flex; everything in here stacks. */
	.note-field {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		align-items: stretch;
	}
	.photo-label {
		display: block;
		margin-bottom: 0.3rem;
		font-weight: 600;
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

	/* ---- my entries: the editorial feed. Generous air between entries, the
	   photo as the dominant element, restrained chrome around it. ---- */
	.entries {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 2.6rem;
	}
	.entry {
		border-top: 1px solid var(--nb-hairline);
		padding-top: 1.8rem;
	}
	.entry:first-child {
		border-top: none;
		padding-top: 0;
	}
	.entry-head {
		margin-bottom: 0.8rem;
	}
	.entry-title {
		margin: 0 0 0.3rem;
		font-size: 1.28rem;
		letter-spacing: -0.01em;
	}
	.entry-title.untitled {
		color: var(--nb-ink-faint);
		font-style: italic;
		font-weight: 500;
	}
	.entry-meta {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.dot {
		color: var(--nb-hairline-strong);
	}
	.status {
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		border: 1px solid currentColor;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-size: 0.64rem;
		font-weight: 600;
	}
	/* The flag status carries the gold thread; awaiting-review stays a quiet gray. */
	.status.warn {
		color: var(--nb-accent-ink);
	}
	.status.pending {
		color: var(--nb-ink-soft);
	}
	.entry-session {
		margin: 0.3rem 0 0;
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

	/* ---- adding to an existing entry ---- */
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

	@media (max-width: 540px) {
		.quick-picks {
			grid-template-columns: 1fr;
		}
	}
</style>
