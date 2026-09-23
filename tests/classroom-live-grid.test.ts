// tests/classroom-live-grid.test.ts
//
// WHO IS WORKING, AT A GLANCE (ledger 0297, package LIVE): the classifier behind
// the live students-by-work grid, at pinned instants.
//
// A wrong state here is invisible in normal use -- a student reading "Working"
// who left ten minutes ago, "Not opened" printed while presence is still
// loading, a manager listed as a student -- so every rule is pinned with the
// case that would break it, and the idle threshold is asserted on both sides of
// its edge. Expected values are written from the fixture's own stamps.

import { describe, expect, it } from 'vitest';
import {
	LIVE_CELL_DISPLAY,
	LIVE_GROUP_ORDER,
	LIVE_IDLE_MS,
	liveCellState,
	liveCells,
	liveCountOf,
	liveGroups,
	liveItemChoices,
	liveTally,
	nextArrivals,
	type LiveCellState
} from '$lib/classroom/live-class/grid';
import { PRESENCE_LIMITS_FALLBACK, type PresencePayload, type PresenceRow } from '$lib/classroom/presence/state';
import type { GradingData, SubmissionRow } from '$lib/classroom/assignment-spec';
import type { ClassroomEnrollment, ClassroomItem } from '$lib/classroom/classroom';

const NOW = Date.parse('2026-09-23T17:30:00Z'); // 10:30 Pacific
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

function row(email: string, o: Partial<PresenceRow> = {}): PresenceRow {
	return {
		student_email: email,
		state: null,
		last_seen_at: ago(10),
		last_input_at: ago(10),
		page_visible: true,
		active_seconds: 100,
		first_seen_at: ago(3600),
		...o
	};
}

function sub(email: string, o: Partial<SubmissionRow> = {}): SubmissionRow {
	return {
		id: `sub-${email}`,
		item_id: 'i-1',
		student_email: email,
		state: 'draft',
		submitted_at: null,
		returned_at: null,
		rubric_scores: null,
		criterion_comments: null,
		score: null,
		teacher_comment: null,
		graded_by: null,
		graded_at: null,
		...o
	};
}

const base = { workArrived: false, presence: 'ready' as const, signal: true, now: NOW, submission: null, row: null };

describe('the idle threshold, and why it is five minutes', () => {
	it('is five minutes: longer than presence calls "working", shorter than a 10-minute activity', () => {
		expect(LIVE_IDLE_MS).toBe(5 * 60_000);
		expect(LIVE_IDLE_MS).toBeGreaterThan(PRESENCE_LIMITS_FALLBACK.inputWindowSeconds * 1000);
		expect(LIVE_IDLE_MS).toBeGreaterThan(PRESENCE_LIMITS_FALLBACK.awayWindowSeconds * 1000);
		expect(LIVE_IDLE_MS).toBeLessThan(10 * 60_000);
	});

	it('typed exactly five minutes ago is still working; one second more is idle', () => {
		const at = liveCellState({ ...base, row: row('a@x', { last_input_at: ago(300) }) });
		expect(at.state).toBe('working');
		const past = liveCellState({ ...base, row: row('a@x', { last_input_at: ago(301) }) });
		expect(past.state).toBe('idle');
		expect(past.detail).toBe('No typing for 5 min');
	});

	it('typing right now reads "Typing"; a tab in the background says so', () => {
		expect(liveCellState({ ...base, row: row('a@x', { last_input_at: ago(3) }) }).detail).toBe('Typing');
		expect(
			liveCellState({ ...base, row: row('a@x', { last_input_at: ago(90), page_visible: false }) }).detail
		).toBe('Typed 1m ago · other tab');
	});

	it('a student who sat down a minute ago is not idle for not having typed since yesterday', () => {
		const yesterday = row('a@x', { last_input_at: ago(86_400), last_seen_at: ago(5) });
		expect(liveCellState({ ...base, row: yesterday }).state).toBe('idle');
		expect(liveCellState({ ...base, row: yesterday, arrivedAt: NOW - 60_000 }).state).toBe('working');
		expect(liveCellState({ ...base, row: yesterday, arrivedAt: NOW - 60_000 }).detail).toBe('Typed yesterday');
		// And the arrival grace runs out on the same threshold.
		expect(liveCellState({ ...base, row: yesterday, arrivedAt: NOW - LIVE_IDLE_MS - 1000 }).state).toBe('idle');
	});

	it('opened and never typed, past the threshold, is idle with no typing yet', () => {
		const c = liveCellState({ ...base, row: row('a@x', { last_input_at: null }), arrivedAt: NOW - 400_000 });
		expect(c).toEqual({ state: 'idle', detail: 'No typing yet' });
	});
});

