/**
 * Fixture for /dev/classroom-standing (ledger 0298, R14 and R27).
 *
 * ONE CLASS, ONE PINNED CLOCK: 8pm Pacific on Thursday 2026-09-24, which is
 * 03:00 UTC on the 25th, so the school's day and the UTC day disagree and a
 * check-in dated the 23rd is yesterday's.
 *
 * WHAT IS HERE ON PURPOSE, each with the reading it must produce:
 *   - the day's MATERIAL with yesterday's check-in hanging off it, not filed:
 *     "Check-in: Not filed yet" on the material's row, and one missing;
 *   - a worksheet FINISHED BEFORE its due instant: "Complete";
 *   - a worksheet FINISHED AFTER it: "Complete, late";
 *   - a worksheet PARTLY answered, past due: "Missing" -- and a classmate's
 *     answers to the half she left empty sit in the same table, so a
 *     completeness read that stopped attributing rows would finish it;
 *   - a worksheet whose manifest asks for NO sentences, with NO answers, past
 *     due: "Missing" -- the case the sentence gate alone calls complete.
 *
 * THE COMPLETIONS COME FROM THE REAL `readWorksheetCompletions`, over an
 * in-memory stand-in for the caller's client that answers the four reads it
 * makes. The stand-in returns EVERY student's rows, the way a teacher's read
 * does, so the same answer serves the student's page (her own rows) and the
 * teacher's tally (everybody's).
 */
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import type { FeedSubmission } from '$lib/classroom/feed';

export const CLOCK = { now: '2026-09-25T03:00:00.000Z', today: '2026-09-24' };
export const BASE = '/dev/classroom-standing';
export const ME = 'ana@boscotech.net';
export const TEACHER = 'pina@boscotech.edu';

export const SECTION: ClassroomSection = {
	id: 's-idea',
	course_id: 'c-idea',
	label: 'Period 5',
	block: 'E',
	teacher_email: TEACHER,
	active: true,
	course: { id: 'c-idea', code: 'IDEA209H', title: 'Design and Fabrication', active: true }
};

/** Sep 22, 11:59pm Pacific. */
const DUE = '2026-09-23T06:59:00.000Z';

function item(id: string, title: string, over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'assignment',
		title,
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
		first_published_at: '2026-09-18T15:00:00.000Z',
		edited_at: null,
		created_at: '2026-09-18T15:00:00.000Z',
		updated_at: '2026-09-18T15:00:00.000Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 's-idea' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	} as ClassroomItem;
}

export const ITEMS: ClassroomItem[] = [
	item('day-24', 'Day 24: gear trains', {
		kind: 'material',
		points: null,
		due_at: null,
		created_at: '2026-09-23T15:00:00.000Z'
	}),
	item('ws-gears', 'Gear ratio worksheet'),
	item('ws-bearings', 'Bearing worksheet'),
	item('ws-shafts', 'Shaft worksheet'),
	item('ws-log', 'Reading log')
];

export const CHECK_INS: ClassCheckIn[] = [
	{
		session_id: 'ns-23',
		section_id: 's-idea',
		unit_number: 3,
		session_date: '2026-09-23',
		session_label: 'Day 23 gear sketches',
		status: 'missing',
		flag_reason: null,
		item_id: 'day-24'
	}
];

function criterion(id: string) {
	return {
		id,
		text: `${id} is recorded`,
		points: 5,
		levels: [
			{ points: 5, label: 'Complete', short: 'Fully done', descriptor: 'Done in full.' },
			{ points: 0, label: 'Absent', short: 'Not done', descriptor: 'Not attempted.' }
		]
	};
}

/** Two counted blocks, the second asking for two sentences. */
const GEARS = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Gears',
	course: 'IDEA209H',
	points: 10,
	header: [{ id: 'h-name', field: 'studentName', type: 'text' }],
	modules: [
		{ id: 'm1', title: 'Ratio', points: 5, blocks: [{ id: 'm1-ratio', field: 'ratio', type: 'text' }], criteria: [criterion('c1')] },
		{
			id: 'm2',
			title: 'Why',
			points: 5,
			blocks: [{ id: 'm2-why', field: 'why', type: 'longText', minSentences: 2 }],
			criteria: [criterion('c2')]
		}
	]
};

/** No sentence minimum anywhere. */
const LOG = {
	...GEARS,
	title: 'Reading log',
	modules: [
		{ id: 'm1', title: 'Pages', points: 5, blocks: [{ id: 'l-pages', field: 'pages', type: 'text' }], criteria: [criterion('c1')] },
		{ id: 'm2', title: 'Notes', points: 5, blocks: [{ id: 'l-notes', field: 'notes', type: 'longText' }], criteria: [criterion('c2')] }
	]
};

