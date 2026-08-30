---
title: "The coin desk's four instructor reports: a picker ordered by use with a tone and a glyph per transaction type, four areas that stop wasting 608px of a 1440px window, the Ledger's own chrome brought across, and a report control on the Ledger at last (`claude/coin-desk-transaction-ux-e2vg1f`)"
date: 2026-08-30
branches: [claude/coin-desk-transaction-ux-e2vg1f]
migrations: []
subsystems: ["Coin economy", "Feedback", "Legacy content", "Testing"]
---

Four things an instructor filed about the coin desk and the IDEA Coin Ledger.
No migration, no RPC change and no coin write path touched: every public coin
write function is admin-only by design and this was presentation only. The one
thing that came close to needing a query is named at the end under what was not
built.

## 1. The transaction picker: ordered by use, with a tone and a glyph per type

**The report was "transaction selection is unordered and unreadable at a
glance".** The picker is `LogView`'s combobox over `coin_categories`, ordered by
`sort_order` -- which groups by kind and then descends by price, a sensible
order for a price list and no order at all for the control an operator touches
for every entry.

**"MOST USED" IS A STATIC ORDER AND THE ENTRY SAYS SO.** Nothing on
`/coin-desk` loads a per-category tally: the page's load reads
`coin_categories` and the section list and nothing else, and adding a read of
`coin_transactions` to sort a dropdown was outside this bundle. So the counts
are a pinned table in `$lib/coin-desk/transaction-types.ts`, derived from
`docs/coin-economy/archive/2026-08-11-transactions.csv` -- the committed export
of the retired Google Sheets ledger this economy replaced, and the only usage
data that exists anywhere in this repo. 216 rows of real instructor logging;
163 of them map onto live category ids.

It is an ALL-TIME count over that archive rather than a recent window (the
archive ends the day it was taken, so a window would be a smaller slice of the
same term) and rather than a per-instructor count (every row was logged by the
same person, so the two are the same number here).

**THE 53 UNMAPPED ROWS ARE NAMED RATHER THAN DROPPED:** Legacy Wealth
Declaration (43, the import's own opening-balance row and not an instructor
action), Unprofessional Conduct (4) and Crashing Out (2), which have no
equivalent in the 0070 economy, and Bank Balance Applied to Purchase (4), a
legacy banking mechanism this economy does not have. Two judgement calls are
written down beside the map: "Feet on 2nd Chair" and "Leaving Mess in
Classroom" both go to `classroom_standards_violation`, whose own seed note is
"furniture, general tidiness", and the two eating-pass tiers both go to
`eating_pass`, which 0070 collapsed to one.

**0084 WAS NOT A SHORTCUT.** The obvious place to look for a reason -> category
map is the legacy import, and it does not have one: it buckets every legacy row
into four `legacy_*` categories by TYPE and keeps the reason only in the note.
So the map is by hand, which is the weak joint, and it is EXPORTED
(`COIN_USE_LEGACY_REASONS`) so `tests/coin-transaction-types.test.ts` can
re-count the CSV through it and compare the result to the shipped table. The
expected value comes from the data, never from the table under test.

**`sortByUse` IS STABLE, AND THAT IS THE WHOLE TAIL.** Everything not in the
table keeps `coin_categories.sort_order`, and so does everything tied inside
it, so a category never moves between two renders of the same list.

**THE TONE AND THE GLYPH ARE KEYED ON `COIN_TXN_TYPES`, WHICH ALREADY EXISTED.**
`coin-format.ts` has had the five-member union, the labels and `coinTxnType()`
-- which derives a row's type exactly the way `coin_public_transactions` does in
SQL -- since the display bundle. What it did not have was a colour for three of
the five: `adjustment` was violet and `payout` cyan in `CoinTransactionRows`,
and `fine`, `award` and `purchase` all fell through to `--dim`. The one
distinction a person scanning a history actually wants was the one the chip did
not draw.

