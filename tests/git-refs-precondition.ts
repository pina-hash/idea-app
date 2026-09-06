// tests/git-refs-precondition.ts
//
// ONE PRECONDITION, SHARED BY THE TWO SUITES THAT DRIVE THE REAL
// `tools/apply-migration.mjs`, so a checkout that cannot answer the question
// says so instead of failing on a string comparison.
//
// WHAT WENT WRONG WITHOUT IT. `main` was red on 2026-09-06 (CI run
// 34060552250: 2 failed of 6301, both here) and green in every session that
// ran the suite locally. The two failures read
//
//   expected 'apply-migration: 0180_notebook_grid_a…' to match
//   /REFUSING to apply 0180_notebook_grid_…/
//
// and
//
//   the CLI did not apply 0042
//
// -- sentences about the tool, pointing at the tool, in a bundle where the
// tool was behaving perfectly. Five sessions read them as a defect in
// `apply-migration.mjs`. The actual cause was one line of `ci.yml`:
// `actions/checkout@v4` with no `fetch-depth`, which fetches ONE commit and a
// refspec naming only the ref that triggered the run, so `origin/integration`
// -- which both suites pass to the CLI as `--ref` -- did not exist in the
// checkout. The tool then answered
//
//   REFUSING: the applied set could not be read
//   (could not list supabase/migrations on origin/integration).
//
// which is its designed fail-closed path, exit 2, nothing applied. Correct
// behaviour, reported as a wrong string.
//
// SO THE ASSERTION IS THE PRECONDITION, NOT A SKIP. A skip would let the suite
// go green in a checkout where it proved nothing about the tool at all, which
// is the vacuity shape this repository keeps finding (prompt 0082's inert
// `until`, prompt 0084's missing controls). It fails, and the message names
// the shallow clone and the one line that fixes it.
//
// AND IT ASKS THE QUESTION WITH THE TOOL'S OWN READER. `migrationsOnlyOn` in
// `tools/deploy-probe.mjs` is the exact function that throws on the real path
// -- it lists `supabase/migrations` on `origin/main` FIRST and then on the ref
// it was given, so one call covers both refs. A hand-written `git ls-tree`
// here would be a second implementation of "can this checkout see that ref",
// free to stop agreeing with the one that actually refuses.

import { migrationsOnlyOn, REPO_ROOT } from '../tools/deploy-probe.mjs';

/**
 * The ref both apply-migration suites hand the CLI as `--ref`. Named once so
 * the precondition and the spawn arguments cannot drift apart.
 */
export const PROBE_REF = 'origin/integration';

/**
 * Throw, with a message about the CHECKOUT rather than about the tool, unless
 * this working tree can read the refs `apply-migration.mjs` needs to derive the
 * applied set. Call it from `beforeAll`, before anything else.
 *
 * @param ref the ref the suite passes as `--ref`; both it and `origin/main` are
 *   exercised, because `migrationsOnlyOn` reads `origin/main` on its way.
 */
export function requireProbeRefs(ref: string = PROBE_REF): void {
	try {
		migrationsOnlyOn(REPO_ROOT, ref);
	} catch (err) {
		const why = err instanceof Error ? err.message : String(err);
		throw new Error(
			`THIS CHECKOUT CANNOT SEE THE REFS THE APPLIED-SET PROBE NEEDS, so this suite ` +
				`cannot say anything about tools/apply-migration.mjs. git said: ${why}\n` +
				`  This is a SHALLOW OR SINGLE-REF CHECKOUT, not a defect in the tool. ` +
				`The tool's answer in this state is "REFUSING: the applied set could not be ` +
				`read", exit 2, nothing applied -- which is correct and is the only control ` +
				`between a session and the production database.\n` +
				`  In GitHub Actions: give the job's actions/checkout@v4 step ` +
				`\`fetch-depth: 0\` (.github/workflows/ci.yml already does).\n` +
				`  In a local clone: git fetch origin ` +
				`'+refs/heads/*:refs/remotes/origin/*'  (add --unshallow if it is shallow).`
		);
	}
}
