# Legacy content and the freeze

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Carrying over legacy HTML, serve-time injection, the freeze and its exceptions. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### Carrying over legacy content

Legacy HTML is served without rebuilding or modifying its internals. **All later
carried-over content must follow one of these three patterns:**

1. **Public static** -- copy unchanged into `static/`; served at the site root.
   **Link to the explicit `index.html`**: the Vite dev server does not resolve a
   bare directory to it (Vercel does).
   - **PATTERN 1 HAS NO SERVE-TIME HOOK, AND THAT IS WHAT DECIDES BETWEEN IT AND
     PATTERN 2.** A static asset is served by the platform BEFORE any SvelteKit
     code runs, so a route under the same path is shadowed and never called;
     the only way to change what such a page carries is to edit the frozen file,
     which the freeze below forbids. **The IDEA Coin Ledger moved from 1 to 2
     for exactly that reason** -- it had no report-a-problem control and could
     not be given one -- so it is now `src/lib/legacy/coins/index.html` served
     by `src/routes/coins/[...path]/+server.ts`. The file is byte-identical to
     the one that was in `static/`, `/coins`, `/coins/` and `/coins/index.html`
     all still answer, and anything else under `/coins/` is a 404. **The move is
     the pattern's own escape hatch, not a licence to unfreeze a file.**
2. **Public raw-import endpoint** -- HTML lives OUTSIDE `static/` in
   `src/lib/legacy/`, pulled in at build time via Vite raw imports
   (`import.meta.glob(..., { query: '?raw' })`), **never runtime `fs` reads**, so it
   works on Vercel serverless. A `+server` endpoint returns it after
   `rewriteLegacyLinks`.
3. **Role-gated endpoint** -- the same, plus a `profiles` role lookup via
   `locals.supabase`. A link renders only for the right role, but the server-side
   check is the real guard.

