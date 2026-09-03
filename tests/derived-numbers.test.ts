// tests/derived-numbers.test.ts
//
// A HAND-WRITTEN FILE NEVER HOLDS A COMPUTED VALUE (IDEA_instructions.md
// 4.17). `tools/browser-verify/README.md` carries generated counts, written
// only by `tools/browser-verify/readme-counts.mjs`. This test is what makes
// them worth trusting: it reddens when a value was edited by hand, and when a
// route spec landed without regenerating.
//
// THERE ARE TWO REGIONS AND THEY ARE CHECKED AGAINST DIFFERENT THINGS. That
// asymmetry is the whole design (prompt 0019), not an omission:
//
//   STATIC   -- specs, distinct routes, /dev pages, widths, runs = specs x
//      widths. A tree read: no browser, no dev server, under a second. So it
//      is checked against a LIVE derivation from the same `routes.mjs` the
//      harness loads, on EVERY run of this suite. A spec added without
//      running `npm run verify:counts` reddens here, and reddens without a
//      browser being involved anywhere -- this project is vitest's `node`
//      project, which has no DOM package and no Chromium in the path at all.
//
//   MEASURED -- runs the report carried, measurements, measurements outside
//      threshold, wall clock, `--selftest` controls. Needs a browser and ~6
//      minutes, which README.md says at length must stay outside `npm test`
//      and outside CI (a browser-shaped flake must not be able to block a
//      deploy to a classroom). So it is checked ONLY against the
//      machine-readable data line the same run wrote beside it: a digit
//      changed by hand reddens, and a stale-but-honest measured half passes
//      on purpose. `npm run verify:readme -- --check` is the comparison
//      against a fresh run, for a session that has the browser.
//
// The comparison logic lives in `readme-counts.mjs` (`verifyStatic`,
// `verifyMeasured`, `verifyBlock`), imported here rather than reimplemented,
// so `--check` and CI cannot disagree about what "the region agrees" means.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	COUNTS_BEGIN,
	COUNTS_END,
	README_PATH,
	STATIC_SCRIPT,
	deriveStatic,
	parseMeasured,
	parseStatic,
	renderMeasured,
	renderStatic,
	verifyBlock,
	verifyMeasured,
	verifyStatic
} from '../tools/browser-verify/readme-counts.mjs';

const readme = readFileSync(README_PATH, 'utf8');

