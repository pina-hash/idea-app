# The tab icon: Gear Key, static and live

Ledger 0396, part 1. Mr. Pina chose this icon for ideabosco.com from a design
board on 2026-10-16. The old favicon was the emblem shrunk down: at 16 px its
gear teeth and rim lines fell below one pixel and turned to gray mush, and on a
dark tab it nearly disappeared.

This page is the design record: what was decided, what each layer means, and
what every state looks like. The code is the authority on the exact pixels;
this page says why they are what they are.

## Three layers

| Layer | Question it answers | What it is |
| --- | --- | --- |
| The key | Is this IDEA? | The Plate's graphite machined key (`src/lib/classroom/plate.css`): a dark tray, a lit hairline edge and a gradient face. The same on every page. |
| The glyph | Where am I? | Home shows the emblem's gear in metal, its hub a mint LED. Every section shows its own glyph in its identity colour. |
| The lamp and the hairline | What is happening? | The lamp carries every event (unread, attention, live, saving). The hairline around the key's edge carries every duration (progress, done, live). |

## Decisions (2026-10-16, already made)

- **The icon is Gear Key** (`BASES.gearkey`). The other three bases on the board
  (a light key, a bare gear and an "iD" key) were the options he did not pick,
  and they are deleted from the port, not kept dormant.
- **The "//" slash motif is not current IDEA branding.** It appears nowhere in
  this work, including the harness.
- **No black circle or black square behind the key on any home screen.**
  Android's `any` icons are the key on transparency. iOS paints every
  transparent pixel of an apple-touch-icon black, so the iOS icon is the same
  machined key filling the whole tile: its lit hairline and face are drawn to
  iOS's own corner radius (22.37 percent of the side), with the corners filled
  with face, so it keeps the key's bevel and iOS never paints black. The
  maskable icon is the face edge to edge with the gear inside the 80 percent
  safe circle.
- **Live and Error look clearly different.** Live is the only state that
  animates on its own: the lamp and the hairline pulse crimson. Error is a
  steady amber warning triangle in the corner, no ring, lamp off. (As recorded.
  The same prompt's build list also gives saving a blink on its own timer, and
  the port follows the build list, so in the code live and saving both
  animate unprompted, and progress repaints only as its fraction moves. The
  states table below is what ships.)
- **Glyphs:**
  - GAUNTLET is a shaded isometric CAD part with a bored hole, because GAUNTLET
    is SolidWorks.
  - GREENLINE is a checkered flag, because it is a racing game.
  - Foundry is a crucible pouring into an ingot mold, the same idea as
    `src/lib/marks/FoundryMark.svelte`. Never a flame.
  - FRC Training is a robot chassis seen from above with red and blue bumpers.
    The FIRST logo is not drawn, because FIRST's usage rules forbid redrawing or
    recolouring its marks.
  - Certifications is a scalloped seal with a check.
- **Every shape and colour is the design module's, byte for byte.** Do not
  redraw, restyle or "improve" anything in `src/lib/tab-icon/geometry.ts`.
  Changing the icon on purpose is a design decision, then a new board, then a
  new golden fixture.

## States

Highest priority first. When several are raised at once, the highest shows;
between two of the same kind the one raised last shows, except unread, whose
counts add up.

