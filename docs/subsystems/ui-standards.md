# Interface standards

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Layout, previews, tap targets, refusals and acknowledgements. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### Interface standards

- **Desktop is a first-class layout.** Every surface needs a real layout above
  1024px; master-detail is the default for list-plus-detail. A single narrow column
  at every width is a defect, not a simplification.
- **An instructor's view of student-facing content is the student view plus edit
  affordances, through the SAME render path.** Instructor-only content sits in a
  visually distinct region, never a parallel re-derivation.
- **A preview path reads through the SAME payload as the thing it previews.** A
  second hand-shaped read drifts from what it claims to show.
- **A preview is not impersonation.** It swaps no session, mints no token, and
  reveals nothing the caller could not already read -- only the arrangement on
  screen changes. If a change here needs a session swap, a service-role client or a
  new grant, that is the signal it has stopped being a preview: stop.
- **WHERE TWO ROLES DIFFER BY PAYLOAD RATHER THAN BY RENDER, NO PREVIEW CAN
  CLOSE THE GAP, and the answer is to delete the preview rather than improve
  it.** The classroom's class and item previews under `/classroom/view-as` are
  GONE for exactly this: a student's item page carries an engine slice that a
  manager's read never loads, so an assignment "previewed as a student" showed a
  placeholder precisely where the work surface belongs, and only a real student
  session could have fixed it. Parity is what a preview was standing in for, and
  parity is already real -- `ItemDetail` is one component gated by `canManage`,
  so an instructor reads the student page plus affordances. **Do not rebuild
  them.** What survives at `/classroom/view-as` is the student picker and the
  NOTEBOOK preview, which is not the same case: no notebook payload splits by
  role, so `notebook_view_as_notebook` returns what the student's own page
  returns.
  - **A route that answers as somebody else is a preview's plumbing, and it goes
    with the preview.** The attachment proxy's `?as=<email>` branch is removed;
    `attachmentSrc` and `resolveFigureSrc` take no `viewAs`. Neither classroom
    proxy resolves an identity now, and neither may gain one.
  - **The SQL went too, one bundle later, and the ORDER is the rule.** A dropped
    function under a still-deployed route is a 500, so the routes go first and
    the drop follows in its own migration (0124:
    `classroom_view_as_section`, `_item`, `_can_read_attachment`, `_sections`,
    and the private `_classroom_item_json` they were the only callers of). What
    stays is `classroom_view_as_students` (the picker),
    `_classroom_view_as_guard` and `_classroom_item_live`. **A migration that
    drops a plpgsql function carries its own caller guard**: Postgres records a
    dependency from a policy, a view, a default or an index, but NOT from one
    plpgsql body to another, so `drop function` succeeds silently and the caller
    breaks at its next invocation. Sweep `pg_proc.prosrc` for `<name>(` and
    refuse.
- **Everything an item needs is attachable at creation, on one surface** -- and on
  ONE surface only. Do not make an author save first and come back; equally, do not
  put a second copy of a panel the page already shows beside the first.
- **Every control carries a visible word, not only a glyph.** A `title` tooltip is
  not discoverable and a phone cannot hover.
