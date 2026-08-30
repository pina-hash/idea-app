---
title: "Blank space beside a classroom image was four defects, not one (`claude/classroom-image-blank-space-11qo8n`, code only, no migration)"
date: 2026-08-30
branches: [claude/classroom-image-blank-space-11qo8n]
migrations: []
subsystems: ["Classroom"]
---

The instructor reported blank space to the right of images that are "not a
specific aspect ratio". That is one symptom over **four independent
mechanisms**, in five components, and each one had to be fixed on its own terms:
the single change that would have addressed all of them does not exist, and
applying any one of the four fixes everywhere would have made two of the others
worse. All four were confirmed present by measurement before anything was
changed, and every number below was read off a real Chromium at 375px and
1440px through a new harness, `/dev/classroom-images`.

Nothing outside CSS moved. No migration, no markup change, no prop, no predicate,
no serving path: the whole bundle is declarations in five `<style>` blocks, plus
the harness and its route spec.

### A. An empty grid track (`SpecRenderer`, `MyClasses`)

`repeat(auto-fill, ...)` keeps a track that has nothing to put in it, so two
hand-ins in a wide pane laid themselves out as two thumbnails and six empty
columns. This codebase had already decided the question the other way three
times -- `ClassView`'s stream, `GradingConsole`'s roster and `FoundryGallery`
each carry a comment giving this exact reason -- and CLAUDE.md states it as a
rule. These two were the holdouts. Both now read
`repeat(auto-fit, minmax(min(<col>, 100%), 1fr))`, which is the idiom the rule
names, `min()` included.

Measured at 1440, the void to the right of the last card on the first row:

| grid | items | before | after |
| --- | --- | --- | --- |
| zone, two hand-ins | 2 | 1025.7px | 0px |
| zone, four hand-ins | 4 | 683.8px | 0px |
| My Classes, two sections | 2 | 303.5px | 0px |

At 375px every one of them was already a single column and stayed one, void 0px
before and after.

**THE VOID IS MEASURED FROM WHERE THE CARDS LANDED, NEVER FROM A TRACK COUNT,
and that is not a stylistic preference about instruments.** `auto-fit` collapses
an unused track to `0px` and the computed `grid-template-columns` still LISTS
it: the mutation run below printed
`332.297px 332.312px 332.297px 332.312px 0px 0px 0px 0px` for a fixed grid, and
eight tracks for the broken one too. A check that counted tracks would have read
the same number in both states and passed over the defect it was written for.
The distance from the last card's right edge to the grid's right edge is what a
reader actually sees, so that is what the harness returns.

### B. A pillarbox painted inside the element (`SpecRenderer`)

`.zone-item img` was `width: 100%` with a `max-height: 12rem` cap and
`object-fit: contain`, over a `--surface-0` background and a border. A portrait
photograph forced to the full track width and then clamped in height is
letterboxed **inside its own box**, so the background and border paint bars down
either side of the picture. Phone photographs are portrait, so this was the
common case rather than the edge one.

Both dimensions are automatic now (`width: auto; height: auto; max-width: 100%`)
and the cap is unchanged, with `align-self: flex-start` on the `.zone-shot`
anchor so the flex column's default stretch cannot re-inflate the box. The
border and the background are kept and still say where a picture ends against
the plate; they are drawn around the picture instead of around a box it never
filled. `object-fit: contain` is kept as the backstop it was -- with both
dimensions automatic it has nothing to do, and it is what stops a distortion if
either is ever pinned again.

Painted bar width at 1440 (frame content box minus fitted picture):

| hand-in | before | after |
| --- | --- | --- |
| 600x900 portrait | 161.3px (126.7px of picture in a 288px box) | 0px |
| 800x800 square | 98px | 0px |
| 200x150 diagram | 34.7px, and upscaled 1.27x | 0px, upscale 1.00 |
| 1200x675 landscape | 0px (it filled the box) | 0px |

**THE ANCHOR'S TAP FLOOR MOVED FROM THE TRACK TO ITSELF, and the old comment
said so without meaning to.** It read that the hit area is "9rem minimum column
width by up to 12rem tall, which clears the 44px floor by a wide margin" -- true
only because the picture was stretched. Shrunk to its content, a small hand-in
(a cropped detail, a screenshot of a dialogue) would have been a target the size
of the file. `min-width`/`min-height: 44px` states the floor on the anchor
instead, and costs nothing on screen: `.zone-shot` paints neither a background
nor a border, so reach beyond a small picture is hit area rather than blank.

