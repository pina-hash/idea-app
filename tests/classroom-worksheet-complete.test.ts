// tests/classroom-worksheet-complete.test.ts
//
// FINISHING A PORTED WORKSHEET IS TURNING IT IN (decision 37, ledger 0298).
//
// Every failure this guards is silent. A worksheet with every answer in that
// reads "Missing" renders a perfectly ordinary chip; a worksheet with nothing
// in it that reads "Complete" renders a perfectly ordinary checkmark; a
// classmate's answers finishing somebody else's worksheet looks exactly like a
// student who did the work; and a completeness read that quietly stops at
// PostgREST's 1000-row cap reads the last students' work as unfinished. None
// of it errors, so every assertion below is a PAIR on one fixture.
//
// WHERE THE EXPECTED VALUES COME FROM. "Complete" and "not complete" are
// decided by hand from the fixture (which blocks hold a stored answer, and how
// many sentences each has), never by calling `hxProgress` to find out. The
// instants are the fixture's own literals.

import { describe, expect, it } from 'vitest';
import {
	assignmentStanding,
	completionIsLate,
	studentWorkChip,
	studentWorkMap,
	workIsComplete,
	type ClassroomItem,
	type ClassroomSection
} from '$lib/classroom/classroom';
import { hxCompletion } from '$lib/classroom/html-assignment/progress';
import { hxIncompleteBlocks } from '$lib/classroom/html-assignment/answers';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import { buildFeed, isAwaitingGrade, type FeedSubmission } from '$lib/classroom/feed';
import { buildTodo, todoSummary, todoWhen } from '$lib/classroom/todo';
import {
	readAllPages,
	readWorksheetCompletions,
	withWorksheetCompletions,
	worksheetCandidates,
	worksheetKey
} from '$lib/classroom/student-work';
import { postGradeBlockChanges } from '$lib/classroom/grading-export';

// ---------------------------------------------------------------------------
// The worksheet: a header the bar does not count, and three counted blocks,
// one of them asking for two sentences and one a photograph.
// ---------------------------------------------------------------------------

const MANIFEST: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Gear train',
	course: 'IDEA100',
	points: 10,
	header: [{ id: 'h-name', field: 'studentName', type: 'text' }],
	modules: [
		{
			id: 'm1',
			title: 'Ratios',
			points: 10,
			blocks: [
				{ id: 'b-ratio', field: 'ratio', type: 'text' },
				{ id: 'b-why', field: 'why', type: 'longText', minSentences: 2 },
				{ id: 'b-photo', field: 'photo', type: 'image' }
			],
			criteria: []
		}
	]
} as unknown as HtmlAssignmentManifest;

/** The same worksheet with NO sentence minimum anywhere: the case `hxIncompleteBlocks` alone gets wrong. */
const NO_MINIMUM: HtmlAssignmentManifest = {
	...MANIFEST,
	modules: [
		{
			...MANIFEST.modules[0],
			blocks: [
				{ id: 'b-ratio', field: 'ratio', type: 'text' },
				{ id: 'b-why', field: 'why', type: 'longText' }
			]
		}
	]
} as unknown as HtmlAssignmentManifest;

const text = (block_id: string, value: string, updated_at: string) => ({
	block_id,
	value: { text: value },
	updated_at
});
const photo = (id: string, block_id: string, created_at: string) => ({
	id,
	submission_id: 'sub-1',
	block_id,
	caption: null,
	filename: 'gears.jpg',
	mime_type: 'application/octet-stream',
	sort_order: 1,
	created_at
});

const FULL = [
	text('h-name', 'Ana Reyes', '2026-09-20T15:00:00.000Z'),
	text('b-ratio', '3:1', '2026-09-20T15:05:00.000Z'),
	text('b-why', 'The driver has 12 teeth. The driven gear has 36.', '2026-09-20T15:10:00.000Z')
];
const FULL_FILES = [photo('f-1', 'b-photo', '2026-09-20T15:20:00.000Z')];

