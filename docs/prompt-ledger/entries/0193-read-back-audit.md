# 0193 Read back over ledgers 0103 through 0192: five questions, evidence only

- Issued: 2026-09-12
- By: router chat
- Owns: `docs/audits/**`, `docs/prompt-ledger/entries/0193-*`, and its own
  `docs/history/` entry. NO FILE UNDER `src/`, NO TEST, NO MIGRATION, NO WORKFLOW, NO
  DECISION ENTRY. This bundle changes nothing: it reads, measures, and writes one
  document. A finding is REPORTED with file and line, never fixed.
- Migration permitted: no. Claims: none.
- Status: pushed
- Branch: `claude/gallant-mendel-xsgp0w`, branched from `origin/integration` at `7f5ca8f0`.
- Notes: A read-only audit collides with nothing and can run beside every other lane.
  Five questions: (1) what a lane said it would not do, each item re-checked against the
  tree before listing; (2) whether any green test is vacuous; (3) whether any migration in
  0193-0210 contradicts another; (4) whether the applied record is honest; (5) what exists
  only as prose in a report. `verify:readme` is deliberately NOT run.

## Outcome

**`docs/audits/2026-09-12-ledgers-0103-0192-read-back.md`, 1198 words, eleven sections.**
Nothing else was written: three docs files in the whole branch, no `src/`, no test, no
migration, no workflow, no decision entry.

Q1: **eight items still open and eight already shipped** -- a 50% stale rate, worse than the
four-in-eight the prompt braced for, so the re-check was the work. Q2: **nothing found**; the
sweeps written after this window's six instrument failures carry case-count floors and
positive controls, and four negative probes are named in the audit so the next one need not
repeat them. Q3: **no contradiction** -- the only cross-file overlap in `0193`-`0208` is `0205`
replacing seven of `0201`'s functions with all seven parameter lists identical; the real defect
is that `0202` is no longer re-appliable. Q4: **zero records for sixteen hand-applied
migrations**, with a working writer that cannot run from a session. Q5: the top item --
`tools/idea-status.py:188` reads `Status: open` and never `Build:`, so two decisions Mr. Pina
has already answered are in no list, and one of those two is itself stale.

**Item 0 was found by being in the pipeline rather than by reading it**: 37 standing agent
branches, 35 conflicting with `integration`, and three consecutive red Integrate runs. The
ledger status gate worked correctly on the way past -- this branch's first CI run went green
while this entry read `issued` and the sweep skipped it.

**Item 0 was then corrected by its own evidence.** The first version said a red Integrate run
carries no information; run `34723007701`, the one that swept this branch, says `integration
ITSELF WAS PUSHED and is not blocked -- this run is red for that reason as well as for anything
the suite found`, and also `the merged tree passes the suite -- Tests 8318 passed (8318)`. The
correction is marked in the audit with the quote that forced it, and `merged_suite` working means
decision 21's build is now unblocked rather than merely owed.

**`integration` was NOT merged into `main`.** Gates 1, 2, 4 (under ledger 0114's substitution,
the range carrying no migration), 5 and 6 were met on tip `88f0f26f` with CI run `34723104326`
green on that exact sha; the sweep then moved `integration` to `ee3da2f8`, taking ledger 0191's
bundle with it. Merging would land another lane's unreviewed `CLAUDE.md` edit and test, on a tip
whose CI this bundle has not read, with production unreachable to confirm the deploy. Reported as
a stop rather than taken.

**Measured**: `npm test` 433 files / 8318 tests / 0 failures (twice, before and after the
docs); `svelte-check` 0 errors / 37 warnings in 20 files (31/5/1), agreeing with `CLAUDE.md`
with no correction needed. **Production unreachable** (proxy 403), so the six-item checklist's
deploy confirmation is not available from here. The prompt's `0209`/`0210` do not exist; the
chain ends at `0208`.
