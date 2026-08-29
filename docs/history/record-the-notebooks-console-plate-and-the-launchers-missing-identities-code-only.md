---
title: "The notebook's console plate, and the launcher's missing identities (code only)"
date: 2026-08-22
branches: []
migrations: []
subsystems: ["Digital notebook", "Home page, launcher, tour"]
record_order: 112
---

Two token passes, both authored against values that already existed. No SQL, no
schema, no new dependency.

### A. The notebook's dark plate is retired; the default is the classroom's register

**What changed.** `--nb-*` had three palettes: light (`:root`), a warm near-black
"dark" reached either from `prefers-color-scheme` or an explicit
`data-nb-theme="dark"`, and IDEA. The warm plate is GONE. The default is now the
classroom's console register, declared once on `.nb-root:not([data-nb-theme])`
and reached unconditionally -- `prefers-color-scheme` no longer selects anything
in this room. Light and IDEA are unchanged and are now both explicit choices.

**Why the plate went rather than being retuned.** It was the notebook holding a
private opinion about what a dark room looks like. A student who opens an
assignment and then the notebook entry that assignment asks for crossed from the
classroom's near-neutral console into a browner one in the same session, and
neither screen could say why. Six tokens map ONE TO ONE onto the register with no
approximation: `--nb-bg` `#0a0c0b`, `--nb-surface` `#101312`, `--nb-surface-dim`
`#161a18`, `--nb-ink` `#e7eae8`, `--nb-ink-soft` `#9aa49d`, `--nb-boundary`
`#6f7b73`.

**Written out as literals, not aliased through `var(--surface-0)`.** `.nb-root`
already aliases `--surface-1` BACK to `--nb-surface`, so an alias in this
direction closes a cycle; and the var()-resolves-where-declared trap this file
documents three times would bite a `--nb-*` token defined against an ancestor's.

**One default needs one selector.** The retired plate was the dark HALF of an
OS-driven pair, so it needed a media query plus an opt-in block kept in step --
in `colors.css`, in `effects.css` (`--nb-shadow`) and in `notebook-theme.css`
(the `body` canvas mirror). All three collapse to one selector. `tests/
boundary-token.test.ts` goes from five rooms to four and from 18 sweep cases to
15; the count assertions moved with it rather than being deleted.

**A stored `'dark'` resolves to the default and the key is dropped**, in
`read()` in `notebook-theme.svelte.ts`. That is the whole migration: no CSS
block, no attribute value and no picker row has to keep existing for the retired
id. `'system'` was never written to storage (it removed the key), so it takes the
same unrecognised-value path. Verified in the browser: with
`idea_notebook_theme='dark'` in localStorage, a reload lands on the default,
`data-nb-theme` is absent and `getItem` returns null.

**`NotebookTheme` is `'default' | 'light' | 'idea'`, and `'system'` was RENAMED
rather than redefined.** Keeping the id while it no longer follows the system is
exactly the `is_teacher()` naming trap in miniature. The picker's half-filled
circle glyph ("whatever the device says") went with it and is now a console frame
with a prompt caret.

**Why the default cannot stay OS-driven.** If `'system'` still meant light under
a light OS and the console plate under a dark one, then deleting the `'dark'` row
would leave a student on a light OS with no way to reach the console plate at
all. The default is unconditional, and light is one tap away.

#### The three authored values

**`--nb-ink-faint` -- `#79867d`.** The register's `--text-3` (`#5c665f`) is
DECORATIVE tertiary in the classroom and REAL MUTED COPY here, which
`notebook-theme.css` has warned about since the room was built. Measured, it
lands 3.29 / 3.13 / 2.95 on bg / surface / surface-dim: it fails on all three.
The shipped value is `#5c665f`'s own hue and saturation at a higher lightness
(hsl(138 5.2% 38%) -> 50%), the same lightness-only move `--boundary` itself is:
**5.16 / 4.91 / 4.62**, and still 12 lightness points below `--nb-ink-soft` so
the two tiers stay tellable. Browser sweep of the review console: 21 elements
resolve to it, worst 4.91.

