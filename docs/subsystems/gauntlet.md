# GAUNTLET authoring tier and plausibility floor

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). The author allowlist carve-out, and the held-run floor on the macro speedrun board. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### GAUNTLET AUTHOR TIER -- the one carve-out from "every elevated capability requires admin"

**`0155` (`gauntlet_authors`, `gauntlet_can_author()`) is a third tier, strictly
narrower than admin and granted independently of it.** It exists because 0067's
`is_teacher()` -> `is_admin()` narrowing was about BREADTH (role editing, the
FSP/FRC roster, every student's graded work, moderation, permanent deletion),
never about GAUNTLET specifically -- authoring a challenge is writing content
with no student data in it, so it did not need to stay behind the same gate as
those.

- **An ALLOWLIST, never an inference.** `gauntlet_authors` mirrors
  `app_admins`: lowercased-email keyed, `@boscotech.edu`-only grants, the same
  `granted_by`/`granted_at`/`note` shape, SECURITY DEFINER + `set search_path = ''`.
  `gauntlet_can_author()` is granted to `authenticated` exactly as `is_admin()`
  is, and folds `is_admin()` in -- every admin authors too, so the tier can only
  WIDEN a gate, never narrow one. Grant/revoke (`gauntlet_author_grant`,
  `gauntlet_author_revoke`, both admin-gated, not owner-gated -- authoring does
  not propagate) and the roster read (`gauntlet_author_roster`, admin-only) have
  no caller in `src/` yet; granting or revoking today is SQL-editor only.
- **App side:** `canAuthorGauntlet` in `src/lib/server/gauntlet-authoring.ts` is
  the ONE server helper, mirroring `isAdmin`'s ladder -- calls
  `gauntlet_can_author()`, degrades to `isAdmin` on `PGRST202` ALONE (the
  migration not being applied yet is a real, separate deployment state -- see
  below), denies on any other error. `GAUNTLET_AUTHORING_REFUSAL` is the one
  spelling of the refusal a non-author reads on `/gauntlet/author` and
  `/gauntlet/rooms` (a rendered panel, never a redirect -- a redirect would
  confirm the route exists to someone it is refusing). The `/gauntlet` landing
  page's Authoring card is gated on it too.
- **Exactly eleven re-gated sites, and it is a CENSUS, not a rename.** Reading
  and writing challenges, series grouping, the three challenge-asset storage
  buckets, and room create/delete -- see `0155` section 4/5 for the full table.
  **Left on `is_admin()` deliberately**, because authoring a question is not a
  licence to read what was answered: every student-work read (own submissions,
  own run events, own run analysis), `gauntlet_run_review` (`0152`, the ranked
  forensics console at `/gauntlet/run-review`) and `gauntlet_practice_pressure`
  (`0151`; the name `gauntlet_practice_meter` is FICTION and this line carried
  it until 2026-09-06 -- it exists only inside `0155`'s own comment and in the
  copy of that comment this file was written from, which is why
  `tools/claude-md-check.mjs` reads a migration with its comments stripped), the global Speedrun ruleset singleton, the unread `gauntlet-tools`
  bucket, and all eleven `not v_published and not is_teacher()` draft-PLAY
  gates (an author publishes and plays like anyone else; test-driving a DRAFT
  run stays admin-only).
- **APPLIED STATE IS A PROPERTY OF PRODUCTION, AND NO FILE IN THIS REPO RECORDS
  IT.** Run `tools/idea-status.py` for the landed set and paste its probe block
  into the Supabase SQL editor to learn the applied set; `tools/deploy-probe.mjs`
  is the other instrument and the one a gate reads, because it queries
  production's own `pg_catalog` itself and fails closed, where `CANNOT SAY` is
  never a pass. **A paragraph stating applied status anywhere in this file is a
  snapshot and is to be treated as wrong** -- one was wrong for a whole night on
  2026-08-31, which is why this rule replaced it with a pointer rather than with
  a corrected list. The same goes for any figure here that a commit can move:
  prefer the instrument to the number.

### GAUNTLET'S PLAUSIBILITY FLOOR -- a setting, and a run under it is HELD IN VIEW

**A MACRO SPEEDRUN RUN UNDER THE FLOOR IS ON THE BOARD, NOT MISSING FROM IT
(0194), AND THE FLOOR IS A ROW RATHER THAN A LITERAL.** `gauntlet_leaderboard`
carries `rank_state` -- `ranked` or `pending_verification` -- and a held run sits
there with a NULL `rank`. `gauntlet_rank_settings.speedrun_floor_ms` is the one
place the number lives; `gauntlet_rank_settings_get` / `_set` are its only
readers and writers and both are admin-only. This is the decision Mr. Pina made
on decision 19, and the reasoning is
`docs/history/gauntlet-verification-floor-oclq47.md`.

- **THE PROPERTY THAT OUTRANKS EVERYTHING ELSE HERE: A RUN MAY NEVER BE ABSENT
  FROM BOTH THE BOARD AND THE REVIEW CONSOLE.** `0154` bought that with a literal
  pinned to `0152`'s own reporting threshold and an apply-time `raise` if the two
  drifted. A number in a form cannot be checked at apply time, so the pin is now
  two runtime properties: the board never DROPS the run, and
  `gauntlet_run_review` emits a `pending_verification` observation computed from
  **the same settings row and never from `p_fast_finish_seconds`**. A change that
  lets a held run fall off either surface is wrong, whatever else it improves.
  - **`p_fast_finish_seconds` IS THE TEACHER'S OWN LENS AND MUST STAY SEPARATE.**
    `0152`'s form calls it "your floor, not a rule about the part", and narrowing
    it to 5 is a thing a teacher may legitimately do. Folding it and the board's
    floor into one number means either taking that away or letting
    `p_observed_only` hide a held run -- which is `0154`'s hole arriving through
    the query string instead of through a drifted literal. The box DEFAULTS to
    the board's number; that is the whole of the coupling.
- **A ROW WITH NO `elapsed_ms` IS HELD AT EVERY FLOOR VALUE, INCLUDING ZERO.**
  `0154` dropped it and called that fail-closed; held is the same refusal to rank
  with somebody able to see it. A floor of 0 is a legitimate setting and holds
  nothing on the clock.
- **THE `distinct on` PREFERS A RANKED ROW, AND THAT TERM IS LOAD-BEARING.**
  `0154` got "it removes the run, not the player" free from the WHERE excluding
  held rows; the WHERE no longer does. Without `(rank_state = 'ranked') desc`
  leading the ordering, a student's held 4-second run represents them on a
  challenge they also cleared honestly and their honest seat disappears.
- **THE NUMBER IS NOT PUBLISHED, AND THAT IS THE POINT OF A STATUS RATHER THAN A
  SENTENCE.** `gauntlet_rank_settings` has no grant to `anon` or `authenticated`;
  the view reads it through a scalar subquery because it is owner-privileged, so
  no function grant exists to leak it. **No student-facing surface may name a
  count of seconds** -- not the chip, not the result card, not a tooltip. A held
  state says something true without handing a forger the line;
  `tools/browser-verify/routes/gauntlet-rank-state.mjs` asserts that as an
  absence.
- **THE WORDS ARE `RANK_STATES` IN `$lib/gauntlet.ts`, ONCE**, and
  `RankStateChip.svelte` is the one renderer: a word, a glyph and a hue, never
  colour alone, and `ranked` renders NOTHING (a row with a number has already
  said it is ranked). A third state is a real decision, not a string -- every
  renderer is exhaustive over the union, so adding one without its word, glyph
  and hue is a type error rather than a blank chip.
- **`rank` IS NULLABLE AND `rank_state` IS OPTIONAL, FOR DIFFERENT REASONS.**
  Nullable because a held run has no seat; optional because 0194 is applied by
  hand, so `$lib/gauntlet/board-selects.ts` is the ladder every board read goes
  down and `rankStateReady` is what says whether this deployment could tell.
  **"Cannot tell" must never render as "ranked".**
- **`gauntlet_leaderboards()` NEEDS NO CHANGE AND MUST NOT GET ONE.** It joins
  the board `on ... and rec.rank = 1`, and `NULL = 1` is NULL, so a held run can
  never become a per-drawing record. That is why it has an assertion rather than
  a diff.
- **`gauntlet_room_board` (0010) STILL HAS NO FLOOR.** `0154` named it out of
  scope and 0194 did not take it: a room round is minutes long and a floor
  interacts with a host's own timing. It is a third question, still open.

### COMMUNITY SPEEDRUNS -- a student's run of published parts, reviewed only where it is new (0297, ledger 0433)

**A community speedrun (`gauntlet_routes`) is 2 to 8 PUBLISHED Speedrun parts in
an order a student chose, and its board is DERIVED, never stored.**
`_gauntlet_route_board` reads `gauntlet_leaderboard` ranked rows only
(`rank_state = 'ranked'`), so the plausibility floor, the held state, the
ranked-first `distinct on` and the test-account rule are the part boards' own
and are not restated. A player is on a route's board when they hold a ranked
run on every part; the total is the sum. A held run therefore never counts, and
still never vanishes: it stays on its part's board and in the run review.

- **WHAT IS REVIEWED IS THE ONE NEW THING.** The parts are already published and
  the runs already reviewed, so a speedrun adds only its owner's title and
  description. It is link-shareable the moment it is saved (`private`), and
  LISTED for every student only after `gauntlet_route_review` by a GAUNTLET
  author or an admin (`gauntlet_can_author()`, the curating tier, not
  `is_admin()`). Editing a listed one sends it back to `pending`; a reviewer's
  `hidden` closes the link to everyone but its owner and reviewers.
- **The review state is the owner's and a reviewer's to see**: `gauntlet_routes`
  and `gauntlet_route` project `status` as null to anyone else.
- `tests/db/gauntlet-community-0297.test.ts` holds both directions and carries
  the mutation proofs' targets (the ranked filter, the listing rule, the
  hidden-by-link rule).

### THE BOARD CALLS NO REVOKED HELPER (0295, ledger 0433)

**`gauntlet_leaderboard` is owner-privileged, but Postgres checks EXECUTE on a
function a view calls as the CALLER.** 0289 called `_idea_test_user_ids()`
(revoked from `authenticated` by 0288) inside the view and every signed-in board
read raised, which `readBoard` rightly renders as an empty board. 0295 reads the
same rule through `idea_hidden_test_user(uuid)`, which is granted. Any helper a
view calls is granted to the view's readers, or the view breaks for all of them.
