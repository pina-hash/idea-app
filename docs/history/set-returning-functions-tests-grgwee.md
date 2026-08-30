---
title: "The last four set-returning functions are driven from a client, the coverage closes at 22 of 22, and the shim turns out to have mis-modelled the one-column `returns table` shape (`claude/set-returning-functions-tests-grgwee`, no migration)"
date: 2026-08-29
branches: [claude/set-returning-functions-tests-grgwee]
migrations: []
subsystems: ["Testing", "Coin economy", "GAUNTLET"]
---

Fifth and last in the line that starts at
`docs/history/postgrest-shim-set-returning-57e7a3.md` (the shim's set-returning
path), runs through `docs/history/set-returning-function-tests-imch2v.md` (the
five ungated admin reads), `docs/history/route-tests-degrade-path-gmqirc.md`,
`docs/history/set-returning-function-projections-5i6s8n.md` and
`docs/history/anon-coin-public-projections-mrlg0d.md`, which closed every
`anon`-granted set-returning read and named the four left:

    coin_admin_list_sections      0073   named in two tests, called by neither
    coin_my_contract_claims       0089   named in two tests, called by neither
    gauntlet_author_roster        0155   no mention anywhere in tests/ or src/
    gauntlet_practice_pressure    0151   named in two tests, raw SQL only

**No migration, nothing under `supabase/migrations/` written at any point,
mutation proof included, and no `src/` change.** Two new test files --
`tests/gauntlet-admin-set-returning-projection.test.ts` (21 tests) and
`tests/coin-admin-and-own-rows-set-returning.test.ts` (23 tests) -- and **one
line of `tests/db/postgrest-shim.ts`**, which is the finding below and is the
one file outside this bundle's own that it touches.

### THE DENOMINATOR, RE-DERIVED RATHER THAN CARRIED FORWARD

Re-parsed independently (every `create [or replace] function` in
`supabase/migrations/`, the return clause read PAST the function's own argument
list by walking balanced parens, latest definition winning): **24 distinct
set-returning names**, of which `_coin_public_roster` and
`_notebook_section_roster` are private helpers revoked from every client role.
**The client-callable denominator is 22**, unchanged since the previous entry --
`0155` moved it once and nothing has moved it since.

**The first parse said 22 and was WRONG, which is worth writing down.** It
terminated the return clause with a lookahead for `language` inside a
400-character window, so `foundry_list_apps` and `gauntlet_run_review` -- whose
`TABLE(...)` column lists are longer than that -- fell out silently and the
count agreed with nothing. A denominator that comes back plausible is exactly
the one nobody checks; the disagreement with the previous entry's 24 is what
caught it. The parse now walks the parens.

### THE FINDING: THE SHIM MIS-MODELLED A ONE-COLUMN `returns table`, AND ONLY ONE FUNCTION IN THE SCHEMA HAS THAT SHAPE

Driving `coin_my_contract_claims` through the shared PostgREST shim answered an
array of bare uuid STRINGS where a client receives
`[{"contract_id": "..."}]`. Measured against a real cluster rather than reasoned
about, on two functions built for the purpose:

| declaration | `prorettype` | `typtype` | `json_agg(r) from f() r` |
| --- | --- | --- | --- |
| `returns table (a uuid, b int)` | `record` | `p` | `[{"a":…,"b":7}]` |
| `returns table (contract_id uuid)` | `uuid` | **`b`** | `["…"]` |

A `returns table` with two or more columns compiles to a COMPOSITE, so the
alias `r` is a record and the aggregate yields objects. With exactly ONE column
it compiles to that column's own BASE type, so `r` is a scalar and the
aggregate yields values. `select * from f()` recovers the OUT column name in
both cases (measured: the field really is named `contract_id`), which is what
PostgREST does, so the fix is to aggregate over `select * from ${call}` instead
of over `${call} r`.

- **`routineShape` WAS ALREADY RIGHT AND THE SQL AFTER IT WAS NOT.** The
  classifier answers `rowObjects: true` here, correctly, because `proargmodes`
  carries a `t`. So `tests/postgrest-shim-rpc-shape.test.ts`'s whole-chain
  tripwire -- which asks exactly that question over the real catalog -- was
  green and would have stayed green. Its own prose describes the right shape
  (`select * from f(...)`); the execution path simply did not implement it.
- **`coin_my_contract_claims` (0089) IS THE ONLY FUNCTION IN THE MIGRATIONS OF
  THAT SHAPE**, swept over the catalog with a positive control, and it is the
  one nothing had ever driven through the shim. That is why a defect this loud
  survived four bundles about set-returning functions.
