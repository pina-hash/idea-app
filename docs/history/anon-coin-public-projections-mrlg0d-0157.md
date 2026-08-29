---
title: "0157 closes the three defects the public-board bundle found and could not fix: an unnamed student stops being published as their address, the colour map gets a total order, and an option becomes a string (`claude/anon-coin-public-projections-mrlg0d`, migration 0157)"
date: 2026-08-29
branches: [claude/anon-coin-public-projections-mrlg0d]
migrations: ["0157"]
subsystems: ["Coin economy", "Testing"]
---

**THE FILENAME DEVIATES FROM THE BRANCH SLUG DELIBERATELY, AND THIS IS THE
ONE THING TO READ FIRST IF THE CONVENTION LOOKS BROKEN.** The convention is
`docs/history/<branch slug>.md`, and it is collision-free because the harness
mints one branch per session. It minted this session the SAME branch name as
the previous one, whose entry is already shipped at
`docs/history/anon-coin-public-projections-mrlg0d.md`. CLAUDE.md's harder rule
wins -- "an entry file is written once and left alone; correcting a past
bundle's account is a NEW entry" -- so this is a new file with a suffix rather
than an overwrite of a shipped record. Nothing else about the convention moves.

Fifth in the line that starts at
`docs/history/postgrest-shim-set-returning-57e7a3.md`, and the first one in it
that WRITES anything. The previous four were all tests. This one is a migration
plus the test that proves it, and its whole subject is the three defects
`docs/history/anon-coin-public-projections-mrlg0d.md` found, argued, asserted
in their broken state, and explicitly declined to fix because a migration was
out of that bundle's scope.

**Migration `0157_coin_public_surface_hardening.sql`. HAS NOT BEEN APPLIED.**
No `src/` change. One new test file (25 tests) and a surgical edit to the
previous bundle's file, stated below.

### The highest migration on `integration` is 0155

`0155_gauntlet_authoring_tier.sql`, the GAUNTLET author-tier bundle. There is no
`0156` on `integration` at all: it is taken by a session running concurrently
with this one and had not landed when this branch was cut, which is why this
file is 0157 and not 0156.

### 1. AN UNNAMED STUDENT WAS PUBLISHED AS THE LOCAL PART OF THEIR ADDRESS

**Both fall-throughs verified here rather than taken from the previous entry**,
by driving them as an anonymous caller on the real chain BEFORE the migration
is applied: `_coin_public_roster()`'s fourth rung answered `quiet.claimant` for
a student named nowhere, and `coin_public_contracts()`' own inner `coalesce`
answered `no.roster` for a claimant the roster carries no row for at all. The
same rung reaches the LEADERBOARD, which the pre-migration control also
measures -- so it was three surfaces, not two.

**THERE IS A THIRD `split_part` IN 0089 AND IT IS DELIBERATELY LEFT ALONE.**
`coin_me()` (line 712) resolves the CALLER'S OWN name from the CALLER'S OWN
address and is granted to `authenticated` only. Handing somebody the local part
of the address they typed to sign in discloses nothing, and blanking it would
make a signed-in student's own header read as a stranger's. It has a test of
its own so that a later sweep for `split_part` does not "finish the job".

#### The rungs, before the last one was touched

    1  nullif(btrim(coin_students.display_name), '')   the imported sheet name
    2  nullif(btrim(profiles.display_name), ''))       the name they chose
    3  nullif(btrim(profiles.full_name), ''))          the Google account name
    4  split_part(email, '@', 1)                       THE ONE REPLACED

Rungs 1 to 3 are untouched and still resolve in that order, which is asserted
directly: three students are seeded so that each rung WINS over the ones below
it, and each is checked by value. That is the assertion a careless rewrite of
the `coalesce` breaks, and the mutant that drops rung 1 reddens exactly it.

#### 0089's reasoning does NOT survive, and the reason is provenance

0089's header opens with **"THE ABSOLUTE RULE THIS FILE IS BUILT AROUND: NO
PUBLIC RESPONSE EVER CONTAINS AN EMAIL ADDRESS, UNDER ANY PARAMETER"** and
twenty lines later adopts the four-rung chain wholesale, attributing it to "the
one standing rule 0084 established". **Those two statements contradict each
other and 0089 never noticed.** The student domain is one fixed string
(`role_for_email`: `@boscotech.net`), so the local part IS the address.

Reading 0084 is what settles it. That migration wrote the chain for the LEGACY
IMPORT and the admin-side coin desk, and its stated reason is real: a balance
can exist for an email that has never signed in, such an email has no
`profiles` row, and something has to render. **At 0084 there was no public
surface at all** -- the public read layer is 0089, five migrations later. So a
last resort authored for a room where every reader was already an admin was
carried into a function whose entire purpose is answering somebody with no
account, and its last rung was never argued against 0089's own headline rule.

