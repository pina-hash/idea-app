---
title: "How much an app is played, and nothing about who played it (`0139`, `claude/foundry-telemetry-migration-dnzvh3`)"
date: 2026-08-27
branches: [claude/foundry-telemetry-migration-dnzvh3]
migrations: ["0139"]
subsystems: ["IDEA Foundry"]
record_order: 161
---

## How much an app is played, and nothing about who played it (`0139`, `claude/foundry-telemetry-migration-dnzvh3`)

**Branch:** `claude/foundry-telemetry-migration-dnzvh3`. **Migration:**
`supabase/migrations/0139_foundry_telemetry.sql`. **NOT APPLIED** at the time of
writing: it is pasted into the Supabase SQL editor by hand after the merge, as
every migration here is.

Three things: play telemetry for Foundry, the surfaces that show it, and the
admin metadata edit whose database half had existed since 0130 with no control
attached to it. Additive only -- a new table, one private helper and four new
functions. Nothing dropped, no existing signature moved, no existing function
rewritten. `foundry_list_apps` in particular is untouched.

### The constraint that shaped the whole thing: the app cannot report

`AppStage` and `AppFrame` were read first, and what they establish is that
there is no signal from inside a bundle at all. A published app runs in a
sandboxed cross-origin frame served from the apps origin, which holds no
session and no cookie of ours; there is no postMessage contract and there must
not be one, because asking a student's own code to report its own usage makes
every figure a figure the measured party writes.

What the PORTAL knows, exactly, is `AppStage`'s lifecycle and nothing else:

| moment | what happens in `AppStage` today |
| --- | --- |
| Launch pressed | `start()` sets `running = true`; the frame mounts |
| Stop pressed | `stop()` sets `running = false`; the frame unmounts |
| another app selected | the ids effect sets `running = false` |
| component destroyed | the gallery keys its detail pane on the slug, so moving between apps destroys the instance |
| tab closed | **nothing fires reliably at all** |

That last row is the design constraint rather than an edge case: a tab closing
is the NORMAL way a play ends. So the row carries `started_at` and
`last_seen_at`, a heartbeat moves the second one, and duration is measured to
it. There is no `ended_at` column, because a clean Stop is simply the last
heartbeat and a column only a clean end writes would be null for most of the
plays that ever happen. The cost is bounded and stated: an abandoned session is
accurate to within one heartbeat interval (60s), never recorded as zero.

### The hole, written into the migration's own comment

**A play started from the direct page `/a/<appId>/` is not counted.** That route
is the app's own public address -- the whole document, no iframe, no portal
chrome, no session -- so there is nothing of ours on the page to see it, and
there cannot be without either injecting a script into a student's own document
(the byte rule forbids it: a stored byte is served back unchanged, so a reviewer
reads what executes) or scoping the portal's cookies onto the apps host (the one
thing the origin split exists to prevent).

So every figure this feature produces is PLAYS THROUGH THE PORTAL. A shared link
opened by fifty people adds nothing to any of them. It is stated in the
migration's header, it is `FOUNDRY_PLAY_COVERAGE_NOTE` in `telemetry.ts`, and
`FoundryPlayStats` renders it beside the numbers whether or not they are zero --
which is when somebody is most likely to read a zero as "nobody opened it".
`tests/foundry-telemetry-surfaces.test.ts` asserts the sentence exists and is
written down once.

### The review queue is excluded twice over

A reviewer running a submitted build to decide about it is not a play. Two
independent layers, so opening one leaves the other closed:

- `/foundry/review` hands `AppStage` **no recording transport at all**. Absence
  is the mechanism, and it is load-bearing here rather than tidy.
- `foundry_play_start` accepts **only the app's `published_version_id`**. A
  draft the owner is testing and a submitted build are both refused.

The client half is the one that would regress silently -- adding a transport
"for consistency" does not throw, does not fail a type check and does not look
wrong on screen -- so it has a sweep with a positive control.

### One row per session, and what the rate limit actually is

`_foundry_play_window()` is thirty minutes and is written down once, because the
start (which resumes inside it) and the ping (which refuses outside it) are the
same rule about what one session is. Two literals thirty lines apart is how a
resume window and a staleness window stop being the same number, which would
leave a row a start will not resume and a ping will still extend.

- **Mashing Launch resumes.** Ten presses in a row produce one row; measured.
- **Concurrent starts are serialized on the (player, app) pair** with
  `pg_advisory_xact_lock`. The window cannot be a unique index -- an index
  predicate may not contain a volatile expression like `now()` -- so there is no
  constraint for two tabs opened together to collide on. Keyed on the pair, so it
  serializes the mashing case and never two different people on one app.