- **THE LEDGER PAINTS A FINE RED AND THE DESK DELIBERATELY DOES NOT.**
  `src/lib/legacy/coins/index.html` styles `.type-fine` with its own `--red`.
  The portal reserves `--crimson` for LIVE/REC/error and says "never used for
  identity", and a transaction kind is an identity. `src/app.css`'s own home
  feed flags had already made this exact call ("--crimson is deliberately
  absent ... this surface carries no live state") and reached for `--amber`.
  Fine takes `--amber` (warning), award `--green` (success), adjustment
  `--violet-ink` and payout `--cyan` (both already shipped), which leaves
  `--gold` for purchase. **Gold and amber are the closest pair in the set** --
  brass #c8a848 against copper #d08030 -- and that is worth saying out loud;
  it is also why the glyph and the WORD are never optional.
- **THE PICKER ASKS `coinTxnType()` RATHER THAN READING `kind`.**
  `coin_payout` is kind `purchase` in the price list and reads as a payout
  everywhere a transaction is rendered, so reading `kind` in the picker would
  have been two answers to one question.
- **FIVE GLYPHS, NOT FORTY.** Per TYPE, never per category: five silhouettes a
  reader can learn beats forty they cannot, and forty would mean inventing
  lookalikes.

**WHY ANY OF THIS IS TESTED WHEN ALMOST NOTHING VISUAL HERE IS.** Three of the
four assertions regress silently. A sixth type added to `coin-format.ts` with
no entry in the presentation maps renders an EMPTY `<svg>` and inherits
`--dim`: nothing throws and nothing type-errors. The use counts drifting from
the archive they cite is invisible by construction -- a wrong order is still an
order. And a tone reaching for `--crimson` passes every visual review, because
it looks right and the rule it breaks lives in a stylesheet comment nobody
reads while picking a colour.

## 2. 832px of a 1440px window

**Measured before anything changed, at 1440px:** the Log area's page element
was 1440px wide and Students, Contracts, Roles and Economy were all 832px --
58% of the window, 608px of empty plate. The cause was one line: `.cd-root`'s
page read `--measure-panel` (52rem), and `split.css` only overrides it to
`--measure-split` on a room that CONTAINS a split, which is the Log area alone.

The cost showed as HEIGHT, which is what the report was actually about: inside
those 768px columns the price list card stood **3180px tall**, the roles card
2173px and the contracts card 1840px.

- **THE FALLBACK MOVED TO `--measure-split`**, so the split's own value and the
  page default are the same number rather than two. No new token, no per-route
  width, and the areas stop disagreeing about how wide the desk is. Not
  `--measure-console` (100%): a console takes the whole window because its
  panes are worked side by side, and the desk is one column of cards.
- **PROSE IS CAPPED SEPARATELY, AT `--measure-reading` (46rem).** Widening a
  page is not widening a sentence, and the two have to be different rules or
  the first ruins the second. Measured at 1440: the nav blurb went from 143
  characters on its line to 78 and the longest `.note` from 121 to 71.
- **THE COLUMN MINIMUMS WERE MEASURED, NOT PICKED.** Driving each list's own
  container from 240/260px to 760/780px in 20px steps: the price list has its
  knee at 320px (38 of 38 rows wrapped below it, 28 at 320, 21 at 380) and is
  then FLAT from 380 to 580, so 24rem; the contract list flattens at 420px, so
  26rem; the role applications at 440px, so 28rem.
- **THE PRICE LIST IS GROUPED IN COLUMNS, NEVER FLAT IN COLUMNS.** It is 42
  rows under four kind headings; poured in as one flat sequence, "Awards" would
  land halfway down the second column with fines above it. Each kind became its
  own `<section>` and the SECTIONS are the grid items.

**Measured after, at 1440:** every area's page is 1440px; the price list lays
out in 3 columns and its card is **2295px** instead of 3180px. At 375 all three
gridded lists collapse to a single column through `minmax(min(<col>, 100%),
1fr)` with no breakpoint of their own, and nothing overflows.

**Two tap-target defects fell out of measuring the surface** and were fixed
rather than noted: the roster rows an operator picks a student with measured
**25.1px** and the price list's retire/reactivate controls **19.8px** -- the
second under the 24px ABSOLUTE floor, on 38 controls at once. The roster took
44px; the `.mini` row controls took 24, because inflating every row of a 38-row
list to 44 would add ~900px of height to the surface this bundle exists to
shorten. `.since` moved off `--dim` (4.52:1 on a card, a pass by two
hundredths) onto `--text-2` (5.88:1) -- the remedy CLAUDE.md already names for
that exact case, at the CALL SITE, never by lightening the token.

**THE ROOM GOT A STYLESHEET, AND THE REASON IS THE HARNESS.**
`/coin-desk/+layout.svelte` and `/dev/coin-desk` each carried a byte-identical
scoped copy of `.coin-desk-page` and `.hero`, so the harness could measure a
page width the real layout did not have, silently. Both import
`$lib/coin-desk/coin-desk.css` now.

## 3. The Ledger's chrome, and what was deliberately not taken

The Ledger's design language, read out of the file rather than remembered:
Orbitron uppercase at wide tracking for every piece of chrome, Share Tech Mono
for data, 2px control corners and 4px card corners, outline chips with a faint
sage border, a tab bar marked by a 2px underline, and `.coin-card`'s 3px accent
stripe down its left edge.

What came across: the tab bar's shape, face and underline (the desk's sub-nav
was a row of filled pills in Share Tech Mono, 26.2px tall); `--font-title` on
the masthead line; the left accent stripe on the desk's cards and on every
picker row.