### C. A stretched wrapper (`AttachmentList`, `SubmissionFileList`)

Both have the identical shape: a flex COLUMN row, a bordered preview wrapper
with a `--surface-2` ground, and an `img` inside at `width: auto` that shrinks
to its intrinsic size. The image shrank and the wrapper did not, so a tall image
left a bordered empty panel beside it.

**The repo already contained the fix and the measurement that found it**, in
`MarkdownText`'s print block: `align-self: flex-start`, recorded against a
1202x1202 square that measured 846x384 in the stretched box and 384x384 aligned
to the start. It had been applied to print only and never propagated. It is
propagated now, one declaration per component, each with its own reasoning
beside it rather than a cross-reference.

Bordered blank panel beside the picture, at 1440:

| file | before | after |
| --- | --- | --- |
| 600x900 portrait | 1171.3px (234.7px of picture in a 1406px frame) | 0px |
| 1200x675 landscape | 780.2px | 0px |
| 800x800 square | 1054px | 0px |
| 200x150 diagram | 1206px | 0px |

Identical figures for both components, which is the point of them being one
shape: at 375px the same four measured 106.3 / 0 / 0 / 141px before, 0px after.

### D. The opposite symptom -- an upscaled figure (`MarkdownText`)

`.md-figure img` was `width: 100%; height: auto`, which keeps the aspect ratio
in both directions and is therefore a FLOOR as well as a ceiling. It does not
letterbox; it blows a small diagram up to the column and renders it soft. Same
area, opposite defect, and plausibly what the instructor was actually looking
at.

Both dimensions automatic with `max-width: 100%` is the whole fix: the intrinsic
size wins until the column is narrower, and then the column does.
`align-self: flex-start` goes with it for the same flex-column reason as C.
`aspect-ratio` is still deliberately unset -- it would need a per-image value the
spec format does not carry, and getting it wrong crops.

Rendered width divided by intrinsic width:

| figure | 375px before / after | 1440px before / after |
| --- | --- | --- |
| 200x150 diagram | 1.71x / 1.00x | 3.67x / 1.00x |
| 600x900 portrait | 0.57x / 0.57x | 1.22x / 1.00x |
| 800x800 square | 0.43x / 0.43x | 0.92x / 0.92x |
| 1200x675 landscape | 0.28x / 0.28x | 0.61x / 0.61x |

Nothing that was being scaled DOWN changed, which is the shape a correct fix
here has: the column still wins whenever it is the smaller of the two.

**The print block lost three of its declarations and kept its reasoning.**
`align-self: flex-start`, `width: auto` and `height: auto` were stated there
because the screen rule's `width: 100%` overrode the 4in cap; the screen rule
carries all three now, so restating them under `@media print` would be a second
copy of one decision. The 4in cap is what that block adds, and the 846x384
measurement stays written down where it was found -- it is what the screen rule
was eventually fixed from.

### The harness, and two instrument defects found by using it

`/dev/classroom-images` mounts all five real components against four `data:` PNG
fixtures (600x900, 1200x675, 800x800, 200x150) and exposes `__imgBoxes()`,
`__imgGrids()` and `__imgVerdicts()` on `window`. The route spec at
`tools/browser-verify/routes/classroom-images.mjs` asserts the VERDICTS and
prints the raw table, so no measurement is ever retyped into a spec file.

The fixtures are **real PNG bytes and not an SVG standing in for one**: every
surface under test decides whether a row is an image from its filename
(`isImageFilename`, `isSubmissionFileImage`, `isImageAttachment`) and
`resolveFigureSrc` refuses SVG by name and by stored mime, so a fixture whose
bytes were SVG while its row claimed `image/png` would be a harness lying about
the exact thing these components branch on. Bytes reach the components through
`registerLocalSubmissionFileUrl` / `registerLocalAttachmentUrl`, which are the
components' own existing dev seams, so the real src builders and the real
`isImage*` predicates all run.

Two things the first draft of the instrument got wrong, both of which produced
plausible wrong numbers rather than errors:

- **It took the OUTERMOST painting ancestor as the frame**, which found
  `SpecRenderer`'s own module card -- a full-width panel that legitimately holds
  a heading and a counter beside the picture -- and charged its width to the
  image, reporting a zone thumbnail at frame 340px against an img of 290px. A
  card wider than the picture in it is not blank space. The nearest painting
  ancestor is the only box whose spare width is.
