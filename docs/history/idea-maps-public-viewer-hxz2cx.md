---
title: "IDEA Maps: the public viewer at /maps, and the fifth green on the launcher (`claude/idea-maps-public-viewer-hxz2cx`, no migration)"
date: 2026-09-03
branches: [claude/idea-maps-public-viewer-hxz2cx]
migrations: []
subsystems: ["IDEA Maps", "Access model", "Visual theme", "Components and UI", "Testing"]
---

The surface the whole subsystem is for. The editor, the grants tier, search,
photos and HEIC capture all shipped between `0161` and `0172`, and nobody who
is not an admin or a grantee could see a single row of it, because `/maps` did
not exist. No migration, and none was needed: `0161` gives every `maps_*` table
a `status = 'published'` select policy for `anon` and `authenticated`, `0163`
does the same for photos and the `maps-media` bucket, and `0162`/`0165` grant
`maps_search` to `anon` deliberately.

## The audit, before anything was built

**Every public read the viewer needs already existed, and one of them already
carried the thing that would have been the most work.** `maps_search` returns
`chain` -- the full containment chain, root to leaf, with each link's own
outline, position, rotation and elevation slot, built by `_maps_chain_link`
(0162 section 3). That is spec 5.3's result payload in full, so the viewer's
staged route needed no ancestor walk of its own against the search result and
no second read to build one. Verified against the function's own `returns
table` rather than assumed.

**What the viewer could NOT reuse was the editor's read, and not because it is
merely wider.** `loadMapsEditorData` selects `maps_revisions`, which carries no
`anon` grant at all -- `0161`'s own apply-time self-check raises if `anon` ever
holds one -- so an anonymous caller running it gets a thrown error rather than
a smaller payload. `mapsTransports` assumes a writer and `loadMapsScope`
assumes an account. `loadMapsPublicData` is therefore a new function beside
them rather than a parameter on the old one.

**Anonymous reachability was proved in the db harness rather than read off the
policies**, through `db.asAnon` (role `anon`, no jwt claims, which is what
PostgREST does for a signed-out request). Every `maps_*` content table and
`maps_photos` answer; `maps_search` executes; `maps_search_log` accepts an
INSERT and refuses a SELECT; `maps_revisions` refuses everything. The refusals
carry a positive control on the same instrument -- the owner connection reads
both tables -- so "permission denied" cannot be a table that does not exist.

## What is on screen

`/maps` renders `MapsViewer`, which the dev harness at `/dev/maps-viewer`
mounts identically. Descending navigation: the directory, a room's plan, a
unit's front elevation, a compartment's contents, and an item card with its
photos and its vocabulary. A persistent search bar at every level. And the
staged route a result opens: the directory with the building marked, the
building plan with the room marked, the room with the unit marked, the
elevation with the compartment marked, then the card.

**THE POSITION IS THE URL, AND NOTHING ABOUT WHERE YOU ARE LIVES ANYWHERE
ELSE.** `?at=` is the container, `?item=` is the card, `?to=<kind>:<id>` is the
staged route's TARGET and `?q=` is the query. Three things fall out of that and
all three matter more than the tidiness does: every level is an address a
student can send to somebody else, a phone that loses the tab comes back to the
same drawer, and the browser's own Back button walks the stages backwards for
free.

**THE ROUTE IS DERIVED FROM THE TARGET, NEVER STORED AS A CURSOR.** A stage
INDEX in the URL would be a second statement of where the walk goes: reload it
after somebody published a new room and the index points at a different place.
`?to=` and `?at=` each name a real object, so they cannot drift from each
other, and `mapsStagedRoute` recomputes the whole ordered walk on every render.
It returns an EMPTY route for anything it cannot resolve, never a partial one --
a half-walk that stops mid-building is indistinguishable from a route that
worked, and the caller cannot tell afterwards.

**THE SERVER LOAD READS `url` FOR EXACTLY ONE THING, AND IT IS THE SEARCH.**
The whole published map comes back in one pass -- it is small, spec 8's P1
acceptance artefact is one room end to end -- so every level of the descent
afterwards is local, which is the difference between instant and one round trip
per level on school wifi. What `?q=` buys for the re-run it costs is the
no-JavaScript path: the form is a real GET, the route answers it server-side,
and the results list renders with no bundle at all. This is the one page in
this app where that is worth paying for, and the reason is the person using it.

**AND THERE IS NO SHARED CACHE HEADER, WHICH THE FIRST DRAFT OF THE LOAD
HAD.** `s-maxage=60` looked free -- the map is small, it changes only on
publish, and a class arriving at once would pay for one read between them. It
is not free, because the payload is NOT identical for every caller: the read
runs on the caller's own client, so an ADMIN's response carries their
unpublished drafts (0161's admin read policy sits right beside the published
one), and a shared cache keyed on the URL could then hand those drafts to the
next anonymous visitor. That is the one thing this surface must not do, and it
would have been the kind of leak nobody notices, so the header is gone rather
than qualified by a `Vary` nobody would maintain.

**THE PAYLOAD DIFFERENCE ITSELF STAYS.** The read-path rule is that RLS is the
boundary and a client must not restate it, so an admin opening `/maps` sees
their own drafts, unmarked. They are an editor and the editor is where the
status chips are. If showing an admin exactly what a student sees ever
matters, that is a preview mode, not a `status` filter added to this load.

**A FAILED SEARCH IS NOT A FAILED PAGE, AND A FAILED LOAD IS NOT A 500.** The
map renders with the reason on it. A public map that answers 500 is a map
nobody can reach; one that says the map could not be loaded is one somebody can
report.

## The colour decision, which is the part that needed measuring

Mr. Pina closed spec section 10's undecided accent on 2026-09-02: Maps takes a
green, because green is the pathway's brand identity. That was carried in, not
revisited. What was still open was WHICH green, and the honest problem is that
**four cards on the launcher already spend one**.

Measured in oklch: admin/dashboard `#78b870` at hue 141.7, GAUNTLET and
VANGUARD `#00ff41` at 144.5, GREENLINE `#2ae57e` at 152.5, Tournaments
`#0fbe7a` at 158.6, with the Coin Ledger's chartreuse `#c8ff00` below them at
124.0 and the `--cyan` token above at 177.6. The gap between the emerald and
the cyan is the only green nothing on the page is using.