describe('hxCompletion is the progress rail reaching 100%, never the sentence count alone', () => {
	it('an EMPTY worksheet whose manifest asks for no sentences is NOT complete, though the sentence gate finds nothing short', () => {
		// The trap, stated as its own control: nothing is short of a minimum...
		expect(hxIncompleteBlocks(NO_MINIMUM, {})).toEqual([]);
		// ...and still nothing is answered.
		expect(hxCompletion(NO_MINIMUM, [], [])).toEqual({ complete: false, at: null });
	});

	it('the same worksheet with both answers in IS complete', () => {
		const done = hxCompletion(NO_MINIMUM, [
			text('b-ratio', '3:1', '2026-09-20T15:05:00.000Z'),
			text('b-why', 'Because.', '2026-09-20T15:10:00.000Z')
		]);
		expect(done).toEqual({ complete: true, at: '2026-09-20T15:10:00.000Z' });
	});

	it('every answer and the photo: complete, at the LATEST counted change (the photo here)', () => {
		expect(hxCompletion(MANIFEST, FULL, FULL_FILES)).toEqual({
			complete: true,
			at: '2026-09-20T15:20:00.000Z'
		});
	});

	it('one sentence where two are asked for: not complete', () => {
		const short = [...FULL.slice(0, 2), text('b-why', 'The driver has 12 teeth.', '2026-09-20T15:10:00.000Z')];
		expect(hxCompletion(MANIFEST, short, FULL_FILES).complete).toBe(false);
	});

	it('no photo: not complete; the photo alone with nothing typed: not complete', () => {
		expect(hxCompletion(MANIFEST, FULL, []).complete).toBe(false);
		expect(hxCompletion(MANIFEST, [], FULL_FILES).complete).toBe(false);
	});

	it('the header is identity, not work: an edit to the name after the rest moves nothing', () => {
		const lateName = [...FULL.slice(1), text('h-name', 'Ana R.', '2026-09-30T09:00:00.000Z')];
		expect(hxCompletion(MANIFEST, lateName, FULL_FILES).at).toBe('2026-09-20T15:20:00.000Z');
	});
});

// ---------------------------------------------------------------------------
// The one standing, and the chip every surface prints from it.
// ---------------------------------------------------------------------------

const DUE = '2026-09-21T06:59:00.000Z'; // 11:59pm Pacific on the 20th
const NOW = '2026-09-25T17:00:00.000Z'; // well past it
const ITEM = { kind: 'assignment' as const, due_at: DUE, points: 10 };

