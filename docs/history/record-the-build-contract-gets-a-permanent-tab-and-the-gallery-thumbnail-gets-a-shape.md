---
title: "The build contract gets a permanent tab, and the gallery thumbnail gets a shape"
date: 2026-08-27
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 157
---

A code-only bundle scoped to `FoundryGallery.svelte`, `FoundryDetail.svelte`,
`FoundryShell.svelte`, `nav.ts` and `forge.css` (an explicit file ownership boundary
for this session; `FoundryInspector.svelte`, `ReviewQueue.svelte`, `transports.ts`
and everything under `$lib/server` were out of scope and untouched).

### The build contract was unreachable once anything published

`locateFoundry` folded `/foundry/contract` into the `submit` place, which is not a
link anywhere -- it only decides which TAB lights up once you are already on the
page. The one actual link to the contract lived inside `FoundryGallery`'s
`apps.length === 0` branch, so the document every student needs BEFORE they build
anything had exactly one way in, and that way disappeared the moment a single app
published anywhere on the site.

- `FoundryPlace` gained `'contract'` as its own value; `locateFoundry('/foundry/contract')`
  now answers `'contract'` rather than `'submit'`. `/foundry/starter` stays folded
  into `submit`, because it is a download reached WHILE publishing and nowhere else
  -- the asymmetry is deliberate and both directions are pinned in
  `tests/foundry-shell.test.ts`.
- `FoundryShell`'s tab bar gained a permanent "Build contract" tab, unconditional on
  `isAdmin` and on which other tab is active, between "My apps" and "Publish".
- `FoundryGallery` gained a second, always-rendered link in its own header (`.fdy-gal-head`),
  so the contract is reachable from the gallery component itself in both the empty
  and the populated state, not only through the shell that wraps it. The existing
  empty-state link was left in place rather than removed.
- The `/foundry/contract` page (`FoundryContract.svelte`, out of scope) needed no
  change: it already carries its own "Back to publishing" crumb, which is still
  correct now that the contract has a second way in.

### The gallery thumbnail: what was actually wrong, and what was not

Investigated before changing anything, per the request. The cover pipeline
(`FoundrySubmit.svelte`, out of scope) applies no resize, no compression and no
aspect-ratio constraint: whatever image a student picks is uploaded and served
verbatim. That rules out "missing" (a null `cover_path` was already rendering its
own deliberate placeholder) and rules out server-side cropping or resampling --
there is no server-side image processing in this pipeline at all.

What was wrong was the THUMBNAIL BOX, in `FoundryGallery.svelte` alone:

- **Wrong aspect ratio, not wrong fit.** `.fdy-card-cover` was a 4.5rem (72px)
  square with `object-fit: contain`. A cover is a screenshot of a running app --
  landscape by construction, a browser or a phone frame is never square -- so a
  typical cover was letterboxed down to a thin strip a few pixels tall inside that
  square, which reads as broken or missing even though it is neither. The existing
  comment choosing `contain` over `cover` was read and left standing: `contain`
  is correct (cropping to fill would hide the cut-off edge, which is the one thing
  a cover exists to show), the box shape fighting it was the defect, not the
  fit mode.
  - Fix: the cover box is now `width: 100%; aspect-ratio: 16 / 9`, a full-width
    banner above the card body rather than an icon beside it. 16:9 was chosen as
    the shape actually produced by what gets uploaded (browser windows, phone
    screens in either orientation, desktop app windows all sit near it), not as a
    round number.
- **Upscale risk, not confirmed upscaling.** At 72px nothing could visibly
  upscale (the box was smaller than almost anything a student would upload), but
  enlarging the box to a real preview size reintroduces the risk: `contain` scales
  a cover UP to fill its box when the cover is smaller, which is the
  soft-and-pixelated failure mode. Switched both the gallery thumbnail and the
  detail page's hero cover (`FoundryDetail.svelte`, same reasoning, same fix) from
  `object-fit: contain` to `object-fit: scale-down`, which is identical to
  `contain` for anything at or above the box size and never enlarges anything
  smaller than it.
- **Coverless tiles already looked deliberate** (the app's own initial, centered,
  no stock "no image" graphic) but were sized for the old 72px box. The initial
  now renders at 2.75rem inside the 16:9 banner, so a coverless tile stays
  legible and reads as a chosen placeholder rather than a shrunken accident.

### Admin management beyond delete: hide/unhide already shipped, editing did not, and both are out of this session's file scope

Investigated rather than assumed, per the request:

- **Hide and unhide already exist, fully wired.** `foundry_set_app_hidden` (0130)
  is the RPC, gated on `is_admin()` inside its own body, and `FoundryInspector.svelte`
  already renders both directions (Hide with a required reason, Restore, both
  two-step armed confirms) through `FoundryReviewTransports.setHidden`. The serving
  path already refuses a hidden app (`_foundry_app_in_population`). Nothing here
  needed to be built; the task's own instruction to "confirm both and reuse them
  rather than inventing a second state" is satisfied by inspection -- there is
  exactly one hidden state and one control pair for it, already admin-gated and
  already mutation-proven in `tests/foundry-policies.test.ts` (not owned by this
  session, not touched).
- **Editing an app's title, description and cover has DATABASE support already**
  (`foundry_update_app_metadata` accepts `v_app.owner <> v_uid and not
  public.is_admin()` as its only refusal, i.e. an admin may already call it for
  any app) but NO UI wiring for an admin caller. `FoundryMineTransports.saveField`
  / `.uploadCover` exist for the OWNING student on `/foundry/mine`
  (`FoundryMine.svelte`); `FoundryReviewTransports` carries no equivalent, and
  `FoundryInspector.svelte` -- the admin-only inspector column role parity
  requires this kind of control to live in (`IDEA_INTERFACE_STANDARDS` 2:
  "Instructor-only content lives in a visually distinct inspector") -- renders no
  edit form.
  - **This was not built.** `FoundryInspector.svelte`, `ReviewQueue.svelte`,
    `transports.ts` and `src/routes/foundry/review/+page.server.ts` are all
    outside this session's owned file list, and `FoundryDetail.svelte` -- which
    IS owned -- states explicitly in its own header comment that it carries no
    staff flag and no staff branch; adding admin edit affordances there would
    both violate that invariant and break the `renders the SAME detail markup
    the gallery renders` assertion in `tests/foundry-gallery.test.ts`. The
    correct home for this control is `FoundryInspector.svelte`, beside Hide and
    Delete, via a new `saveField`/`uploadCover` pair on `FoundryReviewTransports`
    wired through the review route -- deferred to a session that owns those
    files.

### Tests

- `tests/foundry-shell.test.ts`: generalized the two assertions that pinned the
  old "contract nests under submit" behaviour (a legitimate change breaking a
  written-down assertion, per the verification standard); added coverage that the
  Build contract tab renders for both roles, marks itself current only on the
  contract page, and does not displace any other tab.
- `tests/foundry-gallery.test.ts`: added coverage that the contract link survives
  in the gallery component itself in both the empty and the populated state
  (including with an app open in the detail pane), and that a coverless tile
  renders the deliberate placeholder state with no `<img>` at all -- both
  directions, with an image-bearing sibling card as the positive control -- plus a
  static assertion that the stylesheet ships `scale-down` rather than plain
  `contain`.
- Full suite: **120 files, 2741 tests, all green** (2651 files/tests at the
  previous bundle's own count; net +90 tests across the run, +39 of them in the
  two files this bundle touched).
- **`svelte-check`: 0 errors, 37 warnings, unchanged** before and after (re-derived
  both ways via `npx svelte-kit sync && npx svelte-check`, with a stash/pop across
  this bundle's six changed files to measure the true before state rather than
  trusting the figure written down in `CLAUDE.md`).

### What was NOT verified

- **No browser or screenshot pass.** Every claim above is either a static
  assertion over the shipped markup/CSS (`svelte/server` SSR renders in
  `tests/foundry-gallery.test.ts` and `tests/foundry-shell.test.ts`) or read
  directly off the stylesheet. The 16:9 banner's actual appearance with a real
  uploaded screenshot, the coverless placeholder's legibility, and no-horizontal-scroll
  at 375px and 1440px were reasoned from the CSS (percentage width, `aspect-ratio`,
  `min-width: 0` already present on every ancestor in the existing grid) rather
  than measured in a rendered browser -- this container has no browser pane and no
  live Supabase project to source a real cover image from.
- **Nothing was run against the live Supabase project.** The local `.env` used to
  reach the `svelte-check` baseline is the placeholder `example-ref` project, per
  `CLAUDE.md`.

### Deferred

- **Admin editing of an app's title, description and cover**, via
  `FoundryInspector.svelte` / `FoundryReviewTransports` / the review route -- see
  above. The database-side permission already exists; only the UI and the
  transport are missing, and both are outside this session's file ownership.

---