**Serve-time injection is the convention for anything added to legacy HTML** (link
rewriting, the version badge, VANGUARD's cloud-save bootstrap): applied to the
served STRING, never to the source file on disk.

- **A LEGACY PAGE CARRIES THE REAL BUTTON AND OPENS THE REAL WINDOW IN A FRAME
  (ledger 0396, reports 0fe82a80 and 80bb4d23), AND A THIRD SURFACE IS A CALLER
  OF `$lib/server/feedback-launch.ts`.** `SiteFeedback` is mounted once in the
  root layout, which is what makes report coverage something a new route
  INHERITS; a page served from a `+server.ts` renders no layout and inherits
  nothing, so `injectFeedbackLaunch` puts the server-rendered `FeedbackTrigger`
  (the root control's own button and its own scoped stylesheet) in the official
  corner, with a small launcher that opens `/feedback/embed` in a transparent,
  same-origin frame over the viewport. That page renders `SiteFeedback` alone at
  `place="embed"`, so the window IS the home box -- the fields, voice, the
  screenshot paste, the horizon chips, the submit path and the refusals -- and
  nothing is rebuilt or copied. The frame reports the opener's route, live path,
  build and (the Ledger) its active tab; it closes on the box's own close and on
  Escape and hands focus back to the button; a frame whose document is not the
  window's page fails the press at once (`FEEDBACK_EMBED_MARKER`). A room's
  colours travel as `?room=<json>` over the one allowlist
  (`FEEDBACK_ROOM_TOKENS`), each value checked by `roomTokenValueOk` and set one
  property at a time, never as a style string, and again as a `room` message
  through the same filter (`filterRoomTokens`) whenever the page's theme
  attribute moves and at every open: the frame is kept once loaded, so the
  address alone went stale when a theme was switched in another tab, and the
  Ledger's box kept one theme's field under the other's ink, 1.0:1 (review
  round 2). A room hands the field AND the ink it is typed in together
  (`--plate-ink` beside the panel and well tokens). **The look-alike panel and its
  two signed-in endpoints are deleted**; `$lib/server/legacy-feedback-post.ts`
  is VANGUARD's alone. `/feedback` is a reserved short-link name (0269).
  - **THE WINDOW KNOWS WHO IS SIGNED IN FROM ITS OWN SESSION, SO THE PAGE THAT
    FRAMED IT STAYS SESSION-BLIND (report 20).** `/assignments/<slug>` is one
    public cache entry for a whole class and must not vary; the injected bytes
    are identical for every reader and the window reads the root layout's own
    claims, so a signed-in report is the RLS-scoped insert and a signed-out one
    the anonymous route, exactly as on the home page. The Ledger still bakes the
    theme and pays `Vary: Cookie` for that, never for the button.
    `tests/feedback-launch.test.ts` drives both real `GET`s signed in and out and
    fails on a drifted anchor; `tests/feedback-coverage.test.ts` sweeps every
    non-dev `+server.ts` that can answer with HTML and requires a control or a
    named exemption with a reason.
  - **THE LEDGER'S WINDOW WEARS THE PLATE IN THE LEDGER'S COLOURS** (`plate=1`,
    its `--lp-*` read off the page), and an assignment's is the plain box in the
    page's palette, light on a light handout. **The Ledger's text mark is
    swapped for the site emblem on the served string** by `injectLedgerLogo`
    in `$lib/server/ledger-logo.ts` (server-rendered `AnimatedLogo`, its
    layout rules restated and pinned by `tests/ledger-logo.test.ts`); the
    frozen file itself was not edited for either.
- **VANGUARD'S OWN INJECTED PANEL IS THE ONE LOOK-ALIKE LEFT, AND IT IS KEPT ON
  PURPOSE** (ledger 0396 names VANGUARD and GREENLINE as the two places that
  keep their own). It is woven into the GAME -- it wears `.fbovl` so the
  game's pointer, mouse and wheel handlers stand down, it reads
  `__ideaGameInfo` for the mode and sector, it shares VANGUARD's own button
  factory -- so folding it in belongs in a bundle that can play the game to
  check it.

**Asset paths.** Legacy files assume the old `/IDEA/` base path. Three mechanisms
resolve it without editing them: the `static/IDEA/` icon mirror,
`rewriteLegacyLinks()` at serve time, and exact-path 308s in `hooks.server.ts`.
**Those redirects are keyed WITHOUT a trailing slash** -- SvelteKit normalizes
`/IDEA/` to `/IDEA` and redirects before any hook runs, so with-slash keys can
never match. When adding legacy HTML, check its references against all three and
flag anything else (per-page assets).

**`static/IDEA/` ALSO HOLDS THE SITE'S OWN ICON SET, AND THAT IS NOT A LEGACY
DECISION.** `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`,
`icon-192.png`, `icon-512.png` and `icon-maskable-512.png` sit there rather than
at the static root because every one of those names is SLUG-SHAPED, and a
slug-shaped file at the root is served ahead of the `[shortlink]` catch-all --
so it has to join `RESERVED_SLUGS` and `_app_short_link_reserved` in the same
breath, which is a migration. `static/manifest.webmanifest` stays at the root
because it is already reserved. `tests/site-icons.test.ts` asserts the root
stays clear of an unreserved slug-shaped file, so this cannot ship again by
accident. **`IDEA` itself is uppercase, so no slug can ever equal it** -- which
is why that directory needs no reservation of its own.

### The freeze, and its one exception

**Do not modify the internals of carried-over legacy files.** The exception is
**VANGUARD**: `src/lib/legacy/vanguard/index.html` is the editable canonical source
and idea-app is its home. Game-feature edits are expected, but must stay
**surgical** -- the smallest unique chunk, no full-file rewrites, no reformatting
churn. The `vanguard_*` localStorage key pattern is the state convention (a
non-synced key uses a different prefix, e.g. `vgcoop_`). Any other legacy file is
unfrozen only by an explicit rule added here first.

**THE ONE OTHER UNFREEZING GRANTED TO DATE, RECORDED HERE BECAUSE THAT IS WHAT
THE SENTENCE ABOVE REQUIRES: two CSS rules in
`src/lib/legacy/coins/index.html`, on 2026-09-04, under an explicit scoped
authorisation from Mr. Pina carried in prompt 0025 (`the tab bar rules ONLY`).**
What was edited is `.tab-bar` (gaining `flex-wrap: wrap`) and `.tab-btn`
(gaining `min-height: 44px` and the flex centring that floor needs), inside the
document's own `<style>` block. **The markup and the scripts were not touched**,
which is what kept the edit safe: both serving routes import the file with
`?raw` and serve it byte-for-byte with every injection applied to the served
STRING, and no JS in the file reads tab geometry. The reason was a live
reachability defect -- the Ledger's fourth tab sat off the right edge of a phone
with `body { overflow-x: hidden }` making it unreachable by scrolling, by
swiping, or at all, on a page any student opens without signing in -- and the
tabs had never been measured against the 44px floor (33.8px at 1440, 39.6px at
375). `docs/history/two-live-reachability-defects-2tajpx.md` carries the
measurements. **This is a record of one exception, not a standing licence:** the
next edit to that file needs its own authorisation and its own line here, and
this rule was itself written a bundle late (prompt 0029), which is how a reader
came to find an edited legacy file with nothing saying why.

**THE SECOND UNFREEZING OF THE SAME FILE: ledger 0384 (2026-10-14/15), IDEA
Coin V2, authorized in that prompt ("this prompt authorizes editing the frozen
file") and widened mid-run by Mr. Pina's own note that the Ledger should take
the site's geometry and work with its themes.** The page now reads the V2 CSV
columns (one balance; `Category Id` instead of `Medium`), shows two stat tiles,
keys the Eating Pass badge on data, wears the site plate's geometry in its own
neon colors, and carries Space White twins under `:root[data-theme]`. Its route
injects the theme boot table (`injectLedgerTheme` in
`src/lib/server/coin-public.ts`, from `themeBootTable`, so `themeAttrFor` stays
the one decision). This is again a record of one exception, not a licence.

**THE THIRD UNFREEZING OF THE SAME FILE: ledger 0386 (2026-10-15), IDEA Coin V2
session two, item 2.17 of that prompt, which names the Ledger fixes.** The
champion's rim is a real gold border on Space White (the glow it relied on is
off there), the Print key no longer wraps, each card carries its holder's role
badges and their reported coins on hand (the summary CSV's `Roles`, `Coins On
Hand` and `Coins On Hand Date` columns), and the class-section colour table
and its `sections` fetch are gone with the old section model. A record of one
exception, not a licence.

**The retired Sheets coin ledger is ARCHIVED under
`docs/coin-economy/archive/legacy-system/`, not deleted.** `docs/` is not served and
is on no import path. **It is historical reference and must never be reintroduced.**
Reading its committed CSV DATA as a test fixture is fine and is not a
reintroduction.

**VANGUARD's Apps Script backend is a DIFFERENT deployment and stays live.** Check
the script id before touching any Apps Script reference.

---
