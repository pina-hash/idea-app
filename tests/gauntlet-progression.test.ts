// tests/gauntlet-progression.test.ts
//
// THE PROGRESSION MODEL IS ARITHMETIC NOBODY CAN AUDIT FROM THE SCREEN.
//
// A student sees "12 day streak", "Level 4 Machinist", "+135 XP" and a row of
// badges. There is no second place any of those is written down, no ledger to
// reconcile against, and no way for the person reading them to tell a correct
// figure from a wrong one -- which is the whole definition of a regression that
// fails silently. `svelte-check` types every function here and constrains none
// of the numbers; the browser pass can see that a streak RENDERS and not that
// it is right.
//
// WHAT IS PINNED IS THE STATED RULE, NOT THE IMPLEMENTATION. progression.ts's
// own header is the specification -- "everything is distinct-based (no grind
// farming), the streak has a gentle one-missed-day grace instead of a punitive
// reset", and "level n starts at 120 * (n-1)^2 XP" -- and every expected value
// below is derived from those sentences or from the calendar, never by running
// the code and writing down what came back. The level ladder in particular is
// recomputed here by counting UP through the curve, not by the square root the
// implementation uses, so an algebra slip in either one cannot agree with the
// other.
//
// THE GRACE IS THE PART THAT WILL BE "SIMPLIFIED". `walkStreak` forgives a gap
// of 2 day-numbers (one missed day) and breaks on 3, and the natural-looking
// tidy-up -- forgiving any gap, or none -- is a one-character change to `gap >
// 2`. Both directions are pinned, with a case either side of the boundary.

import { describe, expect, it } from 'vitest';

import {
	BADGES,
	XP_PER_ATTEMPT,
	XP_PER_CLEAR,
	XP_PER_PRACTICE_DAY,
	computeStreak,
	levelFromXp,
	xpForRun,
	xpFromProgression,
	type ProgressionPayload,
	type StreakInfo
} from '../src/lib/gauntlet/progression';

/** A payload with nothing in it, so each test states only what it is about. */
const emptyPayload = (over: Partial<ProgressionPayload> = {}): ProgressionPayload => ({
	attempted_ids: [],
	cleared_ids: [],
	per_mode: {},
	practice_days: [],
	today: '2026-08-29',
	macro_clears: 0,
	sub_par_clears: 0,
	dead_on: false,
	...over
});

const noStreak: StreakInfo = { current: 0, best: 0, state: 'none', hint: '' };

// ---------------------------------------------------------------------------
// Streak: the one-missed-day grace
// ---------------------------------------------------------------------------
describe('the streak forgives one missed day and breaks on two', () => {
	it('counts a run of consecutive days', () => {
		const s = computeStreak(['2026-08-29', '2026-08-28', '2026-08-27'], '2026-08-29');
		expect(s.current).toBe(3);
		expect(s.state).toBe('active');
	});

	it('a SINGLE missed day inside the run does not break it', () => {
		// 29, (28 missed), 27, 26 -- the header's "gentle restore window",
		// applied mid-run rather than only at the head.
		const s = computeStreak(['2026-08-29', '2026-08-27', '2026-08-26'], '2026-08-29');
		expect(s.current).toBe(3);
	});

	it('TWO missed days in a row DOES break it, and the boundary is exactly there', () => {
		// 29, (28 and 27 missed), 26, 25. The run stops at 29; the older pair
		// is a separate, earlier run of 2 -- which is what `best` reports.
		const s = computeStreak(['2026-08-29', '2026-08-26', '2026-08-25'], '2026-08-29');
		expect(s.current).toBe(1);
		expect(s.best).toBe(2);
	});

	it('is distinct-based: the same day listed three times is one day', () => {
		// "no grind farming". A student who practises three times on Tuesday
		// has practised on one day.
		const s = computeStreak(
			['2026-08-29', '2026-08-29', '2026-08-29', '2026-08-28'],
			'2026-08-29'
		);
		expect(s.current).toBe(2);
	});

	it('reports the best run ever, not merely the current one', () => {
		// A 4-day run in the past, a 1-day run now, three days apart.
		const s = computeStreak(
			['2026-08-29', '2026-08-20', '2026-08-19', '2026-08-18', '2026-08-17'],
			'2026-08-29'
		);
		expect(s.current).toBe(1);
		expect(s.best).toBe(4);
	});

	it('an unsorted list is answered the same as a sorted one', () => {
		// The RPC documents newest-first; a reader must not depend on it.
		const sorted = computeStreak(['2026-08-29', '2026-08-28', '2026-08-27'], '2026-08-29');
		const shuffled = computeStreak(['2026-08-27', '2026-08-29', '2026-08-28'], '2026-08-29');
		expect(shuffled).toEqual(sorted);
	});

	it('answers none for an empty history', () => {
		expect(computeStreak([], '2026-08-29')).toEqual(noStreak);
	});
});

