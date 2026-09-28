// tests/dom/composer-drop-edit-mount.test.ts
//
// A FILE DROPPED ON THE EDIT FORM, OR ON THE CLASS PAGE, GOES WHERE IT BELONGS
// (reports R01 and R11, 2026-09-28), measured on the REAL components with REAL
// drop events.
//
// WHY A TEST. Both regressions are SILENT. On the edit form a spec `.json` or a
// ported `.html` was staged on the class's Files list, the one list every
// student can read, while the box meant for it never heard about it, and the
// note said "One file added to Files." as if that were the point. On the class
// page a dropped file reached no handler at all. Nothing threw either way.
//
// BOTH DIRECTIONS, COUNTED: for each typed file the destination RECEIVED it (or
// the refusal NAMED it) AND the Files list did NOT take it; the photograph is
// the positive control that the Files list is being read at all. A student's
// class page is the absence case, paired with the manager mount of the same
// fixture so "no overlay" can never be a page that failed to render.
//
// THE MUTATION THIS EXISTS FOR (run by hand, restored from a byte copy): the
// edit form's targets naming no refusal and no `specDrop` route, which is the
// shipped behaviour. It reddens the spec, the document and the no-Files cases
// on their "Files list is empty" half.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import ClassView from '$lib/classroom/ClassView.svelte';
import type {
	ClassroomComposerTransports,
	ClassroomItem,
	ClassroomSection,
	TxResult
} from '$lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';
import { dragEvent, dropEvent } from './drag-events';

const Composer = ContentComposer as unknown as Component<Record<string, unknown>>;
const View = ClassView as unknown as Component<Record<string, unknown>>;

const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

function item(over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id: 'item-1',
		kind: 'assignment',
		title: 'Bridge stackup',
		body: 'Measure the truss.',
		body_doc: null,
		points: 20,
		due_at: null,
		category: null,
		author_email: 'teacher@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		is_public: false,
		publish_at: null,
		unit_id: null,
		sort_order: 1,
		first_published_at: '2026-08-10T16:00:00.000Z',
		edited_at: null,
		created_at: '2026-08-10T16:00:00.000Z',
		updated_at: '2026-08-10T16:00:00.000Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 'sec-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	} as ClassroomItem;
}

const ok = <T,>(data: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data });

const transports = {
	updateItem: () => ok({ itemId: 'item-1', sectionIds: ['sec-1'], formattingDropped: false }),
	createItem: () => ok({ itemId: 'item-1', sectionIds: ['sec-1'], formattingDropped: false }),
	deleteItem: () => ok(undefined),
	duplicateItem: () => ok({ itemId: 'copy' }),
	uploadAttachment: () => ok(undefined),
	uploadInstructorAttachment: () => ok(undefined),
	deleteAttachment: () => ok(undefined),
	deleteInstructorAttachment: () => ok(undefined),
	setInstructorResources: () => ok(undefined),
	addPostings: () => ok({ added: 0 }),
	removePosting: () => ok({ ok: true }),
	setPublished: () => ok(undefined),
	setPinned: () => ok(undefined),
	setOrder: () => ok(undefined),
	markViewed: () => ok(undefined),
	loadCategorySuggestions: () => ok([])
} as unknown as ClassroomComposerTransports;

const noop = async () => ({ ok: true as const, data: undefined });
const htmlAssignmentTransports = { setHtmlAssignment: noop };
const teacherTransports = new Proxy({}, { get: () => noop });

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});
function keep(m: Mounted): Mounted {
	mounted.push(m);
	return m;
}

function mountEdit(props: Record<string, unknown> = {}) {
	return keep(
		mountInto(Composer, {
			mode: 'edit',
			item: item(),
			sections: [SECTION],
			transports,
			attachmentsEnabled: true,
			instructorAttachmentsEnabled: true,
			onsaved: () => {},
			...props
		})
	);
}

/** Filenames staged on the STUDENT-FACING Files list. */
function studentFiles(m: Mounted): string[] {
	const panel = m.all<HTMLElement>('.fup[data-role="attachment"]')[0];
	if (!panel) return [];
	return Array.from(panel.querySelectorAll('.fup-name')).map((n) => (n.textContent ?? '').trim());
}
function note(m: Mounted): { text: string; refused: boolean } | null {
	const el = m.all<HTMLElement>('[data-testid="composer-drop-note"]')[0];
	return el ? { text: (el.textContent ?? '').trim(), refused: el.dataset.refused === 'true' } : null;
}
function title(m: Mounted): HTMLInputElement {
	return m.one<HTMLInputElement>('.composer input[type="text"]');
}
async function waitFor(m: Mounted, predicate: () => boolean, tries = 40): Promise<boolean> {
	for (let i = 0; i < tries; i++) {
		await m.settle();
		if (predicate()) return true;
	}
	return predicate();
}

