---
title: "The Ledger's five remaining public boards are read as a signed-out visitor, and the route turns out to be a second gate on three of them and none on two (`claude/anon-coin-public-projections-mrlg0d`, no migration)"
date: 2026-08-29
branches: [claude/anon-coin-public-projections-mrlg0d]
migrations: []
subsystems: ["Testing", "Coin economy"]
---

Fourth in the line that starts at
`docs/history/postgrest-shim-set-returning-57e7a3.md` (the shim's set-returning
path), runs through `docs/history/set-returning-function-tests-imch2v.md` (the
five ungated admin reads), `docs/history/route-tests-degrade-path-gmqirc.md`
(two route tests off the degrade rung) and
`docs/history/set-returning-function-projections-5i6s8n.md`, which drove the
three anon-granted coin reads nearest a named student and named these five as
the same question one surface over:

    coin_public_contracts        the contracts board
    coin_public_reasons          the price guide
    coin_public_roles            the role definitions and open-slot counts
    coin_public_role_questions   a role's application questions
    coin_public_sections         the section colour map

**No migration, no `src/` change, and nothing under `supabase/migrations/` was
written at any point, mutation proof included.** One new test file,
`tests/coin-public-board-anon-projection.test.ts`, 42 tests. `tests/db/` was
touched only transiently, for the coverage instrumentation described at the
end, and restored from a copy and md5-checked.

### The grants, verified here rather than read from the previous entry

`has_function_privilege` against the real fixture, in one query that also
carries its own negative half: `anon` holds EXECUTE on
`coin_public_contracts()`, `coin_public_reasons()`,
`coin_public_role_questions(p_role_id text)`, `coin_public_roles()` and
`coin_public_sections()`, and does NOT hold it on `_coin_public_roster()` (the
internal read carrying `student_email`), `coin_admin_list_contracts()`,
`coin_admin_list_sections()`, `coin_role_admin_list_role_questions(p_role_id
text)` or `coin_my_contract_claims()` -- four of which are still open to
`authenticated`, so this is a PARTITION and not a fixture in which everything
is revoked.

