---
title: "Decision 09 written down two days late, the clause the answer turned out to need, and the standing finding it closed (`claude/decision-09-violation-docs-ch9n3i`)"
date: 2026-09-05
branches: [claude/decision-09-violation-docs-ch9n3i]
migrations: []
subsystems: ["Standards", "IDEA Classroom", "Browser harness"]
---

Prompt 0043. No migration. One standards clause, one code fix that clause produces,
and the first full harness run in this repo's history to come back with nothing
outside a threshold.

## The base

Started from `origin/integration` at `e97b18d`, which is tree-identical to
`origin/main` at `1895925` -- main is exactly integration plus the PR #76 merge
commit, so both point at tree `eb755f2`. The container's git already carried a
committer identity, so the "Please tell me who you are" failure the prompt warns
about did not arise.

## A: what the tree actually said

`IDEA_INTERFACE_STANDARDS.md` was at 2.11 (2026-08-26) and its section 10 already
carried most of decision 09's answer, added in 2.3: 44px "on every student-facing
surface at every width", a 24px absolute floor "even to mouse-only instructor
consoles". **What it did not carry was the half that makes the rule checkable** --
that a 24px surface must DECLARE itself in a named CSS class -- and it carried
nothing at all about what a surface does when the floor and the space conflict.

The freshness check was a `git clone` of `main` rather than a raw fetch, per
`IDEA_instructions.md` 4.14: the cloned copy came back md5-identical
(`b6ef57b1...`) to the working copy at 2.11, and the register row in the clone
agreed at 2.11 / 2026-08-26. Both signals the instructions name were present and
both said current.

Decision 09's own Status line still read `open`. That is the whole finding of this
bundle's first half: three places in the tree already cite the answer as given --
`src/routes/dev/pathways/+page.svelte`, `docs/history/browser-harness-truthfulness-l4zk0b.md`
and `docs/history/avatars-phase-two-surfaces-42h0pb.md` all quote "44px on every
student surface and 24px only on an instructor density surface declaring a named
class", dated 2026-09-02 -- while the decision entry, the standard, and the
register all still described a question nobody had answered. **The answer was being
propagated by quotation between bundles.** A routing entry is not evidence a rule
exists, and neither is another bundle's history file quoting one.

## A3: the numbers, and whether 0039's reproduce

They reproduce exactly. `/dev/spec-table?empty=1`, both widths, the four glyphs
(move up, move down, duplicate, delete):

| | before |
| --- | --- |
| glyph box, 375 and 1440 | 23.2 x 23.2 |
| hit-tested reach | 23.2 (no reach mechanism on them) |
| `.row-ops` column, measured | 125.4px at both widths |
| declared column width | `6.4rem` = 102.4px |
| row height | 40.4px |
| table wrapper at 375 | client 293, scroll 653 |
| document overflow | 0px at both widths |

**0039 said "~11rem"; the honest figure is two figures.** 4 x 44 = 176px is the
button boxes alone, which is the 11rem. With the 2.4px `margin-left` each and the
4.8px cell padding either side it is 195.2px, against a rendered column of 125.4px
-- so one line of four costs +69.8px of column, on a table whose wrapper already
scrolls 360px at 375. 0039's arithmetic was right and its conclusion did not
follow, which is the whole shape of this bundle.

**The rendered column is 125.4px and the declared width is 102.4px**, which nobody
had noticed and which turned out to be the fix.

## A4: the rest of the surface, hit-tested rather than read off

Every interactive control on the harness page, at both widths. The reach column is
`elementFromPoint` walked down the control's full vertical span, counting a hit
only for the element itself, something inside it, or a `<label>` that activates it
-- **a first pass that also counted a plain ancestor reported 46.2px of reach on
the row glyphs, which is the `td` around them and is not reach at all.** Pressing
the cell does not press the button.

Already clear at both widths: `button.disc-trigger` (4 of them, 44px),
`button.btn.secondary.tiny` Add row (69.2 x 44, fixed by 0039),
`button.sfb-trigger` Report a problem (164.2 x 44), and both `textarea.answer`.

