// tests/classroom-hall-pass-limits.test.ts
//
// THE CLIENT HALF OF 0174'S LIMIT, WHICH IS THE EXPLANATION AND NEVER THE
// BOUNDARY.
//
// `tests/db/classroom-hall-pass-limits.test.ts` proves the database refuses.
// This file proves the two things that would regress silently on the way to a
// student's screen:
//
//   1. THE REFUSAL KEEPS ITS TIME. `cooldown` answers with `retry_at` and the
//      whole point of that instant is that it reaches the sentence. A transport
//      that dropped the field, or a component that called the message builder
//      without it, still renders a plausible sentence -- "wait a few minutes" --
//      and a refusal with no time in it is asked again immediately, in person,
//      which is the behaviour the limit exists to stop.
//   2. THE PAYLOAD STILL NAMES NOBODY. `HallPassStudentState` gained three
//      fields in 0174 and every one of them is about the caller themselves. The
//      type must stay incapable of carrying somebody else's name.
//
// AND THE NUMBERS ARE NOT HERE. Nothing in `src/` may write 10 or 3 down: they
// come off the payload, from `_classroom_hall_pass_limits()`, so the button and
// the refusal behind it cannot disagree. That is swept for below.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
	hallPassAtDailyLimit,
	hallPassBlockedReason,
	hallPassCanOpen,
	hallPassCooldownUntil,
	hallPassLimitSummary,
	hallPassOverrideLabel,
	hallPassRefusalMessage,
	hallPassUsageLine,
	type HallPassManagerState,
	type HallPassStudentState
} from '../src/lib/classroom/hall-pass';

const LIMITS = { cooldown_minutes: 10, daily_limit: 3 };
const NOW = Date.parse('2026-09-02T18:20:00.000Z');

function student(over: Partial<HallPassStudentState> = {}): HallPassStudentState {
	return {
		scope: 'student',
		section_id: 'sec-1',
		taken: false,
		mine: false,
		opened_at: null,
		limits: LIMITS,
		used_today: 0,
		retry_at: null,
		...over
	};
}

describe('the refusal carries its time all the way to the sentence', () => {
	test('a cooldown names the clock time the student may go again', () => {
		const msg = hallPassRefusalMessage('cooldown', {
			retryAt: '2026-09-02T18:30:00.000Z'
		});
		// 18:30 UTC is 11:30 in the school's own zone, which is what a bell
		// schedule on the wall is written in.
		expect(msg).toContain('11:30');
		expect(msg).toContain('again at');
	});

	test('a cooldown with no instant degrades to a true sentence rather than a wrong one', () => {
		// Reachable only if a deployment answers `cooldown` without `retry_at`.
		// It must not invent a time and must not print "undefined".
		const msg = hallPassRefusalMessage('cooldown');
		expect(msg).not.toContain('undefined');
		expect(msg).toContain('Wait a few minutes');
	});

	test('the cap names the number and points at the person who can override it', () => {
		const msg = hallPassRefusalMessage('limit_reached', { limit: 3 });
		expect(msg).toContain('all 3 passes');
		// "No" with no way forward is what sends a student to ask out loud
		// anyway. This says who to ask, and that person really can say yes.
		expect(msg).toContain('Ask your teacher');
	});

	test('0143 and 0144 sentences are untouched', () => {
		expect(hallPassRefusalMessage('taken')).toBe(
			'Someone else has the pass right now. Try again when they are back.'
		);
		expect(hallPassRefusalMessage('already_closed')).toBe(
			'That pass was already signed back in, so nothing was changed.'
		);
		// And they do not start claiming a limit of nought because the detail
		// argument now exists.
		expect(hallPassRefusalMessage('not_open', {})).toBe('Nobody is signed out right now.');
	});

	test('no refusal names a database object, a table or a SQLSTATE', () => {
		const REFUSALS = [
			'taken',
			'already_out',
			'not_a_student',
			'not_open',
			'not_yours',
			'already_closed',
			'cooldown',
			'limit_reached',
			'not_enrolled'
		] as const;
		// The count is asserted so a reason added later cannot slip past this
		// sweep by not being in a list somebody wrote out.
		expect(REFUSALS).toHaveLength(9);
		for (const r of REFUSALS) {
			const msg = hallPassRefusalMessage(r, { retryAt: '2026-09-02T18:30:00.000Z', limit: 3 });
			expect(msg.length).toBeGreaterThan(10);
			expect(msg).not.toMatch(/classroom_hall_pass|pg_|unique|constraint|23505|P0001/i);
		}
	});
});

