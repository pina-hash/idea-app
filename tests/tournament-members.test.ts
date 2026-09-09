// tests/tournament-members.test.ts
//
// THE ENTRY MODEL'S CLIENT ARITHMETIC (prompt 0110, items 3, 6 and 7), and
// the one-implementation rule around "my entry".
//
// 0192 makes an entry one or more people and pays every one of them, which
// changes three things a client computes: what a reward FIGURE means (an
// award is now several rows, each for the full amount), who "my entry" is (a
// teammate has no entries.user_id of their own), and which lane a tournament
// sits in on the board. Every helper here is pure, so every claim is a
// fixture and an expected value written down BEFORE the call -- and the
// reward fixture carries a legacy solo whose answer must be byte-identical
// to the pre-0192 one, because a fold that changed an old ledger's figure
// would be the regression nobody notices.
//
// THE SOURCE SWEEP at the end reddens when a route grows its own copy of
// "my entry" back (`e.user_id === claims.sub`), which after 0192 is WRONG
// for a teammate rather than merely duplicated. It carries a positive
// control: the exact string the old route used, matched by the same regex.
//
// What is deliberately NOT here is anything mounted: the board's lane order
// in the DOM and the team panel's controls are
// `tests/dom/tournament-board-mount.test.ts` and
// `tests/dom/tournament-team-panel-mount.test.ts`; geometry is
// `npm run verify:browser`'s.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	BOARD_LANE_LABELS,
	BOARD_LANE_ORDER,
	ROSTER_PAGE_SIZE,
	boardLane,
	boardLanes,
	rosterWindow
} from '$lib/tournaments/live';
import {
	TEAM_SIZE_MAX,
	entriesLocked,
	entryIsFull,
	entryLedgerRun,
	memberMap,
	memberNames,
	myEntryFor,
	parseConfig,
	rewardAwards,
	rewardTotals,
	type RewardLedgerRow,
	type Tournament,
	type TournamentEntry,
	type TournamentEntryMember,
	type TournamentStatus
} from '$lib/tournaments/tournaments';

const ROOT = join(__dirname, '..');

function entry(over: Partial<TournamentEntry> & Pick<TournamentEntry, 'id'>): TournamentEntry {
	return {
		tournament_id: 't',
		user_id: null,
		display_name: over.id,
		description: '',
		thumbnail_url: null,
		seed: null,
		created_at: '2026-09-01T00:00:00Z',
		...over
	};
}

function member(
	over: Partial<TournamentEntryMember> & Pick<TournamentEntryMember, 'id' | 'entry_id'>
): TournamentEntryMember {
	return {
		tournament_id: 't',
		user_id: null,
		name: over.id,
		created_at: '2026-09-01T00:00:00Z',
		...over
	};
}

function tournament(over: Partial<Tournament> & Pick<Tournament, 'id' | 'status'>): Tournament {
	return {
		name: over.id,
		description: '',
		config: {},
		champion_entry_id: null,
		created_by: null,
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-01T00:00:00Z',
		...over
	};
}

describe('parseConfig reads team_size as a whole number 1..6, else 1', () => {
	it('keeps 1, 3 and 6 and reads everything else as solo', () => {
		expect(TEAM_SIZE_MAX).toBe(6);
		expect(parseConfig({ team_size: 1 }).team_size).toBe(1);
		expect(parseConfig({ team_size: 3 }).team_size).toBe(3);
		expect(parseConfig({ team_size: 6 }).team_size).toBe(6);
		// The bad values, one per shape the column could hold by accident.
		expect(parseConfig({}).team_size).toBe(1);
		expect(parseConfig(null).team_size).toBe(1);
		expect(parseConfig({ team_size: 0 }).team_size).toBe(1);
		expect(parseConfig({ team_size: 7 }).team_size).toBe(1);
		expect(parseConfig({ team_size: -2 }).team_size).toBe(1);
		expect(parseConfig({ team_size: 2.5 }).team_size).toBe(1);
		expect(parseConfig({ team_size: '3' }).team_size).toBe(1);
		expect(parseConfig({ team_size: Number.NaN }).team_size).toBe(1);
	});

	it('leaves the other four keys exactly as before', () => {
		const c = parseConfig({ quals_enabled: true, best_of_default: 3, best_of: { winners: 5 } });
		expect(c).toEqual({
			quals_enabled: true,
			score_entry: false,
			best_of_default: 3,
			best_of: { winners: 5 },
			team_size: 1
		});
	});
});

