---
title: The Blade editor driven at both widths before a person drove it, and the four things that found
date: 2026-09-13
branches: [claude/keen-thompson-yydv8r]
migrations: []
subsystems: [ideacad, classroom, verification]
---

Ledger `0224`. Mr. Pina uses the Blade editor tonight and students meet it tomorrow.
No IdeaCAD surface has ever been driven by a person: every browser measurement this
repository has taken against it was on a `/dev` harness route, because production
needs a Google session no session holds. So this bundle's job was to drive the
editor as hard as an automated pass can, at 375 and 1440, and fix what that found.

## The audit, and why it found anything at all

The existing route specs were green before this bundle started and green after:
**50 route/width runs, 972 measurements, 0 outside threshold** on `origin/integration`
at `709827d7`. Every defect below sat under that green.

That is the whole lesson of this bundle and it is not a new one, only a sharper
case of it: the specs asked whether things were **present**, **visible**, **over
44px** and **contrast-clear**, and every defect here answers yes to all four. What
none of them asked was whether a control could be **pressed**, or whether a row a
student needs is **above the fold in a container this Chromium paints no scrollbar
for**, or whether a two-word chip is a **report**.

Three instruments found what the specs could not, and the first one is the one
worth keeping: **rasterize the panel and look at the image**. The confirm pair at
375 is simply not in the picture. The orientation menu's picture ends mid-glyph on
"Bottom" with Isometric nowhere.

## The five questions, answered

**Which panels a student actually meets.** `BladeEditor.svelte` imports and mounts
five: `Viewport`, `ConceptStrip`, `FeatureTree`, `PropertyManager` and
`HistoryTimeline`. A sixth, `ProfilePreview`, is mounted by `PropertyManager` and is
not named in the prompt. `SharePanel`, `PartsPanel` and `SharedDocuments` are
`ItemDetail.svelte`'s, confirmed by grep and by a live count of 0 on both harness
routes. The `FeatureTree` and `Viewport` grep hits under `src/routes/gauntlet/` are
`FeatureTreeNav` and `ViewportBackground`, different components with confusable
names.

**Geometry at both widths.** Clean, once the four defects below are out. At 1440 the
three regions are 300 / 858 / 280 filling a 1440 root with 0 page overflow; at 375
the media query stacks them at 373 wide each. The canvas fills its pane at both. No
zero-width viewport.

**Tap targets.** 0 below 44px, in every state driven: 23, 28, 16, 21, 14, 11, 7 and
4 interactive elements measured across the default, three-concept, teacher,
PropertyManager, Materials, timeline, orientation and compare states.

**Nothing hidden in a base state.** One hover-only reveal exists in the tree and it
is GAUNTLET's `.drawing-zoom .zoom-hint`, not this surface's.

**The failure paths** are the next section.

## What was fixed

### An empty concept list crashed the whole editor

`[].map()` is `[]`, not nullish, so an empty `concepts` array fell straight past the
`??` that was meant to catch "no seed". `active` came out `undefined` and
`seedFeatures()` read `.features` off it -- a `TypeError` at **initialisation**, so
the component never renders a frame at all. Measured against `svelte/server`'s
`render`: `Cannot read properties of undefined (reading 'features')`.

`ideacadEditorSeed` refuses a zero-concept document one layer up today, so this is
defence in depth rather than a live path. It is worth the predicate anyway, because
the cost of the guard is one expression and the cost of its absence is the entire
surface going blank with a student's work behind it. What it renders is not invented:
an empty seed is now the same answer as no seed, which is the one local card the
component has always produced.

### A stale save said two words and nothing else

`store.ts` publishes the terminal `conflict` phase when the server refuses a stale
revision. The local row deliberately keeps its old `revision` -- the server's copy is
held beside it for a resolution surface nobody has built -- so **every following edit
re-sends the same stale number and is refused again, forever**. `edit()` republishes
`phase: 'idle'` and re-arms, so the chip flickers "Saving" and settles back on
"Changed elsewhere".

On screen, that was the whole of it: two words in a 16px chip. The store's own
sentence lives in `state.error`, which no mount renders.

`BladeEditor` now carries a sentence beside the chip saying what has stopped, what is
still on screen, and that a reload is what would cost it. Three decisions in it:

