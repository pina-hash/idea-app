<script lang="ts">
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import RubricBuilder from '$lib/classroom/RubricBuilder.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import RevisionHistory from '$lib/classroom/RevisionHistory.svelte';
	import SpecImporter from '$lib/classroom/SpecImporter.svelte';
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
	import type { DeckTransports } from '$lib/classroom/deck';
	import type {
		ContentRevision,
		ExportOutcome,
		ItemExportStatus,
		RevisionHistory as RevisionHistoryData,
		RevisionTarget,
		RevisionTransports
	} from '$lib/classroom/revisions';
	import type { ClassroomCourse, ClassroomManageTransports } from '$lib/classroom/classroom';

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

	/**
	 * RICH's own plain-text projection -- what `docText` writes into
	 * `classroom_items.body`, one line per block and per list item.
	 *
	 * Rendered with no `body_doc`, this is the exact production symptom: the
	 * heading, the paragraph and every list item run together into a single
	 * paragraph, because the fallback splits on BLANK lines and there are none.
	 * Kept in the harness so the broken state can be looked at beside the
	 * correct one rather than described.
	 */
	const DEGRADED_TEXT = [
		'Before you start',
		'Read the whole brief before touching the CAD file. Reference: the tolerance table.',
		'Bring',
		'A ruler',
		'Graph paper',
		'Your notebook',
		'Steps',
		'Measure twice',
		'Cut once',
		'Log the result in your notebook'
	].join('\n');

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
		/**
		 * BOTH CHIP DEFECTS IN ONE ITEM, which is also a realistic shape: a
		 * teacher drafting an assignment, revising it twice before it goes out,
		 * and not having settled on a deadline.
		 *
		 * `edited_at` is set with `first_published_at` NULL, which used to render
		 * an "Updated" badge on something no student had ever seen; and there is
		 * no `due_at`, which used to render the sentence "Due No due date".
		 */
		mk({
			id: 'i-unposted',
			kind: 'assignment',
			title: 'Unposted draft, no deadline yet',
			body: 'Still being written.',
			points: 15,
			category: 'Unit Labs',
			due_at: null,
			published: false,
			first_published_at: null,
			edited_at: iso(-1)
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
	type View =
		| 'compose'
		| 'edit'
		| 'editor'
		| 'bodies'
		| 'rows'
		| 'detail'
		| 'importer'
		| 'history'
		| 'export'
		| 'migrated';
	let view = $state<View>('compose');
	const VIEWS: { id: View; label: string }[] = [
		{ id: 'compose', label: 'Composer (create)' },
		{ id: 'edit', label: 'Composer (edit)' },
		{ id: 'editor', label: 'Rich editor' },
		{ id: 'bodies', label: 'ItemBody' },
		{ id: 'rows', label: 'Draft / Scheduled / Live' },
		{ id: 'detail', label: 'ItemDetail shell' },
		{ id: 'importer', label: 'Spec importer' },
		{ id: 'history', label: 'Revision history' },
		{ id: 'export', label: 'Export chip' },
		{ id: 'migrated', label: 'Other tools' }
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
	let detailUnposted = $state(false);
	const editItem = $derived(items.find((i) => i.id === 'i-rich') ?? items[0]);
	const detailItem = $derived(
		items.find((i) => i.id === (detailUnposted ? 'i-unposted' : 'i-rich')) ?? items[0]
	);

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
		async setSpec(itemId: string, spec: AssignmentSpec | null) {
			note('setSpec', { itemId, title: spec?.meta?.title, cleared: spec === null });
			if (refuseServer) {
				// The SERVER'S refusal, in the server's own words. The importer has
				// to render this in the same list as its own validation problems.
				return {
					ok: false as const,
					message: 'Module "measure" rubric must sum to the module points (12).'
				};
			}
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

	// --- Phase 2: the consolidated importer ---------------------------------
	//
	// The samples below are REAL: each one passes the shipping validator (a
	// harness whose "valid" sample is not actually valid proves nothing about
	// the flow it is demonstrating). The invalid ones each break a DIFFERENT
	// rule, so the problem list is exercised rather than one message rendered
	// twice.
	let importerKind = $state<'assignment' | 'reference'>('assignment');
	let refuseServer = $state(false);

	const VALID_ASSIGNMENT = JSON.stringify(
		{
			schemaVersion: 1,
			meta: {
				assignmentId: 'idea209h-bridge-stackup',
				title: 'Bridge stackup',
				totalPoints: 20
			},
			modules: [
				{
					id: 'measure',
					title: 'Measure the span',
					points: 12,
					aiLevel: 1,
					blocks: [
						{ type: 'instructions', content: 'Measure the span at three points and record each.' },
						{
							id: 'span-notes',
							type: 'textField',
							prompt: 'What did you measure, and where?',
							minSentences: 2,
							maxSentences: 5
						},
						{
							id: 'span-table',
							type: 'table',
							prompt: 'Readings',
							minRows: 3,
							columns: [
								{ key: 'point', label: 'Point' },
								{ key: 'mm', label: 'Reading (mm)' }
							]
						}
					],
					rubric: [
						{
							id: 'accuracy',
							criterion: 'Accuracy',
							levels: [
								{ label: 'Full', points: 12, descriptor: 'Every reading within tolerance.' },
								{ label: 'Partial', points: 7, descriptor: 'Most readings within tolerance.' },
								{ label: 'None', points: 0, descriptor: 'Not attempted.' }
							]
						}
					]
				},
				{
					id: 'conclude',
					title: 'Draw a conclusion',
					points: 8,
					blocks: [
						{ type: 'instructions', content: 'Say what the stackup means for the build.' },
						{
							id: 'conclusion',
							type: 'textField',
							prompt: 'What does the stackup mean?',
							minSentences: 3
						}
					],
					rubric: [
						{
							id: 'reasoning',
							criterion: 'Reasoning',
							levels: [
								{ label: 'Full', points: 8, descriptor: 'Conclusion follows from the data.' },
								{ label: 'Partial', points: 5, descriptor: 'Partly supported.' },
								{ label: 'None', points: 0, descriptor: 'Not attempted.' }
							]
						}
					]
				}
			]
		},
		null,
		2
	);

	const VALID_REFERENCE = JSON.stringify(
		{
			schemaVersion: 2,
			kind: 'reference',
			meta: { referenceId: 'idea209h-syllabus', title: 'IDEA209H syllabus' },
			navigation: 'tabs',
			sections: [
				{
					slug: 'grading',
					title: 'Grading',
					blocks: [
						{
							type: 'instructions',
							content: 'Work is graded against the rubric on each assignment.'
						},
						{
							type: 'keyValue',
							items: [
								{ label: 'Labs', value: '40%' },
								{ label: 'Documentation', value: '25%' }
							]
						}
					]
				},
				{
					slug: 'materials',
					title: 'Materials',
					blocks: [
						{
							type: 'callout',
							variant: 'required',
							title: 'Bring these',
							content: 'A 150mm caliper and a bound notebook.'
						}
					]
				}
			]
		},
		null,
		2
	);

	/** Points that do not add up, a duplicate block id, and a bad AI level. */
	const INVALID_ASSIGNMENT = JSON.stringify(
		{
			schemaVersion: 1,
			meta: { assignmentId: 'broken', title: 'Broken', totalPoints: 50 },
			modules: [
				{
					id: 'one',
					title: 'One',
					points: 10,
					aiLevel: 9,
					blocks: [{ id: 'dup', type: 'textField', prompt: 'A?' }]
				},
				{
					id: 'two',
					title: 'Two',
					points: 10,
					blocks: [{ id: 'dup', type: 'textField', prompt: 'B?' }]
				}
			]
		},
		null,
		2
	);

	/** A reference document carrying points, which references may never have. */
	const INVALID_REFERENCE = JSON.stringify(
		{
			schemaVersion: 2,
			kind: 'reference',
			meta: { referenceId: 'broken', title: 'Broken' },
			sections: [
				{
					slug: 'Bad Slug',
					title: 'Bad',
					points: 10,
					blocks: [{ type: 'instructions', content: 'x' }]
				}
			]
		},
		null,
		2
	);

	const sampleValid = $derived(importerKind === 'reference' ? VALID_REFERENCE : VALID_ASSIGNMENT);
	const sampleInvalid = $derived(
		importerKind === 'reference' ? INVALID_REFERENCE : INVALID_ASSIGNMENT
	);

	async function copySample(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			note('sample.copied', { chars: text.length });
		} catch {
			note('sample.copy-failed', {});
		}
	}

	// --- Phase 2: revision history ------------------------------------------
	//
	// A chain across THREE targets with a real restore in it, because the point
	// of the panel is that those interleave into one list.
	let revSeq = 0;
	const rid = () => 'rev-' + ++revSeq;
	const SPEC_R1 = rid();

	let revisionRows = $state<ContentRevision[]>([
		{
			id: SPEC_R1,
			target: 'assignment_spec',
			revision: 1,
			payload: JSON.parse(VALID_ASSIGNMENT),
			author_email: TEACHER,
			author_name: 'T. Vargas',
			supersedes_id: null,
			restored_from_id: null,
			created_at: iso(-9, 10)
		},
		{
			id: rid(),
			target: 'item',
			revision: 1,
			payload: {
				title: 'Bridge stackup',
				body: 'Measure the span and report what it means for the build.',
				body_doc: null,
				points: 20,
				due_at: iso(-2),
				category: 'Labs',
				publish_at: null
			},
			author_email: TEACHER,
			author_name: 'T. Vargas',
			supersedes_id: null,
			restored_from_id: null,
			created_at: iso(-6, 14)
		},
		{
			id: rid(),
			target: 'rubric',
			revision: 1,
			payload: [
				{
					id: 'accuracy',
					criterion: 'Accuracy',
					points: 20,
					levels: [
						{ label: 'Full', points: 20, descriptor: 'Within tolerance.' },
						{ label: 'None', points: 0, descriptor: 'Not attempted.' }
					]
				}
			],
			author_email: 'a.pina@boscotech.edu',
			author_name: 'A. Pina',
			supersedes_id: null,
			restored_from_id: null,
			created_at: iso(-4, 9)
		},
		{
			// The RESTORE marker: what restoring spec r1 displaced.
			id: rid(),
			target: 'assignment_spec',
			revision: 2,
			payload: JSON.parse(INVALID_ASSIGNMENT),
			author_email: TEACHER,
			author_name: 'T. Vargas',
			supersedes_id: SPEC_R1,
			restored_from_id: SPEC_R1,
			created_at: iso(-1, 11)
		}
	]);

	function headRevisions(): Partial<Record<RevisionTarget, number>> {
		const heads: Partial<Record<RevisionTarget, number>> = {};
		for (const r of revisionRows) {
			const current = heads[r.target] ?? 0;
			if (r.revision + 1 > current) heads[r.target] = r.revision + 1;
		}
		return heads;
	}

	const revisionTransports: RevisionTransports = {
		async load(itemId) {
			note('revisions.load', { itemId });
			return {
				ok: true,
				data: {
					revisions: [...revisionRows],
					head_revisions: headRevisions()
				} as RevisionHistoryData
			};
		},
		async restore(revisionId) {
			const source = revisionRows.find((r) => r.id === revisionId);
			note('revisions.restore', { revisionId, target: source?.target });
			if (!source) return { ok: false, message: 'That revision does not exist.' };
			// Mirrors the RPC: the CURRENT head is snapshotted, and the new row
			// carries restored_from_id. The head itself lives outside this list.
			const sameTarget = revisionRows.filter((r) => r.target === source.target);
			const head = Math.max(...sameTarget.map((r) => r.revision));
			const prev = sameTarget.find((r) => r.revision === head);
			revisionRows = [
				...revisionRows,
				{
					id: rid(),
					target: source.target,
					revision: head + 1,
					payload: prev?.payload ?? source.payload,
					author_email: TEACHER,
					author_name: 'T. Vargas',
					supersedes_id: prev?.id ?? null,
					restored_from_id: revisionId,
					created_at: new Date().toISOString()
				}
			];
			return { ok: true, data: { target: source.target, restored: source.revision, changed: true } };
		}
	};

	// --- Phase 2: the export failure chip ------------------------------------
	let exportWillFail = $state(true);
	const exportStatuses: Record<string, ItemExportStatus> = {
		'i-rich': {
			slug: 'bridge-stackup',
			lastExportAt: iso(-2, 8),
			lastExportSha: 'a1b2c3d',
			lastExportError: 'GitHub 401: Bad credentials'
		}
	};

	async function loadExportStatuses(itemIds: string[]) {
		note('export.loadStatuses', { count: itemIds.length });
		return exportStatuses;
	}

	async function retryExport(itemId: string) {
		note('export.retry', { itemId, willFail: exportWillFail });
		await new Promise((r) => setTimeout(r, 220));
		if (exportWillFail) {
			return {
				ok: true as const,
				data: {
					status: 'failed',
					error: 'GitHub 403: Resource not accessible by personal access token',
					slug: 'bridge-stackup'
				} as ExportOutcome
			};
		}
		return {
			ok: true as const,
			data: {
				status: 'ok',
				sha: 'f00dcafe',
				slug: 'bridge-stackup',
				path: 'materials/idea209h/bridge-stackup',
				unchanged: false,
				files: ['materials/idea209h/bridge-stackup/assignment.json']
			} as ExportOutcome
		};
	}

	const courses: ClassroomCourse[] = [
		{ id: 'c-1', code: 'IDEA209H', title: 'Engineering Design', active: true }
	];

	/**
	 * Enough of the manage transports to mount the REAL console. Everything the
	 * export chip does not touch answers plausibly and logs; the chip and its
	 * Retry are what this view exists to drive.
	 */
	const manageTransports = {
		...composerTransports,
		async upsertCourse() {
			return { ok: true as const, data: { courseId: 'c-1', created: false } };
		},
		async upsertSection() {
			return { ok: true as const, data: { sectionId: 's-1' } };
		},
		async setSectionActive() {
			return { ok: true as const, data: undefined };
		},
		async deleteSection() {
			return {
				ok: true as const,
				data: { ok: false, reason: 'not_empty', items: 3, enrollments: 12 }
			};
		},
		async reloadSections() {
			return { ok: true as const, data: { sections, courses } };
		},
		async loadRoster() {
			return { ok: true as const, data: [] };
		},
		async setEnrollment() {
			return { ok: true as const, data: undefined };
		},
		async updateEnrollment() {
			return { ok: true as const, data: { ok: true } };
		},
		async importRoster() {
			return { ok: true as const, data: { total: 0, succeeded: 0, refused: 0, results: [] } };
		},
		async loadContent() {
			note('manage.loadContent', {});
			return { ok: true as const, data: { items } };
		}
	} as unknown as ClassroomManageTransports;

	/**
	 * Enough for the item page's own Presentation card to render its manage
	 * controls. Uploading is not driven here -- /dev/classroom-deck owns the real
	 * ingest -- this exists so the panel COUNT is browser-verifiable with the
	 * editor open.
	 */
	const deckTransports = {
		async uploadDeck(itemId: string) {
			note('deck.uploadDeck', { itemId });
			return { ok: false as const, message: 'Not driven in this harness.' };
		},
		async deleteDeck(itemId: string) {
			note('deck.deleteDeck', { itemId });
			return { ok: true as const, message: 'Deck removed.' };
		}
	} as unknown as DeckTransports;

	const referenceTransports = {
		// setReferenceSpec, not setSpec: that is the name on ReferenceTransports,
		// and the harness's old stub had it wrong -- hidden by the `as unknown as`
		// cast, so the control simply did nothing when pressed.
		async setReferenceSpec(itemId: string, spec: ReferenceSpec | null) {
			note('reference.setReferenceSpec', { itemId, cleared: spec === null });
			if (refuseServer) {
				return {
					ok: false as const,
					message: 'Section "grading" slug is already used by another section.'
				};
			}
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
				<p class="note">
					Every mark and block the shape supports, in one body: h3, h4, bold, italic, a safe link,
					a bulleted list, a numbered list, and a list nested inside a list (which flattens into
					its parent by design). This must render as real &lt;ul&gt; / &lt;ol&gt; / &lt;li&gt;
					elements with visible markers.
				</p>
				<div data-testid="body-rich">
					<ItemBody item={items.find((i) => i.id === 'i-rich')!} />
				</div>
			</section>
			<section class="card">
				<h2>The SAME body with no stored document -- the reported bug</h2>
				<p class="note">
					`body_doc` absent (a backend without 0108, so the save route degraded past
					`p_body_doc`). `docText` writes one line per block and per list item; the render-time
					fallback splits on BLANK lines only, so the whole body collapses into one run-on
					paragraph -- no breaks, no markers. Nothing here can recover it: the markers were never
					in the text.
				</p>
				<div class="rendered" data-testid="body-degraded">
					<ItemBody item={{ body: DEGRADED_TEXT }} />
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
				<label>
					<input type="checkbox" bind:checked={detailUnposted} /> an unposted draft with no deadline
				</label>
			</div>
			<p class="note">
				With the second box ticked: NO "Updated" chip (nothing has ever been posted, so nothing can
				have been missed) and NO due segment at all (rather than the sentence "Due No due date").
				The Draft chip and the points still render.
			</p>
			<p class="note">
				OPEN THE EDITOR AND COUNT THE PANELS. There must be exactly ONE Presentation card and ONE
				Assignment engine card on this page, both page-level, whether the editor is open or shut.
				The composer used to render a deck panel and a spec panel of its own, which put two of each
				on screen with near-identical explanatory text and no way to tell which one to use.
			</p>
			{#key `${asStudent}-${detailItem.id}`}
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
						{revisionTransports}
						deckTransports={deckTransports}
						onchanged={() => note('onchanged', {})}
					/>
				{/if}
			{/key}
		{:else if view === 'importer'}
			<div class="toggles">
				<label>
					kind
					<select bind:value={importerKind} data-testid="importer-kind">
						<option value="assignment">assignment</option>
						<option value="reference">reference</option>
					</select>
				</label>
				<label>
					<input type="checkbox" bind:checked={refuseServer} data-testid="refuse-server" />
					server refuses the publish
				</label>
			</div>
			<section class="card">
				<h2>One importer, both kinds</h2>
				<p class="note">
					Open the import panel, paste one of the samples below, and watch: validation runs on
					its own after a short pause, problems list inline, the preview renders with the REAL
					student renderer, and Publish stays enabled while you keep typing. There is no
					Validate button, and a keystroke never disarms the commit.
				</p>
				{#key importerKind}
					<SpecImporter
						kind={importerKind}
						itemId={importerKind === 'reference' ? 'i-live' : 'i-rich'}
						spec={importerKind === 'reference' ? REFERENCE : SPEC}
						isPublic={false}
						attachmentCount={2}
						transports={importerKind === 'reference' ? referenceTransports : teacherTransports}
						onchanged={() => note('importer.onchanged', { kind: importerKind })}
					/>
				{/key}
			</section>
			<section class="card">
				<h2>Staging (the composer, before the item exists)</h2>
				<p class="note">
					`itemId` null: nothing to attach to yet, so Publish reads "Use this spec" and hands
					the JSON back through `onstage` instead of calling an RPC.
				</p>
				<SpecImporter
					kind="assignment"
					itemId={null}
					spec={null}
					staged={null}
					onstage={(raw) => note('importer.onstage', { staged: raw !== null })}
				/>
			</section>
			<section class="card">
				<h2>Samples</h2>
				<div class="row">
					<button type="button" class="btn secondary tiny" onclick={() => copySample(sampleValid)}>
						Copy valid {importerKind}
					</button>
					<button type="button" class="btn secondary tiny" onclick={() => copySample(sampleInvalid)}>
						Copy invalid {importerKind}
					</button>
				</div>
				<h3>Valid</h3>
				<pre class="dump" data-testid="sample-valid">{sampleValid}</pre>
				<h3>Invalid</h3>
				<pre class="dump" data-testid="sample-invalid">{sampleInvalid}</pre>
			</section>
		{:else if view === 'history'}
			<section class="card">
				<h2>Revision history</h2>
				<p class="note">
					Four entries across THREE targets in one chronological list, newest first. The
					assignment-spec r2 entry was displaced by a RESTORE, so it says so rather than
					leaving a reader to infer it. Restoring appends a new entry -- the chain only ever
					grows.
				</p>
				<RevisionHistory
					itemId="i-rich"
					transports={revisionTransports}
					onchanged={() => note('history.onchanged', {})}
				/>
			</section>
		{:else if view === 'export'}
			<div class="toggles">
				<label>
					<input type="checkbox" bind:checked={exportWillFail} data-testid="export-will-fail" />
					the retry fails again
				</label>
			</div>
			<section class="card">
				<h2>Export failure chip, in the REAL class view</h2>
				<p class="note">
					"Bridge stackup" carries a recorded export failure, so its row shows the amber chip;
					expanding the row shows the reason and Retry. Untick the toggle and retry: a
					successful export clears the chip on the spot, with no reload. Every other row says
					nothing at all -- an item that exported cleanly, or never exported, has nothing to
					report. (The chip moved here from the retired manage console, which is where a
					manager used to see their content listed.)
				</p>
			</section>
			<ClassView
				section={sections[0]}
				items={items.filter((i) => i.postings.some((p) => p.section_id === sections[0].id))}
				{sections}
				canManage={true}
				transports={manageTransports}
				teacherTransports={teacherTransports}
				{loadExportStatuses}
				{retryExport}
			/>
		{:else}
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
