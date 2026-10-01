---
title: "0357: the database load cut -- a versioned cache for HTML documents, and one poller for every live widget"
date: 2026-10-01
branches: ["claude/idea-0356-0360-overnight-cc-f81yz3"]
migrations: []
subsystems: ["IDEA Classroom", "Platform & access"]
---

The production database stalled at about 8:00 PT on 2026-09-29 and again on
2026-09-30, when the 21-student IDEA100 class signs in, and both times it took a
manual restart (up to 40 minutes of class). Compute went from Nano to Small on
2026-09-30 at 21:37 PT, by hand. This bundle cuts what the classroom asks of the
database so the same morning does not reach the ceiling again. No migration, no
SSR loader, no data touched.

### For Mr. Pina, first

- **This bundle was issued as ledger 0356 and lands as 0357**: another session put a
  different 0356 on `main` (`dcdea435`, the HTML authoring standard 1.9) while this one
  was working, so this one took the next free number. Nothing else about it changed.

- **Nothing to do for this half.** It is code only and it deploys with the push.
- **If you ever edit an HTML assignment's `document` column in the SQL editor,
  set `updated_at = now()` in the same statement.** The served bytes are now
  cached by that timestamp. An edit made through the site (re-import, restore,
  remove) always moves it.
- **Revert:** `git revert` the single commit of this push. It holds no data and
  no schema, so a revert is a clean return to the old behaviour.

### What the audit found (read-only, on `main` at `a37d901`)

