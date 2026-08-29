---
title: "Every surface can report its own defects (code only, no migration)"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["FRC / FSP / feedback"]
record_order: 97
---

One shell mount, one exclusion registry, the first error boundary in the repo,
the first `handleError`, a rebuilt admin console with filters and two exports, a
new dev harness, and one test file. Nine per-page feedback mounts removed.

### WHAT WAS ACTUALLY WRONG

The feedback subsystem was already here -- `app_feedback` (0053), its moderation
status and admin RPCs (0085), `src/lib/feedback/`, and an admin console. It was
wired to **three surfaces**: GREENLINE's own menus, the classroom (through a
`ClassroomFeedback` footer button mounted by seven components), and the console
itself. Everywhere else in the portal -- the notebook, GAUNTLET, the coin desk,
tournaments, FRC, the homepage -- had nowhere to say anything.

The deeper defect was the SHAPE of that wiring, not its coverage number. Every
mount was a decision somebody had to remember to make, so coverage could only
ever describe the routes that existed when someone last thought about it. A
route added next month starts silent.

Three smaller things came with it:

- **`meta` was whatever each caller felt like attaching.** The classroom sent
  `{section_id, section, tab, kind}`, GREENLINE sent its screen and track. There
  was no route, no role, no viewport, no time and no build on any of them.
- **There was no `+error.svelte` anywhere and no `handleError`.** A failed load
  fell to SvelteKit's default page: outside the app's chrome, carrying nothing,
  with a server log line nobody could tie to the report filed about it.
- **The console's New / Seen / Resolved buttons measured 22.9px**, under even the
  24px absolute floor, because they were `.btn.secondary.tiny`.

### COVERAGE COMES FROM THE SHELL

`SiteFeedback.svelte` is mounted once, in `src/routes/+layout.svelte`. There are
**no layout resets anywhere in `src/routes`** (no `+page@`, no `+layout@`), which
is what makes that mount total: the root layout wraps every page route, so a new
route inherits the affordance rather than having to remember it.

**The rejected alternative is mounting it per page**, and the test reddens if it
moves back to one: `tests/feedback-coverage.test.ts` sweeps every `+page.svelte`
on disk (124 of them), asserts no reset file exists, asserts the root layout
mounts the component, and asserts no non-dev page route carries a shell-placed
mount. Driven: the mount was removed from the layout and added to three pages
instead, all four files hash-verified before the run and restored
byte-identically after -- **3 assertions reddened**, and they are exactly the
three coverage claims.

The nine per-page `ClassroomFeedback` mounts were **removed rather than left
beside the shell one**. Two controls on the same page writing the same table is
the duplication the shell mount exists to end; `ClassroomFeedback.svelte` and
`classroomFeedbackSubmit` are gone, and `feedbackWriter` in
`src/lib/feedback/feedback.ts` is the ONE bound writer.

### AN EXCLUSION IS BY CATEGORY, AND IT RELOCATES

`FEEDBACK_EXCLUSIONS` in `src/lib/feedback/context.ts`, matched on ROUTE ID so a
page added under an excluded section inherits the exclusion the same way a new
route inherits the mount:

| category | what it covers | where the control went instead |
| --- | --- | --- |
| `deck` | the projected deck stage, and its harness | the deck viewer's own bar, via a `controls` snippet |
| `gauntlet` | all of `/gauntlet` | the VIEWPORT layout's footer, on every gauntlet page |
| `greenline` | `/greenline` only | GREENLINE's own title / garage / race / results menus (already there) |
| `vanguard` | `/vanguard` | nothing today -- see below |
| `error` | asked with the status flag, not by route | the error page's own panel, prefilled |

- **The whole GAUNTLET section, not just the timed runs.** The VIEWPORT owns its
  own chrome and a portal-styled pill floating in it is off-brand as well as in
  the way. The footer renders on every `/gauntlet` page, so the relocation has
  exactly the coverage the exclusion does. **Not the FeatureManager rail**: it is
  hidden by default and `display:none` below 1440px, so the only affordance on a
  phone would be no affordance.
- **`/greenline` only, not the builders.** The track and piece builders are
  ordinary pages with ordinary chrome and keep the shell control.
- **The `vanguard` rule excludes nothing today, on purpose.** VANGUARD is served
  as legacy HTML from a `+server.ts` and renders no layout at all, so there is
  nothing there to float over. The rule stands so a VANGUARD surface that DOES
  render the shell inherits the exclusion rather than discovering it in front of
  a class.
- **A category with no `relocatedTo` is an exclusion that deleted the control**,
  and the test refuses one.

