---
title: "Give published apps room to run: a direct page per app, full screen, and a share link (`lane/foundry-fullpage`, code only, no migration)"
date: 2026-08-25
branches: [lane/foundry-fullpage]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 143
---

**Branch:** `lane/foundry-fullpage`. **Migration:** none.

### The problem

An app in the gallery runs in an iframe, inside a detail pane, inside a two-pane
split, inside the portal shell -- so it gets what is left after three layers of
chrome. blockbast, a published student build, has to be zoomed out before it is
usable. VANGUARD gets a whole page because it is our code on our origin; a
student's app can never be that, because the origin split exists precisely so a
bundle never runs where the session cookies live. But it can be a whole page one
origin over.

Measured on the acceptance fixture at a 1440x900 viewport: the gallery frame
gives the bundle **870x628**, which is 42.2% of the browser viewport and forces a
960x640 playfield down to **scale 0.906** with its 14px score readout drawn at
12.69px. The direct page gives it **1440x900** at **scale 1.000**.

### Three things, and only the first is new machinery

**1. `/a/<app id>/` -- the direct page.** A second SvelteKit route on the apps
origin serving the published bundle's entry file as the whole document. No
iframe, no chrome, no wrapper.

**2. Full screen from the gallery**, beside Stop app.

**3. The share link**, surfaced in the detail pane with a copy control and the
sentence that has to go with it.

### The two mounts differ in ONE thing, and everything else is shared

`/b/<app>/<version>/` names a BUILD, because its callers are deciding about one:
the gallery frames the published version and the review queue frames the
submitted one. `/a/<app>/` names an APP and resolves `published_version_id` per
request. That difference is the whole difference. The host gate, the publication
re-check, the header set, the shim injection, the trailing-slash repair and the
one bodyless 404 moved into `$lib/server/foundry-bundle-response.ts`, which both
routes call.

**This was not tidiness.** The CSP `sandbox` directive is what puts a DIRECTLY
NAVIGATED bundle in an opaque origin -- the iframe attribute needs a frame to be
on -- so a second mount with a second, slightly-drifted header set would render
perfectly and run a student's document with full rights on a host of ours.
Nothing on screen would say so. `tests/foundry-app-route.test.ts` therefore
asserts the two responses' header sets are **equal, field for field**, rather
than listing what `/a/` should contain: a list pins whatever was true the day it
was written, and this feature has already shipped twice with a header that was
set and did not arrive.

The module is `foundry-bundle-response.ts` and not the obvious
`foundry-serve.ts` because that path is a deleted module of the token proxy and
`tests/foundry-bundle-url.test.ts` sweeps the tree for it. The sweep reddened on
the first draft, which is the sweep doing its job.

`publishedVersionOf` is a LOOKUP and not a decision: it reads one column and
returns it, and does not ask whether the app is hidden. `serveBundleFile` asks
that, as it always has, so the publication gate still has exactly one copy and a
hidden app's published id gets the same 404 from the same three checks.

**`/a/` is strictly narrower than `/b/`: it never serves a SUBMITTED build.**
`/b/` does, because the queue has to run the thing it is deciding about. An
app's own public address does not.

### How relative assets resolve, which decided the path shape

The entry document says `href="style.css"` and nothing rewrites it -- ingest, the
source viewer and both routes agree a stored byte is served back unchanged. So
the URL does the work: served at `/a/<app>/`, the base URL is `/a/<app>/`, so
`style.css` resolves to `/a/<app>/style.css` and arrives at the same handler with
that tail. `trailingSlash = 'ignore'` and a 307 with a RELATIVE `Location` handle
the bare form, exactly as `/b/` already did.

**`<base href>` was rejected and it is not a matter of taste: it cannot work.**
The bundle CSP carries `base-uri 'none'`, so an injected `<base>` element is
ignored by the browser outright, and the only way to make it take effect is to
weaken the directive that stops a bundle repointing its own relative URLs.

**A redirect to `/b/<app>/<version>/` was the other rejected shape.** It serves
the app one hop later, but leaves the VERSION URL in the address bar -- so a
screenshot, a bookmark or a re-paste of what is on screen carries a link that
dies at the next publish, which is exactly what this mount exists to avoid.

### Public is the point, and what is public is the work

There is no session on the apps host to check. That absence is the point of the
split, so "require a signed-in caller" is not available here without either
`Domain`-scoping the portal's cookies onto that host -- handing every bundle the
credentials the split exists to withhold -- or putting a signed token back on
every request, which is the machinery five lanes were spent removing.

**The route reads ONE column of the app row (`published_version_id`) and the
version's files.** Not the author, not the class, not the build notes, not the
description, not the version list. A person handed the link gets the app and
learns nothing about who wrote it that the app itself does not tell them. Those
fields stay on the gallery, which is signed in.

Every refusal is the same bodyless 404 with `cache-control: no-store`: an
unknown app, a deleted app (which is an unknown app), a hidden app, an app with
nothing published, a file with no row, a traversal, an absolute path, a method
that is not GET or HEAD, and the whole route on any origin but the apps one. So
an app hidden or deleted after a link was shared stops serving in the same
statement that hid or deleted it.

