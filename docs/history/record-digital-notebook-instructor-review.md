---
title: "Digital notebook (instructor review)"
date: 2026-08-09
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 55
---

## Digital notebook (instructor review)

`/notebook/review` is the real per-section compliance grid plus the check-in
management it depends on, replacing the placeholder that held the URL. UI
ONLY -- it calls 0069's data layer exactly as it stands, and touches NO
migration, RPC, `notebook-drive.ts`, or `/api/notebook/*` route.
**SINCE THE TWO-PANE PASS its 992px split is the shared shell's** -- see "The
notebook moves onto the two-pane shell" above; the data flow below is
unchanged.

- **The gate is UNCHANGED and is still `notebook-access.ts`**: the same two
  tiers the data layer recognizes (INSTRUCTOR -- since `0094` the teacher of
  record of a `classroom_sections` row; or CHAIR, the 0067 admin tier via
  `isAdmin()` -- never
  `role === 'teacher'`, the naming trap), a 404 for a signed-in non-reviewer
  (the `/admin` rule), and anonymous visitors turned away earlier by the
  `/notebook` authed prefix. Not rewritten, not duplicated.
- **Session management had to ship for the grid to have columns at all.**
  Before this there was no way to create a `notebook_sessions` row outside
  direct database access, so every section's grid was necessarily empty.
  `SessionManager.svelte` lists a section's check-ins with add / edit /
  delete, calling `notebook_admin_upsert_session` (one RPC for both create
  and edit -- `p_id` null creates) and `notebook_admin_delete_session`. Both
  allow the section's own instructor OR a site admin and enforce that
  themselves; the component does no permission check of its own. Delete
  DETACHES rather than destroys (0069: `session_id` nulled, `custom_label`
  backfilled from the deleted session's label) and the UI reports the count
  it returns rather than implying data was lost. **Since `0098` it also owns
  WHICH SECTIONS a check-in runs in** -- a class picker on the create form and
  a per-row "Classes" panel; the upsert RPC takes an array now, and the
  authority for editing is "every section it runs in". See "Check-ins are
  multi-section" above.
- **The grid renders what `notebook_get_section_grid` returns and re-derives
  none of it.** The roster in particular is the RPC's (enrollment UNION
  anyone holding entries or excusals in the section, so a transferred
  student stays visible), as are on-time (an LA-calendar-date comparison
  against `session_date`), which entry a cell shows (the latest), and
  `entry_count`. `src/lib/notebook-review.ts` is the client-safe pure layer
  (row shapes mirroring the RPC's jsonb key for key, cell display state and
  the completion arithmetic; the CSV that used to live here went with `0097`).
- **THE OPEN ENTRY SITS BESIDE THE GRID, NOT UNDER IT.** Grading a section is
  dozens of round trips between a cell and the page it opens, and the panel used
  to render below the whole grid -- click a cell, scroll down for the photo,
  scroll back up for the next one, every time. `.review-split` puts the grid and
  the panel in two columns while an entry is open (>= 62rem) with the panel
  `position: sticky; top: 0.75rem` and its own scroll, so the next cell is
  reachable however far down the roster it is. Deliberately NOT an overlay:
  covering the grid defeats the point, which is moving from cell to cell.
  - **Narrow screens dock it to the bottom instead** (`sticky; bottom: 0`, 55vh,
    its own scroll). Sticky rather than fixed, so it is bounded by the split and
    releases at the end of it instead of sitting over the Documentation Check
    panel for the whole page.
  - **The docked sheet needs the grid to buy its own height back**
    (`padding-bottom` on `.grid-col`, narrow only): the sheet covers the foot of
    the grid, and at the end of the document there is nothing left to scroll, so
    without it the last rows sit permanently underneath and the one thing the
    sheet exists to allow is the one thing it prevents.
  - `min-width: 0` on both columns is load-bearing -- a grid item's automatic
    minimum is its min-content, so the wide table would otherwise push the split
    wider than the page instead of scrolling inside its own column.
  - **THE DENSITY AND GLYPH CONTRACT IS UNCHANGED AND WAS MEASURED, NOT
    ASSUMED:** cell box 30.39px (1.9rem), Share Tech Mono 14.4px, radius 4px, td
    padding 5.6/6.4px, row heights, and all six glyphs with their exact colours
    and border styles compare byte-identical with the panel open and closed.
