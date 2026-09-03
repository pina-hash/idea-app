---
title: Six answered Foundry decisions, three reports, and 0173
date: 2026-09-03
branches: ["claude/foundry-decisions-cluster-m9d917"]
migrations: ["0173"]
subsystems: ["foundry", "classroom", "home"]
---

Prompt 0015. Mr. Pina answered six standing decisions on 2026-09-02 and this
bundle builds four of them (01, 03, 05, 06, 07 -- two of the six were excluded
by the prompt itself), plus three reports on the same surface.

### The audit found three of the reported gaps already built

The prompt warned that on 2026-08-31, four out of four "add X" items in this
repository turned out to already exist and be unreachable. Three of the four
things audited here were the same case, and saying so is most of the value:

- **"No way to test whether a game works before publishing"** is FALSE and was
  already false. `/foundry/preview/<app>/<version>/<path>` is a complete route
  with a 60-line header explaining why it answers on the portal origin;
  `foundryPreviewUrl` and `foundryPreviewable` are in `bundle-url.ts`;
  `tests/foundry-preview-control.test.ts` pins the control on BOTH surfaces,
  including that it must never become status-gated. `FoundryMine` renders "Run
  a preview" on every version row and `FoundrySubmit` offers it the moment
  ingest succeeds. Nothing was built for this and nothing needed to be.
