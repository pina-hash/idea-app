# 0125 Verify hand-applied `0193`, merge `integration` into `main`, confirm the deploy from production

- Issued: 2026-09-10
- By: Mr. Pina, carrying his own verification output from the Supabase SQL
  editor run against production immediately after applying
  `supabase/migrations/0193_classroom_resource_layout.sql` by hand, and
  carrying ledger 0123's landing bundle as the shape this one repeats.
- Owns: the merge of `integration` into `main`, the reconciling merge of `main`
  into `integration`, `docs/prompt-ledger/entries/0125-*`, and its own
  `docs/history/` entry. It owns NO source file.
- Migration permitted: no. Claims: none. `0193` is Mr. Pina's, applied by hand
  before this bundle was issued.
- Lands on: nothing. **`integration` was RED on its tip and no merge was made.**
- Status: pushed
- Branch: `claude/migration-0193-verify-merge-slqdc8`, branched from
  `origin/main` at `02ede0f3`.
- Notes: a landing bundle, not a change bundle.

  **THE MIGRATION RULE, CHECKED FIRST AND RE-CHECKED BEFORE EVERY MERGE.**
  `git diff --name-only origin/main...origin/integration -- supabase/migrations/`
  printed exactly one path at `fd8e136e`:
  `supabase/migrations/0193_classroom_resource_layout.sql`. That is the file Mr.
  Pina applied by hand, which is why the migration stop does not fire for it and
  does not generalise to anything else. A second migration appearing in the
  range is a stop, named with the ledger entry claiming it. Prompt 0120 claims
  `0194`; it had not landed on `integration` while this bundle ran.

  **GATE 4 SUBSTITUTION, recorded by name as a deliberate deviation from
  `IDEA_instructions.md` 4.20, AND IT IS A THIRD ONE THAT GENERALISES TO
  NEITHER OF THE OTHER TWO.** Ledger 0114's rests on an EMPTY migration range --
  nothing for the gate to prove. Ledger 0115's rests on hand-applied `0192`.
  This one rests on hand-applied `0193` plus the eight-value verification block
  Mr. Pina ran in the Supabase SQL editor against production immediately after
  applying it, every value matching the expected set in `0193`'s own header:
  `columns_expect_2` 2, `checks_expect_2` 2, `functions_expect_7` 7,
  `anon_closed_expect_true` true, `authenticated_open_expect_true` true,
  `duplicate_carries_placement_expect_true` true,
  `moved_rows_expect_0_on_first_apply` 0, `sanitizer_expect`
  `Bridge-lab-final-v2-.png`.

  **I VERIFIED NONE OF THOSE EIGHT VALUES MYSELF, AND CANNOT.** No session in
  this container can reach the production database: the local `.env` is a
  placeholder project, and `node tools/deploy-probe.mjs` fails closed here with
  `DEPLOY_PROBE_URL is not set, so production's applied set cannot be read.
  This is "cannot confirm", never "applied."`, exit 1. That output is reported
  verbatim in the history entry. Its exit 1 is not treated as a stop, because
  the evidence gate 4 exists to produce came from production through the person
  who ran it, which is the only channel available. The probe's own rule stands
  unchanged: `CANNOT SAY` is never a pass, and what makes this bundle able to
  proceed is Mr. Pina's reading, not the probe's silence.

  **CONFLICT POLICY.** Conflicts are resolved on `integration`, never on `main`,
  and only in two files: the counts block of `tools/browser-verify/README.md`,
  hunk by hunk and never whole-file, and `classroom-updates.json` AT THE REPO
  ROOT -- not under `static/`, a path ledger 0123 found wrong in every prior
  prompt -- resolved textually keeping both sides' entries. Any other conflict
  is a stop.

  **THE DEPLOY IS READ, NOT INFERRED**, and this bundle never got to read one.
  Production was read BEFORE the merge as a baseline and stamped
  `v1.14 · 02ede0f · Sep 10, 2026`, matching `main`'s tip with a real date
  rather than `local build`. `main` did not move, so that is still what serves.

  **OUTCOME: STOPPED AT THE CI GATE. NOTHING MERGED, NOTHING DEPLOYED.** CI run
  `34430280567`, dispatched on the full forty-character sha
  `fd8e136ee300aacaa87036381064e5d76e8b14eb`, came back with the aggregator
  reading `check: success`, **`test: failure`**, `vanguard-changelog: success`,
  `history-verify: success` -- read from the step's own log, because
  `continue-on-error: true` makes all four report `conclusion: success` through
  the API. `Tests 5 failed | 6997 passed`, all five in
  `tests/derived-numbers.test.ts` under `tools/browser-verify/README.md counts
  regions`.

  It is a MERGE-RESULT defect and both parents were green, which is exactly what
  `ci.yml`'s header says this branch exists to catch. The final merge `fd8e136e`
  cleanly resolved `tools/browser-verify/README.md` to lane 0124's measured
  region (`edf397f8`), discarding lane 0118's (`8cf256a3`), leaving eleven
  classroom route specs in the tree that the region never measured while it
  claims zero measurements outside threshold. `git merge-tree` reports no
  conflict anywhere in the range, so the prompt's conflict policy never engaged
  -- and lane 0118's region is not a valid substitute either, covering 169 specs
  against the merged tree's 177. **Neither candidate is correct for the merged
  tree**, so the repair is a fresh browser pass and a regenerated measured
  region, which is a source file this bundle does not own.

  The full diagnosis, including the eleven unmeasured specs and the six the
  other candidate misses, is in
  `docs/history/migration-0193-verify-merge-slqdc8.md`.
