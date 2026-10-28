# Visual themes and rooms

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). The boundary tokens, launcher cards, route-scoped themes, and every room's palette (GAUNTLET, notebook, classroom plate, coin desk, Foundry, GREENLINE, FRC, FSP, tournaments). The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

- **A BOUNDARY THAT CARRIES MEANING AND ONE THAT DECORATES ARE TWO TOKENS**
  (`IDEA_INTERFACE_STANDARDS` 10), and the distinction is made AT THE POINT OF
  USE. `--boundary` is the load-bearing one and clears 3:1 against every ground
  it can land on; `--hairline` is decoration and is not measured.
  - **`--boundary` IS TAKEN BY THREE THINGS AND NOTHING ELSE:** the outer edge
    of an interactive control, a divider that is the ONLY separator between two
    adjacent interactive rows, and the edge of a card sitting on the page plate
    (`--bg1` on `--bg0` is 1.18:1, one region to the eye). Everything else --
    a rule between two paragraphs in a card, a table cell edge, the frame on a
    thumbnail, a static chip -- keeps `--hairline`.
    - **A SEPARATOR GLYPH IS A BOUNDARY, AND A HAIRLINE TOKEN MUST NEVER PAINT
      ONE.** A rule weight is authored to sit BELOW every text threshold,
      because a hairline is a line drawn beside content and never a mark drawn
      as content. The notebook's meta middots were `--nb-hairline-strong` and
      measured 1.48:1 on the light plate's card, 1.58 on the default and 1.63
      on IDEA -- invisible on all three, so the thing they exist to separate
      was not being separated on any of them, and nothing on screen reports
      that. They take the room's `--boundary` (per-plate already, so one rule
      fixes three), and they clear the 3:1 a boundary carries rather than the
      4.5 of the text beside them.
  - **DO NOT RAISE `--hairline`. That is the rejected alternative, and it is one
    line.** It is drawn on ~190 elements in the classroom alone, almost all of it
    decoration; raising the one token draws every one of them at full strength
    and turns a tuned surface into a wireframe, which nothing on screen reports.
    `tests/boundary-token.test.ts` reddens on it, and on a decorative rule swept
    onto the load-bearing token.
  - **IT IS PER THEME, AND THE NOTEBOOK READS IT RATHER THAN DECLARING ITS OWN.**
    Since ledger 0297 `.nb-root` takes the site's value through
    `--nb-boundary: var(--boundary)`; a site theme that moves the grounds moves
    `--boundary` with them. The `:root` value is measured against the dark green
    plate and is 1.29:1 on paper, which is why Space White declares its own.
  - **THE VALUE MOVES IN LIGHTNESS ONLY**, on the room's own hue and saturation
    -- `--boundary` is `--text-3`'s hue at 46% instead of 38%. `--text-3` itself
    was the obvious candidate and does NOT clear: 2.95:1 on `--surface-2`, which
    is exactly where the grading console's option controls sit, so the local
    override that had been taken as "3.13:1" had been measured against the wrong
    ground.
  - **THE LAUNCHER'S `--acc-edge` IS THE SAME CONTRACT WITH AN IDENTITY COLOUR
    IN IT**, and is the one place that spells it separately: on the dark themes
    a card's edge carries the app's brand, and swapping in a neutral grey would
    delete eleven deliberate identity decisions to satisfy a rule the accent
    already meets. On Space White it IS the neutral line, the plate's
    `--plate-hair` (see the light-twin rule below).
  - **MEASURE BY PAINTING TO A CANVAS AND READING THE PIXEL BACK.** These
    resolve to `color(srgb ...)` and `color-mix(...)`, which a regex over
    computed styles skips silently and then reports the plate instead of the
    real ground. Composite the colour over its ground and read the composited
    value; an alpha rule's ratio depends on what is behind it.

