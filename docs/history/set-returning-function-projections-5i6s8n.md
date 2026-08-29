---
title: "The three anon-granted coin reads and the Foundry gallery are read as their real callers, and every projection is pinned whole (`claude/set-returning-function-projections-5i6s8n`, no migration)"
date: 2026-08-29
branches: [claude/set-returning-function-projections-5i6s8n]
migrations: []
subsystems: ["Testing", "Coin economy", "Foundry"]
---

Third in the line that starts at `docs/history/postgrest-shim-set-returning-57e7a3.md`
(the shim's set-returning path), runs through
`docs/history/set-returning-function-tests-imch2v.md` (the five ungated admin
reads) and `docs/history/route-tests-degrade-path-gmqirc.md` (two route tests
off the degrade rung). Those asked WHO may call. This one asks WHAT a caller
receives, on the four reads nearest a real surface.

**No migration, no `src/` change, and nothing under `supabase/migrations/` was
written at any point, mutation proof included.** Two new test files and one
additive change to `tests/db/postgrest-shim.ts`, stated below.

### The premise, verified rather than taken

Every existing test of `coin_public_leaderboard`, `coin_public_transactions`
and `coin_public_student` reaches them in RAW SQL -- `select * from
public.coin_public_leaderboard()`, `select public.coin_public_student($1)` --
across `coin-medium`, `coin-public-medium`, `coin-public-adjustments` and
`coin-public-ledger`. `foundry_list_apps` is the same in
`foundry-app-cap`, `foundry-policies` and `foundry-author-class`. Instrumented
across the whole suite (the shim's `rpc` appending its function name to a file,
restored afterwards from a copy and md5-checked), **all four made ZERO
client-shaped calls before this bundle**, and so did `foundry_play_counts`.

**And the chains compound it.** `coin-public-ledger.test.ts` is the one file
carrying 0137, and its chain stops at **0089** -- so the anon grants it asserts
are asserted against the 0089 definitions. The projection these functions have
TODAY (0103's `medium` and `transfer_id`, 0107's `adjustments`) had never been
read by any test on a chain carrying 0137 at all.

### `coin_public_student` IS NOT A SET-RETURNING FUNCTION, and the brief groups it with two that are

It returns `jsonb`, so `proretset` is false and PostgREST answers the value
rather than an array. It is not one of the 23 and the previous audit's list is
right to exclude it. It is nonetheless anon-granted, it is the one read
addressed to a NAMED student, and it is the most disclosure-relevant of the
three -- so it is driven here beside them. The distinction matters only for the
coverage arithmetic at the end, where the denominator is the 23.

### The grants, verified here

`has_function_privilege` on the real fixture: `anon` holds EXECUTE on
`coin_public_leaderboard()`, `coin_public_transactions(integer)` and
`coin_public_student(text)`, and does NOT hold it on `_coin_public_roster()`
(the internal read all three select from, and the one carrying
`student_email`), on `coin_admin_list_section_students(text)`, or on
`coin_eating_pass_strikes(text)`. **The negative controls are the half that
makes it a partition** rather than a fixture in which anon can call anything.

`foundry_list_apps` is the fourth and is granted to `authenticated` only, with
`(select auth.uid()) is not null` in its own body: its audience is every
signed-in student, not the internet.

### `tests/db/postgrest-shim.ts` GAINS A NULL CALLER, and that is the one shared file this bundle touches

The shim ran `db.asUser` unconditionally, so it could model only a signed-in
caller -- which the previous entry states as a limit and which makes a public
surface unaskable through it. A signed-out visitor is not that caller with a
field left blank: PostgREST hands the request to the `anon` ROLE, whose EXECUTE
grants are a different set (0137 is the migration whose entire subject is that
difference) and inside which `auth.uid()` is null.

So `userId` is now `string | null` and one helper, `runAs`, routes null through
`db.asAnon`. One helper rather than a branch at each of the three call sites,
for the ordinary reason. **Every existing caller passes a string and is
unaffected**, which the 183-file baseline re-run below confirms.

**THE SHIM BEING GENUINELY ANON IS ITSELF ASSERTED**, because without it every
"a signed-out visitor receives X" claim in the file is equally satisfied by a
shim quietly running as the table owner -- the exact vacuum 0137 was written to
end. The SAME client that answers the three public calls is refused
`coin_admin_list_section_students` with `permission denied`, and an admin's
client is given it, in one test.

### The projections, pinned whole

A disclosure arrives as an ADDED field, so an assertion that names the fields
it dislikes cannot catch one -- it passes forever while the payload grows
around it. Every projection here is pinned as the COMPLETE key set of a real
returned row.

**`coin_public_leaderboard`, 14 columns**: `student_id`, `name`, `section`,
`awarded`, `fines`, `spent`, `adjustments`, `paid_out`, `balance`, `debt`,
`weekly_wage`, `wage_tier`, `physical_balance`, `digital_balance`. Every one
earns its place: a leaderboard needs a name and the figures it ranks on, the
section is what it groups by, and `student_id` is the opaque
`md5(secret salt || email)` that exists precisely so the drawer can address one
student without an address. **What is absent is the finding**: no email, no
`student_email`, no role, no `section_id`, no user id, no strike count, and **no
timestamp of any kind** -- a `last_transaction_at` here would place a named
student in a room at a moment, which a ranking does not need.

**`coin_public_transactions`, 7 columns**: `occurred_at`, `name`, `amount`,
`type`, `reason`, `medium`, `transfer_id`. **`occurred_at` is the one field
worth arguing about and it is named in the file rather than waved past**: it is
second-precise and it sits beside a name, so the feed does say that a named
student was fined at 10:42. It is also the ledger's own event time and what the
page sorts and renders, so dropping it ends the feed. The trade is written down.
`transfer_id` is a uuid minted for a payout's two halves and identifies nobody.

**`coin_public_student`, 11 keys** plus 6 per history entry. `eating_pass_held`
is a BOOLEAN and the strike count is absent, which is 0089's stated boundary
("two strikes from losing it is between the student and an admin"). This pin is
what holds it; `coin_eating_pass_strikes` being anon-revoked is the second,
independent half.

**`foundry_list_apps`, 19 columns.** Both `owner_display_name` AND
`owner_full_name`, on purpose: `foundryAuthorName` picks the first when set and
the second otherwise, and CLAUDE.md pins that the third rung -- the email -- is
never one of them. Two name columns and no address is the shape that rule
describes. `owner_class` is the roster's answer projected inside the definer;
**`profiles.section_id` appears nowhere**, which is asserted by VALUE as well as
by key, with the author's self-declared section set to a string that is not the
course title.

### NONE OF THE FOUR IS `select *`, WHICH IS THE ANSWER TO THE `app_short_link_list` QUESTION

`app_short_link_list` returns `select *` over its table, so a column added to
`app_short_links` by any later migration reaches every admin screen with 0093
unchanged -- which is why the previous bundle pinned its seven columns.

**These four are structurally different and the reasoning does NOT carry
across.** All four declare an explicit `returns table (...)` column list AND an
explicit select list; `coin_public_student` builds its history with
`row_to_json(h)` over a subquery whose select list is also explicit. A widening
of `coin_transactions`, `profiles` or `student_apps` therefore cannot reach any
of them. **Only an edit to the function itself can**, and that is what the pins
catch -- which is a narrower job than `app_short_link_list`'s pin does, and
worth stating so nobody reads the two as the same guard.

**The route is a SECOND, independent gate on three of them, and it is not the
same gate.** `readCoinPublic` maps the leaderboard and the transaction feed into
CSV column by column, by hand, so an added RPC column does not reach a visitor's
browser at all -- measured: the email mutant reddened the RPC pin and left both
CSV pins green. The `student` action does the opposite: it spreads the drawer
object through whole (`{...detail, history}`), so an added key DOES reach the
wire -- measured, three tests including the route pin. Both CSV headers are
pinned in their own right, because that hand-written list can drift from the RPC
and from the row mapping beside it.

### Mutation proof: ten mutants, all permissive, every one reddening

**`supabase/migrations/` was never written to.** Each mutant is a mutated COPY
in a scratch directory OUTSIDE the repo, with the test's chain re-pointed at it
through a relative path the harness's `join()` resolves back out of the tree;
the test file is copied to a `zz-mutant-*` name under `tests/` so its relative
imports still resolve, and deleted afterwards. **`git checkout --` was used
nowhere.** All six touched migration files were md5-checked against copies taken
BEFORE the first mutant ran and are byte-identical, and `tests/db/postgrest-shim.ts`
was restored from a copy and md5-checked after each of the three instrumented
runs.

| mutant | tests reddened |
| --- | --- |
| 0107: the leaderboard gains a `student_email` column | 2 (the 14-column pin, the email sweep) |
| 0107: the leaderboard gains a benign `last_transaction_at` | **1** (the 14-column pin alone) |
| 0103: the feed gains `actor_email`, the logging admin's address | 2 (the 7-column pin, the email sweep) |
| 0103: the drawer gains `eating_pass_strikes` | 3 (the key pin, the strike-absence test, the ROUTE's student JSON pin) |
| 0137: `anon` regains EXECUTE on the roster, the admin list and the strikes | 2 (the grant partition, the shim-is-anon control) |
| 0137: `coin_transactions` opened to `anon` with a `using (true)` policy | 1 (the direct-table denial) |
| 0132: the gallery gains `owner_email` | 2 (the 19-column pin, the email sweep) |
| 0132: `owner_class` comes from `profiles.section_id` | 2 (the positive control, the section_id test) |
| 0132: the review trail's `case` opens to everyone | 2 (the browsing student, the non-admin teacher) |
| 0130: `_foundry_app_in_population` becomes `select true` | 3 (the control, the teacher, the population test) |

**THE BENIGN-COLUMN MUTANT IS THE ONE THE BRIEF ASKED FOR, and it reddens
exactly one test.** A timestamp column carries no address, so the email sweep
cannot see it; only the whole-set pin catches it. That is the proof that "a new
column reaching an anonymous caller reddens" is a property of the pin and not a
side effect of the sweep, and one test is the blast radius worth having -- an
assertion that reddens on everything is an assertion about nothing.

**0137 REFUSES A `k_keep` EDIT OUTRIGHT, which is a finding of its own.** The
first form of the grant mutant added the three private names to `k_keep`, and
0137's own self-check raised `0137 did not take: anon still holds EXECUTE on
_coin_public_roster, coin_admin_list_section_students, coin_eating_pass_strikes`
and rolled the file back. The mutant had to grant them back AFTER the guard --
which is also the more faithful shape, since the regression this guards against
is a LATER migration handing the grant back, not an edit to 0137.

### Two things the fixtures had to be built for

**Every leaderboard bucket is non-zero and no two are equal** (awarded 25, fines
3, spent 190, adjustments 400, paid_out 40, balance 232, wage_tier 2,
weekly_wage 2, physical 40, digital 192), and every figure is derived from the
fixture rather than read off the answer. A payload whose fields are all 0, or
all the same number, is one in which a mis-mapped column reads correct. Grace is
the control: she moves none of the buckets Ada moves.

**The first draft of that fixture was wrong in a way worth recording.**
`coin_admin_adjust_balance` writes an ADJUSTMENT-kind row, which 0107 excludes
from `awarded` -- so an opening balance logged that way leaves `awarded` at 0,
and the first run pinned 390 and got 0. The fix was a real award category
(`contract_completion`), not a re-pin.

### THE OWNER SEES THEIR OWN UNPUBLISHED APP ON THE GALLERY, and that is the rule

The foundry test first asserted that neither an unpublished nor a hidden app
reaches any gallery, and the author's own draft reddened it.
`_foundry_app_in_population` (0130) admits an unpublished app to its OWN owner
(`p_owner = (select auth.uid())`), so an author's gallery is their shelf plus
everyone's published work. The assertion was corrected to the actual rule rather
than the expected one, and now states both halves: the draft is the owner's
alone (a peer, a non-admin teacher and an admin all get one app), and a HIDDEN
app is off every gallery including its owner's and an admin's, because the load
passes no widening flag.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived on this tree
  with a placeholder `.env` written BEFORE `npx svelte-kit sync`. Unchanged, as
  it must be: no `.svelte` file and no `src/` file is touched.
- **Full suite: 183 files / 3864 tests before, 185 / 3897 after.** Both
  all-passing. 3864 + 23 + 10 = 3897; every moved number is this bundle's two
  files. **No pre-existing test moved.**
  - **The BEFORE figure was re-derived on a pristine tree.** The first baseline
    run overlapped an in-progress edit to the shared shim, so it was discarded
    and re-run with the shim restored from a copy (md5 `7eb3cb4c...`) and both
    new files moved out of `tests/`. It came back identical, which is the
    expected answer for an additive change and is not a substitute for having
    measured it.
- **`npx vitest run <two files>` runs them in PARALLEL and one fails**; `npm
  test` passes both. That is the documented parallelism trap (the
  `create role ... if not exists` race in `tests/db/supabase-stub.sql` against
  the one shared cluster), not a defect in either file -- both pass alone and
  both pass under `npm test`.
- **Every denial has a positive control ahead of it and the controls run
  FIRST**: the addresses really are in the ledger behind the no-email sweep, a
  strike count really is a number for the student whose drawer omits it, the
  author's `profiles.email` really is set, `profiles.section_id` really holds
  the self-declared value, both unpublished and hidden rows really exist, and
  the viewer's OWN profile row really is readable on the same connection that
  reads nothing of the author's.

### Not verified

- **The live project.** No migration, no `src/` change. Every claim is against
  the embedded fixture with the real migration files applied.
- **Real PostgREST.** What these four return over the wire is modelled by the
  shim from PostgREST's documented call shape, not measured against a running
  instance. That applies to the `anon` path exactly as it applied to the
  signed-in one: `db.asAnon` is `set role anon` with no claims, which is what
  PostgREST does, but nobody has put a request to a real instance.
- **The screens.** The Ledger (`static/coins/index.html`) and the Foundry
  gallery page are not rendered anywhere here and no browser pass was run. This
  bundle asserts the projection at the database, the transport and, for
  `/api/coin/public`, the route.
- **`is_admin()`'s 0138 form.** Neither chain carries 0138, so the `is_admin()`
  these gates call is 0067's.

### THE COVERAGE REPORT: 12 of the 23 have now been read through a client-shaped call

Re-derived independently (parsing every `create [or replace] function` in
`supabase/migrations/` and reading the clause past its own argument list) --
**23 distinct set-returning names**, the same 23 the previous entry found, with
no twenty-fourth. Who drives each is MEASURED, not grepped: the shim's `rpc`
instrumented across the full suite, then across this bundle's two files alone,
so each name's count is attributable.

**Driven through a client-shaped call (12).** `admin_list`,
`app_short_link_list`, `classroom_section_roster`,
`coin_admin_list_section_students`, **`coin_public_leaderboard`**,
**`coin_public_transactions`**, `coin_role_admin_list_applications`,
`coin_role_admin_list_holders`, `coin_role_admin_list_role_questions`,
**`foundry_list_apps`**, **`foundry_play_counts`**, `gauntlet_run_review`. The
four in bold are this bundle's; `foundry_play_counts` comes along because the
gallery load makes both reads. (`coin_public_student` is driven here too and is
not in the count: it returns `jsonb`.)

**THE REAL DENOMINATOR IS 21, NOT 23.** `_coin_public_roster` and
`_notebook_section_roster` are private helpers revoked from every client role;
there is no client-shaped call to make, and they are reached only from inside
definer functions. Counting them as a hole would mean waiting forever for a
test that cannot be written.

**The nine that remain, by the surface they sit behind:**

| function | surface | gate |
| --- | --- | --- |
| `coin_public_contracts` | **PUBLIC** (`anon`, 0137 k_keep) | none; projects the address away |
| `coin_public_reasons` | **PUBLIC** | none |
| `coin_public_role_questions` | **PUBLIC** | none; the anon-facing sibling with no answer key |
| `coin_public_roles` | **PUBLIC** | none |
| `coin_public_sections` | **PUBLIC** | none |
| `coin_admin_list_contracts` | ADMIN | inline `is_admin()` |
| `coin_admin_list_sections` | ADMIN | inline `is_admin()` |
| `coin_my_contract_claims` | signed-in, OWN ROWS | `current_user_email()` |
| `gauntlet_practice_pressure` | signed-in | `authenticated` grant |

**Five of the nine are anon-granted, which makes them this bundle's own subject
one surface over** -- the same question (what does a stranger receive) about the
Ledger's contracts board, its reason list, its role cards and its section list.
`coin_public_contracts` is the one to take first: it is the only one of the five
that carries a per-student field at all (`contractors`), and
`readCoinPublic`'s `contracts` action reshapes it by hand into six field names,
so it has both gates this bundle found on the leaderboard and neither is
asserted.

`coin_admin_list_sections` and `coin_my_contract_claims` are still the two the
previous entry named as never executed by anything; they are now the only two
of the 23 with **no test of any kind**, since everything else here at least has
raw-SQL coverage.

