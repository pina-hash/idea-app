---
title: "The five untested set-returning functions get their gate, and the coverage hole shrinks to two (`claude/set-returning-function-tests-imch2v`)"
date: 2026-08-29
branches: [claude/set-returning-function-tests-imch2v]
migrations: []
subsystems: ["Testing", "Coin economy", "Short links"]
---

`docs/history/postgrest-shim-set-returning-57e7a3.md` fixed the shared PostgREST
shim so a `returns table` RPC answers an ARRAY OF ROW OBJECTS, and reported --
measured, by instrumenting the whole suite -- that **five set-returning
functions had no test of any kind**. Four of them are admin reads over other
students' rows. This bundle writes those tests.

**No migration, no `src/` change, and nothing under `supabase/migrations/` was
written at any point, mutation proof included.** Two new files:
`tests/coin-admin-list-gates.test.ts` and `tests/short-link-list-gate.test.ts`.

### The five, confirmed independently before anything was built

The count was re-derived rather than taken from the previous entry: parsing
every `create [or replace] function` in `supabase/migrations/` and reading the
clause past its own argument list gives **23 distinct set-returning names across
35 statements**, which matches. Cross-referencing every one of the 23 against
`tests/` gives exactly the same five with zero mentions, and **no sixth has
appeared** since.

| function | migration | what it hands back |
| --- | --- | --- |
| `coin_role_admin_list_applications` | 0074, rewritten 0076 | the review queue, with the marking key inside `answers` |
| `coin_role_admin_list_holders` | 0074, rewritten 0076 | every grant, including revoked ones and who revoked them |
| `coin_role_admin_list_role_questions` | 0076 | the question bank WITH `correct_option_index` |
| `coin_admin_list_section_students` | 0073 | a section's roster |
| `app_short_link_list` | 0093 | the whole short-link table |

Each is a `where public.is_admin()` written INLINE in the body -- the
`admin_list()` shape 0073 copied and 0093 copied again. That is
`gauntlet_room_board`'s shape, which returned every room's roster with student
full names to any caller for two months because nothing asserted its scoping.

### The admitted calls go through the SHIM; the signed-out ones cannot

