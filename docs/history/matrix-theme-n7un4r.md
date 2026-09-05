---
title: "The Matrix theme, and the rule that decides what a theme may repaint (`claude/matrix-theme-n7un4r`)"
date: 2026-09-05
branches: [claude/matrix-theme-n7un4r]
migrations: []
subsystems: ["Design system", "Portal shell", "Browser harness"]
---

Prompt 0049. No migration. A site-theme mechanism that did not exist, one theme built on
it, and -- the part that actually took the thinking -- a rule for what a theme is allowed
to touch that a person adding the thirteenth app next month can apply without reading any
theme file.

## The base

Started from `origin/integration` at `17be15b5502df0b538d3e8e7042a630f2073e77a`, working
directory `/home/user/idea-app`. The container's git already carried a committer identity
(`Claude <noreply@anthropic.com>`), so the "Please tell me who you are" failure the prompt
warns about did not arise and nothing had to be set. No `docs/prompt-ledger/entries/0049-*`
at HEAD, on `origin/integration` or on `origin/main`.

## A1: no site theme existed, and `prefers-color-scheme` reaches nothing

Swept `src/` for `data-theme`, `prefers-color-scheme` and `color-scheme`. **There is no
site-wide theme mechanism.** What exists is one ROOM-scoped picker -- the notebook's three
plates (`notebook-theme.svelte.ts`, `NotebookThemeToggle.svelte`, `data-nb-theme` on
`.nb-root`) -- and six other scoped rooms (`.frc-root`, `.gt-root`, `.glb`, `.tnm-root`,
`.fsp-root`, `.fg-root`, `.cd-root`) that declare their own tokens with no picker at all.

`prefers-color-scheme` appears three times in `src/`, and every one is a COMMENT saying it
no longer selects anything: `colors.css:318` and `effects.css:99` both record that the
default plate is the console register unconditionally, and `notebook-theme.css:46` records
the retirement that made it so. The one live `color-scheme` declaration is
`foundry/serve-gate.ts:114`, inside a served bundle's own document. So the site has no
opinion about the system preference and a theme here is an explicit choice or it is
nothing.

## A2: how a token reaches a pixel, and the smallest place to override one

`src/app.css` opens with `@import './lib/design-system/index.css';` and that entry point
imports, in order, `fonts.css`, `colors.css`, `typography.css`, `effects.css`,
`surfaces.css`, `motion.css`. `colors.css` has exactly THREE selectors in 645 lines:
`:root`, `.nb-root:not([data-nb-theme])` and `.nb-root[data-nb-theme='idea']`.
`effects.css` has the same shape.

That third selector is the answer. **The notebook's IDEA plate is already a token-override
layer keyed on an attribute**, and a site theme is the same shape one level up:
`:root[data-theme='matrix']`, which is (0,2,0) against the token layer's `:root` (0,1,0),
so it wins on specificity and does not depend on import order.

