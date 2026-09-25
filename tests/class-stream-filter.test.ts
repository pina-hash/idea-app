// tests/class-stream-filter.test.ts
//
// SEARCH AND FILTER INSIDE ONE CLASS (ledger 0297, report 19): the predicate.
//
// A filter that drops the wrong row is invisible: the page still renders, the
// count still adds up to what is shown, and a student simply never sees the
// assignment that was missing. So every exclusion here is paired with the row
// the same fixture DOES keep, and the counts of both are asserted.
//
// ONE CLOCK, AT AN INSTANT WHERE THE TWO CALENDARS DISAGREE. The loader reads
// `new Date()` once and hands down the instant and its America/Los_Angeles day.
// 8pm Pacific on 2026-08-27 is 03:00 UTC on 2026-08-28 -- the instrument
// CLAUDE.md names for exactly this -- so a UTC day anywhere in the chain would
// call a check-in dated the 27th "missing" on the evening it is still due.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	EMPTY_STREAM_FILTER,
	assignmentStanding,
	checkInPassesFilter,
	checkInStanding,
	itemPassesFilter,
	standingCounts,
	streamFilterActive,
	type ClassroomItem,
	type FilterableCheckIn,
	type StreamFilter,
	type StreamFilterContext,
	type StudentWork
} from '$lib/classroom/classroom';
import { laCalendarDay } from '$lib/classroom/class-check-ins';
import { matchesQuery } from '$lib/shell/search';

const NOW = '2026-08-28T03:00:00.000Z'; // 8pm Pacific, 2026-08-27
const TODAY = laCalendarDay(new Date(NOW));

function item(id: string, over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'assignment',
		title: id,
		body: '',
		body_doc: null,
		points: 10,
		due_at: null,
		category: null,
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		attachments: [],
		links: [],
		postings: [{ section_id: 's-1' }],
		...over
	} as unknown as ClassroomItem;
}

const ITEMS: ClassroomItem[] = [
	// Due 8am Pacific today: past at 8pm, nothing turned in -> missing.
	item('past-due', { title: 'Truss sketch', due_at: '2026-08-27T15:00:00Z', unit_id: 'u-2' }),
	// Due 11:59pm Pacific today: still to do at 8pm.
	item('due-tonight', { title: 'Load test log', due_at: '2026-08-28T06:59:00Z', unit_id: 'u-2' }),
	// Past due but turned in -> done.
	item('turned-in', { title: 'Bridge photos', due_at: '2026-08-20T15:00:00Z', unit_id: 'u-2' }),
	// Returned -> done.
	item('returned', { title: 'Gear ratios', due_at: '2026-08-10T15:00:00Z', unit_id: 'u-1' }),
	// No due date, nothing turned in -> to do.
	item('undated', { title: 'Reflection', category: 'Portfolio', unit_id: 'u-1' }),
	item('handout', { kind: 'material', title: 'Sketching reference', unit_id: 'u-1', attachments: [{ filename: 'orthographic.pdf' }] as never }),
	item('welcome', { kind: 'post', title: 'Welcome' }),
	item('draft', { title: 'Next week lab', published: false, unit_id: 'u-2' })
];

const WORK: Record<string, StudentWork> = {
	'turned-in': { state: 'submitted', score: null },
	returned: { state: 'returned', score: 9 },
	'due-tonight': { state: 'in-progress', score: null }
};

const CHECK_INS: FilterableCheckIn[] = [
	{ session_label: 'Day 12 sketches', session_date: '2026-08-26', unit_number: 2, status: 'missing' },
	{ session_label: 'Day 13 load test', session_date: '2026-08-27', unit_number: 2, status: 'missing' },
	{ session_label: 'Day 11 truss', session_date: '2026-08-25', unit_number: 2, status: 'filed' },
	{ session_label: 'Day 10 draft', session_date: '2026-08-24', unit_number: 2, status: 'draft' },
	{ session_label: 'Day 9 flagged', session_date: '2026-08-21', unit_number: 1, status: 'flagged' },
	{ session_label: 'Day 14 ahead', session_date: '2026-08-31', unit_number: 2, status: 'scheduled' },
	{ session_label: 'Manager view', session_date: '2026-08-20', unit_number: 1, status: null }
];

