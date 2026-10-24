# Results: session 0433 (Gauntlet and tournaments)

Ledger `docs/prompt-ledger/entries/0433-gauntlet-tournament-teams.md`. Solo, pushed to `main`.
Shas: see "Landed" at the end.

## Item 12: the GAUNTLET leaderboard showed no scores (report 59687b79)

**Found.** No run was deleted, reset or hidden by a rule. Migration 0289 (test accounts) rebuilt the
`gauntlet_leaderboard` view calling `_idea_test_user_ids()`, which 0288 had revoked from signed-in
users. Postgres checks a function inside a view as the person reading it, so every signed-in board
read failed with "permission denied", and the board code (correctly) shows a failed read as an empty
board. Measured on a full chain short of the fix: the read raised, the stored runs were all there.

**Built.** Migration 0295 reads the same test-account rule through a granted helper
(`idea_hidden_test_user`) and changes nothing else in the view. Production applied it on
2026-10-24 04:30 UTC (`docs/migrations-applied/0295-main.md`) and reported **399 GAUNTLET runs stored,
343 correct, none changed**. Restored: 0 needed, because 0 were lost; all 399 read again.

Proved by `tests/db/gauntlet-board-0295.test.ts`: present are a ranked run with its seat, a held run
with no seat, a correct drawing answer, and a test account's own run to itself; absent are a failed
run, a manual Speedrun entry, an unpublished part, and a test account to anyone else. Four
permissive mutations each turned it red.

## Item 13: a stray teammate nobody could remove (report 919e2a21)

**Found.** A team a host makes has no registering account, and its first registrant is a no-account
row carrying a name. A member could act only on their own row, so nobody on the team could remove
that name. The "Add a teammate" field also accepted the team's own name, which is how a team name
becomes a registrant.

**Built.** In 0295: any signed-in member of an entry may remove a no-account registrant on that entry
(an admin and a host already could); a member still cannot remove another member's account; adding a
teammate named exactly the team's name is refused with "use Rename team". The panel offers Remove on
that row, calls the team control "Rename team", and says the add row is for a person.
**Existing stray rows: production reported 31 no-account registrants on entries that also have a
signed-in member.** Not all are mistakes (a captain may type a teammate's name on purpose), so none
were deleted; each can now be removed by its own team or an admin.

## Item 14: class teams are the source of truth for tournaments (gap 5f6a37e8)

**Found.** Class team sets (0223/0225) and tournament entries (0062/0192) were separate records: a
team's name and look were stored twice and customized twice, and roster changes did not carry over.

**Built** (migration 0297):
- A host who also teaches the class presses **Use these teams** in the tournament's Entries card.
  Each team becomes an entry with every member who has an account; an entry already made by hand with
  the team's name is linked instead of doubled (the IDEA-Blade Rotation 2 case), and its banner is
  kept on the class team.
- A team's name, picture, description and look are one record. A save on the class page shows in the
  bracket; a save from the tournament writes the class team. The bracket name stops following once
  the bracket is generated, the rule every tournament name already has.
- Moving a student between class teams moves them in the tournament while registration is open.
- The class page shows each team's description, picture and the tournaments it plays in, and a
  member edits the description and picture there.
- A host can **stop following** for one entry; the entry keeps what it shows. Tournaments made
  separately work exactly as before.

## Item 15: new parts and community speedruns (report b4a6b733)

**New parts** (published, in a new **Shop Hardware** series; drawings and exact volumes in
`gauntlet_speedrun_seed.json`):
1. **Hex Standoff** (Brass, difficulty 1): 10 mm across flats, 25 long, 5 mm through hole.
2. **Angle Bracket** (Plain Carbon Steel, 2): 50 by 50 by 5 angle, 40 long, two 5.5 mm holes per leg.
3. **Bearing Block** (6061 Alloy, 2): 60 by 30 by 40 block, 22 mm bearing bore, two 6.5 mm mounting holes.
4. **Shaft Collar** (6061 Alloy, 3): 32 mm collar for a half-inch shaft, 12 wide, 2 mm clamp slot.
5. **Motor Plate** (6061 Alloy, 3): 80 mm square, 6 thick, R8 corners, 23 mm pilot bore, eight holes.

**Community speedruns.** A student strings 2 to 8 published Speedrun parts into a speedrun, shares
the link at once, and asks for it to be listed. Its leaderboard is the sum of each player's best
**ranked** time on every part, so held runs never count and every existing run rule carries over.
**What needs review, and why:** only listing it for every student, by a GAUNTLET author or an admin.
The parts are already published and the runs already reviewed; the only new content is the student's
own title and description. Editing a listed speedrun sends it back for review; a teacher can take one
down. Pages: `/gauntlet/speedrun/community` and `/gauntlet/speedrun/community/<id>`, linked from the
Speedrun page.

## Migrations, in apply order

The second file was written as 0296 and renumbered 0297 at landing, because session 0432 landed and
applied its own 0296 first.


- `supabase/migrations/0295_gauntlet_board_and_tournament_registrants.sql` (applied 2026-10-24)
- `supabase/migrations/0297_class_team_tournaments_and_community_speedruns.sql`

## Checks

- svelte-check: 0 errors, 33 warnings in 18 files (baseline unchanged).
- Database tests on the full chain, pre-migration data, each file applied twice:
  `tests/db/gauntlet-board-0295.test.ts` 10/10, `tests/db/gauntlet-community-0297.test.ts` 23/23.
  Mutation proofs: 4 on 0295 and 5 on 0297, each red, file restored byte-identical (md5).
- Browser pass (own dev server, 375 and 1440): 24 specs, 48 runs, 686 measurements, 0 outside
  threshold, including the new specs for the stray team, the class team details and the speedrun
  builder.
- Full suite, once: 890 files, 16646 tests: 15 failed, 16625 passed, 6 skipped. 13 are the ones ledger
  0430 named on unchanged main (classroom-panel-layout-render 4, cert-0262-exam 7,
  feedback-round-0380-foundry 1, ideacad-feature-graph-storage 1). The other two files were a
  missing `origin/integration` ref in this checkout (both pass once fetched) and one finding of mine,
  an anon grant on `tournament_class_linked_entries`, fixed in 0297 before landing; those three
  files then pass (106 of 106 with the 0297 test).

## Not verified

- The class team sync and community speedruns against production: 0297 applies through migrate.yml
  after this push.
- The five new parts modelled in SolidWorks. Volumes are exact closed forms checked by a second
  implementation in the test, but nobody has yet modelled one from its drawing and submitted it.
- The host console and the community pages in a signed-in browser session (no session here). The
  builder, the team panel and the class card were measured through dev harnesses that mount the real
  components.
- Uploading a team picture from the class page: the class page takes a web address; uploading stays
  on the tournament page.

## For Mr. Pina

1. Open a Shop Hardware part at https://ideabosco.com/gauntlet/speedrun, reveal it, and model one in
   SolidWorks before class. If a part reads wrong, unpublish it in Authoring.
2. To link IDEA-Blade Rotation 2 to its class teams: open the tournament's host page, find
   **Teams from a class** in the Entries card, and press **Use these teams** beside IDEA-Blade teams.
   An entry whose name matches a team's name exactly is linked, not doubled; any that do not match
   are added as new entries, so check the Entries list after and remove a duplicate if one appears.
   The tournament must be in registration or seeding.

## Landed

- `48a565d3`: items 12 and 13 with migration 0295 (applied to production 2026-10-24).
- `736b2035`, `5b682d2b`, `9fc2f00d`, `741d7ce0`: items 14 and 15 with migration 0297.
