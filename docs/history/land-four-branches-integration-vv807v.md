---
title: "Four standing branches land in `integration`: three README counts conflicts resolved by regeneration, two classroom update entries merged by keeping both, and the harness reports 0 outside threshold for the first time (`claude/land-four-branches-integration-vv807v`, no migration)"
date: 2026-09-04
branches: [claude/land-four-branches-integration-vv807v]
migrations: []
subsystems: ["Browser harness", "Classroom", "Repo mechanics"]
---

Prompt 0028, from `origin/integration` at `95ac167`. A merge bundle: no feature,
no migration, and the only decisions taken were conflict resolutions. Every file
these four branches touch was owned by this session for the duration of the
merge and by nothing else.

Why they were standing at all is on the record in GitHub Actions rather than in
this repo. The `Integrate` workflow run against `main` at `c5eb148` merged
`claude/classes-block-course-identity-twrmsn` cleanly, deleted it, and then
stopped with `4 branch(es) conflicted with integration and were left
untouched`. The four it named are the four merged here. The automation is
working as designed -- it declines a conflict rather than guessing at one --
and a human-run bundle is the intended answer to that message.

## What landed

Four merges, in the order the prompt set, each committed before the next began:

| # | Branch | Merge sha |
| --- | --- | --- |
| 1 | `claude/grading-at-scale-9vwzbm` | `d5c5d7a` |
| 2 | `claude/attachments-composer-rnjvk9` | `c4cd3a4` |
| 3 | `claude/two-live-reachability-defects-2tajpx` | `152b84d` |
| 4 | `claude/idea-maps-public-viewer-hxz2cx` | no commit (see below) |

The third brings `claude/browser-harness-truthfulness-l4zk0b` with it. That
branch's tip `2ee2657` is an ancestor of `0b81ed9`, verified with
`git merge-base --is-ancestor` before the merge rather than assumed from the
prompt: the reachability bundle had merged it into itself deliberately, owning
four of the same five spec files.

The fourth produced no commit. `git merge` answered `Already up to date`,
because `integration` already contained `32059cb1` -- so there was nothing to
record and git correctly refused to mint an empty merge. It was run last, after
the other three, so its emptiness is a measured result rather than an
assumption carried over from the audit. **There are three merge shas, not
four**, and a reader expecting a fourth should stop looking for it.

## The README conflicts, and what they cost

All four branches conflicted on `tools/browser-verify/README.md`; so did
`browser-harness-truthfulness-l4zk0b` when test-merged on its own. Every hunk
in every case fell **inside** the `counts:begin`/`counts:end` markers -- checked
by reading the marker line numbers against the conflict marker line numbers, not
by reading the numbers themselves, which is the point of the split prompt 0019
made.

Resolved by taking `integration`'s side of the conflicted hunks and leaving
auto-merged content alone. That is deliberately **not** `git checkout --ours`,
which takes the whole file from HEAD and would silently discard any prose a
branch contributed outside the conflict. Timed:

| Merge | Resolution time |
| --- | --- |
| 1 `grading-at-scale` | 0.043s |
| 2 `attachments-composer` | 0.021s |
| 3 `two-live-reachability` | 0.021s |

Against prompt 0021's measured 0.201s, this is the second test of the split
block and it holds. The cost of a README conflict is now bounded by how fast a
process starts, not by how carefully anybody reads a table.

Two things about that resolution are worth writing down because both are easy
to get wrong in the other direction:

- **One line auto-merged that a reader would expect to have conflicted.** After
  merge 2 the README differed from `integration`'s by exactly
  `| Full-run wall clock | 395.3s |` becoming `396.6s`. Git found that line
  non-conflicting because the lines around it differed asymmetrically. It sits
  inside the measured region, which B4 overwrites wholesale, so it needed no
  action -- but a session that resolved this file by hand and then skipped the
  regeneration would have shipped one branch's wall clock stapled to another
  branch's run.
- **The prose 0025 rewrote survived without being touched.** The `Known
  findings` section auto-merged clean on merge 3, and was checked afterwards
  against that branch's own copy of the section: identical. It was never inside
  a conflict, so the take-ours rule never reached it.

## `classroom-updates.json` -- the conflict where neither side is discardable

Two branches appended to the tail of one shared array, so git saw two edits to
the same lines. Unlike the counts block there is nothing to regenerate and no
side to prefer: both entries are real student-facing copy and both had to
survive.

All three files carried **117 entries**, and this is the shape that makes the
conflict legible: the first 116 are byte-identical across `integration` and
both branches (`md5` of the sorted JSON slice agrees three ways), and the
`_readme` block agrees three ways too. Only entry 117 differs, and it differs
three ways -- each side wrote its own `2026-09-04` entry, and git had already
merged the shared `"date": "2026-09-04"` line before splitting the rest, which
is why the conflict hunk opens mid-entry.

