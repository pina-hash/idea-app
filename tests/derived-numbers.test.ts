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
//      threshold, wall clock, `--selftest` controls. TAKING the measurement
//      needs a browser and ~17 minutes, which README.md says at length must
//      stay outside `npm test` and outside CI (a browser-shaped flake must
//      not be able to block a deploy to a classroom). So it is checked
//      against the machine-readable data line the same run wrote beside it --
//      a digit changed by hand reddens -- and, since prompt 0046, against ONE
//      cheap fact about the tree: the SPEC FILES that run covered. `npm run
//      verify:readme -- --check` is the comparison against a fresh run, for a
//      session that has the browser.
//
//      SINCE PROMPT 0168 IT IS ALSO CHECKED AGAINST `measured/`, and that is
//      the check this file was missing. The measurement is one committed file
//      per route spec now, and the region is a pure function of that
//      directory -- so `renderMeasured(deriveMeasured())` is the region this
//      tree should carry, and comparing it is a `readdirSync` and a
//      `JSON.parse` with no browser in the path, exactly like the static
//      check beside it. It is a SECOND check, not a replacement: the
//      covered-set conjunction below is about the store against the TREE and
//      is unchanged, to the word.
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
//
// THIS STILL FAILS, AND THE SWEEP DOES NOT MAKE IT REDUNDANT (prompt 0050).
// `integrate.yml` now regenerates the STATIC region once on the merged tree
// before it pushes `integration`, which closes the one case neither this test
// nor prompt 0035's resolver could reach: two branches that each add ONE route
// spec each write the SAME number for their own tree, git takes the identical
// edit on both sides with no conflict, and the pushed tree holds one more spec
// than the region claims.
//
// PROMPT 0168 CLOSED THE OTHER HALF OF THAT SAME CASE, in the mechanism
// rather than in a guard. The MEASUREMENT is now one file per route spec
// under `tools/browser-verify/measured/`, so two lanes measuring two
// different specs write two different files, the merge is additive, and the
// merged store describes the merged tree by construction -- where the single
// line it replaces either conflicted (and `integrate.yml`'s resolver threw
// one lane's seventeen minutes away, which is ledger 0147's finding) or
// merged silently into a set that was neither lane's. Nothing here was made
// quieter to get that: every assertion and every control below is the one
// that was here, generalized where a legitimate change broke a literal, with
// the store checks added beside them.
//
// The two act at different times on different refs, so neither replaces the
// other, and the reconstruction says which has been doing the work: across
// every merge into `integration` since the region existed, NOT ONE sweep merge
// left the static region stale -- because this test reddens a branch that added
// a spec without regenerating, and the sweep merges only green branches. What
// this catches that the sweep cannot:
//
//   * A BRANCH. The sweep never touches a `claude/*` ref. This is what keeps
//     every branch's region honest for its own tree, which is the gate that has
//     actually been holding.
//   * A HAND EDIT, caught on the branch, before the sweep exists at all.
//   * `main`, which the sweep never pushes and which moves on its own via the
//     classroom export.
//   * A MEASURED HALF THE SWEEP CANNOT WRITE. Since 0168 the sweep's
//     `readme-counts.mjs --static` DOES rewrite the measured region -- it is a
//     tree read now -- but only when the static data line also moved, because
//     `counts_refresh` gates its commit on that line changing. A merge that
//     moved only the measurement leaves the block behind and the covered-set
//     and store rules below are what say so.
//   * A SWEEP RUN WHOSE REGENERATION FAILED. It warns and pushes anyway, by
//     design; the next branch's CI is what says the region is behind.
//
// MEASURED ON 2026-09-12, AND THE PAIR THIS REPLACES WAS STALE. It read
// "one static digit edited by hand in the rendered table reddens 7 of the 18
// tests here; the data line and the table edited together into a
// self-consistent lie about the tree reddens 8", measured 2026-09-05. Run
// against `origin/integration` at `ebf23dc` -- the tree those figures
// describe, unchanged -- the same two mutations redden **3** and **4** of 18.
// The file had moved under the numbers, which is what a figure written down
// rather than re-measured does. On this tree, with the store checks added,
// the identical two mutations redden **3** and **4** of 24: the same bite,
// with six more controls beside it. A hand-edited digit inside one
// `measured/*.json` reddens 3; deleting one of those files reddens 5.

