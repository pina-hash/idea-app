---
title: "0045: the Foundry closure reaches the routes that serve bytes, and the instructor's control now says what it cannot stop (`claude/foundry-closure-reach-bcmoom`, no migration)"
date: 2026-09-05
branches: [claude/foundry-closure-reach-bcmoom]
migrations: []
subsystems: ["Foundry", "Classroom", "Testing"]
---

**NO MIGRATION.** Phase A concluded the fix needs no schema and none was
written; 0180 remains the highest number on `origin/main`. Nothing in this
bundle has to be applied by hand, and nothing in it touches `main`.

Third in the line that starts at `docs/history/foundry-section-gate-avjwzf.md`
(prompt 0015, the toggle) and continues through prompt 0042 (its scope). 0042
narrowed the closure so one closed class no longer locked a student out of five
others, and then reported the thing neither it nor 0015 had checked: **the
closure never blocked playing a game.** In 0042's words, it was a shutter on
five documents.

## What was actually broken

`/foundry` carries its gate in `+layout.server.ts`, hoisted there so a route
added under the prefix cannot ship ungated. **A route group's layout load does
not run for an endpoint.** Three of the surfaces under `/foundry` are
`+server.ts` endpoints that hand over bytes, so the gate never ran for any of
them:

| Path | Serves | Reach before | Reach after |
| --- | --- | --- | --- |
| `/foundry` (gallery) | mounts `AppStage`, runs a bundle | **blocked** | **blocked** |
| `/foundry/preview/<app>/<version>/...` | runs a student's own build, any status, on the portal origin | none | **blocked, 403 with the reason** |
| `/foundry/download/<app>/<version>` | a zip of one version, to its author or an admin | none | consults, answers open (stated) |
| `/foundry/starter` | a generated template, no app in it | none | consults, answers open (stated) |
| `/b/<app>/<version>/...` | the frame src, apps origin | none | **none, and cannot have one** |
| `/a/<app>/...` | the direct page, apps origin | none | **none, and cannot have one** |

The one that mattered is `preview`. It executes a student's own build, at any
status, on the portal origin, and it is **one press from `/foundry/mine` and
one press from a successful upload on `/foundry/submit`** -- both of which 0042
deliberately left open. So the shortest path to playing a game in a closed
class was to be the person who wrote it, and the control an instructor pressed
did not touch it.

`foundry_section_access` had exactly one caller (`+layout.server.ts:67`),
confirmed by sweep. It now has four.

## What was built

**`FOUNDRY_CLOSURE_BLOCKS` gains `preview` and gains a wider domain.**
`FoundryPlace` is `nav.ts`'s answer to "which tab is lit"; the three serve
routes are not tabs and `locateFoundry` correctly places none of them. So
`access.ts` declares `FoundryGuarded = FoundryPlace | 'preview' | 'download' |
'starter'` and the predicate answers over that. It is a **widening of the same
predicate**, not a second one: one array, one `includes`, one null-fails-closed
rule, and every existing caller passing a `FoundryPlace` type-checks unchanged.
`nav.ts` is untouched.

**The rule that decides membership is the one that put `gallery` there: a
closure blocks what RUNS a student's bundle in the portal.** Download stays
open because the route serves the author or an admin and nobody else, so every
byte it hands over is a byte that student uploaded and therefore already has --
refusing it closes no path and costs "does my work still exist", which is the
`mine` question 0042 settled. Starter stays open because there is no student
app in it to run.

**Both are wired to the set anyway**, and that is not decoration:
`foundryServeRefusal` runs the pure `includes` FIRST and returns without
opening a connection for a place the set does not name, so the two open routes
pay nothing today, and adding `'download'` to the array is the entire diff it
would take to gate one. The test proves that by doing it.

**`src/lib/foundry/serve-gate.ts`** is the one implementation: the pure check,
the RPC, and the refusal response. It takes the caller's own Supabase client as
an argument and reads no environment, so it stays in the feature's pure layer
and is drivable from a test through the PostgREST shim.

**`foundryAccessFromRpc` in `access.ts`** is the degradation ladder, moved out
of `+layout.server.ts`. It was correct inline while there was one caller; with
four, four copies of "what does an error from this RPC mean" is four things
that can stop agreeing on the one predicate where being wrong either way is a
real outage. `PGRST202` alone opens (a deployment between 0172 and 0173 is a
real state and closing there would lock every student out of a feature nobody
turned off); every other error closes.

**The refusal is a 403 with the reason, not the bodyless 404.** Every other
refusal on a bundle route is deliberately undifferentiated so an unknown app,
another student's app and a version that never unpacked look identical from
outside. **None of that is at stake here**: the student is looking at their own
app on their own shelf, and a class closure is not a secret from the class it
was applied to. What a 404 would produce is a student who thinks their upload
broke, on the one surface whose entire job is telling them whether their upload
is good. The words are `foundryClosedSentence` and `FOUNDRY_CLOSURE_LIMIT` --
the same strings `FoundryClosed.svelte` renders everywhere else.