- **PRODUCTION RECEIVES OBJECTS, and the shipped reader is the proof.**
  `src/routes/api/coin/claim/+server.ts` does `rows.map((r) => r.contract_id)`,
  which over an array of strings answers `[null]` -- a contracts board that
  marks nothing, silently, on every load. So the old shim would not merely have
  been imprecise; it would have certified a route that cannot work. Driven
  through the real handler here, before and after: `[null]` against
  `[<contract uuid>]`.
- **The regression guard lives in this bundle's own coin file**, not in the
  shim's, because the shape is a property of `coin_my_contract_claims` and the
  sweep that says it is still the only one belongs beside it.

### `gauntlet_author_roster`: THE READ GATE IS ADMIN, AND THAT IS WHAT 0155 INTENDED

The prompt's question was whether the read gate is wider or narrower than the
migration's own reasoning implies. **It is neither.** 0155 argues at length that
GRANT and REVOKE are admin-gated rather than owner-gated -- authoring does not
propagate, and every capability in the tier is one the granting admin already
holds -- but that argument is about the WRITE path. The read has its own stated
reason, twice: the comment above the table's policy says "Reads are admin-only:
this is a list of staff email addresses, and that is app_admins' own reason",
and the function's own comment calls it "the roster, for an admin surface".
`where public.is_admin()` matches both exactly.

**WHAT IS WORTH SAYING IS WHY IT SHOULD STAY THERE, because the obvious future
widening reads as smaller than it is.** "Let an author see who else authors"
sounds like a narrower disclosure than an admin roster. It is not, because this
function does not project who authors. Per row it projects:

    email        the author's address, @boscotech.edu
    granted_by   the address of the ADMIN who granted it -- a SECOND staff address
    granted_at   when
    note         free text one member of staff wrote about another, up to 200 chars

Widening the gate to `gauntlet_can_author()` would hand all four to every
author. The projection pin is what that widening reddens, and the mutant that
performs it is `g1` below.

- **A NON-ADMIN GETS AN EMPTY SET, NOT AN ERROR**, because the gate is a WHERE
  clause inside the definer body -- `admin_list()`'s shape, which 0155 says it
  is copying. An author cannot tell an empty roster from a closed one.
- **THE TABLE IS A SECOND GATE AND IS ASSERTED SEPARATELY.** `gauntlet_authors`
  carries `grant select to authenticated` under an `is_admin()` RLS policy, so
  a client reading it directly meets the same answer; `anon` holds no SELECT at
  all and is refused rather than emptied.
- **THREE ROW SHAPES ARE IN THE FIXTURE and all three are asserted**: two
  granted through the real `gauntlet_author_grant` RPC (one with a note, one
  without), and **0155's own SEEDED row** for `wcosso@boscotech.edu`, written by
  a plain `insert` and therefore carrying a NULL `granted_by` beside a non-null
  note. The seed is part of the applied schema rather than something this file
  arranged; it is named and asserted rather than worked around, because a roster
  read that quietly dropped it would be reporting fewer authors than the
  database holds.

### `gauntlet_practice_pressure`: WHAT IT SAYS ABOUT A STUDENT, PINNED BEFORE ANYONE BUILDS A SCREEN ON IT

Twelve columns: `user_id`, `player`, `challenge_id`, `challenge_title`,
`checks`, `first_check`, `last_check`, `fastest_gap_ms`, `median_gap_ms`,
`at_floor_gaps`, `longest_burst`, `passes`.

- **IT IS A CADENCE, NEVER THE WORK.** No `value`, no `score_metric`, no
  `is_correct`, no `submission_id`, no email. Asserted as absences by name as
  well as by the whole-set pin, because a list of twelve strings does not say
  what the list is FOR.
- **`player` IS `display_name` ELSE `full_name` AND HAS NO THIRD RUNG**, which
  is the same rule `foundryAuthorName` states one subsystem over. A student with
  neither projects NULL, and the fixture carries one on purpose -- without her
  the null branch never runs and "it does not fall through to the address" is a
  claim about code nothing executes.
  - **THE no-email SWEEP DOES NOT CATCH THE FALLBACK, WHICH IS THE POINT.**
    Mutant `g5` adds `split_part(pr.email, '@', 1)` as a third rung; the local
    part contains neither `@` nor `boscotech`, so the sweep stays green and only
    the null pin reddens. This is the same asymmetry
    `anon-coin-public-projections-mrlg0d` recorded for `contractors`, met from
    the other direction: there the local part was the deliberate answer, here it
    is the leak, and in both cases a sweep for addresses is blind to it.
