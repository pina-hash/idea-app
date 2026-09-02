// tests/derived-numbers.test.ts
//
// A HAND-WRITTEN FILE NEVER HOLDS A COMPUTED VALUE (IDEA_instructions.md
// 4.17). `tools/browser-verify/README.md` carries a generated counts block
// between `<!-- counts:begin -->` and `<!-- counts:end -->`, written only by
// `tools/browser-verify/readme-counts.mjs` (`npm run verify:readme`). This
// test is what makes the block worth trusting: it reddens when a value in it
// was edited by hand, and when a route spec landed without regenerating it.
//
// WHAT IS CHECKED HERE, AND WHY NOT MORE. A full harness run needs a browser,
// a dev server and about five minutes, and README.md says at length why that
// stays outside `npm test` and outside CI (a browser-shaped flake must not be
// able to block a deploy to a classroom). So this test does NOT re-run the
// harness. It checks two things the generator can prove without one:
//
//   1. The STATIC counts (route specs, distinct routes, /dev pages, widths,
//      runs = specs x widths) against a live derivation from the same
//      `routes.mjs` the harness loads. A spec added without regenerating the
//      block reddens here.
//   2. The rendered table against the machine-readable `counts:data` line the
//      same run wrote beside it: `renderBlock(data)` must reproduce the
//      committed block byte for byte. A digit changed by hand in the table
//      reddens here, because the data line no longer renders to it.
//
// The MEASURED counts (measurements, findings, wall clock, self-test
// controls) are therefore checked for internal consistency and provenance,
// never against a fresh run: `npm run verify:readme -- --check` is that
// comparison, for a session that has the browser. A block that is honest but
// stale in its measured half passes here on purpose; a block that has been
// tampered with does not.
//
// The comparison logic lives in `readme-counts.mjs` (`verifyBlock`), imported
// here rather than reimplemented, so `--check` and CI cannot disagree about
// what "the block agrees" means.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	COUNTS_BEGIN,
	COUNTS_END,
	README_PATH,
	deriveStatic,
	parseBlock,
	renderBlock,
	verifyBlock
} from '../tools/browser-verify/readme-counts.mjs';

const readme = readFileSync(README_PATH, 'utf8');

describe('tools/browser-verify/README.md counts block', () => {
	it('carries exactly one generated block', () => {
		expect(readme.split(COUNTS_BEGIN).length - 1).toBe(1);
		expect(readme.split(COUNTS_END).length - 1).toBe(1);
		expect(() => parseBlock(readme)).not.toThrow();
	});

	it('renders byte-identically from its own counts:data line (a hand-edited digit reddens this)', () => {
		const { block, data } = parseBlock(readme);
		expect(renderBlock(data)).toBe(block);
	});

	it('agrees with the tree on every static count (a spec added without regenerating reddens this)', async () => {
		const live = await deriveStatic();
		// The live derivation must have found something, or every comparison
		// below is a comparison against zero.
		expect(live.specs).toBeGreaterThan(0);
		expect(live.routes).toBeGreaterThan(0);
		expect(live.devPages).toBeGreaterThan(0);
		const { data } = parseBlock(readme);
		expect({ specs: data.specs, routes: data.routes, devPages: data.devPages, widths: data.widths, runs: data.runs }).toEqual(live);
	});

	it('passes verifyBlock, the same predicate `npm run verify:readme -- --check` applies', async () => {
		const live = await deriveStatic();
		expect(verifyBlock(readme, { live })).toEqual([]);
	});

	it('names the commit and the instant it was measured at', () => {
		const { data } = parseBlock(readme);
		expect(data.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(Number.isNaN(Date.parse(data.date))).toBe(false);
		expect(data.outsideRows).toHaveLength(data.outside);
	});

	// POSITIVE CONTROL, permanent rather than a one-off mutation of the file:
	// the predicate must bite on a block whose table disagrees with its data
	// line, or the second test above could pass vacuously on a renderer that
	// ignores its input.
	it('verifyBlock reddens a block with one digit changed', async () => {
		const { block, data } = parseBlock(readme);
		const cell = `| Measurements | ${data.measurements} |`;
		expect(block).toContain(cell);
		const tampered = readme.replace(cell, `| Measurements | ${data.measurements + 1} |`);
		const live = await deriveStatic();
		const problems = verifyBlock(tampered, { live });
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join('\n')).toMatch(/edited by hand/);
	});

	it('verifyBlock reddens a block whose static count disagrees with the tree', async () => {
		const live = await deriveStatic();
		const problems = verifyBlock(readme, { live: { ...live, specs: live.specs + 1, runs: live.runs + live.widths.length } });
		expect(problems.join('\n')).toMatch(/specs: the tree derives/);
	});
});
