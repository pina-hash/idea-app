# 0037 Land the last branch, and fix the CI filter that made three green branches invisible
- Issued: 2026-09-04
- By: router chat for IDEA portal work
- Owns: `.github/workflows/integrate.yml`, `.github/workflows/README.md`, `tools/integrate-gate-proof.sh`, `tests/workflows.test.ts`, the generated regions of `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0037-*`, its own `docs/history/` entry, and the merge of `claude/item-images-thumbnails-l3bhxp`.
- Migration permitted: no. Highest on origin/main at issue: 0179
- Status: issued
- Branch: assigned by the harness. BRANCHED FROM `origin/integration`.
- Notes: TWO THINGS, and the second cost most of 2026-09-04.

  ONE. `claude/item-images-thumbnails-l3bhxp` is the last outstanding branch.
  It conflicts on three files. Two are mechanical and the sweep now resolves
  them. The third is not: `tests/db/classroom-item-image-gate.test.ts` is an
  add/add conflict where BOTH SIDES ARE LEGITIMATE. The branch describes
  0176's gate as 0176 shipped it; `integration`'s copy is strictly newer and
  describes 0178's widening on top. Taking either side wholesale loses real
  work, which is why prompt 0034 stopped rather than guess.

  TWO. `integrate.yml`'s per-branch CI query passes `-f event=push`, so it
  asks GitHub only for CI runs triggered by a push. On 2026-09-04 three
  branches were re-run green by `workflow_dispatch`, the query returned
  nothing for their shas, all three read as `unknown`, and the sweep skipped
  every one of them. Nothing merged, so the push was discarded, so the deploy
  stayed blocked. A person merged them by pull request instead. Making a
  branch green by hand is the obvious remedy when a branch is red, and the
  sweep is written not to see it.

  Deliberately excluded: any change to what CI tests; the deploy probe, which
  is a separate concern; and the two mechanical resolutions, which prompt
  0035 already built and proved.