### Full screen is a class on the stage, never a second frame

`AppStage` puts `.is-full` on its OWN element -- the one holding the bar AND the
frame -- and then asks the Fullscreen API. The `<iframe>` is never unmounted and
its `src` is never rewritten, so a running app keeps its state, its timers and
its audio. `AppFrame` gained a `fill` prop rather than a `height="100%"`, because
`height` is written as an inline style and an inline style beats every class
rule; `fill` drops the inline height and lets the box grow.

**The overlay is the FLOOR and native is the upgrade.** The class goes on first
and the API is asked second, so a refusal (iOS Safari has no element fullscreen;
every engine refuses without a gesture) costs nothing and both paths land on the
same layout. Only the ESCAPE differs, and the hint says which one this viewer
has: native Escape is the browser's and works with focus inside the bundle, the
overlay's is a keydown on the window that a focused cross-origin frame never
delivers to us. That is why the VISIBLE control is the guarantee, why the bar
does not fade, and why Stop app stays beside it -- an app can still wedge, and
unmounting the frame is still the only way out of that.

**No `requestAnimationFrame` anywhere on the path**, per the stop control's own
measurement: a wedged bundle stops the parent's animation frames arriving and
leaves its task queue alive. Every transition here is a synchronous state change
and a class.

The stage's own padding and gap are **zero** in the full state. Measured at 375:
they were 24px of the 812 the viewport has, in the one state whose entire purpose
is room. The bar keeps its own inset.

### The share link says what it is before it is used

`FoundryDetail` renders the URL as selectable text beside a copy control -- text
because the Clipboard API can be refused and a copy control is worthless where
the thing being copied cannot be read by hand -- and states in words that anyone
with the link can open the app without signing in, and that the page carries no
name, class or build notes. The surface is signed in and the link is not, which
is a difference a student cannot see and has no reason to guess.

It keys on `published_version_id`, NOT on the version being shown: the review
queue shows the SUBMITTED build, and a link offered beside it would point at
something else. A HIDDEN app gets no link, because `/a/` refuses one and a
control whose only possible outcome is a refusal must not be offered.

The outcome goes in a live region BESIDE the button rather than rewriting the
button's label -- a control whose word changes under the pointer gets clicked
twice, and a screen reader announcing "Copied" as the NAME of a button called
"Copy link" is announcing the wrong thing.

`FoundryDetail` is now the one reader of `PUBLIC_FOUNDRY_APPS_ORIGIN` on the
gallery path and hands it down to `AppStage`, because the frame src and the share
link must name the same origin and two independent reads of one variable is the
arrangement in which they can differ.

### The fixture, and what it stands in for

`tests/fixtures/foundry/wide-playfield.html` is a fixed 960x640 brick game that
scales to fit whatever box it is given, never past 1, and **writes the scale it
got onto `<html data-scale>`**. That is why it is a fixture rather than three
screenshots: "the app got more room" is an eyeball claim, and a number read from
the same bundle in three contexts can be compared.

**It is a stand-in and says so in its own header.** blockbast's bytes are in the
production bundle bucket and nothing in this repository or this session can reach
them. What it reproduces is the SHAPE of the problem, not the app.

It measures on a timer as well as on `resize`, which was found the hard way: a
frame created while its container is laid out at 0x0 -- what a master-detail pane
looks like in the frame it is swapped in -- gets its real size with no resize
event ever firing inside it, so a load-plus-resize instrument reported
`scale 0.000` in a 343x568 element and read exactly like a frame that never
loaded.

Two refusal fixtures were added beside it, because both are cases nothing else
could produce: a HIDDEN app that is published and shelved, and an app with a
version and NO `published_version_id`. `FixtureApp.publishedVersionId` widened to
`string | null` for the second. Both entry documents say in words that serving
them is the failure, so a fixture proving a refusal is recognisable when the
refusal stops happening.

### The gallery harness runs bundles for real now

`/dev/foundry-gallery` said, in a comment and in an amber paragraph on the page,
that launching mounts a frame at a Storage URL that 404s. That had been stale
since the bytes moved off Supabase: `AppStage` builds from
`PUBLIC_FOUNDRY_APPS_ORIGIN`, and the fixture bundles are served by the REAL
`/b/` route. Pointing that variable at the dev server's own address -- 127.0.0.1
while browsing localhost, so the frame is genuinely cross-origin -- runs them for
real, with the real headers and the real sandbox. The page and its `bundleOrigin`
readout were corrected to match, which is what made every measurement below
possible.

### What was measured

**Headers, fetched rather than read off the code.** `/a/<app>/` and
`/b/<app>/<version>/` on the same bundle returned byte-identical header sets:
`content-type: text/html; charset=utf-8`, the full CSP with
`sandbox allow-scripts allow-modals allow-pointer-lock`, `base-uri 'none'`,
`form-action 'none'` and `frame-ancestors`, plus `x-content-type-options:
nosniff`, `referrer-policy: no-referrer`, `cache-control: private, max-age=60`
and `x-robots-tag: noindex, nofollow`. The bare form 307s with a relative
`location: <app id>/`.

