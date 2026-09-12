# 07 Foundry telemetry: make the two owner-only metrics public
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: closed 2026-09-12 (prompt 0177, `claude/busy-newton-trto6y`).
  ANSWERED **PUBLIC**, against the default below. `0204` opens all three metrics
  and adds the caller-scoped read. The audit behind it is ledger 0176
  (`docs/history/inspiring-dirac-wtoe9z.md`), which stopped without a migration
  because it had no number allocated.
- Decision: **Mr. Pina, 2026-09-12: make the owner-only metrics public, and let
  every student see their OWN stats for any app they played** -- "if I play
  twenty hours of cookie clicker I should see my playstats."

  **THE TITLE OF THIS ENTRY SAYS TWO METRICS AND THERE ARE THREE.** Ledger 0176
  measured it. `foundry_app_play_stats` returns FOUR scalars, of which `plays`
  was never owner-only -- `foundry_play_counts` has answered it to any signed-in
  caller since `0139` and it is on the gallery cards. The owner-only set is
  **`players`, `seconds_played` and `last_played_at`**. Widening two and leaving
  one is the failure mode here, and it is a quiet one: it passes any assertion
  phrased over the returned object as a whole, because the object still carries
  all four keys either way. `tests/foundry-telemetry.test.ts` therefore names
  each of the three separately, against its own known-correct number, on a
  fixture with two players of deliberately different durations so a wrong figure
  cannot coincidentally agree with the right one.

  **THE n=1 CASE IS ACCEPTED. THIS IS THE PART THAT EXISTS SO NOBODY REOPENS
  IT.** On an app one person has played, the public aggregate IS that person's
  figure: "1 player, last played 3:47pm" says when that student played. Ledger
  0176 raised this precisely, as the case where a straight gate widening fails
  the aggregate-only boundary, and **Mr. Pina was asked precisely this question
  and said it is fine.**

  So: **do not add a threshold, a floor, a minimum player count, a rounding
  scheme or a suppression rule to protect the n=1 case, and do not raise it
  again as a finding.** It is a decision that has been made with the consequence
  in front of the person making it, not an oversight waiting to be caught. A
  session that believes it has found this should read this paragraph and stop.

  **THE BOUNDARY THAT STILL HOLDS, and it is the only one left on this table:
  PUBLIC MEANS AGGREGATE.** A student may read how much an APP has been played.
  A student may never read how much ANOTHER NAMED STUDENT has played it. In
  `0204` that is two structural properties rather than two checks: the aggregate
  function has no shape in which it could name a person, and the caller-scoped
  function `foundry_my_play_stats(p_app_id uuid)` takes NO IDENTITY PARAMETER,
  so there is no call anybody can write that asks about somebody else. Both are
  gated on `_foundry_app_in_population`, so an unpublished app is still its
  author's alone, a hidden one still an admin's, and an app outside the
  population answers identically to one that does not exist.

  **WHAT WAS FOUND ON THE WAY AND CLOSED IN THE SAME FILE.** `0139`'s own comment
  says `service_role` "gets nothing either, and that is deliberate"; its table
  revoke then names `anon, authenticated` and stops, while all five of its
  FUNCTION revokes name `service_role` too. So the role held SELECT on
  `student_app_plays` from `0139` until `0204` -- the `0201` defect one table
  over. The reason nothing reported it for that whole period is that the test
  asserting the table answers nobody checked the two CLIENT roles only, which is
  the same blind spot in the test as in the migration. Both are widened.
- Default this assistant would pick: Not public; add them to the owner's own dashboard.
- Why it is blocked on him: Widening a public payload is a disclosure decision (`CLAUDE.md`, "Widening a public or preview payload is a DISCLOSURE DECISION"), and it is his.
- What it unblocks: Either nothing, or a small owner-dashboard lane.
- Context: migration `0139` (`foundry_app_play_stats`, which returns NULL for a non-owner, and `foundry_play_counts`, the gallery's counts); `CLAUDE.md`, "NO PER-PLAYER READ OF PLAY DATA EXISTS FOR ANYONE".
- Tree check (2026-09-02): `foundry_app_play_stats` is owner-scoped in 0139 as described; the two public counts already reach the gallery through `foundry_play_counts`.
