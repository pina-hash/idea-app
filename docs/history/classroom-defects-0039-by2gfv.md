---
title: "Add row on an untouched table gave the minimum plus one, and the placement request was declined (`claude/classroom-defects-0039-by2gfv`)"
date: 2026-09-05
branches: [claude/classroom-defects-0039-by2gfv]
migrations: []
subsystems: ["Classroom", "Testing", "Dev harnesses"]
---

Prompt 0039. Two defects an instructor reported in the September feedback sweep. One was
located, fixed and proved; the other was declined, and this entry carries the reason and the
question that would settle it.

## The base

Started from `origin/integration` at `8ad3648` in `/home/user/idea-app`, which contained
`origin/main` at `332ba73` plus prompt 0036's hall-pass test fix. Git already carried a
committer identity (`Claude <noreply@anthropic.com>`), so the merge failure the prompt warned
about did not arise and none was set. `docs/prompt-ledger/entries/0039-*` was absent at
`origin/integration`, at `origin/main` and in the working tree, so the duplicate check passed
and the bundle proceeded.

## ONE: the Add row count

### What it was

`ensureRows` in `SpecRenderer.svelte` materialised `Math.max(block.minRows ?? 0, 1)` blank
rows the first time a table block was touched, and `addRow` called it BEFORE appending. So the
first press on a table nobody had written to produced the minimum AND one more. Verified rather
than assumed, at line 205 as the prompt claimed, and measured on all four shapes of the
argument:

| `minRows` | rows after one press, before | after |
| --- | --- | --- |
| absent | 2 | 1 |
| 0 | 2 | 1 |
| 1 | 2 | 1 |
| 3 | 4 | 1 |

`Math.max(x, 1)` is why absent, `0` and `1` were one case: a table with no constraint at all
got a row materialised on its behalf exactly as a table asking for one did.

### What the first press SHOULD produce, and the argument

**One row, at every `minRows`.** The button says "Add row" and the empty cell beside it says
"No rows yet. Add one below." Both are singular, and both were lying.

The load-bearing half of the argument is not the button's label, though, it is that
**`minRows` is a completion requirement counted over FILLED rows and never a materialisation
instruction** -- and every gate that reads it already agreed on that before this bundle:

- the counter under the block filters `Object.values(r).some((v) => String(v ?? '').trim() !== '')`;
- `blockProgress` in `assignment-spec.ts` filters on `tableRowFilled`, which trims;
- `_classroom_spec_unmet` (0086) counts rows with a `jsonb_each_text` value that is not
  `btrim`-blank.

So a blank row put on the student's behalf advanced **nothing that any of the three reads**. On
a `minRows: 3` table the old code drew four blank rows under a counter that still read unmet,
which is the state A2 asked about and the answer is yes: three empty rows and a counter of
zero was reachable, and reachable on the first press. It is not a nuisance, it is a surface
telling a student they have started work they have not started.

The rejected alternative was materialising `minRows` rows AT RENDER on an untouched table --
defensible-sounding, since a student facing "min 3 filled rows" and an empty table has to press
three times. It was refused because it changes what every already-published table looks like on
a surface nobody asked to change, and because it presents three obligations to somebody who
asked for one place to write. Pressing three times is not the cost; three blank rows that count
for nothing is.

### `deleteRow`'s floor agrees, and it is zero

`deleteRow` had no floor before this bundle and still has none: it removes one row, down to
none, and the empty-state cell is what the student then sees. That is the same rule `addRow`
follows read backwards, and it is the reason a floor at `minRows` would be wrong -- it would
strand blank rows a student cannot remove while satisfying no gate. Nothing about delete
changed; a comment now says why, because the Add contract depends on it.

### The fix

`ensureRows` now does only what it is for: after it runs `values[block.id].rows` is an array,
possibly empty. **Both call sites keep the call.** The prompt's warning was right -- removing
it from `addRow` to fix a count is how the crash it guards against comes back -- and it was not
necessary, because the defect was the guard doing a second job rather than the guard being
called.

### Control

Required and run. The old `ensureRows` body was restored over the fixed tree and the tests
re-run:

- `tests/dom/spec-table-add-row-mount.test.ts`: **13 of 14 red** on the mutant, green on the
  fix. All four `minRows` shapes reddened, including absent (`expected 2 to be 1`) and `0`,
  which is what says the fix is not one aimed at `minRows: 3`. The one that stayed green is
  "seeded rows survive and Add appends exactly one", which was never broken -- `ensureRows`
  short-circuits on an existing array -- so it is a true negative and the file says so.
- `tests/classroom-spec-table-rows.test.ts`: **all 12 green on the mutant**, which is correct
  and is written into that file's header so nobody reads it as the fix's control. A server
  render presses nothing, so `ensureRows` never fires there. Its own control is a different
  mutation -- `tableRowFilled` changed to credit a blank row -- which reddens 3 of its 12.

