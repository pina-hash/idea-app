---
title: "Prompt 0122: reconciling a forked ledger by content -- the notebook takes an application frame keyed on a prop, its list pane pins a head over a scrolling body, the compose actions pin to the pane's foot, and the plate picker stops reading the preference store (`claude/notebook-theme-reconcile-wo0u8a`, no migration)"
date: 2026-09-10
branches: [claude/notebook-theme-reconcile-wo0u8a]
migrations: []
subsystems: ["Digital notebook", "Site themes", "Browser harness", "Testing"]
---

Ledger 0119 was issued once and run twice. Two sessions branched from
`b03a9410` and rewrote `NotebookView.svelte` and the notebook theme system in
different directions; both came back green, both were fully measured, and
neither contained a line of the other's work.
`claude/notebook-ui-theme-overhaul-t3dc3a` WON by arriving first and is merged
into `integration`; `claude/notebook-ui-theme-overhaul-0gnx0f` is still standing
and `merge-tree` refuses it against `integration`. **This entry is the loser's
only record.** No git merge of that branch was attempted -- it conflicts and any
resolution is a coin toss. Its diff against `b03a9410` was read, each idea was
judged against the landed base, and what still applied was rebuilt there.
Decision 08 (the notebook spreadsheet) is untouched in every direction: nothing
here builds one, designs around one, or closes it.

## What the two branches disagreed about

Both replaced the hero, both boxed the toolbar's underlined controls into 44px
`.tool-btn`s (closing decision 12 item 2), both laid the feed out in `auto-fit`
columns with nothing open, and both gave the notebook a Matrix plate that the
default follows from `<html data-theme>` in CSS alone. Where they diverged:

- **The winner** kept a PAGE HEAD with an actionable status strip (a Next
  check-in chip that picks that session in the composer, a drafts chip that
  applies the Drafts filter) and moved every collapsed entry's control strip
  onto the OPEN entry, taking the phone row from 229px to 88px. It left the
  split on `scroll="page"`.
- **The loser** replaced the hero with a one-line BAR and put the whole surface
  in the review console's `cr-app` frame with `scroll="fill"`, gave the list
  pane a pinned head over a scrolling body, pinned the compose actions to the
  pane's foot, and had the picker observe the document attribute.

So the two halves are complementary rather than contradictory: the winner spent
its budget on WHAT is on the page and the loser on HOW THE PAGE SCROLLS. Four
things were brought across.

## 1. The application frame, and the key is a prop rather than a mount

`scroll="page"` was correct while the hero was ~355px of chrome above the split.
It is not correct any more, and the cost was measurable: at 1440 on the harness
fixture the document ran **1677px against a 900px viewport**, so scrolling to the
foot of a 1130px compose form took the feed off screen with it, and scrolling the
feed took Turn in off screen. The chrome above the split is **242px** now (the
masthead and the 112px head), and `cr-app` measures itself rather than naming a
height, so there is no arithmetic left to be wrong about.

After: `.nb-root` is exactly the viewport, the split is 619px, the nav pane's
`scrollHeight` equals its `clientHeight` (617 == 617, so the PANE has no
scrollbar of its own and the one in the list belongs to the body), and
`.cr-detail` scrolls 1171px inside 619. **`IDEA_INTERFACE_STANDARDS` 1: the page
does not scroll; the panes do.**

**The frame is keyed on a prop, never on the identity of a mount** -- that was
the loser's own instruction and it is the part worth having. It keyed on
`masthead`, which is nearly right: a mount that suppresses the masthead is by
definition already inside somebody else's bar, so `/classroom/view-as` (which
already passes `masthead={false}`) gets the right answer for free, and
`scroll="fill"` without a bounded parent resolves `height: 100%` against an auto
height and **degrades to exactly `page-flow`** in split.css's own words. Measured
on the view-as harness at both widths: no `cr-app`, both panes `sh == ch`, the
document owns the scroll, 0px overflow.

**`masthead` ALONE IS NOT ENOUGH, AND THE LOSING BRANCH SHIPPED THAT HOLE.**
`/notebook/review/student/<email>` KEEPS the masthead and is still not the whole
page: `StudentReviewBackStrip` sits above the room and `NotebookDeletedZone`
sits below it. Measured at 1440 with the frame keyed on `masthead`: `.nb-root`
was a **900px viewport box starting at y=127** -- 127px past the fold -- inside a
**1463px** document, with the Deleted section at **y=1051**, reachable only by
scrolling the document past a full-viewport frame whose own panes were also
scrolling. That is the "bar inside a bar" the whole geometry exists to avoid,
and it is a defect neither 0119 branch measured, because neither drove that
route after changing the shape.