const ctx: StreamFilterContext = {
	work: WORK,
	now: NOW,
	today: TODAY,
	unitNames: new Map([
		['u-1', 'Unit 1 · Sketching'],
		['u-2', 'Unit 2 · Bridges']
	]),
	matches: matchesQuery
};

const f = (over: Partial<StreamFilter>): StreamFilter => ({ ...EMPTY_STREAM_FILTER, ...over });
const shownItems = (filter: StreamFilter) => ITEMS.filter((i) => itemPassesFilter(i, filter, ctx)).map((i) => i.id);
const shownCheckIns = (filter: StreamFilter) =>
	CHECK_INS.filter((c) => checkInPassesFilter(c, filter, ctx)).map((c) => c.session_label);

describe('the one clock', () => {
	it('the instrument instant is the evening where the two calendars disagree', () => {
		expect(TODAY).toBe('2026-08-27');
		expect(NOW.slice(0, 10)).toBe('2026-08-28');
	});

	it('an assignment is missing once the instant is past its due TIME, not its day', () => {
		expect(assignmentStanding(ITEMS[0], undefined, NOW)).toBe('missing');
		expect(assignmentStanding(ITEMS[1], WORK['due-tonight'], NOW)).toBe('todo');
		// Five hours earlier the same morning deadline is still to do.
		expect(assignmentStanding(ITEMS[0], undefined, '2026-08-27T14:00:00Z')).toBe('todo');
	});

	it('a check-in is adjudicated on its Pacific DATE: the one dated today is still to do at 8pm', () => {
		expect(checkInStanding(CHECK_INS[1], TODAY)).toBe('todo');
		expect(checkInStanding(CHECK_INS[0], TODAY)).toBe('missing');
		// Against the UTC day it would read missing, which is the defect this guards.
		expect(checkInStanding(CHECK_INS[1], NOW.slice(0, 10))).toBe('missing');
	});

	it('the loader reads the clock once and hands the instant and the day down together', () => {
		const loader = readFileSync(join(process.cwd(), 'src/routes/classroom/[sectionId]/+layout.server.ts'), 'utf8');
		// Code lines only: the loader's own comment names the call it forbids.
		const code = loader
			.split('\n')
			.filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
			.join('\n');
		expect(code.match(/new Date\(\)/g) ?? []).toHaveLength(1);
		expect(loader).toMatch(/const today = laCalendarDay\(clockRead\)/);
		expect(loader).toMatch(/classClock: \{ now: clockRead\.toISOString\(\), today \}/);
		const layout = readFileSync(join(process.cwd(), 'src/routes/classroom/[sectionId]/+layout.svelte'), 'utf8');
		expect(layout).toMatch(/clock=\{data\.classClock\}/);
		// And the class page's filter takes the handed-down read, never a clock
		// of its own (the one `new Date()` in that file stamps an export).
		const view = readFileSync(join(process.cwd(), 'src/lib/classroom/ClassView.svelte'), 'utf8');
		expect(view).toMatch(/now: clock\?\.now \?\? ''/);
		expect(view).toMatch(/today: clock\?\.today \?\? ''/);
		expect(view).not.toMatch(/Date\.now\(\)/);
	});
});

describe('standing', () => {
	it('every assignment has one, a material and an announcement have none', () => {
		const standings = Object.fromEntries(ITEMS.map((i) => [i.id, assignmentStanding(i, WORK[i.id], NOW)]));
		expect(standings).toEqual({
			'past-due': 'missing',
			'due-tonight': 'todo',
			'turned-in': 'done',
			returned: 'done',
			undated: 'todo',
			handout: null,
			welcome: null,
			draft: 'todo'
		});
	});

	it('check-ins: filed is done, flagged is to do, scheduled and a manager row stand nowhere', () => {
		expect(CHECK_INS.map((c) => checkInStanding(c, TODAY))).toEqual([
			'missing',
			'todo',
			'done',
			'missing',
			'todo',
			null,
			null
		]);
		for (const status of ['filed', 'awaiting_review', 'excused']) {
			expect(checkInStanding({ status, session_date: '2026-08-01' }, TODAY)).toBe('done');
		}
	});

	it('the chip counts add up from the same rules', () => {
		expect(standingCounts(ITEMS, CHECK_INS, ctx)).toEqual({ todo: 3 + 2, missing: 1 + 2, done: 2 + 1 });
	});
});

