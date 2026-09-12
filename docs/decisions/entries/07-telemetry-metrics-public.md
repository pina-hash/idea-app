# 07 Foundry telemetry: make the two owner-only metrics public
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: decided 2026-09-12. FULLY PUBLIC, in two layers. The DECISION is closed; the BUILD is open, see the Build line.
- Decision: 2026-09-12, Mr. Pina: fully public, in two layers. Each student sees
  their OWN playtime and stats for any app they played; TOTALS across everyone are
  public. His words: "if I play twenty hours of cookie clicker I should see my
  playstats."
- Against the default: plainly, yes. The default below was "not public; add them to
  the owner's own dashboard". He reversed both halves -- the totals go public, and
  a figure this assistant proposed showing only to an app's AUTHOR is now also owed
  to every PLAYER about themselves.
- Build: OPEN, two layers, no collection change -- but BOTH LAYERS ARE A MIGRATION
  and there is no read-path-only half to ship. Measured against
  `supabase/migrations/0139_foundry_telemetry.sql` on 2026-09-12, and independently
  by prompt 0176 (`docs/history/inspiring-dirac-wtoe9z.md`) the same day, which
  audited this table against a real Postgres and reached the same split answer: the
  DATA exists and the READ PATH cannot be widened without SQL. Read that entry before
  starting; it carries the four-function census and the three no-migration routes it
  refused (a client select, a service-role route, client-side accumulation).
- Layer one, the public totals: `plays` and `plays_7d` are ALREADY readable by any
  signed-in caller through `foundry_play_counts(boolean, boolean)` (0139 line 384),
  which is what the gallery counts come from. What is still owner-or-admin is the
  other three, and they are all in `foundry_app_play_stats(uuid)`: `players`,
  `seconds_played` and `last_played_at`, gated at 0139 lines 448-450, which returns
  NULL for anybody else so an id cannot be probed. So "make the totals public" is
  really "move the owner gate on `foundry_app_play_stats`", which is a migration --
  the two counts a student can already see are on the gallery cards today, so there
  is nothing to expose there. It is not new data either way.
- Layer two, a student's own playtime: THE DATA ALREADY EXISTS AND IS ALREADY
  BEING COLLECTED. Nothing has to start recording. `student_app_plays` (0139 lines
  183-195) carries `player`, `app_id`, `started_at` and `last_seen_at`, and the
  duration is `last_seen_at - started_at` -- the same arithmetic
  `foundry_app_play_stats` already sums, only unfiltered by player. The index for
  the query is even already there: `student_app_plays_resume_idx` (line 208) is
  `(player, app_id, last_seen_at desc)`, built for the resume lookup and exactly
  what a per-caller read wants.
- What is missing is a READ, and only that: `student_app_plays` has RLS enabled
  with NO policy and NO grant to `anon` or `authenticated` (line 229, and 0139's
  own header calls it "two refusals rather than one"), and no function, view or
  grant returns a per-player figure to any client. So layer two is ONE new
  SECURITY DEFINER function, and per CLAUDE.md it takes NO identity parameter --
  the caller is `auth.uid()`, so "can only see their own" is a property of the
  signature. It must also revoke from `anon` BY NAME in 0166's shape, because 0137
  does not cover a function created after it.
- Two things the build must carry, or the number lies: (a) every figure is plays
  THROUGH THE PORTAL. A play started from an app's own address `/a/<appId>/` is
  structurally uncounted -- no iframe, no portal chrome, no session -- so twenty
  hours of cookie clicker played from a shared link is zero hours here.
  `FOUNDRY_PLAY_COVERAGE_NOTE` in `src/lib/foundry/telemetry.ts` is the one
  statement of that and CLAUDE.md requires it beside every figure, zero included.
  (b) `player` is `references auth.users on delete set null`, so a departed
  student's hours stay in the app's total and stop being anybody's own -- which is
  correct, and is why `count(distinct player)` counts players and not plays.
- Also reported by 0176, and it belongs here because this is where somebody reads
  about this table's access: `service_role` HOLDS SELECT on `student_app_plays`,
  measured `true`. 0139's own comment says "`service_role` gets nothing either, and
  that is deliberate", but the statement below it is
  `revoke all on public.student_app_plays from anon, authenticated;` -- which does
  not name `service_role`, while all five of the file's FUNCTION revokes do. The
  hosted bootstrap's `grant all on tables` therefore survives, and the file's
  self-check cannot see it because it asserts only `anon` and `authenticated`. It is
  the table half of the defect `CLAUDE.md` records for `0201`. Nothing in `src/`
  reads through it -- the four readers all call the RPCs -- so the practical exposure
  is small; the comment claiming a closed door that is open is the cost.
- Not widened by this, and worth saying so: he answered what a student sees about
  THEMSELVES and what everyone sees in AGGREGATE. Neither is a per-player read of
  somebody else. CLAUDE.md's "NO PER-PLAYER READ OF PLAY DATA EXISTS FOR ANYONE,
  ADMIN INCLUDED" survives this answer intact: what an admin has that an author
  does not is other apps, never more detail about who played one.
- Default this assistant would pick: Not public; add them to the owner's own dashboard.
- Why it is blocked on him: Widening a public payload is a disclosure decision (`CLAUDE.md`, "Widening a public or preview payload is a DISCLOSURE DECISION"), and it is his.
- What it unblocks: Either nothing, or a small owner-dashboard lane.
- Context: migration `0139` (`foundry_app_play_stats`, which returns NULL for a non-owner, and `foundry_play_counts`, the gallery's counts); `CLAUDE.md`, "NO PER-PLAYER READ OF PLAY DATA EXISTS FOR ANYONE".
- Tree check (2026-09-02): `foundry_app_play_stats` is owner-scoped in 0139 as described; the two public counts already reach the gallery through `foundry_play_counts`.