So the key is `framed = ownsPage ?? masthead`: one derived read by both class
directives, `ownsPage` undefined meaning "the same answer as `masthead`", and
the one mount where that default is wrong states `ownsPage={false}` and flows.
After: no frame there, split 441px (its content height), both panes `sh == ch`.
A new mount that wraps this component in chrome and forgets the prop gets a
viewport frame in the middle of a scrolling document, so
`tests/notebook-shell.test.ts` enumerates every mount and requires each
non-owning one to say so -- **on the TAG, not anywhere in the file**, which cost
a mutation round to learn: both props are named in the comments that explain
them, in backticks, so a file-wide match survived deleting the attribute and the
first version of that test was green over a removed prop.

## 2. A pinned head over a scrolling body, and where each row goes

`split.css` already grants a fill-height nav pane's direct child
`max-height: 100%` for exactly this ("what lets a surface keep a header on
screen while its BODY scrolls"). The pane is a flex column: `.list-head`
(`flex: none`) and `.list-body` (`flex: 1 1 auto; min-height: 0; overflow-y:
auto`).

**Which rows stay was a measurement, re-derived on the landed base rather than
carried over.** The pane is 569px at 1440. The folder rail and the filter chips
are **277px** of that, so in the head the head would be **458 of 569** and the
list would have **111px** to scroll in. In the body the head is **181** and the
list has **388**. A folder and a filter are set once and then read; the search
and the sort are used *while* scanning. Verified by driving it: the head stays at
y=380 while the body scrolls 602px.

There is no `position: sticky` on the head and no offset for one. The head wraps
at narrow widths, so any offset a stylesheet writes down is a constant that is
wrong the first time it wraps.

**A 20px second scrollbar on the pane, found and fixed:** `.card`'s
`margin: 1.25rem 0` (app.css) sits OUTSIDE the box `max-height: 100%` caps, so
the nav pane's scrollport read 637 against 617 and the pane scrolled the head
this change had just pinned. `.nb-pane-card` already zeroed `margin-bottom` above
the breakpoint; it zeroes both now. 617 == 617 after.

## 3. Compose actions pinned to the pane's foot

Measured before at 1440: the row sat at **y=1376 in a 900px viewport, 476px below
the fold**, and the only way to it was scrolling the document, which took the
feed beside it away. It is `position: sticky; bottom: 0` inside `.cr-detail`'s own
scroll above 1024px, on the card's own surface under a hairline -- pinned, not
translucent, because the form scrolls underneath it and see-through text is
unreadable in exactly the moment somebody is deciding whether to press. After:
top 909 / bottom 974, which is the pane's own foot; Turn in 73x44 and Save draft
94x44. Below the breakpoint it stays in flow, measured `position: static` at 375:
a bar pinned over a phone's viewport covers the control a thumb is reaching for.

**Every explanatory sentence moved above it**, and that is forced rather than
preferred: anything under a sticky row is a paragraph that can never be reached.
The autosave note, the no-autosave note, both submit hints and the draft-pending
line are now above the row, in the order a student needs them.

## 4. The picker stops reading the preference store

**The prompt's premise for this item was wrong about the landed base and the
measurement says so.** It said the landed base "follows by cascade but never
tells the student what it is following". It does tell them:
`notebookDefaultNote(siteTheme())` already rendered "Following the site theme:
Matrix right now" and the trigger already carried `data-plate` beside
`data-theme-state`. What is wrong is the INPUT.

`notebookPlate` and `notebookDefaultNote` are mirrors of a CSS selector,
`:root[data-theme='matrix'] .nb-root:not([data-nb-theme])`, which keys on the
ATTRIBUTE. They were fed `siteTheme()`, the preference STORE. `ThemeRoot` writes
the attribute only while there is a session, so the store and the attribute are
two different questions with a session gate between them, and a mirror keyed on
a different input is a second definition rather than a mirror.

**Measured in Chromium** with `data-theme="matrix"` on `<html>` and the store
untouched -- which is exactly what `ThemeRoot` produces with no session:

| | before | after |
|---|---|---|
| room ground | `rgb(2,4,2)` (matrix) | `rgb(2,4,2)` (matrix) |
| `data-plate` | `default` | `matrix` |
| Default row's note | "Following the site theme: **the same surfaces as your classes**" | "Following the site theme: **Matrix right now**" |
| accessible name | "Appearance: Default" | "Appearance: Default, showing Matrix" |

So the picker told a student their black notebook was following the classroom's
own surfaces. `watchSiteThemeOnDocument()` in `notebook-theme.svelte.ts` follows
`<html data-theme>` through a `MutationObserver` and returns its teardown; it
writes one piece of state and reads none, so the effect that calls it takes no
dependency on what it sets. **`notebookPlate`'s input was re-pointed rather than
a second function added beside it** -- the losing branch introduced
`notebookPlateShowing` alongside `notebookPlate`, which is two functions
answering one question.

**One thing the loser did here was NOT brought across.** Its trigger showed the
PAINTED plate ("Matrix" when the room is matrix) while its menu still ticked the
CHOSEN row -- a control reading "Matrix" over a menu whose current row is
"Default" contradicts itself. The visible word stays the chosen state; the
painted plate went into the accessible name instead (`notebookPickerName`, one
place, only when the two differ), so a reader looking at a black notebook is not
told only "Default".

## The 375px overflow defect the prompt asked about

**Not present on the landed base, measured**: `scrollWidth 375 == clientWidth
375`, 0px overflow. The shape the loser found needed the folder rail as a GRID
item; on the landed base `.pane-head` is a flex row, `.toolbar`'s grid never
contained the rail, and the rail's parent was a plain block. Nothing to fix.

**But this bundle reproduced it while building, in a different mechanism, and
that is worth writing down because `min-width: 0` is the wrong reflex.**
`cr-app` is `display: flex; flex-direction: column` at EVERY width (only its
`height`/`overflow` are above the breakpoint), so `.nb-shell` became a flex item
-- and app.css gives every `main` a `margin: 0 auto`. **An auto cross-axis margin
switches off `align-items: stretch`**, so the item was sized `fit-content`, which
cannot go below its own min-content, which the folder rail's strip puts at
699.7px. Measured: the shell laid out at **699.7px inside a 375px root, 325px of
document overflow**. `min-width: 0` was tried and did nothing -- the computed
`min-width` was already `0px` on every box in the chain, because the automatic
minimum is a different mechanism from the one that was biting. `margin: 0` on
`.nb-shell` is the fix; the review console's own shell carries the same line for
the same reason. After: 375 == 375.

The list pane was built as a flex column and a plain block body rather than a
grid, and the rule is beside the CSS: a column-flex or block child takes the
container's width and lets the rail's strip scroll inside it.

## The landed work is intact, re-measured rather than assumed

All three load-bearing pieces of `t3dc3a` were measured again after every change:

- **The collapsed phone row.** 9 rows at 375, mean **88px**, and **0** control
  strips in the collapsed feed (`.entries .tools`).
- **The Next check-in chip and the drafts chip.** Both present exactly once,
  both in the head's status strip, smallest tap target 334.3x44.
- **`auto-fit` columns with nothing open.** Inside the new frame at 1440 with
  the composer closed: nav pane 1376px, `grid-template-columns` of
  **431.3 / 431.3 / 431.3**, **0 of 9** titles ellipsised, 0px overflow.

Nothing was reverted, and no landed decision was traded for anything above.

## Verified

- **`svelte-check`: 0 errors / 37 warnings at 31/5/1**, re-derived from its own
  summary line after `npx svelte-kit sync`, with a placeholder `.env` exported
  first (a checkout with none reports 13 phantom errors). Unchanged from the
  `integration` baseline before and after every edit.
- **Browser harness**, `--route notebook --route classroom-view-as-notebook`,
  both widths, on a Vite started separately on 5199 and reused (server boot
  60ms): baseline **24 runs / 344 measurements / 0 outside threshold**; after,
  **24 runs / 362 measurements / 0 outside threshold**. The 18 new measurements
  are 9 new rows at two widths: the application frame present on `/dev/notebook`
  and ABSENT on both `/dev/classroom-view-as-notebook` and
  `/dev/notebook-review-student` (one assertion in three places, worth nothing
  in any one of them alone), the pane head and body, the rail in the body and
  NOT in the head, and the picker's accessible name naming the painted plate.
- **Two mutation proofs**, each restored from a `cp` copy and md5-checked
  identical, never `git checkout --`:
  - the picker fed from `siteTheme()` again reddens
    `tests/notebook-theme.test.ts`'s source sweep alone (1 failed / 37 passed),
    restored, 38 passed;
  - `ownsPage={false}` removed from the review-student mount reddens
    `tests/notebook-shell.test.ts`'s mount enumeration alone (1 failed / 66
    passed), restored, 67 passed. **The first version of that assertion did NOT
    redden** -- it matched the prop name in the comment above the tag -- which is
    why it now reads the tag only.
