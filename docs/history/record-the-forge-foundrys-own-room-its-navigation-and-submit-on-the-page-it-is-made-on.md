---
title: "The forge: Foundry's own room, its navigation, and submit on the page it is made on (`lane/foundry-forge`, code only)"
date: 2026-08-25
branches: [lane/foundry-forge]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 138
---

Foundry had six routes and no identity: four of them sat on the classroom's
console register, two sat bare on the portal shell, nothing tied them together
(no masthead, no way back, no way between the surfaces except links scattered
in page bodies), the review queue was reachable only by typing its URL, and a
student who uploaded on `/foundry/submit` had to go to `/foundry/mine` to
submit the thing they had just made. This lane gives the module a room of its
own -- THE FORGE -- a persistent shell, an admin entry with a pending count,
and the submit press on the submit page. The proxy, the hook, the `/r` route,
the token, ingest and preflight are untouched (a separate lane was diagnosing
a production 404 in exactly those files), and `AppFrame`'s contract did not
move.

### The identity, and where its rules live

The visual language is a forge: molten metal poured, worked, cooled, finished.
Green stays the driving colour and stays the FINISHED state; amber and orange
are HEAT, and heat means IN PROGRESS. That gives status a real language
instead of a coloured dot, and the mapping is now a rule in `CLAUDE.md`'s
sibling -- the room stylesheet itself:

    draft      cold iron    dark, unlit, matte
    submitted  heating      amber, glowing, alive
    approved   struck       cooled to green, finished
    rejected   quenched     desaturated grey, cooled wrong
    hidden     shelved      flat, no heat at all

`src/lib/foundry/forge.css` is the room (`.fg-root`), the `.nb-root` mechanism
one room over: namespaced `--fg-*` tokens (iron plate, inks, the heat scale,
the five status trios, the motion vocabulary) with the SHARED vocabulary
(`--surface-*`, `--text-*`, `--boundary`, `--hairline`, `--bg*`, `--white`,
`--dim`) aliased onto the plate, source and target on the same element. Every
Foundry component already read the shared names with portal fallbacks, so the
whole module re-plated with no component edits, and the same components
mounted outside the room (SSR tests, harnesses without the wrapper) render on
the portal tokens exactly as before. The semantic accents (`--green`,
`--cyan`, `--amber`, `--teal`, `--crimson`, `--ice`) were deliberately NOT
re-pointed; the heat scale is a new set beside them. `.fg-root` joined
`split.css`'s room lists (gutter, scrollbars) the way `.cd-root` did -- a
class there, never a second split. The launcher card's accent pair stays
`var(--green)`/`var(--cyan)` (pinned by test, and still honest: green is
still the room's driving colour and cyan its metadata ink).

Every ink was measured against every ground it can land on (WCAG 2.x, canvas
composite in the browser as well as design-time arithmetic; the two agreed):
ink 15.40 on the card, ink-2 6.99, heat-ink 9.03, boundary 4.37 against a 3.0
bar, and the six chip inks on their own PINNED fills 7.13 / 8.05 / 6.87 /
7.97 / 7.87 / 5.55, worst case the shelved chip at 5.55 against a 4.5 bar.
The fills are pinned colours, never a color-mix of the ink (the notebook's
cell-fill lesson). Chip EDGES are decoration by the standard's own list and
are unmeasured; the state is carried by ink + glyph + word + (for heat) glow.

### The molten seam, and what was measured about it

`MoltenSeam.svelte` is the signature: a casting channel with a layered pour.
The still base is a complete molten gradient (crust, ember, amber, white-hot
core); three conveyor layers drift over it (stream 23s, billows 13s, slag 37s
per tile -- co-prime, so the combined surface repeats on the order of minutes),
each an element one tile wider than the channel translated exactly one tile
per cycle, so the loop is seamless by construction. All three move the same
direction at different speeds, which is what reads as depth. CSS only, no
video, no canvas.

- **Only `transform` animates.** Read back off the live animations:
  three layers, every keyframe property `transform`.
- **Frame rate, measured**: 60.2 fps over 2 s with the pour on screen
  (rAF count, 1440x900), and ZERO long tasks (>50 ms) observed by a
  PerformanceObserver over the same window -- the pour costs the main thread
  nothing measurable.
- **It stops when nobody can see it.** An IntersectionObserver plus a
  `visibilitychange` listener set `data-paused`, which sets
  `animation-play-state: paused`. Measured: scrolled offscreen ->
  `data-paused` set and all three playStates `paused`; scrolled back ->
  `running`; synthetic `visibilityState: 'hidden'` + `visibilitychange` ->
  `paused`. The DEFAULT is playing, so if the observer never fires the
  failure mode is "keeps animating", never "never animates".
- **Reduced motion is the still frame, not a blank.** Under
  `reducedMotion: reduce` every layer's computed `animation-name` is `none`
  and the base + layer gradients still paint; screenshots at 1440 and 375
  read as molten metal, not a flat panel. The submitted chip's ember glow
  holds statically at its mid opacity (0.55).
- Where it belongs: the shell's header (the room signature), the review queue
  exactly while something waits (`variant="channel"` above a non-empty list;
  an empty queue is COLD, "Nothing is waiting. The forge is cold."), and the
  submitted state's chip glow. Nowhere else, on purpose.

The scoped-`::after`-pruning trap was checked rather than assumed: the
waiting chip's `::after` glow survives compilation (computed `content: ""`,
`animation-name: ...fg-ember-breath`, mid-pulse opacities observed live).