const png = () => new File([new Uint8Array(9)], 'bench.png', { type: 'image/png' });
const spec = () => new File(['{"schemaVersion":1}'], 'lab-03.json', { type: 'application/json' });
const doc = () => new File(['<!doctype html><p>no manifest</p>'], 'worksheet.html', { type: 'text/html' });

describe('the EDIT form: a spec or a document never lands on the Files list (R11)', () => {
	it('POSITIVE CONTROL: a photograph dropped on the edit form is attached', async () => {
		const m = mountEdit();
		title(m).dispatchEvent(dropEvent([png()]));
		await m.settle();
		expect(studentFiles(m)).toEqual(['bench.png']);
		expect(note(m)).toEqual({ text: 'One file added to Files.', refused: false });
	});

	it("a spec goes to the item page's importer, and the note says it is not published yet", async () => {
		const handed: string[] = [];
		const m = mountEdit({ specDrop: (files: File[]) => handed.push(...files.map((f) => f.name)) });
		title(m).dispatchEvent(dropEvent([spec()]));
		await m.settle();
		expect({ handed, onFilesList: studentFiles(m).length }).toEqual({ handed: ['lab-03.json'], onFilesList: 0 });
		const n = note(m);
		expect(n?.refused).toBe(false);
		expect(n?.text).toContain('under Instructor tools');
		expect(n?.text).toContain('Nothing is published yet');
	});

	it('with no importer to hand it to (the row editor), a spec is refused by name', async () => {
		const m = mountEdit();
		title(m).dispatchEvent(dropEvent([spec()]));
		await m.settle();
		expect(studentFiles(m)).toEqual([]);
		const n = note(m);
		expect(n?.refused).toBe(true);
		expect(n?.text).toMatch(/^lab-03\.json was not attached\. A spec is imported on the item's own page/);
		expect(m.all('[data-testid="composer-drop-note"][role="alert"]')).toHaveLength(1);
	});

	it('a document on an assignment that is not a ported one is refused, and no box is opened for it', async () => {
		const m = mountEdit({ htmlAssignmentTransports, htmlAssignmentAdmin: true });
		// No ported box on this item (it has no stored document): both counted.
		expect(m.all('[data-testid="staged-html"]')).toHaveLength(0);
		title(m).dispatchEvent(dropEvent([doc()]));
		await m.settle();
		expect(studentFiles(m)).toEqual([]);
		expect(m.all('[data-testid="staged-html-issues"]')).toHaveLength(0);
		const n = note(m);
		expect(n?.refused).toBe(true);
		expect(n?.text).toContain('This assignment is not a ported HTML assignment');
	});

	it('a document from a form that cannot upload one says who can, and is not attached', async () => {
		const m = mountEdit();
		title(m).dispatchEvent(dropEvent([doc()]));
		await m.settle();
		expect(studentFiles(m)).toEqual([]);
		expect(note(m)?.text).toContain('A ported HTML assignment is uploaded by a site admin');
	});

	it('POSITIVE CONTROL: on a ported assignment the replace box takes the document', async () => {
		const m = mountEdit({
			htmlAssignmentTransports,
			htmlAssignmentAdmin: true,
			htmlAssignment: { documentId: 'doc-1', manifest: {}, filename: 'old.html', updatedAt: null }
		});
		title(m).dispatchEvent(dropEvent([doc()]));
		const judged = await waitFor(m, () => m.all('[data-testid="staged-html-issues"]').length === 1);
		expect({ judgedByTheBox: judged, onFilesList: studentFiles(m).length }).toEqual({
			judgedByTheBox: true,
			onFilesList: 0
		});
	});

	it('a material edit is not an assignment: a web page there is an ordinary file, as on create', async () => {
		const m = mountEdit({ item: item({ kind: 'material' }), htmlAssignmentTransports, htmlAssignmentAdmin: true });
		title(m).dispatchEvent(dropEvent([doc()]));
		await m.settle();
		expect(studentFiles(m)).toEqual(['worksheet.html']);
	});

	it('with attachments off the zone stays on: the spec still routes, a photograph is refused out loud', async () => {
		const handed: string[] = [];
		const m = mountEdit({
			attachmentsEnabled: false,
			specDrop: (files: File[]) => handed.push(...files.map((f) => f.name))
		});
		expect(m.all('.fup[data-role="attachment"]')).toHaveLength(0);
		title(m).dispatchEvent(dropEvent([spec()]));
		await m.settle();
		expect(handed).toEqual(['lab-03.json']);
		title(m).dispatchEvent(dropEvent([png()]));
		await m.settle();
		const n = note(m);
		expect(n?.refused).toBe(true);
		expect(n?.text).toBe('bench.png was not attached. This form takes no files.');
	});
});

describe('the CREATE form handed files from the class page (R01)', () => {
	function mountCreate(initialFiles: File[]) {
		return keep(
			mountInto(Composer, {
				mode: 'create',
				sections: [SECTION],
				initialTargets: ['sec-1'],
				transports,
				teacherTransports,
				htmlAssignmentTransports,
				htmlAssignmentAdmin: true,
				attachmentsEnabled: true,
				instructorAttachmentsEnabled: true,
				initialFiles,
				onsaved: () => {}
			})
		);
	}

	it('a spec opens an ASSIGNMENT with the spec in its importer, and nothing on the Files list', async () => {
		const text = JSON.stringify({ schemaVersion: 1, meta: { assignmentId: 'lab-03', title: 'SENTINEL' }, modules: [] });
		const m = mountCreate([new File([text], 'lab-03.json', { type: 'application/json' })]);
		const landed = await waitFor(
			m,
			() => (m.all<HTMLTextAreaElement>('[data-testid="spec-paste"]')[0]?.value ?? '') === text
		);
		expect({ inImporter: landed, onFilesList: studentFiles(m).length }).toEqual({ inImporter: true, onFilesList: 0 });
		expect(m.one('.kind-toggle .kind.active').textContent?.trim()).toBe('Assignment');
	});

	it('a ported document opens an assignment and reaches its box', async () => {
		const m = mountCreate([doc()]);
		const judged = await waitFor(m, () => m.all('[data-testid="staged-html-issues"]').length === 1);
		expect({ judged, onFilesList: studentFiles(m).length }).toEqual({ judged: true, onFilesList: 0 });
	});

	it('POSITIVE CONTROL: a photograph opens an announcement with the photograph attached', async () => {
		const m = mountCreate([png()]);
		const added = await waitFor(m, () => studentFiles(m).length === 1);
		expect(added).toBe(true);
		expect(studentFiles(m)).toEqual(['bench.png']);
		expect(m.one('.kind-toggle .kind.active').textContent?.trim()).toBe('Announcement');
	});
});

describe('the CLASS PAGE takes a drop for a manager and not for a student (R01)', () => {
	function mountPage(manage: boolean, onDropFiles: ((files: File[]) => void) | null) {
		return keep(
			mountInto(View, {
				section: SECTION,
				items: [item({ kind: 'post', title: 'Welcome' })],
				canManage: manage,
				transports: manage ? transports : null,
				onCompose: manage ? () => {} : null,
				onDropFiles,
				basePath: '/classroom'
			})
		);
	}

	it('a manager: a file drag says so in words, and the drop hands the files up', async () => {
		const got: string[] = [];
		const m = mountPage(true, (files) => got.push(...files.map((f) => f.name)));
		const root = m.one<HTMLElement>('.classroom-page');
		expect(m.all('[data-testid="class-page-drop-overlay"]')).toHaveLength(0);
		const enter = dragEvent('dragenter');
		root.dispatchEvent(enter);
		m.flush();
		expect(enter.defaultPrevented).toBe(true);
		expect(m.one('[data-testid="class-page-drop-overlay"]').textContent?.trim()).toBe(
			'Drop to start a new post with these files'
		);
		root.dispatchEvent(dropEvent([spec(), png()]));
		await m.settle();
		expect(got).toEqual(['lab-03.json', 'bench.png']);
		expect(m.all('[data-testid="class-page-drop-overlay"]')).toHaveLength(0);
	});

	it('a student: the same drag is left to the browser and nothing lights up', async () => {
		const m = mountPage(false, null);
		// The page rendered (the row is there), so the absence below is real.
		expect(m.all('.classroom-page')).toHaveLength(1);
		const enter = dragEvent('dragenter');
		m.one<HTMLElement>('.classroom-page').dispatchEvent(enter);
		m.flush();
		expect(enter.defaultPrevented).toBe(false);
		expect(m.all('[data-testid="class-page-drop-overlay"]')).toHaveLength(0);
	});

	it('a drop a closer target already took is left alone', async () => {
		const got: string[] = [];
		const m = mountPage(true, (files) => got.push(...files.map((f) => f.name)));
		const root = m.one<HTMLElement>('.classroom-page');
		const inner = root.firstElementChild as HTMLElement;
		inner.addEventListener('drop', (e) => e.preventDefault(), { once: true });
		inner.dispatchEvent(dropEvent([png()]));
		await m.settle();
		expect(got).toEqual([]);
		// And the same drop, not taken, is handed up (the control for the line above).
		inner.dispatchEvent(dropEvent([png()]));
		await m.settle();
		expect(got).toEqual(['bench.png']);
	});
});
