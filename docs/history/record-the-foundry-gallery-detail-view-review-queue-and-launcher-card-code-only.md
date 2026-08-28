---
title: "The Foundry gallery, detail view, review queue and launcher card (code only)"
date: 2026-08-24
branches: []
migrations: []
subsystems: ["IDEA Foundry", "Home page, launcher, tour"]
record_order: 130
---

## The Foundry gallery, detail view, review queue and launcher card (code only)

**No migration.** 0132 is applied on production and verified there; everything
here reads through RPCs that already exist. Landed on `lane/foundry-gallery` and
merged `--no-ff`.

Four surfaces and the server work they needed:

- **`/foundry`** -- the gallery. Every published, non-hidden app, master-detail
  above 1024px through the shared `ClassSplit`.
- **`/foundry/review`** -- the queue, admin only, 404 to everyone else. Source
  and running app side by side.
- **`FoundryDetail`** -- one app, mounted UNCHANGED by both.
- **The launcher card**, with an animated mark.

### Role parity is structural, not a promise

`/foundry/review` mounts the IDENTICAL `FoundryDetail` the gallery mounts and
puts `FoundryInspector` in the column BESIDE it. **There is no `staff` flag
inside the detail component and no staff branch in that file**, so "what does a
student see" is answerable by reading it straight through rather than by tracing
conditions, and nothing a reviewer can do leaks into a student's page by
forgetting one. The only prop that differs is `versionId`.

An earlier draft passed the inspector into `FoundryDetail` as a snippet. It was
removed: a snippet is better than a flag, but the version with no staff region in
the file at all is better than both, and it is what makes the side-by-side layout
the queue's own business rather than the detail component's.

### The token gained a KIND, and it lifts exactly one check

The queue has to RUN the build it is deciding about, and a submitted version is
by definition not `published_version_id` -- which `resolveBundleFile` re-checks
on every request, deliberately, because that re-check is what makes a
thirty-minute token withdrawable inside its own lifetime.

So byte 0 of the token payload, which was always a signed discriminator called a
"version" and always checked after the signature, now holds a KIND:
`published` (1, byte-for-byte what every token has always been) or `review` (2).
**No width change** -- adding a field would have moved every offset and made
every existing token malformed.

- The licence is IN THE SIGNED BYTES, so a published token cannot be edited into
  a review one.
- The mint issues `review` only to `is_admin()`, and **re-reads the version row**
  rather than trusting the body -- without that a review token could name app A
  and a version of app B.
- Hidden still refuses both kinds. A hidden app is off the site for staff too.
- An unrecognised kind byte is refused rather than defaulted.

Measured against the local stack, same unpublished version:

| Request | Result |
| --- | --- |
| published token | **404**, 0 bytes |
| review token | **200**, 2,765 bytes, `text/html` |
| review token, another app's file | **404**, 0 bytes |
| review token on the MAIN host | **404**, 0 bytes |
| CSP on the review response | unchanged: same sandbox, `connect-src 'none'`, `frame-ancestors` pinned |

### The stop control, and the rAF finding

`AppStage` owns launch/stop; `AppFrame` still owns the sandbox attribute and
nothing else. Stopping REMOVES the `<iframe>` -- it does not navigate it to
`about:blank`, hide it, or ask the bundle to stop.

The first draft's comment claimed the parent was unaffected because site
isolation gives a cross-site sandboxed frame its own process. **Driven for real
in Chrome against a fixture bundle that heartbeats every 200ms and then runs
`while (true) {}`, that is too strong:**

| Measured | Result |
| --- | --- |
| the child's heartbeat | stops dead (it really is wedged) |
| the parent's `setTimeout(100)` | fires at **995ms** -- ~10x late, but it fires |
| the parent's `requestAnimationFrame` | **never fired in 3s** |
| click Stop, frame gone | within **250ms** of the press |

So the parent is DEGRADED, not unaffected: enough of the rendering pipeline is
shared that animation frames stop arriving. What survives is the TASK QUEUE,
which is all a click handler and a synchronous state change need (Svelte flushes
on a microtask). **That is now a constraint written into the component: nothing
on the stop path may use rAF**, because a teardown scheduled on an animation
frame would never run in exactly the case the control exists for, and would read
as a dead button. The first CDP call that awaited a parent rAF while the child
spun timed out at 45s, which is how this was found.

### The hostile bundle, driven end to end