- **"No obvious way to manage, edit or delete a game from the gallery as
  admin"** is also already closed. `FoundryGallery` takes a `staffHref` prop
  whose own comment describes exactly the reported symptom ("the controls all
  worked and the only way to reach them was to know the slug and type it"), and
  `/foundry/+page.svelte` derives and passes it. Verified wired, not just
  present.
- **The owner telemetry (decision 07)** was half built: `FoundryPlayStats` is
  mounted per app on `/foundry/mine` with the real `foundry_app_play_stats`
  transport, and nothing owner-only reaches the public gallery -- the public
  read is `foundry_play_counts`, which returns `plays` and `plays_7d` and
  nothing else, while `players`, `seconds_played` and `last_played_at` sit
  behind an owner-or-admin gate that returns NULL (the same answer a
  nonexistent app gives) to everyone else. What did not exist was the roll-up
  across a student's apps.

**The scrolling open game was real.** `FoundryGallery` and `ReviewQueue` both
mounted `ClassSplit` at `scroll="page"`, under which neither pane bounds
itself, so scrolling the card list carries a running app off the top.

### 0173, three decisions in one migration

`supabase/migrations/0173_foundry_section_gate_description_and_trust.sql`,
committed straight to `main` at `8c3ede6` with its test in the same commit.

**Decision 01, the class gate.** `classroom_sections` gains `foundry_closed_at`
/ `_by` / `_note` -- the stamp shape `student_apps.hidden_at` already has one
table over, so NULL is open and every existing section is open with no
backfill. `foundry_section_access()` answers for the caller and ANY closed
section they are actively enrolled in closes it. The alternative reading (every
section must be closed) makes the control useless for the case it exists for,
since any other period would overrule the teacher who pressed it. An admin is
never locked out. The toggle is a SECTION MANAGER's, not an admin's, because
the point of the decision is that the teacher standing in the room does not
have to find an administrator.

**Decision 05, a description at publication.** The gate is the trigger, which
is the schema: four paths write `published_version_id` (review approve,
rollback, the trusted auto-publish, and any raw write) and the trigger is where
all four meet. It fires ONLY when the publication actually moves --
`tg_op = 'INSERT'` or the column genuinely changing -- so an app already live
without a description keeps serving, stays editable, and stays rollable to the
build it is already on. A gate that fired on every write of the row would make
existing student work uneditable, silently, which is the narrowing failure this
repository has been bitten by. Nothing was rewritten and nothing deleted: the
migration counts the live apps with a blank description and reports the number
with `raise notice`, so the decision about those rows is a person's, with the
count in front of them. `foundry_submit_version` asks the same question ahead
of the trigger, so the person who can fix it hears it while they are looking at
it rather than days later in front of a reviewer.

**Decision 06, trusted publishers.** `foundry_trusted_publishers` mirrors
`app_admins` and `gauntlet_authors` column for column, RLS on with no policy
and no grant. A trusted author's submit goes to `approved` with
`auto_published_at` stamped and `reviewed_at` null, and the app publishes in
the same statement.

- **Not a sixth status.** `approved` already means "this may be published", and
  a new one would fork every status check in the feature. A STAMP beside the
  status answers the queue's question -- was a person asked before this went
  live -- without any existing predicate changing meaning.
- **`foundry_list_apps` projects `live_unreviewed_version_id`**, gated on
  owner-or-admin exactly as `submitted_version_id` is, because `queueOrder`
  filters on `submitted_version_id` and an auto-published version never has one.
  Without it, trust would have been a door student work goes through and a
  reviewer never hears about.
- **The order of the two writes on an after-the-fact reject is load-bearing.**
  `_foundry_version_status_check` refuses `approved -> rejected` while that
  version is what the app publishes, so the app is moved off it FIRST. Written
  the obvious way round the whole rejection raises, and it raises only for a
  trusted author -- the path nobody exercises by hand. Found by reading the
  trigger, not by hitting it.
- **It rolls back rather than blanking** where an older approved version
  exists, so a student whose new build is rejected keeps the working one on the
  gallery.

### The reconstruction that would have shipped a privacy regression

Section 4 of 0173 re-signs `foundry_list_apps` (a `returns table` cannot gain a
column through `create or replace`). The first draft of that section was typed
from memory of what the function does. Diffed against 0132's actual text it had
**dropped `submitted_version_id`'s `owner = auth.uid() or is_admin()` gate**,
the `auth.uid() is not null` clause, and the `created_at` tiebreaker in the
`order by`; and it had rewritten `foundry_get_app` into a different function
with a different signature (1 parameter instead of 3, `sql` instead of
`plpgsql`, and none of the privileged-versions payload). Applied, it would have
told every student which apps have something sitting in the review queue, and
broken the app detail page outright.

Both functions in the file that shipped are 0132's text with ONE insertion
each, produced by patching the source with a script that asserts its anchors
and printing the diff. That is what "when re-signing a function to change one
term, DIFF IT AGAINST THE SOURCE" is for, and it is the single most valuable
thing this session did.

### Decision 03: the launcher card

The Foundry card read `--acc-primary: var(--green)`, on the stated grounds that
/foundry is built on the portal console register so green and cyan "ARE its
colours". Both halves were wrong.

- **Green is a state in that room, not the room.** `forge.css` opens by saying
  what the identity is -- "near-black with a faint WARM cast, worked metal
  under a banked fire ... the warmth is the room's identity" -- and spends
  `--green` on `--fg-st-done-ink` (approved) and `--fg-st-live-ink` (live).
- **And green cannot identify anything on that page.** GAUNTLET `#00ff41`,
  VANGUARD `#00ff41`, GREENLINE `#2ae57e` and dashboard/admin `#78b870` were
  already spending it, and `--green` resolves to `#78b870` -- so the Foundry
  card and the admin card were painting the same hex.

The old comment refused this change in advance, on the grounds that heat means
IN PROGRESS in that room. That rule is `forge.css`'s and it governs `.fg-root`,
where a chip wearing heat has to mean "submitted". A launcher card is not in
the room and cannot even read `--fg-*`. The launcher already quotes two in-room
STATE colours as out-of-room identity: `#2ae57e` is GREENLINE's surgical player
thread and `#c8ff00` the Ledger's legendary rank treatment, and on a card each
simply means "that app". A colour is a state where the state language is
defined; outside it, it is a name.

So the pair is the pour: `--fg-heat` `#f6952f` cooling to `--fg-heat-ember`
`#c65a1d`, re-typed as hex because `var(--fg-heat)` resolves to nothing outside
`.fg-root` -- which is also why the old test's "no hex literal" clause could
never have been the general rule it was written as.

**Measured on the real grounds** (composited and read back, not eyeballed):
`#f6952f` as text is **7.83 / 6.66 / 6.25** on `--bg0` / `--bg1` / `--bg2`, so
`--acc-ink` is not re-pinned. The card edge (`--acc-edge`, the identity at 75%)
reads **4.89:1** against the page, past the 3:1 a boundary carries and slightly
better than the green it replaces at 4.81. `#c65a1d` (3.51 on `--bg1`) paints
no text and no boundary: `--acc-secondary` is read at exactly one place in
`AppLauncher.svelte`, the gradient strip.

The rationale in `tests/home-order-and-accent.test.ts` was rewritten in the
same commit. It now reads the two values out of `forge.css` rather than
restating them, and pins the collision as a PROPERTY (no card may paint
`#78b870` as its primary, and the four-green census is asserted) rather than as
the one pair that happened to have it. Both new assertions were verified to
redden with the green pair put back, and the file restored md5-identical.

### The scroll fix, and why `fill` rather than sticky

`FoundryGallery` and `ReviewQueue` move to `scroll="fill"`, with `.cr-app` on
`.fg-root` (conditional on the route, the classroom layout's own pattern, not a
second one) and `.cr-app-body` in `FoundryShell`. `split.css` records that a
sticky, internally-scrolling detail pane was tried and rejected -- correctly,
for the notebook, whose compose pane measures ~1200px and would have answered a
report about two scrollbars with two scrollbars. That argument does not reach a
pane whose content is a fixed-size stage somebody is watching. `fill` names no
chrome height, so a wrapped wordmark costs a row instead of producing a second
scrollbar, and below 1024px it is page-flow exactly as before.

`FoundryMine` deliberately stays on `page`: its detail pane is a long metadata
form, which is the notebook's case.

### Verification

- **Full suite: 233 files, 4813 tests, 0 failures.**
- **`svelte-check`: 0 errors, 37 warnings**, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- the baseline, re-derived
  after `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported.
  An intermediate draft of `FoundryClassAccess` read 38: a `$state` mirror of a
  prop with an `$effect` copying it back. That shape also discards a fresh load
  whenever the click and the effect race, so it was replaced with an overlay
  keyed by section rather than suppressed.
- **`tests/foundry-section-gate-trust.test.ts`: 25 assertions** against the real
  migration chain. **Nine permissive mutants, every one bites** -- the manager
  check opened, the closed-section read emptied, the publish precondition
  removed, the submit-side message removed, everybody trusted, the roster's
  admin gate removed, the queue projection's owner-or-admin gate opened, the
  grant's admin gate removed, and the reject take-down written the obvious
  (wrong) way round. Restored from a COPY after each (never `git checkout --`,
  which is a discard-to-HEAD) and md5-verified identical.
- **Browser: `/dev/foundry-admin` at 375 and 1440, 58 measurements, 0 outside
  threshold.** Contrast on the forge plate: refusal sentence 15.4:1, instructor
  note 14.59, section title 14.59, Open chip 7.97, Closed chip 5.26, trusted
  address 14.59, roll-up figure 9.03, coverage sentence 6.99. Tap targets:
  section controls 104.2x44, roster controls 130.1x44, roster fields 293x67.7
  at 375. No horizontal scroll at either width. Chromium 141.0.7390.37;
  `--probe` reports screenshots, rAF, IntersectionObserver and ResizeObserver
  all working, so this container is NOT the `mcp__Claude_Browser__*` pane the
  traps section describes.
- **Positive control on the scroll fix:** with `FoundryGallery` reverted to
  `scroll="page"` the probe returns `["pane-not-scrollable"]` at 1440 and the
  row fails; at 375 it correctly stays `ok`, because page-flow below the
  breakpoint is the design. File restored md5-identical.
- **Counts block regenerated** with `npm run verify:readme` (no
  `--no-selftest`, no hand edits): 66 -> 67 specs, 37 -> 38 routes, 69 -> 70 dev
  pages, 132 -> 134 runs, 1738 -> 1796 measurements, 313.6s, selftest 64
  controls / 0 failures. The tool rewrote only lines 32 to 54, inside the
  markers at 31 and 55. **Outside threshold is unchanged BY IDENTITY:** the
  same four rows before and after (`/dev/pathways` tap-target at both widths,
  `/dev/coins-signedin-1` and `/dev/coins` horizontal-scroll at 375). None is
  this bundle's.

### Not verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder (`example-ref`), and this container has a docker BINARY but no
  daemon and no WSL, so the local stack was unavailable and `/dev/login` could
  not be used. 0173 has never been applied to a real database; every claim
  about it comes from the embedded-Postgres harness.
- **No signed-in surface was driven.** `/foundry`, `/foundry/classes`,
  `/foundry/mine` and `/foundry/review` all need a real Bosco Tech Google
  session. What was measured is `/dev/foundry-admin`, which mounts the same
  components with in-memory transports.
- **The trusted-publisher and section-closed paths were never exercised
  end to end in a browser** -- only in SQL and in the harness.

### Claims in the prompt that were wrong

- Prompt 0014's `FOUNDRY_LIMITS` change (75 MB / 110 MB) is on
  `origin/integration`, **not on `origin/main`**, so this checkout carries the
  pre-0014 values. The constant was not touched either way.
- `/dev/notebook` @375 and `/dev/gauntlet-shell-countdown` @1440 are named as
  "known flaky". Neither appears in the outside-threshold set before OR after
  this bundle's run.
- 0172 was still unwritten at session start and landed on `main` mid-session
  (`07a8ff2`, the maps prompt), which is why 0173 had to be rebased onto it.

### A file outside this bundle's declared ownership was edited

`tests/notebook-shell.test.ts` maintains a `KNOWN_UNREVEALED` list of
page-flow splits that do not reveal their detail pane, with three of the six
entries labelled "foundry lane owns it" and the length pinned at 6. Moving
`FoundryGallery` and `ReviewQueue` off page-flow reddened two of its
assertions, and its own failure message is the instruction: "`...` is no
longer page-flow; drop it from the list." The two entries were removed and the
pin moved 6 -> 4; `FoundryMine` stays. The edit is the one the test prescribes
and nothing else in that file was touched, but it is outside the declared file
list and is flagged here for that reason.

### Deferred, and for whom

- **Decision 01's control belongs on the classroom section page**, beside
  everything else somebody manages about that class. `src/routes/classroom/**`
  is outside this bundle's files, so it is mounted at `/foundry/classes`
  instead, listing exactly the sections the caller manages. Moving it is a
  one-line mount in a bundle that owns the classroom.
- **The trust roster is keyed by email and cannot be keyed by app.** The
  obvious control is "trust this author" on the app an admin is reading, but
  these surfaces deliberately never carry an author's address, so a per-app
  control needs a uuid-to-email lookup reachable from a client -- the school
  directory this repository refuses outright. Closing that gap properly means
  an RPC taking an app id and resolving the address inside the definer, which
  is a migration.
- **ANY-closed-closes-it is a judgement Mr. Pina should confirm.** A student in
  six classes is locked out of the Foundry if one teacher closes it. It is the
  only reading under which the control does its job during a class period, but
  it is a decision about students in other people's rooms.
- **Decisions 02 and 04 go back to Mr. Pina**, per the prompt: 02 names an RLS
  policy that exists nowhere in the migrations, and 04's default is refused in
  `FoundryGallery.svelte`'s own header in words ("opening the gallery on a
  popularity ranking would put the same handful of apps at the top of the page
  every day of the year, which is a decision about whose work gets seen and not
  a default") -- verified present and current.

### Applying 0173 by hand

`supabase db push` is never run on this project. Paste the ONE file into the
Supabase SQL editor:

```
supabase/migrations/0173_foundry_section_gate_description_and_trust.sql
```

It is a single file and applies in one paste; there is no ordering within it to
get right, and re-pasting it is harmless (`if not exists`, `create or replace`,
and a `drop ... if exists` ahead of the one create that needs it).

**A correct notice pane looks like this**, with the numbers being that
project's own:

```
NOTICE:  0173: 14 section(s) gained the Foundry gate, all OPEN (foundry_closed_at is null).
NOTICE:  0173: trusted publisher roster created, 0 row(s).
NOTICE:  0173: 3 PUBLISHED app(s) currently have no description.
NOTICE:  0173: those 3 keep serving and keep their published version. What they
         cannot do is publish a NEW version until somebody writes a description.
         NOTHING WAS REWRITTEN.
```

The third line is the one to read. It is a COUNT and not an action: those apps
keep serving and keep their published version, and the only thing they cannot
do is publish a new one until somebody writes a description. If it reads 0,
there is nothing to chase. **If the third and fourth lines are absent
entirely**, the `raise notice` block did not run and the apply did not complete.

**Then re-run 0137's sweep.** Every `create or replace` in this file lands under
the project's default privileges, which hand each function a fresh `anon`
EXECUTE grant; 0173 revokes by name for the functions it creates, but
re-applying `0137_anon_execute_sweep.sql` afterwards is the standing rule for
any migration applied by hand after the chain.

**There is no deploy ordering to get right.** `foundry_list_apps` gains a
column but its ARGUMENT LIST does not move, so PostgREST resolution is
unaffected and a client that does not read the new column carries on. Every
client-side reader treats `live_unreviewed_version_id` as optional and the
`/foundry` layout degrades `foundry_section_access` on `PGRST202` alone, so the
deployed app is correct both before and after the apply.

**What undoes it** is written at the top of the file itself, as the standard
asks: the drops in reverse order, then re-pasting 0132's `foundry_list_apps`
and `foundry_get_app` and 0130's `_foundry_published_version_check`,
`foundry_submit_version` and `foundry_review_version` over the top.
