// tests/classroom-hall-pass-limits.test.ts
//
// THE CLIENT HALF OF 0237'S PASS TIME BUDGET, WHICH IS THE EXPLANATION AND
// NEVER THE BOUNDARY (it replaces 0174's cooldown and daily cap, ledger 0380,
// report 7348d14c).
//
// `tests/db/feedback-round-0380-latch-and-hallpass.test.ts` proves the database
// refuses and charges. This file proves the things that would regress silently
// on the way to a student's screen:
//
//   1. THE REFUSAL KEEPS ITS DAY. `over_budget` answers with the instant the
//      student may go again; a sentence without it is asked again in person.
//   2. THE PAYLOAD NAMES WHO IS OUT AND NOTHING ELSE ABOUT ANYBODY (decision
//      58), and the control mirrors the budget without implementing it.
//   3. THE NUMBERS ARE NOT HERE. Nothing in `src/` may write 10 or 30 down:
//      they come off the payload, so the button and the refusal behind it
//      cannot disagree. That is swept for below.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
	hallPassAvailableWords,
	hallPassBlockedReason,
	hallPassCanOpen,
	hallPassLimitSummary,
	hallPassLimitsRefusal,
	hallPassOverBudget,
	hallPassOverrideLabel,
	hallPassRefusalMessage,
	hallPassStatusLine,
	hallPassToolChip,
	hallPassUsageLine,
	type HallPassBudget,
	type HallPassManagerState,
	type HallPassStudentState
} from '../src/lib/classroom/hall-pass';

const LIMITS = { budget_minutes: 10, auto_checkin_minutes: 30 };
// Wednesday 2026-09-02, 11:20 in Los Angeles.
const NOW = Date.parse('2026-09-02T18:20:00.000Z');
const THURSDAY = '2026-09-03T07:00:00.000Z';
const NEXT_MONDAY = '2026-09-07T07:00:00.000Z';

function budget(over: Partial<HallPassBudget> = {}): HallPassBudget {
	return {
		daily_seconds: 600,
		auto_checkin_seconds: 1800,
		allowance_seconds: 600,
		used_seconds: 240,
		remaining_seconds: 360,
		debt_seconds: 0,
		blocked: false,
		available_at: null,
		resets_at: NEXT_MONDAY,
		...over
	};
}

const SPENT = budget({
	used_seconds: 600,
	remaining_seconds: 0,
	blocked: true,
	available_at: THURSDAY
});

function student(over: Partial<HallPassStudentState> = {}): HallPassStudentState {
	return {
		scope: 'student',
		section_id: 'sec-1',
		taken: false,
		mine: false,
		opened_at: null,
		limits: LIMITS,
		budget: budget(),
		...over
	};
}

describe('the refusal carries its day all the way to the sentence', () => {
	test('over budget names tomorrow when that is when the time comes back', () => {
		const msg = hallPassRefusalMessage('over_budget', { availableAt: THURSDAY, resetsAt: NEXT_MONDAY, nowMs: NOW });
		expect(msg).toContain('You can go again tomorrow.');
		expect(msg).toContain('Ask your teacher');
	});

	test('debt that reaches past tomorrow names the day, and the reset names the week', () => {
		expect(hallPassAvailableWords('2026-09-04T07:00:00.000Z', NEXT_MONDAY, NOW)).toBe(
			'You can go again on Friday.'
		);
		expect(hallPassAvailableWords(NEXT_MONDAY, NEXT_MONDAY, NOW)).toBe(
			'You can go again on Monday, when the week resets.'
		);
	});

	test('no instant degrades to a true sentence rather than a wrong one', () => {
		const msg = hallPassRefusalMessage('over_budget');
		expect(msg).not.toContain('undefined');
		expect(msg).toContain('You can go again soon.');
	});

	test('0143 and 0144 sentences are untouched', () => {
		expect(hallPassRefusalMessage('taken')).toBe(
			'Someone else has the pass right now. Try again when they are back.'
		);
		expect(hallPassRefusalMessage('already_closed')).toBe(
			'That pass was already signed back in, so nothing was changed.'
		);
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
			'over_budget',
			'not_enrolled'
		] as const;
		expect(REFUSALS).toHaveLength(8);
		for (const r of REFUSALS) {
			const msg = hallPassRefusalMessage(r, { availableAt: THURSDAY, resetsAt: NEXT_MONDAY, nowMs: NOW });
			expect(msg.length).toBeGreaterThan(10);
			expect(msg).not.toMatch(/classroom_hall_pass|pg_|unique|constraint|23505|P0001/i);
		}
	});

	test('a refused limits save says the range in words', () => {
		expect(hallPassLimitsRefusal('daily_out_of_range')).toContain('between 1 and 120');
		expect(hallPassLimitsRefusal('auto_out_of_range')).toContain('between 5 and 240');
		expect(hallPassLimitsRefusal('something else')).toBe('Those numbers were not accepted.');
	});
});