**It runs before the viewer is resolved**, so a closed student is refused
identically for an app that exists, one that is somebody else's and an id that
is nonsense. Checking after the ownership gate would have turned the one
refusal on this route that carries a body into the oracle its 404 is careful
not to be.

**One read per request, including per subresource, and that is the honest
cost.** Gating only the entry document would leave a bookmarked
`.../index.html` ungated, which is the same defect one level down.

## The apps origin: nothing was built, and that is the answer

`/a/` and `/b/` answer on `apps.ideabosco.com`. The handlers take **no
`locals` at all** -- no session, no client -- and that is structural rather than
incidental: `@supabase/ssr` sets the session cookies with no `Domain`, verified
in `hooks.server.ts`, so they are host-only on the main host and are not sent to
the apps host. **A closure is a rule about a VIEWER, and there is no viewer on
that origin for the rule to be about.**

Priced and rejected, each with what it costs and what it fails to stop:

1. **`Domain`-scope the portal cookies onto the apps host.** This would work,
   and it is the wrong answer even though it works. It hands every published
   student bundle the portal's session tokens, which `@supabase/ssr` sets
   `httpOnly: false` and are therefore readable by `document.cookie` inside any
   app a student ships. That single failure is what the entire origin split
   exists to prevent. Rejected outright.
