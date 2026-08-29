---
title: "The PostgREST shim answers a set-returning RPC the way PostgREST does (`claude/postgrest-shim-set-returning-57e7a3`)"
date: 2026-08-29
branches: [claude/postgrest-shim-set-returning-57e7a3]
migrations: []
subsystems: ["Testing", "Classroom", "GAUNTLET"]
---

`tests/db/postgrest-shim.ts` called EVERY function as `select f(...) as result`
and handed back `rows[0].result`. That is right for the scalar and jsonb RPCs
it was written for and wrong twice over for a `returns table` function:
PostgREST issues `select * from f(...)` and answers with an ARRAY of row
objects, while the scalar form yields one composite per row and the shim kept
only the first -- and node-postgres renders a composite as the raw `(a,b,c)`
STRING, so what reached the code under test was not even an object.

**No migration, no `src/` change.** Three files: the shim, one new test file,
and the retirement of a local override that existed only because of this.

### The fix decides from the catalog, and cannot go stale

`routineShape(db, name)` reads `pg_proc` per call and gives one of three
answers:

| catalog | shape | how it is called |
| --- | --- | --- |
| `proretset = false` | a scalar | `select f(...) as result` |
| `proretset = true` and `typtype = 'c'`, or `proargmodes` contains an OUT/TABLE mode | an array of row objects | `select coalesce(json_agg(r), '[]'::json) from f(...) r` |
| `proretset = true` and neither | an array of bare VALUES | **throws** |

**Nothing here names a function**, which is the whole of why it cannot go
stale: a `returns table` migration written next week is covered the moment it
applies, and a function whose return shape changes changes this answer in the
same statement. A pinned list would be the thing somebody has to remember. That
is the same reasoning `tests/gauntlet-run-review-route.test.ts` used for its
local override, kept and made shared.

- **THE THIRD ROW THROWS RATHER THAN GUESSES**, because `select *` on a bare
  `setof <scalar>` names the single column after the FUNCTION, so the shim
  would hand back `[{ f: 1 }]` where a client receives `[1]`. **No function in
  the migrations is that shape** -- asserted over the real catalog with a
  positive control beside it -- so the refusal costs nothing today and is what
  makes the first one written loud instead of silent. It is the choice the rest
  of that file already makes: a shim more permissive than the real thing does
  not fail loudly, it certifies a bug.
- **OVERLOADS ARE READ TOGETHER AND A DISAGREEMENT THROWS.** The signature trap
  leaves real overload PAIRS standing in this schema (three names today, all
  scalar, none disagreeing). PostgREST would resolve one of them by argument
  name; this shim cannot tell which, and guessing there is the certified bug
  again.
- **THE SET PATH ANSWERS JSON, NOT THE DRIVER'S PARSED ROWS**, for exactly the
  reason the `from()` path builds `json_build_object` one call shape over: a
  timestamptz reaches a load as an ISO STRING and a bigint as a NUMBER. The
  local override this replaces returned `.rows` raw, so the route test that
  depended on it was reading `Date` objects into a field its own page types as
  `string`.
- **The `coalesce` is what makes an empty set `[]` rather than null**, and null
  is what a MISSING function looks like -- without it a load cannot tell
  "nobody is on this roster" from "this RPC is not applied yet". There is no
  `?? []` beside it: an aggregate over zero rows still returns one row, so that
  branch would be unreachable, and a mutation proved it -- see below.
- **The scalar path is byte-for-byte what it was.** A fix that started arraying
  every answer would have broken every scalar caller in the suite in a way that
  reads as a feature regression.

### Nothing existing changed result, and here is why rather than a shrug

**175 files / 3743 tests before, 176 / 3757 after, both all-passing.** The delta
is exactly this bundle and nothing else: +1 file and +14 tests, all of them in
`tests/postgrest-shim-rpc-shape.test.ts`, with
`tests/gauntlet-run-review-route.test.ts` staying at 11 as its override came
out. **No pre-existing test moved.**

The premise was that a fixture wrong for everyone should break something, so a
clean sweep needed proving rather than banking. It was measured, not reasoned:
the shim's `rpc` was instrumented to append every call's name and its catalog
shape to a file, and the whole suite run over it. **Every RPC the suite drives
through the shared shim is scalar or absent:**