- **It compared border boxes**, so a bordered wrapper exactly filled by its
  picture reported 2px of blank, which would have forced a tolerance big enough
  to be doing the work. Both sides are content boxes now and the 1px tolerance
  is for sub-pixel rounding alone.

A third one was a genuine vacuous pass and is worth knowing about beyond this
bundle: **a module `SpecRenderer` considers COMPLETE collapses its own
Disclosure**, putting the zone grid at `display: none` and a zero box. The first
grid readings came back `cols: 1, voidW: 0` for every grid at every width, which
is exactly what a fixed grid looks like. The fixture's `minImages` is now higher
than any mount hands in, with the reason written beside it.

### Verification

- **`npx svelte-check`: 0 errors, 37 warnings**, unchanged from the baseline
  re-derived at the start of the session (`PUBLIC_SUPABASE_URL` /
  `PUBLIC_SUPABASE_ANON_KEY` exported before `svelte-kit sync`, per the
  no-`.env` rule).
- **`npm test`: 4330 passed, 3 failed**, all three in
  `tests/grant-surface.test.ts` and all three about `maps_*` tables from
  migrations 0161-0163 (the IDEA Maps lane). **Pre-existing and unrelated**: this
  bundle's diff contains no `.sql`, no `tests/`, no `$lib/server` and no
  `tests/db/` file, so that test's inputs are byte-identical to `origin/main`'s.
- **`npm run verify:browser`, full sweep: 60 route/width runs, 552 measurements,
  2 outside threshold**, both of them the pre-existing
  `tap-target [harness controls]` finding on `/dev/pathways` (harness furniture,
  not a component this bundle touches). The new route contributes 0 findings at
  both widths, including `horizontal-scroll` at 0px overflow
  (`scrollWidth === clientWidth`) at 375 and 1440, 0 console errors, and the
  refusal marker still rendering with no `img` for the figure whose file is not
  attached (5 figures, 4 images, 1 marker).
- **The grading console is covered**, since `SpecRenderer` is mounted `readonly`
  in the harness as well as editable and both report the same numbers.

**Mutation proof, twice, restored from a `cp` copy and never with
`git checkout --`:**

- Removing `align-self: flex-start` from `AttachmentList` reddened exactly the
  four `attach-*` blank rows. The four `submission-*` rows stayed green, which
  is the positive control: the check is per component, not a blanket. Restored,
  `md5 c2e72f899b9462f19bcbad5662b2dbdc` on both the file and the copy.
- Reverting `MyClasses` to `repeat(auto-fill, minmax(16rem, 1fr))` reddened
  exactly `my-classes void`, with the three fixed zone grids staying green.
  Restored, `md5 00198f28b581c34e8d4efa933777c4c2` on both. This is the run that
  printed the collapsed `0px` tracks quoted under A.

Both mutations moved a measurement by hundreds of pixels, which is what says the
1px tolerance cannot be hiding one.

### Not verified

- **No live Supabase, no signed-in session and no real upload.** The harness
  serves `data:` PNGs through the components' own local-URL seams; a real
  storage-backed hand-in arrives through a proxy 302 to a signed URL, which
  nothing here exercises. The geometry under test is downstream of the bytes and
  identical either way, but the fetch path is not covered.
- **No Vercel preview.** Deployment was rate limited for the day, so nothing was
  opened on a preview URL.
- **`prefers-reduced-motion` is `no-preference` in the harness** and web fonts do
  not load (the harness blocks every non-loopback request), so all type is
  measured in the fallback stack. Neither affects a box measured from an image's
  intrinsic size.
- **Print output was not rendered.** `MarkdownText`'s print block was edited to
  drop three declarations the screen rule now carries; that they still resolve to
  the same values is a cascade argument, not a measurement.

### Deliberately not done

- No change to which image types are accepted, to `resolveFigureSrc`, or to any
  refusal path. External images and SVG are still refused, the refusal
  placeholder renders as it did, and instructor and student still get
  byte-identical figure output (there is one component and no role branch in it).
- No author-side sizing or placement syntax in the figure format. That is a spec
  schema change and belongs in its own bundle.
- `ItemDetail.svelte`, `ClassView.svelte`, `classroom.css`, `src/app.css` and
  `src/lib/design-system/` were owned by other lanes running at the same time
  and were not touched. Nothing in this bundle needed them.
