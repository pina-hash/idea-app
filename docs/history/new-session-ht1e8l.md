---
title: "The class stream's metadata line wraps instead of swallowing the due time and the points, and the row menu moves onto `$lib/shell/anchored` (`claude/new-session-ht1e8l`, ledger 0281, no migration)"
date: 2026-09-22
branches: [claude/new-session-ht1e8l]
migrations: []
subsystems: ["Classroom", "Shell", "Browser verification"]
---

Mr. Pina filed this from the section page in manage mode at 1196x1304 on 2026-09-09
with a screenshot and the words "this shit is such a mess lmao". That screenshot held
four separate problems. The dead left column was fixed by `fd640e69`. The duplicated
"No unit" is not a defect and is confirmed below as one. The other two are this bundle.

## What was wrong, measured

**The metadata line.** `.row-meta` carried `white-space: nowrap; overflow: hidden;
text-overflow: ellipsis` -- the exact rule `.row-title` shed when an earlier bundle
fixed it, with a comment beside it explaining why that rule was wrong for the title
and nothing carrying the same reasoning one line down.

The prompt's reading was that the category, being last, is what disappears. It is
what disappears FIRST; it is not what disappears. Measured in Chromium at 1196x1304:

| surface | meta box | content | lost | what was actually visible |
| --- | --- | --- | --- | --- |
| `/dev/classroom?view=class-teacher` | 213px | 343px | 130px | `Assignment · Due Mon, Sep 28, 1:52 P` |
| `/dev/classroom-split/s-1?manage=1` | 306px | 349px | 43px | `... · 40 pts  · U` |
| `/dev/classroom-split/s-1/item/i-crowded?manage=1` | **143px** | 349px | **206px** | **`Assignment · Due Thu, Au`** |

So on the pane a teacher actually works in -- an item open beside the list -- the
line lost its due TIME, its points and its category, and cut the date at the month.
The two fields Mr. Pina acts on were the two being eaten.

**Widening the window buys nothing, and the reason is not only `--cr-stream-col`.**
The box is 213px at 1196, 1440 and 1920 alike on `/dev/classroom`. But the binding
constraint in manage mode is the ROW, not the column: a row is
`select(30) + grip(44) + expand(30) + main(177) + menu(32)` with 4.8px gaps, so 136px
of a 332px row is controls and the text column gets 143px of it. That is structural
and is 0118's row design, not this bundle's to relitigate.

**The row menu.** `.menu` was `position: absolute; top: calc(100% + 0.2rem); right: 0`
inside a `position: relative` `.row-menu`, with no flip and no clamp. Measured on
`/dev/classroom-split/s-1/item/i-crowded?manage=1` at 1196x1304, pane scrolled to its
end, last row:

- the menu opened at top **1379** against a pane whose bottom edge is **1304**, so the
  WHOLE 198px panel was below the fold and nothing appeared at all;
- sweeping every one of the 20 rows: at 1196x800, **16 of 20** menus had a bottom strip
  that was not hit-testable, worst **237px** past the pane's bottom edge; at 1440x900,
  7 of 20, worst 224px.

## The claim that was wrong, and the one whose mechanism was wrong

**Claim 5 said the menu is mis-positioned by `.stream`'s multicol fragmentainer and
ends up painted over the page footer. Neither half is true on this tree**, and the
prompt was right to say re-measure rather than trust it.

- The menu is positioned correctly: its top sits 3.2px (0.2rem) under its trigger's
  bottom, and its right edge is its wrapper's right edge to the pixel. `absolute` was
  doing exactly what it was told.
- `.stream` is a multicol container but is `overflow: visible`, so it clips nothing.
- What clips is `.cr-nav` (`overflow-y: auto`) and, above it, 0277's own
  `.cr-root { position: relative; overflow: hidden }`. That last one is why the menu
  does **not** reach the footer: there is nowhere below the pane for it to paint.
  **0277 converted "paints over the footer" into "silently invisible"**, which is a
  worse symptom and a quieter one.