The fixture bundle (0130's, unchanged) reports each attempt itself. Through the
REAL gallery, in real Chrome, cross-origin (`localhost:5173` framing
`127.0.0.1:5173`):

| Probe | Result |
| --- | --- |
| `window.origin` | `"null"` -- opaque origin |
| `window.parent.location` | BLOCKED SecurityError |
| `window.top.document` | BLOCKED SecurityError |
| `window.top.location = ...` | BLOCKED SecurityError |
| `window.open('https://example.com/')` | **REACHED, returned `null`** -- the call does not throw, no window opens (`allow-popups` not granted) |
| `document.cookie` | BLOCKED SecurityError |
| native `localStorage` | would have thrown; the shim answered, round trip works in memory |
| external `<script src=cdn>` | global `undefined` -- refused by `script-src` |
| `fetch('https://example.com/')` | BLOCKED TypeError |
| `fetch('/api/notebook/upload')` | BLOCKED TypeError (`connect-src 'none'`) |
| `<img src="/api/notebook/upload">` | resolved to the APPS host, did not load |
| the bundle's own stylesheet | **2 sheets, body font Rajdhani** -- its own CSS and the platform fonts both loaded |

`window.open` is the one worth stating precisely rather than as "blocked": the
call succeeds and evaluates to `null`. Anything reading it as a truthy window
handle gets a TypeError of its own making, which is the correct outcome, but it
is not an exception at the call site.

**None of this could be measured in the `mcp__Claude_Browser__*` pane**, which
answers `ERR_BLOCKED_BY_CLIENT` for the frame's navigation and for every
subresource an opaque origin requests. That is the trap already written down in
`CLAUDE.md`; the connected Chrome is what made the drive possible.

### The side-by-side threshold was measured, and the first one was wrong

Written first as `@container fdy-work (min-width: 58rem)` from a plausible
sentence about "wrapping mid-attribute". Measured at 1440px: **the split's detail
pane is 857px, not 1440**, so the side-by-side never engaged at all -- and the
work area is inside that pane, which is why the query is on the CONTAINER rather
than the viewport in the first place.

Two things were wrong and both were fixed against measurements:

1. **Both routes were on `--measure-wide` (62rem), a SINGLE-column measure.**
   They are two-pane splits; `--measure-split` (92rem) is the token for that
   shape.
2. **The threshold came from a guess.** Share Tech Mono at 0.78rem advances
   **6.74px per character**, measured by putting a 100-character ruler in the
   real `<pre>`; the pane costs 26px of padding and border. So:

   | Work area | Inspector column | Characters of source |
   | --- | --- | --- |
   | 832px (the threshold) | 410px | 57 |
   | 857px (1440px viewport) | 438px | 61 |
   | 1032px (1920px viewport) | 541px | 76 |

   The threshold is **52rem**, which the 1440px pane clears. Lines SCROLL rather
   than wrap (`white-space: pre` plus the pane's own `overflow: auto`), so a
   narrow column costs horizontal scrolling on a long line, never a re-flowed
   attribute -- which is also why the original sentence was wrong about what
   happens. The INSPECTOR gets the larger share (1.1fr against 1fr): the frame
   beside it is a preview whose content reflows, and source is text whose lines
   do not.

### Measured geometry

Transitions frozen before every read (the split eases `grid-template-columns`,
and this pane's layout otherwise reports the pre-transition value).

**1440 x 900:**

| | |
| --- | --- |
| page horizontal overflow | **0px** |
| gallery, one app open | nav 416px, detail 857px |
| gallery, NOTHING open | nav **1297px** (the whole measure), cards in **2 columns of 618px, same y** |
| review work area | 857px, **app 397px and inspector 436px at the same y** -- genuinely side by side |
| source pane | 426px, **57 characters**, scrolls inside itself, page still 0px overflow |

**375 x 812:**

| | |
| --- | --- |
| page horizontal overflow | **0px** |
| gallery | nav pane hidden (`narrow="swap"`), detail 343px -- one pane |
| review work area | one column, 343px, **app above inspector** (`sideBySide: false`) |
| source pane | 343px, still scrolls inside itself |
| tap targets, lists visible | 45 / 149 / 126 / 94px -- **0 under 44px** |

**What the review side-by-side becomes at 375px**, stated because it has no
sensible narrow form as a split: it is ONE column in review order -- the running
app, then the file tree, then the source, then the decision -- which is the
sequence a reviewer works in anyway. Two 187px columns would be neither a
readable app nor readable source. The queue list swaps out entirely, so a phone
shows the queue or one submission, never both.

### The metadata flag says less than was asked for, on purpose

The brief asked for the flag to surface "with what changed". **The schema cannot
answer that.** `student_apps.metadata_flagged_at` is a timestamp; there is no
metadata history table, the version manifest carries build facts only, and
nothing anywhere holds the approved copy of the text. So the panel reports the
two timestamps that ARE known -- when the drift started, and which approval it
drifted from -- and names the five fields capable of having moved, and says in
words that which one is not recorded. A confident "Title changed from X to Y"
would be a sentence with nothing behind it. A per-field diff is a migration.

### The launcher card

`foundry` joins `PORTAL_APPS`, and the accent is a `[data-app='foundry']` rule in
`AppLauncher`'s stylesheet -- never an inline style, which is the whole point of
`tests/home-order-and-accent.test.ts`. The card **quotes its own room**:
`--acc-primary: var(--green)` and `--acc-secondary: var(--cyan)`, by TOKEN rather
than as re-typed hex, because `/foundry` is built on the portal's console
register and those two ARE its colours. Molten copper was the tempting
alternative and is exactly what the rule refuses -- inventing an identity for an
app that already has one. `--acc-ink` is not re-pinned: `--green` already carries
text on `--bg1` everywhere else on that page.

`FoundryMark` is a crucible pouring into a browser frame, three drops on a 4.4s
loop with each line in the frame lighting as its drop lands. It reads as "make"
and "publish" together, and it is not another gauge, grid or bracket. **Nothing
is hidden at rest**: with the animation cancelled every element is at full
opacity and no transform, which the test now asserts by stripping the
`@keyframes` blocks and sweeping what is left for `opacity: 0`.

### What was measured

- `tests/foundry-author-name.test.ts`, **10 cases**. Both rungs, whitespace-only
  treated as unset, null rather than an invented label, and the third rung
  asserted against `displayName()` as a POSITIVE CONTROL -- the portal helper
  really does return the address on the identical input, so "Foundry does not"
  is a statement about Foundry. Plus a sweep of every Foundry surface for that
  import, and a check that `FoundryAuthor` declares no email field at all.
- `tests/foundry-gallery.test.ts`, **17 cases**, SSR through `svelte/server` on
  the REAL components: the sandbox grant list, one writer of the attribute, no
  frame until launched, the null class rendering nothing, role parity with counts
  both ways (0 inspectors in the gallery, 1 in the queue), the version under
  review, oldest-first queue ordering, absence-removes-the-control, and the
  reject gate.
- `tests/home-order-and-accent.test.ts` gained **2 cases** for the card and the
  mark (now 12).
- **Mutation proof, six mutations, each restored md5-identical and re-verified
  green:**

| Mutation | Result |
| --- | --- |
| `allow-same-origin` added to the frame | 2 failed |
| null class renders `'Unknown'` | 5 failed |
| the queue points at `published_version_id` | 1 failed |
| `queueOrder` sorts newest-first | 1 failed |
| (the author-name and reject-gate cases were driven live in the browser instead) | see below |

- **Driven live** through the harness at `/dev/foundry-gallery`, which mounts the
  real components: the decision gate refused at each stage with the right
  sentence (`Choose approve or send back first.` -> `Sending back needs a reason
  and a note saying what to change.` -> `Sending back needs a reason.`), a press
  while refused did NOTHING (the transport recorded nothing, so the control is
  not merely styled as unavailable), and a complete decision handed the transport
  exactly `{versionId, decision: "reject", note, reasonId: "does-not-run"}`.
  The source viewer showed the stored bytes including the fixture's own
  `while (true)`, rendered as text with **0 `<script>` elements parsed** inside
  the `<pre>`.
- Full suite: **101 files, 2358 tests, green.** `svelte-check`: **0 errors, 37
  warnings**, breakdown unmoved (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`).

### A harness fix worth naming

The harness's own wrapper let the split run to 1313px at a 1440px viewport where
the real routes cap it, so the first geometry it produced was about a page nobody
will ever load. It now restates the routes' two rules (`--measure-split` and the
room's gutter) around each mounted surface. It also gained a `deselect` control,
because NOTHING OPEN is a first-class arrangement and the routes reach it by
navigating to the path with no `?app` -- which a single-page harness has no other
way to drive.

The fixture's submitted version is now the SPINNING bundle rather than a stub,
because that is where an unvetted build is actually met and it is the exact case
the stop control exists for.

### NOT verified

- **Nothing ran against the production project.** The local `.env` is a
  placeholder, so every read went through the dev fixture. In particular the
  MINT ROUTE's own refusals are unexercised locally -- its session read, its row
  read, a hidden app, an app with nothing published, and **a non-admin asking for
  a review token** all need a real project. The same is true of
  `/api/foundry/source`'s admin gate and of `/foundry/review`'s 404-for-a-
  non-admin load.
- **`foundry_review_version` was never called.** The harness's decision transport
  records the call and answers ok; no row moved, because there is no row.
- **No screenshots.** Every visual claim above is a measured computed-style,
  geometry or hit-test read, per the pane's own limits.
- **The gallery has not been seen with more than two apps in it**, so the card
  grid's column behaviour above two items is unmeasured (`auto-fit` was chosen
  precisely so two apps get two columns rather than two and a void, and that
  much WAS measured).

