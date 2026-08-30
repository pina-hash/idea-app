---
title: "Three bundles landed as one integration merge (`claude/integration-three-feature-merges-8i1zec`, no migration of its own)"
date: 2026-08-27
branches: [claude/integration-three-feature-merges-8i1zec]
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 165
---

Three independently-developed branches, merged into one integration branch with
`--no-ff` in this order so they land as a single merge rather than three that
conflict in sequence: `claude/scheduled-checkin-future-status-vqlnpu` (a check-in
dated in the future is scheduled, not missing -- `0140`), `claude/rubric-staging-creation-k3g9lw`
(a rubric can be staged at assignment creation; a second notebook check-in can
sit on one item), and `claude/editable-table-cell-wrap-v7jq0i` (an assignment
table cell wraps while editing; PeoplePanel's last mono-tone tally gets a hue).
Started from `main` at `874c5b567deb4d8411137a3a3baacf7be9cddd69`, which already
carried the Foundry telemetry bundle (`0139`).

### Conflict resolution

Exactly two files conflicted on every one of the three merges, as expected --
`docs/HISTORY.md` and `classroom-updates.json` -- and nothing else did.

- **`docs/HISTORY.md`**: each conflict was two dated entries landing at the same
  point in the file (one from `main`'s side, one from the branch), never a
  contested edit to the SAME entry. Resolved by keeping both, in the order they
  were written, separated by the file's own `---` rule -- no section dropped, no
  marker left behind. The first merge also had a two-line migration-index-table
  conflict (`0139`'s row versus `0140`'s row); both rows are kept, in numeric
  order.
- **`classroom-updates.json`**: a text-level keep-both would have produced a file
  with duplicate JSON keys that fails to parse, so each conflict was resolved by
  parsing both sides, taking the union of `entries` by `(date, title, body)`
  identity, sorting by `date`, and re-serializing with the file's own tab
  indentation. `_readme` is identical on every side and was kept as is. The
  three merges brought the entry count from 99 to 100 to 101; the final file
  parses (`python3 -c "import json; json.load(open(...))"`) and was read back
  through the app's own shape (`{_readme, entries}`).

No other file conflicted across any of the three merges -- verified by
`git diff --name-only --diff-filter=U` after each `git merge --no-ff`, which
listed only the two files above every time.

### Migration ordering: `0139` then `0140`

`0139_foundry_telemetry.sql` (already on `main`) and
`0140_notebook_scheduled_check_ins.sql` (arriving with the scheduled-checkin
branch) had never been applied in sequence anywhere before this branch. Neither
touches a table, function or policy the other one names -- Foundry telemetry and
the notebook review grid are unrelated subsystems -- so the risk was purely
mechanical: two migrations landing adjacent in the numbered chain for the first
time.

No single test in the suite runs the ENTIRE historical chain end to end (each
test's own `CHAIN` is a scoped subset relevant to its subsystem, per this file's
own testing conventions, and a literal apply-everything attempt against the stub
fails on an unrelated early migration, `0043_fsp_qa.sql`, that assumes
`auth.jwt()` exists outside the harness's minimal `auth` stub -- a stub
limitation, not a real ordering defect). So this was verified directly: a
temporary vitest file (removed before this commit, never part of the permanent
suite) built the same chain `tests/foundry-telemetry.test.ts` already exercises
for `0139` (ending on `0137`'s anon-execute sweep, exactly as the real project
applies it), added `0098_notebook_session_postings.sql` (a real dependency
`0140` needs that the Foundry-only chain does not carry), and appended `0140` at
the end, matching production apply order. Two assertions against a real
embedded Postgres:

1. The whole chain -- `0139` then `0137` then `0140` -- applies with no error.
2. Re-pasting `0139` then `0140` a second time over the same database (ordinary
   here; migrations are idempotent where practical) applies with no error
   either.

Both passed. **`0139_foundry_telemetry.sql` and `0140_notebook_scheduled_check_ins.sql`
apply cleanly in sequence.**

### Full suite

**134 files / 3096 tests, all passing.** Each of the three branches' own numbers,
measured against its own base (a common ancestor whose test count was
independently confirmed at 131 files / 3030 tests by running the suite at that
commit in a throwaway worktree): the table-cell branch at 131/3030 (its two
changed tests are in-place assertion edits -- an `<input>` became a `<textarea>`
match, a `value="1"` became a text-content match -- so it adds zero tests, zero
files, and its own reported total equals the base exactly), the rubric-staging
branch at 131/3036 (+6 tests, +0 files), the scheduled-checkin branch at
132/3059 (+29 tests, +1 file: `tests/notebook-scheduled-check-ins.test.ts`), and
`main`'s own Foundry telemetry bundle at 133/3061 over the same base (+31 tests,
+2 files: `tests/foundry-telemetry-surfaces.test.ts` and
`tests/foundry-telemetry.test.ts`).

Summed: 3030 (base) + 0 (table-cell) + 6 (rubric) + 29 (scheduled-checkin) + 31
(Foundry telemetry) = **3096**, and 131 + 0 + 0 + 1 + 2 = **134** files -- both
exactly what the combined run measured. The four deltas are additive with no
loss and no double-count: nothing that passed alone failed in combination, and
nothing landed on the same test file from two branches at once (`git diff --stat`
against `main` for each branch, run before merging, confirmed each branch's test
changes stay inside files no OTHER branch in this integration also touches).

### `svelte-check`

**0 errors, 37 warnings**, mix 31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class` -- matches the documented
baseline exactly, re-derived with `svelte-kit sync` first and a placeholder
`.env` (this container ships with neither) rather than trusted from this file.

### `npm run verify:browser`

**18 route/width runs, 120 measurements, 2 outside threshold** -- both the
known, pre-existing `/dev/pathways` harness-controls tap-target finding (194.7 x
26.2px, at both 375px and 1440px; the harness's own dev-only controls, not a
student-facing surface), unchanged from every branch's own baseline. One run
also showed a `net::ERR_ABORTED` on a background `__data.json` invalidation
fetch that did not reproduce on a second run -- flaky, not a finding, per this
file's own standing note on the instrument.

### What appeared only in combination

Nothing. Every number above lands exactly where the additive arithmetic
predicts: no test passing alone and failing in combination, no migration
conflict, no new `svelte-check` finding, no new browser-verify finding. The
only work this session did beyond the merges themselves was proving the `0139`
-> `0140` migration adjacency (never previously exercised) and re-deriving the
combined test/file counts from first principles rather than trusting the
arithmetic.

### What was NOT verified

- No production or preview deployment; nothing here was opened on
  `ideabosco.com` or a Vercel preview.
- No signed-in surface and no live Supabase project -- the placeholder `.env`
  convention every prior bundle here has used; `SUPABASE_ACCESS_TOKEN` was
  never set and `supabase db push` was never run.
- Neither `0139` nor `0140` was applied to any live database by this session --
  both are pasted into the Supabase SQL editor by hand, in that order, after
  this branch is reviewed.
- `npm run build` was not run (the Windows EPERM trap does not apply on Linux,
  and a build was not part of this pass).
- This branch was not merged to `main` and nothing was force-pushed.