describe('the filter, both directions', () => {
	it('nothing set shows everything and says nothing is narrowing', () => {
		expect(streamFilterActive(EMPTY_STREAM_FILTER)).toBe(false);
		expect(shownItems(EMPTY_STREAM_FILTER)).toHaveLength(ITEMS.length);
		expect(shownCheckIns(EMPTY_STREAM_FILTER)).toHaveLength(CHECK_INS.length);
		expect(streamFilterActive(f({ query: '  ' }))).toBe(false);
		expect(streamFilterActive(f({ query: 'x' }))).toBe(true);
		expect(streamFilterActive(f({ kind: 'material' }))).toBe(true);
		expect(streamFilterActive(f({ status: 'todo' }))).toBe(true);
	});

	it('missing keeps the past-due assignment and the check-ins behind today, and nothing else', () => {
		expect(shownItems(f({ status: 'missing' }))).toEqual(['past-due']);
		expect(shownCheckIns(f({ status: 'missing' }))).toEqual(['Day 12 sketches', 'Day 10 draft']);
	});

	it('to do keeps what is still open, the undated assignment included, and drops what is done or missing', () => {
		expect(shownItems(f({ status: 'todo' }))).toEqual(['due-tonight', 'undated', 'draft']);
		expect(shownCheckIns(f({ status: 'todo' }))).toEqual(['Day 13 load test', 'Day 9 flagged']);
	});

	it('done keeps turned in and returned work only', () => {
		expect(shownItems(f({ status: 'done' }))).toEqual(['turned-in', 'returned']);
		expect(shownCheckIns(f({ status: 'done' }))).toEqual(['Day 11 truss']);
	});

	it('a scheduled check-in is in no status and in everything', () => {
		for (const status of ['todo', 'missing', 'done'] as const) {
			expect(shownCheckIns(f({ status }))).not.toContain('Day 14 ahead');
		}
		expect(shownCheckIns(f({}))).toContain('Day 14 ahead');
	});

	it('drafts keeps the unpublished item only, and no check-in', () => {
		expect(shownItems(f({ status: 'drafts' }))).toEqual(['draft']);
		expect(shownCheckIns(f({ status: 'drafts' }))).toEqual([]);
	});

	it('kind narrows to one kind; check-ins are a kind of their own', () => {
		expect(shownItems(f({ kind: 'material' }))).toEqual(['handout']);
		expect(shownItems(f({ kind: 'post' }))).toEqual(['welcome']);
		expect(shownItems(f({ kind: 'assignment' }))).toHaveLength(6);
		expect(shownCheckIns(f({ kind: 'assignment' }))).toEqual([]);
		expect(shownItems(f({ kind: 'check-in' }))).toEqual([]);
		expect(shownCheckIns(f({ kind: 'check-in' }))).toHaveLength(CHECK_INS.length);
	});

	it('the text matches a title, a unit name, a kind word, a category or a file name, with one typo', () => {
		expect(shownItems(f({ query: 'truss' }))).toEqual(['past-due']);
		expect(shownItems(f({ query: 'bridges' }))).toEqual(['past-due', 'due-tonight', 'turned-in', 'draft']);
		expect(shownItems(f({ query: 'portfolio' }))).toEqual(['undated']);
		expect(shownItems(f({ query: 'orthographic' }))).toEqual(['handout']);
		expect(shownItems(f({ query: 'announcement' }))).toEqual(['welcome']);
		expect(shownItems(f({ query: 'refelction' }))).toEqual(['undated']);
		expect(shownItems(f({ query: 'zeppelin' }))).toEqual([]);
		expect(shownCheckIns(f({ query: 'load' }))).toEqual(['Day 13 load test']);
		expect(shownCheckIns(f({ query: 'check-in sketches' }))).toEqual(['Day 12 sketches']);
	});

	it('the three narrow together', () => {
		expect(shownItems(f({ query: 'bridges', status: 'todo', kind: 'assignment' }))).toEqual(['due-tonight', 'draft']);
		expect(shownItems(f({ query: 'bridges', status: 'done' }))).toEqual(['turned-in']);
	});

	it('the filter never reorders: what it keeps comes out in the order it went in', () => {
		const reversed = [...ITEMS].reverse();
		expect(reversed.filter((i) => itemPassesFilter(i, f({ status: 'todo' }), ctx)).map((i) => i.id)).toEqual([
			'draft',
			'undated',
			'due-tonight'
		]);
	});
});