describe('memberMap and memberNames', () => {
	it('groups by entry and orders by created_at then id', () => {
		const rows = [
			member({ id: 'z', entry_id: 'A', created_at: '2026-09-01T00:00:01Z', name: 'Third' }),
			member({ id: 'b', entry_id: 'A', created_at: '2026-09-01T00:00:00Z', name: 'Second' }),
			member({ id: 'a', entry_id: 'A', created_at: '2026-09-01T00:00:00Z', name: 'First' }),
			member({ id: 'q', entry_id: 'B', name: 'Only' })
		];
		const map = memberMap(rows);
		expect(Object.keys(map).sort()).toEqual(['A', 'B']);
		expect(map.A.map((m) => m.name)).toEqual(['First', 'Second', 'Third']);
		expect(memberNames(map.A)).toEqual(['First', 'Second', 'Third']);
		expect(memberNames(map.B)).toEqual(['Only']);
		expect(memberNames(map.C)).toEqual([]);
		expect(memberNames(undefined)).toEqual([]);
	});

	it('entryIsFull compares the count against the size, floor 1', () => {
		expect(entryIsFull(1, 1)).toBe(true);
		expect(entryIsFull(1, 2)).toBe(false);
		expect(entryIsFull(2, 2)).toBe(true);
		expect(entryIsFull(3, 2)).toBe(true);
		expect(entryIsFull(0, 1)).toBe(false);
		// A malformed size reads as solo, exactly as parseConfig reads it.
		expect(entryIsFull(1, 0)).toBe(true);
	});
});

describe('myEntryFor: membership first, then the captain column, then null', () => {
	const entries = [entry({ id: 'A', user_id: 'u1' }), entry({ id: 'B', user_id: 'u2' })];

	it('answers the entry a teammate is a MEMBER of, over one that names them as captain', () => {
		// u1 registered A but is a member row on B: after 0192 the member row
		// is the truth (the DB refuses one account on two entries, so this
		// fixture is the deployment-between shape, kept so the order is pinned).
		const members = [member({ id: 'm1', entry_id: 'B', user_id: 'u1' })];
		expect(myEntryFor(entries, members, 'u1')?.id).toBe('B');
	});

	it('falls back to entries.user_id for a row with no member row', () => {
		expect(myEntryFor(entries, [], 'u1')?.id).toBe('A');
		expect(myEntryFor(entries, [], 'u2')?.id).toBe('B');
	});

	it('answers null for nobody, an unknown account, or a member of a missing entry', () => {
		expect(myEntryFor(entries, [], null)).toBeNull();
		expect(myEntryFor(entries, [], undefined)).toBeNull();
		expect(myEntryFor(entries, [], 'u9')).toBeNull();
		const orphan = [member({ id: 'm2', entry_id: 'GONE', user_id: 'u3' })];
		expect(myEntryFor(entries, orphan, 'u3')).toBeNull();
	});
});

describe('entriesLocked: the one client spelling of 0192 "not started"', () => {
	it('is false through draft, registration and seeding and true from live on', () => {
		const expected: Record<TournamentStatus, boolean> = {
			draft: false,
			registration_open: false,
			seeding: false,
			live: true,
			complete: true
		};
		for (const [status, locked] of Object.entries(expected)) {
			expect(entriesLocked(status as TournamentStatus), status).toBe(locked);
		}
		expect(Object.keys(expected)).toHaveLength(5);
	});
});