import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	COUNTS_BEGIN,
	COUNTS_END,
	MEASURED_DIRNAME,
	MEASURED_SCHEMA,
	README_PATH,
	REPO_ROOT,
	SELFTEST_FILE,
	STATIC_SCRIPT,
	MEASURED_REGION,
	MEASURED_SCRIPT,
	deriveMeasured,
	deriveSpecFiles,
	deriveStatic,
	measuredDir,
	measurementFileFor,
	parseMeasured,
	parseStatic,
	readStore,
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
		expect(verifyBlock(readme, { live, specFiles: deriveSpecFiles(), store: deriveMeasured() })).toEqual([]);
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

	it('the measured region says which route specs it covers, sorted, one per route/width pair', () => {
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
		/* THE ZERO CASE IS BUILT, NOT ASSUMED, AND IT USED TO BE ASSUMED. This
		   read `expect(data.outside).toBe(0)` on the COMMITTED block, with the
		   comment "the committed block is the zero case" -- which is a claim
		   about the state of the repository rather than about the predicate
		   under test, and it is only true for as long as no surface is
		   deliberately left failing. Prompt 0047 landed exactly that: a
		   `tap-reach` row on `/dev/notebook`'s toolbar controls, red on purpose,
		   with decision 12 and an owner against it, because a number that
		   regenerates every run is the opposite of the standing finding
		   `IDEA_INTERFACE_STANDARDS` 10 (2.12) forbids. The committed block then
		   reported `outside: 2` and this control failed on the fixture rather
		   than on the rule -- the ratchet shape CLAUDE.md names, where the test
		   records what last happened instead of checking anything.

		   The rule is a CONJUNCTION (unmeasured spec AND the block claims
		   nothing was outside), so this control needs a zero-findings block. It
		   patches one, exactly as the `WHAT IT LETS THROUGH` control below
		   already patches a non-zero one with the same helper. Both halves now
		   drive the predicate over a region this file controls. */
		const zeroCase = withMeasured({ outside: 0, outsideRows: [] });
		expect(parseMeasured(zeroCase).data.outside).toBe(0);
		const pretend = [...deriveSpecFiles(), 'zzz-never-measured.mjs'].sort();

		const problems = verifyMeasured(zeroCase, { specFiles: pretend });
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
		expect(verifyMeasured(zeroCase, { specFiles: deriveSpecFiles() })).toEqual([]);
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
		const older = withMeasured({}).replace(`"schema":${MEASURED_SCHEMA}`, `"schema":${MEASURED_SCHEMA - 1}`);
		let problems: string[] = [];
		expect(() => {
			problems = verifyMeasured(older, { specFiles: deriveSpecFiles() });
		}).not.toThrow();
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(new RegExp(`schema ${MEASURED_SCHEMA - 1} and this script writes ${MEASURED_SCHEMA}`));
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

	// -------------------------------------------------------------------
	// THE STORE (prompt 0168). The measurement is one committed file per
	// route spec, and the rendered region is a pure function of it. These
	// are the checks that make the merge safe: a store the merge got right
	// and a block the merge got wrong is exactly what two lanes produce, and
	// before this the only thing that could see it was a browser.
	// -------------------------------------------------------------------

	it('the measured region is what this tree derives from `measured/` (a merged store reddens this)', () => {
		// THE MERGED-TREE CHECK. `deriveMeasured` reads the directory; the
		// committed block must be its rendering. Two lanes that each measure a
		// different spec write two different files, git merges both, and this
		// is what says the block has not caught up -- with no browser, on
		// every `npm test`, on a branch as well as on `integration`.
		const store = deriveMeasured();
		// The derivation must have found something, or the comparison below
		// is a comparison against the empty store.
		expect(store.covered.length).toBeGreaterThan(0);
		expect(store.measurements).toBeGreaterThan(0);
		expect(parseMeasured(readme).block).toBe(renderMeasured(store));
	});

	it('every measurement file names a spec this tree has, and is named after it', () => {
		const store = readStore();
		const tree = new Set(deriveSpecFiles());
		expect(tree.size).toBeGreaterThan(0);
		expect(store.specs.length).toBeGreaterThan(0);
		for (const m of store.specs) {
			expect(tree.has(m.spec)).toBe(true);
			expect(measurementFileFor(m.spec)).toBe(`${m.spec.replace(/\.mjs$/, '')}.json`);
			// A file with no width is a file that measured nothing, and a run
			// count that is not one per width came from a filtered pass.
			expect(m.widths.length).toBeGreaterThan(0);
			expect(m.runs).toBe(m.widths.length);
			expect(m.outsideRows).toHaveLength(
				m.outsideRows.filter((r) => typeof r.check === 'string').length
			);
		}
		// And the region's covered list IS the store's spec list. Two
		// spellings of "which specs are measured" is the pair that stops
		// matching.
		expect(parseMeasured(readme).data.covered).toEqual(store.specs.map((m) => m.spec).sort());
	});

	it('the store carries ONE file per spec and no shared line: two lanes cannot write the same file', () => {
		// THE PROPERTY THE SPLIT BUYS, asserted as a property rather than as a
		// count. A spec's measurement file is named from the spec file, which
		// `routes.mjs` derives from the spec's own `path` and refuses to let
		// two specs share -- so the map from spec to file is injective and two
		// lanes adding two specs always write two different files.
		const files = deriveSpecFiles().map(measurementFileFor);
		expect(new Set(files).size).toBe(files.length);
		expect(files.every((f) => f.endsWith('.json') && !f.startsWith('_'))).toBe(true);
	});

	it('`_selftest.json` carries no clock and no commit, so an unchanged instrument writes the same bytes', () => {
		// The static region's rule, one directory down and for the same
		// reason: with a date or a sha in it, two lanes that both ran
		// `--selftest` over an unchanged instrument would write two different
		// files and conflict on a value neither of them changed.
		const raw = JSON.parse(readFileSync(join(measuredDir(), SELFTEST_FILE), 'utf8'));
		expect(Object.keys(raw).sort()).toEqual(['controls', 'failures', 'negative', 'positive', 'schema']);
	});

	it('a store renders a SPAN when its measurements span two instants, and one instant when they do not', () => {
		// THE STATE A PARTIAL RE-MEASURE PRODUCES. A store seeded by a full
		// pass and then updated for one spec has no single measurement
		// instant, and claiming one would be the lie this region exists to
		// prevent. BOTH branches are driven from patched data rather than
		// from whichever state the committed store happens to be in: this
		// control asserted `oldest === date` on the committed block for one
		// commit, which is a claim about the repository rather than about the
		// renderer, and it failed on the first real partial re-measure -- the
		// ratchet shape, exactly as CLAUDE.md names it.
		const { data } = parseMeasured(readme);
		const one = '2026-02-02T00:00:00.000Z';
		const older = '2026-01-01T00:00:00.000Z';

		const span = renderMeasured({ ...data, oldest: older, date: one });
		expect(span).toContain(`measurements were taken between ${older} and ${one}`);
		expect(span).not.toContain(`measurements were taken at ${one}`);

		const single = renderMeasured({ ...data, oldest: one, date: one });
		expect(single).toContain(`measurements were taken at ${one}`);
		expect(single).not.toContain('measurements were taken between');

		// AND THE COMMITTED BLOCK SAYS WHICHEVER ITS OWN DATA IMPLIES, which
		// is the half that ties the renderer to the file rather than to a
		// fixture.
		expect(parseMeasured(readme).block).toContain(
			data.oldest === data.date
				? `measurements were taken at ${data.date}`
				: `measurements were taken between ${data.oldest} and ${data.date}`
		);
	});

	it('verifyMeasured reddens a block that disagrees with the store, and says to run the cheap command', () => {
		// POSITIVE CONTROL FOR THE MERGE CASE, built rather than assumed: a
		// store carrying one spec the block does not, which is byte-for-byte
		// what the merged tree of two measuring lanes looks like.
		const store = deriveMeasured();
		const merged = {
			...store,
			covered: [...store.covered, 'zzz-other-lane.mjs'].sort(),
			measurements: store.measurements + 7,
			runsMeasured: store.runsMeasured + 2
		};
		const problems = verifyMeasured(readme, { store: merged });
		expect(problems.length).toBeGreaterThan(0);
		const joined = problems.join('\n');
		expect(joined).toContain(MEASURED_DIRNAME);
		// IT NAMES THE SUB-SECOND COMMAND, not the browser one. Sending a
		// reader to a seventeen-minute pass to fix a merge is the coupling
		// this split removes, so the message that survives a merge must not
		// reintroduce it.
		expect(joined).toContain(STATIC_SCRIPT);
		expect(joined).not.toContain(MEASURED_SCRIPT);

		// NEGATIVE HALF: the real store against the same block is clean, so
		// the redness above is the disagreement and not the predicate
		// refusing everything handed to it.
		expect(verifyMeasured(readme, { store })).toEqual([]);
	});

	it('a measurement file whose name and `spec` disagree is REFUSED, never averaged in', async () => {
		// A rename is how one spec's numbers would quietly start standing for
		// another's, and the store is keyed on the filename. Driven over a
		// temporary copy of the real directory so the predicate under test is
		// `readStore` and not a fixture of its own shape.
		const tmp = mkdtempSync(join(tmpdir(), 'store-rename-'));
		try {
			cpSync(join(REPO_ROOT, 'tools', 'browser-verify'), join(tmp, 'tools', 'browser-verify'), {
				recursive: true
			});
			const dir = join(tmp, 'tools', 'browser-verify', MEASURED_DIRNAME);
			// NEGATIVE HALF FIRST: the copy reads clean, so the throw below is
			// the rename and not the copy.
			expect(readStore(tmp).specs.length).toBeGreaterThan(0);
			renameSync(join(dir, 'marks.json'), join(dir, 'zzz-renamed.json'));
			expect(() => readStore(tmp)).toThrow(/belongs in marks\.json/);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it('verifyStatic reddens a region whose markers a merge removed', () => {
		const tampered = readme.replace('<!-- counts:static:end -->', '');
		const problems = verifyStatic(tampered);
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join('\n')).toContain(STATIC_SCRIPT);
	});
});
