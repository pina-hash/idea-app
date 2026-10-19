# Known traps: Svelte 5 and the DOM

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Effects, reactivity, stylesheets, stacking, hit targets. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

## Known traps

These have each cost a debugging session. They are not hypothetical.

### Svelte 5

- **Reading state inside an `$effect` SUBSCRIBES to it** -- including state read
  inside functions the effect calls. An effect that calls a transport takes a
  dependency on whatever that transport touches and spins. Wrap the work in
  `untrack` and pass its inputs explicitly.
- **AN `$effect` THAT CALLS INJECTED CODE -- A TRANSPORT, A PROP FUNCTION, A
  PROP-SUPPLIED CLIENT, ANY CALLER-SUPPLIED BINDING -- WRAPS THE CALL ITSELF IN
  `untrack`, AND THE FAILURE IS `effect_update_depth_exceeded` ON MOUNT.**
  Search for that string: it is the whole symptom, it arrives on mount, and it
  names nothing about the transport that caused it. This is the rule
  above pointed at the case where the code being called is not YOURS. A
  transport is written by whoever mounts the component, who cannot see the
  effect that calls it: everything it touches reactively before its first
  `await` joins that effect's dependency set, and anything it writes then
  re-triggers the effect. A transport that merely READS a `$state` array and
  appends to it -- an ordinary dev-harness log line -- is already a
  non-terminating loop, and the composer's category-suggestion effect was
  exactly this. **A real transport that happens not to loop is luck, not
  design**: the shipping one is a plain Supabase call with no reactivity in it,
  so production never spun while the interface silently forbade something
  nothing wrote down.
  - **TRACK THE INPUTS, UNTRACK THE CALL.** The dependencies the effect exists
    for -- the scope it refetches on, the transport lookup that says whether the
    feature is on -- are read TRACKED at the top of the body; only the
    invocation goes inside `untrack(() => load(ids))`. Untracking the whole
    effect body instead is the wrong repair: it buys the same safety by
    deleting the reason the effect exists, and nothing on screen reports an
    effect that stopped re-running.
  - **THE `.then` HANDLER NEEDS NO WRAPPING AND MUST NOT GET ONE.** It runs in a
    microtask, outside the tracking context, so a stale-response guard written
    there is already safe; wrapping it only suggests the rule is about promises
    rather than about the synchronous prefix, which is where the whole problem
    lives.
  - **A CALLBACK IS NOT EXEMPT FOR BEING SMALL, AND THE DEFECT IS NOT ABOUT
    ASYNC.** `ondirtychange?.(dirty)` is one prop call with no `await` in it at
    all, and `CountdownOverlay`'s `onDone?.()` under reduced motion is one prop
    call with no transport, no promise and nothing to cancel. Both are the same
    defect: the parent's handler is somebody else's code running inside this
    effect's tracking context, and whatever it reads reactively before it
    returns is now a dependency of an effect its author never saw. A parent
    whose handler flips the very flag the overlay's `active` is derived from is
    a loop, and nothing in the overlay can see that.
  - **AN INJECTED CLIENT IS THE SAME SHAPE AS AN INJECTED CALLBACK.**
    `ChallengeForm` takes a `SupabaseClient` as a PROP and called
    `supabase.storage.from(...).createSignedUrl(...)` straight from an effect.
    Measured, it genuinely cannot loop today: both mounts pass the real
    `createBrowserClient` object from `+layout.ts`, no harness mounts it with a
    stub, and nothing in `@supabase/ssr` reads a rune. **It is wrapped anyway,
    and the reason is written beside it** -- the rule is about the SHAPE, and
    "happens not to loop" is exactly the state the composer was in the day
    before a harness handed it a stateful transport. Where the client is the
    tracked input the effect re-runs on, hoist it (`const client = supabase;`)
    and untrack only the call, or the wrapping silently costs the re-run.
  - **IT IS ASSERTED ON THE SOURCE, NOT ON A MOUNT, AND THAT IS A LIMIT WORTH
    KNOWING.** `tests/classroom-composer-effect-reactivity.test.ts` cannot
    mount: effects never run under `svelte/server`, this suite is
    `environment: 'node'` with no DOM package, and `svelte` resolves to its
    server build -- measured, a bare `$effect.root` in a `.svelte.ts` fixture
    runs its effect ZERO times, so a runtime control written here today would be
    green and prove nothing. **Do not add one without the environment to run
    it.**
  - **AND IT SWEEPS ALL OF `src/`, NOT THE FILE THE BUG WAS FOUND IN. THE
    FILENAME IS HISTORICAL.** It parsed `ContentComposer.svelte` alone for one
    bundle; pointed at the tree it found SIX more, in five files across three
    subsystems, none of them the classroom. A checker aimed at the component
    that was already fixed only ever proves the fix is still there. It walks
    every `.svelte` file under `src/` and reddens with a file and a line.
    **DO NOT WRITE ITS FILE OR EFFECT COUNT DOWN HERE.** This sentence carried
    "350 files, 164 effects at the time of writing" and the tree was at 423 and
    196 within weeks -- a figure that decays every time somebody adds a
    component, hedged into being unfalsifiable rather than kept true. The test
    walks whatever is there; run it if you want the number. **`.svelte.ts` modules are
    outside it** -- they have no `$props()`, so "caller-supplied" is a different
    shape there -- and that gap is a TRIPWIRE rather than an omission: no such
    module runs an effect today, and the test reddens the moment one does.
  - **THE PURE-COLLECTION ALLOWLIST IS PER SITE, WITH A REASON AND A PINNED
    LENGTH.** A call whose member is `map`/`filter`/`find` over prop DATA takes
    no dependency the effect did not already have by reading the array. But
    `get`, `has` and `find` are on that list for `Map` and `Array`, so a
    transport NAMED `transports.get(id)` would be waved straight through by the
    method name alone -- which is fine to eyeball in one file and impossible
    across 350. So a pure-looking call clears only when its `file::callee` is
    named in `ALLOWED_PURE`, with the reason somebody checked, an exact count
    (a SECOND call at a blessed site is still looked at) and no line numbers (a
    list that has to be renumbered is one that gets renumbered without being
    read). The length is pinned, a stale entry reddens, and an unparseable
    component is a FAILURE rather than a skip -- a file the checker could not
    read is a file it never checked, and silently skipping it is how a sweep
    comes back clean over code it never saw.
