// tests/hx-retest.test.ts
//
// LEDGER 0458, REPORT 23b3776c: the kit retest reads the kit test's own
// verdict line and writes one table. The browser half runs in CI
// (.github/workflows/kit-retest.yml); this holds the reading and the table.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// THE TOOL IS PLAIN JS, imported by a computed address so the type checker does
// not walk it (and the kit files it reads) as TypeScript.
const TOOL = new URL('../tools/hx-retest/retest.mjs', import.meta.url).href;
const { readVerdict, sourcesUnder, summaryTable } = (await import(/* @vite-ignore */ TOOL)) as {
	readVerdict: (t: string) => unknown;
	sourcesUnder: (d: string) => string[];
	summaryTable: (r: unknown[]) => string;
};

describe('the kit retest', () => {
	it('reads the verdict and the failing checks off the test output', () => {
		const out = [
			'PASS  import       The importer accepts the file',
			'FAIL  thumbnail    The thumbnail reads in every classroom slot  :: banner 600x56 dark: "Design" at 8.7px',
			'FAIL  layout       No sideways scroll at 375px (phone)  :: 16px too wide',
			'WARN  color        Colors tell apart',
			'',
			'2 FAIL, 1 WARN, 53 PASS.  Report: /x/report.md'
		].join('\n');
		expect(readVerdict(out)).toEqual({
			fail: 2,
			warn: 1,
			pass: 53,
			fails: ['thumbnail The thumbnail reads in every classroom slot', 'layout No sideways scroll at 375px (phone)']
		});
		expect(readVerdict('TypeError: boom')).toBeNull();
	});

	it('writes one row per page, a page that did not run says so, and a pipe cannot break the table', () => {
		const t = summaryTable([
			{ page: 'assignment-sources/a.src.html', fail: 0, warn: 1, pass: 50, fails: [] },
			{ page: 'assignment-sources/b.src.html', fail: 1, warn: 0, pass: 40, fails: ['layout A | B'] },
			{ page: 'assignment-sources/c.src.html', error: 'build failed: no marker' }
		]);
		const rows = t.split('\n');
		expect(rows).toHaveLength(5);
		expect(rows[2]).toBe('| assignment-sources/a.src.html | 0 | 1 | none |');
		expect(rows[3]).toBe('| assignment-sources/b.src.html | 1 | 0 | layout A \\| B |');
		expect(rows[4]).toBe('| assignment-sources/c.src.html | not run |  | build failed: no marker |');
	});

	it('finds every committed source', () => {
		const found: string[] = sourcesUnder('assignment-sources');
		expect(found.length).toBeGreaterThanOrEqual(20);
		expect(found.every((f) => f.endsWith('.src.html'))).toBe(true);
		expect(found.some((f) => f.endsWith('rotation-2-survey.src.html'))).toBe(true);
		expect(readFileSync('.github/workflows/kit-retest.yml', 'utf8')).toContain('tools/hx-retest/retest.mjs');
	});
});