**1a. The HTML document read.** Confirmed. `GET /hx/<docId>` called
`hxStoredDocument`, which selected `item_id, document` (the whole document, up
to 2 MB by 0195's cap) through the service-role client, then `classroom_items`,
on EVERY request with no server cache. The response carried
`cache-control: private, max-age=60` and no validator, so a browser re-fetched
the whole body after 60 seconds and on every reload. **The version CAN be told
from small columns**, so 2A was not a stop:
`classroom_set_html_assignment` (0195) is the only writer of the table (restore
calls it; 0197's and 0199's inserts are rolled-back self-check fixtures). It
upserts `on conflict (item_id)`, which keeps `document_id` stable across a
re-import, and sets `updated_at = now()` on both the insert and the update arm. A
removal deletes the row, so a re-import after a removal gets a new
`document_id`. `(document_id, updated_at)` therefore names one exact set of bytes.

**1b. The doubled ticks.** Confirmed, and worse than claimed. `ClassTeams` and
`ClassThemePanel` ticked on the interval, on `visibilitychange` AND on `focus`;
`HallPass` and `SongQueue` on the interval and `visibilitychange`. A tab return
fires both events, so `classroom_team_board` went out twice per return, and
`focus` had NO rate rule at all. It fires on every alt-tab between two visible
windows: a student switching between SOLIDWORKS and the browser re-read the
board every time. No widget is mounted twice. The section layout mounts each
once inside `classList`, which is rendered once, in the split's nav pane, on
the class and item pages only. So the 2-3 board calls per tick in the edge logs
are the two listeners plus focus churn, with the section layout's server load
(`loadPostedTeams`) adding one more whenever a navigation or `invalidateAll`
re-ran it.

**1c. The intervals.** Confirmed: theme 15s (60s while voting is closed, and
only while the panel is open), presence beat 30s, hall pass 45s, posted teams
60s, songs 90s. Every interval was armed at mount, so the first tick of every
client landed one interval after its page load. Twenty-one pages loaded in the
same minute tick in the same second.

**1d. Errors.** Confirmed. Every load transport answered `null` for every
error, every widget kept what was on screen, and the next tick asked at full
rate. Nothing distinguished "the network blinked" from "you are not signed in".
The presence ping swallowed its result entirely. So after the restart, a client
whose session had been lost went on polling as `anon`, which 0137 refuses with
`42501`. That is the storm in the 15:49 to 16:12 logs.

**The baseline**, from those constants, for one student:

| | before | after |
| --- | --- | --- |
| class page, steady state | **3.0** calls/min (hall 1.33, songs 0.67, teams 1.0) | **0.9** (hall 0.5, songs 0.2, teams 0.2): **-70%** |
| item page, steady state (adds the presence beat) | **5.0** (beat 2.0) | **2.4** (beat 1.5): **-52%** |
| theme panel open, vote open | +4.0 | +2.0 |
| one return to the tab (class page) | 4 (teams 2, hall 1, songs 1), +2 with the theme panel open | **3**: one per widget, +1 with the panel open |
| one return to the tab (item page) | 5 | **4** |
| each alt-tab between two visible windows | 1 board read (+1 theme), unbounded | **0** inside the poke gap: at most one read per quarter-interval per widget |
| a class of 21 on the item page | 105 calls/min, landing together | about 50 calls/min, spread over the interval |

The "after" figures are pinned. The last test in `tests/classroom-poll.test.ts`
recomputes both from the live constants and fails if either page goes above
half the baseline.

### What changed

**2A. `/hx/<docId>` serves from a versioned cache, and decides access on every
request.** `hxStoredDocumentHead` reads the row's `item_id, updated_at` and the
item's `kind, published, publish_at` on every request, whether the cache is warm
or cold and whether or not a tag is sent. An unpublished, scheduled or deleted
item is the same bodyless 404 it always was, and is never served from memory.
Only after that check:

- **A matching `If-None-Match` is a 304** with the full header set and no read of
  `document`. That holds on a cold instance too: a revalidation and a HEAD pass
  `prefetch: false`.
- **A first view on a warm instance** is served from memory: two small queries,
  no document read.
- **A first view on a cold instance** selects the bytes in the same query as the
  version, so it costs what it always did, two queries. Concurrent cold requests
  share that one read: 21 at once cost exactly one document read, measured.
- **A re-import** moves `updated_at`, so the next request misses the cache,
  reads once, and serves the new bytes under a new tag.
- **The strong ETag** hashes document id, version and the CSP the response
  carries, so a 304 can never hand back a stale header set.
- **The cache** is bounded (32 MiB, 64 documents, LRU) with a 10-minute ceiling
  per entry. The ceiling covers only the hand-edit case above.
- `cache-control` is unchanged at `private, max-age=60`, so the window in which
  a browser reuses bytes it already holds is exactly what it was.

**2B. One poller, `startPoller` in `src/lib/classroom/poll.ts`, under all five
widgets.**

- **One call in flight.** A tick or poke while one is outstanding is dropped,
  and the next wait starts when the call ends.
- **One call per tab return.** `visibilitychange` and `focus` are one poke, and
  a poke runs only if the last call started at least `defaultPokeGapMs` ago:
  10s, or a quarter of the interval for a slow widget, so focus churn can never
  drive a widget past four times its cadence.
- **Out of step.** The first wait is random in [0, interval), and each later
  wait is the interval ±20%.
- **Paused while hidden.** A tick that comes due while hidden asks nothing, and
  the return to the tab runs it.
- **Backoff.** Each failure doubles the wait, to a 5-minute cap. One success
  resets it, and a poke does not cut a backoff short.
- **Stop on a lost session.** A 401, a 403 or `42501` (`isSignedOutFailure`)
  stops the poller for good. It hands over to `pollSignedOut` in
  `src/lib/classroom/poll-session.ts`, which calls the root layout's own
  `invalidate('supabase:auth')`, folded to once per 30 seconds across widgets.
  The poller restarts only when `authChanged` reports a NEW session: a
  refreshed token, never the absence of one.

**How a transport now says "signed out".** It either throws `PollSignedOut`
(hall pass and song queue `load`, `refreshPostedTeams`) or carries a
`signedOut` flag on its failure (the team board, the theme tally). A null still
means "failed, back off". `loadPostedTeams`, the layout's page-load read,
catches everything as before.

**How the presence heartbeat uses the poller.** Its poller is immediate, so a
student still appears on the console the moment they open the work. The
heartbeat class's own throttle now sits below the jitter's floor: without that,
a 32-second beat would be swallowed and the real gap would grow to 72 seconds,
past the credit cap.

**2C. The intervals.**

| widget | before | after | why it is safe |
| --- | --- | --- | --- |
| theme tally, vote open | 15s | **30s** | a student's own vote moves the banner at once from its answer, so the poll only brings classmates' votes |
| theme tally, vote closed | 60s | **120s** | "vote open" is the real `voting_open` field, and the fast rate is used only while it is true |
| hall pass | 45s | **120s** | an app write announces on the live channel and every page re-asks at once, so the poll is the floor; a stale "Free" is refused by the open RPC |
| songs | 90s | **300s** | same reasoning as the hall pass |
| posted teams | 60s | **300s** | posted a few times a term; the teacher's own page re-reads on post, and a student re-reads on a tab return |
| presence beat | 30s | **40s** (`PRESENCE_BEAT_STRETCH` 4/3) | held inside 0200's limits at both ends of the jitter: the longest wait (48s) is under the 60s credit cap and the 60s input window, and the shortest (32s) clears the 20s floor; a test pins each |
| `PRESENCE_POLL_MS` (the teacher's console read) | 30s | 30s | unchanged |

### Verification

- **New tests.** `tests/hx-document-cache.test.ts` drives the real route handler
  over the real resolver, with only `createClient` stood in for by a fake
  PostgREST. The fake counts every request and every select that names
  `document`; 13 cases. `tests/classroom-poll.test.ts` drives the poller through
  an injected clock, timers, visibility and random tape; 20 cases.
- **Updated tests.** Mounted cases for all five widgets on the real components:
  `tests/dom/class-teams-refresh-mount.test.ts`,
  `class-theme-panel-mount.test.ts`, `classroom-tools-mount.test.ts` and
  `presence-heartbeat-mount.test.ts`. They cover one read per tab return, the
  random first offset, backoff, and the stop on a lost session with exactly one
  `invalidate('supabase:auth')`. Every assertion the new timing broke was
  rewritten to the rule, not deleted. One theme case had gone vacuous (it faked
  only `setInterval`); it now fakes the poller's clock and carries a positive
  control.
- **Mutation proof.** Each mutant was run through `npm test -- <file>`. The
  script read stdout and stderr, judged on the summary line, and restored each
  file from an in-memory copy, md5-checked. **18 of 18 killed:**
  - the warm cache skips the publication check
  - the 304 path reads the bytes first
  - the cache ignores the version
  - cold reads are not shared
  - a scheduled item reads as live
  - a poke while in flight runs anyway
  - no gap between pokes
  - no jitter
  - no initial offset
  - no backoff
  - a signed-out run keeps polling
  - runs while hidden
  - `42501` not read as signed out
  - a backoff cut short by a poke
  - a refusal under a replaced session still stops (added by the review)
  - `runNow` honours the gap (added by the review)
  - the presence return beat bypasses the poller (added by the review)
  - no hall pass re-ask when a page load replaces a newer answer (added by the
    review)

  The second mutant SURVIVED the first run. That exposed a real gap: a cold
  instance answering a revalidation still selected the bytes. The code was fixed
  (`prefetch: false`), the test tightened, and the mutant re-run killed.
- **`svelte-check`** (with `.env` placeholders, after `svelte-kit sync`): 0
  errors, 37 warnings in 20 files (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`). That is the CLAUDE.md
  baseline, unchanged.
- **DOM project:** 98 files, all green.
- **The full `npm test`**, run after the review's fixes:
  641 files and 12114 tests passed, 0 failed suites (the summary line, with stdout and stderr read; `run-tests.mjs` status 0, 1650s). The run before the review was 641 and 12109.
- **Browser pass**, `npm run verify:browser`:
  - 30 route/width runs over `/dev/classroom-teams*` and `/dev/classroom-tools*`,
    394 measurements.
  - The 4 outside threshold were the stalled-channel spec's own text naming
    "every 45 seconds" and "every 90 seconds". The spec now names the new floors.
  - Its measured file was regenerated by `npm run verify:readme`, along with
    `classroom-teams-later-posted` (which now arrives on the harness's two-second
    refresh rather than a focus inside the gap). The same run re-measured
    `html-assignment-grading-live-stalled`.
  - 64 measurements, 0 outside, with the same counts as each file's previous run.

### The adversarial review before the push, and what it changed

A four-lens review ran against the committed diff before anything was pushed.
The lenses were the hx access decision, the poller's state machine, Svelte
reactivity, and behaviour regressions. Two skeptics tried to refute each
finding.

- **The hx lens found nothing.**
- **Four findings were confirmed, and all four are fixed in this push:**
  1. **The poller stopped on a stale session.** A refusal that came back after
     the token was refreshed mid-flight stopped the poller under the NEW
     session. One skeptic called it a narrow multi-tab race, because
     supabase-js caches a failed refresh for 60 seconds; the other reproduced
     it.
     - **Fix:** the session is snapshotted when a run starts, and a refusal
       under a replaced session is an ordinary failure.
  2. **Presence beats could land about 80s apart.** After a short tab switch,
     the return beat bypassed the poller, so the old timer's phase stood. The
     class's throttle then swallowed the next tick, and the next written beat
     landed past the 60-second credit cap. Both skeptics reproduced it against
     the real code.
     - **Fix:** a return to the tab now beats THROUGH the poller (`runNow`), so
       the wait restarts from the return beat. A throttled run reports the last
       beat's real outcome rather than `ok`.
  3. **A restarted heart could stay mute.** A heart restarted after a lost
     session could keep a stale "not visible" flag and never beat.
     - **Fix:** the restart tells it the tab is visible.
  4. **The hall pass and music queue could show stale state for minutes.** When
     a re-run page load handed back an older state over a newer local one, it
     could stand for a two-minute floor.
     - **Fix:** they now re-ask once, at once.
- **Pinned.** Each fix has a test: `runNow`, the mid-flight refresh, a
  short-hide-and-return sequence whose written beats never exceed 60s apart
  (through the twin that applies 0200's 20s floor), and the overlay re-ask. Each
  has a mutant (below).

### What was NOT verified

- **Production.** No session can reach the database. So two things are reasoned
  from supabase-js's response shape, not observed on the wire: that PostgREST
  hands `status` 401 or 403 (or the `42501` code) to the transports, and that a
  Vercel function instance keeps module memory across requests.
- **The cache hit rate in production** depends on how many instances serve a
  class arriving together, and that was not measured.
- **The 8:00 class itself.** The morning check is a quiet API error count on the
  project dashboard for that hour, with no restart.

### SSR query fan-out (findings, not fixed: the prompt names this a later lane)

These were read from the load chain, with no database involved. For one
student's first load:

- **Totals.** About 21 database calls for the class page, plus 2 Auth round
  trips. About 33-36 for an assignment item page.
- **`profiles` is read 3 times per request.** `fetchUserProfile` in the root
  layout already selects `role` and `preferences`; the classroom layout re-reads
  `role` (`src/routes/classroom/+layout.server.ts:39`) and the section layout
  re-reads `preferences` (`[sectionId]/+layout.server.ts:468`).
- **`is_admin` twice** (the root layout and the classroom layout).
- **`classroom_sections` 2 times**, 3 for a manager.
- **`classroom_items` 3 times on the class page and 5 on an assignment item
  page.**
  - The section layout's `itemsForSection` is a 21-column select including both
    `body` and `body_doc`, with four embeds and no limit.
  - A `files_placement` probe re-checks a column that same read already proves.
  - The item page re-selects its own row with the same wide select.
- **On the item page:** `classroom_manages_section`, `notebook_session_postings`,
  `notebook_entries` and `classroom_submissions` are each read twice.
- **The section layout runs 7 to 8 serial rounds.** `classroom_units`, the
  submissions read and the `preferences` read are independent but awaited one
  after another.
- **Auth.** `getClaims` is a live Auth round trip twice per request (hooks and
  the root `+layout.ts`), because the project signs HS256.
- **`invalidateAll()` re-runs the whole chain.** Most callers are manager
  actions. One is a STUDENT's: a notebook capture turned in from the item page
  (`item/[itemId]/+page.svelte:1117`) re-runs about 33-36 queries.

### Deferred, by the prompt's own list

- A `statement_timeout` for the `authenticated` role (a database change).
- Why sessions are lost after a restart.
- The SSR fan-out above.
