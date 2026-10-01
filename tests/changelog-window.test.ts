// tests/changelog-window.test.ts
//
// THE PORTAL UPDATES PANEL RENDERS A WINDOW OF THE LOG, NOT THE WHOLE LOG
// (ledger 0360, report R24).
//
// The panel on the home page rendered every commit the moment it opened --
// 2,507 entries on the day it was reported, about seven DOM nodes each -- and
// opening it lagged. `changelogWindow` is the one piece of arithmetic that
// decides how much of the FILTERED log is on screen; the filters, the count and
// the "Show more" control all read it, so the page has exactly one idea of how
// far it has got.
//
// EVERY EXPECTED VALUE HERE IS ARITHMETIC ON THE FIXTURE SIZE, never a value
// the function produced: a check derived from the implementation's own rule
// cannot fail.

import { describe, expect, it } from 'vitest';
import {
	CHANGELOG_PAGE_SIZE,
	FIELD,
	REC,
	changelogWindow,
	groupEntriesByMonth,
	parseGitLog,
	type VersionEntry
} from '../src/lib/site-versions';

/**
 * Entries built through their REAL producer, the way site-versions.test.ts
 * builds them: `parseGitLog` is what turns `%cI` into the `iso` the grouping
 * reads, so a hand-typed VersionEntry would test a shape the build never emits.
 */
function entriesFrom(rows: Array<[sha: string, cI: string]>): VersionEntry[] {
	const raw = rows
		.map(([sha, cI]) => `${REC}${sha}${FIELD}${cI}${FIELD}${cI}${FIELD}subject for ${sha}`)
		.join('\n');
	return parseGitLog(raw, { complete: true });
}

/**
 * 400 commits, newest first, spread over Sept and Aug 2026, with one a day
 * stamped in a -07:00 zone so the log is NOT monotonic by displayed date --
 * the exact shape that once opened a month twice and blanked the page.
 */
const N = 400;
const fixture: VersionEntry[] = entriesFrom(
	Array.from({ length: N }, (_, i) => {
		const sha = `c${String(i).padStart(4, '0')}`;
		// 50 days back from Sept 30. Each day's first commit was made at 18:20 -07:00
		// on the PREVIOUS evening, which is 01:20 UTC on this day -- so git
		// lists it among this day's commits while it displays the day before,
		// and at the month boundary an August row sits inside a September run.
		const local = i % 8 === 0;
		const day = 30 - Math.floor(i / 8) - (local ? 1 : 0);
		const month = day >= 1 ? '09' : '08';
		const dd = String(day >= 1 ? day : 31 + day).padStart(2, '0');
		const zone = local ? '18:20:00-07:00' : '01:08:00+00:00';
		return [sha, `2026-${month}-${dd}T${zone}`];
	})
);

describe('changelogWindow', () => {
	it('the fixture is what it claims to be (a positive control on the input)', () => {
		expect(fixture.length).toBe(N);
		expect(new Set(fixture.map((e) => e.iso.slice(0, 7)))).toEqual(new Set(['2026-09', '2026-08']));
		// NOT monotonic by month: a single pass would open September twice.
		const runs = fixture.reduce<string[]>((acc, e) => {
			const key = e.iso.slice(0, 7);
			if (acc[acc.length - 1] !== key) acc.push(key);
			return acc;
		}, []);
		expect(runs.length).toBeGreaterThan(2);
		expect(runs.filter((k) => k === '2026-09').length).toBeGreaterThan(1);
	});

	it('the page is a real, bounded number: a lot, and far below the whole log', () => {
		expect(CHANGELOG_PAGE_SIZE).toBeGreaterThanOrEqual(100);
		expect(CHANGELOG_PAGE_SIZE).toBeLessThanOrEqual(300);
	});

	it('the first window is one page, or the whole list when it is shorter', () => {
		const w = changelogWindow(fixture, CHANGELOG_PAGE_SIZE);
		expect(w.shown).toBe(Math.min(N, CHANGELOG_PAGE_SIZE));
		expect(w.visible).toHaveLength(Math.min(N, CHANGELOG_PAGE_SIZE));
		expect(w.total).toBe(N);
		expect(w.remaining).toBe(N - Math.min(N, CHANGELOG_PAGE_SIZE));

		const short = fixture.slice(0, 37);
		const s = changelogWindow(short, CHANGELOG_PAGE_SIZE);
		expect(s.shown).toBe(37);
		expect(s.remaining).toBe(0);
		expect(s.next).toBe(37);
	});

	it('an empty list is an empty window, not an error', () => {
		const w = changelogWindow([], CHANGELOG_PAGE_SIZE);
		expect(w).toEqual({ visible: [], shown: 0, total: 0, remaining: 0, next: 0 });
	});

	it('a request under one page clamps UP to a page; one past the end clamps to the total', () => {
		expect(changelogWindow(fixture, 3).shown).toBe(CHANGELOG_PAGE_SIZE);
		expect(changelogWindow(fixture, 0).shown).toBe(CHANGELOG_PAGE_SIZE);
		expect(changelogWindow(fixture, Number.NaN).shown).toBe(CHANGELOG_PAGE_SIZE);
		expect(changelogWindow(fixture, N + 999).shown).toBe(N);
		expect(changelogWindow(fixture, N + 999).remaining).toBe(0);
	});

	it('next is one more page, never past the end, and walking it reaches everything once', () => {
		let requested = CHANGELOG_PAGE_SIZE;
		const seen: number[] = [];
		for (let guard = 0; guard < 20; guard++) {
			const w = changelogWindow(fixture, requested);
			seen.push(w.shown);
			expect(w.next).toBeLessThanOrEqual(N);
			expect(w.remaining).toBe(N - w.shown);
			if (w.remaining === 0) break;
			expect(w.next).toBe(Math.min(N, w.shown + CHANGELOG_PAGE_SIZE));
			requested = w.next;
		}
		const pages = Math.ceil(N / CHANGELOG_PAGE_SIZE);
		expect(seen).toHaveLength(pages);
		expect(seen[seen.length - 1]).toBe(N);
	});

	it('the window is a PREFIX of its input, in the input order', () => {
		const w = changelogWindow(fixture, 2 * CHANGELOG_PAGE_SIZE);
		expect(w.visible.map((e) => e.sha)).toEqual(fixture.slice(0, 2 * CHANGELOG_PAGE_SIZE).map((e) => e.sha));
	});

	it('a window grouped into months holds exactly `shown` entries, under unique month keys', () => {
		for (const requested of [CHANGELOG_PAGE_SIZE, 2 * CHANGELOG_PAGE_SIZE, N]) {
			const w = changelogWindow(fixture, requested);
			const months = groupEntriesByMonth(w.visible);
			const keys = months.map((m) => m.key);
			expect(new Set(keys).size).toBe(keys.length);
			expect(months.reduce((n, m) => n + m.entries.length, 0)).toBe(Math.min(N, requested));
			const shas = months.flatMap((m) => m.entries.map((e) => e.sha));
			expect(new Set(shas).size).toBe(shas.length);
		}
	});
});