`GREENLINE` was added to the registry although the brief named only three
categories. It already relocates its own box into its own menus; without the
rule the shell would have floated a second, worse control over a live 3D race.

### REPORT, DO NOT FIX: WHAT RENDERS NO LAYOUT

These serve HTML a person reads and never render a Svelte layout, so the shell
mount cannot reach them. Named here and left alone:

- `src/routes/vanguard/+server.ts`
- `src/routes/assignments/[slug]/+server.ts`
- `src/routes/frc/[domain]/[unit]/quiz/+server.ts`
- the dev endpoints: `src/routes/dev/coins/+server.ts`,
  `src/routes/dev/ai-level-badge-reference/+server.ts`,
  `src/routes/dev/classroom-deck/f/[deck_id]/[...path]/+server.ts`
- `src/routes/admin/drive-connect/callback/+server.ts` and
  `src/routes/api/classroom/deck/[deck_id]/[...path]/+server.ts` (bytes and a
  callback, not pages)
- everything under `static/`, which the app never renders at all

Serve-time injection is the convention for adding anything to legacy HTML, so
VANGUARD is reachable in principle. It is not done here: it needs a session in a
page that has none, and the brief said to name it and leave it.

**Superseded.** Neither is still true, both by the same later bundle (VANGUARD
achievements sync and report a problem). `src/routes/vanguard/history/+server.ts`
was the standalone run-history portal page; it was retired to a bare `308` to
`/vanguard/` once the in-game RUN HISTORY panel replaced it, and that redirect
file is now gone outright -- there is no `history` route under `/vanguard` at
all. And "it needs a session in a page that has none" turned out not to be the
blocker: `src/routes/vanguard/+server.ts` now injects a REPORT control (a
"REPORT A PROBLEM" panel, opened from a button beside the IDEA link at the top
right) that reaches `app_feedback` the same way every other surface does --
signed in through `/api/vanguard-feedback` (an RLS-scoped insert performed
server-side, as the caller, because the page has a session cookie but no
browser Supabase client), signed out through the shared anonymous route. This
is a different, newer control from the game's own long-standing inline "Bug or
idea?" composer (`buildFeedbackComposer`, mounted on the title/pause/game-over
screens), which still posts to VANGUARD's own Apps Script backend and was never
connected to `app_feedback`. See the `vanguard` exclusion rule in
`src/lib/feedback/context.ts` for where that leaves the shell's own
affordance.

### CONTEXT IS CAPTURED, NOT TYPED

`captureMeta` assembles the `meta` jsonb in one place, read off the page at the
moment the box OPENS: `route` (the route id, stable across parameters), `path`,
`role`, `section`, `viewport`, `at`, `build`, plus `status`, `error` and
`errorId` when the error boundary is what asked. A field somebody has to fill in
is a field that arrives empty.

**THE BUILD IDENTIFIER IS THE HONEST PROBLEM, and it is stated rather than
papered over.** Neither candidate is a function of the built artifact:

- `deploy.sha` (`virtual:site-versions`) is the git commit the deployment was
  built FROM. Exact about the input, silent about the output.
- `$app/environment`'s `version` is SvelteKit's build id, which is a build
  TIMESTAMP. It changes on every build of identical code, so it distinguishes
  builds without identifying any of them.

`describeBuild` takes both, picks the commit when there is one, and stores WHAT
IT MEANS in a sentence beside the value -- which the console then renders beside
the value, and the markdown export carries in parentheses after it. `'dev'` (what
`deriveDeploy` emits with no history) is deliberately NOT dressed up as a commit.
A plausible-looking hex string with no provenance is read as a content hash by
the next person to open the queue, and the wrong build gets bisected.

### THE FIRST ERROR BOUNDARY

`src/routes/+error.svelte`, root only. A root boundary already catches a failure
from any page or layout load beneath it, which is the same coverage argument that
put the affordance in the root layout; a per-section error page would be one more
thing each new area has to remember.

It renders the animated mark, the status, the route, the reference id and the
version badge, and mounts the shared affordance at `place="relocated"` with the
status and route already filled in. **The shell's floating copy stands down here**
(the `error` category), so there is one control offering more rather than two
offering different things.

`handleError` in `hooks.server.ts` mints a `crypto.randomUUID()`, logs it beside
the status, method, path, route id and the error, and returns it as
`page.error.id` (`App.Error` in `src/app.d.ts`). That id is what joins a server
log line to a report filed about it, and it rides into `meta.errorId`.

