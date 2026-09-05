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
//      deploy to a classroom). So it is checked against the machine-readable
//      data line the same run wrote beside it -- a digit changed by hand
//      reddens -- and, since prompt 0046, against ONE cheap fact about the
//      tree: the SPEC FILES that run covered. `npm run verify:readme --
//      --check` is the comparison against a fresh run, for a session that has
//      the browser.
//
// WHY THAT THIRD RULE EXISTS, AND WHY IT IS A CONJUNCTION. A stale-but-honest
// measured half is a supported state. A stale measured half that prints
// `Measurements outside threshold: 0` for a finding the harness would have
// found is not honest, and on 2026-09-05 that was the live state of both
// `origin/main` and `origin/integration`: main's block was measured at
// `4dc9df8`, which predates `spec-table-empty-1.mjs` entirely, so the four
// row-action glyphs prompt 0039 measured at 23.2px were reported by the one
// generated place a reader consults as nothing at all. The recorded SHA did
// not help and could not: on a merge-heavy history a stale measurement's
// commit is still an ancestor of HEAD and reads as plausible.
//
// So `verifyMeasured` reddens on `unmeasured specs AND outside === 0`, and on
// nothing wider. It is a `readdirSync` -- no browser anywhere in this path.
// What it deliberately lets through is enumerated in that function and pinned
// by the controls at the bottom of this file.
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
	MEASURED_REGION,
	MEASURED_SCRIPT,
	deriveSpecFiles,
	deriveStatic,
	parseMeasured,
	parseStatic,
	renderMeasured,
	renderStatic,
	spliceRegion,
	unmeasuredSpecs,
	verifyBlock,
	verifyMeasured,
	verifyStatic
} from '../tools/browser-verify/readme-counts.mjs';

const readme = readFileSync(README_PATH, 'utf8');

/**
 * A README whose measured region is REGENERATED from patched data, so the
 * region stays self-consistent and the render check does not fire. That is
 * what makes the coverage controls below test the coverage rule and not the
 * hand-edit rule -- a tampered digit reddens for the wrong reason and would
 * make every one of them pass vacuously.
 */