- No ancestor up to `<body>` carries a `transform`, `filter` or `contain`. That is the
  one precondition `anchored.ts`'s header says the caller must check for itself, and it
  is checked and recorded here rather than assumed.

**Claim 3 is true and its stated reason is incomplete** -- see the row arithmetic above.

## What shipped

**The meta line is a wrapping flex of unbreakable fields.** Each field is its own item,
and the separator travels INSIDE the field it precedes, so it can never dangle at the
end of a line or wrap onto one alone: a line that wraps begins `· `, which reads as a
continuation, where a trailing `·` would read as the truncation being removed. `N pts`
is held together with a non-breaking space so a number is never parted from its unit.

Wrapping rather than dropping a field, and the measurement decided it: at 143px even
the date ALONE is 152px, so no arrangement keeps one line, and hiding the category
would hide a real value with nothing on screen saying so. Measured after:

| surface | box | lines | note |
| --- | --- | --- | --- |
| item open, 1196 | 143px | 3 | the only case where the date itself breaks, at a space |
| nothing open, 1196 | 306px | 2 | date and points on line 1, category on line 2 |
| `/dev/classroom`, 1196 and 1920 | 213px | 2 | date whole on line 1 |
| stream fixture, 375 | 241px | 2 | date whole, wrapped as one unit |
| stream fixture, 1440 | 324px | 1 | unchanged from before |

**0 meta lines clipped and 0px document horizontal overflow at every width measured.**
Rows with no due date stay one line, which is most of them.

**The menu is on `use:anchored`**, the shared action InfoTip, the grading console and
RichTextEditor's popovers already use, and whose own header names a menu in a scrolling
region as the failure it exists for. `prefer: 'below'` and `align: 'end'` reproduce the
old `top: calc(100% + 0.2rem); right: 0` exactly where there is room, so a menu with
space below opens where it always did. After, same sweeps:

| geometry | menus with a non-hit-testable bottom, before -> after | worst past pane bottom, before -> after |
| --- | --- | --- |
| 1196x800 | 16/20 -> 4/20 | +237px -> **-45px** |
| 1196x700 | 17/20 -> 4/20 | +237px -> **-45px** |
| 1440x900 | 7/20 -> 0/20 | +224px -> **-11px** |

The residual four are not the menu leaving the pane -- it is fully inside the viewport
in all of them. See the finding below.

**A pinned width, which is not cosmetic.** `min-width: 11rem` was enough while the panel
was `absolute`, because its containing block was the 32px `.row-menu` and shrink-to-fit
had nothing to grow into. Under `position: fixed` the containing block is the viewport,
so the same rule let it grow to its content -- measured 324px, a 148px widening nobody
asked for -- and, worse, it broke the PLACEMENT: `anchored` measures the panel to decide
where it goes, and a panel still settling is measured at one width and painted at
another. That put the menu's right edge at x=1196 on a 1196px viewport, flush against
the screen edge and past the 8px margin the action clamps to. `width: 11rem` restores
today's geometry exactly (176px, right edge on the trigger's right edge) and cannot
drift between the measurement and the paint.

## Mutation proof

Both halves, restored from a `cp` copy and md5-checked back to
`5e39ad2a07929561738a4c4f92452a1b`, never with `git checkout`.

- **Meta line.** Reverting `.row-meta` to `nowrap` + `ellipsis` reddens both new harness
  checks at 375px: `11 meta line(s) clipped, worst by 29px` and `a field runs 29px past
  the line`. At 1440 it stays green, because the stream fixture's longest line fits a
  324px box either way -- that is the honest limit of the fixture and the check's own
  comment says so.
- **Menu.** Removing `use:anchored` puts the last row's menu **582px** past the pane
  bottom at 1196x1304 with an item open, and 159px at 1196x800, `elementFromPoint`
  returning null at its bottom in both. With the action restored: -8px and -89px, every
  hit-test point inside the menu.

