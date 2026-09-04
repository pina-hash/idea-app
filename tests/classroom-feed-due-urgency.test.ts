// tests/classroom-feed-due-urgency.test.ts
//
// THE FOUR URGENCY STEPS, AND THE EXACT INSTANT EACH ONE STARTS.
//
// `dueUrgency()` grades a ranked row by how near its deadline is, so an
// assignment due tomorrow reads differently from one due in three weeks. It is
// pinned here rather than in a harness because a threshold that has drifted is
// invisible: every row still renders, still carries words, still carries a
// treatment -- the treatment is simply attached to the wrong day, and the only
// reader who could notice is a student who missed something.
//
// EVERY BOUNDARY IS ASSERTED FROM BOTH SIDES. A threshold checked only from the
// inside passes on an off-by-one; each case below moves a deadline across a cut
// and then one minute back, and asserts the answer changes and then does not.
// A boundary with no test at its edge is a boundary nobody has checked.
//
// THE CLOCK IS PINNED AND MID-MORNING ON PURPOSE. Calendar-day arithmetic runs
// in local time, so a test instant near midnight would put "tomorrow" and "in
// 24 hours" on different days and read as a bug in the code. 10:00 leaves 14
// hours of headroom either side of every case below.

import { describe, expect, it } from 'vitest';
import {
	DUE_IMMINENT_DAYS,
	DUE_SOON_DAYS,
	dueUrgency,
	type FeedEntry,
	type FeedReasonId
} from '$lib/classroom/feed';
import type { ClassroomItem } from '$lib/classroom/classroom';

const NOW = new Date(2026, 9, 15, 10, 0, 0, 0); // 15 Oct 2026, 10:00 local
const MINUTE = 60_000;

/** Local-midnight-anchored: `at(1, 0, 0)` is 00:00 tomorrow. */
function at(days: number, hours = 10, minutes = 0): string {
	const d = new Date(NOW);
	d.setDate(d.getDate() + days);
	d.setHours(hours, minutes, 0, 0);
	return d.toISOString();
}

function entry(reason: FeedReasonId, due: string | null): FeedEntry {
	return {
		reason,
		item: { id: 'i1', kind: 'assignment', due_at: due } as unknown as ClassroomItem
	};
}

/**
 * The reason a real deadline row carries. `buildFeed` emits 'overdue' for a
 * past deadline and 'due-soon' for one inside the window, so a test that only
 * ever passed 'due-soon' would never exercise the overdue branch the way the
 * feed reaches it.
 */
const soon = (due: string) => entry('due-soon', due);

describe('dueUrgency: the four steps', () => {
	it('grades a deadline inside the window into four distinct answers (positive control)', () => {
		const answers = [
			dueUrgency(entry('overdue', at(-1)), NOW),
			dueUrgency(soon(at(0, 23, 59)), NOW),
			dueUrgency(soon(at(1)), NOW),
			dueUrgency(soon(at(DUE_SOON_DAYS - 1)), NOW)
		];
		expect(answers).toEqual(['overdue', 'today', 'imminent', 'soon']);
		expect(new Set(answers).size, 'the steps collapsed into fewer than four').toBe(4);
	});

	it('treats every day inside DUE_IMMINENT_DAYS as imminent, and the next one as soon', () => {
		// Stated against the constant, so raising it does not silently leave a
		// day behind. Day 0 is `today` and has its own step.
		for (let d = 1; d <= DUE_IMMINENT_DAYS; d += 1) {
			expect(dueUrgency(soon(at(d)), NOW), `day ${d} should be imminent`).toBe('imminent');
		}
		expect(dueUrgency(soon(at(DUE_IMMINENT_DAYS + 1)), NOW)).toBe('soon');
	});
});