// ---------------------------------------------------------------------------
// Rewards: one award, however many rows paid it.
// ---------------------------------------------------------------------------

function row(over: Partial<RewardLedgerRow> & Pick<RewardLedgerRow, 'id' | 'entry_id'>): RewardLedgerRow {
	return {
		tournament_id: 't',
		user_id: null,
		amount: 10,
		reason: 'Match win',
		match_id: 'm1',
		awarded_at: `2026-09-01T00:00:${String(over.id).padStart(2, '0')}Z`,
		...over
	};
}

/** A team of two with three awards, beside a legacy solo written before 0192. */
const LEDGER: RewardLedgerRow[] = [
	// award 1: match m1, win 10, two rows (one per member)
	row({ id: 1, entry_id: 'team', match_id: 'm1', user_id: 'a', member_id: 'ma' }),
	row({ id: 2, entry_id: 'team', match_id: 'm1', user_id: null, member_id: 'mb' }),
	// the solo's own m2 win, one legacy row
	row({ id: 3, entry_id: 'solo', match_id: 'm2', user_id: 's', member_id: null }),
	// award 2: match m3, win 10, two rows
	row({ id: 4, entry_id: 'team', match_id: 'm3', user_id: 'a', member_id: 'ma' }),
	row({ id: 5, entry_id: 'team', match_id: 'm3', user_id: null, member_id: 'mb' }),
	// award 3: placement, 25 each, two rows (match_id null)
	row({ id: 6, entry_id: 'team', match_id: null, reason: '1st place', amount: 25, member_id: 'ma' }),
	row({ id: 7, entry_id: 'team', match_id: null, reason: '1st place', amount: 25, member_id: 'mb' }),
	// the solo's placement, one legacy row
	row({ id: 8, entry_id: 'solo', match_id: null, reason: '2nd place', amount: 15, member_id: null })
];

/** What the pre-0192 `rewardTotals` answered: a plain sum over rows. */
function legacyTotals(ledger: RewardLedgerRow[]): Record<string, { total: number; awards: number }> {
	const out: Record<string, { total: number; awards: number }> = {};
	for (const r of ledger) {
		out[r.entry_id] ??= { total: 0, awards: 0 };
		out[r.entry_id].total += r.amount;
		out[r.entry_id].awards += 1;
	}
	return out;
}

describe('rewardAwards folds the rows of one award and keeps a legacy row as one award', () => {
	it('answers 3 awards for the team (recipients 2) and 2 for the solo (recipients 1)', () => {
		const awards = rewardAwards(LEDGER);
		expect(awards.map((a) => [a.entryId, a.firstId, a.amount, a.recipients])).toEqual([
			['team', 1, 10, 2],
			['solo', 3, 10, 1],
			['team', 4, 10, 2],
			['team', 6, 25, 2],
			['solo', 8, 15, 1]
		]);
		// The award carries the FIRST row's stamp, whatever order the rows came in.
		const shuffled = [...LEDGER].reverse();
		expect(rewardAwards(shuffled)).toEqual(awards);
	});
});

describe('rewardTotals over awards', () => {
	it('reads the team at 45 per person across 3 awards, recipients 2', () => {
		const totals = rewardTotals(LEDGER);
		const team = totals.find((t) => t.entryId === 'team');
		expect(team).toEqual({ entryId: 'team', total: 45, awards: 3, recipients: 2 });
		// The figure a row-sum would have shown -- 90, over 6 "awards" -- is
		// exactly the figure this exists to stop.
		expect(legacyTotals(LEDGER).team).toEqual({ total: 90, awards: 6 });
	});

	it('reads the legacy solo identically to the pre-0192 answer, recipients 1', () => {
		const solo = rewardTotals(LEDGER).find((t) => t.entryId === 'solo');
		const legacy = legacyTotals(LEDGER).solo;
		expect(solo).toEqual({ entryId: 'solo', total: legacy.total, awards: legacy.awards, recipients: 1 });
		expect(solo?.total).toBe(25);
	});

	it('sorts largest first, then by entry id, as before', () => {
		expect(rewardTotals(LEDGER).map((t) => t.entryId)).toEqual(['team', 'solo']);
		const tie = [row({ id: 1, entry_id: 'b', amount: 5 }), row({ id: 2, entry_id: 'a', amount: 5 })];
		expect(rewardTotals(tie).map((t) => t.entryId)).toEqual(['a', 'b']);
	});
});

