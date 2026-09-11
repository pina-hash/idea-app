---
title: "IdeaCAD's visual surface, looked at for the first time"
date: "2026-09-11"
branches: ["claude/ecstatic-maxwell-juawx5"]
migrations: []
subsystems: ["IdeaCAD", "Classroom", "Testing"]
---

Ledger 0145 built the whole IdeaCAD subsystem in a Codex container with no Chromium and a
Vite that would not stay up, and said so in its own entry: screenshots, the 375 and 1440
measurements and a frame-time p95 could not be established. The data model, the geometry
and the physics were proven by `tests/`. The entire visual surface had never been looked
at by anyone. This bundle is the first look, and what it found was not cosmetic.

## What the audit found, against `docs/prompts/0145-ideacad.md`

Built and working, reported rather than rebuilt: the migration (`0201`, ten RPCs over the
four tables), the physics and geometry layer (`blade/evaluate.ts`, `blade/tree.ts`,
`blade/validate.ts`, `blade/materials.ts`), the broadcast transport (`live.ts`,
`transports.ts`), the schema-4 discriminator (`mount.ts`), the item-page ladder and the
`ItemDetail` branch, the three decision entries (24, 25, 26), the `classroom-updates.json`
entry, and the `CLAUDE.md` paragraph.

Built but WIRED TO NOTHING, and this is the half the tests could not see:

- `src/lib/ideacad/geometry.ts` builds real three.js `LatheGeometry` / `ExtrudeGeometry`
  from an `Evaluation` and has **zero importers anywhere in the tree**. There is no
  `Viewport.svelte`, no `WebGLRenderer`, no canvas. PART 4's `controls.ts` was never
  written and `viewport/controls-math.ts` is imported by its own test and by nothing else.
  What is on screen where the 3D viewport belongs is three CSS divs: an ellipse and two
  bars under a `rotateX(58deg)`.