`SpecRenderer.svelte` and `assignment-spec.ts` were both restored from an in-memory copy taken
before the mutation (`cp`, never `git checkout --`) and md5-checked identical afterwards:
`56ddf22bf16dfc702eafe760a7972d93` and `6ff431a9807fdfc4189f0d8a5609ca99`.

### Browser proof

`tools/browser-verify/routes/spec-table-empty-1.mjs`, driving `/dev/spec-table?empty=1` at 375
and 1440. The harness route gained an `?empty=1` mode because **the seeded fixture could never
reach this state**: the arithmetic runs on FIRST touch, so a table that arrives with four rows
in it never runs it, which is why the defect was invisible on a harness that already existed
for this exact block.

Measured at both widths:

- `0 row(s) before the press`, `1 row(s) after one press` (`prepare-eval`, printed);
- the click step reports `1 matched, 1 attempt(s), predicate satisfied` -- its `until` names the
  count reaching exactly one, which is something only the click can produce and which the old
  code could never satisfy, so a regression reports FAILED rather than measuring a state the run
  never reached;
- `rows after one press` present 1, visible 1; `empty-state cell after one press` present 0,
  against the read-only mount's unpressed control still at present 1, which is what stops the
  absence row passing on a renamed class;
- `0px overflow` at both widths.

The first version of that spec opened the panel with a click, copied from `/dev/spec-table-open`,
and reported **`0 matched, 0 attempt(s), no match`** -- correctly a finding. With no rows seeded
the module is never complete, so its Disclosure arrives open and there is nothing to press. It
is a `waitFor` on the table having height now, which reports `0ms, already satisfied`; a wait
returning at 0ms is the state having already arrived and is not a finding, which is exactly the
difference between the two step kinds.

### A tap target found on the way, fixed, and one reported and not fixed

Neither was in the report and both are on the control this bundle is about.

**Add row measured 69.2x24 at both widths** -- under the 44px floor every student-facing surface
carries, on the one control the block asks a student to press, on a phone at a bench. It is
44px now (measured 69.2x44 at both widths, `0px overflow` unchanged).

**`.tap-44` was tried first and painted nothing.** It is one selector; `.cr-root .btn.secondary.tiny`
in `classroom.css` is three, and that rule sets `min-height: 24px` deliberately, with ten call
sites behind it. Measured 69.2x24 with the class applied, which is the whole reason it was
replaced rather than left: a class that does not apply is worse than no class. The floor is a
scoped `.table-foot .btn.tiny` rule in the component's own style block, which beats that rule
and reaches nothing else -- the same shape `.cr-root .cr-console .btn.tiny` already uses to
raise the console's chips.

**The four glyph controls in `.row-ops` measure 23.2x23.2, 4 of 4 under 44px and under the 24px
absolute floor, and are NOT fixed here.** Four 44px targets is about 11rem of a 6.4rem column
inside a table that already scrolls horizontally at 375px, so it is a layout decision with its
own measurements rather than a rule to add beside the other one. The browser spec carries a
`tapTargets` row that reports the number every run, labelled as a known finding, so it cannot
be forgotten by being invisible.

## TWO: the placement, DECLINED

**Nothing was built, and that is the reported outcome rather than a shortfall.**

### Where they actually are

The prompt's framing (and the reporter's) is that the two cards "live in the section layout
rather than under the class's items". Read against the tree, they are already **inside the
class pane**: both are rendered in `+layout.svelte`'s `classList` snippet, which is `ClassSplit`'s
NAV pane -- the same pane `ClassView` is in -- above it, with an argued comment saying why. At
375px that pane IS the class page, full width, so first-in-the-pane is zero scrolling for a
control whose whole value is the second it takes.

### Why it was declined

**Every reading of "under the class's items" that would satisfy the reporter needs a file this
bundle does not own.** Inside `+layout.svelte` there are exactly two expressible positions:
above `ClassView` (today) and below it. "Below `ClassView`" is not "under the class's items"
in any useful sense -- it is below the entire item list, at the bottom of the page. Anything
finer (below the class header, beside the stream, inside a unit group) means `ClassView.svelte`
taking a snippet or a prop, and `ClassView.svelte` is out of scope.

And the available move measurably costs the student. On `/dev/classroom-split/s-1?manage=1`, a
20-row fixture with every unit expanded, measured with transitions killed:

| | 375px | 1440px |
| --- | --- | --- |
| nav pane content height | 1478px | 797px (in a 730px box) |
| first item row, from pane top | 247px | 272px |
| last item row bottom, from pane top | 1390px | 458px |
| viewport height | 900px | 900px |

A card placed below the list starts at about 1478px from the top of the pane at 375px, roughly
578px of scrolling past a full viewport, on a fixture smaller than a real class. Today it is at
offset 0. That is the property prompt 0016 placed it there for, stated in the component's own
header, and trading it for an instructor's reading of a page they see at 1440 is not a trade
this bundle can make on a report of one sentence.