**Room, in three contexts** (Chromium, the acceptance fixture reporting its own
scale):

| | 1440x900 | 375x812 |
| --- | --- | --- |
| gallery frame | 870x628, 42.2% of viewport, scale 0.906, hud 12.69px | 341x566, 63.4%, scale 0.355, hud 4.97px |
| full screen | 1440x828, 92.0%, scale 1.000, hud 14.00px | 375x688, 84.7%, scale 0.391, hud 5.47px |
| direct page | 1440x900, 100%, scale 1.000, hud 14.00px | 375x812, 100%, scale 0.391, hud 5.47px |

**Sandbox probes on the DIRECT page, no frame around it:** `window.origin` is
`"null"`; `document.cookie` read AND write both throw `SecurityError`;
`indexedDB.open` throws `SecurityError`; `window.open` returns null; a `fetch` at
the portal origin fails, and so does a same-path fetch on the apps origin;
`window.parent === window` and `window.top === window` are true and their
`location.href` is the page's own, which is a top-level document navigating
itself and not an escape. The injected storage shim works (`len=1` after a
round trip).

**Refusals, navigated for real:** a hidden app, an unknown app and an app with
nothing published each answered 404 with nothing rendered. The direct page on the
PORTAL origin answered 404 while the identical request on the apps origin
answered 200.

**Full screen:** native was granted (`data-full=native`); the frame was not
remounted and the game's score went 10 to 130 across the transition; Stop app
stayed on screen at 113x44 and Full screen at 182x44. With
`Element.prototype.requestFullscreen` forced to reject, `data-full=overlay`,
`document.fullscreenElement` was null, the frame still filled 1440x828 / 375x667,
Escape returned and the frame was NOT unmounted. Stop app from full screen left
0 frames and `data-full=no`.

**The copy control:** the live region read "Copied.", the clipboard held exactly
the rendered URL, and the button is 121x44.

**The share link's absence:** hiding an app in the review console took the share
links on screen from 2 to 1 while 2 detail panes were still rendering, so the
missing link is the hidden flag rather than an empty pane.

**No horizontal overflow** at either width (`scrollWidth` 1440 vs 1440, 375 vs
375).

**Mutation proof.** The hidden-app refusal is a visibility boundary, so the gate
was opened in the PERMISSIVE direction -- `if (app.hiddenAt !== null) return
REFUSED` to `if (false)` -- and 3 assertions in `tests/foundry-app-route.test.ts`
reddened. Restored and md5-verified byte-identical, green again.

**`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`) -- the documented baseline,
re-derived after `svelte-kit sync`. **Suite: 2545 passed, 2 failed**, both in
`tests/spec-instructions-budget.test.ts` and both pre-existing from a classroom
export, as the previous lane's entry already records; nothing in this diff
touches a spec or a material.

### One assertion was generalized rather than deleted

`tests/foundry-bundle-url.test.ts` asserted the serving route contained the
string `trailingSlashRedirect`, a local function name that moved into the shared
responder. It is now an `it.each` over BOTH mounts asserting each declares
`trailingSlash = 'ignore'` and calls `foundryRootRedirect` -- which is a
strengthening, because the new mount has exactly the same silent failure.

### NOT verified

- **Nothing ran against production, or against any real Supabase project.**
  Outbound HTTPS in this session is proxied and `ideabosco.com` and
  `apps.ideabosco.com` are not reachable from it at all (`CONNECT tunnel failed,
  response 403`). The local `.env` names a placeholder project. So every
  measurement above is against the in-memory dev fixture served by the real
  routes on a local dev server, at `127.0.0.1:5173` standing in for the apps
  origin and `localhost:5173` for the portal.
- **blockbast itself was never opened, framed or screenshotted.** Its bytes are
  in the production bucket, which is unreachable here. `wide-playfield.html`
  reproduces the shape of its problem and is labelled a stand-in in its own
  header and in the harness. **The acceptance case named in the request has not
  been run.**
- **The direct page has never served a real student bundle**, only fixture
  bytes. In particular no real bundle's relative assets have been resolved
  through `/a/`; the fixture's were, and so were the four file types in the
  type fixture.
- **The isolation claim on a REAL cross-site origin is inherited, not
  re-measured.** Here the apps origin and the portal origin are two spellings of
  one dev server, so the frame is cross-origin but not cross-SITE, and the
  cookie absence that the whole split rests on is a property of the production
  hosts. What was measured here is the CSP sandbox behaviour on a direct
  navigation, which is what this lane adds.
- **The gallery's own `/foundry` route was not driven**, only
  `/dev/foundry-gallery`, which mounts the identical components in the same page
  shell. Both real routes need a session against a real project.
- **`/foundry/mine` did not gain the share link** and was not changed. The
  request named the detail pane, which is `FoundryDetail` -- the gallery and the
  review queue. A student managing their own apps arguably wants the link there
  too; that is a decision, not an oversight, and it is unmade.
- **No native full screen was driven on Safari or on a phone.** The overlay
  branch was exercised by forcing the API to reject in Chromium, which is the
  same branch those take but not the same engine.

---