**`--nb-masthead` -- `#161a18`.** The register's own "toolbars and header bars"
value, which also keeps the band distinct from a CARD (`--surface-1`). On paper
the band is an ink slab against white and separates on its own; on a `#0a0c0b`
page no opaque neutral does. Measured composited: the band reads **1.12:1**
against the page and its hairline **1.37:1**. That is DECORATION by the
standard's own examples, not a load-bearing boundary, and it is deliberately the
same treatment -- a touch stronger -- as the classroom's own masthead, whose
`--surface-1` band reads 1.05:1 under a hairline at 1.29:1. Drawing this one edge
at 3:1 when the room next door does not is how two rooms stop matching.

**`--nb-masthead-line` is a TOKEN, not a per-plate rule**, because
`notebook-theme.css`'s own discipline is that a rule needing to know which
palette is showing should have been a token. It carries the WHOLE border
(`border-bottom: var(--nb-masthead-line, none)`), not just a colour: written as
`1px solid transparent` the fallback would have grown the light and IDEA
mastheads by a pixel. Measured: header height 80.91px on light and IDEA, both
unchanged, against 81.91px on the default plate.

**The six review-grid cells, re-measured on `#101312` rather than carried.** The
INKS are the six both surviving dark rooms carry (hue identity is a locked
contract). The FILLS are the IDEA plate's, not the retired plate's, and the
reason is measured: `#101312` sits at the same depth as IDEA's `#101c16` while
the retired card `#201d16` was a full step lighter. Browser-measured, glyph
against its own composited fill, on `--nb-surface`:

| state | glyph on fill | edge on card |
|---|---|---|
| on time | **4.90** | 8.69 |
| late | **5.07** | 8.01 |
| awaiting | **5.30** | 8.26 |
| flagged | **5.11** | 8.03 |
| excused (no fill) | **9.31** | 9.31 |
| missing (no fill) | **5.59** | 4.70 |

Six of six clear 4.5:1. Phase 4d found twelve of eighteen below it and all six on
the then-default palette; that is not reintroduced. The retired plate's fills
would have measured 4.76-5.09 here -- also clear, which is exactly why they had
to be MEASURED rather than assumed. `--nb-cell-ring` is the room's own ink at
55%: **5.24:1** on the card, **3.82:1** over the on-time fill (the tightest of
the four), both clear of the 3:1 a non-text indicator has to make. The locked
density contract is intact: 30.4px cells (1.9rem) at both 1440px and 375px.

### B. Launcher cards: what quoted nothing, and what sat still

**`tournaments` quoted neither of its own colours.** It declared `#00ff41`
(VANGUARD's arcade green) and `#c8a848` (the portal's brass), and nothing on
`/tournaments` paints either. It now takes `--tnm-accent` `#0fbe7a` and
`--tnm-gold` `#e0ac4e`, and the room's restraint rule comes with them: at most
one dominant emerald per screen, so the card spends its emerald once on the mark
(via `--acc-ink`, which defaults to the primary) and gold appears nowhere but the
2px top-edge strip. Measured: ink **6.23:1** on the card, edge **4.81:1** against
the page. Nothing moves for legibility.

**`coins` fell to the shared brass while the Ledger has a real surface.**
`static/coins/index.html` is a neon-terminal page whose palette is green
`#00FF41`, gold `#C8FF00` and cyan `#00F0FF` on near-black. GOLD LEADS because
gold leads there: 50 references against green's 31, it is the legendary rank and
payout treatment, and it is the colour the background particle field is drawn in.
Cyan is the second stop because gold-to-cyan is literally how that page's own
legendary gradient opens. Green is deliberately NOT one of the two slots: paired
with gold it would make this card a mirror of VANGUARD's. Measured: ink
**12.78:1**, edge **9.11:1**. The card texture quotes the particle field -- three
sparse dot layers on different tile sizes so it does not read as a grid, all at
<=3%.

**`notebook` keeps brass and takes a paper texture.** Brass is correct for the
default and light plates and brass IS the shared default, so the rule declares NO
accent -- restating a default is how a default drifts. Ruled lines at the light
plate's own off-white `#fafaf7` at 2.5%.

**`classroom`, `coin-desk`, `dashboard` and `admin` are untouched.** The first
two have no identity of their own and take the live shared default; that is the
mechanism working, and inventing one would be inventing it for the app.

