// tests/foundry-schedule.test.ts
//
// THE CLIENT HALF OF 0237 PART C (ledger 0380, report 84e293d4): the editor's
// draft rules mirror the database's refusals (so a press that could only be
// refused says why first) and the sentences are true of the state they describe.

import { describe, expect, test } from 'vitest';
import {
	SCHEDULE_MAX_WEEKLY,
	clockWords,
	dayWindowsProblem,
	dayWords,
	overlaps,
	scheduleFromRpc,
	scheduleNowWords,
	scheduleRefusalSentence,
	weeklyProblem,
	windowProblem,
	windowWords,
	windowsOn
} from '../src/lib/foundry/schedule';
import { foundryScheduleNotes, type FoundryClosedSection } from '../src/lib/foundry/access';

describe('a window is valid exactly when the database says so', () => {
	test('order and shape', () => {
		expect(windowProblem('09:00', '09:50')).toBeNull();
		expect(windowProblem('09:50', '09:00')).toMatch(/end after/);
		expect(windowProblem('09:00', '09:00')).toMatch(/end after/);
		expect(windowProblem('', '09:00')).toMatch(/start and an end/);
		expect(windowProblem('9:00', '10:00')).toMatch(/start and an end/);
		expect(windowProblem('24:00', '25:00')).toMatch(/start and an end/);
	});
	test('touching windows do not overlap, crossing ones do', () => {
		expect(overlaps({ starts: '09:00', ends: '10:00' }, { starts: '10:00', ends: '11:00' })).toBe(false);
		expect(overlaps({ starts: '09:00', ends: '10:30' }, { starts: '10:00', ends: '11:00' })).toBe(true);
	});
	test('a weekly draft names the day with the problem', () => {
		expect(weeklyProblem([{ weekday: 1, starts: '09:00', ends: '10:00' }])).toBeNull();
		expect(weeklyProblem([{ weekday: 3, starts: '10:00', ends: '09:00' }])).toMatch(/^Wednesday:/);
		expect(
			weeklyProblem([
				{ weekday: 2, starts: '09:00', ends: '10:30' },
				{ weekday: 2, starts: '10:00', ends: '11:00' }
			])
		).toMatch(/^Tuesday: two periods overlap/);
		const many = Array.from({ length: SCHEDULE_MAX_WEEKLY + 1 }, (_, i) => ({ weekday: (i % 5) + 1, starts: '08:00', ends: '08:10' }));
		expect(weeklyProblem(many)).toMatch(/at most/);
	});
	test('a date exception needs at least one valid, non-overlapping time', () => {
		expect(dayWindowsProblem([])).toMatch(/at least one/);
		expect(dayWindowsProblem([{ starts: '08:00', ends: '09:00' }])).toBeNull();
		expect(dayWindowsProblem([{ starts: '08:00', ends: '09:30' }, { starts: '09:00', ends: '10:00' }])).toMatch(/overlap/);
	});
	test('windowsOn is per weekday and in time order', () => {
		const rows = [
			{ weekday: 1, starts: '13:00', ends: '14:00' },
			{ weekday: 2, starts: '09:00', ends: '10:00' },
			{ weekday: 1, starts: '08:00', ends: '09:00' }
		];
		expect(windowsOn(rows, 1).map((r) => r.starts)).toEqual(['08:00', '13:00']);
		expect(windowsOn(rows, 4)).toEqual([]);
	});
});

describe('words', () => {
	test('clock and window', () => {
		expect(clockWords('00:05')).toBe('12:05 AM');
		expect(clockWords('12:00')).toBe('12:00 PM');
		expect(clockWords('13:30')).toBe('1:30 PM');
		expect(clockWords('nope')).toBe('');
		expect(windowWords({ starts: '08:55', ends: '09:50' })).toBe('8:55 AM to 9:50 AM');
	});
	test('a calendar date is named on its own day whatever the viewer\'s zone', () => {
		expect(dayWords('2026-10-14')).toBe('Wednesday, October 14');
		expect(dayWords('2026-10-12')).toBe('Monday, October 12');
	});
	test('the state right now', () => {
		expect(scheduleNowWords({ closed: false }, true)).toMatch(/next class period/);
		expect(scheduleNowWords({ closed: false }, false)).toMatch(/No schedule is switched on/);
		expect(scheduleNowWords({ closed: true, by: 'schedule', until: '2026-10-14T20:55:00Z' }, true)).toBe('Closed by the schedule until 1:55 PM.');
		expect(scheduleNowWords({ closed: true, by: 'hand', note: 'Quiz' }, false)).toBe('Closed by hand. Your note: Quiz');
		expect(scheduleNowWords({ closed: true, by: 'hand' }, false)).toBe('Closed by hand.');
	});
	test('every database reason has a sentence', () => {
		for (const r of ['window_order', 'window_shape', 'weekly_shape', 'too_many', 'date_range', 'kind', 'note_length']) {
			expect(scheduleRefusalSentence(r)).not.toBe(scheduleRefusalSentence('mystery'));
		}
	});
});

describe('the RPC answer is read defensively', () => {
	test('a good answer', () => {
		const s = scheduleFromRpc({
			ok: true,
			enabled: true,
			weekly: [{ weekday: 1, starts: '10:00', ends: '10:55' }, { weekday: 99, starts: '10:00', ends: '10:55' }, { weekday: 2, starts: 5 }],
			days: [{ on_date: '2026-10-12', kind: 'no_class', starts: null, ends: null, note: null }, { on_date: 'x', kind: 'weird' }],
			now: { closed: true, by: 'schedule' }
		});
		expect(s?.enabled).toBe(true);
		expect(s?.weekly).toHaveLength(1);
		expect(s?.days).toHaveLength(1);
		expect(s?.now.closed).toBe(true);
	});
	test('anything that is not an ok answer is null', () => {
		expect(scheduleFromRpc(null)).toBeNull();
		expect(scheduleFromRpc('x')).toBeNull();
		expect(scheduleFromRpc({ ok: false })).toBeNull();
	});
});

describe('a student is told when a scheduled class comes back', () => {
	const row = (over: Partial<FoundryClosedSection>): FoundryClosedSection => ({
		section_id: 's', label: 'Block 1', course_title: 'Engineering I', note: null, closed_at: '2026-10-14T17:00:00Z', ...over
	});
	test('only schedule closures with an end are listed, in school time', () => {
		const notes = foundryScheduleNotes([
			row({ by: 'schedule', until: '2026-10-14T20:55:00Z' }),
			row({ section_id: 't', by: 'hand' }),
			row({ section_id: 'u' }),
			row({ section_id: 'v', by: 'schedule', until: null })
		]);
		expect(notes).toEqual([{ section_id: 's', course_title: 'Engineering I', label: 'Block 1', until: '1:55 PM' }]);
	});
});