const TWO = 'The driver has 12 teeth. The driven gear has 36.';

function answer(item_id: string, student_email: string, block_id: string, text: string, updated_at: string) {
	return { item_id, student_email, block_id, value: { text }, updated_at };
}

type Row = Record<string, unknown>;

export const TABLES: Record<string, Row[]> = {
	classroom_items: [
		{ id: 'day-24', assignment_schema_version: null },
		{ id: 'ws-gears', assignment_schema_version: 3 },
		{ id: 'ws-bearings', assignment_schema_version: 3 },
		{ id: 'ws-shafts', assignment_schema_version: 3 },
		{ id: 'ws-log', assignment_schema_version: 3 }
	],
	classroom_html_assignments: [
		{ item_id: 'ws-gears', manifest: GEARS },
		{ item_id: 'ws-bearings', manifest: GEARS },
		{ item_id: 'ws-shafts', manifest: GEARS },
		{ item_id: 'ws-log', manifest: LOG }
	],
	classroom_responses: [
		// Ana: gears finished Sep 22 at 1pm Pacific, before the deadline.
		answer('ws-gears', ME, 'm1-ratio', '3:1', '2026-09-22T19:00:00.000Z'),
		answer('ws-gears', ME, 'm2-why', TWO, '2026-09-22T20:00:00.000Z'),
		// Ana: bearings finished Sep 24 at 11am Pacific, after it.
		answer('ws-bearings', ME, 'm1-ratio', '2:1', '2026-09-22T18:00:00.000Z'),
		answer('ws-bearings', ME, 'm2-why', TWO, '2026-09-24T18:00:00.000Z'),
		// Ana: shafts half done. Bruno wrote the half she did not.
		answer('ws-shafts', ME, 'm1-ratio', '4:1', '2026-09-22T18:30:00.000Z'),
		answer('ws-shafts', 'bruno@boscotech.net', 'm2-why', TWO, '2026-09-22T18:40:00.000Z'),
		// The teacher's view of the gears worksheet: Bruno and Carla finished it,
		// Dev did half.
		answer('ws-gears', 'bruno@boscotech.net', 'm1-ratio', '3:1', '2026-09-22T17:00:00.000Z'),
		answer('ws-gears', 'bruno@boscotech.net', 'm2-why', TWO, '2026-09-22T17:05:00.000Z'),
		answer('ws-gears', 'carla@boscotech.net', 'm1-ratio', '3:1', '2026-09-23T16:00:00.000Z'),
		answer('ws-gears', 'carla@boscotech.net', 'm2-why', TWO, '2026-09-23T16:10:00.000Z'),
		answer('ws-gears', 'dev@boscotech.net', 'm1-ratio', '3:1', '2026-09-22T16:00:00.000Z')
		// Nobody has answered the reading log.
	],
	classroom_submission_files: []
};

/** No submission rows at all: saving an answer creates none (0086, 0197). */
export const SUBMISSIONS: FeedSubmission[] = [];

/**
 * An in-memory stand-in for the caller's client, answering exactly the calls
 * `readWorksheetCompletions` makes (`select`, `in`, `eq`, `not`, `order`,
 * `range`, awaited) from `TABLES`, with `count` for an exact select. Anything
 * else it was never asked is not modelled.
 */
export function memoryClient(tables: Record<string, Row[]> = TABLES) {
	return {
		from(table: string) {
			const within: [string, unknown[]][] = [];
			const equal: [string, unknown][] = [];
			let range: [number, number] | null = null;
			let counted = false;
			const cell = (r: Row, col: string) =>
				col.includes('.') ? (r.classroom_submissions as Row | undefined)?.[col.split('.')[1]] : r[col];
			const builder = {
				select(_cols: string, opts?: { count?: string }) {
					counted = opts?.count === 'exact';
					return builder;
				},
				in(col: string, values: unknown[]) {
					within.push([col, values]);
					return builder;
				},
				eq(col: string, value: unknown) {
					equal.push([col, value]);
					return builder;
				},
				not() {
					return builder;
				},
				order() {
					return builder;
				},
				range(from: number, to: number) {
					range = [from, to];
					return builder;
				},
				then<T>(resolve: (v: { data: Row[]; error: null; count: number | null }) => T) {
					let rows = tables[table] ?? [];
					for (const [col, values] of within) rows = rows.filter((r) => values.includes(cell(r, col)));
					for (const [col, value] of equal) rows = rows.filter((r) => cell(r, col) === value);
					const total = rows.length;
					if (range) rows = rows.slice(range[0], range[1] + 1);
					return Promise.resolve({ data: rows, error: null, count: counted ? total : null }).then(resolve);
				}
			};
			return builder;
		}
	};
}
