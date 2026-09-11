---
title: "The three sequences `anon` could `setval`, closed by `0203`, and `tests/grant-surface.test.ts` widened to SEQUENCES and VIEWS so a fourth cannot arrive unnoticed (`claude/hopeful-edison-pd3p6r`, migration 0203)"
date: 2026-09-11
branches: [claude/hopeful-edison-pd3p6r]
migrations: ["0203"]
subsystems: ["Grants", "GAUNTLET", "Tournaments", "Testing"]
---

Ledger 0161 measured a second hole while fixing the first and could not take it:
it had spent its one permitted migration on `0202`, the IdeaCAD grant repair.
What it left on the table was three sequences, each carrying
`anon=rwU/postgres` and `authenticated=rwU/postgres` -- USAGE, SELECT and
UPDATE, which is `nextval`, `currval` and `setval`:

    public.gauntlet_run_events_id_seq
    public.tournament_match_events_id_seq
    public.tournament_reward_ledger_id_seq

`0203` revokes them. This entry is mostly about the sweep that found nothing
else, and about the test that now makes a fourth one impossible to ship
quietly.

## The root cause, confirmed rather than accepted

The prompt asked for the reading to be confirmed, and it holds exactly as
stated. This project bootstraps

    alter default privileges in schema public
      grant all on sequences to anon, authenticated, service_role;

which writes a DIRECT grant into every new sequence's `relacl` at creation
time. That is not the SQL default -- the SQL default is one grant to `PUBLIC` --
so `revoke ... from public` removes an entry these three sequences never had.
`0137_anon_execute_sweep.sql` repaired FUNCTIONS, once, over what existed when
it ran; it swept no sequences at all. Everything created since has had to revoke
for itself.

Two things sharpen the reading rather than change it.

**The forgetting is not really `0201`'s alone; a sequence has nobody to forget.**
`0201` did forget, on its functions and its tables, and `0202` is that repair.
But a `bigserial` primary key CREATES a sequence with nobody writing a line for
it -- and so does the `id bigint generated always as identity primary key` that
all three of these actually use, which is the spelling worth naming because it
does not contain the word "sequence" anywhere. The object that needs the revoke
never appears in the migration's text. `gauntlet_run_events_id_seq` came in with
`0035`, `tournament_match_events_id_seq` with `0062` and
`tournament_reward_ledger_id_seq` with `0063` -- all three before `0137`, the
sweep written to close exactly this, which looked at a different `relkind`.

**`tests/db/supabase-stub.sql` already carried the line.** The fixture has
`grant all on sequences` beside the functions and tables lines, so the defect
was reproducible in the suite the whole time and nothing was looking. That is
the same vacuum `grant-surface.test.ts`'s own header describes for tables and
`0137` for functions, arriving a third time.

## The sweep, before anything was written

Every sequence, table, view and function in `public`, over the full chain
(198 migrations, `0001` through `0201`) with the hosted default privileges in
force. Reported here by name because a fix nobody can check the completeness of
is a fix somebody has to redo.

| class | in `public` | reachable by a client role |
| --- | --- | --- |
| sequences | 3 | **3**, both roles, `USAGE,SELECT,UPDATE` each |
| views / matviews | 7 | 7, `authenticated SELECT` only; `anon` holds nothing |
| tables | 126 | 24 for `anon` |
| functions | 532 | 64 executable by `anon` |

The 24 tables are the 20 already declared in `ANON_SURFACE` plus `0202`'s four
(`ideacad_editors`, `ideacad_documents`, `ideacad_concepts`,
`ideacad_predictions`, each holding all seven privileges). The 64 functions
partition exactly, with nothing left over:

- **18** are `0137`'s own deliberate public surfaces, name for name.
- **5** are the IDEA Maps viewer -- `maps_search` and the four vocabulary
  helpers its body evaluates -- granted by `0162` and `0165` with an explicit
  revoke-then-grant.