**Maps is `#40e3b1`, oklch(0.820 0.150 168), the middle of that gap.** CIEDE2000
against every colour already on the launcher: GREENLINE 9.8, Tournaments 10.8,
admin/dashboard 15.1, GAUNTLET and VANGUARD 18.6, the Coin Ledger 27.5, the
shared brass default 34.7, the Foundry 50.1, FRC 75.9; 11.4 against `--cyan`
and 17.6 against `--teal`. As text it measures 10.86 / 9.24 / 8.66 on `--bg0` /
`--bg1` / `--bg2`, so unlike FRC's brand red the identity carries the glyph
itself and `--acc-ink` does not move; the 75% edge reads 6.89:1 against the
page, past the 3:1 a load-bearing boundary owes.

**THE BAR IS THE BOARD'S OWN TIGHTEST PAIR, WHICH IS WHY THE TEST DOES NOT
WRITE A NUMBER DOWN.** The launcher's closest existing pair is Tournaments
against admin/dashboard at 9.0, so 9.8 does not make the page tighter than it
already is. `tests/home-order-and-accent.test.ts` computes both from the
stylesheet on every run and asserts the relationship rather than the figure: a
pinned number would be a ratchet recording whatever green somebody picked next,
and a future card that crowds the board fails this whether or not it is Maps.
Verified by mutation: swapping the accent to `#33e18a` reddens exactly that
assertion, and `AppLauncher.svelte` was restored md5-identical.

