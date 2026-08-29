---
title: "Digital notebook (pinning, activity sort, dark mode, copy, `0091`)"
date: 2026-08-12
branches: []
migrations: ["0090", "0091"]
subsystems: ["Digital notebook"]
record_order: 27
---

Migration `0091_notebook_pin_and_activity.sql` (apply manually after `0090`)
plus four additions to the notebook's own surfaces. The theme half needs no
migration at all.

- **PINNING IS A PROPERTY OF THE ENTRY, NEVER OF A FOLDER.**
  `notebook_entries.pinned_at` is a TIMESTAMP, not a flag, so several pinned
  entries hold a stable order among themselves (most recently pinned first)
  instead of falling back on whatever the secondary sort happens to be. It is
  global: a pinned entry rides to the top of All, of Unfiled, and of its own
  folder alike -- per-folder pinning would let an entry be pinned in one view
  and buried in another, which is a state nobody can keep in their head.
  `notebook_set_entry_pinned(p_entry_id, p_pinned)` is the one write, SECURITY
  DEFINER, taking NO student id: the caller is `auth.uid()` and the UPDATE's
  own WHERE clause is the whole authorization, so "you can only pin your own"
  is a property of the signature. **Re-pinning an already-pinned entry keeps
  the original stamp** -- a double click or a retry after a dropped response
  must not silently reshuffle the top of the feed -- while unpinning clears it,
  so a later re-pin is a genuinely new decision and sorts as one. Zero client
  write grants, as everywhere else in the notebook.
- **Pins sit ABOVE the sort, in their own group.** `sortEntries`
  (`$lib/notebook`) floats them; `NotebookView` then splits them into a
  "Pinned" heading rather than leaving them inside whichever date bucket they
  belong to -- a September page filed under "Today", or a feed that opens with
  an "Older" heading, is a heading that lies about what is beneath it. The pin
  control is a sibling of the disclosure button inside `.row`, which renders in
  BOTH states, so one control serves collapsed and expanded; the collapsed
  tab's own indicator is the filled glyph plus a gold left edge.
- **RECENT ACTIVITY IS A VIEW, COMPUTED IN THE DATABASE.**
  `notebook_entry_activity` is `greatest(upload_timestamp, max note revision,
  max photo)` per entry, `security_invoker = true` so it adds NO reach beyond
  what the caller could already read. Derived rather than a stored column
  maintained by triggers on two tables -- the `coin_balances` /
  current-note-revision doctrine -- because a trigger that stops firing leaves
  a feed sorting subtly wrong forever with nothing to catch it. **The load
  fetches it as its own query over the WHOLE notebook**, never derived
  client-side from the rendered subset: the feed paints a capped 30 entries
  while search and sort must cover everything (the same reasoning that made the
  render limit right and server-side pagination wrong). Date headings follow
  the sort (`groupByDate` gained a `stampOf` accessor), or an entry written
  today would file under "October".
- **`pinned_at` is its OWN rung in the load's widen-then-degrade chain**
  (FULL -> +folder -> +notes -> BASE): a project with 0088 applied and 0091 not
  is a real state, and folding the two together would drop folders to add a
  column that is not there yet. `pinsReady` false hides pinning AND the sort
  control together -- they are one migration -- and the feed keeps its original
  order. The pinned GROUP and the pin indicator are gated on it too (the
  folder-chip guard: a feed showing a "Pinned" heading with no way to unpin
  anything is one stale prop away from lying).
- **DARK MODE IS A SECOND PALETTE IN THE TOKEN LAYER, not component
  overrides.** Every `--nb-*` token already existed, so `notebook-theme.css`
  and all 16 notebook components are untouched by it -- the rule to keep is
  that a rule needing to know which palette is showing is a rule that should
  have been a token. It keeps the notebook's editorial identity rather than
  adopting the platform's terminal aesthetic: a WARM dark ground (`#16140f`,
  carrying the light theme's own ink hue, never cooled graphite), the same
  spacing, the same gold thread, warm off-white body type.
  - **Two selectors, one palette, edit them together** (colors.css, plus
    `--nb-shadow` in effects.css): `@media (prefers-color-scheme: dark)` on
    `.nb-root:not([data-nb-theme='light'])` is the default -- no JS, so no
    flash of the wrong theme on first paint -- and
    `.nb-root[data-nb-theme='dark']` is the explicit override, so each wins in
    its own direction. The preference (`notebook-theme.svelte.ts`, a
    three-state System / Light / Dark cycle in the masthead of BOTH notebook
    screens) is localStorage and per BROWSER on purpose: it is about the screen
    in front of you and the light in the room, not about who you are, which is
    also why it needed no migration.
  - **THE ACCENT NEEDED NO DEEPENING, which is the exact mirror of the light
    theme's note and was measured, not assumed.** Raw `#c8a848` reads ~2.2:1 on
    the light ground and had to become `#8a6d24`; on the dark ground it
    measures **8.02:1 on the page and 7.33:1 on a card**, so the dark
    accent-ink IS the platform gold. Measured dark palette: ink 15.45, ink-soft
    9.63, ink-faint 5.36, ok 8.79, error 7.38, warn 8.35, folder colours
    7.81-9.41. **A REAL BUG THE MEASURING FOUND:** a custom property's `var()`
    is substituted where the property is DECLARED, so `--nb-folder-gold:
    var(--nb-accent-ink)` and `--nb-folder-none: var(--nb-ink-faint)` resolved
    against the LIGHT values on `:root` and inherited that resolved colour down
    -- leaving a gold folder dot at 3.76:1 while every other colour was fine.
    Both are RE-DECLARED in each dark block; any future `--nb-*` token defined
    as `var(<another --nb-*>)` has to be too.
  - **The review grid's density and six status glyphs are a LOCKED CONTRACT
    and were verified unchanged**, not assumed: glyph, colour, Share Tech Mono,
    font-size, the 30.39px (1.9rem) cell box, padding, radius, wash background,
    td padding and border all compare byte-identical between palettes, as do
    the legend, the table width (1119.62px) and every row height. The ONLY
    thing that moves is the sticky name column's background (white ->
    `#201d16`). Those cells use PLATFORM tokens, not `--nb-*`, so they are
    identical by construction; on the dark ground they measure 5.04-9.17:1.