describe('dueUrgency: the boundaries, from both sides', () => {
	it('flips overdue -> today at the deadline instant itself', () => {
		// The one cut that is an instant rather than a midnight: a deadline one
		// minute ago is past, one minute from now is still today.
		const past = new Date(NOW.getTime() - MINUTE).toISOString();
		const future = new Date(NOW.getTime() + MINUTE).toISOString();
		expect(dueUrgency(entry('overdue', past), NOW)).toBe('overdue');
		expect(dueUrgency(soon(future), NOW)).toBe('today');
	});

	it('flips today -> imminent at midnight, and not one minute before it', () => {
		expect(dueUrgency(soon(at(0, 23, 59)), NOW)).toBe('today');
		expect(dueUrgency(soon(at(1, 0, 0)), NOW)).toBe('imminent');
		// One minute back across the same cut, and the answer must not move.
		expect(dueUrgency(soon(at(1, 0, 1)), NOW)).toBe('imminent');
		expect(dueUrgency(soon(at(0, 23, 58)), NOW)).toBe('today');
	});

	it('flips imminent -> soon at the midnight after DUE_IMMINENT_DAYS', () => {
		const last = DUE_IMMINENT_DAYS;
		expect(dueUrgency(soon(at(last, 23, 59)), NOW)).toBe('imminent');
		expect(dueUrgency(soon(at(last + 1, 0, 0)), NOW)).toBe('soon');
		expect(dueUrgency(soon(at(last + 1, 0, 1)), NOW)).toBe('soon');
		expect(dueUrgency(soon(at(last, 23, 58)), NOW)).toBe('imminent');
	});

	it('does not care how far past a deadline is: overdue has no second step', () => {
		expect(dueUrgency(entry('overdue', at(-1)), NOW)).toBe('overdue');
		expect(dueUrgency(entry('overdue', at(-90)), NOW)).toBe('overdue');
	});
});

describe('dueUrgency: what it refuses to grade', () => {
	it('answers null for a row that is not about a deadline', () => {
		// A returned grade on a long-past assignment is not overdue work, and an
		// item ranked for being updated or pinned is not a clock. Each of these
		// carries a due date, so the null is the REASON being refused rather than
		// the date being missing.
		for (const reason of ['returned', 'updated', 'pinned', 'ungraded', 'draft', 'reference'] as const) {
			expect(dueUrgency(entry(reason, at(-30)), NOW), `${reason} should not be graded`).toBeNull();
			expect(dueUrgency(entry(reason, at(1)), NOW), `${reason} should not be graded`).toBeNull();
		}
	});

	it('answers null for a deadline row with no parseable date', () => {
		expect(dueUrgency(soon(null as unknown as string), NOW)).toBeNull();
		expect(dueUrgency(soon('not a date'), NOW)).toBeNull();
	});

	it('never returns a fifth answer', () => {
		const seen = new Set<string | null>();
		for (let d = -30; d <= 40; d += 1) {
			seen.add(dueUrgency(soon(at(d)), NOW));
			seen.add(dueUrgency(entry('overdue', at(d)), NOW));
		}
		for (const v of seen) {
			expect(['overdue', 'today', 'imminent', 'soon', null]).toContain(v);
		}
		expect(seen.size, 'the sweep never produced more than one answer').toBeGreaterThan(1);
	});
});

describe('dueUrgency: it reads the same clock the words do', () => {
	it('agrees with the row it decorates, at every day of the window', () => {
		/*
		 * THE ONE THAT MATTERS. The component threads its `now` into both
		 * `feedIndicator` and `dueUrgency`; if the two ever computed a day
		 * differently, a row would read "Due tomorrow" while being drawn as a
		 * fortnight out and nothing on screen would say so. They share
		 * `calendarDaysUntil`, and this is what holds them to it.
		 */
		expect(dueUrgency(soon(at(0, 23, 59)), NOW)).toBe('today');
		expect(dueUrgency(soon(at(1)), NOW)).toBe('imminent');

		// A caller passing a DIFFERENT clock gets a different answer, which is
		// the negative control for "it reads its own clock instead".
		const later = new Date(NOW.getTime() + 3 * 86_400_000);
		expect(dueUrgency(soon(at(1)), later)).toBe('overdue');
	});
});
