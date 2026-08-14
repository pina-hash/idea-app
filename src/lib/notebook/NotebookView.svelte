<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import PhotoStager from '$lib/notebook/PhotoStager.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import NotebookEntryCard from '$lib/notebook/NotebookEntryCard.svelte';
	import FolderRail from '$lib/notebook/FolderRail.svelte';
	import FolderManager from '$lib/notebook/FolderManager.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { clearPendingCapture, fitForUpload, takePendingCapture } from '$lib/notebook/camera';
	import '$lib/notebook/notebook-theme.css';
	import { tiptapHasText, type TiptapNode } from '$lib/notebook-notes';
	import NotebookThemeToggle from '$lib/notebook/NotebookThemeToggle.svelte';
	import { notebookThemeAttr } from '$lib/notebook/notebook-theme.svelte';
	import {
		ENTRY_SORTS,
		entryActivityAt,
		isPinned,
		nearestOutstanding,
		outstandingSessions,
		photoCountLabel,
		sessionMeta,
		sortEntries,
		todayIso,
		type ActivityMap,
		type AddPhotoResult,
		type CreateEntryResult,
		type EntryActionResult,
		type EntrySort,
		type NoteSaveResult,
		type NotebookEntry,
		type NotebookSession,
		type NotePayload,
		type StagedPhoto
	} from '$lib/notebook';
	import {
		ENTRY_FILTERS,
		applyQuery,
		folderCounts,
		foldersInOrder,
		groupByDate,
		queryIsActive,
		suggestedFolder,
		type EntryFilterId,
		type FolderSelection,
		type FolderTransports,
		type NotebookFolder
	} from '$lib/notebook-folders';

	/**
	 * The whole student-facing notebook screen, factored out of /notebook so a
	 * dev harness mounts the SAME component against sample data (the
	 * CoinBalanceView / CoinDeskTool convention).
	 *
	 * IT OWNS THE SAVE SEQUENCING, NOT THE TRANSPORT. Photo 1 creates a new
	 * entry and every later photo joins it; a corrected version rides
	 * immediately after its own original so the pair lands on adjacent
	 * sequence numbers, which is the adjacency photoPages() groups back into
	 * one page. Every transport is injected, so the real page points them at
	 * the API routes and 0088's RPCs while the harness answers in memory --
	 * that split is what lets the orchestration itself be exercised with no
	 * network. The same sequencing serves the top form AND every entry card,
	 * which is why addPhotosToEntry lives here and is passed down rather than
	 * being reimplemented per card.
	 *
	 * IT OWNS WHAT IS SHOWN. Folder selection, search, filters, which entries
	 * are expanded, what is selected for a bulk move and how much of the feed
	 * is rendered all live here, so the rail, the toolbar and the feed can
	 * never disagree about the answer. One entry's own rendering is
	 * NotebookEntryCard's business.
	 *
	 * COLLAPSED BY DEFAULT, and that is the change this file exists for. Every
	 * entry used to render at full column width with every page photo, so a
	 * term's worth of notebook was an unusable scroll. Entries now open one at
	 * a time, on purpose.
	 */

	let {
		entries,
		sessions,
		folders = [],
		sectionLabel = null,
		canReview = false,
		configured = true,
		photosReady = true,
		notesReady = true,
		foldersReady = true,
		pinsReady = true,
		sessionsReady = true,
		initialCheckIn = null,
		activity = [],
		uploadReady = true,
		readOnly = false,
		homeHref = '/',
		createEntry,
		addPhoto,
		createNote,
		addNote,
		editNote,
		folderTransports,
		setPinned,
		onChanged
	}: {
		entries: NotebookEntry[];
		sessions: NotebookSession[];
		/** The student's own folders (0088). Empty is a normal state. */
		folders?: NotebookFolder[];
		/** The student's own class, when they have pinned one. */
		sectionLabel?: string | null;
		/** Instructor of at least one section, or a site admin (0067 chair tier). */
		canReview?: boolean;
		/**
		 * `notebook_entries` itself is readable -- 0069 applied. THE ONLY FLAG
		 * THAT HIDES THE PAGE, and it is answered by the narrowest probe the load
		 * can make (that table's own columns, no embedded resource), so it can
		 * only ever mean what the card it drives says. Everything layered on top
		 * reports itself through its own flag below; a broken one costs that
		 * feature, never the notebook.
		 */
		configured?: boolean;
		/**
		 * The photos embed resolved. False leaves every entry with an empty photo
		 * list -- titles, notes, filing and the feed all keep working -- rather
		 * than reporting the whole notebook missing over one relationship.
		 */
		photosReady?: boolean;
		/**
		 * The check-in reads (0094/0098) answered: which scheduled check-in each
		 * linked entry belongs to, and the quick-picks for the student's classes.
		 * False leaves the picks empty and entry titles falling back to their own
		 * label, which they already do for a free entry.
		 */
		sessionsReady?: boolean;
		/**
		 * A check-in to open already selected -- the deep link an IDEA Classroom
		 * stream card arrives on. Already validated by the caller against this
		 * student's own check-ins, so it can only name one of `sessions`.
		 *
		 * It is read ONCE, at setup: a deep link is a one-time intent, not a
		 * setting, and after the first render the student's own picks own the
		 * form. It applies only while the check-in is still OUTSTANDING -- landing
		 * on one they have already filed against would quietly aim the next upload
		 * at a covered check-in, which is the same reason the default effect below
		 * treats a covered pick as stale.
		 */
		initialCheckIn?: { sessionId: string; sectionId: string } | null;
		/**
		 * 0078 applied. False turns the WRITTEN NOTE half off on its own --
		 * photos keep working -- rather than blanking a notebook because one
		 * hand-applied migration has not landed yet.
		 */
		notesReady?: boolean;
		/**
		 * 0088 applied. False turns FILING off the same way: the rail, the
		 * folder pickers and the bulk move go, and the feed -- collapsing,
		 * search, filters and all -- keeps working, because none of that
		 * needed the migration.
		 */
		foldersReady?: boolean;
		/**
		 * 0091 applied. False turns PINNING and the activity sort off together
		 * -- they are one migration -- and the feed keeps its original order.
		 */
		pinsReady?: boolean;
		/**
		 * notebook_entry_activity (0091), one row per entry the caller can
		 * read. Computed in the DATABASE over every note revision and photo,
		 * not here: the feed paints a capped number of entries while sorting
		 * has to cover the whole notebook.
		 */
		activity?: { id: string; last_activity_at: string }[];
		/**
		 * The Drive integration is configured server-side; false disables PHOTO
		 * submits only. A note needs no Drive, so the note path stays usable.
		 */
		uploadReady?: boolean;
		/**
		 * READ-ONLY PREVIEW (view-as-student). Removes the "Add an entry" form
		 * outright and stops every write handler before it can call anything.
		 *
		 * IT IS BELT AND BRACES, NOT THE MECHANISM. A read-only surface is one
		 * that is handed NO transports at all -- every write prop below is
		 * optional and its absence removes the control it drives, right down
		 * into each entry card -- so there is nothing to execute even if a
		 * control leaked through. This flag exists so the intent is stated
		 * once at the top rather than inferred from six omitted props.
		 */
		readOnly?: boolean;
		/** Where "Home" goes -- rewritten under /classroom/view-as/<email>. */
		homeHref?: string;
		createEntry?: (form: FormData) => Promise<CreateEntryResult>;
		addPhoto?: (form: FormData) => Promise<AddPhotoResult>;
		createNote?: (payload: NotePayload) => Promise<CreateEntryResult>;
		addNote?: (entryId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		editNote?: (noteId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		/** Folder writes (0088). Omitted when foldersReady is false. */
		folderTransports?: FolderTransports;
		/** The one pin write (0091). Omitted when pinsReady is false. */
		setPinned?: (entryId: string, pinned: boolean) => Promise<EntryActionResult>;
		/** Called after any successful save so the page can refresh its data. */
		onChanged?: () => void;
	} = $props();

	// ---- new-entry form state ----------------------------------------------

	/**
	 * The deep link, resolved ONCE at setup rather than in an effect.
	 *
	 * Reading props during initialization is deliberate: this is a one-time
	 * intent carried in the URL, and seeding `sessionTouched` here is what makes
	 * the nearest-outstanding default effect below stand down for it (it bails on
	 * a touched, non-stale pick). Doing it in an effect instead would race that
	 * one for no benefit.
	 */
	// svelte-ignore state_referenced_locally
	const linkedPick =
		initialCheckIn &&
		outstandingSessions(sessions, entries).some(
			(s) => s.id === initialCheckIn.sessionId && s.section_id === initialCheckIn.sectionId
		)
			? initialCheckIn
			: null;

	/** `null` is the deliberate free-form path: no session, title optional. */
	let selectedSession = $state<string | null>(linkedPick?.sessionId ?? null);
	/**
	 * WHICH CLASS the picked check-in arrived through. Held beside the id rather
	 * than looked up from it, because one canonical check-in can be posted to
	 * several classes (0098) and a student in two of them has two postings with
	 * the SAME id -- `sessions.find(s => s.id === ...)` would silently resolve to
	 * whichever sorted first, filing the entry under a class the student did not
	 * pick. The pair is what `notebook_entries` keys on, so the pair is what the
	 * form holds.
	 */
	let selectedSectionId = $state<string | null>(linkedPick?.sectionId ?? null);
	let sessionTouched = $state(linkedPick !== null);
	/**
	 * Free-form only: photos (the original path, unchanged and the default) or
	 * a written note with no photo at all. Held as a plain preference and read
	 * through `noteOnly` below, so picking a session can never leave the form
	 * in a note mode that the session-linked path does not offer.
	 */
	let freeMode = $state<'photos' | 'note'>('photos');
	/** A short TITLE for the entry. Since 0078 it is never the note's text. */
	let title = $state('');
	/** Which folder this entry will be filed into; null is Unfiled. */
	let folderChoice = $state<string | null>(null);
	let folderTouched = $state(false);
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

	/** How the feed is ordered under the pins. Not persisted: it is a way of
	    looking at the notebook for a minute, not a setting. */
	let sort = $state<EntrySort>('newest');
	const activityMap = $derived<ActivityMap>(
		new Map(activity.map((row) => [row.id, row.last_activity_at]))
	);
	/** Which stamp a date heading is about, so the groups follow the sort. */
	const groupStamp = $derived((entry: NotebookEntry) =>
		sort === 'activity' ? entryActivityAt(entry, activityMap) : entry.upload_timestamp
	);
	const feed = $derived(sortEntries(entries, sort, activityMap));
	const orderedFolders = $derived(foldersInOrder(folders));
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
		const next = nearestOutstanding(sessions, entries, todayIso());
		selectedSession = next?.id ?? null;
		selectedSectionId = next?.section_id ?? null;
	});

	// Filing several entries into one folder in a row is the common case, so
	// the picker follows the last entry the student filed until they say
	// otherwise. A folder that has since been deleted falls back to Unfiled
	// rather than sending a stale id the RPC would refuse.
	$effect(() => {
		if (folderTouched) return;
		const suggested = suggestedFolder(feed);
		folderChoice = suggested && folders.some((f) => f.id === suggested) ? suggested : null;
	});

	/** Takes the PAIR, so pressing one of two postings of a shared check-in
	    files under the class whose button was pressed. */
	function chooseSession(id: string | null, sectionId: string | null = null) {
		sessionTouched = true;
		selectedSession = id;
		selectedSectionId = id ? sectionId : null;
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
			| {
					session?: string | null;
					section?: string | null;
					mode?: 'photos' | 'note';
					title?: string;
					folder?: string | null;
					entryId?: string;
			  }
			| null;
		if (!pending) return;
		if (pending.entryId) {
			// They were adding to an existing entry, not starting a new one, so
			// put them back inside it rather than at the top form.
			expanded.add(pending.entryId);
		} else {
			if (pending.session !== undefined) {
				sessionTouched = true;
				selectedSession = pending.session;
				// Restored as the PAIR. A marker written before this field existed
				// carries no section, so it falls back to the first posting of that
				// check-in -- which is the only answer available and the right one
				// whenever there is just the one.
				selectedSectionId =
					pending.section ??
					(pending.session
						? (sessions.find((s) => s.id === pending.session)?.section_id ?? null)
						: null);
			}
			if (pending.mode) freeMode = pending.mode;
			if (typeof pending.title === 'string') title = pending.title;
			if (pending.folder !== undefined) {
				folderTouched = true;
				folderChoice = pending.folder;
			}
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
		// Deliberately NOT the folder: the next entry almost always belongs
		// where the last one went, and the suggestion effect re-derives it from
		// what was just saved.
		folderTouched = false;
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
		report: (message: string) => void,
		skipOriginal = false
	): Promise<{ originalOk: boolean; enhancedOk: boolean }> {
		if (!addPhoto) return { originalOk: false, enhancedOk: true };
		if (!skipOriginal) {
			report(total > 1 ? `Uploading photo ${num} of ${total}...` : 'Uploading...');
			const form = new FormData();
			form.set('photo', await prepared(photo.file));
			form.set('entry_id', entryId);
			form.set('variant', 'original');
			if (!(await addPhoto(form)).ok) return { originalOk: false, enhancedOk: true };
		}
		if (!photo.enhanced) return { originalOk: true, enhancedOk: true };
		report(`Uploading corrected photo ${num}...`);
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

	/**
	 * Every staged photo onto an EXISTING entry. Injected into each card, so
	 * the pairing rule above has exactly one implementation whether the photos
	 * are joining a brand-new entry or one from three weeks ago.
	 */
	async function addPhotosToEntry(
		entryId: string,
		photos: StagedPhoto[],
		report: (message: string) => void
	): Promise<{ ok: boolean; error?: string }> {
		if (readOnly || !addPhoto) return { ok: false, error: 'This is a read-only preview.' };
		const total = photos.length;
		const failed: number[] = [];
		const failedEnhanced: number[] = [];
		for (let i = 0; i < total; i++) {
			const result = await uploadPair(entryId, photos[i], i + 1, total, report);
			if (!result.originalOk) failed.push(i + 1);
			else if (!result.enhancedOk) failedEnhanced.push(i + 1);
		}
		if (failed.length === total) {
			return { ok: false, error: `That ${total === 1 ? 'photo' : 'set of photos'} did not upload. Try again.` };
		}
		errorMsg = null;
		successMsg = failed.length
			? `Added ${total - failed.length} of ${total} photos; ${photoList(failed)} did not upload.`
			: `Added ${photoCountLabel(total - failed.length)} to this entry.`;
		if (failedEnhanced.length) {
			successMsg += ` The corrected version of ${photoList(
				failedEnhanced
			)} did not upload; the original is saved.`;
		}
		onChanged?.();
		return { ok: true };
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (readOnly || busy || !canSubmit) return;
		if (noteOnly ? !createNote : !createEntry) return;
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
				const saved = await createNote!({
					content: noteDraft as TiptapNode,
					custom_label: title.trim() || null,
					folder_id: folderChoice
				});
				if (!saved.ok) {
					errorMsg = saved.error;
					return;
				}
				successMsg = 'Note saved.';
				resetForm();
				onChanged?.();
				return;
			}

			// Photo 1 creates the entry. A blank title is sent as nothing at all:
			// 0071 made it optional and the upload route falls back to the file's
			// own name, so the UI must not re-impose a required-title rule.
			const first = new FormData();
			first.set('photo', await prepared(staged[0].file));
			if (selectedSession) {
				first.set('session_id', selectedSession);
				// Which class this entry is for. Since 0098 one check-in can run in
				// several, so the section is taken from the PICK rather than looked
				// up from the id -- a lookup would resolve a shared check-in to
				// whichever posting sorted first, which may not be the class whose
				// button was pressed. Falling back to the lookup covers a pick made
				// before this field existed; a null lets the server resolve it
				// (_notebook_resolve_session_section), which is right when there is
				// only one posting and refuses honestly when there is not.
				const sectionId =
					selectedSectionId ?? sessions.find((s) => s.id === selectedSession)?.section_id ?? null;
				if (sectionId) first.set('section_id', sectionId);
			}
			const trimmed = title.trim();
			if (!selectedSession && trimmed) first.set('custom_label', trimmed);
			if (folderChoice) first.set('folder_id', folderChoice);

			const created = await createEntry!(first);
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
					(m) => (progress = m),
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
			onChanged?.();
		} catch (err) {
			errorMsg = (err as Error).message || 'The upload failed to send.';
		} finally {
			busy = false;
			progress = '';
		}
	}

	/** EntryNotes hands back a saved revision; the feed then reloads. */
	async function saveNoteEdit(noteId: string, doc: TiptapNode): Promise<NoteSaveResult> {
		if (readOnly || !editNote) return { ok: false, error: 'This is a read-only preview.' };
		const result = await editNote(noteId, doc);
		if (result.ok) {
			successMsg = 'Note updated. The earlier version is still on this entry.';
			onChanged?.();
		}
		return result;
	}

	async function saveNoteToEntry(entryId: string, doc: TiptapNode): Promise<NoteSaveResult> {
		if (readOnly || !addNote) return { ok: false, error: 'This is a read-only preview.' };
		const result = await addNote(entryId, doc);
		if (result.ok) {
			successMsg = 'Note added to this entry.';
			onChanged?.();
		}
		return result;
	}

	// ---- organizing: folders, search, filters, selection --------------------

	let selection = $state<FolderSelection>('all');
	let search = $state('');
	let filters = $state<EntryFilterId[]>([]);
	let managerOpen = $state(false);
	let folderBusy = $state(false);

	const counts = $derived(folderCounts(feed));
	const query = $derived({ selection, search, filters });
	const visible = $derived(applyQuery(feed, query));
	const narrowed = $derived(queryIsActive(query));

	// A selection whose folder is deleted (or which was never in this
	// student's list) falls back to everything rather than showing an empty
	// feed with no explanation.
	$effect(() => {
		if (selection === 'all' || selection === 'unfiled') return;
		if (!folders.some((f) => f.id === selection)) selection = 'all';
	});

	function toggleFilter(id: EntryFilterId) {
		filters = filters.includes(id) ? filters.filter((f) => f !== id) : [...filters, id];
	}

	function clearQuery() {
		selection = 'all';
		search = '';
		filters = [];
	}

	// ---- expansion ----------------------------------------------------------

	/**
	 * Which entries are open. Collapsed is the default for everything, which
	 * is the whole point of the view; expansion is per visit and deliberately
	 * not persisted -- coming back to a notebook you left with fifteen entries
	 * open would put you back where you started.
	 */
	const expanded = new SvelteSet<string>();

	function toggleEntry(id: string) {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	function expandAll() {
		for (const e of visible) expanded.add(e.id);
	}

	function collapseAll() {
		expanded.clear();
	}

	// ---- bulk selection -----------------------------------------------------

	let selectMode = $state(false);
	const picked = new SvelteSet<string>();
	let moveTarget = $state('');
	let bulkError = $state<string | null>(null);

	function togglePick(id: string, on: boolean) {
		if (on) picked.add(id);
		else picked.delete(id);
	}

	function exitSelectMode() {
		selectMode = false;
		picked.clear();
		moveTarget = '';
		bulkError = null;
	}

	/**
	 * One call for the whole selection: 0088's notebook_move_entries takes an
	 * array, so a handful of entries move in one transaction rather than in a
	 * client-side loop that can stop halfway with nobody able to say how much
	 * of it landed.
	 */
	async function moveSelected() {
		if (!folderTransports || folderBusy || picked.size === 0) return;
		folderBusy = true;
		bulkError = null;
		try {
			const ids = [...picked];
			const result = await folderTransports.moveEntries(ids, moveTarget === '' ? null : moveTarget);
			if (!result.ok) {
				bulkError = result.error;
				return;
			}
			const target = moveTarget === '' ? 'Unfiled' : (orderedFolders.find((f) => f.id === moveTarget)?.name ?? 'that folder');
			successMsg = `Moved ${ids.length === 1 ? '1 entry' : `${ids.length} entries`} to ${target}.`;
			exitSelectMode();
			onChanged?.();
		} finally {
			folderBusy = false;
		}
	}

	async function moveOne(entryId: string, folderId: string | null) {
		if (!folderTransports) return { ok: false as const, error: 'Folders are not available.' };
		folderBusy = true;
		try {
			const result = await folderTransports.moveEntries([entryId], folderId);
			if (result.ok) onChanged?.();
			return result;
		} finally {
			folderBusy = false;
		}
	}

	async function saveFolder(input: Parameters<FolderTransports['saveFolder']>[0]) {
		if (!folderTransports) return { ok: false as const, error: 'Folders are not available.' };
		folderBusy = true;
		try {
			const result = await folderTransports.saveFolder(input);
			if (result.ok) onChanged?.();
			return result;
		} finally {
			folderBusy = false;
		}
	}

	async function deleteFolder(id: string) {
		if (!folderTransports) return { ok: false as const, error: 'Folders are not available.' };
		folderBusy = true;
		try {
			const result = await folderTransports.deleteFolder(id);
			if (result.ok) {
				if (selection === id) selection = 'all';
				onChanged?.();
			}
			return result;
		} finally {
			folderBusy = false;
		}
	}

	/**
	 * Pinning goes through the injected write and then reloads, exactly the
	 * way filing does: the pin order is the server's answer (0091 keeps an
	 * existing stamp on a re-pin), so guessing it here could disagree with
	 * where the entry actually lands.
	 */
	async function pinEntry(entryId: string, pinned: boolean): Promise<EntryActionResult> {
		if (readOnly || !setPinned) return { ok: false, error: 'Pinning is not available.' };
		const result = await setPinned(entryId, pinned);
		if (result.ok) onChanged?.();
		return result;
	}

	// ---- how much of the feed is rendered -----------------------------------

	/**
	 * A RENDER limit, not a query limit. Search and filters run over the whole
	 * notebook (see notebook-folders.ts), which is what a student means by
	 * "find it"; what actually hurt was painting hundreds of entries, and that
	 * is what this bounds. Resets whenever the query changes, so narrowing to
	 * a folder does not leave you scrolled past the end of it.
	 */
	const PAGE = 30;
	let shown = $state(PAGE);
	$effect(() => {
		void selection;
		void search;
		void filters;
		void sort;
		shown = PAGE;
	});

	const rendered = $derived(visible.slice(0, shown));

	/**
	 * PINNED ENTRIES GET THEIR OWN GROUP rather than being dropped into
	 * whichever date heading they happen to belong under. sortEntries has
	 * already floated them to the front; leaving them there would file a
	 * September page under "Today" or open the feed with an "Older" heading,
	 * which is a heading that lies about what is beneath it.
	 */
	// Gated on pinsReady as well as on being pinned, the same guard the folder
	// chip carries: with 0091 unapplied the load cannot return pinned_at at
	// all, so this would never fire in practice -- but a feed that renders a
	// "Pinned" heading while offering no way to unpin anything is one stale
	// prop away from lying, and the guard costs nothing.
	const pinnedRendered = $derived(pinsReady ? rendered.filter(isPinned) : []);
	const restRendered = $derived(pinsReady ? rendered.filter((entry) => !isPinned(entry)) : rendered);
	const groups = $derived([
		...(pinnedRendered.length
			? [{ key: 'pinned', label: 'Pinned', entries: pinnedRendered }]
			: []),
		...groupByDate(restRendered, new Date(), groupStamp)
	]);
	const more = $derived(Math.max(0, visible.length - rendered.length));
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
<div class="nb-root" data-nb-theme={notebookThemeAttr()}>
<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<NotebookThemeToggle />
		<a class="btn secondary" href={homeHref}>&lsaquo; Home</a>
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
				<code>notebook_entries</code> could not be read on this project, so the notebook
				tables are not in place yet. Apply <code>0069_notebook.sql</code> and the
				migrations that follow it in the Supabase SQL editor, then reload. Everything
				layered on top of it reports itself separately, so this card means the base
				table specifically.
			</p>
		</section>
	{:else}
		<!--
			The two capabilities that are about the WHOLE feed rather than the
			compose form, so they sit outside it and show on a read-only preview
			too: a reviewer looking at a student's notebook needs to know a photo
			list is empty because a read failed, not because the student wrote
			nothing.
		-->
		{#if !photosReady}
			<section class="card">
				<p class="feedback error" data-testid="nb-photos-unavailable">
					Photos could not be loaded on this project, so entries are showing without
					them. Everything else works as normal.
				</p>
			</section>
		{/if}
		{#if !sessionsReady}
			<section class="card">
				<p class="feedback error" data-testid="nb-sessions-unavailable">
					Scheduled check-ins could not be loaded, so entries filed against one show
					their own title instead and there are no check-ins to pick from. Everything
					else works as normal.
				</p>
			</section>
		{/if}

		<!-- ---------------------------------------------------------------- -->
		<!-- Add an entry -- omitted entirely on a read-only preview            -->
		<!-- ---------------------------------------------------------------- -->
		{#if !readOnly}
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
			{#if !foldersReady}
				<p class="feedback error" data-testid="nb-folders-unavailable">
					Folders are not available on this project yet. Apply migration
					<code>0088_notebook_folders.sql</code> in the Supabase SQL editor. Everything else
					works as normal.
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
							<!-- Keyed on the PAIR, not the check-in id. One canonical
							     check-in posted to two of this student's classes arrives
							     as two postings sharing an id (0098), which a bare `s.id`
							     key would reject as a duplicate -- and they are genuinely
							     two picks, because the entry is filed under one class or
							     the other. -->
							{#each open as s (`${s.id}:${s.section_id}`)}
								{@const picked = selectedSession === s.id && selectedSectionId === s.section_id}
								<button
									type="button"
									class="pick"
									class:selected={picked}
									aria-pressed={picked}
									onclick={() => chooseSession(s.id, s.section_id)}
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

				<!-- Filing is offered on BOTH tiers: which folder an entry lives
				     in is the student's own view of their notebook, and has
				     nothing to do with whether an instructor asked for the page. -->
				{#if foldersReady}
					<label class="field label-field folder-field">
						<span>Folder <span class="optional">(optional)</span></span>
						<select
							bind:value={folderChoice}
							disabled={busy}
							data-testid="new-entry-folder"
							onchange={() => (folderTouched = true)}
						>
							<option value={null}>Unfiled</option>
							{#each orderedFolders as f (f.id)}
								<option value={f.id}>{f.name}</option>
							{/each}
						</select>
						<span class="hint">
							{#if orderedFolders.length}
								We start you off wherever you filed last.
							{:else}
								You have no folders yet.
							{/if}
							<button
								type="button"
								class="inline-link"
								onclick={() => (managerOpen = true)}
								disabled={busy}>Manage folders</button
							>
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
						captureContext={{
							session: selectedSession,
							section: selectedSectionId,
							mode: freeMode,
							title,
							folder: folderChoice
						}}
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
		{/if}

		<!-- ---------------------------------------------------------------- -->
		<!-- My entries                                                        -->
		<!-- ---------------------------------------------------------------- -->
		<section class="card">
			<h2>My entries</h2>

			{#if entries.length === 0}
				<p class="note empty-state">
					{#if readOnly}
						Nothing in this notebook yet.
					{:else}
						No entries yet. Photograph a page or write a note above and it will show up here.
					{/if}
				</p>
			{:else}
				{#if foldersReady && managerOpen && folderTransports}
					<FolderManager
						{folders}
						counts={counts as Map<string, number>}
						busy={folderBusy}
						onSave={saveFolder}
						onDelete={deleteFolder}
						onClose={() => (managerOpen = false)}
					/>
				{/if}

				{#if foldersReady}
					<FolderRail
						{folders}
						{counts}
						{selection}
						onSelect={(next) => (selection = next)}
						onManage={folderTransports ? () => (managerOpen = !managerOpen) : undefined}
					/>
				{/if}

				<div class="toolbar">
					<label class="search">
						<span class="sr-only">Search your notebook</span>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
							<circle cx="11" cy="11" r="7" />
							<path d="M20 20l-3.5-3.5" />
						</svg>
						<input
							type="search"
							bind:value={search}
							placeholder="Search titles and notes"
							data-testid="nb-search"
						/>
					</label>

					<div class="chips" role="group" aria-label="Filters">
						{#each ENTRY_FILTERS as f (f.id)}
							<button
								type="button"
								class="chip-toggle"
								class:on={filters.includes(f.id)}
								aria-pressed={filters.includes(f.id)}
								title={f.hint}
								data-testid="filter-{f.id}"
								onclick={() => toggleFilter(f.id)}
							>
								{f.label}
							</button>
						{/each}
					</div>

					<div class="tools">
						{#if pinsReady}
							<label class="sort">
								<span class="sr-only">Sort entries by</span>
								<select bind:value={sort} data-testid="sort-select">
									{#each ENTRY_SORTS as option (option.id)}
										<option value={option.id}>{option.label}</option>
									{/each}
								</select>
							</label>
						{/if}
						<span class="result-count" data-testid="result-count">
							{visible.length === entries.length
								? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
								: `${visible.length} of ${entries.length}`}
						</span>
						{#if narrowed}
							<button type="button" class="inline-link" onclick={clearQuery}>Clear</button>
						{/if}
						<button
							type="button"
							class="inline-link"
							data-testid="expand-toggle"
							onclick={() => (expanded.size ? collapseAll() : expandAll())}
						>
							{expanded.size ? 'Collapse all' : 'Expand all'}
						</button>
						{#if foldersReady && folderTransports}
							<button
								type="button"
								class="inline-link"
								data-testid="select-toggle"
								onclick={() => (selectMode ? exitSelectMode() : (selectMode = true))}
							>
								{selectMode ? 'Done' : 'Select'}
							</button>
						{/if}
					</div>
				</div>

				{#if selectMode}
					<div class="bulk" data-testid="bulk-bar">
						<span class="bulk-count">
							{picked.size === 0
								? 'Select entries to move'
								: `${picked.size} selected`}
						</span>
						<label class="bulk-move">
							<span class="sr-only">Move selected entries to</span>
							<select bind:value={moveTarget} disabled={folderBusy || picked.size === 0}>
								<option value="">Unfiled</option>
								{#each orderedFolders as f (f.id)}
									<option value={f.id}>{f.name}</option>
								{/each}
							</select>
						</label>
						<button
							type="button"
							class="btn small"
							data-testid="bulk-move"
							disabled={folderBusy || picked.size === 0}
							onclick={moveSelected}
						>
							{folderBusy ? 'Moving...' : 'Move'}
						</button>
						{#if picked.size}
							<button type="button" class="inline-link" onclick={() => picked.clear()}>
								Clear selection
							</button>
						{/if}
					</div>
					{#if bulkError}
						<p class="feedback error" role="alert">{bulkError}</p>
					{/if}
				{/if}

				{#if visible.length === 0}
					<p class="note empty-state" data-testid="no-matches">
						Nothing here matches what you are looking for.
						<button type="button" class="inline-link" onclick={clearQuery}>Clear the filters</button>
					</p>
				{:else}
					{#each groups as group (group.key)}
						<div class="group">
							<h3 class="group-head">{group.label}</h3>
							<ol class="entries">
								{#each group.entries as entry (entry.id)}
									<li>
										<!--
											foldersReady / pinsReady say the MIGRATION is applied, so
											the folder chip and the pin indicator render from them.
											Whether the card offers a CONTROL is a SEPARATE question,
											answered by the presence of onMove / onPin -- which is
											what lets a read-only preview report a student's own
											filing and pins truthfully while offering no way to
											change either.
										-->
										<NotebookEntryCard
											{entry}
											{folders}
											collapsed={!expanded.has(entry.id)}
											onToggle={() => toggleEntry(entry.id)}
											{selectMode}
											selected={picked.has(entry.id)}
											onSelectChange={(on) => togglePick(entry.id, on)}
											{uploadReady}
											{notesReady}
											{foldersReady}
											{pinsReady}
											onAddPhotos={addPhoto ? addPhotosToEntry : undefined}
											onAddNote={addNote ? saveNoteToEntry : undefined}
											onEditNote={editNote ? saveNoteEdit : undefined}
											onMove={folderTransports ? moveOne : undefined}
											onPin={setPinned ? pinEntry : undefined}
										/>
									</li>
								{/each}
							</ol>
						</div>
					{/each}

					{#if more > 0}
						<div class="more">
							<button
								type="button"
								class="btn secondary"
								data-testid="show-older"
								onclick={() => (shown += PAGE)}
							>
								Show older ({more} more)
							</button>
						</div>
					{/if}
				{/if}
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
	/* The shared .field class is a ROW flex; these stack. */
	.note-field,
	.folder-field {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		align-items: stretch;
	}
	.folder-field select {
		font: inherit;
		max-width: 20rem;
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
	.inline-link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: inherit;
		color: var(--nb-accent-ink);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.inline-link:hover:not(:disabled) {
		color: var(--nb-ink);
	}
	.inline-link:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* ---- toolbar ---- */
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		padding-bottom: 0.9rem;
		margin-bottom: 0.4rem;
		border-bottom: 1px solid var(--nb-hairline);
	}
	.search {
		flex: 1 1 14rem;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		background: var(--nb-surface);
		color: var(--nb-ink-faint);
	}
	.search:focus-within {
		border-color: var(--nb-accent);
	}
	.search svg {
		width: 0.95rem;
		height: 0.95rem;
		flex: 0 0 auto;
	}
	.search input {
		flex: 1 1 auto;
		min-width: 0;
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 0.86rem;
		color: var(--nb-ink);
	}
	.search input:focus {
		outline: none;
	}
	.chips {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.chip-toggle {
		padding: 0.28rem 0.66rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		background: var(--nb-surface);
		color: var(--nb-ink-soft);
		font: inherit;
		font-size: 0.76rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.chip-toggle:hover {
		border-color: var(--nb-ink-faint);
	}
	.chip-toggle.on {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
		color: var(--nb-accent-ink);
		font-weight: 600;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.78rem;
		margin-left: auto;
	}
	.result-count {
		color: var(--nb-ink-faint);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	/* Quiet: the sort is a way of looking at the feed, not a heading over it. */
	.sort select {
		font-size: 0.78rem;
		padding: 0.25rem 0.4rem;
		border-color: var(--nb-hairline);
		background: var(--nb-surface);
		color: var(--nb-ink-soft);
	}

	/* ---- bulk selection ---- */
	.bulk {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		padding: 0.55rem 0.75rem;
		margin: 0.6rem 0 0.2rem;
		border: 1px solid var(--nb-accent);
		background: var(--nb-accent-wash);
		border-radius: var(--nb-radius-control);
		font-size: 0.82rem;
	}
	.bulk-count {
		font-weight: 600;
		color: var(--nb-ink);
	}
	.bulk-move select {
		font: inherit;
		font-size: 0.8rem;
		padding: 0.2rem 0.4rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface);
	}
	:global(.nb-root .btn.small) {
		padding: 0.28rem 0.8rem;
		font-size: 0.78rem;
	}

	/* ---- the feed ---- */
	.group {
		margin-top: 1.3rem;
	}
	.group-head {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--nb-ink-faint);
		margin: 0 0 0.4rem;
	}
	.entries {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.35rem;
	}
	/* A grid item's automatic minimum size is its MIN-CONTENT, and a collapsed
	   entry's row is a nowrap flex line, so without this each <li> refuses to
	   shrink below the untruncated title -- which on a phone forces the whole
	   page wider than the viewport rather than ellipsizing. The ellipsis on
	   .row-title cannot help: overflow:hidden does not reduce what an element
	   contributes to min-content. */
	.entries > li {
		min-width: 0;
	}
	.more {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
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

	@media (max-width: 540px) {
		.quick-picks {
			grid-template-columns: 1fr;
		}
		.tools {
			margin-left: 0;
			width: 100%;
		}
	}
</style>