describe('complete is done, late says so, and nothing else moves', () => {
	it('finished before the due instant: done, "Complete", the info tone, a checkmark', () => {
		const work = { state: 'in-progress' as const, score: null, completedAt: '2026-09-20T15:20:00.000Z' };
		expect(assignmentStanding(ITEM, work, NOW)).toBe('done');
		expect(studentWorkChip(ITEM, work, NOW)).toEqual({ label: 'Complete', tone: 'info', done: true, missing: false });
	});

	it('finished after it: still done, but "Complete, late" in amber, never a silent Done', () => {
		const work = { state: 'in-progress' as const, score: null, completedAt: '2026-09-22T10:00:00.000Z' };
		expect(assignmentStanding(ITEM, work, NOW)).toBe('done');
		expect(studentWorkChip(ITEM, work, NOW)).toEqual({
			label: 'Complete, late',
			tone: 'attention',
			done: true,
			missing: false
		});
	});

	it('partly answered past due, no completion: Missing, exactly as before', () => {
		const work = { state: 'in-progress' as const, score: null };
		expect(assignmentStanding(ITEM, work, NOW)).toBe('missing');
		expect(studentWorkChip(ITEM, work, NOW).label).toBe('Missing, draft saved');
	});

	it('a row that already says where it stands keeps its own words: closed reads Submitted, returned reads Returned', () => {
		const closed = { state: 'submitted' as const, score: null, completedAt: '2026-09-20T15:20:00.000Z' };
		const returned = { state: 'returned' as const, score: 9, completedAt: '2026-09-20T15:20:00.000Z' };
		expect(workIsComplete(closed)).toBe(false);
		expect(workIsComplete(returned)).toBe(false);
		expect(studentWorkChip(ITEM, closed, NOW).label).toBe('Submitted');
		expect(studentWorkChip(ITEM, returned, NOW).label).toBe('Returned · 9/10');
	});

	it('an undated worksheet is never late; an unreadable instant is never evidence of lateness', () => {
		expect(completionIsLate({ due_at: null }, '2026-09-22T10:00:00.000Z')).toBe(false);
		expect(completionIsLate({ due_at: DUE }, 'not a date')).toBe(false);
		expect(completionIsLate({ due_at: DUE }, '2026-09-22T10:00:00.000Z')).toBe(true);
	});

	it('studentWorkMap carries the derived instant from the row, and only when there is one', () => {
		const map = studentWorkMap([
			{ item_id: 'a', state: 'draft', score: null, completed_at: '2026-09-20T15:20:00.000Z' },
			{ item_id: 'b', state: 'draft', score: null }
		]);
		expect(map.a.completedAt).toBe('2026-09-20T15:20:00.000Z');
		expect('completedAt' in map.b).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The teacher's side: the same completion, the tally.
// ---------------------------------------------------------------------------

const ME = 'ana@boscotech.net';
const TEACHER = 'pina@boscotech.edu';
const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 2',
	block: 'B',
	teacher_email: TEACHER,
	active: true,
	course: { id: 'c-1', code: 'IDEA100', title: 'Engineering Essentials', active: true }
};

function item(id: string, over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'assignment',
		title: id,
		body: '',
		body_doc: null,
		points: 10,
		due_at: DUE,
		category: null,
		author_email: TEACHER,
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: '2026-09-10T00:00:00.000Z',
		edited_at: null,
		created_at: '2026-09-10T00:00:00.000Z',
		updated_at: '2026-09-10T00:00:00.000Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 's-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	} as ClassroomItem;
}

const row = (item_id: string, student_email: string, over: Partial<FeedSubmission> = {}): FeedSubmission => ({
	item_id,
	student_email,
	state: 'draft',
	submitted_at: null,
	returned_at: null,
	graded_at: null,
	...over
});

describe('the to-grade tally counts a finished, ungraded worksheet and nothing near it', () => {
	it('isAwaitingGrade: complete and ungraded yes; graded no; unfinished no; a spec hand-in unchanged', () => {
		expect(isAwaitingGrade(row('w', ME, { completed_at: '2026-09-20T15:20:00.000Z' }))).toBe(true);
		expect(
			isAwaitingGrade(row('w', ME, { completed_at: '2026-09-20T15:20:00.000Z', graded_at: '2026-09-22T00:00:00.000Z' }))
		).toBe(false);
		expect(isAwaitingGrade(row('w', ME))).toBe(false);
		expect(isAwaitingGrade(row('s', ME, { state: 'submitted', submitted_at: '2026-09-20T00:00:00.000Z' }))).toBe(true);
	});

	it("the teacher's card reads 2 to grade for two finished worksheets and not the third, unfinished one", () => {
		const feeds = buildFeed({
			sections: [SECTION],
			items: [item('w')],
			submissions: [
				row('w', 'a@boscotech.net', { completed_at: '2026-09-20T15:20:00.000Z' }),
				row('w', 'b@boscotech.net', { completed_at: '2026-09-22T10:00:00.000Z' }),
				row('w', 'c@boscotech.net')
			],
			myEmail: TEACHER,
			now: new Date(NOW)
		});
		expect(feeds[0].urgent).toHaveLength(1);
		expect(feeds[0].urgent[0]).toMatchObject({ reason: 'ungraded', count: 2 });
	});

	it("a student's own finished worksheet due tomorrow is not 'Due tomorrow' on their card; an unfinished one is", () => {
		const soon = '2026-09-26T06:59:00.000Z';
		const card = (sub: FeedSubmission) =>
			buildFeed({
				sections: [SECTION],
				items: [item('w', { due_at: soon })],
				submissions: [sub],
				myEmail: ME,
				now: new Date(NOW)
			})[0].urgent;
		expect(card(row('w', ME, { completed_at: '2026-09-25T16:00:00.000Z' }))).toHaveLength(0);
		expect(card(row('w', ME))).toMatchObject([{ reason: 'due-soon' }]);
	});
});

describe("the to-do lists a finished worksheet under Done, dated when it was finished", () => {
	it('done, "Complete, late", completed that day; and the Missing count drops by exactly that one', () => {
		const clock = { now: NOW, today: '2026-09-25' };
		const base = { sections: [SECTION], items: [item('w'), item('x')], checkIns: [], myEmail: ME, isAdmin: false, clock };
		const before = buildTodo({ ...base, submissions: [] });
		const after = buildTodo({
			...base,
			submissions: [row('w', ME, { completed_at: '2026-09-22T10:00:00.000Z' })]
		});
		expect(todoSummary(before, clock.today).missing).toBe(2);
		expect(todoSummary(after, clock.today).missing).toBe(1);
		const w = after.find((r) => r.key === 'item:w')!;
		expect(w).toMatchObject({ view: 'done', state: 'Complete, late', tone: 'attention', done: true });
		expect(todoWhen(w, clock.today)).toBe('Completed Sep 22');
	});
});

// ---------------------------------------------------------------------------
// The loader's half, over a stub client that records what it was asked.
// ---------------------------------------------------------------------------

type Rows = Record<string, unknown>[];

/** A PostgREST-shaped stub: each table answers from a fixture, honouring `.eq` on the student, `.range` and `count`. */
function stubClient(tables: Record<string, Rows>, fail: string | null = null, cap = 1000) {
	const calls: { table: string; eq: [string, unknown][]; range: [number, number] | null }[] = [];
	return {
		calls,
		client: {
			from(table: string) {
				const call = { table, eq: [] as [string, unknown][], range: null as [number, number] | null };
				const within: [string, unknown[]][] = [];
				calls.push(call);
				let counted = false;
				const builder = {
					select(_cols: string, opts?: { count?: string }) {
						counted = opts?.count === 'exact';
						return builder;
					},
					in(col: string, values: unknown[]) {
						within.push([col, values]);
						return builder;
					},
					not() {
						return builder;
					},
					order() {
						return builder;
					},
					eq(col: string, value: unknown) {
						call.eq.push([col, value]);
						return builder;
					},
					range(from: number, to: number) {
						call.range = [from, to];
						return builder;
					},
					then(resolve: (v: unknown) => unknown) {
						if (fail === table) return Promise.resolve({ data: null, error: { code: '42P01' } }).then(resolve);
						let rows = tables[table] ?? [];
						const cell = (r: Record<string, unknown>, col: string) =>
							col.includes('.') ? (r.classroom_submissions as Record<string, unknown>)?.[col.split('.')[1]] : r[col];
						for (const [col, values] of within) rows = rows.filter((r) => values.includes(cell(r, col)));
						for (const [col, value] of call.eq) {
							rows = rows.filter((r) =>
								col.includes('.')
									? (r.classroom_submissions as Record<string, unknown>)?.[col.split('.')[1]] === value
									: r[col] === value
							);
						}
						const total = rows.length;
						if (call.range) rows = rows.slice(call.range[0], Math.min(call.range[1] + 1, call.range[0] + cap));
						return Promise.resolve({ data: rows, error: null, count: counted ? total : null }).then(resolve);
					}
				};
				return builder;
			}
		} as never
	};
}

const WORKSHEET_TABLES = (responses: Rows, files: Rows = []) => ({
	classroom_items: [
		{ id: 'w', assignment_schema_version: 3 },
		{ id: 's', assignment_schema_version: null }
	],
	classroom_html_assignments: [{ item_id: 'w', manifest: NO_MINIMUM }],
	classroom_responses: responses,
	classroom_submission_files: files
});

const answer = (email: string, block_id: string, value: string, updated_at = '2026-09-20T15:00:00.000Z') => ({
	item_id: 'w',
	student_email: email,
	block_id,
	value: { text: value },
	updated_at
});

describe('readWorksheetCompletions: attribution, paging, and "cannot tell"', () => {
	it("a classmate's answers never finish somebody else's worksheet (Bruno half, Carla half: neither complete)", async () => {
		const { client } = stubClient(
			WORKSHEET_TABLES([
				answer('bruno@boscotech.net', 'b-ratio', '3:1'),
				answer('carla@boscotech.net', 'b-why', 'Because.'),
				answer(ME, 'b-ratio', '3:1'),
				answer(ME, 'b-why', 'Because.')
			])
		);
		const out = await readWorksheetCompletions(client, ['w', 's']);
		expect(out).not.toBeNull();
		expect([...out!.keys()]).toEqual([worksheetKey('w', ME)]);
	});

	it('onlyEmail pins BOTH answer reads to the one student', async () => {
		const { client, calls } = stubClient(WORKSHEET_TABLES([answer(ME, 'b-ratio', '3:1')]));
		await readWorksheetCompletions(client, ['w'], { onlyEmail: ' Ana@BoscoTech.net ' });
		const pinned = calls.filter((c) => c.table === 'classroom_responses' || c.table === 'classroom_submission_files');
		expect(pinned).toHaveLength(2);
		expect(pinned[0].eq).toEqual([['student_email', ME]]);
		expect(pinned[1].eq).toEqual([['classroom_submissions.student_email', ME]]);
	});

	it('a spec assignment never pays for an answers read', async () => {
		const { client, calls } = stubClient(WORKSHEET_TABLES([]));
		expect(await readWorksheetCompletions(client, ['s'])).toEqual(new Map());
		expect(calls.map((c) => c.table).sort()).toEqual(['classroom_html_assignments', 'classroom_items']);
	});

	it('any read that errors is null, "cannot tell", never complete', async () => {
		for (const table of ['classroom_items', 'classroom_html_assignments', 'classroom_responses', 'classroom_submission_files']) {
			const { client } = stubClient(WORKSHEET_TABLES([answer(ME, 'b-ratio', '3:1'), answer(ME, 'b-why', 'x')]), table);
			expect(await readWorksheetCompletions(client, ['w']), table).toBeNull();
		}
	});

	it('the answers past row 1000 are read: 700 students, the last one finished, and a server that caps at 400 a page', async () => {
		const rows: Rows = [];
		for (let i = 0; i < 700; i++) rows.push(answer(`s${String(i).padStart(3, '0')}@boscotech.net`, 'b-ratio', '3:1'));
		rows.push(answer('s699@boscotech.net', 'b-why', 'Last in.'));
		const { client } = stubClient(WORKSHEET_TABLES(rows), null, 400);
		const out = await readWorksheetCompletions(client, ['w']);
		expect(out?.has(worksheetKey('w', 's699@boscotech.net'))).toBe(true);
		expect(out?.size).toBe(1);
	});

	it('readAllPages advances by what it received and stops on the count', async () => {
		const asked: [number, number][] = [];
		const data = Array.from({ length: 2500 }, (_, i) => i);
		const rows = await readAllPages<number>((from, to) => {
			asked.push([from, to]);
			return Promise.resolve({ data: data.slice(from, Math.min(to + 1, from + 700)), error: null, count: 2500 });
		});
		expect(rows).toHaveLength(2500);
		expect(asked.map((a) => a[0])).toEqual([0, 700, 1400, 2100]);
	});

	it('past the row ceiling it gives up and says so (null), rather than judging on part of the rows', async () => {
		const rows = await readAllPages<number>(
			(from) => Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => from + i), error: null, count: 99_999 }),
			3000
		);
		expect(rows).toBeNull();
	});
});

