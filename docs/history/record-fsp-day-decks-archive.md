---
title: "FSP day decks (archive)"
date: 2026-07-15
branches: []
migrations: []
subsystems: ["FRC / FSP / feedback"]
record_order: 77
---

`/fsp/day1`, `/fsp/day2`, ... are **archive viewers** for each day's slides,
not live presentation controllers. Presentations run live from **Claude
Design** externally (see "FSP live Q&A" above); these routes just host the
exported deck for later review by staff or students. Shared host:
`src/lib/fsp/FspDayArchive.svelte` (`day`, `slidesSrc`, `data` props) — the
auth gate, iframe, presenter toolbar, and `F`-key fullscreen all live there
once, so `src/routes/fsp/day<n>/+page.svelte` is a two-line wrapper
(`<FspDayArchive day={2} slidesSrc="/fsp/day2/index.html" {data} />`). This
was factored out of the original `/fsp/day1` page when Day 2 landed; a future
Day 3 needs no new host logic, only its own slides + a wrapper page.

- **`FspDayArchive.svelte`** is open to **any authenticated Bosco Tech
  account** (`@boscotech.net` students or `@boscotech.edu` staff, not
  staff-only — students should be able to review the archive), gated
  **in-page** like the rest of `/fsp/*` (the host routes are NOT in
  `authedPrefixes`; signed-out sees a sign-in card, wrong-domain sees a
  switch-account card). When gated in it renders a full-viewport `<iframe
  src={slidesSrc} allow="fullscreen">` (the deck owns its own arrow / PageUp /
  PageDown / space keyboard nav, so a presentation clicker drives it natively;
  the iframe is focused on load so the clicker works immediately). A
  page-level **`F`** key toggles native fullscreen on the deck root. Neither
  deck broadcasts any postMessage to the host page — Q&A lives entirely on
  `/fsp/live`, opened separately.
  - **Toolbar** (floats bottom-center, minimal/dark, hidden the moment
    fullscreen is active via a `fullscreenchange` listener): **Present**
    fullscreens the deck **iframe directly** (`iframeEl.requestFullscreen()`), so
    every bit of page chrome — the toolbar included — falls away and only the
    slides fill the screen; Escape exits fullscreen natively and the toolbar
    returns. **Student View** opens the shared `FspStudentPreview` phone-frame
    modal of `/fsp/ask`. Distinct from the `F` key, which fullscreens the deck
    ROOT rather than the bare iframe.
- **Day 1 slides live at `static/fsp/day1-slides.html`** — the Claude Design
  **standalone export** ("IDEA FSP Deck (standalone).html"), copied in as-is (a
  ~28MB self-contained bundle: a small "bundler" wrapper that unpacks a
  gzip+base64 asset manifest into blob URLs, then renders a React/Babel-standalone
  app whose `deck-stage` custom element is the slide player). Served straight
  from `static/` at `/fsp/day1-slides.html`, fully self-contained (no CDN,
  CSP-safe). **Do not rebuild or re-theme the slides**; if the source deck
  changes, re-export and re-copy the file.
- **Day 2 slides live at `static/fsp/day2/`** — pulled via the `claude_design`
  MCP directly from the **project's raw files** (`DesignSync`), not a
  standalone export: `index.html` (the `.dc.html` template, renamed) plus its
  sibling runtime (`deck-stage.js`, `ds-base.js`, `support.js`,
  `image-slot.js`), the bound design-system tree
  (`_ds/idea-design-system-<id>/`: `styles.css`, `_ds_bundle.js`, `tokens/*.css`
  — provides the `IDEADesignSystem_<id>.AnimatedLogo` / `.DeckFooter`
  components the deck imports), and the two binaries the deck actually
  references (`idea-gear.png` + `idea-logo-text.png`, reused byte-for-byte
  from `static/fsp/assets/` since they are the same shared IDEA emblem;
  `jarvis-ironman.jpg`, deck-specific). All copied in as-is, same "do not
  rebuild" rule as Day 1. **`.image-slots.state.json` is a stub `{}`,
  not the real sidecar:** `image-slot.js` fetches this file document-relative
  to persist per-slot pasted images, but the real state file embeds ~20
  base64-encoded photos and exceeds the MCP file-read tool's 256 KiB cap, so it
  cannot be pulled through that path. Every `<image-slot>` on Day 2 (arena,
  robot, per-pathway photos, facility shots, etc.) therefore renders its
  authored text placeholder instead of a real photo — a deliberate fail-soft
  degradation, not a bug. If real photos are added later, either re-run the
  DesignSync sync once the project's sidecar is small enough, or replace the
  stub with the real file fetched some other way (e.g. exporting through the
  Claude Design UI instead of the API). This gap does not apply to Day 1
  (its bundle already has every image baked in as blob URLs).
- **Superseded native rebuild:** `src/lib/fsp/FspDeck.svelte` +
  `src/lib/fsp/day1-slides.ts` were an earlier native-SvelteKit rebuild of the
  Day 1 deck (and, later, of its slide-13 live embed). They are no longer
  wired to any route and remain in the tree only as dead code; do not extend
  them.
- **Slide 12 QR** inside the Day 1 export points at the `/fsp/ask` submission
  page (the standalone deck embeds its own QR; the separate committed
  `static/fsp/fsp-ask-qr.svg` remains available for other uses).
- **Dev harnesses `/dev/fsp-day1` / `/dev/fsp-day2`** (404 in production, no
  auth / Supabase): each shows its hosted deck iframe with the real toolbar
  (Present + Student View), matching the real page now that it is an archive
  viewer with no live-feed overlay or postMessage bridge to simulate. Neither
  harness routes through `FspDayArchive` (they predate/bypass the auth gate on
  purpose); a future Day 3 harness should copy `/dev/fsp-day2` and swap
  `SLIDES_SRC`.