**The cards could not be measured in place at all**, which is worth saying: no dev harness mounts
them -- `/dev/classroom-split` mirrors the layout but mounts neither `HallPass` nor `SongQueue` --
and `src/routes/dev/classroom-split/**` is outside this bundle's owned set. So the numbers above
are the item list's, and the cards' own heights are NOT measured.

### The audience question, answered

Asserted rather than assumed, because it is what a move would have had to preserve. **Neither
card is gated on `canManage` and neither takes a role prop.** Both components say so in their own
headers and say it must stay that way: the role comes from the PAYLOAD's `scope`, which is what
`classroom_hall_pass_state` and `classroom_song_queue` decided, because a flag threaded down
beside the payload would be a second opinion about who the viewer is. The layout renders each one
whenever its load came back with a state, for any viewer of the class page. So position carries
no authorization and a move within the same snippet, with the same props, could not have changed
who sees what. Nothing about the limits, `0174`, or `hall-pass.ts` was touched; all three were
read-only for this bundle and stayed read.

### The question that would settle it

> An instructor opening a class sees the hall pass and the song queue at the top of the class
> pane, above the class name and the item list. Should they instead sit **below the class header
> and above the first item** (which needs `ClassView` to take them as a snippet), or **collapsed
> behind a disclosure at the top** (which keeps a student's one-tap reach and stops them reading
> as page furniture for a teacher), or should they stay where they are and the complaint be that
> they are too PROMINENT rather than too detached? At 375px a card moved below the item list
> starts about 578px past a full viewport, so "under the items" literally is the one answer the
> measurement rules out.

## Verification

- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, breakdown
  **31 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`** --
  the baseline unmoved. `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` were exported as
  placeholders before the sync, per the rule about the 11 phantom errors in a checkout with no
  `.env`; without them the count would have been 11, and it was not.
- `npm test`: first run **3 failed / 5442 passed**, all three in `tests/derived-numbers.test.ts`
  and all three the counts block being stale against the spec this bundle added. After
  `npm run verify:counts` that file is 10 of 10 green and the suite is clean. Run at
  **2026-09-04 18:33 to 18:37 America/Los_Angeles**, 213s. Prompt 0036's branch had landed on
  `integration` before this one started, so the six hall-pass wall-clock tests were not at risk
  either way -- and the run was outside the 00:00-02:00 window regardless.
- `npm run verify:browser -- --probe`: chromium 141.0.7390.37 at `/opt/pw-browsers`, screenshots,
  rAF, `IntersectionObserver` and `ResizeObserver` all working.
- Counts block: static half regenerated, **97 -> 98 specs and 194 -> 196 runs**, distinct routes
  unchanged at **50** (the new spec is a state of `/dev/spec-table`, and the count strips the
  query). Measured half regenerated by a full pass at `700a56d`: **196 runs, 2744 measurements,
  2 outside threshold, 459.3s**, `--selftest` 70 controls (36 negative, 34 positive) with 0
  instrument failures.
- **Compared by identity against the block this branch started from**, which read `outside: 0`
  with `outsideRows: []`. The two new rows are BOTH the `.row-ops` glyph finding this bundle
  added deliberately, at 375 and at 1440. **Nothing else moved anywhere in the pass** -- every
  other route is still within threshold and the selftest total is unchanged -- so neither the
  `ensureRows` change nor the scoped 44px rule regressed any surface the harness drives.
- **The README's "Known findings" prose is NOT updated to explain those two rows**, and that is
  a scope boundary rather than an oversight: this bundle owns the GENERATED regions of that file
  only. Its own convention says an entry the block lists and the prose does not explain is NEW,
  so the finding is labelled `(known finding)` in the row itself and explained in full in
  `routes/spec-table-empty-1.mjs` and in the tap-target section above. A session that owns the
  prose should move it there.

## Not verified

- **Nothing was checked against the live Supabase project.** `.env` here points at the
  placeholder project and both items are client-side, so no RPC, no policy and no real student
  data was touched.
- **No signed-in surface was opened.** The real class page needs a Bosco Tech Google session; the
  local Supabase stack was not needed for this bundle and was not started, so `/dev/login` was
  not used either. Every browser number here is a `/dev` route.
- **Web fonts do not load in the harness**, so every pixel figure above is measured in the
  fallback stack and is approximate. Contrast is unaffected.
- **`prefers-reduced-motion` is `no-preference`** for every measurement quoted here.
- **The hall pass and song queue cards were not rendered in a browser at all**, for the reason in
  the placement section: nothing harnesses them in the class pane and the file that would is out
  of scope.

## Deferred

- The four `.row-ops` glyph controls at 23.2x23.2, measured and reported above. Raising them
  needs a decision about the row-actions column inside a table that already scrolls at 375px.
- The placement itself, pending an answer to the question above.