describe('the control mirrors the limit and never implements it', () => {
	test('an ordinary student may open', () => {
		expect(hallPassCanOpen(student(), NOW)).toBe(true);
		expect(hallPassBlockedReason(student(), NOW)).toBeNull();
	});

	test('a live cooldown closes the control and explains itself with the same sentence', () => {
		const state = student({ retry_at: '2026-09-02T18:30:00.000Z' });
		expect(hallPassCooldownUntil(state, NOW)).toBe('2026-09-02T18:30:00.000Z');
		expect(hallPassCanOpen(state, NOW)).toBe(false);
		// THE SAME BUILDER, so a student who taps anyway reads identical words.
		expect(hallPassBlockedReason(state, NOW)).toBe(
			hallPassRefusalMessage('cooldown', { retryAt: '2026-09-02T18:30:00.000Z' })
		);
	});

	test('a cooldown that has already elapsed does not block', () => {
		// The payload can be up to one poll stale. Blocking on a stale instant
		// would refuse a student the database would have allowed.
		const state = student({ retry_at: '2026-09-02T18:10:00.000Z' });
		expect(hallPassCooldownUntil(state, NOW)).toBeNull();
		expect(hallPassCanOpen(state, NOW)).toBe(true);
	});

	test('the cap closes the control and explains itself', () => {
		const state = student({ used_today: 3 });
		expect(hallPassAtDailyLimit(state)).toBe(true);
		expect(hallPassCanOpen(state, NOW)).toBe(false);
		expect(hallPassBlockedReason(state, NOW)).toContain('all 3 passes');
		// One short is still allowed -- a boundary-off-by-one here would cost a
		// student a pass the database would have given them.
		expect(hallPassCanOpen(student({ used_today: 2 }), NOW)).toBe(true);
	});

	test('a payload with no limits blocks nothing at all', () => {
		// A deployment before 0174 is not enforcing anything, so a control that
		// greyed itself out on a missing number would be refusing a student on
		// behalf of a rule that does not exist.
		const pre = student({ limits: undefined, used_today: undefined, retry_at: undefined });
		expect(hallPassAtDailyLimit(pre)).toBe(false);
		expect(hallPassCanOpen(pre, NOW)).toBe(true);
		expect(hallPassBlockedReason(pre, NOW)).toBeNull();
		expect(hallPassUsageLine(pre)).toBeNull();
		expect(hallPassLimitSummary(pre)).toBeNull();
	});

	test('a taken pass still outranks everything, exactly as before', () => {
		const state = student({ taken: true, mine: false, used_today: 3 });
		expect(hallPassCanOpen(state, NOW)).toBe(false);
		expect(hallPassBlockedReason(state, NOW)).toBe(hallPassRefusalMessage('taken'));
	});

	test('an instructor is never offered the control, whatever the limits say', () => {
		const manager: HallPassManagerState = {
			scope: 'manager',
			section_id: 'sec-1',
			taken: false,
			mine: false,
			open: null,
			history: [],
			limits: LIMITS,
			roster: [{ student_email: 'ana@boscotech.net', student_name: 'Ana Reyes' }]
		};
		expect(hallPassCanOpen(manager, NOW)).toBe(false);
		expect(hallPassBlockedReason(manager, NOW)).toBeNull();
		expect(hallPassCooldownUntil(manager, NOW)).toBeNull();
		expect(hallPassAtDailyLimit(manager)).toBe(false);
	});
});