- **10** are `0202`'s IdeaCAD functions.
- **31** belong to the `pg_trgm` extension.

So beyond `0202`'s fourteen objects the sweep found **the three sequences and
nothing else**, and `0203` touches only those three.

## The 31 `pg_trgm` functions are left alone, and that is measured

They are the one judgement call in the sweep, so it was settled with an
instrument rather than an argument. `public.maps_search` is `prosecdef = false`
-- SECURITY INVOKER -- so an anonymous caller evaluates its body as itself, and
that body uses the `<%` operator and `word_similarity()`. Revoking two of those
functions from `anon` on the fixture:

    anon-role call BEFORE revoking pg_trgm: OK
    anon-role call AFTER  revoking pg_trgm: REFUSED: permission denied for
                                            function word_similarity

A revoke there does not narrow the public IDEA Maps search, it deletes it. They
are also extension-owned (`pg_depend.deptype = 'e'`) and hold a PUBLIC grant of
the extension's own making beside the project's direct one, so `drop extension`
/ `create extension` restores whatever a migration removed. If that exposure
ever has to close, the lever is `maps_search` becoming a definer function, which
is a different bundle with its own answer for what its body may then read.

## Why the revoke breaks nothing, established rather than assumed

A sequence grant matters to a role that INSERTS into the owning table. Measured
on the fixture, no client role holds INSERT on any of the three:

    gauntlet_run_events        anon insert=false  authenticated insert=false
    tournament_match_events    anon insert=false  authenticated insert=false
    tournament_reward_ledger   anon insert=false  authenticated insert=false

and every function that inserts into one is SECURITY DEFINER:

    public.gauntlet_run_events_insert(text,text,jsonb)          definer
    public._tournament_log(uuid,text,uuid,text,uuid,jsonb)      definer
    public._tournament_award(uuid,uuid,integer,text,uuid)       definer

`gauntlet_run_events_insert` is granted to `anon` on purpose -- an
unauthenticated GAUNTLET run is one of `0137`'s eighteen -- and it keeps
working, because a definer function executes as `postgres`, which keeps `rwU`.
That is the whole of why the narrowing is safe, and it is the thing to re-check
before a fourth sequence joins the list.

## What the exposure actually was, stated rather than inflated

`nextval`, `currval` and `setval` all live in `pg_catalog`, and PostgREST
exposes only functions in the schema it is configured for, so there is no route
through which a browser holding the anon key can call one today. It was a grant
hole, not an open door, and `0161` said so first. What the grant cost is that
the refusal rested on a routing detail of somebody else's product rather than on
this database. If that detail ever changed, `setval` on
`tournament_match_events_id_seq` would hand an anonymous caller duplicate key
errors on a live bracket.

## `0203`'s shape

`0166`'s, deliberately: report, then revoke from `public, anon, authenticated`
BY NAME, then grant back to `service_role`, then a self-check that reads the
catalog rather than trusting the statements.

Three things in it are worth naming.

**The report sweeps every sequence, not the three it narrows.** The question a
reader has is whether the file is complete, and a report that can only print its
own list cannot answer it. A fourth open sequence prints a second, louder notice
saying it is NOT narrowed by this file and needs its own migration -- rather than
being narrowed silently, because a migration that widened its own scope at apply
time would be a different file on every database it ran against.

**The self-check carries a positive control.** Every assertion in it is an
absence, and an absence over a sweep that swept nothing is green for the wrong
reason, so `service_role` must still hold all three privileges on all three
sequences (3 of 3) or the file refuses. The `v_checked <> 3` guard is the other
half: a sequence renamed out from under this file would otherwise be reported as
successfully narrowed.

**It is idempotent, and that was measured rather than reasoned.** Applied a
second and a third time over the full chain, the ACL is byte-identical each
time:

    gauntlet_run_events_id_seq      :: postgres=rwU/postgres | service_role=rwU/postgres
    tournament_match_events_id_seq  :: postgres=rwU/postgres | service_role=rwU/postgres
    tournament_reward_ledger_id_seq :: postgres=rwU/postgres | service_role=rwU/postgres