The first three rungs survive that argument intact: each is a real name a
person chose or the school recorded, and publishing one is what the board is
for. Only the fourth does not.

#### One definition, because two is how these drifted in the first place

`gauntlet_room_board` has used `coalesce(full_name, 'Player')` since 0010 -- a
generic word, never a derived identifier. The coin surface's word is
`'Student'`, and `_coin_public_name_fallback()` is the single place it is
written, called from both sites. It is a function rather than a literal for the
same reason `admin_owner_email()` is one, and the test asserts BOTH callers
reach it AND that neither body inlines the word -- the `two-copies-of-the-word`
mutant, which behaves identically on every surface, reddens that one assertion
and nothing else.

**WHAT THIS COSTS, stated rather than glossed:** several unnamed students on one
leaderboard now all read `Student` and cannot be told apart by name. The page
still works, because 0089 addresses the drawer by the opaque `student_id`
(`md5(salt || email)`) and never by the name. The fix for a student who wants
to be named is a display name, which is what the first three rungs are for.

### 2. `coin_public_sections` HAD NO `order by`

Now ordered by the distinct-on expression, then `s.created_at desc`, then
`s.id`.

**`created_at desc` is the right tiebreak rather than merely a stable one.** A
duplicate label arises when a section is re-cut for a new term under the same
display name; the older row is normally deactivated and `s.active` already
filters it, so two ACTIVE rows sharing a label means the newer is the class in
current use and its colour is the one an admin last chose for that name.
**`created_at` and NOT `updated_at`**, which is the lesson 0132's resolution
order writes down: `updated_at` moves on any edit, so touching an archived
section's note would silently promote its colour.

**`s.id` last, because `created_at` alone is not a total order.** `now()` is
TRANSACTION time, so two sections written in one statement tie exactly. The
test forces that tie rather than hoping for it.

#### A FINDING ABOUT THE TEST, NOT THE FIX: repetition cannot detect this

The first draft asserted determinism by running the query twelve times and
checking the answers agreed. **Three mutants -- the whole `order by` removed,
only the label expression left, and the `s.id` tiebreak dropped over a forced
tie -- reddened NOTHING.** `distinct on` with no matching sort is UNSPECIFIED,
not random: which row survives depends on the plan, and the plan is stable for
a given table, so twelve runs agree on the broken function too.

So determinism is asserted STRUCTURALLY, from the catalog: the `order by`
clause is read out of `prosrc`, whitespace-normalized, and pinned expression
for expression. All four section mutants redden it. The repetition test is kept
and RELABELLED "WEAK CONTROL: repeated runs agree (they agreed before 0157
too)", so nobody reads it as the guard.

### 3. `coin_role_quiz_questions.options` WAS A CONSTRAINT THAT DID NOT CONSTRAIN

0076 requires a jsonb array of 2 to 8 elements and says nothing about what is in
them, and `coin_public_role_questions` passes `options` out as raw jsonb to an
anonymous caller. The pre-migration control proves the gap is real rather than
theoretical: `["Left", {"text": "Right", "correct": true}]` INSERTS cleanly
under 0076 alone.

The new constraint says an option is a **non-blank JSON string of at most 200
characters** -- 200 being the schema's own idiom for a short human-facing string
(`coin_students.display_name`). It is a SEPARATE constraint rather than a
rewrite of 0076's, so each remains the single statement of one rule, and it
deliberately declines to re-state array-ness (`jsonb_typeof(options) is
distinct from 'array'` hands that case straight back to 0076).

**STRICT MODE IS LOAD-BEARING AND WAS MEASURED, NOT ASSUMED.** Under jsonpath's
default LAX mode `$[*]` auto-unwraps a nested array, so `["A", ["x"]]` reports
two STRINGS and passes. Measured on PostgreSQL 17.10: true under lax, false
under strict. The `options-elements-lax-not-strict` mutant is that one word.

**THE PREDICATE IS INLINE WITH NO FUNCTION CALL IN IT**, deliberately: a CHECK
constraint's function runs as the WRITING role and needs an EXECUTE grant to
every role that writes the column (the 0130 lesson). `jsonb_path_exists` is
built in, so the trap is not set at all.

#### Existing rows: counted at apply time, because nothing here can read them

The prompt asked whether existing rows would satisfy the new CHECK. **Nothing
in this repo can answer that**: the table is hand-edited in the SQL editor and
0076's header says the real quiz text is never committed here, so the only rows
any test can see are fixtures it wrote itself. The local `.env` is a
placeholder project.