describe('every state, and the order that decides between them', () => {
	it('no heartbeat for more than the away window is away, with when they were last seen', () => {
		const c = liveCellState({ ...base, row: row('a@x', { last_seen_at: ago(121), last_input_at: ago(121) }) });
		expect(c).toEqual({ state: 'away', detail: 'Last seen 2m ago' });
	});

	it('handed in outranks everything, even a student who left the page', () => {
		const gone = row('a@x', { last_seen_at: ago(900) });
		const handedIn = sub('a@x', { state: 'submitted', submitted_at: ago(600) });
		expect(liveCellState({ ...base, row: gone, submission: handedIn })).toEqual({
			state: 'needs-grading',
			detail: 'Handed in'
		});
		expect(liveCellState({ ...base, row: null, presence: 'pending', submission: handedIn }).state).toBe(
			'needs-grading'
		);
	});

	it('a resubmission after a grade needs grading again; a graded one and a returned one do not', () => {
		const again = sub('a@x', { state: 'submitted', submitted_at: ago(60), graded_at: ago(600) });
		expect(liveCellState({ ...base, submission: again })).toEqual({
			state: 'needs-grading',
			detail: 'Handed in again'
		});
		const graded = sub('a@x', { state: 'submitted', submitted_at: ago(600), graded_at: ago(60) });
		expect(liveCellState({ ...base, submission: graded })).toEqual({ state: 'submitted', detail: 'Graded' });
		expect(liveCellState({ ...base, submission: sub('a@x', { state: 'returned' }) })).toEqual({
			state: 'submitted',
			detail: 'Returned'
		});
	});

	it('a teacher close is its own word, never "Handed in"', () => {
		const closed = sub('a@x', { state: 'submitted', submitted_at: null });
		expect(liveCellState({ ...base, submission: closed })).toEqual({ state: 'submitted', detail: 'Closed' });
	});

	it('a material says No signal for everyone: its page sends no heartbeat', () => {
		expect(liveCellState({ ...base, signal: false, row: row('a@x') }).state).toBe('no-signal');
		expect(liveCellState({ ...base, signal: false }).state).toBe('no-signal');
	});

	it('NOT OPENED IS EARNED: only when presence answered, there is no row, and nothing arrived', () => {
		expect(liveCellState({ ...base }).state).toBe('not-opened');
		// The four ways a row goes missing are four answers, not one.
		expect(liveCellState({ ...base, presence: 'pending' }).state).toBe('unknown');
		expect(liveCellState({ ...base, presence: 'unavailable' }).state).toBe('unknown');
		expect(liveCellState({ ...base, workArrived: true })).toEqual({ state: 'away', detail: 'Draft saved' });
		expect(liveCellState({ ...base, presence: 'stale' }).state).toBe('not-opened');
	});

	it('every state has a word, a glyph and a tone, and the glyphs are all different', () => {
		const states = Object.keys(LIVE_CELL_DISPLAY) as LiveCellState[];
		expect(new Set(states)).toEqual(new Set(LIVE_GROUP_ORDER));
		expect(new Set(states.map((s) => LIVE_CELL_DISPLAY[s].glyph)).size).toBe(states.length);
		for (const s of states) expect(LIVE_CELL_DISPLAY[s].label.length).toBeGreaterThan(2);
		// Stuck first: the groups a teacher acts on lead.
		expect(LIVE_GROUP_ORDER.slice(0, 3)).toEqual(['idle', 'away', 'not-opened']);
	});
});

