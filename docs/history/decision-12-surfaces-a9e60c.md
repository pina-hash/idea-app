---
title: "Decision 12's three surfaces: two closed on the arithmetic, and the third narrowed to a yes or no (`claude/decision-12-surfaces-a9e60c`)"
date: 2026-09-05
branches: [claude/decision-12-surfaces-a9e60c]
migrations: []
subsystems: ["IDEA Classroom", "Notebook", "Browser harness"]
---

Prompt 0047. No migration. Three measured tap-target violations picked up from a
decision entry: two fixed under 2.12 step 1 with their costs, one refused and handed
back with the answer measured so it is a yes or no rather than a design question.

## The base

Started from `origin/integration` at `17be15b`. Git already carried a committer
identity, so the "Please tell me who you are" failure the prompt warns about did not
arise. No `docs/prompt-ledger/entries/0047-*` at HEAD.

## A1: all three reproduce, and one first reading did not

Measured with the tree's own `tapReach` -- 0044's walked rewrite, which counts only the
control, a descendant, or an activating `<label>`, never a plain ancestor.

| surface | walked, 375 | walked, 1440 | 0044 said |
| --- | --- | --- | --- |
| `FolderManager` `.swatch`, all 7 | **25 x 45** | **25 x 45** | 25 wide, 7 of 7 |
| `NotebookView` `.inline-link` | **32.5 x 45** | **32.5 x 45** | 32.5 wide, 1 of 7 |
| `AttachmentList` packed page | **88 x 41.5**, 1 of 2 | **88 x 41.5**, 1 of 2 | 41.5, 1 of 2 |

**The attachment number did not reproduce on the first attempt and it was the
instrument.** The first run of the session reported 45 at 375 and 41.5 at 1440, which
reads exactly like a width-dependent layout difference and is not one: the row geometry
is byte-identical at both widths (rows 22.5 and 44 tall, centres 41.3px apart, measured).
Three consecutive re-runs all gave **41.5 at both widths**. The outlier was the first
page load after a cold `vite dev` boot, before the module graph had settled. **A single
measurement taken right after starting the dev server is not a measurement**, and the
only reason this was caught is that the number disagreed with a prior bundle's and the
prompt said to stop if it did.

**And the `.inline-link` finding is FOUR controls, not one.** Decision 12 recorded a
single 32.5px control because 0044 measured one page state. Driven through three states
at both widths, every call site of the class:

| control | width | context |
| --- | --- | --- |
| "Select" | 31.1 | toolbar control row |
| "Done" | 25.6 | toolbar control row |
| "Clear" | 25.7 | toolbar control row |
| "Expand all" | 36.3 (wrapped, at 375) | toolbar control row |
| "Clear the filters" | 89.9 | **prose** -- already over |
| "Manage folders" | 79.6 | **prose** -- already over |

That partition turned out to decide the whole question, and it is the opposite of what
the rule's own comment assumed.

## A2: three surfaces, three different causes, and none of them 0044's

0044 found its own surface short because a `.table-scroll` CLIPPED the pseudo-element.
**That cause applies to none of these.**

- **The two width failures are painted small.** `--tap-reach-w: 0px` makes the reach
  `max(100%, 0px)` -- the element's own width -- so the knob leaves the width at whatever
  the box is drawn at. The knob is CORRECT at both sites and that is the trap: seven
  swatches on a 32px pitch and a row of toolbar links 12px apart would each hand most of
  their reach to whichever neighbour paints last. The class was doing its job on height
  and there was never anything carrying width.
- **The attachment failure is two reaches overlapping vertically.** Nothing clipped it.
  The rows sit 41.3px apart centre to centre (22.5/2 + 8px gap + 44/2) and each link
  declares a 44px-tall reach, so the second row's -- painting later -- takes the bottom
  2.7px of the first's. It is the same failure `--tap-reach-w: 0px` exists to prevent
  side to side, happening top to bottom, where nothing prevents it.

**What constrains each width.** The swatches: `fieldset.colors`, inner **259px at 375**
and **332px at 1440**, `gap: 8px`, `flex-wrap: wrap` already declared. The toolbar links:
`.tools`, inner **293px at 375** and **237px at 1440**, `gap: 12px`, `flex-wrap` unset so
**nowrap**, and no `min-width: 0`.

## A3 and B1: 2.12's order, and where each one landed

The order: **1** re-lay in the space that is there; **2** carry fewer controls, which
goes to the surface's owner; **3** widen, never at the narrow width; **4** an exception,
which is a decision entry with an owner.

### Swatches -- step 1, and step 2 was not reached

One line of seven 44px targets needs `7*44 + 6*8 = 356px` against 259px at 375 and 332px
at 1440. **It does not fit at either width, and a line was never the only arrangement.**
At 44px they wrap inside the container already there: `floor((259+8)/52) = 5` per row at
375 and `floor((332+8)/52) = 6` at 1440. Measured after: **5+2 and 6+1**, two rows either
way, 0px document overflow.

