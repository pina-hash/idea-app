// tests/dom/classroom-standing-mount.test.ts
//
// THE CLASS PAGE'S COUNT, CHIP AND FILTER AGREE WITH THE TO-DO (ledger 0298,
// R14 and R27), MOUNTED.
//
// R14: a student's My Classes card and the to-do said "1 missing" while the
// class page said nothing was missing, because the page counted only the
// check-ins with a stream row of their own and every check-in attached to an
// item (0120) has none. R27: a ported worksheet with every answer in read
// "Missing" because nothing turns one in. Both are wrong numbers on a page
// that otherwise renders perfectly, so this mounts the REAL ClassView as a
// student, with a pinned clock, and reads the three things a student sees --
// the Missing chip's count, the chips on the row, the rows the Missing filter
// keeps -- against the count `buildTodo` gives for the SAME fixture, which is
// what My Classes and the to-do print.
//
// BOTH DIRECTIONS on one fixture: the same material with its check-in FILED
// reads zero missing and the chip says so; the same worksheet unfinished reads
// Missing. No geometry is asserted (happy-dom lays nothing out).

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ClassView from '$lib/classroom/ClassView.svelte';
import type { ClassroomItem, ClassroomSection, StudentWork } from '$lib/classroom/classroom';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import { buildTodo, todoSummary } from '$lib/classroom/todo';
import type { FeedSubmission } from '$lib/classroom/feed';
import { mountInto, type Mounted } from './mount';

const View = ClassView as unknown as Component<Record<string, unknown>>;

const ME = 'ana@boscotech.net';
const CLOCK = { now: '2026-09-25T17:00:00.000Z', today: '2026-09-25' };

const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 5',
	block: 'E',
	teacher_email: 'pina@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'IDEA209H', title: 'Design and Fabrication', active: true }
};

function item(id: string, over: Partial<ClassroomItem>): ClassroomItem {
	return {
		id,
		kind: 'material',
		title: id,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		author_email: 'pina@boscotech.edu',
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: '2026-09-20T00:00:00Z',
		edited_at: null,
		created_at: '2026-09-20T00:00:00Z',
		updated_at: '2026-09-20T00:00:00Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 's-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	} as ClassroomItem;
}

/** The day's material, and yesterday's check-in hanging off it. */
const MATERIAL = item('day-24', { title: 'Day 24: gear trains' });
/** A ported worksheet due two days ago. */
const WORKSHEET = item('ws', { kind: 'assignment', title: 'Gear train worksheet', points: 10, due_at: '2026-09-23T06:59:00.000Z' });

function checkIn(status: ClassCheckIn['status']): ClassCheckIn {
	return {
		session_id: 'ns-24',
		section_id: 's-1',
		unit_number: 3,
		session_date: '2026-09-24',
		session_label: 'Day 24 gear sketches',
		status,
		flag_reason: null,
		item_id: 'day-24'
	};
}

/** What `buildTodo` -- My Classes and the to-do -- says is missing for the same fixture. */
function todoMissing(checkIns: ClassCheckIn[], subs: FeedSubmission[]): number {
	const rows = buildTodo({
		sections: [SECTION],
		items: [MATERIAL, WORKSHEET],
		submissions: subs,
		checkIns,
		myEmail: ME,
		isAdmin: false,
		clock: CLOCK
	});
	return todoSummary(rows, CLOCK.today).missing;
}

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

function mountStudent(checkIns: ClassCheckIn[], work: Record<string, StudentWork>): Mounted {
	const m = mountInto(View, {
		section: SECTION,
		items: [MATERIAL, WORKSHEET],
		canManage: false,
		checkIns,
		work,
		clock: CLOCK,
		basePath: '/classroom'
	});
	mounted.push(m);
	return m;
}

const count = (m: Mounted, status: string) =>
	Number(m.one(`[data-testid="stream-status-${status}"] .find-count`).textContent?.trim());
const chips = (m: Mounted) => m.all('[data-testid="item-check-in-status"]').map((c) => c.textContent?.trim());
const rowTitles = (m: Mounted) => m.all('[data-testid="item-row"] .row-name').map((r) => r.textContent?.trim());
const workChip = (m: Mounted) => m.one('[data-testid="work-status"]').textContent?.trim();

describe('an unfiled check-in hanging off a material (R14)', () => {
	it('the Missing chip counts it, exactly as the to-do does', () => {
		const m = mountStudent([checkIn('missing')], {});
		// The worksheet is missing too (nothing done, past due): 2 on both sides.
		expect(todoMissing([checkIn('missing')], [])).toBe(2);
		expect(count(m, 'missing')).toBe(2);
	});

	it('the material row carries the check-in chip, in the missing tone, with its word', () => {
		const m = mountStudent([checkIn('missing')], {});
		expect(chips(m)).toEqual(['Check-in: Not filed yet']);
		const chip = m.one('[data-testid="item-check-in-status"]');
		expect(chip.classList.contains('tone-missing')).toBe(true);
		expect(chip.getAttribute('data-missing')).toBe('true');
	});

	it('pressing Missing keeps the material, because its check-in is what is missing', async () => {
		const m = mountStudent([checkIn('missing')], {});
		m.one<HTMLButtonElement>('[data-testid="stream-status-missing"]').click();
		await m.settle();
		expect(rowTitles(m)).toEqual(['Day 24: gear trains', 'Gear train worksheet']);
	});

	it('THE OTHER DIRECTION: filed, it is Done -- 1 missing on both sides, and Missing keeps only the worksheet', async () => {
		const m = mountStudent([checkIn('filed')], {});
		expect(todoMissing([checkIn('filed')], [])).toBe(1);
		expect(count(m, 'missing')).toBe(1);
		expect(count(m, 'done')).toBe(1);
		expect(chips(m)).toEqual(['Check-in: Filed']);
		m.one<HTMLButtonElement>('[data-testid="stream-status-missing"]').click();
		await m.settle();
		expect(rowTitles(m)).toEqual(['Gear train worksheet']);
	});
});

describe('a finished ported worksheet (R27)', () => {
	const finished = (at: string): StudentWork => ({ state: 'in-progress', score: null, completedAt: at });

	it('finished before the due instant: "Complete", counted Done, not Missing -- as the to-do counts it', () => {
		const at = '2026-09-22T20:00:00.000Z';
		const m = mountStudent([checkIn('filed')], { ws: finished(at) });
		expect(workChip(m)).toBe('Complete');
		expect(count(m, 'missing')).toBe(0);
		expect(todoMissing([checkIn('filed')], [{ item_id: 'ws', student_email: ME, state: 'draft', completed_at: at }])).toBe(0);
	});

	it('finished after it: "Complete, late", still Done', () => {
		const m = mountStudent([checkIn('filed')], { ws: finished('2026-09-24T20:00:00.000Z') });
		expect(workChip(m)).toBe('Complete, late');
		expect(count(m, 'done')).toBe(2);
	});

	it('THE OTHER DIRECTION: partly answered and past due is Missing, draft saved', () => {
		const m = mountStudent([checkIn('filed')], { ws: { state: 'in-progress', score: null } });
		expect(workChip(m)).toBe('Missing, draft saved');
		expect(count(m, 'missing')).toBe(1);
	});
});
