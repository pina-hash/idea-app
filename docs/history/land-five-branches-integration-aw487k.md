---
title: "Five standing branches land in `integration`: one generated counts block unblocked five mutually exclusive edits, and the maps grants bundle's three code conflicts resolved as unions (`claude/land-five-branches-integration-aw487k`, no migration)"
date: 2026-09-03
branches: [claude/land-five-branches-integration-aw487k]
migrations: []
subsystems: ["Browser harness", "IDEA Maps", "Testing"]
---

Prompt 0017. A merge bundle with no feature in it. Five finished, CI-green
branches had been standing unswept because every one of them conflicted on the
same generated file, and `.github/workflows/integrate.yml` was correctly
refusing five mutually exclusive edits to one block.

## Why all five were stuck on one file

`tools/browser-verify/README.md` carries a counts block between
`<!-- counts:begin -->` and `<!-- counts:end -->` markers, written by
`npm run verify:readme` from a full harness run. Each of the five bundles added
route specs, so each regenerated the block against its own tree and each wrote
different numbers into the same lines. A generated block committed per-branch
serialises every branch that adds a spec: the second one to try to land always
conflicts, whatever order they arrive in.

That is decision 12 arriving as a blockage rather than as a design question.
Fixing the architecture is a separate bundle; this one only cleared the queue.

## The audit before anything was merged

Measured, not assumed: five `origin/claude/**` branches stood, none of their
tips contained in `origin/integration`, and `integration` was 39 ahead of
`main` and 3 behind it. All five tips were green on the `CI` workflow
(runs 528, 529, 539, 540, 542). Test-merging each into `integration` with
`--no-commit --no-ff` and aborting between reproduced the claim exactly: five
README conflicts, and `claude/maps-editor-grants-2ktnt3` additionally on
`src/lib/maps/ShelfEntry.svelte` and `src/lib/maps/transports.ts`. No conflict
turned up anywhere the prompt did not name.

`integration`'s own tip was already a merge commit naming the foundry branch,
which reads at a glance like that branch being in. It is not: the merge took an
earlier tip (`a997bbb`) and the branch had grown eleven commits since,
including a merge of `main`. Containment is the question, not the merge
message.

## The README resolution, and why reading the numbers would have been wasted

Every README conflict was resolved by taking the `integration` side unchanged,
without comparing the blocks. The block is DERIVED: whichever side is taken is
wrong until the block is regenerated against the final merged tree, so any
effort spent choosing between two stale blocks is effort spent on a value about
to be overwritten. What WAS checked on each of the five, mechanically, is that
every conflict hunk fell strictly between the two markers -- a hunk outside
them is prose and would have been a real conflict to resolve on content. All
five were entirely inside.

The block was then regenerated exactly once, after all five merges were
committed, on a clean tree with port 5199 confirmed free by an actual bind and
no node or vite process running. `startDevServer` reuses an already-running
server on that strict port rather than failing, which is how a previous
session's regeneration raced an orphan and recorded phantom findings.

## The three maps hunks

`claude/maps-editor-grants-2ktnt3` (prompt 0013, editor grants) had to land on
top of prompt 0008's maps work, already in `integration`. Both are correct and
both survive. All three resolutions are unions; none is a pick.