All five are reached from the browser as `supabase.rpc(...)`
(`RolesManager.svelte`, `LogView.svelte`, `SectionManager.svelte`, and the
`/admin/links` load), so the faithful question is what a PostgREST client
receives. `createPostgrestShim` drives every signed-in caller for that reason,
and these are the first callers in the repo to reach a `returns table` function
through it on a real feature chain. `app_short_link_list` is additionally the
first to exercise the shim's OTHER set branch: it returns `setof
public.app_short_links`, a table ROWTYPE (`typtype = 'c'`), not a `returns table
(...)` column list.

The shim can only model a signed-in caller -- it runs `db.asUser` -- so the
signed-out cases are raw, and **they are two rather than one, because the
refusals are independent and either alone must produce nothing**:

1. **THE GRANT.** 0137 revoked `anon` EXECUTE on all five; none is among its
   eighteen deliberate public surfaces. A real signed-out request never reaches
   the body.
2. **THE GATE.** `is_admin()` answers false when `auth.uid()` is null, so a
   caller who somehow held EXECUTE with no session still reads nothing. Measured
   through `service_role` WITHOUT a subject -- a role 0137 deliberately does not
   touch, so it holds EXECUTE, and one that bypasses RLS, so the inline `where`
   is the only thing that can be refusing it.

Asserting only (1) would leave the shape where the sweep is the whole defence
and the gate is decorative; asserting only (2) would miss that a real anon
request is stopped a layer earlier. **Each is mutation-proved separately below**,
which is the only way to know which assertions each layer is carrying.

### THE `app_short_link_target` PAIR IS WHAT MAKES THE ANON ASSERTION A NARROWING

`anon` keeps EXECUTE on `app_short_link_target` -- a printed QR code resolves
before any session exists -- and loses it on `app_short_link_list`. Both are
asserted. Without the positive half, "anon cannot call the list" is equally
satisfied by a fixture in which anon can call nothing at all, which is precisely
the vacuum 0137 was written to end.

### WHAT COMES BACK IS ASSERTED, NOT ONLY WHO MAY CALL

A gate that admits the right caller and returns a column nobody should see is
the same defect one field over, so every column set is pinned WHOLE rather than
spot-checked -- a pinned set reddens on an ADDED column, which is the direction a
disclosure arrives from. Read off the RESULT rather than off `pg_proc`, because
what a client receives is the question.

- **`coin_role_admin_list_applications`** projects `answers` carrying each
  question's `correct_option_index` and `is_correct` beside the student's own
  choice. That is the marking key, and it BELONGS: an admin deciding an
  application is exactly who needs it, and it is why 0076 built the snapshot
  table at all. Its anon-facing sibling `coin_public_role_questions` projects no
  answer key.
- **`coin_role_admin_list_holders`** projects `revoked_by` and `revoke_reason` --
  a staff address and a note a staff member wrote about a student. Both belong
  in a holders console and both are why this gate is the least forgiving of the
  five.
- **`coin_role_admin_list_role_questions`** is the disclosure in one column:
  a student who could read it could pass the quiz that gates a paid role.
- **`coin_admin_list_section_students`** projects four columns and **no
  balance**, which is the notable ABSENCE: this is the picker the coin desk logs
  a section from, so a balance column would put every student's holdings in a
  list an admin opens to choose a name.
- **`app_short_link_list` is `select *` over the table**, so its projection is
  not written down in 0093 at all -- a column added to `app_short_links` in any
  later migration reaches every admin screen with 0093 unchanged and nothing
  anywhere saying so. Every column it has today is staff's own work (the slug,
  the target, the label, `active`, and a `created_by` only an admin can have
  written); there is nothing about a VISITOR in the table -- no hit count, no
  referrer, no address -- so enumerating it discloses nobody else.

### Mutation proof: seven mutants, all permissive, all reddening

**`supabase/migrations/` was never written to.** Each mutant is a mutated COPY in
a scratch directory OUTSIDE the repo, with the test's own chain pointed at it
through a relative path the harness's `join()` resolves back out of the tree;
the test file is copied to a temp name under `tests/` (so its relative imports
still resolve) and deleted afterwards. **`git checkout --` was used nowhere** --
it restores from HEAD and would have discarded this session's own uncommitted
work, which four sessions have now lost that way. The five real migration files
were md5-checked against copies taken before the run and are byte-identical.

Each gate is opened ONE AT A TIME, scoped to its own function body inside a file
that defines several: a blanket replace would redden everything at once and
prove nothing about which gate each assertion is actually watching.

| mutant | tests reddened |
| --- | --- |
| `coin_role_admin_list_applications`: `where public.is_admin()` -> `where true` | 4 |
| `coin_role_admin_list_holders`: same | 4 |
| `coin_role_admin_list_role_questions`: same | 3 |
| `coin_admin_list_section_students`: same | 5 |
| `app_short_link_list`: same | 4 |
| `anon` handed its EXECUTE back on the four coin reads | 5 |
| `anon` handed its EXECUTE back on `app_short_link_list` | 2 |

And the projection pins, which needed proving in the direction nobody looks:

| mutant | tests reddened |
| --- | --- |
| a `last_seen_visitor_ip` column added to `app_short_links` | 1 (the seven-column pin) |
| `coin_admin_list_section_students` gains the student's coin balance | 1 (the roster-and-nothing-about-money pin) |

**THE COLUMN-ADDED MUTANT IS THE INTERESTING ONE, because of what did NOT
redden.** `short-link-list-gate.test.ts` also cross-checks the shim's answer
against `information_schema.columns` for `app_short_links`. That test stayed
GREEN under the added column, exactly as it must -- both sides move together --
so the cross-check proves the shim is not inventing a shape and can NEVER catch
a widening of the table. **The pinned list is the only thing that catches that**,
and the two assertions are kept apart for that reason rather than folded into
one.

Two mutants reddened a single test each and no others, which is the blast radius
worth having: an assertion that reddens on everything is an assertion about
nothing.

### 2. `loadSectionRoster`'s wide rung -- MEASURED, and the number is two, not six

The brief and the previous entry both say **six** existing route tests reach a
roster through the shim and all exercise the DEGRADE rung. Re-measured the same
way the previous session measured its own claim -- the shim's `rpc` instrumented
to record its caller's test file, the whole suite run over it, the file restored
from a scratch copy and md5-checked (`27b334b1c6efe4ee5d1267802b052dcf`, the
same digest that entry recorded) -- **it is TWO files, eight calls, four each**:

| file | `classroom_section_roster` calls | rung |
| --- | --- | --- |
| `tests/classroom-units.test.ts` | 4 | degrade |
| `tests/classroom-feed-false-counts.test.ts` | 4 | degrade |
| `tests/postgrest-shim-rpc-shape.test.ts` | 2 | **wide**, added by the previous bundle |

The "eight calls" figure in that entry is right and is what the six was derived
from; the file count was not measured. `tests/classroom-instructor-copy.test.ts`
looks like a third from a grep -- it names the Grades page load -- but it makes
**zero** shim RPC calls of any kind and re-derives that read in raw SQL.

**Neither is widened here, deliberately: changing someone else's chain changes
what their file tests, and that is their decision to take rather than this
bundle's side effect.** Both are safe to widen on the dependency facts -- 0138
needs `notebook_session_excusals` (0069) and `classroom_module_approvals`
(0086), and both chains carry both -- and what each would gain is different:

- **`tests/classroom-feed-false-counts.test.ts` is the one worth widening, and
  it is nearly the point of the file.** It drives the real `/+page.server.ts`
  load and feeds `data.feedManagerEmails` into `buildFeed`. That load derives
  the map from `row.manages !== true`, which on the degrade rung is `undefined`
  for every row -- so **the map is `{}` in every assertion the file makes
  today**, and its to-grade counts are the pre-0138 ones. Widened, it could
  assert the thing the file is named for: that an INSTRUCTOR enrolled in their
  own class is excluded from their own to-grade denominator, which is exactly a
  false count and is currently untested from the load's end. Its chain stops at
  0121, so widening means adding 0138 and its `classroom_remove_enrollment`
  surface area to a file about counts.
- **`tests/classroom-units.test.ts` gains less and risks more.** Its roster
  assertions are `canManage === true` and `roster.length > 0` from the People
  load -- both true on either rung -- so what it would gain is the `manages`
  flag being PRESENT and correct on a roster that includes the teacher of
  record, which `tests/classroom-manager-exclusion.test.ts` already proves
  exhaustively about the function. The risk is that the file also asserts over a
  spelled-out list of function names (`_classroom_manages_course` among them),
  and 0138 adds `_admin_is_email` and `_classroom_manages_section_email` and
  re-signs two wrappers; that assertion would have to be re-read, not just
  re-run.

**So: widen `classroom-feed-false-counts` for a real new assertion; widen
`classroom-units` only if somebody wants the flag asserted at a second call
site, and expect to touch its function-name list when they do.**

### 3. The coverage report, and it is two rather than zero

Every one of the 23 set-returning functions, checked for a real CALL in
`tests/` -- `public.<name>(`, `rpc('<name>'`, or `from <name>(` -- not for a
mention. **The hole is down from five to two, and the two are a correction to
the previous entry's table rather than a regression.**

**Driven by a test (21):** `_coin_public_roster`, `_notebook_section_roster`,
`admin_list`, **`app_short_link_list`**, `classroom_section_roster`,
`coin_admin_list_contracts`, **`coin_admin_list_section_students`**,
`coin_public_contracts`, `coin_public_leaderboard`, `coin_public_reasons`,
`coin_public_role_questions`, `coin_public_roles`, `coin_public_sections`,
`coin_public_transactions`, **`coin_role_admin_list_applications`**,
**`coin_role_admin_list_holders`**, **`coin_role_admin_list_role_questions`**,
`foundry_list_apps`, `foundry_play_counts`, `gauntlet_practice_pressure`,
`gauntlet_run_review`. The five in bold are this bundle's.

**Not driven by anything (2):**

- **`coin_admin_list_sections`** (0073). The previous entry credits it with "raw
  SQL only (1 file each)". Measured, its only appearance anywhere in `tests/` is
  inside a COMMENT in `tests/coin-contracts.test.ts` describing another
  function's gate as "the `coin_admin_list_sections` shape". Nothing calls it.
- **`coin_my_contract_claims`** (0077). Its only appearance is as a SIGNATURE
  STRING in `coin-public-ledger.test.ts`'s `has_function_privilege` sweep --
  a grant assertion, which is worth having and is not an execution. Its body has
  never run in a test and no test asserts a row it returns.

Both are the same shape as the five: an inline gate over a set-returning read.
`coin_admin_list_sections` is admin-gated like its four neighbours here;
`coin_my_contract_claims` is a student's OWN claims, so its gate is
`auth.uid()`-shaped rather than `is_admin()`-shaped and is a different
assertion. **They are the queue.**

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived on this tree
  with a placeholder `.env` written BEFORE `npx svelte-kit sync`. Unchanged from
  the baseline, as it must be: this bundle adds no `.svelte` file and touches no
  `src/`.
- **Full suite: 179 files / 3794 tests before, 181 / 3833 after.** Both
  all-passing. 3794 + 23 + 16 = 3833; every moved number is this bundle's two
  files and nothing else. **No pre-existing test moved.**
- **Every "gets none" assertion has a positive control ahead of it**, and the
  controls run FIRST in both files: an empty array is also what a fixture that
  seeded nothing produces, so without them either file could pass over five
  functions that return nothing to anybody.
- **Both files seed through the REAL write RPCs** (`coin_admin_upsert_section`,
  `coin_admin_assign_section_students`, `coin_role_apply`,
  `coin_role_admin_review`, `coin_role_admin_revoke`, `app_short_link_upsert`),
  never a raw insert -- with ONE stated exception. `coin_role_quiz_questions` is
  created EMPTY by 0076 and has no write RPC anywhere in the migrations, because
  real quiz content is pasted into the table by hand by whoever holds SQL editor
  access (CLAUDE.md, Scope). **A hand-written insert IS its producer**, so
  building those rows any other way would be the fixture inventing one.
- **The `/admin/links` page load is DRIVEN, not re-implemented**, imported from
  its own file with the shim in `locals.supabase`. It is the
  `loadSectionRoster` shape one route over -- `(data ?? []) as ShortLinkRow[]`,
  no validation -- so before the shim fix it would have passed a composite
  STRING into a value its own TypeScript types as an array of objects, and no
  test in this repo could have caught it. Its 404s are asserted for a
  non-admin teacher, a student and a signed-out visitor SEPARATELY, per
  CLAUDE.md's probing rule; the signed-out case passes `locals.supabase = null`,
  so a load that reached the client at all would throw a TypeError instead of a
  404 -- which is what makes it an assertion that the claims check comes first.

### Not verified

- **The live project.** Nothing here touches it: no migration, no `src/` change.
  Every claim is against the embedded fixture with the real migration files
  applied.
- **Real PostgREST.** As the previous entry says, what these functions return
  over the wire is modelled by the shim from PostgREST's documented call shape,
  not measured against a running instance.
- **The coin-desk and `/admin/links` SCREENS.** This bundle asserts the gate and
  the projection at the database and transport layer. `RolesManager.svelte`,
  `LogView.svelte`, `SectionManager.svelte` and `/admin/links/+page.svelte` are
  not rendered anywhere here, and no browser pass was run -- none is relevant,
  since nothing renders.
- **`is_admin()`'s 0138 form.** Both chains stop short of 0138, so the
  `is_admin()` these gates call is 0067's. 0138 keeps the wrapper's name,
  signature and OID and re-expresses the same rule, so the gate behaviour is
  unchanged by construction -- but that is read from 0138's text here, not
  measured on a chain carrying it.

### For whoever is next

- **`coin_admin_list_sections` and `coin_my_contract_claims` are the whole
  remaining hole**, and the second one is the more interesting: its gate is a
  student's own-row rule rather than `is_admin()`, so it is the first of these
  that needs an "another student's claims are not visible" assertion rather than
  a "nobody but an admin" one.
- **`tests/classroom-feed-false-counts.test.ts` widened to 0138** is a real,
  bounded piece of work with a real new assertion at the end of it. See section
  2 for what it would say and what it costs.
- **The shim still maps EVERY error to `PGRST202`.** Unchanged and still worth
  its own bundle, for the reason the previous entry gives. Both new files
  SURFACE the error rather than swallowing it (a helper throws on
  `res.error`), so a refusal that started arriving as an error instead of an
  empty set would fail loudly here rather than reading as "no rows" -- which is
  the one thing that gap could otherwise do to a gate test.
