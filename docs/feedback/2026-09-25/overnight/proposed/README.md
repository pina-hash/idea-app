# Proposed SQL from the overnight run (ledger 0298)

**These files are proposals, not migrations. Nothing applies them, and nobody should paste them
as they stand.** They were written on the night of 2026-09-25 while the automatic migration apply
(`.github/workflows/migrate.yml`) was failing on a rejected database password, so rule 1 of
`docs/feedback/2026-09-25/OVERNIGHT_BRIEF.md` held: nothing goes under `supabase/migrations/`, and no
shipped code calls an RPC, column or table that production does not have (production holds exactly
the files in `supabase/migrations/`, highest 0224).

Each proposal carries the numbers the brief reserved for it (0228 for decision 37, 0229 for
decision 38), a header saying what it does, what undoes it and its deploy ordering, apply-time
self-checks that raise, and a `tests/db/` test that applies it **from this directory** over the real
chain through 0224. A proposal is only as good as that test: run it before trusting anything here.

## How to apply one later

1. A session with working credentials (or Mr. Pina, by hand) **promotes** it: `git mv` the file to
   `supabase/migrations/` under the same name, and change the one path constant at the top of its
   test. The test's chain filter keeps measuring the deployed functions first either way.
2. Run that one test file (`npx vitest run tests/db/<its test>`), read the `Tests` summary line and
   stderr, and follow the file's own "PROMOTING IT" notes (a CLAUDE.md edit, a `docs/history/`
   entry, a ledger entry).
3. Land it on `main`. `migrate.yml` applies the lowest unapplied migration on each push, one file per
   push; `node tools/apply-migration.mjs <number>` is the same thing by hand, and a paste into the
   Supabase SQL editor is the fallback. Paste the verification query at the foot of the file
   afterwards.
4. Numbers 0225 to 0227 were allocated to other ledgers (0285, 0296, 0297) and no file exists for
   any of them tonight. Gaps in the sequence are normal in this repository; a proposal promoted here
   applies after whatever lower number has landed by then.

## Order

**0228 first, then 0229.** They touch different subsystems (the classroom answer write and IdeaCAD's
write predicates) and do not depend on each other, so the order is only the lowest-first rule. The
**split-out lock change** described inside 0228 (see below) needs a number of its own from the
ledger and must land **after** 0228: it refuses to apply without 0228's table.

## 0228: an answer's edit history (decision 37)

- **File:** `0228_classroom_response_revisions.sql`. **Test:**
  `tests/db/proposed-0228-response-history.test.ts` (19 tests, green, about 5 s: the full chain
  through 0224 is 220 files).
- **What it does.** A new append-only table, `classroom_response_revisions`, written inside
  `classroom_save_response` (the one function that writes student answers), for a spec assignment
  and a ported HTML worksheet alike. One revision per block per 10-minute burst (measured from the
  start of the burst), frozen at every grade and regrade, with a **baseline** revision that keeps an
  answer stored before the table existed the first time it is overwritten. A save that changes
  nothing records nothing. Teacher and admin read it (the grading console's own
  `classroom_can_review_submission`); a student, a classmate and a teacher of another class read
  nothing; `anon` holds nothing; no client role can write it. Kept for as long as the assignment
  exists: no delete path, no expiry.
- **What it deliberately keeps.** Every refusal the save gives, in the same order, and the success
  payload `{"ok": true}` byte-for-byte: the test puts a 39-case corpus (21 refusals, 18 successes,
  both engines, both locks, grading, approval) to the deployed function, applies the proposal over
  the same database and compares case for case. **0 differences.** So it has **no deploy
  ordering**: it is additive, and the migration and any client deploy may land in either order.
- **The lock change is split out, not in this file.** Decision 37 item 2 (a student's own completion
  must stop locking saves) done the obvious way ("lock only an instructor's close") would silently
  break the close Mr. Pina asked for in 0198: the test measures that closing an assignment leaves a
  student's own turned-in row **byte-identical** (`changed: false`), so no rule over that row can
  tell "turned in" from "turned in, then closed". Doing it right needs a `closed_at` column and
  re-signs four live functions, so it gets its own file, stated precisely in 0228's header
  (items a to g), which must land after 0228.
- **Safety nets inside the file.** It refuses to replace `classroom_save_response` unless the
  deployed body is exactly 0197's (md5, carriage returns ignored), so it cannot silently revert a
  later hotfix; it checks the table's columns, the one overload, every refusal literal, the position
  of the new call (after the last refusal, before the write), the grants, and that the one policy is
  the reviewer rule alone; and it runs a rolled-back fixture that exercises the baseline,
  coalescing, the no-op and the grade boundary on the real server.
- **Measured tonight** (all from the test): mutation proof on the read rule and the boundary, each
  file copy restored from a saved copy and md5-checked. `using (true)` on the policy is refused at
  apply by the self-check; with that check disabled too, the READS test catches it (a teacher saw 23
  rows where 22 belong to their class). A student branch added to the policy (check disabled) is
  caught by the same test (the student read his own 7 revisions where 0 is right). Removing the
  grade boundary is refused at apply; with the fixture's grade half disabled, two boundary tests
  fail. Granting `anon` SELECT is refused at apply.
- **Known limit, written in the header:** a save landing in the same few milliseconds as a
  student's FIRST grade (when no submission row exists yet to lock) can be absorbed into the
  pre-grade revision; its timestamps still show it.
- **Undo** (in this order, by hand): re-run section 4 of
  `supabase/migrations/0197_classroom_html_assignment_write_gate.sql`, then drop the helper, then
  drop the table (which loses every recorded revision).
