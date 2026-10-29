# `tools/browser-verify` -- the repeatable visual pass

Every session in this repo for several days ended by reporting that no browser
was available and the visual pass was skipped, while `CLAUDE.md` cites Chromium
measurements as established fact. Both cannot be true. This is the instrument
that settles it: a session either runs this and reports numbers, or names
precisely what stopped it.

```bash
npm run verify:browser                  # both widths, every listed dev route
npm run verify:browser -- --probe       # what this container's browser can do
npm run verify:browser -- --selftest    # negative controls; exits 1 if a check is broken
npm run verify:browser -- --route pathways --width 375
npm run verify:browser -- --break tiny-taps --route spec-table
npm run verify:browser -- --break motion --route marks
npm run verify:browser -- --json out.json --verbose
```

## Counts on this tree

The numbers below are GENERATED. The section that used to carry them by hand
was wrong on every tree checked on 2026-08-31, because a file cannot be right
by hand about a number the harness computes on every run. `readme-counts.mjs`
is the only writer. Quote the block, never a number from prose, and if prose
elsewhere in this file carries a count, the block wins.

**There are TWO regions, with two costs and two freshness rules**, and the
split is what stops this file serialising every branch. **BOTH ARE A TREE
READ NOW**: since prompt 0168 the measurement itself lives in
[`measured/`](measured/), one committed file per route spec, and the measured
table is the sum over that directory -- so `npm run verify:counts` writes both
regions in under a second, and the browser is needed only to TAKE a
measurement, never to render one.

| | Static | Measured |
| --- | --- | --- |
| Derived from | `routes/*.mjs` and `src/routes/dev` | `measured/*.json`, one file per route spec |
| Rendered by | `npm run verify:counts` | `npm run verify:counts` -- the same tree read |
| Filled by | nothing; it is a directory listing | `npm run verify:readme`, a browser and ~17 minutes for the whole tree, seconds for one spec |
| Rendering costs | a tree read, under a second | a tree read, under a second |
| Run `verify:readme` after | never; it does not write this | a deliberate visual pass, or adding a route spec |
| Checked against | **this tree, on every `npm test`** | **`measured/`, on every `npm test`**, plus the tree's SPEC FILE LIST |
| Carries a date and a sha | no, on purpose | yes, per measurement file |

`npm run verify:counts -- --check` exits non-zero when either region disagrees
with the tree; `npm run verify:readme -- --check` runs the harness and exits
non-zero when either region disagrees with a fresh run.
`tests/derived-numbers.test.ts` reddens when a route spec landed without
regenerating, when the block and `measured/` disagree, and when a digit in
either table was edited by hand -- with no browser anywhere in that path.

**MEASURING ONE SPEC IS A FIRST-CLASS OPERATION, AND IT IS WHAT A BUNDLE THAT
ADDED A ROUTE SPEC RUNS:**

```bash
npm run verify:readme -- --route <your spec>    # seconds, one file written
```

It writes that spec's file and leaves all 193 others exactly as they were.
Before 0168 the narrowest thing that could write the measured half was a full
pass over every route -- the writer threw on anything less -- so adding one
spec cost about seventeen minutes of browser time to record a number about one
route.

**THE MEASURED HALF IS ALLOWED TO BE STALE, AND SINCE PROMPT 0046 IT IS NOT
ALLOWED TO BE STALE AND SAY NOTHING IS THERE.** Those are different things and
this file used to conflate them. Staleness is the price of keeping a
seventeen-minute browser run out of `npm test`, and it is fine right up to the
moment the block
prints `Measurements outside threshold: 0` for a route the run never visited --
at which point the one generated place a reader consults is telling them a
finding does not exist. That happened: the spec measuring the classroom spec
table's four row-action glyphs landed at `700a56d`, `origin/main`'s block was
measured at `4dc9df8`, which predates it, and the finding was invisible in this
file for a day while sitting in a code comment, a route file's prose and a
ledger entry.

So the measured region records `covered`: the route spec files that have a
measurement under `measured/`. It is derived from that directory and is
therefore a second copy of a directory listing, kept deliberately, because
`tools/idea-status.py` prints this block out of `origin/main` with no access
to the repository's own files -- a block that dropped `covered` would lose the
one fact that tool needs to say which routes the numbers are about.

* **A reader compares two rows.** `Route specs measured`, in the
  measured table, against `Route specs`, in the static table directly above
  it. The static region is checked against this tree on every `npm test`, so it
  is the fresh number; if the two differ, every figure in the measured table --
  the outside-threshold count included -- is a figure about a different set of
  routes.
* **The recorded commit is a WEAK signal and must not be read as the freshness
  answer.** On a history this merge-heavy a stale measurement's commit is still
  an ancestor of HEAD and reads as perfectly plausible. `4dc9df8` was.
* **`npm test` refuses one pair and only one:** unmeasured specs AND a block
  claiming zero findings. It names the specs. It does not refuse a stale block
  that already names findings, a spec file edited without renaming, or a spec
  deleted since the measurement -- `verifyMeasured` in `readme-counts.mjs`
  enumerates each and says why, and `tests/derived-numbers.test.ts` carries a
  control for each.
* **`npm run verify:counts` says so too**, because that sub-second command is
  what a bundle that just added a spec runs, and that is the moment the measured
  half goes stale. It cannot fix it -- a spec with no measurement file has never
  been measured and no tree read can invent one -- so it names the specs and
  prints the `verify:readme -- --route ...` line that measures exactly those.

**WHY IT IS SPLIT, AND WHY THE STATIC REGION CARRIES NO TIMESTAMP.** It was one
region written by one all-or-nothing run: the generator demanded a measured
report before it would write anything, so moving a count that is a directory
listing and an array length cost a six-minute browser run. On 2026-09-03 five
finished, CI-green branches all failed to merge, every one of them on this
file, and every one of those conflicts was strictly inside the markers. Each
had regenerated the single block against its own tree; each wrote a different
date, a different sha and different numbers into the same lines. Unpicking it
took a bundle of its own.

Because the static region is a pure function of the tree -- no clock, no
commit -- regenerating it on a tree whose counts have not moved produces **no
diff at all**, and regenerating it on a merged tree produces the merged tree's
own answer whatever either side had written. So a conflict here is resolved by
running one sub-second command, never by choosing a side and never by finding a
browser:

```bash
npm run verify:counts     # on the merged tree, then commit
```

**AND SINCE PROMPT 0168 THAT SENTENCE IS TRUE OF BOTH HALVES, BECAUSE THE
MEASUREMENT IS A DIRECTORY.** The 2026-09-03 split fixed the STATIC half's
share of the problem and left the measured half as a single shared write
point, which went on losing races: on 2026-09-11 it went stale at least four
times in one day, and two sessions each spent a ~17-minute browser pass on the
same staleness, one of which was discarded as redundant when another lane
landed an equivalent pass mid-run.

It failed in the shape nothing warns about -- **green parents, red merge** --
and `integration` takes no push-triggered CI run, so nobody saw it until a
landing bundle dispatched one by hand. Two lanes each add a route spec:

* **Neither re-measures.** Both regenerate the static region correctly for
  their own tree, both write `195`, git takes the identical edit on both sides
  with no conflict at all, and the merged tree holds `196`. Reproduced on
  `ebf23dc`: 196 spec files on disk under a region claiming 195.
* **Both re-measure.** The date, the sha and the covered list differ, the one
  line conflicts, and `integrate.yml`'s resolver takes the TARGET's side inside
  the markers -- which throws one lane's seventeen minutes away. Ledger 0147
  named this: `integration` sat at a measurement claiming zero outside
  threshold over a set missing first one spec and then two.

So the measurement is `measured/<spec file>.json`, keyed on the filename
`routes.mjs` already derives from a spec's own `path` and already refuses to
let two specs share. Two lanes measuring two different specs write two
different files and share no line, so the merge is **additive** and the merged
store describes the merged tree by construction. The rendered block is a pure
function of that directory, so the sub-second command above now resolves both
halves, and `tests/derived-numbers.test.ts` reddens when the block and the
directory disagree.

**WHAT THAT DOES NOT FIX, stated here rather than discovered later.** The
rendered block is still ONE region and is still behind on the merged tree
until somebody regenerates it. What changed is the cost and the loudness: the
fix is a tree read rather than a browser pass, nobody's measurement is thrown
away to get it, and `npm test` says so on the branch instead of the block
quietly describing a set that is not this tree's. `integrate.yml`'s
`counts_refresh` already runs `readme-counts.mjs --static` on every merged
tree, which now rewrites both halves -- but it commits only when the STATIC
data line also moved, so a merge that moved only the measurement leaves the
block behind until the next branch's CI says so. Closing that is a change to
`integrate.yml`, which this directory does not own.

<!-- counts:begin -->

### Static -- derived from this tree

<!-- counts:static:begin -->
**Generated by `npm run verify:counts`; do not edit by hand.** Derived from this tree alone: no browser, no dev server, under a second. Rerun it after adding or removing a route spec or a `/dev` page, and after resolving a merge that touched this region. It carries no date and no commit on purpose, so an unchanged tree regenerates to the same bytes. `tests/derived-numbers.test.ts` reddens when it disagrees with the tree.

| Count | Value |
| --- | --- |
| Route specs (`routes/*.mjs`, `_`-prefixed excluded) | 853 |
| Distinct routes those specs drive (alias-resolved, query string stripped) | 190 |
| Directories under `src/routes/dev` with a page (the candidate set) | 212 |
| Widths | 3 (375, 1152, 1440) |
| Route/width runs a full pass makes (specs x widths) | 2559 |

<!-- counts:static:data {"schema":1,"specs":853,"routes":190,"devPages":212,"widths":[375,1152,1440],"runs":2559} -->
<!-- counts:static:end -->

### Measured -- summed from `measured/`, one file per route spec

<!-- counts:measured:begin -->
**Generated by `npm run verify:counts` from `measured/`; do not edit by hand.** Every route spec carries its OWN measurement file there, written by `npm run verify:readme` -- which needs a browser and about seventeen minutes for the whole tree, and seconds for one spec with `-- --route <spec>`. This table is the sum over those files, so it is a tree read like the static region above and costs nothing to regenerate on a merged tree. The newest measurement here was taken on commit `bf560a7` (a working tree was dirty at measurement); measurements were taken at 2026-10-30T06:01:45.910Z. A stale-but-honest measured half is a supported state.

**Is this measured against this tree? Compare `Route specs measured` below against `Route specs` in the static region above.** If they differ, every number here -- the outside-threshold count included -- was measured over a different set of routes than this tree has, and a zero is a zero for that set and not for this one. The commit is recorded too, but on its own it is a WEAK signal: a stale measurement's commit is still an ancestor of HEAD and reads as perfectly plausible. `tests/derived-numbers.test.ts` names the unmeasured specs.

| Count | Value |
| --- | --- |
| Route specs measured (one file each under `measured/`) | 853 |
| Route/width runs those measurements cover | 2559 |
| Measurements | 52245 |
| Measurements outside threshold | 1077 |
| Wall clock, summed from each spec's attributed share | 12384.7s |
| `--selftest` controls | 124 (63 negative, 61 positive), 0 instrument failure(s) |

Measurements outside threshold, by the spec whose file records them:

- `/dev/armory?state=many-out` @1152 `prepare-eval` () => document.documentElement.scrollHeight
- `/dev/armory?state=projects-connected&theme=space-white` @375 `control-floor`
- `/dev/armory?state=projects-connected&theme=space-white` @1152 `control-floor`
- `/dev/armory?state=projects-connected&theme=space-white` @1440 `control-floor`
- `/dev/armory` @375 `control-floor`
- `/dev/armory` @1152 `control-floor`
- `/dev/armory` @1440 `control-floor`
- `/dev/calendar?view=month` @375 `tap-target` a layer key
- `/dev/calendar?view=month` @375 `presence` the seven layer keys
- `/dev/calendar?view=month` @375 `presence` every layer on by default
- `/dev/class-header?pattern=rays` @375 `order-result` the rays flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?pattern=rays` @1152 `order-result` the rays flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?pattern=rays` @1440 `order-result` the rays flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?pattern=rings` @375 `order-result` the rings flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?pattern=rings` @1152 `order-result` the rings flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?pattern=rings` @1440 `order-result` the rings flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?pattern=stripes` @375 `order-result` the stripes flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?pattern=stripes` @375 `motion` the stripes flow, gated behind no-preference
- `/dev/class-header?pattern=stripes` @1152 `order-result` the stripes flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?pattern=stripes` @1440 `order-result` the stripes flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner
- `/dev/class-header?role=teacher&posts=0&compose=1` @1440 `order-result` one create, two uploads land, the refused file stays, and Attach the rest goes to the same notice
- `/dev/class-header?view=class&role=teacher` @375 `order-result` a teacher's three posting keys on one line
- `/dev/classroom-images?open=each` @375 `prepare-wait` () => document.documentElement.hasAttribute("data-fixtures-r
- `/dev/classroom-images?open=each` @1152 `prepare-wait` () => document.documentElement.hasAttribute("data-fixtures-r
- `/dev/classroom-images?open=each` @1440 `prepare-wait` () => document.documentElement.hasAttribute("data-fixtures-r
- `/dev/classroom-images` @375 `prepare-wait` () => document.documentElement.hasAttribute("data-fixtures-r
- `/dev/classroom-images` @1152 `prepare-wait` () => document.documentElement.hasAttribute("data-fixtures-r
- `/dev/classroom-images` @1440 `prepare-wait` () => document.documentElement.hasAttribute("data-fixtures-r
- `/dev/classroom-inspector?case=assignment&open=1` @375 `contrast` group heading, content and work
- `/dev/classroom-inspector?case=assignment&open=1` @375 `contrast` group heading, this post
- `/dev/classroom-inspector?case=assignment&open=1` @375 `presence` group: content and work
- `/dev/classroom-inspector?case=assignment&open=1` @375 `presence` group: instructor only
- `/dev/classroom-inspector?case=assignment&open=1` @375 `presence` group: this post
- `/dev/classroom-inspector?case=assignment&open=1` @1152 `contrast` group heading, content and work
- `/dev/classroom-inspector?case=assignment&open=1` @1152 `contrast` group heading, this post
- `/dev/classroom-inspector?case=assignment&open=1` @1152 `presence` group: content and work
- `/dev/classroom-inspector?case=assignment&open=1` @1152 `presence` group: instructor only
- `/dev/classroom-inspector?case=assignment&open=1` @1152 `presence` group: this post
- `/dev/classroom-inspector?case=assignment&open=1` @1152 `order-result` empty groups / total groups
- `/dev/classroom-inspector?case=assignment&open=1` @1152 `order-result` every block carries a label (heading or disclosure trigger)
- `/dev/classroom-inspector?case=assignment&open=1` @1440 `contrast` group heading, content and work
- `/dev/classroom-inspector?case=assignment&open=1` @1440 `contrast` group heading, this post
- `/dev/classroom-inspector?case=assignment&open=1` @1440 `presence` group: content and work
- `/dev/classroom-inspector?case=assignment&open=1` @1440 `presence` group: instructor only
- `/dev/classroom-inspector?case=assignment&open=1` @1440 `presence` group: this post
- `/dev/classroom-inspector?case=assignment&open=1` @1440 `order-result` empty groups / total groups
- `/dev/classroom-inspector?case=assignment&open=1` @1440 `order-result` every block carries a label (heading or disclosure trigger)
- `/dev/classroom-inspector?case=sparse&open=1` @375 `presence` group: this post
- `/dev/classroom-inspector?case=sparse&open=1` @375 `order-result` groups rendered / blocks in them
- `/dev/classroom-inspector?case=sparse&open=1` @1152 `presence` group: this post
- `/dev/classroom-inspector?case=sparse&open=1` @1152 `order-result` groups rendered / blocks in them
- `/dev/classroom-inspector?case=sparse&open=1` @1440 `presence` group: this post
- `/dev/classroom-inspector?case=sparse&open=1` @1440 `order-result` groups rendered / blocks in them
- `/dev/classroom-live?idle=overnight` @375 `order-result` a student on the page who last typed yesterday
- `/dev/classroom-live?idle=overnight` @375 `order-result` the same, in another tab
- `/dev/classroom-live?idle=overnight` @375 `order-result` no detail prints three or more digits of minutes, and same-day idle rows still read in minutes
- `/dev/classroom-live?idle=overnight` @1152 `order-result` a student on the page who last typed yesterday
- `/dev/classroom-live?idle=overnight` @1152 `order-result` the same, in another tab
- `/dev/classroom-live?idle=overnight` @1152 `order-result` no detail prints three or more digits of minutes, and same-day idle rows still read in minutes
- `/dev/classroom-live?idle=overnight` @1440 `order-result` a student on the page who last typed yesterday
- `/dev/classroom-live?idle=overnight` @1440 `order-result` the same, in another tab
- `/dev/classroom-live?idle=overnight` @1440 `order-result` no detail prints three or more digits of minutes, and same-day idle rows still read in minutes
- `/dev/classroom-live?theme=space-white` @375 `order-result` the same groups under the white theme
- `/dev/classroom-live?theme=space-white` @1152 `order-result` the same groups under the white theme
- `/dev/classroom-live?theme=space-white` @1440 `order-result` the same groups under the white theme
- `/dev/classroom-live?wall=toggles` @375 `order-result` the state line says what the wall shows, in counts
- `/dev/classroom-live?wall=toggles` @1152 `order-result` the state line says what the wall shows, in counts
- `/dev/classroom-live?wall=toggles` @1440 `order-result` the state line says what the wall shows, in counts
- `/dev/classroom-live` @375 `order-result` the groups, in the order a teacher acts on them, with their counts
- `/dev/classroom-live` @1152 `order-result` the groups, in the order a teacher acts on them, with their counts
- `/dev/classroom-live` @1440 `order-result` the groups, in the order a teacher acts on them, with their counts
- `/dev/classroom-palette/s-1?manage=0&state=progress` @375 `presence` with a mark beside the word
- `/dev/classroom-palette/s-1?manage=0&state=progress` @375 `presence` marks: the missing row and the two finished ones
- `/dev/classroom-palette/s-1?manage=0&state=progress` @1152 `presence` with a mark beside the word
- `/dev/classroom-palette/s-1?manage=0&state=progress` @1152 `presence` marks: the missing row and the two finished ones
- `/dev/classroom-palette/s-1?manage=0&state=progress` @1440 `presence` with a mark beside the word
- `/dev/classroom-palette/s-1?manage=0&state=progress` @1440 `presence` marks: the missing row and the two finished ones
- `/dev/classroom-palette/s-1?manage=1&state=palette-at` @375 `text-contains` the row is a name and a door, never an address
- `/dev/classroom-palette/s-1?manage=1&state=palette-at` @1152 `text-contains` the row is a name and a door, never an address
- `/dev/classroom-palette/s-1?manage=1&state=palette-at` @1440 `text-contains` the row is a name and a door, never an address
- `/dev/classroom-palette/s-1?manage=1&state=settings` @375 `order-result` density on the device, the class view and the tour offer on the account, homepage untouched
- `/dev/classroom-palette/s-1?manage=1&state=settings` @1152 `order-result` density on the device, the class view and the tour offer on the account, homepage untouched
- `/dev/classroom-palette/s-1?manage=1&state=settings` @1440 `order-result` density on the device, the class view and the tour offer on the account, homepage untouched
- `/dev/classroom-projector?demo=counts` @375 `order-result` five counts in order, and no names
- `/dev/classroom-projector?demo=counts` @1152 `order-result` five counts in order, and no names
- `/dev/classroom-projector?demo=counts` @1152 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-projector?demo=counts` @1440 `order-result` five counts in order, and no names
- `/dev/classroom-projector?demo=full&theme=matrix` @1152 `contrast` names
- `/dev/classroom-projector?demo=full&theme=matrix` @1152 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-projector?demo=full&theme=matrix` @1440 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-projector?demo=full&theme=space-white` @1152 `contrast` names (washed)
- `/dev/classroom-projector?demo=full&theme=space-white` @1152 `contrast` group words, muted (washed)
- `/dev/classroom-projector?demo=full&theme=space-white` @1152 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-projector?demo=full&theme=space-white` @1440 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-projector?demo=full` @1152 `contrast` names
- `/dev/classroom-projector?demo=full` @1152 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-projector?demo=full` @1440 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-projector?demo=names` @375 `order-result` counts, then names per group, never under Working
- `/dev/classroom-projector?demo=names` @375 `order-result` the working students and the student on the hall pass are named nowhere on the wall, and no address appears
- `/dev/classroom-projector?demo=names` @1152 `prepare-wait` () => !!document.querySelector('[data-testid="projector-name
- `/dev/classroom-projector?demo=names` @1152 `contrast` names
- `/dev/classroom-projector?demo=names` @1152 `contrast` group words
- `/dev/classroom-projector?demo=names` @1152 `presence` four named groups
- `/dev/classroom-projector?demo=names` @1152 `order-result` counts, then names per group, never under Working
- `/dev/classroom-projector?demo=names` @1152 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-projector?demo=names` @1440 `order-result` counts, then names per group, never under Working
- `/dev/classroom-projector?demo=names` @1440 `order-result` the working students and the student on the hall pass are named nowhere on the wall, and no address appears
- `/dev/classroom-projector?demo=names` @1440 `order-result` 8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)
- `/dev/classroom-split/s-1/item/i-crowded?manage=1&sweep=fit` @375 `control-fit` an item open beside the class list: every control
- `/dev/classroom-split/s-1/item/i-crowded?manage=1&sweep=fit` @1152 `control-fit` an item open beside the class list: every control
- `/dev/classroom-split/s-1/item/i-crowded?manage=1&sweep=fit` @1440 `control-fit` an item open beside the class list: every control
- `/dev/classroom-split/s-1?manage=1&state=page-drop` @375 `order-result` dragging a file over the page: the words are on screen, and the page does not move
- `/dev/classroom-split/s-1?manage=1&state=page-drop` @1152 `order-result` dragging a file over the page: the words are on screen, and the page does not move
- `/dev/classroom-split/s-1?manage=1&state=page-drop` @1440 `order-result` dragging a file over the page: the words are on screen, and the page does not move
- `/dev/classroom-standing` @375 `presence` a mark beside the missing check-in word
- `/dev/classroom-standing` @1152 `presence` a mark beside the missing check-in word
- `/dev/classroom-standing` @1440 `presence` a mark beside the missing check-in word
- `/dev/classroom-student?attention=1&checkins=1` @375 `order-result` the assignment's date and the check-in's in one column
- `/dev/classroom-student?attention=1&checkins=1` @1152 `order-result` the assignment's date and the check-in's in one column
- `/dev/classroom-student` @375 `order-result` every Needs attention date, assignments and check-ins alike, in one column (polish round C)
- `/dev/classroom-tools?open=hall-pass` @375 `contrast` the usage line
- `/dev/classroom-tools?open=hall-pass` @1152 `contrast` the usage line
- `/dev/classroom-tools?open=hall-pass` @1440 `contrast` the usage line
- `/dev/classroom-tour/s-1/item/i-missing?manage=0&tour=offered` @375 `order-result` the keys move and clamp the list and Enter resets it (above 1024px; below it there is no separator); the buttons step, floor and reset; the width stays on this device
- `/dev/classroom-tour/s-1/item/i-missing?manage=0&tour=offered` @1152 `order-result` the keys move and clamp the list and Enter resets it (above 1024px; below it there is no separator); the buttons step, floor and reset; the width stays on this device
- `/dev/classroom-tour/s-1/item/i-missing?manage=0&tour=offered` @1440 `order-result` the keys move and clamp the list and Enter resets it (above 1024px; below it there is no separator); the buttons step, floor and reset; the width stays on this device
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `contrast` step title
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `contrast` step words
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `contrast` step count
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `contrast` Skip tour
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `contrast` Next / Done
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `contrast` close
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `tap-target` the callout controls
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `presence` the callout, on its last step
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @375 `order-result` every step: target present, on screen, clear of the callout; at least 6 steps
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `contrast` step title
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `contrast` step words
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `contrast` step count
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `contrast` Skip tour
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `contrast` Next / Done
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `contrast` close
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `tap-target` the callout controls
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `presence` the callout, on its last step
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1152 `order-result` every step: target present, on screen, clear of the callout; at least 6 steps
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `contrast` step title
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `contrast` step words
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `contrast` step count
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `contrast` Skip tour
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `contrast` Next / Done
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `contrast` close
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `tap-target` the callout controls
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `presence` the callout, on its last step
- `/dev/classroom-tour/s-1?manage=1&state=walk-space-white` @1440 `order-result` every step: target present, on screen, clear of the callout; at least 6 steps
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `contrast` step title
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `contrast` step words
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `contrast` step count
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `contrast` Skip tour
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `contrast` Next / Done
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `contrast` close
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `tap-target` the callout controls
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `presence` the callout, on its last step
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `order-result` every step: target present, on screen, clear of the callout; at least 6 steps
- `/dev/classroom-tour/s-1?manage=1&state=walk` @375 `order-result` Escape: closed, handled, dismissed (not finished), focus on a header control
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `contrast` step title
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `contrast` step words
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `contrast` step count
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `contrast` Skip tour
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `contrast` Next / Done
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `contrast` close
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `tap-target` the callout controls
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `presence` the callout, on its last step
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `order-result` every step: target present, on screen, clear of the callout; at least 6 steps
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1152 `order-result` Escape: closed, handled, dismissed (not finished), focus on a header control
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `contrast` step title
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `contrast` step words
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `contrast` step count
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `contrast` Skip tour
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `contrast` Next / Done
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `contrast` close
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `tap-target` the callout controls
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `presence` the callout, on its last step
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `order-result` every step: target present, on screen, clear of the callout; at least 6 steps
- `/dev/classroom-tour/s-1?manage=1&state=walk` @1440 `order-result` Escape: closed, handled, dismissed (not finished), focus on a header control
- `/dev/classroom-tour/s-1?manage=1&tour=finished&state=settings` @375 `order-result` Reset on the tour asks for the offer again: it appears and is recorded as offered
- `/dev/classroom-tour/s-1?manage=1&tour=finished&state=settings` @1152 `order-result` Reset on the tour asks for the offer again: it appears and is recorded as offered
- `/dev/classroom-tour/s-1?manage=1&tour=finished&state=settings` @1440 `order-result` Reset on the tour asks for the offer again: it appears and is recorded as offered
- `/dev/classroom-tour/s-1?manage=1` @375 `prepare-wait` () => window.__tourProbe().tours.teacher === 'offered' && wi
- `/dev/classroom-tour/s-1?manage=1` @375 `contrast` offer words
- `/dev/classroom-tour/s-1?manage=1` @375 `contrast` offer buttons
- `/dev/classroom-tour/s-1?manage=1` @375 `tap-target` offer buttons
- `/dev/classroom-tour/s-1?manage=1` @375 `presence` the teacher's offer
- `/dev/classroom-tour/s-1?manage=1` @375 `text-contains` the offer is a question and two answers
- `/dev/classroom-tour/s-1?manage=1` @375 `order-result` offered at once, only the teacher tour, homepage untouched, "Take the tour" live
- `/dev/classroom-tour/s-1?manage=1` @375 `order-result` Escape on the offer: gone, not prevented elsewhere, dismissed, focus on a header control
- `/dev/classroom-tour/s-1?manage=1` @1152 `prepare-wait` () => window.__tourProbe().tours.teacher === 'offered' && wi
- `/dev/classroom-tour/s-1?manage=1` @1152 `contrast` offer words
- `/dev/classroom-tour/s-1?manage=1` @1152 `contrast` offer buttons
- `/dev/classroom-tour/s-1?manage=1` @1152 `tap-target` offer buttons
- `/dev/classroom-tour/s-1?manage=1` @1152 `presence` the teacher's offer
- `/dev/classroom-tour/s-1?manage=1` @1152 `text-contains` the offer is a question and two answers
- `/dev/classroom-tour/s-1?manage=1` @1152 `order-result` offered at once, only the teacher tour, homepage untouched, "Take the tour" live
- `/dev/classroom-tour/s-1?manage=1` @1152 `order-result` Escape on the offer: gone, not prevented elsewhere, dismissed, focus on a header control
- `/dev/classroom-tour/s-1?manage=1` @1440 `prepare-wait` () => window.__tourProbe().tours.teacher === 'offered' && wi
- `/dev/classroom-tour/s-1?manage=1` @1440 `contrast` offer words
- `/dev/classroom-tour/s-1?manage=1` @1440 `contrast` offer buttons
- `/dev/classroom-tour/s-1?manage=1` @1440 `tap-target` offer buttons
- `/dev/classroom-tour/s-1?manage=1` @1440 `presence` the teacher's offer
- `/dev/classroom-tour/s-1?manage=1` @1440 `text-contains` the offer is a question and two answers
- `/dev/classroom-tour/s-1?manage=1` @1440 `order-result` offered at once, only the teacher tour, homepage untouched, "Take the tour" live
- `/dev/classroom-tour/s-1?manage=1` @1440 `order-result` Escape on the offer: gone, not prevented elsewhere, dismissed, focus on a header control
- `/dev/code-census` @375 `contrast` the Added / Removed column header
- `/dev/code-census` @375 `contrast` an update's subject
- `/dev/code-census` @375 `contrast` its date
- `/dev/code-census` @375 `contrast` lines added (green)
- `/dev/code-census` @375 `contrast` lines removed (the warning ink, never crimson)
- `/dev/code-census` @375 `presence` the six newest updates that changed the code
- `/dev/code-census` @375 `presence` a + and a minus glyph on every row
- `/dev/code-census` @375 `presence` the column header over the figures
- `/dev/code-census` @375 `presence` no "this build did not count" sentence on a full clone
- `/dev/code-census` @375 `text-contains` the panel states what is counted and what is not
- `/dev/code-census` @375 `order-result` every axis accounts for the whole census
- `/dev/code-census` @375 `order-result` the added and removed figures line up down the list, each with its sign
- `/dev/code-census` @1152 `contrast` the Added / Removed column header
- `/dev/code-census` @1152 `contrast` an update's subject
- `/dev/code-census` @1152 `contrast` its date
- `/dev/code-census` @1152 `contrast` lines added (green)
- `/dev/code-census` @1152 `contrast` lines removed (the warning ink, never crimson)
- `/dev/code-census` @1152 `presence` the six newest updates that changed the code
- `/dev/code-census` @1152 `presence` a + and a minus glyph on every row
- `/dev/code-census` @1152 `presence` the column header over the figures
- `/dev/code-census` @1152 `presence` no "this build did not count" sentence on a full clone
- `/dev/code-census` @1152 `text-contains` the panel states what is counted and what is not
- `/dev/code-census` @1152 `order-result` every axis accounts for the whole census
- `/dev/code-census` @1152 `order-result` the added and removed figures line up down the list, each with its sign
- `/dev/code-census` @1440 `contrast` the Added / Removed column header
- `/dev/code-census` @1440 `contrast` an update's subject
- `/dev/code-census` @1440 `contrast` its date
- `/dev/code-census` @1440 `contrast` lines added (green)
- `/dev/code-census` @1440 `contrast` lines removed (the warning ink, never crimson)
- `/dev/code-census` @1440 `presence` the six newest updates that changed the code
- `/dev/code-census` @1440 `presence` a + and a minus glyph on every row
- `/dev/code-census` @1440 `presence` the column header over the figures
- `/dev/code-census` @1440 `presence` no "this build did not count" sentence on a full clone
- `/dev/code-census` @1440 `text-contains` the panel states what is counted and what is not
- `/dev/code-census` @1440 `order-result` every axis accounts for the whole census
- `/dev/code-census` @1440 `order-result` the added and removed figures line up down the list, each with its sign
- `/dev/coin-desk-area-economy` @1152 `order-result` the price list USES that width, in columns, and collapses to one on a phone
- `/dev/feedback?view=armory` @375 `type-floor`
- `/dev/feedback?view=armory` @1152 `type-floor`
- `/dev/feedback?view=armory` @1440 `type-floor`
- `/dev/feedback?view=incidents` @375 `order-result` the person and the project filters narrow, and clearing them widens back
- `/dev/feedback?view=incidents` @375 `type-floor`
- `/dev/feedback?view=incidents` @1152 `order-result` the person and the project filters narrow, and clearing them widens back
- `/dev/feedback?view=incidents` @1152 `type-floor`
- `/dev/feedback?view=incidents` @1440 `order-result` the person and the project filters narrow, and clearing them widens back
- `/dev/feedback?view=incidents` @1440 `type-floor`
- `/dev/foundry-author` @375 `contrast` author name
- `/dev/foundry-author` @1152 `contrast` author name
- `/dev/foundry-author` @1440 `contrast` author name
- `/dev/foundry-forge` @375 `contrast` FoundryMine download control
- `/dev/foundry-forge` @375 `tap-target` FoundryMine download control
- `/dev/foundry-forge` @375 `presence` per-version download controls (ember-clock, 5 versions)
- `/dev/foundry-forge` @1152 `contrast` FoundryMine download control
- `/dev/foundry-forge` @1152 `tap-target` FoundryMine download control
- `/dev/foundry-forge` @1152 `presence` per-version download controls (ember-clock, 5 versions)
- `/dev/foundry-forge` @1440 `contrast` FoundryMine download control
- `/dev/foundry-forge` @1440 `tap-target` FoundryMine download control
- `/dev/foundry-forge` @1440 `presence` per-version download controls (ember-clock, 5 versions)
- `/dev/foundry-gallery?state=detail-stats` @1152 `order-result` the figure grids spread with the pane: 2 columns at 375, 4 at 1440
- `/dev/foundry-room?surface=review` @1440 `order-result` the queue has its room: at least 60% of the window above the breakpoint, the document below it
- `/dev/frc?state=reviewer` @1152 `order-result` view-as-student hides the tab and strip, shows the banner, and toggles back clean
- `/dev/frc?state=reviewer` @1440 `tap-target` view-as toggle
- `/dev/gauntlet-shell-countdown` @375 `presence` the numeral currently on screen
- `/dev/gauntlet-shell-countdown` @1152 `presence` the numeral currently on screen
- `/dev/gauntlet-shell-countdown` @1440 `presence` the numeral currently on screen
- `/dev/grading-rubric?speech=hold&field=crit` @375 `order-result` the mirror sits exactly over the criterion note
- `/dev/greenline-portal?view=moderation` @375 `contrast` empty-queue lead line
- `/dev/greenline-portal?view=moderation` @375 `contrast` empty decal-queue lead line
- `/dev/greenline-portal?view=moderation` @375 `contrast` empty decal-queue sentence
- `/dev/greenline-portal?view=moderation` @375 `contrast` the count line
- `/dev/greenline-portal?view=moderation` @375 `tap-target` queue sort controls
- `/dev/greenline-portal?view=moderation` @375 `presence` track queue says it is empty, deliberately
- `/dev/greenline-portal?view=moderation` @375 `presence` and leads with the sentence, not a fragment
- `/dev/greenline-portal?view=moderation` @375 `presence` decal queue says it is empty, deliberately
- `/dev/greenline-portal?view=moderation` @375 `presence` and leads with the sentence too
- `/dev/greenline-portal?view=moderation` @375 `presence` tracks section heading
- `/dev/greenline-portal?view=moderation` @375 `presence` decals section heading
- `/dev/greenline-portal?view=moderation` @375 `text-contains` the count line, which must read at zero as well
- `/dev/greenline-portal?view=moderation` @375 `text-contains` the decal empty sentence says what approval is FOR
- `/dev/greenline-portal?view=moderation` @1152 `contrast` empty-queue lead line
- `/dev/greenline-portal?view=moderation` @1152 `contrast` empty decal-queue lead line
- `/dev/greenline-portal?view=moderation` @1152 `contrast` empty decal-queue sentence
- `/dev/greenline-portal?view=moderation` @1152 `contrast` the count line
- `/dev/greenline-portal?view=moderation` @1440 `contrast` empty-queue lead line
- `/dev/greenline-portal?view=moderation` @1440 `contrast` empty decal-queue lead line
- `/dev/greenline-portal?view=moderation` @1440 `contrast` empty decal-queue sentence
- `/dev/greenline-portal?view=moderation` @1440 `contrast` the count line
- `/dev/greenline-portal?view=moderation` @1440 `tap-target` queue sort controls
- `/dev/greenline-portal?view=moderation` @1440 `presence` track queue says it is empty, deliberately
- `/dev/greenline-portal?view=moderation` @1440 `presence` and leads with the sentence, not a fragment
- `/dev/greenline-portal?view=moderation` @1440 `presence` decal queue says it is empty, deliberately
- `/dev/greenline-portal?view=moderation` @1440 `presence` and leads with the sentence too
- `/dev/greenline-portal?view=moderation` @1440 `presence` tracks section heading
- `/dev/greenline-portal?view=moderation` @1440 `presence` decals section heading
- `/dev/greenline-portal?view=moderation` @1440 `text-contains` the count line, which must read at zero as well
- `/dev/greenline-portal?view=moderation` @1440 `text-contains` the decal empty sentence says what approval is FOR
- `/dev/home-feed?state=teacher-header` @375 `order-result` every grid point of every header lands on the link or the fold, and the fold answers its whole column
- `/dev/home-feed?state=teacher-header` @1152 `order-result` every grid point of every header lands on the link or the fold, and the fold answers its whole column
- `/dev/home-feed?state=teacher-header` @1440 `order-result` every grid point of every header lands on the link or the fold, and the fold answers its whole column
- `/dev/home-order?dictation=ink` @375 `type-floor`
- `/dev/home-order?dictation=ink` @1152 `type-floor`
- `/dev/home-order?dictation=ink` @1440 `type-floor`
- `/dev/home-order?role=student&classes=0&rows=3` @375 `type-floor`
- `/dev/home-order?role=student&classes=0&rows=3` @1152 `type-floor`
- `/dev/home-order?role=student&classes=0&rows=3` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-matrix` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-matrix` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-matrix` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @375 `prepare-click` #changelog-body .cl-more
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @375 `prepare-eval` () => { const b = document.querySelector('#changelog-body'); b.scrollT
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @375 `presence` three pages of rows (450)
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @375 `text-contains` the readout follows the pages
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1152 `prepare-click` #changelog-body .cl-more
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1152 `prepare-eval` () => { const b = document.querySelector('#changelog-body'); b.scrollT
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1152 `presence` three pages of rows (450)
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1152 `text-contains` the readout follows the pages
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1440 `prepare-click` #changelog-body .cl-more
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1440 `prepare-eval` () => { const b = document.querySelector('#changelog-body'); b.scrollT
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1440 `presence` three pages of rows (450)
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1440 `text-contains` the readout follows the pages
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-more` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-space-white` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-space-white` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog-space-white` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=changelog` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=feed-links-idea` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=feed-links-idea` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=feed-links-idea` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=feed-links-space-white` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=feed-links-space-white` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=feed-links-space-white` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=particles-space-white` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=particles-space-white` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=particles-space-white` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=preload` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=preload` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=preload` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=quick-note` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=quick-note` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&state=quick-note` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=idea` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=idea` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=idea` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=matrix` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=matrix` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=matrix` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=space-white` @375 `order-result` a colour for every card: as many title and glyph colours as cards, one edge colour, and no gradient strip
- `/dev/home-order?role=student&classes=1&rows=3&theme=space-white` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=space-white` @1152 `order-result` a colour for every card: as many title and glyph colours as cards, one edge colour, and no gradient strip
- `/dev/home-order?role=student&classes=1&rows=3&theme=space-white` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&theme=space-white` @1440 `order-result` a colour for every card: as many title and glyph colours as cards, one edge colour, and no gradient strip
- `/dev/home-order?role=student&classes=1&rows=3&theme=space-white` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=idea` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=idea` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=idea` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=matrix` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=matrix` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=matrix` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=space-white` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=space-white` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=space-white` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=3` @1440 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=4&due=-1,0,1,5` @375 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=4&due=-1,0,1,5` @1152 `type-floor`
- `/dev/home-order?role=student&classes=1&rows=4&due=-1,0,1,5` @1440 `type-floor`
- `/dev/home-order?role=student&classes=2&rows=4&due=-1,0,1,5` @375 `type-floor`
- `/dev/home-order?role=student&classes=2&rows=4&due=-1,0,1,5` @1152 `type-floor`
- `/dev/home-order?role=student&classes=2&rows=4&due=-1,0,1,5` @1440 `type-floor`
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @375 `contrast` the Coin Desk card copy
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @375 `presence` the admin Coin Desk card
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @375 `text-contains` the Coin Desk card says it is the writing side, and names the Ledger
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @375 `order-result` both coin cards are on the grid, with both ids intact
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @375 `order-result` the two coin cards offer different verbs
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @375 `type-floor`
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1152 `contrast` the Coin Desk card copy
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1152 `presence` the admin Coin Desk card
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1152 `text-contains` the Coin Desk card says it is the writing side, and names the Ledger
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1152 `order-result` both coin cards are on the grid, with both ids intact
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1152 `order-result` the two coin cards offer different verbs
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1152 `type-floor`
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1440 `contrast` the Coin Desk card copy
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1440 `presence` the admin Coin Desk card
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1440 `text-contains` the Coin Desk card says it is the writing side, and names the Ledger
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1440 `order-result` both coin cards are on the grid, with both ids intact
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1440 `order-result` the two coin cards offer different verbs
- `/dev/home-order?role=teacher&classes=1&rows=3&admin=1` @1440 `type-floor`
- `/dev/home-order?role=teacher&classes=1&rows=3` @375 `type-floor`
- `/dev/home-order?role=teacher&classes=1&rows=3` @1152 `type-floor`
- `/dev/home-order?role=teacher&classes=1&rows=3` @1440 `type-floor`
- `/dev/home-order?role=teacher&classes=2&rows=4&due=-1,0,1,5` @375 `type-floor`
- `/dev/home-order?role=teacher&classes=2&rows=4&due=-1,0,1,5` @1152 `type-floor`
- `/dev/home-order?role=teacher&classes=2&rows=4&due=-1,0,1,5` @1440 `type-floor`
- `/dev/home-order?signedout=1&display=standalone` @375 `type-floor`
- `/dev/home-order?signedout=1&display=standalone` @1152 `type-floor`
- `/dev/home-order?signedout=1&display=standalone` @1440 `type-floor`
- `/dev/home-order?signedout=1&install=prompt` @375 `type-floor`
- `/dev/home-order?signedout=1&install=prompt` @1152 `type-floor`
- `/dev/home-order?signedout=1&install=prompt` @1440 `type-floor`
- `/dev/home-order?signedout=1&ua=iphone` @375 `type-floor`
- `/dev/home-order?signedout=1&ua=iphone` @1152 `type-floor`
- `/dev/home-order?signedout=1&ua=iphone` @1440 `type-floor`
- `/dev/home-order?signedout=1` @375 `type-floor`
- `/dev/home-order?signedout=1` @1152 `type-floor`
- `/dev/home-order?signedout=1` @1440 `type-floor`
- `/dev/html-assignment-grading?roster=30` @375 `order-result` every row is one line (52px at most)
- `/dev/html-assignment-grading?roster=30` @1152 `order-result` every row is one line (52px at most)
- `/dev/html-assignment-grading?roster=30` @1440 `order-result` every row is one line (52px at most)
- `/dev/html-assignment` @375 `console-errors`
- `/dev/html-assignment` @1152 `console-errors`
- `/dev/html-assignment` @1440 `console-errors`
- `/dev/html-instructor/copy` @375 `console-errors`
- `/dev/html-instructor/copy` @1152 `console-errors`
- `/dev/html-instructor/copy` @1440 `console-errors`
- `/dev/html-rubric?state=graded` @1152 `control-floor`
- `/dev/html-rubric?state=graded` @1152 `squeeze`
- `/dev/html-rubric?state=graded` @1440 `squeeze`
- `/dev/html-rubric` @1152 `tap-target` a level button
- `/dev/html-rubric` @1152 `presence` a one-line form on every level button, with NO spec handed in (a count, not the guard -- see the comment)
- `/dev/html-rubric` @1152 `control-floor`
- `/dev/html-rubric` @1152 `squeeze`
- `/dev/html-rubric` @1440 `squeeze`
- `/dev/ideacad-item?role=editor&state=lost` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=editor&state=lost` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad-item?role=editor&state=lost` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=editor&state=lost` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=editor&state=lost` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=editor&state=lost` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=editor&state=lost` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=editor` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=editor` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad-item?role=editor` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=editor` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=editor` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=editor` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=editor` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=owner&state=conflict` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=owner&state=conflict` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad-item?role=owner&state=conflict` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=owner&state=conflict` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=owner&state=conflict` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=owner&state=conflict` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=owner&state=conflict` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=owner` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=owner` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad-item?role=owner` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=owner` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=owner` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=owner` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=owner` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=viewer&state=callbacks` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=viewer&state=callbacks` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad-item?role=viewer&state=callbacks` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=viewer&state=callbacks` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=viewer&state=callbacks` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=viewer&state=callbacks` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=viewer&state=callbacks` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=viewer` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=viewer` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad-item?role=viewer` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=viewer` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=viewer` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?role=viewer` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?role=viewer` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?state=empty` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?state=empty` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad-item?state=empty` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?state=empty` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?state=empty` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad-item?state=empty` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad-item?state=empty` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=compare` @375 `text-contains` the sheet asks the question AND shows the physics
- `/dev/ideacad?role=student&state=compare` @375 `order-result` the physics, measured the way 0160 measured the gate leaking
- `/dev/ideacad?role=student&state=compare` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=compare` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad?role=student&state=compare` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=compare` @1152 `text-contains` the sheet asks the question AND shows the physics
- `/dev/ideacad?role=student&state=compare` @1152 `order-result` the physics, measured the way 0160 measured the gate leaking
- `/dev/ideacad?role=student&state=compare` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=compare` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=compare` @1440 `text-contains` the sheet asks the question AND shows the physics
- `/dev/ideacad?role=student&state=compare` @1440 `order-result` the physics, measured the way 0160 measured the gate leaking
- `/dev/ideacad?role=student&state=compare` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=compare` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=history` @375 `tap-target` a step, which is what a scrub is pressed on
- `/dev/ideacad?role=student&state=history` @375 `tap-target` Undo and Redo inside the panel
- `/dev/ideacad?role=student&state=history` @375 `tap-target` the way back to the feature tree
- `/dev/ideacad?role=student&state=history` @375 `presence` the history panel
- `/dev/ideacad?role=student&state=history` @375 `presence` the step count, which stands in for the scrollbar nobody paints
- `/dev/ideacad?role=student&state=history` @375 `presence` Undo, inside the panel
- `/dev/ideacad?role=student&state=history` @375 `presence` Redo, inside the panel
- `/dev/ideacad?role=student&state=history` @375 `presence` the undone step, still listed
- `/dev/ideacad?role=student&state=history` @375 `presence` the creation of the part
- `/dev/ideacad?role=student&state=history` @375 `text-contains` a row names a part and a parameter in the words the controls use, and the list explains why an undone step is still here
- `/dev/ideacad?role=student&state=history` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=history` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad?role=student&state=history` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=history` @1152 `text-contains` a row names a part and a parameter in the words the controls use, and the list explains why an undone step is still here
- `/dev/ideacad?role=student&state=history` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=history` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=history` @1440 `text-contains` a row names a part and a parameter in the words the controls use, and the list explains why an undone step is still here
- `/dev/ideacad?role=student&state=history` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=history` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=materials` @375 `tap-target` a material or thickness picker
- `/dev/ideacad?role=student&state=materials` @375 `tap-target` the confirm pair
- `/dev/ideacad?role=student&state=materials` @375 `tap-target` the way back to the tree
- `/dev/ideacad?role=student&state=materials` @375 `tap-target` Add my own material
- `/dev/ideacad?role=student&state=materials` @375 `tap-target` the body fill slider
- `/dev/ideacad?role=student&state=materials` @375 `presence` the Materials panel
- `/dev/ideacad?role=student&state=materials` @375 `presence` body material, blade material, blade thickness, spin
- `/dev/ideacad?role=student&state=materials` @375 `presence` the body fill slider
- `/dev/ideacad?role=student&state=materials` @375 `presence` the body and blade density lines
- `/dev/ideacad?role=student&state=materials` @375 `presence` the green check and the red X
- `/dev/ideacad?role=student&state=materials` @375 `presence` Add my own material
- `/dev/ideacad?role=student&state=materials` @375 `text-contains` the panel states the thickness rule and the UNVERIFIED density rather than leaving either to be discovered
- `/dev/ideacad?role=student&state=materials` @375 `order-result` the panel replaced the tree in the tree’s own pane, and the controls drive the readouts
- `/dev/ideacad?role=student&state=materials` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=materials` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad?role=student&state=materials` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=materials` @1152 `tap-target` Add my own material
- `/dev/ideacad?role=student&state=materials` @1152 `tap-target` the body fill slider
- `/dev/ideacad?role=student&state=materials` @1152 `presence` the body fill slider
- `/dev/ideacad?role=student&state=materials` @1152 `presence` Add my own material
- `/dev/ideacad?role=student&state=materials` @1152 `text-contains` the panel states the thickness rule and the UNVERIFIED density rather than leaving either to be discovered
- `/dev/ideacad?role=student&state=materials` @1152 `order-result` the panel replaced the tree in the tree’s own pane, and the controls drive the readouts
- `/dev/ideacad?role=student&state=materials` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=materials` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=materials` @1440 `tap-target` Add my own material
- `/dev/ideacad?role=student&state=materials` @1440 `tap-target` the body fill slider
- `/dev/ideacad?role=student&state=materials` @1440 `presence` the body fill slider
- `/dev/ideacad?role=student&state=materials` @1440 `presence` Add my own material
- `/dev/ideacad?role=student&state=materials` @1440 `text-contains` the panel states the thickness rule and the UNVERIFIED density rather than leaving either to be discovered
- `/dev/ideacad?role=student&state=materials` @1440 `order-result` the panel replaced the tree in the tree’s own pane, and the controls drive the readouts
- `/dev/ideacad?role=student&state=materials` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=materials` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=predicted` @375 `text-contains` the physics is on screen with its units, and the prediction is quoted back
- `/dev/ideacad?role=student&state=predicted` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=predicted` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad?role=student&state=predicted` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=predicted` @1152 `text-contains` the physics is on screen with its units, and the prediction is quoted back
- `/dev/ideacad?role=student&state=predicted` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=predicted` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=predicted` @1440 `text-contains` the physics is on screen with its units, and the prediction is quoted back
- `/dev/ideacad?role=student&state=predicted` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=predicted` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=property` @375 `contrast` the station table caption
- `/dev/ideacad?role=student&state=property` @375 `contrast` a station column header
- `/dev/ideacad?role=student&state=property` @375 `contrast` a station row number
- `/dev/ideacad?role=student&state=property` @375 `contrast` the panel’s own prose
- `/dev/ideacad?role=student&state=property` @375 `contrast` the profile caption
- `/dev/ideacad?role=student&state=property` @375 `tap-target` the confirm pair
- `/dev/ideacad?role=student&state=property` @375 `tap-target` a reorder control
- `/dev/ideacad?role=student&state=property` @375 `tap-target` the way back to the tree
- `/dev/ideacad?role=student&state=property` @375 `tap-target` a station cell
- `/dev/ideacad?role=student&state=property` @375 `tap-target` add or remove a station
- `/dev/ideacad?role=student&state=property` @375 `presence` the PropertyManager
- `/dev/ideacad?role=student&state=property` @375 `presence` station rows
- `/dev/ideacad?role=student&state=property` @375 `presence` the r and z cells
- `/dev/ideacad?role=student&state=property` @375 `presence` add and remove, one pair per station
- `/dev/ideacad?role=student&state=property` @375 `presence` the 2D profile preview
- `/dev/ideacad?role=student&state=property` @375 `presence` one dot per station on the profile
- `/dev/ideacad?role=student&state=property` @375 `presence` the green check and the red X
- `/dev/ideacad?role=student&state=property` @375 `presence` Move up and Move down
- `/dev/ideacad?role=student&state=property` @375 `presence` the sentence saying why no feature renames or deletes
- `/dev/ideacad?role=student&state=property` @375 `text-contains` the panel names its bounds rather than leaving them to be discovered
- `/dev/ideacad?role=student&state=property` @375 `order-result` the panel replaced the tree, in the tree’s own pane, with its table and preview inside it
- `/dev/ideacad?role=student&state=property` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=property` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad?role=student&state=property` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=property` @1152 `contrast` the station table caption
- `/dev/ideacad?role=student&state=property` @1152 `contrast` a station column header
- `/dev/ideacad?role=student&state=property` @1152 `contrast` a station row number
- `/dev/ideacad?role=student&state=property` @1152 `contrast` the panel’s own prose
- `/dev/ideacad?role=student&state=property` @1152 `contrast` the profile caption
- `/dev/ideacad?role=student&state=property` @1152 `tap-target` the confirm pair
- `/dev/ideacad?role=student&state=property` @1152 `tap-target` a station cell
- `/dev/ideacad?role=student&state=property` @1152 `tap-target` add or remove a station
- `/dev/ideacad?role=student&state=property` @1152 `presence` station rows
- `/dev/ideacad?role=student&state=property` @1152 `presence` the r and z cells
- `/dev/ideacad?role=student&state=property` @1152 `presence` add and remove, one pair per station
- `/dev/ideacad?role=student&state=property` @1152 `presence` the 2D profile preview
- `/dev/ideacad?role=student&state=property` @1152 `presence` one dot per station on the profile
- `/dev/ideacad?role=student&state=property` @1152 `presence` the green check and the red X
- `/dev/ideacad?role=student&state=property` @1152 `presence` the sentence saying why no feature renames or deletes
- `/dev/ideacad?role=student&state=property` @1152 `text-contains` the panel names its bounds rather than leaving them to be discovered
- `/dev/ideacad?role=student&state=property` @1152 `order-result` the panel replaced the tree, in the tree’s own pane, with its table and preview inside it
- `/dev/ideacad?role=student&state=property` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=property` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=property` @1440 `contrast` the station table caption
- `/dev/ideacad?role=student&state=property` @1440 `contrast` a station column header
- `/dev/ideacad?role=student&state=property` @1440 `contrast` a station row number
- `/dev/ideacad?role=student&state=property` @1440 `contrast` the panel’s own prose
- `/dev/ideacad?role=student&state=property` @1440 `contrast` the profile caption
- `/dev/ideacad?role=student&state=property` @1440 `tap-target` the confirm pair
- `/dev/ideacad?role=student&state=property` @1440 `tap-target` a station cell
- `/dev/ideacad?role=student&state=property` @1440 `tap-target` add or remove a station
- `/dev/ideacad?role=student&state=property` @1440 `presence` station rows
- `/dev/ideacad?role=student&state=property` @1440 `presence` the r and z cells
- `/dev/ideacad?role=student&state=property` @1440 `presence` add and remove, one pair per station
- `/dev/ideacad?role=student&state=property` @1440 `presence` the 2D profile preview
- `/dev/ideacad?role=student&state=property` @1440 `presence` one dot per station on the profile
- `/dev/ideacad?role=student&state=property` @1440 `presence` the green check and the red X
- `/dev/ideacad?role=student&state=property` @1440 `presence` the sentence saying why no feature renames or deletes
- `/dev/ideacad?role=student&state=property` @1440 `text-contains` the panel names its bounds rather than leaving them to be discovered
- `/dev/ideacad?role=student&state=property` @1440 `order-result` the panel replaced the tree, in the tree’s own pane, with its table and preview inside it
- `/dev/ideacad?role=student&state=property` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=property` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=three` @375 `presence` the failing rule chip
- `/dev/ideacad?role=student&state=three` @375 `presence` the passing rule chips
- `/dev/ideacad?role=student&state=three` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=three` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad?role=student&state=three` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=three` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=three` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=student&state=three` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=student&state=three` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=teacher&state=property` @375 `contrast` the station table caption
- `/dev/ideacad?role=teacher&state=property` @375 `contrast` a station row number
- `/dev/ideacad?role=teacher&state=property` @375 `tap-target` the way back to the tree
- `/dev/ideacad?role=teacher&state=property` @375 `presence` the PropertyManager
- `/dev/ideacad?role=teacher&state=property` @375 `presence` station rows, the same four
- `/dev/ideacad?role=teacher&state=property` @375 `presence` the r and z cells, shown and disabled
- `/dev/ideacad?role=teacher&state=property` @375 `presence` one dot per station on the profile
- `/dev/ideacad?role=teacher&state=property` @375 `order-result` the read-only panel occupies the pane exactly as the student’s does
- `/dev/ideacad?role=teacher&state=property` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=teacher&state=property` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad?role=teacher&state=property` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=teacher&state=property` @1152 `contrast` the station table caption
- `/dev/ideacad?role=teacher&state=property` @1152 `contrast` a station row number
- `/dev/ideacad?role=teacher&state=property` @1152 `presence` station rows, the same four
- `/dev/ideacad?role=teacher&state=property` @1152 `presence` the r and z cells, shown and disabled
- `/dev/ideacad?role=teacher&state=property` @1152 `presence` one dot per station on the profile
- `/dev/ideacad?role=teacher&state=property` @1152 `order-result` the read-only panel occupies the pane exactly as the student’s does
- `/dev/ideacad?role=teacher&state=property` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=teacher&state=property` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad?role=teacher&state=property` @1440 `contrast` the station table caption
- `/dev/ideacad?role=teacher&state=property` @1440 `contrast` a station row number
- `/dev/ideacad?role=teacher&state=property` @1440 `presence` station rows, the same four
- `/dev/ideacad?role=teacher&state=property` @1440 `presence` the r and z cells, shown and disabled
- `/dev/ideacad?role=teacher&state=property` @1440 `presence` one dot per station on the profile
- `/dev/ideacad?role=teacher&state=property` @1440 `order-result` the read-only panel occupies the pane exactly as the student’s does
- `/dev/ideacad?role=teacher&state=property` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad?role=teacher&state=property` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad` @375 `contrast` the sentence saying what the tree does not offer
- `/dev/ideacad` @375 `tap-target` a FeatureManager row
- `/dev/ideacad` @375 `presence` FeatureManager rows
- `/dev/ideacad` @375 `presence` FeatureManager rows and the body’s expander
- `/dev/ideacad` @375 `presence` the body’s expander
- `/dev/ideacad` @375 `presence` rule readouts, the centre of mass and the physics
- `/dev/ideacad` @375 `text-contains` the rail names the physics and prints a real figure
- `/dev/ideacad` @375 `order-result` the console, the viewport and the view toolbar are where they claim to be
- `/dev/ideacad` @375 `layout-sanity` the IdeaCAD console
- `/dev/ideacad` @375 `distinguishable` a readout label against its own value
- `/dev/ideacad` @375 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad` @1152 `contrast` the sentence saying what the tree does not offer
- `/dev/ideacad` @1152 `presence` FeatureManager rows and the body’s expander
- `/dev/ideacad` @1152 `presence` the body’s expander
- `/dev/ideacad` @1152 `text-contains` the rail names the physics and prints a real figure
- `/dev/ideacad` @1152 `order-result` the console, the viewport and the view toolbar are where they claim to be
- `/dev/ideacad` @1152 `layout-sanity` the IdeaCAD console
- `/dev/ideacad` @1152 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/ideacad` @1440 `contrast` the sentence saying what the tree does not offer
- `/dev/ideacad` @1440 `presence` FeatureManager rows and the body’s expander
- `/dev/ideacad` @1440 `presence` the body’s expander
- `/dev/ideacad` @1440 `text-contains` the rail names the physics and prints a real figure
- `/dev/ideacad` @1440 `order-result` the console, the viewport and the view toolbar are where they claim to be
- `/dev/ideacad` @1440 `layout-sanity` the IdeaCAD console
- `/dev/ideacad` @1440 `distinguishable` the IDEACAD eyebrow against the saved-state word
- `/dev/instructor-tools` @375 `order-result` each mount states its own count from the payload, never a constant
- `/dev/instructor-tools` @1152 `order-result` each mount states its own count from the payload, never a constant
- `/dev/instructor-tools` @1440 `order-result` each mount states its own count from the payload, never a constant
- `/dev/item-gallery?role=manager` @375 `prepare-click` [data-testid="zip-choice-gallery"]
- `/dev/item-gallery?role=manager` @1152 `prepare-click` [data-testid="zip-choice-gallery"]
- `/dev/item-gallery?role=manager` @1440 `prepare-click` [data-testid="zip-choice-gallery"]
- `/dev/maps-editor?state=new-room` @375 `order-result` TYPE A WIDTH AND A DEPTH: A GHOST APPEARS; PLACE HERE WRITES ITS CENTRE INTO THE TYPED FIELDS
- `/dev/maps-editor?state=new-room` @1440 `order-result` TYPE A WIDTH AND A DEPTH: A GHOST APPEARS; PLACE HERE WRITES ITS CENTRE INTO THE TYPED FIELDS
- `/dev/maps-grants` @375 `contrast` the containment path on a roster row
- `/dev/maps-grants` @375 `contrast` the granted address on a roster row
- `/dev/maps-viewer` @1152 `order-result` THE MAP TAKES THE WINDOW: panel beside map above the breakpoint, one column below it
- `/dev/notebook-review?locked=1&site=space-white` @1152 `order-result` the grid is not cut: its table fits its own scrollport, beside an entry pane that holds nothing filed
- `/dev/notebook-review?locked=1` @1152 `order-result` the grid is not cut: its table fits its own scrollport, beside an entry pane that holds nothing filed
- `/dev/notebook?scope=class&site=space-white` @375 `contrast` the tab count words
- `/dev/notebook?scope=class&site=space-white` @1152 `contrast` the tab count words
- `/dev/notebook?scope=class&site=space-white` @1440 `contrast` the tab count words
- `/dev/notebook?state=log-template-grid` @1152 `order-result` the grid and its number survive the template, headings after it; the manager is on screen
- `/dev/notebook?state=log-template-grid` @1440 `order-result` the grid and its number survive the template, headings after it; the manager is on screen
- `/dev/pathways?state=not-yet` @375 `type-floor`
- `/dev/pathways?state=not-yet` @1152 `type-floor`
- `/dev/pathways?state=not-yet` @1440 `type-floor`
- `/dev/pathways` @375 `type-floor`
- `/dev/pathways` @1152 `type-floor`
- `/dev/pathways` @1440 `type-floor`
- `/dev/portal-admin?used=roster,admins` @375 `prepare-click` .panel[data-panel="feedback"] .panel-title
- `/dev/portal-admin?used=roster,admins` @375 `order-result` one write, spread-merged under dashboard beside the launcher homepage namespace, and the grid did not move
- `/dev/portal-admin?used=roster,admins` @1152 `prepare-click` .panel[data-panel="feedback"] .panel-title
- `/dev/portal-admin?used=roster,admins` @1152 `order-result` one write, spread-merged under dashboard beside the launcher homepage namespace, and the grid did not move
- `/dev/portal-admin?used=roster,admins` @1440 `prepare-click` .panel[data-panel="feedback"] .panel-title
- `/dev/portal-admin?used=roster,admins` @1440 `order-result` one write, spread-merged under dashboard beside the launcher homepage namespace, and the grid did not move
- `/dev/portal-admin` @1152 `order-result` the grid spans the window (less the gutter) and the column count fits the width
- `/dev/post-thumbnails?shape=banner&state=moved` @1152 `prepare-wait` () => document.querySelectorAll('[data-testid="html-thumbnai
- `/dev/post-thumbnails?shape=banner&state=moved` @1152 `presence` all three live banners ready, the moved one included
- `/dev/post-thumbnails?shape=banner&theme=space-white` @1152 `prepare-wait` () => document.querySelectorAll('[data-testid="html-thumbnai
- `/dev/post-thumbnails?shape=banner&theme=space-white` @1152 `order-result` each live thumbnail was told it is a banner on a light page
- `/dev/post-thumbnails?shape=wide` @1152 `prepare-wait` () => document.querySelectorAll('[data-testid="html-thumbnai
- `/dev/post-thumbnails?shape=wide` @1152 `order-result` each live thumbnail was told it is wide
- `/dev/post-thumbnails?view=bridge` @1152 `prepare-wait` () => { const s = ((window.__thumbReportsByItem ?? {})['as-g
- `/dev/post-thumbnails?view=editor&editdoc=refused` @375 `order-result` the first failure: what the form says, and the preview drawn without a frame
- `/dev/post-thumbnails?view=editor&editdoc=refused` @375 `order-result` Try again makes the three frames afresh, moves the focus to the status line, and forgets the failure until they fail again
- `/dev/post-thumbnails?view=editor&editdoc=refused` @1152 `order-result` Try again makes the three frames afresh, moves the focus to the status line, and forgets the failure until they fail again
- `/dev/post-thumbnails?view=editor&editdoc=refused` @1440 `order-result` Try again makes the three frames afresh, moves the focus to the status line, and forgets the failure until they fail again
- `/dev/post-thumbnails?view=editor&forms=1` @375 `order-result` each manifest form, staged on a new post: what Automatic says, how every shape previews it, and what is said beside it
- `/dev/profile-menu?pathway=none&refuse=rls` @375 `order-result` the refusal is inside the viewport, not below the fold, and not under the Sign out footer
- `/dev/profile-menu?pathway=none&refuse=rls` @1152 `order-result` the refusal is inside the viewport, not below the fold, and not under the Sign out footer
- `/dev/profile-menu?pathway=none&refuse=rls` @1440 `order-result` the refusal is inside the viewport, not below the fold, and not under the Sign out footer
- `/dev/theme-switch` @375 `contrast` muted copy and status on the wall
- `/dev/theme-switch` @1152 `contrast` muted copy and status on the wall
- `/dev/theme-switch` @1440 `contrast` muted copy and status on the wall
- `/dev/themes-shape?state=idea` @375 `tap-target` list expand controls (documented 30x44 exception)
- `/dev/themes-shape?state=idea` @375 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=idea` @1152 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=idea` @1440 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=matrix` @375 `tap-target` list expand controls (documented 30x44 exception)
- `/dev/themes-shape?state=matrix` @375 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=matrix` @1152 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=matrix` @1440 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=space-white&view=two` @375 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=space-white&view=two` @1152 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=space-white&view=two` @1440 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=space-white` @375 `tap-target` list expand controls (documented 30x44 exception)
- `/dev/themes-shape?state=space-white` @375 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=space-white` @1152 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes-shape?state=space-white` @1440 `order-result` the proposal is applied in the after column and absent in the before column
- `/dev/themes?state=matrix&room=classroom` @375 `type-floor`
- `/dev/themes?state=matrix&room=classroom` @1152 `type-floor`
- `/dev/themes?state=matrix&room=classroom` @1440 `type-floor`
- `/dev/themes?state=matrix&room=foundry` @375 `type-floor`
- `/dev/themes?state=matrix&room=foundry` @1152 `type-floor`
- `/dev/themes?state=matrix&room=foundry` @1440 `type-floor`
- `/dev/themes?state=matrix` @375 `type-floor`
- `/dev/themes?state=matrix` @1152 `type-floor`
- `/dev/themes?state=matrix` @1440 `type-floor`
- `/dev/themes?state=space-white` @375 `contrast` space-white: projector, role board, muted copy and status inks on the wall (3.0 washed)
- `/dev/themes?state=space-white` @375 `contrast` default card coin-desk: title
- `/dev/themes?state=space-white` @375 `type-floor`
- `/dev/themes?state=space-white` @1152 `contrast` space-white: projector, role board, muted copy and status inks on the wall (3.0 washed)
- `/dev/themes?state=space-white` @1152 `contrast` default card coin-desk: title
- `/dev/themes?state=space-white` @1152 `type-floor`
- `/dev/themes?state=space-white` @1440 `contrast` space-white: projector, role board, muted copy and status inks on the wall (3.0 washed)
- `/dev/themes?state=space-white` @1440 `contrast` default card coin-desk: title
- `/dev/themes?state=space-white` @1440 `type-floor`
- `/dev/themes` @375 `contrast` default card coin-desk: title
- `/dev/themes` @375 `type-floor`
- `/dev/themes` @1152 `contrast` default card coin-desk: title
- `/dev/themes` @1152 `type-floor`
- `/dev/themes` @1440 `contrast` default card coin-desk: title
- `/dev/themes` @1440 `type-floor`
- `/dev/tour?mode=anon` @375 `type-floor`
- `/dev/tour?mode=anon` @1152 `type-floor`
- `/dev/tour?mode=anon` @1440 `type-floor`
- `/dev/tour?mode=done` @375 `order-result` and nothing was written
- `/dev/tour?mode=done` @375 `type-floor`
- `/dev/tour?mode=done` @375 `console-errors`
- `/dev/tour?mode=done` @1152 `order-result` and nothing was written
- `/dev/tour?mode=done` @1152 `type-floor`
- `/dev/tour?mode=done` @1152 `console-errors`
- `/dev/tour?mode=done` @1440 `order-result` and nothing was written
- `/dev/tour?mode=done` @1440 `type-floor`
- `/dev/tour?mode=done` @1440 `console-errors`
- `/dev/tour?mode=old&state=dismiss` @375 `prepare-click` [data-testid="tour-offer-dismiss"]
- `/dev/tour?mode=old&state=dismiss` @375 `presence` the offer is gone
- `/dev/tour?mode=old&state=dismiss` @375 `type-floor`
- `/dev/tour?mode=old&state=dismiss` @375 `console-errors`
- `/dev/tour?mode=old&state=dismiss` @1152 `prepare-click` [data-testid="tour-offer-dismiss"]
- `/dev/tour?mode=old&state=dismiss` @1152 `presence` the offer is gone
- `/dev/tour?mode=old&state=dismiss` @1152 `type-floor`
- `/dev/tour?mode=old&state=dismiss` @1152 `console-errors`
- `/dev/tour?mode=old&state=dismiss` @1440 `prepare-click` [data-testid="tour-offer-dismiss"]
- `/dev/tour?mode=old&state=dismiss` @1440 `presence` the offer is gone
- `/dev/tour?mode=old&state=dismiss` @1440 `type-floor`
- `/dev/tour?mode=old&state=dismiss` @1440 `console-errors`
- `/dev/tour?mode=old&state=start` @375 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/tour?mode=old&state=start` @375 `presence` the tour is running
- `/dev/tour?mode=old&state=start` @375 `presence` the offer is gone
- `/dev/tour?mode=old&state=start` @375 `order-result` it starts on the welcome, with the whole tour ahead of it
- `/dev/tour?mode=old&state=start` @375 `type-floor`
- `/dev/tour?mode=old&state=start` @375 `console-errors`
- `/dev/tour?mode=old&state=start` @1152 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/tour?mode=old&state=start` @1152 `presence` the tour is running
- `/dev/tour?mode=old&state=start` @1152 `presence` the offer is gone
- `/dev/tour?mode=old&state=start` @1152 `order-result` it starts on the welcome, with the whole tour ahead of it
- `/dev/tour?mode=old&state=start` @1152 `type-floor`
- `/dev/tour?mode=old&state=start` @1152 `console-errors`
- `/dev/tour?mode=old&state=start` @1440 `prepare-click` [data-testid="tour-offer-start"]
- `/dev/tour?mode=old&state=start` @1440 `presence` the tour is running
- `/dev/tour?mode=old&state=start` @1440 `presence` the offer is gone
- `/dev/tour?mode=old&state=start` @1440 `order-result` it starts on the welcome, with the whole tour ahead of it
- `/dev/tour?mode=old&state=start` @1440 `type-floor`
- `/dev/tour?mode=old&state=start` @1440 `console-errors`
- `/dev/tour?mode=old&theme=space-white` @375 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=old&theme=space-white` @375 `type-floor`
- `/dev/tour?mode=old&theme=space-white` @375 `console-errors`
- `/dev/tour?mode=old&theme=space-white` @1152 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=old&theme=space-white` @1152 `type-floor`
- `/dev/tour?mode=old&theme=space-white` @1152 `console-errors`
- `/dev/tour?mode=old&theme=space-white` @1440 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=old&theme=space-white` @1440 `type-floor`
- `/dev/tour?mode=old&theme=space-white` @1440 `console-errors`
- `/dev/tour?mode=old` @375 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=old` @375 `order-result` the offer stamped the profile when it showed, never older than the version
- `/dev/tour?mode=old` @375 `type-floor`
- `/dev/tour?mode=old` @375 `console-errors`
- `/dev/tour?mode=old` @1152 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=old` @1152 `order-result` the offer stamped the profile when it showed, never older than the version
- `/dev/tour?mode=old` @1152 `type-floor`
- `/dev/tour?mode=old` @1152 `console-errors`
- `/dev/tour?mode=old` @1440 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=old` @1440 `order-result` the offer stamped the profile when it showed, never older than the version
- `/dev/tour?mode=old` @1440 `type-floor`
- `/dev/tour?mode=old` @1440 `console-errors`
- `/dev/tour?mode=picker` @375 `prepare-eval` () => { const overlay = document.querySelector('.pwp-overlay'); const 
- `/dev/tour?mode=picker` @375 `prepare-eval` () => { const el = document.elementFromPoint(8, 8); const which = el ?
- `/dev/tour?mode=picker` @375 `presence` pathway sheet (dismissed)
- `/dev/tour?mode=picker` @375 `presence` scrim (gone with it)
- `/dev/tour?mode=picker` @375 `presence` exit hint (gone with it)
- `/dev/tour?mode=picker` @375 `type-floor`
- `/dev/tour?mode=picker` @375 `console-errors`
- `/dev/tour?mode=picker` @1152 `prepare-eval` () => { const overlay = document.querySelector('.pwp-overlay'); const 
- `/dev/tour?mode=picker` @1152 `prepare-eval` () => { const el = document.elementFromPoint(8, 8); const which = el ?
- `/dev/tour?mode=picker` @1152 `presence` pathway sheet (dismissed)
- `/dev/tour?mode=picker` @1152 `presence` scrim (gone with it)
- `/dev/tour?mode=picker` @1152 `presence` exit hint (gone with it)
- `/dev/tour?mode=picker` @1152 `type-floor`
- `/dev/tour?mode=picker` @1152 `console-errors`
- `/dev/tour?mode=picker` @1440 `prepare-eval` () => { const overlay = document.querySelector('.pwp-overlay'); const 
- `/dev/tour?mode=picker` @1440 `prepare-eval` () => { const el = document.elementFromPoint(8, 8); const which = el ?
- `/dev/tour?mode=picker` @1440 `presence` pathway sheet (dismissed)
- `/dev/tour?mode=picker` @1440 `presence` scrim (gone with it)
- `/dev/tour?mode=picker` @1440 `presence` exit hint (gone with it)
- `/dev/tour?mode=picker` @1440 `type-floor`
- `/dev/tour?mode=picker` @1440 `console-errors`
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `contrast` step title
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `contrast` step words
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `contrast` step count
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `contrast` Skip tour
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `contrast` Next / Done
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `contrast` close
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `tap-target` the callout controls
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `presence` the callout, on its last step
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `presence` the admin-only Coin Desk card, rendered for an admin
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `order-result` every step: target present, on screen, clear of the callout; at least 19 steps
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `order-result` the admin cards are steps, with the rest of the page
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `order-result` the staff words, not the student words (moves the tour back; runs last)
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `type-floor`
- `/dev/tour?mode=student&role=teacher&admin=1` @375 `console-errors`
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `contrast` step title
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `contrast` step words
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `contrast` step count
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `contrast` Skip tour
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `contrast` Next / Done
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `contrast` close
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `tap-target` the callout controls
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `presence` the callout, on its last step
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `presence` the admin-only Coin Desk card, rendered for an admin
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `order-result` every step: target present, on screen, clear of the callout; at least 19 steps
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `order-result` the admin cards are steps, with the rest of the page
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `order-result` the staff words, not the student words (moves the tour back; runs last)
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `type-floor`
- `/dev/tour?mode=student&role=teacher&admin=1` @1152 `console-errors`
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `contrast` step title
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `contrast` step words
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `contrast` step count
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `contrast` Skip tour
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `contrast` Next / Done
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `contrast` close
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `tap-target` the callout controls
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `presence` the callout, on its last step
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `presence` the admin-only Coin Desk card, rendered for an admin
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `order-result` every step: target present, on screen, clear of the callout; at least 19 steps
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `order-result` the admin cards are steps, with the rest of the page
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `order-result` the staff words, not the student words (moves the tour back; runs last)
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `type-floor`
- `/dev/tour?mode=student&role=teacher&admin=1` @1440 `console-errors`
- `/dev/tour?mode=student&role=teacher` @375 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&role=teacher` @375 `contrast` step title
- `/dev/tour?mode=student&role=teacher` @375 `contrast` step words
- `/dev/tour?mode=student&role=teacher` @375 `contrast` step count
- `/dev/tour?mode=student&role=teacher` @375 `contrast` Skip tour
- `/dev/tour?mode=student&role=teacher` @375 `contrast` Next / Done
- `/dev/tour?mode=student&role=teacher` @375 `contrast` close
- `/dev/tour?mode=student&role=teacher` @375 `tap-target` the callout controls
- `/dev/tour?mode=student&role=teacher` @375 `presence` the callout, on its last step
- `/dev/tour?mode=student&role=teacher` @375 `order-result` every step: target present, on screen, clear of the callout; at least 17 steps
- `/dev/tour?mode=student&role=teacher` @375 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&role=teacher` @375 `order-result` the page a teacher can see is walked
- `/dev/tour?mode=student&role=teacher` @375 `order-result` the staff words, not the student words (moves the tour back; runs last)
- `/dev/tour?mode=student&role=teacher` @375 `type-floor`
- `/dev/tour?mode=student&role=teacher` @375 `console-errors`
- `/dev/tour?mode=student&role=teacher` @1152 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&role=teacher` @1152 `contrast` step title
- `/dev/tour?mode=student&role=teacher` @1152 `contrast` step words
- `/dev/tour?mode=student&role=teacher` @1152 `contrast` step count
- `/dev/tour?mode=student&role=teacher` @1152 `contrast` Skip tour
- `/dev/tour?mode=student&role=teacher` @1152 `contrast` Next / Done
- `/dev/tour?mode=student&role=teacher` @1152 `contrast` close
- `/dev/tour?mode=student&role=teacher` @1152 `tap-target` the callout controls
- `/dev/tour?mode=student&role=teacher` @1152 `presence` the callout, on its last step
- `/dev/tour?mode=student&role=teacher` @1152 `order-result` every step: target present, on screen, clear of the callout; at least 17 steps
- `/dev/tour?mode=student&role=teacher` @1152 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&role=teacher` @1152 `order-result` the page a teacher can see is walked
- `/dev/tour?mode=student&role=teacher` @1152 `order-result` the staff words, not the student words (moves the tour back; runs last)
- `/dev/tour?mode=student&role=teacher` @1152 `type-floor`
- `/dev/tour?mode=student&role=teacher` @1152 `console-errors`
- `/dev/tour?mode=student&role=teacher` @1440 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&role=teacher` @1440 `contrast` step title
- `/dev/tour?mode=student&role=teacher` @1440 `contrast` step words
- `/dev/tour?mode=student&role=teacher` @1440 `contrast` step count
- `/dev/tour?mode=student&role=teacher` @1440 `contrast` Skip tour
- `/dev/tour?mode=student&role=teacher` @1440 `contrast` Next / Done
- `/dev/tour?mode=student&role=teacher` @1440 `contrast` close
- `/dev/tour?mode=student&role=teacher` @1440 `tap-target` the callout controls
- `/dev/tour?mode=student&role=teacher` @1440 `presence` the callout, on its last step
- `/dev/tour?mode=student&role=teacher` @1440 `order-result` every step: target present, on screen, clear of the callout; at least 17 steps
- `/dev/tour?mode=student&role=teacher` @1440 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&role=teacher` @1440 `order-result` the page a teacher can see is walked
- `/dev/tour?mode=student&role=teacher` @1440 `order-result` the staff words, not the student words (moves the tour back; runs last)
- `/dev/tour?mode=student&role=teacher` @1440 `type-floor`
- `/dev/tour?mode=student&role=teacher` @1440 `console-errors`
- `/dev/tour?mode=student&state=walk` @375 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&state=walk` @375 `contrast` step title
- `/dev/tour?mode=student&state=walk` @375 `contrast` step words
- `/dev/tour?mode=student&state=walk` @375 `contrast` step count
- `/dev/tour?mode=student&state=walk` @375 `contrast` Skip tour
- `/dev/tour?mode=student&state=walk` @375 `contrast` Next / Done
- `/dev/tour?mode=student&state=walk` @375 `contrast` close
- `/dev/tour?mode=student&state=walk` @375 `tap-target` the callout controls
- `/dev/tour?mode=student&state=walk` @375 `presence` the callout, on its last step
- `/dev/tour?mode=student&state=walk` @375 `order-result` every step: target present, on screen, clear of the callout; at least 18 steps
- `/dev/tour?mode=student&state=walk` @375 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&state=walk` @375 `order-result` the steps a student can see are all walked
- `/dev/tour?mode=student&state=walk` @375 `order-result` page order: the to-do before the apps
- `/dev/tour?mode=student&state=walk` @375 `order-result` page order: a student gets the apps before the classes
- `/dev/tour?mode=student&state=walk` @375 `order-result` the student words, not the staff words (moves the tour back; runs last)
- `/dev/tour?mode=student&state=walk` @375 `type-floor`
- `/dev/tour?mode=student&state=walk` @375 `console-errors`
- `/dev/tour?mode=student&state=walk` @1152 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&state=walk` @1152 `contrast` step title
- `/dev/tour?mode=student&state=walk` @1152 `contrast` step words
- `/dev/tour?mode=student&state=walk` @1152 `contrast` step count
- `/dev/tour?mode=student&state=walk` @1152 `contrast` Skip tour
- `/dev/tour?mode=student&state=walk` @1152 `contrast` Next / Done
- `/dev/tour?mode=student&state=walk` @1152 `contrast` close
- `/dev/tour?mode=student&state=walk` @1152 `tap-target` the callout controls
- `/dev/tour?mode=student&state=walk` @1152 `presence` the callout, on its last step
- `/dev/tour?mode=student&state=walk` @1152 `order-result` every step: target present, on screen, clear of the callout; at least 18 steps
- `/dev/tour?mode=student&state=walk` @1152 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&state=walk` @1152 `order-result` the steps a student can see are all walked
- `/dev/tour?mode=student&state=walk` @1152 `order-result` page order: the to-do before the apps
- `/dev/tour?mode=student&state=walk` @1152 `order-result` page order: a student gets the apps before the classes
- `/dev/tour?mode=student&state=walk` @1152 `order-result` the student words, not the staff words (moves the tour back; runs last)
- `/dev/tour?mode=student&state=walk` @1152 `type-floor`
- `/dev/tour?mode=student&state=walk` @1152 `console-errors`
- `/dev/tour?mode=student&state=walk` @1440 `prepare-wait` () => !!document.querySelector('[data-testid="tour-callout"]
- `/dev/tour?mode=student&state=walk` @1440 `contrast` step title
- `/dev/tour?mode=student&state=walk` @1440 `contrast` step words
- `/dev/tour?mode=student&state=walk` @1440 `contrast` step count
- `/dev/tour?mode=student&state=walk` @1440 `contrast` Skip tour
- `/dev/tour?mode=student&state=walk` @1440 `contrast` Next / Done
- `/dev/tour?mode=student&state=walk` @1440 `contrast` close
- `/dev/tour?mode=student&state=walk` @1440 `tap-target` the callout controls
- `/dev/tour?mode=student&state=walk` @1440 `presence` the callout, on its last step
- `/dev/tour?mode=student&state=walk` @1440 `order-result` every step: target present, on screen, clear of the callout; at least 18 steps
- `/dev/tour?mode=student&state=walk` @1440 `order-result` opens on the welcome, ends on Take the tour
- `/dev/tour?mode=student&state=walk` @1440 `order-result` the steps a student can see are all walked
- `/dev/tour?mode=student&state=walk` @1440 `order-result` page order: the to-do before the apps
- `/dev/tour?mode=student&state=walk` @1440 `order-result` page order: a student gets the apps before the classes
- `/dev/tour?mode=student&state=walk` @1440 `order-result` the student words, not the staff words (moves the tour back; runs last)
- `/dev/tour?mode=student&state=walk` @1440 `type-floor`
- `/dev/tour?mode=student&state=walk` @1440 `console-errors`
- `/dev/tour?mode=student` @375 `prepare-eval` () => { const callout = document.querySelector('.tour-callout'); const
- `/dev/tour?mode=student` @375 `prepare-eval` () => { const count = ((document.querySelector('.tour-count') || {}).t
- `/dev/tour?mode=student` @375 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=student` @375 `contrast` close X on the callout plate
- `/dev/tour?mode=student` @375 `contrast` Skip tour on the callout plate
- `/dev/tour?mode=student` @375 `contrast` Back on the callout plate
- `/dev/tour?mode=student` @375 `contrast` Next / Done on its own gold wash
- `/dev/tour?mode=student` @375 `contrast` the step body
- `/dev/tour?mode=student` @375 `contrast` the step counter
- `/dev/tour?mode=student` @375 `tap-target` close X
- `/dev/tour?mode=student` @375 `tap-target` Skip tour
- `/dev/tour?mode=student` @375 `tap-target` Back and Next together
- `/dev/tour?mode=student` @375 `presence` the callout itself
- `/dev/tour?mode=student` @375 `presence` close X
- `/dev/tour?mode=student` @375 `presence` Skip tour
- `/dev/tour?mode=student` @375 `presence` Back
- `/dev/tour?mode=student` @375 `presence` Next / Done
- `/dev/tour?mode=student` @375 `type-floor`
- `/dev/tour?mode=student` @375 `console-errors`
- `/dev/tour?mode=student` @1152 `prepare-eval` () => { const callout = document.querySelector('.tour-callout'); const
- `/dev/tour?mode=student` @1152 `prepare-eval` () => { const count = ((document.querySelector('.tour-count') || {}).t
- `/dev/tour?mode=student` @1152 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=student` @1152 `contrast` close X on the callout plate
- `/dev/tour?mode=student` @1152 `contrast` Skip tour on the callout plate
- `/dev/tour?mode=student` @1152 `contrast` Back on the callout plate
- `/dev/tour?mode=student` @1152 `contrast` Next / Done on its own gold wash
- `/dev/tour?mode=student` @1152 `contrast` the step body
- `/dev/tour?mode=student` @1152 `contrast` the step counter
- `/dev/tour?mode=student` @1152 `tap-target` close X
- `/dev/tour?mode=student` @1152 `tap-target` Skip tour
- `/dev/tour?mode=student` @1152 `tap-target` Back and Next together
- `/dev/tour?mode=student` @1152 `presence` the callout itself
- `/dev/tour?mode=student` @1152 `presence` close X
- `/dev/tour?mode=student` @1152 `presence` Skip tour
- `/dev/tour?mode=student` @1152 `presence` Back
- `/dev/tour?mode=student` @1152 `presence` Next / Done
- `/dev/tour?mode=student` @1152 `type-floor`
- `/dev/tour?mode=student` @1152 `console-errors`
- `/dev/tour?mode=student` @1440 `prepare-eval` () => { const callout = document.querySelector('.tour-callout'); const
- `/dev/tour?mode=student` @1440 `prepare-eval` () => { const count = ((document.querySelector('.tour-count') || {}).t
- `/dev/tour?mode=student` @1440 `prepare-eval` () => { const cv = document.createElement('canvas'); cv.width = cv.hei
- `/dev/tour?mode=student` @1440 `contrast` close X on the callout plate
- `/dev/tour?mode=student` @1440 `contrast` Skip tour on the callout plate
- `/dev/tour?mode=student` @1440 `contrast` Back on the callout plate
- `/dev/tour?mode=student` @1440 `contrast` Next / Done on its own gold wash
- `/dev/tour?mode=student` @1440 `contrast` the step body
- `/dev/tour?mode=student` @1440 `contrast` the step counter
- `/dev/tour?mode=student` @1440 `tap-target` close X
- `/dev/tour?mode=student` @1440 `tap-target` Skip tour
- `/dev/tour?mode=student` @1440 `tap-target` Back and Next together
- `/dev/tour?mode=student` @1440 `presence` the callout itself
- `/dev/tour?mode=student` @1440 `presence` close X
- `/dev/tour?mode=student` @1440 `presence` Skip tour
- `/dev/tour?mode=student` @1440 `presence` Back
- `/dev/tour?mode=student` @1440 `presence` Next / Done
- `/dev/tour?mode=student` @1440 `type-floor`
- `/dev/tour?mode=student` @1440 `console-errors`
- `/dev/tournaments?view=team&state=open&viewer=host` @375 `text-contains` both field labels, the email one marked optional
- `/dev/tournaments?view=team&state=open&viewer=host` @1152 `text-contains` both field labels, the email one marked optional
- `/dev/tournaments?view=team&state=open&viewer=host` @1440 `text-contains` both field labels, the email one marked optional
- `/dev/upload-limits` @375 `presence` all thirteen ceilings rendered, none collapsed away
- `/dev/upload-limits` @375 `presence` and every one of them carries a refusal sentence
- `/dev/upload-limits` @375 `presence` all thirteen state one, as the positive control for that zero
- `/dev/upload-limits` @375 `text-contains` and the count of paths still stating nothing, which is zero
- `/dev/upload-limits` @1152 `presence` all thirteen ceilings rendered, none collapsed away
- `/dev/upload-limits` @1152 `presence` and every one of them carries a refusal sentence
- `/dev/upload-limits` @1152 `presence` all thirteen state one, as the positive control for that zero
- `/dev/upload-limits` @1152 `text-contains` and the count of paths still stating nothing, which is zero
- `/dev/upload-limits` @1440 `presence` all thirteen ceilings rendered, none collapsed away
- `/dev/upload-limits` @1440 `presence` and every one of them carries a refusal sentence
- `/dev/upload-limits` @1440 `presence` all thirteen state one, as the positive control for that zero
- `/dev/upload-limits` @1440 `text-contains` and the count of paths still stating nothing, which is zero

<!-- counts:measured:data {"schema":3,"date":"2026-10-30T06:01:45.910Z","sha":"bf560a7022e979ad3c1cd63d10ab29dd3b7be223","dirty":true,"oldest":"2026-10-30T06:01:45.910Z","covered":["animated-logo-room.mjs","animated-logo.mjs","armory-parts-theme-space-white.mjs","armory-parts.mjs","armory-state-many-out-theme-space-white.mjs","armory-state-many-out.mjs","armory-state-many.mjs","armory-state-projects-connected-theme-space-white.mjs","armory-state-purge-theme-space-white.mjs","armory-state-purge.mjs","armory-state-settings-theme-space-white.mjs","armory-state-settings.mjs","armory-state-shared-out.mjs","armory-state-shared-team.mjs","armory-state-team-theme-space-white.mjs","armory-state-team.mjs","armory.mjs","assignment-mirror-state-conflict.mjs","assignment-mirror.mjs","attach-reach.mjs","avatar-holds.mjs","avatars.mjs","calendar-admin-1-view-month.mjs","calendar-part-pacing.mjs","calendar-part-strip.mjs","calendar-view-list-scope-1.mjs","calendar-view-list.mjs","calendar-view-month.mjs","calendar.mjs","cert-award-state-confirm-theme-space-white.mjs","cert-award-state-confirm.mjs","cert-award-state-refused-unsigned.mjs","cert-award.mjs","cert-catalog-state-full-theme-space-white.mjs","cert-catalog.mjs","cert-certificate-state-revoked-theme-space-white.mjs","cert-certificate.mjs","cert-certification-state-guided-theme-space-white.mjs","cert-certification.mjs","cert-desk-state-busy-theme-space-white.mjs","cert-desk-state-empty.mjs","cert-desk.mjs","cert-emails-kind-awarded-theme-space-white.mjs","cert-emails-kind-awarded.mjs","cert-emails.mjs","cert-engine-state-editor-theme-space-white.mjs","cert-engine-state-editor.mjs","cert-engine-state-import-diff.mjs","cert-engine.mjs","cert-exam.mjs","cert-holders.mjs","cert-me.mjs","cert-review-state-checkout-video.mjs","cert-review.mjs","cert-telemetry-state-empty.mjs","cert-telemetry.mjs","cert-verify-state-valid-theme-space-white.mjs","cert-verify.mjs","cert-watch.mjs","check-in-manage.mjs","class-header-banner-none.mjs","class-header-expiring-1.mjs","class-header-panel-open-theme-space-white.mjs","class-header-panel-open.mjs","class-header-pattern-rays.mjs","class-header-pattern-rings.mjs","class-header-pattern-stripes-motion-still.mjs","class-header-pattern-stripes.mjs","class-header-posts-1-long-1-files-5.mjs","class-header-role-teacher-pane-1.mjs","class-header-role-teacher-posts-0-compose-1.mjs","class-header-role-teacher-posts-0.mjs","class-header-role-teacher-theme-matrix-posts-4.mjs","class-header-role-teacher-theme-space-white-posts-4.mjs","class-header-role-teacher.mjs","class-header-view-class-items-class-posts-0-teams-0-layout-videos-first-state-typing.mjs","class-header-view-class-items-class-posts-0-teams-0-state-typing.mjs","class-header-view-class-items-class-posts-0-teams-0.mjs","class-header-view-class-items-class-role-teacher-posts-0-layout-split.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-drafts-0-state-ticked.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-drafts-0-state-typing.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-layout-find-hidden.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-layout-videos-first-state-typing.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-state-armed.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-state-ticked.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-state-typing.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-state-videos-open.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-theme-matrix.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0-theme-space-white.mjs","class-header-view-class-items-class-role-teacher-posts-0-teams-0.mjs","class-header-view-class-layout-find-hidden-opens-todo.mjs","class-header-view-class-layout-search-first.mjs","class-header-view-class-pane-1-posts-1-long-1-files-5.mjs","class-header-view-class-role-teacher-layout-hidden.mjs","class-header-view-class-role-teacher.mjs","class-header-view-class.mjs","class-header.mjs","class-videos-manage-1.mjs","class-videos-state-none.mjs","class-videos-state-pane.mjs","class-videos-state-search.mjs","class-videos-theme-space-white.mjs","class-videos.mjs","classroom-badges-replay-loop.mjs","classroom-badges-theme-matrix.mjs","classroom-badges-theme-space-white.mjs","classroom-badges.mjs","classroom-deck.mjs","classroom-images-open-each.mjs","classroom-images.mjs","classroom-inspector-case-assignment-layout-0.mjs","classroom-inspector-case-assignment-layout-1.mjs","classroom-inspector-case-assignment-open-0.mjs","classroom-inspector-case-assignment-open-1.mjs","classroom-inspector-case-assignment-placement-top.mjs","classroom-inspector-case-assignment-state-rubric-bottom.mjs","classroom-inspector-case-sparse-open-1.mjs","classroom-interaction-case-fresh.mjs","classroom-interaction-case-typing.mjs","classroom-layout-page-class-preset-hidden.mjs","classroom-layout-page-class-preset-reordered.mjs","classroom-layout-page-class-preset-search-first.mjs","classroom-layout-page-item-control-move.mjs","classroom-layout-page-item-preset-reordered.mjs","classroom-layout-page-item-settings-open.mjs","classroom-layout-role-teacher-settings-open-theme-space-white.mjs","classroom-layout.mjs","classroom-live-door-count-0-title-long-music-1.mjs","classroom-live-door-count-1-title-long-music-1.mjs","classroom-live-door-count-27-title-long-music-1-theme-space-white.mjs","classroom-live-door-count-27-title-long-music-1.mjs","classroom-live-door-count-27-title-long-pane-26.mjs","classroom-live-door-role-student.mjs","classroom-live-door-teams-none.mjs","classroom-live-door.mjs","classroom-live-idle-overnight.mjs","classroom-live-item-i-gears-worksheet-broken.mjs","classroom-live-item-i-gears.mjs","classroom-live-item-i-levers.mjs","classroom-live-theme-space-white.mjs","classroom-live-timer-done-clock-pinned.mjs","classroom-live-timer-final-clock-pinned.mjs","classroom-live-timer-ready.mjs","classroom-live-wall-toggles.mjs","classroom-live.mjs","classroom-nav-manage-0.mjs","classroom-nav.mjs","classroom-palette-s-1-manage-0-state-legend.mjs","classroom-palette-s-1-manage-0-state-missing.mjs","classroom-palette-s-1-manage-0-state-palette.mjs","classroom-palette-s-1-manage-0-state-progress.mjs","classroom-palette-s-1-manage-0-state-search-none.mjs","classroom-palette-s-1-manage-0-state-search-typo.mjs","classroom-palette-s-1-manage-0.mjs","classroom-palette-s-1-manage-1-state-hover-ink-idea.mjs","classroom-palette-s-1-manage-1-state-hover-ink-space-white.mjs","classroom-palette-s-1-manage-1-state-palette-at.mjs","classroom-palette-s-1-manage-1-state-progress.mjs","classroom-palette-s-1-manage-1-state-settings-help.mjs","classroom-palette-s-1-manage-1-state-settings.mjs","classroom-palette-s-1-manage-1-state-voice-act.mjs","classroom-palette-s-1-manage-1-state-voice-none.mjs","classroom-palette-s-1-manage-1-state-voice.mjs","classroom-profile-menu-state-space-white.mjs","classroom-profile-menu.mjs","classroom-projector-demo-1-theme-space-white.mjs","classroom-projector-demo-1.mjs","classroom-projector-demo-bare-face-dial.mjs","classroom-projector-demo-clock-face-dial-clock-pinned-theme-matrix.mjs","classroom-projector-demo-clock-face-dial-clock-pinned-theme-space-white.mjs","classroom-projector-demo-clock-face-dial-clock-pinned.mjs","classroom-projector-demo-clock-follow-signedout.mjs","classroom-projector-demo-clock-session-1.mjs","classroom-projector-demo-clock.mjs","classroom-projector-demo-counts.mjs","classroom-projector-demo-done-clock-pinned-theme-space-white.mjs","classroom-projector-demo-done-clock-pinned.mjs","classroom-projector-demo-final-clock-pinned-theme-space-white.mjs","classroom-projector-demo-final-clock-pinned.mjs","classroom-projector-demo-full-theme-matrix.mjs","classroom-projector-demo-full-theme-space-white.mjs","classroom-projector-demo-full.mjs","classroom-projector-demo-names.mjs","classroom-projector-demo-stale.mjs","classroom-projector-demo-timer-theme-space-white.mjs","classroom-projector-demo-timer.mjs","classroom-split-s-1-item-i-crowded-manage-1-names-long-nav-18.mjs","classroom-split-s-1-item-i-crowded-manage-1-state-collapsed.mjs","classroom-split-s-1-item-i-crowded-manage-1-sweep-fit.mjs","classroom-split-s-1-item-i-crowded-manage-1.mjs","classroom-split-s-1-item-i-draft-manage-1-state-edit-drop.mjs","classroom-split-s-1-item-i-draft-manage-1-state-edit-layer.mjs","classroom-split-s-1-manage-0-sweep-fit.mjs","classroom-split-s-1-manage-1-state-compose-assignment-rubric.mjs","classroom-split-s-1-manage-1-state-edit-layer.mjs","classroom-split-s-1-manage-1-state-page-drop.mjs","classroom-split-s-1-manage-1-state-pane-keeps.mjs","classroom-split-s-1-manage-1-state-selected.mjs","classroom-split-s-1-manage-1-state-units.mjs","classroom-split-s-1-manage-1-sweep-fit.mjs","classroom-split-s-1-manage-1.mjs","classroom-standing-state-missing.mjs","classroom-standing-state-optional-before.mjs","classroom-standing-state-optional.mjs","classroom-standing.mjs","classroom-stream-manage-1.mjs","classroom-stream-sweep-fit.mjs","classroom-student-attention-1-checkins-1.mjs","classroom-student-moderate-1.mjs","classroom-student-state-inactive.mjs","classroom-student-state-no-account.mjs","classroom-student-state-sections-theme-space-white.mjs","classroom-student-state-sections.mjs","classroom-student-state-slideshow.mjs","classroom-student-state-strip-pictures-12-theme-space-white.mjs","classroom-student-state-strip-pictures-12.mjs","classroom-student-state-unavailable.mjs","classroom-student-theme-matrix.mjs","classroom-student-theme-space-white.mjs","classroom-student.mjs","classroom-teams-details-1.mjs","classroom-teams-later-posted.mjs","classroom-teams-mine-0.mjs","classroom-teams-role-teacher-style-1.mjs","classroom-teams-role-teacher-theme-space-white.mjs","classroom-teams-role-teacher-window-closed.mjs","classroom-teams-role-teacher-window-forever.mjs","classroom-teams-role-teacher.mjs","classroom-teams-sets-2.mjs","classroom-teams-style-1-state-saved-theme-space-white.mjs","classroom-teams-style-1-state-saved.mjs","classroom-teams-style-1.mjs","classroom-teams-styled-extremes-control-full.mjs","classroom-teams-styled-extremes.mjs","classroom-teams-theme-space-white.mjs","classroom-teams-window-closed.mjs","classroom-teams.mjs","classroom-theme-db-old.mjs","classroom-theme-role-teacher.mjs","classroom-theme-theme-matrix.mjs","classroom-theme-theme-space-white.mjs","classroom-theme-votes-none.mjs","classroom-theme-voting-closed.mjs","classroom-theme.mjs","classroom-todo-archived-1-current-s-old-eng.mjs","classroom-todo-archived-1-state-class-menu-theme-space-white.mjs","classroom-todo-archived-1-state-class-menu.mjs","classroom-todo-archived-1-state-strip-open.mjs","classroom-todo-archived-1-theme-space-white.mjs","classroom-todo-archived-1.mjs","classroom-todo-staff-1.mjs","classroom-todo-state-hover-ink-idea.mjs","classroom-todo-state-hover-ink-space-white.mjs","classroom-todo-todo-empty-1.mjs","classroom-todo-todo-state-missing.mjs","classroom-todo-todo-view-done-class-s-eng.mjs","classroom-todo-todo.mjs","classroom-todo.mjs","classroom-tools-live-stalled.mjs","classroom-tools-open-hall-pass-scope-manager.mjs","classroom-tools-open-hall-pass.mjs","classroom-tools-open-song-queue.mjs","classroom-tools.mjs","classroom-tour-s-1-item-i-beam-manage-0-tour-offered-state-walk.mjs","classroom-tour-s-1-item-i-beam-manage-0-tour-offered.mjs","classroom-tour-s-1-item-i-missing-manage-0-tour-offered.mjs","classroom-tour-s-1-item-i-tonight-manage-1-tour-offered.mjs","classroom-tour-s-1-manage-0-tour-offered-dupes-2.mjs","classroom-tour-s-1-manage-0-tour-offered-state-walk.mjs","classroom-tour-s-1-manage-0.mjs","classroom-tour-s-1-manage-1-state-walk-space-white.mjs","classroom-tour-s-1-manage-1-state-walk.mjs","classroom-tour-s-1-manage-1-tour-finished-state-settings.mjs","classroom-tour-s-1-manage-1-tour-offered-dupes-0.mjs","classroom-tour-s-1-manage-1-tour-offered-dupes-2.mjs","classroom-tour-s-1-manage-1.mjs","classroom-upload.mjs","classroom-view-as-notebook.mjs","classroom-view-class-bulk-state-no-units.mjs","classroom-view-class-bulk-state-selected.mjs","classroom-view-class-bulk-student.mjs","classroom-view-class-bulk.mjs","classroom-view-class-teacher.mjs","classroom-view-grades-sweep-fit.mjs","classroom-view-people-student-links.mjs","classroom-view-people-sweep-fit.mjs","classroom-view-settings-sweep-fit.mjs","classroom-view-settings.mjs","classroom-view-updates.mjs","code-census-census-empty.mjs","code-census.mjs","coin-balance-role-camera-0.mjs","coin-balance-role-state-camera.mjs","coin-balance-role.mjs","coin-balance-scenario-auditor.mjs","coin-balance-scenario-debt.mjs","coin-balance.mjs","coin-desk-area-economy.mjs","coin-desk-area-roles.mjs","coin-desk-area-students-scope-section.mjs","coin-desk-area-students.mjs","coin-desk-staff-state-approve-all.mjs","coin-desk-staff-state-split.mjs","coin-desk-staff-view-digest-scope-section.mjs","coin-desk-staff-view-digest.mjs","coin-desk-staff-view-payday.mjs","coin-desk-staff-view-queue-scope-section.mjs","coin-desk-staff-view-tournaments-scope-section.mjs","coin-desk-staff-view-tournaments.mjs","coin-desk-staff.mjs","coin-desk-state-picker.mjs","coin-desk.mjs","coin-fine-state-sheet.mjs","coin-fine.mjs","coin-home-who-out.mjs","coin-home-who-staff.mjs","coin-home.mjs","coin-market-banner-space-white.mjs","coin-market-banner.mjs","coin-market-debt-1.mjs","coin-market-hall-pass.mjs","coin-market-state-claim.mjs","coin-market-state-pin.mjs","coin-market-state-review.mjs","coin-market-state-send.mjs","coin-market-theme-space-white.mjs","coin-market-view-coin-page.mjs","coin-market-view-desk.mjs","coin-market.mjs","coin-stocks-detail-1.mjs","coin-stocks-halt-1.mjs","coin-stocks-theme-space-white.mjs","coin-stocks.mjs","coins-signedin-1-space-white.mjs","coins-signedin-1.mjs","coins-space-white-session-two.mjs","coins.mjs","composer-attach.mjs","composer-draft.mjs","composer-drop.mjs","copy-forward.mjs","deploy-safety-case-control.mjs","deploy-safety-case-deck-sweep-fit.mjs","deploy-safety-case-deck.mjs","deploy-safety-case-idle.mjs","deploy-safety-case-projector.mjs","deploy-safety-case-text.mjs","deploy-safety-case-upload.mjs","deploy-safety-editors.mjs","deploy-safety.mjs","duplicate-drafts-state-empty.mjs","duplicate-drafts.mjs","feedback-assignment-signedin-0.mjs","feedback-assignment-signedin-1.mjs","feedback-assignment-signedin-fail.mjs","feedback-assignment-slug-idea-blade-rulebook-v2-2-signedin-0.mjs","feedback-assignment-slug-idea113-blade-05-qr-signedin-0.mjs","feedback-speech-pauses.mjs","feedback-speech-restart.mjs","feedback-state-admin-link.mjs","feedback-state-dictating-escape.mjs","feedback-state-dictating.mjs","feedback-view-armory.mjs","feedback-view-console-edit-drive.mjs","feedback-view-console-edit-hidden.mjs","feedback-view-console-edit-stale.mjs","feedback-view-console-edit-unavailable.mjs","feedback-view-console-horizon-both-theme-space-white.mjs","feedback-view-console-horizon-both.mjs","feedback-view-console-spam-1.mjs","feedback-view-console-undo-hold.mjs","feedback-view-incidents.mjs","feedback.mjs","foundry-admin-refusal.mjs","foundry-admin.mjs","foundry-author.mjs","foundry-boards-fixture-major-theme-space-white.mjs","foundry-boards-fixture-major.mjs","foundry-boards-fixture-unplayed.mjs","foundry-boards-state-hours.mjs","foundry-boards-state-search-exact.mjs","foundry-boards-state-search-loose.mjs","foundry-boards-state-search-none.mjs","foundry-boards-state-trending.mjs","foundry-boards-state-updated.mjs","foundry-boards.mjs","foundry-cover-editor.mjs","foundry-covers.mjs","foundry-forge-report-room.mjs","foundry-forge-theme-space-white.mjs","foundry-forge.mjs","foundry-gallery-state-detail-stats.mjs","foundry-gallery-state-full-screen.mjs","foundry-gallery-state-major-theme-space-white.mjs","foundry-gallery-state-major.mjs","foundry-gallery.mjs","foundry-mosaic.mjs","foundry-publishers.mjs","foundry-requests.mjs","foundry-room-state-play-quick.mjs","foundry-room-surface-author.mjs","foundry-room-surface-review-theme-space-white.mjs","foundry-room-surface-review.mjs","foundry-room-theme-space-white.mjs","foundry-room.mjs","foundry-site.mjs","foundry-submit.mjs","frc-report-room.mjs","frc-state-review-console.mjs","frc-state-reviewer.mjs","frc-state-student.mjs","frc.mjs","fsp-tech-selection-report-room.mjs","gauntlet-community-picked-3.mjs","gauntlet-community.mjs","gauntlet-rank-state.mjs","gauntlet-run.mjs","gauntlet-shell-countdown.mjs","gauntlet-shell-foot-clear.mjs","gauntlet-shell-report-room.mjs","gauntlet-shell.mjs","grading-bulk-case-batch.mjs","grading-bulk-leak-1.mjs","grading-bulk-state-dock.mjs","grading-bulk-state-no-rubric.mjs","grading-bulk-state-pre-0242.mjs","grading-bulk-state-redesign.mjs","grading-bulk-state-section.mjs","grading-bulk-state-single.mjs","grading-bulk-state-undo.mjs","grading-bulk-sweep-fit.mjs","grading-bulk.mjs","grading-change-state-pre-0171.mjs","grading-change-state-selected.mjs","grading-change.mjs","grading-files-mode-section.mjs","grading-files-source-broken.mjs","grading-files-source-none.mjs","grading-files.mjs","grading-incomplete-state-exports.mjs","grading-incomplete.mjs","grading-queue-view-grades.mjs","grading-queue.mjs","grading-rubric-speech-hold-field-crit.mjs","grading-rubric-speech-hold-switch-next.mjs","grading-rubric-speech-hold.mjs","grading-rubric-state-edited.mjs","grading-rubric.mjs","grading.mjs","greenline-portal-view-garage-seed-approved.mjs","greenline-portal-view-garage-seed-pending-panel-livery.mjs","greenline-portal-view-garage-seed-pending.mjs","greenline-portal-view-garage-seed-rejected.mjs","greenline-portal-view-moderation-seed-pending.mjs","greenline-portal-view-moderation.mjs","greenline-portal.mjs","hall-pass.mjs","home-feed-base-dev-state-class-link.mjs","home-feed-mode-teacher-state-attention-theme-space-white.mjs","home-feed-mode-teacher-state-attention.mjs","home-feed-state-fold-key-theme-matrix.mjs","home-feed-state-fold-key-theme-space-white.mjs","home-feed-state-fold-key.mjs","home-feed-state-teacher-header.mjs","home-feed-teacher.mjs","home-feed-thumbs-1-classshape-banner-mine-off.mjs","home-feed-thumbs-1-classshape-banner.mjs","home-feed-thumbs-1-full-1-mine-banner.mjs","home-feed-thumbs-1-full-1-mine-wide.mjs","home-feed-thumbs-1-mine-off.mjs","home-feed-thumbs-1-mine-wide-theme-space-white.mjs","home-feed-thumbs-1-mine-wide.mjs","home-feed-thumbs-1.mjs","home-feed.mjs","home-order-dictation-ink.mjs","home-order-role-student-classes-0-rows-3.mjs","home-order-role-student-classes-1-rows-3-state-changelog-matrix.mjs","home-order-role-student-classes-1-rows-3-state-changelog-more.mjs","home-order-role-student-classes-1-rows-3-state-changelog-space-white.mjs","home-order-role-student-classes-1-rows-3-state-changelog.mjs","home-order-role-student-classes-1-rows-3-state-feed-links-idea.mjs","home-order-role-student-classes-1-rows-3-state-feed-links-space-white.mjs","home-order-role-student-classes-1-rows-3-state-particles-space-white.mjs","home-order-role-student-classes-1-rows-3-state-preload.mjs","home-order-role-student-classes-1-rows-3-state-quick-note.mjs","home-order-role-student-classes-1-rows-3-theme-idea.mjs","home-order-role-student-classes-1-rows-3-theme-matrix.mjs","home-order-role-student-classes-1-rows-3-theme-space-white.mjs","home-order-role-student-classes-1-rows-3-ua-iphone-theme-idea.mjs","home-order-role-student-classes-1-rows-3-ua-iphone-theme-matrix.mjs","home-order-role-student-classes-1-rows-3-ua-iphone-theme-space-white.mjs","home-order-role-student-classes-1-rows-3.mjs","home-order-role-student-classes-1-rows-4-due-1-0-1-5.mjs","home-order-role-student-classes-2-rows-4-due-1-0-1-5.mjs","home-order-role-teacher-classes-1-rows-3-admin-1.mjs","home-order-role-teacher-classes-1-rows-3.mjs","home-order-role-teacher-classes-2-rows-4-due-1-0-1-5.mjs","home-order-signedout-1-display-standalone.mjs","home-order-signedout-1-install-prompt.mjs","home-order-signedout-1-ua-iphone.mjs","home-order-signedout-1.mjs","html-assignment-doc-worksheet.mjs","html-assignment-grading-console-across.mjs","html-assignment-grading-grading-catchup.mjs","html-assignment-grading-live-stalled.mjs","html-assignment-grading-roster-30.mjs","html-assignment-grading-state-answers.mjs","html-assignment-grading-state-boxed-file.mjs","html-assignment-grading-state-boxed.mjs","html-assignment-grading-state-broken.mjs","html-assignment-grading-state-closed.mjs","html-assignment-grading-state-complete.mjs","html-assignment-grading-state-empty.mjs","html-assignment-grading-state-export.mjs","html-assignment-grading-state-frame-clip.mjs","html-assignment-grading-state-graded.mjs","html-assignment-grading-state-late.mjs","html-assignment-grading-state-partial.mjs","html-assignment-grading-state-present.mjs","html-assignment-grading-state-qa.mjs","html-assignment-grading-state-unpublished.mjs","html-assignment-grading.mjs","html-assignment-live-state-closed.mjs","html-assignment-live-state-full-page-escape.mjs","html-assignment-live-state-full-page.mjs","html-assignment-live-state-list.mjs","html-assignment-live-state-reopened.mjs","html-assignment-live.mjs","html-assignment.mjs","html-instructor-copy.mjs","html-instructor.mjs","html-links-state-invalid.mjs","html-links-state-none.mjs","html-links.mjs","html-progress-state-recovered.mjs","html-progress-state-stalled-theme-matrix.mjs","html-progress-state-stalled-theme-space-white.mjs","html-progress-state-stalled.mjs","html-progress.mjs","html-rubric-state-graded.mjs","html-rubric-state-single.mjs","html-rubric.mjs","ideacad-analysis-interference-off.mjs","ideacad-analysis-state-frc.mjs","ideacad-analysis-state-printed.mjs","ideacad-analysis-state-spinner-view-open.mjs","ideacad-analysis-state-spinner.mjs","ideacad-analysis.mjs","ideacad-archive-state-readonly.mjs","ideacad-archive.mjs","ideacad-attach-role-student-state-on.mjs","ideacad-attach-role-teacher-state-badconfig.mjs","ideacad-attach-role-teacher-state-off.mjs","ideacad-attach-role-teacher-state-on.mjs","ideacad-attach-role-teacher-state-other.mjs","ideacad-context-menu-at-right.mjs","ideacad-context-menu-kind-face.mjs","ideacad-context-menu-pointer-coarse.mjs","ideacad-context-menu.mjs","ideacad-dimensions-state-editing.mjs","ideacad-dimensions-state-readonly.mjs","ideacad-dimensions.mjs","ideacad-fillet-panel-state-corner.mjs","ideacad-history-slider.mjs","ideacad-item-role-editor-state-lost.mjs","ideacad-item-role-editor.mjs","ideacad-item-role-owner-state-conflict.mjs","ideacad-item-role-owner.mjs","ideacad-item-role-viewer-state-callbacks.mjs","ideacad-item-role-viewer.mjs","ideacad-item-state-empty.mjs","ideacad-item-state-unavailable.mjs","ideacad-launch-state-naming.mjs","ideacad-launch-state-sharing.mjs","ideacad-launch.mjs","ideacad-leaves-no-scroll-lock.mjs","ideacad-live-refused-1.mjs","ideacad-live-state-loaded.mjs","ideacad-live-state-offer.mjs","ideacad-live.mjs","ideacad-preview-chooser-empty.mjs","ideacad-preview-chooser-state-refused.mjs","ideacad-preview-chooser.mjs","ideacad-role-student-state-compare.mjs","ideacad-role-student-state-history.mjs","ideacad-role-student-state-materials.mjs","ideacad-role-student-state-predicted.mjs","ideacad-role-student-state-property.mjs","ideacad-role-student-state-three.mjs","ideacad-role-teacher-state-property.mjs","ideacad-shared-role-editor-state-lost.mjs","ideacad-shared-role-editor.mjs","ideacad-shared-role-viewer-state-callbacks.mjs","ideacad-shared-role-viewer.mjs","ideacad-shared-state-empty.mjs","ideacad-shared-state-unavailable.mjs","ideacad-solid-state-arc.mjs","ideacad-solid-state-box.mjs","ideacad-solid-state-context-bar.mjs","ideacad-solid-state-coplanar-plane.mjs","ideacad-solid-state-empty.mjs","ideacad-solid-state-feedback-corner.mjs","ideacad-solid-state-fillet-step.mjs","ideacad-solid-state-fillet.mjs","ideacad-solid-state-history.mjs","ideacad-solid-state-hover.mjs","ideacad-solid-state-learn.mjs","ideacad-solid-state-mates.mjs","ideacad-solid-state-menu-empty.mjs","ideacad-solid-state-menu-side.mjs","ideacad-solid-state-menu.mjs","ideacad-solid-state-pick-filter.mjs","ideacad-solid-state-prefs.mjs","ideacad-solid-state-sheet.mjs","ideacad-solid-state-snap.mjs","ideacad-solid-state-tree.mjs","ideacad-solid.mjs","ideacad-team-role-editor-state-expiring.mjs","ideacad-team-role-editor-state-lost.mjs","ideacad-team-role-owner.mjs","ideacad-team-role-viewer.mjs","ideacad-tree.mjs","ideacad-tutorial-state-tip.mjs","ideacad-tutorial.mjs","ideacad.mjs","instructor-requests.mjs","instructor-tools-class-big-tool-email.mjs","instructor-tools-tool-email.mjs","instructor-tools-tool-picker.mjs","instructor-tools-tool-teams-edits-1.mjs","instructor-tools-tool-teams.mjs","instructor-tools.mjs","item-gallery-role-manager.mjs","item-gallery.mjs","item-header-manage-1-switch-1-shown-1.mjs","item-header-manage-1-switch-1.mjs","item-images-empty.mjs","item-images-text.mjs","item-images.mjs","item-returned-engine-v2.mjs","item-returned-engine-v3-state-new.mjs","item-returned-engine-v3.mjs","item-returned-engine-v4.mjs","item-returned-state-breakdown.mjs","item-returned-state-new-open-rubric.mjs","item-returned-state-new.mjs","item-returned.mjs","maps-edit-state-compartment.mjs","maps-edit-state-duplicates.mjs","maps-edit-state-node-pending.mjs","maps-edit-state-place.mjs","maps-edit-state-unit.mjs","maps-edit-state-walls-default.mjs","maps-edit-state-walls.mjs","maps-edit.mjs","maps-editor-state-compartment.mjs","maps-editor-state-new-room.mjs","maps-editor-state-room.mjs","maps-editor-state-root.mjs","maps-editor.mjs","maps-grants-state-granted.mjs","maps-grants-state-published.mjs","maps-grants.mjs","maps-media-photos.mjs","maps-media.mjs","maps-shelf-state-no-photos.mjs","maps-shelf.mjs","maps-viewer-state-compartment.mjs","maps-viewer-state-item.mjs","maps-viewer-state-room.mjs","maps-viewer-state-stage-end.mjs","maps-viewer-state-stage-unit.mjs","maps-viewer-state-thin-stack.mjs","maps-viewer-state-unit.mjs","maps-viewer-state-walls-room.mjs","maps-viewer-state-walls-theme-space-white.mjs","maps-viewer-state-walls.mjs","maps-viewer.mjs","marks.mjs","navigation-force-1.mjs","navigation-room-nb-site-matrix.mjs","navigation-room-nb-site-space-white.mjs","navigation-room-nb.mjs","navigation-room.mjs","navigation.mjs","no-such-page.mjs","notebook-account-instructor.mjs","notebook-capture-latency-150-item-i-2.mjs","notebook-capture-latency-150.mjs","notebook-fail-notes.mjs","notebook-grid-insert.mjs","notebook-latency-1200-state-turn-in-during-create.mjs","notebook-latency-1200.mjs","notebook-plate-matrix.mjs","notebook-review-locked-1-mode-approve.mjs","notebook-review-locked-1-site-space-white.mjs","notebook-review-locked-1.mjs","notebook-review-realtime-stalled.mjs","notebook-review-student-manager-1.mjs","notebook-review-student.mjs","notebook-review-viewer-instructor-nosections-1.mjs","notebook-review-viewer-instructor.mjs","notebook-review-viewer-reviewer.mjs","notebook-review.mjs","notebook-scope-class-site-space-white.mjs","notebook-scope-class.mjs","notebook-sheet.mjs","notebook-site-matrix.mjs","notebook-site-space-white.mjs","notebook-state-corrector-site-space-white.mjs","notebook-state-corrector.mjs","notebook-state-log-bulk-1.mjs","notebook-state-log-filed-lock.mjs","notebook-state-log-saved-draft.mjs","notebook-state-log-template-grid.mjs","notebook-state-log-template.mjs","notebook-state-log.mjs","notebook-timeline.mjs","notebook.mjs","pathways-state-not-yet.mjs","pathways.mjs","portal-admin-owner-1.mjs","portal-admin-theme-space-white.mjs","portal-admin-used-roster-admins.mjs","portal-admin.mjs","post-thumbnails-manage-1-shape-wide.mjs","post-thumbnails-shape-banner-state-moved.mjs","post-thumbnails-shape-banner-theme-space-white.mjs","post-thumbnails-shape-off.mjs","post-thumbnails-shape-wide.mjs","post-thumbnails-view-bridge.mjs","post-thumbnails-view-click.mjs","post-thumbnails-view-editor-editdoc-draft.mjs","post-thumbnails-view-editor-editdoc-notemplate-manual.mjs","post-thumbnails-view-editor-editdoc-notemplate.mjs","post-thumbnails-view-editor-editdoc-refused.mjs","post-thumbnails-view-editor-editdoc-scheduled.mjs","post-thumbnails-view-editor-forms-1.mjs","post-thumbnails-view-editor.mjs","post-thumbnails-view-settings.mjs","post-thumbnails.mjs","presence-presence-off.mjs","presence-state-away.mjs","presence-state-open-elsewhere.mjs","presence.mjs","presentation-queue-state-empty.mjs","presentation-queue-state-list-notes-0.mjs","presentation-queue-state-list.mjs","presentation-queue-state-team.mjs","profile-menu-held-1.mjs","profile-menu-pathway-csee-state-not-yet.mjs","profile-menu-pathway-none-refuse-rls.mjs","profile-menu-pathway-none-state-pathway.mjs","profile-menu-state-open.mjs","profile-menu-style-set.mjs","profile-menu.mjs","progressive-feedback.mjs","quick-note-hidden-1-view-inbox.mjs","quick-note-latency-700-state-remount.mjs","quick-note-s-1-fail-create.mjs","quick-note-s-1-item-i-1-deck.mjs","quick-note-s-1-item-i-1-grade.mjs","quick-note-s-1-item-i-1.mjs","quick-note-s-1-signedout-1.mjs","quick-note-s-1-state-menu.mjs","quick-note-state-emptied.mjs","quick-note-state-pagehide.mjs","quick-note-state-turnedin.mjs","quick-note-view-inbox.mjs","short-links.mjs","signoff-queue.mjs","song-queue.mjs","spec-importer-case-assignment.mjs","spec-importer-case-staging.mjs","spec-table-empty-1.mjs","spec-table-open.mjs","spec-table-rows-12.mjs","spec-table.mjs","tab-icon-theme-matrix.mjs","tab-icon-theme-space-white.mjs","tab-icon.mjs","team-board.mjs","team-grade.mjs","team-plan.mjs","test-accounts-admin.mjs","theme-switch-report-corner-theme-space-white.mjs","theme-switch-report-corner.mjs","theme-switch-signedout-1.mjs","theme-switch-state-idea.mjs","theme-switch-state-matrix.mjs","theme-switch-sweep-fit.mjs","theme-switch.mjs","themes-report-room.mjs","themes-shape-state-idea.mjs","themes-shape-state-matrix.mjs","themes-shape-state-space-white-view-two.mjs","themes-shape-state-space-white.mjs","themes-signedout-1.mjs","themes-state-matrix-room-classroom.mjs","themes-state-matrix-room-foundry.mjs","themes-state-matrix.mjs","themes-state-space-white-report-room.mjs","themes-state-space-white.mjs","themes.mjs","tour-mode-anon.mjs","tour-mode-done.mjs","tour-mode-old-state-dismiss.mjs","tour-mode-old-state-start.mjs","tour-mode-old-theme-space-white.mjs","tour-mode-old.mjs","tour-mode-picker.mjs","tour-mode-student-role-teacher-admin-1.mjs","tour-mode-student-role-teacher.mjs","tour-mode-student-state-walk.mjs","tour-mode-student.mjs","tournament-settings-mode-create.mjs","tournament-settings-status-draft-overrides-1.mjs","tournament-settings-status-draft.mjs","tournament-settings-status-live-admin-1-state-applied.mjs","tournament-settings-status-live-admin-1.mjs","tournament-settings-status-live-unplayed-1.mjs","tournament-settings-status-live.mjs","tournament-settings-status-registration-open-cohost-1.mjs","tournament-settings-status-registration-open-refuse-host.mjs","tournament-settings-status-registration-open-refuse-team.mjs","tournament-settings-status-seeding-pools-2-results-1-team-3.mjs","tournament-settings-status-seeding-quals-1-cohost-1.mjs","tournament-thumbs.mjs","tournaments-report-room.mjs","tournaments-view-host-field-8-state-live-scores-1.mjs","tournaments-view-host-field-8-state-live.mjs","tournaments-view-list-signedin-1-admin-1.mjs","tournaments-view-list-signedin-1.mjs","tournaments-view-list-theme-space-white.mjs","tournaments-view-list.mjs","tournaments-view-page-field-16-state-live.mjs","tournaments-view-page-field-4-state-live.mjs","tournaments-view-page-field-8-state-live.mjs","tournaments-view-register-team-2.mjs","tournaments-view-team-state-live.mjs","tournaments-view-team-state-open-stray-1.mjs","tournaments-view-team-state-open-team-3.mjs","tournaments-view-team-state-open-viewer-host.mjs","tournaments-view-team-state-open.mjs","tournaments-view-tv-status-live-field-4-state-live.mjs","tournaments-view-tv-status-live-field-8-state-live.mjs","tournaments-view-tv-status-live-field-8.mjs","tournaments-view-tv-status-registration-open-field-22.mjs","tournaments.mjs","upload-limits.mjs","view-as-admin.mjs","view-as-mode-act-long-1.mjs","view-as.mjs"],"runsMeasured":2559,"measurements":52245,"outside":1077,"outsideRows":[{"path":"/dev/armory?state=many-out","width":1152,"check":"prepare-eval","label":"() => document.documentElement.scrollHeight"},{"path":"/dev/armory?state=projects-connected&theme=space-white","width":375,"check":"control-floor","label":""},{"path":"/dev/armory?state=projects-connected&theme=space-white","width":1152,"check":"control-floor","label":""},{"path":"/dev/armory?state=projects-connected&theme=space-white","width":1440,"check":"control-floor","label":""},{"path":"/dev/armory","width":375,"check":"control-floor","label":""},{"path":"/dev/armory","width":1152,"check":"control-floor","label":""},{"path":"/dev/armory","width":1440,"check":"control-floor","label":""},{"path":"/dev/calendar?view=month","width":375,"check":"tap-target","label":"a layer key"},{"path":"/dev/calendar?view=month","width":375,"check":"presence","label":"the seven layer keys"},{"path":"/dev/calendar?view=month","width":375,"check":"presence","label":"every layer on by default"},{"path":"/dev/class-header?pattern=rays","width":375,"check":"order-result","label":"the rays flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?pattern=rays","width":1152,"check":"order-result","label":"the rays flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?pattern=rays","width":1440,"check":"order-result","label":"the rays flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?pattern=rings","width":375,"check":"order-result","label":"the rings flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?pattern=rings","width":1152,"check":"order-result","label":"the rings flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?pattern=rings","width":1440,"check":"order-result","label":"the rings flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?pattern=stripes","width":375,"check":"order-result","label":"the stripes flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?pattern=stripes","width":375,"check":"motion","label":"the stripes flow, gated behind no-preference"},{"path":"/dev/class-header?pattern=stripes","width":1152,"check":"order-result","label":"the stripes flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?pattern=stripes","width":1440,"check":"order-result","label":"the stripes flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner"},{"path":"/dev/class-header?role=teacher&posts=0&compose=1","width":1440,"check":"order-result","label":"one create, two uploads land, the refused file stays, and Attach the rest goes to the same notice"},{"path":"/dev/class-header?view=class&role=teacher","width":375,"check":"order-result","label":"a teacher's three posting keys on one line"},{"path":"/dev/classroom-images?open=each","width":375,"check":"prepare-wait","label":"() => document.documentElement.hasAttribute(\"data-fixtures-r"},{"path":"/dev/classroom-images?open=each","width":1152,"check":"prepare-wait","label":"() => document.documentElement.hasAttribute(\"data-fixtures-r"},{"path":"/dev/classroom-images?open=each","width":1440,"check":"prepare-wait","label":"() => document.documentElement.hasAttribute(\"data-fixtures-r"},{"path":"/dev/classroom-images","width":375,"check":"prepare-wait","label":"() => document.documentElement.hasAttribute(\"data-fixtures-r"},{"path":"/dev/classroom-images","width":1152,"check":"prepare-wait","label":"() => document.documentElement.hasAttribute(\"data-fixtures-r"},{"path":"/dev/classroom-images","width":1440,"check":"prepare-wait","label":"() => document.documentElement.hasAttribute(\"data-fixtures-r"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":375,"check":"contrast","label":"group heading, content and work"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":375,"check":"contrast","label":"group heading, this post"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":375,"check":"presence","label":"group: content and work"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":375,"check":"presence","label":"group: instructor only"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":375,"check":"presence","label":"group: this post"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1152,"check":"contrast","label":"group heading, content and work"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1152,"check":"contrast","label":"group heading, this post"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1152,"check":"presence","label":"group: content and work"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1152,"check":"presence","label":"group: instructor only"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1152,"check":"presence","label":"group: this post"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1152,"check":"order-result","label":"empty groups / total groups"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1152,"check":"order-result","label":"every block carries a label (heading or disclosure trigger)"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1440,"check":"contrast","label":"group heading, content and work"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1440,"check":"contrast","label":"group heading, this post"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1440,"check":"presence","label":"group: content and work"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1440,"check":"presence","label":"group: instructor only"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1440,"check":"presence","label":"group: this post"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1440,"check":"order-result","label":"empty groups / total groups"},{"path":"/dev/classroom-inspector?case=assignment&open=1","width":1440,"check":"order-result","label":"every block carries a label (heading or disclosure trigger)"},{"path":"/dev/classroom-inspector?case=sparse&open=1","width":375,"check":"presence","label":"group: this post"},{"path":"/dev/classroom-inspector?case=sparse&open=1","width":375,"check":"order-result","label":"groups rendered / blocks in them"},{"path":"/dev/classroom-inspector?case=sparse&open=1","width":1152,"check":"presence","label":"group: this post"},{"path":"/dev/classroom-inspector?case=sparse&open=1","width":1152,"check":"order-result","label":"groups rendered / blocks in them"},{"path":"/dev/classroom-inspector?case=sparse&open=1","width":1440,"check":"presence","label":"group: this post"},{"path":"/dev/classroom-inspector?case=sparse&open=1","width":1440,"check":"order-result","label":"groups rendered / blocks in them"},{"path":"/dev/classroom-live?idle=overnight","width":375,"check":"order-result","label":"a student on the page who last typed yesterday"},{"path":"/dev/classroom-live?idle=overnight","width":375,"check":"order-result","label":"the same, in another tab"},{"path":"/dev/classroom-live?idle=overnight","width":375,"check":"order-result","label":"no detail prints three or more digits of minutes, and same-day idle rows still read in minutes"},{"path":"/dev/classroom-live?idle=overnight","width":1152,"check":"order-result","label":"a student on the page who last typed yesterday"},{"path":"/dev/classroom-live?idle=overnight","width":1152,"check":"order-result","label":"the same, in another tab"},{"path":"/dev/classroom-live?idle=overnight","width":1152,"check":"order-result","label":"no detail prints three or more digits of minutes, and same-day idle rows still read in minutes"},{"path":"/dev/classroom-live?idle=overnight","width":1440,"check":"order-result","label":"a student on the page who last typed yesterday"},{"path":"/dev/classroom-live?idle=overnight","width":1440,"check":"order-result","label":"the same, in another tab"},{"path":"/dev/classroom-live?idle=overnight","width":1440,"check":"order-result","label":"no detail prints three or more digits of minutes, and same-day idle rows still read in minutes"},{"path":"/dev/classroom-live?theme=space-white","width":375,"check":"order-result","label":"the same groups under the white theme"},{"path":"/dev/classroom-live?theme=space-white","width":1152,"check":"order-result","label":"the same groups under the white theme"},{"path":"/dev/classroom-live?theme=space-white","width":1440,"check":"order-result","label":"the same groups under the white theme"},{"path":"/dev/classroom-live?wall=toggles","width":375,"check":"order-result","label":"the state line says what the wall shows, in counts"},{"path":"/dev/classroom-live?wall=toggles","width":1152,"check":"order-result","label":"the state line says what the wall shows, in counts"},{"path":"/dev/classroom-live?wall=toggles","width":1440,"check":"order-result","label":"the state line says what the wall shows, in counts"},{"path":"/dev/classroom-live","width":375,"check":"order-result","label":"the groups, in the order a teacher acts on them, with their counts"},{"path":"/dev/classroom-live","width":1152,"check":"order-result","label":"the groups, in the order a teacher acts on them, with their counts"},{"path":"/dev/classroom-live","width":1440,"check":"order-result","label":"the groups, in the order a teacher acts on them, with their counts"},{"path":"/dev/classroom-palette/s-1?manage=0&state=progress","width":375,"check":"presence","label":"with a mark beside the word"},{"path":"/dev/classroom-palette/s-1?manage=0&state=progress","width":375,"check":"presence","label":"marks: the missing row and the two finished ones"},{"path":"/dev/classroom-palette/s-1?manage=0&state=progress","width":1152,"check":"presence","label":"with a mark beside the word"},{"path":"/dev/classroom-palette/s-1?manage=0&state=progress","width":1152,"check":"presence","label":"marks: the missing row and the two finished ones"},{"path":"/dev/classroom-palette/s-1?manage=0&state=progress","width":1440,"check":"presence","label":"with a mark beside the word"},{"path":"/dev/classroom-palette/s-1?manage=0&state=progress","width":1440,"check":"presence","label":"marks: the missing row and the two finished ones"},{"path":"/dev/classroom-palette/s-1?manage=1&state=palette-at","width":375,"check":"text-contains","label":"the row is a name and a door, never an address"},{"path":"/dev/classroom-palette/s-1?manage=1&state=palette-at","width":1152,"check":"text-contains","label":"the row is a name and a door, never an address"},{"path":"/dev/classroom-palette/s-1?manage=1&state=palette-at","width":1440,"check":"text-contains","label":"the row is a name and a door, never an address"},{"path":"/dev/classroom-palette/s-1?manage=1&state=settings","width":375,"check":"order-result","label":"density on the device, the class view and the tour offer on the account, homepage untouched"},{"path":"/dev/classroom-palette/s-1?manage=1&state=settings","width":1152,"check":"order-result","label":"density on the device, the class view and the tour offer on the account, homepage untouched"},{"path":"/dev/classroom-palette/s-1?manage=1&state=settings","width":1440,"check":"order-result","label":"density on the device, the class view and the tour offer on the account, homepage untouched"},{"path":"/dev/classroom-projector?demo=counts","width":375,"check":"order-result","label":"five counts in order, and no names"},{"path":"/dev/classroom-projector?demo=counts","width":1152,"check":"order-result","label":"five counts in order, and no names"},{"path":"/dev/classroom-projector?demo=counts","width":1152,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-projector?demo=counts","width":1440,"check":"order-result","label":"five counts in order, and no names"},{"path":"/dev/classroom-projector?demo=full&theme=matrix","width":1152,"check":"contrast","label":"names"},{"path":"/dev/classroom-projector?demo=full&theme=matrix","width":1152,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-projector?demo=full&theme=matrix","width":1440,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-projector?demo=full&theme=space-white","width":1152,"check":"contrast","label":"names (washed)"},{"path":"/dev/classroom-projector?demo=full&theme=space-white","width":1152,"check":"contrast","label":"group words, muted (washed)"},{"path":"/dev/classroom-projector?demo=full&theme=space-white","width":1152,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-projector?demo=full&theme=space-white","width":1440,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-projector?demo=full","width":1152,"check":"contrast","label":"names"},{"path":"/dev/classroom-projector?demo=full","width":1152,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-projector?demo=full","width":1440,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-projector?demo=names","width":375,"check":"order-result","label":"counts, then names per group, never under Working"},{"path":"/dev/classroom-projector?demo=names","width":375,"check":"order-result","label":"the working students and the student on the hall pass are named nowhere on the wall, and no address appears"},{"path":"/dev/classroom-projector?demo=names","width":1152,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"projector-name"},{"path":"/dev/classroom-projector?demo=names","width":1152,"check":"contrast","label":"names"},{"path":"/dev/classroom-projector?demo=names","width":1152,"check":"contrast","label":"group words"},{"path":"/dev/classroom-projector?demo=names","width":1152,"check":"presence","label":"four named groups"},{"path":"/dev/classroom-projector?demo=names","width":1152,"check":"order-result","label":"counts, then names per group, never under Working"},{"path":"/dev/classroom-projector?demo=names","width":1152,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-projector?demo=names","width":1440,"check":"order-result","label":"counts, then names per group, never under Working"},{"path":"/dev/classroom-projector?demo=names","width":1440,"check":"order-result","label":"the working students and the student on the hall pass are named nowhere on the wall, and no address appears"},{"path":"/dev/classroom-projector?demo=names","width":1440,"check":"order-result","label":"8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)"},{"path":"/dev/classroom-split/s-1/item/i-crowded?manage=1&sweep=fit","width":375,"check":"control-fit","label":"an item open beside the class list: every control"},{"path":"/dev/classroom-split/s-1/item/i-crowded?manage=1&sweep=fit","width":1152,"check":"control-fit","label":"an item open beside the class list: every control"},{"path":"/dev/classroom-split/s-1/item/i-crowded?manage=1&sweep=fit","width":1440,"check":"control-fit","label":"an item open beside the class list: every control"},{"path":"/dev/classroom-split/s-1?manage=1&state=page-drop","width":375,"check":"order-result","label":"dragging a file over the page: the words are on screen, and the page does not move"},{"path":"/dev/classroom-split/s-1?manage=1&state=page-drop","width":1152,"check":"order-result","label":"dragging a file over the page: the words are on screen, and the page does not move"},{"path":"/dev/classroom-split/s-1?manage=1&state=page-drop","width":1440,"check":"order-result","label":"dragging a file over the page: the words are on screen, and the page does not move"},{"path":"/dev/classroom-standing","width":375,"check":"presence","label":"a mark beside the missing check-in word"},{"path":"/dev/classroom-standing","width":1152,"check":"presence","label":"a mark beside the missing check-in word"},{"path":"/dev/classroom-standing","width":1440,"check":"presence","label":"a mark beside the missing check-in word"},{"path":"/dev/classroom-student?attention=1&checkins=1","width":375,"check":"order-result","label":"the assignment's date and the check-in's in one column"},{"path":"/dev/classroom-student?attention=1&checkins=1","width":1152,"check":"order-result","label":"the assignment's date and the check-in's in one column"},{"path":"/dev/classroom-student","width":375,"check":"order-result","label":"every Needs attention date, assignments and check-ins alike, in one column (polish round C)"},{"path":"/dev/classroom-tools?open=hall-pass","width":375,"check":"contrast","label":"the usage line"},{"path":"/dev/classroom-tools?open=hall-pass","width":1152,"check":"contrast","label":"the usage line"},{"path":"/dev/classroom-tools?open=hall-pass","width":1440,"check":"contrast","label":"the usage line"},{"path":"/dev/classroom-tour/s-1/item/i-missing?manage=0&tour=offered","width":375,"check":"order-result","label":"the keys move and clamp the list and Enter resets it (above 1024px; below it there is no separator); the buttons step, floor and reset; the width stays on this device"},{"path":"/dev/classroom-tour/s-1/item/i-missing?manage=0&tour=offered","width":1152,"check":"order-result","label":"the keys move and clamp the list and Enter resets it (above 1024px; below it there is no separator); the buttons step, floor and reset; the width stays on this device"},{"path":"/dev/classroom-tour/s-1/item/i-missing?manage=0&tour=offered","width":1440,"check":"order-result","label":"the keys move and clamp the list and Enter resets it (above 1024px; below it there is no separator); the buttons step, floor and reset; the width stays on this device"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"contrast","label":"step title"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"contrast","label":"step words"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"contrast","label":"step count"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"contrast","label":"Skip tour"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"contrast","label":"Next / Done"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"contrast","label":"close"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"tap-target","label":"the callout controls"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":375,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 6 steps"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"contrast","label":"step title"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"contrast","label":"step words"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"contrast","label":"step count"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"contrast","label":"Skip tour"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"contrast","label":"Next / Done"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"contrast","label":"close"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"tap-target","label":"the callout controls"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1152,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 6 steps"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"contrast","label":"step title"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"contrast","label":"step words"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"contrast","label":"step count"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"contrast","label":"Skip tour"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"contrast","label":"Next / Done"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"contrast","label":"close"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"tap-target","label":"the callout controls"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk-space-white","width":1440,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 6 steps"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"contrast","label":"step title"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"contrast","label":"step words"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"contrast","label":"step count"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"contrast","label":"Skip tour"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"contrast","label":"Next / Done"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"contrast","label":"close"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"tap-target","label":"the callout controls"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 6 steps"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":375,"check":"order-result","label":"Escape: closed, handled, dismissed (not finished), focus on a header control"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"contrast","label":"step title"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"contrast","label":"step words"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"contrast","label":"step count"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"contrast","label":"Skip tour"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"contrast","label":"Next / Done"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"contrast","label":"close"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"tap-target","label":"the callout controls"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 6 steps"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1152,"check":"order-result","label":"Escape: closed, handled, dismissed (not finished), focus on a header control"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"contrast","label":"step title"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"contrast","label":"step words"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"contrast","label":"step count"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"contrast","label":"Skip tour"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"contrast","label":"Next / Done"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"contrast","label":"close"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"tap-target","label":"the callout controls"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 6 steps"},{"path":"/dev/classroom-tour/s-1?manage=1&state=walk","width":1440,"check":"order-result","label":"Escape: closed, handled, dismissed (not finished), focus on a header control"},{"path":"/dev/classroom-tour/s-1?manage=1&tour=finished&state=settings","width":375,"check":"order-result","label":"Reset on the tour asks for the offer again: it appears and is recorded as offered"},{"path":"/dev/classroom-tour/s-1?manage=1&tour=finished&state=settings","width":1152,"check":"order-result","label":"Reset on the tour asks for the offer again: it appears and is recorded as offered"},{"path":"/dev/classroom-tour/s-1?manage=1&tour=finished&state=settings","width":1440,"check":"order-result","label":"Reset on the tour asks for the offer again: it appears and is recorded as offered"},{"path":"/dev/classroom-tour/s-1?manage=1","width":375,"check":"prepare-wait","label":"() => window.__tourProbe().tours.teacher === 'offered' && wi"},{"path":"/dev/classroom-tour/s-1?manage=1","width":375,"check":"contrast","label":"offer words"},{"path":"/dev/classroom-tour/s-1?manage=1","width":375,"check":"contrast","label":"offer buttons"},{"path":"/dev/classroom-tour/s-1?manage=1","width":375,"check":"tap-target","label":"offer buttons"},{"path":"/dev/classroom-tour/s-1?manage=1","width":375,"check":"presence","label":"the teacher's offer"},{"path":"/dev/classroom-tour/s-1?manage=1","width":375,"check":"text-contains","label":"the offer is a question and two answers"},{"path":"/dev/classroom-tour/s-1?manage=1","width":375,"check":"order-result","label":"offered at once, only the teacher tour, homepage untouched, \"Take the tour\" live"},{"path":"/dev/classroom-tour/s-1?manage=1","width":375,"check":"order-result","label":"Escape on the offer: gone, not prevented elsewhere, dismissed, focus on a header control"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1152,"check":"prepare-wait","label":"() => window.__tourProbe().tours.teacher === 'offered' && wi"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1152,"check":"contrast","label":"offer words"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1152,"check":"contrast","label":"offer buttons"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1152,"check":"tap-target","label":"offer buttons"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1152,"check":"presence","label":"the teacher's offer"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1152,"check":"text-contains","label":"the offer is a question and two answers"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1152,"check":"order-result","label":"offered at once, only the teacher tour, homepage untouched, \"Take the tour\" live"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1152,"check":"order-result","label":"Escape on the offer: gone, not prevented elsewhere, dismissed, focus on a header control"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1440,"check":"prepare-wait","label":"() => window.__tourProbe().tours.teacher === 'offered' && wi"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1440,"check":"contrast","label":"offer words"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1440,"check":"contrast","label":"offer buttons"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1440,"check":"tap-target","label":"offer buttons"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1440,"check":"presence","label":"the teacher's offer"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1440,"check":"text-contains","label":"the offer is a question and two answers"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1440,"check":"order-result","label":"offered at once, only the teacher tour, homepage untouched, \"Take the tour\" live"},{"path":"/dev/classroom-tour/s-1?manage=1","width":1440,"check":"order-result","label":"Escape on the offer: gone, not prevented elsewhere, dismissed, focus on a header control"},{"path":"/dev/code-census","width":375,"check":"contrast","label":"the Added / Removed column header"},{"path":"/dev/code-census","width":375,"check":"contrast","label":"an update's subject"},{"path":"/dev/code-census","width":375,"check":"contrast","label":"its date"},{"path":"/dev/code-census","width":375,"check":"contrast","label":"lines added (green)"},{"path":"/dev/code-census","width":375,"check":"contrast","label":"lines removed (the warning ink, never crimson)"},{"path":"/dev/code-census","width":375,"check":"presence","label":"the six newest updates that changed the code"},{"path":"/dev/code-census","width":375,"check":"presence","label":"a + and a minus glyph on every row"},{"path":"/dev/code-census","width":375,"check":"presence","label":"the column header over the figures"},{"path":"/dev/code-census","width":375,"check":"presence","label":"no \"this build did not count\" sentence on a full clone"},{"path":"/dev/code-census","width":375,"check":"text-contains","label":"the panel states what is counted and what is not"},{"path":"/dev/code-census","width":375,"check":"order-result","label":"every axis accounts for the whole census"},{"path":"/dev/code-census","width":375,"check":"order-result","label":"the added and removed figures line up down the list, each with its sign"},{"path":"/dev/code-census","width":1152,"check":"contrast","label":"the Added / Removed column header"},{"path":"/dev/code-census","width":1152,"check":"contrast","label":"an update's subject"},{"path":"/dev/code-census","width":1152,"check":"contrast","label":"its date"},{"path":"/dev/code-census","width":1152,"check":"contrast","label":"lines added (green)"},{"path":"/dev/code-census","width":1152,"check":"contrast","label":"lines removed (the warning ink, never crimson)"},{"path":"/dev/code-census","width":1152,"check":"presence","label":"the six newest updates that changed the code"},{"path":"/dev/code-census","width":1152,"check":"presence","label":"a + and a minus glyph on every row"},{"path":"/dev/code-census","width":1152,"check":"presence","label":"the column header over the figures"},{"path":"/dev/code-census","width":1152,"check":"presence","label":"no \"this build did not count\" sentence on a full clone"},{"path":"/dev/code-census","width":1152,"check":"text-contains","label":"the panel states what is counted and what is not"},{"path":"/dev/code-census","width":1152,"check":"order-result","label":"every axis accounts for the whole census"},{"path":"/dev/code-census","width":1152,"check":"order-result","label":"the added and removed figures line up down the list, each with its sign"},{"path":"/dev/code-census","width":1440,"check":"contrast","label":"the Added / Removed column header"},{"path":"/dev/code-census","width":1440,"check":"contrast","label":"an update's subject"},{"path":"/dev/code-census","width":1440,"check":"contrast","label":"its date"},{"path":"/dev/code-census","width":1440,"check":"contrast","label":"lines added (green)"},{"path":"/dev/code-census","width":1440,"check":"contrast","label":"lines removed (the warning ink, never crimson)"},{"path":"/dev/code-census","width":1440,"check":"presence","label":"the six newest updates that changed the code"},{"path":"/dev/code-census","width":1440,"check":"presence","label":"a + and a minus glyph on every row"},{"path":"/dev/code-census","width":1440,"check":"presence","label":"the column header over the figures"},{"path":"/dev/code-census","width":1440,"check":"presence","label":"no \"this build did not count\" sentence on a full clone"},{"path":"/dev/code-census","width":1440,"check":"text-contains","label":"the panel states what is counted and what is not"},{"path":"/dev/code-census","width":1440,"check":"order-result","label":"every axis accounts for the whole census"},{"path":"/dev/code-census","width":1440,"check":"order-result","label":"the added and removed figures line up down the list, each with its sign"},{"path":"/dev/coin-desk-area-economy","width":1152,"check":"order-result","label":"the price list USES that width, in columns, and collapses to one on a phone"},{"path":"/dev/feedback?view=armory","width":375,"check":"type-floor","label":""},{"path":"/dev/feedback?view=armory","width":1152,"check":"type-floor","label":""},{"path":"/dev/feedback?view=armory","width":1440,"check":"type-floor","label":""},{"path":"/dev/feedback?view=incidents","width":375,"check":"order-result","label":"the person and the project filters narrow, and clearing them widens back"},{"path":"/dev/feedback?view=incidents","width":375,"check":"type-floor","label":""},{"path":"/dev/feedback?view=incidents","width":1152,"check":"order-result","label":"the person and the project filters narrow, and clearing them widens back"},{"path":"/dev/feedback?view=incidents","width":1152,"check":"type-floor","label":""},{"path":"/dev/feedback?view=incidents","width":1440,"check":"order-result","label":"the person and the project filters narrow, and clearing them widens back"},{"path":"/dev/feedback?view=incidents","width":1440,"check":"type-floor","label":""},{"path":"/dev/foundry-author","width":375,"check":"contrast","label":"author name"},{"path":"/dev/foundry-author","width":1152,"check":"contrast","label":"author name"},{"path":"/dev/foundry-author","width":1440,"check":"contrast","label":"author name"},{"path":"/dev/foundry-forge","width":375,"check":"contrast","label":"FoundryMine download control"},{"path":"/dev/foundry-forge","width":375,"check":"tap-target","label":"FoundryMine download control"},{"path":"/dev/foundry-forge","width":375,"check":"presence","label":"per-version download controls (ember-clock, 5 versions)"},{"path":"/dev/foundry-forge","width":1152,"check":"contrast","label":"FoundryMine download control"},{"path":"/dev/foundry-forge","width":1152,"check":"tap-target","label":"FoundryMine download control"},{"path":"/dev/foundry-forge","width":1152,"check":"presence","label":"per-version download controls (ember-clock, 5 versions)"},{"path":"/dev/foundry-forge","width":1440,"check":"contrast","label":"FoundryMine download control"},{"path":"/dev/foundry-forge","width":1440,"check":"tap-target","label":"FoundryMine download control"},{"path":"/dev/foundry-forge","width":1440,"check":"presence","label":"per-version download controls (ember-clock, 5 versions)"},{"path":"/dev/foundry-gallery?state=detail-stats","width":1152,"check":"order-result","label":"the figure grids spread with the pane: 2 columns at 375, 4 at 1440"},{"path":"/dev/foundry-room?surface=review","width":1440,"check":"order-result","label":"the queue has its room: at least 60% of the window above the breakpoint, the document below it"},{"path":"/dev/frc?state=reviewer","width":1152,"check":"order-result","label":"view-as-student hides the tab and strip, shows the banner, and toggles back clean"},{"path":"/dev/frc?state=reviewer","width":1440,"check":"tap-target","label":"view-as toggle"},{"path":"/dev/gauntlet-shell-countdown","width":375,"check":"presence","label":"the numeral currently on screen"},{"path":"/dev/gauntlet-shell-countdown","width":1152,"check":"presence","label":"the numeral currently on screen"},{"path":"/dev/gauntlet-shell-countdown","width":1440,"check":"presence","label":"the numeral currently on screen"},{"path":"/dev/grading-rubric?speech=hold&field=crit","width":375,"check":"order-result","label":"the mirror sits exactly over the criterion note"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"contrast","label":"empty-queue lead line"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"contrast","label":"empty decal-queue lead line"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"contrast","label":"empty decal-queue sentence"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"contrast","label":"the count line"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"tap-target","label":"queue sort controls"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"presence","label":"track queue says it is empty, deliberately"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"presence","label":"and leads with the sentence, not a fragment"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"presence","label":"decal queue says it is empty, deliberately"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"presence","label":"and leads with the sentence too"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"presence","label":"tracks section heading"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"presence","label":"decals section heading"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"text-contains","label":"the count line, which must read at zero as well"},{"path":"/dev/greenline-portal?view=moderation","width":375,"check":"text-contains","label":"the decal empty sentence says what approval is FOR"},{"path":"/dev/greenline-portal?view=moderation","width":1152,"check":"contrast","label":"empty-queue lead line"},{"path":"/dev/greenline-portal?view=moderation","width":1152,"check":"contrast","label":"empty decal-queue lead line"},{"path":"/dev/greenline-portal?view=moderation","width":1152,"check":"contrast","label":"empty decal-queue sentence"},{"path":"/dev/greenline-portal?view=moderation","width":1152,"check":"contrast","label":"the count line"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"contrast","label":"empty-queue lead line"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"contrast","label":"empty decal-queue lead line"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"contrast","label":"empty decal-queue sentence"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"contrast","label":"the count line"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"tap-target","label":"queue sort controls"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"presence","label":"track queue says it is empty, deliberately"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"presence","label":"and leads with the sentence, not a fragment"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"presence","label":"decal queue says it is empty, deliberately"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"presence","label":"and leads with the sentence too"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"presence","label":"tracks section heading"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"presence","label":"decals section heading"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"text-contains","label":"the count line, which must read at zero as well"},{"path":"/dev/greenline-portal?view=moderation","width":1440,"check":"text-contains","label":"the decal empty sentence says what approval is FOR"},{"path":"/dev/home-feed?state=teacher-header","width":375,"check":"order-result","label":"every grid point of every header lands on the link or the fold, and the fold answers its whole column"},{"path":"/dev/home-feed?state=teacher-header","width":1152,"check":"order-result","label":"every grid point of every header lands on the link or the fold, and the fold answers its whole column"},{"path":"/dev/home-feed?state=teacher-header","width":1440,"check":"order-result","label":"every grid point of every header lands on the link or the fold, and the fold answers its whole column"},{"path":"/dev/home-order?dictation=ink","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?dictation=ink","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?dictation=ink","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=0&rows=3","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=0&rows=3","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=0&rows=3","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-matrix","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-matrix","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-matrix","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":375,"check":"prepare-click","label":"#changelog-body .cl-more"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":375,"check":"prepare-eval","label":"() => { const b = document.querySelector('#changelog-body'); b.scrollT"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":375,"check":"presence","label":"three pages of rows (450)"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":375,"check":"text-contains","label":"the readout follows the pages"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1152,"check":"prepare-click","label":"#changelog-body .cl-more"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1152,"check":"prepare-eval","label":"() => { const b = document.querySelector('#changelog-body'); b.scrollT"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1152,"check":"presence","label":"three pages of rows (450)"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1152,"check":"text-contains","label":"the readout follows the pages"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1440,"check":"prepare-click","label":"#changelog-body .cl-more"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1440,"check":"prepare-eval","label":"() => { const b = document.querySelector('#changelog-body'); b.scrollT"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1440,"check":"presence","label":"three pages of rows (450)"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1440,"check":"text-contains","label":"the readout follows the pages"},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-more","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-space-white","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-space-white","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog-space-white","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=changelog","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=feed-links-idea","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=feed-links-idea","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=feed-links-idea","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=feed-links-space-white","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=feed-links-space-white","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=feed-links-space-white","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=particles-space-white","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=particles-space-white","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=particles-space-white","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=preload","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=preload","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=preload","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=quick-note","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=quick-note","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&state=quick-note","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=idea","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=idea","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=idea","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=matrix","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=matrix","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=matrix","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=space-white","width":375,"check":"order-result","label":"a colour for every card: as many title and glyph colours as cards, one edge colour, and no gradient strip"},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=space-white","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=space-white","width":1152,"check":"order-result","label":"a colour for every card: as many title and glyph colours as cards, one edge colour, and no gradient strip"},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=space-white","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=space-white","width":1440,"check":"order-result","label":"a colour for every card: as many title and glyph colours as cards, one edge colour, and no gradient strip"},{"path":"/dev/home-order?role=student&classes=1&rows=3&theme=space-white","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=idea","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=idea","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=idea","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=matrix","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=matrix","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=matrix","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=space-white","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=space-white","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=space-white","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=3","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=4&due=-1,0,1,5","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=4&due=-1,0,1,5","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=1&rows=4&due=-1,0,1,5","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=2&rows=4&due=-1,0,1,5","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=2&rows=4&due=-1,0,1,5","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=student&classes=2&rows=4&due=-1,0,1,5","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":375,"check":"contrast","label":"the Coin Desk card copy"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":375,"check":"presence","label":"the admin Coin Desk card"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":375,"check":"text-contains","label":"the Coin Desk card says it is the writing side, and names the Ledger"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":375,"check":"order-result","label":"both coin cards are on the grid, with both ids intact"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":375,"check":"order-result","label":"the two coin cards offer different verbs"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1152,"check":"contrast","label":"the Coin Desk card copy"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1152,"check":"presence","label":"the admin Coin Desk card"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1152,"check":"text-contains","label":"the Coin Desk card says it is the writing side, and names the Ledger"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1152,"check":"order-result","label":"both coin cards are on the grid, with both ids intact"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1152,"check":"order-result","label":"the two coin cards offer different verbs"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1440,"check":"contrast","label":"the Coin Desk card copy"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1440,"check":"presence","label":"the admin Coin Desk card"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1440,"check":"text-contains","label":"the Coin Desk card says it is the writing side, and names the Ledger"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1440,"check":"order-result","label":"both coin cards are on the grid, with both ids intact"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1440,"check":"order-result","label":"the two coin cards offer different verbs"},{"path":"/dev/home-order?role=teacher&classes=1&rows=3&admin=1","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=1&rows=3","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=1&rows=3","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=1&rows=3","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=2&rows=4&due=-1,0,1,5","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=2&rows=4&due=-1,0,1,5","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?role=teacher&classes=2&rows=4&due=-1,0,1,5","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&display=standalone","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&display=standalone","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&display=standalone","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&install=prompt","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&install=prompt","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&install=prompt","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&ua=iphone","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&ua=iphone","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1&ua=iphone","width":1440,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1","width":375,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1","width":1152,"check":"type-floor","label":""},{"path":"/dev/home-order?signedout=1","width":1440,"check":"type-floor","label":""},{"path":"/dev/html-assignment-grading?roster=30","width":375,"check":"order-result","label":"every row is one line (52px at most)"},{"path":"/dev/html-assignment-grading?roster=30","width":1152,"check":"order-result","label":"every row is one line (52px at most)"},{"path":"/dev/html-assignment-grading?roster=30","width":1440,"check":"order-result","label":"every row is one line (52px at most)"},{"path":"/dev/html-assignment","width":375,"check":"console-errors","label":""},{"path":"/dev/html-assignment","width":1152,"check":"console-errors","label":""},{"path":"/dev/html-assignment","width":1440,"check":"console-errors","label":""},{"path":"/dev/html-instructor/copy","width":375,"check":"console-errors","label":""},{"path":"/dev/html-instructor/copy","width":1152,"check":"console-errors","label":""},{"path":"/dev/html-instructor/copy","width":1440,"check":"console-errors","label":""},{"path":"/dev/html-rubric?state=graded","width":1152,"check":"control-floor","label":""},{"path":"/dev/html-rubric?state=graded","width":1152,"check":"squeeze","label":""},{"path":"/dev/html-rubric?state=graded","width":1440,"check":"squeeze","label":""},{"path":"/dev/html-rubric","width":1152,"check":"tap-target","label":"a level button"},{"path":"/dev/html-rubric","width":1152,"check":"presence","label":"a one-line form on every level button, with NO spec handed in (a count, not the guard -- see the comment)"},{"path":"/dev/html-rubric","width":1152,"check":"control-floor","label":""},{"path":"/dev/html-rubric","width":1152,"check":"squeeze","label":""},{"path":"/dev/html-rubric","width":1440,"check":"squeeze","label":""},{"path":"/dev/ideacad-item?role=editor&state=lost","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=editor&state=lost","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad-item?role=editor&state=lost","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=editor&state=lost","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=editor&state=lost","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=editor&state=lost","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=editor&state=lost","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=editor","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=editor","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad-item?role=editor","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=editor","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=editor","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=editor","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=editor","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=owner&state=conflict","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=owner&state=conflict","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad-item?role=owner&state=conflict","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=owner&state=conflict","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=owner&state=conflict","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=owner&state=conflict","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=owner&state=conflict","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=owner","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=owner","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad-item?role=owner","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=owner","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=owner","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=owner","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=owner","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=viewer&state=callbacks","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=viewer&state=callbacks","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad-item?role=viewer&state=callbacks","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=viewer&state=callbacks","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=viewer&state=callbacks","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=viewer&state=callbacks","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=viewer&state=callbacks","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=viewer","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=viewer","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad-item?role=viewer","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=viewer","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=viewer","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?role=viewer","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?role=viewer","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?state=empty","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?state=empty","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad-item?state=empty","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?state=empty","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?state=empty","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad-item?state=empty","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad-item?state=empty","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=compare","width":375,"check":"text-contains","label":"the sheet asks the question AND shows the physics"},{"path":"/dev/ideacad?role=student&state=compare","width":375,"check":"order-result","label":"the physics, measured the way 0160 measured the gate leaking"},{"path":"/dev/ideacad?role=student&state=compare","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=compare","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad?role=student&state=compare","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=compare","width":1152,"check":"text-contains","label":"the sheet asks the question AND shows the physics"},{"path":"/dev/ideacad?role=student&state=compare","width":1152,"check":"order-result","label":"the physics, measured the way 0160 measured the gate leaking"},{"path":"/dev/ideacad?role=student&state=compare","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=compare","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=compare","width":1440,"check":"text-contains","label":"the sheet asks the question AND shows the physics"},{"path":"/dev/ideacad?role=student&state=compare","width":1440,"check":"order-result","label":"the physics, measured the way 0160 measured the gate leaking"},{"path":"/dev/ideacad?role=student&state=compare","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=compare","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"tap-target","label":"a step, which is what a scrub is pressed on"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"tap-target","label":"Undo and Redo inside the panel"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"tap-target","label":"the way back to the feature tree"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"presence","label":"the history panel"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"presence","label":"the step count, which stands in for the scrollbar nobody paints"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"presence","label":"Undo, inside the panel"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"presence","label":"Redo, inside the panel"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"presence","label":"the undone step, still listed"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"presence","label":"the creation of the part"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"text-contains","label":"a row names a part and a parameter in the words the controls use, and the list explains why an undone step is still here"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad?role=student&state=history","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=history","width":1152,"check":"text-contains","label":"a row names a part and a parameter in the words the controls use, and the list explains why an undone step is still here"},{"path":"/dev/ideacad?role=student&state=history","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=history","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=history","width":1440,"check":"text-contains","label":"a row names a part and a parameter in the words the controls use, and the list explains why an undone step is still here"},{"path":"/dev/ideacad?role=student&state=history","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=history","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"tap-target","label":"a material or thickness picker"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"tap-target","label":"the confirm pair"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"tap-target","label":"the way back to the tree"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"tap-target","label":"Add my own material"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"tap-target","label":"the body fill slider"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"presence","label":"the Materials panel"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"presence","label":"body material, blade material, blade thickness, spin"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"presence","label":"the body fill slider"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"presence","label":"the body and blade density lines"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"presence","label":"the green check and the red X"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"presence","label":"Add my own material"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"text-contains","label":"the panel states the thickness rule and the UNVERIFIED density rather than leaving either to be discovered"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"order-result","label":"the panel replaced the tree in the tree’s own pane, and the controls drive the readouts"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad?role=student&state=materials","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=materials","width":1152,"check":"tap-target","label":"Add my own material"},{"path":"/dev/ideacad?role=student&state=materials","width":1152,"check":"tap-target","label":"the body fill slider"},{"path":"/dev/ideacad?role=student&state=materials","width":1152,"check":"presence","label":"the body fill slider"},{"path":"/dev/ideacad?role=student&state=materials","width":1152,"check":"presence","label":"Add my own material"},{"path":"/dev/ideacad?role=student&state=materials","width":1152,"check":"text-contains","label":"the panel states the thickness rule and the UNVERIFIED density rather than leaving either to be discovered"},{"path":"/dev/ideacad?role=student&state=materials","width":1152,"check":"order-result","label":"the panel replaced the tree in the tree’s own pane, and the controls drive the readouts"},{"path":"/dev/ideacad?role=student&state=materials","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=materials","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=materials","width":1440,"check":"tap-target","label":"Add my own material"},{"path":"/dev/ideacad?role=student&state=materials","width":1440,"check":"tap-target","label":"the body fill slider"},{"path":"/dev/ideacad?role=student&state=materials","width":1440,"check":"presence","label":"the body fill slider"},{"path":"/dev/ideacad?role=student&state=materials","width":1440,"check":"presence","label":"Add my own material"},{"path":"/dev/ideacad?role=student&state=materials","width":1440,"check":"text-contains","label":"the panel states the thickness rule and the UNVERIFIED density rather than leaving either to be discovered"},{"path":"/dev/ideacad?role=student&state=materials","width":1440,"check":"order-result","label":"the panel replaced the tree in the tree’s own pane, and the controls drive the readouts"},{"path":"/dev/ideacad?role=student&state=materials","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=materials","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=predicted","width":375,"check":"text-contains","label":"the physics is on screen with its units, and the prediction is quoted back"},{"path":"/dev/ideacad?role=student&state=predicted","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=predicted","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad?role=student&state=predicted","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=predicted","width":1152,"check":"text-contains","label":"the physics is on screen with its units, and the prediction is quoted back"},{"path":"/dev/ideacad?role=student&state=predicted","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=predicted","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=predicted","width":1440,"check":"text-contains","label":"the physics is on screen with its units, and the prediction is quoted back"},{"path":"/dev/ideacad?role=student&state=predicted","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=predicted","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"contrast","label":"the station table caption"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"contrast","label":"a station column header"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"contrast","label":"a station row number"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"contrast","label":"the panel’s own prose"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"contrast","label":"the profile caption"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"tap-target","label":"the confirm pair"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"tap-target","label":"a reorder control"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"tap-target","label":"the way back to the tree"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"tap-target","label":"a station cell"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"tap-target","label":"add or remove a station"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"the PropertyManager"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"station rows"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"the r and z cells"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"add and remove, one pair per station"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"the 2D profile preview"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"one dot per station on the profile"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"the green check and the red X"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"Move up and Move down"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"presence","label":"the sentence saying why no feature renames or deletes"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"text-contains","label":"the panel names its bounds rather than leaving them to be discovered"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"order-result","label":"the panel replaced the tree, in the tree’s own pane, with its table and preview inside it"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad?role=student&state=property","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"contrast","label":"the station table caption"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"contrast","label":"a station column header"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"contrast","label":"a station row number"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"contrast","label":"the panel’s own prose"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"contrast","label":"the profile caption"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"tap-target","label":"the confirm pair"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"tap-target","label":"a station cell"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"tap-target","label":"add or remove a station"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"presence","label":"station rows"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"presence","label":"the r and z cells"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"presence","label":"add and remove, one pair per station"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"presence","label":"the 2D profile preview"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"presence","label":"one dot per station on the profile"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"presence","label":"the green check and the red X"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"presence","label":"the sentence saying why no feature renames or deletes"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"text-contains","label":"the panel names its bounds rather than leaving them to be discovered"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"order-result","label":"the panel replaced the tree, in the tree’s own pane, with its table and preview inside it"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=property","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"contrast","label":"the station table caption"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"contrast","label":"a station column header"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"contrast","label":"a station row number"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"contrast","label":"the panel’s own prose"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"contrast","label":"the profile caption"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"tap-target","label":"the confirm pair"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"tap-target","label":"a station cell"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"tap-target","label":"add or remove a station"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"presence","label":"station rows"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"presence","label":"the r and z cells"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"presence","label":"add and remove, one pair per station"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"presence","label":"the 2D profile preview"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"presence","label":"one dot per station on the profile"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"presence","label":"the green check and the red X"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"presence","label":"the sentence saying why no feature renames or deletes"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"text-contains","label":"the panel names its bounds rather than leaving them to be discovered"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"order-result","label":"the panel replaced the tree, in the tree’s own pane, with its table and preview inside it"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=property","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=three","width":375,"check":"presence","label":"the failing rule chip"},{"path":"/dev/ideacad?role=student&state=three","width":375,"check":"presence","label":"the passing rule chips"},{"path":"/dev/ideacad?role=student&state=three","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=three","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad?role=student&state=three","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=three","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=three","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=student&state=three","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=student&state=three","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"contrast","label":"the station table caption"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"contrast","label":"a station row number"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"tap-target","label":"the way back to the tree"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"presence","label":"the PropertyManager"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"presence","label":"station rows, the same four"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"presence","label":"the r and z cells, shown and disabled"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"presence","label":"one dot per station on the profile"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"order-result","label":"the read-only panel occupies the pane exactly as the student’s does"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad?role=teacher&state=property","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=teacher&state=property","width":1152,"check":"contrast","label":"the station table caption"},{"path":"/dev/ideacad?role=teacher&state=property","width":1152,"check":"contrast","label":"a station row number"},{"path":"/dev/ideacad?role=teacher&state=property","width":1152,"check":"presence","label":"station rows, the same four"},{"path":"/dev/ideacad?role=teacher&state=property","width":1152,"check":"presence","label":"the r and z cells, shown and disabled"},{"path":"/dev/ideacad?role=teacher&state=property","width":1152,"check":"presence","label":"one dot per station on the profile"},{"path":"/dev/ideacad?role=teacher&state=property","width":1152,"check":"order-result","label":"the read-only panel occupies the pane exactly as the student’s does"},{"path":"/dev/ideacad?role=teacher&state=property","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=teacher&state=property","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad?role=teacher&state=property","width":1440,"check":"contrast","label":"the station table caption"},{"path":"/dev/ideacad?role=teacher&state=property","width":1440,"check":"contrast","label":"a station row number"},{"path":"/dev/ideacad?role=teacher&state=property","width":1440,"check":"presence","label":"station rows, the same four"},{"path":"/dev/ideacad?role=teacher&state=property","width":1440,"check":"presence","label":"the r and z cells, shown and disabled"},{"path":"/dev/ideacad?role=teacher&state=property","width":1440,"check":"presence","label":"one dot per station on the profile"},{"path":"/dev/ideacad?role=teacher&state=property","width":1440,"check":"order-result","label":"the read-only panel occupies the pane exactly as the student’s does"},{"path":"/dev/ideacad?role=teacher&state=property","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad?role=teacher&state=property","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad","width":375,"check":"contrast","label":"the sentence saying what the tree does not offer"},{"path":"/dev/ideacad","width":375,"check":"tap-target","label":"a FeatureManager row"},{"path":"/dev/ideacad","width":375,"check":"presence","label":"FeatureManager rows"},{"path":"/dev/ideacad","width":375,"check":"presence","label":"FeatureManager rows and the body’s expander"},{"path":"/dev/ideacad","width":375,"check":"presence","label":"the body’s expander"},{"path":"/dev/ideacad","width":375,"check":"presence","label":"rule readouts, the centre of mass and the physics"},{"path":"/dev/ideacad","width":375,"check":"text-contains","label":"the rail names the physics and prints a real figure"},{"path":"/dev/ideacad","width":375,"check":"order-result","label":"the console, the viewport and the view toolbar are where they claim to be"},{"path":"/dev/ideacad","width":375,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad","width":375,"check":"distinguishable","label":"a readout label against its own value"},{"path":"/dev/ideacad","width":375,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad","width":1152,"check":"contrast","label":"the sentence saying what the tree does not offer"},{"path":"/dev/ideacad","width":1152,"check":"presence","label":"FeatureManager rows and the body’s expander"},{"path":"/dev/ideacad","width":1152,"check":"presence","label":"the body’s expander"},{"path":"/dev/ideacad","width":1152,"check":"text-contains","label":"the rail names the physics and prints a real figure"},{"path":"/dev/ideacad","width":1152,"check":"order-result","label":"the console, the viewport and the view toolbar are where they claim to be"},{"path":"/dev/ideacad","width":1152,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad","width":1152,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/ideacad","width":1440,"check":"contrast","label":"the sentence saying what the tree does not offer"},{"path":"/dev/ideacad","width":1440,"check":"presence","label":"FeatureManager rows and the body’s expander"},{"path":"/dev/ideacad","width":1440,"check":"presence","label":"the body’s expander"},{"path":"/dev/ideacad","width":1440,"check":"text-contains","label":"the rail names the physics and prints a real figure"},{"path":"/dev/ideacad","width":1440,"check":"order-result","label":"the console, the viewport and the view toolbar are where they claim to be"},{"path":"/dev/ideacad","width":1440,"check":"layout-sanity","label":"the IdeaCAD console"},{"path":"/dev/ideacad","width":1440,"check":"distinguishable","label":"the IDEACAD eyebrow against the saved-state word"},{"path":"/dev/instructor-tools","width":375,"check":"order-result","label":"each mount states its own count from the payload, never a constant"},{"path":"/dev/instructor-tools","width":1152,"check":"order-result","label":"each mount states its own count from the payload, never a constant"},{"path":"/dev/instructor-tools","width":1440,"check":"order-result","label":"each mount states its own count from the payload, never a constant"},{"path":"/dev/item-gallery?role=manager","width":375,"check":"prepare-click","label":"[data-testid=\"zip-choice-gallery\"]"},{"path":"/dev/item-gallery?role=manager","width":1152,"check":"prepare-click","label":"[data-testid=\"zip-choice-gallery\"]"},{"path":"/dev/item-gallery?role=manager","width":1440,"check":"prepare-click","label":"[data-testid=\"zip-choice-gallery\"]"},{"path":"/dev/maps-editor?state=new-room","width":375,"check":"order-result","label":"TYPE A WIDTH AND A DEPTH: A GHOST APPEARS; PLACE HERE WRITES ITS CENTRE INTO THE TYPED FIELDS"},{"path":"/dev/maps-editor?state=new-room","width":1440,"check":"order-result","label":"TYPE A WIDTH AND A DEPTH: A GHOST APPEARS; PLACE HERE WRITES ITS CENTRE INTO THE TYPED FIELDS"},{"path":"/dev/maps-grants","width":375,"check":"contrast","label":"the containment path on a roster row"},{"path":"/dev/maps-grants","width":375,"check":"contrast","label":"the granted address on a roster row"},{"path":"/dev/maps-viewer","width":1152,"check":"order-result","label":"THE MAP TAKES THE WINDOW: panel beside map above the breakpoint, one column below it"},{"path":"/dev/notebook-review?locked=1&site=space-white","width":1152,"check":"order-result","label":"the grid is not cut: its table fits its own scrollport, beside an entry pane that holds nothing filed"},{"path":"/dev/notebook-review?locked=1","width":1152,"check":"order-result","label":"the grid is not cut: its table fits its own scrollport, beside an entry pane that holds nothing filed"},{"path":"/dev/notebook?scope=class&site=space-white","width":375,"check":"contrast","label":"the tab count words"},{"path":"/dev/notebook?scope=class&site=space-white","width":1152,"check":"contrast","label":"the tab count words"},{"path":"/dev/notebook?scope=class&site=space-white","width":1440,"check":"contrast","label":"the tab count words"},{"path":"/dev/notebook?state=log-template-grid","width":1152,"check":"order-result","label":"the grid and its number survive the template, headings after it; the manager is on screen"},{"path":"/dev/notebook?state=log-template-grid","width":1440,"check":"order-result","label":"the grid and its number survive the template, headings after it; the manager is on screen"},{"path":"/dev/pathways?state=not-yet","width":375,"check":"type-floor","label":""},{"path":"/dev/pathways?state=not-yet","width":1152,"check":"type-floor","label":""},{"path":"/dev/pathways?state=not-yet","width":1440,"check":"type-floor","label":""},{"path":"/dev/pathways","width":375,"check":"type-floor","label":""},{"path":"/dev/pathways","width":1152,"check":"type-floor","label":""},{"path":"/dev/pathways","width":1440,"check":"type-floor","label":""},{"path":"/dev/portal-admin?used=roster,admins","width":375,"check":"prepare-click","label":".panel[data-panel=\"feedback\"] .panel-title"},{"path":"/dev/portal-admin?used=roster,admins","width":375,"check":"order-result","label":"one write, spread-merged under dashboard beside the launcher homepage namespace, and the grid did not move"},{"path":"/dev/portal-admin?used=roster,admins","width":1152,"check":"prepare-click","label":".panel[data-panel=\"feedback\"] .panel-title"},{"path":"/dev/portal-admin?used=roster,admins","width":1152,"check":"order-result","label":"one write, spread-merged under dashboard beside the launcher homepage namespace, and the grid did not move"},{"path":"/dev/portal-admin?used=roster,admins","width":1440,"check":"prepare-click","label":".panel[data-panel=\"feedback\"] .panel-title"},{"path":"/dev/portal-admin?used=roster,admins","width":1440,"check":"order-result","label":"one write, spread-merged under dashboard beside the launcher homepage namespace, and the grid did not move"},{"path":"/dev/portal-admin","width":1152,"check":"order-result","label":"the grid spans the window (less the gutter) and the column count fits the width"},{"path":"/dev/post-thumbnails?shape=banner&state=moved","width":1152,"check":"prepare-wait","label":"() => document.querySelectorAll('[data-testid=\"html-thumbnai"},{"path":"/dev/post-thumbnails?shape=banner&state=moved","width":1152,"check":"presence","label":"all three live banners ready, the moved one included"},{"path":"/dev/post-thumbnails?shape=banner&theme=space-white","width":1152,"check":"prepare-wait","label":"() => document.querySelectorAll('[data-testid=\"html-thumbnai"},{"path":"/dev/post-thumbnails?shape=banner&theme=space-white","width":1152,"check":"order-result","label":"each live thumbnail was told it is a banner on a light page"},{"path":"/dev/post-thumbnails?shape=wide","width":1152,"check":"prepare-wait","label":"() => document.querySelectorAll('[data-testid=\"html-thumbnai"},{"path":"/dev/post-thumbnails?shape=wide","width":1152,"check":"order-result","label":"each live thumbnail was told it is wide"},{"path":"/dev/post-thumbnails?view=bridge","width":1152,"check":"prepare-wait","label":"() => { const s = ((window.__thumbReportsByItem ?? {})['as-g"},{"path":"/dev/post-thumbnails?view=editor&editdoc=refused","width":375,"check":"order-result","label":"the first failure: what the form says, and the preview drawn without a frame"},{"path":"/dev/post-thumbnails?view=editor&editdoc=refused","width":375,"check":"order-result","label":"Try again makes the three frames afresh, moves the focus to the status line, and forgets the failure until they fail again"},{"path":"/dev/post-thumbnails?view=editor&editdoc=refused","width":1152,"check":"order-result","label":"Try again makes the three frames afresh, moves the focus to the status line, and forgets the failure until they fail again"},{"path":"/dev/post-thumbnails?view=editor&editdoc=refused","width":1440,"check":"order-result","label":"Try again makes the three frames afresh, moves the focus to the status line, and forgets the failure until they fail again"},{"path":"/dev/post-thumbnails?view=editor&forms=1","width":375,"check":"order-result","label":"each manifest form, staged on a new post: what Automatic says, how every shape previews it, and what is said beside it"},{"path":"/dev/profile-menu?pathway=none&refuse=rls","width":375,"check":"order-result","label":"the refusal is inside the viewport, not below the fold, and not under the Sign out footer"},{"path":"/dev/profile-menu?pathway=none&refuse=rls","width":1152,"check":"order-result","label":"the refusal is inside the viewport, not below the fold, and not under the Sign out footer"},{"path":"/dev/profile-menu?pathway=none&refuse=rls","width":1440,"check":"order-result","label":"the refusal is inside the viewport, not below the fold, and not under the Sign out footer"},{"path":"/dev/theme-switch","width":375,"check":"contrast","label":"muted copy and status on the wall"},{"path":"/dev/theme-switch","width":1152,"check":"contrast","label":"muted copy and status on the wall"},{"path":"/dev/theme-switch","width":1440,"check":"contrast","label":"muted copy and status on the wall"},{"path":"/dev/themes-shape?state=idea","width":375,"check":"tap-target","label":"list expand controls (documented 30x44 exception)"},{"path":"/dev/themes-shape?state=idea","width":375,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=idea","width":1152,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=idea","width":1440,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=matrix","width":375,"check":"tap-target","label":"list expand controls (documented 30x44 exception)"},{"path":"/dev/themes-shape?state=matrix","width":375,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=matrix","width":1152,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=matrix","width":1440,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=space-white&view=two","width":375,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=space-white&view=two","width":1152,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=space-white&view=two","width":1440,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=space-white","width":375,"check":"tap-target","label":"list expand controls (documented 30x44 exception)"},{"path":"/dev/themes-shape?state=space-white","width":375,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=space-white","width":1152,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes-shape?state=space-white","width":1440,"check":"order-result","label":"the proposal is applied in the after column and absent in the before column"},{"path":"/dev/themes?state=matrix&room=classroom","width":375,"check":"type-floor","label":""},{"path":"/dev/themes?state=matrix&room=classroom","width":1152,"check":"type-floor","label":""},{"path":"/dev/themes?state=matrix&room=classroom","width":1440,"check":"type-floor","label":""},{"path":"/dev/themes?state=matrix&room=foundry","width":375,"check":"type-floor","label":""},{"path":"/dev/themes?state=matrix&room=foundry","width":1152,"check":"type-floor","label":""},{"path":"/dev/themes?state=matrix&room=foundry","width":1440,"check":"type-floor","label":""},{"path":"/dev/themes?state=matrix","width":375,"check":"type-floor","label":""},{"path":"/dev/themes?state=matrix","width":1152,"check":"type-floor","label":""},{"path":"/dev/themes?state=matrix","width":1440,"check":"type-floor","label":""},{"path":"/dev/themes?state=space-white","width":375,"check":"contrast","label":"space-white: projector, role board, muted copy and status inks on the wall (3.0 washed)"},{"path":"/dev/themes?state=space-white","width":375,"check":"contrast","label":"default card coin-desk: title"},{"path":"/dev/themes?state=space-white","width":375,"check":"type-floor","label":""},{"path":"/dev/themes?state=space-white","width":1152,"check":"contrast","label":"space-white: projector, role board, muted copy and status inks on the wall (3.0 washed)"},{"path":"/dev/themes?state=space-white","width":1152,"check":"contrast","label":"default card coin-desk: title"},{"path":"/dev/themes?state=space-white","width":1152,"check":"type-floor","label":""},{"path":"/dev/themes?state=space-white","width":1440,"check":"contrast","label":"space-white: projector, role board, muted copy and status inks on the wall (3.0 washed)"},{"path":"/dev/themes?state=space-white","width":1440,"check":"contrast","label":"default card coin-desk: title"},{"path":"/dev/themes?state=space-white","width":1440,"check":"type-floor","label":""},{"path":"/dev/themes","width":375,"check":"contrast","label":"default card coin-desk: title"},{"path":"/dev/themes","width":375,"check":"type-floor","label":""},{"path":"/dev/themes","width":1152,"check":"contrast","label":"default card coin-desk: title"},{"path":"/dev/themes","width":1152,"check":"type-floor","label":""},{"path":"/dev/themes","width":1440,"check":"contrast","label":"default card coin-desk: title"},{"path":"/dev/themes","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=anon","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=anon","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=anon","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=done","width":375,"check":"order-result","label":"and nothing was written"},{"path":"/dev/tour?mode=done","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=done","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=done","width":1152,"check":"order-result","label":"and nothing was written"},{"path":"/dev/tour?mode=done","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=done","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=done","width":1440,"check":"order-result","label":"and nothing was written"},{"path":"/dev/tour?mode=done","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=done","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&state=dismiss","width":375,"check":"prepare-click","label":"[data-testid=\"tour-offer-dismiss\"]"},{"path":"/dev/tour?mode=old&state=dismiss","width":375,"check":"presence","label":"the offer is gone"},{"path":"/dev/tour?mode=old&state=dismiss","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&state=dismiss","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&state=dismiss","width":1152,"check":"prepare-click","label":"[data-testid=\"tour-offer-dismiss\"]"},{"path":"/dev/tour?mode=old&state=dismiss","width":1152,"check":"presence","label":"the offer is gone"},{"path":"/dev/tour?mode=old&state=dismiss","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&state=dismiss","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&state=dismiss","width":1440,"check":"prepare-click","label":"[data-testid=\"tour-offer-dismiss\"]"},{"path":"/dev/tour?mode=old&state=dismiss","width":1440,"check":"presence","label":"the offer is gone"},{"path":"/dev/tour?mode=old&state=dismiss","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&state=dismiss","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&state=start","width":375,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/tour?mode=old&state=start","width":375,"check":"presence","label":"the tour is running"},{"path":"/dev/tour?mode=old&state=start","width":375,"check":"presence","label":"the offer is gone"},{"path":"/dev/tour?mode=old&state=start","width":375,"check":"order-result","label":"it starts on the welcome, with the whole tour ahead of it"},{"path":"/dev/tour?mode=old&state=start","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&state=start","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&state=start","width":1152,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/tour?mode=old&state=start","width":1152,"check":"presence","label":"the tour is running"},{"path":"/dev/tour?mode=old&state=start","width":1152,"check":"presence","label":"the offer is gone"},{"path":"/dev/tour?mode=old&state=start","width":1152,"check":"order-result","label":"it starts on the welcome, with the whole tour ahead of it"},{"path":"/dev/tour?mode=old&state=start","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&state=start","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&state=start","width":1440,"check":"prepare-click","label":"[data-testid=\"tour-offer-start\"]"},{"path":"/dev/tour?mode=old&state=start","width":1440,"check":"presence","label":"the tour is running"},{"path":"/dev/tour?mode=old&state=start","width":1440,"check":"presence","label":"the offer is gone"},{"path":"/dev/tour?mode=old&state=start","width":1440,"check":"order-result","label":"it starts on the welcome, with the whole tour ahead of it"},{"path":"/dev/tour?mode=old&state=start","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&state=start","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&theme=space-white","width":375,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=old&theme=space-white","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&theme=space-white","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&theme=space-white","width":1152,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=old&theme=space-white","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&theme=space-white","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old&theme=space-white","width":1440,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=old&theme=space-white","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old&theme=space-white","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old","width":375,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=old","width":375,"check":"order-result","label":"the offer stamped the profile when it showed, never older than the version"},{"path":"/dev/tour?mode=old","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old","width":1152,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=old","width":1152,"check":"order-result","label":"the offer stamped the profile when it showed, never older than the version"},{"path":"/dev/tour?mode=old","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=old","width":1440,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=old","width":1440,"check":"order-result","label":"the offer stamped the profile when it showed, never older than the version"},{"path":"/dev/tour?mode=old","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=old","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=picker","width":375,"check":"prepare-eval","label":"() => { const overlay = document.querySelector('.pwp-overlay'); const "},{"path":"/dev/tour?mode=picker","width":375,"check":"prepare-eval","label":"() => { const el = document.elementFromPoint(8, 8); const which = el ?"},{"path":"/dev/tour?mode=picker","width":375,"check":"presence","label":"pathway sheet (dismissed)"},{"path":"/dev/tour?mode=picker","width":375,"check":"presence","label":"scrim (gone with it)"},{"path":"/dev/tour?mode=picker","width":375,"check":"presence","label":"exit hint (gone with it)"},{"path":"/dev/tour?mode=picker","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=picker","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=picker","width":1152,"check":"prepare-eval","label":"() => { const overlay = document.querySelector('.pwp-overlay'); const "},{"path":"/dev/tour?mode=picker","width":1152,"check":"prepare-eval","label":"() => { const el = document.elementFromPoint(8, 8); const which = el ?"},{"path":"/dev/tour?mode=picker","width":1152,"check":"presence","label":"pathway sheet (dismissed)"},{"path":"/dev/tour?mode=picker","width":1152,"check":"presence","label":"scrim (gone with it)"},{"path":"/dev/tour?mode=picker","width":1152,"check":"presence","label":"exit hint (gone with it)"},{"path":"/dev/tour?mode=picker","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=picker","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=picker","width":1440,"check":"prepare-eval","label":"() => { const overlay = document.querySelector('.pwp-overlay'); const "},{"path":"/dev/tour?mode=picker","width":1440,"check":"prepare-eval","label":"() => { const el = document.elementFromPoint(8, 8); const which = el ?"},{"path":"/dev/tour?mode=picker","width":1440,"check":"presence","label":"pathway sheet (dismissed)"},{"path":"/dev/tour?mode=picker","width":1440,"check":"presence","label":"scrim (gone with it)"},{"path":"/dev/tour?mode=picker","width":1440,"check":"presence","label":"exit hint (gone with it)"},{"path":"/dev/tour?mode=picker","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=picker","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"presence","label":"the admin-only Coin Desk card, rendered for an admin"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 19 steps"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"order-result","label":"the admin cards are steps, with the rest of the page"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"order-result","label":"the staff words, not the student words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"presence","label":"the admin-only Coin Desk card, rendered for an admin"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 19 steps"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"order-result","label":"the admin cards are steps, with the rest of the page"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"order-result","label":"the staff words, not the student words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"presence","label":"the admin-only Coin Desk card, rendered for an admin"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 19 steps"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"order-result","label":"the admin cards are steps, with the rest of the page"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"order-result","label":"the staff words, not the student words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&role=teacher&admin=1","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 17 steps"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"order-result","label":"the page a teacher can see is walked"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"order-result","label":"the staff words, not the student words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&role=teacher","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 17 steps"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"order-result","label":"the page a teacher can see is walked"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"order-result","label":"the staff words, not the student words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&role=teacher","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 17 steps"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"order-result","label":"the page a teacher can see is walked"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"order-result","label":"the staff words, not the student words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&role=teacher","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 18 steps"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"order-result","label":"the steps a student can see are all walked"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"order-result","label":"page order: the to-do before the apps"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"order-result","label":"page order: a student gets the apps before the classes"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"order-result","label":"the student words, not the staff words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&state=walk","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 18 steps"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"order-result","label":"the steps a student can see are all walked"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"order-result","label":"page order: the to-do before the apps"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"order-result","label":"page order: a student gets the apps before the classes"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"order-result","label":"the student words, not the staff words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&state=walk","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"prepare-wait","label":"() => !!document.querySelector('[data-testid=\"tour-callout\"]"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"contrast","label":"step title"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"contrast","label":"step words"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"contrast","label":"step count"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"contrast","label":"Skip tour"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"contrast","label":"Next / Done"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"contrast","label":"close"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"tap-target","label":"the callout controls"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"presence","label":"the callout, on its last step"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"order-result","label":"every step: target present, on screen, clear of the callout; at least 18 steps"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"order-result","label":"opens on the welcome, ends on Take the tour"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"order-result","label":"the steps a student can see are all walked"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"order-result","label":"page order: the to-do before the apps"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"order-result","label":"page order: a student gets the apps before the classes"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"order-result","label":"the student words, not the staff words (moves the tour back; runs last)"},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student&state=walk","width":1440,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student","width":375,"check":"prepare-eval","label":"() => { const callout = document.querySelector('.tour-callout'); const"},{"path":"/dev/tour?mode=student","width":375,"check":"prepare-eval","label":"() => { const count = ((document.querySelector('.tour-count') || {}).t"},{"path":"/dev/tour?mode=student","width":375,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=student","width":375,"check":"contrast","label":"close X on the callout plate"},{"path":"/dev/tour?mode=student","width":375,"check":"contrast","label":"Skip tour on the callout plate"},{"path":"/dev/tour?mode=student","width":375,"check":"contrast","label":"Back on the callout plate"},{"path":"/dev/tour?mode=student","width":375,"check":"contrast","label":"Next / Done on its own gold wash"},{"path":"/dev/tour?mode=student","width":375,"check":"contrast","label":"the step body"},{"path":"/dev/tour?mode=student","width":375,"check":"contrast","label":"the step counter"},{"path":"/dev/tour?mode=student","width":375,"check":"tap-target","label":"close X"},{"path":"/dev/tour?mode=student","width":375,"check":"tap-target","label":"Skip tour"},{"path":"/dev/tour?mode=student","width":375,"check":"tap-target","label":"Back and Next together"},{"path":"/dev/tour?mode=student","width":375,"check":"presence","label":"the callout itself"},{"path":"/dev/tour?mode=student","width":375,"check":"presence","label":"close X"},{"path":"/dev/tour?mode=student","width":375,"check":"presence","label":"Skip tour"},{"path":"/dev/tour?mode=student","width":375,"check":"presence","label":"Back"},{"path":"/dev/tour?mode=student","width":375,"check":"presence","label":"Next / Done"},{"path":"/dev/tour?mode=student","width":375,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student","width":375,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student","width":1152,"check":"prepare-eval","label":"() => { const callout = document.querySelector('.tour-callout'); const"},{"path":"/dev/tour?mode=student","width":1152,"check":"prepare-eval","label":"() => { const count = ((document.querySelector('.tour-count') || {}).t"},{"path":"/dev/tour?mode=student","width":1152,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=student","width":1152,"check":"contrast","label":"close X on the callout plate"},{"path":"/dev/tour?mode=student","width":1152,"check":"contrast","label":"Skip tour on the callout plate"},{"path":"/dev/tour?mode=student","width":1152,"check":"contrast","label":"Back on the callout plate"},{"path":"/dev/tour?mode=student","width":1152,"check":"contrast","label":"Next / Done on its own gold wash"},{"path":"/dev/tour?mode=student","width":1152,"check":"contrast","label":"the step body"},{"path":"/dev/tour?mode=student","width":1152,"check":"contrast","label":"the step counter"},{"path":"/dev/tour?mode=student","width":1152,"check":"tap-target","label":"close X"},{"path":"/dev/tour?mode=student","width":1152,"check":"tap-target","label":"Skip tour"},{"path":"/dev/tour?mode=student","width":1152,"check":"tap-target","label":"Back and Next together"},{"path":"/dev/tour?mode=student","width":1152,"check":"presence","label":"the callout itself"},{"path":"/dev/tour?mode=student","width":1152,"check":"presence","label":"close X"},{"path":"/dev/tour?mode=student","width":1152,"check":"presence","label":"Skip tour"},{"path":"/dev/tour?mode=student","width":1152,"check":"presence","label":"Back"},{"path":"/dev/tour?mode=student","width":1152,"check":"presence","label":"Next / Done"},{"path":"/dev/tour?mode=student","width":1152,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student","width":1152,"check":"console-errors","label":""},{"path":"/dev/tour?mode=student","width":1440,"check":"prepare-eval","label":"() => { const callout = document.querySelector('.tour-callout'); const"},{"path":"/dev/tour?mode=student","width":1440,"check":"prepare-eval","label":"() => { const count = ((document.querySelector('.tour-count') || {}).t"},{"path":"/dev/tour?mode=student","width":1440,"check":"prepare-eval","label":"() => { const cv = document.createElement('canvas'); cv.width = cv.hei"},{"path":"/dev/tour?mode=student","width":1440,"check":"contrast","label":"close X on the callout plate"},{"path":"/dev/tour?mode=student","width":1440,"check":"contrast","label":"Skip tour on the callout plate"},{"path":"/dev/tour?mode=student","width":1440,"check":"contrast","label":"Back on the callout plate"},{"path":"/dev/tour?mode=student","width":1440,"check":"contrast","label":"Next / Done on its own gold wash"},{"path":"/dev/tour?mode=student","width":1440,"check":"contrast","label":"the step body"},{"path":"/dev/tour?mode=student","width":1440,"check":"contrast","label":"the step counter"},{"path":"/dev/tour?mode=student","width":1440,"check":"tap-target","label":"close X"},{"path":"/dev/tour?mode=student","width":1440,"check":"tap-target","label":"Skip tour"},{"path":"/dev/tour?mode=student","width":1440,"check":"tap-target","label":"Back and Next together"},{"path":"/dev/tour?mode=student","width":1440,"check":"presence","label":"the callout itself"},{"path":"/dev/tour?mode=student","width":1440,"check":"presence","label":"close X"},{"path":"/dev/tour?mode=student","width":1440,"check":"presence","label":"Skip tour"},{"path":"/dev/tour?mode=student","width":1440,"check":"presence","label":"Back"},{"path":"/dev/tour?mode=student","width":1440,"check":"presence","label":"Next / Done"},{"path":"/dev/tour?mode=student","width":1440,"check":"type-floor","label":""},{"path":"/dev/tour?mode=student","width":1440,"check":"console-errors","label":""},{"path":"/dev/tournaments?view=team&state=open&viewer=host","width":375,"check":"text-contains","label":"both field labels, the email one marked optional"},{"path":"/dev/tournaments?view=team&state=open&viewer=host","width":1152,"check":"text-contains","label":"both field labels, the email one marked optional"},{"path":"/dev/tournaments?view=team&state=open&viewer=host","width":1440,"check":"text-contains","label":"both field labels, the email one marked optional"},{"path":"/dev/upload-limits","width":375,"check":"presence","label":"all thirteen ceilings rendered, none collapsed away"},{"path":"/dev/upload-limits","width":375,"check":"presence","label":"and every one of them carries a refusal sentence"},{"path":"/dev/upload-limits","width":375,"check":"presence","label":"all thirteen state one, as the positive control for that zero"},{"path":"/dev/upload-limits","width":375,"check":"text-contains","label":"and the count of paths still stating nothing, which is zero"},{"path":"/dev/upload-limits","width":1152,"check":"presence","label":"all thirteen ceilings rendered, none collapsed away"},{"path":"/dev/upload-limits","width":1152,"check":"presence","label":"and every one of them carries a refusal sentence"},{"path":"/dev/upload-limits","width":1152,"check":"presence","label":"all thirteen state one, as the positive control for that zero"},{"path":"/dev/upload-limits","width":1152,"check":"text-contains","label":"and the count of paths still stating nothing, which is zero"},{"path":"/dev/upload-limits","width":1440,"check":"presence","label":"all thirteen ceilings rendered, none collapsed away"},{"path":"/dev/upload-limits","width":1440,"check":"presence","label":"and every one of them carries a refusal sentence"},{"path":"/dev/upload-limits","width":1440,"check":"presence","label":"all thirteen state one, as the positive control for that zero"},{"path":"/dev/upload-limits","width":1440,"check":"text-contains","label":"and the count of paths still stating nothing, which is zero"}],"totalMs":12384707,"selftest":{"controls":124,"negative":63,"positive":61,"failures":0}} -->
<!-- counts:measured:end -->

<!-- counts:end -->

## What this container actually has

Measured 2026-08-27, not assumed:

| Question | Answer |
| --- | --- |
| Chromium present? | **Yes** -- `141.0.7390.37` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` |
| How is it found? | `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, registered by a global playwright `1.56.1` |
| Does it start headless? | **Yes.** `--dump-dom about:blank` returns the document. The dbus errors on stderr are noise -- there is no system bus here and Chromium does not need one |
| `npx playwright install chromium` | A **no-op**: build 1194 is already at the install location |
| Could it download if it had to? | **No.** `cdn.playwright.dev` answers **403 to CONNECT** through the agent proxy (`gateway answered 403 to CONNECT (policy denial or upstream failure)`) |
| npm registry | Reachable -- `registry.npmjs.org` is in `no_proxy` |
| Screenshots | **Work** (6086-byte PNG from the probe) |
| `requestAnimationFrame` | **Fires** |
| `IntersectionObserver` | **Fires** |
| `ResizeObserver` | **Delivers** |
| Canvas `getImageData` readback, `color-mix()` parsing | **Work** |
| Web animation interpolation | **Works** (opacity 0.5 at the midpoint) |
| Google Fonts | **Blocked** -- the proxy resets `fonts.googleapis.com` |

**The last five rows are the point.** `CLAUDE.md`'s "The Browser pane" section
documents a long list of things that pane cannot do -- no compositing, rAF
frozen, `IntersectionObserver` never fires, `ResizeObserver` never delivers.
Those are facts about **that pane**, and sessions have been carrying them over
as facts about the environment. They do not hold here. Re-run `--probe` rather
than trusting this table; it prints the same rows.

### The dependency is pinned, and the pin is load-bearing

`playwright-core@1.56.1`, **exact**, chosen over `playwright`:

- `playwright-core` has no install-time browser download, so `npm install` in
  this repo cannot be broken by a blocked CDN.
- The version must match the preinstalled build. Playwright pins a chromium
  build number per release; `1.56.1` wants build **1194**, which is what is on
  disk. A different minor wants a different build, and that download is
  **403** here -- so a casual `npm update` is what would take this harness out,
  silently, with a "browser not found" that reads like a missing tool.

`browser.mjs` still resolves the executable through a reported fallback chain
(`chromium.executablePath()`, then `$CHROMIUM_PATH`, then three known paths), so
a moved binary is a named error rather than a stack trace.

## What it covers, and what it cannot

**It drives `/dev` routes only.** Those mount the real components with fixture
data, need no account and no Supabase, and are compiled out of a production
build. This is a hard boundary, not a starting set.

**It drives a SELECTED SUBSET of them, and that is also deliberate.** How many
specs, how many distinct routes and how many `/dev` pages exist to choose from
are in the counts block above, generated. They used to be written out here, and
the line was re-derived three times in one session while `integration` moved
underneath it, each reading stale before the paragraph explaining it was
finished; `integration`'s own copy was stale throughout. A spec count can move
without the route count moving, because a spec may measure a STATE of a route
another spec already drives (`?state=place` is a fifth state of
`/dev/maps-edit`), which is why both numbers are carried rather than one.
A route pass nobody waits for is a pass nobody runs. Routes earn a place by
one question -- if this surface broke silently, would anyone find out before a
student did -- not by existing. `docs/history/dev-routes-audit-5nocl7.md` has
the audit that produced the current list and the reasons the rest were left
out.

**A ROUTE IS ONLY AS GOOD AS THE ROOM IT MOUNTS IN.** A `/dev` route has no
layout above it, so it carries whatever scoped-theme wrapper its own page puts
there -- and four harnesses were found measuring a different room from the one
production gives them (`docs/history/marks-reduced-motion-test-kzaoyk.md`, and
`routes/README.md` has the working rules). Check the layout chain before
trusting any contrast or geometry number here.

**It cannot reach a real route.** `/classroom`, `/notebook`, `/foundry` and the
rest need a Bosco Tech Google session, and OAuth against a real school account
cannot happen from an automated run. A signed-in surface is verified with
`/dev/login` against a local Supabase stack (see `CLAUDE.md`), by hand. Do not
report this harness as covering a signed-in page.

Two further limits belong in any report that quotes these numbers:

- **Web fonts do not load.** The harness blocks every non-loopback request --
  the proxy resets `fonts.googleapis.com`, and an unanswered request hung the
  page load for 8s each, which took one run to **305 seconds**. Blocking is
  also what makes the run deterministic. But it means text is measured in the
  **fallback stack**, so **every pixel measurement is approximate, including
  tap-target geometry** -- a control's box depends on the line box of
  Rajdhani, which this run never loads. **Contrast is unaffected**: colour is
  resolved by painting the computed `color`/`background` and reading the
  pixel back (see below), which does not depend on which face rendered the
  glyphs. Every run prints the blocked count and says so.
- **`prefers-reduced-motion` is `no-preference` for every check except
  `motion`.** The context is opened at `no-preference` and left there, so a
  contrast, geometry or presence finding describes that state and never the
  reduced one -- the two are not inferable from each other. **`motion` is the
  exception and the only one**: it emulates the media feature itself, measures
  both states, and puts the page back to `no-preference` before it returns, so
  nothing measured after it is reading a page left in the wrong state. This
  paragraph used to say the reduced path was "not exercised" flatly; that was
  true until `/dev/marks` and is now true only of the other seven checks.

### Known findings, and the two limits above as they apply to them

**How many measurements the whole run reports outside threshold, and which
ones, is in the counts block above** -- generated, with the sha and the date it
was measured on. What follows is why each standing finding stands, which the
block cannot say. Anything the block lists that is not explained here is NEW.

This paragraph used to carry the totals by hand and they drifted every time a
lane touched the route list, for reasons that were never a check being added:
`prepare` steps became measurements (two per step, per width), and a merge
brought route specs the previous reading had never seen. A finding that leaves
the list is named below rather than deleted, because a finding that vanishes
without a word reads like a check that stopped running.

- **`/dev/foundry-submit`'s stale sentence count no longer reproduces.** It read
  `present 2, visible 2` against `exactly 4` at both widths, and still
  reproduced on this branch against `integration` at `cadf918`; the fix reached
  `integration` with `claude/navigation-loading-indicator-laqsgc`, and the spec
  now passes at both widths. It is named rather than deleted, because a finding
  that vanishes without a word reads like a check that stopped running.
- **`/dev/pathways`'s two harness controls are fixed and the row is green.**
  They measured 194.7x26.2px (min dimension 26.2px) under the 44px floor at both
  widths, for weeks, and the fix was `min-height: 44px` in that page's own
  stylesheet rather than deleting the row -- a dev page's chrome is not a
  product surface, but a standing finding every prompt has to warn the next
  session about is noise that trains a reader to skim this list. Measured
  194.7x44 now.
- **`/dev/coins` and `/dev/coins-signedin-1`: the 51px of horizontal overflow at
  375px is fixed, and the two things this bullet used to say about it were both
  wrong.**

  It said the overhang was `#student-drawer`'s header, body, close button, name,
  stats and transaction-title rows. Those measurements were real and the
  conclusion was not: `#student-drawer` is `position: fixed`, and a fixed
  subtree contributes NOTHING to a document's scrollable overflow. Its children
  are static or absolute inside that fixed ancestor, so they reach right=727-750
  against a 375 viewport and sort to the top of any offender list ordered by
  that number while contributing nothing either. **`horizontal-scroll` in
  `checks.mjs` skipped an element whose OWN `position` was fixed and did not
  walk up for a fixed ancestor**, which is why the drawer's six descendants were
  what its report showed.

  **That instrument gap is CLOSED as of 2026-09-04** (see "The checks" above for
  the measured tables behind it, including the transformed-ancestor exception
  that keeps it from becoming a false negative). `/dev/coins` and
  `/dev/coins-signedin-1` now read `0px overflow ...; 9 node(s) past the edge
  skipped as viewport-fixed` at both widths, and both specs stay green. It
  stood open for two bundles after being correctly diagnosed, because the two
  that found it did not own `checks.mjs` -- which is the argument for reporting
  a defect outside your scope rather than working around it, and also the
  argument for closing one when you do own the file.

  The cause was the Ledger's own tab bar: four tabs flexed into a 343px
  container with no `flex-wrap` and no `overflow-x`, with `Contracts` running
  329.2 -> 426.3 -- 426 being the reported `scrollWidth`, to the pixel. The
  page's own `body { overflow-x: hidden }` propagates to the viewport, so
  `scrollLeft` set to 999 read back 0 on `documentElement`, on `body`, on
  `window` and on `.tab-bar` itself: **the fourth tab of the public coin ledger
  could not be reached on a phone, by scrolling, by swiping, or at all.** It was
  worse in production than this harness could report, which is the one direction
  the fallback-stack limit above is easy to read the wrong way round -- the tabs
  are Orbitron, blocked here, and with the real face the overflow measured 89px
  rather than 51px.

  It then said the row had to stay red because the file is frozen legacy. The
  freeze is real; the conclusion was not. Its own escape hatch is an explicit
  rule, and prompt 0025 was issued with one scoped to those two CSS rules and
  nothing else in the file. `flex-wrap: wrap` and `min-height: 44px` fixed both
  the overflow and a tap-target finding nothing had ever measured (the tabs were
  33.8px tall at 1440 and 39.6px at 375). Measured at 320, 375, 414 and 1440:
  0px overflow at every one, all four tabs inside the viewport and hit-testable,
  every tab 44.0px.

  **The lesson worth keeping is that a finding recorded as permanently
  unfixable is a finding nobody reads again.** Both of these stood for weeks
  with a paragraph here explaining why nobody should look at them.
- **`ProfileMenu`'s trigger measured 34px against the 44px floor, on 69 product
  pages, and is fixed.** It never appeared in this list because nothing had ever
  measured it: the only tap-target row in the harness pointed at a dev page's
  own buttons. Prompt 0023 added a `.pm-trigger` row to `pathways.mjs` and found
  44.0x34.0 there and 100.6x34.0 on `/dev/profile-menu` and `/dev/home-order`,
  at both widths -- `Avatar size={30}` plus 2px of padding, so font-independent
  and not qualified by the fallback-stack limit above. Fixed with
  `.tap-reach-44`, which grows the HIT AREA and deliberately leaves the painted
  box at 34px: this button is a flex item of a masthead row that 69 pages size
  around, and a taller box would have moved all of their chrome. **So the rows
  measuring it are `tap-reach`, not `tap-target`** -- pointing the box check at
  a reach control reports a finding on every one of them, on a surface that is
  fine, which `checks.mjs` says in its own comment above `tapReach`. The
  hit-testing row lives on `/dev/profile-menu`, where the control is in the
  viewport; on `/dev/pathways` the stage sits ~2261px down at 375 and
  `elementFromPoint` answers null outside the viewport, so all five sample
  points there are `offscreen` and excluded from the stolen-tap gate. Geometry
  is still measured on both.
- **Two findings this list used to carry no longer reproduce**, measured on the
  same run rather than assumed: `/dev/coin-preview`'s student picker is
  **352x44** (it was 247.3x19 at 375px and 352x19 at 1440px, under the 24px
  absolute floor as well as the 44px one) and `/dev/short-links`'s composer save
  control is **112.8x44** (it was 76.1x24, a primary action that had taken
  `ShortLinkManager`'s row-ops chip floor by sharing `.btn.tiny`). Both were
  owned by their components rather than by this harness, and both have since
  been fixed there.
- **The chip label on its own fill measures 4.84:1** on `/dev/pathways`,
  which passes. This is a **contrast measurement**, which the font-loading
  limit does not qualify (see above) -- the ratio is real regardless of which
  face painted the glyphs.
- **A single `net::ERR_ABORTED` on `/dev/pathways/__data.json`** was seen once
  and did not reproduce on a second run. Treat a non-reproducing abort as
  flaky and say so rather than reporting it as a finding.

## The checks

Every check returns a **measured value**. None returns a bare pass/fail: a
number is auditable by the next reader and a green tick is not. Where a
threshold exists it is printed beside the measurement, never instead of it.

| Check | Measures |
| --- | --- |
| `horizontal-scroll` | `scrollWidth - clientWidth`, plus the widest offending elements and their overhang in px -- SKIPPING a whole viewport-fixed subtree, and counting what it skipped |
| `contrast` | WCAG ratio of the text against the **real rendered ground**, naming which ancestor supplied it |
| `tap-target` | Each control's box, the smallest min-dimension, counts under 44px and under the 24px floor, and a centre hit-test |
| `tap-reach` | A `.tap-reach-44` control's expanded HIT AREA (its `::after` pseudo-element's own geometry, recomputed the way the CSS computes it), not its box -- plus a 5-point hit test across that area for a tap a neighbour might be stealing |
| `presence` | **present**, **visible** and **aria-hidden** counts -- three different questions -- with a reason for every invisible node |
| `dom-order` | Which of two rendered elements precedes the other, read from `compareDocumentPosition` -- never a computed boolean the page happens to expose |
| `order-result` | An array a page-side action wrote (a dev transport's own call log), compared element-for-element against what it should have written -- for a claim about a WRITE, where a fixture backed by static data never re-renders to prove it on screen. A non-array on either side is refused IN WORDS, never as a silent red |
| `motion` | Per ELEMENT, in BOTH media states: how many elements animate under `no-preference`, and how many are still moving, still transformed or unpainted under `reduce`, plus the lowest resting opacity in the set |
| `console-errors` | Console errors and uncaught exceptions during the run |
| `readout-near-pointer` | A REAL DRAG: presses where a page-side probe says, moves in steps, and at each step reads whether a readout exists and how far its nearest edge sits from the pointer -- the worst distance and the count of steps with no readout. For a value that floats beside the cursor while dragging, which no static read can see because the element is not there until the drag is (`checks-visual.mjs`; `--break readout-away` is its live control) |
| `type-floor` | ON EVERY PAGE (ledger 0469): every painted text element inside the Plate (`.cr-plate`, `.site-plate`, minus the islands `plate.css` scopes away from, read off that file) whose own text has a letter or digit, at a computed size under 11px -- the count, the smallest size, and each offender's words and path (`checks-floor.mjs`; `--break small-text` is its live control) |
| `control-floor` | ON EVERY PAGE: every control inside the Plate under its floor -- 44px in both dimensions, 24px for an inline link in a line of text (measured at its line height) or a control on a declared compact instructor surface -- measured at its label, or at the absolutely positioned pseudo-element of a stretched link. A `.tap-reach-44` control is counted and left to `tap-reach` (`--break tiny-taps` is its live control) |
| `squeeze` | ON EVERY PAGE: three or more words narrower than nine of their own em and three line boxes tall, counted from the text's own client rects; a block half the window wide or more is left out here (a big heading wrapping on a phone is not a squeezed card), which the kit's default does not do. The rule `tools/hx-kit/test.mjs` judged assignments by first; it imports `squeezedText` from `checks-floor.mjs`, so the kit and the site run one implementation (`--break squeeze` is its live control) |

Three details are deliberate:

- **Contrast is measured by painting.** Colours are resolved by setting
  `ctx.fillStyle` and reading the pixel back, because a regex over computed
  styles skips `color-mix()` and `color(srgb ...)` silently and then reports the
  plate instead of the real ground. Alpha on the text is composited over that
  ground before the ratio is taken, and a `background-image` anywhere up the
  stack is flagged so the number is not read as more than it is.
- **A control inside a `<label>` is measured at the label**, which is what a
  finger hits, and both boxes are printed.
- **`aria-hidden` is a third question, not a visual one.** Folding it into
  visibility reported a perfectly painted 15.2x15.2 decorative glyph as
  invisible.
- **Visibility walks ANCESTORS for opacity, because `opacity` is not
  inherited.** A child of an `opacity: 0` parent computes opacity 1 and used to
  report itself visible while being painted nowhere -- the exact false green
  this check exists to prevent. Found by a live control: `--break invisible` set
  opacity 0 on three routes' room wrappers and every presence row came back
  green. The reason string NAMES the ancestor that did it. It also revealed that
  seven assertions on `/dev/home-order` and `/dev/home-feed` had been passing
  vacuously about rows inside entrance-faded cards; those specs settle the
  entrance in `prepare` now (see `SETTLE_ENTRANCE`) rather than writing the
  vacuum down as an exemption.
- **The offender list skips a whole FIXED SUBTREE, not only the fixed element.**
  A fixed box's containing block is the viewport, so nothing under it
  contributes to the document's scrollable overflow -- but its static and
  absolute children carry the overlay's viewport coordinates, and sorted by
  overhang they top the list. Measured in this container at 375: a 1200px static
  box grows `scrollWidth` to 1200; a 1200px fixed box, a 300px fixed box with a
  1200px static child, a fixed drawer at `left: 100%`, and a 1200px absolute
  child of a fixed box all leave it at 375. The check tested the ELEMENT'S OWN
  `position` until 2026-09-04, which is why `/dev/coins` reported six
  descendants of `#student-drawer` as the cause of an overflow the Ledger's tab
  bar was causing, for weeks. **The exception is measured too and is why this is
  not a one-line `closest()`:** a `position: fixed` box under an ancestor with
  `transform`, `translate`, `rotate`, `scale`, `perspective`, `filter`,
  `backdrop-filter` or a non-`auto` `will-change` is NOT viewport-fixed, scrolls
  with the document, and does extend it (measured, `scrollWidth` 1200 against a
  375 viewport) -- so it is still reported, tagged `captured-fixed`. The walk
  errs toward reporting: `contain` and `container-type` were measured NOT to
  capture and are treated as if they might, because a false offender gets
  investigated and a hidden overflow does not. **The skip count rides in the
  measured string** whenever it is non-zero (`/dev/coins` reads `9 node(s) past
  the edge skipped as viewport-fixed`), so an empty offender list beside a real
  overflow can be told from a sweep that skipped the cause.
- **`--tap-reach-w: 0` means zero, and used to be read as 44.** The reach width
  was `parseFloat(...) || 44`, and `0 || 44` is 44 -- so a control declaring the
  documented zero-width knob was modelled with a 44px-wide reach it does not
  have. Ten components in `src/` declare it (CLAUDE.md requires it wherever two
  controls sit closer than 44px on one line) and route specs point this check at
  three of them, so this was a live mis-measurement rather than a latent one:
  `.attach-name` is 22.5px wide, was reported at 44, and its two horizontal
  sample points were taken 22px from centre instead of 11.25px. Unset still
  defaults to 44, because that is what `var(--tap-reach-w, 44px)` in
  `src/app.css` does; the declared string is reported verbatim as
  `reachWDeclared` so a non-px value cannot be silently truncated to its number.
- **`order-result` compares arrays and only arrays, and now SAYS so.** A probe
  or a spec handing it a joined string could never come out within threshold,
  and both report columns are `JSON.stringify`, so a row written
  `expected: 'a,b,c'` against a probe returning `'a,b,c'` printed `"a,b,c"`
  twice over a red verdict with nothing saying why. Prompt 0027 wrote four such
  rows. The contract is unchanged -- accepting strings would hand back the
  separator ambiguity an element-for-element comparison exists to remove -- and
  the report is not: `measured` now reads `CANNOT COMPARE: ...` and names the
  type it got, so the two columns can never read the same again. A probe that
  THREW is reported the same way, instead of printing a bare
  `{"__evalError":"..."}` against an array.
- **The centre hit-test is recorded but is only meaningful IN THE VIEWPORT.**
  `document.elementFromPoint` answers null outside it and the harness never
  scrolls, so a control far down a long page reads `centreHitsSelf: false` --
  measured on `/dev/foundry-submit`, where the five copy controls sit ~3000px
  down at 375px and all five read false, while the same control scrolled into
  view hit-tests to itself. It is an artefact, not a finding, and it changes no
  verdict: `tapTargets` gates on the geometry alone. Do not "fix" it by
  scrolling before measuring -- that moves the boxes the check exists to
  report.

### A ZERO-BOX `[data-testid]` EARLY IN THE BODY DISABLES THE WHOLE HARNESS

`waitForApp` decides a page has painted by taking the **first** match of
`main, h1, [data-testid], .harness` and requiring it to have a non-zero box. It
takes ONE candidate, not the first candidate that has a box -- so an element
that matches, comes first in document order, and is legitimately zero-box makes
that predicate never hold, on **every route in the application**.

**Measured, not reasoned.** A `role="status"` live region added to
`src/routes/+layout.svelte` (the route-transition indicator, which is correctly
an empty 375x0 wrapper at rest) carried a `data-testid`. `/dev/marks`, a route
that component has nothing to do with, went from **"app rendered in 479ms" to
"app DID NOT RENDER (DOM never settled) in 30007ms"**, and every route/width run
from ~2.2s to ~31s -- a full pass from ~3 minutes to ~50. Nothing failed: every
check still ran and still reported the right numbers, so the only visible symptom
was the run taking sixteen times as long and a line most readers skim.

Two ways out, and the first is the one available to a lane that does not own
this directory: **do not put `data-testid` on a shell-mounted element that can
be zero-box** (that indicator uses `data-nav-progress` instead, and says why in
its own source). The second is to teach `waitForApp` to take the first candidate
WITH a box rather than the first candidate; it has not been done, deliberately,
because it changes the paint predicate for every route at once and belongs to
whoever owns `browser.mjs`.

**The tell is a run that got slow rather than a run that went red**, which is
why it is written down here: nothing about it looks like a failure.

## Reaching a state: `prepare`, and why it retries

**Paint is not interactivity, and no window marker separates them.** The
server-rendered markup is on screen before hydration attaches a single handler,
and the `__SVELTEKIT_*` globals are set by the client entry module before that
too. Measured on `/dev/spec-table`: every global present at 600ms while two
clicks in a row did nothing, and the same single click taking effect at 2500ms.

So nothing here waits on a hydration signal. `waitForApp` waits for painted
content and then for the **DOM to stop changing**, and anything that clicks uses
`clickUntil`, which repeats the click until a predicate holds and **reports the
attempt count**. A step that needed four tries is telling you something about
the surface that a silent success would not.

A `prepare` predicate is a function **source string**, invoked as `(${src})()`.
`page.evaluate(string)` treats its argument as an expression, so an arrow
function source evaluates to a function object and is never `=== true`; that bug
reported twelve failed attempts on steps whose clicks were working perfectly.

### Every step is a MEASUREMENT, not a narration

Prepare steps used to be prose printed above the results (`prepare: clicked
...`). They are `prepare-click`, `prepare-wait` and `prepare-eval` rows now,
counted in the summary and gating `--strict`, because the old shape let a step
fail for nothing: a spec handed three broken steps at once -- an `evaluate` that
throws, a `click` whose selector matches nothing, a `waitFor` that times out --
reported **"4 measurement(s), 0 outside threshold" and `--strict` exited 0**,
over a route whose every number described a state the run never reached.

**A click step passes only when the click ACTUALLY FIRED.** `clickUntil`
evaluates the step's `until` BEFORE clicking and short-circuits on "already
satisfied" (browser.mjs explains why). That is correct behaviour and a silent
trap: a predicate satisfiable by the page's RESTING state means the click never
physically fires, and the report still says "clicked". It has bitten twice for
real -- `/dev/classroom-split/s-1?manage=1` when the bulk bar started rendering
at rest, `/dev/notebook` when `.pick.free` started `aria-pressed` true -- and
measured on `/dev/song-queue` with the component's `notice` seeded non-null, the
step printed `1 matched, 0 attempt(s), already satisfied`, the whole
aria-disabled click-through contract went unproven, and the run reported 0
outside threshold.

So `attempts === 0` is a finding, and so is a click with no `until` at all. The
two ways out are both deliberate and both visible in the report: **write a
predicate naming something only the click can produce** (the preferred one --
`bulk-count` rather than `bulk-bar`), or pass **`force: true`**, which
guarantees the click fires and annotates the row `[force: predicate not required
to discriminate]` so the next reader learns it from the line rather than from
the spec file.

**`waitFor` returning at 0ms is NOT a finding**, and that is the difference from
a click: waiting is not supposed to cause anything, so a payload that had
already landed is the step working.

### `waitFor` -- the state that arrives rather than being pressed

`clickUntil` covers a state reached by pressing something. **`{ waitFor: '<predicate
source>', timeoutMs }`** covers the other one: a state that arrives when an async
payload lands, where there is nothing to press and pressing something arbitrary
to borrow a retry loop is a lie about what the step does. The wait is REPORTED in
milliseconds and a predicate that never holds prints `FAILED`, so the
measurements after it are read as describing a state the run never reached.

**It is not a longer `settleMs`, and the difference is the whole point.**
Measured on `/dev/notebook-review`: the first visit to a route pays vite's
module-graph compile, the run visits 375 before 1440, and the compliance grid's
transport had not resolved 700ms after `waitForApp` returned. The cold 375 pass
measured **0 cells** and the warm 1440 pass measured **30** -- which reads
exactly like a console that renders no grid at phone width and is nothing of the
kind. Warm, both widths render the identical 30 cells. A fixed timeout long
enough today measures an empty page the day the payload gets slower, silently,
because every selector honestly matches nothing.

### `evaluate` steps print their return value

An `evaluate` step's return value is printed beside it when it is a string or a
number. `SETTLE_ENTRANCE` in `routes/_shared.mjs` uses that to say how many cards
it settled -- a settling step that reports `0 course-card(s)` is a silent no-op
made visible, which is what happens the day a class name moves.

### `until` -- which steps read one, and what it does on each

**`until` was silently DISCARDED on an `evaluate` step, and it is honoured
now.** The branch judged such a step on whether it THREW and read `step.until`
nowhere, so a predicate an author wrote as a guarantee bought nothing, the step
reported `ok`, and the run went on measuring a state it had not reached. It is
the eighth entry in this file's own list of green checks proving nothing and the
first where the instrument threw away a guard somebody wrote on purpose.

| step | reads `until`? | what it does with it |
| --- | --- | --- |
| `click` | yes | `clickUntil`: re-clicks up to `attempts` times until the predicate holds. Fails when it never does, and when the predicate held at REST so the click never fired (above). |
| `evaluate` | yes | Re-runs the step up to `attempts` times until the predicate holds, reporting the attempt count AND the elapsed time. Fails when it never does. |
| `waitFor` | **no** | Its predicate IS its `waitFor`. An `until` beside one is reported as a `prepare-step` finding rather than ignored. |

```js
prepare: [
	// Without `until`: judged only on not throwing. Right for a step that
	// merely reads something back, wrong for one that has to LAND.
	{ evaluate: '() => window.__imgGrids()' },

	// With `until`: the step is re-run until its own predicate holds.
	{
		evaluate: '() => window.__seedThirtyCells()',
		until: '() => document.querySelectorAll(".nb-cell").length === 30',
		attempts: 12, // default 12
		gapMs: 300    // default 300, and the poll interval inside each attempt
	}
]
```

Three things about the row it produces:

- **The threshold sentence changes with the step.** Without an `until` it reads
  `the step runs without throwing`; with one, `the step runs without throwing
  AND its \`until\` then holds`. A step whose row still says the short sentence
  is a step carrying no predicate.
- **A THROW stops immediately** rather than being retried into a count. Retrying
  measures the same exception twelve times; the author needs the message.
- **A predicate that ALREADY HELD is annotated, not failed** -- the opposite
  verdict from a click, and for a stated reason. A click whose predicate held at
  rest never physically fired and reached no state; an evaluate DID run. What is
  left to say is that the predicate could not have told the difference, so the
  row carries `[the predicate ALREADY HELD before the step ran -- it does not
  discriminate]` and stays green.

**A step whose SHAPE cannot keep its promise is a `prepare-step` finding.** Two
cases, both previously silent: an `until` on a step that reads none, and a step
with no action key at all -- which is what a mistyped `evaulate:` produces, and
today it is a 200ms wait wearing a spec's clothes. A route spec is a plain
object literal, so nothing type-checks either one.

**A failed `until` prints the predicate in full**, on its own line under the
row. The label carries the step, truncated; the predicate is the half that did
not hold and is what has to be read to fix it.

`tests/browser-verify-prepare-until.test.ts` is the durable control for all of
this and lives in `npm test` rather than here, because this harness is
deliberately outside CI (below) and a discarded `until` prints `ok`, costs
nothing and reads in the spec source exactly like a working one.

### A PREPARE STEP THAT PASSES FOR A REASON NOBODY CHECKED

The `until` defect above was found while chasing a spec that passed one run in
two, always at 375, always on the first pass after a cold `vite dev` boot. **The
first fix offered for it went green three times and was wrong**, and it is
written down here because a wrong fix that goes green is harder to catch than
the bug.

It was a prepare step that cleared stale `localStorage` slots before measuring.
Three passes, three greens, finding gone. What it was actually buying was **about
300ms of incidental delay** ahead of the keystrokes -- enough, that afternoon, for
hydration to attach the handler the step's real problem was landing ahead of.
There was nothing stale to clear: browser contexts are per-run here (`openPage`
opens a fresh one per route/width), so no slot ever survives into the next run.

**The step said so itself, on the line above the green:**

```
  ok  prepare-eval [() => clearStaleSlots()]   returned -- cleared 0 stale slot(s)
```

`0` is the whole diagnosis. The step printed its own return value -- which is
exactly what that feature is for -- and the number said the work it claimed to
do had not been done, next to a row saying `ok`, in a run reporting 0 outside
threshold.

**So a prepare step is only as good as the reason it works, and the two
questions are different**: "did the finding go away" and "did this step do the
thing it says". Ask the second by reading the step's own printed return value,
and by removing the step and confirming the finding comes BACK for the reason
you think -- a delay dressed as a fix passes the first question every time.
Where the answer is genuinely "this needs to wait for something", `until` is the
spelling that says so, and since this bundle it is the spelling that does so.

## Negative controls -- the part that makes the numbers mean anything

A check that has never failed has not been tested.

`--selftest` puts every check to a pair of self-contained fixtures, one built to
break it and one built to pass it, and prints both measured values. It exits
non-zero if a check comes back green on the broken fixture or red on the sound
one, because unlike the measuring run there is a right answer here. How many
controls run, and how they split between negative and positive, is in the counts
block above; `npm run verify:readme` reads it off a `--selftest` run. It was
written out here across four readings in three days, wrong on most of them,
which is the whole argument for generating it.
Fixtures rather than a mutation of `src/` on purpose: a mutation proves a check
once in a tree that then has to be restored byte-identically, this proves it on
every run and touches nothing.

**A SLOT MAY CARRY AN `assert`, AND SOME CLAIMS NEED ONE BECAUSE within/outside
CANNOT REACH THEM.** `horizontal-scroll`'s verdict is `scrollWidth -
clientWidth` and nothing else, so no pairing of fixtures can say anything about
WHICH elements its offender list names -- and the offender list is the whole
diagnostic value of that check, and was wrong for weeks. `assert` is
`(result) => string | null` on a slot: null means the extra claim held, a string
is the reason it did not, and a slot is PROVED only when the verdict AND its
assert both hold. An assert failure is an instrument failure and is counted as
one; the controls total stays one per slot, because an assert is a second
condition on a control rather than a control of its own. Three groups use it
today (the fixed-subtree walk both ways, the honoured `--tap-reach-w: 0`, and
`order-result`'s refusal being legible), and all four of those asserts were
proved to bite by restoring the three defects in `checks.mjs` and watching the
run report `4 instrument failure(s)` and exit 1.

**`tap-reach` is a SEPARATE check from `tap-target`, not a variant of it, for a
control whose class is `.tap-reach-44` rather than `.tap-44`.** `.tap-reach-44`
(app.css) grows a control's HIT AREA with a centred `::after` pseudo-element
instead of growing the control's own box, for a control sitting inside a line
of text where inflating the box would reflow the writing around it
(`IDEA_INTERFACE_STANDARDS` 10). Pointing the ordinary box-measuring
`tap-target` check at one of these reports a finding on every single one --
CLAUDE.md names the exact case: "a box-height check would report 20 findings on
a surface that is actually fine." `tap-reach` instead recomputes the pseudo's
geometry the way the CSS computes it (only when a `::after` genuinely exists on
that element -- `getComputedStyle(el, '::after').content` is `'none'`
otherwise, and crediting every element with a reach it does not have would be
a worse defect than the one this check exists to catch) and HIT-TESTS five
points across it -- the centre and the midpoint of each edge -- because a
neighbouring reach or an opaque sibling overlapping part of it steals a tap
silently, which no amount of geometry alone can see. Sample points outside the
viewport are marked `offscreen` and excluded from the stolen-tap count and the
gate, the same artefact and the same fix `tap-target`'s own centre hit-test
already documents (see `/dev/foundry-submit` below).

**`click-through (aria-disabled control)` is not a check, it is the CLICK
MECHANISM `prepare` steps use, and it earns a control for the same reason
`wait-for` does.** This repo uses `aria-disabled` over `disabled` deliberately,
in several places, so a blocked control can still explain itself when tapped
(CLAUDE.md). Playwright's `locator.click()` performs an actionability check
that refuses a control carrying `aria-disabled="true"` -- the negative control
proves it, on a real button, in this container's own Chromium: the click times
out and the handler never fires. `clickUntil` now dispatches at the element's
own bounding-box centre with `page.mouse.click()`, a real coordinate click with
no actionability gate in front of it, which the positive control proves lands.

`--break <preset>` is the **live** control: it injects a defect into the real
page before measuring, so a session can prove a check bites on the surface in
front of it. Each preset moves exactly one measurement and leaves the rest
green, which is the property that makes it worth anything.

| Preset | Reddens |
| --- | --- |
| `overflow` | `horizontal-scroll` |
| `tiny-taps` | `tap-target`, and `control-floor` on a plate page |
| `small-text` | `type-floor` (every word on the plate at 9px) |
| `squeeze` | `squeeze` (every paragraph on the plate five of its em wide) |
| `low-contrast` | `contrast` |
| `invisible` | `presence` |
| `console-error` | `console-errors` |
| `blank-text` | `text-contains` |
| `motion` | `motion` |

**`blank-text` names the compliance footers rather than sweeping the
document**, and that is deliberate: blanking every element would redden
`contrast` and `tap-target` too, and a control that reddens everything proves
nothing about the one check under test. It empties `.gt-tm p, footer p`, so it
only bites on a route that renders one. `overflow` and `invisible` name room
wrappers for the same kind of reason, and both now include `.gt-root`.

### `text-contains` -- what an element SAYS

`presence` proves an element is in the DOM and paints; `contrast` proves its ink
is readable. **Neither reads a word of it.** For a compliance surface that is
the whole question: GAUNTLET's trademark footer carries
`docs/GAUNTLET-DESIGN.md`'s nominative-attribution requirement, and a footer
whose sentence had lost "Dassault Systemes" is present, visible, and clears
4.5:1 exactly as before -- every other check in this file comes back green on
it. `textContains` takes `must` and `mustNot` phrase lists, collapses
whitespace on both sides (source is wrapped across lines; an editor reflowing a
paragraph must not redden a compliance check), and **fails on zero matched
nodes**, because a selector that matches nothing satisfies "no forbidden phrase
appears" perfectly. `mustNot` is the direction `must` cannot see: a sentence can
keep every required phrase and add one that reverses it.

### `presence`: both counts are FLOORS, and both have a ceiling

`expectPresent` and `expectVisible` are floors (`>= n`). A floor is the right
default for "the page rendered these at all" and the wrong one for every claim
of the form "and no more than these".

**`expectPresent: 0` NOW MEANS EXACTLY ZERO, and it used to mean nothing at
all.** `present >= 0` holds for any number of nodes, so every "must be absent"
row in `routes/` -- around thirty of them -- could not fail. Measured rather
than reasoned: an `<svg>` injected into `TrademarkFooter.svelte` produced
`ok presence [no mark of any kind inside the footer] present 1, visible 1` and a
run reporting 0 measurements outside threshold, on the one row whose whole job
is `docs/GAUNTLET-DESIGN.md`'s "nominative text only, never the logo or a
lookalike". `maxPresent` is the ceiling, **and it defaults to 0 whenever
`expectPresent` is 0** -- a caller asking for zero is always stating an absence,
and a floor of zero is not a weaker assertion than they meant, it is no
assertion. Pass `maxPresent` explicitly on any row whose own prose states a
count ("2 chips painted, never 3", "5 action blocks, never 6"); leave it off
where a floor is genuinely wanted (`/dev/pathways` counts chips across every
stage on purpose, and says so).

**AN ABSENCE ROW STILL CANNOT SEE A RENAMED SELECTOR.** `present 0` reads the
same whether the rule holds or the markup moved, and no ceiling can separate
those. Every absence row in `routes/` therefore sits beside a positive control
in the same spec -- the footer's own `.gt-tm`, the song queue's `[aria-disabled]`
twin, the 30 grid cells beside the two absent cell states -- and `--selftest`
carries a control that PROVES the limit rather than leaving it to be
rediscovered. A new absence row without a positive control is an assertion about
a selector, not about a surface.

`maxVisible` is the same ceiling one axis over, and it exists because some rules
here are stated as prohibitions rather than minimums. Where the visible half has
no ceiling the threshold column now prints **`visible unconstrained`** rather
than `>= 0 visible`: the remaining unconstrained rows are deliberate
(`.gt-tree` paints at 1440 and not at 375, and the spec says so), but deliberate
and invisible are different things. Omitting either ceiling on a row whose floor
is above zero changes nothing.

**It is not the right tool for an element that is hidden by being moved.**
Measured on the GAUNTLET FeatureManager rail: at 1440px the collapsed rail is
`translateX(calc(-100% - 1.5rem))` plus `pointer-events: none`, so it keeps a
real 232px box entirely off the left edge and `isVisible` correctly reports it
as painted -- `maxVisible: 0` reddened a rail behaving exactly as designed.
`isVisible` does not model "outside the viewport" and **must not be taught
to**: `tapReach` already reports off-screen sample points as a harness
artefact, so changing that predicate would move readings on routes far from the
one being worked on. Assert the EFFECT instead, with an `orderResult` probe
that hit-tests the element's own box (`/dev/gauntlet-shell` does), which
answers the same for `display: none` at 375 and an off-screen transform at 1440
-- two mechanisms, one guarantee.

### `motion` -- the reduced-motion gate, measured in the state that is hard to see

`CLAUDE.md` states one rule three times and not identically in any two of them.
The narrowest is under the launcher-card section: "Every other app mark is a
component in `$lib/marks` with a 3-4.6s loop gated behind
`prefers-reduced-motion: no-preference`, and **nothing is hidden in a base
state**: with the animation cancelled every animated element is at full opacity
and no transform, so a reduced-motion reader sees the whole glyph." The two
looser ones are "Everything animated is gated behind `prefers-reduced-motion`"
and AnimatedLogo's "spin is gated behind `prefers-reduced-motion:
no-preference`". The FRC exception is the other direction: "THE FRC MARK IS
NEVER ANIMATED ... FIRST's brand guidelines prohibit altering the mark, and
motion is an alteration."

**MEASURING THE ANIMATION RUNNING PROVES NOTHING ABOUT THE CANCELLED STATE**,
which is the whole difficulty. So the check flips Chromium's own emulation of
the media feature and reads the SAME elements twice:

- **RUNNING** (`no-preference`) discovers which elements animate at all. That
  set is the POSITIVE CONTROL: an `expect: 'gated'` entry that finds NOTHING to
  animate FAILS, because a sweep with an empty case list satisfies "nothing
  moves under reduce" perfectly and is exactly the shape a renamed class
  silently produces.
- **REDUCED** re-reads those elements. Each must have no animation attached,
  `animation-name: none`, `transform: none`, and must still be painted.

**DISCOVERY IS `Element.getAnimations()`, NOT A WALK OF `document.styleSheets`.**
The stylesheet walk is the worse instrument here for a reason `CLAUDE.md`
already names: `CSSStyleRule` has a `cssRules` property now (CSS Nesting) and
an empty `CSSRuleList` is truthy, so the ordinary shape for walking a sheet
skips every plain rule's declarations and comes back with zero matches -- which
reads exactly like a clean result. Asking the element what is attached to it has
no selector to fail to parse and no sheet to fail to read, and it reports an
`animation-play-state: paused` animation too, which is correct: paused is
attached.

**THE PAINTED PREDICATE IS NOT `isVisible`, DELIBERATELY.** `isVisible` flags a
zero-area box, which is right for a laid-out element and wrong for SVG stroke
geometry -- `<path d="M5 10v20" />` is a vertical line, so its box is 0px wide,
and every animated rail, tick and node in these marks would report itself
invisible. `motion` keeps the opacity/display/visibility half (ancestor walk
included, because `opacity` is not inherited) and drops the geometry half.

**"FULL OPACITY" IS REPORTED, NOT GATED, AND THAT IS ON PURPOSE.** These glyphs
author depth with opacity -- `.node { opacity: 0.35 }` in `GauntletMark` is its
resting value, not a dimmed frame -- so a gate at 1.0 would fail correct marks
and a gate at 0.35 would be fitted to today's data. What is GATED is "painted at
all", on the harness's own existing 0.01 floor; what is REPORTED is every
animated element's resting opacity and the lowest in the set, which is the
number a future reader can audit.

**ONE CALL SWEEPS EVERY ENTRY IN A SPEC.** Each media flip costs a settle, and
eleven marks measured one at a time would pay twenty-two per route/width. Two
flips serve the whole spec, which is why `motionSweep` returns an ARRAY of
results rather than one.

## Why it is not in `npm test` and not in CI

**What a full run costs, and what `--selftest` costs, are in the counts block
above.** Both were written out here and both were wrong repeatedly: the line
read "~34 seconds ... 8 route specs" against a tree carrying 14, a task brief
built from it put a 71.9s tree at "roughly 22 seconds", and a later brief put a
40-run 94.9s tree at "44 route/width runs at about 107 seconds". Three quoted
figures, three wrong, none of them caught by the person quoting them. That is
the failure `readme-counts.mjs` exists to end.

**What does NOT come out of the block is the budget for the NEXT spec, so it is
stated here as a range rather than a number.** The per-route/width cost is set
by what a route mounts, measured repeatedly across those readings: roughly
**2.3s** for a route mounting fixture data, and roughly **3.5s** for one with a
live canvas, an rAF clock, or the `motion` check's two media flips. A `prepare`
step costs about **0.15s** per measurement it adds, paid whether it passes or
not, because a step is JUDGED now rather than narrated. A session adding specs
budgets from that range and says out loud what its run cost.

**The marks are ELEVEN GLYPHS ON ONE ROUTE for exactly this reason.** One route
per mark would have been twenty-two runs for measurements that share a single
page load; `data-mark` keeps the reporting per-mark anyway. A pass nobody waits
for is a pass nobody runs, and the run is long enough now that the next session
adding to it should think about the cost before adding a route.

It is still deliberately outside `npm test` and outside CI:

- `npm test` is the DB suite -- real embedded Postgres, real migrations, no DOM.
  This needs a browser and a dev server. A browser failure would read as a
  database failure.
- Pushing to `main` **deploys `ideabosco.com`**, which students use during
  class. A gate that can wedge that deploy needs a much stronger reliability
  record than one bundle's worth of runs, and a browser-shaped flake would
  block a deploy for a reason that has nothing to do with the change.
- The exit code is **0 even with findings** by default. It is a measuring
  instrument. `--strict` exits 1, for a session that wants that.

**Recommendation: leave it out of CI for now.** Revisit once several sessions
have run it and the finding list is stable enough that a red run means the
change, not the harness.

## Files

| File | |
| --- | --- |
| `run.mjs` | CLI, report formatting, `--break` presets |
| `browser.mjs` | Executable resolution, launch, `waitForApp`, `clickUntil`, external-request blocking |
| `server.mjs` | Boots and stops `vite dev`, handing the placeholder public env to the **child process** so no `.env` is written to the repo |
| `checks.mjs` | The six checks and the in-page colour/visibility helpers |
| `checks-floor.mjs` | The three floors every page gets (`type-floor`, `control-floor`, `squeeze`), the Plate population they read off `plate.css`, and `squeezedText`, which `tools/hx-kit/test.mjs` imports (ledger 0469) |
| `routes.mjs` | Assembles the route table from `routes/`; read it first |
| `routes/` | One file per route spec -- what is measured on each. See `routes/README.md` before adding one |
| `routes/_tools/verify-loader-guards.mjs` | Negative controls for `routes.mjs`'s two load-time refusals (`node tools/browser-verify/routes/_tools/verify-loader-guards.mjs`) -- no browser needed |
| `probe.mjs` | The environment capability probe |
| `selftest.mjs` | The negative controls |