const ROSTER: ClassroomEnrollment[] = [
	{ section_id: 's-1', student_email: 'ana@x', display_name: 'Ana Reyes', active: true, manages: false },
	{ section_id: 's-1', student_email: 'ben@x', display_name: 'Ben Okafor', active: true, manages: false },
	{ section_id: 's-1', student_email: 'cruz@x', display_name: 'Cruz Delgado', active: true, manages: false },
	{ section_id: 's-1', student_email: 'dee@x', display_name: 'Dee Marsh', active: false, manages: false },
	{ section_id: 's-1', student_email: 'pina@x', display_name: 'Mr. Pina', active: true, manages: true }
];

function payload(rows: PresenceRow[]): PresencePayload {
	return {
		item_id: 'i-1',
		section_id: 's-1',
		at: new Date(NOW).toISOString(),
		limits: PRESENCE_LIMITS_FALLBACK,
		students: rows
	};
}

const ITEM = { kind: 'assignment', due_at: ago(-3600) } as Pick<ClassroomItem, 'kind' | 'due_at'>;

describe('the grid over a roster', () => {
	const grading: GradingData = {
		roster: ROSTER,
		submissions: [sub('ben@x', { state: 'submitted', submitted_at: ago(100) })],
		responses: [],
		files: [],
		approvals: []
	};

	it('a manager enrolled in their own class is never a row; an inactive student is not either', () => {
		const cells = liveCells({
			item: ITEM,
			signal: true,
			grading,
			roster: ROSTER,
			presence: payload([row('ana@x'), row('pina@x')]),
			presenceStatus: 'ready',
			now: NOW
		});
		expect(cells.map((c) => c.email)).toEqual(['ana@x', 'ben@x', 'cruz@x']);
		// Positive control: the manager IS in the payload handed in.
		expect(grading.roster.some((r) => r.student_email === 'pina@x')).toBe(true);
		expect(cells.map((c) => c.state)).toEqual(['working', 'needs-grading', 'not-opened']);
	});

	it('before the hand-in read lands, rows come from the roster with the same exclusion', () => {
		const cells = liveCells({
			item: ITEM,
			signal: true,
			grading: null,
			roster: ROSTER,
			presence: null,
			presenceStatus: 'pending',
			now: NOW
		});
		expect(cells.map((c) => c.name)).toEqual(['Ana Reyes', 'Ben Okafor', 'Cruz Delgado']);
		expect(new Set(cells.map((c) => c.state))).toEqual(new Set(['unknown']));
	});

	it('MISSING IS THE ONE PREDICATE: past due and nothing handed in, whatever presence says', () => {
		const pastDue = { kind: 'assignment', due_at: ago(3600) } as Pick<ClassroomItem, 'kind' | 'due_at'>;
		const cells = liveCells({
			item: pastDue,
			signal: true,
			grading,
			roster: ROSTER,
			presence: payload([row('ana@x')]),
			presenceStatus: 'ready',
			now: NOW
		});
		expect(cells.map((c) => [c.email, c.missing])).toEqual([
			['ana@x', true],
			['ben@x', false],
			['cruz@x', true]
		]);
		// And nothing is missing before the due time.
		const early = liveCells({ item: ITEM, signal: true, grading, roster: ROSTER, presence: null, presenceStatus: 'ready', now: NOW });
		expect(early.filter((c) => c.missing)).toHaveLength(0);
	});

	it('present means on the page right now, which is what the picker draws from', () => {
		const cells = liveCells({
			item: ITEM,
			signal: true,
			grading,
			roster: ROSTER,
			presence: payload([row('ana@x'), row('cruz@x', { last_input_at: ago(900) }), row('ben@x', { last_seen_at: ago(600) })]),
			presenceStatus: 'ready',
			now: NOW
		});
		expect(cells.filter((c) => c.present).map((c) => c.email)).toEqual(['ana@x', 'cruz@x']);
		const tally = liveTally(cells);
		expect(tally).toMatchObject({ working: 1, idle: 1, 'needs-grading': 1, away: 0 });
		expect(liveGroups(cells).map((g) => g.state)).toEqual(['idle', 'working', 'needs-grading']);
	});
});

