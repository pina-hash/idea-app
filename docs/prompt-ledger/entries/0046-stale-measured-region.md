# 0046 The report said zero because the route that measures it did not exist yet
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `tools/browser-verify/readme-counts.mjs`, `tools/browser-verify/README.md`, `tests/derived-numbers.test.ts`, `.github/workflows/ci.yml` if B3 requires it, the scripts block of `package.json`, `docs/prompt-ledger/entries/0046-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0043 found the sharpest thing in a week of them. The spec
  table's four row-action glyphs were a known, measured, deliberately
  recorded finding for two days -- and the generated counts block reported
  `0 outside threshold` for that finding's entire life, because the route
  that measures those glyphs was added AFTER the last full run.

  So the finding lived in a code comment, in a route file's prose, and in the
  output of a run nobody had regenerated. The one place a reader consults
  said there was nothing there.

  Prompt 0019 split the block precisely so a STATIC count could not go stale
  without a test noticing, and that half works: `derived-numbers` re-derives
  specs, routes and dev pages from the tree every run. The MEASURED half has
  no such check by design, because re-deriving it needs a browser and six
  minutes. That was a reasonable trade and this is its cost, arriving.

  Two further data points from the same week. Prompt 0042 found the measured
  region recorded on `4dc9df8`, several route-adding bundles earlier, and
  called it stale. Prompt 0041 found `derived-numbers` already RED on
  `integration` from a merge that kept one side's data line above the other
  side's prose.

  The question is not how to re-measure more often. It is how a reader can
  tell, from the block itself, that the number in front of them was measured
  against a tree that no longer exists.

  Deliberately excluded: making CI run the browser half, which prompt 0035
  priced at roughly tripling the job; the two workflows that consume this;
  and the findings themselves.