Under a floor and **not this bundle's to fix** -- reported here because the clause
is written against the whole surface:

- `input[type=checkbox]` in the checkbox block: box 13 x 13, label 293 x 23 (1358 x
  23 at 1440), reach 13 to 23 depending on the mount. Under the 24px absolute
  floor at the label, which is where CLAUDE.md says to measure it.
- `textarea.cell`: 33px tall at both widths. Between the two floors.
- `button.info-tip-trigger.tap-reach-44`: box 16.4 to 32.8 tall, **reach 16.4 to
  42.4 and never 44**. The class is named for a guarantee it is not delivering on
  this surface. Worth its own bundle; hit-testing is the only thing that shows it,
  which is exactly why CLAUDE.md says to hit-test a reach.

## B1: the clause

Two rules and a resolution order, written into section 10 and shipped as 2.12.

The first states decision 09 as answered, and states it as a property the SURFACE
declares rather than one a bundle asserts, because "this is an instructor console"
is a claim about who can reach a surface and nobody measuring a control six months
later can see that from the control. No class, no exception: 44px.

The second is the sentence that did not exist. **The conflict is never between the
target and the container** -- the container is a property of the surface, the
number of controls in it is a choice somebody made without measuring -- so the
order is fixed and only one of its four steps needs anybody's judgement:

1. Re-lay the controls in the space that is there. Arithmetic; belongs to whoever
   is measuring; costs row height, stated as a number.
2. Carry fewer controls. Changes what the surface can do, so it is raised to the
   surface's owner rather than taken inside the bundle that found it.
3. Widen only where nothing else measured pays for it, never at the narrow width.
4. An exception, which is a decision entry with an owner and a date -- never a code
   comment, never a standing row in a report.

And the third: **a measured violation is never left as a standing finding.** Three
ways to end, not four. "Measured it, had a defensible reason, wrote the number in
the report" is the fourth that is not available, because a number that reappears
every run with nobody's name against it reads in the report exactly like a number
nobody has looked at yet.

## B2: the fix the clause produces

Step 1, and it needed no step 2 through 4. Four 44px boxes do not fit one line in
this column; **two lines of two fit the column that was already declared**:
2 x 44 + one 2.4px gap + 9.6px of cell padding = 102.4px, which is the `6.4rem`
`.row-ops-head` has carried all along. `white-space: nowrap` is gone -- it is what
forced the four onto one line -- and is replaced by an explicit
`grid-template-columns: repeat(2, 44px)` rather than by relying on wrapping, so the
arrangement is stated instead of emergent.

Measured after, both widths:

| | before | after |
| --- | --- | --- |
| glyph box | 23.2 x 23.2 | **44 x 44** (all four) |
| hit-tested reach | 23.2 | 44 |
| column, 375 | 125.4px | **100.0px** |
| column, 1440 | 125.4px | **102.4px** |
| table scrollWidth, 375 | 653 | **628** |
| document overflow | 0px | 0px |
| row height | 40.4px | **98.3px** |

**The column got narrower and the table's own horizontal scroll got shorter**, so
the widening step 3 forbids was not merely avoided, it was unnecessary. The whole
cost is row height, 40.4 to 98.3, and it is stated here rather than described
because step 1 says to state it.

## B4: both controls

**The code control.** Reverted the two CSS rules to their pre-fix values and ran
the browser spec: `2 outside threshold`, both of them
`tap-target [row action glyphs (known finding)]` on `/dev/spec-table?empty=1`, one
at 375 and one at 1440, reporting `smallest 23.2x23.2 ... 4/4 under 44px, 4 under
the 24px floor`. That is exactly the pair A5 named, and it is the same pair the
fixed tree reports as `ok  smallest 44x44 ... 0/4 under 44px`.