describe('who arrived while the view was watching', () => {
	it('records nobody on the first read, then only students who were not there before', () => {
		const first = nextArrivals(null, new Map(), new Set(['a', 'b']), 1000);
		expect([...first]).toEqual([]);
		const second = nextArrivals(new Set(['a', 'b']), first, new Set(['a', 'b', 'c']), 2000);
		expect([...second]).toEqual([['c', 2000]]);
		// Kept while present, dropped when gone, fresh when back.
		const third = nextArrivals(new Set(['a', 'b', 'c']), second, new Set(['a', 'c']), 3000);
		expect([...third]).toEqual([['c', 2000]]);
		const fourth = nextArrivals(new Set(['a', 'c']), third, new Set(['a', 'b', 'c']), 4000);
		expect([...fourth].sort()).toEqual([
			['b', 4000],
			['c', 2000]
		]);
	});
});

describe('the class page door counts at the server read instant', () => {
	it('counts rows not away, at the payload time, never the local clock', () => {
		const p = payload([row('a@x'), row('b@x', { last_seen_at: ago(119) }), row('c@x', { last_seen_at: ago(200) })]);
		expect(liveCountOf(p)).toBe(2);
		expect(liveCountOf(null)).toBeNull();
	});
});

describe('which item the grid watches first', () => {
	const TODAY = '2026-09-23';
	function item(o: Partial<ClassroomItem>): ClassroomItem {
		return {
			id: 'x',
			kind: 'assignment',
			title: 'x',
			body: '',
			points: 10,
			due_at: null,
			category: null,
			author_email: 't@x',
			author_name: null,
			published: true,
			pinned: false,
			publish_at: null,
			sort_order: 0,
			first_published_at: '2026-09-01T16:00:00Z',
			edited_at: null,
			created_at: '2026-09-01T16:00:00Z',
			updated_at: '2026-09-01T16:00:00Z',
			links: [],
			attachments: [],
			postings: [],
			...o
		} as ClassroomItem;
	}

	it('due today first, then posted today, then due later, then the rest; materials only if posted today', () => {
		const items = [
			item({ id: 'old', title: 'Old worksheet' }),
			item({ id: 'later', title: 'Due Friday', due_at: '2026-09-25T06:59:00Z' }),
			item({ id: 'posted', title: 'Posted this morning', first_published_at: '2026-09-23T15:00:00Z' }),
			item({ id: 'due', title: 'Due at 11:59 tonight', due_at: '2026-09-24T06:59:00Z' }),
			item({ id: 'draft', title: 'Draft', published: false }),
			item({ id: 'sched', title: 'Opens after lunch', publish_at: '2026-09-23T20:00:00Z' }),
			item({ id: 'reading', kind: 'material', title: 'Reading', first_published_at: '2026-09-23T15:30:00Z' }),
			item({ id: 'old-reading', kind: 'material', title: 'Old reading' })
		];
		const choices = liveItemChoices(items, NOW, TODAY);
		expect(choices.map((c) => c.id)).toEqual(['due', 'posted', 'later', 'old', 'reading']);
		expect(choices.find((c) => c.id === 'reading')?.signal).toBe(false);
		// Positive control: the scheduled item is picked up once it is live.
		expect(liveItemChoices(items, Date.parse('2026-09-23T20:00:01Z'), TODAY).map((c) => c.id)).toContain('sched');
	});
});