- **It is keyed on `ideacadSaveLabel('conflict')`, never on a literal**, so the word
  in the chip and the sentence under it cannot drift apart.
- **It is not a second copy of the store's sentence.** The store's `error` describes
  the STATE and never reaches this component; what is added is the CONSEQUENCE and
  the action, which is the job `IDEACAD_WRITE_REFUSED` already does one path over.
- **A revoked grant keeps its own wording.** `ItemDetail` already hands that case
  down as `ideacadSaveLabel('error')`, so this label arriving means a stale revision
  and nothing else. Both negative controls are asserted.

**The state had never been driven.** `store.ts` reaches `conflict` two ways and
ledger 0201 built a harness for one of them: a revoked grant makes the write THROW,
a stale revision makes it RESOLVE with `ok: false`. `/dev/ideacad-item?state=conflict`
is the second, driven through the real store -- open, let the server move underneath,
edit -- with `applyActions` answering stale as well as `saveConcept`, because with
0209's transports present the write never touches the latter.

### At 375 the confirm pair could not be pressed at all

`.ideacad footer` carries `z-index: 2` so it paints over the graphics area. The
`max-width: 1023px` media query overrode `position` to `static`, and **`z-index`
applies to positioned elements only** -- so the grant was silently discarded, and
`Viewport`'s own `position: absolute; inset: 0` root and the view toolbar (`z-index:
2`, also positioned) painted straight over a footer sitting in flow at the top of the
pane.

Measured before the change: the footer had a real 373x68 box, `presence` counted it
present 2 / visible 2, the tap-target check measured 94x44 and 88x44, the contrast
check read it fine -- and an `elementFromPoint` sweep across both controls answered
**Accept 0/11 reachable, Cancel 0/11 reachable**, blocked by the toolbar's own
buttons. After: 11/11 and 11/11 at both widths, clearing the reference triad and the
view name.

The fix is to stop overriding `position`. Absolute at the bottom right is what 1440
already does and is proven reachable there; overlapping the model a little is worth
immeasurably more than a control that cannot be pressed.

### At 375 the orientation menu hid Isometric below an invisible fold

Seven 44px rows measured **345px of content in a 278px box** -- `.orient` is capped at
`calc(100% - 5rem)` of a 360px viewport. The list is `overflow: auto` so the row can
be scrolled to, but this container's Chromium paints no scrollbar at any colour
(ledger 0186's magenta-on-green control), the rasterized picture ends mid-glyph on
"Bottom", and Isometric is the view a student most wants to get back to. An
`elementFromPoint` at its own centre did not reach it.

Two content-sized columns: 186.5x202.8 at 375, nothing below the fold, all seven
reachable. **The track sizing is the second half of the fix rather than a tidiness.**
Two `1fr` tracks kept the menu at its one-column width, halved each cell and sliced
every shortcut hint to "Ctrl+" -- a clipped row traded for a clipped hint, which the
first re-measurement caught. `max-content` plus a `max-width` gives 289.5px at 320,
375 and 1023 with every hint intact and no page overflow.

### Cosmetic

Three font literals replaced by their tokens: `'Chakra Petch', sans-serif` twice
(`--font-hero`, byte-identical) and `'Share Tech Mono'` once -- that one had **no
generic fallback at all**, so a failed webfont would have dropped `PASS`/`FAIL` into
the UA serif while everything around it stayed Rajdhani. `--font-mono` restores it.
And the body-fill slider took `accent-color: var(--green)`: a bare `input[type=range]`
paints the UA blue, which was the one blue thing on a console whose register is
green, amber, cyan and crimson.

## What was deliberately not fixed

- **Escape during a parameter edit discards the edit with no confirm.** Measured: the
  PropertyManager closes, the tree returns, the mass reverts 185 to 184, nothing is
  said. That IS Cancel -- the control's own `title` reads "Cancel (Escape)" -- and a
  confirm on it is a redesign, not a robustness pass.
- **The Materials panel is 446px taller than its pane at 1440.** Measured 961px of
  content in a 515px box, which is exactly the figure its own comment records. A
  documented arrangement decision, not a defect.
- **The compare sheet's scrim darkens the panel it belongs to.** `.compare::before` is
  `position: fixed; z-index: -1` inside `.compare`'s own stacking context, so it
  paints over the panel's background: measured, the painted ground is rgb(8,10,9)
  against a declared rgb(16,19,18). Contrast goes UP with it, not down (16.39:1
  against 15.42:1 for the heading, 7.73 against 7.27 for the notes), so what it costs
  is the panel reading as a raised surface and nothing legibility can measure. Worth
  knowing that **every contrast figure the compare specs print is taken against the
  declared ground and is therefore slightly pessimistic**, which is the safe direction.
- **The compare sheet at 375 holds 1151px of content in a 650px scroll box** and the
  concept strip scrolls horizontally with three concepts. Both scroll, neither hides
  its scrollbar.
- **Escape does not cancel a rename, and the rename box does not autofocus.** "Cancel
  rename" is a visible word beside it.
- **The header reads "Saved" from the first frame on a surface with no store.** On the
  real page `saveLabel` wins; the manager's read-only arm is the only place it shows,
  where it is cosmetic.

## Verification

- **The two behavioural guards are mutation-proofed** in
  `tests/dom/ideacad-editor-mount.test.ts`: 5 mutants, all killed, counts reported
  (1/19, 11/9, 2/18, 2/18, 3/17). Both directions for each -- the restrictive mutant
  and the permissive one that would swallow a real document or light the sentence on
  every state.
- **The two geometry guards are mutation-proofed against the browser harness**, which
  is the only instrument that can see them: `tests/dom/` has no layout engine and
  would read zero. 3 mutants, all killed, **each turning exactly its own claim** --
  `position: static` turned only "every pixel of the confirm pair is reachable";
  removing the two-column rule turned "nothing is below an invisible fold" and "every
  row can be pressed where it is drawn"; the `1fr` tracks turned only "no row has its
  own text clipped".
- Both scripts **copy the file first and restore from the copy, md5-verified**, and
  judge by the summary line rather than the exit code. The first spelling of the
  first mutant produced a **parse error** rather than a behavioural change: it
  reddened the suite for the wrong reason, the script's own "no summary line" branch
  refused to call it a pass, and the mutant was rewritten to change the condition
  rather than the structure.
- **Browser pass**: `52 route/width runs, 1006 measurements, 0 outside threshold`
  (from a 50/972 baseline -- the new spec at two widths, plus 34 measurements).
  `--selftest`: **70 controls (36 negative, 34 positive), 0 instrument failures**.
- **`svelte-check`: 0 errors, 37 warnings in 20 files (31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`)**. Re-derived in a clean
  `git worktree` at `origin/integration` `709827d7` rather than on the tree under
  test, with the two `PUBLIC_SUPABASE_*` values exported before the sync: identical
  there. **Delta zero, and `CLAUDE.md`'s stated figure is currently correct**, so no
  correction to that line was needed.