**Six marks that sat still now move**, each as a component in `$lib/marks`
alongside the four that already were, with the SAME paths extracted rather than
redrawn: the classroom's tassel sways 4 degrees, the notebook's lens racks focus,
the tournament bracket lights pair-pair-spine-final in the order a bracket
advances, the coin desk's award "+" strikes and the coin takes it, the
dashboard's needle sweeps and settles, and Site Admins' key turns while the row
it grants brightens. 3.4-4.6s, the register the existing marks already use.
Verified in the browser via `getAnimations()`: 11 new declarations, all 11 inside
`prefers-reduced-motion: no-preference` and none outside it; every animated
element has base opacity 1 and base transform `none` with the animation
cancelled, and minimum opacity across the cycle 0.48-1.0 -- nothing is hidden in
a base state.

**FRC is left exactly as it is**, unanimated and unmodified: FIRST's brand
guidelines prohibit altering the mark, motion included, and that outranks visual
consistency with the cards either side of it. Verified: 0 animations on that
icon, still an `<img>`.

**Site Admins has its own glyph.** It carried `icon: 'dashboard'`, so the two
admin cards were the same picture told apart by their titles -- and in the
compact view, which is the DEFAULT, the tagline is dropped too. A roster with a
key is what the surface is; the gauge stays with the readings it describes.

**The stale comment at `AppLauncher` is fixed.** It claimed the per-card texture
went away with the per-card accent. Five `[data-app=...]` rules re-declare
`--card-texture` and `.app-card`'s
`background-image: var(--card-texture, var(--texture-brushed))` is a fallback
chain written precisely so they can. The textures came back; the comment did not.

**`tests/home-order-and-accent.test.ts` was generalized, not weakened.** It
required `--acc-primary` of EVERY id with a `[data-app=...]` rule, which the
notebook card (texture only, shared accent) legitimately breaks. The rule that
survives is the one that was meant: a per-card rule must carry at least one of
the five per-card properties or it paints nothing, and "some app takes the
default" is now measured against the ACCENT rather than against having a rule at
all.

### Verified

- `svelte-check`: 0 errors, 37 warnings -- byte-identical warning SET before and
  after, diffed against a stashed tree. (The 37 is a pre-existing drift from the
  36 `CLAUDE.md` records; it is on `main` untouched.)
- Full suite: 87 files, 2105 tests, all passing.
- Browser, at 1440px and at a true 375px layout viewport, every colour claim
  composited by painting to a canvas and reading the pixel back, with
  `* { transition: none }` injected first: review console 105 text elements at
  both widths and **0 below their WCAG bar**; notebook student view 124 elements
  at 1440 and 164 at 375 with one failure, below.
- Light and IDEA plates confirmed unchanged token for token, canvas mirror
  included, and their masthead border still `none 0px` at 80.91px.
- Picker: three rows, no `dark`, `default` checked, trigger 87.4x44.0px.

### Not verified

- No live Supabase, no signed-in session, no real Drive round trip -- the local
  `.env` is the placeholder project.
- **No screenshots.** The Browser pane does not composite; every visual claim
  above is a measured computed-style, geometry or canvas-pixel read and is
  reported as such.
- `prefers-reduced-motion: reduce` was not emulated in the pane. The gating is
  asserted structurally instead, from the live CSSOM: all 11 new animation
  declarations sit inside a `no-preference` media block and none sits outside
  one.

### Found and NOT fixed

- **`.pick-meta` on a SELECTED quick-pick measures 3.63:1** on the default plate
  (`NotebookView.svelte`). It is `--text-3` sitting on `--nb-accent-wash`, whose
  18% brass lightens the ground out from under it. This is PRE-EXISTING and the
  default plate is the best of the three dark cases, not a regression: the
  retired plate measured **3.49**, IDEA measures **3.55**, light 4.81. Lowering
  the wash to clear it costs the selection signal (at 6% the fill reads 1.09:1
  against the card), so the fix belongs in the component -- muted copy on an
  active fill should take `--text-2` -- which is a rule change across all three
  plates and not a token pass. Raised rather than half-done.
- **The homepage overflows horizontally at 375px** (scrollWidth 412 against a 375
  viewport), from `.launcher-actions` and `.course-meta`. Confirmed identical on
  a stashed tree; nothing in this bundle touches either.

---