- **The heartbeat beats only while the page is visible**, and a stale ping is
  REFUSED so the portal opens a fresh session rather than booking the gap. Without
  that pair, a tab left open overnight books the night as play time.

### Who sees what, which is the feature

There are three read paths and none can answer "who played this":

| function | caller | answer |
| --- | --- | --- |
| `foundry_play_counts` | anyone signed in | plays and plays in the last 7 days, per app, over the caller's own population |
| `foundry_app_play_stats` | the app's OWNER, or `is_admin()` | plays, unique players, seconds played, last played. Four scalars |
| (nothing else) | -- | there is no function, view, policy or grant returning a play ROW to any client, admin included |

`student_app_plays` has **RLS enabled with no policy AND no grant to `anon` or
`authenticated`** -- two independent refusals, either of which alone denies every
select. `foundry_app_play_stats` returns NULL for a non-owner, which is the same
answer a nonexistent app gives, so an id cannot be probed.

**`FoundryPlayStats` is ONE component with two mounts and no staff branch** --
`/foundry/mine` for the author, the review inspector for an admin -- because they
are allowed to see the identical thing. What an admin has that an author does not
is OTHER APPS, never more detail about one.

**No ratings and no written reviews.** No column, no function that would accept
one, and no shape that anticipates one; the migration's self-check asserts the
table has no `rating`/`stars`/`score`/`review`/`comment`/`body` column, so
somebody adding one later finds out it was a decision. See "Deferred" for the
one thing this shape does NOT anticipate on purpose.

### The gallery's popularity sort

`foundry_list_apps` is untouched: joining two counts into it would have been a
signature change on a function four other loads call. `foundry_play_counts`
declares the SAME population through the SAME predicate, the route reads it
second, and the client joins on the app id. A missing RPC degrades to NO COUNTS
-- migrations here are applied by hand, so a deployment sitting between 0138 and
0139 is a real state and must not take a working gallery down for a figure
nobody came for.

`recent` is and stays the default. Opening the gallery on a popularity ranking
would put the same handful of apps at the top of the page every day of the year,
which is a decision about whose work gets seen and not a default. Ties break on
the incoming order, so a gallery where nothing has been played is exactly the
Recent order rather than an arbitrary shuffle.

**A zero renders nothing at all.** "0 plays" on every card of a gallery nobody
has opened yet is noise on every card, and it reads as a verdict on the work.

### The admin metadata edit

Confirmed by reading 0130 rather than taken on trust: `foundry_update_app_metadata`
has `if v_app.owner <> v_uid and not public.is_admin() then raise` -- the database
half has admitted an admin since it shipped, and only the control was missing.

It goes in `FoundryInspector`, which is already the one place staff act on ONE
app (clear its flag, shelve it, restore it, delete it), and it renders
`FOUNDRY_METADATA_FIELDS` -- the SAME registry `/foundry/mine` renders for the
owner. A second admin-flavoured field list would be a second set of names and
limits to keep in step with the whitelist inside that RPC.

**Two things 0130 decides that the control has to obey.** The slug is refused BY
NAME (a printed, QR-coded address) and is not in the registry. And a HIDDEN app
is refused for an admin exactly as for its owner -- the check sits above the
owner/admin split and is unconditional -- so no control is drawn for one, and the
reason is stated where the control would have been, because a panel that simply
vanished reads as a bug in the console.

### Measured

- **`npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings**, the
  baseline, with the 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` mix intact. (A placeholder `.env` was exported first,
  per the phantom-error note; it is gitignored and not committed.)
- **`npm test`: 132 files, 3049 tests, all passing**, against a baseline of
  131/3030. The two new files account for 19 + 12 = 31 tests.
- **Mutation proof, in the permissive direction, three separate gates**, each
  restored md5-identically afterwards:
  - opening the table (`grant select ... to anon, authenticated` + a
    `using (true)` policy) first made **the migration's own self-check raise and
    roll the file back**, which is the guard working; relaxing that self-check too
    so the file applies reddened **2 assertions**.
  - `if false and v_owner <> v_uid and not public.is_admin()` in
    `foundry_app_play_stats` reddened **1 assertion**.
  - dropping `and pl.player = v_uid` from `foundry_play_ping`'s lookup reddened
    its own assertion.
  - adding a `recordPlay` to `/foundry/review`'s transports reddened the
    review-queue sweep (**1 assertion**), and the route was restored md5-identically.
