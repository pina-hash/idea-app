---
title: "Landing the maps viewer: the merge, the launcher card, the mark, and the two owed classroom updates (`claude/land-maps-viewer-sk70is`, no migration)"
date: 2026-09-03
branches: [claude/land-maps-viewer-sk70is, claude/idea-maps-public-viewer-hxz2cx]
migrations: []
subsystems: ["IDEA Maps", "Visual theme", "Components and UI", "Access model", "Testing", "Content, copy and legacy"]
---

Prompt 0020 built the public viewer at `/maps` and landed the accent rule for its
launcher card, and said in that rule's own comment that the rule paints nothing:
there was no `maps` entry in `PORTAL_APPS` and no `MapsMark.svelte`, so the surface
was reachable only by typing the address. This bundle merges that branch into
`integration` and lands the three things that make the card exist. It writes no
migration and revises nothing 0020 built.

## The README conflict, which is what this bundle's first half was for

`claude/idea-maps-public-viewer-hxz2cx` conflicted with `integration` on exactly one
path, `tools/browser-verify/README.md`, and on nothing else. 0020 regenerated that
block in its OLD single-region shape while prompt 0019 was splitting it into a cheap
static region and an expensive measured one, so the two sides are different
STRUCTURES rather than different numbers and merging them by hand would have produced
a block neither generator could rewrite.

**THE RESOLUTION TOOK 0.201 SECONDS AND NO BROWSER, WHICH IS 0019's FIX WORKING ON ITS
FIRST REAL TEST.** `integration`'s side was taken whole and unread -- it is the side
carrying the split -- and `npm run verify:counts` then rewrote the static region from
a tree read alone: 80 to 86 route specs, 43 to 44 distinct routes, 75 to 76 `/dev`
pages, 160 to 172 route/width runs. The diff is five lines, all inside
`counts:static:*`, and the measured region is untouched.

**AND THE MEASURED HALF WAS LEFT STALE ON PURPOSE UNTIL THE END, WHICH IS THE PROPERTY
THE SPLIT EXISTS TO GIVE.** Confirmed rather than assumed: with the static region
saying 172 runs and the measured region still reporting 160 on commit `f5028e6`,
`tests/derived-numbers.test.ts` was 10/10 green. A merge on this file is now a
sub-second script; the six-minute run is a deliberate act at the end of a bundle.

## The registry entry, and the one decision in it

**IT CARRIES NO `requiresAuth`, AND THE FLAG DOES NOT MEAN WHAT ITS ABSENCE HERE
LOOKS LIKE IT MEANS.** `visibleApps(isAdmin)` filters on `adminOnly` and on nothing
else, so `requiresAuth` has never hidden a card from anyone: it is a CTA switch
(`app.requiresAuth && !signedIn ? 'Sign in' : app.cta`) plus a click interception
that routes to `onRequireSignIn`. Omitting it is therefore not "making the card
public", it is declining to put a sign-in wall in front of a page that already
answers an anonymous GET. The spec's section 2 locks read access as fully public,
`/maps` is not in `authedPrefixes`, and 0161 through 0165 grant every read the viewer
makes to `anon`. Three cards already omit the flag for the same reason: the Coin
Ledger, VANGUARD and Tournaments are each reachable signed out.

**SO MAPS IS NOT "THE FIRST GENUINELY PUBLIC SURFACE IN THIS LIST", which is what the
prompt expected to find.** It is the fourth. That was worth checking rather than
accepting, because the prompt's framing invited inventing a visibility mechanism for
a case the registry already handles by saying nothing.

It sits third, after Classroom and My Notebook and above the economy block. The
curated order runs class work, then the personal record, then the economy, then
training and games; a map you consult standing at a toolbox is class work, and the
shelf flow at `/maps/edit/shelf` is phone-first for exactly that reason.

## The mark

