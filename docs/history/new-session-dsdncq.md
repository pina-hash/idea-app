---
title: Every open Foundry ask, in one bundle: boards, publisher profiles, gallery sections, search, and mobile full screen
date: 2026-09-22
branches: [claude/new-session-dsdncq]
migrations: ["0221"]
subsystems: [foundry]
---

Four student reports, one lane, one migration. Reports 30 (Azad Arteaga, "more
leaderboards for foundry. Ex: Most hours played, most versions/updates, etc."),
31 ("Publishers should have profiles that you can visit"), 32b (gallery
sections and search) and 33b (Enrique Mercado, iPhone 607x320, "doesn't full
screen on mobile good"). All four shipped.

## The audit, before anything was changed

Every claim in the prompt was checked against the tree. **All of them held.**

- No leaderboard surface exists anywhere in Foundry. Confirmed.
- `foundry_list_apps` projects `version_count` (`0173`, the current
  `create or replace`), and `FoundryAppSummary` declares it at
  `transports.ts:219`. "Most versions" needed zero SQL and got none.
- `student_app_plays` stores `started_at` and `last_seen_at`; the table comment
  says "THE DURATION IS THIS MINUS started_at"; `foundry_app_play_stats` sums it
  as `seconds_played`. The only cross-app read, `foundry_play_counts`, returned
  `app_id, plays, plays_7d` and nothing else.
- `surface.ts` has exactly the three name-only helpers, and `foundryAuthorName`
  (l.291) has two rungs and no email fallback. `FoundryAuthor`
  (`transports.ts:187`) says "There is no owner EMAIL here and there must never
  be one."
- `foundry_list_apps` already took `p_owner` with
  `and (p_owner is null or a.owner = p_owner)` and already projected `owner`;
  `FoundryAppSummary` was the only thing dropping it. It had **no caller** --
  this bundle is its first.
- `FOUNDRY_GALLERY_DEFAULT_SORT` is `'played'`. Sections were impossible by
  construction: one mutually exclusive `aria-pressed` group.
- Search had zero trace: no input, no `tsvector`, no `ilike`, no `pg_trgm`.
- `viewport-fit` absent from `src/app.html` (l.5); six `env(safe-area-inset-*)`
  users. The app iframe carried no `allow` attribute of any kind, and **no
  response anywhere in this repository sends a Permissions-Policy header**, so
  the default allowlist `self` governed.
- `sortGallery` had no index term and rested on ES2019 stable sort.

Decisions 04, 14 and 35 were read in full. One thing the prompt did not say and
which decided a design: **`gauntlet_leaderboards()` has projected
`display_name`, `full_name`, `avatar`, `avatar_url` and `pathway` to every
signed-in student since `0024` and `0038`.** That is the exact field set a
Foundry author card wants, already published to the identical audience, which is
what made the author projection a restatement rather than a widening.

## The two rung decisions the prompt required stated

**"Trending" is a formula, written once:** *plays in the last seven days minus
plays in the seven days before that.* Both terms are `count(*)` over
`student_app_plays.started_at`, half-open at the young end so no play falls in
both windows and none between them falls through. It is a **rise, not a level**,
because "Most played" is already the all-time level and "Played this week" is
already the recent one -- a third board ranking on either would be a copy of one
of them under a different heading. Nothing clamps: a declining app scores
negative and can only surface on a gallery where nothing is climbing, which
`foundryBoards` suppresses outright. It is deliberately not a rate, not a decay
and not normalised by age -- each is defensible and none is explicable to a
student in one line, which is the bar for a ranking that decides whose work gets
seen first.

**"Smart search" ships rung 1.5 and says so.** `src/lib/foundry/search.ts`
names four rungs with their costs:

| rung | | shipped |
| --- | --- | --- |
| 1 | direct and prefix term matching over title, tagline, description, slug and author name | yes |
| 1.5 | one-typo tolerance (Damerau: substitution, insertion, deletion, **adjacent transposition**) on tokens of four characters or more | yes |
| 2 | a curated synonym vocabulary | **no** -- a table, a migration, an admin surface, and a person who owns the list. It is a maintenance commitment, not a build problem, and an unmaintained synonym table is worse than none |
| 3 | `pg_trgm` or a real `tsvector` | **no** -- an extension, an index, a migration, and a server round trip per keystroke. It buys ranking quality on a corpus of thousands; this corpus is tens, capped at five apps per student |

**The report's own example is answered by rung one.** "Cookie Clicker" finds
"Cookie Press" because the matcher is per-token and requires ANY token rather
than every one. What he described as needing synonyms needed only not requiring
every word to match.

## What shipped

**Migration 0221.** `foundry_play_counts` widened with `seconds_played` and
`plays_prev_7d` -- widened rather than given a sibling, because it is the one
cross-app play read and a second statement of the same population and window is
the one that stops matching. The drop is forced (`create or replace` cannot
change a `RETURNS TABLE`) but the parameter list does not move, so it is not the
signature trap and there is no deploy ordering: a client deployed before the
migration ignores two keys it does not name. New: `foundry_author_profile(uuid)`.

**Two refusals in that file are load-bearing and are asserted as absences.**

1. **No cross-app `players` column.** `foundry_app_play_stats` answers a
   distinct player count for ONE app a caller named; a cross-app column would
   let a reader SCAN a gallery for the apps with exactly one player, and on
   those apps `seconds_played` is one named student's playtime. Decision 07
   accepted somebody opening one app, not the list of every app where n is 1.
2. **No email, no `section_id`, no `role`, no `preferences`** on the author
   card, each refused by name in the header with its own reason.

**The gallery.** Four ranked sections live on open -- Trending, Most played,
Most hours, Brand new -- plus search, plus two new sort orders (`hours`,
`versions`). A board is `sortGallery`'s own ranking, so there is one comparator
on the surface. Two rules keep it honest: a board is **suppressed when its
signal is flat**, and **no boards render at or below six apps**, because four
sections over five apps is the same five cards four times above a list of the
same five -- which tells a reader nothing and implies an order that was not
earned.

**`/foundry/author/<owner uuid>`.** The door is an app, not a person: the card
answers null unless the caller can already see some of that author's work, and a
uuid naming nobody answers identically. The app list is `foundry_list_apps` with
an owner -- no second listing. The name links from `FoundryDetail`'s author line
and **not** from the card, which is structural: a card is itself a link and an
anchor inside an anchor stops the card being clickable past the name. The class
closure reaches this page, because every card on it is one tap from the gallery
running a bundle.

**Report 33b, three residuals.** `allow="fullscreen"` on the bundle iframe;
`viewport-fit=cover` in `src/app.html`; a preflight WARNING (never a refusal)
when the entry file has no viewport meta.

## What was measured

**`svelte-check`: 0 errors, 37 warnings in 20 files, 31 `state_referenced_locally`
/ 5 `css_unused_selector` / 1 `perf_avoid_nested_class`.** Re-derived in a clean
`git worktree` at `origin/main` (`1ec2f640`) rather than trusted: **the branch
point measures identically**, so CLAUDE.md's stated baseline is correct as
written and needed no correction this time. Both readings were taken with
`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported and after
`svelte-kit sync`.

**The board numbers, computed two ways.** `tests/db/foundry-play-boards.test.ts`
boots the real chain through 0221 on a real embedded Postgres, plants play
sessions directly (`foundry_play_start` stamps `now()` on both timestamps and
cannot express "nine days ago, twenty minutes long"), then compares
`foundry_play_counts` against a direct `sum()` over `student_app_plays`, per app,
on all four figures. They agree. Fixture figures checked against hand arithmetic
too: Cookie Press is 600 + 1200 + 300 seconds over three sessions, two inside
seven days and one nine days back.

**The author projection, read off the payload rather than the signature** (the
function returns `jsonb`, so nothing about its shape constrains what comes out):
exactly ten keys, `email`/`section_id`/`role`/`preferences` absent by name, and
`JSON.stringify(card)` contains no `@`. Three callers: a publisher with apps, one
with none (null, and the positive control that they see their own card), and one
who is not the viewer. A uuid nobody owns answers identically to a refusal.

**`allow="fullscreen"`, proved as a pair in Chromium** with the production
sandbox set, a genuinely cross-origin child and a real user gesture:

| | `document.fullscreenEnabled` | request | error |
| --- | --- | --- | --- |
| with `allow="fullscreen"` | `true` | succeeded | none |
| without it | `false` | refused | `TypeError: Disallowed by permissions policy` |

**`viewport-fit=cover`: 9 route/width readings across three routes at 607x320,
375 and 1440, every one identical with and without it** -- scroll and client
box, `innerWidth`/`innerHeight`, computed `100dvh`, and all four
`env(safe-area-inset-*)` values -- and no horizontal scroll at any width.

**The browser pass: 30 route/width runs over every Foundry spec, 510
measurements, 0 outside threshold**, at 375 and 1440. Board rows measured
separately for the scrollbar rule: every row has `overflow-x: auto` and
`scrollbar-width: thin`, never `none`.

**Mutation proof, 10 mutants, 10 killed, every file restored from an in-memory
copy and md5-checked byte-identical.** One kill is stronger than the rest and
gets its own verdict: adding a cross-app `players` column makes migration 0221
**refuse to apply** ("return type mismatch in function declared to return
record").

## Three things the verification caught that reading did not

1. **"Cookei Clicker" found nothing.** The tolerance shipped as plain
   Levenshtein at k = 1, and `cookei` against `cookie` is a TRANSPOSITION --
   distance 2, not 1. A spelling tolerance that misses the commonest typing
   mistake is not a spelling tolerance. **The fix went in the rule, not in the
   fixture**: changing the harness query to a typo the code already handled
   would have been fitting the test to the code, and the case it stopped
   covering is the one a student will actually type.
2. **A board clipped its fifth card at 1440.** `flex: 0 0` made five cards plus
   four gaps 1328px against 1294px of pane, so the board scrolled by 34px and
   the fifth-ranked app was cut on a desktop with room to spare. A screenshot
   shows that as a card that looks fine at the right edge. `flex: 0 1` with a
   floor fits all five exactly at 1440 and still scrolls with a peek at 375.
3. **My own mutation script reported a kill as a survivor.** A run where every
   test was skipped prints `Tests 13 skipped (13)` with no "passed", the summary
   regex missed, and the summary block collapsed "no summary line" into
   SURVIVED. That is CLAUDE.md's false-clean-reading trap arriving through a
   third door beside the two it names (the exit code and the stream split). The
   script now prints the verdict rather than reclassifying it, and treats an
   inconclusive run as an instrument failure.

## What is NOT verified

- **The iOS half of report 33b.** No container in this repository has WebKit.
  `viewport-fit` is a Safari behaviour; Chromium ignores it on a desktop and has
  no notch to inset around, so a green Chromium result says nothing about the
  fix. What was measured is what it does not break.
- **Production.** No session here can reach the database. 0221 is written and
  unapplied.
- **Any signed-in surface.** The browser harness covers `/dev` routes only.
- **Web fonts.** The harness blocks every non-loopback request, so all text was
  measured in the fallback stack.
- **`prefers-reduced-motion`.** The harness runs at `no-preference`; that path
  is not exercised.

## For Mr. Pina

**1. Apply migration 0221.** Path:
`supabase/migrations/0221_foundry_boards_and_author_profile.sql`. Its tail
carries a commented read-only verification query -- uncomment the whole block
and paste it on its own afterwards. It names what it examined on every row,
never a bare count, and its last row is a positive control
(`app_short_link_target` is deliberately anon-executable) so a `true` there
proves the query can see a grant at all. Then:

    node tools/record-applied.mjs 0221 --by "Mr. Pina" --on <date> --evidence rows.txt

**Until that record exists, one assertion in the suite is red**:
`tests/db/migrations-applied-record.test.ts` wants a record for every migration
from 0193 onward. That is structural for any lane carrying a migration and is
not a defect in this work -- `0217` sat in the same state for about six hours on
2026-09-21 between `5a2bd197` and `e44bc034`.

**2. The one check this container cannot run, on your phone.** Open
`ideabosco.com/foundry` on the iPhone, in LANDSCAPE, pick any app, press Launch
and then the full-screen control. The question is whether the app now reaches
the left and right edges of the screen rather than stopping short of the notch.
If it still stops short, `viewport-fit=cover` is not doing what this bundle
expects and the line to look at is the viewport meta in `src/app.html`. While
you are there, a second thing worth one tap: if the app has a full-screen button
of its OWN, inside the game, it should now work -- that is the half proved in
Chromium.

**3. A judgement call left to you rather than made.** `allow="fullscreen"` is
the only feature granted to a bundle's frame. `gamepad`, `autoplay` and eleven
others default to `self` and are refused today for exactly the reason fullscreen
was -- a gamepad in a student's racing game silently does nothing. Nobody has
reported it, so nothing was widened on a hunch;
`tests/foundry-iframe-permissions.test.ts` pins each refusal by name so adding
one is a deliberate act.

## Deferred, with reasons

- **Synonym search and `pg_trgm`.** Priced above; neither is a build problem.
- **A separate leaderboard page.** Refused as a design decision rather than
  skipped: it would be a second ranking implementation over the same counts. The
  boards ARE the leaderboards.
- **A section is not linkable**, and neither is the sort, for decision 04's own
  stated reason: a view control in the query string puts a second parameter on
  every link a student pastes. Reversing that is its own decision. Selection is
  still in the URL, so an app found by searching is still shareable by opening
  it.
- **No play figures on the author page.** A per-author total is a number about a
  PERSON, and decision 35 is explicit: ranked by app, never by student. The
  per-app counts on the cards are unchanged. `FoundryOwnerStats` stays on
  `/foundry/mine`, where the only person reading it is its subject.
- **`FOUNDRY_PLAY_COVERAGE_NOTE` is rendered once for the whole ranked region**
  rather than under each board. Decision 04 recorded that the ranked LIST
  carried none at all; four copies of one sentence in one screen is what gets
  skipped, and one sentence heading four ranked sections is read. The per-card
  numbers in the full list below still carry no note, which is decision 04's
  open observation and is unchanged by this bundle.