## The test, widened to SEQUENCES and VIEWS

`tests/grant-surface.test.ts` reconciled tables and views against three
allowlists (A: the anonymous surface, B: the client write surface, C: REFERENCES
and TRIGGER with no exceptions). It could not see a sequence at all: `heldBy`
reads `relkind in ('r','v','m','p')` and a sequence is `'S'`. Two sections were
added.

**D, sequences, and the declared list is EMPTY.** Nothing in this repository has
ever wanted a client sequence grant, so zero is the correct length and it is
pinned at zero. An entry added to it has to argue that a client should call
`nextval` or `setval` DIRECTLY, rather than through the definer RPC that owns the
table -- which is unaffected by any of this.

**E, views, in both directions and including `authenticated` SELECT.** This is
the one gap A, B and C leave open by design: B enumerates only WRITES for
`authenticated`, on the stated grounds that its SELECT is the ordinary case on
~100 objects. That is right for a table, whose RLS is the boundary, and wrong
for a view -- an owner-privileged view bypasses the RLS of everything underneath
it, so its SELECT grant IS the boundary. All seven are declared with the reason
their migration gives, and each states which of the two kinds it is. That claim
is CHECKED against `reloptions` rather than written down: `coin_balances`,
`gauntlet_speedrun_attempt_history` and `notebook_entry_activity` are
`security_invoker`; `coin_contract_status`, `gauntlet_leaderboard`,
`gauntlet_room_board` and `gauntlet_room_roster` are owner-privileged, the last
three on `0060`'s own stated reasoning that a board running as the invoker shows
each student only their own rows, which is a functional break rather than a
narrowing.

**FUNCTIONS WERE DELIBERATELY NOT ADDED.** Ledger 0161 reconciles the
anon-executable function surface in
`tests/db/ideacad-grants-anon-execute-surface.test.ts`. A second implementation
is the thing that stops matching.

**The two sweeps live in `tests/db/grant-sweeps.ts`, not inside the test.**
`tests/db/grant-sequence-sweep-control.test.ts` imports the same functions, so
the control proves the shipped sweep bites rather than proving that a copy of it
does.

## The proofs

**Section D reddens without `0203`.** A paired measurement over the same
fixture, the chain differing by one file:

    with 0203 (199 files):     0 findings
    without 0203 (198 files): 18 findings -- 3 sequences x 2 roles x 3 privileges

**The sweep bites on a planted grant, permanently.**
`tests/db/grant-sequence-sweep-control.test.ts` applies the whole real chain,
asserts the sweep reads clean, grants `anon` USAGE on
`tournament_match_events_id_seq` -- a real sequence, one of the three, not one
the test creates -- and asserts the sweep names exactly
`usage on sequence tournament_match_events_id_seq (anon)` and nothing else. It
then asserts separately that `authenticated` is not named (wrong-role
over-reporting), that the other two sequences are not named (report-everything),
and that SELECT and UPDATE are not named (ignoring
`has_sequence_privilege` entirely) -- because a single equality would pass on a
sweep that was wrong in three different ways at once. It revokes in a `finally`
and asserts clean again.

**The same control for section E**, added because `anon: []` on all seven views
is the identical absence-over-an-absence shape: grant `anon` SELECT on
`coin_balances`, assert the sweep names it alone, revoke, assert clean.

**It mutates the catalog, never a file on disk.** `CLAUDE.md`'s mutation-proof
rule warns that `git checkout --` restores from HEAD rather than from whatever a
script saved, and has three times discarded a session's uncommitted work while
every remaining mutant then passed against a pristine tree. There is nothing to
restore here: the grant and the revoke are two statements against a throwaway
database `startTestDb` drops in `stop()`.