So the migration answers it, on the real data, and REFUSES rather than failing
on the constraint: a `do` block counts the violating rows and raises naming the
count and the total, and the header carries the same query standalone so an
operator can run it first. **That refusal has its own test on its own
database** -- two violating rows beside one legal one, the apply raising with
`2 of 3 rows`, the rollback verified TOTAL (no constraint, and
`_coin_public_name_fallback` not left behind either), then the rows cleaned and
the identical file applying. It needed a second database because the raise
rolls the whole file back, and it is the one behaviour no mutant of the main
fixture could prove: with no violating row seeded, disabling the guard changes
nothing.

**If it refuses on production, the count is the answer to report** -- this
bundle cannot know it in advance and does not pretend to.

#### The read did not widen while the write narrowed

`correct_option_index` is still absent from `coin_public_role_questions`, and
the projection is pinned as a whole key set. The previous bundle proved by
mutation that adding it to the RPC reaches an anonymous caller while the ROUTE
still drops it -- **the route is not the gate** -- so this is asserted at the
RPC. The `public-questions-gains-the-answer-key` mutant reddens exactly it.

### The previous bundle's 42 tests: 40 unchanged, 2 legitimately reversed

`tests/coin-public-board-anon-projection.test.ts` gains
`0157_coin_public_surface_hardening.sql` on its chain, because that file is the
repo's statement of what a stranger receives and a suite pinning a projection
the deployed schema no longer produces is worse than no pin.

**40 of the 42 pass untouched, which is the real check that 0157 moved only
what it meant to.** The two that change are the two whose SUBJECT was the
fallback, and both are reversals of an argument that bundle made in writing:

  - `BUT AN UNNAMED CLAIMANT IS PUBLISHED AS THE LOCAL PART OF THEIR ADDRESS`
    becomes `AN UNNAMED CLAIMANT IS THE GENERIC WORD, BY BOTH PATHS (0157)`.
    The old comment argued the trade as a choice between an address and a
    claimant rendering as nothing; **0157 took the third option that argument
    missed**, and the new comment says so rather than quietly swapping a value.
  - the route test's second half asserted the local parts were PRESENT in the
    served body; it now asserts they are absent, with `Ada Lovelace` and
    `Student` as the positive control that the board is not simply empty.

**`tests/coin-public-ledger.test.ts` IS LEFT ALONE AND STAYS GREEN, and that is
a found-not-fixed item rather than an oversight.** Its chain stops at
0089 + 0137, so its line 227 -- `expect(text).toContain('orphan.only')`, with
the comment "The orphan is named by the local part alone, with the domain gone"
-- remains TRUE of the world that chain builds. It is 0089's own suite and
testing 0089 as written is its job. But once 0157 is applied, that comment
describes a world production no longer has, and a reader will take it for
current behaviour. **Either add 0157 to that chain or annotate the line**; this
bundle did neither, because the file belongs to no lane running here and two
other sessions were live.

### Mutation proof: sixteen mutants, all permissive, every one reddening

**`supabase/migrations/` was never written to after 0157 was authored**, and no
other migration was written to at any point. Each mutant is a mutated COPY of
0157 in a scratch directory OUTSIDE the repo, with the test's reference to the
file re-pointed at it through a relative path the harness's `join()` resolves
back out of the tree; the test file is copied to a `zz-mutant-*` name under
`tests/` so its relative imports still resolve, and deleted afterwards.
**`git checkout --` was used nowhere.** 0157, 0089, 0076, 0137,
`tests/db/postgrest-shim.ts` and `tests/db/harness.ts` were all md5-checked
against copies taken before the first mutant ran and are byte-identical.

| mutant | tests reddened |
| --- | --- |
| the roster's rung 4 goes back to the local part | 4 |
| the contracts arm goes back to the local part (roster still fixed) | 4 |
| the word is inlined at both sites instead of called for | **1** (the one-definition test) |
| the roster's rung 4 returns the whole address | 4 |
| rung 1, the imported name, is dropped from the chain | **1** (the rung-order test) |
| the new private helper is left granted to `anon` | **1** (the grant partition) |
| the colour map's `order by` is removed entirely | 1 (the structural pin) |
| the colour map orders by the label only, no tiebreak | 1 (the structural pin) |
| the tiebreak omits `s.id`, so a `created_at` tie is unresolved | 1 (the structural pin) |
| the tiebreak is `created_at asc`, so the OLDEST section wins | 3 |
| the options constraint is `check (true)` | 3 |
| the element accessor is lax instead of strict | 3 |
| the blank-element rule is dropped | 2 |
| the 200-character rule is dropped | 2 |
| the apply-time count guard never refuses | **1** (the refusal test, on its own database) |
| `coin_public_role_questions` gains `correct_option_index` | **1** (the answer-key pin) |