describe('entryLedgerRun: per-person running totals over awards, oldest first', () => {
	it('runs the team 10, 20, 45 with recipients 2 on every row', () => {
		const run = entryLedgerRun('team', LEDGER);
		expect(run.map((r) => [r.firstId, r.amount, r.runningTotal, r.recipients])).toEqual([
			[1, 10, 10, 2],
			[4, 10, 20, 2],
			[6, 25, 45, 2]
		]);
		expect(run[2].matchId).toBeNull();
		expect(run[0].matchId).toBe('m1');
	});

	it('runs the solo 10, 25 with recipients 1', () => {
		expect(entryLedgerRun('solo', LEDGER).map((r) => [r.runningTotal, r.recipients])).toEqual([
			[10, 1],
			[25, 1]
		]);
		expect(entryLedgerRun('nobody', LEDGER)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// The projector's roster page.
// ---------------------------------------------------------------------------

describe('rosterWindow', () => {
	it('is one empty page for 0 entries', () => {
		expect(rosterWindow(0, 0)).toEqual({ start: 0, end: 0, page: 0, pages: 1 });
		expect(rosterWindow(0, 5)).toEqual({ start: 0, end: 0, page: 0, pages: 1 });
	});

	it('is one page for 7 and for exactly 8, whatever the tick', () => {
		expect(ROSTER_PAGE_SIZE).toBe(8);
		for (const tick of [0, 1, 2, 9]) {
			expect(rosterWindow(7, tick)).toEqual({ start: 0, end: 7, page: 0, pages: 1 });
			expect(rosterWindow(8, tick)).toEqual({ start: 0, end: 8, page: 0, pages: 1 });
		}
	});

	it('pages 22 entries as 8, 8, 6 and wraps in both directions', () => {
		expect(rosterWindow(22, 0)).toEqual({ start: 0, end: 8, page: 0, pages: 3 });
		expect(rosterWindow(22, 1)).toEqual({ start: 8, end: 16, page: 1, pages: 3 });
		expect(rosterWindow(22, 2)).toEqual({ start: 16, end: 22, page: 2, pages: 3 });
		expect(rosterWindow(22, 3)).toEqual(rosterWindow(22, 0));
		// ArrowLeft from the first page lands on the last.
		expect(rosterWindow(22, -1)).toEqual(rosterWindow(22, 2));
		// Every entry is on exactly one page.
		const seen = new Set<number>();
		for (let tick = 0; tick < 3; tick++) {
			const w = rosterWindow(22, tick);
			for (let i = w.start; i < w.end; i++) seen.add(i);
		}
		expect(seen.size).toBe(22);
	});

	it('takes a page size, floored at 1', () => {
		expect(rosterWindow(5, 0, 2)).toEqual({ start: 0, end: 2, page: 0, pages: 3 });
		expect(rosterWindow(5, 0, 0).pages).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// The arena board's lanes.
// ---------------------------------------------------------------------------

describe('boardLane and boardLanes', () => {
	it('maps the five statuses onto four lanes', () => {
		expect(boardLane('live')).toBe('live');
		expect(boardLane('registration_open')).toBe('open');
		expect(boardLane('draft')).toBe('upcoming');
		expect(boardLane('seeding')).toBe('upcoming');
		expect(boardLane('complete')).toBe('finished');
		expect(BOARD_LANE_ORDER).toEqual(['live', 'open', 'upcoming', 'finished']);
		expect(Object.keys(BOARD_LANE_LABELS).sort()).toEqual([...BOARD_LANE_ORDER].sort());
		for (const label of Object.values(BOARD_LANE_LABELS)) expect(label.length).toBeGreaterThan(0);
	});

	it('orders live and finished by updated_at desc, open and upcoming by created_at desc', () => {
		const rows: Tournament[] = [
			tournament({ id: 'live-old', status: 'live', updated_at: '2026-09-01T10:00:00Z' }),
			tournament({ id: 'live-new', status: 'live', updated_at: '2026-09-01T12:00:00Z' }),
			tournament({ id: 'open-old', status: 'registration_open', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-09-09T00:00:00Z' }),
			tournament({ id: 'open-new', status: 'registration_open', created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z' }),
			tournament({ id: 'draft', status: 'draft', created_at: '2026-08-05T00:00:00Z' }),
			tournament({ id: 'seeding', status: 'seeding', created_at: '2026-08-10T00:00:00Z' }),
			tournament({ id: 'done-old', status: 'complete', updated_at: '2026-07-01T00:00:00Z' }),
			tournament({ id: 'done-new', status: 'complete', updated_at: '2026-08-01T00:00:00Z' })
		];
		const lanes = boardLanes(rows);
		expect(lanes.live.map((t) => t.id)).toEqual(['live-new', 'live-old']);
		// open-old was UPDATED most recently but CREATED earlier: created wins.
		expect(lanes.open.map((t) => t.id)).toEqual(['open-new', 'open-old']);
		expect(lanes.upcoming.map((t) => t.id)).toEqual(['seeding', 'draft']);
		expect(lanes.finished.map((t) => t.id)).toEqual(['done-new', 'done-old']);
		// Every input landed in exactly one lane.
		const all = [...lanes.live, ...lanes.open, ...lanes.upcoming, ...lanes.finished];
		expect(all.map((t) => t.id).sort()).toEqual(rows.map((t) => t.id).sort());
	});

	it('answers every lane key, empty, for no tournaments', () => {
		expect(boardLanes([])).toEqual({ live: [], open: [], upcoming: [], finished: [] });
	});
});

// ---------------------------------------------------------------------------
// THE SOURCE SWEEP: nothing under the tournament routes or the tournament
// library computes "my entry" by comparing an entry's user_id against the
// session claims. After 0192 that is the wrong answer for a teammate, and
// `myEntryFor` is the one implementation.
// ---------------------------------------------------------------------------

const MY_ENTRY_INLINE = /user_id\s*===\s*(?:data\.)?claims/;

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(ts|svelte)$/.test(name)) out.push(full);
	}
	return out;
}

describe('no tournament surface computes "my entry" inline against the claims', () => {
	it('matches the exact form the route used to carry (positive control)', () => {
		expect(MY_ENTRY_INLINE.test('entries.find((e) => e.user_id === claims.sub)')).toBe(true);
		expect(MY_ENTRY_INLINE.test('e.user_id === data.claims.sub')).toBe(true);
		// And leaves the one implementation alone.
		expect(MY_ENTRY_INLINE.test('entries.find((e) => e.user_id === userId)')).toBe(false);
	});

	it('finds 0 hits across src/routes/tournaments and src/lib/tournaments', () => {
		const files = [
			...walk(join(ROOT, 'src/routes/tournaments')),
			...walk(join(ROOT, 'src/lib/tournaments'))
		];
		expect(files.length).toBeGreaterThan(10);
		const hits = files
			.filter((f) => MY_ENTRY_INLINE.test(readFileSync(f, 'utf8')))
			.map((f) => f.slice(ROOT.length + 1));
		expect(hits).toEqual([]);
	});
});