**The fixture can reproduce the defect.** A second default-privileges probe sits
beside the existing one and creates a sequence of its own: it must inherit all
three privileges for `anon`, or section D's assertions are vacuous. Section D
needs it MORE than section A needs its table twin, because D's allowlist is
empty and every one of its assertions is an absence over an absence.

## The paste trap: checked two ways, and the count is zero

A `$tag$` inside a `--` comment balances in Postgres and breaks the Supabase
editor's client-side statement splitter, which cost `0194` a full apply cycle.
Over `0203`: the comment portion of all 162 commented lines contains **zero**
dollar-quote tokens and **zero** `$` characters of any kind, and all 4 tokens in
the file are on code lines in 2 balanced `$$` pairs.

Checked against a planted positive control rather than reported as a bare zero:
a copy of the file with `-- ... a $tag$ token inside a comment` inserted reports
1 and fails, and a second copy with a bare `$$` in a comment reports 1 and fails.
The checker reads the real file as CLEAN and both planted copies as PASTE TRAP
PRESENT.

## The numbers

**Full suite on this branch: 391 files / 7615 tests, 4 failed.** Against a
baseline of **390 / 7604 / 4 failed**, measured on a clean `git worktree` at
`origin/integration` `7c45d30c` rather than on this tree -- the first attempt
was run in place and could have imported `grant-surface.test.ts` after `0203`
was already on disk, which would have put the file under test into its own
baseline. It was discarded for that reason.

**The 4 failures are the same 4 in both runs, and none of them is this
bundle's.** They are `grant-surface.test.ts` sections A, B, C and the anon-count
control, naming `ideacad_editors`, `ideacad_documents`, `ideacad_concepts` and
`ideacad_predictions` and NO other object. That is `0202`'s territory, on ledger
0161's branch, which had not reached `origin/integration` at branch time. Every
one of the eleven new assertions in sections D and E passes, and
`tests/db/grant-sequence-sweep-control.test.ts` passes 7 of 7.

**So this branch's CI cannot go green until `0202` lands on `integration`.**
That is not a defect in this bundle and fixing it here would be writing `0202` a
second time.

**svelte-check: 0 errors, 40 warnings**, at 34 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`. Re-derived with
`npx svelte-kit sync && npx svelte-check` after exporting the two
`$env/static/public` values, per `CLAUDE.md`'s own instruction to prefer the
instrument to the number.

**`CLAUDE.md`'s stated baseline of 37 / 31-5-1 IS STALE, and this bundle did not
move it.** The identical 40 / 34-5-1 was measured on the clean
`origin/integration` worktree, so the three extra `state_referenced_locally`
warnings were already there; this branch adds no `.svelte` file and no `.svelte`
line. `CLAUDE.md` asks the session that measures a different number to correct
the line in the same change -- **this session could not**, because `CLAUDE.md` is
not in its owned surface (ledger 0161 owns one paragraph of it; ledger 0164 owns
none). It is reported instead, which is the only move a boundary stated as paths
leaves available.

## What was NOT verified

- **`0203` IS NOT APPLIED.** This container cannot reach the production
  database. Every claim here is against embedded Postgres with the real
  migration files applied unmodified, and none against the live project. The
  numbers `0161` reported from production are consistent with what the fixture
  shows, but were not re-measured here.
- **No PostgREST.** The claim that `nextval` and `setval` are unroutable rests
  on where those functions live (`pg_catalog`) and on PostgREST exposing one
  schema, not on an attempt against a running instance. No Docker daemon and no
  Supabase CLI in this container.
- **No browser pass.** This bundle writes no file under `src/` and changes no
  surface; `npm run verify:browser` was not run and `npm run verify:readme` was
  excluded by the prompt.
- **The `0202` interaction is reasoned from `0202`'s text**, read off
  `origin/claude/relaxed-goodall-lsudr8`, not from applying the two files
  together. They name no object in common -- ten functions and four tables
  against three sequences -- so the order is free, but that was established by
  reading both files rather than by running them in sequence.