**WHAT DID NOT COME ACROSS IS THE PALETTE.** The Ledger marks its current tab
in gold; here `--gold` is "special callouts" and `--green` is "active
navigation", and the semantic roles are fixed. Matching a legacy page is not a
licence to reassign one. Same call for the fine chip, above. The desk's radii
already agreed with the Ledger's -- `--radius-chip: 2px` / `--radius-card: 4px`
are the design system's own values -- so that half needed nothing.

Font literals in every file this bundle touched moved onto `--font-mono` /
`--font-display`.

## 4. The Ledger had no way to report a problem, and could not be given one

`SiteFeedback` is mounted once in the root layout, which is what makes report
coverage something a new route INHERITS. The Ledger inherited nothing because
it was `static/coins/index.html`: a static asset is served by the platform
before any SvelteKit code runs, so a route under the same path is shadowed and
never called, and the only way to put a control on the page was to edit the
frozen file.

**BOTH HALVES OF CLAUDE.md ANSWER THAT, AND THEY POINT THE SAME WAY:** "Do not
modify the internals of carried-over legacy files", and "serve-time injection
is the convention for anything added to legacy HTML". So the file moved from
legacy pattern 1 to pattern 2 -- `src/lib/legacy/coins/index.html`, served by
`src/routes/coins/[...path]/+server.ts` -- which is what `/vanguard` and
`/assignments/<slug>` already are. **The file is byte-identical** (md5
`68deffdd07685aa14572b763a627a167` before and after); the freeze holds and
every edit is to the served string.

**THE URL WAS THE CONSTRAINT.** `/coins/index.html` is on handouts, in
`portal-apps.ts`, is where `/coin-balance` and `/contracts` 308 to, and is the
`next` the coin sign-in route returns to. A rest parameter answers `/coins`,
`/coins/` and `/coins/index.html` from one handler; anything else under
`/coins/` is a 404, because there has only ever been one file there.

**THE DEPLOYMENT SHAPE WAS VERIFIED FROM THE BUILD OUTPUT, NOT ASSUMED.** This
is the failure mode the Foundry serving lanes are a monument to -- a route that
works locally and 404s on the deployed host -- so `npm run build` was run and
`.vercel/output/config.json` read: `{"src": "^/coins(/[^]*)?/?(?:/__data.json)?$",
"dest": "/coins/[...path]"}`, with no `coins` directory left in
`.vercel/output/static/`. Dev answers 200 / 200 / 308 / 404 for the four forms.