- **`npm run verify:browser`: 18 route/width runs, 120 measurements, 2 outside
  threshold** -- the known `/dev/pathways` harness-control finding
  (194.7x26.2, 2/2 under 44px) at both widths and nothing else. **The standard
  harness covers 8 `/dev` routes and none of them is Foundry**, so it measured
  none of this bundle's changes; see below.
- **`/dev/foundry-gallery` driven directly** through the same preinstalled
  Chromium, at 375 and 1440, 13 measurements per width, **0 outside threshold**:
  - horizontal scroll 0px at both widths, before and after sorting.
  - sort buttons 94.3x44, 136.5x44, 178.8x44 -- **0/3 under 44px**, and 3/3 pass a
    centre hit-test once scrolled into view.
  - contrast **7.55:1** on the active label (`rgb(120, 184, 112)` on the raised
    `rgb(27, 23, 18)`) and **7.26:1** on an inactive one (`rgb(163, 157, 146)` on
    `rgb(13, 12, 10)`), both composited to a canvas and read back.
  - `aria-pressed` true on exactly one control, `recent`.
  - 0 console errors.

**THE BROWSER PASS CAUGHT A REAL DEFECT AND IS THE ONLY THING THAT WOULD HAVE.**
The first draft styled the active sort control `border-color: var(--green);
color: var(--green)` -- which is a **no-op**, because `.btn` in `src/app.css` is
already `color: var(--green)` on a green border. Measured, the pressed control
and the two beside it came back at the same **8.28:1** and the same
`rgb(120, 184, 112)`: the active order was carried by `aria-pressed` alone and
was invisible to anybody looking at the screen. The fix inverts it -- the
inactive members give the accent up (`--text-2`, `--boundary`) and the active one
takes the accent AND a raised ground, which is the room's own selected idiom
(`.fdy-card.selected`). Nothing in `svelte-check`, the test suite or a code review
would have reported this.

### What was NOT verified

- **The migration has NOT been applied.** It has been proven only against the
  embedded Postgres in the vitest suite, with the real file applied unmodified in
  a chain ending 0130, 0131, 0132, 0136, 0139, 0137. Nothing here has touched a
  live database.
- **The play-count chips on gallery cards, `FoundryPlayStats`, and the admin
  metadata editor were NOT verified in a browser.** All three are transport- or
  data-gated, and `/dev/foundry-gallery` -- the only Foundry harness -- supplies
  no `playCounts`, no `playStats` and no `saveField`. Widening it is a two-line
  change to `src/routes/dev/foundry-gallery/+page.svelte`, which was outside this
  session's assigned file list, so it was left alone and this is reported instead.
  Their rendering rests on `svelte-check` and on the pure functions behind them
  being tested, which is weaker than a measurement and is not the same thing.
- No signed-in surface and no local Supabase stack: the Docker daemon is not
  running in this container and the Supabase CLI is not installed, so `/dev/login`
  was not available.
- No production or preview deployment. Nothing was opened on `ideabosco.com`.
- `npm run build` was not run.
- The advisory-lock serialization is asserted by construction and by the
  single-caller resume test; **no concurrent-burst test was written for it**,
  because the paired-chain measurement that would prove it is a bundle of its own
  (0134 is the precedent).

### Deferred

- **Promoting the durable rules into `CLAUDE.md`.** At least four belong there --
  the `/a/` undercount, the two-layer review-queue exclusion, "no per-player read
  exists for any caller", and the resume window being the rate limit -- but
  `CLAUDE.md` was outside this session's file list and two other sessions were
  live on the repo at the same time.
- **`classroom-updates.json`** was not touched: it is the CLASSROOM changelog and
  is also outside the assigned file list. If Foundry counts as classroom-facing
  for that standing directive, an entry is owed.
- **A k-anonymity floor on `last_played_at`.** On an app with one player, that
  timestamp is when that one person played. It is inherent in any aggregate over
  a small n, it is bounded to the author of the work and to staff, and it is what
  the feature was asked for -- so it ships, written down, rather than with a
  threshold nobody asked for.
- **Self-plays count.** An author pressing Launch on their own published app
  records a play, bounded by the resume window to roughly two an hour. Excluding
  them was considered and rejected as the wrong default (a play is a play), but it
  does mean the gallery ranking is gameable by somebody patient. If it ever
  matters, the fix is a clause in `foundry_play_start`, not a change to the
  reading side.
- **Counting distinct PLAYERS rather than plays for the gallery ranking** would
  be harder to game. It was not taken because "counts over apps, never over
  people" is the boundary this bundle was built to, and a public ranking derived
  from how many people did something is a step across it that deserves its own
  decision.

---

