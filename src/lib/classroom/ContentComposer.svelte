<script lang="ts">
	import { onDestroy } from 'svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import DeckStager from '$lib/classroom/DeckStager.svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import SpecImport from '$lib/classroom/SpecImport.svelte';
	import { itemBodyDoc, type TiptapNode } from '$lib/classroom/classroom-doc';
	import type { AssignmentSpec, AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';
	import type { ClassroomDeck, DeckTransports, DeckUploadProgress } from '$lib/classroom/deck';
	import {
		ITEM_KINDS,
		formatBytes,
		instructorAttachmentSrc,
		isPreviewableFile,
		isoToLocalInput,
		localInputToIso,
		sectionTitle,
		type ClassroomComposerTransports,
		type ClassroomItem,
		type ClassroomItemKind,
		type ClassroomSection
	} from '$lib/classroom/classroom';

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
	 * first. Files, instructor-only files, a presentation deck and an assignment
	 * spec are therefore all STAGED locally and applied after the create/update
	 * call hands back the id it touched.
	 *
	 * EVERY ATTACHMENT TYPE IS AVAILABLE HERE, on create as well as edit, and
	 * that is the point rather than a convenience. A deck and a spec used to be
	 * reachable only by saving an item and then going and finding it again on
	 * its own page -- and nothing in this form said either was possible, which
	 * is a discoverability failure rather than a missing feature. Waiting for
	 * the id is a sequencing problem, so it is solved by sequencing.
	 *
	 * A STAGED THING THAT FAILS TO APPLY IS KEPT, NOT DISCARDED. If the item
	 * itself refuses to save, nothing is touched at all. If the item saves and
	 * an upload then fails, the report says exactly what did not land and the
	 * staged file stays in the form, so saving again retries it instead of
	 * asking someone to find the zip a second time.
	 */
	let {
		mode = 'create',
		kind = $bindable('post'),
		sections = [],
		item = null,
		transports,
		attachmentsEnabled = true,
		compact = false,
		deck = null,
		deckTransports = null,
		spec = null,
		teacherTransports = null,
		onsaved,
		oncancel = null
	}: {
		mode?: 'create' | 'edit';
		kind?: ClassroomItemKind;
		/** Every section the caller manages: publish targets, and linkage on edit. */
		sections?: ClassroomSection[];
		item?: ClassroomItem | null;
		transports: ClassroomComposerTransports;
		/** False when Drive is unconfigured: the file controls hide entirely. */
		attachmentsEnabled?: boolean;
		/** Inline placement (class page / item detail) vs the console card. */
		compact?: boolean;
		/** The deck already on the item being edited, when it has one. */
		deck?: ClassroomDeck | null;
		/** Absent = this surface cannot do decks; the section hides entirely. */
		deckTransports?: DeckTransports | null;
		/** The spec already on the assignment being edited, when it has one. */
		spec?: AssignmentSpec | null;
		/** Absent = this surface cannot do specs; the section hides entirely. */
		teacherTransports?: AssignmentTeacherTransports | null;
		onsaved: (info: { kind: ClassroomItemKind; published: boolean; text: string }) => void;
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
	// svelte-ignore state_referenced_locally
	let links = $state<{ label: string; url: string }[]>(
		(item?.links ?? []).map((r) => ({ label: r.label, url: r.url }))
	);

	let targets = $state<Record<string, boolean>>({});
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

	// --- Attachments ------------------------------------------------------
	// A local copy so a removal shows immediately without the parent having to
	// round-trip; the parent reloads on `onsaved` and remounts on a new target.
	// svelte-ignore state_referenced_locally
	let existing = $state([...(item?.attachments ?? [])]);
	let staged = $state<File[]>([]);
	let removingId = $state<string | null>(null);
	let pasteHint = $state<string | null>(null);

	/**
	 * Object URLs for staged files, so a picked or pasted image shows as a
	 * PICTURE before anything is saved -- a filename says nothing about whether
	 * the right page is in frame (the notebook's staged-thumbnail lesson).
	 *
	 * Kept in a plain, NON-reactive Map: the effect that fills it reads `staged`
	 * and writes here, and routing the URLs through reactive state as well would
	 * have it re-trigger on its own writes.
	 */
	const previewUrls = new Map<File, string>();
	let previewRev = $state(0);

	$effect(() => {
		let made = false;
		for (const file of staged) {
			if (!previewUrls.has(file) && isPreviewableFile(file)) {
				previewUrls.set(file, URL.createObjectURL(file));
				made = true;
			}
		}
		for (const [file, url] of previewUrls) {
			if (!staged.includes(file)) {
				URL.revokeObjectURL(url);
				previewUrls.delete(file);
				made = true;
			}
		}
		if (made) previewRev += 1;
	});

	onDestroy(() => {
		for (const url of previewUrls.values()) URL.revokeObjectURL(url);
		previewUrls.clear();
		for (const url of instructorPreviewUrls.values()) URL.revokeObjectURL(url);
		instructorPreviewUrls.clear();
	});

	function previewOf(file: File): string | null {
		// previewRev is read so the template re-evaluates when the map changes.
		void previewRev;
		return previewUrls.get(file) ?? null;
	}

	// --- Instructor-only materials (0090) ----------------------------------
	// Same staging shape as the student-facing files above, kept as its OWN
	// state rather than a flag on the shared arrays: this section is teacher
	// eyes only, so its data must never end up in the same list a student-
	// facing renderer could iterate by accident.
	// svelte-ignore state_referenced_locally
	let instructorLinks = $state<{ label: string; url: string }[]>(
		(item?.instructorLinks ?? []).map((r) => ({ label: r.label, url: r.url }))
	);
	// svelte-ignore state_referenced_locally
	let instructorExisting = $state([...(item?.instructorAttachments ?? [])]);
	let instructorStaged = $state<File[]>([]);
	let instructorRemovingId = $state<string | null>(null);

	const instructorPreviewUrls = new Map<File, string>();
	let instructorPreviewRev = $state(0);

	$effect(() => {
		let made = false;
		for (const file of instructorStaged) {
			if (!instructorPreviewUrls.has(file) && isPreviewableFile(file)) {
				instructorPreviewUrls.set(file, URL.createObjectURL(file));
				made = true;
			}
		}
		for (const [file, url] of instructorPreviewUrls) {
			if (!instructorStaged.includes(file)) {
				URL.revokeObjectURL(url);
				instructorPreviewUrls.delete(file);
				made = true;
			}
		}
		if (made) instructorPreviewRev += 1;
	});

	function instructorPreviewOf(file: File): string | null {
		void instructorPreviewRev;
		return instructorPreviewUrls.get(file) ?? null;
	}

	function stageInstructorFiles(files: FileList | File[] | null) {
		if (!files || !attachmentsEnabled) return;
		const next = Array.from(files).filter((f) => f.size > 0);
		if (next.length) instructorStaged = [...instructorStaged, ...next];
	}

	function pickInstructorFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		stageInstructorFiles(input.files);
		input.value = '';
	}

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

	// --- Presentation deck (0101/0102/0105), staged --------------------------
	// The zip waits here until the item exists. Everything the upload reports
	// back -- progress, refusals, the "which page opens this deck?" question,
	// the missing-state-file warning -- is surfaced on the stager rather than
	// folded into the composer's own one-line message, because those are things
	// the uploader has to READ, not just an outcome.
	let stagedDeck = $state<File | null>(null);
	let deckEntryPath = $state<string | null>(null);
	let deckCandidates = $state<string[]>([]);
	let deckProgress = $state<DeckUploadProgress | null>(null);
	let deckError = $state<string | null>(null);
	let deckErrorCode = $state<string | null>(null);
	let deckWarnings = $state<string[]>([]);
	let deckNotice = $state<string | null>(null);
	let deckRemoving = $state(false);
	// svelte-ignore state_referenced_locally
	let currentDeck = $state<ClassroomDeck | null>(deck);

	const deckEnabled = $derived(!!deckTransports);

	async function removeDeck() {
		if (!deckTransports || !item) return;
		deckRemoving = true;
		deckError = null;
		const res = await deckTransports.deleteDeck(item.id);
		deckRemoving = false;
		if (!res.ok) {
			deckError = res.message;
			return;
		}
		currentDeck = null;
		deckNotice = 'Deck removed.';
	}

	// --- Assignment spec (0086), staged --------------------------------------
	// Only an assignment can carry one, and only a surface that was handed the
	// teacher transports can offer it.
	let stagedSpec = $state<unknown | null>(null);
	let stagedSpecSummary = $state<AssignmentSpec | null>(null);
	// svelte-ignore state_referenced_locally
	let currentSpec = $state<AssignmentSpec | null>(spec);

	const specEnabled = $derived(!!teacherTransports && isAssignment);

	function stageSpec(raw: unknown | null) {
		stagedSpec = raw;
		stagedSpecSummary = (raw as AssignmentSpec | null) ?? null;
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

	function stageFiles(files: FileList | File[] | null) {
		if (!files || !attachmentsEnabled) return;
		const next = Array.from(files).filter((f) => f.size > 0);
		if (next.length) staged = [...staged, ...next];
	}

	function pickFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		stageFiles(input.files);
		// Clear so picking the SAME file twice in a row still fires change.
		input.value = '';
	}

	/**
	 * Ctrl+V of a screenshot. The clipboard carries a pasted image as an
	 * `image/*` ITEM with no name, so it is read from `items` (not `files`,
	 * which several browsers leave empty for synthesised clipboard blobs) and
	 * given a filename here.
	 *
	 * Only image items are intercepted: pasting TEXT into the body must keep
	 * working exactly as it always did, so anything else falls through
	 * untouched with no preventDefault.
	 */
	function onPaste(event: ClipboardEvent) {
		if (!attachmentsEnabled) return;
		const items = event.clipboardData?.items;
		if (!items) return;
		const images: File[] = [];
		for (const clipItem of items) {
			if (clipItem.kind !== 'file' || !clipItem.type.startsWith('image/')) continue;
			const file = clipItem.getAsFile();
			if (!file) continue;
			const ext = clipItem.type.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'png';
			const name =
				file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.${ext}`;
			images.push(new File([file], name, { type: clipItem.type }));
		}
		if (!images.length) return;
		event.preventDefault();
		staged = [...staged, ...images];
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
			category: category.trim() || null,
			links: links
				.map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
				.filter((r) => r.url !== '')
		};
	}

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
		onsaved({ kind: editingKind, published: item.published, text: '' });
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
		onsaved({ kind: editingKind, published: item.published, text: '' });
	}

	async function submit(publish: boolean) {
		if (busy) return;
		busy = true;
		msg = null;
		try {
			await runSubmit(publish);
		} finally {
			// Whatever happens, the buttons come back -- a stuck busy flag is a
			// silently wedged editor (the number-input coercion throw, found live
			// in the console's own composer, left both buttons disabled forever).
			busy = false;
		}
	}

	async function runSubmit(publish: boolean) {
		let res;
		if (mode === 'edit') {
			res = await transports.updateItem(item!.id, itemInput(), publish);
		} else if (createdItemId) {
			// A retry after a partially-failed create: update what exists.
			res = await transports.updateItem(createdItemId, itemInput(), publish);
		} else if (targetIds.length === 0) {
			res = { ok: false as const, message: 'Pick at least one class to post to.' };
		} else {
			res = await transports.createItem(editingKind, targetIds, itemInput(), publish);
		}

		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}

		// The item exists; NOW everything that hangs off its id can be applied --
		// the staged files, the instructor-only materials (never part of
		// createItem/updateItem's own payload), the deck and the spec. All
		// failures are collected together so one report covers everything.
		//
		// ANYTHING THAT FAILS STAYS STAGED. Only what actually landed is cleared,
		// so saving again retries the rest rather than asking a teacher to go and
		// find the same file a second time.
		const itemId = res.data.itemId;
		const hadFiles = staged.length > 0 || instructorStaged.length > 0;
		const failures: string[] = [];

		const keptFiles: File[] = [];
		for (const file of staged) {
			const up = await transports.uploadAttachment(itemId, file);
			if (!up.ok) {
				failures.push(`${file.name}: ${up.message}`);
				keptFiles.push(file);
			}
		}
		staged = keptFiles;

		const keptInstructorFiles: File[] = [];
		for (const file of instructorStaged) {
			const up = await transports.uploadInstructorAttachment(itemId, file);
			if (!up.ok) {
				failures.push(`instructor file "${file.name}": ${up.message}`);
				keptInstructorFiles.push(file);
			}
		}
		instructorStaged = keptInstructorFiles;

		const instructorLinksClean = instructorLinks
			.map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
			.filter((r) => r.url !== '');
		const linksRes = await transports.setInstructorResources(itemId, instructorLinksClean);
		if (!linksRes.ok) failures.push(`instructor links: ${linksRes.message}`);

		let deckAttached = false;
		if (stagedDeck && deckTransports) {
			deckError = null;
			deckErrorCode = null;
			deckNotice = null;
			deckWarnings = [];
			deckCandidates = [];
			const up = await deckTransports.uploadDeck(itemId, stagedDeck, {
				entryPath: deckEntryPath,
				onProgress: (p) => (deckProgress = p)
			});
			deckProgress = null;
			if (up.ok) {
				stagedDeck = null;
				deckEntryPath = null;
				deckAttached = true;
				deckWarnings = up.warnings ?? [];
				deckNotice = up.replaced
					? `Deck replaced (${up.fileCount ?? 0} files).`
					: `Deck uploaded (${up.fileCount ?? 0} files).`;
			} else {
				// Kept, deliberately: the zip is still in the form and the reason
				// is on the stager. A deck that needs its entry page chosen is the
				// clearest case -- the answer is a radio button away and the next
				// save carries it.
				deckError = up.message;
				deckErrorCode = up.code ?? null;
				deckCandidates = up.candidates ?? [];
				deckEntryPath = deckCandidates[0] ?? null;
				failures.push(
					deckCandidates.length
						? 'the deck needs its entry page chosen below'
						: `deck: ${up.message}`
				);
			}
		}

		let specAttached = false;
		if (stagedSpec !== null && teacherTransports) {
			const attach = await teacherTransports.setSpec(itemId, stagedSpec as AssignmentSpec);
			if (attach.ok) {
				currentSpec = stagedSpecSummary;
				stagedSpec = null;
				stagedSpecSummary = null;
				specAttached = true;
			} else {
				// Kept for the same reason: the JSON is validated and in hand, and
				// re-pasting it would be the worst possible ask.
				failures.push(`spec: ${attach.message}`);
			}
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
			onsaved({ kind: editingKind, published: publish, text: '' });
			return;
		}
		const attachNote =
			(hadFiles ? ' Files attached.' : '') +
			(deckAttached ? ' Deck attached.' : '') +
			(specAttached ? ' Spec attached.' : '');

		const what = ITEM_KINDS.find((k) => k.id === editingKind)?.label ?? 'Item';
		const where =
			mode === 'edit'
				? publish
					? 'updated -- every class it is posted to sees the change'
					: 'updated (draft)'
				: `${publish ? 'posted' : 'saved as a draft'} to ${targetIds.length} class${targetIds.length === 1 ? '' : 'es'}`;
		const text = `${what} ${where}.${attachNote}`;

		if (mode === 'create') {
			// Everything landed, so the next post is a genuinely new item.
			createdItemId = null;
			title = '';
			points = '';
			due = '';
			category = '';
			links = [];
			instructorLinks = [];
			currentDeck = null;
			currentSpec = null;
			deckNotice = null;
			deckWarnings = [];
			// The editor is remounted by bumping its key rather than reset
			// through it: `bodyDoc` is what the parent holds, and a keyed
			// remount is the one way to be sure the two agree afterwards.
			bodyDoc = null;
			editorSeed += 1;
		}
		msg = { ok: true, text };
		onsaved({ kind: editingKind, published: publish, text });
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
				onready={(doc) => (bodyDoc = doc)}
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
				<input type="text" bind:value={category} placeholder="Unit Labs" />
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
			<input type="file" multiple class="file-input" onchange={pickFiles} />
			{#if pasteHint}
				<p class="feedback ok">{pasteHint}</p>
			{/if}
			{#if staged.length}
				<ul class="staged">
					{#each staged as f, i (i)}
						{@const url = previewOf(f)}
						<li class="staged-item" class:has-preview={!!url}>
							{#if url}
								<!-- object-fit: contain, never cover: cropping to fill would
								     hide the cut-off edge this preview exists to catch. -->
								<img class="staged-thumb" src={url} alt={f.name} />
							{/if}
							<span class="staged-meta">
								<span class="staged-name">{f.name}</span>
								<span class="staged-size">{formatBytes(f.size)}</span>
								<button
									type="button"
									class="btn secondary tiny"
									onclick={() => (staged = staged.filter((_, j) => j !== i))}
								>
									&times;
								</button>
							</span>
						</li>
					{/each}
				</ul>
				<p class="hint">Uploads when you save.</p>
			{/if}
			{#if mode === 'edit' && existing.length}
				<AttachmentList attachments={existing} onremove={removeExisting} removing={removingId} />
			{/if}
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

		{#if attachmentsEnabled}
			<input type="file" multiple class="file-input" onchange={pickInstructorFiles} />
			{#if instructorStaged.length}
				<ul class="staged">
					{#each instructorStaged as f, i (i)}
						{@const url = instructorPreviewOf(f)}
						<li class="staged-item" class:has-preview={!!url}>
							{#if url}
								<img class="staged-thumb" src={url} alt={f.name} />
							{/if}
							<span class="staged-meta">
								<span class="staged-name">{f.name}</span>
								<span class="staged-size">{formatBytes(f.size)}</span>
								<button
									type="button"
									class="btn secondary tiny"
									onclick={() => (instructorStaged = instructorStaged.filter((_, j) => j !== i))}
								>
									&times;
								</button>
							</span>
						</li>
					{/each}
				</ul>
				<p class="hint">Uploads when you save.</p>
			{/if}
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

	<!-- A deck and a spec attach to the item's id, so both are STAGED here and
	     applied the moment the save returns one. Available on create and edit
	     alike: needing to save first and come back was the whole problem. -->
	{#if deckEnabled}
		<DeckStager
			bind:file={stagedDeck}
			bind:entryPath={deckEntryPath}
			deck={currentDeck}
			candidates={deckCandidates}
			progress={deckProgress}
			error={deckError}
			errorCode={deckErrorCode}
			warnings={deckWarnings}
			notice={deckNotice}
			busy={busy}
			removing={deckRemoving}
			onremove={mode === 'edit' && item ? removeDeck : null}
		/>
	{/if}

	{#if specEnabled}
		<div class="spec-field">
			<span class="mini-label">Interactive spec</span>
			<SpecImport
				itemId={mode === 'edit' && item ? item.id : null}
				spec={currentSpec}
				staged={stagedSpecSummary}
				transports={teacherTransports}
				onstage={stageSpec}
			/>
		</div>
	{/if}

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

	<div class="composer-actions">
		<button class="btn" type="button" disabled={busy} onclick={() => submit(true)}>
			{mode === 'edit' ? 'Save & publish' : 'Post'}
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
	{#if msg}
		<p class="feedback" class:ok={msg.ok} class:error={!msg.ok}>{msg.text}</p>
	{/if}
</div>

<style>
	.composer {
		display: block;
	}
	.composer.compact {
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		padding: 0.8rem 0.9rem;
		margin-top: 0.7rem;
		background: var(--bg2);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}
	label > span,
	.mini-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--dim);
	}
	input {
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
	}
	.composer.compact input {
		background: var(--bg1);
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
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.3rem 0.9rem;
		cursor: pointer;
	}
	.kind.active {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.resources-editor,
	.attach-editor,
	.body-field,
	.spec-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0.5rem 0 0.6rem;
	}
	.body-field {
		gap: 0.25rem;
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
		border-radius: 6px;
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
		color: var(--dim);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	kbd {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0 0.25rem;
		color: var(--cyan);
	}
	.file-input {
		font-size: 0.75rem;
		padding: 0.3rem 0;
		border: none;
		background: none;
	}
	.staged {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.staged-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		max-width: 100%;
	}
	.staged-item.has-preview {
		width: 9.5rem;
	}
	.staged-thumb {
		display: block;
		width: 100%;
		height: 6.5rem;
		object-fit: contain;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 5px;
	}
	.staged-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		min-width: 0;
	}
	.staged-name {
		font-size: 0.78rem;
		overflow-wrap: anywhere;
	}
	.staged-size {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
	}
	.target-picker {
		margin: 0.6rem 0;
	}
	.linkage {
		border-top: 1px solid var(--line);
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
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.posted-name {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--white);
	}
	.posted-name.muted {
		color: var(--dim);
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--white);
		letter-spacing: 0;
	}
	.composer-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		padding: 0.4rem 0.65rem;
		border-radius: 5px;
		margin: 0.6rem 0 0;
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--line-strong);
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	:global(.btn.tiny),
	:global(.btn.secondary.tiny) {
		font-size: 0.65rem;
		padding: 0.28rem 0.6rem;
	}
	:global(.btn.tiny.danger) {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	@media (max-width: 560px) {
		.resource-row {
			grid-template-columns: 1fr;
		}
		.staged-item.has-preview {
			width: calc(50% - 0.3rem);
		}
	}
</style>