**FIVE OF THE SIXTEEN REDDEN EXACTLY ONE TEST**, which is the blast radius worth
having: an assertion that reddens on everything is an assertion about nothing.

**The answer-key mutant had to `drop function` first**, which is the signature
trap in miniature: `create or replace` cannot change a function's return type,
so the first draft of that mutant failed to apply at all and reported as a
suite that never ran rather than as a redden.

**And the file's own self-check caught the file itself, once.** The guard reads
`prosrc` for `split_part`, and both replaced bodies carry a comment recording
what the rung USED to be -- `prosrc` keeps a comment verbatim, so the first
draft raised on the very migration that fixed the defect. Both the migration's
guard and the test's now strip SQL line comments first, with the reason written
beside each: the guard is about what a function COMPUTES, never what it says.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`). No `.svelte` and no
  `src/` file is touched.
  - **IT REPORTED 1 ERROR FIRST, AND IT WAS THE STALE-ROUTE-TYPES TRAP.** The
    container carried a `.svelte-kit` generated on a previous base; checking
    out `ae52eab` brought in GAUNTLET routes from `265a76b` and the phantom
    error named `src/routes/gauntlet/+page.svelte:22`, a file in somebody
    else's bundle. `npx svelte-kit sync` (with the placeholder `.env` already
    written) returned it to 0/37 with the mix intact. **Re-sync after changing
    base, not only after a fresh clone.**
- **Full suite: 199 files / 4192 tests before, 200 / 4217 after.** Both
  all-passing. 4192 + 25 = 4217; every moved number is this bundle's one new
  file, and the two rewritten assertions in the previous bundle's file are
  rewrites rather than additions.
- **The migration is tested over SEEDED PRE-MIGRATION DATA**, which is
  CLAUDE.md's standard for a migration: the chain boots short of 0157, the
  world is built through the real pre-migration RPCs
  (`coin_admin_upsert_section`, `coin_admin_assign_section_students`,
  `coin_admin_post_contract`, `coin_contract_self_claim`), the deployed
  behaviour is measured and recorded, and only then is 0157 pasted over the top
  as one statement batch exactly as an operator will paste it.
- **Three PRE-MIGRATION CONTROLS assert all three defects were real on the
  deployed chain** before anything is claimed to be fixed: the local part
  really was published by both paths and into the leaderboard, the colour map
  really had no `order by`, and a smuggled answer key really did insert.
- **`0157` re-applies.** Pasting it twice changes nothing and raises nothing,
  which is asserted rather than assumed -- the constraint is guarded on
  `pg_constraint` because Postgres has no `add constraint if not exists` and a
  blind drop-then-add raises `2BP01` on the second run.
- **NOTHING RE-RUNS 0137 AFTER 0157, and that is asserted.**
  `coin-medium.test.ts` has to re-apply the sweep after hand-applying 0096,
  because a `create or replace` under this project's default privileges hands
  the replaced function a fresh `anon` grant. 0157 states its own end state
  instead -- `revoke ... from public, anon, authenticated, service_role` naming
  the roles, then granting back only what should hold it -- and the test reads
  the resulting ACL back off the catalog in both directions. **The new helper is
  the one that would otherwise have arrived open**: a function created after
  0137 is granted to `anon` by default and the sweep does not cover it.
- **The shim is genuinely anon**, asserted the same way the previous bundle
  asserts it: the same client that answers the public reads is refused
  `coin_role_admin_list_role_questions` with `permission denied`, and the
  admin's client is given it.

### Not verified, and one of these is the operative one

- **THE LIVE PROJECT. `0157` HAS NOT BEEN APPLIED.** Everything here is against
  the embedded fixture with the real migration files applied. In particular
  **nobody has run the apply-time count against the real
  `coin_role_quiz_questions`**, and this bundle cannot: the local `.env` is a
  placeholder project. The migration refuses with a count if any row violates.
- **The screen.** `static/coins/index.html` is not rendered anywhere here and
  no browser pass was run. What a leaderboard of several rows all reading
  `Student` LOOKS like is reasoned about above, not seen.
- **Real PostgREST.** The anon path is modelled by the shim (`set role anon`,
  no claims), not measured against a running instance.
- **`is_admin()`'s 0138 form.** This chain does not carry 0138.

### Migration files created

    supabase/migrations/0157_coin_public_surface_hardening.sql