**IT IS NOT A SECOND FEEDBACK SYSTEM.** `$lib/server/legacy-report-panel.ts`
imports the kind list, the caps, the refusal wording and `describeBuild` from
`$lib/feedback/*` -- the same strings the Svelte box shows -- and the row lands
in `app_feedback` through the same two endpoints as everything else.
`/api/vanguard-feedback`'s body was extracted to
`$lib/server/legacy-feedback-post.ts` and both routes are now four-line callers
differing by one `app` string, because two copies of a body-size cap, a kind
allowlist and a refusal ladder is two things to keep in step and the refusal
ladder is the half that would drift silently.

**ONLY THE SIGNED-IN ENDPOINT IS A PARAMETER.** The anonymous one comes from
the shared constant with no way to override it, so no caller -- the dev harness
included -- can point a signed-out report anywhere but `/api/feedback`. The
cost is named in the harness: a signed-out drive there posts to the real
anonymous route, which with no service-role key answers a structured
`not_configured`, so what that path exercises is the refusal branch.

**VANGUARD'S OWN INJECTED PANEL WAS LEFT ALONE, DELIBERATELY.** It is the older
copy of this idea and is a migration candidate, not a second sanctioned
pattern -- but it is woven into the game (it wears `.fbovl` so the game's
pointer, mouse and wheel handlers stand down, it reads `__ideaGameInfo` for the
mode and sector, it shares VANGUARD's own button factory), and none of that can
be verified without playing the game. Folding it in belongs in a bundle that
can.

**TWO DEFECTS IN THE INJECTED CONTROL WERE FOUND BY MEASURING IT, AND BOTH
LOOKED FINE AT 1440.** The trigger first reused the Ledger's own `.share-btn`
class -- which that page sets `display: none` below 768px -- so it measured
**0x0 at 375px**: invisible on the width a student reads this page at, perfect
on a laptop, with nothing to say so. And `.share-btn`'s resting ink is the
Ledger's `--dim` (#4A7A52), which measures **4:1** against the header ground.
The trigger is inline-styled now, at #9FB8A6 (**9.43:1** measured), 63x44 at
both widths.

**A STRAY BACKTICK IN A COMMENT INSIDE THE INJECTED TEMPLATE TOOK THE WHOLE
ROUTE DOWN**, with a 500 and a `PARSE_ERROR: Cannot assign to this expression`
pointing at the comment rather than at anything wrong with it. It fails loudly
and `npm run build` catches it, so it needs no test -- but a comment inside a
template literal is not free, and prose about `.share-btn` is where a backtick
comes from.

## What was measured

`svelte-check`: **0 errors, 37 warnings**, the baseline, unmoved (re-derived
after exporting two placeholder `PUBLIC_SUPABASE_*` values and running
`svelte-kit sync`, per CLAUDE.md's fresh-checkout note).

`npm test`: **215 files, 4428 tests, all passing**, including the six new ones
in `tests/coin-transaction-types.test.ts`.

`npm run verify:browser`, at 375 and 1440: **96 route/width runs, 1194
measurements, 6 outside threshold**, and all six are named under "not this
bundle's" below. (The harness README's own snapshot says 36 specs / 780
measurements / 2 outside; that line has drifted and is not corrected here --
see the last item under "Deferred".)

New specs: `coin-desk`,
`coin-desk-state-picker`, `coin-desk-area-economy`, `coins`,
`coins-signedin-1`; `coin-preview` extended rather than duplicated. Selected
numbers:

- Picker: 38 options, the archive's own top four first, **5 types / 5 glyphs**,
  every row 44px, every row toned. Chip contrast against the real rendered
  ground: award **5.39**, fine **4.52**, purchase **5.93**, adjustment
  **4.79**, payout **6.02**. The fine chip is the tight one and is worth
  watching.
- Economy: page **1440px of 1440**, price list in **3 columns**, card
  **2295px** (it was 832px and 3180px). At 375: **1 column**, no overflow.
- Ledger: trigger **63.4x44** at both widths, hit-testing to itself, panel
  opening in one click, all six panel controls at or above 44px, trigger
  contrast **9.43:1**.
- Student preview: 6 type chips, 6 glyphs, **1:1 (4 types)**, and 0 buttons, 0
  comboboxes, 0 submit controls, 0 forms, 0 file inputs.

**MUTATION PROOF** on `transaction-types.ts`, restored from a scratch copy
(never `git checkout --`, which restores from HEAD and would have discarded
this session's uncommitted work) and md5-verified identical afterwards:

- giving `fine` the same glyph as `award` reddened the distinctness assertion
  AND the browser probe (`5 types / 4 glyphs`);
- pointing `fine` at `--crimson` reddened the reserved-red assertion;
- moving one use count off the archive's own figure reddened the re-derivation.

**EVERY ABSENCE ROW WAS DRIVEN IN BOTH DIRECTIONS**, by injecting the forbidden
node at the exact place the rule forbids it: all six went 0 -> 1, so none of
them is an assertion about a selector that no longer matches anything.

## What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder ref; no RPC was called, no row was written, no balance was read.
- **No signed-in session anywhere.** The Ledger's signed-in branch was driven
  through the dev harness's `?signedIn=1` cookie, which is what a session is
  there. `/api/coin-feedback` has never been called with a real JWT: its body
  is `/api/vanguard-feedback`'s, extracted unchanged, and the full suite covers
  that route's behaviour, but the coin route itself is unexercised end to end.
- **No Vercel preview.** Deploys are rate limited, so the production routing
  claim rests on the emitted `.vercel/output/config.json` and on dev, not on a
  real request to `ideabosco.com`.
- **Web fonts do not load in the harness** (the proxy resets
  `fonts.googleapis.com`), so every pixel measurement above is in the fallback
  stack and is approximate. Contrast is unaffected: it is read back off a
  canvas.
- **`prefers-reduced-motion` is `no-preference` throughout.** Nothing here
  animates, but that is a claim about the code rather than a measurement.

## Two findings that are not this bundle's

- **`/dev/foundry-submit` reports `present 2, visible 2` against `exactly 4`**
  on its refusal-sentences row, at both widths. It is on the tree at
  `origin/main` before any change here and belongs to that lane.
- **`/dev/pathways`'s two harness controls measure 194.7x26.2**, under the 44px
  floor at both widths. Pre-existing and already written down in the harness
  README's known-findings list.
- **The Ledger overflows 51px at 375** (`scrollWidth 426 vs clientWidth 375`).
  It is the page's own `#student-drawer`, a slide-in panel parked off the right
  edge at ~750px, and it reports identically with the injected trigger removed
  from the DOM -- measured both ways. The page does not actually scroll
  (`body { overflow-x: hidden }`); what the check reads is
  `documentElement.scrollWidth`, which that rule does not bound. `coins.mjs`
  carries a probe that NAMES the offending element so the finding explains
  itself in the report. Fixing it means editing a frozen legacy file.

## Deferred, and what it would take

- **A LIVE "MOST USED" COUNT.** The static table is honest but it is one term
  of one instructor's history, mapped by hand. Replacing it means a per-category
  tally the picker can read -- a definer RPC over `coin_transactions` returning
  counts and nothing else, or a widened category read -- plus a decision about
  the window and about whose usage it is. Both are outside a presentation
  bundle.
- **SECTION AND PAYOUT LISTS STILL STACK.** `.section-rows` is four short rows
  and `.payout-rows` has a `max-height` scroll of its own, so neither was
  gridded. Both would take the same measured `--cd-col` treatment.
- **FIVE COPIES OF `.rows` / `.row`.** `CategoriesManager`, `ContractsManager`,
  `RolesManager`, `PayoutManager` and `SectionManager` each carry a
  byte-identical block. Folding them into `coin-desk.css` is right and was not
  done here: `CoinTransactionRows` is mounted at `/dev/coin-balance` with no
  `.cd-root` above it, so a room-scoped rule plus five deletions is a change
  that has to be measured on six surfaces, not four.
- **`tools/browser-verify/README.md`'s SNAPSHOT LINES ARE STALE.** It says 36
  specs / 780 measurements / 2 outside threshold; this tree measured 86
  route/width runs and 1002 measurements before these specs. They were left
  alone rather than corrected because that file is a shared write point several
  lanes are already editing, and the numbers are in this entry instead.
