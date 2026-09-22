# 35 Foundry leaderboards are ranked by app, never by student

- Raised: 2026-09-21  By: feedback report 30, filed by Azad Arteaga on
  2026-09-21
- Status: DECIDED 2026-09-21 by Mr. Pina, in his words: "ranked by app is fine.
  no need for student ranking."
- Build: OPEN. Not built by this bundle. The surface is the Foundry gallery
  (`src/lib/foundry/FoundryGallery.svelte`, `src/lib/foundry/telemetry.ts`,
  `foundry_list_apps` / `foundry_play_counts`), and "most hours played" is the
  one part of this answer that needs a migration -- see below.

## What the answer forecloses

**Any board ranking named students.** That reading would have reversed a
written refusal already in the tree: `student_app_plays` has RLS enabled with
no policy and no grant to `anon`, `authenticated` or `service_role`
(`supabase/migrations/0139_foundry_telemetry.sql`); `foundry_app_play_stats`'s
`players` field is a COUNT, never a list (confirmed:
`src/lib/foundry/transports.ts`'s `FoundryPlayStats` carries `players: number`
and no name or id field anywhere in the same shape); and migration `0204`
states outright, in its own header, "PUBLIC MEANS AGGREGATE. A student must
never read another NAMED student's playtime." Those refusals stand. This
decision strengthens them rather than touching them: "ranked by app" was never
ambiguous with "ranked by student" in the code, only in the feedback report
that raised the question, and Mr. Pina's answer closes that ambiguity rather
than opening a new door.

## What the answer unblocks

**"Most versions or updates" needs zero new SQL, confirmed against the tree.**
`foundry_list_apps` already projects `version_count`
(`supabase/migrations/0130_foundry.sql` line 1127, restated unchanged in
`0132` and `0173`'s later `create or replace` of the same function), and it
already reaches the client: `src/lib/foundry/transports.ts` line 219 declares
`version_count: number` on `FoundryAppSummary`. A gallery sort by version
count is a client-side sort over a field already in every payload the gallery
already fetches.

**"Most hours played" by app is derivable, and needs SQL.** Duration is
stored per play session as `last_seen_at` minus `started_at`
(`supabase/migrations/0139_foundry_telemetry.sql`, the `student_app_plays`
table and its `constraint student_app_plays_span check (last_seen_at >=
started_at)`), and `foundry_app_play_stats(p_app_id)` already sums it as
`seconds_played` for ONE app at a time
(`supabase/migrations/0204_foundry_description_optional_and_public_play_stats.sql`).
But the only CROSS-APP read -- `foundry_play_counts(p_include_hidden,
p_include_unpublished)`, the function a gallery-wide board would call -- returns
exactly `app_id, plays, plays_7d` and nothing else (confirmed by reading its
body in `0139`, unchanged since). Ranking every app by hours played means
either widening `foundry_play_counts`'s return shape to add a summed-seconds
column, or a new function beside it; either is a migration, and either is
`_foundry_app_in_population`-gated exactly as `foundry_play_counts` is today,
so no new disclosure is created by adding the column -- the same population
that can already see `plays` and `plays_7d` per app can see hours played per
app, aggregate, same as it can already see aggregate plays.

## The two accuracy facts any hours board inherits, and must state on its own surface

1. **Duration is measured to the last heartbeat at a 60 second interval**, so
   the worst-case error is about a minute per session
   (`_foundry_play_window()` and the ping/resume mechanics in `0139` govern the
   heartbeat cadence this rests on). A board showing hours played is showing a
   figure with that much slop built in, not a precise clock reading.
2. **Plays from the direct `/a/<appId>/` address are not counted at all.**
   `FOUNDRY_PLAY_COVERAGE_NOTE` (established by migration `0139`) already
   states this for every existing play-count surface, and it applies to an
   hours board with the same force: a shared link opened by fifty people adds
   nothing to any count, hours included. Whoever builds the hours board
   renders this note beside it exactly as every other play-figure surface
   does; a new figure with no coverage note is a regression on this rule.

## What is still open, for whoever builds this

- The exact SQL shape for hours-played-by-app (a widened `foundry_play_counts`
  vs. a sibling function) is a build decision, not decided here.
- Whether the gallery gets a third sort option (`hours`) beside `recent` /
  `played` / `played7d`, or a separate ranked view, is also a build decision;
  `FOUNDRY_GALLERY_SORTS` in `telemetry.ts` is the one place either shape
  lands.

## Context

- Feedback report 30 (Azad Arteaga, 2026-09-21) -- the raised question.
- `docs/history/` under the Foundry telemetry and play-stats bundles
  (`grep -rl "PUBLIC MEANS AGGREGATE" docs/history`) -- the refusal this
  decision leaves standing.
- `supabase/migrations/0139_foundry_telemetry.sql`,
  `0204_foundry_description_optional_and_public_play_stats.sql` --
  `foundry_play_counts`, `foundry_app_play_stats`, `student_app_plays`.
- `src/lib/foundry/transports.ts`, `src/lib/foundry/telemetry.ts`,
  `src/lib/foundry/FoundryGallery.svelte` -- where `version_count` already
  reaches the client and where an hours sort would join it.
