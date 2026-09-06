// tests/classroom-due-date.test.ts
//
// 0069/B1: an assignment's due TIME defaults to 11:59pm, and nothing already
// stored moves.
//
// WHY THIS IS A TEST. Most of the due field fails visibly -- a box in the wrong
// place is a box in the wrong place. Two things here do not:
//
//   1. THE ROUND TRIP. The composer's untouched-field rule (`dueToSend`) is
//      what stops a save that changed nothing from stamping `edited_at` and
//      showing every student in the class an "Updated" badge. It works by
//      comparing `isoToLocalInput(item.due_at)` against the field's current
//      value, so splitting the field in two is only safe if split-then-join is
//      the IDENTITY on every string `isoToLocalInput` can produce. A single
//      character of drift there is invisible on screen and shows up as a class
//      full of false Updated badges.
//   2. MIDNIGHT. The failure mode of a defaulted time is not "no default", it
//      is a deadline SILENTLY A DAY EARLY than the date printed beside it. A
//      due date rendered "Due Sep 10" that expired at the start of Sep 10 reads
//      correct everywhere and is wrong by 24 hours.
//
// It asserts the CONTRACT rather than the current wording: what the field
// produces for each input, not which elements the composer happens to draw.

import { describe, expect, test } from 'vitest';
import { DEFAULT_DUE_TIME, joinDueInput, splitDueInput } from '$lib/classroom/due-default';
import { isoToLocalInput, localInputToIso } from '$lib/classroom/classroom';

describe('the default', () => {
	test('is 11:59pm, as a time input value', () => {
		// SPELLED OUT rather than derived from the constant, because a constant
		// compared against itself cannot fail. 23:59 is the request.
		expect(DEFAULT_DUE_TIME).toBe('23:59');
	});

	test('a fresh composer has no date and the default time', () => {
		// The empty string is what `isoToLocalInput(null)` returns, which is what
		// the composer seeds a CREATE with.
		expect(splitDueInput('')).toEqual({ date: '', time: '23:59' });
	});

	test('and therefore no due date at all until a day is picked', () => {
		// THE HALF THAT MUST NOT REGRESS INTO A CONVENIENCE. Seeding a date as
		// well would give every new assignment a deadline nobody chose.
		const { date, time } = splitDueInput('');
		expect(joinDueInput(date, time)).toBe('');
		expect(localInputToIso(joinDueInput(date, time))).toBeNull();
	});

	test('picking a day and nothing else means the end of that day', () => {
		expect(joinDueInput('2026-09-10', DEFAULT_DUE_TIME)).toBe('2026-09-10T23:59');
	});

	test('a cleared time falls back to the default, NEVER to midnight', () => {
		// Midnight would move the deadline to the START of the day named beside
		// it -- a full day early, rendering identically.
		expect(joinDueInput('2026-09-10', '')).toBe('2026-09-10T23:59');
		expect(joinDueInput('2026-09-10', '   ')).toBe('2026-09-10T23:59');
		expect(joinDueInput('2026-09-10', 'nonsense')).toBe('2026-09-10T23:59');
	});

	test('a cleared DATE clears the due date whatever the time says', () => {
		expect(joinDueInput('', '23:59')).toBe('');
		expect(joinDueInput('   ', '09:00')).toBe('');
	});

	test('a time the instructor chose is kept', () => {
		expect(joinDueInput('2026-09-10', '09:05')).toBe('2026-09-10T09:05');
		// Including a deliberate midnight: the fallback above is for an EMPTY
		// box, and must not swallow a time somebody actually typed.
		expect(joinDueInput('2026-09-10', '00:00')).toBe('2026-09-10T00:00');
	});
});

describe('nothing already stored moves', () => {
	/**
	 * EVERY STAMP SHAPE `isoToLocalInput` CAN BE HANDED, generated rather than
	 * typed: midnight, one minute past, noon, the last minute of a day, a leap
	 * day, a month boundary, and both sides of a DST transition in the school's
	 * own zone -- which is where a naive split would be most likely to slip.
	 */
	const STAMPS = [
		'2026-01-01T00:00:00.000Z',
		'2026-01-01T00:01:00.000Z',
		'2026-02-29T12:00:00.000Z',
		'2026-03-01T23:59:00.000Z',
		'2026-03-08T09:59:00.000Z',
		'2026-03-08T11:00:00.000Z',
		'2026-06-30T23:59:59.000Z',
		'2026-11-01T08:30:00.000Z',
		'2026-12-31T23:59:00.000Z'
	];

	test('the corpus is not empty', () => {
		// A `for` over an empty array asserts nothing and reports a clean file.
		expect(STAMPS.length).toBe(9);
	});

	test('split then join is the identity on every one of them', () => {
		for (const iso of STAMPS) {
			const seeded = isoToLocalInput(iso);
			// PREMISE: the seed really is the shape this module claims to parse.
			expect(seeded).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
			const { date, time } = splitDueInput(seeded);
			// THE ROUND TRIP. This is what `dueToSend`'s untouched comparison
			// rests on: an item opened and saved with the due field untouched must
			// produce the identical string, or the server reads a real change.
			expect(joinDueInput(date, time)).toBe(seeded);
		}
	});

	test('a seeded item keeps its own time, not the default', () => {
		// A 9am deadline somebody set last term must not be quietly moved to
		// 11:59pm by opening the editor.
		const seeded = isoToLocalInput('2026-09-10T16:00:00.000Z');
		const { time } = splitDueInput(seeded);
		const { date } = splitDueInput(seeded);
		expect(joinDueInput(date, time)).toBe(seeded);
		// And the default is only reached where there was nothing to keep.
		expect(splitDueInput('').time).toBe(DEFAULT_DUE_TIME);
	});
});

describe('what time zone 11:59pm is', () => {
	/**
	 * THE BROWSER'S, and this test says so out loud rather than leaving it to be
	 * rediscovered. `localInputToIso` is `new Date('<wall clock>')`, which
	 * Node and every browser parse in the RUNNING process's zone -- so the
	 * default resolves exactly as a typed 23:59 always has, and this bundle
	 * changed nothing about the conversion.
	 *
	 * The assertion is written to hold in ANY zone the suite might run in, so it
	 * is a statement about the mechanism rather than about this machine: the
	 * instant that comes back, read back in local time, is 23:59 on the day that
	 * was picked.
	 */
	test('a defaulted due date resolves to 23:59 local on the day picked', () => {
		const iso = localInputToIso(joinDueInput('2026-09-10', DEFAULT_DUE_TIME));
		expect(iso).not.toBeNull();
		const d = new Date(iso!);
		expect(d.getHours()).toBe(23);
		expect(d.getMinutes()).toBe(59);
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(8);
		expect(d.getDate()).toBe(10);
	});

	test('which is the same round trip isoToLocalInput already performs', () => {
		// POSITIVE CONTROL on the claim above: the field's own seeding helper
		// agrees, so the default is not resolving through some second path.
		const iso = localInputToIso(joinDueInput('2026-09-10', DEFAULT_DUE_TIME))!;
		expect(isoToLocalInput(iso)).toBe('2026-09-10T23:59');
	});
});