| State | When it fires on this site | What it looks like |
| --- | --- | --- |
| Error | A save that stopped retrying, on any surface that saves through the one save state (`$lib/save-state.svelte.ts`). Stays until the thing that raised it clears it: a retry lands, the work is re-edited or discarded, or the surface goes away. | A steady amber warning triangle in the lower right corner, cut into the key with a dark notch. No hairline. Lamp off (Home's hub goes dark). |
| Live | A tournament match in progress (the match page); a GAUNTLET room round that is live (the room page). | The lamp pulses between crimson and dark crimson and the hairline pulses crimson, once a second, opening on the bright half. On a section the lamp sits in the lower right corner; on Home it is the gear's hub. Under reduced motion it holds the bright frame. |
| Unread | A certification notification not yet read (the root layout's `certUnread`); a note on your work in progress you have not seen yet (the progressive-feedback list, on the item page and in the grading console). | A crimson lamp. The document title gains `(n) ` with the total count, and an installed app shows the count as its badge. |
| Attention | Nothing yet: no "your turn" signal exists on the site today (see below). | A gold lamp. |
| Progress | A classroom file upload (attachments, hand-ins, answer keys, notice files) and a deck zip upload, while the bytes are moving. | A mint hairline around the key's edge that fills clockwise from the top centre as the bytes go. |
| Saving | A write in flight on any surface on the one save state (the notebook, HTML assignments, the composer, the grading console, the Maps editor and the rest). | On a section the corner lamp blinks mint twice a second, opening lit, so a save shorter than a quarter second still shows the mint lamp. Under reduced motion it holds the lit lamp. On Home the lit lamp is the resting mint hub itself (the drawing's own property), so saving there reads as the hub blinking dark, and under reduced motion Home's saving looks like resting. |
| Done | The same save state, the moment a write is acknowledged. Clears itself after 4 seconds. | A full mint hairline around the key. The tab goes straight from saving to done (and from saving to error): the save state raises the next status before it clears saving, so the resting icon never shows between them. |
| Offline | The browser's own `offline` event, until `online`. | The whole key dims: a darker hairline and face, Home's gear flat gray, the lamp off. A section's glyph turns gray wherever it is drawn in its ink. Three keep fixed colours because the design module draws those parts in fixed colours: FRC Training keeps its red and blue bumpers and its bone wheels, Foundry its bone crucible and mold, and GREENLINE its bone pole (with its dark flag squares). The drawing is the design's and is not changed for this; graying them would be a new board and a new golden fixture. |
| Resting | Nothing raised. | Home: the metal gear with its mint hub. A section: its glyph, no lamp, no hairline. |

## Sections

The section comes from the page's path by longest prefix, on a path boundary
(`sectionForPath` in `src/lib/tab-icon/sections.ts`). Anything no section
claims is Home.

| Section | Prefixes | Glyph | Ink |
| --- | --- | --- | --- |
| Home | `/` and every unclaimed path | The emblem's gear, mint hub | metal |
| Classroom | `/classroom`, `/reference` | A mortarboard | `#D3C68E` |
| Notebook | `/classroom/notebook`, `/notebook` | A notebook with rings and ruled lines | `#E0B060` |
| IdeaCAD | `/ideacad` | An isometric cube | `#EAE6D8` |
| Armory | `/armory` | A padlock | `#A79BE8` |
| Maps | `/maps` | A map pin | `#40E3B1` |
| Coins | `/coin-desk`, `/coin-balance`, `/coins` | A stack of coins | `#C8FF00` |
| GAUNTLET | `/gauntlet` | An isometric part with a bored hole | `#00FF41` |
| VANGUARD | `/vanguard` | An arrowhead ship | `#C8FF00` |
| GREENLINE | `/greenline` | A checkered flag | `#2AE57E` |
| Tournaments | `/tournaments` | A trophy | `#0FBE7A` |
| Foundry | `/foundry` | A crucible pouring into an ingot mold | `#F6952F` |
| FRC Training | `/frc` | A chassis with red and blue bumpers | `#ED3B42`, `#2F8CF0` |
| Certifications | `/certifications` | A scalloped seal with a check | `#8FE08A` |
| Admin | `/dashboard`, `/admin` | A shield | `#78B870` |

Two consequences worth knowing. `/classroom/notebook` is Notebook because the
longer prefix wins, while a class's own Notebook tab, `/classroom/<id>/notebook`,
is Classroom: it is a tab inside one class, beside its Stream, Grades and
People tabs. And the Coin Ledger at `/coins`, VANGUARD at `/vanguard`, the
legacy assignments, HTML assignment documents and Foundry bundles serve their
own HTML documents outside the root layout, so the live icon never runs there
and a product that set its own icon keeps it.

## Rules

- **A product that sets its own icon keeps it.** The live icon applies only
  where the root layout's icon is the one in force. If a page under the root
  layout ever adds an icon link of its own, the painter stands down, restores
  the static file and drops the title prefix until that link is gone.
- **The painter only rewrites the `href` of the SVG icon link** that
  `src/app.html` declares. It never adds or removes a link and never touches
  the ICO link, which stays the static file for a browser that does not take
  SVG icons. The ICO is declared `sizes="32x32"`, not `sizes="any"`: with
  `any`, Chrome downloads both files and can pick the ICO over the SVG, which
  would freeze the tab on the static drawing.
- **At rest on Home it writes nothing.** `static/IDEA/favicon.svg` is
  byte for byte `icon('gearkey', 'home')`, so the painter puts the original
  `href` back instead of a data URL.
- **Motion:** only live (pulse) and saving (blink) animate on a timer, and
  progress follows its fraction as the upload reports it. At most four repaints
  a second, never a repaint when the drawing did not change, and every timer
  stops the moment its state ends. Each animated state's cycle opens on its
  lit frame (`framePhase` in `src/lib/tab-icon/live.ts` starts live and saving
  at different points of their cycles, because one shared start that opens
  live bright opens saving dark), and starts again lit whenever the animated
  state changes. Under `prefers-reduced-motion: reduce` that lit opening frame
  is painted and held (`stillPhase`, never the drawing's default phase 0,
  which sits on the saving lamp's zero crossing and draws it dark), and
  nothing repaints on a timer. Only the phases are chosen here; the drawing
  is the design module's.
- **The title prefix is idempotent.** Every page sets its own title through
  `<svelte:head>`, so the painter watches `<head>` and re-applies `(n) ` to
  whatever the page last set, never doubling it. Clearing restores the plain
  title.

## Raising a status from a page

```ts
import { raise } from '$lib/tab-icon/live';

$effect(() => {
	if (!somethingIsHappening) return;
	const tab = raise('live'); // or 'unread' with { n }, 'progress' with { p }
	return () => tab.clear();
});
```

`raise` is safe anywhere: on the server, or with nothing mounted, it returns an
inert handle. A handle's `update({ n, p })` changes the count or the fraction
without raising again. Wire only a signal that already exists, and clear it on
every way it can end. To hand the tab from one status to the next (saving to
done, saving to error), raise the next one before clearing the last: the
painter paints each change as it lands, so a clear first shows the resting
icon for a frame in between.

## Signals not wired, and why

- **Attention ("your turn").** No such signal exists: nothing marks a
  tournament match as called for a particular player, and the classroom has no
  "resubmit requested" state. Deriving one would be inventing a signal.
- **A running timer** (GAUNTLET's run clock, a certification exam's countdown,
  the Live tab's class timer). The design has no clock state; progress was
  designed for a transfer's known fraction. A clock-driven hairline repaints on
  a timer, which the reduced-motion rule forbids. GAUNTLET's clock counts up
  with no limit, so it has no fraction at all, and an exam tab is one the
  student may not leave without a lockdown flag, so its tab icon has no reader.
- **The live class.** The Live tab is a teacher's control view with no "in
  session" state to observe; pulsing for as long as the page is open would
  make the pulse mean nothing.
- **Recording.** Dictation is the only microphone use; it runs while the person
  is looking at the field they are dictating into, and the browser already
  draws its own microphone indicator.
- **The deck's unpacking stage.** It is server work counted in files after the
  upload, not a transfer, and a second fill of the same hairline would read as
  a restart.
- **Queues and counts that are the page's own subject** (the Foundry review
  queue, the coin desk queue, the feedback inbox's Needs you count, a
  proctor's flag count). None has a seen state, so a lamp could never go out,
  and none is re-read while the tab is hidden.
- **A certification exam release.** The kit page reads it once at load and
  never in the background, so a hidden tab cannot learn of a release.

## Where the code is

| Piece | File |
| --- | --- |
| The geometry (the only place it is edited) | `src/lib/tab-icon/geometry.ts` |
| Path to section | `src/lib/tab-icon/sections.ts` |
| The status registry (priority, the done timer) | `src/lib/tab-icon/status.ts` |
| The painter and the `raise`/`clear` API | `src/lib/tab-icon/live.ts` |
| The root layout mount (path and `certUnread`) | `src/lib/tab-icon/TabIcon.svelte` |
| The static files | `npm run tab-icon:build` (`tools/tab-icon/build.mjs`, `tools/tab-icon/png.mjs`) |
| The golden fixture | `tools/tab-icon/golden.mjs` writes `tests/fixtures/tab-icon-golden.json` from the original design module |
| The harness | `/dev/tab-icon` (every glyph and state at 16 and 32 px on six tab grounds, the home-screen icons, keys that drive this tab's real icon) |
| Tests | `tests/tab-icon-geometry.test.ts`, `tests/tab-icon-status.test.ts`, `tests/site-icons.test.ts`, `tests/dom/tab-icon-*.test.ts` |
