# 0161 The anon EXECUTE hole 0201 shipped, the repo's copy of the repair, and the sweep that would have caught it

- Issued: 2026-09-11
- By: router chat
- Owns: `supabase/migrations/0202_*.sql`, `tests/db/ideacad-grants*`, `CLAUDE.md` (one
  paragraph only), `docs/prompt-ledger/entries/0161-*`, and its own `docs/history/` entry.
  NO FILE UNDER `src/`.
- Migration permitted: exactly one. Claims: 0202. Highest on origin/integration at issue: 0201
- Status: pushed, NOT merged -- carries a migration
- Branch: claude/relaxed-goodall-lsudr8
- Runs in parallel with: ledger 0160, which owns `src/lib/ideacad/**`. No file is shared.
- Notes: `0201` ended on `revoke all on function ... from public` then
  `grant execute ... to authenticated`, and ALL TEN of its functions came out executable by
  `anon` on production (measured 2026-09-11; `classroom_save_response`,
  `classroom_save_instructor_response` and `classroom_close_assignment` read `anon false` as
  the controls). The cause is the one 0137 wrote down: this project's default privileges
  write a DIRECT `anon` grant into every new function's acl, and `revoke ... from public`
  removes only the PUBLIC entry. `0166`'s shape revokes from `public, anon, authenticated`
  BY NAME; `0196` through `0199` follow it; `0201` invented its own and lost the clause. Mr.
  Pina repaired the function half by hand and verified it; `0202` is the repo's copy, so a
  database rebuilt from these files does not recreate the hole.
  THE HOLE WAS BIGGER THAN THE BRIEF AND THE SECOND HALF WAS FOUND BY A TEST THAT WAS
  ALREADY RED. `tests/grant-surface.test.ts` fails on `origin/integration` at branch time, 4
  assertions, naming `ideacad_editors`, `ideacad_documents`, `ideacad_concepts` and
  `ideacad_predictions` and NO other object: the identical bootstrap carries
  `grant all on tables`, so all four arrived holding SELECT, INSERT, UPDATE, DELETE,
  TRUNCATE, REFERENCES and TRIGGER for both client roles, and `0201` revoked nothing. RLS is
  enabled with SELECT-only policies, so reads and policy-governed writes are closed --
  TRUNCATE is not subject to RLS at all, and REFERENCES and TRIGGER are granted to a client
  role nowhere else in this codebase. `0202` section 3 narrows the four tables to
  `authenticated` SELECT and nothing else, which is the end state `0201` meant to write. THIS
  IS A DELIBERATE WIDENING OF THE BRIEF, and it is the one thing on this branch Mr. Pina
  should agree with before pasting: section 2 is a genuine NO-OP on production (the hand
  repair already landed), section 3 is a REAL CHANGE that has not been applied by hand.
  `grant-surface.test.ts` goes green with `0202` in the chain and is not edited.
  THE TEST IS GENERAL, NOT ABOUT IDEACAD.
  `tests/db/ideacad-grants-anon-execute-surface.test.ts` applies the WHOLE chain (199 files,
  501 non-extension functions in `public`) and reconciles every anon-executable function
  against a named allowlist: 23 names, each with the reason a migration gave it -- 18 are
  0137's own partition name for name, 5 are the IDEA Maps viewer, which shipped after 0137
  and granted itself in `0166`'s shape. Extension-owned functions are excluded through
  `pg_depend` deptype 'e', not a name prefix (31 pg_trgm functions, granted to PUBLIC by the
  extension, not the chain's to revoke). The length is pinned. Drift is caught in BOTH
  directions -- an undeclared grant and a declared name the catalog no longer shows.
  PROVED IN FOUR DIRECTIONS, not asserted. A second database boots the identical chain MINUS
  `0202` and reproduces `0201`'s defect exactly: 10 of 10 functions anon-executable, all four
  tables holding all seven for both roles, with the two chains' function populations asserted
  EQUAL so the contrast is not measuring a different world. A mutation grants `anon` EXECUTE
  on `current_user_email()` and the sweep names it, then goes quiet on the revoke -- a
  catalog edit restored by its own inverse, no file touched and no `git checkout --`. `0202`
  is applied a SECOND time over the database the chain already built and the full `proacl` /
  `relacl` of all fourteen objects is compared string-for-string across the two applies. And
  a vacuity guard refuses a run where the catalog read came back empty.
  Paste trap checked two ways against a planted positive control: 0 and 0, control 1 and 1.
  4 dollar-quote delimiters, two balanced pairs, every one a real delimiter. NOT APPLIED --
  this container cannot reach production and did not try.
  BASELINE DRIFT FOUND, NOT FIXED, BECAUSE THIS LANE OWNS ONE PARAGRAPH OF `CLAUDE.md`:
  svelte-check on `origin/integration` measures 0 errors / **40** warnings in 22 files
  (34 `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`),
  where `CLAUDE.md` still states 37 in a 31/5/1 breakdown. The drift is entirely
  `state_referenced_locally` and predates this branch. Unchanged by this work.
  A THIRD OBJECT CLASS IS OPEN AND WAS MEASURED, NOT GUESSED, AND THIS LANE'S ONE MIGRATION
  IS SPENT. The same bootstrap carries `grant all on sequences`. The chain creates none
  explicitly but three implicitly, through `bigint generated always as identity` keys
  (`gauntlet_run_events` 0035, `tournament_match_events` 0062, `tournament_reward_ledger`
  0063), and each comes out `anon=rwU` on the full chain -- SELECT, UPDATE and USAGE, which
  is `nextval` and `setval`. `setval` is in `pg_catalog` rather than `public`, so PostgREST
  offers no route to it; the containment is the gateway's, not the grant's, exactly like the
  TRUNCATE finding above. Needs its own migration and its own reconciliation (`relkind = 'S'`,
  no allowlist -- nothing here hands a client role a sequence on purpose).
  No `classroom-updates.json` entry: nothing a student sees changes.