// ---------------------------------------------------------------------------
// A CHECK-IN HANGING OFF AN ITEM (0120) HAS NO ROW OF ITS OWN: the count, the
// chip and the filter find it on its item (ledger 0298, R14). Before, the class
// page counted only check-ins with a stream row, so a past-day check-in on the
// day's material read "1 missing" on My Classes and the to-do and 0 here.
// ---------------------------------------------------------------------------

describe('an attached check-in is counted, chipped and filtered on its item', () => {
	const ATTACHED: FilterableCheckIn = {
		session_label: 'Day 15 gear sketches',
		session_date: '2026-08-26',
		unit_number: 2,
		status: 'missing'
	};
	const FILED: FilterableCheckIn = { ...ATTACHED, session_label: 'Day 16 gear test', status: 'filed' };
	const withAttached = (c: FilterableCheckIn): StreamFilterContext => ({
		...ctx,
		attached: new Map([['handout', [c]]])
	});
	const shownWith = (c: FilterableCheckIn, filter: StreamFilter) =>
		ITEMS.filter((i) => itemPassesFilter(i, filter, withAttached(c))).map((i) => i.id);

	it('the count takes every check-in handed in, attached ones included: one more missing, not one fewer', () => {
		const base = standingCounts(ITEMS, CHECK_INS, ctx);
		expect(standingCounts(ITEMS, [...CHECK_INS, ATTACHED], ctx)).toEqual({ ...base, missing: base.missing + 1 });
	});

	it('Missing keeps the material its missing check-in hangs off, and Done does not (and the reverse for a filed one)', () => {
		expect(shownWith(ATTACHED, f({ status: 'missing' }))).toEqual(['past-due', 'handout']);
		expect(shownWith(ATTACHED, f({ status: 'done' }))).toEqual(['turned-in', 'returned']);
		expect(shownWith(FILED, f({ status: 'done' }))).toEqual(['turned-in', 'returned', 'handout']);
		expect(shownWith(FILED, f({ status: 'missing' }))).toEqual(['past-due']);
	});

	it('with no attached map the material is in no status at all, exactly as before', () => {
		for (const status of ['todo', 'missing', 'done'] as const) {
			expect(shownItems(f({ status }))).not.toContain('handout');
		}
	});

	it('the Check-ins kind keeps the item carrying one, and its label finds it', () => {
		expect(shownWith(ATTACHED, f({ kind: 'check-in' }))).toEqual(['handout']);
		expect(shownWith(ATTACHED, f({ kind: 'check-in', status: 'missing' }))).toEqual(['handout']);
		expect(shownWith(ATTACHED, f({ kind: 'check-in', status: 'done' }))).toEqual([]);
		expect(shownWith(ATTACHED, f({ query: 'gear sketches' }))).toEqual(['handout']);
	});

	it('a finished ported worksheet is Done here too, from the one standing', () => {
		const done: StreamFilterContext = {
			...ctx,
			work: { ...WORK, 'past-due': { state: 'in-progress', score: null, completedAt: '2026-08-27T14:00:00Z' } }
		};
		expect(ITEMS.filter((i) => itemPassesFilter(i, f({ status: 'done' }), done)).map((i) => i.id)).toEqual([
			'past-due',
			'turned-in',
			'returned'
		]);
		expect(ITEMS.filter((i) => itemPassesFilter(i, f({ status: 'missing' }), done)).map((i) => i.id)).toEqual([]);
	});
});