- **Copy an entry as plain text** (`entryPlainText`): title when it has a real
  one, date, then every note in written order -- CURRENT REVISION ONLY, via the
  existing `noteThreads`, because an entry's edit history is exactly what
  somebody pasting into a lab report does not want. Photos cannot come along,
  but silently dropping them would make a page of photographed work paste as an
  empty entry, so their count is stated (`[2 photos, not included]`). Async
  Clipboard API with a visible confirmation (the glyph swaps to a check and a
  "Copied" chip appears), since a clipboard write succeeds silently and an
  action with no feedback reads as a dead button; a denied permission or an
  insecure origin says so rather than failing quietly. Needs no migration, so
  it stays available even with 0091 unapplied.
- **Verified.** `tests/notebook-pin-activity.test.ts` (19 assertions, the
  notebook chain + 0088 + 0091 on real embedded Postgres) covers only what
  fails silently: **the file re-applying** (it runs the real file a SECOND and
  THIRD time against a populated schema and re-checks every guarantee
  afterwards -- 0088's lesson, learned in the field), whose entry can be pinned
  (another student and the section instructor both refused; no direct write
  path to `pinned_at`; no anon EXECUTE), what the activity view lets through
  (own rows yes, another student's no by list AND by id, the section instructor
  yes, an unattached teacher no, anon no grant, and the `security_invoker` flag
  itself), and what the timestamp MEANS (a later note or photo raises it, the
  newest revision wins, and an older-but-touched entry outranks a newer
  untouched one through the view's own ORDER BY). **MUTATION-CHECKED BOTH
  WAYS:** widening the pin RPC's WHERE clause reddens 3 tests, dropping
  `security_invoker` reddens 4; migration restored byte-identical and
  re-verified green. `npm run check` 0 errors, 0 new warnings; `npm test`
  421/421.
- **Browser-verified** in `/dev/notebook` and `/dev/notebook-review` (extended
  with a pin transport, an activity mirror and a `sim-0091` toggle): a pin
  applied INSIDE the Gearbox folder view moved that entry into a "Pinned"
  group above "Last week" *within that folder*, and the same entry showed
  pinned in All -- global, not per-folder. **The decisive activity check:** with
  46 entries and 30 painted, "Surveying with the theodolite" (created ~6 weeks
  back, carrying a note written days ago) was NOT RENDERED AT ALL under
  newest-first and jumped to position 0 under recent activity -- so the sort is
  provably over the whole notebook, not the painted subset; the pure rule was
  additionally driven directly (newest puts the newer untouched entry first,
  activity flips it, and with no map it falls back to the entry's own stamp).
  Copy on a 3-note entry whose middle note had been revised twice produced
  title + date + all three notes in order + `[1 photo, not included]`, with
  BOTH superseded revisions absent; an untitled entry copied date + photo count
  with no fabricated title line. Theme: the pane's own OS preference rendered
  dark with no attribute and no JS, an explicit light choice won over a dark OS
  and an explicit dark choice won over a light one, the preference survived a
  reload and a navigation to the review console, and turning 0091 off removed
  the sort control, the pin buttons, the pin indicator and the Pinned group
  while entries, search, folders and copy all kept working. A contrast sweep
  over 295 elements found nothing under 3:1 except the decorative `.dot`
  separators, which use `--nb-hairline-strong` and measure 1.42:1 in light
  against 1.54:1 in dark -- the same deliberate treatment, marginally better.
  375/375 at phone width with 44x44 pin and copy targets, and an armed
  `window.onerror` caught ZERO errors throughout.
  **NOT verified: the live Supabase project** -- the local `.env` is the
  placeholder project, so 0091 has never been applied anywhere; apply it by
  hand after 0090 and spot-check with two real accounts that a student cannot
  pin another's entry. **Also not verified: screenshots** -- the Browser pane
  in this environment does not composite, so every visual claim above is a
  measured computed-style or geometry read, not an eyeball.

