<script lang="ts">
	import { onDestroy } from 'svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import { itemBodyDoc, type TiptapNode } from '$lib/classroom/classroom-doc';
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
	 * first. Files and instructor-only files are therefore STAGED locally and
	 * applied after the create/update call hands back the id it touched.
	 *
	 * A STAGED THING THAT FAILS TO APPLY IS KEPT, NOT DISCARDED. If the item
	 * itself refuses to save, nothing is touched at all. If the item saves and
	 * an upload then fails, the report says exactly what did not land and the
	 * staged file stays in the form, so saving again retries it instead of
	 * asking someone to find the file a second time.
	 *
	 * WHAT THIS FORM DOES NOT OWN: the PRESENTATION DECK and the ASSIGNMENT
	 * SPEC. Both were staged here for a while, and both are gone -- not moved,
	 * removed, because the item page already had a card for each. That left two
	 * deck panels and two spec panels on screen whenever the editor was open,
	 * with near-identical explanatory text, and no way to tell which one the
	 * teacher was meant to use.
	 *
	 * The page-level cards are the survivors, and they are the right ones. A
	 * deck upload is a multi-minute chunked transfer that reports progress,
	 * refuses on size, asks which page opens the deck and warns about a missing
	 * state file; a spec is validated, previewed with the real renderer and
	 * published on its own. Neither participates in this form's save, so
	 * neither belongs behind an edit mode: both can be managed on the item page
	 * without opening the editor at all, which is a step FEWER than staging
	 * them here ever was. The only thing lost is attaching one in the same
	 * gesture that creates the item -- save first, then attach, on the page
	 * that then exists.
	 */
	let {
		mode = 'create',
		kind = $bindable('post'),
		sections = [],
		initialTargets = [],
		item = null,
		transports,
		attachmentsEnabled = true,
		compact = false,
		onsaved,
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
		/** False when Drive is unconfigured: the file controls hide entirely. */
		attachmentsEnabled?: boolean;
		/** Inline placement (class page / item detail) vs the console card. */
		compact?: boolean;
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
		// the staged files and the instructor-only materials (never part of
		// createItem/updateItem's own payload). All failures are collected
		// together so one report covers everything.
		//
		// ANYTHING THAT FAILS STAYS STAGED. Only what actually landed is cleared,
		// so saving again retries the rest rather than asking a teacher to go and
		// find the same file a second time.
		const itemId = res.data.itemId;
		const hadFiles = staged.length > 0 || instructorStaged.length > 0;
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
		 * Uploads run CONCURRENTLY, and both lists at once.
		 *
		 * They were sequential, so attaching five photos to an assignment took
		 * five round trips end to end -- each one a whole multipart POST plus a
		 * Drive write -- with the save button spinning throughout. They are
		 * independent writes against an item that already exists, so nothing
		 * about them was ordered; the loop was just the shape it was written in.
		 *
		 * Every upload is individually caught, so one that THROWS cannot reject
		 * the batch and discard the results of the others -- that would lose the
		 * per-file reporting this whole block exists for, and take the "anything
		 * that fails stays staged" guarantee with it. `Promise.all` preserves
		 * order, so the failure list still reads in the order the files were
		 * picked.
		 */
		const settle = async (file: File, run: Promise<{ ok: boolean; message?: string }>) => {
			try {
				return { file, res: await run };
			} catch (e) {
				return { file, res: { ok: false, message: (e as Error).message || 'Upload failed.' } };
			}
		};
		const [fileResults, instructorResults] = await Promise.all([
			Promise.all(staged.map((f) => settle(f, transports.uploadAttachment(itemId, f)))),
			Promise.all(
				instructorStaged.map((f) => settle(f, transports.uploadInstructorAttachment(itemId, f)))
			)
		]);

		for (const { file, res: up } of fileResults) {
			if (!up.ok) failures.push(`${file.name}: ${up.message}`);
		}
		staged = fileResults.filter((r) => !r.res.ok).map((r) => r.file);

		for (const { file, res: up } of instructorResults) {
			if (!up.ok) failures.push(`instructor file "${file.name}": ${up.message}`);
		}
		instructorStaged = instructorResults.filter((r) => !r.res.ok).map((r) => r.file);

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
		const attachNote = hadFiles ? ' Files attached.' : '';

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

	<!-- NO DECK PANEL AND NO SPEC PANEL HERE. Both are owned by the item page's
	     own cards; see the note at the top of this component for why. -->

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
	{#if msg}
		<p class="feedback" class:ok={msg.ok} class:error={!msg.ok}>{msg.text}</p>
	{/if}
</div>

<style>
	/* Spacing only: the look lives in classroom.css. */
	.feedback {
		margin: 0.6rem 0 0;
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	input {
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: 'Rajdhani', sans-serif;
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
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--text-2);
		font-family: 'Share Tech Mono', monospace;
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
		font-family: 'Share Tech Mono', monospace;
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
		gap: var(--space-1);
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
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
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
		color: var(--text-2);
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
		font-family: 'Share Tech Mono', monospace;
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
		font-family: 'Share Tech Mono', monospace;
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
		.staged-item.has-preview {
			width: calc(50% - 0.3rem);
		}
	}
</style>