- **It does nothing else on purpose.** No reporting service, no database write,
  no session read: it runs on a request that has already gone wrong, and a second
  thing that can fail inside it turns a 500 into a 500 with no log line at all.
- **The message it returns for a 500 is generic.** An internal error's own text
  can carry a query, a path or a token, and that value is rendered to the caller.
  Other statuses keep their own words.

### ONE VOCABULARY FOR SENDING

`FeedbackBox` had its own `sending` / `sent` / `error` triple. It now runs the
shared `SaveState` in `autosave: false` mode and reports through the shared
`SaveIndicator` -- the same five states, the same words, the same Retry control
as every other surface that persists work. `autosave: false` because a send MINTS
A RECORD; a debounce here would file a report per pause in someone's typing.

`submitFeedback` widened from `{error}` to `{error, retryable}`, and
`feedbackRetryable` is the classifier: **a PostgREST code means the database
considered the row and said no**; a transport failure carries no code, because
nothing on the far side ever answered. That distinction is the whole reason the
shape changed -- a refusal retried five times with backoff spends fifteen seconds
arriving at the same answer.

**`save.attach()` is deliberately NOT called.** That net exists so work in
progress survives a hidden tab; a half-written report is not work the server
should receive because somebody switched tabs, and nothing is lost by not sending
it. Teardown only.

The old test asserting `FeedbackBox.send()` cleared its busy flag in a `finally`
was **generalized, not deleted**: it now asserts the box delegates to `SaveState`,
that no private busy flag came back beside it, and that `SaveState#execute` itself
clears `#inflight` in a `finally`. Re-mutated both ways to confirm it still bites.

### THE CONSOLE

`/classroom/feedback` now reads **every app**, not `p_app: 'classroom'`.
`app_feedback_admin_list` already defaults `p_app` to null, so this is an
omission rather than a new parameter: no deploy-ordering problem, and it works
against the schema already applied.

`src/lib/feedback/console.ts` is the pure half -- facets, filtering and both
exports -- so the arithmetic is assertable with no browser and no database.

- **Filter by route (substring), role, section, date range and status.** The
  status filter takes the console's OPTIMISTIC status, so a note moved to Seen
  leaves the New list before the reload lands.
- **FILTERING HAPPENS BEFORE EXPORT**, and the ordering is the feature. Both
  exporters read `visible`, never `rows`. Mutating one to `rows` reddens.
- **The markdown bundle is sized to paste** (60k chars) and NAMES what the budget
  cut, in the file, with room reserved so the notice can never itself be the
  thing dropped. The header states the filter, so a pasted bundle says what it is
  a bundle OF.
- **JSON is verbatim**: nothing summarised away, so it can answer a question the
  markdown was not shaped for.
- **An older row with no meta still reads.** `rowRoute` falls back to the
  `context` column, so rows filed before the shell mount stay in the same queue.

**The 22.9px controls are fixed by one rule, not several.** Every interactive
control on the page carries `.fbc-control`, which is `min-height: 44px;
min-width: 44px`. One compliant control beside a non-compliant one reads as a
broken row, which is why the filter pills, the five facet inputs and the export
buttons are in the same set rather than only the three that were measured.

### VERIFIED

- **`tests/feedback-coverage.test.ts`: 47 tests**, driving the REAL component
  through `svelte/server` and the REAL pure modules. Where the expected values
  come from: the route list is read off the filesystem, the exclusion cases come
  from the registry's own `samples` (the test asserts every category is
  represented and that the sweep found something), and the console fixtures are
  six hand-written rows whose expected membership is read off them by eye.
- **Every absence assertion has a positive control.** Each excluded route is
  rendered twice -- `place="shell"` (0 triggers) and `place="relocated"` (1) --
  so a zero can never be the component rendering nothing at all. The `error` case
  uses the SAME route as the "not excluded" control (`/notebook`), so the flag is
  provably what does the work.
- **Mutation proof, permissive direction, 7 mutations**, each verified applied by
  a changed md5 AND by grep before the run, each file restored byte-identically
  and re-verified after. Zero reddened would have been a failure of the proof;
  none was:

  | mutation | reddened |
  | --- | --- |
  | `feedbackExclusion` answers "not excluded" for every route | 9 |
  | the control renders with no transport behind it | 1 |
  | every filter admits every row | 7 |
  | every failure treated as retryable | 1 |
  | markdown export reads the whole load, not the filtered set | 1 |
  | the console tap-target floor drops back under 24px | 1 |
  | the markdown budget truncates silently | 1 |

  Plus the rejected alternative (shell mount removed, three per-page mounts
  added, four files): **3 reddened**, restored byte-identically. And two on the
  generalized stranding assertion: `SaveState` clearing in-flight outside the
  `finally` (**1**), and a private busy flag returning to the box (**1**).
