---
title: "GREENLINE moderation driven end to end: the pipeline works, and nothing inside GREENLINE said so (`claude/greenline-moderation-visibility-gagg5v`)"
date: 2026-09-05
branches: [claude/greenline-moderation-visibility-gagg5v]
migrations: []
subsystems: ["GREENLINE", "Moderation", "Testing", "Browser verification"]
---

Prompt 0058. Started from `origin/integration` at `fdf8c68` (whose tree is byte-identical to
`origin/main` at `ad5adbe` -- main is one merge commit ahead and carries no extra content).
Working directory `/home/user/idea-app`. Git already carried a committer identity
(`Claude <noreply@anthropic.com>`), so none had to be set.

**No migration.** Phase A established that the schema does not need one, which is the finding
this bundle set out to test.

## What was asked, and the shape of the failure it was looking for

GREENLINE takes two kinds of student submission that then wait on a teacher: a custom livery
decal (`0051`) and a community track (`0057` -> `0058` -> `0059`). The premise was that neither
pipeline had ever been driven end to end, and that the failure, if it existed, would be silent
in both directions -- a student uploads something, sees it working in their own garage, and
believes it is published; a teacher opens a queue that does not list it; nobody is told
anything.

## Phase A: what is actually there

### A1. The two state machines, as the tree has them

**Decals (`0051`).** One row per user in `greenline_decals`, `status in ('pending',
'approved', 'needs_revision')`, `reviewer_feedback`, plus the private `greenline-decals`
bucket (1 MiB, PNG/JPG, enforced on the bucket row).

- Policies: `select own` (any status), `select teacher` (`is_teacher()`), `select approved`
  (any signed-in user); `insert own` and `update own` both carry
  `with check (user_id = auth.uid() and status = 'pending')`; `delete own`. There is **no
  teacher insert/update/delete policy at all**.
- Storage: `insert`/`delete` restricted to the caller's own `<uid>/` folder; `select` gated on
  owner OR `is_teacher()` OR an `exists` against an `approved` row naming exactly that path.
  **No update policy**, so a stored object is immutable and replacing a decal means a new
  path, which the `with check` forces back to pending.
- The only teacher write is `greenline_decal_review(uuid, text, text)`, SECURITY DEFINER,
  `is_teacher()` inside the body, feedback required for `needs_revision`.

**Tracks (`0057`/`0058`/`0059`).** `greenline_tracks` with `status in ('pending', 'approved',
'rejected')` since `0059`, plus `review_feedback`, `reviewed_at`, `reviewed_by`, `featured`,
`removed`, `report_count`. Three sibling tables (`_reports`, `_ratings`, `_attempts`).

- Select policy: `(status = 'approved' and not removed) or author_id = auth.uid() or
  is_teacher()`. This is the boundary that matters, because the client fetches the `data`
  column straight off the table (`loadCommunityTrackData`), so an unreadable row is an
  unplayable track.