So the question the prompt flagged as the likely step 2 -- whether the palette should
carry fewer colours -- **never had to be asked**. That is worth saying plainly, because
the surface that DID land on step 2 was the one nobody expected.

The dot is drawn at 44px rather than hidden inside a 44px transparent button. The
alternative needs `background-clip: content-box` plus a radial-gradient to put the 1px
rim back at 24px, which is a trick the next reader has to decode -- and it tells a
student the target is 24px when it is 44. On a phone the affordance IS the size.

### Attachments -- step 1

`min-height: 44px` on `.attach-meta`, the line that holds the link, **not a bigger list
gap**. Raising the gap 8 -> 11px also clears 44 for this pair of row heights (41.3 ->
44.3) and costs 3px instead of 21.5, and it is refused: the centre distance is
`h1/2 + gap + h2/2`, so two 22.5px rows at an 11px gap are 33.5px apart and overlap
again. A 44px floor on the line makes the distance at least `22 + gap + 22`, which is a
property rather than an arithmetic coincidence that holds for the fixture in front of us.

### Toolbar links -- step 2, refused, and handed back

`min-width: 44px` on `.inline-link` is safe on the shared class, which the measurement
above is what establishes: **every failing site is a toolbar control and both prose sites
already clear 44**, so nothing inside a sentence moves and 2.12's prose exemption is not
touched. Applied, all four controls measured 44 and both prose links stayed at 79.6 and
89.9 exactly.

**And it was reverted, because of what it costs at 375.** `.tools` carries a 137.4px sort
control, a 29.2px counter, three links and four 12px gaps:

| | content | container | |
| --- | --- | --- | --- |
| before, 375 busiest state | **307.7px** | 293px | already over by 14.7px, `docOverflow 0` |
| with the fix | **346.6px** | 293px | over by 53.6px, **`docOverflow 13`** |

The row was already over-full and the fix makes it a document overflow. That is exactly
the trade 2.12 step 3 refuses: "a target bought with a horizontal scroll a person did not
have before". So it was not shipped.

**The arrangement that fits was then measured rather than described**, so what goes back
to the owner is an answer and not a question. `flex-wrap: wrap` plus `min-width: 0` on
`.tools` -- the second being CLAUDE.md's own automatic-minimum trap, which is why the row
pushes the PAGE wider rather than just itself:

| | busiest state, 375 |
| --- | --- |
| `.tools` scrollWidth vs clientWidth | **293 vs 293** |
| document overflow | **0px** |
| toolbar height | 213 -> **245px (+32)** |
| 1440 | unchanged, 0px overflow |

That is step 1's own prescription (wrap to as many lines as the container allows), it is
one line, and it is on a rule this bundle does not own. **So the entry is no longer
"should the toolbar carry fewer controls" -- it is "may `.tools` wrap, for 32px at phone
width".** The probe was applied, measured and the file restored from a `cp` copy,
md5-verified `bcbce4eef0705a7976016c5bccc6c73e`. `git checkout --` was not used anywhere
in this bundle.

## A4: the cost, measured before and after

| | before | after |
| --- | --- | --- |
| swatch rows | 1 | **2** (5+2 at 375, 6+1 at 1440) |
| `fieldset.colors` height | 53.9 | **125.9** (+72.0) |
| folder editor form | 247 | **319** (+72) |
| folder manager panel, 375 / 1440 | 633 / 611.7 | **705 / 683.7** (+72) |
| attachment list height | 74.5 | **96** (+21.5) |
| attachment row centres | 41.3 | **52** |
| document horizontal overflow, both widths | 0 | **0** |

**Nothing was widened and no horizontal scroll was bought anywhere.** The prompt's
warning about the Coin Ledger trade did not have to be spent.

## A5: the counts block was stale before this bundle touched it

Read by identity rather than by its number: `covered` held **101** specs, the tree had
**102**, and the missing one was **`foundry-admin-refusal.mjs`**, added by prompt 0045
and never measured. The block claimed `outside: 0` over a set that did not contain it,
which is the exact conjunction 0046 built `tests/derived-numbers.test.ts` to refuse --
**so the suite was already red on the base commit**, 5 of 18 in that file, on a clean
tree, before a line of this bundle's work. Recorded here because a bundle that finds a
red suite it did not cause has to say so or it inherits the blame.

## B2: a row for each, and one of them is red on purpose

| route spec | row | result |
| --- | --- | --- |
| `notebook.mjs` | `.swatch` | **45 x 45**, 0/7 under |
| `notebook.mjs` | `.tools .inline-link` | **32.5 x 45**, 1/2 under -- RED |
| `classroom-split-...-crowded-manage-1.mjs` | `a.attach-name` | **88 x 45**, 0/3 under |

