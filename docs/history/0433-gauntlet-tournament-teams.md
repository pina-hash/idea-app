---
title: "Ledger 0433: the GAUNTLET board reads again (0289 called a revoked helper inside an owner-privileged view), stray tournament registrants removable, class teams as the source of truth for tournaments, five Shop Hardware parts and community speedruns"
date: 2026-10-23
branches: [main]
migrations: ["0295", "0297"]
subsystems: [GAUNTLET, Tournaments, Classroom]
---

A solo session (worktree on `work-0433`, pushed to `main`), the restart of a first attempt that a
container restart stopped before it landed anything. The first attempt left one untracked probe test;
it was run, its finding confirmed, and it was deleted in favour of the real test. The queue is
`docs/feedback/2026-10-23/QUEUE.md` items 12 to 15; the plain-language account for Mr. Pina is
`docs/feedback/2026-10-23/RESULTS-0433.md`.

## Item 12: the board (0295)

**The cause, measured.** `gauntlet_leaderboard` is owner-privileged (0004, 0060), and 0289 rebuilt it
with `best.user_id not in (select public._idea_test_user_ids())`. 0288 revoked that function from
`public, anon, authenticated`. Table access in an owner-privileged view is checked as the owner, but
EXECUTE on a function the view calls is checked as the CALLER, so from 0289 on every signed-in read
raised `permission denied for function _idea_test_user_ids`. `readBoard` moves down its ladder only on
`42703` and otherwise answers `{ rows: [] }`, which is the fail-closed behaviour it documents, so every
board, the Speedrun detail board included, rendered empty. The test boots the full chain short of
0295, seeds runs, and asserts that exact error before the fix and seven stored rows after it.

**No restore was needed.** Production's apply notice (`docs/migrations-applied/0295-main.md`): 399
submissions stored, 343 correct, none changed.

**The fix** is 0289's own pattern for its one invoker view (`idea_hidden_test_account`):
`idea_hidden_test_user(uuid)`, definer, granted to `authenticated`, revoked from `anon` by name,
answering about one id and never listing. The view body is 0289's with that one predicate swapped.
The rule worth keeping is now in `docs/subsystems/gauntlet.md`: any helper a view calls is granted to
the view's readers. 0289 is a GAUNTLET-changing migration whose filename does not say so, the exact
category `FOREIGN_GAUNTLET_MIGRATIONS` in `tools/gauntlet-doc-check.mjs` exists for; that tool is not
this session's to edit, so it is named here.

## Item 13: stray registrants (0295)

`tournament_remove_entry_member` now admits a signed-in member of the same entry when the target row
has no account. Everything else is 0192's: the window, the last registrant, the registering account's
row, and a member still cannot remove another member's account. `tournament_add_entry_member` refuses
a teammate whose name equals the entry's (case-insensitive, trimmed), for every caller. The panel
mirrors both (`mayRemove`, `isTeamName`), names the team control "Rename team", and the dev sim's
`isCaptainRow` was corrected: it called an unlinked entry's oldest row the captain, which is not what
the RPC does and would have refused the very removal this item is about. Production reported 31
no-account rows on entries that also have a signed-in member; none were deleted.

## Item 14: class teams as the source of truth (0297)

- **Storage.** `classroom_teams` gains `description` and `picture_url`; `tournament_entry_class_teams`
  links an entry to the team it follows (unique per tournament and team). RLS on, no policy, no grant:
  a link names a class, and a class's rosters are the class's (0223).
- **One record, two copies kept by one writer.** The tournament's public tables stay what every
  bracket, TV and live page already reads, so `_tournament_team_mirror` copies the class team onto
  each linked entry and banner, run by an AFTER UPDATE trigger on `classroom_teams`. The tournament
  side's two writes (`tournament_update_entry`, `tournament_set_entry_style`) write the CLASS team for
  a linked entry under the class rule (`_classroom_team_may_style`: a member, or a teacher of the
  class) and the trigger carries it back, so there is one direction of truth. Name follows only while
  the tournament has not started. A class team holds no image background (0223), so the linked
  entry's style editor drops the Image choice rather than offering a refusal.
