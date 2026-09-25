<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import { hasGuidance } from '$lib/check-in-guidance';
	import PhotoStager from '$lib/notebook/PhotoStager.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import NotebookEntryCard from '$lib/notebook/NotebookEntryCard.svelte';
	import FolderRail from '$lib/notebook/FolderRail.svelte';
	import FolderManager from '$lib/notebook/FolderManager.svelte';
	import NotebookInbox from '$lib/notebook/NotebookInbox.svelte';
	import NotebookHead from '$lib/notebook/NotebookHead.svelte';
	import ComposerFiling from '$lib/notebook/ComposerFiling.svelte';
	import NoteTemplates from '$lib/notebook/NoteTemplates.svelte';
	import { inboxDrafts } from '$lib/notebook/quick-note';
	import {
		noteHoldsOnlyTemplate,
		noteIsBlank,
		templateCursor,
		withTemplate,
		type NoteTemplate
	} from '$lib/notebook/note-templates';
	import {
		checkInClassLabel,
		checkInState,
		filedToWords,
		logCheckIn,
		withComposerDraft,
		type DraftFiling
	} from '$lib/notebook/log';
	import { SvelteSet } from 'svelte/reactivity';
	import { tick, untrack } from 'svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { EditBaseline, serializeForBaseline } from '$lib/edit-baseline.svelte';
	import { SaveState, type SaveOutcome } from '$lib/save-state.svelte';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import { revealDetailPane } from '$lib/shell/reveal';
	import { registerCommandHandler } from '$lib/shell/command-handlers';
	import { splitIsWide, watchSplitWidth } from '$lib/shell/split.svelte';
	import { clearPendingCapture, fitForUpload, takePendingCapture } from '$lib/notebook/camera';
	import {
		DRAFT_MIRROR_DEBOUNCE_MS,
		MIRROR_UNAVAILABLE_NOTE,
		baselineValue,
		clearMirror,
		draftMirrorKey,
		latestMirror,
		mirrorHeldMessage,
		mirrorRestoreMessage,
		mirrorVersionFor,
		planMirrorRestore,
		sweepMirrors,
		writeMirror
	} from '$lib/notebook/draft-mirror';
	import {
		NOTEBOOK_DISCARD_WARNING,
		READ_ONLY_FILTER_HINTS,
		clampSelection,
		notebookComposerHasWork,
		notebookUnsavedReason,
		notebookUnsavedWarning,
		selectedEntryOf,
		type NoteFlush
	} from '$lib/notebook/notebook-shell';
	import '$lib/notebook/notebook-theme.css';
	import { browserPlateStore, retireStoredNotebookPlate } from '$lib/notebook/notebook-theme';
	import { tiptapHasText, type TiptapNode } from '$lib/notebook-notes';
	import {
		ENTRY_SORTS,
		deletedEntryTitle,
		entryActivityAt,
		isPinned,
		nearestOutstanding,
		outstandingSessions,
		photoCountLabel,
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
		ownsPage = false,
		scopeSectionId = null,
		scopeLabel = null,
		classes = [],
		defaultSectionId = null,
		reviewHref = '/classroom/notebook/review',
		allClassesHref = null,
		timelineHref = null,
		historyReady = true,
		coalescingReady = false,
		viewerId,
		createEntry,
		addPhoto,
		createNote,
		addNote,
		editNote,
		sealNotes,
		flushNote,
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
		onChanged,
		initialView = 'feed',
		quickNoteShown = null,
		onQuickNoteShown = undefined
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
		 *
		 * IT IS NOT THE WHOLE GATE ON THE CHIP, AND ALONE IT WAS THE WRONG ONE.
		 * Both flags DEFAULT TO ON (`deletionReady = true`, `deletedEntries =
		 * []`), so every surface that mounts this view without mentioning either
		 * -- the staff review page and /classroom/view-as's notebook, neither of
		 * which loads a deleted list at all -- rendered the chip over a list that
		 * is permanently empty. Clicking it swapped the pane to copy promising
		 * the student nothing was there, on the staff page directly above a
		 * Deleted section that was listing the removals. See `deletedOffered`.
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
		/**
		 * WHETHER THIS COMPONENT IS THE BODY OF THE CLASSROOM'S APPLICATION FRAME
		 * (ledger 0297). The notebook lives inside the classroom shell now, and
		 * the routes that are the notebook -- a class's own Notebook tab and the
		 * whole notebook -- take `nav.ts`'s `console` measure, which makes
		 * `.cr-root` the viewport above 1024px. Their page is then `.nb-root`, as
		 * `.cr-app-body`: the chrome above measures itself, this takes the rest,
		 * and each pane of the split owns its own scroll.
		 *
		 * FALSE IS PAGE FLOW, and it is the default: a mount with chrome of its own
		 * above or below the notebook -- the per-student review page with its back
		 * strip and staff Deleted section, the admin's view-as preview under its
		 * impersonation banner -- flows in the document, where `scroll="fill"`
		 * resolves against an auto height and degrades to page-flow by
		 * construction.
		 *
		 * THE NOTEBOOK'S OWN MASTHEAD IS GONE, and with it the `masthead` and
		 * `homeHref` props that used to decide this. The classroom's masthead,
		 * switcher, crumbs and tabs are the chrome on every mount.
		 */
		ownsPage?: boolean;
		/**
		 * THE CLASS THIS NOTEBOOK IS SCOPED TO (a class's own Notebook tab), or
		 * null for the whole notebook. A free entry -- "Something else" -- written
		 * here is FILED TO THIS CLASS, which is what makes it count on the class's
		 * grid at all; before ledger 0297 it was saved with no class. The load has
		 * already narrowed the entries and check-ins to this class.
		 */
		scopeSectionId?: string | null;
		/** The scoped class's name, for the head. */
		scopeLabel?: string | null;
		/**
		 * THE STUDENT'S CLASSES, for the whole notebook's class picker: a free entry
		 * written there is filed to the class picked, which starts on the class
		 * the student came from (`defaultSectionId`). Empty offers no picker and
		 * files a free entry to no class, which is right for somebody in no class.
		 */
		classes?: { id: string; label: string }[];
		/** The class a free entry starts filed to on the whole notebook. */
		defaultSectionId?: string | null;
		/** Where the "Section review" chip goes, for a reviewer. */
		reviewHref?: string;
		/** A class's tab links to the whole notebook, carrying the class along. */
		allClassesHref?: string | null;
		/** This class's project timeline (ledger 0297, F4b); a class's own tab only. */
		timelineHref?: string | null;
		/**
		 * A note can be DELETED and an entry can show a HISTORY (0119). False
		 * turns both off the same way `deletionReady` turns off 0116/0117: no
		 * delete or removed-notes disclosure inside any card's EntryNotes, no
		 * entry-history disclosure -- exactly the notebook this page rendered
		 * before 0119, on a project with no column to mark either in.
		 */
		historyReady?: boolean;
		/**
		 * Whether an autosave COALESCES into the head revision rather than
		 * appending one (0129). False leaves this surface behaving exactly as it
		 * did before -- it still autosaves, it simply mints a revision per burst
		 * -- because the parameter that asks for a replacement does not exist on
		 * a project without the migration, and naming it there would break every
		 * note save rather than only the coalescing.
		 *
		 * IT IS THE GATE FOR BOTH HALVES, and that is why it lives here rather
		 * than in each transport: the flag on a write and the boundary stamped by
		 * a click are one capability, and a surface that sent one without the
		 * other would leave a draft whose head nothing can ever seal.
		 */
		coalescingReady?: boolean;
		/**
		 * The signed-in caller's own id (0119). Threaded down to each card's
		 * EntryNotes, which is the only thing that reads it -- see
		 * NotebookEntryCard's own doc for why.
		 */
		viewerId?: string;
		createEntry?: (form: FormData) => Promise<CreateEntryResult>;
		addPhoto?: (form: FormData) => Promise<AddPhotoResult>;
		createNote?: (payload: NotePayload) => Promise<CreateEntryResult>;
		addNote?: (entryId: string, doc: TiptapNode, autosave?: boolean) => Promise<NoteSaveResult>;
		editNote?: (noteId: string, doc: TiptapNode, autosave?: boolean) => Promise<NoteSaveResult>;
		/**
		 * Stamping a revision boundary on an entry's notes (0129,
		 * notebook_seal_notes). Omitted removes nothing a student can see: the
		 * autosave keeps working and an explicit save simply stops freezing the
		 * version it saved, which is the pre-0129 behaviour.
		 */
		sealNotes?: (entryId: string) => Promise<EntryActionResult>;
		/**
		 * ONE BEST-EFFORT WRITE OF THE NOTE DRAFT as the page is hidden or torn
		 * down (`NoteFlush`). Synchronous and answerless on purpose: a `pagehide`
		 * handler cannot await, and a suspended iOS tab never resumes a debounce,
		 * a retry curve, or a promise. The transport sends it with `keepalive`.
		 *
		 * Omitted removes the net entirely and the surface behaves exactly as it
		 * did before -- the hide path falls back to the shared machine's ordinary
		 * `saveNow()`, which is what every non-notebook consumer still does.
		 */
		flushNote?: (payload: NoteFlush) => void;
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
		/**
		 * WHICH LIST THE PANE OPENS ON (ledger 0298): the feed, or the Inbox of
		 * drafts that answer no check-in, which is where every quick note lands.
		 * The header's "Open notebook" link asks for the Inbox (`?view=inbox`).
		 */
		initialView?: 'feed' | 'inbox';
		/** Whether the header's Note button is shown, for the Inbox's own switch; null offers no switch. */
		quickNoteShown?: boolean | null;
		onQuickNoteShown?: (shown: boolean) => void;
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

	// After hydration, so the first client render matches the server's.
	$effect(() => watchSplitWidth());
	const wide = $derived(splitIsWide());

	const selectedEntry = $derived(selectedEntryOf(entries, selectedId));

	$effect(() => {
		const kept = clampSelection(entries, selectedId);
		if (kept !== selectedId) selectedId = kept;
	});

	/**
	 * THE COMPOSER EXISTS WHENEVER THIS SURFACE CAN WRITE AT ALL, at every width
	 * (ledger 0298, R32). It is the top of the student's own log -- one box at
	 * the head of the feed, in the navigation pane -- rather than a form that
	 * takes the detail pane and has to be opened and closed, so there is no
	 * trigger and no Close any more. A read-only preview gets none.
	 */
	const composerMounted = $derived(!readOnly);

	/**
	 * IS THERE A "RECENTLY DELETED" LIST TO OFFER -- the one predicate behind
	 * both the chip and the empty-state link, which is what stops them
	 * disagreeing about when the pane may be swapped.
	 *
	 * THE LENGTH IS PART OF THE GATE, not just the count in the label. A chip
	 * whose only possible outcome is an empty state is a control that cannot
	 * do anything: `deletionReady` says the SCHEMA can answer the question and
	 * says nothing about whether this caller was handed an answer. The
	 * empty-state link below already asked both; the chip asked only the first.
	 */
	const deletedOffered = $derived(deletionReady && deletedEntries.length > 0);

	/**
	 * WHOSE NOTEBOOK THE READER IS LOOKING AT, in the second person or not.
	 *
	 * Said once. The read-only mounts (the per-student review page, the
	 * classroom's view-as notebook) put an INSTRUCTOR in front of a student's
	 * work, so copy addressed to the author is addressed to the wrong person --
	 * and it is invisible, because the words are perfectly ordinary and only
	 * the reader is different. Every string that would say "you" or "your"
	 * about the AUTHOR comes through here.
	 */
	const searchLabel = $derived(readOnly ? 'Search this notebook' : 'Search your notebook');
	function filterHint(id: string, hint: string): string {
		if (!readOnly) return hint;
		return READ_ONLY_FILTER_HINTS[id] ?? hint;
	}
	/** The open entry only ever takes a pane; below the breakpoint it expands in place. */
	const showEntry = $derived(wide && !!selectedEntry);
	/**
	 * NOTHING OPEN IS ONE PANE. With no entry picked the detail pane is NOT
	 * RENDERED and the log -- the composer and the feed under it -- takes the
	 * whole measure (IDEA_INTERFACE_STANDARDS 1: a persistent second column
	 * holding a placeholder spends most of a desktop screen saying nothing).
	 * The detail pane is only ever an entry somebody opened (ledger 0298); the
	 * composer lives at the head of the log and no longer claims it.
	 */
	const detailHasContent = $derived(showEntry);

	/**
	 * WHETHER THIS IS THE BODY OF THE CLASSROOM'S APPLICATION FRAME. Written
	 * once and read by the wrapper and the shell alike, so the two can never
	 * disagree about which shape this is. See the prop's own comment.
	 */
	const framed = $derived(ownsPage);

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
		void tick().then(() => {
			revealDetailPane(detailEl);
			/* AND THE ROW STAYS WHERE IT CAN BE SEEN (ledger 0298). Opening an
			   entry narrows the log to 26rem, which re-lays the composer at its
			   head as one column; the row that was pressed moved down with it --
			   measured 669 to 797px in a pane ending at 836, half off the foot.
			   `nearest` moves nothing when it is already in view, and the pane's
			   `scroll-padding-top` keeps it out from under the sticky head. */
			document
				.querySelector(`.nb-pane-card [data-entry-id="${CSS.escape(id)}"]`)
				?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
		});
	}

	/*
	 * THE COMMAND PALETTE CAN OPEN AN ENTRY HERE (ledger 0297), and only while
	 * this notebook is mounted: the palette lists the page's entries by name
	 * and hands the chosen id to the same `selectEntry` a row click runs.
	 */
	$effect(() =>
		registerCommandHandler('notebook.open-entry', (id) => {
			if (id) selectEntry(id);
		})
	);

	/*
	 * A PLATE THE RETIRED PICKER STORED IS CLEARED ON THE FIRST LOAD (ledger
	 * 0297). It paints nothing -- the room follows the site theme whatever it
	 * says -- and clearing it means no later feature can revive a stale id.
	 */
	$effect(() => {
		retireStoredNotebookPlate(browserPlateStore());
	});

	/**
	 * THE HEAD'S CHECK-IN CHIP: file the next save to that check-in and put the
	 * cursor in the box. The composer is the top of the log at every width, so
	 * this is a selection and a focus, never a second form -- and it takes the
	 * list back to the log from the Inbox or the deleted view, which hide it.
	 */
	function focusCheckIn() {
		if (!nextCheckIn) return;
		chooseSession(nextCheckIn.id, nextCheckIn.section_id);
		showingInbox = false;
		showingDeleted = false;
		void tick().then(focusComposer);
	}

	/** The composer's own box, focused and brought into view. */
	let composerEl = $state<HTMLElement | null>(null);
	/**
	 * THE LIST HEAD'S OWN HEIGHT, MEASURED, as the pane's `scroll-padding-top`
	 * above the breakpoint, where the head stays at the top of the scrolling log.
	 * Measured rather than written down because the head wraps -- one line in a
	 * wide pane, three in a 26rem one -- and a constant here would be wrong the
	 * first time it did.
	 */
	let listHeadHeight = $state(0);
	function focusComposer() {
		const box = composerEl?.querySelector<HTMLElement>(
			'.note-input, [data-testid="note-editor-plain"]'
		);
		if (box) box.focus();
		else composerEl?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
	}

	/** The head's drafts chip: the Drafts filter, applied rather than toggled. */
	function showDrafts() {
		showingDeleted = false;
		if (!filters.includes(DRAFT_FILTER.id)) filters = [...filters, DRAFT_FILTER.id];
	}

	/**
	 * WHICH ENTRIES HAVE A NOTE EDITOR HOLDING UNSAVED EDITS.
	 *
	 * The guard below asked `notebookComposerHasWork` and nothing else, so an
	 * open note editor with a retyped paragraph in it was invisible to it: a
	 * click on another entry threw the edit away with nothing said. A note
	 * editor is two components down from this page, so each EntryNotes reports
	 * its own SaveState up through its card and this Set collects them.
	 *
	 * A plain Set, not a reactive one: it is read only inside the guard, at the
	 * moment a navigation happens, so there is nothing here to re-render.
	 */
	const dirtyNoteEditors = new Set<string>();
	function noteEditorDirty(entryId: string, dirty: boolean) {
		if (dirty) dirtyNoteEditors.add(entryId);
		else dirtyNoteEditors.delete(entryId);
	}

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
	 * THE CLASS A FREE ENTRY IS FILED TO (ledger 0297), on the whole notebook
	 * where there is more than one to choose from. Seeded ONCE from the class
	 * the student came from and then owned by the picker -- the deep-link rule
	 * `linkedPick` follows -- and never read on a class's own tab, where the
	 * class is the answer (`sectionForFree`).
	 */
	// svelte-ignore state_referenced_locally
	let freeSectionChoice = $state<string | null>(defaultSectionId ?? classes[0]?.id ?? null);
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

	/**
	 * THE NOTE CHAIN THAT DRAFT'S TEXT LIVES IN, once autosave (or a manual
	 * save) has written it. `notebook_entry_notes` is append-only, so the next
	 * write must EDIT this chain -- adding again would start a second note on
	 * the same draft, and a ten-minute writing session would end up as a dozen
	 * notes each holding a little more of one paragraph.
	 *
	 * Null with `savedDraftId` set is legitimate: a draft created from a photo
	 * has no note yet, and the first text write adds one.
	 */
	let savedNoteId = $state<string | null>(null);
	/**
	 * A note HAS been written and the transport did not say into which chain.
	 * Fails the next text write closed rather than adding a second note: the
	 * duplicate is invisible on the composer and only shows up on the entry.
	 */
	let noteChainUnknown = $state(false);
	/**
	 * THE HEAD REVISION OF THIS DRAFT'S NOTE WAS WRITTEN BY AN AUTOSAVE AND IS
	 * STILL REPLACEABLE (0129), so a Save draft click has a boundary to stamp
	 * even when it has no words to send. False whenever a write came from a
	 * button, because that revision is already a boundary, and false with 0129
	 * unapplied, because no write is marked replaceable there at all.
	 *
	 * Written in exactly two places -- `persistNote`, which knows how it sent
	 * the write, and the autosave's own create -- and cleared by the seal and
	 * by `resetForm`.
	 */
	let headUnsealed = $state(false);
	/** The title the draft entry carries on the server, so a retitle is a diff. */
	let savedLabel = $state<string | null>(null);
	/**
	 * The check-in the draft was created against. `notebook_set_entry_label`
	 * refuses a session-linked entry -- its title comes from the check-in -- so
	 * a title change is only writable when this is null.
	 */
	let savedDraftSession = $state<string | null>(null);
	/**
	 * WHERE THAT DRAFT WAS ACTUALLY FILED: its check-in, its class and its
	 * folder, as they were SENT on the create (or read off the entry a mirror
	 * restore adopted). Every later write only ADDS to `savedDraftId` -- the
	 * saveTarget guarantee -- so once the draft exists the composer's picks no
	 * longer decide anything about it.
	 *
	 * THIS IS WHAT "Filed to ..." READS WHILE A DRAFT EXISTS, and it was missing
	 * (ledger 0298 review). The line read the live picks, so writing first --
	 * which autosaves a draft to the auto-picked check-in within a second --
	 * and then pressing Change to file it elsewhere moved the words on screen
	 * and nothing on the server: the line said B, Turn in turned in A. The
	 * filing panel is locked while this is set; New entry is the way out.
	 */
	let savedDraftFiling = $state<DraftFiling | null>(null);
	/**
	 * A note the composer is holding that autosave must NOT write, and there is
	 * exactly one way in: `resetForm(true)`, the case where the entry saved and
	 * its note did not. That entry already exists and may already be turned in,
	 * so the text on screen belongs to it and the message says to add it from
	 * its own card. Autosaving it would create a SECOND entry out of it. It is
	 * still unsaved work, so the navigation guard still asks about it.
	 */
	let orphanNote = $state(false);
	/**
	 * WHAT THE SERVER HAS ACKNOWLEDGED OF THE NOTE BOX -- the one comparison,
	 * on the shared EditBaseline, seeded with `null` because a fresh composer
	 * has nothing on the server. Not "is there text in here": NoteEditor emits
	 * a transaction just for being mounted, and a draft whose text has already
	 * landed must not be written again on the next keystroke elsewhere.
	 */
	const autosaveBaseline = new EditBaseline();
	autosaveBaseline.seed(null);

	// ---- the local draft mirror ----------------------------------------------
	//
	// WHAT IT IS FOR: the composer had NO local persistence of any kind. The note
	// lived in `noteDraft` and in ProseMirror's in-memory document and nowhere
	// else, so a tab discarded under memory pressure took it with no failed
	// write, no error and no message -- nothing had been dispatched. The
	// keepalive beacon above does not close that: its body is capped at 64KB and
	// the composer's wire body was measured at 134.9KB for 2000 short lines, so
	// the notes it refuses are exactly the long ones worth rescuing.
	//
	// IT IS THE AUTOSAVE'S SHADOW, NOT A SECOND SAVE PATH. It is written while
	// `noteUnsaved` is true and cleared the moment `autosaveBaseline` advances,
	// so the slot exists precisely while there is writing the server has not
	// acknowledged -- one comparison, in one place, persisted. Nothing reads it
	// but a fresh mount, and all it can do is put the words back in the box.
	// -------------------------------------------------------------------------

	/**
	 * THE DOCUMENT A MIRROR PUT BACK, seeded into the editor rather than merely
	 * assigned to `noteDraft`: Tiptap takes its content once, at mount, so a
	 * restore has to arrive as `initialDoc` on a fresh instance (`noteKey`).
	 * Cleared by `resetForm`, which bumps that key -- otherwise the next remount
	 * would re-seed writing the student has already finished with.
	 */
	let restoredDoc = $state<TiptapNode | null>(null);
	/** The sentence about a restore, shown beside the form. */
	let mirrorNote = $state<string | null>(null);
	/** Storage refused the mirror, so the student is told the net is not there. */
	let mirrorBlocked = $state(false);
	/**
	 * A SLOT THIS BUILD FOUND AND REFUSED TO OPEN, held rather than dropped.
	 *
	 * It is a KEY and not a boolean because it is the thing every write path has
	 * to steer around: the composer must not clear it, must not write over it,
	 * and must not let the quota sweep eat it. A boolean would answer "is one
	 * held" and none of those three questions.
	 */
	let mirrorHeldKey = $state<string | null>(null);
	/** The words for it. Never null while `mirrorHeldKey` is set. */
	let mirrorHeldNote = $state<string | null>(null);
	/** The debounce, and the thing `clearComposerMirrors` has to cancel. */
	let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
	/**
	 * The restore is a one-time read; `entries` reloading must not re-run it.
	 *
	 * `$state` rather than a plain flag because the MIRRORING effect reads it as
	 * a gate: written plainly, that effect's first run would see false, return,
	 * and never re-run -- the flag is not a dependency, so nothing would wake it
	 * and nothing would ever be mirrored. Measured exactly that way first.
	 */
	let mirrorChecked = $state(false);

	/**
	 * THE SLOTS THIS COMPOSER SESSION CAN HAVE WRITTEN. Two, and only two: the
	 * `new` slot it starts in, and the one named after the draft entry it
	 * created. A create moves the session from the first to the second, so an
	 * acknowledgement has to clear both -- the `new` slot is stale from that
	 * moment on, and a stale slot is a mirror that would restore writing which
	 * is already on an entry.
	 */
	function composerMirrorKeys(): string[] {
		const keys = [draftMirrorKey(viewerId, null)];
		if (savedDraftId) keys.push(draftMirrorKey(viewerId, savedDraftId));
		return keys;
	}

	/**
	 * CLEARED ON A CONFIRMED ACKNOWLEDGEMENT AND NEVER ON DISPATCH. Called from
	 * exactly where `autosaveBaseline.advance()` is called, which is the one
	 * place this codebase already means "the server holds these words" -- so the
	 * mirror cannot survive its own acknowledgement and cannot be dropped before
	 * one. The pending debounce is cancelled with it: a timer that fires after
	 * the clear would write the slot straight back.
	 */
	function clearComposerMirrors(): void {
		if (mirrorTimer !== null) {
			clearTimeout(mirrorTimer);
			mirrorTimer = null;
		}
		// A HELD SLOT IS NEVER CLEARED HERE. This runs on an acknowledgement, which
		// says the server has THIS session's writing -- it says nothing about the
		// writing in a slot this build could not open, and that slot is the only
		// copy of it.
		for (const key of composerMirrorKeys()) {
			if (key === mirrorHeldKey) continue;
			clearMirror(key);
		}
	}
	/**
	 * A WRITE IS IN FLIGHT, autosave or manual. Distinct from `busy`, which
	 * disables the form: an autosave must never do that (it fires while
	 * somebody is typing into the box it would grey out), but it must still be
	 * the only write running, or a click landing mid-autosave could create a
	 * second entry from the same text.
	 */
	let inFlight = false;

	const open = $derived(outstandingSessions(sessions, entries));

	/**
	 * THE PAGE HEAD'S TWO ACTIONABLE FACTS. The head used to be a hero: an
	 * eyebrow, a title and a three-line paragraph explaining what a notebook is,
	 * on every visit, above the work. What a student opening their notebook
	 * actually needs to know is what is OUTSTANDING -- which check-in is due
	 * next and whether anything is still a draft -- and both are answers the
	 * page already holds. They render as controls: the check-in chip picks that
	 * session in the composer and brings it into view, the drafts chip applies
	 * the Drafts filter. Neither is a second source of truth: `nearestOutstanding`
	 * is what the composer's own auto-select reads, and the draft count is the
	 * same predicate the all-drafts note above the feed uses.
	 */
	const nextCheckIn = $derived(nearestOutstanding(sessions, entries, todayIso()));
	const draftCount = $derived(
		draftsReady ? entries.filter((e) => e.submitted_at === null).length : 0
	);

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
	 * A PHOTO IS UPLOADED THE MOMENT IT IS STAGED, AS A DRAFT (ledger 0297,
	 * package F4b). It used to wait in memory for Save draft or Turn in, so a
	 * closed tab, a dead battery or a deploy took every page staged so far --
	 * the blocking finding of the notebook audit. The draft is private to its
	 * author at both read sites (0118), so saving it early shows nobody
	 * anything, and turning it in stays the deliberate act it was.
	 *
	 * IT IS THE SAVE DRAFT PRESS, NOT A SECOND UPLOAD PATH: `runSave(false)`
	 * creates the draft from the first photo or adds to the one this session
	 * already made, through the same pairing rule and the same partial-failure
	 * handling. Each staged photo is tried ONCE automatically (the WeakSet): a
	 * photo that fails stays staged with its message and the Save draft button
	 * retries it, rather than this effect retrying it in a loop. Deferred and
	 * untracked, because `runSave` writes the state this effect reads.
	 */
	const autoUploadTried = new WeakSet<File>();
	$effect(() => {
		const ready =
			staged.length > 0 &&
			!stagerSettling &&
			uploadReady &&
			draftsReady &&
			!readOnly &&
			!busy &&
			!!createEntry &&
			!!addPhoto;
		if (!ready) return;
		const fresh = staged.filter((p) => !autoUploadTried.has(p.file));
		if (!fresh.length) return;
		untrack(() => {
			for (const p of fresh) autoUploadTried.add(p.file);
			queueMicrotask(() => void runSave(false));
		});
	});

	// ---- autosave ------------------------------------------------------------
	//
	// WHAT THIS REPLACED. The composer had no persistence mechanism at all:
	// nothing was written until somebody pressed Save draft or Turn in, and
	// `beforeNavigate` raised a window.confirm because there was nothing to
	// flush. Typing a paragraph and clicking an entry in the feed lost it, and
	// the only warning was a question whose honest answer was "then save it".
	//
	// IT WRITES TEXT, AND ONLY TEXT, INTO THE DRAFT 0118 ALREADY BUILT. A draft
	// entry is private to its author at both read sites, and it is reversible --
	// so an entry that appears because somebody typed is not an entry anybody
	// else can see, and turning it in stays a deliberate act.
	//
	// STAGED PHOTOS ARE DELIBERATELY OUTSIDE IT, and nothing here should look
	// like it protects them. They are File handles that exist nowhere but in
	// this browser's memory; there is no request that carries one without
	// uploading it, and uploading on a debounce would push a student's camera
	// roll into Drive a photo at a time while they were still deciding. They are
	// carried by the navigation guard and the pagehide net -- the composer says
	// so in words, next to the button.
	// -------------------------------------------------------------------------

	/**
	 * IS AUTOSAVE AVAILABLE AT ALL. `draftsReady` is the load-bearing one: with
	 * 0118 unapplied there is no draft state, so an autosave would be silently
	 * TURNING ENTRIES IN as somebody typed. The transports follow the rule the
	 * rest of this component follows -- an absent one removes the capability
	 * rather than failing at the point of use.
	 */
	const autosaveReady = $derived(
		!readOnly && draftsReady && noteAllowed && !!createNote && !!addNote && !!editNote
	);

	/** Note text the server has not acknowledged. */
	const noteUnsaved = $derived(hasNote && autosaveBaseline.changed(noteDraft));
	/**
	 * ...that autosave is allowed to write. See `orphanNote`. And never a CREATE
	 * out of a template's bare headings (`noteHoldsOnlyTemplate`): a draft fixes
	 * where the entry is filed, and a student who pressed a template and then
	 * "Change" had not written anything yet (ledger 0298 review). Only the create
	 * waits -- once a draft exists, every edit is written as before.
	 */
	const noteDue = $derived(
		noteUnsaved &&
			!orphanNote &&
			!noteChainUnknown &&
			!(savedDraftId === null && noteHoldsOnlyTemplate(noteDraft))
	);
	/**
	 * A TITLE CHANGE IS ONLY WRITABLE ONCE THERE IS AN ENTRY TO PUT IT ON, and
	 * that is a property of the schema rather than a choice made here: no RPC
	 * creates an entry out of a title. `notebook_create_note_entry` needs real
	 * note content and `notebook_create_entry` needs a photo, so a form holding
	 * nothing but a typed title has nothing any write could land. It stays
	 * unsaved work the navigation guard asks about, and the form's own hint
	 * already says what makes it savable.
	 */
	const labelDue = $derived(
		!!savedDraftId && !savedDraftSession && !!setEntryLabel && (title.trim() || null) !== savedLabel
	);
	const autosaveDue = $derived(autosaveReady && (noteDue || labelDue));

	/**
	 * Save draft only ever asks "is there something NEW to save right now" --
	 * a second click with nothing added since the first is a no-op the button
	 * refuses rather than offers (`runSave` guards it too, this is only the
	 * visible half of the same rule).
	 *
	 * ONCE THIS SESSION HAS A DRAFT, "new" IS WHAT THE SERVER HAS NOT
	 * ACKNOWLEDGED, never what is on screen. Save draft is a checkpoint and the
	 * writing stays in the box after one, so `canSubmit` -- which answers "is
	 * there content in here" -- would leave the button lit forever on a form
	 * holding nothing but words already saved. That is the presence-of-state
	 * dirty signal CLAUDE.md names, and it is the same comparison the autosave
	 * uses rather than a second spelling of it.
	 *
	 * `headUnsealed` is the case that is not a diff: the autosave has written
	 * exactly these words, so nothing is owed, and the click still has a job --
	 * stamping the 0129 boundary so the next keystroke cannot write over the
	 * version the student just chose to keep.
	 */
	const saveDraftDue = $derived(
		savedDraftId ? noteUnsaved || labelDue || staged.length > 0 || headUnsealed : canSubmit
	);
	const canSaveDraft = $derived(draftsReady && saveDraftDue);

	/**
	 * WHAT THE COMPOSER IS HOLDING THAT THE SERVER HAS NOT ACKNOWLEDGED, which
	 * is not the same question as `notebookComposerHasWork`. A title the draft
	 * already carries and a note already written into it are on the screen and
	 * on the server both; warning about them is the lie people learn to click
	 * through. Staged photos are always in it -- nothing can write them.
	 */
	const composerUnsaved = $derived({
		staged,
		title: savedDraftId && (title.trim() || null) === savedLabel ? '' : title,
		noteDraft: noteUnsaved ? noteDraft : null
	});

	/**
	 * THE ONE SAVE STATE for this surface ($lib/save-state.svelte), autosaving
	 * on the same 800ms debounce the assignment engine uses. `saved` is reached
	 * only when a write is ACKNOWLEDGED, and carries the clock time of it.
	 */
	/**
	 * THE HIDE PATH, AND IT IS A DIFFERENT SHAPE FROM THE SAVE PATH.
	 *
	 * `SaveState`'s default net is `saveNow()` -- the ordinary debounced,
	 * retrying, awaited write. That is the right default for a surface on a
	 * desktop and the wrong one here: iOS Safari freezes a hidden tab hard
	 * enough that a plain `fetch` may never leave the machine, and the retry
	 * curve's sleeps (up to 6.4s) never resume. So the notebook hands in an
	 * `onHide` of its own -- ONE request, `keepalive`, no await, no retry, no
	 * orchestration -- and the shared module is untouched for every other
	 * consumer, which keeps its own default.
	 *
	 * IT CAN ONLY RESCUE A DRAFT THAT ALREADY EXISTS. `flushNote` names an
	 * entry id, and a composer that has never been created server-side has none
	 * to name: there is no single request that both creates an entry and is
	 * safe to fire blind at teardown. That gap is real and is not closed here.
	 *
	 * THE GUARDS ARE `noteDue`'s, not a second spelling of them: `orphanNote`
	 * and `noteChainUnknown` both mean a write would land in the wrong place,
	 * and firing one blind is exactly where that is least recoverable.
	 */
	function hideFlush(): void {
		if (!flushNote || !autosaveReady) return;
		if (!noteDue || !savedDraftId) return;
		flushNote({
			entryId: savedDraftId,
			noteId: savedNoteId,
			content: noteDraft as TiptapNode,
			autosave: coalescingReady
		});
	}

	const save = new SaveState({
		fallbackMessage: 'Your writing was not saved.',
		async save() {
			return await runSave(false, true);
		},
		onHide: hideFlush
	});

	/** visibilitychange + pagehide, living and dying with this instance. */
	$effect(() => save.attach());

	// `untrack` around both calls, the EntryNotes rule: they READ the phase they
	// may then write, so a tracked call re-runs this effect on every transition
	// and turns `saved` straight back into `dirty`.
	$effect(() => {
		const due = autosaveDue;
		untrack(() => {
			if (due) save.markDirty();
			// `saved` and `failed` are reports of a WRITE and stand until the next
			// one; only an unsaved marker with nothing behind it is cleared.
			else if (save.phase === 'dirty') save.reset();
		});
	});

	/**
	 * ONE GUARD for the whole page. The composer's text is FLUSHED and the
	 * navigation re-issued; only what no write can carry -- a staged photo, a
	 * title with nothing to hang it on, an open note editor two components down
	 * -- is worth a question, and `alsoUnsaved` is how the shared guard is told
	 * about it.
	 */
	guardSaveNavigation(save, {
		warning: NOTEBOOK_DISCARD_WARNING,
		alsoUnsaved: () => {
			const reason = notebookUnsavedReason({
				composer: composerMounted ? composerUnsaved : null,
				dirtyNoteEditors: dirtyNoteEditors.size
			});
			return reason ? notebookUnsavedWarning(reason) : null;
		}
	});

	/**
	 * PUT BACK WHAT THIS BROWSER KEPT, once, on mount.
	 *
	 * It reads `entries` so that a feed arriving after the first paint still
	 * gets the pass, and `mirrorChecked` is what makes it a one-time read rather
	 * than something that re-runs on every reload of the feed underneath.
	 *
	 * `untrack` around all of it, the EntryNotes rule: this WRITES most of the
	 * composer's state, and a tracked write of state the same effect read is how
	 * an effect re-enters itself.
	 */
	$effect(() => {
		const rows = entries;
		untrack(() => {
			if (mirrorChecked) return;
			mirrorChecked = true;
			if (readOnly || !noteAllowed) return;
			const now = Date.now();
			// HOUSEKEEPING FIRST, and it only ever drops EXPIRED slots: a live one
			// belonging to another draft is somebody's writing, not litter.
			sweepMirrors(draftMirrorKey(viewerId, null), now, false, mirrorHeldKey ? [mirrorHeldKey] : []);
			const found = latestMirror(viewerId, now);
			if (!found) return;
			const plan = planMirrorRestore(
				found.mirror,
				found.mirror.entryId ? rows.find((e) => e.id === found.mirror.entryId) : undefined
			);
			if (plan.action === 'drop') {
				clearMirror(found.key);
				return;
			}

			/**
			 * FOUND SOMETHING THIS BUILD CANNOT DRAW: SAY SO AND TOUCH NOTHING.
			 *
			 * Handing `found.mirror.doc` to the editor here is the measured defect
			 * -- Tiptap discards the WHOLE document rather than the one block it
			 * cannot build, so the box comes back empty and the student reads a
			 * recovery message over a blank page. So the writing stays where it
			 * is, the key is recorded so no write path can touch it, and the
			 * composer carries on as a fresh one.
			 */
			if (plan.action === 'hold') {
				mirrorHeldKey = found.key;
				mirrorHeldNote = mirrorHeldMessage();
				console.warn(
					'[notebook] a draft mirror was held rather than restored; this build does not know:',
					plan.unknown.join(', ')
				);
				return;
			}

			// THE WRITING FIRST. Tiptap seeds its document once, at mount, so the
			// restored one arrives as `initialDoc` on a fresh instance -- exactly
			// the remount `resetForm` already uses to clear the box.
			restoredDoc = found.mirror.doc;
			noteDraft = found.mirror.doc;
			noteKey += 1;
			/**
			 * AND THE COMPARISON IT WAS TAKEN AGAINST. Seeding the baseline the
			 * mirror recorded means `noteUnsaved` answers exactly what it answered
			 * in the session that died: there is no second notion of "edited" here,
			 * only the composer's own, resumed.
			 */
			autosaveBaseline.seed(baselineValue(found.mirror));
			orphanNote = false;
			noteChainUnknown = false;

			if (found.mirror.title) title = found.mirror.title;
			// A DEEP LINK OUTRANKS THE MIRROR'S OWN PICK, and only here: arriving on
			// a check-in is a deliberate act taken just now, where the mirror's pair
			// is a record of one taken before the tab died.
			if (!linkedPick) {
				sessionTouched = true;
				selectedSession = found.mirror.sessionId;
				selectedSectionId = found.mirror.sectionId;
			}
			if (found.mirror.folderId && folders.some((f) => f.id === found.mirror.folderId)) {
				folderTouched = true;
				folderChoice = found.mirror.folderId;
			}

			/**
			 * ADOPTING THE DRAFT IS WHAT KEEPS THIS ONE ENTRY. Without it a restore
			 * would leave `savedDraftId` null and the next save would CREATE a
			 * second entry beside the one the last session already made -- the
			 * duplicate `savedDraftId` exists to prevent. `planMirrorRestore` only
			 * ever names an entry the feed still holds as a live draft.
			 */
			if (plan.entryId) {
				const entry = rows.find((e) => e.id === plan.entryId);
				savedDraftId = plan.entryId;
				savedNoteId = plan.noteId;
				savedDraftSession = entry?.session_id ?? null;
				savedDraftFiling = {
					session: entry?.session_id ?? null,
					section: entry?.section_id ?? null,
					folder: entry?.folder_id ?? null
				};
				savedLabel = entry?.custom_label ?? null;
				headUnsealed = false;
			}

			// The slot this came out of is only the right slot to go on writing
			// when the record did not move; where it did, the old one is dropped
			// so the next load cannot find two.
			const nextKey = draftMirrorKey(viewerId, savedDraftId);
			if (nextKey !== found.key) clearMirror(found.key);

			mirrorNote = mirrorRestoreMessage(plan);
		});
	});

	/**
	 * MIRROR THE BOX, DEBOUNCED, WHILE THERE IS WRITING THE SERVER HAS NOT GOT.
	 *
	 * The gate is `noteUnsaved` -- the SAME derived the autosave and the Save
	 * draft button read -- so the slot exists exactly while there is something
	 * to lose and is gone the moment `clearComposerMirrors` runs beside an
	 * acknowledgement. That is the whole lifetime rule, and it is one comparison
	 * rather than a second idea of what "unsaved" means.
	 *
	 * IT WAITS FOR THE RESTORE PASS. On the first frame `noteDraft` is null
	 * because Tiptap has not mounted yet, and an ungated effect would read that
	 * as an emptied box and delete the very mirror the pass above is about to
	 * read.
	 */
	$effect(() => {
		if (readOnly || !noteAllowed || !mirrorChecked) return;
		const due = noteUnsaved;
		const doc = noteDraft;
		const key = draftMirrorKey(viewerId, savedDraftId);
		const entryId = savedDraftId;
		const noteId = savedNoteId;
		const label = title;
		const sessionId = selectedSession;
		const sectionId = selectedSectionId;
		const folderId = folderChoice;
		const baseline = autosaveBaseline.serial;

		/**
		 * THE ONE KEY THIS EFFECT MAY NOT TOUCH, and the guard is here rather than
		 * inside the timeout so the debounce is not even armed for it.
		 *
		 * A held slot is usually the `new` one, because a composer that refused to
		 * restore has no draft id -- so this is normally a suspension of the net
		 * for the session, and the student is told that in the same panel. Where
		 * the held slot belongs to a DIFFERENT record it costs nothing: the
		 * composer mirrors its own key as usual and only steps around that one.
		 */
		const held = mirrorHeldKey;

		// The pending write goes FIRST, before the guard: a timer armed for a key
		// that has since become held must not fire, and an early return that left
		// it running would be a write to the one slot this effect may not touch.
		if (mirrorTimer !== null) clearTimeout(mirrorTimer);
		if (key === held) {
			mirrorTimer = null;
			return;
		}

		mirrorTimer = setTimeout(() => {
			mirrorTimer = null;
			if (!due || !doc) {
				/**
				 * AN EMPTIED BOX IS MIRRORED TOO, and it is not the "clear on
				 * dispatch" this feature refuses. The slot's whole claim is that it
				 * holds what is on screen; a slot left behind after a student
				 * selected their words and deleted them would put those words back
				 * on the next load, which is a worse failure than losing them.
				 * Acknowledged text takes the same branch and is already cleared by
				 * `clearComposerMirrors` a moment earlier.
				 */
				clearMirror(key);
				return;
			}
			const result = writeMirror(
				key,
				{
					/**
					 * THE VERSION IS DERIVED FROM THE DOCUMENT, NEVER WRITTEN DOWN
					 * HERE. `1` while every type in it is one a deployed build can
					 * render, which is every ordinary note; `2` the moment it is not,
					 * so such a build drops the slot cleanly rather than blanking the
					 * draft it restores from it. Pinning the literal at this call site
					 * is what made that impossible before.
					 */
					v: mirrorVersionFor(doc),
					at: Date.now(),
					entryId,
					noteId,
					doc,
					baseline: baseline ?? serializeForBaseline(null),
					title: label,
					sessionId,
					sectionId,
					folderId
				},
				held ? [held] : []
			);
			// SAY SO WHEN THE NET IS NOT THERE. A safety net nobody knows is
			// missing is worse than none, because the student goes on writing a
			// long entry under an assumption that stopped being true.
			mirrorBlocked = result !== 'ok';
		}, DRAFT_MIRROR_DEBOUNCE_MS);

		return () => {
			if (mirrorTimer !== null) {
				clearTimeout(mirrorTimer);
				mirrorTimer = null;
			}
		};
	});

	/**
	 * THE PICKED CHECK-IN'S GUIDANCE PROMPT (0123), resolved from the CURRENT
	 * list on every read rather than captured when the pick was made -- the feed
	 * reloads after every save, and a snapshot describes the state before it.
	 *
	 * Resolved on the PAIR, not the id: one canonical check-in posted to two of
	 * this student's classes arrives as two postings sharing an id (0098), and
	 * `find(s => s.id === ...)` would resolve to whichever sorted first. The
	 * prompt is the same on both -- it is authored once on the canonical check-in
	 * -- but reading it the wrong way here is how the next field to be added
	 * inherits the bug. The resolution is `shownSession` below, which is the
	 * pick until a draft exists and the draft's own check-in after (ledger 0298
	 * review): the instructions above the box are the ones the writing answers.
	 */

	/**
	 * "FILED TO ..." (ledger 0298, R32): where the next save goes, in words, and
	 * where the student stands on the check-in it answers.
	 *
	 * TWO SOURCES, AND WHICH ONE IS THE SAVE PATH'S OWN RULE. Before this
	 * composer has made a draft, a create sends the picks (`composerFiling`,
	 * the same function the three create paths record), so the line reads the
	 * picks. Once it has, every save only ADDS to that draft and the picks
	 * decide nothing, so the line reads where the draft WAS filed
	 * (`savedDraftFiling`) and the filing panel is locked. Reading the picks in
	 * both cases is what let the line say one place while the save went to
	 * another (ledger 0298 review).
	 */
	const filingLocked = $derived(savedDraftId !== null && savedDraftFiling !== null);
	const shownFiling = $derived.by<DraftFiling>(() =>
		savedDraftId !== null && savedDraftFiling ? savedDraftFiling : composerFiling()
	);
	const shownSession = $derived.by(() => {
		const id = shownFiling.session;
		if (id === null) return null;
		return (
			sessions.find((s) => s.id === id && s.section_id === shownFiling.section) ??
			sessions.find((s) => s.id === id) ??
			null
		);
	});
	/** The feed, plus the composer's own draft until the feed catches up with it. */
	const chipEntries = $derived(
		withComposerDraft(
			entries,
			savedDraftId !== null && savedDraftFiling ? { id: savedDraftId, filing: savedDraftFiling } : null,
			(id) => entries.some((e) => e.id === id)
		)
	);
	const filedState = $derived(
		shownSession ? checkInState(shownSession, chipEntries, todayIso()) : null
	);
	/**
	 * THE CHECK-IN AS A CHIP (ledger 0298, R32): the same check-in `nextCheckIn`
	 * names, with a word and a tone for where the student stands on it -- or
	 * "All filed" once nothing is outstanding. The words are the classroom's.
	 */
	const headCheckIn = $derived(logCheckIn(sessions, chipEntries, todayIso()));
	const pickedGuidance = $derived(shownSession?.guidance_doc ?? null);
	const showGuidance = $derived(hasGuidance(pickedGuidance));
	const filedWhere = $derived.by(() => {
		const classFor = (id: string | null) =>
			id === null
				? null
				: id === scopeSectionId
					? (scopeLabel ?? classes.find((c) => c.id === id)?.label ?? null)
					: (classes.find((c) => c.id === id)?.label ?? null);
		const folder = shownFiling.folder;
		return filedToWords({
			sessionLabel: shownSession?.session_label ?? (shownFiling.session ? 'Check-in' : null),
			classLabel: shownSession
				? checkInClassLabel(shownSession.section_id, { scopeSectionId, classes })
				: classFor(shownFiling.section),
			folderName: folder ? (orderedFolders.find((f) => f.id === folder)?.name ?? null) : null
		});
	});

	/**
	 * HAS THIS STUDENT STARTED. The collapse signal for the guidance panel, and
	 * it is DERIVED from state the composer already holds rather than from a new
	 * prop, a store or a second read -- `notebookComposerHasWork` is the same
	 * function the navigation guard and the close control ask, so "started"
	 * cannot come to mean two things on one screen.
	 *
	 * THE RULE ITSELF IS `Disclosure`'S AND IS NOT RESTATED HERE: expanded the
	 * first time, collapsed once the work has started, a manual toggle
	 * overriding both for good, remembered per person and per check-in. This is
	 * only the signal (IDEA_INTERFACE_STANDARDS 1).
	 */
	const composerStarted = $derived(notebookComposerHasWork({ staged, title, noteDraft }));

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

	/**
	 * WHICH CLASS A FREE ENTRY -- "Something else", no check-in -- IS FILED TO.
	 *
	 * It used to be none: the three create paths sent `section_id` only with a
	 * check-in, so free work belonged to no class, never reached the class's
	 * grid (whose free-entry counter only counts entries filed to it) and never
	 * showed up on a class's own tab. Composed from inside a class it is that
	 * class; on the whole notebook it is the class the picker holds. Both RPCs
	 * accept a class with no check-in and check only that the class exists
	 * (0118, 0129 -- deliberately not an enrollment check: filing your own
	 * entry against a class discloses your own work to that teacher and nobody
	 * else's to anyone).
	 */
	function sectionForFree(): string | null {
		return scopeSectionId ?? freeSectionChoice;
	}

	/**
	 * THE FILING A CREATE SENDS, read at the moment it is sent -- the same
	 * three picks the three create paths put in their payloads -- so
	 * `savedDraftFiling` records what the server was told rather than whatever
	 * the picks say by the time the answer comes back.
	 */
	function composerFiling(): DraftFiling {
		return {
			session: selectedSession,
			section: selectedSession ? sectionForPick() : sectionForFree(),
			folder: folderChoice
		};
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
		/**
		 * WHAT THIS SENTENCE MAY CLAIM IS WHAT THE MARKER ACTUALLY CARRIES.
		 *
		 * `notebook_pending_capture` holds the check-in, the section, the title
		 * and the folder -- and NOT the note body. It used to say "Everything you
		 * typed is still here", which is false in the one case this message is
		 * shown for: the marker is only ever read on a FRESH load, i.e. after the
		 * browser was killed, and a note that survived that survived because the
		 * tab did, not because anything stored it. A student reading a promise
		 * that broad stops checking the box it was made about.
		 */
		recoveryNote =
			'Your photo did not make it back from the camera app, which can happen when the phone is low on memory. Your title and the check-in you picked have been put back. Check the writing box below before you carry on, then take the photo again.';
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
		/**
		 * THE SEEDED DOCUMENT GOES WITH THE BOX. `noteKey` above remounts the
		 * editor, and a `restoredDoc` left standing would seed the new instance
		 * with writing that was just saved and cleared -- the box would refill
		 * itself. Cleared in BOTH branches: with the note kept nothing remounts
		 * now, and the next thing that bumps the key must not resurrect this.
		 */
		restoredDoc = null;
		editorFocus = false;
		mirrorNote = null;
		/**
		 * `mirrorHeldNote` DELIBERATELY SURVIVES THIS, and so does its key. What
		 * was saved is THIS session's writing; a held slot holds somebody's
		 * earlier unsaved writing that was never put on screen, so an
		 * acknowledgement here is not an answer about it. Clearing the sentence
		 * would leave the slot standing with nothing on screen saying it is there.
		 */
		/**
		 * IT DOES NOT CLEAR THE MIRROR, and that is deliberate rather than an
		 * omission. This runs on a turn-in, on a create, and on `resetForm(true)`
		 * -- the case where the ENTRY saved and the NOTE did not, which is exactly
		 * when the words in the box are the only copy anywhere. The mirror is
		 * cleared by `clearComposerMirrors`, called beside every
		 * `autosaveBaseline.advance()`, which is the one thing in this file that
		 * means the server holds these words. Clearing here would be clearing on
		 * dispatch.
		 *
		 * The baseline reseed below leaves a kept note reading as unsaved, so the
		 * mirroring effect writes the slot straight back under the `new` key --
		 * which is correct: that text now belongs to no draft this session may
		 * add to.
		 */
		recoveryNote = null;
		// Deliberately NOT the folder: the next entry almost always belongs
		// where the last one went, and the suggestion effect re-derives it from
		// what was just saved.
		folderTouched = false;
		// The draft this session was continuing is done -- fully saved, or
		// turned in. The NEXT save, if any, is a genuinely new entry.
		savedDraftId = null;
		savedNoteId = null;
		noteChainUnknown = false;
		savedLabel = null;
		savedDraftSession = null;
		savedDraftFiling = null;
		headUnsealed = false;
		// SEEDED AT NOTHING, in both cases, because that is what the server holds
		// for the composer session starting here. With the note kept (its entry
		// saved and its note did not) that leaves it reading as unsaved, which it
		// is -- and `orphanNote` is what stops the autosave making a SECOND entry
		// out of it while the guard still asks about it.
		autosaveBaseline.seed(null);
		orphanNote = keepNote;
		save.reset();
	}

	/**
	 * A SAVE DRAFT LANDED AND THE COMPOSER SESSION CONTINUES. The counterpart
	 * to `resetForm`, and the reason there are two: a Save draft is a
	 * CHECKPOINT, not the end of anything.
	 *
	 * `savedDraftId` and the note chain behind it stay exactly where they are,
	 * so the next autosave -- and the next click -- adds to the entry this
	 * session already made rather than starting a second one. Only a Turn in,
	 * or the deliberate new-entry action, ends the session. This is what a0d43ba
	 * got right on its fresh-create path and wrong on its continuing one, where
	 * an unconditional `resetForm` meant the next word typed became a second
	 * entry; and it is what 0129 already says from the other side, where an
	 * explicit save is a revision boundary rather than a finish.
	 *
	 * THE WRITING STAYS IN THE BOX, and that is the same rule seen from the
	 * chain's end. The chain is EDITED in place from here on, so a cleared box
	 * over a kept `savedDraftId` means the next paragraph REPLACES the saved one
	 * as the entry's current note instead of following it -- the earlier words
	 * surviving only as a revision nobody is looking at. Keeping them is safe
	 * because `persistNote`/`rememberDraft` have already advanced
	 * `autosaveBaseline` to exactly this document: the box reads clean and
	 * nothing is sent again until something actually changes.
	 *
	 * `markSaved`, never `reset`: the machine is reporting a write that just
	 * landed, and `clean` would throw away the acknowledgement and its clock
	 * time. Staged photos are NOT cleared here -- only the caller knows whether
	 * they all landed.
	 */
	function checkpoint() {
		recoveryNote = null;
		// The restore note reported writing the server did not hold. It holds it now.
		mirrorNote = null;
		save.markSaved(Date.now());
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

	/**
	 * A STRAIGHTENED COPY OF AN ENTRY'S LATEST PAGE, added after the fact
	 * (ledger 0297, F4b). The card offers it only on the page
	 * `straightenTarget` names -- the one an appended corrected row is
	 * guaranteed to pair with -- and this sends it as the 'enhanced' variant.
	 */
	async function addCorrectedToEntry(entryId: string, file: File): Promise<EntryActionResult> {
		if (readOnly || !addPhoto) return { ok: false, error: 'Adding photos is not available.' };
		const form = new FormData();
		form.set('photo', await prepared(file));
		form.set('entry_id', entryId);
		form.set('variant', 'enhanced');
		const result = await addPhoto(form);
		if (result.ok) onChanged?.();
		return result.ok ? { ok: true } : { ok: false, error: result.error };
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
	 * REMEMBER THE ENTRY THIS COMPOSER SESSION MADE, in ONE place. Every create
	 * path calls this the instant its RPC succeeds: from that line on nothing in
	 * this session may create another entry, it may only add to this one. The
	 * note chain and the stored title are recorded with it, because they are
	 * what the next write has to diff against.
	 */
	function rememberDraft(
		entryId: string,
		noteId: string | undefined,
		wroteNote: boolean,
		filing: DraftFiling
	) {
		savedDraftId = entryId;
		savedDraftSession = selectedSession;
		savedDraftFiling = filing;
		savedLabel = title.trim() || null;
		if (wroteNote) {
			savedNoteId = noteId ?? null;
			// The transport did not say which chain. Fail the NEXT text write
			// closed rather than starting a second note on this entry.
			noteChainUnknown = !noteId;
			autosaveBaseline.advance(noteDraft);
			// The create carried the note, so it is acknowledged -- and this is the
			// moment the session's slot MOVES from `new` to the entry's own id, so
			// both are cleared (`clearComposerMirrors` is called after
			// `savedDraftId` is set above, which is what puts the second one in
			// range).
			clearComposerMirrors();
		}
	}

	/**
	 * THE COMPOSER'S NOTE TEXT ONTO A DRAFT THAT ALREADY EXISTS -- the one
	 * implementation, called by the autosave and by both buttons, so "add the
	 * first note, edit it after that" cannot come to mean two things.
	 */
	async function persistNote(entryId: string, auto: boolean): Promise<NoteSaveResult> {
		const doc = noteDraft as TiptapNode;
		if (noteChainUnknown) {
			// A REFUSAL, not a failure to deliver: this write has nowhere correct
			// to land, so sending it again cannot change the answer.
			return {
				ok: false,
				retryable: false,
				error: 'Your writing could not be added to this entry. Save it from the entry itself.'
			};
		}
		/**
		 * `auto` says WHERE this write came from, and it reaches the RPC only
		 * where the migration that understands it is applied (0129). A write from
		 * a button is never one, which is what makes a click a boundary: the
		 * revision it lands is one nothing may write across.
		 */
		const asAutosave = auto && coalescingReady;
		const result =
			savedNoteId && editNote
				? await editNote(savedNoteId, doc, asAutosave)
				: await addNote!(entryId, doc, asAutosave);
		if (!result.ok) return result;
		if (!savedNoteId) {
			savedNoteId = result.noteId ?? null;
			noteChainUnknown = !result.noteId;
		}
		// ACKNOWLEDGED: from here this text is what the server holds, so the local
		// mirror of it has nothing left to protect and goes in the same breath.
		autosaveBaseline.advance(doc);
		clearComposerMirrors();
		// WHAT THIS WRITE LEFT AT THE HEAD OF THE CHAIN. Sent as an autosave, it
		// is replaceable and a click still owes it a boundary; sent from a
		// button, it IS the boundary.
		headUnsealed = asAutosave;
		return { ok: true };
	}

	/** The draft entry's own title, when it is a free-form entry (see labelDue). */
	async function persistLabel(entryId: string): Promise<EntryActionResult> {
		const label = title.trim() || null;
		const result = await setEntryLabel!(entryId, label);
		if (!result.ok) return result;
		savedLabel = label;
		return { ok: true };
	}

	/**
	 * ONE AUTOSAVE PASS. Returns a SaveOutcome for the shared machine rather
	 * than setting any message of its own: the indicator beside the buttons is
	 * where an autosave speaks, and a green "Draft saved" banner appearing
	 * every 800ms while somebody types is not a report, it is noise.
	 *
	 * IT NEVER TOUCHES A PHOTO AND NEVER TURNS ANYTHING IN. The door is always
	 * the note door: create the draft from the text, or add to the draft this
	 * session already made.
	 *
	 * IT DOES NOT CALL `onChanged`. That reloads the whole notebook, and doing
	 * it on a debounce would re-fetch every entry a student holds each time they
	 * paused typing -- and would render the draft in the feed underneath the
	 * composer still holding the same words. The feed picks the draft up on the
	 * next real refresh, which is what makes the reload proof honest.
	 */
	async function autosaveDraft(): Promise<SaveOutcome> {
		if (!autosaveDue) return { ok: true };
		if (!savedDraftId) {
			// A create needs real text: a title alone is not an entry any RPC can
			// make. Nothing to do until there is something to write.
			if (!noteDue) return { ok: true };
			const filing = composerFiling();
			const saved = await createNote!({
				content: noteDraft as TiptapNode,
				custom_label: title.trim() || null,
				folder_id: folderChoice,
				session_id: selectedSession,
				section_id: selectedSession ? sectionForPick() : sectionForFree(),
				submitted: false,
				// The very first autosave is a CREATE, and its revision is the one
				// a ten-minute writing session keeps rewriting. Unmarked, that
				// session would end with two revisions and the first would be a
				// snapshot of whatever had been typed 800ms in.
				autosave: coalescingReady
			});
			if (!saved.ok) {
				return { ok: false, retryable: saved.retryable !== false, message: saved.error };
			}
			rememberDraft(saved.entryId, saved.noteId, true, filing);
			// Revision 1 went in marked replaceable (`autosave` above), so it owes
			// a boundary exactly as an autosaved edit does.
			headUnsealed = coalescingReady;
			return { ok: true };
		}
		if (noteDue) {
			const wrote = await persistNote(savedDraftId, true);
			// A chain this cannot name never gets here -- `noteDue` is false while
			// `noteChainUnknown` is set, which is what fails that case closed rather
			// than retrying it into a second note. Everything reaching this line is
			// a transport failure, and sending it again can change the answer.
			if (!wrote.ok) {
				return { ok: false, retryable: wrote.retryable !== false, message: wrote.error };
			}
		}
		if (labelDue) {
			const titled = await persistLabel(savedDraftId);
			if (!titled.ok) return { ok: false, retryable: true, message: titled.error };
		}
		return { ok: true };
	}

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
		const filing = composerFiling();
		const saved = await createNote!({
			content: noteDraft as TiptapNode,
			custom_label: title.trim() || null,
			folder_id: folderChoice,
			session_id: selectedSession,
			section_id: selectedSession ? sectionForPick() : sectionForFree(),
			submitted
			// No `autosave`: this is a button. The revision it creates is a
			// boundary, so the next autosave writes past it rather than over it.
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
			rememberDraft(saved.entryId, saved.noteId, true, filing);
			successMsg = 'Draft saved.';
			// The words stay in the box and `rememberDraft` has already advanced
			// the baseline to them, so nothing is owed. See `checkpoint` for why
			// clearing the box here would cost the paragraph that was just saved.
			checkpoint();
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
		} else {
			// A free entry belongs to the class it was written in (ledger 0297).
			const free = sectionForFree();
			if (free) first.set('section_id', free);
		}
		const trimmed = title.trim();
		if (!selectedSession && trimmed) first.set('custom_label', trimmed);
		if (folderChoice) first.set('folder_id', folderChoice);
		// Omitted when true (the default): a project without 0118 applied still
		// has the old notebook_create_entry signature, and naming p_submitted
		// unconditionally would leave PostgREST unable to resolve it -- the
		// same rule p_folder_id already follows.
		if (!submitted) first.set('submitted', 'false');
		const filing = composerFiling();

		const created = await createEntry!(first);
		if (!created.ok) {
			errorMsg = created.error;
			return;
		}
		// Remembered AT ONCE, whichever button was pressed: from this line on,
		// nothing in this composer session may call createEntry again. The note,
		// if there is one, is recorded a few lines down once it has landed.
		rememberDraft(created.entryId, undefined, false, filing);

		// The entry's optional note, written in the same action -- on ANY tier
		// since the mode picker went, so a photographed page can carry a
		// sentence about it. It goes FIRST, immediately after the entry exists:
		// it is one cheap call against several slow uploads, so sending it now
		// is what keeps the student's own words from being the thing lost to a
		// dropped connection halfway through the photos.
		let noteFailed = false;
		if (noteUnsaved) {
			progress = 'Saving your note...';
			const savedNote = await persistNote(created.entryId, false);
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
			// The note is not "what landed" in that sense: it stays in the box
			// either way, saved (baseline advanced, nothing owed) or failed
			// (`orphanNote` is not set here, so the retry click resends it).
			if (!failed.length) {
				staged = [];
				stager?.reset();
			}
			// NOT WHILE ANYTHING FAILED. `checkpoint()` puts the indicator into
			// `saved` with a clock time beside it, which read as a completed save
			// sitting next to a red line about photos that did not upload. The
			// indicator speaks for the whole save or it says nothing.
			if (!noteFailed && !failed.length) checkpoint();
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
		// `noteUnsaved`, not `hasNote`: the autosave may already have written
		// exactly these words into this entry, and re-sending them would mint a
		// revision saying the same thing.
		if (noteUnsaved) {
			progress = 'Saving your note...';
			const savedNote = await persistNote(entryId, false);
			noteFailed = !savedNote.ok;
		}
		if (labelDue) {
			const titled = await persistLabel(entryId);
			if (!titled.ok) errorMsg = titled.error;
		}
		/**
		 * THE CLICK STAMPS A REVISION BOUNDARY (0129), and it does so
		 * UNCONDITIONALLY rather than only when there was nothing to write.
		 *
		 * The common case is the one that needs it: the autosave already sent
		 * exactly these words, so `noteUnsaved` is false and this click has
		 * nothing to send -- and without a stamp the head stays replaceable and
		 * the next keystroke writes straight over the version the student meant
		 * to keep. Where the write above DID land a revision, that revision is
		 * already a boundary and this is a no-op; branching on which case it is
		 * would be two spellings of one rule, and the cheaper one is the one
		 * that can stop matching.
		 *
		 * A failure here is SILENT on purpose. Nothing a student can see depends
		 * on it, the words are saved either way, and a red line about revision
		 * granularity beside a successful save would be a report of nothing.
		 */
		if (coalescingReady && sealNotes) {
			const sealed = await sealNotes(entryId);
			// The head is a boundary now, so this session owes no further stamp
			// until the next autosave writes one. A failure leaves it OWED, which
			// is why this reads the result of a call whose failure is otherwise
			// deliberately silent.
			if (sealed.ok) headUnsealed = false;
		}
		const failed: number[] = [];
		const failedEnhanced: number[] = [];
		for (let i = 0; i < staged.length; i++) {
			const result = await uploadPair(entryId, staged[i], i + 1, staged.length, (m) => (progress = m));
			if (!result.originalOk) failed.push(i + 1);
			else if (!result.enhancedOk) failedEnhanced.push(i + 1);
		}

		/**
		 * A FAILED NOTE ABORTS THE TURN-IN, AND THIS CHECK MUST STAY ABOVE
		 * `submitEntry`.
		 *
		 * It used to sit below it, so a note write that failed still turned the
		 * entry in and only then said so -- the entry went to the instructor
		 * without the words the student had just written, and turning in is not
		 * undoable from here. Submission is also a one-way door for the text
		 * itself: `notebook_submit_entry` seals every revision on the way past
		 * (0129), so the head stops being replaceable and the retry the message
		 * asks for lands differently than it would have a moment earlier.
		 *
		 * The message and the early return are unchanged: the writing stays in
		 * the box, which is what makes "Try again" a true instruction.
		 */
		if (noteFailed) {
			errorMsg = 'Your note did not save, so it is still in the box above. Try again.';
			return;
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
		successMsg = submitted ? 'Entry turned in.' : 'Draft updated.';
		if (failedEnhanced.length) {
			successMsg += ` The corrected version of ${photoList(
				failedEnhanced
			)} did not upload; the original is saved.`;
		}
		// TURN IN ENDS THE SESSION; SAVE DRAFT DOES NOT. See `checkpoint`. Every
		// photo landed to reach this line (the failure above returns), so
		// clearing the stage is unconditional here in a way it is not on the
		// create path.
		if (submitted) {
			resetForm();
		} else {
			staged = [];
			stager?.reset();
			checkpoint();
		}
		onChanged?.();
	}

	/**
	 * Both composer buttons, TURN IN when `submitted` is true and SAVE DRAFT
	 * when it is false. `savedDraftId` decides the rest: null means create,
	 * anything else means this session already made an entry and every save
	 * from here on only ever adds to it -- `continueSaved` is the one and only
	 * place that can be true, and it is never reachable from a fresh composer.
	 */
	async function runSave(submitted: boolean, auto = false): Promise<SaveOutcome> {
		if (readOnly) return { ok: false, retryable: false, message: 'This is a read-only preview.' };

		if (auto) {
			// A manual save is writing exactly what this pass would. Retryable, so
			// the machine comes back once that click has settled and finds either
			// nothing left to do or whatever was typed meanwhile.
			if (busy || inFlight) return { ok: false, retryable: true, message: 'A save is already running.' };
			inFlight = true;
			try {
				return await autosaveDraft();
			} catch (err) {
				return { ok: false, retryable: true, message: (err as Error).message || 'The save failed to send.' };
			} finally {
				inFlight = false;
			}
		}

		if (busy) return { ok: true };
		// FLUSH FIRST, so this click continues the draft the autosave made
		// rather than racing it into a second entry. Deliberately before `busy`:
		// the machine may be mid-write, and its own run has to settle before the
		// decision below reads `savedDraftId`.
		await save.saveNow();
		if (busy) return { ok: true };

		const continuing = !!savedDraftId;
		if (!continuing && !canSubmit) return { ok: true };
		if (!continuing && (noteOnly ? !createNote : !createEntry)) return { ok: true };
		// A continuing draft with nothing the server has not already got, and no
		// request to turn it in, is a click with nothing to do. THE SAME
		// PREDICATE THE BUTTON READS -- this is the enforcing half of one rule,
		// not a second statement of it -- and it is read AFTER the flush above,
		// so whatever the autosave just landed has stopped counting.
		if (continuing && !submitted && !saveDraftDue) return { ok: true };

		busy = true;
		inFlight = true;
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
			inFlight = false;
			busy = false;
			progress = '';
		}
		return { ok: true };
	}

	/**
	 * WHY A PRESS DID NOTHING, SAID WHEN IT IS PRESSED (ledger 0298, R32).
	 *
	 * The composer used to carry the answer as a sentence under the buttons the
	 * whole time the box was empty ("This entry needs a photo or some writing"),
	 * which is an instruction a student reads before doing anything and never
	 * again. The buttons are `aria-disabled` instead of `disabled` -- a disabled
	 * control swallows its own press, so it can never explain itself -- and the
	 * same sentence arrives the moment somebody presses one with nothing to save.
	 * It clears itself as soon as there is something to save.
	 */
	let composerRefusal = $state<string | null>(null);
	/**
	 * WHICH PRESS WAS REFUSED, because the two clear on different facts. A
	 * refused Turn in is answered once there is anything to turn in; a refused
	 * Save draft ("This draft is saved.") is answered once there is something
	 * NEW -- and keyed on `canSubmit` alone it never cleared at all, since the
	 * saved words keep `canSubmit` true, so "This draft is saved." sat on screen
	 * over typing nothing had saved (ledger 0298 review).
	 */
	let refusedBy = $state<'turn-in' | 'save-draft' | null>(null);
	function nothingToSave(): string {
		// A PHOTO ON ITS WAY IS NOT "NO PHOTO": `hasPhotos` is false while the
		// stager is still checking one, and telling that student the entry needs
		// a photo is telling them something false about the one they just took.
		if (stagerSettling && uploadReady) return 'Your photo is still being checked. Press again in a moment.';
		if (!noteAllowed) return 'This entry needs a photo.';
		if (!uploadReady) return 'Photo uploads are unavailable here, so this entry needs some writing.';
		return 'This entry needs a photo or some writing; either one is enough.';
	}
	$effect(() => {
		const answered = refusedBy === 'save-draft' ? canSaveDraft : canTurnIn;
		if (answered) untrack(() => (composerRefusal = null));
	});

	async function onTurnInSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (!canTurnIn) {
			refusedBy = 'turn-in';
			composerRefusal = nothingToSave();
			return;
		}
		composerRefusal = null;
		await runSave(true);
	}

	async function onSaveDraftClick() {
		if (busy) return;
		if (!canSaveDraft) {
			refusedBy = 'save-draft';
			composerRefusal = savedDraftId ? 'This draft is saved.' : nothingToSave();
			return;
		}
		composerRefusal = null;
		await runSave(false);
	}

	/**
	 * A TEMPLATE'S HEADINGS, INTO THE BOX (ledger 0298, R32). The editor takes
	 * its document once, at mount, so the note arrives as the seed of a fresh
	 * instance -- the same remount a mirror restore and `resetForm` already use
	 * -- and nothing in the box is lost: `withTemplate` appends under anything
	 * `noteIsBlank` does not call blank, a textless grid included.
	 * An empty free entry takes the template's name as its title, which is the
	 * name it would otherwise have had to be given by hand.
	 */
	let editorFocus = $state<boolean | number | 'end'>(false);
	function insertTemplate(template: NoteTemplate) {
		if (busy || !noteAllowed) return;
		// The SAME predicate `withTemplate` decides by, so the cursor, the title
		// and the replace-or-append choice can never disagree about "empty".
		const empty = noteIsBlank(noteDraft);
		const next = withTemplate(noteDraft, template);
		restoredDoc = next;
		noteDraft = next;
		if (empty && selectedSession === null && !title.trim()) title = template.label;
		editorFocus = empty ? templateCursor(template) : 'end';
		noteKey += 1;
	}

	/**
	 * THE EXPLICIT NEW-RECORD ACTION (CLAUDE.md, "A manual save is a
	 * checkpoint, not a finish"). Save draft keeps this composer on the draft it
	 * made, so the next paragraph is more of the same entry; this is how a
	 * student leaves that draft where it is and starts another. It used to be the
	 * wide composer's Close, which went with the composer's own pane.
	 *
	 * What is owed is sent first; only what no write can carry (a photo that
	 * would not upload) is worth the question, and a confirmed discard ends that
	 * slot's life exactly as Close did.
	 */
	async function startNewEntry() {
		if (busy) return;
		await save.saveNow();
		if (busy) return;
		const left = notebookComposerHasWork(composerUnsaved);
		if (left && !window.confirm(`${NOTEBOOK_DISCARD_WARNING}\n\nDiscard it?`)) return;
		if (left) clearComposerMirrors();
		resetForm();
		composerRefusal = null;
		successMsg = null;
		editorFocus = true;
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
	/**
	 * FROM THE COMPOSER'S "Manage folders": open the manager AND bring it on
	 * screen. It sits at the head of the feed, under the composer and the list
	 * head, which at phone width with the filing panel open is a screen or more
	 * below the button that was pressed -- a press that changes nothing visible
	 * reads as a press that did nothing. `nearest` moves nothing when it is
	 * already in view, and the pane's `scroll-padding-top` keeps it clear of the
	 * sticky head above the breakpoint.
	 */
	function openFolderManager() {
		managerOpen = true;
		void tick().then(() =>
			document
				.querySelector<HTMLElement>('.nb-pane-card [data-testid="folder-manager"]')
				?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
		);
	}
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

	/**
	 * What the folders-and-filters disclosure says while it is shut: the
	 * folder in view, then how many filters narrow it, then the deleted view,
	 * in words. The disclosure is closed on arrival, so this line is the only
	 * thing on screen that says a list is narrowed.
	 */
	const filtersSummary = $derived.by(() => {
		if (showingDeleted) return DELETED_FILTER.label;
		const where =
			selection === 'all'
				? 'All entries'
				: selection === 'unfiled'
					? 'Unfiled'
					: (folders.find((f) => f.id === selection)?.name ?? 'All entries');
		const n = filters.length;
		return n ? `${where} · ${n} ${n === 1 ? 'filter' : 'filters'} on` : where;
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

	/**
	 * CLAMPED to whether there is still a list to show, the same shape as the
	 * stale-selection clamps above. Gating the chip on `deletedOffered` means it
	 * DISAPPEARS when the last deleted entry is restored -- so without this the
	 * pane would be left in the deleted view with the only control that leaves
	 * it no longer on screen. Reads nothing it writes, so it cannot cycle.
	 */
	$effect(() => {
		if (!deletedOffered) showingDeleted = false;
	});

	/**
	 * THE INBOX SWAPS THE LIST THE WAY "Recently deleted" DOES (ledger 0298), and
	 * the two are exclusive: each replaces the whole feed with a list of its own.
	 * It is a view over `entries` (drafts that answer no check-in), never a filter
	 * composed with the chips, so opening it needs no reset of the search.
	 */
	// svelte-ignore state_referenced_locally
	let showingInbox = $state(initialView === 'inbox' && !readOnly);

	/* Opening the deleted view closes the Inbox. */
	$effect(() => {
		if (showingDeleted) untrack(() => (showingInbox = false));
	});

	/**
	 * NOTHING TO LIST -- asked ONCE, because the pane is a head and a body now
	 * and both halves have to answer it. The head withholds the search and the
	 * list controls (a search box over nothing is a control whose only outcome is
	 * the state you are already in); the body renders the empty-state line in
	 * their place. Two spellings of the same question is the pair that stops
	 * agreeing, which is why this is a derived and not the condition written
	 * twice. The deleted view is NOT empty for this purpose: it is a separately
	 * loaded list that `entries` never contained, and its own empty state lives
	 * inside it.
	 */
	const listEmpty = $derived(entries.length === 0 && !showingDeleted && !showingInbox);

	// ---- the Inbox (ledger 0298) --------------------------------------------

	/** How many drafts the Inbox holds, by the Inbox's own rule (`inboxDrafts`). */
	const inboxCount = $derived(inboxDrafts(entries).length);

	function toggleInbox() {
		showingInbox = !showingInbox;
		if (showingInbox) showingDeleted = false;
	}

	/* A query-only navigation keeps this component, so a later `?view=inbox` (the
	   header's "Open notebook" pressed while already here) is followed too. */
	$effect(() => {
		if (initialView !== 'inbox' || readOnly) return;
		untrack(() => {
			showingInbox = true;
			showingDeleted = false;
		});
	});

	/**
	 * Open a draft from the Inbox: into the pane beside the list above the
	 * breakpoint, expanded in place in the feed below it -- the two ways a row
	 * of the feed opens, so the Inbox needs no third.
	 */
	function openFromInbox(id: string) {
		if (wide) {
			selectEntry(id);
			return;
		}
		showingInbox = false;
		clearQuery();
		expanded.add(id);
		void tick().then(() =>
			document
				.querySelector(`[data-entry-id="${CSS.escape(id)}"]`)
				?.scrollIntoView({ block: 'start', behavior: 'instant' })
		);
	}
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

<!--
	.nb-root scopes the notebook's own room (notebook-theme.css) and keeps it out
	of every other surface. It FOLLOWS THE SITE THEME now (ledger 0297): there is
	no plate attribute and no plate picker, and the room reads the classroom's
	own register -- IDEA, Matrix or Space White, whichever the site is on.

	`cr-app-body` IS THE CLASSROOM'S APPLICATION FRAME'S BODY, AND ONLY WHEN THIS
	COMPONENT IS THE PAGE. The notebook's routes take the `console` measure, so
	above 1024px `.cr-root` is the viewport, the classroom's chrome measures
	itself and this takes whatever is left -- and each pane of the split scrolls
	on its own (IDEA_INTERFACE_STANDARDS 1, "the page does not scroll; the panes
	do").

	THE KEY IS A PROP, NEVER A BRANCH ON THE MOUNT. `framed` is `ownsPage`, and
	its absence is what makes `scroll="fill"` safe everywhere else: without a
	bounded parent, `height: 100%` resolves against an auto height, the panes
	grow to their content and the surface degrades to exactly `page-flow` --
	split.css's own words -- so an unframed mount keeps the page flow it has
	always run on with nothing special-casing it.
-->
<div class="nb-root" class:cr-app-body={framed} class:nb-framed={framed}>
{#snippet composer()}
	<!--
		THE ONE-BOX COMPOSER (ledger 0298, R32): write, add a photo, save. It files
		itself -- to the check-in nearest today, the class the notebook is on and
		the folder filed in last, exactly the picks this component has always
		defaulted to -- and every one of those sits behind "Filed to ..., Change"
		rather than being asked first.

		`class:behind` rather than `{#if}`, for the reason it always was: the
		Inbox and the deleted view replace the list, and staged photos are File
		handles that exist nowhere but in this browser's memory, so hiding the
		composer must not destroy it.

		NO INSTRUCTIONS IN IT (docs/classroom/VISION.md, "No prose instructions in
		the interface"). What is left in words is a refusal, a failure, a state
		the student has to know about (a restored or held draft, a notebook that
		cannot autosave here) and the placeholder in the box.
	-->
	<section
		class="compose-card"
		class:behind={showingInbox || showingDeleted}
		data-testid="nb-compose"
		aria-labelledby="nb-compose-title"
		bind:this={composerEl}
	>
		<h2 id="nb-compose-title" class="sr-only">New entry</h2>

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
		<!-- WHAT THIS BROWSER PUT BACK, and a backup this build found and would
		     not open. Beside each other rather than inside the note field: a
		     restore can also have put a title and a check-in back, and the
		     sentence is about all of it. Never on screen together -- one mirror is
		     read per mount, and a held one was not restored. -->
		{#if mirrorNote}
			<p class="feedback error" role="status" data-testid="nb-mirror-restored">{mirrorNote}</p>
		{/if}
		{#if mirrorHeldNote}
			<p class="feedback error" role="status" data-testid="nb-mirror-held">{mirrorHeldNote}</p>
		{/if}

		<form class="compose-form" onsubmit={onTurnInSubmit}>
			<!--
				WHAT THE INSTRUCTOR ASKED FOR (0123), above the box, because it is the
				instruction the writing answers. The shared Disclosure on the shared
				rule, keyed on the check-in: it collapses once the work has started,
				and moving between two check-ins shows each one's own remembered
				answer. ItemBody, because this IS a classroom item body.
			-->
			{#if showGuidance && pickedGuidance}
				<div class="nb-guidance" data-testid="check-in-guidance-panel">
					<Disclosure
						label="What to do"
						scope={`check-in:${shownFiling.session}:guidance`}
						collapseWhen={composerStarted}
						testId="check-in-guidance-disclosure"
					>
						{#snippet meta()}{shownSession?.session_label ?? ''}{/snippet}
						<ItemBody item={{ body: '', body_doc: pickedGuidance }} compact />
					</Disclosure>
				</div>
			{/if}

			<div class="compose-write">
				<!--
					ONE editor, in one block on purpose: its position and its `{#key}`
					never change with the filing, so moving between a check-in and a
					free entry never remounts Tiptap and never drops what was typed.
				-->
				{#if noteAllowed}
					<div class="note-field" data-testid="nb-compose-box">
						{#key noteKey}
							<!-- `initialDoc`, not `value`: what the mirror kept, and what a
							     template adds, is the EDITOR'S own shape. -->
							<NoteEditor
								initialDoc={restoredDoc}
								onchange={(doc) => (noteDraft = doc)}
								disabled={busy}
								{viewerId}
								label="New entry"
								placeholder="What did you work on?"
								autofocus={editorFocus}
							/>
						{/key}
						{#if mirrorBlocked}
							<p class="hint" role="status" data-testid="nb-mirror-unavailable">
								{MIRROR_UNAVAILABLE_NOTE}
							</p>
						{/if}
					</div>
					<NoteTemplates onInsert={insertTemplate} disabled={busy} />
				{/if}
			</div>

			<div class="compose-send">
				<!-- Either half saves an entry; nothing here is a mode. -->
				<PhotoStager
					bind:this={stager}
					bind:staged
					bind:settling={stagerSettling}
					disabled={busy}
					correctFirst={false}
					compact
					{uploadReady}
					captureContext={{
						session: selectedSession,
						section: selectedSectionId,
						title,
						folder: folderChoice
					}}
				/>

				<ComposerFiling
					where={filedWhere}
					state={filedState}
					{open}
					{entries}
					{draftsReady}
					selectedSession={shownFiling.session}
					selectedSectionId={shownFiling.session ? shownFiling.section : null}
					locked={filingLocked}
					onChoose={chooseSession}
					{classes}
					{scopeSectionId}
					bind:title
					bind:freeSectionChoice
					bind:folderChoice
					{foldersReady}
					folders={orderedFolders}
					onFolderChange={() => (folderTouched = true)}
					onManageFolders={folderTransports ? openFolderManager : undefined}
					{busy}
				/>

				<!-- A STATE, NOT AN INSTRUCTION: without it a composer that does not
				     save itself looks identical to one that does. -->
				{#if !autosaveReady && noteAllowed}
					<p class="note no-autosave-note" data-testid="nb-no-autosave-note">
						Your writing is not saved automatically here.
					</p>
				{/if}
				{#if composerRefusal}
					<p class="refusal" role="status" data-testid="nb-compose-refusal">{composerRefusal}</p>
				{/if}

				<div class="actions">
					<!-- Primary, and the form's submit: Enter turns the entry in. -->
					<button
						class="btn"
						type="submit"
						data-testid="nb-turn-in"
						disabled={busy}
						aria-disabled={!canTurnIn}
					>
						{busy ? 'Saving...' : 'Turn in'}
					</button>
					{#if draftsReady}
						<button
							type="button"
							class="btn secondary"
							data-testid="nb-save-draft"
							disabled={busy}
							aria-disabled={!canSaveDraft}
							onclick={onSaveDraftClick}
						>
							{busy ? 'Saving...' : 'Save draft'}
						</button>
						{#if savedDraftId && !busy}
							<button
								type="button"
								class="btn secondary"
								data-testid="nb-new-entry"
								onclick={startNewEntry}
							>
								New entry
							</button>
						{/if}
					{/if}
					{#if progress}<span class="progress">{progress}</span>{/if}
					<!-- WHERE AN AUTOSAVE SPEAKS: per-instance, inside the surface that
					     owns the work; `saved` carries the clock time. -->
					{#if autosaveReady}
						<SaveIndicator state={save} />
					{/if}
				</div>
			</div>
		</form>
	</section>
{/snippet}

{#snippet navPane()}
	<!--
		THE NAVIGATION PANE IS THE STUDENT'S LOG (ledger 0298, R32): the one-box
		composer at the top, then the list's head, then the feed. Above the
		breakpoint the pane is bounded by its own frame, drops the card chrome it
		wears at phone width (see .nb-pane-card below), and scrolls as ONE column:
		the composer scrolls away with the feed and the list's head stays at the
		top of the pane once it reaches it.
	-->
	<section
		class="card nb-pane-card"
		data-testid="nb-entries"
		style:--nb-list-head-h="{listHeadHeight}px"
	>
		{#if composerMounted}
			{@render composer()}
		{/if}
		<!--
			THE LIST PANE IS A HEAD AND A BODY, AND WHICH ROW GOES WHERE WAS A
			MEASUREMENT RATHER THAN A TASTE. Above the breakpoint the pane is
			bounded, so its direct child may fill it (`max-height: 100%`, which
			split.css grants a fill-height nav pane exactly so a surface can keep
			a header on screen while its body scrolls) and the head stays put
			while the list moves under it.

			THE FOLDER RAIL AND THE FILTER CHIPS ARE IN THE BODY, NOT THE HEAD, AND
			THAT WAS A MEASUREMENT. Measured at 1440 on the harness fixture, the
			pane is 569px and the two of them are 277px of it (the rail wraps to
			lines of 44px chips in a 26rem pane and the filters take two more), so
			in the head the head would be 458 of 569 and the list would have 111px
			to scroll in. In the body the head is 181 and the list has 388. A
			folder and a filter are SET ONCE and then read; the search and the
			sort are used WHILE scanning, so those two are what stay.

			A FLEX COLUMN, NEVER A GRID. A grid with an implicit `auto` track
			sizes that track to its widest item's min-content contribution, and at
			phone width the folder rail's is the sum of its chips -- its strip
			SCROLLS below the breakpoint rather than wrapping -- which puts the
			rail's whole content width on the pane and the document. Block and
			column-flex children take the container's width instead and let the
			strip scroll inside it.
		-->
		<div class="list-head" bind:offsetHeight={listHeadHeight}>
			<div class="pane-head">
				<h2>{readOnly ? 'Entries' : showingInbox ? 'Inbox' : 'My entries'}</h2>
				{#if !readOnly && draftsReady}
					<!--
						THE INBOX (ledger 0298): drafts that answer no check-in, which is
						where every quick note lands. A toggle like Recently deleted, with
						its count in words beside its name, at every width.
					-->
					<button
						type="button"
						class="btn secondary inbox-toggle"
						data-testid="nb-inbox-toggle"
						aria-pressed={showingInbox}
						onclick={toggleInbox}
					>
						{showingInbox ? 'All entries' : `Inbox (${inboxCount})`}
					</button>
				{/if}
			</div>

			{#if !listEmpty && !showingInbox}
				<div class="toolbar">
					{#if !showingDeleted}
						<label class="search">
							<span class="sr-only">{searchLabel}</span>
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
					{#if !showingDeleted}
					<!--
						THE LIST CONTROLS ARE A LINE OF THEIR OWN, AND ITS BUTTONS ARE
						BOXES, NOT REACHES. This row used to sit at the right end of the
						filter line as three underlined words with a `.tap-reach-44` hit
						area and `--tap-reach-w: 0px` -- correct for a word inside a
						sentence, and wrong here, where the shortest word ("Select",
						"Done", "Clear") walked 32.5px wide against a 44px floor. That
						was the repo's only standing outside-threshold pair, at 375 and
						1440, for weeks (decision 12, item 2). The arithmetic that kept
						it standing was the ROW: at 375 it had 293px and needed 346px at
						44px each, so widening the words alone bought a 13px overflow.

						Giving the controls their own wrapping line dissolves the
						arithmetic: nothing shares the line with the sort and the
						count except by choice, so each control can be an ordinary
						44px box (IDEA_INTERFACE_STANDARDS 10) and the line takes a
						second row at phone width instead of the page taking a
						scrollbar. The harness measures them as boxes now
						(`tapTargets`), which is the check a box should face.
					-->
					<div class="tools">
						<span class="result-count" data-testid="result-count">
							{visible.length === entries.length
								? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
								: `${visible.length} of ${entries.length}`}
						</span>
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
						<div class="tool-set">
							{#if narrowed}
								<button type="button" class="tool-btn" data-testid="clear-query" onclick={clearQuery}>
									Clear
								</button>
							{/if}
							<!-- Nothing to expand above the breakpoint: the rows there open
							     into the pane beside them rather than in place. -->
							{#if !wide}
								<button
									type="button"
									class="tool-btn"
									data-testid="expand-toggle"
									onclick={() => (expanded.size ? collapseAll() : expandAll())}
								>
									{expanded.size ? 'Collapse all' : 'Expand all'}
								</button>
							{/if}
							{#if foldersReady && folderTransports}
								<button
									type="button"
									class="tool-btn"
									class:on={selectMode}
									aria-pressed={selectMode}
									data-testid="select-toggle"
									onclick={() => (selectMode ? exitSelectMode() : (selectMode = true))}
								>
									{selectMode ? 'Done' : 'Select'}
								</button>
							{/if}
						</div>
					</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- THE BODY: everything that scrolls. Under page-flow (below the
		     breakpoint, and the view-as mount at any width) the pane is auto
		     height, so this box has nothing to scroll inside and the whole
		     column flows exactly as it did before it had a head. -->
		<div class="list-body">
			<!--
				THE FOLDER MANAGER, AHEAD OF THE BRANCHES BELOW RATHER THAN INSIDE THE
				NON-EMPTY ONE (ledger 0298 review). The composer's "Manage folders" is
				a box now, and a student whose notebook is still empty -- the first
				day, which is when folders get set up -- pressed it and got nothing,
				because the manager only rendered once there was a feed to sit above.
			-->
			{#if !showingInbox && !showingDeleted && foldersReady && managerOpen && folderTransports}
				<FolderManager
					{folders}
					counts={counts as Map<string, number>}
					busy={folderBusy}
					onSave={saveFolder}
					onDelete={deleteFolder}
					onClose={() => (managerOpen = false)}
				/>
			{/if}
			{#if showingInbox}
				<NotebookInbox
					{entries}
					{sessions}
					{classes}
					{scopeSectionId}
					{scopeLabel}
					today={todayIso()}
					{createNote}
					{deleteEntry}
					onOpen={openFromInbox}
					{onChanged}
					{quickNoteShown}
					{onQuickNoteShown}
				/>
			{:else if listEmpty}
				<p class="note empty-state">
					{#if readOnly}
						Nothing in this notebook yet.
					{:else}
						No entries yet.
					{/if}
					{#if deletedOffered}
						<button
							type="button"
							class="inline-link deleted-link tap-reach-44"
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

				<!--
					Rail and chips together: one filtering block, one rule under it.

					BEHIND A DISCLOSURE, CLOSED ON ARRIVAL, WITH THE SELECTION IN ITS
					META (ledger 0297). Open, this block measured 277px of a 528px
					pane at 1366x768 -- the rail wraps to lines of 44px chips and the
					filters take two more -- which left the list 0 visible entries under
					it. A folder and a filter are SET ONCE and then read, so what has to
					stay on screen is WHICH ones are set, not the controls for setting
					them: the meta says the folder, the filter count and the deleted
					view in words, so a narrowed list never reads as a short one. The
					shared Disclosure remembers a press per viewer, so a student who
					keeps it open finds it open. Closed-by-default is `collapseWhen`
					constant-true, the spelling the grading console's panels use.
				-->
				<div class="list-filters-disc">
				<Disclosure
					label="Folders and filters"
					scope="notebook:list-filters"
					collapseWhen={true}
					testId="nb-filters-toggle"
				>
					{#snippet meta()}<span data-testid="nb-filters-summary">{filtersSummary}</span>{/snippet}
				<div class="list-filters">
					{#if !showingDeleted && foldersReady}
						<FolderRail
							{folders}
							{counts}
							{selection}
							onSelect={(next) => (selection = next)}
							onManage={folderTransports ? () => (managerOpen = !managerOpen) : undefined}
						/>
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
										title={filterHint(f.id, f.hint)}
										data-testid="filter-{f.id}"
										onclick={() => toggleFilter(f.id)}
									>
										{f.label}
									</button>
								{/each}
							{/if}
							<!--
								GATED ON `deletedOffered`, WHICH INCLUDES THE LENGTH. `deletionReady`
								alone asks whether 0117 is APPLIED and says nothing about whether
								this caller was handed an answer -- and both it and `deletedEntries`
								default to on/empty, so every read-only mount (the per-student review
								page, /classroom/view-as's notebook), neither of which loads a
								deleted list at all, drew a chip whose only possible outcome was the
								empty state below it. The empty-state link above already asked both
								questions; this asked only the first.
							-->
							{#if deletedOffered}
								<button
									type="button"
									class="chip-toggle deleted-toggle"
									class:on={showingDeleted}
									aria-pressed={showingDeleted}
									title={filterHint('deleted', DELETED_FILTER.hint)}
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
									title={filterHint(DRAFT_FILTER.id, DRAFT_FILTER.hint)}
									data-testid="filter-drafts"
									onclick={() => toggleFilter(DRAFT_FILTER.id)}
								>
									{DRAFT_FILTER.label}
								</button>
							{/if}
						</div>
				</div>
				</Disclosure>
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
							<button type="button" class="inline-link tap-reach-44" onclick={() => picked.clear()}>
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
						<button type="button" class="inline-link tap-reach-44" onclick={clearQuery}>Clear the filters</button>
					</p>
				{:else}
					{#each groups as group (group.key)}
						<div class="group">
							<h3 class="group-head">{group.label}</h3>
							<ol class="entries">
								{#each group.entries as entry (entry.id)}
									<li data-entry-id={entry.id}>
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
											onAddCorrected={addPhoto ? addCorrectedToEntry : undefined}
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
											onNoteDirty={noteEditorDirty}
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
		</div>
	</section>
{/snippet}

{#snippet detailPane()}
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
											onAddCorrected={addPhoto ? addCorrectedToEntry : undefined}
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
										onNoteDirty={noteEditorDirty}
				/>
			</div>
		{/key}
	{/if}

{/snippet}

<main class="nb-shell" class:nb-shell-fill={framed}>
	<!--
		THE PAGE HEAD, NOT A HERO. The three-line paragraph that used to open this
		page ("Photograph your engineering notebook pages...") was reading material
		between a student and their work on every return visit, which
		IDEA_INTERFACE_STANDARDS 1 names as a cost. What survives of it is the one
		sentence that matters -- who can see this -- in one line. The rest of the
		head is what needs doing: the class, the review link for staff, the next
		check-in due and the drafts still to turn in, each a control where it can
		be one.

		READ-ONLY MOUNTS ADDRESS THE READER, NOT THE AUTHOR: an instructor looking
		at a student's notebook is told whose it is and who may see it, never
		"only you". Same rule as `searchLabel` above.

		ONE LINE, INSIDE THE CLASSROOM (ledger 0297). The "IDEA // Notebook"
		eyebrow and the display-size title belonged to a separate app announcing
		itself; the classroom's crumbs and tabs say where you are now, so the head
		is the title, the one sentence and the status chips, on one row where the
		window has room.
	-->
	<header class="nb-head nb-block" data-testid="nb-head">
		<NotebookHead
			{readOnly}
			{configured}
			{sessionsReady}
			{draftsReady}
			checkIn={headCheckIn}
			{draftCount}
			draftsPressed={filters.includes(DRAFT_FILTER.id) && !showingDeleted}
			{sectionLabel}
			{timelineHref}
			{allClassesHref}
			{canReview}
			{reviewHref}
			onCheckIn={focusCheckIn}
			onDrafts={showDrafts}
		/>
	</header>

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

			`scroll="fill"`, WHERE THIS USED TO BE `page`. The argument for `page`
			was the HERO: ~355px of chrome above the split and ~100px below it left
			viewport-height panes overflowing the viewport, so the document scrolled
			as well and a bar sat inside a bar. The hero is a head now, and since
			ledger 0297 the frame is the CLASSROOM's: its shell is the `.cr-root`
			frame, which measures its own chrome and gives this body the rest --
			so nothing here
			names a chrome height and there is no arithmetic left to be wrong about.
			What `page` cost was the thing this pane is for: at 1440 the document
			ran 1677px against a 900px viewport, so scrolling to the foot of a
			1130px compose form took the feed off screen with it and scrolling the
			feed took Turn in off screen.

			THE OTHER HALF OF THE `page` ARGUMENT WAS /classroom/view-as, AND THE
			FRAME ANSWERS IT WITHOUT A BRANCH HERE. That mount does not pass
			`ownsPage`, so this root is no frame body, and `fill` then resolves against
			an auto height and degrades to page-flow by construction (split.css's
			own words). `revealDetailPane` is kept for exactly that mount, where the
			detail column still starts wherever the document has scrolled to.

			`hasDetail` IS "SOMETHING IS OPEN": the entry you picked, or the compose
			form. With neither the detail pane is not rendered and the list takes
			the whole measure in `auto-fit` columns.
		-->
		<div class="nb-split">
			<ClassSplit
				narrow="stack"
				scroll="fill"
				bind:detailEl
				hasDetail={detailHasContent}
				nav={navPane}
			>
				{@render detailPane()}
			</ClassSplit>
		</div>
	{/if}

	<div class="nb-block nb-foot">
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
	/* A HEAD AND A BODY, the review console's shape: one column, and the ONE
	   growable child (the split) says so itself. Not a grid with named rows --
	   the number of blocks above the split is not fixed (a notice strip
	   appears, an availability banner renders), and a grid would put the split
	   in an auto row the moment one of them did, which is the shape that stops
	   bounding it and hands the page a second scrollbar. */
	.nb-shell {
		max-width: none;
		/* No top padding of its own inside the classroom: the tab bar or the
		   crumbs above already carry the step, and the head is one line. */
		padding: 0 0 4.5rem;
		display: flex;
		flex-direction: column;
		/* `margin: 0` IS LOAD-BEARING AND IS NOT TIDINESS. app.css gives every
		   `main` a `margin: 0 auto`, and `.nb-framed` makes `.nb-root` a flex
		   COLUMN at every width (only its viewport HEIGHT is above the
		   breakpoint), so
		   this element became a flex item -- and an auto cross-axis margin
		   SWITCHES OFF `align-items: stretch`. The item is then sized
		   `fit-content`, which cannot go below its own min-content, and the
		   folder rail's is ~700px. Measured at 375 with the auto margin still
		   in place: the shell laid out at 699.7px inside a 375px root and put
		   325px of overflow on the document. `min-width: 0` does NOT fix this
		   and was tried -- the computed min-width was already 0 on every box in
		   the chain; the automatic minimum is a different mechanism from the one
		   that was biting. With the margin gone the item stretches to 375 and
		   the rail's strip scrolls inside it, exactly as it did when this was an
		   ordinary block. */
		margin: 0;
		min-width: 0;
	}
	/* The bounded parent `scroll="fill"` needs: it takes the rest of the body's
	   column and the split takes all of it. Under page-flow -- no frame, which
	   is the view-as mount, or any width below the breakpoint -- this is an
	   auto-height flex row and the split simply flows. */
	.nb-split {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
		/* Same trap one level in: the split's own panes size themselves. */
		min-width: 0;
	}
	/* THE SPLIT TAKES THE ROW'S WIDTH AT EVERY WIDTH. Above 1024px split.css
	   gives it `width: 100%`; below it the split is a flex item in this row
	   with nothing saying so, and a flex item's width is its content's.
	   Measured at 960: both read-only notebooks drew a 370px list in a 960px
	   window (the review page and view-as alike, which is the page-flow
	   mount), and the phone was only right because its content happened to
	   be wider than the phone. */
	.nb-split > :global(.cr-split) {
		flex: 1 1 0%;
		min-width: 0;
	}
	/* Pinned at the foot of the frame, as the review console's is, rather than
	   growing to absorb the column. */
	.nb-foot {
		flex: none;
	}
	/* THE CLASSROOM'S OWN MEASURE (ledger 0297). Inside the shell the crumbs
	   and tabs read `--cr-measure`, and this reads the same number, so the head,
	   the notice strip and the split start on the same left edge as the chrome
	   above them. It used to be capped at the split's own measure and centred
	   while the split spanned the window: measured, the two left edges sat
	   70px apart at 1366 and 330px apart on the read-only views at 1440. */
	/* `width: 100%` BECAUSE THE FRAME IS A FLEX COLUMN: an auto-margined
	   child of one shrinks to its content, so the head measured 1265px wide
	   and centred at x=50 in a 1366 window while the split's panes started
	   at x=32. */
	.nb-block {
		width: 100%;
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		padding: 0 var(--cr-gutter);
		box-sizing: border-box;
	}
	/* THE BODY OF THE CLASSROOM'S FRAME: a column whose one growable child is
	   the shell. Above 1024px split.css makes this `.cr-app-body` the rest of
	   the viewport; below it everything flows. */
	.nb-root.nb-framed {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.nb-framed > .nb-shell {
		flex: 1 1 auto;
		min-height: 0;
	}
	.notice-strip {
		margin-bottom: var(--space-4);
	}
	.notice-strip .feedback {
		margin-bottom: var(--space-2);
	}
	/* The blocks outside the split keep the old card rhythm. */
	.nb-block.card,
	.nb-pane-card {
		margin-bottom: var(--space-5);
	}
	.nb-shell h2 {
		margin-top: 0;
	}
	/* --- the log pane: the composer, a head and a body ----------------------
	   ONE COLUMN IN DOCUMENT ORDER AT EVERY WIDTH (ledger 0298, R32): the
	   composer, then the list's head, then the feed. Below the breakpoint (and
	   on the view-as mount at any width) nothing is bounded and the three simply
	   flow, composer first, which is the order a phone reads them in.

	   ABOVE IT THE PANE ITSELF IS THE SCROLLER -- split.css bounds a fill-height
	   nav pane's direct child at `max-height: 100%` -- so the composer scrolls
	   away with the feed and the head STICKS at the top of the pane once it gets
	   there. This used to pin the head as a flex sibling of a scrolling body,
	   which cannot put the composer ABOVE the head and still let it scroll: a
	   flex sibling above a pinned head is pinned too, and the composer is too
	   tall to pin in a 26rem pane beside an open entry. The sticky head needs no
	   hand-written offset -- it is `top: 0` -- and its `scroll-padding` is the
	   head's own MEASURED height (`listHeadHeight`), never a constant, so a
	   control focused under it is brought out from behind it. */
	.nb-pane-card {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}
	/* Block-level children, never a grid track: see the markup comment for the
	   folder rail's min-content contribution and what a grid does with it. */
	.compose-card,
	.list-head,
	.list-body {
		flex: none;
		min-width: 0;
	}
	/* The rail and the chips are one filtering block with one rule under it,
	   which is the rule the toolbar used to carry before the two halves parted
	   company. */
	.list-filters-disc {
		margin-bottom: var(--space-2);
		border-bottom: 1px solid var(--hairline);
	}
	.list-filters {
		padding: var(--space-2) 0 var(--space-4);
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
	.inbox-toggle {
		flex: none;
	}
	/* The heading takes the slack, so the Inbox toggle sits at the end. */
	.pane-head h2 {
		flex: 1 1 auto;
	}
	/* Hidden, not unmounted -- see the markup. */
	.compose-card.behind {
		display: none;
	}
	.open-entry {
		padding-bottom: var(--space-5);
	}

	/* A pane's own narrow-width gutter is declared once for the ROOM, in
	   notebook-theme.css, so both notebook screens get it from one place. */

	@media (min-width: 1024px) {
		/* The pane IS the frame above the breakpoint (split.css draws it), so the
		   list drops the card chrome it wears at phone width rather than sitting
		   as a second box inside the first. Written under `.nb-root` because
		   the room's own card skin (`.nb-root .card` in notebook-theme.css)
		   is as specific as a bare class here and paints the card's ground
		   back: measured, the pane drew a second 366px box in a 416px frame
		   inside the classroom shell until this outranked it. */
		.nb-root .nb-pane-card {
			border: none;
			background: none;
			box-shadow: none;
			padding: 0;
			/* BOTH margins, not just the bottom one. `.card`'s 1.25rem top margin
			   is outside the box `max-height: 100%` caps, so the pane's own
			   scrollport overflowed by exactly that margin -- a 20px second
			   scrollbar on the pane. Measured 637 against a 617px scrollport
			   before, 617 after. */
			margin: 0;
			/* The log scrolls as one column; see the section header above. */
			overflow-y: auto;
			overscroll-behavior: contain;
			scroll-padding-top: var(--nb-list-head-h, 0px);
		}
		/* STICKS WITH A z-index AND AN OPAQUE GROUND (CLAUDE.md, the sticky
		   header trap): positioned rows paint in tree order and would otherwise
		   paint straight over it, and a see-through head over moving text is
		   two lines on top of each other. 3, one above the grid editor's own
		   sticky cells (2), which can sit in the composer scrolling under it. */
		.list-head {
			position: sticky;
			top: 0;
			z-index: 3;
			background: var(--nb-bg);
		}
		/* The composer's own box at desktop width, where the pane has no card
		   chrome: it is the one thing on the page that is being written, so it
		   reads as raised paper above a feed that sits on the ground. */
		.nb-pane-card > .compose-card {
			margin-top: var(--space-1);
			padding: var(--space-4);
			border: 1px solid var(--boundary);
			border-radius: var(--radius-card);
			background: var(--surface-1);
		}
		/* Inside the frame the body IS the viewport's remainder, so the 4.5rem
		   of tail the single-column page carries is 4.5rem the panes do not
		   get. It is only ever the frame's, which is why it is compounded with
		   `.nb-shell-fill` rather than written on `.nb-shell`: the view-as mount
		   is still a document and still wants its tail. */
		.nb-shell.nb-shell-fill {
			padding-bottom: var(--space-3);
		}
	}
	/* ---- the page head -------------------------------------------------
	   Title on the left, status on the right, on one line where there is
	   room and stacked where there is not. Inside the classroom (ledger 0297)
	   the crumbs and tabs above already say where you are, so the head is one
	   title-sized line and a rule, not a banner: the split starts a head
	   shorter than it did. */
	.nb-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-5);
		flex-wrap: wrap;
		padding-bottom: var(--space-3);
		margin-bottom: var(--space-3);
		border-bottom: 1px solid var(--hairline);
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

	/* The instructor's prompt (0123). A framed block rather than loose prose,
	   so it reads as somebody else's words in a form full of the student's --
	   and `min-width: 0` because a grid child's automatic minimum is its
	   min-content, which a pasted URL in a prompt would push past the pane. */
	/* RAISED PAPER, NOT RECESSED. This started as a CONTRAST argument and is
	   no longer one: `--nb-accent-ink` was the brass deepened just far enough
	   to read on the page ground, so an authored link in a prompt measured
	   4.32:1 on the RECESSED plate (--surface-2, #F2F1EA) against 4.83 on the
	   raised one, and raised was the only one over the bar. The ink has since
	   been deepened again -- the light plate's inks are now measured against
	   the WASH grounds too, not only the bare plates -- and the same link
	   measures 5.02 recessed against 5.69 raised, so both clear. What keeps it
	   raised is the reason that was always the better half: the prompt is
	   somebody else's words sitting above the student's form, and that is what
	   raised paper says. The identity colour does not move; the derived one
	   did. */
	.nb-guidance {
		min-width: 0;
		margin: var(--space-3) 0 0;
		padding: 0 var(--space-3);
		border: 1px solid var(--hairline);
		border-left: 3px solid var(--nb-accent-ink);
		border-radius: var(--radius-control);
		background: var(--surface-1);
	}
	/*
		PRINTED, WITHOUT ITS PLATE. Disclosure already prints its region whatever
		the screen was showing and drops its own trigger, so all this has to do is
		stop the panel spending ink on a background nobody asked for.

		STATED PLAINLY: THIS IS INERT TODAY. There is no print rendering anywhere
		in the notebook -- no @media print under src/lib/notebook or
		src/routes/notebook, and none in app.css -- so printing this page prints
		the whole application shell. This rule is correct for the day that changes
		and is not a claim that the notebook prints well now.
	*/
	@media print {
		.nb-guidance {
			background: none;
			border-color: var(--hairline);
		}
	}
	/*
	 * A STATE THE STUDENT HAS TO KNOW, not a warning colour: nothing has gone
	 * wrong, the writing simply is not saved by itself here. `.note`'s own
	 * `--text-2`.
	 */
	.no-autosave-note {
		margin: 0;
		font-size: 0.85rem;
	}
	/* What a press with nothing to save is told, where the press was. The
	   room's secondary ink, measured for text on the card and the page. */
	.refusal {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-1);
		padding-left: var(--space-2);
		border-left: 3px solid var(--nb-warn);
	}
	.hint {
		display: block;
		color: var(--text-3);
		font-size: 0.8rem;
		margin-top: var(--space-1);
	}

	/* ---- the one-box composer (ledger 0298, R32) ------------------------
	   THE TOP OF THE LOG: the box, the templates, the photos, where it is
	   filed, and the two acts. One column in a narrow pane; in a pane wide
	   enough for two, the writing takes the left and everything about sending
	   it takes the right, so neither half is a row of two buttons stretched
	   across 1300px. The breakpoint is the COMPOSER's own width, because the
	   same component sits in a 26rem list beside an open entry and in the
	   whole measure when nothing is open. */
	.compose-card {
		container: nb-compose / inline-size;
		min-width: 0;
		padding-bottom: var(--space-4);
		margin-bottom: var(--space-4);
		border-bottom: 1px solid var(--hairline);
	}
	.compose-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.compose-write,
	.compose-send {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.note-field {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		min-width: 0;
	}
	/* A wrapping ROW, not a grid: the guidance takes a line of its own and the
	   two halves share the next, the writing taking the larger share. */
	@container nb-compose (min-width: 50rem) {
		.compose-form {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: flex-start;
			column-gap: var(--space-5);
		}
		.compose-form > .nb-guidance {
			flex: 1 1 100%;
		}
		.compose-write {
			flex: 3 1 0;
		}
		.compose-send {
			flex: 2 1 17rem;
		}
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	/* The shared .btn class pads to ~39px, under the 44px touch target these
	   need: turning an entry in and saving a draft are the two acts this whole
	   form exists for. Scoped here rather than raised on .btn itself. */
	.actions .btn {
		min-height: 2.75rem;
	}
	/* `aria-disabled`, never `disabled`, so a press can say why it did nothing
	   (`composerRefusal`); drawn as the room's own disabled button. */
	:global(.nb-root) .actions .btn[aria-disabled='true'],
	:global(.nb-root) .actions .btn[aria-disabled='true']:hover {
		background: var(--surface-2);
		border-color: var(--nb-hairline-strong);
		color: var(--text-3);
		cursor: not-allowed;
		box-shadow: none;
	}
	.progress {
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}
	.inline-link {
		/* 20-20.5px measured, at eleven call sites. It CANNOT grow: several of
		   these sit mid-sentence in a hint or an empty-state line ("Clear the
		   filters"), and a 44px box there reflows the writing around it. The
		   hit area is expanded instead -- see `.tap-reach-44` in src/app.css.
		   Height only, so two on the same line keep their own taps
		   (IDEA_INTERFACE_STANDARDS 10). */
		--tap-reach-w: 0px;
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

	/* ---- toolbar ------------------------------------------------------
	   THREE LINES, IN THE ORDER A PERSON NARROWS A LIST: what am I looking
	   for (search), which kind (filters), then how the result is arranged and
	   acted on (count, sort, the list controls). It was one wrapping flex line
	   with the controls pushed to the right by `margin-left: auto`, which is
	   what put three text controls under the 44px floor: the line they shared
	   with the sort and the count had no room to give them. A grid of rows
	   has nothing to share. */
	/* NOT A GRID, for the reason the markup comment gives: a single implicit
	   `auto` track sizes to its widest item's min-content, and a row of
	   controls that must WRAP has a large one.

	   A WRAPPING ROW OF TWO BLOCKS (ledger 0298), where it was a column: the
	   search and the list controls share ONE line when the pane has room for
	   both -- the whole measure, with nothing open -- and stack exactly as they
	   did in a phone or a 26rem pane. The controls stay one block with their
	   own wrap, so no line is ever shared between the sort and a 44px button
	   again, which is what the column was protecting. Measured at 1440: the
	   head of the log is a line shorter, and that line is a feed row. */
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding-bottom: var(--space-4);
		margin-bottom: var(--space-2);
		border-bottom: 1px solid var(--hairline);
	}
	.toolbar > * {
		min-width: 0;
	}
	.toolbar > .search {
		flex: 1 1 18rem;
	}
	.toolbar > .tools {
		flex: 1 1 auto;
	}
	.search {
		/* 22px measured (the label is the target; the input inside it has no
		   border of its own). 44px floor (IDEA_INTERFACE_STANDARDS 10). */
		min-height: 44px;
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
		/* 29.4px measured. 44px floor (IDEA_INTERFACE_STANDARDS 10). */
		min-height: 44px;
		display: inline-flex;
		align-items: center;
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
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		font-size: 0.78rem;
		/* The automatic-minimum trap: a nowrap child (the sort select's longest
		   option) would otherwise push this row, and the page, past the
		   viewport rather than wrapping. */
		min-width: 0;
	}
	.result-count {
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		/* First on the line, and the sort sits beside it; the controls take
		   whatever is left and wrap when there is none. */
		margin-right: var(--space-1);
	}
	/* THE LIST CONTROLS: ordinary 44px boxes (IDEA_INTERFACE_STANDARDS 10),
	   square-cornered so they read as ACTIONS beside the round filter chips
	   above them, and quiet until pressed. `margin-left: auto` on the group
	   keeps them at the right end of the line where there is room, and
	   `flex-wrap` on the row hands them a line of their own where there is
	   not. */
	.tool-set {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}
	.tool-btn {
		min-height: 44px;
		min-width: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--space-3);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		color: var(--text-2);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.tool-btn:hover {
		border-color: var(--text-3);
		color: var(--text-1);
	}
	.tool-btn.on {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
		color: var(--nb-accent-ink);
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
		/* 28px measured. 44px floor (IDEA_INTERFACE_STANDARDS 10). `min-height` on a select is honoured
		   without changing its display, which inline-flex would not be. */
		min-height: 44px;
		font-size: 0.78rem;
		padding: var(--space-1) var(--space-2);
		border-color: var(--boundary);
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
	/* THE LIST USES THE WIDTH IT IS GIVEN. Above the breakpoint, with nothing
	   open, the split hands the navigation pane the whole measure (split.css's
	   `:not(.has-detail)` rule) -- and a two-line row with a 40px tile across
	   1376px is the "fixed-width column centred in the room it was just given"
	   defect one level in. Each date group lays its rows out in columns
	   instead, `auto-fit` so a group of two gets two columns rather than two
	   and a void, and the column is wide enough for a title, four indicators
	   and a folder name without ellipsising the title on the fixture feed.
	   The moment something opens, the pane narrows to 26rem and this is one
	   column again with no rule of its own. */
	@media (min-width: 1024px) {
		:global(.cr-split:not(.has-detail)) .entries {
			grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr));
			column-gap: var(--space-4);
		}
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
		border: 1px solid var(--boundary);
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

</style>
