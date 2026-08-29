---
title: "First-time orientation tour"
date: 2026-07-13
branches: []
migrations: ["0045"]
subsystems: ["Home page, launcher, tour"]
record_order: 78
---

A reusable spotlight tour system plus the portal's first-time walkthrough.

- **Engine (generic, reuse it for future tours):**
  `src/lib/tour/SpotlightTour.svelte` renders any ordered `TourStep[]` (types
  in `src/lib/tour/tour.ts`; step content is always a plain config array, never
  hardcoded in the engine). Per step it dims the page and cuts a gold focus
  ring (the existing `--gold` token, the tour accent everywhere) around the
  target, with a callout: title, body, "N of M" counter, Back / Next (Done on
  the last step), Skip tour, and a close X. Steps whose target selector is
  missing or zero-size at launch are dropped, so one config serves signed-in
  and anonymous pages. Position recomputes on resize and capture-phase scroll
  via rAF-or-timeout, and the callout height is a synchronous DOM read, never
  a ResizeObserver binding (both per the DrawingViewer throttled-window rule:
  a background window stops ticking rAF). Keyboard: Esc closes, Enter /
  ArrowRight advance, ArrowLeft goes back. Narrow viewports (<=640px) stack
  the callout below the target at full width. scrollIntoView uses 'instant',
  never 'auto', under reduced motion (the site's global scroll-behavior:smooth
  would win otherwise). Page interaction is paused behind a click-catcher
  while open; scrolling still works.
- **INTERACTIVE STEPS: `TourStep.interactive` lets ONE step hand its click
  through.** The pause above is a transparent `.tour-backdrop` at z-index 1100
  with default `pointer-events`, and it covers the whole viewport -- the page
  cannot outrank it, because `.legacy-index` sets `position: relative;
  z-index: 1` and so confines its own `z-index: 100` header to a context that
  sits at 1. So a step whose copy says "click it now" got a control the reader
  could not click. A step marked `interactive` adds `.pass-through`
  (`pointer-events: none`) to the backdrop **for that step only**; every other
  step keeps the pause byte-for-byte. The spotlight ring was already
  `pointer-events: none` and was never the blocker. If the click navigates or
  starts an OAuth redirect the tour needs no teardown -- the page is leaving.
  Verified both directions with real trusted CDP clicks: on the interactive
  sign-in step the button's own handler ran and the callout stayed open; on a
  non-interactive step a real click on an app-card link did not navigate.
- **Content:** `src/lib/tour/orientation.ts`, two phases in one continuous
  flow: `signin` (pre-auth, ONE step, the only `interactive` one, on the header
  Google control) and `home` (post-auth walk: hero, the class feed, the app
  grid, then four app cards -- Notebook, Coin Ledger, GAUNTLET, GREENLINE;
  spotlights only, no navigation). Targets are stable `data-tour` attributes on
  the home page and the AppLauncher cards (an app pinned AND grouped matches
  twice; querySelector's first match, the pinned row, wins).
  **`data-tour="apps"` is on `.app-grid` itself, NOT the `.launcher-bar` title
  strip** -- the step talks about the cards, so it has to ring the cards. (It
  briefly sat on a `.launcher-groups` wrapper; the flat grid made that wrapper
  unnecessary.)
- **Trigger (`src/lib/tour/HomeTour.svelte`, mounted on `/` outside the page
  wrapper):** an anonymous visitor with no `idea_tour_seen` localStorage flag
  auto-gets phase A once; a signed-in user whose
  `profiles.tour_completed_at` (0045, nullable timestamptz) is STRICTLY null
  auto-gets phase B after render settle. Undefined (0045 unapplied) fails
  soft: no auto-launch, no write; `fetchUserProfile` degrades stepwise
  (full -> no-tour -> legacy select). If the first-login PathwayPicker owns
  the screen, the tour waits for its `PATHWAY_PICKER_DONE_EVENT` (dispatched
  on choose and on "Choose later"). ANY exit (finish, Skip, X, Esc) counts as
  seen: signed-in stamps `tour_completed_at = now()` through the existing
  "update own profile" policy (0045 adds NO policies or grants); anonymous
  sets the localStorage flag. The header's persistent "Take the tour" control
  replays the full tour anytime regardless of both flags.
- **Dev harness `/dev/tour`** (404 in production, no auth / Supabase): mounts
  the REAL home page with a mock session and a stub client whose writes show
  in an on-screen log. Modes: `anon` (phase A auto-launch), `student`
  (phase B auto-launch), `done` (no auto-launch, replay only), `picker`
  (pathway picker first, tour waits). Reset button clears every flag. A
  signed-in mode is handed ONE fixture `classroom_sections` row -- it moves no
  tour step (every target sits on a wrapper that renders either way) and exists
  so the header class chip, which reads those same sections, has something real
  to name.

