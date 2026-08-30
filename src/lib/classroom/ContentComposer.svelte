<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import CheckInStager from '$lib/classroom/CheckInStager.svelte';
	import FileUploadPanel, { type PanelUpload } from '$lib/classroom/FileUploadPanel.svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
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
		ITEM_KINDS,
		courseCategorySuggestions,
		formatBytes,
		instructorAttachmentSrc,
		isoToLocalInput,
		localInputToIso,
		sectionTitle,
		type ClassroomComposerTransports,
		type ClassroomItem,
		type ClassroomItemKind,
		type ClassroomSection
	} from '$lib/classroom/classroom';
	import { dropTarget, filesFromClipboard } from '$lib/file-drop';

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
		attachmentsEnabled = true,
		instructorAttachmentsEnabled = true,
		compact = false,
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
	let due = $state(isoToLocalInput(item?.due_at ?? null));
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
	let filePanel = $state<FileUploadPanel | null>(null);
	let removingId = $state<string | null>(null);
	let pasteHint = $state<string | null>(null);
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
		rubric: stagedRubric
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
	const dirty = $derived(baseline.changed(composerDraftSignature(draft)));
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
	 */
	let pendingPublish = false;
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'That save did not land.',
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
		 * BOTH LISTS AT ONCE, AND EVERY FILE IN EACH ATTEMPTED -- now through ONE
		 * mechanism rather than two.
		 *
		 * `runAll` uploads a panel's files concurrently, catches each one
		 * individually so a throw cannot reject the batch and discard the others'
		 * results, keeps whatever failed staged with its own message and its own
		 * Retry, and returns one line per failure. Two panels, the same guarantee,
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
			hadCheckIn ? 'Check-in scheduled.' : ''
		].filter(Boolean);
		const attachNote = alsoLanded.length ? ` ${alsoLanded.join(' ')}` : '';

		const what = ITEM_KINDS.find((k) => k.id === editingKind)?.label ?? 'Item';
		const goLive = scheduledAhead ? new Date(localInputToIso(publishAt) ?? '').toLocaleString() : '';
		const where =
			mode === 'edit'
				? publish
					? scheduledAhead
						? `updated -- students see it from ${goLive}`
						: 'updated -- every class it is posted to sees the change'
					: 'updated (draft)'
				: publish
					? scheduledAhead
						? `scheduled for ${goLive} in ${targetIds.length} class${targetIds.length === 1 ? '' : 'es'}`
						: `posted to ${targetIds.length} class${targetIds.length === 1 ? '' : 'es'}`
					: `saved as a draft to ${targetIds.length} class${targetIds.length === 1 ? '' : 'es'}`;
		const text = `${what} ${where}.${attachNote}`;

		if (mode === 'create') {
			// Everything landed, so the next post is a genuinely new item.
			createdItemId = null;
			title = '';
			points = '';
			due = '';
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

<div class="composer" class:compact onpaste={onPaste}>
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
			<label>
				<span>Due date</span>
				<input type="datetime-local" bind:value={due} />
			</label>
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
		{#each links as r, i (i)}
			<div class="resource-row">
				<input type="text" placeholder="Label" bind:value={r.label} />
				<input type="url" placeholder="https://..." bind:value={r.url} />
				<button
					type="button"
					class="btn secondary tiny"
					aria-label="Remove link"
					onclick={() => (links = links.filter((_, j) => j !== i))}
				>
					&times;
				</button>
			</div>
		{/each}
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
			<p class="hint">
				Attach a file, or press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste a screenshot straight in.
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
				oncountchange={(n) => (stagedFileCount = n)}
			/>
			{#if pasteHint}
				<p class="feedback ok">{pasteHint}</p>
			{/if}
			{#if mode === 'edit' && existing.length}
				<!-- The composer is manager-only by construction, so the reference is
				     offered unconditionally here. This is where an author is when
				     they need it: the file is on screen and the prose editor is a
				     few centimetres away. -->
				<AttachmentList
					attachments={existing}
					onremove={removeExisting}
					removing={removingId}
					figureRefs
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
			{#each instructorLinks as r, i (i)}
				<div class="resource-row">
					<input type="text" placeholder="Label" bind:value={r.label} />
					<input type="url" placeholder="https://..." bind:value={r.url} />
					<button
						type="button"
						class="btn secondary tiny"
						aria-label="Remove instructor link"
						onclick={() => (instructorLinks = instructorLinks.filter((_, j) => j !== i))}
					>
						&times;
					</button>
				</div>
			{/each}
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

	<div class="composer-actions">
		<button class="btn" type="button" disabled={busy} onclick={() => submit(true)}>
			{#if mode === 'edit'}
				{scheduledAhead ? 'Save & schedule' : 'Save & publish'}
			{:else}
				{scheduledAhead ? 'Schedule' : 'Post now'}
			{/if}
		</button>
		<button class="btn secondary" type="button" disabled={busy} onclick={() => submit(false)}>
			Save draft
		</button>
		{#if oncancel}
			<button class="btn secondary" type="button" disabled={busy} onclick={() => oncancel?.()}>
				Cancel
			</button>
		{/if}
	</div>
	<!-- The same five states, in the same words, as the other three surfaces.
	     The full report stays below it: the indicator says WHICH state, the
	     feedback line says what did and did not land. -->
	<div class="save-line"><SaveIndicator state={save} /></div>
	{#if msg}
		<p class="feedback" class:ok={msg.ok} class:error={!msg.ok}>{msg.text}</p>
	{/if}
</div>

<style>
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