- **What the grid DOES is said in words, once, above it.** That a cell opens
  something, and that a student's name opens their whole notebook, were both
  discoverable only by hovering (a `title` ending "click to open") or by
  clicking and finding out. `.grid-hint` states both; the name-link underline is
  ALWAYS on rather than on hover, since the row is otherwise indistinguishable
  from the plain names beside it, which genuinely are not links. Inline borders
  sit inside the line box, so no row height moved. The hint's second sentence is
  gated on any student actually having a link (0106 refuses one who has left).
- **The cells themselves stay glyph-only, on purpose** -- that is the locked
  contract. Their meaning is carried by the always-visible legend (six
  glyph-to-word rows) and their action by the hint above; do not put words in a
  cell to satisfy a label audit.
- **Cell states are a COLOUR AND A GLYPH, never colour alone:** on time
  (green ✓), late (amber ⤴), awaiting review (cyan ○), flagged (crimson !,
  the reserved error status), excused (dashed ice E), missing (dashed –),
  plus a corner badge when a cell has more than one entry. **FLAG BEATS
  LATE** deliberately -- a cell can say one thing and the flag is the one
  needing action; lateness still shows in the opened panel. A cell with no
  entry renders as a `<span>`, not a disabled button, so there is genuinely
  nothing to click into.
- **Photos are rendered by the SAME component the student's feed uses.**
  `NotebookPhotos.svelte` was lifted verbatim out of `NotebookView.svelte`
  (markup, behaviour and CSS: the `/api/notebook/photo/<id>` proxy, reserved
  height, per-photo broken/retry with the Drive link as a staff escape
  hatch, page captions) and both now mount it, so the two cannot drift. One
  prop differs: `lazy` is false in the review panel, which mounts on demand
  and must paint at once, and true in the student's long scrolling feed.
- **Destructive actions say what they cost, and the check-in delete was the one
  that did not.** Removing a check-in from ONE class has always stated that the
  entries filed against it are kept and relabelled; DELETING it -- which takes it
  off every class it runs in -- said only "Delete this check-in?", so the more
  destructive of the two read as the safer. It now names the class count and the
  same consequence. Folder delete (`FolderManager`) already stated it, and its
  Name and Colour captions are visible now rather than screen-reader-only: a row
  of bare swatches whose only description was a tooltip is the one control a
  label cannot be left off.
- **Flag AND resolve both ship.** The task asked only for flagging, but
  0069 describes `notebook_resolve_entry` as what "closes the review loop"
  after a student resubmits, and an instructor who can flag with no way to
  accept the fix is a trap. Same tier, same enforcement, no new RPC. The
  "Accept it" button renders only while the entry is not already
  `compliant`.
- **CSV export: RETIRED in `0097`.** This section used to describe the
  notebook's own export -- per-student counts, a suggested presence score and
  a blank Final score column -- and `buildCsv` / `csvFilename` / `csvCell` /
  `CSV_HEADERS` are all GONE with it, along with the Export CSV button and the
  "About the suggested score" card. A Documentation Check is a Classroom
  assignment now, so the grade lands in `classroom_submissions` and exports
  through the ONE FACTS-ready CSV in `assignment-spec.ts`. The arithmetic
  survives, narrowed: `summarize()`'s `suggestedScore` is `presenceScore`, the
  PRESENCE CRITERION rather than a suggested final grade. See "Documentation
  Check" above.
- **A student's name opens their WHOLE notebook, read-only (`0106`).** The grid
  is by definition check-ins only, so the free-form entries -- which an
  instructor could not see at all before `0106` -- are reachable nowhere else.
  The link mirrors that migration's own guard (chair: everyone; instructor:
  everyone except a student who has left), and the screen is the SAME
  `NotebookView` the view-as tree mounts, with no write transports. See "An
  instructor sees the whole notebook of a student they teach" above.
- **Reached from the class it belongs to, and summarized where a class is
  managed (`0099`).** A manager's `/classroom/[sectionId]` page links here with
  `?section=<id>` (validated against the sections that load already scoped), and
  the class's own People tab (`/classroom/[sectionId]/people` since Phase 3;
  `/classroom/manage`'s per-section panel until then, and it MOVED WITH THE
  ROSTER it summarizes rather than being dropped)
  shows a compliance SUMMARY built from
  this console's own `notebook_get_section_grid` payload through the same
  `cellDisplay` / `summarize` / `CELL_STATES` -- there is no second grid query
  and `SectionGrid.svelte` is untouched. See "The notebook, surfaced inside IDEA
  Classroom" above.