| name | calls | shape |
| --- | --- | --- |
| `classroom_manages_section` | 89 | scalar |
| `classroom_song_queue` | 67 | not in the chain |
| `classroom_hall_pass_state` | 67 | not in the chain |
| `is_admin` | 38 | scalar |
| `notebook_get_section_grid` | 10 | scalar |
| `classroom_section_roster` | 8 | **not in the chain** |
| `classroom_course_categories` | 4 | scalar (once absent) |
| `gauntlet_run_review` | 1 | not in the chain (the not-applied branch) |

So **before this change not one of the repo's set-returning functions was ever
reached through the shared shim's `rpc`** -- which is the first branch of the
dichotomy, measured. There was nothing for the fix to break. The instrumentation
was removed and the file restored from an in-memory copy, md5-checked.

### THERE ARE 23 SET-RETURNING FUNCTIONS, NOT 121

The brief for this work said 121. Counted three ways, it is **23 distinct names
across 35 `create function` statements**: by parsing every
`create [or replace] function` in `supabase/migrations/` and reading the
`returns` clause past its argument list, and independently off `pg_proc` after
applying all 153 migration files to a scratch database. Both agree.

The list, and what drives each -- the second column is the interesting one:

| function | driven by a test |
| --- | --- |
| `admin_list` | **through the shim**, by this bundle's control (and in raw SQL by five files) |
| `classroom_section_roster` | **through the shim**, by this bundle (raw SQL: `classroom-manager-exclusion`) |
| `_coin_public_roster` | raw SQL only (3 files) |
| `_notebook_section_roster` | raw SQL only (2 files) |
| `coin_public_leaderboard` | raw SQL only (4 files) |
| `coin_public_transactions` | raw SQL only (3 files) |
| `coin_admin_list_contracts` | raw SQL only (2 files) |
| `coin_admin_list_sections`, `coin_my_contract_claims`, `coin_public_contracts`, `coin_public_reasons`, `coin_public_role_questions`, `coin_public_roles`, `coin_public_sections` | raw SQL only (1 file each) |
| `foundry_list_apps` | raw SQL only (3 files) |
| `foundry_play_counts`, `gauntlet_practice_pressure`, `gauntlet_run_review` | raw SQL only |
| **`app_short_link_list`** | **nothing, anywhere** |
| **`coin_admin_list_section_students`** | **nothing, anywhere** |
| **`coin_role_admin_list_applications`** | **nothing, anywhere** |
| **`coin_role_admin_list_holders`** | **nothing, anywhere** |
| **`coin_role_admin_list_role_questions`** | **nothing, anywhere** |

**Five set-returning functions have no test of any kind**, and four of them are
admin reads over other people's rows: the role applications queue, the role
holders list (including revoked grants and who revoked them), the per-role
question bank with its `correct_option_index`, and a section's student roster.
Each is a `where public.is_admin()` inline in the body, the `admin_list()` shape
0073 copied deliberately -- so each is 0060's leak shape with nothing asserting
the gate bites. **That is not this bundle's to close** (it is coin-desk and
short-link work, with its own chains and its own seeding), but it is the answer
to "which of them has nobody exercised" and it should not sit only in a table.

### The finding inside the finding: `loadSectionRoster`'s widest rung was never driven

Eight of the shim's calls are `classroom_section_roster`, and **every one
answered PGRST202** -- no shim-driven test's chain carries 0138. So every route
test that reaches a roster has been exercising the DEGRADE rung, with
`managesReady: false` and the plain table select, and the manager exclusion 0138
exists for was never in a payload any of them asserted over.

That was invisible from both ends, and the broken shim is why it had to stay
invisible: `loadSectionRoster` hands its answer straight on as
`(wide.data ?? []) as ClassroomEnrollment[]`, so on the wide rung it would have
passed a composite STRING into `splitRoster`, and on an empty roster it would
have passed `[]` with `managesReady: true` -- a load reporting "I can tell who
manages" over a value the database never produced. **A test could not have been
written against that rung until the shim was fixed.**