**THE SHIM BEING GENUINELY ANON IS ASSERTED AGAIN, and with a sharper pair than
the sibling file's.** The same client that answers all five public calls is
refused `coin_role_admin_list_role_questions` with `permission denied`, and the
ADMIN's client on the same shim is given it. That is the identical question
(what are this role's application questions) asked of two functions whose only
real difference is `correct_option_index` -- so the control and the disclosure
boundary are the same measurement.

### THE SHAPE QUESTION, ANSWERED: ALL FIVE ARE THE `returns table` KIND

The previous bundle raised the distinction against `app_short_link_list`, which
is `returns setof public.app_short_links` over `select *` -- so a column added
to that table by any later migration reaches every admin screen with 0093
unchanged.

**None of these five is that shape.** Read off `pg_get_function_result` in the
catalog, each declares an explicit `TABLE(...)` column list, and each body has
an explicit select list with no `select *` in it. A widening of
`coin_contracts`, `coin_categories`, `coin_sections`, `coin_role_definitions`
or `coin_role_quiz_questions` therefore cannot reach a public caller; only an
edit to the function itself can. **So the pins here do the narrower job**, and
the file says so rather than letting the two guards read as the same guard.

The contrast control is read from the MIGRATION TEXT rather than the catalog,
because 0093 is not on this chain and adding a short-link migration to a coin
fixture to buy one assertion would change what the fixture is. It asserts the
function is absent from this database AND that 0093's first two lines really do
say `returns setof public.app_short_links`. Without that half, "these five are
the other kind" would be a claim about a category with nothing in it.

**Each projection is pinned TWICE from one constant** (`PROJECTIONS`): as the
declared result columns in `pg_proc`, and as the complete key set of a real row
a signed-out caller received. The catalog half is what still reddens when a
fixture happens to return no rows.

### THE ROUTE FINDING: `readCoinPublic` IS A SECOND GATE ON THREE OF THE FIVE AND NONE ON TWO

The sibling bundle measured this distinction BETWEEN two route actions -- a CSV
mapped column by column does not leak an added RPC column, an object spread
through whole does. **Here it runs down the middle of one module**, and neither
half was asserted anywhere:

| action | shape | an added RPC column reaches a browser? |
| --- | --- | --- |
| `contracts` | hand reshape, 13 named keys | **no** |
| `roles` | hand reshape into a grouped shape | **no** |
| `roleQuestions` | hand reshape, 5 named keys | **no** |
| `reasons` | `JSON.stringify(data ?? [])` | **yes, verbatim** |
| `sections` | `JSON.stringify(data ?? [])` | **yes, verbatim** |

That is measured, not read: the `reasons` and `sections` benign-column mutants
each reddened the ROUTE pin, and the `contracts`, `roles` and
`questions-answer-key` mutants each left every route pin green. **The
answer-key mutant is the one worth stating out loud** -- with
`correct_option_index` added to `coin_public_role_questions`, the key reaches
the RPC and the route's hand reshape still drops it. The route is genuinely the
last gate there, and it is a gate nobody wrote down as one.

**And the reshape is not lossless in the other direction either.**
`contracts` DROPS `created_at`, which the RPC returns and no browser ever sees,
so the RPC's projection and the wire's are not the same list. Pinned in its own
right rather than left implied by the key set, because a reader who checked
only one of the two would have the wrong idea of either.

### WHAT A STRANGER RECEIVES, FIELD BY FIELD

**`coin_public_contracts`, 13 columns**: `id`, `title`, `description`,
`payout_amount`, `max_contractors`, `claimed_count`, `status`, `section`,
`contractors`, `created_at`, `completed_at`, `cancelled_at`, `cancel_reason`.
It is the only one of the five carrying a per-student field.

  - **`contractors` IS THE FIELD, AND THE TRADE IS THAT AN UNNAMED CLAIMANT IS
    PUBLISHED AS THE LOCAL PART OF THEIR ADDRESS.** Both
    `_coin_public_roster`'s resolution chain and `coin_public_contracts`' own
    inner `coalesce` fall through to `split_part(student_email, '@', 1)`. The
    student domain is a single fixed string (`role_for_email`:
    `@boscotech.net`), so a local part on a public page plus that constant
    reconstructs the whole address. **This is not a field somebody forgot**:
    0089's header states the resolution chain openly in its first section. It
    is nonetheless the widest thing this board says about a named person, and
    nothing asserted it in either direction until now. The alternative is a
    claimant rendering as nothing on a board whose entire purpose is saying who
    is on a job, so the trade is deliberate; what is worth catching is a
    CHANGE to it, and the pin reddens both if the fallback widens to the whole
    address (measured) and if somebody removes it and the board starts
    publishing blanks.
  - **THE RULE IS WRITTEN TWICE AND BOTH COPIES ARE EXERCISED.** The roster's
    is reached by a claimant who is ON the roster and named nowhere; the
    function's own is reached by a claimant the roster does not carry at all.
    The second needed a fixture correction to reach: the first draft put that
    student on the COMPLETED contract, and completing a contract PAYS its
    claimants (0077), which is a `coin_transactions` row, which is one of the
    two things `_coin_public_roster` unions -- so the roster carried her and
    the branch was never entered. She is on an unsectioned, still-open contract
    instead, which is the only place a claimant can stand and stay off the
    roster (`coin_contract_self_claim` refuses a section mismatch but lets
    anyone signed in claim a contract with no section). Its positive control
    asserts the roster really returns zero rows for her.
  - **`section` is the LABEL, never the id**, with the id asserted present in
    the stored row so the projection is doing something.
  - **What is absent is the finding**, and the paired control makes it a
    measurement: `coin_admin_list_contracts` answers the same question with
    `created_by` -- a staff EMAIL -- and `claimants` as structured jsonb.
    Neither is anywhere in the public thirteen, and that function is closed to
    `anon`.
  - An unclaimed contract says `''`, not null, which is the function's own
    `coalesce(k.names, '')`.

**`coin_public_reasons`, 4 columns**: `type`, `reason`, `detail`, `sort_order`.
Nobody is named and there is no per-student question here at all. **The one
field worth arguing about is `detail`**, which concatenates the price with
`coin_categories.notes` -- free text an admin writes through
`coin_admin_create_category`, reading in the seed data as internal pricing
rationale ("Attacks the currency itself", "Real physical injury risk, priced at
the top on purpose"). Those sentences are fine on a public guide and are
arguably its point: a student should see what a thing costs and why. What they
are not is a private admin note, and nothing in the column's name or its write
path says so. The test pins that `notes` reaches `detail` verbatim, which is
the assertion that says the field is a publication surface -- a note naming a
student or an incident would reach the internet by the same path, and the fix
would be in the write path, not in a test.

**`coin_public_roles`, 8 columns**: `section_id`, `section`, `role_id`, `role`,
`description`, `capacity`, `held`, `open`. **`held` is the widest thing it
says, and it says it about a SECTION rather than a person**: "two of three
Safety Officer slots in Engineering I are taken" identifies nobody, and an
open-slot count is exactly what a student deciding whether to apply needs. The
identities are behind `coin_role_admin_list_holders`, which is admin-gated.
**`section_id` is the one internal key of the five that reaches a signed-out
caller** -- an admin-chosen slug from `coin_admin_upsert_section`'s `p_id`, so
it names nobody, and the only shipped consumer drops it. Named in the file
because a reader comparing the RPC's list against the browser's would otherwise
wonder which of the two is wrong.

**`coin_public_role_questions`, 5 columns**: `question_id`, `sequence`, `type`,
`question_text`, `options`. **The answer key is absent**, with the count of
questions that really have one asserted first, and the admin sibling asserted
to carry it.

  - **`options` IS THE ONE RAW JSONB COLUMN PASSED STRAIGHT OUT, which makes it
    the one place a widening needs no function edit.** 0076's CHECK constrains
    it to a jsonb ARRAY of length 2-8 and says nothing about the ELEMENT type,
    so `["A", {"correct": true}]` is representable today and would reach a
    browser through both the RPC and the route. Nothing on the page would show
    it -- the Ledger renders option text -- so it is exactly the silent kind.
    The test asserts every element is a string. **This is an observation about
    a gap in the constraint, not a claim that anything is wrong today**; closing
    it properly is a narrowing of that CHECK, with its own answer for the rows
    already stored.
  - A `written` question carries neither options nor a key, an INACTIVE
    question is excluded (with the retired row asserted to exist), and a role
    with no questions and a role id that names nothing answer identically -- so
    a role cannot be probed for existence through this read.

**`coin_public_sections`, 2 columns**: `section`, `color`. A label and a hex
string; nobody is named. A section with no colour is absent, with the
uncoloured section asserted to exist.

### An observation this bundle did NOT act on

`coin_public_sections` is `select distinct on (<label expression>) ... from
coin_sections` with **no `order by`**. `distinct on` without a matching sort
picks an arbitrary row from each group, so two active sections sharing a label
and carrying different colours would resolve to an unpredictable colour, and
could resolve differently between two page loads. It is not asserted here,
because an assertion over an arbitrary choice is a flaky test, and it is not
fixed here, because `supabase/migrations/` is out of this bundle's scope and a
migration is global regardless of which branch its file sits on. **Recorded so
the next person reading this function does not have to rediscover it.**

### Mutation proof: nine mutants, all permissive, every one reddening

**`supabase/migrations/` was never written to.** Each mutant is a mutated COPY
in a scratch directory OUTSIDE the repo, with the test's chain re-pointed at it
through a relative path the harness's `join()` resolves back out of the tree;
the test file is copied to a `zz-mutant-*` name under `tests/` so its relative
imports still resolve, and deleted afterwards. **`git checkout --` was used
nowhere.** Both touched migration files were md5-checked against copies taken
BEFORE the first mutant ran and are byte-identical
(`0089` `4e4d9642...`, `0137` `80a4a143...`).

| mutant | tests reddened |
| --- | --- |
| 0089: the contracts board gains `claimant_emails` | 3 (the catalog pin, the 13-column pin, the email sweep) |
| 0089: the contracts board gains a benign `posted_at` | **2** (the catalog pin and the 13-column pin alone) |
| 0089: `contractors` widens from the local part to the whole address | 4 (the local-part pin, the route's no-address test, both sweeps) |
| 0089: the price guide gains `category_id` | 3 (the catalog pin, the 4-column pin, **the ROUTE pin**) |
| 0089: the roles board gains `section_note` | 2 (the catalog pin and the 8-column pin; every route pin green) |
| 0089: the questions read gains `correct_option_index` | 3 (the catalog pin, the 5-column pin, the answer-key test; **every route pin green**) |
| 0089: the colour map gains `section_id` | 4 (the catalog pin, the 2-column pin, the value control, **the ROUTE pin**) |
| 0137: `anon` regains EXECUTE on the roster, both admin lists, the keyed questions read and the own-claims read | 2 (the grant partition, the shim-is-anon control) |
| 0137: `coin_contracts` and `coin_contract_claims` opened to `anon` with `using (true)` policies | 1 (the direct-table denial) |

**THE BENIGN MUTANTS ARE THE ONES THAT MATTER, as the previous bundle
established.** A column carrying no address is invisible to the email sweep, so
only a whole-set pin can catch it -- and the two-test blast radius is the one
worth having, since an assertion that reddens on everything is an assertion
about nothing.

**0137 REFUSES A `k_keep` EDIT OUTRIGHT**, exactly as the previous bundle
found: the grant mutant appends its `grant execute` statements AFTER the file's
own self-check rather than editing the keep list, which is also the more
faithful shape -- the regression being guarded against is a LATER migration
handing the grant back, not an edit to 0137.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived on this tree
  with a placeholder `.env` written BEFORE `npx svelte-kit sync`. Unchanged, as
  it must be: no `.svelte` file and no `src/` file is touched.
- **Full suite: 193 files / 4123 tests before, 194 / 4165 after.** Both
  all-passing. 4123 + 42 = 4165; every moved number is this bundle's one file.
  **No pre-existing test moved.**
- **A fresh checkout needed `npm ci`, then a placeholder `.env`, then
  `npx svelte-kit sync`**, which is the documented order and is what it took
  here.
- **Every denial has a positive control ahead of it and the controls run
  FIRST**: the claim rows really carry `@boscotech.net` addresses behind the
  no-email sweep, the off-roster claimant really is absent from
  `_coin_public_roster`, two safety-officer questions really carry a
  `correct_option_index`, a retired question really exists, an uncoloured
  section really exists, a non-loggable category really exists, the section id
  really is what the contract row stores, and the same shim really does answer
  an ADMIN's identical select and RPC.

### Not verified

- **The live project.** No migration, no `src/` change. Every claim is against
  the embedded fixture with the real migration files applied.
- **Real PostgREST.** What these five return over the wire is modelled by the
  shim from PostgREST's documented call shape, not measured against a running
  instance. `db.asAnon` is `set role anon` with no claims, which is what
  PostgREST does for an unauthenticated request, but nobody has put a request
  to a real instance.
- **The screen.** The Ledger (`static/coins/index.html`) is not rendered
  anywhere here and no browser pass was run. This bundle asserts the projection
  at the database, at the transport and at `/api/coin/public`.
- **`is_admin()`'s 0138 form.** This chain does not carry 0138, so the
  `is_admin()` these gates call is 0067's.
- **The `distinct on` observation above** is read from the SQL, not
  demonstrated with two same-labelled sections.

### THE COVERAGE REPORT: 18 of 22, and the DENOMINATOR MOVED

Re-derived independently (parsing every `create [or replace] function` in
`supabase/migrations/`, reading the return clause PAST the function's own
argument list, latest definition winning): **24 distinct set-returning names**,
of which `_coin_public_roster` and `_notebook_section_roster` are private
helpers revoked from every client role and reachable only from inside definer
functions. **The client-callable denominator is therefore 22, not 21.**

**IT MOVED BECAUSE THE SCHEMA MOVED, WHICH IS WORTH SAYING.** The previous
entry counted 23 names and a denominator of 21; `gauntlet_author_roster` landed
in `0155_gauntlet_authoring_tier.sql` (merged into `integration` after that
entry was written) and is a twenty-fourth. A coverage figure over a growing
schema is a ratio with a moving bottom, so the count is re-derived every time
rather than carried forward.

Who drives each is **MEASURED, not grepped**: the shim's `rpc` was instrumented
to append its function name to a trace file, the full suite was run once, and
the shim was restored from a copy and md5-checked
(`64f3547f4ae94857736642aa024b8ba5`, matching the pre-instrumentation copy).

**Driven through a client-shaped call (18).** `admin_list`,
`app_short_link_list`, `classroom_section_roster`,
**`coin_admin_list_contracts`**, `coin_admin_list_section_students`,
**`coin_public_contracts`**, `coin_public_leaderboard`,
**`coin_public_reasons`**, **`coin_public_role_questions`**,
**`coin_public_roles`**, **`coin_public_sections`**,
`coin_public_transactions`, `coin_role_admin_list_applications`,
`coin_role_admin_list_holders`, `coin_role_admin_list_role_questions`,
`foundry_list_apps`, `foundry_play_counts`, `gauntlet_run_review`. The six in
bold are this bundle's.

**`coin_admin_list_contracts` is driven but NOT PINNED, and the distinction is
worth keeping.** It comes along as the positive half of a control -- the file
asserts it carries `created_by` and `claimants`, which is what makes the public
board's narrowness a measurement rather than a description -- and its own
projection has no whole-set pin. It is the one call in the trace with a count
of exactly 1.

**The four that remain:**

| function | surface | gate |
| --- | --- | --- |
| `coin_admin_list_sections` | ADMIN | inline `is_admin()` |
| `coin_my_contract_claims` | signed-in, OWN ROWS | `current_user_email()` |
| `gauntlet_author_roster` | ADMIN (new, 0155) | the authoring tier |
| `gauntlet_practice_pressure` | signed-in | `authenticated` grant |

`coin_admin_list_sections` and `coin_my_contract_claims` are the same two the
previous two entries named as never executed by anything, and they are still
the only ones of the set with **no test of any kind**.
`gauntlet_practice_pressure` and `gauntlet_author_roster` each have raw-SQL
coverage in their own bundles' suites; what neither has is a client-shaped
call. **None of the four is anon-granted**, so with this bundle every
`anon`-granted set-returning function in the schema has now been read from the
seat that actually calls it.