- **THE GAP THIS CLOSES IN AN EXISTING TEST IS ONE THAT TEST NAMES ITSELF.**
  `tests/gauntlet-author-tier.test.ts` probes this function as an author, a
  teacher and a student, gets zero rows from each, and then writes down that the
  probe "cannot tell a closed gate from an empty table" -- its fixture has no
  practice cadence, so the ADMIN reads zero too. The fixture here has a BURST
  (twelve checks, eleven gaps at 2.1s, one island of eleven) and a GRIND
  (twenty-five checks four minutes apart), the admin reads two rows from it, and
  the three zeroes then mean what they were always meant to mean.
  - The discriminator is pinned with it: `longest_burst` 12 against 0 on the
    row with TWICE the checks. `checks` alone would put the hardest-working
    student in the class at the top of the list.
- **THE SUBJECT OF A ROW CANNOT READ IT.** The student who produced the burst
  gets an empty set from their own record. `checks` and `longest_burst` about
  yourself is exactly what a caller probing for a detection lane wants.

### `coin_admin_list_sections`: A STAFF EMAIL AND AN ADMIN NOTE, BEHIND AN INLINE GATE

Nine columns; `created_by` is a staff address stamped from
`current_user_email()`, and `note` is free text an admin wrote about a class.
The PUBLIC sibling over the same table, `coin_public_sections`, answers `section`
and `color` and nothing else -- asserted side by side in one test, so the
narrowness of the public read is a measurement rather than a description.

- **THE TEACHER IS THE CALLER THAT MATTERS.** `role_for_email` makes every
  `@boscotech.edu` address a teacher, and that must still buy nothing here; a
  matrix of an admin and a student alone cannot tell a domain check apart from
  `is_admin()`.
- `student_count` is a `bigint`, which arrives as a NUMBER over PostgREST and as
  a STRING through node-postgres -- one of the two reasons a client-shaped call
  is a different claim from raw SQL. An empty section counts 0, never null,
  which is the LEFT JOIN's own case.

### `coin_my_contract_claims`: THE BOUNDARY, AND THE RPC IS NARROWER THAN THE TABLE IN BOTH DIRECTIONS

One column, `contract_id`, and no parameters at all -- so "can only ask about
yourself" is a property of the SIGNATURE, asserted from `pg_proc` rather than
from the file.

**THE RPC IS NOT THE ONLY WAY IN AND THIS BUNDLE DOES NOT CLAIM IT IS.** 0077
grants SELECT on `coin_contract_claims` to `authenticated` under an
own-row-or-admin policy, so the table's RLS is the real boundary and the
function is a projection over it. The two differ in BOTH directions, and only
one of them is obvious:

1. **The table carries `student_email` and the function drops it**, even from
   the caller's own row where it discloses nothing new. That is what makes this
   read safe to hand to a route serving a public board.
2. **The function is narrower than the POLICY for an admin.** The policy's
   `or public.is_admin()` gives an admin both claims and both addresses; the
   function's `where student_email = current_user_email()` has no admin branch,
   so the same admin gets nothing. Nobody, admin included, can read somebody
   else's claims through it.

The own-rows boundary is asserted in the permissive direction -- Ada's answer
must not CONTAIN Grace's contract, and neither may contain the unclaimed one --
with a positive control that both claim rows really are in the table, so "Ada
cannot see Grace's" is not "there is no Grace row to see". It is
mutation-proven by OPENING the gate (`c3`), never by reading the SQL.

### THE ROUTE SPLIT, MEASURED: ONE OF THE TWO IS A SECOND GATE AND THE OTHER IS NONE

The mirror of the split `anon-coin-public-projections-mrlg0d` found inside
`/api/coin/public`, this time between two routes:

| reader | shape | an added RPC column reaches a browser? |
| --- | --- | --- |
| `/coin-desk/students` `+page.server.ts` | `(sections ?? []) as CoinSectionRow[]` | **yes, verbatim** |
| `GET /api/coin/claim` | `rows.map((r) => r.contract_id)` | no |

A TYPE ASSERTION strips nothing at run time, so every key `coin_admin_list_sections`
returns reaches `data.sections` -- the staff email and the admin note included.
Measured rather than read: mutant `c2`'s benign column reddened the page-load
pin as well as the projection pins, and `c4`'s `student_email` on the claims
read left the claim route's own pin green.