**The standards control.** Set the header to 2.13 against a newest changelog entry
of 2.12 in a scratch copy. `tests/standards-version-header.test.ts` failed 2 of 21
with both halves of the disagreement named: "the header says 2.13, but the newest
changelog entry is 2.12" and "REGISTER.md says 2.12, but the file's own header says
2.13". So the register row is not a second place the same fact is written down; it
is a second assertion the test checks.

**Both restores were from `cp` copies and both are md5-identical** --
`SpecRenderer.svelte` at `4f3978d6fcd8cc08abf6faaef500f35f`,
`IDEA_INTERFACE_STANDARDS.md` at `bd931cce2da84f3859a78051c4925e14`. `git checkout
--` was not used anywhere in this bundle, which is the rule CLAUDE.md carries after
three sessions discarded their own uncommitted work with it.

## B5: what the counts block says now, and what it had never said

`npm run verify:counts` found the static region already current: 99 specs over 51
routes, 82 `/dev` pages, 198 runs. Nothing written.

`npm run verify:readme` on a full run: **198 route/width runs, 2846 measurements, 0
outside threshold**, 453.4s. The two standing rows are closed, not excused.

**And the previous measured region had never carried them.** It was taken on
`4dc9df8` and recorded 196 runs with an empty `outsideRows` -- because
`spec-table-empty-1.mjs`, the route that measures these glyphs, was added after
that measurement. So for the whole life of the standing finding, the generated
block a reader would consult said `0 outside threshold`. The finding existed in a
code comment, in a route file's prose, and in the output of a run nobody had
regenerated. That is a sharper version of the rule this bundle wrote: it was not
merely a finding with no owner, it was a finding with no owner that the project's
own generated summary reported as absent.

The harness row is kept and its label no longer excuses it --
`row action glyphs (known finding)` is now `row action controls`. A row kept only
while it is failing disappears at exactly the moment it becomes the thing that
would catch a regression.

## B6: suite and check

`npx svelte-kit sync && npx svelte-check` (with the two `$env/static/public`
placeholders exported first, per CLAUDE.md's missing-`.env` note): **0 errors, 37
warnings**, breakdown 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`, 20 files with problems. Baseline held on both numbers
and on the mix.

`npm test`: **266 files, 5527 tests, all passing**, 207.06s. Started 2026-09-05
07:45:58 PDT and finished 07:49:26 PDT (America/Los_Angeles).

## Not verified

- **Nothing was run against the live Supabase project.** No migration, no RPC, no
  signed-in session. The local stack was not started; this bundle needed neither.
- **`/dev` routes only.** The spec table as a student actually meets it -- inside
  `ClassSplit`'s detail pane on a real class page, at whatever width that pane is
  -- was not measured, because that needs a Bosco Tech Google session. The column
  arithmetic does not depend on viewport (it is table layout, and the column
  measured 125.4px at both 375 and 1440 before and 100.0/102.4 after), but the row
  height cost inside a narrower pane is unmeasured.
- **Web fonts did not load** (the harness blocks every non-loopback request, so
  `fonts.googleapis.com` is reset), so every box here is measured in the fallback
  stack. `prefers-reduced-motion` was `no-preference` throughout, so that path was
  not exercised.
- **The 98.3px row height was not put in front of an instructor.** Whether doubling
  the row height of a twelve-row lab table is the right trade for four reachable
  controls is a judgement the clause assigns to step 1's cost statement rather than
  to a person, and this bundle took it. If it is wrong, it is wrong in a direction
  step 2 can correct: carry fewer controls in the row.

## Deferred, and named rather than left

- **`button.info-tip-trigger.tap-reach-44` does not reach 44px** anywhere on this
  surface (measured 16.4 to 42.4). The class promises the thing it is not doing.
- **The checkbox block's inputs are 13 x 13 inside a 23px label**, under the
  absolute floor at the place CLAUDE.md says to measure.
- **`textarea.cell` is 33px.** Between the floors on a student work surface.

All three are outside this bundle's ownership, which was the row-action controls
only. They are written here with their numbers and not as a report row, which is
what the rule this bundle just wrote requires of them.