- **There is no client write path of any kind.** `greenline_tracks` carries `grant select` and
  nothing else. Publishing is the service-role endpoint `/api/greenline-track-publish`
  (authoritative validation runs the game's real TypeScript, which cannot execute in Postgres).
- `greenline_track_review` is the decision RPC, `is_teacher()` inside, feedback required on a
  rejection, and it drops `featured` when approval is revoked. `greenline_track_set_featured`
  refuses to feature anything not `approved`. `attempt_start` admits approved-for-everyone plus
  author-and-staff; `rate` and `report` are approved-only. `greenline_submit_race_result`
  demotes a run on an unapproved or unfeatured community track to the creative branch rather
  than erroring.

**`is_teacher()` is `is_admin()` here** (`0067`), so both queues are ADMIN tier, which is what
`CLAUDE.md`'s access model already says. A `@boscotech.edu` account with no `app_admins` row is
staff by email and nothing by permission -- the suite asserts that directly, because every
"teachers only" claim below is otherwise being made about a caller half the school qualifies as.

### A2. Driven, as a real student and a real teacher, on the real migrations

Both flows, six steps each, on an embedded Postgres with the real migration files applied
unmodified. **Every step ALLOWED. No step SILENT.**

| # | Decal | Track |
| --- | --- | --- |
| 1 submission exists, and in what state | **ALLOWED** -- row created `pending`, author reads its own object at any status | **ALLOWED** -- row created `pending`, author can open an attempt on it |
| 2 reaches a teacher's queue | **ALLOWED** -- 1 row for staff; 0 rows and 0 objects for another student | **ALLOWED** -- 1 row for staff; `greenline_track_list()` returns `[]` and `attempt_start` raises for another student |
| 3 approval reaches other students | **ALLOWED** -- row AND image both become readable | **ALLOWED** -- row becomes readable and lists; and only now can it be featured |
| 4 send-back reaches the author with feedback | **ALLOWED** -- author reads `needs_revision` + the words; the image stops being readable by others in the same statement | **ALLOWED** -- author reads `rejected` + `review_feedback` off the same list RPC the browse screen calls; `featured` drops |
| 5 resubmission returns to pending | **ALLOWED** -- upsert to a fresh path lands `pending` and is back in the queue | **ALLOWED, by a different mechanism** -- an author-side `update` is REFUSED (`permission denied`; there is no write grant), so resubmitting is a NEW row through the publish endpoint, which is what re-runs validation on the new geometry |
| 6 a non-teacher moderating | **REFUSED** (`forbidden`) | **REFUSED** (`Teachers only`) |

**So the database pipeline is correct, and this bundle's honest headline is that establishing
that is the result.** The two things worth writing down that were not obvious going in: a
send-back revokes the decal IMAGE in the same statement that changes the row (there is no
window in which a revoked decal is still readable), and a rejected track's resubmission is a
new row rather than a status change, so the rejected one stays in the teacher's list.

### A3. What a student is told

- **Decal: already correct, and had been since `0051`.** `DECAL_STATUS_UI` renders
  `PENDING REVIEW / only you see it until a teacher approves`,
  `APPROVED / visible to other players`,
  `REVISION REQUESTED / fix and upload a new image to resubmit`, with the teacher's note as
  visible copy in `.gg-decal-feedback`. **Could a student mistake pending for published? No.**
  One measured defect on it though, found by this bundle's browser pass rather than by reading:
  that sentence was painted in `--glb-ink-faint` and measured **3.52:1**, under the 4.5 floor,
  on the one line telling a student their upload is not public.
- **Community track: NOT correct, and this is the finding.** The tile carried a three-word chip
  (`IN REVIEW` / `CHANGES ASKED`) and put both the reason and the teacher's own sentence in a
  **`title` attribute**. A `title` is not discoverable and a phone cannot hover, so on the
  device most students use, a track came back from a teacher with no reason attached at all.
- **The builder still promised the old model.** `TrackBuilder`'s publish button carried
  `title="Publish "X" for everyone to race"` -- true under `0057`, false since `0059`, and
  contradicting its own label (`SUBMIT FOR REVIEW`) and the paragraph beneath it.

### A4. What a teacher sees

**Decals DO have a panel** -- `DecalReviewQueue`, mounted on `/dashboard` with a live
`{n} pending` count. That half works.

**Tracks have a panel too** (`TrackModerationPanel` at `/greenline/moderation`, admin-gated in
its own `+layout`-style `+page.server.ts`, sorting pending-first). What they do not have is
anything that says something is in it:

- The **only** link to it is one card on `/dashboard` whose meta slot holds a bare
  `Open panel` button with **no count**, and whose copy still describes `0057`'s
  publish-then-moderate model ("reports, star ratings, completion telemetry, featuring, and
  removal") without mentioning that a track now WAITS for approval before anybody can see it.
  A teacher reading that card has no way to know three tracks are pending.
- `/greenline` itself had **no admin awareness whatsoever** -- no link, no count, nothing. A
  teacher who opened GREENLINE, including one who opened it because a student asked them to
  look at something, was told nothing.

`src/routes/dashboard/**` is outside this lane, so the card's copy and its missing count are
**reported, not reached**. They are the one out-of-lane item this bundle leaves standing.

### A5. Whether anything is waiting in production right now

Not readable from here (the local `.env` is the placeholder project `example-ref`; nothing in
this repo can reach production). **One query answers it in thirty seconds, in the Supabase SQL
editor:**

```sql
select 'decal' as kind,
       coalesce(p.email, d.user_id::text) as who,
       d.submitted_at as waiting_since
  from public.greenline_decals d
  left join public.profiles p on p.id = d.user_id
 where d.status = 'pending'
union all
select 'track',
       t.author_name,
       t.created_at
  from public.greenline_tracks t
 where t.status = 'pending' and not t.removed
 order by waiting_since;
```

Every row is a student waiting. An empty result is the good answer.

### A6. Counts, before

`npm run verify:counts`: **106 specs over 53 routes, 83 /dev pages, 212 runs**, region already
current. Measured region: `covered` **103** route specs, `runsMeasured` 206, sha
`c7f57b9`, 3 unmeasured specs (the three `themes*`).

## Phase B: what was built

Nothing in the pipeline needed fixing, so B1 is the tests. Everything else is the app layer.

- **`src/lib/greenline/moderation.ts`** is new and is the ONE reader of "what is waiting on a
  teacher" (`loadGreenlinePending`, `pendingLabel`, `pendingBreakdown`). Two spellings of that
  count is how a badge comes to read zero over a queue with three rows in it.
- **`/greenline` offers staff a MODERATION entry carrying the count.** `+page.server.ts` asks
  `isAdmin` and passes `onModeration` only for an admin -- absence is the mechanism, as
  everywhere else in this codebase, and the counts are not read at all for anybody else (under
  RLS a student's own read would answer about their own rows, which is a meaningless number and
  not one any surface should render).
- **`/greenline/moderation` now carries BOTH queues.** The decal queue is the same
  `DecalReviewQueue` component wired to the same `greenline_decal_review` RPC, with its images
  signed server-side on the CALLER's own client (never a service-role one). The dashboard's copy
  is untouched: two doors onto one queue, not two queues.
- **Zero is said out loud, on both.** The track panel appended its pending clause only above
  zero, so a broken count and an empty queue printed the same string; both panels now carry a
  deliberate empty state at ordinary copy contrast rather than in the faint tone a failed load
  uses.
- **The student is told, in words, on the page.** A pending or sent-back track renders
  `.gg-track-review` under its own tile, carrying the teacher's own sentence in quotes for a
  send-back. The words never say "rejected", "denied" or "refused" -- `0051`'s "never a blunt
  reject" is a rule about copy as much as about data, and the browser spec asserts those three
  words are absent.
- **`--glb-ink-dim` for `.gg-decal-note`**, at the call site rather than by raising
  `--glb-ink-faint`: that token paints tertiary decoration across the whole GREENLINE room, and
  raising it would repaint all of that to fix one sentence. 3.52 -> **7.02:1**.
- **44px floors**, always as `min-height` so the floor can only round up, on
  `.tm-btn`, `.tm-sort`, `.gdq-btn`, `.gg-pattern`, `.gg-track-act`, `.tt-builder`,
  `.tt-feedback`, `.tt-gear` and the new `.tt-moderation`. None of these surfaces declares an
  instructor-only density class, so `IDEA_INTERFACE_STANDARDS` 10 gives them no 24px exception
  at any width; every row involved already wrapped, so the cost is row height (step 1 of the
  standard's own order) rather than an overflow.

### B4. Tests, and the three controls

`tests/db/greenline-moderation-pipeline.test.ts`: **20 tests**, both roles through both flows on
the real migration chain (`0001`, `0003`, `0020`, `0049`-`0052`, `0054`-`0059`, `0067`,
`0137` last).

Three positive controls, each a **permissively mutated** copy of the real gate applied to its
own database:

1. **Decal approval predicate opened** (`using (true)` on the approved policy and the storage
   read) -> another student reads a pending row AND its image. The real database answers 0 and 0.
2. **Track visibility predicate opened** (`using (not removed)`, and a list RPC with the status
   filter removed) -> a pending track is selectable and lists. The real database answers 0 and `[]`.
3. **`is_teacher()` removed from both review RPCs** -> a `@boscotech.edu` account with no
   `app_admins` row, and a plain student, both approve. The real database raises for both.

**The controls were themselves controlled.** With `withOpenedGate` neutered so it applies no
SQL, exactly the three control tests failed and the other 17 passed -- so each is measuring the
gate and not the fixture. The test file was restored from a `cp` copy and md5-checked identical
(`a34c82d1a0dc9a4ee05178c73c2f2156` before and after); `git checkout --` was never run on
anything.

### B5. Browser proof

Seven new specs, `tools/browser-verify/routes/greenline-portal*.mjs`, at 375 and 1440:
the title screen's staff entry, the queue empty, the queue with one track and one decal, and the
student's three track states plus their decal state (aliased onto the same seeded URL, because
the track picker and the livery panel are two tabs of one page and a run measures one DOM state).

The states are reached by a new `?seed=pending|rejected|approved` on `/dev/greenline-portal`
that calls the harness's OWN store functions -- `devPublish` (the real client-side validator the
publish endpoint gates on), `devReview` (the same function the panel's buttons call), and the
real `handleDecalUpload` on a real `File` built from a canvas through the real
`validateDecalFile`. A seed that assembled state directly would be a fourth definition of what
"pending" means.

**14 route/width runs, 202 measurements, 0 outside threshold.** Selected measured values:

- Tap targets, smallest min-dimension per group: track decision controls **63x44** (0/4 under),
  queue sort **109.1x44** (0/4), decal decision **68.7x44** (0/2), livery and decal controls
  **58.2x44** (0/10), per-track actions **56.4x44** (0/2), the moderation entry **241.9x44**,
  TRACK/PIECE EDITOR **167.3x44**, SEND FEEDBACK **106.4x44**, the gear **44x44**.
- Contrast: the review sentence's lead line **15.57:1**, its explanation **6.63:1**, the
  teacher's quoted note **15.57:1**, the IN REVIEW / CHANGES ASKED chip **10.82:1**, the empty
  track queue's lead **17.97:1**, the empty decal queue's lead **16:1** and its sentence
  **7.78:1**, the moderation count line **6.85:1**, the MODERATION label **4.55:1**, the amber
  count beside it **10.87:1**, the decal PENDING REVIEW chip **8.72:1**, its sentence **7.02:1**.
- Horizontal scroll 0px at both widths on all seven; 0 console errors on all fourteen runs.

**Two instrument facts worth carrying forward, both measured rather than reasoned.**

1. **`waitForApp` returns long before the Garage exists.** The first version of the three garage
   specs clicked the tab immediately, and `clickUntil` does NOT retry a selector matching
   nothing -- it reports `0 matched, 0 attempt(s)` and moves on -- so every row after it
   described a screen the run never reached, and it did it while printing 50 honest-looking
   "no match" measurements. A probe found the tab strip present at 6s and absent at 3s. The fix
   is a `waitFor` BEFORE the click; it now reports **464-585ms** on a warm server. A click step
   whose selector can be late needs a wait in front of it, always.
2. **The title screen's entrance cascade is real and read as a defect.** `.tt-builder` starts a
   `both`-filling fade at 1.14s, so at 375 (the cold, first-visited width) both editor entries
   measured `present but NOT visible (opacity:0)` with correct 44px boxes. Cancelling the
   animation is the wrong repair -- it freezes at frame one and manufactures the same reading --
   so the spec waits on the elements' own computed opacity, which reports **1477ms** and stays
   correct whatever the delays become.

The new rows were put to live defects rather than assumed to bite: `--break tiny-taps` reddens
**24** measurements across these seven specs and `--break low-contrast` reddens **34**.
`--break blank-text` reddens 0, correctly -- that preset is scoped to `.gt-tm p, footer p`
and cannot reach these routes.

### B6. Counts, after

`npm run verify:counts`: **113 specs over 54 routes, 83 /dev pages, 226 runs** (from
106/53/83/212: +7 specs, +1 distinct route, +14 runs). The measured region was regenerated by a
full `npm run verify:readme` pass on a clean tree; `covered` and `runsMeasured` move by the same
+7 and +14.

### B7. Suite and check

`npx svelte-check`: **0 errors, 37 warnings**, breakdown **31** `state_referenced_locally` /
**5** `css_unused_selector` / **1** `perf_avoid_nested_class`. Baseline held; nothing moved.

`npm test`: **277 files, 5678 tests**, run at **13:02 PDT on 2026-09-05** (America/Los_Angeles),
272.04s. On the first run 2 tests in `tests/derived-numbers.test.ts` failed, both of them the
stale measured-README region naming the seven new specs as never measured -- which is that
test's job and is resolved by the `verify:readme` regeneration in B6.

## What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the placeholder
  `example-ref`; no migration was applied, no RPC called, no production row read. A5's query is
  offered for a person to run, not a result.
- **No signed-in surface was driven in a browser.** `/greenline`, `/greenline/moderation` and
  `/dashboard` all need a real Bosco Tech Google session. Every browser number above is from
  `/dev/greenline-portal`, which mounts the real components over an in-memory store. The
  route-level chrome added to `/greenline/moderation` (its heading, its count line, its two
  section headings) is therefore **type-checked and reasoned about but not measured**; the
  harness mirrors the arrangement with its own headings, which is not the same thing.
- **The dashboard's decal queue was not re-measured after `.gdq-btn` took the 44px floor.** The
  component is shared and the change can only grow those controls, but `/dashboard` has no dev
  harness and is outside this lane.
- **`prefers-reduced-motion: reduce` was not exercised.** The harness runs at `no-preference`.
  `.tt-moderation`'s entrance sits inside the existing `no-preference` block and is at full
  opacity with no transform in the base state, like every other element there, but that was read
  from the stylesheet rather than measured.

## Left undone, and deliberately

- **`/dashboard`'s Community Track Moderation card still has no pending count**, and its copy
  still describes the pre-`0059` model. It is the single highest-value remaining fix for the
  problem this bundle is named after, it is three lines, and it is outside this lane. Whoever
  owns `src/routes/dashboard/**` next: the count is `loadGreenlinePending` from
  `$lib/greenline/moderation.ts`, already written and already the one implementation.
- **A rejected track stays in the teacher's list forever**, because resubmission mints a new row
  (A2 step 5). Nothing is broken; the queue simply accumulates. Whether a rejected row should
  age out, and after how long, is a product decision with a migration behind it.
- **No `data-testid` on the `/greenline/moderation` route chrome.** The harness's headings carry
  them; the real route's do not, because nothing can drive that page yet.
