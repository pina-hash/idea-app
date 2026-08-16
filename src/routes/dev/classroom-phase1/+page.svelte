<script lang="ts">
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import RubricBuilder from '$lib/classroom/RubricBuilder.svelte';
	import SpecImport from '$lib/classroom/SpecImport.svelte';
	import ReferenceTools from '$lib/classroom/ReferenceTools.svelte';
	import '$lib/classroom/classroom.css';
	import {
		isScheduled,
		scheduleLabel,
		type ClassroomComposerTransports,
		type ClassroomItem,
		type ClassroomSection
	} from '$lib/classroom/classroom';
	import { itemBodyDoc, type ItemDoc, type TiptapNode } from '$lib/classroom/classroom-doc';
	import type { AssignmentSpec, AssignmentTeacherTransports, RubricCriterion } from '$lib/classroom/assignment-spec';
	import type { ReferenceSpec, ReferenceTransports } from '$lib/classroom/reference-spec';

	/**
	 * Phase 1 harness. See +page.ts for what it covers and why it is separate
	 * from /dev/classroom.
	 *
	 * THE SANITIZER IS THE REAL ONE, over the wire, through /dev/classroom's own
	 * normalize endpoint -- so what this harness stores and renders is what
	 * production would have stored. A harness with its own copy of a sanitizer
	 * proves nothing about the one that ships.
	 */

	const TEACHER = 't.vargas@boscotech.edu';
	const iso = (daysFromNow: number, hour = 9) => {
		const d = new Date();
		d.setDate(d.getDate() + daysFromNow);
		d.setHours(hour, 0, 0, 0);
		return d.toISOString();
	};

	let nextId = 100;
	const nid = (p: string) => `${p}-${nextId++}`;

	const sections: ClassroomSection[] = [
		{
			id: 's-1',
			course_id: 'c-1',
			label: 'Period 2',
			block: 'B',
			teacher_email: TEACHER,
			active: true,
			course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering Design', active: true }
		},
		{
			id: 's-2',
			course_id: 'c-1',
			label: 'Period 4',
			block: 'A',
			teacher_email: TEACHER,
			active: true,
			course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering Design', active: true }
		}
	];

	function mk(over: Partial<ClassroomItem> & { id: string; kind: ClassroomItem['kind'] }): ClassroomItem {
		return {
			title: null,
			body: '',
			body_doc: null,
			points: null,
			due_at: null,
			category: null,
			author_email: TEACHER,
			author_name: 'T. Vargas',
			published: true,
			pinned: false,
			publish_at: null,
			sort_order: 0,
			first_published_at: iso(-3),
			edited_at: null,
			created_at: iso(-3),
			updated_at: iso(-3),
			links: [],
			attachments: [],
			postings: [{ section_id: 's-1' }],
			viewed_at: null,
			instructorAttachments: [],
			instructorLinks: [],
			...over
		};
	}

	/** A real authored document: heading, prose, both list kinds, a link. */
	const RICH: ItemDoc = [
		{ type: 'h3', runs: [{ text: 'Before you start' }] },
		{
			type: 'p',
			runs: [
				{ text: 'Read the ' },
				{ text: 'whole', bold: true },
				{ text: ' brief before touching the ' },
				{ text: 'CAD', italic: true },
				{ text: ' file. Reference: ' },
				{ text: 'the tolerance table', href: 'https://example.com/tolerances' },
				{ text: '.' }
			]
		},
		{ type: 'h4', runs: [{ text: 'Bring' }] },
		{
			type: 'ul',
			items: [[{ text: 'A ruler' }], [{ text: 'Graph paper' }], [{ text: 'Your notebook' }]]
		},
		{ type: 'h4', runs: [{ text: 'Steps' }] },
		{
			type: 'ol',
			items: [
				[{ text: 'Measure ' }, { text: 'twice', bold: true }],
				[{ text: 'Cut once' }],
				[{ text: 'Log the result in your notebook' }]
			]
		}
	];

	let items = $state<ClassroomItem[]>([
		mk({
			id: 'i-rich',
			kind: 'assignment',
			title: 'Bridge stackup',
			body: 'Before you start\n\nRead the whole brief before touching the CAD file.',
			body_doc: RICH,
			points: 20,
			due_at: iso(4, 15),
			category: 'Unit Labs',
			links: [{ id: 'r-1', label: 'Tolerance table', url: 'https://example.com/tolerances', sort_order: 1 }]
		}),
		mk({
			id: 'i-legacy',
			kind: 'post',
			title: 'Legacy plain body',
			// body_doc NULL: an item authored before 0108, or read from a backend
			// without it. Must render as real paragraphs, not one run-on line.
			body_doc: null,
			body: 'Notebooks out tomorrow -- we start the bridge unit.\n\nBring your safety glasses. No exceptions.'
		}),
		mk({
			id: 'i-draft',
			kind: 'post',
			title: 'Draft announcement',
			body: 'Not finished. Do not post.',
			published: false,
			first_published_at: null
		}),
		mk({
			id: 'i-sched',
			kind: 'assignment',
			title: 'Scheduled: unit 3 opener',
			body: 'Goes live Monday morning.',
			points: 10,
			due_at: iso(9, 15),
			publish_at: iso(3, 8)
		}),
		mk({
			id: 'i-live',
			kind: 'material',
			title: 'Course syllabus',
			body: 'The syllabus, the grading policy and the AI rules.',
			// A PAST stamp: published and live. Proves a stamp alone is not
			// "scheduled" -- only a FUTURE one is.
			publish_at: iso(-2, 8)
		})
	]);

	// --- The REAL sanitizer, over the wire ---------------------------------
	async function normalizeBody(bodyDoc: unknown) {
		try {
			const res = await fetch('/dev/classroom/normalize', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ bodyDoc })
			});
			return (await res.json()) as
				| { ok: true; body: string; doc: ItemDoc }
				| { ok: false; error: string };
		} catch (e) {
			return { ok: false as const, error: (e as Error).message || 'Could not read that body.' };
		}
	}

	let log = $state<string[]>([]);
	const note = (call: string, args: unknown) => {
		log = [`${call} ${JSON.stringify(args)}`, ...log].slice(0, 24);
	};

	/** Fail the next upload, to drive the keep-what-failed path. */
	let failUploads = $state(false);
	/** Slow every upload, so concurrency is observable as wall-clock. */
	let slowUploads = $state(false);
	let uploadStarts = $state<number[]>([]);

	function patch(id: string, over: Partial<ClassroomItem>) {
		items = items.map((i) => (i.id === id ? { ...i, ...over } : i));
	}

	const composerTransports: ClassroomComposerTransports = {
		async createItem(kind, sectionIds, input, published) {
			note('createItem', {
				kind,
				sectionIds,
				title: input.title,
				published,
				publishAt: input.publishAt ?? null
			});
			const shaped = await normalizeBody(input.bodyDoc);
			if (!shaped.ok) return { ok: false, message: shaped.error };
			if (kind !== 'post' && !input.title?.trim()) {
				return { ok: false, message: 'A title is required.' };
			}
			if (kind === 'post' && !shaped.body.trim()) {
				return { ok: false, message: 'The announcement needs a body.' };
			}
			const now = new Date().toISOString();
			const made = mk({
				id: nid('i'),
				kind,
				title: input.title?.trim() || null,
				body: shaped.body,
				body_doc: shaped.doc,
				points: kind === 'assignment' ? input.points : null,
				due_at: kind === 'assignment' ? input.dueAt : null,
				category: input.category,
				published,
				publish_at: input.publishAt ?? null,
				created_at: now,
				updated_at: now,
				first_published_at: published ? now : null,
				links: input.links.map((r, i) => ({ ...r, id: nid('r'), sort_order: i + 1 })),
				postings: sectionIds.map((section_id) => ({ section_id }))
			});
			items = [...items, made];
			return { ok: true, data: { itemId: made.id } };
		},
		async updateItem(id, input, published) {
			note('updateItem', {
				id,
				title: input.title,
				published,
				publishAt: input.publishAt ?? null
			});
			const shaped = await normalizeBody(input.bodyDoc);
			if (!shaped.ok) return { ok: false, message: shaped.error };
			const current = items.find((i) => i.id === id);
			if (!current) return { ok: false, message: 'That item does not exist.' };
			const now = new Date().toISOString();
			const changed =
				(input.title?.trim() || '') !== (current.title ?? '') ||
				shaped.body !== current.body ||
				JSON.stringify(shaped.doc) !== JSON.stringify(current.body_doc ?? []);
			// 0109's rule, mirrored: an edit stamps `edited_at` only when the item
			// was LIVE at the time. A scheduled item revised before go-live raises
			// no badge, however many times it is touched.
			const wasLive = isScheduled(current) ? false : current.published;
			patch(id, {
				title: input.title?.trim() || null,
				body: shaped.body,
				body_doc: shaped.doc,
				points: current.kind === 'assignment' ? input.points : null,
				due_at: current.kind === 'assignment' ? input.dueAt : null,
				category: input.category,
				published: published ?? current.published,
				publish_at: input.publishAt ?? null,
				first_published_at:
					current.first_published_at ?? ((published ?? current.published) ? now : null),
				edited_at: changed && current.first_published_at && wasLive ? now : current.edited_at,
				updated_at: now,
				links: input.links.map((r, i) => ({ ...r, id: nid('r'), sort_order: i + 1 }))
			});
			return { ok: true, data: { itemId: id } };
		},
		async deleteItem(id) {
			note('deleteItem', { id });
			items = items.filter((i) => i.id !== id);
			return { ok: true, data: undefined };
		},
		async duplicateItem(id) {
			note('duplicateItem', { id });
			const src = items.find((i) => i.id === id);
			if (!src) return { ok: false, message: 'That item does not exist.' };
			// Like 0109's note: a copy carries NO inherited go-live time.
			const copy = { ...src, id: nid('i'), published: false, publish_at: null, edited_at: null };
			items = [...items, copy];
			return { ok: true, data: { itemId: copy.id } };
		},
		async setPublished(itemId, published) {
			note('setPublished', { itemId, published });
			patch(itemId, { published });
			return { ok: true, data: undefined };
		},
		async setPinned(itemId, pinned) {
			note('setPinned', { itemId, pinned });
			patch(itemId, { pinned });
			return { ok: true, data: undefined };
		},
		async setOrder(itemIds) {
			note('setOrder', { itemIds });
			return { ok: true, data: undefined };
		},
		async addPostings(itemId, sectionIds) {
			note('addPostings', { itemId, sectionIds });
			const cur = items.find((i) => i.id === itemId);
			if (cur) {
				patch(itemId, {
					postings: [...cur.postings, ...sectionIds.map((section_id) => ({ section_id }))]
				});
			}
			return { ok: true, data: { added: sectionIds.length } };
		},
		async removePosting(itemId, sectionId) {
			note('removePosting', { itemId, sectionId });
			const cur = items.find((i) => i.id === itemId);
			if (cur && cur.postings.length <= 1) {
				return { ok: true, data: { ok: false, reason: 'last_posting' } };
			}
			if (cur) patch(itemId, { postings: cur.postings.filter((p) => p.section_id !== sectionId) });
			return { ok: true, data: { ok: true } };
		},
		async uploadAttachment(itemId, file) {
			uploadStarts = [...uploadStarts, Date.now()];
			note('uploadAttachment', { itemId, file: file.name });
			if (slowUploads) await new Promise((r) => setTimeout(r, 600));
			if (failUploads) return { ok: false, message: 'Drive refused that file.' };
			const cur = items.find((i) => i.id === itemId);
			if (cur) {
				patch(itemId, {
					attachments: [
						...cur.attachments,
						{
							id: nid('a'),
							filename: file.name,
							mime_type: file.type || 'application/octet-stream',
							size_bytes: file.size,
							sort_order: cur.attachments.length + 1
						}
					]
				});
			}
			return { ok: true, data: undefined };
		},
		async deleteAttachment(id) {
			note('deleteAttachment', { id });
			return { ok: true, data: undefined };
		},
		async uploadInstructorAttachment(itemId, file) {
			uploadStarts = [...uploadStarts, Date.now()];
			note('uploadInstructorAttachment', { itemId, file: file.name });
			if (slowUploads) await new Promise((r) => setTimeout(r, 600));
			if (failUploads) return { ok: false, message: 'Drive refused that file.' };
			return { ok: true, data: undefined };
		},
		async deleteInstructorAttachment(id) {
			note('deleteInstructorAttachment', { id });
			return { ok: true, data: undefined };
		},
		async setInstructorResources(itemId, links) {
			// LOGGED ON PURPOSE: the point of the change is that this is NOT called
			// on a save that did not touch the instructor links.
			note('setInstructorResources', { itemId, count: links.length });
			return { ok: true, data: undefined };
		},
		async markViewed(itemId) {
			note('markViewed', { itemId });
			return { ok: true, data: undefined };
		}
	};

	// --- Views ---------------------------------------------------------------
	type View = 'compose' | 'edit' | 'editor' | 'bodies' | 'rows' | 'detail' | 'migrated';
	let view = $state<View>('compose');
	const VIEWS: { id: View; label: string }[] = [
		{ id: 'compose', label: 'Composer (create)' },
		{ id: 'edit', label: 'Composer (edit)' },
		{ id: 'editor', label: 'Rich editor' },
		{ id: 'bodies', label: 'ItemBody' },
		{ id: 'rows', label: 'Draft / Scheduled / Live' },
		{ id: 'detail', label: 'ItemDetail shell' },
		{ id: 'migrated', label: 'Migrated components' }
	];

	// --- Rich editor round trip ---------------------------------------------
	let roundTrip = $state<TiptapNode | null>(null);
	let stored = $state<{ body: string; doc: ItemDoc } | null>(null);
	let storeError = $state<string | null>(null);

	async function storeRoundTrip() {
		const res = await normalizeBody(roundTrip);
		if (res.ok) {
			stored = { body: res.body, doc: res.doc };
			storeError = null;
		} else {
			stored = null;
			storeError = res.error;
		}
	}

	/** The detail view as a STUDENT sees it: no tools, and the hand-in slot. */
	let asStudent = $state(false);
	const editItem = $derived(items.find((i) => i.id === 'i-rich') ?? items[0]);
	const detailItem = $derived(items.find((i) => i.id === 'i-rich') ?? items[0]);

	// --- Migrated components -------------------------------------------------
	const SPEC: AssignmentSpec = {
		schemaVersion: '1.1',
		meta: { title: 'Bridge stackup', totalPoints: 20 },
		modules: [
			{
				id: 'm1',
				title: 'Measure',
				points: 20,
				blocks: [{ id: 'b1', type: 'instructions', text: 'Measure the span.' }],
				rubric: [
					{
						id: 'm1-r1',
						label: 'Accuracy',
						levels: [
							{ label: 'Full', points: 20, descriptor: 'Within tolerance.' },
							{ label: 'Part', points: 12, descriptor: 'Close.' },
							{ label: 'None', points: 0, descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	} as unknown as AssignmentSpec;

	let rubric = $state<RubricCriterion[]>([
		{
			id: 'm1-r1',
			criterion: 'Accuracy',
			points: 20,
			levels: [
				{ label: 'Full', points: 20, descriptor: 'Within tolerance.' },
				{ label: 'Part', points: 12, descriptor: 'Close.' },
				{ label: 'None', points: 0, descriptor: 'Not attempted.' }
			]
		}
	]);

	const teacherTransports = {
		async setSpec(itemId: string, spec: AssignmentSpec) {
			note('setSpec', { itemId, title: spec?.meta?.title });
			return { ok: true as const, data: undefined };
		},
		async setRubric(itemId: string, criteria: RubricCriterion[]) {
			note('setRubric', { itemId, count: criteria.length });
			rubric = criteria;
			return { ok: true as const, data: undefined };
		}
	} as unknown as AssignmentTeacherTransports;

	const REFERENCE: ReferenceSpec = {
		schemaVersion: '2',
		kind: 'reference',
		meta: { title: 'IDEA209H syllabus' },
		sections: [
			{
				slug: 'grading',
				title: 'Grading',
				blocks: [{ type: 'instructions', text: 'Work is graded against the rubric.' }]
			}
		]
	} as unknown as ReferenceSpec;

	const referenceTransports = {
		async setSpec(itemId: string, spec: ReferenceSpec | null) {
			note('reference.setSpec', { itemId, cleared: spec === null });
			return { ok: true as const, data: undefined };
		},
		async setPublic(itemId: string, isPublic: boolean) {
			note('reference.setPublic', { itemId, isPublic });
			return { ok: true as const, data: { ok: true as const } };
		}
	} as unknown as ReferenceTransports;
</script>

<svelte:head><title>Classroom Phase 1 // dev</title></svelte:head>

<div class="cr-root">
	<main class="classroom-page">
		<section class="hero">
			<div class="eyebrow">dev harness</div>
			<h1>Classroom Phase 1</h1>
			<p class="note">
				The REAL components against an in-memory store. Bodies go through the REAL sanitizer over
				the wire, so what renders here is what production would have stored.
			</p>
		</section>

		<nav class="views" aria-label="Harness views">
			{#each VIEWS as v (v.id)}
				<button
					type="button"
					class="viewbtn"
					class:on={view === v.id}
					onclick={() => (view = v.id)}
					data-testid="view-{v.id}">{v.label}</button
				>
			{/each}
		</nav>

		<div class="toggles">
			<label><input type="checkbox" bind:checked={failUploads} /> uploads fail</label>
			<label><input type="checkbox" bind:checked={slowUploads} /> uploads slow (600ms each)</label>
			<button type="button" class="btn secondary tiny" onclick={() => (uploadStarts = [])}>
				reset upload clock
			</button>
			{#if uploadStarts.length > 1}
				<span class="mono" data-testid="upload-spread">
					{uploadStarts.length} uploads, first-to-last start
					{uploadStarts[uploadStarts.length - 1] - uploadStarts[0]}ms
				</span>
			{/if}
		</div>

		{#if view === 'compose'}
			<section class="card">
				<h2>Create, with Period 2 pre-checked</h2>
				<p class="note">
					`initialTargets` is what the class page passes. Period 2 should already be ticked; the
					schedule field is empty, so the primary button reads <strong>Post now</strong>. Set a
					future time and it reads <strong>Schedule</strong>.
				</p>
				<ContentComposer
					mode="create"
					{sections}
					initialTargets={['s-1']}
					transports={composerTransports}
					teacherTransports={teacherTransports}
					onsaved={(info) => note('onsaved', info)}
				/>
			</section>
		{:else if view === 'edit'}
			<section class="card">
				<h2>Edit an existing rich body</h2>
				<p class="note">
					Opens with the stored document in the editor, not the flattened text. Saving without
					touching the instructor links must NOT log `setInstructorResources`.
				</p>
				{#key editItem.id}
					<ContentComposer
						mode="edit"
						item={editItem}
						{sections}
						transports={composerTransports}
						teacherTransports={teacherTransports}
						compact
						onsaved={(info) => note('onsaved', info)}
						oncancel={() => note('oncancel', {})}
					/>
				{/key}
			</section>
		{:else if view === 'editor'}
			<section class="card">
				<h2>Rich editor round trip</h2>
				<p class="note">
					Type, paste, use the link popover -- then store it through the REAL sanitizer and render
					the result with the REAL ItemBody. What comes back is what a student would read.
				</p>
				<RichTextEditor
					value={RICH}
					label="Instructions"
					onchange={(d) => (roundTrip = d)}
					onready={(d) => (roundTrip = d)}
				/>
				<div class="row">
					<button type="button" class="btn" onclick={storeRoundTrip}>Store it</button>
				</div>
				{#if storeError}
					<p class="feedback error">{storeError}</p>
				{/if}
				{#if stored}
					<h3>Rendered by ItemBody</h3>
					<div class="rendered" data-testid="roundtrip-rendered">
						<ItemBody item={{ body: stored.body, body_doc: stored.doc }} />
					</div>
					<h3>Stored document</h3>
					<pre class="dump" data-testid="roundtrip-doc">{JSON.stringify(stored.doc, null, 2)}</pre>
					<h3>Plain-text projection</h3>
					<pre class="dump" data-testid="roundtrip-text">{stored.body}</pre>
				{/if}
			</section>
		{:else if view === 'bodies'}
			<section class="card">
				<h2>Rich body</h2>
				<div data-testid="body-rich">
					<ItemBody item={items.find((i) => i.id === 'i-rich')!} />
				</div>
			</section>
			<section class="card">
				<h2>Legacy plain body (no document)</h2>
				<p class="note">
					`body_doc` is null -- an item authored before 0108, or read from a backend without it.
					Two paragraphs, exactly as before.
				</p>
				<div data-testid="body-legacy">
					<ItemBody item={items.find((i) => i.id === 'i-legacy')!} />
				</div>
			</section>
			<section class="card">
				<h2>Compact (the stream's scale)</h2>
				<div data-testid="body-compact">
					<ItemBody item={items.find((i) => i.id === 'i-rich')!} compact />
				</div>
			</section>
		{:else if view === 'rows'}
			<section class="card">
				<h2>A manager's row set</h2>
				<p class="note">
					Draft, Scheduled and Published in one list -- the chips the manage console renders. A PAST
					stamp is live, not scheduled: only a future one hides the item.
				</p>
				<div class="content-rows">
					{#each items as it (it.id)}
						<div class="content-row">
							<span class="content-main">
								<span class="content-title">
									{it.title ?? '(untitled)'}
									<span class="kind-chip">{it.kind}</span>
									{#if !it.published}
										<span class="draft-chip" data-testid="chip-draft-{it.id}">Draft</span>
									{:else if isScheduled(it)}
										<span class="sched-chip" data-testid="chip-sched-{it.id}">
											Scheduled &middot; {scheduleLabel(it)}
										</span>
									{:else}
										<span class="live-chip" data-testid="chip-live-{it.id}">Live</span>
									{/if}
								</span>
								<span class="content-when mono">
									publish_at {it.publish_at ?? 'null'} &middot; published {String(it.published)}
								</span>
							</span>
							<span class="content-actions">
								<button
									type="button"
									class="btn secondary tiny"
									onclick={() => composerTransports.setPublished(it.id, !it.published)}
								>
									{it.published ? 'Unpublish' : 'Publish'}
								</button>
							</span>
						</div>
					{/each}
				</div>
			</section>
		{:else if view === 'detail'}
			<div class="toggles">
				<label><input type="checkbox" bind:checked={asStudent} /> as a student (no tools)</label>
			</div>
			{#key asStudent}
				{#if asStudent}
					<!-- No transports and no engine: the hand-in slot's own copy, which
					     used to read "not available right now" and so as an outage. -->
					<ItemDetail
						section={sections[0]}
						item={detailItem}
						{sections}
						canManage={false}
						referenceSpec={REFERENCE}
					/>
				{:else}
					<ItemDetail
						section={sections[0]}
						item={detailItem}
						{sections}
						canManage
						transports={composerTransports}
						teacherTransports={teacherTransports}
						referenceSpec={REFERENCE}
						referenceTransports={referenceTransports}
						spec={SPEC}
						{rubric}
						onchanged={() => note('onchanged', {})}
					/>
				{/if}
			{/key}
		{:else}
			<section class="card">
				<h2>SpecImport</h2>
				<SpecImport itemId="i-rich" spec={SPEC} staged={null} transports={teacherTransports} onstage={(raw) => note('spec.onstage', { staged: raw !== null })} />
			</section>
			<section class="card">
				<h2>ReferenceTools</h2>
				<ReferenceTools
					itemId="i-live"
					spec={REFERENCE}
					isPublic={false}
					attachmentCount={0}
					transports={referenceTransports}
					onchanged={() => note('reference.onchanged', {})}
				/>
			</section>
			<section class="card">
				<h2>RubricBuilder</h2>
				<RubricBuilder
					itemId="i-rich"
					criteria={rubric}
					spec={SPEC}
					transports={teacherTransports}
					onchanged={() => note('rubric.onchanged', {})}
				/>
			</section>
			<section class="card">
				<h2>Feedback states</h2>
				<p class="feedback ok">Saved. Every class it is posted to sees the change.</p>
				<p class="feedback error">
					Saved, but 1 thing did not: brief.pdf: Drive refused that file. What is left is still
					here -- save again to retry.
				</p>
			</section>
		{/if}

		<section class="card">
			<h2>Transport log</h2>
			<p class="note">Newest first. `setInstructorResources` should be ABSENT from an unrelated save.</p>
			<ol class="log" data-testid="transport-log">
				{#each log as line, i (i)}
					<li class="mono">{line}</li>
				{:else}
					<li class="mono muted">nothing yet</li>
				{/each}
			</ol>
		</section>
	</main>
</div>

<style>
	.views {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
	}
	.viewbtn {
		appearance: none;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--text-2);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.3rem 0.9rem;
		cursor: pointer;
		min-height: 2.2rem;
	}
	.viewbtn.on {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.toggles {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.toggles label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.toggles input {
		accent-color: var(--green);
	}
	.row {
		display: flex;
		gap: var(--space-2);
		margin: var(--space-3) 0;
	}
	.rendered {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		background: var(--surface-2);
	}
	.dump {
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: var(--space-2);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		max-height: 18rem;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.content-rows {
		display: flex;
		flex-direction: column;
	}
	.content-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--hairline);
	}
	.content-row:last-child {
		border-bottom: none;
	}
	.content-main {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		flex: 1 1 16rem;
		min-width: 0;
	}
	.content-title {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		font-size: 0.92rem;
		color: var(--text-1);
	}
	.content-when {
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.live-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		color: var(--green);
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
	}
	.mono {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
	}
	.muted {
		color: var(--text-3);
	}
	.log {
		margin: 0;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		max-height: 16rem;
		overflow: auto;
	}
	.log li {
		overflow-wrap: anywhere;
		color: var(--text-2);
	}
</style>
