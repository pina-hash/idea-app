// tests/html-assignment-replace-safety.test.ts
//
// LEDGER 0458, REPORT aa9ce822: A REPLACE MADE FROM AN OLDER COPY IS REFUSED.
// One rule (`htmlBasedOnMatches`) for the connector and the replace screen.

import { describe, expect, it } from 'vitest';
import { htmlBasedOnMatches, htmlReplaceStillCurrent } from '$lib/classroom/html-assignment/store';

const SHA = 'a'.repeat(64);
const head = { sha256: SHA, updatedAt: '2026-10-26T18:04:11.123456+00:00' };

describe('htmlBasedOnMatches', () => {
	it('a SHA-256 matches its own bytes only, case aside', () => {
		expect(htmlBasedOnMatches(SHA, head)).toBe(true);
		expect(htmlBasedOnMatches(SHA.toUpperCase(), head)).toBe(true);
		expect(htmlBasedOnMatches('b'.repeat(64), head)).toBe(false);
	});

	it('a saved time matches the same instant however it is written, and nothing else', () => {
		expect(htmlBasedOnMatches('2026-10-26T18:04:11.123Z', { ...head, updatedAt: '2026-10-26T18:04:11.123Z' })).toBe(true);
		expect(htmlBasedOnMatches('2026-10-26T11:04:11.123-07:00', { ...head, updatedAt: '2026-10-26T18:04:11.123Z' })).toBe(true);
		expect(htmlBasedOnMatches('2026-10-25T18:04:11.123Z', { ...head, updatedAt: '2026-10-26T18:04:11.123Z' })).toBe(false);
		expect(htmlBasedOnMatches('yesterday', head)).toBe(false);
		expect(htmlBasedOnMatches('2026-10-26T18:04:11Z', { ...head, updatedAt: null })).toBe(false);
	});
});

describe('htmlReplaceStillCurrent', () => {
	const at = (t: string | null) => ({ readSavedAt: async () => t });
	it('refuses when the stored copy was saved after the page loaded it', async () => {
		expect(await htmlReplaceStillCurrent('i', '2026-10-26T18:00:00Z', at('2026-10-26T18:05:00Z'))).toBe(false);
	});
	it('passes when it is the same copy', async () => {
		expect(await htmlReplaceStillCurrent('i', '2026-10-26T18:00:00Z', at('2026-10-26T18:00:00.000+00:00'))).toBe(true);
	});
	it('passes with nothing to compare, so the database gates stand alone', async () => {
		expect(await htmlReplaceStillCurrent('i', null, at('2026-10-26T18:05:00Z'))).toBe(true);
		expect(await htmlReplaceStillCurrent('i', '2026-10-26T18:00:00Z', {})).toBe(true);
		expect(await htmlReplaceStillCurrent('i', '2026-10-26T18:00:00Z', at(null))).toBe(true);
		expect(await htmlReplaceStillCurrent('i', '2026-10-26T18:00:00Z', { readSavedAt: async () => { throw new Error('down'); } })).toBe(true);
	});
});
