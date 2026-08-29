---
title: "gauntlet-authoring-tolerance.test.ts asks a real Postgres for the effective tolerance default instead of regex-parsing a `constant` out of migration SQL, so 0147's parallel refactor of `c_volume_tol_pct` into `_gauntlet_tol_pct` stops reddening a passing form (`claude/gauntlet-tolerance-test-fix-u79q4y`, no migration)"
date: 2026-08-29
branches: [claude/gauntlet-tolerance-test-fix-u79q4y]
migrations: []
subsystems: ["Testing", "GAUNTLET"]
---

## gauntlet-authoring-tolerance.test.ts asks a real Postgres for the effective tolerance default instead of regex-parsing a `constant` out of migration SQL

### What was broken, and why it was not a grading regression

`0146_gauntlet_reveal_all_modeling_modes.sql` shipped a test
(`tests/gauntlet-authoring-tolerance.test.ts`) pinning the GAUNTLET authoring
form's seeded volume tolerance to the server's own default, read out of the
newest migration defining `gauntlet_macro_submit` with a regex:
`c_volume_tol_pct\s+constant\s+numeric\s*:=\s*([0-9.]+)\s*;`.

`0147_gauntlet_close_target_disclosure.sql`, built in parallel with no sight of
0146, refactored that same constant into a shared SQL function,
`public._gauntlet_tol_pct(answer)`, so three grading paths (`gauntlet_submit`'s
Speedrun branch, `gauntlet_macro_submit`, `gauntlet_room_manual_submit`) agree
on one number instead of three inline copies. The value is unchanged (0.1);
`gauntlet_macro_submit`'s newest definition (0147) no longer declares a local
`c_volume_tol_pct` at all, so the regex found nothing and threw. Two tests
failed on `integration`:

- `parses a real constant out of a real migration (instrument check)`
- `GAUNTLET_DEFAULT_TOLERANCE_PCT equals the server constant`

Confirmed before touching anything: `_gauntlet_tol_pct` in 0147
(`supabase/migrations/0147_gauntlet_close_target_disclosure.sql:157-164`) is
`select coalesce(nullif(p_answer ->> 'tolerance_pct', '')::numeric, 0.1)` --
the effective default is still 0.1, identical to 0036/0061's inline constant.
This was an instrument failure, not a real disagreement between the form and
the server, and not a grading regression.

### Why the fix is "ask a real Postgres", not "widen the regex"

The regex was coupled to how 0036 happened to SPELL the default (a local
`constant numeric` declaration inside `gauntlet_macro_submit`) rather than to
what the default MEANS (the pass/fail boundary a submission is actually
graded against). Widening the pattern to also match `_gauntlet_tol_pct`'s body
would fix this one collision and leave the same coupling in place for the
next one -- a lookup table, a per-mode override, anything that isn't a bare
`numeric := <literal>` assignment defeats it again, silently, the next time
two bundles touch this in parallel.

`tests/db/harness.ts` already boots a real embedded Postgres and applies the
repo's real migration files verbatim (this is what 0146's and 0147's own test
suites, `tests/gauntlet-target-disclosure.test.ts` among them, already do for
this exact feature). The rewritten test seeds a published Speedrun level whose
`answer` carries no `tolerance_pct` at all, then calls the REAL
`gauntlet_submit` RPC (no run token needed -- it's the unranked practice
branch) with a mass just inside and just outside
`GAUNTLET_DEFAULT_TOLERANCE_PCT`'s implied band, and asserts the server's own
`is_correct` verdicts. Whichever shape the default takes five migrations from
now, this still asks the one question that has to keep meaning the same thing
for the RPC to keep grading correctly at all: "does a submission at this
deviation pass". An instrument-control block (`it.each` over three distinct,
mutually-exclusive explicit `tolerance_pct` values) proves the probe itself
discriminates pass from fail and tracks whichever band a level is given,
rather than always answering one fixed thing -- the behavioural equivalent of
the old regex test's own multi-value instrument check.

One remaining assertion (`gauntlet_publish_blocker requires an explicit band
to publish`) still reads migration SQL directly with the same
`newestDefinitionOf`-style helper. That is deliberate and is not the same
mistake: it is pinning the literal TEXT of a user-facing refusal sentence,
which a regex is the right tool for. The distinction this bundle draws is not
"never read SQL" -- it's "don't read SQL for a fact that is actually a
question about runtime behaviour".

### Mutation-proved both ways, against scratch copies, restored byte-identically

Per CLAUDE.md's mutation-proof convention, both directions were verified by
editing the SHIPPING files, running the test, and restoring from an `md5sum`
against a backup -- not `git checkout --`.

- **Server-side drift.** Backed up
  `supabase/migrations/0147_gauntlet_close_target_disclosure.sql`
  (`e83fd2b319c709cdacbeddf1f5328e6d`), changed `_gauntlet_tol_pct`'s fallback
  from `0.1` to `0.3`. `GAUNTLET_DEFAULT_TOLERANCE_PCT equals the server
  default (measured against the live RPC)` reddened (`expected true to be
  false`, on the outside probe). Restored from the backup; `md5sum` matched
  the original.
- **Form-side drift.** Backed up `src/lib/gauntlet/authoring.ts`
  (`9a101252d086ce69ab023465a6d68e49`), changed
  `GAUNTLET_DEFAULT_TOLERANCE_PCT` from `0.1` to `0.5`. Two tests reddened:
  the same live-RPC comparison, and `is not the pre-0036 0.5 the form used to
  seed`. Restored from the backup; `md5sum` matched the original.

`git diff --stat` after both restores showed only
`tests/gauntlet-authoring-tolerance.test.ts` changed -- no migration, no
`src/lib/gauntlet/authoring.ts`, nothing else.

### Test count, not just pass/fail

The old file had 17 tests; deleting the two regex-based ones (the parser unit
test and its "instrument check" against a real migration) and adding the
DB-backed replacements landed at 15, which would have been a net drop. Two
tests were added back with real content rather than padding: the
instrument-control block above runs over three distinct explicit tolerance
values instead of one, and a new boundary test
(`a submission exactly on the band edge passes (the comparison is
inclusive)`) pins that `gauntlet_submit`'s comparison is `<=`, not `<`. Final
count: 18 tests in this file, 3476 in the full suite (up from 3474).

### Verified

- `npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings (unchanged
  31/5/1 mix).
- `npm test` before this branch's fix: 160 files passed, 1 failed
  (`tests/gauntlet-authoring-tolerance.test.ts`), 3472 tests passed, 2 failed.
- `npm test` after: 161 files passed, 3476 tests passed, 0 failed.
- `git diff --stat`: only `tests/gauntlet-authoring-tolerance.test.ts`.

### Not verified

- The live Supabase project, a real Drive round trip, or a signed-in browser
  session -- none of that is touched by this change. This bundle is a single
  test file; no UI, route, or migration was authored or modified.

### Not touched, per this session's scope

`supabase/migrations/*`, `src/lib/gauntlet/authoring.ts`,
`src/app.css`, `tools/browser-verify/`, `docs/GAUNTLET.md` -- confirmed by the
restored-md5 checks above and by `git diff --stat` showing no changes outside
this file.