### The navigation, stated

    gallery   /foundry           everyone signed in; the front door
    mine      /foundry/mine      everyone signed in; the student's shelf
    submit    /foundry/submit    everyone signed in; the publish flow
                /foundry/contract  a reference INSIDE the publish flow
                /foundry/starter   a download INSIDE the publish flow
    review    /foundry/review    admins only

`src/routes/foundry/+layout.svelte` provides `.fg-root` and mounts
`FoundryShell` (masthead: emblem home link, FOUNDRY wordmark, tabs, the
molten seam, ProfileMenu -- the module previously had NO way back to the
portal and no profile menu anywhere). `$lib/foundry/nav.ts` is the one map;
the contract and starter resolve to the `submit` tab, and the contract page
carries "Back to publishing". The URLs themselves are permanent (printed
handouts keep resolving); only the map changed. The redundant in-body
cross-links (gallery's "My apps" header button, submit's "My apps" link)
went away rather than being duplicated by the tabs. Tab heights measured 44.0
px at 1440 and at 375; no route overflows at either width (scrollWidth ==
clientWidth at both, on every surface driven).

The REVIEW tab renders for admins only, and the pending count rides the
layout's server load, which asks ONLY for admins (`await parent()` for
`isAdmin`, then the same `queueOrder` arithmetic the queue renders, over the
same admin-widened read, so the tab and the page cannot disagree). Null, not
zero, for everyone else: a student's payload does not carry the queue's
state. The markup gate is convenience; the route's 404 and `is_admin()`
inside the RPCs stay the boundary. `tests/foundry-shell.test.ts` pins both
directions with the admin render as the positive control (135 assertions
green across the touched files). The count chip is lit (the submitted trio,
8.05:1 ink on fill) exactly while work waits and cold iron at zero.

The launcher card carries the same number: `+page.server.ts` on the home
route resolves `foundryReviewPending` (null unless admin), and the Foundry
card renders "3 to review" in `--amber` (measured 4.90:1 on the card).
Driven both directions on the real home page via `/dev/home-order?pending=`:
admin+3 -> badge, student+3 -> nothing, admin+0 -> nothing.

### Submit on the page it is made on

`FoundrySubmitTransports` gained an optional `submitVersion` (the same
`foundry_submit_version` RPC `/foundry/mine` calls), and the done state now
reads: the Draft chip beside "Nobody reviews it until you submit it", then
one deliberate press -- "Submit for review" -- then the heating chip beside
"v2 is in the review queue. You can withdraw it from My apps while it
waits." Preflight passing is still not submission: the press is its own act,
never a side effect of the upload finishing, and an absent transport removes
the control (the read-only mounting stays structural). Driven end to end
through `/dev/foundry-submit` with the real browser preflight: fixture zip ->
pass -> create+upload -> draft state -> press -> queued state, with the
transport recording `submitted version-new`.

### Verification, and what is NOT verified

- `npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings, the
  baseline mix exactly (31 state_referenced_locally, 5 css_unused_selector,
  1 perf_avoid_nested_class). The dots and status-word rules removed from
  `FoundryMine` were pruned with their markup so no unused-selector warning
  appeared.
- Full suite green (`npm test`).
- Both widths on every surface: the forge harness (`/dev/foundry-forge`,
  new -- shell in both roles, all six chips, both seam variants, FoundryMine
  over fixtures holding every lifecycle state at once), the gallery/review
  harness (now wrapped in the room with the shell mounted, admin view), the
  submit harness (now in the room, with the on-page submit press). All six
  ROUTES' content was verified through these harnesses; the routes themselves
  are thin mounts of the same components inside the same layout.
- One real bug found by looking at the screenshots: a null
  `published_ordinal` rendered "Live vnull" on a card; the label now guards
  it ("Live" alone is the whole truth).
- **NOT verified**: the real signed-in routes against a live Supabase
  project. This session ran in a container with no Docker, no local Supabase
  stack and the placeholder `.env`, so `/dev/login` was not available; the
  layout's server load (`parent()` + `foundry_list_apps` count) is exercised
  by types and by the queueOrder unit arithmetic only. Verify on the Vercel
  preview or a local stack before trusting the pending count end to end.
- **Environment note**: `tests/db/cluster.ts` now passes
  `createPostgresUser` when the suite runs as root (the normal state in a
  remote/CI container; initdb refuses root and the mkdtemp'd data dir was
  0700-root). Inert on a non-root developer machine.

Deferred: FoundryDetail/gallery card heat treatments beyond the chips (the
gallery is all finished work, so it stays cooled green by design); a
`shelved` word in `versionLabel` itself (hidden is an APP state, not a
version state, and renders from `hidden_at` directly); any per-field diff on
the metadata flag (still a migration, still not a rendering decision).

