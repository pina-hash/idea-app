---
title: "A post that becomes a team post keeps what students wrote: `_classroom_team_carry_over` and its two triggers (ledger 0446, migration 0313)"
date: 2026-10-26
branches: [main]
migrations: ["0313"]
subsystems: ["Classroom", "HTML assignments", "Team documents"]
---

Mr. Pina asked to make IDEA-Blade 02 a team page like IDEA209H Unit 4, mid-assignment, and
then: "dont lose any student work. there must be a solution to retain all student answers."

**What was measured first (connector, 2026-10-26).** IDEA-Blade 02 in IDEA 100 Block 1 held 14
typed answers: Team 2's three members had each entered the same five measurements and the
same inspection pick (6 boxes, identical across all three), Landon Mercado one measurement,
Ethan Su one fight pick. The IDEA-Blade teams draw was posted, until 2026-10-28 22:00 UTC.

**Why a switch alone would have lost work.** A team page reads only `classroom_team_answers`;
the member rows in `classroom_responses` are copies. A per-student post gaining `team` shows
every team box empty, and the first teammate's save overwrites every member's row
(`_classroom_save_team_response`), so a different answer a member wrote on their own was gone.

**What 0313 does.** `_classroom_team_carry_over(item, team)` fills each empty team or role box
(never a picture, never an individual block) from the members' own rows, newest first, as the
team's answer and every member's copy, and writes every member's own answer that differed
into `classroom_team_log` first. It runs when a team manifest is stored and when a draw is
posted, and once at apply over every team post already stored. A box with a team answer is
never touched, so a re-upload and a re-applied file add nothing.

**Measured.** `tests/db/classroom-team-carry-over.test.ts`, 8 tests on the chain short of 0313
with pre-migration data written through the real RPCs: carried values and copies for 4 of 4
members, the losing answer in the history, 1 of 4 members holding the individual answer and 3
of 4 without it, a section with no posted draw untouched until its draw is posted, nothing
added on a second run. Mutation proof in the permissive direction, file restored
byte-identical (md5 `e96d3ed867c79c1928148fe2aa4d0018`): carrying individual blocks reddens the
privacy test; logging only the kept answer reddens the history test.

**Not verified.** The apply against production (it runs through `migrate.yml` on push), and a
signed-in student's page after the switch.