**`ShelfEntry.svelte`, the import block.** 0008's side brings `SvelteSet` (used
at `brokenThumbs`, the broken-thumbnail fallback) and `Pending` (used by the
photo transcode's pending state); 0013's side brings `MAPS_ADMIN_SCOPE`,
`mapsCaps` and `MapsEditorScope` (the `scope` prop's default, its type, and
`caps`). Every one of those five symbols is referenced in the merged file body,
so dropping either side leaves an undefined identifier. Kept all three lines.

**`transports.ts`, the import block.** 0008 added `constraintNameOf` and
`isTransientDbError` to `$lib/pg-errors`; the maps branch predates both and its
copy of that module exports neither, so it imported only `isTransientSqlstate`.
Resolved as `import { constraintNameOf, isTransientDbError, isTransientSqlstate }`
plus 0013's `./grants` type import. `isTransientSqlstate` is retained because
0013's new roster and scope functions, which merge in below without conflict,
still call it -- checked rather than assumed, two live call sites in the merged
file.

**`transports.ts`, the refusal function.** This is the only hunk with a real
decision in it. 0008 replaced `refusalMessage(): string` with
`permanentRefusal(): string | null`, plus `MAPS_PERMANENT_UNIQUE` (constraint
name to sentence) and `TABLE_IMPLIED_UNIQUE`; the point is stated in its own doc
comment on `failure()` -- both halves, the sentence and whether it may be
retried, come off ONE call, "because a separate `refusalMessage` helper reading
it a second time is how the two answers came to contradict each other in the
first place". 0013 had kept `refusalMessage` and inserted a `42501` branch at
its top returning `MAPS_PERMISSION_REFUSAL`.

Resolved by keeping 0008's whole structure and lifting 0013's `42501` comment
and guard verbatim into `permanentRefusal` as its first statement. That
preserves both bundles and is strictly better than either alone: a permission
denial is a considered refusal, so returning it non-null is exactly what makes
`failure()` mark it `retryable: false`. Resurrecting `refusalMessage` to hold it
would have restored the contradiction 0008 removed; dropping it would have lost
0013's refusal.

0013's `23505 && table === 'maps_stock'` line was deliberately not carried
across. It is not lost: 0008 generalised it into
`MAPS_PERMANENT_UNIQUE.maps_stock_one_row_per_placement` with
`TABLE_IMPLIED_UNIQUE` supplying the same table-implied fallback, with the
sentence verbatim.

### What was measured on the resolutions

Both bundles' own reported figures reproduce exactly on the merged tree, which
is the evidence that nothing was lost:

| | that bundle reported | measured here |
| --- | --- | --- |
| 0008, eight maps specs | 318 measurements, 0 outside | 318, 0 outside |
| 0013, three grants specs | 94 measurements, 0 outside | 94, 0 outside |

22 route/width runs, 412 measurements, 0 outside threshold. The HEIC check
(`A HEIC THE BROWSER CAN DECODE IS CONVERTED, ON THE REAL SURFACE, AND SAYS
SO`) passes, which is a direct measurement that the `ShelfEntry` import union
kept 0008's transcode reachable. Maps unit and db tests: 13 files, 192 tests,
all pass, with a real embedded Postgres confirmed booting (6 to 10 processes
during the run; vitest's reported Duration excludes globalSetup, which is why
the db files look implausibly fast).

## The counts block, before and after

| source | specs | routes | dev pages | runs | measurements | outside | sha | dirty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `integration` | 67 | 38 | 70 | 134 | 1788 | 6 | `ca37ea6` | false |
| grading-change-tracking | 69 | 38 | 70 | 138 | 1820 | 6 | `8dfc4e8` | **true** |
| classroom-interaction-defects | 68 | 38 | 70 | 136 | 1772 | 8 | `1c9fa2c` | false |
| classroom-instructor-tools | 70 | 38 | 70 | 140 | 1878 | 4 | `a39e99b` | false |
| foundry-decisions-cluster | 67 | 38 | 70 | 134 | 1796 | 4 | `3af7cae` | false |
| maps-editor-grants | 69 | 38 | 70 | 138 | 1832 | 4 | `f6691db` | false |
| **merged** | **80** | **43** | **75** | **160** | **2196** | **8** | `f60c70c` | false |

Wall clock 371.0s; `--selftest` 64 controls (32 negative, 32 positive), 0
instrument failures. The 80 and the 75 cross-check against the filesystem (80
non-underscore route specs, 75 dev directories with a page), and
`tests/derived-numbers.test.ts` passes, which is what reddens on a hand edit or
a spec added without regenerating. The tool rewrote lines 32 to 58 only, with
the markers at 31 and 59, confirmed from the diff.

One of the six discarded blocks recorded `dirty: true`, meaning it was measured
against a tree that is no commit. Worth noting because the block's whole value
is being attributable to something.

## The outside-threshold identities, which is where a count can hide a loss

Ten distinct findings exist across the six pre-merge blocks and the merged one.
Presence by source, in the table's order above, then merged:

| finding | 1 | 2 | 3 | 4 | 5 | 6 | merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/dev/pathways` @375 `tap-target` harness controls | x | x | x | x | x | x | **x** |
| `/dev/pathways` @1440 `tap-target` harness controls | x | x | x | x | x | x | **x** |
| `/dev/coins-signedin-1` @375 `horizontal-scroll` | x | x | x | x | x | x | **x** |
| `/dev/coins` @375 `horizontal-scroll` | x | x | x | x | x | x | **x** |
| `/dev/classroom-interaction?case=typing` @375 `presence` | . | . | x | . | . | . | **x** |
| `/dev/classroom-interaction?case=typing` @375 `order-result` | . | . | x | . | . | . | **x** |
| `/dev/classroom-interaction?case=typing` @1440 `presence` | . | . | x | . | . | . | **x** |
| `/dev/classroom-interaction?case=typing` @1440 `order-result` | . | . | x | . | . | . | **x** |
| `/dev/notebook` @375 `presence` free-entry title + folder fields | x | x | . | . | . | . | . |
| `/dev/gauntlet-shell-countdown` @1440 `presence` the numeral | x | x | . | . | . | . | . |

Nothing present in a branch's block is missing from the merged one except the
last two rows, and those are the recorded flakes rather than a merge loss.

**The four classroom-interaction rows are a defect this bundle reports and
leaves.** They are not a regression: that bundle ships its typing spec RED on
purpose. Its own entry says so -- "`classroom-interaction-case-typing.mjs` is
RED on the tree that ships it, and that is the finding rather than a defect in
it" -- because the fix is a four-line change to `src/lib/Disclosure.svelte`,
which was outside its ownership boundary and deliberately not applied, and
which also reddens three assertions in two `tests/dom/` files that would have
to be rewritten in the same change. `Disclosure.svelte` on the merged tree is
md5 `54b3255530536d4ead84d03f2647820f`, byte-identical to the state that bundle
recorded as the unfixed one, and unchanged by all five merges. So the four
findings reproducing is the merge preserving that bundle's finding intact. The
fix is still owed and is still not this bundle's to make.

**The two absent rows are the flakes, established three ways rather than
asserted.** `docs/history/idea-maps-obligations-cg56cf.md` recorded both as
timing flakes and measured them: `gauntlet-shell-countdown` gave 0, 3 and 3
findings across three consecutive targeted runs, and `/dev/notebook`'s prepare
is a fixed `setTimeout(600)` followed by a forced click that reproduced on two
targeted runs and neither of the two full runs before it. Second, they are
absent from four of the six pre-merge blocks including three measured AFTER the
two that carry them, which is non-monotonic in time and therefore a flake
signature and not a code change. Third, and decisively for the merge question:
both spec files are md5-identical between `origin/integration` and the merged
tree (`8dc74b44e39cd06f8dad4a344e8e43ae`,
`fc7537b4a7bdbf0b6b54171dd2af5b21`), and the five merges changed zero files
under `src/routes/dev/notebook`, `src/routes/dev/gauntlet-shell`,
`src/lib/notebook` or `src/lib/gauntlet`. A byte-identical spec measuring a
byte-identical page cannot have lost a finding because of a merge. Three
further targeted re-runs on the merged tree came back 0 outside threshold each
time.

## The merged tree

- Full suite: **242 files, 5117 tests, all passing.** No integration-only
  defect. The five branches reported 4849, 4837, 5026, 4813 and 4800 separately;
  those overlap and do not sum, and no attempt was made to reconcile them
  against this figure.
- `npm run check`: 2864 files, **0 errors, 37 warnings** over 20 files,
  breakdown 31 `state_referenced_locally` / 5 `css_unused_selector` /
  1 `perf_avoid_nested_class`. Baseline exactly, on both counts and the mix.
- All five tips confirmed contained in the result.

## Not verified

Nothing here ran against the live Supabase project or any signed-in session.
Every one of the five bundles' own outstanding preview checks is still
outstanding and this bundle closes none of them. `integration` reaching `main`
is a deploy and is not a session's to make.

## Left undone deliberately

The counts-block architecture. A generated block committed per-branch will
serialise the next set of branches exactly as it serialised these five, and the
next merge bundle will resolve the same conflict for the same reason. Candidate
shapes, none of them chosen here: keep the block out of git and generate it on
demand; move it to a file no bundle edits and regenerate only on `integration`;
or give the merge driver a union strategy for the marked region. That is its own
bundle with its own argument about where a derived number should live.

Also left: the `Disclosure.svelte` typing fix, still owed and still needing the
two `tests/dom/` files rewritten with it.