- **Launcher cards carry a PER-APP accent AND an optional per-app TEXTURE, both
  declared in the stylesheet and keyed on `data-app`, with the shared brass/gold
  pair and the brushed-metal token as the live defaults.** The identity is
  deliberate: GAUNTLET and GREENLINE carry their product colours, VANGUARD its
  arcade green, the FRC card FIRST's red and blue, Tournaments its room's
  `--tnm-accent`/`--tnm-gold`, and the Coin Ledger the neon-terminal palette its
  own page is built from. An app that declares nothing takes the shared pair, so
  a NEW card looks right with no entry anywhere.
  - **UNDER THE SITE PLATE THE TEXTURE IS NOT DRAWN AND THE ACCENT IS (ledger
    0346).** Six of the textures are ruled fills or grids, which the no-grid rule
    removes, so `site-plate.css` replaces every texture rather than sorting them;
    the card keeps its `--acc-edge`, its ink and its `--bg1` face (the ground its
    Space White ink was measured on) and takes only the plate's depth; what those
    are on Space White is AppLauncher's own theme-keyed rule. A texture
    is still worth declaring for `SITE_PLATE = ''`, and costs nothing otherwise.
  - **A CARD QUOTES ITS OWN ROOM OR IT DECLARES NOTHING.** Those are the only two
    honest answers. A pair invented for a card whose app has no colours of its own
    is inventing an identity for the app -- classroom, coin-desk, dashboard and
    admin take the default for exactly that reason. And a card whose room DOES have
    a rule inherits the rule with the colours: Tournaments spends its emerald once,
    on the mark, because "at most one dominant emerald element per screen" is that
    theme's own hard constraint.
  - **A rule may declare a TEXTURE and still take the shared accent** (the notebook
    card: brass is correct for it, and restating a default is how a default
    drifts). What a `[data-app=...]` rule may not be is inert -- it has to carry at
    least one of the five per-card properties, which
    `tests/home-order-and-accent.test.ts` asserts.
  - **THE FRC MARK IS NEVER ANIMATED, and that outranks matching the cards either
    side of it.** FIRST's brand guidelines prohibit altering the mark, and motion
    is an alteration. Every other app mark is a component in `$lib/marks` with a
    3-4.6s cycle gated behind `prefers-reduced-motion: no-preference`, which the
    launcher plays ONCE (each mark's `once` prop, ledger 0298), and
    **nothing is hidden in a base state**: with the animation cancelled every
    animated element is at full opacity and no transform, so a reduced-motion
    reader sees the whole glyph.
  - **THE MECHANISM IS THE RULE, AND IT IS A CASCADE ARGUMENT, NOT A TASTE
    ONE.** The pairs used to arrive as an INLINE style written from a
    `PortalApp.theme` field, and **an inline custom property beats every class
    rule** -- so `.app-card`'s shared pair was dead code that could not paint,
    no later rule could correct a single card, and the value was discoverable
    only by reading the registry. They are now plain rules on
    `.app-card[data-app='<id>']` in `AppLauncher.svelte`, which sit INSIDE the
    cascade: the default is reachable, and overriding one card is one selector.
    **There is still no colour field on `PortalApp`** -- `src/lib/portal-apps.ts`
    carries an app's identity, never its paint, because a field there is how the
    value gets read back onto the element again.
  - **AN IDENTITY COLOUR IS NEVER MOVED TO PASS A CONTRAST CHECK; the derived
    value moves.** `--acc-primary`/`--acc-secondary` are the brand. `--acc-ink`
    is the glyph colour every text, icon and edge derives from, defaulting to
    the identity, and it is what a card re-pins when the brand cannot carry
    text. FRC is the only case: #ED1C24 measures 3.41:1 on `--bg1` (it is made
    for the white paper `.frc-root` puts it on), so the ink is the same hue and
    the same saturation at 68% lightness instead of 52%. **Lightness only --
    desaturating is how a brand quietly stops being itself.** If a colour cannot
    clear while staying recognisable, say so and stop.
    - **THIS IS NOT A LAUNCHER RULE, IT IS THE RULE, and there are three of it
      on a dark ground and four light-ground twins beside them (ledger 0297,
      see the scoped-theme rule below).** `--acc-ink` for a card, `--violet-ink` for anything painting a WORD
      in `--violet` (the raw accent measures 2.88 / 2.45 / 2.30 as text on
      `--bg0` / `--bg1` / `--bg2` -- not a near-miss, unreadable), and
      `Pathway.ink` in `src/lib/pathways.ts` beside `Pathway.color`. In each the
      IDENTITY paints the fill and the edge and the INK paints the word and the
      glyph (the one exception is the launcher under Space White, below, where
      the words are one green and the twin paints the strip), the ink DEFAULTS
      to the identity where the identity already carries
      text (three of the six pathways do, and simply repeat it), and the move is
      lightness only. `pathwayInk()` sits beside `pathwayColor()` so "tint this
      name in the pathway colour" has a right answer to reach for.
  - **`--acc-edge` IS THE SHARED `--boundary` CONTRACT WITH THIS CARD'S
    IDENTITY COLOUR IN IT** (see the `--boundary` rule above for the contract
    itself). It draws the card edge, the only thing separating a card from the
    page, so it clears 3:1. `--acc-line` outlines the CTA pill, which decorates
    a label nobody can operate on its own, and stays faint. On the dark themes
    this is the ONE place the neutral token cannot be used: the edge carries the
    brand. On Space White it is the plate's hairline (3.27:1 on the plate's
    page), with `--boundary` behind it for the `SITE_PLATE = ''` revert.
  - **A HOVER FILL IS PINNED, NEVER MIXED FROM THE INK ABOVE IT.** The CTA
    pill's hover background was `color-mix(ink 12%)`, so lightening the ink
    lightened its own ground with it: sweeping FRC from 80% to 40% brand red
    moved that case 3.41 to 4.89 and cost the whole colour. Pinned to `--bg2` it
    stops chasing.
  - `tests/home-order-and-accent.test.ts` enforces all of this; a stylesheet
    only makes the right thing available.