describe('the count is shown before anybody taps', () => {
	test('it reads as a fraction of the cap', () => {
		expect(hallPassUsageLine(student({ used_today: 2 }))).toBe('2 of 3 passes used today.');
		expect(hallPassUsageLine(student({ used_today: 0 }))).toBe('0 of 3 passes used today.');
		expect(
			hallPassUsageLine(student({ used_today: 1, limits: { ...LIMITS, daily_limit: 1 } }))
		).toBe('1 of 1 pass used today.');
	});

	test('the instructor summary states both numbers and what the override ignores', () => {
		const summary = hallPassLimitSummary(student()) ?? '';
		expect(summary).toContain('3 passes a day');
		expect(summary).toContain('10 minutes');
		expect(summary).toContain('ignores both');
	});
});

describe('an override is readable as one in the history', () => {
	test('a self-opened pass carries no marker, an overridden one names who sent them', () => {
		const base = {
			pass_id: 'p1',
			student_email: 'ana@boscotech.net',
			student_name: 'Ana Reyes',
			opened_at: '2026-09-02T18:00:00.000Z',
			closed_at: null,
			closed_by: null
		};
		expect(hallPassOverrideLabel({ ...base, opened_by: null })).toBeNull();
		// A pre-0174 row has no field at all, and must read the same way.
		expect(hallPassOverrideLabel(base)).toBeNull();
		expect(hallPassOverrideLabel({ ...base, opened_by: 'teacher@boscotech.edu' })).toBe(
			'sent out by teacher@boscotech.edu'
		);
	});
});

// ---------------------------------------------------------------------------
// THE NUMBERS LIVE IN ONE PLACE, AND IT IS NOT `src/`.
// ---------------------------------------------------------------------------

describe('no component or module restates the limit', () => {
	function sourceFiles(dir: string, out: string[] = []): string[] {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			if (statSync(full).isDirectory()) sourceFiles(full, out);
			else if (/\.(ts|svelte|js)$/.test(name)) out.push(full);
		}
		return out;
	}

	test('the cooldown and the cap appear in the migration and nowhere in src/', () => {
		const sql = readFileSync(
			'supabase/migrations/0174_classroom_hall_pass_limits.sql',
			'utf8'
		);
		// POSITIVE CONTROL: the numbers really are stated, once, where they
		// belong -- so "not in src/" below is a boundary and not an empty grep.
		expect(sql).toContain("'cooldown_minutes', 10, 'daily_limit', 3");

		// A number written into a component is a second statement of a rule the
		// database owns: the button would grey out at a threshold the server
		// does not use, or stay lit past one it does.
		// SCOPED TO THE CLASSROOM MODULE, on purpose. GREENLINE has ability
		// cooldowns of its own that have nothing to do with a hall pass, and a
		// tree-wide sweep would be red for a reason nobody could act on -- which
		// is how a sweep gets deleted rather than fixed. The hall pass lives
		// here, so this is where a second statement of its numbers would appear.
		const HARDCODED =
			/(cooldown|daily[_ ]?limit|dailyLimit|cooldownMinutes)\s*[:=]\s*\d/i;
		const files = sourceFiles('src/lib/classroom').concat(
			sourceFiles('src/routes/classroom')
		);
		// The sweep really looked at something: a case count, so a walk that
		// generated nothing cannot pass.
		expect(files.length).toBeGreaterThan(40);
		const offenders = files.filter((f) => HARDCODED.test(readFileSync(f, 'utf8'))).sort();
		expect(offenders).toEqual([]);

		// POSITIVE CONTROL FOR THE PATTERN ITSELF: it does bite on the shape it
		// is looking for, so an empty result above means "nobody wrote one" and
		// not "the regex matches nothing".
		expect(HARDCODED.test('const cooldownMinutes = 10;')).toBe(true);
		expect(HARDCODED.test("const limits = { daily_limit: 3 };")).toBe(true);
		expect(HARDCODED.test('const limits = state.limits;')).toBe(false);
	});
});