function withMeasured(patch: Record<string, unknown>) {
	const { data } = parseMeasured(readme);
	const next = { ...data, ...patch };
	return spliceRegion(readme, MEASURED_REGION, renderMeasured(next));
}

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
		expect(verifyBlock(readme, { live, specFiles: deriveSpecFiles() })).toEqual([]);
	});

	it('the measured region names the commit and the instant it was measured at', () => {
		const { data } = parseMeasured(readme);
		expect(data.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(Number.isNaN(Date.parse(data.date))).toBe(false);
		expect(data.outsideRows).toHaveLength(data.outside);
	});

	// -------------------------------------------------------------------
	// COVERAGE (prompt 0046). The cheap half of "was this measured against
	// this tree": which route spec FILES the recorded run visited.
	// -------------------------------------------------------------------

	it('the measured region says which route specs it covered, sorted, one per route/width pair', () => {
		const { data } = parseMeasured(readme);
		const live = deriveSpecFiles();
		// The derivation must have found something, or every set comparison
		// below is a comparison against the empty set.
		expect(live.length).toBeGreaterThan(0);
		expect(live).toContain('spec-table-empty-1.mjs');

		expect(Array.isArray(data.covered)).toBe(true);
		expect(data.covered.length).toBeGreaterThan(0);
		expect([...data.covered].sort()).toEqual(data.covered);
		// Structural, not a second copy of the width count: `run.mjs` pushes
		// one run per spec per width with no branch, so a region whose covered
		// list does not divide its run count came from a filtered pass.
		expect(data.runsMeasured % data.covered.length).toBe(0);
	});

	it('no route spec in this tree is both unmeasured and reported as nothing', () => {
		// THE RULE ITSELF, stated where a reader of this file will look for it.
		// It does not demand a fresh measurement -- see the let-through control
		// below -- only that a block claiming zero findings covered the routes
		// this tree actually has.
		const { missing } = unmeasuredSpecs(parseMeasured(readme).data, deriveSpecFiles());
		const { data } = parseMeasured(readme);
		if (data.outside === 0) expect(missing).toEqual([]);
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

	// --- coverage controls. Each drives the REAL predicate over a region this
	// file regenerates from patched data, so it is the coverage rule under
	// test and never the hand-edit rule firing first.

	it('verifyMeasured reddens an unmeasured spec when the block claims nothing was outside threshold', () => {
		const { data } = parseMeasured(readme);
		expect(data.outside).toBe(0); // the committed block is the zero case
		const pretend = [...deriveSpecFiles(), 'zzz-never-measured.mjs'].sort();

		const problems = verifyMeasured(readme, { specFiles: pretend });
		expect(problems.length).toBeGreaterThan(0);
		const joined = problems.join('\n');
		// IT NAMES THE ROUTE, which is the whole point: 0043's finding lived
		// for a day behind the word "0", and a total cannot say which route
		// went unlooked-at.
		expect(joined).toContain('zzz-never-measured.mjs');
		expect(joined).toContain(MEASURED_SCRIPT);
		// And it names only the one that is actually missing.
		expect(joined).not.toContain('spec-table-empty-1.mjs');

		// NEGATIVE HALF: the real spec list against the same block is clean, so
		// the redness above is the missing spec and not the predicate refusing
		// everything handed to it.
		expect(verifyMeasured(readme, { specFiles: deriveSpecFiles() })).toEqual([]);
	});

	it('WHAT IT LETS THROUGH: an unmeasured spec beside a non-empty findings list', () => {
		// The rule is a CONJUNCTION. A block already naming findings is not
		// telling a reader there is nothing to see, and failing here would put
		// a six-minute browser run in front of every bundle that adds a spec --
		// which is the coupling the two-region split exists to remove.
		const rows = [
			{ path: '/dev/example', width: 375, check: 'tap-target', label: 'known finding' },
			{ path: '/dev/example', width: 1440, check: 'tap-target', label: 'known finding' }
		];
		const withFindings = withMeasured({ outside: rows.length, outsideRows: rows });
		const pretend = [...deriveSpecFiles(), 'zzz-never-measured.mjs'].sort();

		expect(verifyMeasured(withFindings, { specFiles: pretend })).toEqual([]);

		// POSITIVE CONTROL ON THE CONJUNCTION: the same tree list against the
		// same block with the findings taken back out DOES redden, so this is
		// the `outside` term doing the work and not `withMeasured` producing
		// something the predicate cannot read at all.
		const backToZero = withMeasured({ outside: 0, outsideRows: [] });
		expect(verifyMeasured(backToZero, { specFiles: pretend }).join('\n')).toContain('zzz-never-measured.mjs');
	});

	it('WHAT IT LETS THROUGH: a spec deleted since the measurement, which is reported and never failed on', () => {
		// A measurement over a SUPERSET of this tree still has a valid zero
		// here, so refusing it would block a bundle that only deleted a spec.
		const shorter = deriveSpecFiles().filter((f) => f !== 'spec-table-empty-1.mjs');
		expect(shorter.length).toBe(deriveSpecFiles().length - 1);

		expect(verifyMeasured(readme, { specFiles: shorter })).toEqual([]);
		const { missing, removed } = unmeasuredSpecs(parseMeasured(readme).data, shorter);
		expect(missing).toEqual([]);
		expect(removed).toEqual(['spec-table-empty-1.mjs']);
	});

	it('verifyMeasured reddens a region written from a filtered run', async () => {
		const live = await deriveStatic();
		const { data } = parseMeasured(readme);
		// Half the widths' worth of runs: what a `run.mjs --only` report looks
		// like once it reaches this region.
		const filtered = withMeasured({ runsMeasured: data.covered.length });
		const problems = verifyMeasured(filtered, { widths: live.widths.length });
		expect(problems.join('\n')).toMatch(/not a full pass/);
		expect(problems.join('\n')).toContain(MEASURED_SCRIPT);
		// Negative half, same predicate, same width count.
		expect(verifyMeasured(readme, { widths: live.widths.length })).toEqual([]);
	});

	it('a region of another schema is REPORTED, never rendered (it would throw)', () => {
		// Found while bumping the measured schema to 2: `verifyMeasured` put an
		// older region through this version's renderer and died with `Cannot
		// read properties of undefined` out of a function whose entire job is
		// to report problems rather than raise them.
		const older = withMeasured({}).replace('"schema":2', '"schema":1');
		let problems: string[] = [];
		expect(() => {
			problems = verifyMeasured(older, { specFiles: deriveSpecFiles() });
		}).not.toThrow();
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/schema 1 and this script writes 2/);
	});

	it('a data line missing a field the renderer reads is REPORTED, never rendered', () => {
		// The same defect one field down: a data line can say `"schema":2` and
		// still have lost `covered` to a merge or a hand edit, and the schema
		// guard would wave it straight into the renderer.
		const { data } = parseMeasured(readme);
		for (const key of ['covered', 'outsideRows', 'sha', 'date']) {
			const { [key]: _dropped, ...rest } = data as Record<string, unknown>;
			const truncated = spliceRegion(
				readme,
				MEASURED_REGION,
				renderMeasured(data).replace(JSON.stringify(data), JSON.stringify(rest))
			);
			let problems: string[] = [];
			expect(() => {
				problems = verifyMeasured(truncated, { specFiles: deriveSpecFiles() });
			}).not.toThrow();
			expect(problems).toHaveLength(1);
			expect(problems[0]).toContain(key);
			expect(problems[0]).toContain(MEASURED_SCRIPT);
		}
		// NEGATIVE HALF: the intact data line put through the identical path is
		// clean, so the four failures above are the dropped field and not the
		// splice.
		expect(verifyMeasured(withMeasured({}), { specFiles: deriveSpecFiles() })).toEqual([]);
	});

	it('verifyStatic reddens a region whose markers a merge removed', () => {
		const tampered = readme.replace('<!-- counts:static:end -->', '');
		const problems = verifyStatic(tampered);
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join('\n')).toContain(STATIC_SCRIPT);
	});
});
