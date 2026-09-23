/**
 * Fixture for /dev/classroom-palette: the command palette, the classroom
 * settings panel and the search inside a class, on the REAL ClassroomShell and
 * the REAL ClassView (ledger 0297, F3+F5).
 *
 * EVERY STANDING THE FILTER CAN ANSWER IS HERE ON PURPOSE, so "Missing keeps
 * the past-due one and drops the rest" is a count on a page rather than an
 * argument: an assignment past due with nothing turned in, one due later
 * tonight, one turned in, one returned, one with no due date, a draft only a
 * manager sees, a material with a file, an announcement, and check-ins in
 * each of their states.
 *
 * ONE CLOCK, AND IT IS THE INSTANT WHERE THE TWO CALENDARS DISAGREE: 8pm
 * Pacific on 2026-08-27, which is 03:00 UTC on the 28th (the instrument
 * CLAUDE.md names). The loader's `classClock` is exactly this pair, so a
 * check-in dated the 27th must read "to do" here, not "missing".
 */
import type { ClassroomItem, ClassroomSection, ClassroomUnit, StudentWork } from '$lib/classroom/classroom';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import type { PaletteStudent } from '$lib/shell/palette';

export const BASE = '/dev/classroom-palette';

export const CLOCK = { now: '2026-08-28T03:00:00.000Z', today: '2026-08-27' };

export const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 2',
	block: 'B',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
};

/** A second class, so the palette has a class to jump to. */
export const OTHER_SECTION: ClassroomSection = {
	id: 's-2',
	course_id: 'c-2',
	label: 'Period 5',
	block: 'E',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c-2', code: 'IDEA209H', title: 'Design and Fabrication', active: true }
};

export const SECTIONS = [SECTION, OTHER_SECTION];

export const UNITS: ClassroomUnit[] = [
	{ id: 'u-1', course_id: 'c-1', name: 'Unit 1 · Sketching', sort_order: 1 },
	{ id: 'u-2', course_id: 'c-1', name: 'Unit 2 · Bridges', sort_order: 2 },
	{ id: 'u-3', course_id: 'c-1', name: 'Unit 3 · Materials and testing', sort_order: 3 }
];

/** An instant relative to the clock, in hours. */
function at(hours: number): string {
	return new Date(Date.parse(CLOCK.now) + hours * 3600000).toISOString();
}

function item(over: Partial<ClassroomItem> & { id: string; kind: ClassroomItem['kind'] }): ClassroomItem {
	return {
		title: null,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		author_email: 'vargas@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: at(-240),
		edited_at: null,
		created_at: at(-240),
		updated_at: at(-240),
		links: [],
		attachments: [],
		postings: [{ section_id: 's-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	};
}

export const ITEMS: ClassroomItem[] = [
	item({ id: 'i-welcome', kind: 'post', title: 'Welcome to the bridge unit', unit_id: 'u-1', sort_order: 1 }),
	item({
		id: 'i-reference',
		kind: 'material',
		title: 'Sketching reference',
		unit_id: 'u-1',
		sort_order: 2,
		attachments: [{ id: 'a-1', filename: 'orthographic-views.pdf', mime_type: 'application/pdf' }]
	}),
	item({ id: 'i-returned', kind: 'assignment', title: 'Gear ratios worksheet', unit_id: 'u-1', sort_order: 3, points: 10, due_at: at(-200) }),
	item({ id: 'i-undated', kind: 'assignment', title: 'Design reflection', unit_id: 'u-1', sort_order: 4, points: 10, category: 'Portfolio' }),
	// Due 8am Pacific today: past at 8pm, nothing turned in.
	item({ id: 'i-missing', kind: 'assignment', title: 'Truss sketch', unit_id: 'u-2', sort_order: 1, points: 20, due_at: at(-12) }),
	// Due 11:59pm Pacific today: still to do at 8pm.
	item({ id: 'i-tonight', kind: 'assignment', title: 'Load test log', unit_id: 'u-2', sort_order: 2, points: 20, due_at: at(3.98) }),
	item({ id: 'i-turned-in', kind: 'assignment', title: 'Bridge photos', unit_id: 'u-2', sort_order: 3, points: 10, due_at: at(-72) }),
	item({ id: 'i-draft', kind: 'assignment', title: 'Next week lab', unit_id: 'u-2', sort_order: 4, published: false, points: 25 }),
	item({ id: 'i-safety', kind: 'post', title: 'Shop safety reminder', unit_id: 'u-3', sort_order: 1 }),
	item({ id: 'i-tensile', kind: 'material', title: 'Tensile testing notes', unit_id: 'u-3', sort_order: 2 }),
	item({ id: 'i-beam', kind: 'assignment', title: 'Beam deflection lab', unit_id: 'u-3', sort_order: 3, points: 30, due_at: at(96) })
];

/** The student's own work, keyed by item id, in `studentWorkMap`'s shape. */
export const WORK: Record<string, StudentWork> = {
	'i-returned': { state: 'returned', score: 9 },
	'i-turned-in': { state: 'submitted', score: null },
	'i-tonight': { state: 'in-progress', score: null }
};

function checkIn(over: Partial<ClassCheckIn> & { session_id: string }): ClassCheckIn {
	return {
		section_id: 's-1',
		unit_number: 2,
		session_date: CLOCK.today,
		session_label: 'Check-in',
		status: null,
		flag_reason: null,
		item_id: null,
		...over
	};
}

/** The student's check-ins in this class, one per state the filter reads. */
export const STUDENT_CHECK_INS: ClassCheckIn[] = [
	checkIn({ session_id: 'ns-12', session_label: 'Day 12 sketches', session_date: '2026-08-26', status: 'missing' }),
	checkIn({ session_id: 'ns-13', session_label: 'Day 13 load test', session_date: '2026-08-27', status: 'missing' }),
	checkIn({ session_id: 'ns-11', session_label: 'Day 11 truss', session_date: '2026-08-25', status: 'filed' }),
	checkIn({ session_id: 'ns-14', session_label: 'Day 14 bridge fit', session_date: '2026-08-31', status: 'scheduled' })
];

/** A manager's view of the same check-ins carries no personal status. */
export const MANAGER_CHECK_INS: ClassCheckIn[] = STUDENT_CHECK_INS.map((c) => ({ ...c, status: null }));

/** The roster the palette's `@` search loads on demand, managers only. */
export const STUDENTS: PaletteStudent[] = [
	{ email: 'ana.reyes@boscotech.net', name: 'Ana Reyes' },
	{ email: 'ben.ortiz@boscotech.net', name: 'Ben Ortiz' },
	{ email: 'chloe.nguyen@boscotech.net', name: 'Chloe Nguyen' }
];

export function itemById(id: string): ClassroomItem | null {
	return ITEMS.find((i) => i.id === id) ?? null;
}