describe('the four streak states, keyed on how long since the last practice day', () => {
	const days = ['2026-08-27', '2026-08-26', '2026-08-25'];

	it('practised today: active, and the streak is safe', () => {
		const s = computeStreak(days, '2026-08-27');
		expect(s.state).toBe('active');
		expect(s.current).toBe(3);
		expect(s.hint).toContain('safe');
	});

	it('one day since: alive, and the streak is still intact', () => {
		const s = computeStreak(days, '2026-08-28');
		expect(s.state).toBe('alive');
		expect(s.current).toBe(3);
	});

	it('two days since: restore, the last day the grace can be spent', () => {
		const s = computeStreak(days, '2026-08-29');
		expect(s.state).toBe('restore');
		expect(s.current).toBe(3);
	});

	it('three days since: gone, and the current count goes to ZERO rather than staying up', () => {
		// The state and the number have to agree. A `state: 'none'` beside a
		// `current: 3` is a broken streak still being displayed as a live one.
		const s = computeStreak(days, '2026-08-30');
		expect(s.state).toBe('none');
		expect(s.current).toBe(0);
		expect(s.best).toBe(3);
		expect(s.hint).toBe('');
	});
});

describe('the day arithmetic is calendar arithmetic', () => {
	// `dayNumber` anchors each date at NOON UTC, which is what keeps a day from
	// landing either side of a boundary. These three are the cases where a
	// naive difference goes wrong, and the expected answer is the calendar's,
	// not the code's.
	it('spans a month boundary', () => {
		expect(computeStreak(['2026-09-01', '2026-08-31', '2026-08-30'], '2026-09-01').current).toBe(3);
	});

	it('spans a year boundary', () => {
		expect(computeStreak(['2027-01-01', '2026-12-31', '2026-12-30'], '2027-01-01').current).toBe(3);
	});

	it('spans a US daylight-saving transition (2026-03-08) as three ordinary days', () => {
		// A local-midnight anchor turns one of these gaps into 23 or 25 hours,
		// which floors to a different day number and silently eats a streak.
		expect(computeStreak(['2026-03-09', '2026-03-08', '2026-03-07'], '2026-03-09').current).toBe(3);
	});

	it('spans a leap day', () => {
		expect(computeStreak(['2028-03-01', '2028-02-29', '2028-02-28'], '2028-03-01').current).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// XP and levels
// ---------------------------------------------------------------------------
describe('XP is distinct-based and a run banks each milestone once', () => {
	it('sums attempts, clears and practice days', () => {
		const p = emptyPayload({
			attempted_ids: ['a', 'b'],
			cleared_ids: ['a'],
			practice_days: ['2026-08-29', '2026-08-28']
		});
		expect(xpFromProgression(p)).toBe(2 * XP_PER_ATTEMPT + XP_PER_CLEAR + 2 * XP_PER_PRACTICE_DAY);
	});

	it('a first attempt that is also a first clear banks both', () => {
		expect(xpForRun(true, true)).toBe(XP_PER_ATTEMPT + XP_PER_CLEAR);
	});

	it('a repeat run of an already-cleared challenge banks nothing', () => {
		// This is the number RunResults turns into "Already banked for this
		// one" rather than "+0 XP" -- asserted as rendered markup in the
		// browser pass, asserted as arithmetic here.
		expect(xpForRun(false, false)).toBe(0);
	});

	it('a first clear on a challenge already attempted banks only the clear', () => {
		expect(xpForRun(false, true)).toBe(XP_PER_CLEAR);
	});

	it('a first attempt that did not clear banks only the attempt', () => {
		expect(xpForRun(true, false)).toBe(XP_PER_ATTEMPT);
	});
});

describe('the level curve is quadratic and every level has a name', () => {
	/**
	 * The expected level, counted UP through the documented curve rather than
	 * inverted with a square root. Two independent routes to the same number:
	 * an algebra slip in either cannot agree with the other.
	 */
	const expectedLevel = (xp: number) => {
		let n = 1;
		while (120 * n ** 2 <= xp) n += 1;
		return n;
	};

	it('level n starts at 120 * (n-1)^2, checked either side of every boundary to level 12', () => {
		for (let n = 1; n <= 12; n++) {
			const floor = 120 * (n - 1) ** 2;
			expect(levelFromXp(floor).level, `xp ${floor} should be exactly level ${n}`).toBe(n);
			if (floor > 0) {
				expect(levelFromXp(floor - 1).level, `xp ${floor - 1} should still be level ${n - 1}`).toBe(n - 1);
			}
		}
	});

	it('agrees with a count-up over the whole first eight levels', () => {
		let checked = 0;
		for (let xp = 0; xp <= 8000; xp += 17) {
			expect(levelFromXp(xp).level, `xp ${xp}`).toBe(expectedLevel(xp));
			checked += 1;
		}
		// The sweep's own case count, so a loop that generated nothing cannot
		// pass by being empty.
		expect(checked).toBe(471);
	});

	it('zero XP is level 1, not level 0', () => {
		const l = levelFromXp(0);
		expect(l.level).toBe(1);
		expect(l.name).toBe('Trainee');
		expect(l.progress).toBe(0);
	});

	it('progress is 0 at a floor and approaches 1 below the next ceiling', () => {
		expect(levelFromXp(480).progress).toBe(0); // level 3 floor: 120 * 2^2
		expect(levelFromXp(1079).progress).toBeGreaterThan(0.99); // one below 120 * 3^2
		expect(levelFromXp(1079).level).toBe(3);
	});

	it('NAMES every level past the end of the name list rather than reading off the end', () => {
		// `LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length) - 1]` clamps. Drop
		// the clamp and a student who got past the eighth level is shown
		// `undefined` on their own profile -- the one reader guaranteed to be
		// looking, and the one case a developer never reaches by hand.
		for (const xp of [120 * 49, 120 * 100, 120 * 400, 1_000_000]) {
			const l = levelFromXp(xp);
			expect(l.level).toBeGreaterThanOrEqual(8);
			expect(typeof l.name).toBe('string');
			expect(l.name).toBe('Grandmaster');
		}
	});
});

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------
describe('badges are recomputed from the aggregates and never stored', () => {
	const earned = (p: ProgressionPayload, s: StreakInfo = noStreak) =>
		BADGES.filter((b) => b.earned(p, s)).map((b) => b.id);

	it('an empty history earns nothing', () => {
		expect(earned(emptyPayload())).toEqual([]);
	});

	it('every badge has a unique id and a distinct name', () => {
		expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
		expect(new Set(BADGES.map((b) => b.name)).size).toBe(BADGES.length);
	});

	it('SERIES COMPLETE is refused for a mode with nothing published in it', () => {
		// THE `total > 0` GUARD IS THE WHOLE BADGE. A mode with no published
		// challenges satisfies `cleared >= total` trivially (0 >= 0), so
		// without it every student on the site is awarded "clear every
		// published challenge in one mode" on their first page load -- and
		// CLAUDE.md is explicit that an empty mode is a legitimate state, not
		// a bug to be fixed out from under this.
		const emptyMode = emptyPayload({
			per_mode: { gdt_tolerance: { total: 0, attempted: 0, cleared: 0 } }
		});
		expect(earned(emptyMode)).not.toContain('series-complete');
	});

	it('SERIES COMPLETE is awarded when a real series is finished (the positive control)', () => {
		const done = emptyPayload({
			per_mode: { gdt_tolerance: { total: 4, attempted: 4, cleared: 4 } }
		});
		expect(earned(done)).toContain('series-complete');
	});

	it('CROSS-TRAINED needs four modes ATTEMPTED, and three is not four', () => {
		const three = emptyPayload({
			per_mode: {
				speedrun: { total: 2, attempted: 1, cleared: 0 },
				feature_golf: { total: 2, attempted: 1, cleared: 0 },
				gdt_tolerance: { total: 2, attempted: 1, cleared: 0 }
			}
		});
		expect(earned(three)).not.toContain('cross-trained');

		const four = emptyPayload({
			per_mode: {
				...three.per_mode,
				spot_the_error: { total: 2, attempted: 1, cleared: 0 }
			}
		});
		expect(earned(four)).toContain('cross-trained');
	});

	it('a mode PRESENT but never attempted does not count toward cross-training', () => {
		const listedNotPlayed = emptyPayload({
			per_mode: {
				speedrun: { total: 2, attempted: 1, cleared: 0 },
				feature_golf: { total: 2, attempted: 1, cleared: 0 },
				gdt_tolerance: { total: 2, attempted: 1, cleared: 0 },
				spot_the_error: { total: 2, attempted: 0, cleared: 0 },
				drawing_reading: { total: 2, attempted: 0, cleared: 0 }
			}
		});
		expect(earned(listedNotPlayed)).not.toContain('cross-trained');
	});

	it('the streak badges read BEST, not current, so a broken streak does not revoke one', () => {
		// A badge is a thing you earned. `best` is monotonic; `current` is not,
		// and keying on it would take a badge back off a student's profile the
		// day they missed three days.
		const broken: StreakInfo = { current: 0, best: 7, state: 'none', hint: '' };
		const ids = earned(emptyPayload(), broken);
		expect(ids).toContain('streak-3');
		expect(ids).toContain('streak-7');
		expect(ids).not.toContain('streak-14');
	});

	it('the machine-verified and under-par badges key on their own counters', () => {
		expect(earned(emptyPayload({ macro_clears: 1 }))).toContain('machine-verified');
		expect(earned(emptyPayload({ sub_par_clears: 1 }))).toContain('under-par');
		expect(earned(emptyPayload({ dead_on: true }))).toContain('dead-on');
		// and each is refused without it -- the exclusion beside the control.
		expect(earned(emptyPayload({ macro_clears: 0 }))).not.toContain('machine-verified');
		expect(earned(emptyPayload({ sub_par_clears: 0 }))).not.toContain('under-par');
		expect(earned(emptyPayload({ dead_on: false }))).not.toContain('dead-on');
	});
});