**A STORAGE UNIT SEEN FACE ON, WITH ONE COMPARTMENT FILLED, AND DELIBERATELY NOT A
LOCATION PIN.** The refusal is the data model rather than taste: IDEA Maps holds a
CONTAINMENT CHAIN, not coordinates (spec section 2, "An item points at its container;
geometry belongs to containers"), so a pin claims a point on the earth and says
nothing about what a thing is inside of, which is the only question this app answers.
A pin is also the most-drawn glyph on the web, so it would have said "map" and nothing
about which map.

What is drawn instead is the view the app is actually about. Every storage unit
carries an authored front elevation of its compartments, and that elevation is the
level a search lands on -- the descent runs directory, room plan, unit elevation,
compartment, item card. The glyph is that elevation: a two-by-three unit face with
the found compartment filled, standing on a floor. **The floor line and the feet are
what keep it from reading as a window**; without them a subdivided rounded rectangle
at 32px is a pane or a spreadsheet.

The found compartment is FILLED rather than outlined because an outline inside a cell
that size puts two 1.5 strokes within a couple of user units of each other and turns
to mud at the launcher's 24px icon box. The motion quotes the staged route, which is
the one live thing the viewer does: a search result walks the chain and marks each
level on the way down, so the unit lights, then the shelves, then the found
compartment rings and settles. That is TournamentMark's dip-and-return walk, borrowed
because a bracket advancing and a route resolving are the same shape.

**NO PAUSE OBSERVER, WHICH IS THE MAJORITY IDIOM AND NOT AN OVERSIGHT.** Ten of the
eleven marks that predate this one are pure CSS; FoundryMark is the single exception
and carries an `IntersectionObserver` because it scales down the shell's MoltenSeam
contract. Four opacity walks and one small scale do not buy a script block.

Pure `currentColor` with no literal anywhere, so the card's `--acc-ink` drives it.
**`GreenlineMark` is the one mark that hardcodes a hex** (`#eafff3`, three sites) and
is not the pattern to copy; `GauntletMark` and `VanguardMark` use `var(--gold, ...)`,
which is a token with a fallback and a different thing.

## The classroom updates, and what was actually owed

**0018 DRAFTED ITS ENTRY AND 0020 DID NOT.** 0018's history entry carries a
ready-to-paste object and it is appended verbatim, tags included. 0020's says only
that "a student-readable line about the map existing is worth writing when the
launcher card lands", which is this bundle, so that entry is written here rather than
carried. The prompt expected both to have drafted text; only one had.

The file is at the REPO ROOT, `classroom-updates.json`, not under `static/` -- the
prompt named `static/classroom-updates.json`, which does not exist.
`src/lib/classroom/updates.ts` imports the root file directly and CLAUDE.md says the
same. Both entries are a pure append: 18 lines inserted, 0 removed, and the 114
existing entries verified byte-identical afterwards.

## Measured

- **`svelte-check`: 0 errors, 37 warnings**, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`. Re-derived after
  `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported, per the
  fresh-checkout rule.
- **Full suite: 246 files, 5187 tests, all green.** 0020 reported 246 / 5177 on its
  own branch; the +10 is this bundle's 2 new tests plus 8 that 0018 and 0019 added
  inside files that already existed. Test-file count reconciles exactly:
  `integration` 242, 0020's branch 246 (its four maps files), merged tree 246.
- **The six maps-viewer specs, driven alone: 12 route/width runs, 194 measurements,
  0 outside threshold**, which is 0020's claim reproduced exactly.
- **The full harness run on a clean tree: 172 runs, 2390 measurements, 4 outside
  threshold, 395.3s, on `ca5d950`.** Selftest 64 controls (32 negative, 32 positive),
  0 instrument failures. **The 4 is four fewer than 0020's block and it is the right
  four by identity** -- the `/dev/classroom-interaction?case=typing` presence and
  order-result rows at both widths are gone, which is 0018's fix surviving the merge.
  The remaining four are unchanged from `integration`. Two cross-checks fall out of
  the deltas: 160 to 172 runs is the six maps specs at two widths, and 2196 to 2390
  measurements is +194, exactly what those specs reported in isolation.
- **The card itself, on the real launcher (`/dev/home-order`, which mounts the
  shipping `+page.svelte`), at both widths.** 10 cards render where 9 did.
  `--acc-primary` resolves `#40e3b1` and `--acc-secondary` resolves `#c8a848`.
  Card and tap target 343x45.2 at 375px and 251.8x45.2 at 1440px, **min dimension
  45.2px against the 44px floor** at both. Title ink `rgb(64, 227, 177)` on
  `rgb(26, 42, 26)` measures **9.24:1**, which is 0020's predicted `--bg1` figure
  landing on the real ground. Mark box 24x24, visible, 4 elements. **0px horizontal
  overflow at both widths.** Card text reads "IDEA Maps  Find".
- **The reduced-motion contract, both directions.** Under
  `prefers-reduced-motion: reduce` all four mark elements report opacity 1,
  `transform: none`, `animation-name: none` -- nothing hidden at rest. Under
  `no-preference` three of the four carry their animations and were caught
  mid-cycle (0.97, and 0.66 under a 1.107 scale), with the floor static by design.
- **The two new tests were mutation-proved.** Removing the `maps` entry from
  `PORTAL_APPS` reddens the registry test with its own message; removing the
  `<MapsMark />` branch from `AppLauncher` reddens the mark test. Both files were
  saved with `cp` first and restored from those copies, md5-verified identical
  (`04fc51e8...`, `fd5c4147...`), never with `git checkout --`.
- **A signed-out visitor, measured on the launcher's own server render with `claims`
  absent**: 10 cards, the maps card present, the CTA is "Find" and not "Sign in",
  no "Sign in to enter." hint, and an SVG mark inside the card.

## Not verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder and this session had no local stack; every claim about `anon` grants
  is read from the migration files and from 0020's own db-harness work, not
  re-measured here.
- **No signed-in production surface was opened.** `/dev/home-order` supplies
  `claims` from a fixture; the anonymous case was measured through a server render
  rather than a real signed-out session.
- **The mark was never seen by a person.** Everything reported about it is geometry,
  computed style and opacity read back from Chromium 141.0.7390.37. Whether a
  cabinet-with-a-marked-drawer reads as "the map" to a student standing in the shop
  is Mr. Pina's call and cannot be measured here.
- **An empty map still proves nothing about navigation**, which is 0020's standing
  point and survives unchanged. None of this is really exercised until one real room
  is published.

## Left undone, and one thing to fix

- **`src/routes/dev/marks/+page.svelte` LISTS ELEVEN MARKS AND THERE ARE NOW TWELVE.**
  `MapsMark` is not in it, and `tools/browser-verify/routes/marks.mjs` pins
  `expectPresent: 12, maxPresent: 12` cells (eleven marks plus FRC), 22 component
  SVGs, and a hand-maintained `GATED` list of eleven ids. Both files are outside this
  bundle's stated ownership so neither was touched, and **the spec stays green while
  covering less than it claims to** -- which is the shape of gap that goes unnoticed.
  The reduced-motion contract for `MapsMark` was measured directly on the launcher
  instead, reported above, but the harness should gain the twelfth cell and the
  three pinned numbers should go to 13 / 24 / twelve ids.
- **`AppLauncher.svelte` NOW CONTAINS A COMMENT THAT IS FALSE.** 0020's accent rule
  still reads "THERE IS NO `maps` ENTRY IN `PORTAL_APPS` YET AND THIS RULE PAINTS
  NOTHING UNTIL THERE IS", and there is one now. It was accurate when written and is
  stale only because of this bundle, but the prompt is explicit that 0020's content
  is to be carried and not revised, so it is reported rather than edited. It is the
  one paragraph in the merged tree that contradicts the tree.
- **`tests/portal-apps*.test.ts` does not exist**, though the prompt lists it as
  owned. The maps assertions went into `tests/home-order-and-accent.test.ts`, which
  is where the launcher's registry and accent claims already live; a second file
  asserting the same registry would be the duplicate-rule problem.
- **The `case=fresh` oracle gap 0018 reported** is untouched and is still its own
  bundle.
