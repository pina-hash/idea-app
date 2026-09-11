# 0164 The three sequences `anon` can `setval`, and the sweep that would have named them

- Issued: 2026-09-11
- By: router chat
- Owns: `supabase/migrations/0203_*.sql`, `tests/grant-surface.test.ts`, `tests/db/grant-*`,
  `docs/prompt-ledger/entries/0164-*`, and its own `docs/history/` entry. NO FILE UNDER
  `src/`.
- Migration permitted: exactly one. Claims: 0203. Highest on origin/integration at issue: 0201
- Status: issued
- Branch: `claude/hopeful-edison-pd3p6r`, branched from `origin/integration` at `7c45d30c`
- Runs in parallel with: ledgers 0160, 0162 and 0163. `0202` is ledger 0161's, on
  `claude/relaxed-goodall-lsudr8`, and had NOT reached `origin/integration` at branch time --
  so this branch's sweep re-finds 0202's fourteen objects and reports them under 0202's name
  rather than fixing any of them. No file is shared with any of the four.
- Notes: What 0161 measured and could not fix, having spent its one migration on the IdeaCAD
  repair: `gauntlet_run_events_id_seq`, `tournament_match_events_id_seq` and
  `tournament_reward_ledger_id_seq` each carry `anon=rwU/postgres` AND
  `authenticated=rwU/postgres`, which is `USAGE`, `SELECT` and `UPDATE` -- `nextval`,
  `currval` and `setval`. Bounded rather than reachable: `nextval` and `setval` live in
  `pg_catalog`, so PostgREST offers no route to either today. A grant hole, not an open door,
  and still wrong.
  THE ROOT CAUSE IS THE ONE 0137 WROTE DOWN, one object class further over. This project
  bootstraps `alter default privileges in schema public grant all on sequences to anon,
  authenticated, service_role`, so a sequence arrives holding a DIRECT grant to both client
  roles before any migration grants anything, `revoke ... from public` removes only the
  PUBLIC entry, and `0137_anon_execute_sweep.sql` swept FUNCTIONS only and covers only what
  existed when it ran. Every object created since has had to revoke for itself.
  THE SWEEP WAS RUN OVER EVERY SEQUENCE, TABLE, VIEW AND FUNCTION IN `public` BEFORE
  ANYTHING WAS WRITTEN, and its full result is in the history entry. Beyond 0202's fourteen
  objects it found exactly the three sequences and nothing else: the 7 views hold
  `authenticated SELECT` and no `anon` privilege of any kind, the 24 anon-reachable tables
  are the 20 declared in `grant-surface.test.ts` plus 0202's four, and the 64 anon-executable
  functions are 0137's own 18, the IDEA Maps viewer's 5, 0202's 10, and 31 belonging to the
  `pg_trgm` extension.
  THE 31 pg_trgm FUNCTIONS ARE LEFT ALONE DELIBERATELY AND THE REASON IS MEASURED, NOT
  ARGUED. `maps_search` is `prosecdef = false` -- SECURITY INVOKER -- so `anon` evaluates its
  body itself, and that body uses the `<%` operator and `word_similarity()`. Revoking two
  pg_trgm functions from `anon` in the fixture turns a working public search into `permission
  denied for function word_similarity`. They are also extension-owned, so a `create
  extension` restores the grant a migration removed.
  `0203` REVOKES THE THREE SEQUENCES FROM `public, anon, authenticated` BY NAME, 0166's
  shape, and grants `usage, select, update` back to `service_role` alone. Nothing breaks: no
  client role holds INSERT on any of the three owning tables, and every function that inserts
  into one (`gauntlet_run_events_insert`, `_tournament_log`, `_tournament_award`) is SECURITY
  DEFINER and runs as the owner, which keeps `rwU`.
  THE TEST IS WIDENED TO SEQUENCES AND VIEWS, NOT TO FUNCTIONS. Ledger 0161 already
  reconciles the anon-executable FUNCTION surface in
  `tests/db/ideacad-grants-anon-execute-surface.test.ts`; a second implementation is the
  thing that stops matching.
  `0203` IS NOT APPLIED BY THIS SESSION and this branch is NOT merged to `main`.