- `src/lib/ideacad/config.ts` has no importer of any kind, not even a test.
- `createIdeacadTransports(data.supabase)` is constructed at
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte:41` and never passed to
  anything. That file is ledger 0145's surface, not this bundle's, so it is reported here
  and left alone.
- No PropertyManager, no save state, no local mirror, no teacher roster, no concept-card
  render, no undo/redo. PART 5 is a facade over PART 3's arithmetic.

So roughly four of the prompt's eight parts landed, which its own audit clause calls the
ordinary rate.

## What the first measurement found

Chromium 141.0.7390.37 at `/opt/pw-browsers`, Vite on 5199, at 1440x900 and 375x812:

| | before | after |
|---|---|---|
| the console | 628.0 x 760 in a 1440 window | 1440.0 x 760 |
| the 3D viewport pane at 1440 | **0.0 x 431.3** | 858.0 x 559.3 |
| the 3D viewport pane at 375 | 234.5 x 360 | 373.0 x 360 |
| `main` computed `grid-template-columns` | `300px 0px 280px` | `300px 858px 280px` |
| controls under the 44px floor | 1 of 22 (`Fit`, 41.4 x 44) | 0 of 22 |

**The whole 3D viewport was zero pixels wide, and one element name caused it.** The
editor's console body was a bare `<main>`, and `src/app.css` styles that element globally
for the whole site: `max-width: 880px; margin: 0 auto; padding: 3rem 1.5rem 5rem;
position: relative`. Auto side margins on a grid ITEM disable stretch, so the console was
sized to `fit-content`; the viewport's max-content contribution is zero, because its only
sized child is a percentage width against an indefinite one. The middle track collapsed and
took the model, the heads-up toolbar, the reference triad and the view name with it. The
same global rule also made the shell's `<main>` the positioning context for the confirm
pair, which is why Accept and Cancel rendered outside the console at 1440 and on top of the
Rules rail at 375.

The fix is that the console body is `.stage`, a class the shell has no rule for.

**The prediction gate did not hold.** `{#if !prediction}` over `bind:value={prediction}`
keyed the lock on the rationale FIELD, so the comparative physics unlocked on the first
keystroke. Measured before the fix: one character typed into "Say why", with no concept
picked and Reveal never pressed, rendered `I 1626.6 g-cm2 / k 2.97 cm` under the heading
`Prediction: . h`. The gate is the whole pedagogical point of the compare surface. It is
now a separate `revealed` flag that only the control sets, and only with both halves
present; the code comment saying the gate is pedagogical and not a security boundary, which
PART 5 asked for, is beside it.

**Five controls did nothing.** New, Duplicate, Rename, Delete and Commit as concept card
carried no handler at all. They operate on a real concept list now: New and Duplicate
append and activate, Rename edits in place, Delete arms first and its confirm names the
concept, and the last concept is not deletable and says so rather than leaving a gap.
Commit is present only when `commitConceptCard` is handed in, so absence removes the
control, which is this repo's own rule and what the real page will rely on.

Also fixed: the heads-up toolbar ran off the pane at 375 with Edges and Perspective cut
off (it wraps now); the Rules rail clipped `UNVERIFIED STANDARD PARTS` at 1440; and the
shell's green `// ` h2 prefix leaked into the concept name, which a scoped room is supposed
to neutralize.

## Two things the measurement could not catch, and looking did

A layout claim is never made from a content check, and the reverse held too. Both of these
passed every threshold and were found by rasterizing and looking:

- Accept and Cancel, once anchored to the console rather than the shell's `<main>`, painted
  **on top of the concept strip** at 1440. They live inside `.viewport` now, which is the
  graphics area they confirm, and `the confirm pair clears the concept strip` is a verdict
  in the probe so it is measured from here on.
- The compare sheet read as a misplaced panel with no ground behind it. It has a scrim.

## What was measured, and with what

`tools/browser-verify/routes/ideacad.mjs`, `ideacad-role-student-state-three.mjs` and
`ideacad-role-student-state-compare.mjs`: 108 measurements over three states at two widths,
0 outside threshold. The one full-pass `verify:readme` at the end, on the clean committed
tree at `51a1c98`: **388 route/width runs, 6790 measurements, 0 outside threshold**, 1027.0s
-- the whole harness, not just this bundle's three specs. The geometry verdicts are built on the harness PAGE
(`__ideacadVerdicts`), not in the specs, so a probe that stops running shortens the array
and reddens. Contrast, measured against each element's real ground: readout label and value
15.42:1, PASS 7.91:1, **FAIL 5.12:1** (`rgb(217, 95, 95)` on `rgb(16, 19, 18)` -- the first
ratio ever taken on that branch, which no fixture had ever painted), FeatureManager row
10.42:1, eyebrow 8.67:1, triad over the viewport ground 8.3:1, view name 16.19:1.

`tests/dom/ideacad-editor-mount.test.ts`: 14 tests, structure only. No width, ratio or tap
target is asserted there -- happy-dom has no layout engine and every one of those reads
zero.

Mutation proof, the file copied first and restored from the copy, `md5 3a8bcba5c128aee1...`
byte-identical afterwards:

| mutant | reddened |
|---|---|
| the gate keyed on the rationale field, as shipped | 3 of 14 DOM tests |
| Commit offered without its transport | 1 |
| Delete offered for the last concept | 1 |
| the console body back to a bare `<main>`, as shipped | 3 browser measurements, 6 named verdicts |
| the 44px `min-width` off the controls | 2 browser measurements, reporting 41.4 x 44 |

**One mutant read as a pass and was not one**, and it is worth writing down: M5 first
reported 0 outside threshold. Vite had not recompiled between the write and the run. This
is `CLAUDE.md`'s "a `git stash` does not reliably reach the served bundle" trap one tool
over -- the mutant was on disk and the server served the old module, and the only symptom
was a clean result. A four-second settle after every write fixed it, and M4 re-run the same
way went from 2 reddened measurements to 3.

## Not verified, and why

- **No frame-time p95.** PART 4's 300-frame middle-drag has nothing to drag: there is no
  canvas, no camera and no controls binding. The number cannot be taken until the renderer
  exists, and quoting one for a CSS transform would be quoting a number about the wrong
  thing.
- **Nothing signed in.** The harness covers `/dev` routes only; the real classroom item
  page needs a Bosco Tech Google session no automated run holds.
- **No production database.** `0201`'s RPCs are exercised by neither this bundle's DOM
  tests nor its browser specs; nothing here calls one.
- Web fonts do not load under the harness (`fonts.googleapis.com` is blocked), so every
  contrast figure above is measured in the fallback stack.
- `prefers-reduced-motion` is `no-preference` in the harness, so that path is unexercised.

## Reported to other lanes, not fixed here

- **`tests/grant-surface.test.ts` was RED at this branch's point and is GREEN now, and the
  fix was somebody else's.** At `87ba98a` it failed 4 tests, measured identical before and
  after this bundle's own changes in a worktree at the branch point: `0201` left all four
  `ideacad_*` tables granted to `anon` AND `authenticated` with
  `select, insert, update, delete, truncate, references, trigger` -- an `anon` read of every
  IdeaCAD row and a direct client write path on a feature table, against the doctrine of
  zero client write grants. **Ledger 0161 landed `0202_ideacad_anon_grant_repair.sql` while
  this bundle was running**, and ledger 0162 merged it to `integration` ahead of the main
  landing for exactly that reason. Merging `integration` back into this branch takes the
  repair with it and the file is green here. This bundle owns no `supabase/` file and wrote
  none; the finding is recorded because it was measured independently here and because
  `0201`'s grant shape is the thing to check when the next IdeaCAD migration is written.
- **A STALE LOCAL REF VIEW FAILS `tests/db/migration-0177-tombstone.test.ts` AND LOOKS
  EXACTLY LIKE A REAL HOLE.** It reported migration `0200` as "a hole nothing accounts for"
  and named THIS branch as holding `0190` and `0191`. Neither was true. The test reads
  claims across `refs/remotes/origin/*`, and a cloud session that has only run
  `git fetch origin main integration` has no `origin/claude/**` refs at all -- so every
  in-flight claim is invisible and every hole reads as unaccounted. `git fetch origin
  '+refs/heads/*:refs/remotes/origin/*'` and the same file passes 4 of 4, unchanged, which
  is also why CI (which fetches everything) was green on `integration` while the identical
  tree failed locally. The `0190`/`0191` attribution is the other half of the same artifact:
  the tool credits a claim to whatever ref carries the ledger entry, and this branch merely
  CARRIES entries 0092, 0093, 0098 and 0099. **This bundle claims no migration number.**
- `tests/derived-numbers.test.ts` was red at the branch point too, 3 failures, on a stale
  counts region. Both regions are regenerated here.
- `CLAUDE.md`'s verification baseline says 0 errors and 37 warnings. Measured on
  `origin/integration` at branch time with the two `$env/static/public` values exported:
  **0 errors, 40 warnings in 22 files** (34 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`). This bundle ends at **0 errors, 38
  warnings in 21 files** -- the two `state_referenced_locally` warnings 0145 left in
  `BladeEditor.svelte` are gone, because every seed that captures a prop once now says so
  with `untrack`. `CLAUDE.md` is not this bundle's surface, so the line is reported rather
  than corrected. Ledgers 0161 and 0162 measured the same 40 independently.

## For the next IdeaCAD bundle

The viewport is the whole of it. `geometry.ts` and `controls-math.ts` are written, tested
and unwired; what does not exist is `Viewport.svelte` (dynamic `three` import in `onMount`,
`OrthographicCamera`, shaded-with-edges, a `ResizeObserver`) and `controls.ts` binding
`controls-math` to the DOM. Everything else PART 4 and PART 5 specify -- the
PropertyManager, the save state and its local mirror, undo/redo, the concept-card render,
the teacher roster -- sits behind those two files. `0145`'s own deferrals stand unchanged.