- **Roster.** `tournament_take_team_set` (host AND manager of the class) measures every team before
  writing (a team bigger than the team size refuses the call), links a same-named hand-made entry
  rather than doubling it (adopting its banner where the team had none), and adds members with
  accounts. A no-account student is left off, and a team with nobody signed in carries its own name
  as its one registrant, 0192's at-least-one rule. A trigger on `classroom_team_members` follows a
  teacher's move into every linked tournament still in registration or seeding.
- **Reads.** `tournament_class_linked_entries` (ids only, public), `tournament_team_set_options` (a
  manager's sets, empty to anyone else), `classroom_team_shared` (`classroom_team_board`'s audience).
  `classroom_team_board` itself was NOT recreated: `tests/db/classroom-team-edits.test.ts` diffs its
  body, and a second read keeps it untouched.

## Item 15: parts and community speedruns (0297)

Five Speedrun parts, published in a new Shop Hardware series, from `gauntlet_speedrun_seed.json`:
prismatic geometry with closed-form volumes (a ring slot strip by the circular-segment integral, R8
corner fillets as r squared times one minus pi over four), inline SVG drawings in the 0012 seed
palette, density from the level, tolerance 0.1, each checked by `gauntlet_publish_blocker` at apply.
The test recomputes each volume from the seed's geometry list with a second implementation. The
generator that wrote the JSON was a scratch script and is not committed.

Community speedruns (`gauntlet_routes`) and the review decision are in `docs/subsystems/gauntlet.md`.
The board is derived from `gauntlet_leaderboard` ranked rows, so no run rule is restated.

## Measured

- `tests/db/gauntlet-board-0295.test.ts` 10/10; `tests/db/gauntlet-community-0297.test.ts` 23/23;
  both boot the full chain short of their file, seed through real RPCs where one exists (runs are
  inserted as the owner, since the macro path needs a run token), and apply the file twice.
- Mutation proofs, each against a copy handed in through an environment variable, file md5 unchanged:
  0295 test-account predicate to `true` (2 red), `is_correct = true` to `true` (2 red), held rank to
  ranked (1 red), member removal widened to any no-account row (3 red); 0297 `_classroom_team_may_style`
  to `true` (1 red), `classroom_team_shared` enrollment gate removed (1 red), route board ranked filter
  removed (2 red), hidden route open by link (1 red), private routes listed (3 red).
- svelte-check 0 errors, 33 warnings in 18 files, after `cp .env.example .env` (the worktree had no
  `.env`, which reports 20 phantom `$env` errors) and with a raised heap.
- Browser pass on a private port (`--port 5433`; port 5199 was answered by another worktree's dev
  server, which made a first run measure the wrong code): 24 specs, 48 runs, 686 measurements, 0
  outside threshold. New specs: `tournaments-view-team-state-open-stray-1`,
  `classroom-teams-details-1`, `gauntlet-community`, `gauntlet-community-picked-3`. At 375 the
  details button scrolls to the viewport's bottom edge under a fixed bar, so that spec centres it
  before clicking.

- Full suite, once: 15 failed of 16646. Thirteen are ledger 0430's named failures on unchanged main.
  `tests/apply-migration-guard.test.ts` and `tests/apply-migration-trace.test.ts` failed only because
  this worktree had no `origin/integration` ref, and pass once it is fetched.
  `tests/db/ideacad-grants-anon-execute-surface.test.ts` caught a real finding:
  `tournament_class_linked_entries` was granted to `anon`. Its one reader is a signed-in player's own
  entry, so 0297 (unapplied, corrected in place) grants `authenticated` only and the 0297 test asserts
  the anon refusal.

- Renumbered at landing: the second migration was written as 0296; ledger 0432 landed and applied
  its own 0296 (`0296_coin_contracts_retired.sql`) first, so this one is 0297 and its tests were rerun
  on the chain that includes it.

## Not verified

The sync and the community pages against production (0297 applies through migrate.yml after the
push); the five parts modelled in SolidWorks; any signed-in browser session; a picture upload from
the class page (the class page takes a web address only).