**A NOTE ON HOW THE COLOUR WAS NOT CHOSEN.** An unconstrained search for the
point furthest from every rival returns a near-white cream at chroma 0.04 --
maximising perceptual distance alone walks straight out of "green". Constrained
to the green band it runs to whichever edge of the window it is given: hue 125
(a dim lime that reads as the Coin Ledger's chartreuse gone out) at one end,
hue 174 aquamarine at the other, and lightness 0.90 pale mint in between. The
optimiser is useful for the trade-off curve and cannot make the decision; the
hue gap is the design argument and the numbers above are what support it.

**THE SECOND STOP IS `--gold`, BY TOKEN, AND IT IS THE ROOM QUOTED.** The card's
2px strip runs jade to brass because that is the two roles the surface actually
has. It is the one strip on the launcher whose stops are a room's own semantics
rather than two colours that go together.

**THERE IS NO `maps` ENTRY IN `PORTAL_APPS`, so the rule paints nothing yet.**
The registry and `$lib/marks/MapsMark.svelte` are outside this lane's files.
The rule is landed so that the entry, when it lands, lands with the decision
already made and measured.

## The highlight is gold, and it is a state

Green is the chrome -- headings, links, the plan's linework, the active crumb --
and `--gold` marks the thing that was found. A map's whole job is to make one
found thing leap out of a plan, so if the linework were already in the accent
there would be nowhere for the mark to go. It is a STATE the way crimson is
reserved for live and error, and it is never spent on decoration.

Measured in the browser rather than asserted, by compositing to a canvas (both
values are `color-mix()` over a plate, which a regex over computed styles skips
silently): the mark's border is warm and red-dominant, the heading is
green-dominant, and a marked row does not paint like an unmarked one. The
"found here" word on the gold fill reads **5.12:1**, the step counter **8.14:1**,
the Next control **5.98:1**, the Skip control **7.27:1**. **Colour is never the
only signal**: the gold fill is one, the heavier border is a second, and the
word "found here" beside it is the one a colour-blind reader gets.

## Three places the 44px floor had to be argued rather than applied

**THE PLAN'S SHAPES ARE NOT CONTROLS AND CANNOT BE.** A 30in chest in a 400in
room is 30/400 of the pane whatever anybody would prefer, and inflating it would
make the drawing lie about the dimension it exists to show -- the editor's own
`PlanCanvas` says the same thing for the same reason. The floor is met by the
LIST, which carries every shape on the plan as a full-width row, and the room
spec measures exactly that: every shape the plan drew has a row, and the list
also carries what the plan cannot draw. The drawing is a second, faster way to
the same links and never the only way.

**THE ELEVATION IS WHERE PROPORTION AND THE FLOOR GENUINELY CONFLICT, and
`flex-grow` could not resolve it.** A flex column with no height distributes
nothing: measured on the harness, a 3in drawer, a 9in drawer and an unsized bay
all came back at **45/45/45px**. The stack now computes each slot's share of a
420px nominal drawing and takes `max(44, share)`, so the same three measure
**70 / 210 / 140px** and the 9in drawer is visibly deeper than the 3in one. Ten
1.5in bins would be 42px each in proportion; they are drawn at the floor
instead, all ten equal, which is the correct answer -- the floor lifted them
together rather than picking winners. That case is `?state=thin-stack`, added
because Tool Chest A's own slots are all comfortably above the floor and the
floor branch would otherwise never have run.

**THE BREADCRUMB IS ONE LINE THAT SCROLLS, AND THAT IS A TAP DECISION.** Wrapped,
the crumb lines sit ~21px apart and a 44px reach on each link overlaps the line
above and below: measured at 375px, **7 of 25 sample taps landed on the wrong
crumb**. That is the collision `CLAUDE.md` describes for inline links in prose,
where the repo's answer is to leave the reach alone. Here there is a better one,
because a breadcrumb is navigation rather than a sentence: on one line each
crumb owns its own horizontal band inside a single 44px row, a height-only reach
cannot overlap anything, and the trail costs one line of a phone screen instead
of three. Measured after: **0 stolen of 25** at 1440 and 0 of 19 at 375.

## The trail dots stopped being controls

They were links. Two of this repo's rules agree that they should not be. A 10px
circle with only a `title` fails "every control carries a visible word, not only
a glyph" outright -- a tooltip is not discoverable and a phone cannot hover --
and five real 44px targets would put 220px of unlabelled circles on a 375px
screen. What they would navigate to is **already reachable by name**: for any
route the stages ARE the containment chain, so the breadcrumb is the same set of
jumps with words on them, and two controls for one navigation is the pair that
stops agreeing. They are `aria-hidden` progress marks now, and the sentence
beside them ("Step 3 of 5, Tool Chest A, inside Machine Shop") is what a screen
reader gets. The spec asserts zero `a.mv-trail-dot`, so the moment one becomes a
link again it reddens.

## Two defects the browser pass found, both invisible to type-checking

**A DESCENT DROPPED A QUERY TYPED LIVE.** The hrefs were built from
`position.q`, the URL's value, and a query typed into the box has not reached
the URL -- nobody submitted anything. So the box still read "caliper" and the
row beneath it linked to a page with no query at all: the search bar was
persistent everywhere except across the one navigation the feature is built
around. Every descent now carries `q`, the box's own value.

**THE TRAIL DOTS NEVER HAD THE REACH CLASS.** `--tap-reach-w: 0px` was declared
in the stylesheet and `tap-reach-44` was never in the markup, so the reach was
10x10. Nothing anywhere reports a custom property set on an element that no rule
consumes; the harness's own measurement is what found it. (It is moot now -- see
above -- but it was a real hole while they were links.)

## And one the harness found in itself

The hydration probe reported **"NEVER BECAME INTERACTIVE in 60 attempts"** on a
page whose very next check typed into the same box and got results back. The
probe re-typed on every attempt and waited 100ms; the search input CLEARS ITS
OWN DEBOUNCE on each keystroke, which is what a debounce is, so a 220ms timer
reset every 100ms never fired. Typing once at t=0 is the other wrong answer --
it lands before hydration, no handler sees it, and the poll runs out on a page
that became interactive a beat later. Re-typing every attempt with a wait LONGER
than the debounce is what works: **interactive after 2 attempts, 1053ms**. A
probe that keeps interrupting the thing it is waiting for measures itself.

## Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  exporting the two `PUBLIC_SUPABASE_*` placeholders and running
  `svelte-kit sync`, per the missing-`.env` note.
