<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import Pending from '$lib/Pending.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { pendingLabel } from '$lib/pending';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import CheckInStager from '$lib/classroom/CheckInStager.svelte';
	import FileUploadPanel, { type PanelUpload } from '$lib/classroom/FileUploadPanel.svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import {
		DEFAULT_ITEM_LAYOUT,
		RENAME_REFUSALS,
		imageChoices,
		itemLayoutOf,
		renameBlockedReason,
		renameCollides,
		renamedAttachmentFilename,
		sameLayout,
		sameOrder,
		type ClassroomLayoutTransports,
		type ItemLayout,
		type ResourcePlacement
	} from '$lib/classroom/attachments';
	import { movedList, sortDrag } from '$lib/classroom/sort-drag';
	import RubricBuilder from '$lib/classroom/RubricBuilder.svelte';
	import SpecImporter from '$lib/classroom/SpecImporter.svelte';
	import type { CheckInDraft, ClassCheckInTransports } from '$lib/classroom/class-check-ins';
	import { itemBodyDoc, type TiptapNode } from '$lib/classroom/classroom-doc';
	import {
		COMPOSER_DISCARD_WARNING,
		applyStagedExtras,
		composerDraftSignature,
		type ComposerDraft,
		saveTarget,
		stagedDeckIssue,
		stagedRubricAfterSpec,
		stagedSpecKind
	} from '$lib/classroom/composer-staging';
	import {
		DECK_UPLOAD_MAX_ZIP_BYTES,
		deckProgressLabel,
		deckProgressPercent,
		type DeckTransports,
		type DeckUploadProgress
	} from '$lib/classroom/deck';
	import type {
		AssignmentSpec,
		AssignmentTeacherTransports,
		RubricCriterion
	} from '$lib/classroom/assignment-spec';
	import type { ReferenceSpec, ReferenceTransports } from '$lib/classroom/reference-spec';
	import {
		HTML_ASSIGNMENT_ADMIN_ONLY,
		HTML_DOCUMENT_MAX_BYTES,
		applyStagedHtmlAssignment,
		readStagedHtml,
		stagedHtmlSummary,
		type HtmlAssignmentTransports,
		type StagedHtmlAssignment
	} from '$lib/classroom/html-assignment/store';
	import {
		ITEM_KINDS,
		courseCategorySuggestions,
		formatBytes,
		instructorAttachmentSrc,
		isoToLocalInput,
		localInputToIso,
		sectionTitle,
		type ClassroomAttachment,
		type ClassroomComposerTransports,
		type ClassroomItem,
		type ClassroomItemKind,
		type ClassroomSection,
		type TxResult
	} from '$lib/classroom/classroom';
	import {
		DEFAULT_DUE_TIME,
		joinDueInput,
		splitDueInput
	} from '$lib/classroom/due-default';
	import {
		claimPaste,
		createDropController,
		dropTarget,
		filesFromClipboard,
		type DragLikeEvent
	} from '$lib/file-drop';

	/**
	 * THE content editor for every classroom item -- announcement, assignment
	 * and material -- mounted by the manage console (create + edit), the class
	 * stream and the item detail page (edit in place). Deliberately not a second
	 * editor per surface: the publish rules, the link rows, the posting targets
	 * and the attachment sequencing are all fiddly enough that two copies would
	 * drift, and the one that drifts is the one nobody is looking at.
	 *
	 * ONE CANONICAL RECORD. An edit here changes the item, which every class it
	 * is posted to reads -- there is no per-class copy to keep in step. That is
	 * also why the edit form owns LINKAGE: adding a class and removing one are
	 * changes to this item, made where the item is being worked on.
	 *
	 * Presentation + orchestration only. Every server call goes through the
	 * injected transports (the ReviewConsole convention), which are thin callers
	 * of the SECURITY DEFINER RPCs -- nothing here is a boundary, and a refusal
	 * comes back as text to render.
	 *
	 * ATTACHMENT SEQUENCING is the one genuinely ordered bit: everything that
	 * attaches to an item is stored against its id, so the item has to EXIST
	 * first. Files and instructor-only files are therefore STAGED locally and
	 * applied after the create/update call hands back the id it touched.
	 *
	 * A STAGED THING THAT FAILS TO APPLY IS KEPT, NOT DISCARDED. If the item
	 * itself refuses to save, nothing is touched at all. If the item saves and
	 * an upload then fails, the report says exactly what did not land and the
	 * staged file stays in the form, so saving again retries it instead of
	 * asking someone to find the file a second time.
	 *
	 * A DECK AND A SPEC STAGE ON CREATE, AND ONLY ON CREATE.
	 *
	 * An item must be completely authorable in one pass, and those two were the
	 * last things that were not: a teacher had to post first, find the item
	 * again, and attach them on its own page. They stage here exactly the way
	 * attachments do -- held locally, applied against the id the create call
	 * returns, kept if they fail -- because that is the same ordering problem
	 * and not a different one.
	 *
	 * ON EDIT THEY ARE ABSENT, deliberately. The item page owns a card for each
	 * and it is on screen while the editor is open, so offering them here too
	 * put two deck panels and two spec panels in front of a teacher with
	 * near-identical text and no way to tell which was meant. That is the bug
	 * this form's previous staging caused, and the fix is not to stage on edit;
	 * it is to stage only where there is no page yet to own them.
	 */
	let {
		mode = 'create',
		kind = $bindable('post'),
		sections = [],
		initialTargets = [],
		item = null,
		transports,
		deckTransports = null,
		teacherTransports = null,
		referenceTransports = null,
		checkInTransports = null,
		htmlAssignmentTransports = null,
		htmlAssignmentAdmin = false,
		attachmentsEnabled = true,
		instructorAttachmentsEnabled = true,
		compact = false,
		screen = false,
		layoutTransports = null,
		figureSources = [],
		onsaved,
		ondirtychange = null,
		oncancel = null
	}: {
		mode?: 'create' | 'edit';
		kind?: ClassroomItemKind;
		/** Every section the caller manages: publish targets, and linkage on edit. */
		sections?: ClassroomSection[];
		/**
		 * Sections pre-checked under "Post to" on create. The class page passes
		 * the class being looked at, because posting from inside a class means
		 * posting TO it -- having to find it again in a checklist is a step that
		 * only exists because the composer had no idea where it was mounted.
		 * Still fully editable: this is a default, never a restriction.
		 */
		initialTargets?: string[];
		item?: ClassroomItem | null;
		transports: ClassroomComposerTransports;
		/**
		 * The three staged-on-create extras. Each is null on edit and on every
		 * surface that does not offer it, and a null one removes its whole block
		 * from the form rather than showing a control that could not write.
		 */
		deckTransports?: DeckTransports | null;
		teacherTransports?: AssignmentTeacherTransports | null;
		referenceTransports?: ReferenceTransports | null;
		/**
		 * Attaching a notebook check-in to what is being posted (0120). Null
		 * where that is not available -- a project whose schema predates the
		 * migration, or a caller without manage rights -- and its ABSENCE is what
		 * removes the control, not a flag beside it.
		 */
		checkInTransports?: ClassCheckInTransports | null;
		/**
		 * A PORTED HTML ASSIGNMENT: the whole document a student works inside,
		 * uploaded instead of an interactive spec. Null on every surface that
		 * does not offer it, and its ABSENCE removes the control -- the same rule
		 * the four above follow.
		 */
		htmlAssignmentTransports?: HtmlAssignmentTransports | null;
		/**
		 * WHETHER THIS VIEWER MAY UPLOAD ONE. Upload is admin-only for the first
		 * season, which is one of the four decisions this format was designed
		 * against; 0195 raises on it and the database is the boundary. This flag
		 * is what keeps the panel off a non-admin's screen, so the refusal is
		 * something they never have to read.
		 */
		htmlAssignmentAdmin?: boolean;
		/** False when Drive is unconfigured: the file controls hide entirely. */
		attachmentsEnabled?: boolean;
		/**
		 * WHETHER THE INSTRUCTOR-ONLY FILE PICKER IS OFFERED, separately from the
		 * student-facing one. They are two different upload mechanisms now
		 * (0133): student-facing files go browser-to-bucket and need nothing
		 * configured, instructor-only material still goes through the site to
		 * Drive and needs the OAuth credentials. One flag for both would mean an
		 * unconfigured Drive silently removing the picker this bundle exists to
		 * build.
		 */
		instructorAttachmentsEnabled?: boolean;
		/** Inline placement (class page / item detail) vs the console card. */
		compact?: boolean;
		/**
		 * THE EDITOR AS A FULL-VIEWPORT LAYER (prompt 0118, item EIGHT). The
		 * form is the same form -- the same `.composer` root, the same controls,
		 * the same testids -- inside a fixed `role="dialog"` with a header
		 * carrying the title and a Close, the sticky actions row beneath it, and
		 * the form scrolling INSIDE the layer while the document behind it does
		 * not. The class pane is 26rem wide above 1024px and a whole authoring
		 * form folded into one of its rows was the report; a phone got the same
		 * form as a card it could not scroll past. `compact` is ignored here:
		 * the layer already decides the frame, and a bordered card inside a
		 * full-screen dialog is a box in a box.
		 */
		screen?: boolean;
		/**
		 * THE 0193 WRITES -- placement, file order, file rename -- and ABSENCE IS
		 * THE MECHANISM: null removes every one of those controls, which is the
		 * read-only case and the honest state of a deployment where the
		 * migration has not been pasted yet. The layout load answers that with
		 * its narrowest probe (`layoutReady`) and the caller passes the object
		 * or nothing; this component never guesses.
		 */
		layoutTransports?: ClassroomLayoutTransports | null;
		/**
		 * DOCUMENTS OTHER THAN THE BODY THAT CAN NAME A FILE AS A FIGURE -- an
		 * assignment spec, a reference document -- so the rename pre-check can
		 * refuse BEFORE the round trip with the same sentence the database
		 * answers with after it. The body itself is always checked (the editor's
		 * live document and the stored one); these are whatever the mounting
		 * page already holds. Missing one is not a hole: the RPC re-checks the
		 * spec text on its own and answers `referenced` in the same words.
		 */
		figureSources?: unknown[];
		onsaved: (info: {
			kind: ClassroomItemKind;
			published: boolean;
			text: string;
			itemId: string;
		}) => void;
		/**
		 * WHETHER THERE IS WORK IN HERE TO LOSE, reported up so whoever owns this
		 * composer's lifetime can warn before discarding it -- closing it, leaving
		 * the class, or the browser unloading. The form cannot do that itself: it
		 * does not know what is about to unmount it.
		 */
		ondirtychange?: ((dirty: boolean) => void) | null;
		oncancel?: (() => void) | null;
	} = $props();

	type Msg = { ok: boolean; text: string } | null;

	const editingKind = $derived<ClassroomItemKind>(mode === 'edit' ? (item?.kind ?? 'post') : kind);
	const isAssignment = $derived(editingKind === 'assignment');
	const needsTitle = $derived(editingKind !== 'post');
	const bodyLabel = $derived(
		editingKind === 'post'
			? 'Announcement'
			: editingKind === 'material'
				? 'Description'
				: 'Instructions'
	);

	// Seeded once from the row being edited; the parent REMOUNTS this component
	// (a keyed block) when the edit target changes, so there is no effect
	// resetting fields underneath someone who is typing.
	// svelte-ignore state_referenced_locally
	let title = $state(item?.title ?? '');
	/**
	 * The body as the EDITOR's own document.
	 *
	 * Seeded through `itemBodyDoc`, which falls back to converting the stored
	 * plain text -- so an item authored before rich text existed, or read from a
	 * backend without 0108, opens with its real paragraphs in the editor rather
	 * than blank. What gets SENT is this, untouched: the save route sanitizes it
	 * and derives the plain-text column from the result.
	 */
	// svelte-ignore state_referenced_locally
	const seedDoc = item ? itemBodyDoc(item) : [];
	let bodyDoc = $state<TiptapNode | null>(null);
	// bind:value on <input type="number"> COERCES to a number (the ReviewConsole
	// unit-field lesson), so this is string | number and every read goes through
	// String().
	// svelte-ignore state_referenced_locally
	let points = $state<string | number>(item?.points == null ? '' : String(item.points));
	// svelte-ignore state_referenced_locally
	/**
	 * THE DUE FIELD IS TWO BOXES AND ONE VALUE. `due` is still the
	 * `datetime-local` string every other line in this file already speaks --
	 * `dueToSend`, the reset and the draft signature are untouched -- and the two
	 * pieces of state below are what the instructor actually types into.
	 *
	 * THE TIME STARTS AT 11:59PM AND THE DATE STARTS EMPTY. Seeding a date too
	 * would invent a deadline nobody chose; leaving the time empty is what the
	 * single `datetime-local` did, and it is why an instructor who filled in a
	 * day and tabbed away got no due date at all. See `due-default.ts` for the
	 * measurement that rules the one-input version out, and for which time zone
	 * 11:59pm resolves against.
	 */
	const seededDue = splitDueInput(isoToLocalInput(item?.due_at ?? null));
	let dueDate = $state(seededDue.date);
	let dueTime = $state(seededDue.time);
	const due = $derived(joinDueInput(dueDate, dueTime));
	// svelte-ignore state_referenced_locally
	let category = $state(item?.category ?? '');
	/**
	 * When this should become visible to students. Empty = the moment it is
	 * posted, which is what every item before scheduling existed did and still
	 * does. See `scheduleToSend` for why an untouched value is not re-encoded.
	 */
	// svelte-ignore state_referenced_locally
	let publishAt = $state(isoToLocalInput(item?.publish_at ?? null));
	// svelte-ignore state_referenced_locally
	let links = $state<{ label: string; url: string }[]>(
		(item?.links ?? []).map((r) => ({ label: r.label, url: r.url }))
	);

	// svelte-ignore state_referenced_locally
	let targets = $state<Record<string, boolean>>(
		Object.fromEntries(initialTargets.map((id) => [id, true]))
	);
	let busy = $state(false);
	let msg = $state<Msg>(null);
	/** Bumped to remount the editor empty after a create (see runSubmit). */
	let editorSeed = $state(0);
	/**
	 * The item this composer has ALREADY created, while it is still on screen.
	 *
	 * Only set when a create succeeded but something staged after it did not --
	 * the state the failure message invites someone to "save again" from. Without
	 * it that second save would run `createItem` a second time and quietly post a
	 * DUPLICATE of an item that already exists, which is exactly what following
	 * the instruction produced before this existed (found in the browser: one
	 * retry, two items). Cleared the moment a save fully succeeds, so an ordinary
	 * next post creates a new item as it always has.
	 */
	let createdItemId = $state<string | null>(null);

	// --- Staged deck and spec (create only) --------------------------------
	//
	// Held exactly the way staged files are: locally, until the item exists.
	// The deck's SIZE is checked here rather than at save time, because the cap
	// is a platform limit an oversize zip can never get past -- so the useful
	// moment to say so is while somebody is picking the file, not after they
	// have filled in the rest of the form and pressed Post.
	let stagedDeck = $state<File | null>(null);
	let deckIssue = $state<string | null>(null);
	let deckProgress = $state<DeckUploadProgress | null>(null);
	let stagedSpec = $state<unknown | null>(null);
	/**
	 * A STAGED RUBRIC (0139): the fourth create-only attachable, on the same
	 * terms as the spec above it -- `classroom_set_rubric` needs the item to
	 * exist, so it is held here until the create call hands back an id. On an
	 * EDIT it is the item page's own RubricBuilder that owns it, exactly as the
	 * item page owns the deck and the spec once the item exists.
	 */
	let stagedRubric = $state<RubricCriterion[] | null>(null);
	/**
	 * WHETHER THE STAGED RUBRIC WAS DERIVED FROM THE SPEC rather than authored.
	 *
	 * The spec's rubric and the item's rubric are two different records: the
	 * criteria live inside the spec JSON (`classroom_set_spec`), and grading
	 * reads a separate row written only by `classroom_set_rubric`. Nothing used
	 * to bridge them at creation, so an assignment made from a spec carrying a
	 * full leveled rubric arrived with no rubric to grade against, and the only
	 * translator (`rubricFromSpec`) sat behind a button somebody had to know to
	 * press. `stageSpec` now runs it on the way in.
	 *
	 * The flag is what keeps that from overwriting a person's own work: a
	 * derived rubric is REPLACED when a corrected spec is pasted over it (the
	 * alternative leaves a stale rubric silently disagreeing with the spec
	 * beside it), and a rubric that went through the builder is never touched
	 * again. Cleared wherever the staged rubric itself is.
	 */
	let stagedRubricDerived = $state(false);
	/** The shared drop target's feedback for the staged-deck picker below. */
	let deckDragActive = $state(false);

	/**
	 * A STAGED HTML ASSIGNMENT: the fifth create-only attachable, and the only
	 * one that is VALIDATED IN FULL AT PICK TIME.
	 *
	 * Everything else here defers what it can to the save. A ported document
	 * cannot: it IS the assignment, so a refusal after Post is a refusal after
	 * the only work anybody did -- and the validation is pure, local and
	 * instant, so there is nothing to gain by waiting. The measured shape not to
	 * repeat is the deck picker's, which checks SIZE ONLY and never type, so a
	 * PNG stages happily, reports ready, and fails server-side after Post.
	 *
	 * `htmlIssues` is a LIST because a document fails in several ways at once
	 * and an author fixing one refusal per upload round trip abandons the
	 * format. Rendered verbatim, in the same problem list as every other
	 * problem, never re-toned.
	 */
	let stagedHtml = $state<StagedHtmlAssignment | null>(null);
	let htmlIssues = $state<string[]>([]);
	let htmlWarnings = $state<string[]>([]);
	let htmlReading = $state(false);
	let htmlDragActive = $state(false);

	/** Which setter a staged document goes through, from the item's own kind. */
	const specKind = $derived(stagedSpecKind(editingKind));
	const canStageSpec = $derived(
		mode === 'create' &&
			((specKind === 'assignment' && !!teacherTransports) ||
				(specKind === 'reference' && !!referenceTransports))
	);
	/** A rubric is assignment-only -- a material or an announcement takes none. */
	const canStageRubric = $derived(
		mode === 'create' && specKind === 'assignment' && !!teacherTransports
	);
	const canStageDeck = $derived(mode === 'create' && !!deckTransports);
	/**
	 * Assignment-only, create-only, admin-only, and the transport has to be
	 * there. Any one missing removes the whole block: there is no control to
	 * press and therefore no write to refuse.
	 */
	const canStageHtml = $derived(
		mode === 'create' &&
			specKind === 'assignment' &&
			!!htmlAssignmentTransports?.setHtmlAssignment &&
			htmlAssignmentAdmin
	);
	/**
	 * A STAGED CHECK-IN (0120): the third attachable, on the same create-only
	 * terms as the other two. On an EDIT the item page owns it -- that is where
	 * an existing one is shown and detached -- exactly as it owns the deck and
	 * the spec once the item exists.
	 */
	let stagedCheckIn = $state<CheckInDraft | null>(null);
	/**
	 * The check-in a half-landed save already created (0123): the check-in went
	 * in and its guidance did not. `saveTarget`'s `createdItemId`, one level
	 * down -- without it, "save again" would schedule a SECOND check-in for the
	 * same day and put a second column on every affected class's grid.
	 */
	let stagedCheckInSessionId = $state<string | null>(null);
	const canStageCheckIn = $derived(mode === 'create' && !!checkInTransports);
	$effect(() => {
		if (!canStageCheckIn) {
			stagedCheckIn = null;
			stagedCheckInSessionId = null;
		}
	});
	/** The staged JSON, re-read as the spec type the summary line wants. */
	const stagedSpecShown = $derived(
		stagedSpec == null ? null : (stagedSpec as AssignmentSpec | ReferenceSpec)
	);

	/**
	 * STAGE A SPEC, AND THE RUBRIC INSIDE IT.
	 *
	 * The decision is `stagedRubricAfterSpec`'s, out in composer-staging.ts with
	 * the rest of the staging rules -- a rubric that fails to arrive here is
	 * invisible until somebody opens the grading console and finds nothing to
	 * score with, which is exactly the kind of guarantee that belongs in a plain
	 * function with a test on it rather than inside an event handler.
	 */
	function stageSpec(raw: unknown) {
		stagedSpec = raw;
		const next = stagedRubricAfterSpec(raw, canStageRubric, {
			rubric: stagedRubric,
			derived: stagedRubricDerived
		});
		stagedRubric = next.rubric;
		stagedRubricDerived = next.derived;
	}

	/** The size/type check a staged deck goes through, whichever way it arrived. */
	function stageDeckFile(file: File) {
		const issue = stagedDeckIssue(file);
		if (issue) {
			deckIssue = issue;
			stagedDeck = null;
			return;
		}
		deckIssue = null;
		stagedDeck = file;
	}

	function pickDeck(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		input.value = '';
		if (!file) return;
		stageDeckFile(file);
	}

	/** A drop or a paste onto the staged-deck editor, first file only -- the
	 *  picker beside it takes no `multiple` either. */
	function onDeckDropFiles(files: File[]) {
		const file = files[0];
		if (file) stageDeckFile(file);
	}

	/**
	 * READ AND VALIDATE A PICKED DOCUMENT, whichever way it arrived.
	 *
	 * The judgement is `readStagedHtml`'s, out in store.ts with the rest of the
	 * import rules, for the reason composer-staging.ts gives about itself: a
	 * document that staged when it should not have looks exactly like one that
	 * should, and neither shows up in a type check.
	 *
	 * `htmlReading` is cleared in `finally`. A throw mid-read would otherwise
	 * leave the picker disabled with nothing on screen saying why.
	 */
	async function stageHtmlFile(file: File) {
		htmlReading = true;
		try {
			const result = await readStagedHtml(file);
			stagedHtml = result.staged;
			htmlIssues = result.errors;
			htmlWarnings = result.warnings;
		} finally {
			htmlReading = false;
		}
	}

	function pickHtml(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		input.value = '';
		if (!file) return;
		void stageHtmlFile(file);
	}

	function onHtmlDropFiles(files: File[]) {
		const file = files[0];
		if (file) void stageHtmlFile(file);
	}

	function clearStagedHtml() {
		stagedHtml = null;
		htmlIssues = [];
		htmlWarnings = [];
	}

	/**
	 * A STAGED SPEC IS DROPPED WHEN THE KIND CHANGES, because it can no longer
	 * be applied: an assignment spec and a reference document are written
	 * through different RPCs and validated by different rules, and an
	 * announcement takes neither. Silently carrying one across the toggle would
	 * mean staging a document on a material and posting an announcement with it
	 * quietly discarded. A staged RUBRIC is dropped the same way and for the
	 * same reason: it is assignment-only, and the RPC it writes through would
	 * refuse it against anything else.
	 */
	$effect(() => {
		void editingKind;
		if (!canStageSpec) stagedSpec = null;
		if (!canStageRubric) {
			stagedRubric = null;
			stagedRubricDerived = false;
		}
		// And the document, for the same reason and more sharply: it can only be
		// written onto an assignment, so carrying one across the toggle would
		// mean posting a material with a whole assignment quietly discarded.
		if (!canStageHtml && (stagedHtml || htmlIssues.length)) clearStagedHtml();
	});

	// --- Attachments ------------------------------------------------------
	// A local copy so a removal shows immediately without the parent having to
	// round-trip; the parent reloads on `onsaved` and remounts on a new target.
	// svelte-ignore state_referenced_locally
	let existing = $state([...(item?.attachments ?? [])]);
	/**
	 * HOW MANY STUDENT-FACING FILES ARE STAGED, and nothing else about them.
	 *
	 * The files themselves, their previews, their per-file progress, their
	 * per-file error and their Retry all live in FileUploadPanel now -- the same
	 * component the assignment engine mounts for a hand-in. What the composer
	 * still needs is the COUNT, because `composerDraftSignature` reads it: a
	 * staged file is work somebody would mind losing.
	 */
	let stagedFileCount = $state(0);
	/**
	 * THE STAGED FILES' NAMES, and nothing else about them.
	 *
	 * The body's picture picker has to offer a file that is not uploaded yet --
	 * on a CREATE that is the only kind there is, because the item id the upload
	 * needs does not exist until the create call returns. A name is enough,
	 * because the alias is keyed on the recorded FILENAME and that name is a
	 * pure function of `file.name` (see `recordedAttachmentFilename`).
	 *
	 * READ THROUGH THE PANEL'S OWN CHANGE SIGNAL rather than by giving
	 * FileUploadPanel a second callback: `oncountchange` already fires on every
	 * mutation it makes -- staging, removing, clearing, and the end of `runAll`
	 * -- so the count changing IS the moment to re-read `files()`. One
	 * mechanism, and the panel's interface is untouched.
	 */
	let stagedFileNames = $state<string[]>([]);
	let filePanel = $state<FileUploadPanel | null>(null);
	let removingId = $state<string | null>(null);
	let pasteHint = $state<string | null>(null);

	// --- Where the files and links sit, and in what order (0193) ------------
	//
	// PLACEMENT IS NOT CONTENT, and it is written through its own RPC after the
	// item exists, exactly the way everything else that hangs off an id is.
	// `classroom_set_item_layout` stamps no `edited_at` and mints no revision:
	// moving the files above the writing does not change what the writing
	// says, so no student gets an "Updated" badge for it.
	//
	// SEEDED ONCE from the row being edited (a keyed remount is what resets
	// it, as for every other field here). `savedLayout` is what the DATABASE
	// holds, advanced on each successful write, so a retry after a half-landed
	// save re-sends only what is still different -- the same shape as
	// `createdItemId`. On a create the item carries nothing, so the seed is
	// the default and the write happens only for a placement OFF it.
	// svelte-ignore state_referenced_locally
	let layout = $state<ItemLayout>(itemLayoutOf(item));
	// svelte-ignore state_referenced_locally
	let savedLayout: ItemLayout = itemLayoutOf(item);
	/**
	 * THE ORDER OF THE FILES THE ITEM ALREADY CARRIES IS `existing`'S OWN
	 * ORDER. A reorder rearranges that array; `AttachmentList` renders the
	 * prop's order and calls back with the id array, so there is one list and
	 * one order rather than a second array of ids kept in step with it.
	 * `savedOrder` is what the database holds -- advanced on a successful
	 * write, and filtered to the ids still present so a REMOVAL (which the
	 * delete RPC has already recorded) never reads as a reorder to send.
	 */
	const existingOrder = $derived(existing.map((a) => a.id));
	// `$state`, not a plain `let`: the draft signature below asks `orderMoved`
	// against this copy, so a successful write has to be a change the derived
	// can see -- or a saved rearrangement keeps reading as unsaved work.
	// svelte-ignore state_referenced_locally
	let savedOrder = $state<string[]>(existing.map((a) => a.id));
	/** Has this list been rearranged relative to what the database holds,
	 *  counting only the rows that still exist. */
	function orderMoved(current: string[], saved: string[]): boolean {
		const present = new Set(current);
		return !sameOrder(
			current,
			saved.filter((id) => present.has(id))
		);
	}

	/** The one place the two segmented controls write. */
	function place(group: keyof ItemLayout, value: ResourcePlacement) {
		layout = { ...layout, [group]: value };
	}

	function reorderExisting(ids: string[]) {
		const byId = new Map(existing.map((a) => [a.id, a]));
		const next = ids.map((id) => byId.get(id)).filter((a): a is ClassroomAttachment => !!a);
		if (next.length === existing.length) existing = next;
	}
	function reorderInstructorExisting(ids: string[]) {
		const byId = new Map(instructorExisting.map((a) => [a.id, a]));
		const next = ids.map((id) => byId.get(id)).filter((a): a is ClassroomAttachment => !!a);
		if (next.length === instructorExisting.length) instructorExisting = next;
	}

	/**
	 * WHY A RENAME OF THIS FILE WOULD LEAVE SOMETHING BROKEN, in the sentence
	 * the database would use. Asked of what this composer HOLDS -- the editor's
	 * live document, which the database cannot see until it is saved, the
	 * stored body, and whatever figure sources the page handed in -- and
	 * `AttachmentList` shows the sentence in place of the rename control.
	 * Instructor-only files cannot be figures, so they take no such check.
	 */
	function renameBlocked(a: ClassroomAttachment): string | null {
		const reason = renameBlockedReason(a.filename, {
			referencedIn: [bodyDoc, item?.body_doc, ...figureSources]
		});
		return reason ? RENAME_REFUSALS[reason] : null;
	}

	/**
	 * RENAME AN EXISTING FILE, IMMEDIATELY -- not on save. The name is the
	 * alias every `attachment:` reference resolves against, so it is a fact
	 * about the row rather than part of a draft, and a rename that waited for
	 * the save would leave the picture picker offering a name the row no
	 * longer has. The pre-checks run first so the ordinary refusals cost no
	 * round trip and read identically to the database's own; the RPC re-checks
	 * every one of them regardless. On success the row is updated in place,
	 * which is what moves `bodyImages` too.
	 */
	async function renameExisting(
		a: ClassroomAttachment,
		filename: string
	): Promise<TxResult<{ filename: string }>> {
		if (!layoutTransports) return { ok: false, message: 'Renaming is not available here.' };
		const next = renamedAttachmentFilename(filename);
		if (!next) return { ok: false, message: RENAME_REFUSALS.empty };
		const blocked = renameBlocked(a);
		if (blocked) return { ok: false, message: blocked };
		if (renameCollides(next, existing.map((x) => x.filename), a.filename)) {
			return { ok: false, message: RENAME_REFUSALS.taken };
		}
		const res = await layoutTransports.renameAttachment(a.id, next);
		if (res.ok) {
			existing = existing.map((x) => (x.id === a.id ? { ...x, filename: res.data.filename } : x));
		}
		return res;
	}
	/** The instructor variant: same shape, no figure check (an instructor file
	 *  cannot be a figure), its own sibling set, its own RPC. */
	async function renameInstructorExisting(
		a: ClassroomAttachment,
		filename: string
	): Promise<TxResult<{ filename: string }>> {
		if (!layoutTransports) return { ok: false, message: 'Renaming is not available here.' };
		const next = renamedAttachmentFilename(filename);
		if (!next) return { ok: false, message: RENAME_REFUSALS.empty };
		if (renameCollides(next, instructorExisting.map((x) => x.filename), a.filename)) {
			return { ok: false, message: RENAME_REFUSALS.taken };
		}
		const res = await layoutTransports.renameInstructorAttachment(a.id, next);
		if (res.ok) {
			instructorExisting = instructorExisting.map((x) =>
				x.id === a.id ? { ...x, filename: res.data.filename } : x
			);
		}
		return res;
	}

	/**
	 * A LINK ROW MOVES THROUGH ONE SPELLING, whether the grip was dragged, an
	 * arrow key was pressed on it, or a Move button was clicked: `sortDrag`
	 * hands `(from, to)` to this and so do the buttons. The array order IS the
	 * stored sort (`classroom_item_resources` is a full-set replacement), so
	 * the reorder persists through the ordinary save with nothing new to write.
	 */
	function moveLink(from: number, to: number) {
		if (to < 0 || to >= links.length || from === to) return;
		links = movedList(links, from, to);
	}
	function moveInstructorLink(from: number, to: number) {
		if (to < 0 || to >= instructorLinks.length || from === to) return;
		instructorLinks = movedList(instructorLinks, from, to);
	}

	// --- The composer-wide drop zone (prompt 0118, item NINE) ---------------
	//
	// A file dropped ANYWHERE on the form lands on the student-facing list.
	// Before this the only drop targets were the two upload panels' own boxes,
	// a few centimetres tall, in a form several screens long -- so a file
	// dropped on the title, the body or the links opened in a new tab and the
	// form was gone.
	//
	// THE NESTED PANELS TAKE THEIR OWN DROPS FIRST, and the root STANDS DOWN.
	// Each FileUploadPanel (and the staged-deck box) carries `dropTarget`, whose
	// `drop` calls `preventDefault` before it reads the files; a drop bubbles,
	// so by the time it reaches this root `defaultPrevented` says a closer
	// surface already staged it. The shared action does not read that flag --
	// it was written for a surface with no droppable descendants -- which is
	// why this is the shared CONTROLLER behind a listener that asks first,
	// rather than a second copy of the drag state machine or a `stopPropagation`
	// in a panel that has no idea what is above it. Measured the other way: the
	// action on the root staged a screenshot dropped on the instructor-only
	// panel TWICE, the second time onto the list the whole class can read --
	// the same defect `claimPaste` exists for, on the drop event.
	//
	// The paste half is NOT registered here: the root's own `onpaste` already
	// routes a pasted image and already asks `claimPaste`.
	let composerDragActive = $state(false);
	function composerDropZone(node: HTMLElement, initial: { disabled: boolean }) {
		let disabled = initial.disabled;
		const controller = createDropController({
			onfiles: (files) => {
				filePanel?.add(files);
				pasteHint = `${files.length} dropped file${files.length === 1 ? '' : 's'} attached.`;
				setTimeout(() => (pasteHint = null), 4000);
			},
			onactive: (a) => (composerDragActive = a)
		});
		const asDrag = (e: Event) => e as unknown as DragLikeEvent;
		const onDragEnter = (e: Event) => {
			if (!disabled) controller.dragEnter(asDrag(e));
		};
		const onDragOver = (e: Event) => {
			if (!disabled) controller.dragOver(asDrag(e));
		};
		const onDragLeave = () => {
			if (!disabled) controller.dragLeave();
		};
		const onDrop = (e: Event) => {
			if (disabled) return;
			if (e.defaultPrevented) {
				// A closer surface took it. Only the feedback is reset here; the
				// files are already where the person dropped them.
				controller.dragLeave();
				composerDragActive = false;
				return;
			}
			void controller.drop(asDrag(e));
		};
		node.addEventListener('dragenter', onDragEnter);
		node.addEventListener('dragover', onDragOver);
		node.addEventListener('dragleave', onDragLeave);
		node.addEventListener('drop', onDrop);
		return {
			update(next: { disabled: boolean }) {
				disabled = next.disabled;
				if (disabled) composerDragActive = false;
			},
			destroy() {
				node.removeEventListener('dragenter', onDragEnter);
				node.removeEventListener('dragover', onDragOver);
				node.removeEventListener('dragleave', onDragLeave);
				node.removeEventListener('drop', onDrop);
			}
		};
	}

	// --- Screen mode (prompt 0118, item EIGHT) ------------------------------
	//
	// Everything a modal layer owes and the markup cannot express on its own:
	// the document behind it stops scrolling, Escape closes it, focus lands
	// inside it on mount and goes back where it was on destroy. All of it is
	// keyed on `screen` so the inline shapes (the console card, `compact`) are
	// byte-identical to what they were.
	// ONE `$props.id()` per component (Svelte refuses a second); the dialog's
	// heading id is derived from the datalist's, lazily, because that id is
	// declared further down beside the field that uses it.
	const screenTitleId = $derived.by(() => `${categoryListId}-title`);
	const screenTitle = $derived(
		mode === 'create'
			? 'New post'
			: `Edit ${(ITEM_KINDS.find((k) => k.id === editingKind)?.label ?? 'post').toLowerCase()}`
	);
	let screenEl = $state<HTMLDivElement | null>(null);
	let titleInput = $state<HTMLInputElement | null>(null);

	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
		'textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

	$effect(() => {
		if (!screen) return;
		// BODY SCROLL, LOCKED AND RESTORED TO WHATEVER IT WAS -- not to '', which
		// would erase a value some other surface had set. The layer scrolls
		// inside itself; the page underneath is exactly where it was when the
		// dialog closes, which is the whole point of the item staying mounted.
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		// FOCUS RETURNS TO THE CONTROL THAT OPENED THIS. Captured before the
		// title takes it, and restored on destroy only if it is still in the
		// document -- the Edit post button is, a row menu item may not be.
		const opener = document.activeElement as HTMLElement | null;
		const onKey = (e: KeyboardEvent) => {
			// A NESTED CONTROL THAT HANDLED ITS OWN ESCAPE HAS SAID SO. The
			// attachment rename input, a staged file's rename and the editor's
			// link popover each cancel THEMSELVES on Escape and `preventDefault`
			// it on the way; this listener sits on the document, so it hears the
			// same keypress afterwards -- and without this line one Escape in a
			// rename box closed the whole editor over a form full of work.
			// MEASURED before the fix: rename cancelled 1, `oncancel` 1.
			if (e.defaultPrevented) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				oncancel?.();
				return;
			}
			// TAB STAYS INSIDE THE LAYER. `aria-modal` tells a reader the rest of
			// the page is inert; this is what makes it true for a keyboard --
			// without it Tab walks off the last control into the masthead
			// behind the dialog, which is on screen to nobody.
			if (e.key !== 'Tab' || !screenEl) return;
			const nodes = Array.from(screenEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
				(n) => n.offsetParent !== null || n === document.activeElement
			);
			if (!nodes.length) return;
			const first = nodes[0];
			const last = nodes[nodes.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKey);
		// INTO THE TITLE, after the frame that mounts it. The title is on every
		// kind (optional on an announcement, required elsewhere), which is why
		// it and not the body editor is the landing: the editor mounts a tick
		// later and exposes no focus method, and a focus call that races a
		// mount is a silent no-op (CLAUDE.md: key an autofocus on the element).
		void tick().then(() => untrack(() => titleInput?.focus()));
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = previousOverflow;
			if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
		};
	});

	/**
	 * THE PICTURES THE BODY EDITOR MAY OFFER (0041).
	 *
	 * THE TWO LISTS ARE NOT THE SAME LIST, AND THEY CANNOT BE MADE SO. `existing`
	 * is what the item already carries: on an EDIT it is a strict subset of what
	 * the item saves with, and on a CREATE it is empty, because a staged file
	 * needs an item id to upload against and the id does not exist until the
	 * create call returns. That ordering is 0133's shape, not a bug to fix here.
	 *
	 * WHAT CLOSES THE GAP IS THE ALIAS. `attachment:<filename>` is keyed on the
	 * recorded filename, which `/api/classroom/attachment` derives from
	 * `file.name` by a pure function -- so a staged file's eventual reference is
	 * COMPUTED, not guessed, and the picker can offer it before a byte moves.
	 * The one residual case is an upload that fails: the composer already keeps
	 * that file staged and names it in the failure list, and a reference with no
	 * row behind it renders as its caption plus a marker, which is 0030's
	 * designed degradation rather than a broken page. The row says so in words
	 * before it is chosen.
	 *
	 * `imageChoices` decides what is offerable, through `resolveFigureSrc`
	 * itself. Instructor-only files are not passed and could not be: they are a
	 * different bucket and a different table, an item body's alias resolves
	 * against the STUDENT-FACING attachments only, and a body is read by the
	 * whole class.
	 */
	const bodyImages = $derived(
		imageChoices({
			attached: existing,
			staged: stagedFileNames.map((name) => ({ name }))
		})
	);
	const bodyImagesEmptyHint = $derived(
		attachmentsEnabled
			? 'No pictures on this item yet. Add one under Files below, then press Image again.'
			: 'This item cannot take files, so there is no picture to place in it.'
	);
	// --- Instructor-only materials (0090, 0135) ----------------------------
	//
	// KEPT AS ITS OWN STATE rather than a flag on the student-facing arrays:
	// this section is teacher eyes only, so its data must never end up in the
	// same list a student-facing renderer could iterate by accident.
	//
	// THE STAGING, THE PREVIEWS, THE PROGRESS BAR AND THE FAILURE HANDLING ARE
	// ALL GONE FROM HERE, and that is the point of the change. This section used
	// to own a `File[]`, a non-reactive object-URL map, a revision counter, an
	// `onDestroy` to revoke the URLs, a `uploadProgress` record keyed by array
	// index, and its own markup for all of it -- a second implementation of
	// FileUploadPanel that had drifted into being worse than the original: no
	// per-file error, no Retry, and a failure list rebuilt by hand on every save.
	// It existed because instructor-only material had no bucket (0133 gave it
	// none, its read rule being manager-only). 0135 gave it one, so it mounts the
	// same panel as everything else.
	// svelte-ignore state_referenced_locally
	let instructorLinks = $state<{ label: string; url: string }[]>(
		(item?.instructorLinks ?? []).map((r) => ({ label: r.label, url: r.url }))
	);
	// svelte-ignore state_referenced_locally
	let instructorExisting = $state([...(item?.instructorAttachments ?? [])]);
	/** The instructor list's own order and saved copy: see `existingOrder`. */
	const instructorExistingOrder = $derived(instructorExisting.map((a) => a.id));
	// svelte-ignore state_referenced_locally
	let savedInstructorOrder = $state<string[]>(instructorExisting.map((a) => a.id));
	let instructorPanel = $state<FileUploadPanel | null>(null);
	let instructorStagedCount = $state(0);
	let instructorRemovingId = $state<string | null>(null);

	async function removeInstructorExisting(a: { id: string }) {
		if (instructorRemovingId) return;
		instructorRemovingId = a.id;
		const res = await transports.deleteInstructorAttachment(a.id);
		instructorRemovingId = null;
		if (res.ok) {
			instructorExisting = instructorExisting.filter((x) => x.id !== a.id);
		} else {
			msg = { ok: false, text: res.message };
		}
	}

	// --- Linkage (edit mode) ----------------------------------------------
	const postedSectionIds = $derived(new Set((item?.postings ?? []).map((p) => p.section_id)));
	const postedSections = $derived(sections.filter((s) => postedSectionIds.has(s.id)));
	const linkableSections = $derived(
		sections.filter((s) => !postedSectionIds.has(s.id) && s.active !== false)
	);
	let linkTargets = $state<Record<string, boolean>>({});
	let unlinkArm = $state<string | null>(null);

	const targetIds = $derived(sections.filter((s) => targets[s.id]).map((s) => s.id));
	const linkIds = $derived(linkableSections.filter((s) => linkTargets[s.id]).map((s) => s.id));

	/**
	 * THE COURSE SCOPE FOR THE GRADING-CATEGORY DATALIST: `classroom_units`'s
	 * own scope, not the section -- a teacher's vocabulary follows the course
	 * rather than one block of it. On create that is wherever "Post to" is
	 * currently checked; on edit it is wherever the item already posts, since
	 * the "Post to" checklist itself only renders on create.
	 */
	const categoryCourseIds = $derived(
		Array.from(
			new Set(
				(mode === 'edit' ? postedSections : sections.filter((s) => targets[s.id])).map(
					(s) => s.course_id
				)
			)
		).sort()
	);
	/**
	 * SUGGESTIONS ONLY, never a constraint: the field beneath this stays a
	 * plain free-text input regardless of what lands here. Refetched whenever
	 * the course scope changes; a stale in-flight request is dropped rather
	 * than allowed to overwrite a newer one.
	 */
	let categorySuggestions = $state<string[]>([]);
	$effect(() => {
		// TRACKED, deliberately: the course scope and the transport's presence
		// are exactly what should re-run this.
		const courseIds = categoryCourseIds;
		const load = transports.loadCategorySuggestions;
		if (!load || courseIds.length === 0) {
			categorySuggestions = [];
			return;
		}
		let cancelled = false;
		// UNTRACKED, and this is the load-bearing half: `load` is INJECTED, so
		// whatever it touches before its first `await` would otherwise join this
		// effect's dependencies. See the injected-callback rule in CLAUDE.md.
		untrack(() => load(courseIds)).then((res) => {
			if (cancelled) return;
			categorySuggestions = res.ok ? courseCategorySuggestions(res.data) : [];
		});
		return () => {
			cancelled = true;
		};
	});
	const categoryListId = $props.id();

	/**
	 * The panel's upload transport, bound to the STUDENT-FACING attachment side.
	 *
	 * It is `transports.uploadAttachment` -- injected, so the dev harness answers
	 * in memory -- adapted to the panel's outcome shape. The `gate` and
	 * `retryable` the transport now carries come straight through, which is what
	 * lets the panel offer Retry only where retrying could work.
	 */
	const uploadStagedFile: PanelUpload = async ({ itemId: target, file, onProgress }) => {
		const res = await transports.uploadAttachment(target, file, onProgress);
		if (res.ok) return { ok: true, storageKey: '' };
		return {
			ok: false,
			gate: res.gate ?? 'server',
			message: res.message,
			retryable: res.retryable ?? false
		};
	};

	/** The same adapter against the instructor-only transport. Two lines rather
	 *  than a role parameter, because the two call different transports and a
	 *  surface that could choose is a surface that could choose wrong. */
	const uploadInstructorStagedFile: PanelUpload = async ({ itemId: target, file, onProgress }) => {
		const res = await transports.uploadInstructorAttachment(target, file, onProgress);
		if (res.ok) return { ok: true, storageKey: '' };
		return {
			ok: false,
			gate: res.gate ?? 'server',
			message: res.message,
			retryable: res.retryable ?? false
		};
	};

	/**
	 * Ctrl+V of a screenshot, anywhere in this composer. `filesFromClipboard`
	 * is the SHARED extraction (`$lib/file-drop`) the drop target on every
	 * upload panel now also uses, so there is exactly one reading of "which
	 * clipboard items are images" rather than a second copy that could drift
	 * from it.
	 *
	 * Only image items are intercepted: pasting TEXT into the body must keep
	 * working exactly as it always did, so anything else falls through
	 * untouched with no preventDefault.
	 */
	function onPaste(event: ClipboardEvent) {
		if (!attachmentsEnabled) return;
		const images = filesFromClipboard(event);
		if (!images.length) return;
		// A PANEL INSIDE THIS FORM GETS THE PASTE FIRST, and this handler stands
		// down when one did. Both FileUploadPanels are mounted INSIDE the element
		// carrying this `onpaste`, a paste bubbles, and `preventDefault` does not
		// stop it -- so without this, a screenshot pasted into the instructor-only
		// panel was staged there AND here, i.e. onto the student-facing list the
		// whole class may read, and one pasted into the student panel was staged
		// twice over. `claimPaste` is the shared statement of that (see
		// $lib/file-drop).
		//
		// ASKING IT RATHER THAN READING `event.defaultPrevented` IS DELIBERATE,
		// and not because the flag would fail today: measured in a real browser
		// on /dev/composer-attach, ProseMirror does NOT call `preventDefault` on
		// an image paste -- it finds no text and no html to insert and declines
		// the event -- so the two spellings currently agree. That is exactly what
		// makes the flag the wrong one to key on: it would rest on a third-party
		// library's internal choice about an event it did not want, which nothing
		// here controls and nothing would report if it changed.
		// `defaultPrevented` says somebody stopped the browser's default; it does
		// not say somebody has already attached this file, and only the second
		// question has a right answer here.
		if (!claimPaste(event)) return;
		event.preventDefault();
		filePanel?.add(images);
		pasteHint = `${images.length} pasted image${images.length === 1 ? '' : 's'} attached.`;
		setTimeout(() => (pasteHint = null), 4000);
	}

	async function removeExisting(a: { id: string }) {
		if (removingId) return;
		removingId = a.id;
		const res = await transports.deleteAttachment(a.id);
		removingId = null;
		if (res.ok) {
			existing = existing.filter((x) => x.id !== a.id);
		} else {
			msg = { ok: false, text: res.message };
		}
	}

	/**
	 * The due date as it should be SENT.
	 *
	 * A `datetime-local` value has no seconds, so re-encoding an untouched due
	 * date through the input loses them -- which the server can only read as a
	 * real change, stamping `edited_at` and showing every student an "Updated"
	 * badge for a save that only added, say, an instructor-only answer key. So
	 * a field nobody touched is sent back exactly as it was stored.
	 */
	function dueToSend(): string | null {
		if (mode === 'edit' && item && isoToLocalInput(item.due_at) === due) return item.due_at;
		return localInputToIso(due);
	}

	/** The same untouched-field rule as `dueToSend`, for the go-live time. */
	function scheduleToSend(): string | null {
		if (mode === 'edit' && item && isoToLocalInput(item.publish_at ?? null) === publishAt) {
			return item.publish_at ?? null;
		}
		return localInputToIso(publishAt);
	}

	/**
	 * Is the time in the box still in the future?
	 *
	 * Only used to WORD the button. Whether an item is actually live is the
	 * database's answer, computed at read time from the stored stamp -- nothing
	 * here decides it, and a page left open past the go-live moment can only be
	 * wrong about a label.
	 */
	const scheduledAhead = $derived.by(() => {
		const iso = localInputToIso(publishAt);
		if (!iso) return false;
		const at = Date.parse(iso);
		return Number.isFinite(at) && at > Date.now();
	});

	/**
	 * Has the instructor-only link list moved since this form opened?
	 *
	 * Compared against what the ITEM carried, not against a snapshot of the
	 * form's own state, so a create (no item) writes only when there is
	 * something to write. Position is part of the stored row, so the comparison
	 * is order-sensitive on purpose.
	 */
	function instructorLinksChanged(next: { label: string; url: string }[]): boolean {
		const before = (item?.instructorLinks ?? [])
			.map((r) => ({ label: (r.label ?? '').trim(), url: (r.url ?? '').trim() }))
			.filter((r) => r.url !== '');
		if (before.length !== next.length) return true;
		return before.some((r, i) => r.label !== next[i].label || r.url !== next[i].url);
	}

	function itemInput() {
		const rawPoints = String(points ?? '').trim();
		const pts = rawPoints === '' ? null : Number.parseInt(rawPoints, 10);
		return {
			title: title.trim() || null,
			// The editor's document, exactly as it produced it. Null before the
			// editor has mounted, which the route reads as an empty body -- the
			// same thing an untouched form has always sent.
			bodyDoc,
			// Points and a due date are assignment vocabulary; sending them on
			// another kind is refused server-side, so they are dropped here.
			points: isAssignment && !Number.isNaN(pts as number) ? pts : null,
			dueAt: isAssignment ? dueToSend() : null,
			publishAt: scheduleToSend(),
			category: category.trim() || null,
			links: links
				.map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
				.filter((r) => r.url !== '')
		};
	}

	/**
	 * The editor's document as plain text, for the "is there work in here"
	 * question alone. `docText` in classroom-doc reads the STORED shape; this
	 * reads the editor's, which is the only shape available before a save.
	 */
	function tiptapText(node: TiptapNode | null): string {
		if (!node) return '';
		const parts: string[] = [];
		const walk = (n: TiptapNode) => {
			if (typeof n.text === 'string') parts.push(n.text);
			for (const child of n.content ?? []) walk(child);
		};
		walk(node);
		return parts.join(' ');
	}

	/** Everything a person could have put in here, in one place. */
	const draft = $derived<ComposerDraft>({
		title,
		bodyText: tiptapText(bodyDoc),
		files: stagedFileCount,
		instructorFiles: instructorStagedCount,
		links,
		instructorLinks,
		deck: stagedDeck,
		spec: stagedSpec,
		checkIn: stagedCheckIn,
		rubric: stagedRubric,
		// 0193: a placement or a rearrangement is work the guard must see, and
		// neither types a word or moves a byte, so nothing above would notice.
		layout,
		// THE SAME COMPARISON THE SAVE MAKES, not the raw id list. `existing`
		// also shrinks when a row is REMOVED, and that removal is an immediate
		// RPC the database has already recorded -- so the raw list read as an
		// unsaved change (MEASURED: `ondirtychange` false,true on Remove alone)
		// and the discard guard asked about work that was not there to lose.
		// Null unless the rows still present sit in a different order from
		// what the database holds, which is exactly when a save would write.
		existingOrder: orderMoved(existingOrder, savedOrder) ? existingOrder : null,
		instructorExistingOrder: orderMoved(instructorExistingOrder, savedInstructorOrder)
			? instructorExistingOrder
			: null
	});

	/**
	 * WHAT THIS COMPOSER OPENED ON, seeded once the editor has reported its own
	 * serialization of the body (`onready`, below) and re-seeded after a create
	 * that fully landed, which resets every field back to a fresh post.
	 *
	 * WITHOUT IT `dirty` MEANT "IS THERE CONTENT IN HERE", and in edit mode that
	 * is true from the first frame: the composer opens holding the item's own
	 * title and body. So a composer opened on an existing item and closed again
	 * asked whether to discard work nobody had done -- and a warning that fires
	 * when nothing is wrong is a warning people learn to click through, which
	 * costs the one case it exists for. See `$lib/edit-baseline`.
	 */
	const baseline = new EditBaseline();

	/**
	 * WORK THAT WOULD BE LOST, pushed up on every change.
	 *
	 * Reported rather than guarded here: this form has no idea what is about to
	 * unmount it, so whoever owns its lifetime asks the question. Kept as one
	 * derived + one effect so the answer can never lag the fields it reads.
	 */
	/**
	 * A STAGED HTML DOCUMENT COUNTS AS UNSAVED WORK, and it is OR'd in here
	 * rather than added to the draft.
	 *
	 * `composerDraftSignature` builds its object key by key, so a field added to
	 * `ComposerDraft` that it does not read would be silently ignored -- and
	 * `ComposerDraft` is not this lane's file to change. The document exists
	 * NOWHERE but this browser's memory until the save writes it, exactly as a
	 * staged File handle does, so a guard that cannot see it lets somebody walk
	 * away from a whole uploaded assignment with nothing on screen saying so.
	 * It clears itself on a successful write, which is what makes this term
	 * false again at the right moment.
	 *
	 * WHEN THE TWO ARE FOLDED TOGETHER, this belongs in the signature as
	 * `htmlAssignment: draft.htmlAssignment ? 1 : 0` beside `deck` and `spec`,
	 * and this clause goes.
	 */
	const dirty = $derived(baseline.changed(composerDraftSignature(draft)) || !!stagedHtml);
	$effect(() => {
		// `dirty` tracked, the notification untracked: `ondirtychange` belongs to
		// whoever mounted this form and may read or write state of its own.
		const value = dirty;
		untrack(() => ondirtychange?.(value));
	});
	onDestroy(() => ondirtychange?.(false));

	async function addLinks() {
		if (!item || linkIds.length === 0 || busy) return;
		busy = true;
		msg = null;
		const res = await transports.addPostings(item.id, linkIds);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		linkTargets = {};
		msg = {
			ok: true,
			text: `Posted to ${res.data.added} more class${res.data.added === 1 ? '' : 'es'}.`
		};
		onsaved({ kind: editingKind, published: item.published, text: '', itemId: item.id });
	}

	async function unlink(sectionId: string) {
		if (!item || busy) return;
		// Two-step confirm, the gauntlet-room-delete convention.
		if (unlinkArm !== sectionId) {
			unlinkArm = sectionId;
			return;
		}
		unlinkArm = null;
		busy = true;
		msg = null;
		const res = await transports.removePosting(item.id, sectionId);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		if (res.data.ok === false) {
			msg = {
				ok: false,
				text:
					res.data.reason === 'last_posting'
						? 'This is the only class it is posted to. Delete it instead of unlinking.'
						: 'That class could not be unlinked.'
			};
			return;
		}
		msg = { ok: true, text: 'Unlinked from that class. The item still exists for the others.' };
		onsaved({ kind: editingKind, published: item.published, text: '', itemId: item.id });
	}

	/**
	 * THE INDICATOR ONLY. This composer's save BEHAVIOUR is deliberately
	 * untouched: it already collects every failure into one report and leaves
	 * anything that did not land staged, so saving again retries exactly the
	 * rest. That is the honest thing and it predates the shared primitive.
	 *
	 * What it did not have was the other three surfaces' VOCABULARY -- no state
	 * a reader could point at, and no clock time on a save that worked. So the
	 * SaveState here wraps the existing run and reports its verdict; it adds no
	 * autosave, no debounce, no backoff and no navigation guard, because this
	 * composer is owned by a LAYOUT and survives every move inside its class.
	 *
	 * The verdict is READ OFF `msg` rather than re-derived: a second reading of
	 * the same run is exactly how an indicator ends up disagreeing with the
	 * report printed under it.
	 *
	 * A HIDDEN TAB MUST NOT WRITE, AND THAT IS WHAT `onHide` IS FOR. The
	 * paragraph above says this machine adds "no autosave, no debounce, no
	 * backoff" -- and `attach()` quietly contradicted it. `SaveState`'s
	 * durability net fires on `visibilitychange` and `pagehide` whenever the
	 * machine is `dirty`, and `dirty` includes `failed`; a create that came
	 * back refused therefore re-ran the WHOLE submit on every tab switch,
	 * screen lock and navigation, with nobody having pressed anything.
	 *
	 * MEASURED: one Save draft whose response never arrived, then six tab
	 * switches, wrote SEVEN rows. That is the reported "infinite copies", and
	 * the copies are identical because the failure path leaves the form intact.
	 * The false negative it needs is ordinary rather than exotic -- a phone or
	 * a Chromebook backgrounding the tab ABORTS the in-flight fetch and fires
	 * `visibilitychange` in the same breath, so the abort and the re-run are
	 * the same event, and any attempt that got far enough to commit is a copy.
	 *
	 * A net is right for a machine that autosaves: it is landing a write the
	 * user already asked for and the debounce is merely holding. This one asks
	 * for nothing until a button is pressed, so there is no owed write for a
	 * hide to land -- only a whole create to issue a second time. The work is
	 * still in the form, and the layout's own navigation guard is what asks
	 * about it, so nothing is lost by declining. `onHide` is the option that
	 * exists for exactly this decision; the listeners stay attached and only
	 * the WRITE is withheld.
	 */
	let pendingPublish = false;
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'That save did not land.',
		onHide: () => {},
		async save() {
			await runSubmit(pendingPublish);
			if (msg && !msg.ok) {
				// NOT retryable by the machine: what is left staged is retried by
				// saving again, on this composer's own terms, never by a backoff
				// loop re-uploading files behind a teacher's back.
				return { ok: false, retryable: false, message: msg.text } as const;
			}
			return { ok: true } as const;
		}
	});

	$effect(() => save.attach());

	async function submit(publish: boolean) {
		if (busy) return;
		busy = true;
		msg = null;
		pendingPublish = publish;
		save.markDirty();
		try {
			await save.saveNow();
		} finally {
			// Whatever happens, the buttons come back -- a stuck busy flag is a
			// silently wedged editor (the number-input coercion throw, found live
			// in the console's own composer, left both buttons disabled forever).
			busy = false;
		}
	}

	async function runSubmit(publish: boolean) {
		// WHERE THIS SAVE GOES is a decision, not an `if` chain, because getting
		// it wrong posts a second copy of content that already exists. See
		// composer-staging.ts.
		const target = saveTarget({
			mode,
			itemId: item?.id ?? null,
			createdItemId,
			targetIds
		});
		/**
		 * WHAT IS ABOUT TO GO OUT, captured BEFORE it goes.
		 *
		 * The checkpoint below advances the edit baseline so the form reads
		 * clean afterwards, and it has to advance to what was SENT rather than
		 * to what is on screen when the answer arrives. Those differ by
		 * anything typed while the request was in flight -- and reading the
		 * live draft at that point would mark those words as already saved,
		 * which is the same class of defect as the one this bundle is fixing,
		 * one write later.
		 */
		const sentSignature = composerDraftSignature(draft);
		let res;
		if (target.action === 'refuse') {
			res = { ok: false as const, message: target.message };
		} else if (target.action === 'update') {
			res = await transports.updateItem(target.itemId, itemInput(), publish);
		} else {
			res = await transports.createItem(editingKind, targetIds, itemInput(), publish);
		}

		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}

		// The item exists; NOW everything that hangs off its id can be applied --
		// the staged files and the instructor-only materials (never part of
		// createItem/updateItem's own payload). All failures are collected
		// together so one report covers everything.
		//
		// ANYTHING THAT FAILS STAYS STAGED. Only what actually landed is cleared,
		// so saving again retries the rest rather than asking a teacher to go and
		// find the same file a second time.
		const itemId = res.data.itemId;
		const hadFiles = stagedFileCount > 0 || instructorStagedCount > 0;
		const hadDeck = !!stagedDeck;
		const hadSpec = stagedSpec != null;
		const hadCheckIn = stagedCheckIn != null;
		const hadRubric = stagedRubric != null;
		const hadHtml = stagedHtml != null;
		const failures: string[] = [];

		// The save route had to fall back past the rich body to get through, so
		// the words are stored and the FORMATTING is not. Reported as a failure
		// rather than a footnote: it is the one thing here that silently changed
		// what a class will read, and it cannot be recovered from the text
		// column afterwards, so the only useful moment to say it is now.
		if (res.data.formattingDropped) {
			failures.push(
				'formatting (lists, headings, bold) was not saved -- this classroom is running an ' +
					'older database that cannot store it. The text is safe; ask an admin to apply the ' +
					'pending migration, then re-apply the formatting'
			);
		}

		/**
		 * PLACEMENT AND ORDER (0193), BEFORE THE UPLOADS, and the order of these
		 * two blocks is load-bearing rather than tidy. `classroom_set_attachment_order`
		 * refuses any array that is not EXACTLY the item's attachment set -- so
		 * it has to run while the set is still the rows this form opened on,
		 * before `runAll` records new ones the array could not name. The new
		 * rows take `max + 1` and land after everything, which is where a file
		 * added just now belongs. Each write is attempted on its own, is named
		 * in the report if it fails, and advances its `saved*` copy only when it
		 * lands, so a retry re-sends exactly what is still different.
		 *
		 * GATED ON THE TRANSPORT, never on the control having been shown: with
		 * no `layoutTransports` there was no control, so nothing here can have
		 * moved off its seed and the comparison below is false by construction.
		 */
		if (layoutTransports) {
			if (!sameLayout(layout, savedLayout)) {
				const sent = { ...layout };
				const res = await layoutTransports.setItemLayout(itemId, sent);
				if (res.ok) savedLayout = sent;
				else failures.push(`where the files and links sit: ${res.message}`);
			}
			if (orderMoved(existingOrder, savedOrder)) {
				const sent = [...existingOrder];
				const res = await layoutTransports.setAttachmentOrder(itemId, sent);
				if (res.ok) savedOrder = sent;
				else failures.push(`file order: ${res.message}`);
			}
			if (orderMoved(instructorExistingOrder, savedInstructorOrder)) {
				const sent = [...instructorExistingOrder];
				const res = await layoutTransports.setInstructorAttachmentOrder(itemId, sent);
				if (res.ok) savedInstructorOrder = sent;
				else failures.push(`instructor file order: ${res.message}`);
			}
		}

		/**
		 * BOTH LISTS AT ONCE, AND EVERY FILE IN EACH ATTEMPTED -- now through ONE
		 * mechanism rather than two.
		 *
		 * `runAll` uploads a panel's files ONE AT A TIME IN LIST ORDER (the
		 * record RPC stores arrival order, so the staged order is the stored
		 * order), catches each one individually so a throw cannot end the batch
		 * and discard the others' results, keeps whatever failed staged with its
		 * own message and its own Retry, and returns one line per failure. Two
		 * panels, the same guarantee,
		 * and the same guarantee a student gets on a hand-in.
		 *
		 * The instructor list used to be a hand-rolled `Promise.all` over a `File[]`
		 * with its own `settle` wrapper and its own failure-line formatting. It is
		 * the second copy that no longer exists.
		 */
		const [fileFailures, instructorFailures] = await Promise.all([
			filePanel ? filePanel.runAll(itemId) : Promise.resolve([]),
			instructorPanel ? instructorPanel.runAll(itemId) : Promise.resolve([])
		]);

		failures.push(...fileFailures);
		failures.push(...instructorFailures.map((line) => `instructor ${line}`));

		/**
		 * The instructor links are written only when they actually CHANGED.
		 *
		 * `classroom_set_instructor_resources` is a full-set replacement, so
		 * calling it on every save deleted and re-inserted the same rows every
		 * time -- new row ids for identical content, on a save that never touched
		 * them (adding a file, fixing a typo in the body). Emptying the list is a
		 * real change and still writes, which is the case a naive
		 * "only when non-empty" check would silently drop.
		 */
		const instructorLinksClean = instructorLinks
			.map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
			.filter((r) => r.url !== '');
		if (instructorLinksChanged(instructorLinksClean)) {
			const linksRes = await transports.setInstructorResources(itemId, instructorLinksClean);
			if (!linksRes.ok) failures.push(`instructor links: ${linksRes.message}`);
		}

		/**
		 * THE DECK AND THE SPEC, on the same terms as everything else here: the
		 * item exists, so they can be applied; anything that fails is NAMED and
		 * stays staged, so saving again retries only what is left. They run last
		 * because the deck is the long one and its progress is what the form
		 * reports while it goes.
		 */
		if (stagedDeck || stagedSpec != null || stagedCheckIn != null || stagedRubric != null) {
			const extras = await applyStagedExtras(
				itemId,
				{
					deck: stagedDeck,
					spec: stagedSpec,
					specKind,
					checkIn: stagedCheckIn,
					checkInSessionId: stagedCheckInSessionId,
					rubric: stagedRubric
				},
				{
					deck: deckTransports,
					setSpec: teacherTransports
						? (id, spec) => teacherTransports.setSpec(id, spec as AssignmentSpec)
						: null,
					setReferenceSpec: referenceTransports
						? (id, spec) => referenceTransports.setReferenceSpec(id, spec as ReferenceSpec)
						: null,
					createCheckIn: checkInTransports
						? (id, draft) => checkInTransports.createForItem(id, draft)
						: null,
					// Its own transport, and null on a deployment without 0123 --
					// the same presence-gates-the-control rule the other three
					// follow, applied to the write rather than to the form.
					setGuidance: checkInTransports?.setGuidance
						? (id, doc) => checkInTransports.setGuidance!(id, doc as TiptapNode | null)
						: null,
					setRubric: teacherTransports
						? (id, criteria) => teacherTransports.setRubric(id, criteria)
						: null
				},
				(p) => (deckProgress = p)
			);
			deckProgress = null;
			stagedDeck = extras.deck;
			stagedSpec = extras.spec;
			// Stays staged when it did not land, exactly like the other two: the
			// failure message names it and saving again retries only what is left.
			// The session id rides back with it, so a retry writes the prompt onto
			// the check-in already made rather than scheduling a second one.
			stagedCheckIn = extras.checkIn;
			stagedCheckInSessionId = extras.checkInSessionId;
			stagedRubric = extras.rubric;
			// Only a rubric that LANDED stops being the spec's: one still staged
			// because its write was refused is still the derived one, so a
			// corrected spec pasted before the retry must still replace it.
			if (extras.rubric == null) stagedRubricDerived = false;
			failures.push(...extras.failures);
		}

		/**
		 * THE DOCUMENT, on exactly the terms of everything above it: attempted
		 * independently, named when it fails, and STILL STAGED when it does --
		 * so saving again retries the upload rather than sending a teacher to
		 * find the same file twice.
		 *
		 * Its own call rather than a fifth member of `applyStagedExtras` because
		 * that module is the composer's own staging set and this arrived on a
		 * different lane. The semantics are deliberately identical, and a bundle
		 * that folds the two together should keep them.
		 */
		if (stagedHtml && htmlAssignmentTransports) {
			const applied = await applyStagedHtmlAssignment(
				itemId,
				stagedHtml,
				htmlAssignmentTransports
			);
			stagedHtml = applied.staged;
			if (applied.staged == null) {
				htmlIssues = [];
				htmlWarnings = [];
			}
			failures.push(...applied.failures);
		}

		if (failures.length) {
			// The content DID save. Saying so and naming what did not is the
			// honest report; claiming the whole thing failed would send a
			// teacher back to retype something already published.
			//
			// Remember WHICH item, so "save again" retries the attachments on it
			// rather than creating a second copy of content that already exists.
			if (mode === 'create') createdItemId = itemId;
			msg = {
				ok: false,
				text:
					`Saved, but ${failures.length} thing${failures.length === 1 ? '' : 's'} did not: ` +
					// A server refusal usually ends in a full stop of its own, so
					// the sentence that follows must not add a second one.
					`${failures.map((f) => f.replace(/\.\s*$/, '')).join('; ')}. ` +
					'What is left is still here -- save again to retry.'
			};
			onsaved({ kind: editingKind, published: publish, text: '', itemId });
			return;
		}
		// What ELSE landed, named -- so a teacher who staged a deck and a spec
		// alongside the post is told all three happened, not just the post.
		const alsoLanded = [
			hadFiles ? 'Files attached.' : '',
			hadDeck ? 'Deck uploaded.' : '',
			hadSpec ? (specKind === 'reference' ? 'Document attached.' : 'Spec attached.') : '',
			hadRubric ? 'Rubric attached.' : '',
			hadHtml ? 'Document attached.' : '',
			hadCheckIn ? 'Check-in scheduled.' : ''
		].filter(Boolean);
		const attachNote = alsoLanded.length ? ` ${alsoLanded.join(' ')}` : '';

		const what = ITEM_KINDS.find((k) => k.id === editingKind)?.label ?? 'Item';
		const goLive = scheduledAhead ? new Date(localInputToIso(publishAt) ?? '').toLocaleString() : '';
		/**
		 * THE TWO HALVES OF THIS SENTENCE ANSWER DIFFERENT QUESTIONS, and they
		 * are keyed differently on purpose.
		 *
		 * A PUBLISH is about the AUDIENCE, so it keys on `mode`: a create-mode
		 * composer is putting this in front of a class for the first time,
		 * whatever `saveTarget` had to do to get there. A retry after a
		 * half-landed create is still that class's first sight of it, and
		 * "updated -- every class sees the change" would be a strange thing to
		 * read about something nobody had seen yet.
		 *
		 * A DRAFT is about the RECORD, so it keys on what the save actually
		 * did. A create composer holding `createdItemId` UPDATES the row its
		 * last checkpoint made, and saying "saved as a draft to 1 class" a
		 * second time would describe a post that was not made -- which is
		 * exactly the sentence somebody read while wondering where the copies
		 * were coming from.
		 */
		const draftUpdated = target.action === 'update';
		const inClasses = `${targetIds.length} class${targetIds.length === 1 ? '' : 'es'}`;
		const where = publish
			? mode === 'edit'
				? scheduledAhead
					? `updated -- students see it from ${goLive}`
					: 'updated -- every class it is posted to sees the change'
				: scheduledAhead
					? `scheduled for ${goLive} in ${inClasses}`
					: `posted to ${inClasses}`
			: draftUpdated
				? 'updated (draft)'
				: `saved as a draft to ${inClasses}`;
		const text = `${what} ${where}.${attachNote}`;

		/**
		 * A SAVE DRAFT IS A CHECKPOINT, NOT A FINISH, AND ONLY A PUBLISH ENDS
		 * THE COMPOSER SESSION.
		 *
		 * This block used to run for BOTH buttons. So Save draft created the
		 * row, then dropped the handle to it and emptied every field -- and the
		 * next press created a SECOND row, and the one after that a third.
		 * MEASURED on the real component: five presses, five rows, four of them
		 * carrying a null title because the form had been wiped after the first.
		 * That is the reported duplication AND the reported lost progress in one
		 * defect: the copies pile up, and the writing disappears out of the box
		 * while the message says it was saved.
		 *
		 * It is the rule CLAUDE.md already states for the notebook composer,
		 * applied to the surface that still broke it: keep the handle across an
		 * explicit save, so the next write ADDS to the record this session made
		 * rather than starting a second one, and leave the writing where it is.
		 * Keeping the text is safe because `baseline.advance` below moves the
		 * comparison to exactly what was just sent -- the form reads clean and
		 * nothing goes out again until something actually changes.
		 *
		 * A PUBLISH still resets, because that IS the finish: the post is live
		 * and the next one is a genuinely new item.
		 */
		if (mode === 'create' && !publish) {
			// The row this session owns from here on. Everything after this is an
			// update of it -- see `saveTarget`.
			createdItemId = itemId;
			baseline.advance(sentSignature);
		} else if (mode === 'create') {
			// Everything landed and it is published, so the next post is a
			// genuinely new item.
			createdItemId = null;
			title = '';
			points = '';
			// THE DATE CLEARS AND THE TIME GOES BACK TO THE DEFAULT, which is what
			// "a fresh post" means for this field: `due` is derived, so clearing
			// the date is what empties it.
			dueDate = '';
			dueTime = DEFAULT_DUE_TIME;
			publishAt = '';
			category = '';
			links = [];
			instructorLinks = [];
			// Both are already null (nothing failed), stated so the reset reads as
			// the complete list of what a fresh post starts from.
			stagedDeck = null;
			stagedSpec = null;
			stagedRubric = null;
			stagedRubricDerived = false;
			stagedCheckIn = null;
			stagedCheckInSessionId = null;
			deckIssue = null;
			// The next post starts from the default placement, and the database
			// holds the default for a row that does not exist yet.
			layout = { ...DEFAULT_ITEM_LAYOUT };
			savedLayout = { ...DEFAULT_ITEM_LAYOUT };
			// The editor is remounted by bumping its key rather than reset
			// through it: `bodyDoc` is what the parent holds, and a keyed
			// remount is the one way to be sure the two agree afterwards.
			bodyDoc = null;
			editorSeed += 1;
		}
		msg = { ok: true, text };
		onsaved({ kind: editingKind, published: publish, text, itemId });
	}