- **`npm test`: 8830 passed, 8 failed, 465 files.** Judged by the summary line;
  **the run exited 0 with 8 failing tests**, which is exactly what
  `tools/run-tests.mjs` warns about. Seven were `tests/derived-numbers.test.ts` and
  were this bundle's: adding a route spec leaves the README's generated static region
  claiming 223 specs over a `measured/` holding 222, which that file reddens on by
  design. Regenerated on a clean committed tree; a scoped measure run wrote one file,
  for this spec alone. Re-run: green.

## The one failure that is not this bundle's

`tests/db/migrations-applied-record.test.ts` fails on the hash of
`0210-determined-albattani-16az27.md`: expected `550f5597...`, received `48a4ad20...`.
**It reproduces identically at `origin/integration` `709827d7`**, measured in the
clean worktree, and this branch touches no file under `docs/migrations-applied/` or
`supabase/migrations/`. It belongs to whoever landed
`claude/determined-albattani-16az27`, which is the integration tip's own merge commit.
Reported, not touched.

## What this bundle did not write, and should have

`classroom-updates.json` gets no entry, and by `CLAUDE.md`'s standing directive it
should: a student on a phone can now press Accept, reach all seven standard views,
and be told when their blade has stopped saving, all of which a class sees. The file
is at the repo root and outside this bundle's stated ownership, with two other lanes
live -- and a shared root JSON three sessions append to is the merge shape ownership
exists to prevent. The prompt's boundary was followed and the omission is named here
and in the session report so it can be written deliberately rather than discovered.