describe('the control mirrors the budget and never implements it', () => {
	test('an ordinary student with time left may open', () => {
		expect(hallPassCanOpen(student(), NOW)).toBe(true);
		expect(hallPassBlockedReason(student(), NOW)).toBeNull();
		expect(hallPassOverBudget(student())).toBe(false);
	});

	test('a spent day closes the control and explains itself with the same sentence', () => {
		const state = student({ budget: SPENT });
		expect(hallPassOverBudget(state)).toBe(true);
		expect(hallPassCanOpen(state, NOW)).toBe(false);
		expect(hallPassBlockedReason(state, NOW)).toBe(
			hallPassRefusalMessage('over_budget', { availableAt: THURSDAY, resetsAt: NEXT_MONDAY, nowMs: NOW })
		);
	});

	test('a payload with no budget blocks nothing at all', () => {
		// A deployment before 0237 is not enforcing a budget, so a control that
		// greyed itself out on a missing number would refuse a student on behalf
		// of a rule that does not exist.
		const pre = student({ limits: undefined, budget: undefined });
		expect(hallPassOverBudget(pre)).toBe(false);
		expect(hallPassCanOpen(pre, NOW)).toBe(true);
		expect(hallPassBlockedReason(pre, NOW)).toBeNull();
		expect(hallPassUsageLine(pre)).toBeNull();
		expect(hallPassLimitSummary(pre)).toBeNull();
	});

	test('a taken pass still outranks everything, and names who has it', () => {
		const state = student({
			taken: true,
			mine: false,
			budget: SPENT,
			out: { name: 'Ben Cho', opened_at: '2026-09-02T18:10:00.000Z' }
		});
		expect(hallPassCanOpen(state, NOW)).toBe(false);
		expect(hallPassBlockedReason(state, NOW)).toBe('Ben Cho has the pass right now.');
	});

	test('an instructor is never offered the control, whatever the budget says', () => {
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
		expect(hallPassOverBudget(manager)).toBe(false);
	});
});

describe('everyone in the class sees who is out (decision 58)', () => {
	const OUT = { name: 'Ben Cho', opened_at: '2026-09-02T18:10:00.000Z' };

	test('the status line names the student and since when', () => {
		const line = hallPassStatusLine(student({ taken: true, out: OUT }), NOW);
		expect(line).toContain('Ben Cho is out');
		expect(line).toContain('10 min');
		expect(line).toContain('11:10');
	});

	test('before the migration the line says what it always said', () => {
		expect(hallPassStatusLine(student({ taken: true }), NOW)).toBe('Someone is out. The pass is taken.');
		expect(hallPassStatusLine(student(), NOW)).toBe('The pass is free.');
	});

	test('the trigger chip names who is out, and never an address', () => {
		expect(hallPassToolChip(student({ taken: true, out: OUT }), NOW).word).toBe('Out · Ben Cho');
		expect(hallPassToolChip(student({ taken: true }), NOW).word).toBe('Taken');
	});

	test('the student type still has no field capable of carrying an address', () => {
		const keys = Object.keys(student({ taken: true, out: OUT }));
		expect(keys.join(' ')).not.toMatch(/email|pass_id/i);
		expect(Object.keys(OUT).sort()).toEqual(['name', 'opened_at']);
	});
});

describe('the time left is shown before anybody taps', () => {
	test('it reads in minutes, rounding what is left up', () => {
		expect(hallPassUsageLine(student())).toBe('6 minutes of pass time left today.');
		expect(hallPassUsageLine(student({ budget: budget({ remaining_seconds: 61 }) }))).toBe(
			'2 minutes of pass time left today.'
		);
		expect(hallPassUsageLine(student({ budget: budget({ remaining_seconds: 60 }) }))).toBe(
			'1 minute of pass time left today.'
		);
	});

	test('a spent day and carried debt are said in words', () => {
		expect(hallPassUsageLine(student({ budget: SPENT }))).toBe(
			'No pass time left today (10 of 10 minutes used).'
		);
		const owing = budget({ debt_seconds: 180, allowance_seconds: 420, remaining_seconds: 300 });
		expect(hallPassUsageLine(student({ budget: owing }))).toBe(
			'5 minutes of pass time left today. 3 minutes carried over from earlier this week.'
		);
	});

	test('the instructor summary states both numbers and what the override ignores', () => {
		const summary = hallPassLimitSummary(student()) ?? '';
		expect(summary).toContain('10 minutes of pass time a day');
		expect(summary).toContain('30 minutes');
		expect(summary).toContain('ignores their budget');
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

	test('the budget and the auto check in appear in the migration and nowhere in src/', () => {
		const sql = readFileSync(
			'supabase/migrations/0237_feedback_round_0380.sql',
			'utf8'
		);
		// POSITIVE CONTROL: the numbers really are stated, once, where they
		// belong -- so "not in src/" below is a boundary and not an empty grep.
		expect(sql).toContain("'budget_minutes', 10, 'auto_checkin_minutes', 30");

		// A number written into a component is a second statement of a rule the
		// database owns: the button would grey out at a threshold the server
		// does not use, or stay lit past one it does.
		// SCOPED TO THE CLASSROOM MODULE, on purpose. GREENLINE has ability
		// cooldowns of its own that have nothing to do with a hall pass, and a
		// tree-wide sweep would be red for a reason nobody could act on -- which
		// is how a sweep gets deleted rather than fixed. The hall pass lives
		// here, so this is where a second statement of its numbers would appear.
		const HARDCODED =
			/(cooldown|daily[_ ]?limit|dailyLimit|budget[_ ]?minutes|budgetMinutes|auto[_ ]?checkin[_ ]?minutes)\s*[:=]\s*\d/i;
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
		expect(HARDCODED.test('const budgetMinutes = 10;')).toBe(true);
		expect(HARDCODED.test("const limits = { budget_minutes: 10 };")).toBe(true);
		expect(HARDCODED.test('const limits = state.limits;')).toBe(false);
	});
});