</script>

<!--
	ONE SET OF CONTROLS, RENDERED TWICE. This is a snippet and not a second row
	of buttons: the save path is `submit(true)` / `submit(false)` and there is
	exactly one spelling of each, so the top control cannot come to mean
	something slightly different from the bottom one. The `place` is used only
	to keep the two `data-testid`s apart.

	WHY THERE IS A TOP ONE AT ALL. The actions row is the LAST thing in the
	form, after the title, the body editor, the points and dates, the links,
	the attachments, the deck, the spec, the rubric, the check-in and the class
	targets -- around 420 lines of markup on an assignment. Editing a long post
	means scrolling the whole form back down to save it, every time, and the
	report is exactly that. The top one is the same press without the scroll.
-->
{#snippet actions(place: 'top' | 'bottom')}
	<button
		class="btn"
		type="button"
		disabled={busy}
		data-testid="composer-publish-{place}"
		onclick={() => submit(true)}
	>
		{#if mode === 'edit'}
			{scheduledAhead ? 'Save & schedule' : 'Save & publish'}
		{:else}
			{scheduledAhead ? 'Schedule' : 'Post now'}
		{/if}
	</button>
	<button
		class="btn secondary"
		type="button"
		disabled={busy}
		data-testid="composer-draft-{place}"
		onclick={() => submit(false)}
	>
		Save draft
	</button>
	{#if oncancel}
		<button
			class="btn secondary"
			type="button"
			disabled={busy}
			data-testid="composer-cancel-{place}"
			onclick={() => oncancel?.()}
		>
			Cancel
		</button>
	{/if}
{/snippet}

<!--
	WHERE A RESOURCE GROUP SITS (0193). A radio group of two words each, not a
	checkbox reading "above": both answers are states somebody chose, and a
	tick that means "above" leaves "below" as the absence of a decision. 44px
	each because a teacher sets this on a phone as readily as anywhere. It is
	rendered ONLY when the transport that can write it exists -- absence is
	the mechanism, so a deployment without the migration shows nothing here
	rather than a control whose save would fail.
-->
{#snippet placeCheck()}
	<svg class="place-check" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
		<path d="M5 12.5l4.5 4.5L19 7.5" />
	</svg>
{/snippet}

{#snippet placement(group: 'files' | 'links', testId: string)}
	{#if layoutTransports}
		<div
			class="place-picker"
			role="radiogroup"
			aria-label={group === 'files' ? 'Where the files sit' : 'Where the links sit'}
			data-testid={testId}
		>
			<span class="place-label">{group === 'files' ? 'Files:' : 'Links:'}</span>
			<!-- THE CHECKED OPTION CARRIES A MARK, not only a hue: the word is the
			     same on both states, so a check glyph (aria-hidden, the word and
			     `aria-checked` beside it say the same thing) and a heavier weight
			     are what tell them apart for anyone who cannot read the green. -->
			<button
				type="button"
				role="radio"
				class="place-opt"
				aria-checked={layout[group] === 'top'}
				onclick={() => place(group, 'top')}
			>
				{#if layout[group] === 'top'}{@render placeCheck()}{/if}
				Above the text
			</button>
			<button
				type="button"
				role="radio"
				class="place-opt"
				aria-checked={layout[group] === 'bottom'}
				onclick={() => place(group, 'bottom')}
			>
				{#if layout[group] === 'bottom'}{@render placeCheck()}{/if}
				Below the text
			</button>
		</div>
	{/if}
{/snippet}

<!--
	THE ORDER CONTROLS ON A LINK ROW. The grip is a real button so a keyboard
	reaches it (`sortDrag` commits ArrowUp/ArrowDown on a focused handle), and
	the two Move buttons beside it are the visible-word spelling of the same
	move -- the grip alone is a glyph, and every control carries a word. All
	three go through ONE `move(from, to)`. NOT GATED ON THE 0193 TRANSPORTS,
	unlike the file order beside it: a link's position has been stored by the
	existing save since 0082 (`classroom_item_resources` is a full-set
	replacement whose array order is the sort), so the control needs no new
	write and works on a deployment where the files cannot yet move. Offered
	only where there is a second link to move past.
-->
{#snippet linkTools(index: number, total: number, move: (from: number, to: number) => void, what: string)}
	{#if total > 1}
		<span class="order-tools">
			<button
				type="button"
				class="btn secondary order-btn order-grip"
				data-sort-handle
				aria-label="Reorder {what} {index + 1}: drag, or use the arrow keys"
				title="Drag to reorder"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
					<circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
					<circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
					<circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
				</svg>
			</button>
			<button
				type="button"
				class="btn secondary order-btn"
				aria-disabled={index === 0}
				aria-label="Move {what} {index + 1} up"
				onclick={() => move(index, index - 1)}
			>
				Move up
			</button>
			<button
				type="button"
				class="btn secondary order-btn"
				aria-disabled={index === total - 1}
				aria-label="Move {what} {index + 1} down"
				onclick={() => move(index, index + 1)}
			>
				Move down
			</button>
		</span>
	{/if}
{/snippet}

<!--
	THE FORM IS ONE SNIPPET RENDERED IN ONE OF TWO FRAMES. Inline (the console
	card, a `compact` row) it is exactly the markup it always was; in `screen`
	mode the same snippet sits inside the dialog layer below. Two copies of the
	form would be two sets of controls to keep in step, and the one nobody is
	looking at is the one that drifts.

	THE DROP ZONE IS THE WHOLE FORM (`composerDropZone`, script above): a file
	let go anywhere on it lands on the student-facing list, and the overlay at
	the end of the snippet says so while a file drag is over it.
-->
{#snippet form()}
<div
	class="composer"
	class:compact={compact && !screen}
	class:is-screen={screen}
	onpaste={onPaste}
	use:composerDropZone={{ disabled: !attachmentsEnabled || busy }}
>
	<div class="composer-actions top" data-testid="composer-actions-top">
		{@render actions('top')}
		<!-- The indicator rides the top row too, because a person who saves from
		     here is looking here and "Saved 3:14 PM" arriving 400 lines below
		     them is the same as no acknowledgement at all. Same instance, same
		     five words, same machine. -->
		<span class="save-line inline"><SaveIndicator state={save} /></span>
	</div>
	{#if mode === 'create'}
		<div class="kind-toggle" role="tablist" aria-label="Content type">
			{#each ITEM_KINDS as k (k.id)}
				<button
					type="button"
					class="kind"
					class:active={kind === k.id}
					title={k.blurb}
					onclick={() => (kind = k.id)}
				>
					{k.label}
				</button>
			{/each}
		</div>
	{/if}

	<label>
		<span>{needsTitle ? 'Title' : 'Title (optional)'}</span>
		<input
			type="text"
			bind:value={title}
			bind:this={titleInput}
			placeholder={editingKind === 'material' ? 'Course syllabus' : 'Bridge sketch'}
		/>
	</label>
	<div class="body-field">
		<span class="mini-label">{bodyLabel}</span>
		{#key editorSeed}
			<RichTextEditor
				value={seedDoc}
				label={bodyLabel}
				{compact}
				disabled={busy}
				images={bodyImages}
				imagesEmptyHint={bodyImagesEmptyHint}
				onchange={(doc) => (bodyDoc = doc)}
				onready={(doc) => {
					// THE BASELINE, NOT AN EDIT. Seeding Tiptap emits a transaction
					// of its own, so `bodyDoc` arriving here is the stored body
					// normalized -- what the composer opened on, by definition.
					// Taken from the editor's serialization rather than `seedDoc`
					// so that normalization can never read as an unsaved change.
					bodyDoc = doc;
					baseline.seed(
						composerDraftSignature({ ...untrack(() => draft), bodyText: tiptapText(doc) })
					);
				}}
				placeholder={editingKind === 'post'
					? 'Share something with your class...'
					: 'What this is, and what to do with it...'}
			/>
		{/key}
	</div>

	{#if isAssignment}
		<div class="field-row">
			<label>
				<span>Points</span>
				<input type="number" min="0" max="10000" bind:value={points} placeholder="20" />
			</label>
			<!--
				TWO CONTROLS, ONE FIELD, AND THE TIME CARRIES THE DEFAULT. A single
				`datetime-local` has nowhere to put an 11:59pm default: with only its
				date segments filled its value is the empty string, `badInput` is
				true and no event has fired, so there is nothing for a default to
				react to. Measured in Chromium; `due-default.ts` carries the numbers.

				THE DATE IS WHAT DECIDES WHETHER THERE IS A DEADLINE. Clearing it
				clears the due date whatever the time says, which is why the two are
				labelled as one field rather than as two independent ones.
			-->
			<span class="due-field">
				<span class="due-legend" id="due-legend">Due</span>
				<span class="due-inputs">
					<label class="due-part">
						<span class="due-part-label">Date</span>
						<input
							type="date"
							bind:value={dueDate}
							aria-describedby="due-legend"
							data-testid="composer-due-date"
						/>
					</label>
					<label class="due-part">
						<span class="due-part-label">Time</span>
						<input
							type="time"
							bind:value={dueTime}
							aria-describedby="due-legend"
							data-testid="composer-due-time"
						/>
					</label>
				</span>
			</span>
			<label>
				<span>Grading category</span>
				<input
					type="text"
					bind:value={category}
					placeholder="Unit Labs"
					list={categorySuggestions.length ? categoryListId : undefined}
				/>
				{#if categorySuggestions.length}
					<datalist id={categoryListId}>
						{#each categorySuggestions as c (c)}
							<option value={c}></option>
						{/each}
					</datalist>
				{/if}
			</label>
		</div>
	{/if}

	<div class="resources-editor">
		<span class="mini-label">Links</span>
		{@render placement('links', 'place-links')}
		<!-- `sortDrag` on the LIST, a handle in each row; it never reorders the
		     DOM, `moveLink` does, and the keyed each re-renders the rows in the
		     new order. Disabled, not absent, without the transport: the rows
		     carry no handle then, so there is nothing for it to grab. -->
		<div
			class="resource-rows"
			use:sortDrag={{ items: '.resource-row', ondrop: moveLink, disabled: busy }}
		>
			{#each links as r, i (i)}
				<div class="resource-row" data-sort-item>
					<input type="text" placeholder="Label" bind:value={r.label} />
					<input type="url" placeholder="https://..." bind:value={r.url} />
					<span class="row-tools">
						{@render linkTools(i, links.length, moveLink, 'link')}
						<!-- A WORD, NOT A GLYPH, and `order-btn` rather than `tiny`:
						     it sits in the same row as three 44px worded controls, and
						     the chip class would pin it to 24px (see the CSS note). -->
						<button
							type="button"
							class="btn secondary order-btn"
							aria-label="Remove link {i + 1}"
							onclick={() => (links = links.filter((_, j) => j !== i))}
						>
							Remove
						</button>
					</span>
				</div>
			{/each}
		</div>
		<button
			type="button"
			class="btn secondary tiny"
			onclick={() => (links = [...links, { label: '', url: '' }])}
		>
			+ Add link
		</button>
	</div>

	{#if attachmentsEnabled}
		<div class="attach-editor">
			<span class="mini-label">Files</span>
			{@render placement('files', 'place-files')}
			<!-- THE PASTE CUE, at body weight rather than as a hint: it is the one
			     sentence that says a screenshot needs no picker at all, and a hint
			     in --text-2 under a label is the line nobody reads. -->
			<p class="paste-cue" data-testid="composer-paste-cue">
				Drop a file anywhere on this form, or press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste a
				screenshot straight in.
			</p>
			<!-- THE SHARED PANEL. Same component, same failure semantics and same
			     words as a student's hand-in; `autoStart` is false here because on
			     a create there is no item id to upload against until the save call
			     returns. No `accept` on its picker: any file type, either side. -->
			<FileUploadPanel
				bind:this={filePanel}
				role="attachment"
				itemId={item?.id ?? createdItemId}
				upload={uploadStagedFile}
				label="Files"
				hint="Any file type, up to 200 MB each. Uploads when you save."
				showPreviews
				oncountchange={(n) => {
					stagedFileCount = n;
					// The count is the SIGNAL; the names are the read. See
					// `stagedFileNames` for why this is not a second panel callback.
					stagedFileNames = (filePanel?.files() ?? []).map((f) => f.name);
				}}
			/>
			{#if pasteHint}
				<p class="feedback ok">{pasteHint}</p>
			{/if}
			{#if mode === 'edit' && existing.length}
				<!-- The composer is manager-only by construction, so the reference is
				     offered unconditionally here. This is where an author is when
				     they need it: the file is on screen and the prose editor is a
				     few centimetres away. -->
				<!-- THE ORDER, THE RENAME AND THE BLOCK all ride the transport's
				     presence (0193): null removes each control, and the list is
				     exactly what it was before any of them existed. -->
				<AttachmentList
					attachments={existing}
					onremove={removeExisting}
					removing={removingId}
					figureRefs
					onreorder={layoutTransports ? reorderExisting : null}
					onrename={layoutTransports ? renameExisting : null}
					renameBlocked={layoutTransports ? renameBlocked : null}
				/>
			{/if}
		</div>
	{/if}

	<!--
		THE DECK AND THE SPEC SIT WITH THE CONTENT, above the posting targets and
		the schedule -- they are things this item IS, not decisions about where
		and when it goes. Both are create-only; on edit the item page owns them.
	-->
	{#if canStageDeck}
		<!-- THE SHARED DROP TARGET, same primitive as everything else. Disabled
		     once a deck is staged: the "Remove deck" step is what makes room for
		     a replacement, exactly as the plain picker below is only offered then. -->
		<div
			class="attach-editor"
			class:is-drop-active={deckDragActive}
			use:dropTarget={{
				onfiles: onDeckDropFiles,
				onactive: (a) => (deckDragActive = a),
				disabled: !!stagedDeck || busy
			}}
		>
			<span class="mini-label">Presentation deck</span>
			{#if stagedDeck}
				<p class="spec-line">
					<span class="ok-dot"></span>
					Deck ready:
					<strong>{stagedDeck.name}</strong>
					<span class="spec-meta">{formatBytes(stagedDeck.size)} · uploads on save</span>
				</p>
				{#if busy && deckProgress}
					{@const pct = deckProgressPercent(deckProgress)}
					<span class="upload-bar" role="progressbar" aria-label="Deck upload" aria-valuenow={pct ?? undefined} aria-valuemin="0" aria-valuemax="100">
						<span class="upload-bar-fill" class:sweep={pct === null} style={pct === null ? '' : `width: ${pct}%`}></span>
					</span>
					<p class="hint" data-testid="staged-deck-progress">
						{deckProgressLabel(deckProgress)}{pct === null ? '' : ` · ${pct}%`}
					</p>
				{:else}
					<span class="tool-actions">
						<button
							type="button"
							class="btn secondary tiny"
							data-testid="staged-deck-remove"
							onclick={() => (stagedDeck = null)}
						>
							Remove deck
						</button>
					</span>
				{/if}
			{:else}
				<p class="hint">
					A Claude Design project HTML zip, exported with hidden files included -- the image
					framing lives in one of them. Capped at
					{Math.floor(DECK_UPLOAD_MAX_ZIP_BYTES / 1024 / 1024)} MB, so attach gifs and video as
					files above instead of embedding them.
				</p>
				<input
					type="file"
					class="file-input"
					data-testid="staged-deck-input"
					accept=".zip,application/zip,application/x-zip-compressed"
					onchange={pickDeck}
				/>
			{/if}
			{#if deckIssue}
				<p class="feedback error" data-testid="staged-deck-issue">{deckIssue}</p>
			{/if}
			{#if deckDragActive}
				<div class="deck-drop-overlay" aria-hidden="true">Drop files here</div>
			{/if}
		</div>
	{/if}

	<!--
		THE PORTED DOCUMENT SITS WITH THE DECK AND THE SPEC, because it is the same
		kind of thing: what this assignment IS, not a decision about where or when
		it goes. It is the ALTERNATIVE to a spec rather than an addition to one --
		an assignment is a spec-driven worksheet or a ported document, never both --
		which is why the panel says so rather than leaving a teacher to find out by
		attaching two.
	-->
	{#if canStageHtml}
		<div
			class="attach-editor"
			class:is-drop-active={htmlDragActive}
			data-testid="staged-html"
			use:dropTarget={{
				onfiles: onHtmlDropFiles,
				onactive: (a) => (htmlDragActive = a),
				disabled: !!stagedHtml || htmlReading || busy
			}}
		>
			<span class="mini-label">Ported HTML assignment</span>
			{#if stagedHtml}
				<p class="spec-line">
					<span class="ok-dot"></span>
					Document ready:
					<strong>{stagedHtml.manifest.title}</strong>
					<span class="spec-meta">{stagedHtmlSummary(stagedHtml)} &middot; saves on post</span>
				</p>
				<p class="hint">
					From <strong>{stagedHtml.filename}</strong>. Students work inside the document;
					every answer is stored against this assignment and graded here, the same as any
					other. Correcting it later means uploading the document again, which keeps the
					old one as a revision.
				</p>
				<span class="tool-actions">
					<button
						type="button"
						class="btn secondary tiny"
						data-testid="staged-html-remove"
						onclick={clearStagedHtml}
					>
						Remove document
					</button>
				</span>
			{:else if htmlReading}
				<Pending label={pendingLabel('Checking the document')} />
			{:else}
				<p class="hint">
					One self-contained .html document with its styles and script inline, carrying an
					<code>idea-manifest</code> block that declares its modules, answer blocks and rubric.
					It is checked here before anything is posted, and every problem is named at once.
					Capped at {Math.floor(HTML_DOCUMENT_MAX_BYTES / 1024 / 1024)} MB.
				</p>
				<!--
					NO `accept`, AND THAT IS THE REPO'S RULE RATHER THAN AN OVERSIGHT
					(`tests/classroom-attachment-mime.test.ts` sweeps for one). The
					deck input is exempt BY ITS OWN TESTID so a new picker cannot
					inherit the exemption by accident, and this one deliberately does
					not take that exemption: `stagedHtmlIssue` refuses a non-HTML file
					the instant it is picked, by extension AND by declared type, with a
					sentence saying what to upload instead. That is a better gate than
					an `accept` filter, which every OS dialog lets a person switch off
					anyway -- so a picker resting on one still needs the check, and this
					one is the check.
				-->
				<input
					type="file"
					class="file-input"
					data-testid="staged-html-input"
					onchange={pickHtml}
				/>
			{/if}
			<!--
				RENDERED VERBATIM, EACH ON ITS OWN LINE. The same sentence is produced
				by this check and by 0195's own raise, and the next thing that happens
				to a refusal is being pasted back into whatever generated the document
				-- so nothing here shortens, re-tones or summarises one, and a count
				stands in front of the list rather than in place of it.
			-->
			{#if htmlIssues.length}
				<div class="feedback error" data-testid="staged-html-issues">
					<p>
						This document was not attached. {htmlIssues.length}
						{htmlIssues.length === 1 ? 'problem' : 'problems'} to fix:
					</p>
					<ul>
						{#each htmlIssues as issue}
							<li>{issue}</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if htmlWarnings.length}
				<div class="feedback" data-testid="staged-html-warnings">
					<ul>
						{#each htmlWarnings as warning}
							<li>{warning}</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if htmlDragActive}
				<div class="deck-drop-overlay" aria-hidden="true">Drop files here</div>
			{/if}
		</div>
	{:else if mode === 'create' && specKind === 'assignment' && !!htmlAssignmentTransports && !htmlAssignmentAdmin}
		<!--
			THE REFUSAL, and it renders ONLY where a caller deliberately handed the
			transport to somebody who may not use it. A surface that hands no
			transport shows nothing at all, which is the ordinary case and the
			reason a teacher never reads a sentence about a control they have not
			been told about.
		-->
		<p class="hint" data-testid="staged-html-refusal">{HTML_ASSIGNMENT_ADMIN_ONLY}</p>
	{/if}

	<!--
		THE CHECK-IN SITS WITH THEM, and for the same reason: "students photograph
		their notes on this" is something this item IS, not a decision about where
		or when it goes. It is the whole point of 0120 that the two are authored
		together -- a teacher who has just written up the day's material should not
		have to go to a different console to say the notebook work that goes with
		it exists.
	-->
	{#if canStageCheckIn}
		<div class="attach-editor">
			<CheckInStager
				label="Notebook check-in"
				submitLabel="Attach check-in"
				hint="Students photograph their notebook page against this. It appears on this item rather than as a separate row, and runs in every class you post to."
				staged={stagedCheckIn}
				busy={busy}
				guidanceAvailable={!!checkInTransports?.setGuidance}
				onstage={(draft) => (stagedCheckIn = draft)}
				onremove={() => {
					stagedCheckIn = null;
					// A check-in already created has to be forgotten with it, or the
					// next save would write a prompt onto a check-in this form no
					// longer claims to be attaching.
					stagedCheckInSessionId = null;
				}}
			/>
		</div>
	{/if}

	{#if canStageSpec && specKind}
		<div class="attach-editor">
			<span class="mini-label">
				{specKind === 'reference' ? 'Reference document' : 'Interactive spec'}
			</span>
			<!-- The SAME importer the item page mounts, in its staging mode: the
			     validated JSON comes back through `onstage` and is applied the
			     moment the create call returns an id. -->
			<SpecImporter
				kind={specKind}
				itemId={null}
				staged={stagedSpecShown}
				onstage={(raw) => stageSpec(raw)}
			/>
		</div>
	{/if}

	{#if canStageRubric}
		<div class="attach-editor">
			<span class="mini-label">Rubric</span>
			<!-- The SAME builder the item page mounts, in its staging mode: the
			     validated criteria list comes back through `onstage` and is
			     applied the moment the create call returns an id. -->
			<RubricBuilder
				itemId={null}
				criteria={null}
				staged={stagedRubric}
				spec={stagedSpecShown as AssignmentSpec | null}
				transports={teacherTransports!}
				onstage={(criteria) => {
					stagedRubric = criteria;
					stagedRubricDerived = false;
				}}
			/>
		</div>
	{/if}

	<div class="instructor-editor">
		<span class="mini-label instructor-label">
			<span class="lock-glyph" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
					<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
				</svg>
			</span>
			Instructor only
		</span>
		<p class="hint">
			Answer keys, facilitation notes, source files. Visible only to this item's teachers of
			record and admins -- students never see this section or know it exists.
		</p>

		<div class="resources-editor">
			<div
				class="resource-rows"
				use:sortDrag={{
					items: '.resource-row',
					ondrop: moveInstructorLink,
					disabled: busy
				}}
			>
				{#each instructorLinks as r, i (i)}
					<div class="resource-row" data-sort-item>
						<input type="text" placeholder="Label" bind:value={r.label} />
						<input type="url" placeholder="https://..." bind:value={r.url} />
						<span class="row-tools">
							{@render linkTools(i, instructorLinks.length, moveInstructorLink, 'instructor link')}
							<button
								type="button"
								class="btn secondary order-btn"
								aria-label="Remove instructor link {i + 1}"
								onclick={() => (instructorLinks = instructorLinks.filter((_, j) => j !== i))}
							>
								Remove
							</button>
						</span>
					</div>
				{/each}
			</div>
			<button
				type="button"
				class="btn secondary tiny"
				onclick={() => (instructorLinks = [...instructorLinks, { label: '', url: '' }])}
			>
				+ Add instructor link
			</button>
		</div>

		{#if instructorAttachmentsEnabled}
			<!-- THE SAME PANEL AS EVERYTHING ELSE. Same component, same per-file
			     progress, same per-file message and Retry, same 200 MB, no `accept`
			     -- the only thing that differs is which transport it is handed, and
			     therefore which bucket and which table the bytes end up in. -->
			<FileUploadPanel
				bind:this={instructorPanel}
				role="instructor"
				itemId={item?.id ?? createdItemId}
				upload={uploadInstructorStagedFile}
				label="Instructor-only files"
				hint="Any file type, up to 200 MB each. Uploads when you save."
				showPreviews
				oncountchange={(n) => (instructorStagedCount = n)}
			/>
			{#if mode === 'edit' && instructorExisting.length}
				<AttachmentList
					attachments={instructorExisting}
					onremove={removeInstructorExisting}
					removing={instructorRemovingId}
					resolveSrc={(a) => instructorAttachmentSrc(a.id)}
					onreorder={layoutTransports ? reorderInstructorExisting : null}
					onrename={layoutTransports ? renameInstructorExisting : null}
				/>
			{/if}
		{/if}
	</div>

	{#if mode === 'create'}
		<div class="target-picker">
			<span class="mini-label">Post to</span>
			{#if sections.length === 0}
				<p class="hint">Create a section first.</p>
			{:else}
				<div class="target-list">
					{#each sections as s (s.id)}
						<label class="target-check">
							<input type="checkbox" bind:checked={targets[s.id]} />
							<span>{sectionTitle(s)}</span>
						</label>
					{/each}
				</div>
			{/if}
		</div>
	{:else if item}
		<div class="target-picker linkage">
			<span class="mini-label">Posted to</span>
			<p class="hint">
				One shared copy. Editing above changes it everywhere; unlinking removes it from that
				class only.
			</p>
			<ul class="posted-list">
				{#each postedSections as s (s.id)}
					<li>
						<span class="posted-name">{sectionTitle(s)}</span>
						<button
							type="button"
							class="btn secondary tiny danger"
							disabled={busy}
							onclick={() => unlink(s.id)}
						>
							{unlinkArm === s.id ? 'Really unlink?' : 'Unlink'}
						</button>
					</li>
				{:else}
					<li><span class="posted-name muted">Not posted to any class you manage.</span></li>
				{/each}
			</ul>
			{#if linkableSections.length}
				<span class="mini-label">Also post to</span>
				<div class="target-list">
					{#each linkableSections as s (s.id)}
						<label class="target-check">
							<input type="checkbox" bind:checked={linkTargets[s.id]} />
							<span>{sectionTitle(s)}</span>
						</label>
					{/each}
				</div>
				<button
					type="button"
					class="btn secondary tiny"
					disabled={busy || linkIds.length === 0}
					onclick={addLinks}
				>
					Post to {linkIds.length || ''} more
				</button>
			{/if}
		</div>
	{/if}

	<div class="schedule-field">
		<label class="schedule-label">
			<span class="mini-label">Schedule for (optional)</span>
			<input type="datetime-local" bind:value={publishAt} />
		</label>
		<p class="hint">
			{#if scheduledAhead}
				Students see this from {new Date(localInputToIso(publishAt) ?? '').toLocaleString()}. Until
				then it is yours alone -- you can keep editing it, and no one is told it changed.
			{:else}
				Leave empty to post immediately. Set a future time and students see it then, not before.
			{/if}
		</p>
	</div>

	<div class="composer-actions">{@render actions('bottom')}</div>
	<!-- The same five states, in the same words, as the other three surfaces.
	     The full report stays below it: the indicator says WHICH state, the
	     feedback line says what did and did not land. -->
	<div class="save-line"><SaveIndicator state={save} /></div>
	{#if msg}
		<p class="feedback" class:ok={msg.ok} class:error={!msg.ok}>{msg.text}</p>
	{/if}
	{#if composerDragActive}
		<!-- `pointer-events: none`, so the drop still lands on whatever is under
		     the pointer -- a nested panel takes its own, the form takes the rest. -->
		<div class="composer-drop-overlay" data-testid="composer-drop-overlay" aria-hidden="true">
			Drop to attach
		</div>
	{/if}
</div>
{/snippet}

{#if screen}
	<!--
		THE LAYER. `role="dialog"` + `aria-modal` on a FIXED element above the
		masthead (z-index 60: the masthead is 1, the lightbox and the legacy
		header are 100, the navigation bar 1000 -- see app.css), a header row
		that names what is being edited and carries the one control that has
		to be reachable without scrolling, then the form scrolling inside. The
		form's own sticky actions row sticks to the top of THIS scroller, under
		the header, exactly as it stuck to the top of the page before.
	-->
	<div
		class="composer-screen"
		role="dialog"
		aria-modal="true"
		aria-labelledby={screenTitleId}
		data-testid="composer-screen"
		bind:this={screenEl}
	>
		<div class="composer-screen-head">
			<h2 class="composer-screen-title" id={screenTitleId}>{screenTitle}</h2>
			<button
				type="button"
				class="btn secondary composer-screen-close"
				data-testid="composer-screen-close"
				onclick={() => oncancel?.()}
			>
				Close
			</button>
		</div>
		<div class="composer-screen-body">
			{@render form()}
		</div>
	</div>
{:else}
	{@render form()}
{/if}

<style>
	/* The TOP copy of the actions row. It is sticky rather than merely first,
	   because a long form scrolled halfway is exactly when it is wanted and a
	   control that scrolled away with the rest would be the bottom row again.
	   `--surface-1` so the form does not read through it, and a boundary
	   underneath because it is the only thing separating it from the fields
	   sliding past. */
	.composer-actions.top {
		position: sticky;
		top: 0;
		z-index: 2;
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: var(--space-3);
		padding: var(--space-2) 0;
		background: var(--surface-1);
		border-bottom: 1px solid var(--boundary);
	}
	.save-line.inline {
		margin-left: auto;
	}

	/* Spacing only: the look lives in classroom.css. */
	.feedback {
		margin: 0.6rem 0 0;
	}
	.save-line:empty {
		display: none;
	}
	.save-line {
		margin-top: 0.6rem;
	}

	.composer {
		display: block;
		/* The drop overlay is positioned against the form, so the form is the
		   containing block. Nothing else here reads this. */
		position: relative;
	}
	/* The composer-wide drop overlay (item NINE). A veil over the whole form
	   that says where a file will land; `pointer-events: none` so the drop
	   itself still reaches the element under the pointer. Same green wash as
	   the deck box's overlay, so a drag reads the same everywhere on the form. */
	.composer-drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-card);
		outline: 2px dashed var(--green);
		outline-offset: -2px;
		background: color-mix(in srgb, var(--green) 14%, var(--surface-1));
		font-family: var(--font-mono);
		font-size: 1rem;
		letter-spacing: 0.06em;
		color: var(--text-1, var(--white));
		pointer-events: none;
	}

	/* --- The full-viewport frame (item EIGHT) ------------------------------
	   Fixed, above the masthead (1) and below the lightbox (100): 60. Flex
	   column, so the header keeps its height and the body takes the rest and
	   scrolls on its own -- `min-height: 0` is what lets a flex child shrink
	   below its content and actually scroll. `100dvh` so a phone's browser
	   chrome sliding away does not leave the Close row under it. */
	.composer-screen {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		height: 100dvh;
		background: var(--surface-0);
		color: var(--text-1);
	}
	.composer-screen-head {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--cr-gutter, 1rem);
		border-bottom: 1px solid var(--boundary);
		background: var(--surface-1);
	}
	.composer-screen-title {
		margin: 0;
		font-size: 1rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.composer-screen-close {
		flex: none;
		min-height: 44px;
		min-width: 44px;
	}
	.composer-screen-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		/* At least 16px of gutter at every width; the measure keeps a 1440px
		   form from running the whole viewport wide. */
		padding: var(--space-3) max(var(--cr-gutter, 1rem), 16px) var(--space-6);
	}
	.composer-screen-body > .composer {
		/* THE FORM'S OWN MEASURE, a literal rather than a `--measure-*` token:
		   those are PAGE measures (`classroomMeasure` in nav.ts) and this layer
		   is not a page. 64rem is where a two-input link row and the placement
		   controls stop gaining width; the reading measure would fold the row. */
		max-width: 64rem;
		margin: 0 auto;
	}

	/* --- Placement (item FOUR) ---------------------------------------------
	   A radio group drawn as a segmented pair. 44px per option; the CHECKED
	   state is a check GLYPH, a heavier weight, a fill and an edge together,
	   so colour is never the only signal -- the word alone cannot be it,
	   because it is the same word in both states. */
	.place-picker {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin: 0.1rem 0 0.2rem;
	}
	.place-label {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.place-opt {
		appearance: none;
		min-height: 44px;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
		cursor: pointer;
	}
	.place-opt[aria-checked='true'] {
		color: var(--green);
		border-color: var(--green);
		background: color-mix(in srgb, var(--green) 12%, var(--surface-2));
		font-weight: 700;
	}
	.place-check {
		width: 0.9rem;
		height: 0.9rem;
		margin-right: 0.35rem;
		vertical-align: -0.15em;
	}
	.place-opt:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	/* --- Link rows with order controls (item FIVE) -------------------------- */
	.resource-rows {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.row-tools,
	.order-tools {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
	}
	/* 44px ON EVERY ORDER CONTROL, and NOT `.btn.tiny`. The chip class carries
	   `min-height: 24px` from classroom.css at the same specificity as a
	   scoped rule here, and it is declared later, so a `min-height: 44px` on
	   a `.tiny` button lost silently -- MEASURED by the browser pass: grips
	   at 44x26.9 and Move buttons at 69x24 while the placement options beside
	   them cleared 44. So these buttons are not chips; they take the chip's
	   type size and padding through their own class, and the floor holds.
	   The row's Remove control is the fourth member of the same row and takes
	   the same class, so the row is one height rather than three 44s and a
	   24. */
	.order-tools > .order-btn,
	.row-tools > .order-btn {
		min-height: 44px;
		font-size: 0.65rem;
		padding: 0.28rem 0.7rem;
	}
	.order-tools > .order-grip {
		min-width: 44px;
		padding: 0 0.5rem;
		cursor: grab;
	}
	.order-grip svg {
		width: 1rem;
		height: 1rem;
	}
	.order-tools .btn[aria-disabled='true'] {
		opacity: 0.45;
	}
	/* The paste cue sits at body weight on purpose -- see the markup. */
	.paste-cue {
		margin: 0;
		color: var(--text-1);
		font-size: 0.9rem;
		line-height: 1.45;
	}
	.composer.compact {
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		padding: 0.8rem 0.9rem;
		margin-top: 0.7rem;
		background: var(--surface-2);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}
	/* Field captions read as the shared micro-label without every one of them
	   having to carry the class. */
	label > span {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	input {
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
	}
	.composer.compact input {
		background: var(--surface-1);
	}
	input:focus {
		outline: 1px solid var(--focus-ring);
	}
	.field-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.6rem;
	}

	/* THE DUE FIELD IS TWO BOXES THAT READ AS ONE. It matches the `label`
	   rhythm above -- a caption, then the control, then the same bottom margin
	   -- so it sits in `.field-row`'s grid exactly as Points and Grading
	   category do, and the row still collapses to one column on a phone.

	   `.due-legend` IS THE FIELD'S NAME AND `.due-part-label` IS THE PART'S.
	   Both inputs point at the legend with `aria-describedby`, so each control
	   is announced as "Date, Due" rather than as a bare date box next to a bare
	   time box with nothing joining them. It is not a `<fieldset>` because that
	   would put a second border and a second box model inside a grid cell whose
	   siblings are plain labels, for a group of two. */
	.due-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
		min-width: 0;
	}
	.due-legend {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.due-inputs {
		display: grid;
		/* The date box needs more room than the time box at every width, and
		   `minmax(0, ...)` is what stops either one forcing the row wider than
		   its cell -- an input's automatic minimum is its min-content, which for
		   a date control is the whole `mm/dd/yyyy` picker. */
		grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
		gap: 0.4rem;
	}
	.due-part {
		/* Overrides the shared `label` rule: these two sit INSIDE a field that
		   already carries the caption and the margin. */
		margin-bottom: 0;
		min-width: 0;
	}
	.due-part-label {
		/* SMALLER THAN THE FIELD'S OWN NAME, NOT QUIETER. It was `--text-3`,
		   which measured 2.98:1 on this ground in the browser pass -- `--text-3`
		   is DECORATIVE tertiary in this room (CLAUDE.md), and "Date" / "Time"
		   are the two words that say which box is which, so they are real copy
		   and take the 4.5 floor like every other label here. The tier is carried
		   by SIZE alone, which costs nothing and is measured. */
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.kind-toggle {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.8rem;
		flex-wrap: wrap;
	}
	.kind {
		appearance: none;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.3rem 0.9rem;
		cursor: pointer;
	}
	.kind.active {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.schedule-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: var(--space-3) 0 var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}
	.schedule-label {
		margin-bottom: 0;
		max-width: 18rem;
	}
	.resources-editor,
	.attach-editor,
	.body-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0.5rem 0 0.6rem;
	}
	.attach-editor {
		position: relative;
	}
	.attach-editor.is-drop-active {
		/* outline, never border: draws outside the box, no layout shift. */
		outline: 2px dashed var(--green);
		outline-offset: -2px;
		border-radius: var(--radius-card);
	}
	.deck-drop-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--green) 12%, transparent);
		border-radius: var(--radius-card);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		color: var(--text-1, var(--white));
		pointer-events: none;
		z-index: 1;
	}
	.body-field {
		gap: var(--space-1);
	}
	/* Dashed border + gold accent: the same "this is not ordinary content"
	   treatment the engine-slot / draft-chip pattern uses, applied to a
	   section that is private rather than incomplete. */
	.instructor-editor {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0.7rem 0;
		padding: 0.7rem 0.8rem;
		border: 1px dashed var(--gold);
		border-radius: var(--radius-card);
	}
	.instructor-editor .resources-editor {
		margin: 0.2rem 0 0.3rem;
	}
	.instructor-label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--gold);
	}
	.lock-glyph {
		display: inline-flex;
		width: 0.85rem;
		height: 0.85rem;
	}
	.lock-glyph svg {
		width: 100%;
		height: 100%;
	}
	.resource-row {
		display: grid;
		grid-template-columns: minmax(6rem, 1fr) minmax(8rem, 2fr) auto;
		gap: 0.4rem;
		align-items: center;
	}
	.hint {
		margin: 0;
		color: var(--text-2);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	kbd {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		padding: 0 var(--space-1);
		color: var(--cyan);
	}
	.file-input {
		font-size: 0.75rem;
		padding: 0.3rem 0;
		border: none;
		background: none;
	}
	.upload-bar {
		display: inline-block;
		width: 4.5rem;
		height: 0.4rem;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		overflow: hidden;
	}
	.upload-bar-fill {
		display: block;
		height: 100%;
		background: var(--green);
		transition: width 0.15s ease-out;
	}
	/* The deck's server-side unpacking phase reports nothing measurable, so the
	   bar sweeps rather than sitting at a number it does not have. */
	.upload-bar-fill.sweep {
		width: 35%;
		animation: composer-sweep 1.2s ease-in-out infinite;
	}
	@keyframes composer-sweep {
		0% {
			margin-left: -35%;
		}
		100% {
			margin-left: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.upload-bar-fill.sweep {
			width: 100%;
			animation: none;
			opacity: 0.4;
		}
	}
	/* The staged deck's bar is a block on its own line, not an inline chip in a
	   file row: it reports a multi-step server job, not one PUT. */
	.attach-editor .upload-bar {
		display: block;
		width: 100%;
		margin-top: var(--space-1);
	}
	.target-picker {
		margin: 0.6rem 0;
	}
	.linkage {
		border-top: 1px solid var(--hairline);
		padding-top: 0.6rem;
	}
	.posted-list {
		list-style: none;
		margin: 0.3rem 0 0.6rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.posted-list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.posted-name {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-1);
	}
	.posted-name.muted {
		color: var(--text-2);
	}
	.target-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		margin: 0.35rem 0;
	}
	.target-check {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		margin: 0;
		cursor: pointer;
	}
	.target-check input {
		width: auto;
		accent-color: var(--green);
	}
	.target-check span {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-1);
		letter-spacing: 0;
	}
	.composer-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
	@media (max-width: 560px) {
		.resource-row {
			grid-template-columns: 1fr;
		}
	}
</style>