**AND ONE THING ABOUT THAT ROUTE IS WORTH PINNING ON ITS OWN.** `GET
/api/coin/claim` branches on `claims` BEFORE it touches supabase, so a
signed-out caller gets a normal `[]` rather than the `permission denied` the RPC
would give. A refactor moving the RPC call above the guard would turn a public
page load into a logged error on every request, and nothing on screen would say
so.

**`sectionsConfigured` is a second name worth reading carefully**: driven with a
non-admin client the RPC succeeds and returns nothing, so the flag stays TRUE.
It means "0073 is applied", never "you may see sections", and a reader could
easily take it for the latter. Pinned.

### THE SHAPE QUESTION: ALL FOUR ARE THE `returns table` KIND

Read off `pg_get_function_result` and `prosrc` in the catalog: each declares an
explicit `TABLE(...)` column list over an explicit select list with no
`select *` anywhere. **A widening of `gauntlet_authors`, `submissions`,
`coin_sections` or `coin_contract_claims` therefore cannot reach any caller**;
only an edit to the function itself can. So the pins here do the narrower job,
and both files say so rather than letting the two guards read as one.

The contrast control is `app_short_link_list`, the schema's only
`returns setof public.app_short_links` over `select *`. It is read from the
MIGRATION TEXT in both files, with the function first asserted ABSENT from the
chain, because 0093 is on neither of these chains and adding a short-link
migration to a coin or GAUNTLET fixture to buy one assertion would change what
the fixture is. Without that half, "all four are the safe kind" is a claim about
a category with nothing in it.

### Mutation proof: thirteen mutants, all permissive, every one reddening

**`supabase/migrations/` was never written to.** Each mutant is a mutated COPY
in a scratch directory OUTSIDE the repo, with the test's chain entry re-pointed
at it through a relative path the harness's `join()` resolves back out of the
tree; the test file is copied to a `zz-mutant-*` name under `tests/` so its
relative imports still resolve, and deleted afterwards. **`git checkout --` was
used nowhere**; every restore is a `cp` from a copy taken before the first
mutant ran. All six touched migration files are md5-identical to those copies
(`0073` `ac9314be…`, `0077` `c50dedb2…`, `0089` `4e4d9642…`, `0137` `80a4a143…`,
`0151` `9d0fda7b…`, `0155` `d9708b7c…`).

| mutant | tests reddened |
| --- | --- |
| `g1` roster gate widened from `is_admin()` to `gauntlet_can_author()` | 1 (the author-gets-nothing pin) |
| `g2` roster gains a benign `granted_epoch` | 1 (the twice-pinned projection) |
| `g3` `gauntlet_authors` policy to `using (true)` | 1 (the table-shut pin) |
| `g4` pressure gains a benign `window_hours` | 1 (the twice-pinned projection) |
| `g5` pressure `player` gains the local-part rung | **1** (the null-player pin ALONE; the email sweep stays green) |
| `g6` pressure `bounds.ok` to `true` | 1 (author/teacher/student get nothing) |
| `g7` a later migration re-grants `anon` EXECUTE on both | 2 (the ACL partition and the shim-is-anon control) |
| `c1` `coin_admin_list_sections` gate to `where true` | 2 (the non-admin pin AND the page-load pin) |
| `c2` sections gains a benign `label_length` | 2 (the projection pin AND the route pass-through pin) |
| `c3` `coin_my_contract_claims` returns EVERYONE's | 6 |
| `c4` claims read gains `student_email` | 5 |
| `c5` claims table policy to `using (true)` | 1 (the narrower-than-the-table pin) |
| `c6` a later migration re-grants `anon` EXECUTE on both | 2 (the ACL partition and the shim-is-anon control) |

**`g7` AND `c6` ARE APPENDED TO THE LAST FILE IN EACH CHAIN, NOT TO 0137.** In
the GAUNTLET chain 0137 sits BEFORE 0155, so `gauntlet_author_roster` does not
exist yet when it runs -- the first draft would not apply, measured. Appending
to the chain's tail is also the more faithful shape: the regression being
guarded against is a LATER migration handing the grant back, and 0137 refuses a
`k_keep` edit outright.

**A FOURTEENTH CONTROL, ON THE SHIM FIX ITSELF**: reverting the one-line change
and re-running the coin file reddens 5 tests, including the claim ROUTE's. The
shim was then restored from a copy of the fixed file and md5-checked
(`d30791ab172ad8f980ec052491942a80`).