- **An effect that calls something writing state must be deferred**
  (`queueMicrotask`), or it lands while Svelte is still settling the render and
  throws `state_unsafe_mutation` -- which surfaces as an unhandled rejection after
  which NO click handler in the tree fires again. The symptom is silent dead
  buttons, not an error banner.
- **A sentinel dependency next to a NON-reactive read does not track.** Derive
  toolbar/active state by PUSHING from the source's own events, not by bumping a
  counter beside an untracked read.
- **`bind:value` on `<input type="number">` COERCES to a number**, so `.trim()`
  throws. This has bitten three times. Type the state `string | number` and wrap
  the call so a throw cannot strand a busy flag.
- **Clear a busy flag in `finally`.** A throw mid-submit otherwise disables the
  form forever.
- **A success message set BEFORE a refresh that clears it flashes and vanishes.**
  Give the refresh a flag that skips clearing when it is the write's own follow-up.
  **A reset `$effect` keyed on `prop.id` is the same trap**: reading `prop.id`
  subscribes to `prop` too, and `invalidateAll()` hands the component a NEW
  object with the SAME id after the acknowledgement was set, so the reset runs
  again and wipes it. Compare against the last id in a plain variable
  (`FoundryInspector`'s `editsFor` and `filesFor`), and give a harness standing
  in for such a route an `onDecided` that hands over a fresh object too.
- **`{#key}` a detail pane on the selected id**, or moving between items hands the
  previous item's card a new row and keeps its open panels.
- **Re-derive a selection from the CURRENT list every read; never capture the row
  at click time.** The list reloads after every save, so a snapshot describes the
  state BEFORE the thing just saved to it.
- **An autofocus must be keyed on the ELEMENT, not on mount.** An input bound
  inside a snippet a child renders is not necessarily set at the parent's
  `onMount`, and the focus call is then a silent no-op.
- **A CHILD'S TEARDOWN RUNS WHILE THE PARENT IS UPDATING, AND CAN READ THE
  PREVIOUS SELECTION.** A teardown that "clears" something by calling back into
  the parent repaints with state that is already stale: IdeaCAD's context bar
  cleared its preview on unmount and left a consumed sketch drawn. Guard the
  teardown on the child's own state (it clears only what it set) and make the
  clearing function idempotent.
- **A `<svelte:element this={...}>` WHOSE TAG CHANGES BUILDS A NEW ELEMENT AND
  RE-RUNS EVERY CHILD**, state, pollers, animations and focus with it (Svelte
  5.56 keys the block on the tag). ClassView's root was `this={asPane ?
  'section' : 'main'}`, so every item open and close rebuilt the class page: the
  banner's arrival replayed, the header's pollers restarted and a half-typed
  quick post was lost (ledger 0368, report R02). Switch a landmark with `role`
  on ONE stable element. A remount renders the same markup, so the instrument
  is node identity across the flip
  (`tests/dom/class-view-pane-keeps-children.svelte.test.ts`). A tag switch
  around a bare text node (ClassHeader's h1/h2) is harmless and is not this.

### DOM

- **A KEYFRAME NEVER ANIMATES TO A `color-mix()` THAT NAMES `currentColor`.
  CHROME 154 CRASHES THE WHOLE RENDERER ON IT.** An animation moving an SVG
  `fill` or `stroke` to `color-mix(in srgb, currentColor 72%, transparent)`
  is a renderer CHECK failure (Windows says STATUS_BREAKPOINT, "Can't open
  this page"). The Bolt badge's charge beat did exactly that, and on
  2026-10-01 every classroom page showing a class that had voted the Bolt
  died about a second after it painted. Chromium 141, the harness browser,
  survives it, so no browser pass here can catch it. Tint with `currentColor`
  plus `fill-opacity` and animate the opacity, which paints the same pixel.
  `tests/keyframe-paint-currentcolor.test.ts` sweeps every keyframe in `src/`.
  A static mix of `currentColor` is fine.
- **AN UNFILLED SVG SHAPE TAKES THE POINTER ONLY ON ITS STROKE.** The default
  `pointer-events: visiblePainted` hit-tests painted regions, so a `fill: none`
  rect wrapped in a link answers a click on its 2px outline and nowhere inside
  it. The IDEA Maps plan frame (`MapsPlan`, report R05) gives the rect
  `pointer-events: visible` so the whole building answers, and paints it BEFORE
  the room shapes so every room is hit first; walls stay `pointer-events: none`.
  `mapsFrameTarget` in `$lib/maps/viewer/viewer.ts` is the one decision of when
  the frame is a link (it names a container that is not the open level). Verify
  by hit-testing (`elementFromPoint`) a point inside the shape and off every
  child, never by reading the markup.
- **A COMPONENT'S OR ROUTE'S STYLESHEET STAYS IN THE PAGE AFTER A CLIENT-SIDE
  NAVIGATION, AND IT ARRIVES WHEN THE MODULE IS IMPORTED, MOUNTED OR NOT.** So a
  rule styling `html`, `body` or `:root` carries a `body:has(.<room>)` condition,
  a global rule names a class, and a full-window app is `position: fixed; inset:
  0` rather than a locked document. IdeaCAD's unscoped
  `:global(html),:global(body){overflow:hidden}` left every later page in the tab
  unscrollable until a reload, on any route that merely imported it (ledger 0298,
  reports R29 and R07). `tests/no-global-document-lock.test.ts` compiles every
  non-dev component and fails on the unscoped form. Locking the page's scroll is
  `lockDocumentScroll()` from `$lib/shell/scroll-lock` (counted, restores what was
  there when the LAST holder releases), never a hand-written save and restore of
  `body.style.overflow`.
- **Attach interaction listeners with `addEventListener`, never a delegated
  framework binding**, on anything that might move into a Document
  Picture-in-Picture window -- a delegated handler registers on the main document's
  root, which a moved node cannot reach.
- **A wheel listener that calls `preventDefault` must be non-passive.**
- **Outside-dismiss listens on `pointerdown`, not `click`, and IGNORES detached
  targets** -- otherwise the click that OPENED the panel closes it, and clicking an
  inline editor closes the popup around it.
- **`src/app.css` sets a global `scroll-behavior: smooth`**, so any programmatic
  scroll that must not animate passes `behavior: 'instant'`.
- **Schedule on rAF-OR-TIMEOUT, never rAF alone.** A backgrounded or throttled
  window never ticks requestAnimationFrame, so an rAF-only path silently never runs.
- **A FIGURE THAT COUNTS UP IS `countUp` IN `$lib/count-up`, AND THERE IS ONE OF
  IT.** GAUNTLET's stat tiles and the home banner's lines-of-code chip both use
  it; `gauntlet/viewport/motion.ts` re-exports it. It steps on a frame or a 50ms
  timeout, whichever comes first, so a count finishes in a background tab, and
  under reduced motion it writes the final figure and schedules nothing. The
  node carries `data-counting` exactly while a count runs, and a browser-verify
  spec that reads the figure waits on that attribute rather than on DOM
  stability: the last part of an ease changes digits without changing the
  string length. A caller whose number must be heard correctly mid-count puts
  the final figure in a visually hidden sibling and marks the animated node
  aria-hidden.
- **ANY `main` IS A STACKING CONTEXT** (`src/app.css` gives it `z-index: 1`),
  so a `position: fixed` layer rendered inside a page's `main` is painted at 1
  in `.cr-root`, under the classroom masthead and `ClassSplit`'s separator,
  whatever its own z-index. `ItemDetail` drops the context (`.edit-layer-open`,
  `z-index: auto`) only while its edit layer is open (ledger 0360, report R06:
  at 1440 the list's resize bar was drawn over the editor and the masthead
  covered Close), ClassView does the same for a row's editor, and the plate's
  selected row drops its own context while it holds a `.row-editor`. Verify by
  hit test, never by reading the layer's z-index: it reads 60 while covered.
- **A masthead dropdown needs the header to outrank `main`.** Both sit at
  `z-index: 1` in the same stacking context and `main` comes later, so it wins the
  tie and paints over anything the header drops below itself.
- **An anchored menu breaks when its trigger's row WRAPS.** Below the breakpoint
  drop the wrapper out of the positioning chain (`position: static`) and measure
  insets from something that spans the width.
- **`CSSStyleRule` HAS A `cssRules` PROPERTY NOW (CSS Nesting), AND AN EMPTY
  `CSSRuleList` IS TRUTHY.** So the ordinary shape for walking a stylesheet --
  `for (const r of rules) { if (r.cssRules) { walk(r.cssRules); continue; } ... }`
  -- treats EVERY plain rule as a grouping rule and skips its declarations. A
  sweep written that way comes back with zero matches and reads as a clean
  result. Test the declaration FIRST and recurse only on `r.cssRules?.length`.
  Read `r.style.background` rather than `r.cssText` while you are there: with
  nesting, `cssText` contains the children's declarations too, so a parent gets
  credited with a child's value. **Pair any such sweep with a positive control**
  -- a case it is known to find -- or "no hits" cannot be told from "found
  nothing at all".
- **Check `src/app.css`'s global class list before naming a component class.**
  `.callout` there is a flex ROW; a scoped `background` override does not undo an
  inherited `display: flex`. `.card` carries a vertical margin and `.field` is a
  flex row with a bottom border, and three lanes of one night (ledger 0296) hit
  them: a 51.7px gap between card rows that six layout changes did not move, and
  a 44px row measuring 63.2px. Prefix component classes (`rb-`, `nb-`, `cd-`).
- **A custom property defined as `var(<another custom property>)` resolves where it
  is DECLARED**, and inherits that resolved value down. Re-declare every such token
  inside each palette block, or a themed surface silently keeps the base theme's
  colour.
- **A STICKY ROW OR COLUMN HEADER NEEDS A `z-index` AND A `scroll-padding`, AND
  MISSING EITHER ONE IS INVISIBLE UNTIL SOMEBODY SCROLLS.** `position: sticky`
  makes a box POSITIONED, and so does the `position: relative` that any cell
  carrying an absolutely-placed badge needs -- with `z-index: auto` on both,
  positioned siblings paint in TREE order, so the cells (later in the row) paint
  straight over the header that is supposed to slide under them. An opaque
  `background` does nothing about it: a background only covers what paints
  BENEATH it. The notebook's compliance grid shipped this, and what it looked
  like in production was a student's name with a status chip on top of it
  ("Abundiz, <chip>mma") -- a name being covered is a correctness defect, not a
  cosmetic one. Measured at 375px scrolled to the end: 28.3% of one name under a
  chip, and 3 of 13 hit-test points across the name's own text landing on the
  `button.cell` instead of the link.
  - **FIXING THE STACKING CREATES THE SECOND HALF, EVERY TIME.** The moment the
    header correctly paints over the cells, a cell brought to the scrollport's
    left edge by `scrollIntoView({ inline: 'nearest' })` -- which arrow-key
    navigation and every scripted click call -- lands BEHIND the header and
    cannot be clicked. `scroll-padding-left` on the SCROLL CONTAINER is the one
    thing that tells a scroll an overlay is there, and it takes the same value
    as the header's width through the same custom property, because two literals
    are a column and a padding that stop agreeing the first time either moves.
  - **NEITHER HALF CAN BE ASSERTED WITHOUT A REAL BROWSER, AND A PRESENCE CHECK
    IS GREEN ON BOTH DEFECTS** -- every string is present the whole time. The
    instrument is a HIT TEST across the covered element's own text box, in
    `npm run verify:browser`; `tests/dom/` has no layout engine and would read
    zero.
- **ABOVE 1024px EVERY DIRECT CHILD OF THE CLASS PANE IS CAPPED AT THE PANE'S
  HEIGHT** (`split.css`, `.cr-root > .cr-split:not(.page-flow) > .cr-nav > *`). A
  region that is not the pane's last child and grows past that cap overflows its
  own box, and the next sibling paints over it: with the team editor open at
  1440, a hit test at Save's centre answered the class page's h1 (ledger 0360).
  A content region there opts out (`ClassTeams`' `max-height: none`).
- **A `DOMRect`'s SIDES ARE PROTOTYPE GETTERS, SO `{ ...rect }` COPIES NOTHING.**
  The spread is an empty object with no error: IdeaCAD's tool card, handed one
  to `anchorPosition`, opened at left 0. Copy the fields by name.
- **A POPOVER MOVED TO `<body>` TO ESCAPE A STACKING CONTEXT LEAVES ITS ROOM'S
  TOKENS BEHIND.** A scoped room declares its tokens on its own wrapper, so a
  panel portalled to the body paints in the portal's plate. Portal to the
  room's own root instead: IdeaCAD's tool card moved to `.ic-root`, which fixed
  the stacking and kept the colours.
- **A genuinely `disabled` control swallows pointer events**, so a "why is this
  disabled" cue can never fire from it. Use `aria-disabled` when the control must
  still explain itself.
- **`dispatchEvent` RUNS A `disabled` CONTROL'S LISTENER ANYWAY.** `disabled`
  bars real user interaction (a click, a tab stop) and the DOM's own `.click()`
  method; it does not bar a script constructing an event and handing it to
  `dispatchEvent` directly, which reaches the listener exactly as if the control
  were enabled. A `tests/dom/` test that fires an event at a `disabled` control
  and expects nothing to happen is asserting something that is not true of the
  DOM, and will pass for the wrong reason if the handler happens to no-op on
  its own. Assert the CONTRACT instead: that the control genuinely carries the
  `disabled` attribute (or `aria-disabled`, per the rule above, for one that must
  still explain itself) and would therefore refuse a real click -- not that a
  synthetic dispatch was refused, which it never is.
- **`File.type` is legitimately EMPTY** when the platform cannot determine a media
  type -- the norm for HEIC off an iPhone. Key a media allowlist on the type OR the
  filename extension, never the type alone.
- **A fixed-position overlay must not be floated over a component that owns its own
  header row.** Give the component a prop and let it render the control in its
  layout.
- **`capture="environment"` is a HINT the spec only says a browser SHOULD honour.**
  Android browsers act on the attribute's PRESENCE but not its VALUE, and `capture`
  additionally makes an input camera-ONLY there. Ship two inputs (capture without
  `multiple`, and `multiple` without `capture`) and treat the lens as unguaranteed.
- **pdf.js: render with `intent: 'print'`.** Display intent paces on
  requestAnimationFrame, which a backgrounded or throttled window never ticks, hanging
  the render forever. Do NOT pass a transparent `background` -- pdf.js normalizes it
  through an alpha-dropping parser to opaque black.