| Side | Entry 117 |
| --- | --- |
| `integration` | Shorter class cards on the home page, and assignments that show how close they are |
| `attachments-composer` | A screenshot your teacher pastes goes to one place now, not two |
| `two-live-reachability` | The Contracts tab on the coin ledger, and the profile button, are reachable on a phone |

Resolved by **keeping all three**: 117 before, **119 after**. The merge was done
on raw text blocks rather than by parsing and re-serialising the JSON, so the
116 shared entries keep their exact bytes -- a re-serialisation would have
reformatted the whole file to satisfy a two-line change, which is the
`package-lock.json` reformat problem in a different costume. Verified three
ways after each of the two resolutions: the file parses, every entry present on
each of the three sides is still present, and none of them was altered
(`missing 0, altered 0` against all three, checked by key and by full object
equality).

## The counts, regenerated once

Once, after all four merges, on a clean tree -- not once per merge.

**Static** (`npm run verify:counts`, a pure tree read): 94 specs over 47 routes,
78 `/dev` pages, 2 widths, 188 route/width runs. That is a strict superset of
every side that went in (`integration` 88/44/76/176, `grading` 84/44/76/168,
`attachments` 87/45/77/174, `two-live` 87/45/76/174, `browser-harness`
80/43/75/160), which is what a union of four branches' spec additions should
look like and is the cheapest available check that no spec file was dropped.

**Measured** (`npm run verify:readme`, a full harness pass): 188 runs, 2622
measurements, **0 outside threshold**, 434.3s wall clock, 64 selftest controls
(32 negative, 32 positive), 0 instrument failures, on commit `152b84d` with
`dirty: false`.

Zero is the number the audit predicted, and establishing *why* it is zero was
the substantive work of this phase rather than a formality. Four rows stood in
`integration`'s block and in three of the four branches':

- `/dev/pathways` @375 `tap-target`
- `/dev/pathways` @1440 `tap-target`
- `/dev/coins-signedin-1` @375 `horizontal-scroll`
- `/dev/coins` @375 `horizontal-scroll`

All four are absent from this tree's run. A row present in a branch's block and
absent from the merged one is ambiguous on its face -- it means either that
branch's run was flaky or the merge lost something -- so it was settled by
looking at the code rather than at the report. `two-live-reachability` already
reported **0** on its own tip, because it is the bundle that fixed these: the
`ProfileMenu` trigger and the Coin Ledger tab bar were all four standing rows.
Both fixes are in the merged tree byte-identical to that branch's own versions
(`src/lib/ProfileMenu.svelte`, `src/lib/legacy/coins/index.html`, the three
route specs and `tests/profile-menu-tap-reach.test.ts` all `md5`-match), with
`.tap-reach-44` on the trigger and `flex-wrap: wrap` on the tab bar present in
the merged files. So the four rows are gone because they were repaired, not
because a measurement went missing.

Note that `browser-harness-truthfulness`'s block labels the two `tap-target`
rows `ProfileMenu trigger (ships in every page header)` while the later blocks
label the same rows `harness controls`. The label moved between bundles; the
rows are the same two.

## Verification

- **Full suite: 253 files, 5309 tests, all passing.** The four branches
  separately reported 5226, 5224, 5246 and 4775; those overlap heavily and do
  not sum, and no attempt was made to reconcile the merged figure against any
  of them. No integration-only failure appeared -- nothing passes on a branch
  alone and fails here.
- **`svelte-check`: 0 errors, 37 warnings**, breaking down 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, over 2905 files and 20 files with problems. The
  baseline, re-derived rather than trusted: `npx svelte-kit sync` after
  `npm ci`, with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported
  as placeholders first, per the missing-`.env` rule.
- **`npm ci`, never `npm install`.** `git status --porcelain` on
  `package-lock.json` and `package.json` was empty afterwards, so the 4,649-line
  reformat did not happen.

## What is NOT verified

Nothing here ran against the live Supabase project, a signed-in session, a real
Drive round trip, or a Vercel preview. The harness covers `/dev` routes only and
blocks every non-loopback request, so text is measured in the fallback stack and
`prefers-reduced-motion` was `no-preference` throughout. **Every one of the four
merged bundles' own outstanding checks is still outstanding; this bundle closes
none of them.** It establishes only that the four merge together, that nothing
each of them claimed to change was lost on the way in, and that the merged tree
is green by the checks that can run in a container.

## Deliberately not done

No feature change, no migration (0175 is on `main` already), and no fix to
anything the merges revealed. Nothing was revealed that needed one.

`claude/idea-maps-public-viewer-hxz2cx` was not deleted and cannot be from a
cloud session; the integrate automation removes a branch once `integration`
contains its tip, which it already does. The other three are in the same
position after this lands. Nothing was merged to `main` -- that push is a deploy
to `ideabosco.com` and it is Mr. Pina's to press.