describe('withWorksheetCompletions puts the answer on the rows every surface already reads', () => {
	const done = new Map([
		[worksheetKey('w', ME), '2026-09-20T15:20:00.000Z'],
		[worksheetKey('w', 'bruno@boscotech.net'), '2026-09-21T09:00:00.000Z']
	]);
	const blank = (item_id: string, student_email: string): FeedSubmission => row(item_id, student_email);

	it('marks a draft row, leaves a submitted row alone, and ADDS a draft row for work saved with no row (a typed-only worksheet has none)', () => {
		const out = withWorksheetCompletions(
			[row('w', ME), row('w', 'carla@boscotech.net', { state: 'submitted' })],
			done,
			blank
		);
		expect(out).toHaveLength(3);
		expect(out[0].completed_at).toBe('2026-09-20T15:20:00.000Z');
		expect(out[1].completed_at).toBeUndefined();
		expect(out[2]).toEqual({ ...row('w', 'bruno@boscotech.net'), completed_at: '2026-09-21T09:00:00.000Z' });
	});

	it('null (cannot tell) and an empty map change nothing', () => {
		const rows = [row('w', ME)];
		expect(withWorksheetCompletions(rows, null, blank)).toEqual(rows);
		expect(withWorksheetCompletions(rows, new Map(), blank)).toEqual(rows);
	});

	it("the candidates are the assignments in classes the caller takes, whatever their date, and never a class they teach", () => {
		const items = [
			item('old', { due_at: '2026-08-01T06:59:00.000Z' }),
			item('recent', { due_at: '2026-09-20T06:59:00.000Z' }),
			item('undated', { due_at: null }),
			item('mat', { kind: 'material' })
		];
		expect(worksheetCandidates(items, () => true)).toEqual(['old', 'recent', 'undated']);
		expect(worksheetCandidates(items, (i) => i.id !== 'recent')).toEqual(['old', 'undated']);
		expect(worksheetCandidates(items, () => false)).toEqual([]);
	});
});

describe('postGradeBlockChanges names each block that moved after the grade', () => {
	const graded = { graded_at: '2026-09-22T00:00:00.000Z' };

	it('the answers edited after the grade and the photo added after it, newest first; nothing before the grade', () => {
		const out = postGradeBlockChanges({
			submission: graded,
			responses: [
				{ block_id: 'b-ratio', updated_at: '2026-09-21T10:00:00.000Z' },
				{ block_id: 'b-why', updated_at: '2026-09-23T10:00:00.000Z' }
			],
			files: [
				{ block_id: 'b-photo', created_at: '2026-09-24T08:00:00.000Z' },
				{ block_id: null, created_at: '2026-09-24T09:00:00.000Z' }
			]
		});
		expect(out).toEqual([
			{ blockId: 'b-photo', at: '2026-09-24T08:00:00.000Z', kind: 'file' },
			{ blockId: 'b-why', at: '2026-09-23T10:00:00.000Z', kind: 'edited' }
		]);
	});

	it('never graded: nothing to report', () => {
		expect(
			postGradeBlockChanges({ submission: null, responses: [{ block_id: 'b', updated_at: '2026-09-23T10:00:00.000Z' }] })
		).toEqual([]);
	});
});