- **Driven in a real browser** at `/dev/feedback`, both viewports, measured:
  - **1440x900**: shell trigger `164.3 x 44.0` at `position: fixed`, `z-index:
    90`, 27px from the right edge and 12px from the bottom; hit-test at its
    centre resolves to its own label, so nothing covers it; document
    `scrollWidth` 1440, no horizontal scroll.
  - **375x812**: `164.3 x 44.0`, 12px from both edges, the word still beside the
    glyph, `scrollWidth` 375.
  - **The exclusion table, all 9 cases**: 8 excluded categories at 0 shell
    triggers and 1 relocated trigger each, and the `/notebook` control row at
    1 and 1.
  - **A send that lands**: `meta` read back off the sink carried route, path,
    role, `viewport: "1440x900"`, an ISO `at`, and the build object with its
    `means` sentence.
  - **A refusal**: `failed` at 216ms with the server's message and a Retry
    control (`58.4 x 44.0`), and it stayed `failed` for 4.2s of sampling with no
    "Retrying (attempt N of 5)" ever appearing.
  - **A network failure**: attempts observed at 111ms, 1001ms, 2803ms, 6208ms and
    12806ms -- gaps of 890 / 1802 / 3405 / 6598ms against the 800 / 1600 / 3200 /
    6400 curve plus the harness's own 180ms -- then `failed`. The two outcomes
    are visibly different, which is the point of the shape change.
  - **The console**: 15 interactive controls, ALL carrying `.fbc-control`,
    minimum height **44.0px** (was 22.9px), minimum width 69.6px, zero under 44
    at either width; no horizontal scroll at 375px. A role filter narrowed
    `2 of 2 shown` to `1 of 1`, and BOTH exports then carried one report and
    named the filter in their headers.
- **The error boundary was driven by a REAL load failure**, not described.
  `/dev/feedback/boom?raw=1` throws from its load. The page rendered in the app's
  chrome with `Status 500`, `Page /dev/feedback/boom`, and
  `Reference 2d2905d5-81fa-467d-852d-c848fe9d6879` -- **the same id the server
  log line carried**, checked in the dev server's output. `0` floating shell
  copies on that page. The generic message was shown, not the thrown text.
  A report filed from it carried `status: 500`, `route: /dev/feedback/boom`,
  `errorId` matching the Reference on screen, and the build stamp from this
  repo's real history (`dfbc473`, `git-commit`).
- **`npx svelte-check`: 0 errors, 36 warnings** (the baseline, unchanged).
  **`npx vitest run --no-file-parallelism`: 72 files, 1793 passing.**

### NOT VERIFIED, and why

- **The live Supabase project.** The local `.env` is the placeholder
  (`example-ref`). No migration ships here and no RPC signature changed, so there
  is nothing to apply; the console's widened read uses a parameter default that
  already exists in 0085.
- **The shell mount was measured behind a temporary local patch.** Signed out,
  `feedbackWriter` returns null and the control is correctly absent, which is the
  signed-in-only rule working. To measure the floating placement the root layout
  was patched to hand in a stub user id, driven, then restored and md5-checked
  against its pre-patch hash (`79574717...`). The same was done for the error
  page's writer (`da0de71c...`) to file a report from a real error boundary. No
  scaffolding remains; `grep` for both patches comes back empty.
- **The deck bar and the GAUNTLET footer relocations were not driven live.** Both
  sit behind `authedPrefixes`, and the deck harness needs a real zip upload the
  Browser pane cannot supply. They are asserted structurally (the named file
  mounts the component at `place="relocated"`) and the component's relocated
  placement is driven in the harness table. `/dev/classroom-deck` now passes the
  affordance into the viewer's bar exactly as the real route does, so the harness
  mirrors the whole mechanism rather than half of it.
- **Screenshots.** The Browser pane does not composite; every visual claim above
  is a measured computed-style, geometry or hit-test read, taken after injecting
  `* { transition: none !important }`.
- **The signed-out path is deliberately absent.** It needs an RLS change and a
  rate limit and ships separately. A signed-out visitor sees no control rather
  than one that fails when pressed, and the error page says so in a sentence.

**Undoing it:** revert the changed files. There is no migration and nothing
applied. The one thing a revert must not miss is that seven classroom components
lost a `submitFeedback` prop and `ClassroomFeedback.svelte` was deleted, so a
partial revert of the layout alone leaves the portal with no report affordance at
all rather than with the old footer buttons.

---