## Harness

Two checks added to `tools/browser-verify/routes/classroom-stream-manage-1.mjs`, both
with vacuity controls, both measured rather than asserted. **Every string was present
throughout**, before and after -- `textContent` returns the whole sentence whether or
not a character of it was painted -- so a `textContains` row is green on the clipped
page at every width. `scrollWidth` against `clientWidth` is the only read that tells
them apart.

**The vacuity control earned its place on its first run**, twice over. It reported "no
meta line carries a due date" on a fixture full of them, because the markup wraps and
the template puts a newline between `Due` and the date, so `includes('Due ')` with a
trailing space is false. And the obvious repair cannot be written at all: an `evaluate`
body is a TEMPLATE LITERAL in a spec file, and a template literal eats an unrecognised
escape, so a whitespace regex reaches the page as `/s+/g` -- matching the letter `s` and
turning "Assignment" into "A ignment". It throws nothing and the check answers wrong.
A backtick in one is louder: it closes the literal and the whole spec stops parsing.
Both are written into the spec's own comment.

## For Mr. Pina

**Two things found and deliberately not touched, both outside this lane's Owns line.**

1. **The "Report a problem" button paints over the bottom of a row menu.** The shell's
   `SiteFeedback` trigger sits at z-index 90 against the menu's 30, fixed in the
   bottom-right corner. When a menu flips upward and lands in its band it covers the
   last item -- 4 of 20 menus at 1196x800. **This is pre-existing and unchanged**: it is
   visible in the before screenshot too, and it was the single occlusion at 1196x1304
   before this bundle as well. It is more VISIBLE now only because menus now stay on
   screen to be covered rather than running off it. `SiteFeedback.svelte` is mounted in
   the root layout and belongs to no lane here.
2. **The row menu's items render two-up** (`Edit | Pin to top`, `Copy | Move up`,
   `Move down | Delete`) rather than as one column: `.menu` is a flex column whose child
   is the plain `<div role="menu">`, inside which the buttons are inline-level and wrap
   at 176px. Also pre-existing and identical before and after -- both screenshots show
   it. Worth a look, since an ARIA menu read two-up is not the reading order the roles
   promise.

**Two notes that belong in files this lane may not edit.**

- **`$lib/shell/anchored.ts`'s header should say that moving a panel onto the
  action can CHANGE ITS WIDTH.** An absolutely positioned panel shrink-to-fits
  against its offset parent; a fixed one shrink-to-fits against the viewport, so
  a panel held at a `min-width` grows to its content the moment it converts --
  176px to 324px here. That is not only a cosmetic surprise: the action measures
  the panel to place it, so a width still settling is measured at one value and
  painted at another, which put this menu's right edge past the margin the action
  clamps to. The next consumer will hit it. The fix is a pinned width on the
  panel, and the header is where somebody would look.
- **The harness README should carry the `evaluate` escaping trap** described
  above. It is written into this spec's own comment, which helps whoever edits
  THIS spec and nobody writing the next one. `tools/browser-verify/README.md`
  outside its generated counts regions is not this lane's.

**And a gap in the harness this lane could not close.** The menu has no committed check.
`classroom-stream*.mjs` is the only spec glob 0281 owns; its fixture passes no
`transports`, and `editable` is `canManage && !!transports`, so `/dev/classroom-stream`
renders no row menu to measure. Everything above was measured by hand on
`/dev/classroom-split/s-1`, whose spec belongs to ledger 0277. A committed menu check
belongs in `classroom-split-*.mjs` and needs a lane that owns it.

## Not verified

The live Supabase project, a signed-in session, and the Vercel preview -- no cloud
session can reach any of them. No migration, so nothing about applied state. The
measurements above are the container's Chromium 141.0.7390.37 against the dev server at
375, 1196, 1440 and 1920; web fonts do not load in the harness, so text is measured in
the fallback stack, and `prefers-reduced-motion` is `no-preference` throughout.