2. **A signed short-lived token minted by the portal, verified at the serve.**
   It reintroduces machinery five lanes removed -- `FOUNDRY_TOKEN_SECRET`, a
   mint endpoint, a per-request verify -- which `tests/foundry-bundle-url.test.ts`
   sweeps the tree for by name and reddens on, and which CLAUDE.md forbids in
   those words. It breaks the plain, stable, unexpiring address `FoundryShare`
   promises every student in writing ("anyone with it can open the app without
   signing in") and the tokenless `/b/` URL that is safe to log, screenshot and
   paste into a bug report. **And it does not stop the actual case:** a token is
   per-URL, not per-viewer, because making it per-viewer needs the identity the
   apps origin does not have. A saved link, a link a friend sent and a tab
   already open all route around it.
3. **A check at the portal-side link, or at the bundle-URL mint.** Already true
   and already shipped: the gallery is blocked, so a closed student gets no
   fresh frame and discovers no new share link from the portal.
   `foundryBundleUrl`/`foundryAppUrl` are pure functions with no viewer in them,
   so "refusing at the mint" IS the gallery refusal and is not a second lever.
   Costs nothing, stops nothing already known.
4. **A per-APP block, which the apps origin genuinely could key on.** That is
   `foundry_set_app_hidden` (0130). It already exists, it is admin-only, and it
   is a different decision: it shelves the app for everyone, including its
   author and including people in no class of yours.

**So: build nothing there.** The gate would have to be either viewer-identified
(needs a session or a signature) or app-identified (a different feature that
already exists). Neither is available without giving up the property that makes
the split safe.

## What a closure still cannot stop, exactly

- **A published app opened by its own `/a/` share link keeps running,** for
  anyone, signed in or not. That is Mr. Pina's check and the honest answer to
  it. Asserted rather than reasoned: `tests/foundry-section-gate-serve.test.ts`
  drives the real `/a/` handler with the class genuinely closed through the real
  RPC and confirms the response is byte-identical to the one it gives with the
  class open, in the same test that confirms the portal route refuses that same
  student.
- **A bundle already on screen keeps running until the student reloads.** There
  is no real-time channel to a sessionless origin, and the framed document is
  cross-origin so the portal cannot reach into it. In the gallery a mounted
  `AppStage` survives until the next navigation, at which point the load returns
  nothing. On the apps origin it survives indefinitely.
- Nothing here has a bell schedule, which stays decision 01's deferred half.

## The control tells the truth, and WHICH sentence carries which fact is a disclosure decision

The three constants in `access.ts` are extended, not replaced, and no fourth was
added (`FoundryClassAccess.svelte` renders them by name and is outside this
bundle's scope).

- `FOUNDRY_CLOSURE_EFFECT` gains the second surface: "and stops them running one
  of their own builds in the Foundry". An instructor reading only "the gallery"
  would not expect Preview to stop working.
- `FOUNDRY_CLOSURE_LIMIT` keeps what a close leaves alone and now names taking a
  copy of their own work. It drops "anything already published stays reachable",
  which was misleading on a student's panel anyway: the gallery is what made
  published apps reachable and the gallery is blocked.
- `FOUNDRY_CLOSURE_REACH` gains both hard limits.

**The two limits are in `REACH` and deliberately not in `LIMIT`, and that is the
load-bearing decision in this half.** `LIMIT` renders on `FoundryClosed`, which
is **the closed student's own refusal panel**; `REACH` renders only on
`FoundryClassAccess`, which lives behind `classroom_manages_section`. Writing "a
published app opened by its own share link keeps running" onto a closed
student's panel would hand them the way around it, in our own words, on the
surface refusing them. It is asserted in both directions: the browser spec
requires those phrases on the instructor's control and forbids them on both
student-facing panels and on the served refusal page.

The sentence still has to exist. An instructor who believes the button stops a
student playing, and finds out in front of a class that it does not, is worse
off than one who was told the limit up front.

## What was measured

**Tests.** `tests/foundry-section-gate-serve.test.ts`, 15 tests, driving the
real handlers against the real RPC on real Postgres with the real chain
applied. Full suite **269 files, 5574 tests, all passing**, run
**2026-09-05 08:36 to 08:39 PDT (America/Los_Angeles)**, 217.24s.

**`npm run check`: 0 errors, 37 warnings**, re-derived after
`svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported.
Breakdown **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`** over 20 files. Baseline exactly held.

**Mutation proof**, restored from `cp` copies and md5-verified, never
`git checkout --`:

| Mutant | Result |
| --- | --- |
| Preview route stops consulting the gate | **6 of 15 fail** |
| The ladder opens on every error (fail-open) | **2 of 15 fail** |
| Download and starter stop consulting | **2 of 15 fail** (exactly the two wiring tests) |
| `preview` removed from `FOUNDRY_CLOSURE_BLOCKS` | **the scope spec's totality assertion fails** |

Restored md5-identical in every case; the suite is green on the restored tree.

**In-test mutation, both directions**, which is what proves the routes read the
narrowing rather than agreeing with it by coincidence: dropping `preview` from
the set must let a closed student through (it does), and adding `download` or
`starter` to it must refuse one (they are), with no change to either route's own
file.

**Browser, at 375 and 1440, Chromium 141.0.7390.37.**

The refusal, served as the real bytes through a dev-only endpoint
(`/dev/foundry-admin/refusal`, 404 in production) so what is measured is the
document a student receives rather than the same sentences mounted in a shell
that route has no access to. **20 measurements, 0 outside threshold.**
Horizontal overflow **0px at both widths**. Heading **15.8:1**, the reason
**15.8:1**, what a close leaves alone **10.29:1**. Both classes named, the note
optional (one of two fixture classes left one), no `@`, and the two workaround
phrases absent.

The instructor's control, `/dev/foundry-admin`: reach sentence **14.59:1** at
the lead and **14.59:1** again at the confirm, which is now genuinely opened by
a `prepare` click rather than assumed. **The press landed in 1 attempt** ("2
matched, 1 attempt(s), predicate satisfied"), reported per width, because paint
is not interactivity and a step that "worked" through twelve dead clicks has to
read differently from one that landed. All eight required phrases present.
0px overflow at both widths; tap targets smallest 104.2x44.

**The two console rows that came back outside threshold on the first pass were
the browser restating the refusal's own 403** on the document navigation, which
the spec header already prints as `HTTP 403`. `ignoreConsole` names the status
AND that exact path, so a genuine error from anything else on a page served
under `default-src 'none'` still reddens.

**`npm run verify:counts`**: 101 specs / 51 routes / 202 runs to **102 specs /
52 routes / 204 runs**; 82 `/dev` pages unchanged. Generated region only. The
measured block is untouched and still records sha
`5aa1e223910582b46bc412562ed040a0c30cdd94`, `outside: 0`, `outsideRows: []`.

## Explicitly NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder project; no migration was applied, no RPC was called against
  production, and no claim here is about live data.
- **No signed-in browser pass.** `/foundry/preview` behind a real Bosco Tech
  Google session was not driven; the harness covers `/dev` routes only, and
  the refusal is measured through a dev endpoint serving the real response
  function rather than through the real route with a real session.
- **`npm run verify:readme`** (the full measured pass) was not run; only
  `verify:counts --static`. The measured block therefore still carries the
  earlier run's sha and date, which is its documented behaviour.
- **The `/a/` share-link gap was proved as a route-handler measurement, not as
  a live browser test** against `apps.ideabosco.com`. The handler answers
  identically open or closed, which is the whole claim; whether a real
  deployment behaves the same rests on the routes being the only thing serving
  those paths.

## Deferred

- **Removing the Preview link for a closed student.** `FoundryMine.svelte` and
  `FoundrySubmit.svelte` still render it, and pressing it now lands on a stated
  refusal rather than a running app. That is correct but not ideal: "a control
  that is absent for a reason says the reason" would have those two surfaces
  drop the link and say why. Both components are outside this bundle's
  ownership.
- **A bell schedule**, still decision 01's deferred half and still blocked on
  the same thing: nothing in this schema records which class a student is
  sitting in.
- **Anything at all on the apps origin.** See above; it is deferred only in the
  sense that a future decision to accept a session or a signature there would
  reopen it, and that decision has to answer the cookie question first.
