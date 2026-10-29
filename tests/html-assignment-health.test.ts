// tests/html-assignment-health.test.ts
//
// LEDGER 0458, REPORTS 3bf69806 AND ccecb3b9: the health list's own rules,
// on values. Which kit built a page, oldest first, which committed source is
// a post's, and points that disagree with the page's rubric.

import { describe, expect, it } from 'vitest';
import {
	htmlHealth,
	htmlPointsMismatch,
	htmlPointsMismatchLine,
	kitBuildOf,
	parseKitStamp,
	sourceIdentity,
	type HtmlHealthRow
} from '$lib/classroom/html-assignment/health';

const row = (over: Partial<HtmlHealthRow>): HtmlHealthRow => ({
	item_id: 'i',
	title: 'T',
	published: true,
	points: 10,
	due_at: null,
	manifest_title: 'T',
	manifest_course: 'IDEA100',
	manifest_points: 10,
	filename: 'a.html',
	bytes: 1000,
	updated_at: '2026-10-20T00:00:00Z',
	kit: null,
	standard: null,
	kit_css: null,
	kit_page: false,
	source_filename: null,
	source_updated_at: null,
	classes: [],
	...over
});

describe('which kit built a page', () => {
	it('reads the stamp, an older kit page and a hand-built one', () => {
		expect(parseKitStamp('1a2b3c4 2026-10-28')).toEqual({ sha: '1a2b3c4', date: '2026-10-28' });
		expect(parseKitStamp('garbage')).toBeNull();
		expect(kitBuildOf(row({ kit: '1a2b3c4 2026-10-28' }))).toEqual({ kind: 'stamped', sha: '1a2b3c4', date: '2026-10-28' });
		expect(kitBuildOf(row({ kit_css: 'main, synced 2026-10-21' }))).toEqual({ kind: 'older', synced: '2026-10-21' });
		expect(kitBuildOf(row({ kit_page: true }))).toEqual({ kind: 'older', synced: null });
		expect(kitBuildOf(row({}))).toEqual({ kind: 'hand' });
	});
});

describe('the list', () => {
	const now = { sha: 'fff0000', date: '2026-10-28' };
	const rows = [
		row({ item_id: 'new', kit: 'fff0000 2026-10-28' }),
		row({ item_id: 'old', kit: 'aaa0000 2026-10-21' }),
		row({ item_id: 'hand', updated_at: '2026-10-25T00:00:00Z' }),
		row({ item_id: 'older', kit_page: true }),
		row({ item_id: 'same-day', kit: 'bbb0000 2026-10-28' })
	];

	it('sorts hand-built first, then older kit, then by kit date, and flags only what the current kit has not reached', () => {
		const list = htmlHealth(rows, [], now);
		expect(list.map((e) => e.row.item_id)).toEqual(['hand', 'older', 'old', 'new', 'same-day']);
		expect(Object.fromEntries(list.map((e) => [e.row.item_id, e.behind]))).toEqual({ hand: true, older: true, old: true, new: false, 'same-day': true });
	});

	it('a committed source matches only when exactly one names the title and course', () => {
		const src = (path: string, title: string) => ({ path, title, course: 'IDEA100', text: '' });
		expect(htmlHealth([row({})], [src('a.src.html', 'T')], now)[0].committed?.path).toBe('a.src.html');
		expect(htmlHealth([row({})], [src('a.src.html', 'T'), src('b.src.html', 't')], now)[0].committed).toBeNull();
		expect(htmlHealth([row({})], [src('a.src.html', 'Other')], now)[0].committed).toBeNull();
	});

	it("reads a source's own manifest identity", () => {
		const text = '<script type="application/json" id="idea-manifest">{"title":" Survey ","course":"IDEA100"}</script>';
		expect(sourceIdentity(text)).toEqual({ title: 'Survey', course: 'IDEA100' });
		expect(sourceIdentity('<html></html>')).toEqual({ title: null, course: null });
	});
});

describe('points that disagree with the rubric (ccecb3b9)', () => {
	it('unset over a graded page, or a different number, and never an ungraded page with none set', () => {
		expect(htmlPointsMismatch(null, 100)).toBe(true);
		expect(htmlPointsMismatch(20, 100)).toBe(true);
		expect(htmlPointsMismatch(100, 100)).toBe(false);
		expect(htmlPointsMismatch(null, 0)).toBe(false);
		expect(htmlPointsMismatch(null, null)).toBe(false);
		expect(htmlPointsMismatchLine(null, 100)).toBe("This post has no points set, and its page's rubric adds to 100.");
	});
});