**THE BENIGN MUTANTS ARE STILL THE ONES THAT MATTER.** `g2` and `g4` carry no
address, so nothing but a whole-set pin sees them, and their one-test blast
radius is the one worth having -- an assertion that reddens on everything is an
assertion about nothing.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived with a
  placeholder `.env` written BEFORE `npx svelte-kit sync`. **It was 8 errors on
  the first pass**, all in this bundle's own two files: `ForeignKey` is declared
  but not exported by the shim, and the shim's `Query` is a THENABLE rather than
  a `Promise`, so a helper typed `Promise<…>` rejects it. Fixed by taking the
  catalog snapshot's type as `Awaited<ReturnType<typeof loadForeignKeys>>` (the
  shim's own suite already does this) and typing both helpers `PromiseLike<…>`.
- **Full suite: 199 files / 4192 tests before, 201 / 4236 after.** Both
  all-passing, exit 0. 4192 + 21 + 23 = 4236; every moved number is this
  bundle's two files. **No pre-existing test moved, which is the assertion the
  shim change needed** -- the after count was taken twice, independently, on
  separate clean runs.
- **A fresh checkout needed `npm ci`, then a placeholder `.env`, then
  `npx svelte-kit sync`**, which is the documented order and is what it took.
- **Every denial has a positive control ahead of it and the controls run
  FIRST.** In both files the first `describe` puts the SAME client to something
  it must be refused and to something it must be given -- a student refused
  `gauntlet_author_grant` / `coin_admin_upsert_section` while the admin's client
  on the same shim is given it -- so a shim silently running as the table owner
  cannot satisfy any claim below it. The ACL partition carries its own negative
  half in each file (`_gauntlet_practice_min_interval` shut to every client role;
  `anon` really does hold EXECUTE on `coin_public_contracts` and
  `_coin_public_roster` really is shut), so a fixture in which everything were
  revoked would not pass.

### Not verified

- **The live project.** No migration and no `src/` change. Every claim is
  against the embedded fixture with the real migration files applied.
- **Real PostgREST.** The one-column finding is measured against a real
  Postgres and against the shipped route's own reshape, and the conclusion that
  PostgREST emits objects rests on `select *` recovering the OUT column name
  plus `/api/coin/claim` being written to read one. **Nobody has put a request
  to a running PostgREST instance.**
- **The screen.** No browser pass. `/coin-desk/students` is driven as a LOAD
  FUNCTION, not rendered; `SectionManager.svelte` is not mounted anywhere here.
  There is no UI at all for either GAUNTLET function -- 0151 says so about the
  pressure read, and 0155 ships no roster surface -- so "what an admin console
  would show" is a statement about the payload and not about a page.
- **`is_admin()`'s 0138 form.** Neither chain carries 0138, so the `is_admin()`
  these four gates call is 0067's.
- **`/coin-desk`'s own admin gate.** It lives in the group's
  `+layout.server.ts`, which this bundle does not drive; the non-admin page-load
  test deliberately exercises the load with a non-admin client to show what the
  RPC contributes on its own.

### THE COVERAGE REPORT: 22 of 22, AND THE SET IS CLOSED

Who drives each is **MEASURED, not grepped**: the shim's `rpc` was instrumented
to append its function name to a trace file, the full suite was run once with it
(201 files / 4236 tests, still all passing), and the shim was restored from a
copy and md5-checked (`d30791ab172ad8f980ec052491942a80`).

**Every one of the 22 client-callable set-returning functions is now driven
through a client-shaped call**, and neither private helper appears in the trace,
which is the control saying the instrument records what actually ran rather than
what was named. This bundle's four are the last, at 10, 11, 12 and 12 calls:

    gauntlet_author_roster       10
    coin_admin_list_sections     11
    coin_my_contract_claims      12
    gauntlet_practice_pressure   12

**RAW SQL AND A CLIENT-SHAPED CALL ARE STILL DIFFERENT CLAIMS, and this bundle
is the third time the difference has cost something.** Before it,
`gauntlet_practice_pressure` had thirteen raw-SQL tests over it and
`coin_my_contract_claims` had none of either -- and the one that had never been
called from a client is exactly where the shim's own model was wrong. The
distinction is worth keeping in any figure quoted from here.

**`coin_admin_list_contracts` remains driven but NOT PINNED**, unchanged from
the previous entry: it comes along as the positive half of a control and has no
whole-set pin of its own. Of the 22, **21 now carry a whole-set projection pin**
and that one does not.