- **Components + transports.** `ReviewConsole.svelte` is the whole screen
  (the `NotebookView` / `CoinBalanceView` split, so `/dev/notebook-review`
  mounts the identical thing); `SessionManager`, `SectionGrid` and
  `EntryReview` are its parts. Every server call is an INJECTED transport
  (`ReviewTransports`), the way NotebookView injects its three upload
  transports -- the real page points them at the RPCs and RLS-scoped
  selects, the harness answers in memory, and that split is what makes
  "a flag reaches `notebook_flag_entry` with these exact arguments"
  checkable with no backend. The entry read is a plain RLS-scoped select
  with no `student_id` filter and no RPC (the `/coin-balance` doctrine);
  section scoping in the load (chair sees all, instructor only their own
  rows) is CONVENIENCE, since the grid RPC refuses a foreign section
  regardless.
- **Three real bugs found and fixed during browser verification, all of them
  invisible to `svelte-check`:**
  1. **An infinite effect loop.** The reload effect called `refresh()`
     inside its own tracked scope, and an effect tracks every reactive read
     that happens while it runs INCLUDING inside functions it calls -- so it
     silently took a dependency on whatever the injected transports touched
     (in the harness, the call log it both read and wrote) and spun until
     Svelte's update-depth guard fired. The refetch is now `untrack`ed with
     the section and unit passed in explicitly, so the effect depends on
     exactly those two.
  2. **A stale cell snapshot.** The opened cell was captured at click time,
     so after a flag refetched the grid the panel's status chip still read
     "Late" beside a cell that had just turned red -- the `RolesManager`
     staleness class again. The cell is now DERIVED from the current grid by
     entry id, which makes the disagreement unrepresentable and closes the
     panel if the cell stops existing.
  3. **`bind:value` on `<input type="number">` COERCES to a number**, so the
     session form's `unitNumber.trim()` threw `.trim is not a function`,
     which silently wedged the Save button (a disabled button, no visible
     error). The state is typed `string | number | null` and everything
     reads a derived `unitText`.
- **Verified** in `/dev/notebook-review` (404 in production, no auth /
  Supabase / Drive; an in-memory store that mirrors the RPC's own output
  rules AND its instructor-or-admin refusal, with every transport call
  logged verbatim). **Scoping proven as a real limit, not a shorter list:**
  as the instructor, section B is absent from the picker AND the transport
  refuses `loadGrid`, `loadEntry`, `flagEntry`, `saveSession` and
  `deleteSession` for it with 0069's own messages, leaving section B's
  sessions untouched; as the chair, both sections are offered and both
  grids and a section-B entry read fine. **Flagging:** a real form submit
  sent exactly
  `{p_entry_id:'e-4', p_flag_reason:'insufficient_detail', p_instructor_comment:'...'}`,
  the cell flipped late -> flagged, the callout appeared, and "Accept it"
  became available; resolving sent `notebook_resolve_entry` with its comment
  and the cell fell back to `late` (compliant again, still uploaded late) --
  the flag-beats-late rule demonstrated in both directions. (**The CSV
  check that used to sit here went with the export in `0097`**; the
  per-student counts it verified are now the Documentation Check panel's
  presence pre-fill, re-verified there.) **Sessions:** add (the RPC
  receiving a real `unit_number: 4`, a new grid column and a new unit
  option appearing), edit (prefilled, `p_id` set, list and column both
  updating), and delete (first click only arms the confirm, Cancel disarms,
  the confirmed delete reports "2 entries were kept and relabelled" and
  both entries survive with `session_id: null` and the label backfilled).
  Also verified: all six cell states render, the transferred-out student is
  on the roster via the entries union with a free-entry count and a
  multi-entry badge, a 2-photo entry renders both frames with page captions,
  clicking an open cell closes it, a unit choice that the newly-selected
  section does not have resets to "all", both empty states and the
  0069-unapplied card, no horizontal overflow at 375px (the wide table
  scrolls in its own container), and 0 console errors. Regression: the
  student `/dev/notebook` feed renders identically after the photo-renderer
  extraction (7 figures, `loading="lazy"` intact, page/variant/filename
  captions); `npm test` 59/59; `svelte-check` 0 errors, no new warnings.
  **NOT verified: a real instructor viewing real student data.** That needs
  a live signed-in session and 0069/0071 applied, exactly like every other
  part of this feature -- the local `.env` has no session to sign in with,
  and the photo proxy answers 401 in the harness (observed, which is what
  proves the shared renderer really requests the proxy rather than skipping
  it).

