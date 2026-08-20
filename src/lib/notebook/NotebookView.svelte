<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import PhotoStager from '$lib/notebook/PhotoStager.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import NotebookEntryCard from '$lib/notebook/NotebookEntryCard.svelte';
	import FolderRail from '$lib/notebook/FolderRail.svelte';
	import FolderManager from '$lib/notebook/FolderManager.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { beforeNavigate } from '$app/navigation';
	import { tick } from 'svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import { revealDetailPane } from '$lib/shell/reveal';
	import { splitIsWide, watchSplitWidth } from '$lib/shell/split.svelte';
	import { clearPendingCapture, fitForUpload, takePendingCapture } from '$lib/notebook/camera';
	import {
		NOTEBOOK_DISCARD_WARNING,
		clampSelection,
		notebookComposerHasWork,
		selectedEntryOf
	} from '$lib/notebook/notebook-shell';
	import '$lib/notebook/notebook-theme.css';
	import { tiptapHasText, type TiptapNode } from '$lib/notebook-notes';
	import NotebookMasthead from '$lib/notebook/NotebookMasthead.svelte';
	import { notebookThemeAttr } from '$lib/notebook/notebook-theme.svelte';
	import {
		ENTRY_SORTS,
		deletedEntryTitle,
		entryActivityAt,
		isPinned,
		nearestOutstanding,
		outstandingSessions,
		photoCountLabel,
		sessionHasDraft,
		sessionMeta,
		sortEntries,
		todayIso,
		type ActivityMap,
		type AddPhotoResult,
		type CreateEntryResult,
		type EntryActionResult,
		type EntrySort,
		type NoteSaveResult,
		type NotebookDeletedEntry,
		type NotebookEntry,
		type NotebookSession,
		type NotePayload,
		type StagedPhoto
	} from '$lib/notebook';
	import {
		DELETED_FILTER,
		DRAFT_FILTER,
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
	 * COLLAPSED BY DEFAULT. Every entry used to render at full column width with
	 * every page photo, so a term's worth of notebook was an unusable scroll.
	 * Entries open one at a time, on purpose.
	 *
	 * IT IS THE SAME TWO-PANE SHELL THE CLASS PAGE SITS ON, above 1024px:
	 * $lib/shell/ClassSplit.svelte, one breakpoint, one gutter, one pane gap.
	 * The navigation pane holds the folder rail, the filters and the list; the
	 * detail pane holds the entry you picked, or the compose form, or -- when
	 * neither -- a line saying so.
	 *
	 * BELOW THE BREAKPOINT NOTHING ABOUT THE OLD BEHAVIOUR CHANGES. The panes
	 * stack to one column with the compose form on top and the feed under it,
	 * and its entries expand IN PLACE exactly as they always have. That is
	 * `narrow="stack"` in split.css doing the ordering, so the one instance of
	 * the compose form -- staged File handles and all -- is never re-created by
	 * crossing the breakpoint.
	 *
	 * THE COMPOSER IS NEVER UNMOUNTED BY A SELECTION. Opening an entry hides it
	 * and shows the entry; the form, and everything staged in it, is still
	 * there when the entry is closed. That is the whole reason it is a `class`
	 * rather than an `{#if}`: staged photos exist nowhere but in this browser's
	 * memory, and an `{#if}` would throw them away on a click.
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
		draftsReady = true,
		initialCheckIn = null,
		activity = [],
		deletionReady = true,
		deletedEntries = [],
		uploadReady = true,
		readOnly = false,
		homeHref = '/',
		masthead = true,
		historyReady = true,
		viewerId,
		createEntry,
		addPhoto,
		createNote,
		addNote,
		editNote,
		folderTransports,
		setPinned,
		deleteEntry,
		removePhoto,
		setEntryLabel,
		restoreEntry,
		restorePhoto,
		submitEntry,
		unsubmitEntry,
		deleteNote,
		restoreNote,
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
		 * 0118 applied. False means `submitted_at` cannot exist yet, so every
		 * entry the load returns was turned in when it was made -- there is no
		 * draft to compose, no Drafts filter, and no per-entry Turn in / Move to
		 * drafts control, exactly the notebook this page rendered before drafts
		 * existed.
		 */
		draftsReady?: boolean;
		/**
		 * notebook_entry_activity (0091), one row per entry the caller can
		 * read. Computed in the DATABASE over every note revision and photo,
		 * not here: the feed paints a capped number of entries while sorting
		 * has to cover the whole notebook.
		 */
		activity?: { id: string; last_activity_at: string }[];
		/**
		 * 0117 applied. False hides the "Recently deleted" chip outright -- the
		 * same rung `deletionReady` in the +page.server.ts load reports, since
		 * `deleted_at` does not exist on a project without it.
		 */
		deletionReady?: boolean;
		/**
		 * The caller's own DELETED entries (0117), from a query SEPARATE from
		 * `entries` above -- see notebook-selects.ts. Empty is the ordinary state.
		 */
		deletedEntries?: NotebookDeletedEntry[];
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
		/**
		 * False removes the notebook's own masthead. The room still needs the
		 * `.nb-root` wrapper and its theme -- that stays -- but a caller that
		 * already sits inside another persistent bar (the view-as tree, under
		 * ClassroomShell) would otherwise render two: the logo, the ProfileMenu
		 * and a way back would both appear twice on one screen. `homeHref` still
		 * has no effect when this is false, since there is no bar left to carry
		 * the link.
		 */
		masthead?: boolean;
		/**
		 * A note can be DELETED and an entry can show a HISTORY (0119). False
		 * turns both off the same way `deletionReady` turns off 0116/0117: no
		 * delete or removed-notes disclosure inside any card's EntryNotes, no
		 * entry-history disclosure -- exactly the notebook this page rendered
		 * before 0119, on a project with no column to mark either in.
		 */
		historyReady?: boolean;
		/**
		 * The signed-in caller's own id (0119). Threaded down to each card's
		 * EntryNotes, which is the only thing that reads it -- see
		 * NotebookEntryCard's own doc for why.
		 */
		viewerId?: string;
		createEntry?: (form: FormData) => Promise<CreateEntryResult>;
		addPhoto?: (form: FormData) => Promise<AddPhotoResult>;
		createNote?: (payload: NotePayload) => Promise<CreateEntryResult>;
		addNote?: (entryId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		editNote?: (noteId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		/** Folder writes (0088). Omitted when foldersReady is false. */
		folderTransports?: FolderTransports;
		/** The one pin write (0091). Omitted when pinsReady is false. */
		setPinned?: (entryId: string, pinned: boolean) => Promise<EntryActionResult>;
		/** A student removing their own entry (0116, notebook_delete_entry). */
		deleteEntry?: (entryId: string) => Promise<EntryActionResult>;
		/** A student removing one photo (0116, notebook_remove_photo). */
		removePhoto?: (photoId: string) => Promise<EntryActionResult>;
		/** A free-form entry's own title (0116, notebook_set_entry_label). */
		setEntryLabel?: (entryId: string, label: string | null) => Promise<EntryActionResult>;
		/**
		 * Putting a deleted entry back (0117, notebook_restore_entry). Feeds the
		 * "Recently deleted" list; omitted removes the control there and leaves
		 * the refusal-only rows for anything deleted by staff.
		 */
		restoreEntry?: (entryId: string) => Promise<EntryActionResult>;
		/**
		 * Putting a removed photo back (0117, notebook_restore_photo). Handed
		 * straight to each NotebookEntryCard's own removed-photos disclosure.
		 */
		restorePhoto?: (photoId: string) => Promise<EntryActionResult>;
		/**
		 * Turning a draft in (0118, notebook_submit_entry). Drives BOTH the
		 * composer's own "Turn in" button and every draft entry card's own
		 * control -- one implementation, so the two can never disagree about
		 * what turning an entry in does.
		 */
		submitEntry?: (entryId: string) => Promise<EntryActionResult>;
		/** Moving a turned-in entry back to a draft (0118, notebook_unsubmit_entry). */
		unsubmitEntry?: (entryId: string) => Promise<EntryActionResult>;
		/** The owner removing one note thread (0119, notebook_delete_note). */
		deleteNote?: (noteId: string) => Promise<EntryActionResult>;
		/** The owner putting a self-deleted note back (0119, notebook_restore_note). */
		restoreNote?: (noteId: string) => Promise<EntryActionResult>;
		/** Called after any successful save so the page can refresh its data. */
		onChanged?: () => void;
	} = $props();

	// ---- the two panes ------------------------------------------------------

	/**
	 * Which entry is open in the detail pane. An ID, never the row itself: the
	 * feed reloads after every save, so a captured object would leave the pane
	 * describing the state the entry had BEFORE the thing just saved to it (the
	 * trap ReferenceDoc shipped). `selectedEntryOf` resolves it against the
	 * current list on every read, and the effect below clears a selection whose
	 * entry has stopped existing.
	 */
	let selectedId = $state<string | null>(null);

	/**
	 * Whether the compose form is showing. Only meaningful above the breakpoint:
	 * below it the form is the page's own first block and has always been there,
	 * so `composerMounted` ignores this and the trigger that toggles it is not
	 * rendered.
	 */
	let composing = $state(true);

	// After hydration, so the first client render matches the server's.
	$effect(() => watchSplitWidth());
	const wide = $derived(splitIsWide());

	const selectedEntry = $derived(selectedEntryOf(entries, selectedId));

	$effect(() => {
		const kept = clampSelection(entries, selectedId);
		if (kept !== selectedId) selectedId = kept;
	});

	/**
	 * The composer exists whenever this surface can write at all: above the
	 * breakpoint while it is open, below it always. A read-only preview gets
	 * none -- and gets no trigger either, so the detail pane opens on the empty
	 * state, which is the whole of what that surface has to offer.
	 */
	const composerMounted = $derived(!readOnly && (!wide || composing));
	/** The open entry only ever takes a pane; below the breakpoint it expands in place. */
	const showEntry = $derived(wide && !!selectedEntry);
	const showEmpty = $derived(wide && !selectedEntry && !composerMounted);
	const detailHasContent = $derived(showEntry || composerMounted || showEmpty);

	/** The split's detail pane, for revealDetailPane. See $lib/shell/reveal.ts. */
	let detailEl = $state<HTMLElement | null>(null);

	function selectEntry(id: string) {
		// Deliberately NOT a discard: the composer stays mounted underneath, so
		// there is nothing to warn about and nothing to lose.
		selectedId = id;
		// The pane flows with the page (scroll="page"), so an entry opened from a
		// row far down the feed would otherwise render above where the click
		// happened and look like nothing happened at all. `tick` first: the pane
		// has to hold the entry before its position means anything.
		void tick().then(() => revealDetailPane(detailEl));
	}

	/**
	 * ONE guard for both ways staged work gets discarded: closing the composer,
	 * and navigating off the notebook.
	 */
	function confirmDiscard(): boolean {
		if (!composerMounted) return true;
		if (!notebookComposerHasWork({ staged, title, noteDraft })) return true;
		return window.confirm(`${NOTEBOOK_DISCARD_WARNING}\n\nDiscard it?`);
	}

	/**
	 * "Discard it?" has to MEAN it. The staged photos and the typed title live
	 * on this component, not inside the form's markup, so closing without
	 * clearing them would keep them alive behind an unmounted form and hand them
	 * straight back on the next open -- a second answer to a question already
	 * answered. `resetForm` runs while the stager is still mounted, so its own
	 * object URLs are released rather than leaked.
	 */
	function closeComposer() {
		if (!confirmDiscard()) return;
		resetForm();
		composing = false;
	}

	/**
	 * The navigation pane's only compose control. Bringing the form forward from
	 * behind an open entry is not a close, so it deselects rather than toggling.
	 */
	function toggleComposer() {
		if (composing && !selectedId) {
			closeComposer();
			return;
		}
		composing = true;
		selectedId = null;
	}

	/**
	 * Navigating away is the one discard path this component cannot see coming.
	 *
	 * Unlike the classroom's composer -- which is owned by a LAYOUT and so
	 * survives every move inside its class -- this one is owned by a page, so
	 * any navigation to a different route destroys it. The one exception is a
	 * move within the SAME route (a query-string change, which SvelteKit serves
	 * by re-running the load against the same component instance): the form
	 * survives that, so warning about it would be a lie, and a lie people learn
	 * to click through.
	 *
	 * `type: 'leave'` is the browser closing the tab or following an external
	 * link; cancelling it there is what raises the native unload dialog, which
	 * is the only warning a page is allowed to show at that point.
	 */
	beforeNavigate((nav) => {
		if (!composerMounted) return;
		if (!notebookComposerHasWork({ staged, title, noteDraft })) return;
		if (nav.type === 'leave') {
			nav.cancel();
			return;
		}
		if (nav.to?.route.id && nav.to.route.id === nav.from?.route.id) return;
		if (window.confirm(`${NOTEBOOK_DISCARD_WARNING}\n\nLeave anyway?`)) return;
		nav.cancel();
	});

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
	/**
	 * THE ENTRY THIS COMPOSER SESSION CREATED AS A DRAFT, if it has (0118).
	 *
	 * Set the instant `createEntry`/`createNote` SUCCEEDS and never before, so
	 * a second "Save draft" click in the same session can never call either of
	 * them again -- it only ever ADDS to the entry this id names. That is the
	 * whole guarantee: one retry, one entry, mirroring `saveTarget` in
	 * `$lib/classroom/composer-staging.ts`, which exists for the identical
	 * reason (a retry that recreates instead of updating is how one save
	 * becomes two items). Cleared by `resetForm()`, which only ever runs once
	 * everything currently staged has actually landed.
	 */
	let savedDraftId = $state<string | null>(null);

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
	/**
	 * ONE RULE, ON EVERY TIER: AN ENTRY NEEDS A PHOTO OR WRITING.
	 *
	 * What this replaced was an exclusive MODE picker -- "Photos" or "Write a
	 * note" -- offered on the free-form path only. Two things followed from
	 * that, and both were reported from a real classroom: a check-in showed a
	 * photo stager and nothing else, so answering one in writing was impossible;
	 * and on the free path the two halves could not be combined at all, so a
	 * photographed page could not carry a sentence about it.
	 *
	 * Both boxes are always offered now and either one satisfies the form, which
	 * is the same sentence the server enforces (0114). A mode toggle would be a
	 * second, narrower statement of it, and the narrower one is what students
	 * were stuck behind.
	 */
	const noteAllowed = $derived(notesReady && !readOnly && !!createNote && !!addNote);
	const hasNote = $derived(noteAllowed && tiptapHasText(noteDraft));
	const hasPhotos = $derived(staged.length > 0 && !stagerSettling && uploadReady);
	/**
	 * WHICH DOOR THIS SUBMISSION GOES THROUGH, derived from what is in the form
	 * rather than from a mode the student had to choose in advance. No photos
	 * and real text is a note entry (one call, entry and note in one
	 * transaction); anything with a photo creates the entry from that photo and
	 * the note rides along after it, exactly as a check-in note already did.
	 */
	const noteOnly = $derived(!hasPhotos && hasNote);
	const canSubmit = $derived(hasPhotos || hasNote);
	/**
	 * Turn in is available whenever there is fresh content to save, OR this
	 * session already has a draft entry sitting behind `savedDraftId` -- even
	 * with nothing new staged, there is still a real entry to turn in.
	 */
	const canTurnIn = $derived(canSubmit || !!savedDraftId);
	/**
	 * Save draft only ever asks "is there something NEW to save right now" --
	 * a second click with nothing added since the first is a no-op the button
	 * refuses rather than offers (`runSave` guards it too, this is only the
	 * visible half of the same rule).
	 */
	const canSaveDraft = $derived(draftsReady && canSubmit);

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

	/**
	 * WHICH CLASS THE PICKED CHECK-IN IS FOR, resolved the same way for both
	 * doors so a note and a photo filed against one check-in can never land in
	 * different classes.
	 *
	 * Since 0098 one check-in can run in several classes, so the section is
	 * taken from the PICK rather than looked up from the id -- a lookup would
	 * resolve a shared check-in to whichever posting sorted first, which may not
	 * be the class whose button was pressed. Falling back to the lookup covers a
	 * pick made before that field existed; null lets the server resolve it
	 * (_notebook_resolve_session_section), which is right when there is only one
	 * posting and refuses honestly when there is not.
	 */
	function sectionForPick(): string | null {
		return (
			selectedSectionId ?? sessions.find((s) => s.id === selectedSession)?.section_id ?? null
		);
	}

	/** Takes the PAIR, so pressing one of two postings of a shared check-in
	    files under the class whose button was pressed. */
	function chooseSession(id: string | null, sectionId: string | null = null) {
		sessionTouched = true;
		selectedSession = id;
		selectedSectionId = id ? sectionId : null;
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
			if (typeof pending.title === 'string') title = pending.title;
			if (pending.folder !== undefined) {
				folderTouched = true;
				folderChoice = pending.folder;
			}
		}
		recoveryNote =
			'Your photo did not make it back from the camera app, which can happen when the phone is low on memory. Everything you typed is still here. Please take the photo again.';
	});

	/**
	 * `keepNote` is for the one case where clearing would destroy something the
	 * student cannot get back: the entry and its photos saved but the note did
	 * not. A photo that fails to upload is still a file on their phone; a
	 * cleared note is gone. Keeping it means NOT bumping `noteKey` either --
	 * the editor is left mounted with exactly what they typed, rather than
	 * remounted and re-seeded, which is also why nothing has to round-trip
	 * through `NoteEditor`'s `value`.
	 */
	function resetForm(keepNote = false) {
		staged = [];
		stager?.reset();
		title = '';
		if (!keepNote) {
			noteDraft = null;
			noteKey += 1;
		}
		recoveryNote = null;
		// Deliberately NOT the folder: the next entry almost always belongs
		// where the last one went, and the suggestion effect re-derives it from
		// what was just saved.
		folderTouched = false;
		// The draft this session was continuing is done -- fully saved, or
		// turned in. The NEXT save, if any, is a genuinely new entry.
		savedDraftId = null;
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

	/**
	 * A note-only DRAFT save that has landed still leaves a real note behind on
	 * the entry, so a second click of "Save draft" with nothing new typed has
	 * nothing to add -- it must not re-send the same words as a second
	 * revision. Clearing `noteDraft` the instant a save carries it is what
	 * keeps that true for every path below, draft and turn-in alike.
	 */

	/**
	 * Fresh create, note-only door (no photo, real text): notebook_create_note_entry.
	 * Runs ONLY when `savedDraftId` is null -- see `runSave`.
	 */
	async function createFromNote(submitted: boolean) {
		progress = 'Saving...';
		// SINCE 0114 IT CARRIES THE CHECK-IN when one is picked, which is the
		// whole point of that pass -- a check-in answered in writing is a note
		// entry filed against that check-in, not a refusal. The section comes
		// from the PICK for the reason the photo path takes it from there too: a
		// shared check-in has one id and several postings.
		const saved = await createNote!({
			content: noteDraft as TiptapNode,
			custom_label: title.trim() || null,
			folder_id: folderChoice,
			session_id: selectedSession,
			section_id: selectedSession ? sectionForPick() : null,
			submitted
		});
		if (!saved.ok) {
			errorMsg = saved.error;
			return;
		}
		if (submitted) {
			successMsg = selectedSession ? 'Check-in saved.' : 'Note saved.';
			resetForm();
		} else {
			// Remembered AT ONCE: the create succeeded, so nothing after this
			// point may ever call createNote again in this composer session --
			// only add to the entry this id names (the saveTarget guarantee).
			savedDraftId = saved.entryId;
			successMsg = 'Draft saved. Turn it in from its card whenever you are ready.';
			noteDraft = null;
			noteKey += 1;
		}
		onChanged?.();
	}

	/**
	 * Fresh create, photo door: photo 1 creates the entry, the note (if any)
	 * and the rest of the staged photos follow. Runs ONLY when `savedDraftId`
	 * is null -- see `runSave`.
	 *
	 * TURN-IN KEEPS THE EXACT PRE-DRAFT BEHAVIOUR: whatever happens to the
	 * note or the later photos, the form always resets and any recovery is
	 * from the entry's own card, never a composer retry. A DRAFT SAVE DOES
	 * NOT: it remembers the entry and clears only what actually landed, so a
	 * retry click can finish the rest without ever calling createEntry again.
	 */
	async function createFromPhoto(submitted: boolean) {
		// Photo 1 creates the entry. A blank title is sent as nothing at all:
		// 0071 made it optional and the upload route falls back to the file's
		// own name, so the UI must not re-impose a required-title rule.
		progress = staged.length > 1 ? `Uploading photo 1 of ${staged.length}...` : 'Uploading...';
		const first = new FormData();
		first.set('photo', await prepared(staged[0].file));
		if (selectedSession) {
			first.set('session_id', selectedSession);
			const sectionId = sectionForPick();
			if (sectionId) first.set('section_id', sectionId);
		}
		const trimmed = title.trim();
		if (!selectedSession && trimmed) first.set('custom_label', trimmed);
		if (folderChoice) first.set('folder_id', folderChoice);
		// Omitted when true (the default): a project without 0118 applied still
		// has the old notebook_create_entry signature, and naming p_submitted
		// unconditionally would leave PostgREST unable to resolve it -- the
		// same rule p_folder_id already follows.
		if (!submitted) first.set('submitted', 'false');

		const created = await createEntry!(first);
		if (!created.ok) {
			errorMsg = created.error;
			return;
		}
		// Remembered AT ONCE, whichever button was pressed: from this line on,
		// nothing in this composer session may call createEntry again.
		savedDraftId = created.entryId;

		// The entry's optional note, written in the same action -- on ANY tier
		// since the mode picker went, so a photographed page can carry a
		// sentence about it. It goes FIRST, immediately after the entry exists:
		// it is one cheap call against several slow uploads, so sending it now
		// is what keeps the student's own words from being the thing lost to a
		// dropped connection halfway through the photos.
		let noteFailed = false;
		if (hasNote) {
			progress = 'Saving your note...';
			const savedNote = await addNote!(created.entryId, noteDraft as TiptapNode);
			noteFailed = !savedNote.ok;
		}

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
			successMsg = submitted
				? staged.length === 1
					? 'Entry saved.'
					: `Entry saved with ${photoCountLabel(staged.length)}.`
				: staged.length === 1
					? 'Draft saved.'
					: `Draft saved with ${photoCountLabel(staged.length)}.`;
			if (failedEnhanced.length) {
				successMsg += ` The corrected version of ${photoList(
					failedEnhanced
				)} did not upload; the original is saved.`;
			}
		}
		if (noteFailed) {
			errorMsg =
				(errorMsg ? errorMsg + ' ' : '') +
				'Your note did not save, so it is still in the box below. Add it to the entry from its own card.';
		}

		if (submitted) {
			// Exactly the pre-0118 shape: reset regardless of a partial photo
			// failure, recoverable from the card, never from here.
			resetForm(noteFailed);
		} else {
			// A DRAFT: keep `savedDraftId` (it was set above) and clear only
			// what actually landed, so a retry click can finish the rest --
			// through `continueSaved` below -- without ever recreating the entry.
			if (!failed.length) {
				staged = [];
				stager?.reset();
			}
			if (!noteFailed) {
				noteDraft = null;
				noteKey += 1;
			}
		}
		onChanged?.();
	}

	/**
	 * A RETRY, or a deliberate follow-up: `savedDraftId` already names a real
	 * entry from an earlier save in this composer session, so this NEVER calls
	 * createEntry or createNote -- it only adds whatever is staged now, and
	 * turns the entry in when asked. This is the whole guarantee behind
	 * "saving a draft twice must not create two entries".
	 */
	async function continueSaved(submitted: boolean) {
		const entryId = savedDraftId as string;
		let noteFailed = false;
		if (hasNote) {
			progress = 'Saving your note...';
			const savedNote = await addNote!(entryId, noteDraft as TiptapNode);
			noteFailed = !savedNote.ok;
		}
		const failed: number[] = [];
		const failedEnhanced: number[] = [];
		for (let i = 0; i < staged.length; i++) {
			const result = await uploadPair(entryId, staged[i], i + 1, staged.length, (m) => (progress = m));
			if (!result.originalOk) failed.push(i + 1);
			else if (!result.enhancedOk) failedEnhanced.push(i + 1);
		}

		if (submitted) {
			if (!submitEntry) {
				errorMsg = 'Turning in an entry is not available here.';
				return;
			}
			const res = await submitEntry(entryId);
			if (!res.ok) {
				errorMsg = res.error;
				return;
			}
		}

		if (failed.length) {
			errorMsg = `${photoList(failed)} did not upload. Try again.`;
			return;
		}
		if (noteFailed) {
			errorMsg = 'Your note did not save, so it is still in the box above. Try again.';
			return;
		}
		successMsg = submitted ? 'Entry turned in.' : 'Draft updated.';
		if (failedEnhanced.length) {
			successMsg += ` The corrected version of ${photoList(
				failedEnhanced
			)} did not upload; the original is saved.`;
		}
		resetForm();
		onChanged?.();
	}

	/**
	 * Both composer buttons, TURN IN when `submitted` is true and SAVE DRAFT
	 * when it is false. `savedDraftId` decides the rest: null means create,
	 * anything else means this session already made an entry and every save
	 * from here on only ever adds to it -- `continueSaved` is the one and only
	 * place that can be true, and it is never reachable from a fresh composer.
	 */
	async function runSave(submitted: boolean) {
		if (readOnly || busy) return;
		const continuing = !!savedDraftId;
		if (!continuing && !canSubmit) return;
		if (!continuing && (noteOnly ? !createNote : !createEntry)) return;
		// A continuing draft with nothing new staged and no request to turn it
		// in is a click with nothing to do.
		if (continuing && !hasNote && staged.length === 0 && !submitted) return;

		busy = true;
		errorMsg = null;
		successMsg = null;
		progress = 'Saving...';
		try {
			if (continuing) await continueSaved(submitted);
			else if (noteOnly) await createFromNote(submitted);
			else await createFromPhoto(submitted);
		} catch (err) {
			errorMsg = (err as Error).message || 'The save failed to send.';
		} finally {
			busy = false;
			progress = '';
		}
	}

	async function onTurnInSubmit(e: SubmitEvent) {
		e.preventDefault();
		await runSave(true);
	}

	async function onSaveDraftClick() {
		await runSave(false);
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

	/**
	 * The three 0116 writes, following the same shape: refuse read-only or a
	 * missing transport, call it, reload on success. `clampSelection` (which
	 * the effect above already runs on every `entries` change) is what closes
	 * the detail pane on its own once a deleted entry drops out of the reload
	 * -- nothing here has to clear `selectedId` by hand.
	 */
	async function deleteOne(entryId: string): Promise<EntryActionResult> {
		if (readOnly || !deleteEntry) return { ok: false, error: 'Deleting is not available.' };
		const result = await deleteEntry(entryId);
		if (result.ok) onChanged?.();
		return result;
	}

	async function removePhotoOne(photoId: string): Promise<EntryActionResult> {
		if (readOnly || !removePhoto) return { ok: false, error: 'Removing photos is not available.' };
		const result = await removePhoto(photoId);
		if (result.ok) onChanged?.();
		return result;
	}

	async function retitleOne(entryId: string, label: string | null): Promise<EntryActionResult> {
		if (readOnly || !setEntryLabel) return { ok: false, error: 'Renaming is not available.' };
		const result = await setEntryLabel(entryId, label);
		if (result.ok) onChanged?.();
		return result;
	}

	/** A single removed photo, wired through to each card's own disclosure. */
	async function restorePhotoOne(photoId: string): Promise<EntryActionResult> {
		if (readOnly || !restorePhoto) return { ok: false, error: 'Restoring photos is not available.' };
		const result = await restorePhoto(photoId);
		if (result.ok) onChanged?.();
		return result;
	}

	/**
	 * The two draft-state writes (0118), on the SAME shape and reused by BOTH
	 * a card's own control AND the composer -- the composer's own retry logic
	 * calls `submitEntry`/`unsubmitEntry` directly, since it already tracks
	 * whether a call landed; a card has none of that state, so it goes through
	 * the reload-on-success wrapper every other card write already uses.
	 */
	async function submitOne(entryId: string): Promise<EntryActionResult> {
		if (readOnly || !submitEntry) return { ok: false, error: 'Turning in an entry is not available.' };
		const result = await submitEntry(entryId);
		if (result.ok) onChanged?.();
		return result;
	}

	async function unsubmitOne(entryId: string): Promise<EntryActionResult> {
		if (readOnly || !unsubmitEntry)
			return { ok: false, error: 'Moving an entry back to drafts is not available.' };
		const result = await unsubmitEntry(entryId);
		if (result.ok) onChanged?.();
		return result;
	}

	/**
	 * The two 0119 note writes, on the same reload-on-success shape as every
	 * other card write above. Threaded through each card's own EntryNotes.
	 */
	async function deleteNoteOne(noteId: string): Promise<EntryActionResult> {
		if (readOnly || !deleteNote) return { ok: false, error: 'Deleting notes is not available.' };
		const result = await deleteNote(noteId);
		if (result.ok) onChanged?.();
		return result;
	}

	async function restoreNoteOne(noteId: string): Promise<EntryActionResult> {
		if (readOnly || !restoreNote)
			return { ok: false, error: 'Restoring notes is not available.' };
		const result = await restoreNote(noteId);
		if (result.ok) onChanged?.();
		return result;
	}

	// ---- "Recently deleted" (0117) ------------------------------------------

	/** The rail toggle: the nav pane's deleted-list view instead of the normal feed. */
	let showingDeleted = $state(false);
	let restoringId = $state<string | null>(null);
	let restoreError = $state<string | null>(null);

	async function restoreOne(entryId: string) {
		if (readOnly || !restoreEntry || restoringId) return;
		restoringId = entryId;
		restoreError = null;
		const result = await restoreEntry(entryId);
		restoringId = null;
		if (!result.ok) {
			restoreError = result.error;
			return;
		}
		successMsg = 'Entry restored.';
		onChanged?.();
	}

	function deletedWhen(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
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
{#if masthead}
	<NotebookMasthead backHref={homeHref} backLabel="Home" />
{/if}

{#snippet navPane()}
	<!--
		THE NAVIGATION PANE: the folder rail, the filters and the list. Above the
		breakpoint it is bounded by the pane's own frame, so it drops the card
		chrome it wears at phone width (see .nb-pane-card below) -- a card inside
		a frame is two boxes saying the same thing.
	-->
	<section class="card nb-pane-card" data-testid="nb-entries">
		<div class="pane-head">
			<h2>My entries</h2>
			{#if !readOnly && wide}
				<!--
					THE PANE KEEPS ONLY THE TRIGGER. The form itself is far too wide for
					26rem and takes the detail pane; this is the one control that opens
					it. Below the breakpoint there is nothing to trigger -- the form is
					the first block on the page, as it has always been -- so it is not
					rendered there at all.
				-->
				<button
					type="button"
					class="btn secondary compose-trigger"
					data-testid="nb-compose-trigger"
					aria-pressed={composerMounted && !showEntry}
					onclick={toggleComposer}
				>
					New entry
				</button>
			{/if}
		</div>

		{#if entries.length === 0 && !showingDeleted}
			<p class="note empty-state">
				{#if readOnly}
					Nothing in this notebook yet.
				{:else}
					No entries yet. Photograph a page or write a note and it will show up here.
				{/if}
				{#if deletionReady && deletedEntries.length > 0}
					<button
						type="button"
						class="inline-link deleted-link"
						data-testid="filter-deleted-empty"
						onclick={() => (showingDeleted = true)}
					>
						{DELETED_FILTER.label} ({deletedEntries.length})
					</button>
				{/if}
			</p>
		{:else}
			<!--
				A STUDENT WHOSE ONLY WORK IS A DRAFT still has entries (0118: "it is
				in this feed and nowhere else"), so the branch above never fires for
				them -- and without this, nothing here would say so either, which
				would read as "no work at all" the moment the feed itself is scanned
				rather than read entry by entry. Says it once, plainly, above the
				feed; each entry's own Draft chip is what makes it unmistakable card
				by card.
			-->
			{#if draftsReady && !showingDeleted && entries.length > 0 && entries.every((e) => e.submitted_at === null)}
				<p class="note empty-state" data-testid="nb-all-drafts-note">
					{readOnly
						? 'Everything in this notebook is still a draft -- nothing has been turned in yet.'
						: "Everything below is a draft. Add to it, then turn it in when you're ready."}
				</p>
			{/if}
			{#if !showingDeleted && foldersReady && managerOpen && folderTransports}
				<FolderManager
					{folders}
					counts={counts as Map<string, number>}
					busy={folderBusy}
					onSave={saveFolder}
					onDelete={deleteFolder}
					onClose={() => (managerOpen = false)}
				/>
			{/if}

			{#if !showingDeleted && foldersReady}
				<FolderRail
					{folders}
					{counts}
					{selection}
					onSelect={(next) => (selection = next)}
					onManage={folderTransports ? () => (managerOpen = !managerOpen) : undefined}
				/>
			{/if}

			<div class="toolbar">
				{#if !showingDeleted}
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
				{/if}

				<!--
					THE DELETED CHIP LIVES IN THE SAME .chips GROUP AS THE FOUR
					AND-COMPOSABLE FILTERS ABOVE IT, but it is not one of them: it
					is not unioned into EntryFilterId (see notebook-folders.ts), so
					toggling it swaps the whole pane to a separately-loaded list
					rather than narrowing `entries`, which never contains a
					deleted row to narrow to begin with.
				-->
				<div class="chips" role="group" aria-label="Filters">
					{#if !showingDeleted}
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
					{/if}
					{#if deletionReady}
						<button
							type="button"
							class="chip-toggle deleted-toggle"
							class:on={showingDeleted}
							aria-pressed={showingDeleted}
							title={DELETED_FILTER.hint}
							data-testid="filter-deleted"
							onclick={() => (showingDeleted = !showingDeleted)}
						>
							{DELETED_FILTER.label}{#if deletedEntries.length} ({deletedEntries.length}){/if}
						</button>
					{/if}
					<!--
						DRAFTS, following the Recently deleted toggle it sits beside. Unlike
						that one this IS an ordinary EntryFilterId (a draft never leaves
						`entries`), so it stays out of the ENTRY_FILTERS loop above only
						because it alone needs draftsReady to gate it.
					-->
					{#if !showingDeleted && draftsReady}
						<button
							type="button"
							class="chip-toggle"
							class:on={filters.includes(DRAFT_FILTER.id)}
							aria-pressed={filters.includes(DRAFT_FILTER.id)}
							title={DRAFT_FILTER.hint}
							data-testid="filter-drafts"
							onclick={() => toggleFilter(DRAFT_FILTER.id)}
						>
							{DRAFT_FILTER.label}
						</button>
					{/if}
				</div>

				{#if !showingDeleted}
				<div class="tools">
					{#if pinsReady}
						<label class="sort">
							<!-- Visible, where it was screen-reader-only: the
							     select's own text ("Newest first") describes an
							     ORDER without saying that changing it is what this
							     control is for. -->
							<span class="sort-label">Sort</span>
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
					<!-- Nothing to expand above the breakpoint: the rows there open
					     into the pane beside them rather than in place. -->
					{#if !wide}
						<button
							type="button"
							class="inline-link"
							data-testid="expand-toggle"
							onclick={() => (expanded.size ? collapseAll() : expandAll())}
						>
							{expanded.size ? 'Collapse all' : 'Expand all'}
						</button>
					{/if}
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
				{/if}
			</div>

			{#if showingDeleted}
				<!--
					THE DELETED VIEW: the caller's own removed entries (0117), from
					`deletedEntries` -- a SEPARATE list that was never part of `entries`
					and is never rendered through the normal NotebookEntryCard/groups
					pipeline below. Every row carries a Restore control OR, when staff
					removed it, an inline refusal -- never both, and never the folder,
					pin, copy or delete controls a live entry offers.
				-->
				<div class="deleted-view" data-testid="deleted-list">
					{#if deletedEntries.length === 0}
						<p class="note empty-state" data-testid="deleted-empty">
							Nothing here. Deleted entries stay for a while after you remove them.
						</p>
					{:else}
						<ol class="entries deleted-entries">
							{#each deletedEntries as entry (entry.id)}
								<li class="deleted-row" data-testid="deleted-entry">
									<div class="deleted-main">
										<span class="deleted-title">{deletedEntryTitle(entry)}</span>
										<span class="deleted-meta">Deleted {deletedWhen(entry.deleted_at)}</span>
									</div>
									{#if entry.restorable && restoreEntry}
										<button
											type="button"
											class="btn secondary restore-btn"
											disabled={restoringId === entry.id}
											data-testid="restore-entry"
											onclick={() => restoreOne(entry.id)}
										>
											{restoringId === entry.id ? 'Restoring...' : 'Restore'}
										</button>
									{:else}
										<p class="deleted-refusal">
											Your instructor removed this entry. Ask them to restore it for you.
										</p>
									{/if}
								</li>
							{/each}
						</ol>
					{/if}
					{#if restoreError}
						<p class="feedback error" role="alert">{restoreError}</p>
					{/if}
				</div>
			{:else}

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
									<!--
										THE VARIANT IS THE ONE THING THE VIEWPORT DECIDES IN JS
										(see $lib/shell/split.svelte.ts). Above the breakpoint a
										row is a compact list item that selects into the pane
										beside it; below it, it is the full card that expands in
										place, exactly as it always has.
									-->
									<NotebookEntryCard
										{entry}
										{folders}
										variant={wide ? 'row' : 'full'}
										current={selectedId === entry.id}
										onOpen={() => selectEntry(entry.id)}
										collapsed={!expanded.has(entry.id)}
										onToggle={() => toggleEntry(entry.id)}
										{selectMode}
										selected={picked.has(entry.id)}
										onSelectChange={(on) => togglePick(entry.id, on)}
										{uploadReady}
										{notesReady}
										{foldersReady}
										{pinsReady}
										{historyReady}
										{viewerId}
										onAddPhotos={addPhoto ? addPhotosToEntry : undefined}
										onAddNote={addNote ? saveNoteToEntry : undefined}
										onEditNote={editNote ? saveNoteEdit : undefined}
										onMove={folderTransports ? moveOne : undefined}
										onPin={setPinned ? pinEntry : undefined}
										onDelete={deleteEntry ? deleteOne : undefined}
										onRemovePhoto={removePhoto ? removePhotoOne : undefined}
										onRetitle={setEntryLabel ? retitleOne : undefined}
										onRestorePhoto={restorePhoto ? restorePhotoOne : undefined}
										onSubmit={submitEntry ? submitOne : undefined}
										onUnsubmit={unsubmitEntry ? unsubmitOne : undefined}
										onDeleteNote={deleteNote ? deleteNoteOne : undefined}
										onRestoreNote={restoreNote ? restoreNoteOne : undefined}
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
		{/if}
	</section>
{/snippet}

{#snippet detailPane()}
	{#if composerMounted}
		<!--
			`class:behind` rather than `{#if}`: opening an entry HIDES this form, it
			does not destroy it. Staged photos are File handles that exist nowhere
			but in this browser's memory, so an {#if} here would throw them away on
			a click, and the entry you clicked would be the last thing you saw
			before losing them.
		-->
		<section class="card compose-card" class:behind={showEntry} data-testid="nb-compose">
			<div class="pane-head">
				<h2>Add an entry</h2>
				{#if wide}
					<button
						type="button"
						class="btn secondary compose-close"
						data-testid="nb-compose-close"
						onclick={closeComposer}
					>
						Close
					</button>
				{/if}
			</div>

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

			<form onsubmit={onTurnInSubmit}>
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
									<span class="pick-meta">
										{sessionMeta(s)}
										<!-- A draft against this check-in is why it is still here
										     rather than filed -- say so, so picking it again reads
										     as "keep going" and not "start over". -->
										{#if draftsReady && sessionHasDraft(s, entries)}
											· <span data-testid="pick-draft">Draft in progress</span>
										{/if}
									</span>
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
							Leave this blank and we will name the entry from your photo's filename, or from
							the note's opening words.
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

				<!--
					BOTH HALVES, ALWAYS, on both tiers. Either one on its own saves the
					entry; the pair saves a photographed page with something written
					about it. Nothing here is a mode, so nothing has to be chosen
					before the student knows what they have.
				-->
				<PhotoStager
					bind:this={stager}
					bind:staged
					bind:settling={stagerSettling}
					disabled={busy}
					{uploadReady}
					captureContext={{
						session: selectedSession,
						section: selectedSectionId,
						title,
						folder: folderChoice
					}}
				/>

				<!--
					ONE editor, in one block on purpose. Rendering a second instance
					inside a branch would put it at a different position in the DOM, so
					moving between a check-in and a free entry would remount Tiptap and
					silently drop whatever the student had typed. Here the position and
					the `{#key}` never change, so the draft survives every move the form
					allows.
				-->
				{#if noteAllowed}
					<div class="field note-field">
						<span class="photo-label">Write about it</span>
						{#key noteKey}
							<NoteEditor onchange={(doc) => (noteDraft = doc)} disabled={busy} />
						{/key}
						<span class="hint">
							Write as much as you like. On its own this saves as the whole entry; alongside a
							photo it is saved with it. You can add photos to an entry later, and come back and
							edit your own writing whenever you want.
						</span>
					</div>
				{/if}

				<div class="actions">
					<button class="btn" type="submit" data-testid="nb-turn-in" disabled={busy || !canTurnIn}>
						{busy ? 'Saving...' : 'Turn in'}
					</button>
					<!--
						SAVE DRAFT IS BUTTON-TYPE, so pressing Enter in the form always
						turns the entry in (the primary action) and never quietly saves a
						draft instead.
					-->
					{#if draftsReady}
						<button
							type="button"
							class="btn secondary"
							data-testid="nb-save-draft"
							disabled={busy || !canSaveDraft}
							onclick={onSaveDraftClick}
						>
							{busy ? 'Saving...' : 'Save draft'}
						</button>
					{/if}
					{#if progress}<span class="progress">{progress}</span>{/if}
				</div>
				<!-- SAYS WHICH HALF IS MISSING, and never names photos alone: the
				     student is being stopped by a rule with two ways to satisfy it,
				     so both have to be on screen at the moment they are stopped. -->
				{#if !canSubmit && !savedDraftId && !busy}
					<p class="note submit-hint" data-testid="nb-submit-hint">
						{#if !noteAllowed}
							Add a photo to save this entry.
						{:else if !uploadReady}
							Photo uploads are unavailable on this deployment, so write something instead to
							save this entry.
						{:else}
							Add a photo or write something to save this entry. Either one is enough.
						{/if}
					</p>
				{/if}
				{#if savedDraftId && !canSubmit && !busy}
					<p class="note submit-hint" data-testid="nb-draft-pending">
						This draft is saved. Turn it in when you are ready, or add more first.
					</p>
				{/if}
			</form>
		</section>
	{/if}

	{#if showEntry && selectedEntry}
		<!--
			KEYED ON THE ENTRY, so moving from one to the next is a fresh card
			rather than the previous one's card handed a new row: everything the
			card owns itself -- an open add-photos panel, a staged photo in it, a
			half-typed note -- belongs to the entry it was opened on and must not
			follow the selection to the next one.
		-->
		{#key selectedEntry.id}
			<div class="open-entry" data-testid="nb-open-entry" data-entry-id={selectedEntry.id}>
				<NotebookEntryCard
					entry={selectedEntry}
					{folders}
					variant="full"
					collapsed={false}
					onToggle={() => (selectedId = null)}
					{uploadReady}
					{notesReady}
					{foldersReady}
					{pinsReady}
					{historyReady}
					{viewerId}
					onAddPhotos={addPhoto ? addPhotosToEntry : undefined}
					onAddNote={addNote ? saveNoteToEntry : undefined}
					onEditNote={editNote ? saveNoteEdit : undefined}
					onMove={folderTransports ? moveOne : undefined}
					onPin={setPinned ? pinEntry : undefined}
					onDelete={deleteEntry ? deleteOne : undefined}
					onRemovePhoto={removePhoto ? removePhotoOne : undefined}
					onRetitle={setEntryLabel ? retitleOne : undefined}
					onRestorePhoto={restorePhoto ? restorePhotoOne : undefined}
					onSubmit={submitEntry ? submitOne : undefined}
					onUnsubmit={unsubmitEntry ? unsubmitOne : undefined}
					onDeleteNote={deleteNote ? deleteNoteOne : undefined}
					onRestoreNote={restoreNote ? restoreNoteOne : undefined}
				/>
			</div>
		{/key}
	{/if}

	{#if showEmpty}
		<p class="detail-empty" data-testid="nb-detail-empty">
			{#if readOnly}
				Pick an entry on the left to read it.
			{:else}
				Pick an entry on the left to read it, or start a new one.
			{/if}
		</p>
	{/if}
{/snippet}

<main class="nb-shell">
	<section class="hero nb-block">
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

	<!--
		ONE NOTICE, ABOVE BOTH PANES. These are set from four different places --
		a save from the form, photos or a note added to an open entry, a bulk
		move from the list -- and each of those now happens in a different pane,
		so a message rendered inside any one of them would be invisible from the
		others. Above the split it is visible from either.
	-->
	{#if errorMsg || successMsg}
		<div class="nb-block notice-strip">
			{#if errorMsg}
				<p class="feedback error" role="alert">{errorMsg}</p>
			{/if}
			{#if successMsg}
				<p class="feedback ok" role="status">{successMsg}</p>
			{/if}
		</div>
	{/if}

	{#if !configured}
		<section class="card nb-block">
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
			<section class="card nb-block">
				<p class="feedback error" data-testid="nb-photos-unavailable">
					Photos could not be loaded on this project, so entries are showing without
					them. Everything else works as normal.
				</p>
			</section>
		{/if}
		{#if !sessionsReady}
			<section class="card nb-block">
				<p class="feedback error" data-testid="nb-sessions-unavailable">
					Scheduled check-ins could not be loaded, so entries filed against one show
					their own title instead and there are no check-ins to pick from. Everything
					else works as normal.
				</p>
			</section>
		{/if}

		<!--
			`narrow="stack"`: below 1024px both panes render in one column with the
			detail (the compose form) on top, which is what a phone's notebook has
			always looked like. The classroom swaps instead, because there a detail
			IS the page.

			`scroll="page"`: ONE scrollbar. The masthead, hero and version badge
			around this split put ~355px above it and ~100px below, so
			viewport-height panes -- correct in the classroom, where the chrome is
			a breadcrumb and a tab bar -- left the document scrolling as well, and
			a bar inside a bar is what a classroom reported. The document owns it
			here and the compose pane sticks beside the feed. It is also the only
			answer that survives /classroom/view-as, which mounts this whole
			component under the classroom's own shell and impersonation banner.
		-->
		<ClassSplit
			narrow="stack"
			scroll="page"
			bind:detailEl
			hasDetail={detailHasContent}
			nav={navPane}
		>
			{@render detailPane()}
		</ClassSplit>
	{/if}

	<div class="nb-block">
		<VersionBadge app="portal" />
	</div>
</main>
</div>

<style>
	/* --- the shell ----------------------------------------------------------
	   ONE <main>, wrapping both panes, at every width. The classroom puts a
	   landmark on whichever pane is the content because its two panes come from
	   different route components; here one component owns both, so there is one
	   landmark and it can never be the hidden one.

	   EVERY BLOCK OUTSIDE THE SPLIT reads the split's own measure and the
	   module's one gutter, so the hero, the notice strip and both panes start
	   and end on exactly the same line. */
	/* app.css caps every <main> at 880px and gives it its own side padding.
	   Both are the single-column shell's, and this one spans the split. */
	.nb-shell {
		max-width: none;
		padding: var(--space-7) 0 4.5rem;
	}
	.nb-block {
		max-width: var(--measure-split);
		margin: 0 auto;
		padding: 0 var(--cr-gutter);
		box-sizing: border-box;
	}
	.notice-strip {
		margin-bottom: var(--space-4);
	}
	.notice-strip .feedback {
		margin-bottom: var(--space-2);
	}
	/* The blocks outside the split keep the old card rhythm. */
	.nb-block.card,
	.nb-pane-card,
	.compose-card {
		margin-bottom: var(--space-5);
	}
	.nb-shell h2 {
		margin-top: 0;
	}
	.pane-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-bottom: var(--space-4);
	}
	.pane-head h2 {
		margin: 0;
	}
	.compose-trigger,
	.compose-close {
		flex: none;
	}
	/* Hidden, not unmounted -- see the markup. */
	.compose-card.behind {
		display: none;
	}
	.open-entry {
		padding-bottom: var(--space-5);
	}
	.detail-empty {
		margin: 0;
		padding: var(--space-7) var(--space-1);
		color: var(--text-3);
		font-size: 0.92rem;
	}

	/* A pane's own narrow-width gutter is declared once for the ROOM, in
	   notebook-theme.css, so both notebook screens get it from one place. */

	@media (min-width: 1024px) {
		/* The pane IS the frame above the breakpoint (split.css draws it), so the
		   list drops the card chrome it wears at phone width rather than sitting
		   as a second box inside the first. */
		.nb-pane-card {
			border: none;
			background: none;
			box-shadow: none;
			padding: 0;
			margin-bottom: 0;
		}
		/* A FORM IS NOT PROSE, and it is not a photograph either. The detail pane
		   reaches ~920px at 1440, where a single-line text input stops being
		   scannable -- the same cap the classroom's composer takes. The open
		   ENTRY keeps the whole pane, because a notebook page wants every pixel. */
		.compose-card {
			max-width: var(--measure-form);
		}
	}
	.lead strong {
		color: var(--text-1);
		font-weight: 600;
	}
	.hero-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
	.chip {
		font-size: 0.74rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		color: var(--text-2);
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
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.empty-state {
		padding: var(--space-2) 0;
	}
	.feedback {
		font-size: 0.84rem;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		margin-bottom: var(--space-4);
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
		margin: 0 0 var(--space-4);
	}
	.picker legend {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-3);
		padding: 0;
		margin-bottom: var(--space-2);
	}
	.quick-picks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: var(--space-2);
	}
	.pick {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text-1);
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
		color: var(--text-3);
	}
	.pick.free .pick-label {
		color: var(--nb-accent-ink);
	}
	.no-sessions {
		margin: 0;
	}
	.submit-hint {
		margin: var(--space-2) 0 0;
		color: var(--text-3);
		font-size: 0.85rem;
	}
	.label-field .optional {
		color: var(--text-3);
		font-weight: 400;
	}
	.hint {
		display: block;
		color: var(--text-3);
		font-size: 0.8rem;
		margin-top: var(--space-1);
	}
	/* The shared .field class is a ROW flex; these stack. */
	.note-field,
	.folder-field {
		margin-top: var(--space-4);
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
		margin-bottom: var(--space-1);
		font-weight: 600;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-4);
		flex-wrap: wrap;
	}
	/* The shared .btn class pads to ~39px, under the 44px touch target these two
	   need: turning an entry in and saving a draft are the two actions this
	   whole form exists for. Scoped here rather than raised on .btn itself,
	   which is used everywhere in the app at its existing size. */
	.actions .btn {
		min-height: 2.75rem;
	}
	.progress {
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
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
		color: var(--text-1);
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
		gap: var(--space-2);
		padding-bottom: var(--space-4);
		margin-bottom: var(--space-2);
		border-bottom: 1px solid var(--hairline);
	}
	.search {
		flex: 1 1 14rem;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		background: var(--surface-1);
		color: var(--text-3);
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
		color: var(--text-1);
	}
	.search input:focus {
		outline: none;
	}
	.chips {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}
	.chip-toggle {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		background: var(--surface-1);
		color: var(--text-2);
		font: inherit;
		font-size: 0.76rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.chip-toggle:hover {
		border-color: var(--text-3);
	}
	.chip-toggle.on {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
		color: var(--nb-accent-ink);
		font-weight: 600;
	}
	/* Taller than an ordinary filter chip on purpose: it is the one control in
	   this row that switches the whole pane to a different list, and it needs a
	   real touch target for that. */
	.deleted-toggle {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
	}
	.deleted-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		margin-top: var(--space-1);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: 0.78rem;
		margin-left: auto;
	}
	.result-count {
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	/* Quiet: the sort is a way of looking at the feed, not a heading over it. */
	.sort {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.sort-label {
		color: var(--text-3);
		white-space: nowrap;
	}
	.sort select {
		font-size: 0.78rem;
		padding: var(--space-1) var(--space-2);
		border-color: var(--hairline);
		background: var(--surface-1);
		color: var(--text-2);
	}

	/* ---- bulk selection ---- */
	.bulk {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		margin: var(--space-2) 0 var(--space-1);
		border: 1px solid var(--nb-accent);
		background: var(--nb-accent-wash);
		border-radius: var(--radius-control);
		font-size: 0.82rem;
	}
	.bulk-count {
		font-weight: 600;
		color: var(--text-1);
	}
	.bulk-move select {
		font: inherit;
		font-size: 0.8rem;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		background: var(--surface-1);
	}
	:global(.nb-root .btn.small) {
		padding: var(--space-1) var(--space-3);
		font-size: 0.78rem;
	}

	/* ---- the feed ---- */
	.group {
		margin-top: var(--space-5);
	}
	.group-head {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-3);
		margin: 0 0 var(--space-2);
	}
	.entries {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-1);
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
		margin-top: var(--space-5);
		display: flex;
		justify-content: center;
	}

	/* ---- "Recently deleted" (0117) ------------------------------------------
	   A deliberately plain list: no thumbnail, no folder chip, no expand -- a
	   deleted row shows only what is needed to tell entries apart and to act on
	   one, never the full-card controls a live entry offers. */
	.deleted-view {
		margin-top: var(--space-2);
	}
	.deleted-entries {
		gap: var(--space-2);
	}
	.deleted-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-1);
	}
	.deleted-main {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.deleted-title {
		font-weight: 600;
		font-size: 0.94rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.deleted-meta {
		font-size: 0.74rem;
		color: var(--text-3);
	}
	.deleted-refusal {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2);
		max-width: 18rem;
	}
	.restore-btn {
		min-height: 2.75rem;
		flex: 0 0 auto;
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
