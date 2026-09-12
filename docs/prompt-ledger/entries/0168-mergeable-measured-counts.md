# 0168 The measured counts region loses races: make the merge additive

- Issued: 2026-09-12
- By: router chat
- Owns: `tools/browser-verify/README.md`, whatever under `tools/browser-verify/` writes its
  generated regions, `tests/derived-numbers.test.ts`,
  `docs/prompt-ledger/entries/0168-*`, and its own `docs/history/` entry. NO MIGRATION.
  NO FILE UNDER `src/`.
- Migration permitted: no. Claims: none. Highest on origin/integration at issue: 0202
- Status: issued
- Branch: `claude/sharp-gauss-kp749m`, branched from `origin/integration` at `ebf23dc`
- Runs in parallel with: ledgers 0166, 0167 and 0169. None of their files is touched here;
  0163 owns `.github/workflows/integrate.yml` and this bundle does not write it.
- Notes: THE PROBLEM IS STRUCTURAL, NOT A BUG. The measured counts region of
  `tools/browser-verify/README.md` is a single shared write point that loses races. It went
  stale at least four times on 2026-09-11; two sessions each spent a ~17-minute browser pass
  fixing the same staleness and one was discarded as redundant when another lane landed an
  equivalent pass mid-run. It fails in the shape nothing warns about -- GREEN PARENTS, RED
  MERGE -- and `integration` takes no push-triggered CI run, so nobody sees it until a
  landing bundle dispatches one by hand. `docs/history/` already solved this with a
  one-file-per-entry split; the measured region has never had that treatment. Design the
  fix, argue for it, and prove it on the real case: two branches that each add a route spec
  and each regenerate, merged, BEFORE and AFTER. Do not widen or weaken
  `tests/derived-numbers.test.ts` -- it is the only thing that has ever caught this.