`tests/postgrest-shim-rpc-shape.test.ts` now drives the REAL
`loadSectionRoster` over the fixed shim on a chain that carries 0138, and
asserts the wide rung: `managesReady` true, two student rows back with named
columns, `manages` false on both -- with a POSITIVE CONTROL that enrolls the
teacher of record and gets `manages` true on exactly one row, so `false` is an
answer rather than a default. `tests/classroom-manager-exclusion.test.ts` proves
the FUNCTION exhaustively in raw SQL; what nothing proved is that the shipped
transport reading it over a PostgREST-shaped client gets rows at all.

**The other six shim-driven files still degrade**, because their chains stop
short of 0138 and widening somebody else's chain changes what their file tests.
Named here rather than changed.

### The local override is retired, not kept beside the fix

`tests/gauntlet-run-review-route.test.ts` carried its own `rpc` keyed on
`proretset`, deliberately local because other sessions were in that file. Its
`client()` is now three lines calling `createPostgrestShim`, and all 11 tests
pass against the shared one -- **on a strictly more faithful shape than the
override produced**, since the override returned the driver's rows (a `Date`
where the page types `started_at: string`, a string where it types
`event_count: number`). Its assertions turn out to be insensitive to that
difference, so this is de-duplication rather than a caught defect; the fidelity
gain is real but nothing was asserting over it. A second implementation of
"how does PostgREST answer" is the thing that stops matching.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `npx svelte-kit sync` with placeholder `PUBLIC_SUPABASE_*` in `.env`.
  Identical before and after. **The fresh-checkout rule bites in a second
  place worth writing down**: `svelte-kit sync` reads `.env` at SYNC time, so
  running it BEFORE writing the placeholder file leaves the generated module
  empty and reports the 11 phantom errors anyway. Write `.env` first, then
  sync.
- **Full suite: 175 files / 3743 tests before, 176 / 3757 after.** Both
  all-passing. 3743 + 14 = 3757; every moved number is accounted for above.
- **The shim is mutation-proved**, which it has to be: a fixture that answers
  the wrong question fails by going GREEN. Five mutants, all in the permissive
  direction, all reddening; the file was restored each time from an in-memory
  copy and md5-checked (`27b334b1c6efe4ee5d1267802b052dcf` at the end).
  `git checkout --` was not used anywhere -- it restores from HEAD and would
  have discarded this session's own uncommitted work.

| mutant | tests reddened |
| --- | --- |
| the set branch never fires (the pre-fix behaviour) | 6 |
| `row_objects` hardcoded true (a bare setof scalar modelled instead of refused) | 2 |
| the overload-disagreement guard removed | 1 |
| the `coalesce` dropped, so an empty set answers null | 1 |
| the driver's own rows returned instead of `json_agg` | 1 |

  A SIXTH MUTANT SURVIVED and was a finding about the fix rather than about the
  test: replacing the set path's `?? []` with `?? null` changed nothing,
  because `coalesce(json_agg(...), '[]')` always returns exactly one row and
  that fallback was unreachable. It is deleted rather than left standing with a
  comment -- a branch no mutation can kill is a branch nobody can trust -- and
  the empty-set assertion now bites on the `coalesce` itself, which is where
  the behaviour actually lives.

### Not verified

- **The live project.** Nothing here touches it; no migration, no `src/`.
- **Real PostgREST.** Every claim about what PostgREST answers is read from its
  documented call shape and mirrored here, not measured against a running
  instance -- this repo's `.env` is a placeholder project. What IS measured is
  that the shim's answers are self-consistent with the catalog and with the
  shipped loads' own TypeScript.
- **The bare-`setof <scalar>` refusal on a real function.** There is none in the
  repo, so it is exercised only against a function the test creates.
- **No browser pass**, and none is relevant: this bundle renders nothing.

### For whoever is next

- **The five untested set-returning functions above are the queue**, and the
  four coin-desk ones are admin reads over other students' rows.
- **The shim's `rpc` still maps EVERY error to `PGRST202`**, including a
  runtime failure inside a function body and an RLS refusal. That is the same
  family of gap as this one -- CLAUDE.md's rule is that a client degrades on
  `PGRST202` ALONE so a runtime error fails closed, and a fixture that answers
  `PGRST202` for everything puts a test on the degrade path for failures that
  should never reach it. Left alone here deliberately: correcting it changes
  what several existing files assert and needs its own bundle with an answer
  for each.