- **`npm run verify:browser --route maps-viewer`: 12 route/width runs, 194
  measurements, 0 outside threshold**, at 375px and 1440px. Six route specs:
  the directory, a room, a unit, the thin stack, the staged route mid-walk and
  the staged route arrived. Two harness limits apply as always -- external
  requests are blocked, so text is measured in the fallback stack, and
  `prefers-reduced-motion` is `no-preference`.
- **The published-only boundary, mutation-proved in the permissive direction.**
  `maps_nodes_public_read` was changed from `status = 'published'` to
  `using (true)` in `0161`: **5 of 11** assertions in
  `tests/db/maps-viewer-anonymous.test.ts` reddened. The file was restored from
  a copy (never `git checkout --`), md5-verified identical, and the suite
  re-run green.
- **Un-publishing a node, at runtime against the real row**, is a permanent test
  rather than a one-off: the Mill Room goes to draft and vanishes from the
  payload, from the building plan, from the plan's unplaced list, from the
  chain, from the staged route AND from search -- while its own published mill
  is untouched, which is the sharp half. The before-measurement in the same
  test is the positive control, and the row is put back in a `finally`.
- **Full suite: 246 files, 5177 tests, all passing** (`main` measured 242 and
  5117 at the last integration). The one failure before the counts block was
  regenerated was `tests/derived-numbers.test.ts`, which is what that test is
  for.
- **Re-run after merging `origin/main` (4a5dcc6, migrations 0175-0178): 250
  files, 5241 tests, 6 failing in one file** --
  `tests/db/classroom-hall-pass-limits.test.ts`. **It is not this branch's and
  it is not the merge's**, and that was established rather than assumed: the
  same six fail on `origin/main` alone in a clean worktree, AND on this
  bundle's own base commit `5d79b6f` -- the tree that passed that file three
  hours earlier. **What changed is the clock, not the code.** The suite ran at
  19:00 UTC (12:00 Pacific) green and at 07:19 UTC (00:19 Pacific) red, and the
  file under it is `0174`'s daily hall-pass cap, whose window is the
  America/Los_Angeles calendar day. So it is a latent day-boundary defect in
  0174 or in its test that bites in a window shortly after LA midnight, on
  anybody's branch, and it will redden CI for whoever runs the suite then. It
  is outside this lane's files and is left alone; it is written down here
  because a session that quoted "6 failing" without this paragraph would look
  like it had broken the classroom.
- **`tools/browser-verify/README.md`'s counts block regenerated** on a clean
  tree by `npm run verify:readme`, never by hand: **86 specs over 44 routes,
  172 runs, 2390 measurements, 8 outside threshold, 416.5s**, selftest 64
  controls / 0 failures. The eight outside-threshold rows are **identical by
  identity** to the pre-bundle block (the `/dev/pathways` harness controls at
  both widths, the `/dev/classroom-interaction?case=typing` pair at both
  widths, and the two `/dev/coins` horizontal-scroll rows at 375) -- the six
  new specs contribute none, and none of the existing findings moved.

## What was NOT verified, and by what

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project; every claim about the real database above is a claim
  about the migration files applied to an embedded Postgres in the test
  harness.
- **No local Supabase stack.** This container has no Docker daemon and no WSL,
  so `/dev/login` and the real `/maps` route against a real database were not
  exercised. The route load itself is therefore verified only through the
  module it calls, driven against real policies in the db harness.
- **No photo was rendered.** The viewer's fixture carries no `maps_photos`
  rows, so `MapsItemCard`'s photo grid is asserted by unit test
  (`mapsPhotosFor`'s grouping and ordering) and never measured in a browser.
  `mapsPhotoUrl` is the shipped builder and is unchanged.
- **The launcher card was not seen.** There is no `maps` entry in `PORTAL_APPS`,
  so the accent rule paints nothing yet; every figure quoted for it is computed
  from the authored hex against the design system's own tokens, not read off a
  rendered card.
- **`prefers-reduced-motion: reduce` was not exercised.** Nothing on this
  surface animates, which is why -- but it is an absence, not a measurement.

## Deferred, and why

- **The registry entry and the mark.** `src/lib/portal-apps.ts` and
  `src/lib/marks/MapsMark.svelte` are outside this lane's files. Until they
  land, `/maps` is reachable only by typing the address.
- **`classroom-updates.json`.** The standing directive covers classroom-facing
  behaviour; IDEA Maps is its own subsystem and the file is outside this lane.
  A student-readable line about the map existing is worth writing when the
  launcher card lands, which is the change students will actually notice.
- **Revision history on the public side.** Still P2, per the spec and the
  prompt.
- **A `site` level in the viewer.** The model supports it (`MAPS_ROOT_KINDS`)
  and `mapsPlanView` draws whatever roots exist, so P3 is content plus a
  drawing pass, not a rewrite.