The swatch row needs the folder manager open, which is a `prepare` click on a route whose
other twenty checks this bundle does not own. **That was verified rather than assumed:**
run before and after and diffed check by check, **19 of 20 existing checks report a
byte-identical value at both widths**, and the twentieth is `console-errors` going from
"1 ignored by pattern" to "7" -- the same already-ignored 401 photo requests the open
panel fires more of, still **0 errors**.

**The toolbar row is failing and stays.** A number that regenerates on every run with a
decision entry against it is the opposite of the standing finding 2.12 forbids, which is
one nobody has to look at. It is in the generated counts block by name.

## B3: the controls, and they redden on different axes

Each fix reverted from a `cp` copy, the row re-run, the fix restored and md5-verified.

| surface | reverted | axis | restored |
| --- | --- | --- | --- |
| swatches | **25 x 45**, 7/7 under | **WIDTH** | md5 OK |
| attachments | **88 x 41.5**, 1/3 under | **HEIGHT** | md5 OK |

That the two redden on *different* axes is the part worth having: a row that reddened on
the wrong axis would be measuring something else, and here each one reports exactly the
dimension its surface was short on while the other dimension holds at its correct value.

The toolbar has no fix to revert; its row is red in the shipped tree, which is the same
evidence taken from the other direction.

## B5: the counts block after

`npm run verify:counts`: static region already current (102 specs, 52 routes, 82 `/dev`
pages, 204 runs), nothing written -- and it printed the staleness warning about the
measured half, which is 0046's machinery doing its job.

`npm run verify:readme` on a clean tree with the port guarded, on `31a6d63`,
`dirty: false`: **204 route/width runs, 2978 measurements, 2 outside threshold**, 469.8s.

**`covered` is 102 against 102 specs in the tree; the unmeasured set is EMPTY** (it was
`["foundry-admin-refusal.mjs"]`), and nothing was removed. The two `outsideRows` are, by
identity, `/dev/notebook` at 375 and at 1440, `tap-reach`, `toolbar text controls (under
the floor on width -- decision 12, with the owner)`. Nothing else on the surface of the
whole harness is outside a threshold.

## A test this bundle generalized, and it is outside the ownership line

Making the block report a deliberate finding broke `tests/derived-numbers.test.ts`, on
`expect(data.outside).toBe(0)` with the comment "the committed block is the zero case".
**That is a claim about the state of the repository, not about the predicate under
test**, and it holds only while no surface is deliberately left failing -- the ratchet
shape CLAUDE.md names, where a test records what last happened instead of checking
anything. The rule it guards is a CONJUNCTION (an unmeasured spec AND a block claiming
nothing was outside), so the control needs a zero-findings block; it now PATCHES one with
`withMeasured`, exactly as the `WHAT IT LETS THROUGH` control immediately below it
already patches a non-zero one with the same helper.

Generalized, not deleted, per CLAUDE.md, and **re-mutated to confirm it still bites**:
with `unmeasuredSpecs` returning an empty `missing` list, 2 of 18 redden; restored
md5-identically, 18 of 18 pass.

**`tests/derived-numbers.test.ts` is not in this bundle's ownership list.** It was
changed because the alternative was handing on a red suite, which CLAUDE.md treats as
worse than any single defect -- a standing failure hides a real one. It is a nine-line
change to one control's fixture and it is easy to reverse.

## B6: suite and check

`npx svelte-kit sync && npx svelte-check` with the two `$env/static/public` placeholders
exported first: **0 errors, 37 warnings** in 20 files, breakdown **31
`state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`**.
Baseline held on both numbers and on the mix.

`npm test`: **269 files, 5582 tests, all passing**, 204.30s. Started 2026-09-05 10:19:02
PDT, finished 10:22:28 PDT (America/Los_Angeles). The earlier run at 10:03 carried the 5
pre-existing `derived-numbers` failures described under A5, which the regenerated counts
block and the generalized control clear.

## Not verified

- **Nothing was run against the live Supabase project.** No migration, no RPC, no
  signed-in session; the local stack was not started and this bundle needed none.
- **`/dev` routes only.** The attachment list as a student meets it on a real class page,
  and the folder manager inside a real notebook, need a Bosco Tech Google session. The
  swatch band's +72px inside a narrower real pane is unmeasured.
- **Web fonts did not load** (the harness blocks every non-loopback request), so every
  box here is measured in the fallback stack, and `prefers-reduced-motion` was
  `no-preference` throughout.
- **The 44px swatch was not put in front of a student or an instructor.** Whether a
  two-row band of 44px colour circles is better than one row of 24px dots is a judgement
  2.12 assigns to step 1's cost statement, and this bundle took it.

## Left standing

- **Decision 12 stays open on its third surface**, now asking a narrower question with
  the arithmetic and the measured answer against it: may `.tools` wrap, for 32px of
  toolbar height at 375. Until it is answered, four notebook toolbar controls are under
  the floor on width and the harness says so on every run.
