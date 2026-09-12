# 0177 Foundry: description optional, all three play metrics public, own-playtime read

- Issued: 2026-09-12
- By: router chat, on Mr. Pina's three answers of 2026-09-12 (decisions 05 and 07)
- Owns: `supabase/migrations/0204_*.sql`, the Foundry publish and submit paths in
  `src/lib/foundry/**` and `src/routes/foundry/**` EXCEPT the card and gallery components,
  `tests/db/foundry-publish*`, `tests/db/foundry-stats*`, `tests/foundry-telemetry*`,
  `docs/decisions/entries/05-*` and `07-*`, `docs/prompt-ledger/entries/0177-*`, and its own
  `docs/history/` entry.
- Migration permitted: exactly one, 0204. Claims: 0204. Highest landed at issue: 0203.
- Status: pushed
- Branch: `claude/busy-newton-trto6y`, branched from `origin/integration` at `8241494f`
- Runs after: ledger 0174, which quoted `0204` in prose and RELEASED it unused, and ledger
  0176, which stopped at its audit and named this bundle's whole remit.
- Notes: THREE ANSWERS FROM MR. PINA, ALL IN THIS BUNDLE.

  **ONE. The description requirement is REMOVED.** Publishing needs a name, a thumbnail and
  the app; a description is optional. This REVERSES work ledger 0015 shipped on 2026-09-02
  while decision 05 sat open with a blank answer.

  **TWO. All THREE owner-only metrics go public** -- `players`, `seconds_played`,
  `last_played_at`. Decision 07's title says "the two owner-only metrics" and ledger 0176
  measured three; widening two and leaving one is the failure mode, so all three are named
  in the test.

  **THREE. The n=1 case is ACCEPTED, explicitly.** On an app one person has played,
  "1 player, last played 3:47pm" identifies when that student played. Mr. Pina was asked
  precisely this and said it is fine. No threshold, no floor, no rounding scheme, and the
  acceptance is recorded in decision 07 so the next session does not re-raise it.

  **The boundary that still holds:** public means AGGREGATE. A student must never read
  another NAMED student's playtime. `tests/foundry-telemetry.test.ts` is WIDENED, never
  replaced.

  Deliberately excluded -- the Foundry CARD and GALLERY components, which ledger 0175 owns.

  **Duplicate check, three ways, all clear.** (1) `git log --oneline
  origin/main..origin/integration` at branch time: five subjects, all ledger 0174 and its
  merge, none touching Foundry. (2) A `git ls-tree` scan of all 55 remote and local refs for
  a `0177-*` ledger entry: none on any ref, and none in the working tree. (3)
  `node tools/migration-claims.mjs`: `highest landed 0203`, `next free 0204`, and `0204`
  absent from both CLAIMED-NOT-LANDED (which holds only `0190` and `0191`) and from the
  holes list -- so 0174's release is confirmed by the tool rather than taken on its word.
  Separately, a `git ls-tree` scan of all 55 refs for `supabase/migrations/0204*`: **zero
  hits**, and `origin/main` and `origin/integration` both top out at
  `0203_sequence_anon_grant_sweep.sql`.

## Outcome

**All three answers implemented; `0204` written, applied to the test fixture
only, and awaiting a hand paste.** The description requirement is removed from
both SQL places and from the client; all three (not two) play metrics are public
behind the population gate; `foundry_my_play_stats(p_app_id uuid)` is the
caller-scoped read and takes no identity parameter. The n=1 acceptance is
recorded in decision 07 in a paragraph written to stop it being re-raised.

**Also closed:** `service_role` held SELECT on `student_app_plays` against
`0139`'s own comment. Measured, confirmed, revoked in section 4, and the test
that had the same blind spot as the migration is widened.

**Measured.** Full suite 407 files / 7848 tests / 0 failures / 409.72s, the
delta reconciling exactly against ledger 0176's 405/7819 plus ledger 0174.
`svelte-check` 0 errors, 38 warnings in 21 files at 32/5/1, identical to the
branch point re-derived in a clean worktree; `CLAUDE.md`'s stale 40-in-22 is
corrected in place. Browser: 4 route/width runs, 28 measurements, 0 outside
threshold on the two specs driving `FoundryMine`. Paste trap zero, two ways,
against three planted controls. Mutation proof: four permissive mutants, each
reddening a named assertion, restored from a `cp` copy and md5-verified.

**Not done, deliberately.** No surface renders the now-public stats: the only
place that could is `FoundryDetail`, the gallery detail view, which ledger 0175
owns and which was `Status: issued` and not contained in `origin/integration` at
branch time. No thumbnail gate was added -- the answer names one but none exists
in the schema, and creating one is a narrowing outside this bundle's grant.
`npm run verify:readme` was NOT run because it rewrites 0175's measured files
and README regions.

**Branch stops here and is NOT merged to `main`,** because it carries a
migration that must be applied by hand first.