- **A SITE THEME MAY BE ROUTE-SCOPED, AND SPACE WHITE IS (ledger 0297).**
  `SCOPED_SITE_THEMES` names the themes that apply only inside
  `THEME_SCOPE_PREFIXES` (the classroom, the reference viewer, the notebook,
  since ledger 0384 the public IDEA Coin Ledger at `/coins`, and since ledger
  0396 the feedback window's own page at `/feedback`, so the Ledger's framed
  window follows the stored theme the Ledger does),
  the site plate's own scope (since ledger 0360; see the site-plate rule) and
  `THEME_SCOPE_EXACT` (the home page, as the exact path `/` and never as a
  prefix, because every route starts with a slash). `themeInScope` matches on a
  path boundary and FAILS CLOSED, so `/classroomx` is out and a room nobody
  listed keeps its own look. **`themeAttrFor` in `src/lib/theme.ts` is THE ONE
  decision** -- session gate, default and scope -- and both `ThemeRoot` and the
  pre-paint script read it; a second spelling is a room that flashes white or
  stays dark with nothing to compare the two.
  - **THE THEME IS SET BEFORE FIRST PAINT, AND THE SERVER SENDS ANSWERS, NOT
    RULES.** `src/app.html` carries `THEME_BOOT_MARKER`; the `themeBoot` handle,
    sequenced after `authGuard` in `hooks.server.ts`, replaces it with a script
    that is a LOOKUP TABLE: the server evaluates `themeAttrFor` for every theme
    on this path and session, and the script only looks up the stored
    `localStorage` value. No scope logic runs in the browser, so it cannot
    disagree with the server's. `THEME_BOOT_HARNESSES` are the only routes
    where the server assumes a dev session.
  - **A SCOPED THEME MAY REPAINT A SEMANTIC HUE FOR ITS GROUND, AN UNSCOPED ONE
    MAY NOT**, and it moves lightness only. `tests/theme-tokens.test.ts` asserts
    it, and sweeps the route scope in both directions (the FRC, FSP, GAUNTLET,
    GREENLINE, VANGUARD and IdeaCAD rooms, the tournament TV stage and the
    `/a/`, `/b/` and `/hx/` document routes stay OUT).
  - **DARK ISLANDS STAY DARK THROUGH ONE ZERO-SPECIFICITY BLOCK** in
    `src/lib/design-system/themes/space-white.css`,
    `:where(.ic-root, .nb-island, .deck-stage)`, which restores every token the
    theme moves plus its dependency closure. The test DERIVES the closure, so a
    token added to the theme without its island restore reddens. The photo
    corrector and the camera wear `.nb-island`; projected slides stay dark.
  - **A LIGHT THEME HAS LIGHT-GROUND TWINS FOR EVERY IDENTITY INK, and the
    rule is the ink rule above.** `Pathway.inkOnLight`, `fgOnLight` on an
    avatar preset, `AVATAR_TINTS_ON_LIGHT`, and a Space White `--acc-ink` per
    launcher card: the identity color never moves, the twin moves lightness
    only. `tests/space-white-inks.test.ts` parses the real grounds out of the
    theme file. A hover wash under a light theme mixes into `--bg1`, never into
    transparent, or it disappears on white. A theme difference inside a
    component is a theme-keyed override there, never a new token in the theme
    file: theme files hold tokens only.
    - **ON SPACE WHITE EACH BRANDED CARD PAINTS ITS OWN LIGHT TWIN AGAIN
      (ledger 0380, report 48bdb5be, REVERSING the 2026-10-07 round's one
      green).** Collapsing every word, glyph and call to action into one green
      made every app the same colour, and Mr. Pina said so ("all my apps look
      the same in white mode"). The theme's `.app-card` rule no longer
      re-pins `--acc`, so each card's light ink reaches its word, its glyph,
      its CTA and its strip, and the edge stays the plate hairline. **AND EVERY
      APP IS A DIFFERENT COLOUR (ledger 0381, decision 62, Mr. Pina's
      "Distinct colour per app").** Lightness-only twins still left near
      neighbours (GAUNTLET beside VANGUARD, the accent-less cards beside the
      theme green), so each Space White ink is chosen for the card rather than
      derived: on its own brand's hue where it has one, and EVERY pair of cards
      at least `DISTINCT_FLOOR` (10) apart in CIEDE2000, every one clearing 4.5:1
      on the card. `tests/space-white-inks.test.ts` pins the clearance, the
      floor over every pair, that every app the launcher can draw has an ink
      (so a new app cannot arrive without one), and, as the negative control,
      that the twins this replaced fail the floor.
  - **A PHONE AT 30 FPS IS NOT A SLOW DEVICE (report R09).** The Matrix rain
    degrades only when the median of a 90-frame window is 45ms or longer
    (`judgeFrame` in `$lib/design-system/themes/matrix-rain.ts`), after a 3s
    start-up grace, and paints are paced by time (`paintDue`, about 30/s on any
    panel), never by counting frames. At phone width the rain cannot get
    brighter (`--dim` has 0.09 of headroom over the trail), so `rainForWidth`
    changes only the fade and makes the streak longer; any change to gain or
    head colour re-runs the worst-frame test. `data-motion` and
    `data-frame-ms` on the canvas are what a harness reads, and
    `tools/browser-verify/_rain-mobile.mjs` reads them in a mobile-emulated
    browser.
  - **THE PROJECTOR IS A MEASURED CONDITION, NOT A MODE.** `PROJECTOR_MODEL` in
    `tools/browser-verify/checks.mjs` (300:1 native, 10% ambient wash) is
    recorded beside every contrast reading, with floors of 4.5 for body text,
    3.0 for muted and status text, 2.0 for a boundary and 1.1 for a ground
    step. Space White clears every one; IDEA and Matrix do not and were left
    untouched by design.
  - **THE HOME EMBLEM IS SERVED AS A `srcset` OVER RIGHT-SIZED COPIES** under
    `static/IDEA/`, never as the 2.6 MB source, and on Space White it is a LIGHT
    LOCKUP, not the dark one in a display window (decision 40 item 2, amended
    2026-09-28 by report R13): the same geometry drawn FLAT as
    `tools/idea_logo_vector.py`'s `SLATE` palette (a slate gear with a lit green
    rim behind a deep green plate, white lettering at 7.59:1) and rasterised by
    `tools/idea_emblem_raster.mjs`, whose board mode lays every candidate
    palette out on the real Space White grounds. **THE LETTERING STAYS LIGHT ON
    EVERY THEME.** IDEA's letters are broad light strokes with narrow gaps, so
    inked dark it is the GAPS that read as the word, which is half of why 0298's
    pastel-plate, dark-lettered lockup was retired; a light-theme variant
    changes the plate and the gear, never the lettering's lightness.
    `AnimatedLogo`'s own stylesheet picks the pair off the pre-paint theme
    attribute, so there is no flash, and the light pair is `loading="lazy"`, so
    a dark theme never fetches it. `.legacy-index` reads its neon tints through
    `--li-*` room hooks so a light theme can point them at its inks. App marks
    follow the once-only standard `IdeaCadMark` set: one pass, rest frame held,
    nothing hidden in a base state, and the launcher mounts every mark `once`.
  - **THE HOME PARTICLES ARE OFF ON SPACE WHITE (Mr. Pina, 2026-10-07,
    reversing his 2026-09-29 answer that kept them).** The theme takes the
    canvas away the way Matrix does, and the page's frame loop stops while the
    canvas has no box (`data-particles` reads `paused`) and restarts from the
    same theme watch that re-reads the field's ink. IDEA keeps the field: its
    ink and glow are room hooks on `#bg-canvas` (`--li-particle`,
    `--li-particle-blur`), the brand green with a glow of 4 at 35%.
  - **HOVER IS A ROLE, `--hover-ink`, NOT A HUE** (decision 40 item 1): brass on
    the dark themes, Space White's green ink there, because a lightness-only
    gold over white is brown (#715d22). A `:hover` rule that wants the brass
    reads the role. Every launcher card's word and glyph take the green ink on
    Space White (the four accent-less cards since decision 40, the rest since
    round 2026-10-07), and the home page's last gold words, the class feed's
    Updated flag and the change log's Visual tag, moved off it with them; gold
    stays for true special callouts.
    Classroom words and glyphs that painted `--gold` (the assignment glyph,
    file badges, rubric points, course codes, small links, My Classes' card
    ink) read `--hover-ink` since report R14; `--gold` stays only on pins,
    instructor-only banners and labels, and the to-do's feedback flag.

### Scoped themes are deliberately off-brand, and stay in their room

Each is scoped under one wrapper class, opaque, at `z-index: 1` so `.bg-fx` never
shows through, and neutralizes the app-shell globals that would leak (the green
`// ` h2 prefix, the link glow):

**A SHARED COMPONENT MOVING INTO A SCOPED ROOM READS ITS COLOURS THROUGH A ROOM
HOOK, and the portal token is the FALLBACK.** `var(--body-link, var(--cyan))`,
the way `Disclosure` reads `--disc-accent`. The portal's semantic tokens are
tuned for a dark plate, so a component built in the shell and mounted in a light
room carries values measured against the wrong ground: `ItemBody`'s link landed
at **2.00:1**, `SaveIndicator`'s failed message at **3.65:1** and
`VersionBadge`'s stamp at **3.20:1** on the notebook's paper the first time
each arrived there. **The stamp is the one that says to go LOOKING**: nobody
carried it into the room -- it had been mounted in every notebook header all
along, reading `--dim` off a plate it has never been on, which is what a hook
audit finds and a change review never does. Written as a hook the
shell renders byte-identically and the room points the name at the corrected
value it already has (`--nb-accent-ink`, `--nb-error`) -- and the hook is
declared ON THE ROOM'S OWN WRAPPER, never on the component, or it sits on a
descendant and beats the room. **The one exception is a component mounted as the
room's SIBLING**, which no wrapper declaration can reach: the root-mounted report
box reads `--fb-room-bg` and its siblings (`SiteFeedback.svelte` lists them), and
each out-of-scope room declares them on `body:has(.<room>)` in its own
stylesheet, as literals (report 35) -- except GAUNTLET's, which sit in
`SiteFeedback.svelte` itself, because the viewport stylesheet is the game's own
design system (ledger 0396). **MEASURE WHEN A SHARED COMPONENT ENTERS A NEW
ROOM**; both of those had passed review in the room they were written for.

**AND THE SAME ARITHMETIC BINDS A TOKEN MOVE, IN THE OTHER DIRECTION: A PORTAL
TOKEN CANNOT BE RAISED TO FIX A PORTAL GROUND UNTIL THE LIGHT ROOMS THAT READ IT
HAVE BEEN MEASURED.** `--dim` clears the two DARKER of the three portal
grounds -- 5.31 on `--bg0`, **4.52** on `--bg1`, **4.24** on `--bg2`. **THAT
MIDDLE FIGURE READ 4.46 UNTIL 2026-09-22, WHICH IS THE SIDE OF 4.5 THAT CHANGES
THE VERDICT**, and it was corrected only because a bundle was issued to fix a
`--bg1` call site that turned out not to need fixing (ledger 0286). #849080 on
#1a2a1a is 4.52 under two independent instruments -- an sRGB computation and
Chromium's own compositor through `npm run verify:browser` -- and every OTHER
number in this paragraph reproduced exactly, which is what says the drift is
this one figure rather than the whole row. The FRC readings below were NOT
re-measured. Prefer the instrument to the number: composite the two colours and
read the pixel back. The obvious answer, lightening it (hue 105deg and 6.7%
saturation held, 53.3% -> 56%, `#8b9687`, giving 5.76 / 4.90 / 4.60), is REFUSED: `--dim` is also read by
five FRC components on `.frc-root`'s paper, where it already measures 2.95 /
3.23 and the candidate takes it to **2.72 / 2.98**. Degrading a room the sweep
did not cover, to fix one it did, is the exact mistake this whole section
exists to name. So the two failing CALL SITES took `--text-2` (the register's
own token for secondary labels and meta, 6.91 / 5.88 / 5.51 on the same three
grounds) and the token did not move. **`--dim` on `--bg2` is still a
failure waiting for a use**, and ledger 0346 found three uses (the home stats
plate's separator, a home class card's section line, the dashboard's FRC unit
titles, all 4.24:1) and gave each `--text-2` the same way; FRC's own `--frc-gray` measures 2.77 on its own
surface, so the room needs a hook of its own before either can be fixed
properly. That is a bundle, not a line.

- **`.gt-root` -- GAUNTLET VIEWPORT** (`docs/GAUNTLET-DESIGN.md`). All GAUNTLET UI
  must conform. Read tokens and reuse the viewport components rather than writing
  one-off styles. The volumetric CAD background replaced the scrolling isometric
  grid, which is **retired -- never reintroduce it**. The FeatureManager rail is
  hidden by default; do not make it visible by default. Modeling modes green,
  knowledge modes cyan. **SOLIDWORKS branding is nominative text only: never the
  logo, a lookalike, or its red-on-white scheme**; the Dassault Systemes disclaimer
  footer stays on every page. The VIEWPORT layer is visual only -- it never touches
  data flow, auth, scoring, or room timing.
- **`.nb-root` -- the notebook, which FOLLOWS THE SITE THEME, and that is Mr.
  Pina's decision of 2026-09-23** ("visually and functionally the IDEA notebook
  should follow IDEA Classroom, not the other way around"; ledger 0297, recorded in
  `IDEA_CLASSROOM_REBUILD_PLAN.md`, superseding decisions 14 and 15 on appearance).
  There are no notebook plates, no plate picker and no notebook masthead: the
  notebook renders inside `ClassroomShell` and paints whatever the site theme is,
  Space White included.
  - **THE DEPENDENCY RUNS FROM THE ROOM TO THE REGISTER, NEVER BACK.** `.nb-root`
    in `colors.css` aliases the register (`--nb-bg: var(--surface-0)` through
    `--nb-boundary: var(--boundary)`), and nothing notebook-named lives at `:root`.
    The one re-point left inside the room is `--text-3`, which reads
    `--nb-ink-faint`, because the classroom's `--text-3` is decorative tertiary and
    in here it is real muted copy (it fails 4.5:1 on every dark ground as text).
    The canvas is one rule, `body:has(.nb-root) { background: var(--surface-0) }`.
  - **What the register has no counterpart for is AUTHORED PER SITE THEME AND
    MEASURED, never borrowed across**: the review grid's `--nb-cell-*` inks and
    pinned fills, the folder colours, the status inks, the brass accent and
    `--nb-shadow`. They are declared in the dark base `.nb-root` block and again in
    `:root[data-theme='matrix'] .nb-root` and `:root[data-theme='space-white'] .nb-root`
    for only what those themes move, each with its measured table beside it. A
    grid state added later arrives in every block or not at all.
  - **A PLATE ID A STUDENT STORED BEFORE THIS IS SWEPT, NEVER READ.**
    `RETIRED_NOTEBOOK_PLATES` and `retireStoredNotebookPlate` in
    `$lib/notebook/notebook-theme.ts` answer every stored `idea_notebook_theme`
    value with the site theme and clear the key without ever throwing, so no stored
    value can error or strand anybody on a look they cannot change back.
  - **THE PHOTO OVERLAYS STAY DARK IN EVERY THEME AND LIVE IN THE TOP LAYER.**
    `PhotoCorrector` and `CameraCapture` are modal `<dialog>` elements opened with
    `showModal()` and carry `.nb-island`, which Space White's dark-island block
    restores; a viewfinder that glares and a drag quad that must hold its contrast
    over an arbitrary photograph are not preferences. The room's old
    `position: relative; z-index: 1` wrapper is gone, because it buried those
    overlays under the classroom header.
  - **MUTED COPY THAT SITS ON AN ACTIVE FILL TAKES `--text-2`, NEVER `--text-3`.**
    `--nb-accent-wash` is a veil laid on a ground, and on a dark ground it lightens
    the ground out from under the tier below it: measured on the retired plates,
    `--text-3` failed six of nine plate-by-ground combinations (3.30 to 4.31) while
    `--text-2` cleared all nine. `ComposerFiling`'s `.pick.selected .pick-meta`
    (the check-in picks behind the composer's "Filed to ..., Change", ledger 0298)
    implements this; a surface putting muted copy on a selected row joins it.
    **Lowering the wash is the rejected alternative**: at the 6% that would rescue
    `--text-3` the fill reads 1.09:1 against its card and the row stops being
    marked at all.
  - **A WASH IS A SIGNAL, AND A SIGNAL IS NOT THE THING TO SPEND.** Every ink this
    room authors is measured against the bare grounds AND the wash over each of
    them; deepening the ink is the fix (lightness only), thinning the wash is
    refused, because it cannot reach the target and destroys the signal on the way.
- **`.cr-root` -- classroom calm surfaces.** `--cr-gutter` and `--measure-*` are the
  ONE page-width decision (`classroomMeasure` in `nav.ts`).
  - **THE CLASSROOM WEARS THE PLATE, AND ONE CONSTANT TURNS IT ON (ledger 0345,
    decision 40 item 4).** `src/lib/classroom/plate.css` is the shape language Mr.
    Pina approved on `/dev/themes-shape`; every rule keys on the class
    `CLASSROOM_PLATE` in `src/lib/classroom/plate.ts` names, which the classroom
    layout puts on `.cr-root`. **Setting that constant to `''` is the whole revert.**
    The `/dev/themes-shape` after column and every classroom `/dev` harness read the
    same constant, so a harness never measures a look the site does not have; a new
    classroom harness puts `{CLASSROOM_PLATE}` on its `.cr-root` and imports
    `classroom.css`, which is what loads the plate. `/reference` loads it and never
    sets the class.
  - **ONE GEOMETRY, THREE COLOUR BLOCKS.** A length is declared once on `.cr-plate`;
    a theme block holds colours only, shadows included.
    `tools/browser-verify/_classroom-plate-boxes.mjs boxes` diffs every box across
    the three themes and must read 0 (its planted-length control must not); its
    `fingerprint`/`compare` pair is the scope proof that no other app moved.
  - **CONTENT IS BELOW THE SCOPE.** The rules sit in `@scope (.cr-plate) to (...)`,
    and the lower bound lists every island of somebody's work or somebody else's
    design (an item body, rendered markdown, the rich-text document, a deck stage,
    an IdeaCAD embed, the photo overlays, a worksheet frame) plus the notebook
    review grid's whole card, whose locked cell inks were measured on that card.
    A new content surface joins that list, never gets a plate rule of its own.
  - **A KEY'S STATE IS ONE OF SEVEN SPELLINGS, AND A NEW TOGGLE USES ONE OF THEM.**
    The key list in `plate.css` lights `[aria-pressed="true"]`,
    `[aria-selected="true"]`, `[aria-checked="true"]`, `.on`, `.is-on`, `.active`
    and `.picked`. A button with a new custom class is drawn as a key only once it
    joins that list with its state spelling; a state the list does not know
    renders as a plain key, which hides it.
  - **RAISED IS PRESSABLE AND INSET IS NOT** (`IDEA_INTERFACE_STANDARDS` 14): a
    chip or status tag is a recessed tag and never gains a drop shadow; a chip
    that is a link or a button is a small key.
  - **THE DARK FACES ARE AS DARK AS THE SITE'S INKS NEED**, and that is measured:
    round 3's lighter charcoal cards dropped the error red, the warning ink and
    `--text-2` under 4.5:1 on real pages, so the card face is the lightest
    ground the error red still clears on. Lighten a dark face only with every
    ink re-measured.
- **THE REST OF THE SITE WEARS THE SAME PLATE THROUGH A SECOND SWITCH (ledger
  0346, `IDEA_INTERFACE_STANDARDS` 14).** Every rule in `plate.css` keys on
  `:is(.cr-plate, .site-plate)`, which has the specificity `.cr-plate` alone
  had, so the classroom is unchanged (measured, 0 differing elements). `SITE_PLATE`
  in `src/lib/shell/site-plate.ts` is the site's one-line revert; the root layout
  wraps a page and its root-mounted siblings in a `display: contents` element
  carrying it only where `sitePlateInScope` says so, so a LEFT-OUT product's DOM
  is byte-identical (GAUNTLET, VANGUARD, GREENLINE, IdeaCAD, FRC, FSP, legacy
  and student content, the tournament TV stage, the projector). The scope is a
  list of what is IN and fails closed; a new in-scope page joins
  `SITE_PLATE_PREFIXES` (and its harness `SITE_PLATE_DEV_PREFIXES`), and a
  harness mounting a left-out product must never be listed.
  `src/lib/shell/site-plate.css` holds only what is the site's (room grounds,
  the maps blueprint grid removed, the launcher cards); a site surface's own
  keys, tags and panels join the SAME lists in `plate.css`, room-qualified
  (`.tnm-root :is(...)`), never a second copy of a recipe. **SPACE WHITE COVERS
  EVERY SITE-PLATE PAGE (ledger 0360).** `themeInScope` reads
  `SITE_PLATE_PREFIXES`, `SITE_PLATE_EXCLUDE` and `SITE_PLATE_DEV_PREFIXES`
  themselves, never `sitePlateInScope` (whose trailing-slash strip reads `//` as
  `/`), whatever `SITE_PLATE` is set to. A room that redeclares the portal tier
  on its own wrapper (`.tnm-root`, the Maps viewer's jade, `.fg-root`) carries
  its light twin in ITS OWN stylesheet keyed on `:root[data-theme='space-white']`,
  moving identity hues in lightness only; `--blueprint-bg` is a Space White
  token, so the Maps drawing is dark on light; the tournament TV stage stays out
  by the plate's exclusion and is a dark island (`.tnm-root.tv`) where a harness
  mounts it in scope; and a Foundry card's cover stays dark in every theme.
  `tests/theme-tokens.test.ts` walks every page route and holds the policy both
  ways.
- **`.cd-root` -- the coin desk.** It is NOT a repaint: the desk sits on the
  portal's own dark plate and borrows nothing but geometry. `.cd-root` is
  registered in `$lib/shell/split.css` (gutter, scrollbars, the split) and
  `$lib/coin-desk/coin-desk.css` holds what belongs to the desk alone -- the
  page measure, the masthead line, the card rhythm, the reading cap and the
  `.cd-cols` column rule. **BOTH `/coin-desk/+layout.svelte` AND
  `/dev/coin-desk` IMPORT IT**, which is the point of it existing: the two used
  to carry byte-identical scoped copies of the page measure, so the harness
  could measure a width the real page did not have with nothing to say so.
  - **THE DESK IS ONE WIDTH, AND IT USED TO BE TWO.** The measure defaults to
    `--measure-split` (92rem), which is what split.css already gave the Log
    area through `:has(.cr-split)`; every other area read `--measure-panel`
    (52rem) and measured 832px of a 1440px window. **Prose is capped
    separately at `--measure-reading`** -- widening a page is not widening a
    sentence, and the two have to be said in different rules or the first
    ruins the second.
  - **IT TAKES THE LEDGER'S PATTERNS AND NOT THE LEDGER'S PALETTE.** The tab
    bar's shape, its Orbitron uppercase and its underline are
    `src/lib/legacy/coins/index.html`'s; the ACTIVE COLOUR is not. That page
    marks its current tab in gold, and in this register `--gold` is "special
    callouts" while `--green` is "active navigation" -- matching a legacy
    page's palette is not a licence to reassign a fixed semantic role. Same
    call for a FINE, which the Ledger paints red and the desk paints
    `--amber`: `--crimson` is reserved for LIVE/REC/error and never identity.
- **`.fg-root` -- the Foundry FORGE** (`src/lib/foundry/forge.css`, mounted by
  `src/routes/foundry/+layout.svelte` with the persistent `FoundryShell`).
  Molten metal poured, worked, cooled, finished: GREEN stays the driving colour
  and the FINISHED state; the `--fg-heat-*` scale (amber/orange) means IN
  PROGRESS and nothing else may wear it. The five status trios
  (`--fg-st-*-ink/-fill/-edge`) are the heat language -- draft cold iron,
  submitted heating, approved cooled green, rejected quenched grey, hidden
  shelved flat -- read ONLY through `ForgeStatus.svelte`, whose tone vocabulary
  is `versionLabel`'s own plus `shelved`; fills are PINNED, never mixed from the
  ink. `MoltenSeam.svelte` is the signature pour (CSS conveyor layers,
  transform-only, paused offscreen and on a hidden tab, still-gradient under
  reduced motion) and belongs ONLY where heat belongs: the shell header, the
  review queue while something waits, the submitted state. The room aliases the
  shared vocabulary onto its own plate the `.nb-root` way (source and target on
  `.fg-root` itself) and does NOT re-point the semantic accents. It is in
  `split.css`'s room lists like `.cd-root`. `$lib/foundry/nav.ts` is the one
  statement of the IA (the contract has a TOP-LEVEL tab of its own; only the
  starter still resolves to the `submit` tab); the shell's Review tab renders
  for admins only, with the pending count asked only for admins in the layout
  load -- null, never zero, for everyone else. A major release is not a
  lifecycle state and is not a `ForgeStatus` tone: `FoundryMajorMark` is its one
  mark, a star and the word in the violet family, pinned on a cover and
  `--violet-ink` in a page, and nothing in this room draws it in gold or amber,
  which sit inside `FOUNDRY_HEAT_HUE_BAND`.
- **`.glb` -- GREENLINE brand** (`Greenline Art Direction Reference.html`,
  direction "1A / IMPACT"). Chrome/steel dominant; **GREEN is surgical** (one
  signature thread, the player's own machine); **AMBER is impact state only**, never
  ambient. Archetypes read by silhouette, never hue.
- **`.frc-root` -- FRC navy/red** with the official FIRST logo used UNMODIFIED
  (never recolour, distort, stretch or crop; keep the clear space). IDEA green
  appears ONLY for the achievement state and the "An IDEA program" footer mark. The
  trademark line stays: "FIRST and FIRST Robotics Competition are trademarks of For
  Inspiration and Recognition of Science and Technology (FIRST)."
- **`.fsp-root` -- FSP neutral navy/gold**, system sans. Deliberately not IDEA.
- **A LIVE TOURNAMENT'S FORMAT IS AN ADMIN'S TO CHANGE, PREVIEWED FIRST (0266,
  ledger 0392).** `tournament_live_config_preview` answers what would change
  and what it does to played matches in words (`liveEffectLines`), and
  `tournament_live_config_apply` takes the previewed config back as its
  `expected` argument and refuses `stale` if anything moved in between. Played
  and started matches keep their length, nothing is re-decided, no coins
  move, qualifying stays locked (`LIVE_QUALS_LOCK`), and the change is logged
  as a correction. **BEFORE THE FIRST RESULT ANY HOST CHANGES THE LENGTHS
  THROUGH `tournament_update` ITSELF (0317, ledger 0455)**: a drawn bracket
  with nothing started or decided (`_tournament_has_result`; a bye is not a
  result) takes a new `best_of_default` and final length, every unplayed match
  is re-stamped, qualifying, scoring and team size stay as drawn, and the host
  console asks `bracketHasResult` in `src/lib/tournaments/settings.ts`. After
  the first result the old lock answers in its old words and an admin keeps
  the preview above.
- **A FUNCTION A CLIENT REACHES MUST NOT RUN AN UPDATE OR DELETE WITHOUT A
  TOP-LEVEL WHERE, TEMP TABLES INCLUDED (ledger 0455).** The hosted project
  loads pg-safeupdate for API requests, so such a statement raises "UPDATE
  requires a WHERE clause" in production while every db suite passes (the
  fixture loads no extension). `_tournament_qual_seed_order` (0062) did it to
  its own `pg_temp` standings and stopped every seeded bracket for weeks;
  `tests/db/tournament-bracket-seeded-0317.test.ts` holds every tournament
  function to the rule, with the pre-0317 body as its positive control.
- **`.tnm-root` -- Tournaments emerald.** **Restraint is a hard rule: at most ONE
  dominant emerald element per screen** (the active-match indicator, the primary
  action, or one key status); a third surface takes the panel token instead. Gold is
  placement and rank only. Per-entry banner styles are a SEPARATE palette the students
  own and are never constrained by these tokens.

**Scrollbars:** styled once per room (`scrollbar-color` inherits; `scrollbar-width`
does NOT, so it is set on `.cr-root, .cr-root *`). The thumb is a tertiary token,
never the accent. **No region may hide its scrollbar.** A gradient says there is
more; it is not a control. A region loses its scrollbar only by no longer
scrolling.

### Performance budget

The target is **the school's desktop computers, roughly 6-8 years old** -- a real
but aging GPU budget, not tablets. Moderate polycounts, geometries and materials
reused across instances (draw calls are the budget to watch), no dynamic per-light
shadows. Raise a field-size or fidelity cap only behind a measurement.

---