- **`tests/notebook-theme.test.ts` 35 -> 38**, `tests/notebook-shell.test.ts`
  63 -> 67. Every notebook and theme test file run together: **45 files, 1066
  tests, 0 failed.**
- `node tools/claude-md-check.mjs`: CLAUDE.md agrees with the tree.
- The full suite is reported in the ledger entry's final note.

### One test assertion was generalized rather than deleted

`tests/notebook-shell.test.ts`'s page-flow reveal sweep had a positive control of
`KNOWN_UNREVEALED.length + 1`, and the `+ 1` WAS `NotebookView`. It is `fill`
now, so the population is the three exempt files and the control could not hold.
Lowering it alone would have left the reveal assertion sweeping an empty set and
passing vacuously. Instead the walker's own reach is asserted separately
(`mounts.length > KNOWN_UNREVEALED.length + 3`), and the mount that left the
population is named: `NotebookView`'s literal says `fill` but its frame is a
PROP, so under view-as it is page-flow at runtime and still must reveal and
bind. A file sweep can only read the literal; the cost is stated rather than
left as a gap.

## NOT verified

- **No signed-in session anywhere in this bundle.** `/notebook`,
  `/notebook/review/student/<email>` and `/classroom/view-as` were driven only
  through their `/dev` harnesses against fixtures. The picker's divergence was
  staged by writing `data-theme` on `<html>` by hand, which is what `ThemeRoot`
  writes when there IS a session; the harness holds none.