**The smallest place a value can be overridden for a whole session is an attribute on
`<html>`.** Not on a component wrapper: `body { background: var(--bg0) }` and the `.bg-fx`
overlay are both ABOVE anything a page mounts, which is the same trap `notebook-theme.css`
documents from the other end ("`body` and `:root` are ANCESTORS of `.nb-root` and cannot
see the alias"). `<html>` is the one element above all of it.

## A3: per browser, in localStorage, no migration, and the signed-out answer

**The repo already has this setting and it is per BROWSER.**
`src/lib/notebook/notebook-theme.svelte.ts` is a module-level `$state` backed by
localStorage, and its own header gives the argument rather than leaving it to be
re-derived: "this is a preference about the screen in front of you and the light in the
room, not about who you are. A student on a bright shop workstation and the same student on
a phone at night want different answers, and a profile-stored one would insist they want
the same. It is also why this needed no migration." It names
`creative.svelte.ts` / `audio-settings.svelte.ts` as the same convention.

Following it, **no migration is needed and none was written.** A `profiles.preferences`
namespace was the alternative and is refused for the reason above; it would also have made
the theme unavailable to a signed-out reader in a different way (no profile row) while
looking like it solved the problem.

**What a signed-out visitor gets, and the one real decision in this bundle.**
`ProfileMenu.svelte` opens its markup with `{#if claims}` -- it renders NOTHING when signed
out -- and the site is public-first: `/`, `/maps`, `/assignments/*`, `/reference/*` and the
tournament section all answer a visitor with no session. So if the theme survived sign-out,
a student who left it on at a shared school workstation would hand the next person a themed
public page with **no control anywhere on it to turn the theme off**.

So `ThemeRoot` writes the attribute only when there is a session, and the stored preference
is KEPT rather than cleared: signing back in restores it. A signed-out visitor gets the
standard IDEA palette on every surface, always. Measured on the real public surface rather
than argued: `/maps` with `idea_site_theme` set to `matrix` in localStorage answers
`data-theme` **null**, `--bg0` **#121a12** (the base value), `idea_site_theme` still
`"matrix"`, and **0** `.pm-root` elements on the page.

The cost is named rather than hidden: the theme disappears at sign-out, which is surprising
exactly once, and it is the safe direction of surprising. A theme you cannot turn off is
worse than a theme you cannot turn on.

**The Coin Ledger is a third case and needs no gate at all.** It is served by
`src/routes/coins/[...path]/+server.ts` from `$lib/legacy/coins/index.html`, which renders
no layout and therefore imports no `app.css` -- measured, its `--bg0` is its own `#020A04`
and does not move when `data-theme` is forced onto its document.

## A4: THE RULE

> **A theme may repaint a colour only where the colour is CHROME, and it may move that
> colour's LIGHTNESS only where the theme also owns the ground it is read on.**
>
> Every colour in the token layer is exactly one of three kinds:
>
> 1. **IDENTITY** -- a colour that names a THING: an app (`--acc-primary` /
>    `--acc-secondary` on `[data-app=...]`), a pathway (`Pathway.color`), a brand (FIRST
>    red, GREENLINE chrome). Test: strip the label and the mark away; if the colour still
>    tells you WHICH one this is, it is identity. **A theme never touches it.**
> 2. **SEMANTIC** -- a colour that names a STATE inside one vocabulary: `--green`
>    success/active, `--gold` special, `--cyan` metadata, `--amber` warning, `--teal` in
>    progress, `--violet` special, `--crimson` live/error, and the `-ink` corrections
>    beside them. **A theme never touches it either**, for the same reason: six hues are
>    how a reader tells six states apart on one screen, and collapsing them into the
>    theme's own hue is the launcher failure one level down, where it is harder to see.
> 3. **CHROME** -- everything else: the grounds (`--bg0/1/2`, `--plate`, `--edge`,
>    `--surface-0/1/2`, `--green-tint`), the neutral text tiers (`--white`, `--dim`,
>    `--ice`, `--gear`, `--text-1/2/3`) and the rules between things (`--boundary`).
>    **A theme owns all of it.**
>
> And the one constraint on HOW: **a chrome token whose ground the theme does not own moves
> in hue and saturation only, at held relative LUMINANCE.**

**A thirteenth app answers the rule without reading any theme file.** Its accent arrives as
`--acc-primary` / `--acc-secondary` in a `[data-app='<id>']` rule in `AppLauncher.svelte`.
That is kind 1. It is not themeable, and nothing has to be added to any theme for it --
which is the property a list of exceptions would not have had.

The prompt's reading ("identity colours are not themeable and chrome is") was tested rather
than adopted, and it needed the middle kind added. Repainting the semantic six is not a
launcher problem, so it does not fail the prompt's own test, and it is exactly as
destructive: amber against crimson against green is the whole vocabulary for warning
against error against done.

### The per-app accents on the launcher, with their hexes

Read out of `AppLauncher.svelte`. Nine `[data-app]` rules declare a pair; the shared
default is `--acc-primary: var(--gold)` (`#c8a848`) / `--acc-secondary: var(--green)`
(`#78b870`), which `classroom`, `notebook` and `coin-desk` take.

| card | `--acc-primary` | `--acc-secondary` | note |
| --- | --- | --- | --- |
| gauntlet | `#00ff41` | `#00f0ff` | |
| vanguard | `#00ff41` | `#c8ff00` | same primary as GAUNTLET, told apart by the secondary |
| greenline | `#2ae57e` | `#cfdae2` | |
| coins | `#c8ff00` | `#00f0ff` | the Ledger's neon-terminal palette |
| tournaments | `#0fbe7a` | `#e0ac4e` | |
| foundry | `#f6952f` | `#c65a1d` | |
| maps | `#40e3b1` | `var(--gold)` | |
| frc | `#ed1c24` | `#0066b3` | plus `--acc-ink: hsl(357.7 85.3% 68%)` |
| dashboard + admin | `#78b870` | `#5abda8` | one rule, two cards |
| classroom, notebook, coin-desk | default | default | notebook declares a texture only |

**THE PAIR IS THE IDENTITY, NOT THE PRIMARY, and that is a correction this bundle had to
make to its own test.** GAUNTLET and VANGUARD share `#00ff41`; a test counting distinct
PRIMARIES found 8 and called it a collision. Counting pairs finds 9 declared, and Chromium
over the rendered grid finds **13 cards and 10 distinct (primary, secondary) pairs** --
the nine plus the shared default -- identical themed and unthemed.

## A5: what animates, and what the repo already does about it

`prefers-reduced-motion` appears in **80 files** under `src/`, and the contract is
consistent: the animation is declared INSIDE `@media (prefers-reduced-motion:
no-preference)` rather than declared and then cancelled, and nothing is hidden at rest --
`$lib/marks/*`, `AnimatedLogo`, `MoltenSeam` and `.bg-fx`'s own scanline in `app.css` all
follow it. `tools/browser-verify`'s `motionSweep` is the instrument: it flips Chromium's
emulation, and a `gated` row requires the animated element to come back with 0 animations,
`animation-name: none`, `transform: none` and PAINTED.

**The theme animates exactly one thing: `.bg-fx`, the shell's own decorative background
layer.** It already exists on every page, it is `position: fixed`, `pointer-events: none`,
`z-index: 0` and `aria-hidden`, so restyling it can change no geometry, eat no tap and
reach no reader. That is the whole of the non-token exception, and
`tests/theme-tokens.test.ts` pins it as the only selector besides the theme root that a
theme file may carry.

**The motion is `background-position` and nothing else** -- no transform, no opacity, no
filter -- so the still state is the running state with the columns parked. `.bg-fx::after`
(app.css's scanline) is left alone; a `::after` is invisible to `getAnimations()` on the
element, which is also why the animation had to go on the ELEMENT to be measurable at all.

## A6: the counts block

Before any change: `npm run verify:counts` reported the static region already current
(**102 specs over 52 routes, 82 /dev pages, 204 runs**) and printed its own note that the
measured region "never measured 1 spec(s) in this tree: `foundry-admin-refusal.mjs`". The
measured region's `covered` array holds **101** entries against **102** specs, `outside` is
**0** and `outsideRows` is **[]**.

**So `covered` did NOT match the tree at the start of this bundle, by one spec, and the
outside-threshold row set was empty.** That gap is pre-existing and not this bundle's; it
closes as a side effect of the full `verify:readme` run at the end, which measures every
spec in the tree including that one and the three added here.

## What was built

- **`src/lib/design-system/themes/`** -- the layer. `index.css` (one `@import` per theme)
  and `matrix.css` (one `:root[data-theme='matrix']` block plus the one `.bg-fx` rule).
  `colors.css` and `effects.css` are untouched; `design-system/index.css` gained **one
  line** importing the directory, which is the mechanism's mount in the cascade. A second
  theme is a file plus one `@import`.
- **`src/lib/theme.ts`** -- the pure registry: ids, labels, notes, the storage key,
  `siteThemeAttr`, `readStoredTheme`. No runes, no storage, no DOM, so every rule in it is
  assertable in the `node` test project.
- **`src/lib/theme.svelte.ts`** -- the reactive half: the module-level `$state`, the
  localStorage read/write, and the re-exports. `.svelte.ts` and not `.ts` because a
  `$state` only compiles in a rune-aware module; the prompt named `src/lib/theme.ts` and
  that file exists and holds everything that can live there.
- **`src/lib/design-system/themes/ThemeRoot.svelte`** -- renders nothing, writes
  `data-theme` onto `<html>`, gated on a session. Mounted ONCE in `src/routes/+layout.svelte`
  beside `SiteFeedback` and `NavigationProgress`, for the same reason: there are no layout
  resets in `src/routes`, so every page route inherits the theme rather than having to
  remember it.
- **`src/lib/ProfileMenu.svelte`** -- a Theme section: a `role="radiogroup"` of two rows,
  each with a swatch, a name and what it is for.
- **`src/routes/dev/themes/`** -- the harness. Mounts the REAL `AppLauncher` and the REAL
  `ProfileMenu`, plus a chrome board of 54 real elements carrying the real tokens.
  `?state=matrix` starts it themed through the shipping call; `?signedout=1` drops `claims`.
- **`tests/theme-tokens.test.ts`, `tests/theme-preference.test.ts`** -- 20 tests.
- **`tools/browser-verify/routes/themes*.mjs`** plus `_theme-shared.mjs`.

### Two files outside the prompt's ownership list, and why

`src/lib/design-system/index.css` gained one `@import` line, and
`src/routes/+layout.svelte` gained an import and a `<ThemeRoot />` tag (five lines). The
prompt's ledger entry owns "the theme mechanism wherever the audit finds or places it", and
A2 found it: a theme layer has to be in the cascade and the applier has to run on every
page. Neither file is `colors.css` or `effects.css`, which were not touched.

## What the theme actually does

Grounds go to near-black with the green cast still in them (`--bg0` `#121a12` -> `#040804`,
`--bg1` -> `#081108`, `--bg2` -> `#0d1a0d`, `--plate` -> `#132313`, `--edge` -> `#010301`,
`--surface-0/1/2` -> `#020502` / `#060e07` / `#0a150b`, `--green-tint` -> `#073a1c`); the
register's own tiers go phosphor (`--text-1` `#ccf5cc`, `--text-2` `#7fb883`, `--text-3`
`#4a6f4d`, `--boundary` `#5f8a63`); and the four luminance-held tiers move hue only.

`--line`, `--line-strong` and `--hairline` are deliberately NOT touched: the first two are
already sage and mint, `--hairline` is a white alpha rule CLAUDE.md forbids raising, and
re-hueing any of them would be a claim about FSP's hairlines for no gain.

**No `--nb-*` token is touched.** The notebook has its own plate picker, and a site theme
reaching into a room that already asks the question is two controls fighting over one
surface.

### The luminance rule, and the measurement that made it necessary

`--white`, `--dim`, `--ice` and `--gear` are read OUTSIDE the portal shell, on grounds a
theme has no say over. Measured: **FRC paints five components' meta in `--dim`**
(`FrcReviewQueue` x3, `FrcUnitOverride`, `DomainLanding`) on `.frc-root`'s WHITE paper,
where CLAUDE.md already records it failing at 2.95/3.23; and `.fsp-root` -- a light room,
`--fsp-surface-2: #f2f5f8` page base -- reads `--white` **72** times, `--dim` **34** times
and `--bg0/1/2` 14/22/9 times. (`--text-1/2/3`, `--surface-*`, `--boundary`, `--hairline`
and `--green-tint` are read by those rooms **zero** times, so the register tiers are the
shell's alone to move.)

Contrast is a function of relative luminance and nothing else, so each of the four was
SOLVED for its base token's own luminance at the new hue and saturation rather than picked:

| token | base | L | matrix | L | drift |
| --- | --- | --- | --- | --- | --- |
| `--white` | `#eae6d8` | 0.7904 | `#caf0cb` | 0.7919 | +0.18% |
| `--dim` | `#849080` | 0.2641 | `#5e9a60` | 0.2634 | -0.28% |
| `--ice` | `#a9bcab` | 0.4734 | `#91c492` | 0.4757 | +0.49% |
| `--gear` | `#75846f` | 0.2143 | `#568c58` | 0.2144 | +0.03% |

Which lands where it was aimed:

- `--dim` on FRC paper `#ffffff`: **3.34 -> 3.35**
- `--dim` on FRC card `#f2f5f8`: **3.06 -> 3.06**
- `--white` on FSP navy `#0a2540`: **12.44 -> 12.46**

No contrast anywhere in the application moves because of a room this theme never entered.
`tests/theme-tokens.test.ts` pins the four at a 2% tolerance with a positive control (a
`--dim` lightened to `--ice`'s value is caught; the shipped value is not).

## Measured

All of it in the harness Chromium **141.0.7390.37** at **375px and 1440px**, grounds
composited and read back off a canvas.

### B2 -- contrast, every repainted role on every ground it lands on

The board is the pairings the app MAKES, not the cartesian product: 54 cells. `--plate`
carries a hero panel's copy and no boundary, because `colors.css` says in its own words
that nothing in the app renders on `--plate` and measures a boundary there at 2.66;
`--green-tint` has exactly one call site (`.cr-root .is-selected`) and carries a selected
row's copy. Identical at both widths.

| role | floor | worst ground | base | matrix |
| --- | --- | --- | --- | --- |
| `--white` | 4.5 | `--plate` | 9.39 | **13.18** |
| `--text-1` | 4.5 | `--green-tint` | 10.42 | **10.73** |
| `--text-2` | 4.5 | `--green-tint` | 4.91 | **5.57** |
| `--ice` | 4.5 | `--bg2` | 7.06 | **8.98** |
| `--dim` | 4.5 | `--bg2` | 4.24 | **5.35** |
| `--gear` | 4.5 | `--bg2` | 3.57 | **4.52** |
| `--boundary` | 3 | `--green-tint` | 2.86 | **3.25** |
| `--text-3` | decorative | `--bg2` | 2.38 | **3.14** |

**All 54 cells clear their floor under the theme, and not one cell of 54 is worse than the
base palette.** Three clear a floor the BASE palette misses (`--gear` on `--bg2`, `--dim`
on `--bg2`, `--boundary` on `--green-tint`) -- pre-existing gaps CLAUDE.md already names
in words ("`--dim` on `--bg1` or `--bg2` is still a failure waiting for a use"), improved
here as a side effect and **not fixed**. Fixing them is a palette bundle with its own
answer for every surface that reads those tokens.

### B3 -- the reduced-motion positive control

`motionSweep` on `.bg-fx`, both phases, both widths:

- **running** (`no-preference`): 1 animation, name `matrix-rain`, playState `running`
- **reduce**: **0 animations**, `animation-name: none`, `transform: none`, **opacity 1**,
  `display: block`, `visibility: visible`, and the rain gradient still on the element
  (`background-image` 398 chars, still containing `rgba(0, 255, 65`)

So nothing animates and nothing is hidden at rest: the still version is the running version
with the columns parked. The negative control is in the unthemed spec -- `.bg-fx` with
`expect: 'never'`, which reports **0 animated under no-preference**, so the themed `gated`
result cannot be confused with a rule that was always there.

### B4 -- on, off, and no residue

Through the shipping ProfileMenu control, at both widths, 1 attempt each:

| | base | Matrix on | after off |
| --- | --- | --- | --- |
| `<html data-theme>` | `null` | `"matrix"` | `null` |
| `localStorage['idea_site_theme']` | `null` | `"matrix"` | `null` |

**0 of 28 computed `:root` token values differ between a session that never turned the
theme on and one that turned it on and off again**, and `<html>` afterwards carries exactly
one attribute: `lang=en`. Turning it off is a removal, not a stored default, which is what
makes "complete" true rather than "looks the same".

The control measures **286 x 46.5** at both 375 and 1440, against the 44px floor.

### B5 -- browser proof on the three surfaces

No horizontal scroll at 375 or 1440, themed or unthemed, on any surface (`scrollWidth`
equals `clientWidth` in all twelve readings).

**The launcher** (`/dev/themes`, the real `AppLauncher` with `isAdmin`): **13 cards, 10
distinct (primary, secondary) accent pairs -- identical themed and unthemed, at both
widths.** The twelve-odd cards are exactly as tellable apart with the theme on.

**A classroom item** (`/dev/classroom-split/s-1/item/i-crowded?manage=1`), worst per
selector, base -> matrix: `h1` 15.70 -> 16.42, `h2` 8.26 -> 8.64, `p` 7.63 -> 8.86,
`a` (30 nodes) 7.63 -> 8.25, `button` (55) 6.84 -> 8.08, meta rows (27) 6.84 -> 8.08,
`li` (25) 14.07 -> 14.97.

**A public surface** (`/dev/maps-viewer`), base -> matrix: `h1` 10.86 -> 12.33, `h2`
6.91 -> 8.72, `p` 5.31 -> 6.02, `button` 6.84 -> 8.08, `a` (13) 7.52 -> 8.53, `li`
14.66 -> 16.80.

**The Coin Ledger** (`/coins/`, the legacy layout-less document): unchanged in every
reading, `--bg0` stays `#020A04`. Its own worst ratios (3.89 on 21-22 buttons, 4.00 on
links, 4.01 on the lede) are properties of the frozen legacy file, unmoved by the theme
and not this bundle's to touch.

Those two surfaces carry no `claims` in their dev loaders, so `ThemeRoot`'s session gate
correctly declines to write the attribute; the themed readings were taken with the
attribute forced by hand and the force RETRIED against its own effect rather than after a
timer, reporting its attempt count (1 in the final run). At 375 the first version of that
script took the reading after a fixed wait and got the attribute back as `null` -- an
honest reading of a state the run had not reached, which is why the retry is there.

**Clicks and hydration**: the harness's `waitForApp` reports hydrated / DOM-stable in
412-991ms across the six runs, and every scripted click retried against its own predicate
rather than a timer -- `.pm-trigger` 1 attempt, the OFF press 1 attempt, the ON press 1
attempt, at both widths.

### A defect found and fixed during the pass

`.pm-theme-note` was `--dim`, which on the SELECTED row's `--green-tint` fill measured
**3.84:1** themed and **3.78:1** on the base palette -- below 4.5 in BOTH, so a defect the
theme merely made visible. It is the notebook's own rule arriving one room over ("muted
copy that sits on an active fill takes `--text-2`, never `--text-3`"): a wash is a veil laid
on the ground, and a tier tuned against the bare ground stops clearing on it. `--text-2`
clears both (**4.91** base, **5.57** themed) and is what shipped.

### A harness defect, measured rather than assumed

At 375 the theme rows first came back at `left: -186` with `elementFromPoint` answering
`null` at their centres, and the scripted press failed 12 attempts. **The panel was off the
side of the screen**: `.pm-panel` is `position: absolute; right: 0` on its own trigger, the
harness header's `flex-wrap` put the trigger at the LEFT of the wrapped second line, and the
343px panel opened leftwards off the viewport. That is the harness putting the menu
somewhere no shipping masthead does; `margin-left: auto` on `.pm-root` pins it right on the
wrapped line too, and the rows then measure `left: 56` and press on the first attempt. Worth
recording because it reads exactly like a broken control and is not one.

### B6/B7 -- counts, suite, check

Recorded in the commits. `npx svelte-check` re-derived after `npx svelte-kit sync` with the
two `PUBLIC_SUPABASE_*` placeholders exported (the fresh-checkout phantom-error trap):
**0 errors, 37 warnings**, breakdown **31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`** -- the baseline, unmoved.

## What was NOT verified

- **Nothing was checked against the live Supabase project.** The local `.env` is the
  `example-ref` placeholder; this bundle needed no database and made no RPC.
- **No signed-in production surface.** Every measurement is against `/dev` routes and the
  local dev server. The session gate was exercised through the harness's own
  `?signedout=1` and through `/maps` with the preference stored, not through a real
  Google sign-in.
- **`prefers-reduced-motion: reduce` was exercised through Chromium's emulation**
  (`motionSweep` and the drive script), not through an OS setting.
- **The theme was not seen by a person.** Every claim here is a number. Whether it LOOKS
  good, and whether a student can still tell the launcher cards apart at a glance rather
  than by counting distinct computed accent pairs, is Mr. Pina's check and nothing here
  can measure it.
- **No screenshot is in the record.** The harness Chromium screenshots fine (the probe
  returns a valid PNG); nothing in this bundle needed one, since every visual claim it
  makes is a measured value.
- **Fonts**: the harness blocks every non-loopback request, so all text was measured in
  the fallback stack rather than in Rajdhani / Share Tech Mono. The theme changes no font
  token, so this affects no claim it makes.

## Deferred, deliberately

- **The base palette's own three sub-floor pairings** (`--gear` on `--bg2` 3.57,
  `--dim` on `--bg2` 4.24, `--boundary` on `--green-tint` 2.86). All pre-existing, all
  improved by the theme, none fixed. The unthemed spec deliberately does NOT assert the
  board, because two permanently red rows recording a property of the palette is the
  ratchet CLAUDE.md forbids.
- **A flash of the base palette on first paint.** `ThemeRoot` writes the attribute from an
  `$effect`, so a themed reader sees the unthemed page for one frame after SSR. The
  notebook's plate picker has the identical property. Closing it means an inline script in
  `app.html`, which is a bigger claim than this bundle needed.
- **A second theme.** The mechanism takes one and the tests sweep the directory, so adding
  one is a file plus an `@import`.