describe('tools/browser-verify/README.md counts regions', () => {
	it('carries exactly one envelope and one of each region', () => {
		// The OUTER pair is what `tools/idea-status.py` finds by exact string to
		// print the known-red harness findings; neither inner marker contains
		// it as a substring, which is why that tool still lands on the
		// envelope. Losing it breaks a tool outside this directory silently.
		expect(readme.split(COUNTS_BEGIN).length - 1).toBe(1);
		expect(readme.split(COUNTS_END).length - 1).toBe(1);
		expect(() => parseStatic(readme)).not.toThrow();
		expect(() => parseMeasured(readme)).not.toThrow();
	});

	it('the static region agrees with the tree (a spec added without regenerating reddens this)', async () => {
		const live = await deriveStatic();
		// The live derivation must have found something, or every comparison
		// below is a comparison against zero.
		expect(live.specs).toBeGreaterThan(0);
		expect(live.routes).toBeGreaterThan(0);
		expect(live.devPages).toBeGreaterThan(0);
		const { data } = parseStatic(readme);
		expect({
			specs: data.specs,
			routes: data.routes,
			devPages: data.devPages,
			widths: data.widths,
			runs: data.runs
		}).toEqual(live);
	});

	it('the static region carries no clock and no commit, so an unchanged tree regenerates to the same bytes', () => {
		const { data } = parseStatic(readme);
		// This is what makes `npm run verify:counts` a safe merge resolution:
		// with a date or a sha in here, two branches regenerating an UNCHANGED
		// count would still write two different blocks and still conflict.
		expect(Object.keys(data).sort()).toEqual(['devPages', 'routes', 'runs', 'schema', 'specs', 'widths']);
	});

	it('each region renders byte-identically from its own data line (a hand-edited digit reddens this)', () => {
		const stat = parseStatic(readme);
		expect(renderStatic(stat.data)).toBe(stat.block);
		const measured = parseMeasured(readme);
		expect(renderMeasured(measured.data)).toBe(measured.block);
	});

	it('passes verifyBlock, the same predicate `npm run verify:readme -- --check` applies', async () => {
		const live = await deriveStatic();
		expect(verifyBlock(readme, { live })).toEqual([]);
	});

	it('the measured region names the commit and the instant it was measured at', () => {
		const { data } = parseMeasured(readme);
		expect(data.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(Number.isNaN(Date.parse(data.date))).toBe(false);
		expect(data.outsideRows).toHaveLength(data.outside);
	});

	// POSITIVE CONTROLS, permanent rather than one-off mutations of the file.
	// Each proves a predicate BITES, so the assertions above cannot pass
	// vacuously on a renderer that ignores its input or a comparison that
	// compares nothing.

	it('verifyMeasured reddens a measured digit changed by hand', () => {
		const { block, data } = parseMeasured(readme);
		const cell = `| Measurements | ${data.measurements} |`;
		expect(block).toContain(cell);
		const tampered = readme.replace(cell, `| Measurements | ${data.measurements + 1} |`);
		const problems = verifyMeasured(tampered);
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join('\n')).toMatch(/edited by hand/);
	});

	it('verifyStatic reddens a static count that disagrees with the tree', async () => {
		const live = await deriveStatic();
		const problems = verifyStatic(readme, { ...live, specs: live.specs + 1, runs: live.runs + live.widths.length });
		expect(problems.join('\n')).toMatch(/out of date with this tree/);
		expect(problems.join('\n')).toContain('route specs');
		// The message names the SCRIPT and not the right number. A failure that
		// prints the number invites the hand edit the render check then refuses.
		expect(problems.join('\n')).toContain(STATIC_SCRIPT);
		expect(problems.join('\n')).not.toContain(String(live.specs + 1));
	});

	// THE THIRD CONTROL, AND THE ONE THE SPLIT EXISTS FOR: a static count
	// changed by hand in the rendered table reddens with NO browser and NO
	// measured report anywhere in the path. If this ever needs one, the two
	// halves have grown back together.
	it('verifyStatic reddens a static digit changed by hand, with no browser and no report', async () => {
		const { block, data } = parseStatic(readme);
		const cell = `| Route specs (\`routes/*.mjs\`, \`_\`-prefixed excluded) | ${data.specs} |`;
		expect(block).toContain(cell);
		const tampered = readme.replace(cell, `| Route specs (\`routes/*.mjs\`, \`_\`-prefixed excluded) | ${data.specs + 1} |`);

		// Without the live derivation at all: the render check alone is enough,
		// because the table no longer renders from its own data line.
		const alone = verifyStatic(tampered);
		expect(alone.length).toBeGreaterThan(0);
		expect(alone.join('\n')).toMatch(/edited by hand/);
		expect(alone.join('\n')).toContain(STATIC_SCRIPT);

		// And with it, exactly as `npm test` runs it.
		const live = await deriveStatic();
		expect(verifyStatic(tampered, live).length).toBeGreaterThan(0);

		// NEGATIVE HALF OF THE SAME CONTROL: the untampered file passes the
		// identical predicate, so the redness above is the edit and not the
		// predicate refusing everything.
		expect(verifyStatic(readme, live)).toEqual([]);
	});

	it('verifyStatic reddens a region whose markers a merge removed', () => {
		const tampered = readme.replace('<!-- counts:static:end -->', '');
		const problems = verifyStatic(tampered);
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join('\n')).toContain(STATIC_SCRIPT);
	});
});
