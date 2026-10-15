// tests/cert-watch-checkins.test.ts
//
// THE CONTINUE CHECK-IN RULES (ledger 0391, surface e): a random gap of 3 to 8
// PLAYED minutes between check-ins, and a check-in unanswered for the settings'
// timeout counts as missed. The random source and both clocks are arguments,
// so every boundary is pinned here from the spec's own numbers.

import { describe, expect, it } from 'vitest';
import {
	CHECKIN_KEY_WORD,
	CHECKIN_MAX_GAP_SECONDS,
	CHECKIN_MIN_GAP_SECONDS,
	CHECKIN_MISSED_SENTENCE,
	CHECKIN_PROMPT,
	checkinDue,
	checkinTimedOut,
	scheduleNextCheckin
} from '$lib/certifications/watch/checkins';

describe('scheduleNextCheckin', () => {
	it('spans three to eight minutes of play', () => {
		expect(CHECKIN_MIN_GAP_SECONDS).toBe(3 * 60);
		expect(CHECKIN_MAX_GAP_SECONDS).toBe(8 * 60);
	});
	it('lands at the low end for a zero draw and just under the high end for the top draw', () => {
		expect(scheduleNextCheckin(0, () => 0)).toBe(180);
		const top = scheduleNextCheckin(0, () => 0.999999);
		expect(top).toBeLessThan(480);
		expect(top).toBeGreaterThan(479.9);
	});
	it('adds the gap to the current played mark', () => {
		expect(scheduleNextCheckin(100, () => 0.5)).toBe(430);
	});
	it('clamps a bad draw into the range rather than scheduling in the past or past the next', () => {
		expect(scheduleNextCheckin(0, () => NaN)).toBe(180);
		expect(scheduleNextCheckin(0, () => -3)).toBe(180);
		expect(scheduleNextCheckin(0, () => 7)).toBeLessThan(480);
	});
	it('reads a negative or non-finite played mark as zero', () => {
		expect(scheduleNextCheckin(-50, () => 0)).toBe(180);
		expect(scheduleNextCheckin(NaN, () => 0)).toBe(180);
	});
	it('draws from Math.random by default and still lands in range', () => {
		for (let i = 0; i < 50; i++) {
			const at = scheduleNextCheckin(1000);
			expect(at).toBeGreaterThanOrEqual(1180);
			expect(at).toBeLessThan(1480);
		}
	});
});

describe('checkinDue', () => {
	it('is due at and after the mark, never before', () => {
		expect(checkinDue(179.9, 180)).toBe(false);
		expect(checkinDue(180, 180)).toBe(true);
		expect(checkinDue(500, 180)).toBe(true);
		expect(checkinDue(NaN, 180)).toBe(false);
	});
});

describe('checkinTimedOut', () => {
	it('times out exactly at the setting, on a millisecond clock', () => {
		expect(checkinTimedOut(0, 59_999, 60)).toBe(false);
		expect(checkinTimedOut(0, 60_000, 60)).toBe(true);
		expect(checkinTimedOut(1_000, 61_000, 60)).toBe(true);
	});
	it('falls back to 60 seconds for a missing or zero setting', () => {
		expect(checkinTimedOut(0, 59_999, 0)).toBe(false);
		expect(checkinTimedOut(0, 60_000, NaN)).toBe(true);
	});
	it('never times out on a clock it cannot read', () => {
		expect(checkinTimedOut(NaN, 100_000, 60)).toBe(false);
		expect(checkinTimedOut(0, NaN, 60)).toBe(false);
	});
});

describe('the band words', () => {
	it('carry the key word and no em dash', () => {
		expect(CHECKIN_KEY_WORD).toBe('Continue');
		expect(CHECKIN_PROMPT).toContain('Continue');
		expect(CHECKIN_MISSED_SENTENCE).toContain('Continue');
		for (const s of [CHECKIN_PROMPT, CHECKIN_MISSED_SENTENCE]) expect(s).not.toMatch(/—/);
	});
});