- **Colour is never the only signal** -- glyph AND word, or an icon beside the hue.
- **A STATUS IS DRAWN BY ONE COMPONENT FROM ONE TONE MAP (ledger 0466).**
  `src/lib/ui/StatusChip.svelte` is every status tag on the site and
  `src/lib/ui/status-tone.ts` is its only vocabulary: seven tones (`ok`,
  `warn`, `danger`, `info`, `special`, `draft`, `neutral`), each with its
  colours and a glyph, and the word always shown. Something that says a status
  without being a chip (a callout's rule, a coloured word in a list) reads the
  same colours through `toneStyle()`, as `var(--st-ink)` and its siblings. A
  new status adds a tone use, never a `*-chip` class or a `.tone-*` rule of
  its own; `tests/status-tone.test.ts` sweeps `src/` for both and holds the
  rules that fail silently:
  - **`danger` is live, recording and error and nothing else.** No grade, fine,
    refusal or presence state wears it, however bad the news.
  - **In progress is `info`, never `warn`**: work under way is not a warning.
  - **A draft is the `draft` tone with its pencil, never the warning sign.**
  - The five coloured tones are the status tokens' `-solid` with `-on`, the
    only colorblind-safe set (`tests/color-tokens.test.ts`); `draft` and
    `neutral` carry no hue, which is why there can be a sixth and seventh.
  - **Rooms with a documented vocabulary of their own keep it**: the
    Foundry's heat language (`ForgeStatus.svelte`), GAUNTLET, GREENLINE,
    IdeaCAD, FRC, FSP, Armory, the certifications' `cert-tone-*`, and the
    frozen legacy pages.
- **44px minimum tap targets** on anything a phone touches, AND on every
  student-facing surface at every width, with 24px as the absolute floor
  everywhere else (`IDEA_INTERFACE_STANDARDS` 10).
  - **THE 24px FLOOR IS A PROPERTY A SURFACE DECLARES, NEVER ONE A BUNDLE
    ASSERTS ABOUT IT**, which is the standard's own rule and was missing here.
    A surface sits on 24px only when it is instructor-only AND says so in a
    named class on its own root, so the claim is written where a later sweep
    can read it off the element. **A surface with no such class is
    student-facing for the purpose of this rule** and clears 44px at every
    width, whatever the density argument -- nobody measuring a control six
    months later can see "this is an instructor console" from the control. The documented exception is a
  control inside a locked density contract, where inflating it would break a real
  invariant to satisfy a guideline written for standalone controls -- say so
  rather than breaking the contract.
  - **IN THE CLASSROOM THAT DECLARATION IS `.cr-instructor-surface` AND IT
    NEEDS A SECOND CONDITION (ledger 0297).** `.cr-root .btn.tiny` is 44px; it
    drops to 24px only under `.cr-root[data-density='compact']` AND inside
    `.cr-instructor-surface`, so compact is something a teacher chose on a
    surface that says it is theirs, and a student surface is 44px in every
    density. `tests/classroom-shell-chrome.test.ts` holds both halves.
  - **THE FLOOR IS `min-height`, NEVER A HEIGHT, and never a snap to the nearest
    token.** Rounding to reach a floor rounds BOTH ways: a mechanical sweep that
    snaps takes a 43px control to 41px and reports success. The notebook's plate
    switch was a fixed `height: 2.4rem` for exactly that reason -- it could not
    round up.
  - **TWO MECHANISMS, AND THEY ARE IN `src/app.css`: `.tap-44` grows a control
    that owns its row; `.tap-reach-44` expands the HIT AREA of one sitting inside
    a line of text**, with a pseudo-element, so the target grows and the writing
    around it does not reflow. Most reaches must set `--tap-reach-w: 0px` and grow
    in height only -- Edit beside Delete, seven colour swatches, two breadcrumbs
    are all closer than 44px horizontally, and overlapping reaches hand the tap to
    the wrong control. Verify a reach by HIT-TESTING it (`elementFromPoint` down
    the control's full span), never by reading the computed height.
  - **THEY LIVE IN THE GLOBAL SHEET BECAUSE SVELTE PRUNES A SCOPED `::after`.**
    Written inside a component's own `<style>`, `.swatch::after` was dropped from
    the compiled output entirely while `.swatch` beside it was kept -- silently,
    with no `svelte-check` warning and no unused-selector notice. A rule that
    cannot be pruned is the fix; a rule you verified by eye is not. This is why a
    reach is a class in the markup rather than a rule in the component.
  - **AN INLINE LINK INSIDE AUTHORED PROSE IS THE ONE THING LEFT ALONE**
    (`ItemBody`'s `.item-link`, 19px). Prose lines sit ~24px apart, so a 44px
    reach on one link overlaps the lines above and below and steals their taps;
    WCAG 2.5.8 exempts an inline target in a sentence for the same reason. Say so
    rather than raising it.
  - **A CONTROL WRAPPED IN A `<label>` IS MEASURED AT THE LABEL**, which is what a
    finger hits -- but only once the label's full height has been hit-tested to
    the pair. A 22px input inside a 44px label is fine; a 22px input inside a 44px
    label that something else overlaps is not, and only the hit test tells them
    apart.
- **TEXT STANDS ON AN 11px FLOOR, NAMED FROM ONE SCALE (ledger 0469, feedback
  8a928045).** A font size is a step of `--fs-*` in
  `src/lib/design-system/typography.css`, never a literal; `--fs-micro` is the
  floor (0.6875rem) and the Plate's `--plate-label-size` reads it, as the HTML
  kit's label parts read `--plate-label-size`. `tests/type-scale.test.ts` holds
  the scale, `lib/classroom`'s use of it and the swept plate-scope source to no
  size under 11px; `npm run verify:browser`'s `type-floor` measures what renders
  on every page. Display numerals at 1.75rem and up are sized to their own
  component.
- **AN INLINE LINK TAKES THE 24px FLOOR, AT ITS LINE.** A link inside a line of
  text is measured at the larger of its box and its line-height, and clears
  24px there (WCAG 2.5.8 exempts it for the reason the bullet on authored prose
  above gives). Every other control clears 44px in both dimensions;
  `control-floor` measures both on every page. **A control below 44px on one
  axis says so on itself**, `data-tap-floor="24"`, with the reason in the
  source beside it (the class list's row checkbox, arrow and menu, 30px wide
  so they never overlap the grip and the row link), and **a scale drawing says
  so on its root**, `data-scale-drawing` (the Maps plan and elevation, whose
  shapes are drawn at the size they are). The plate's own floor rule, a
  zero-specificity 44px minimum height on every button, select and one-line
  field and 44px minimum width on every button in
  `src/lib/classroom/plate.css`, leaves both alone. **It is written as
  `calc-size()`, never a bare length**: a length replaces a flex item's
  automatic minimum, so a key in a flex row could shrink below its own words,
  and a bare `min-width: 44px` did exactly that to the home header's Take the
  tour and broke the Install app key's fit. The height is
  `calc-size(auto, max(44px, size))`; the width is
  `calc-size(min-content, max(44px, size))`, because Chromium does not hold a
  shrinking flex item to an `auto` basis (swatches measured 25.6px). A
  full-width button that has to narrow below its words declares
  `min-width: auto` itself, as `Disclosure.svelte`'s trigger does.
- **A LINE OF RUNNING TEXT IS AT MOST 72 CHARACTERS (`--measure-prose`, ledger
  0469, feedback dd897391).** The cap sits on the paragraph or the list, never
  on the card or pane around it, so the panel keeps the page's one right edge
  while the sentence stays readable.
- **A CARD LAYS ITSELF OUT BY ITS OWN WIDTH, NOT THE WINDOW'S.** A card or row
  whose columns change is a size container and steps with `@container`, so a
  laptop at 125% zoom (1152 CSS px, the third width the visual pass runs) never
  squeezes a card's words into a column a word wide; `squeeze` measures it.
- **A destructive action names what it costs**, with the real counts, before the
  confirm. Two-step inline confirm (arm, then confirm) for anything irreversible;
  a server-side typed-name confirmation for anything that destroys a term of work.
- **A refusal renders where the user was working**, in the same problem list as
  every other problem, not in a second place they must learn about.
- **A partial failure KEEPS what did not land** and names it; only what succeeded
  is cleared. A retry after a partial create UPDATES the record already made, or
  it produces a duplicate.
- **AN ACKNOWLEDGEMENT MUST SURVIVE THE ACT IT REPORTS, AND A DESTRUCTIVE ONE
  USUALLY DOES NOT WHERE IT WAS WRITTEN.** "Saved" renders where the work is,
  because the work is still there; "deleted" cannot, because the pane holding
  it is what was just deleted. Measured on `/foundry/mine`: the confirmation
  lived inside the detail pane, the app delete unmounted that pane, and the
  card simply vanished from the list with nothing anywhere saying a word. So a
  delete's note belongs on the surface that is on screen AFTERWARDS -- for a
  master-detail split under `narrow="swap"`, the LIST, which is exactly what
  shows at every width once no detail is open. Two outcomes ending in two
  places is two notes, not one moved.
- **A CONTROL THAT IS ABSENT FOR A REASON SAYS THE REASON, where every sibling
  row has one.** A version list whose live build alone has no Delete reads as a
  bug; one sentence in its place is the difference between a rule and a defect.
  It is the `aria-disabled` argument for the case where there is nothing to
  disable.