- **Whether the store/attribute divergence is reachable in PRODUCTION today.**
  `/notebook` is behind a session, so `ThemeRoot` writes the attribute and the
  two agree in every state this session could reach. The defect measured above
  is latent there and live on every `/dev` route. It was fixed because the two
  functions claim to mirror a stylesheet and were reading something else, not
  because a student is hitting it this week.
- Text was measured in the fallback stack (the harness blocks
  `fonts.googleapis.com`) and `prefers-reduced-motion` was `no-preference`, per
  the harness README's two standing limits.
- No screenshots were read by eye; every geometric claim above is a measured
  box, a `scrollWidth`/`clientWidth` pair or a computed style.

## Left undone, by name

- **The loser's BAR is not brought across.** It replaced the eyebrow, title,
  privacy line and chips with a single 1.55rem line, measuring 144px at 375
  against the hero's ~300. The landed HEAD is 112px at 1440 and carries the
  Next check-in and drafts chips, which are load-bearing landed work; taking the
  bar would take them. The head is the smaller win and the right one.
- **The loser's `.list-title`** (the result count moved up beside the "Entries"
  heading) is not brought across. The count is in `.tools`, which is in the head
  either way, and moving it would churn the harness's `result-count` row for no
  measured gain.
- **`CLAUDE.md` is not this bundle's to edit** and still describes the notebook
  split as `scroll="page"` nowhere by name, but its `.nb-root` bullet still says
  "default / light / IDEA palettes" (four now, the winner's entry already named
  this) and its "three plates" figures under the review-grid, Pending and wash
  rules are likewise one plate short. Unchanged here.
- **`docs/decisions/entries/12-*`** is closed by measurement in the winner's
  bundle and not edited here either.
- **`classroom-updates.json`** takes no entry from this bundle: nothing here
  changes what a class SEES. The notebook's scroll behaviour is a change a
  student will notice, but it is the same surface with the same controls, and
  the winner's own entry already covers the overhaul a student reads about.
- **The losing branch itself** is left standing. Its diff against `b03a9410`
  remains the only copy of the work not brought across (its bar, its
  `notebookPlateShowing`, its harness specs `notebook-plate-follow.mjs` and
  `notebook-plate-matrix.mjs` -- the landed base has its own
  `notebook-site-matrix.mjs` and `notebook-plate-matrix.mjs` covering the same
  two states). Deleting it is not this bundle's call.
