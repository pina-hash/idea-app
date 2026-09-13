# 0203 IdeaCAD private Realtime channels: decision 25, option B

- Issued: 2026-09-13
- By: router chat
- Owns: `src/lib/ideacad/live.ts`,
  `supabase/migrations/0211_ideacad_realtime_policy.sql`,
  `supabase/data/0203-ideacad-realtime-verification.sql`,
  `tests/db/ideacad-realtime-policy.test.ts`, `tests/ideacad-live-private.test.ts`,
  `docs/decisions/entries/25-*`, `docs/decisions/entries/13-*`,
  `docs/prompt-ledger/entries/0203-*`, and its own `docs/history/` entry. Plus TWO
  shared test files named below, both of which `0211` forces:
  `tests/db/supabase-stub.sql` and
  `tests/db/ideacad-grants-anon-execute-surface.test.ts`.
- Migration permitted: yes. **Claims: 0211**, allocated by the prompt rather than
  taken as the next free number. `0193` through `0210` are all applied to production
  and verified; the chain on `integration` ends at `0210`.
- Status: in progress
- Branch: `claude/lucid-dirac-8b6m2f`, branched from `origin/integration` at
  `50092ead`.
- Notes: Mr. Pina decided decision 25 on 2026-09-13 -- OPTION B, build it properly.
  IdeaCAD's two broadcast topics stop being public: `realtime.messages` gets the first
  `realtime.` policies in this schema's history, and the client opens both channels
  with `private: true`.

  **`0211` IS DELIVERED AND NOT APPLIED.** No cloud session can reach production: the
  egress proxy accepts a CONNECT to port 5432 and then carries no bytes. Re-measured at
  the top of this session, twenty seconds, zero bytes from the server, and there is no
  `.env` and no `IDEA_MIGRATION_URL` in the container either. So the applied state of
  the database is unchanged and the feature is not live until Mr. Pina pastes the file.

  **THE ONE THING THE DECISION ENTRY PREDATED.** `0205` shipped document sharing after
  decision 25 was written, and the entry's prescription -- a roster predicate on the
  student side -- is right for the PING topic and wrong for the FRAME topic in both
  directions. Too narrow, it refuses a shared editor. Too wide, and this is the half
  that matters, it would hand EVERY classmate a live view of EVERY other student's
  screen, because every enrolled student passes a roster test. So the frame topic
  delegates to `0205`'s own `_ideacad_can_read_document` and
  `_ideacad_can_write_document` and reimplements neither. Decision 25 carries the
  correction; the history entry carries the reasoning.

  **THE SHARED FILE, DECLARED RATHER THAN SLIPPED IN.** `tests/db/supabase-stub.sql`
  gains a `realtime` schema, `realtime.messages` with RLS enabled and the client-role
  grants, and `realtime.topic()`. It is appended in one delimited block at the end of
  the file, so it conflicts with nothing. It is not optional: eighteen db test files
  apply the whole migrations directory by `readdirSync`, `0211` REFUSES on a database
  with no `realtime.messages` rather than skipping silently, and without the stub every
  one of those eighteen would have gone red. The stub is the documented home for
  exactly this -- hosted-platform pieces that live outside `supabase/migrations` and
  that every db suite needs, which is what `full-chain-fixture-completion.sql`'s own
  header says about the default privileges that moved there.

  **THE SECOND SHARED FILE IS THE GRANT SWEEP, AND EDITING IT IS ITS OWN DESIGN.**
  `tests/db/ideacad-grants-anon-execute-surface.test.ts` sweeps every function matching
  `^_?ideacad` and refuses any it cannot classify. `0211`'s three match that prefix --
  deliberately, since that is what puts them under `0206`'s universal anon guard for
  free -- so three rows were added to `IDEACAD_FUNCTIONS`: both policy wrappers as
  `client` (an RLS policy names them, so `authenticated` MUST hold EXECUTE) and the
  topic parser as `definer`. That file's own comment says the classification "is a fact
  about the function itself, and it is the one a later migration can answer for its own
  objects", so this is its intended extension point rather than an intrusion. **It
  caught a real omission**: the first full-suite run failed on exactly this, and
  `npm test` exited 0 while doing so -- which is the ledger 0199 trap live, and the
  reason every count in this bundle was read rather than inferred from an exit code.

  Ledgers 0196, 0197, 0200, 0201 and 0202 were in flight and none of their files was
  touched. `src/lib/ideacad/store.ts` (0201) and `src/lib/ideacad/ui/undo.ts` (0196)
  are untouched, confirmed by diff. Two stubs in files belonging to other lanes
  (`tests/ideacad-store.test.ts`, `tests/db/ideacad-history-store.test.ts`) implement
  `IdeacadLive`, which is why the two new interface members are OPTIONAL -- also this
  codebase's own idiom, since an omitted transport removes the control it drives.

  **DECISION 13 IS ALSO CLOSED HERE**, under Mr. Pina's delegation of 2026-09-13 and
  recorded as this assistant's call rather than as his answer. The spec table's row
  reordering stays removed. NO SOURCE FILE WAS CHANGED FOR IT; it is a decision record
  only, and drag is named as the reversal path if it is ever wanted back.

  Verified: full suite, `svelte-check` at the baseline (0 errors, 37 warnings in 20
  files, 31/5/1), and mutation proof in both directions on both halves -- four client
  mutants and six SQL mutants, all killed, restores md5-identical, pass and fail counts
  read rather than exit codes. NOT verified: anything against production, and the
  behaviour of real Supabase Realtime, which no test here can reach.
