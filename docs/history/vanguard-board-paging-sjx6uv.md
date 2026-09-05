---
title: "VANGUARD's leaderboard pages: the Apps Script backend does honour `offset`, so LOAD MORE appends rather than replaces, and a below-the-cut rank stops claiming a number it cannot know (`claude/vanguard-board-paging-sjx6uv`, no migration)"
date: 2026-09-05
branches: [claude/vanguard-board-paging-sjx6uv]
migrations: []
subsystems: ["VANGUARD"]
---

`docs/VANGUARD_BACKLOG.md` carried the board's pagination as BLOCKED on a
question this repository could not answer: whether the Apps Script deployment
behind `action=top` honours `offset` at all. The client had been threading one
through since the single-call board landed -- `fetchOnline(then, fail, offset)`
forwards `&offset=<n>` -- and four call sites passed none, because building the
control was pointless if the backend ignored it and returned page one again.

Mr. Pina supplied the `Code.gs` source on 2026-09-05 and the answer is yes.
`top(p)` reads `const offset = Math.max(0, Math.floor(+p.offset || 0))`, sorts
descending, and returns `rows.slice(offset, offset + n)`; `n` is clamped to 500
and the client's `BOARD_N` is 250, so a page sits well inside the clamp. That
made the whole of the remaining work client-side, and this is it.

## What the cap actually cost a student

Not the missing rows. Every leaderboard cuts somewhere and 250 is an unusually
deep cut. What it cost was the one case the board already tried to handle: when
the player's own score is below the cut, `renderBoard` appends their row after a
`···` separator with a rank computed by counting the FETCHED rows that beat them.
With 250 fetched, every one of those 250 outranks a below-the-cut score, so the
count comes out 251 for everybody -- a genuinely 400th-place player read as
251st. A confidently wrong number, presented in the same cell as the correct ones
above it, with nothing to say it was a floor rather than a rank.

## The one risk the backlog named, and what was done about it

`fetchOnline` OVERWROTE `onlineBoard`. Four callers depend on that: the run start
(`startGame`), `refreshBoard`, the three delayed refetches after a score submit,
and the co-op landing's three. Every one of them is replacing a board -- a new
mode, a fresh page, a post-run refresh -- and an append there empties nothing but
does staple the same rows on twice; a replace at the LOAD MORE call site is the
worse direction, because it silently throws page one away and reads on screen as
a board that refused to grow.

So the flag is the fourth parameter, it defaults off, and **not one existing call
site was touched**. The replace branch is byte-for-byte what it was. Appending is
opt-in at exactly one new caller, `loadMoreBoard`.

Three things fell out of that which are easy to miss and each would have been a
silent defect:

- `renderBoard` did `b.slice(0, BOARD_N)`. Identical to drawing everything while
  one page was all there was; against a paged board it draws page one and throws
  away what LOAD MORE just fetched. It draws every loaded row now.
- `mergeScore` did `onlineBoard = b.slice(0, BOARD_N)`, so merging the player's
  own row into a 500-row board would have cut it back to 250. It caps at
  `max(BOARD_N, boardLoaded)`, which is identical to the old behaviour whenever
  no paging has happened.
- `boardLoaded` is the next offset and is deliberately NOT `onlineBoard.length`.
  `mergeScore` pushes a row that was never on a page, so the array length and the
  server-side position diverge by one the moment a player submits a score.

The append branch also refuses a page that lands after the mode tab moved. That
guard is on the append path ONLY -- the replace path's behaviour is unchanged,
including its existing lack of such a guard, which is a separate question and not
this bundle's.

## The rank, and why it is not simply computed better

There is no better computation available. The true rank of a below-the-cut score
is a fact about rows the client has not fetched, and no arithmetic over the rows
it has can produce it. So the choice was between a number that is wrong and no
number, and the answer is: claim it only when it is knowable.

`boardMore` is set from whether the last page came back FULL. A short page means
the fetched set IS the whole board, and then the existing count is the real rank
and is printed as one. While pages remain the row reads `>250`, the separator
reads `··· BELOW TOP 250 ···` instead of `···`, and the row detail spells it
`BELOW TOP 250`. Every one of those improves as pages load and becomes the exact
number when the end is reached. The rank label is the `&gt;` entity rather than a
bare `>`, because `_boardRowHTML` drops the rank into markup unescaped.

## The control is absent when it would do nothing

`boardMore` is false until a full page has come back, so a mode with 40 scores
never draws LOAD MORE and nobody presses a control that does nothing -- which
teaches a student the board is broken rather than that it is finished. It is
drawn as the last row INSIDE the board box rather than as chrome beside it, which
is what keeps it per-target (`titleBoard` and `bigBoard`) with no second copy of
the markup, no second click binding, and automatic removal on the render after a
short page. It rides the board's existing delegated listener for the same reason:
the button is re-created by every `renderBoard`, so a listener on the element
would have to be re-attached each time.

It is `min-height: 44px`, against the board's own 12px rows. The density contract
exception in `IDEA_INTERFACE_STANDARDS` 10 was available and is not taken: this is
a standalone control at the foot of a scrolling list, so inflating it costs one
row of scroll rather than breaking an invariant.

A failed page leaves the board exactly as it was and re-offers the control
reading `LOAD MORE · RETRY`, without re-rendering -- a re-render would reset the
label and lose the fact that the press happened.

## What was measured

- `tests/vanguard-board-paging.test.ts`, 14 assertions, all green. It CUTS the
  board's source out of the shipped build by its own anchors and evaluates it
  against a scripted jsonp and a stubbed DOM, because `src/lib/legacy/vanguard`
  is one 8,600-line HTML file behind an injection boundary with no exports and no
  harness route. Every `cut` throws on a missing or ambiguous anchor rather than
  returning empty, so a drifted anchor reddens instead of evaluating to nothing
  and passing. `BOARD_N`, `boardMode`, `boardRows`, `escHTML`, `contBadge`,
  `_boardRowHTML`, `_boardDetail`, `renderBoard` and `fetchOnline` all come out of
  the build; only `el`, `Audio_`, `localBoard`, `_achTitleChip` and `jsonp` are
  stubbed.
- **Positive control, as required.** The append branch was mutated to
  `onlineBoard = page.slice()` -- the exact replace-instead-of-append defect the
  backlog warned about. Five assertions reddened, the first naming the board
  length: `expected [ …(250) ] to have a length of 500 but got 250`. Restored
  from a `cp` copy, md5 `fa43b9717ccff2aca2452fc74f29318d` before and after,
  green again.
- Full suite: **5670 passed, 2 failed** in `tests/derived-numbers.test.ts`, run at
  2026-09-05 12:42 PDT. **Both pre-existing on `origin/integration`** -- confirmed
  by running that file in a worktree at the base commit, same two failures, same
  names. They concern `tools/browser-verify`'s README counts, which this bundle
  does not touch and does not own.
- `npm run check`: 0 errors, 37 warnings, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` over 20 files. Baseline
  held, measured before and after.
- `tools/check-vanguard-changelog.mjs` green on the new `VERSION` of 214.

## What is NOT verified

**That a second page actually arrives.** Nothing in this repository can reach the
Apps Script deployment; `API_URL` is a live Google endpoint and the test answers
its own jsonp. The offset behaviour is read out of the backend source Mr. Pina
supplied, not exercised. His check is the one that settles it: play until you are
on the board, open it, and press LOAD MORE.

No browser pass either. The game is not a `/dev` route, so `npm run verify:browser`
does not cover it, and the 44px figure above is the declared `min-height` rather
than a measured box.

## The build number moved, and the backlog says so

This is a change to `index.html`, which is the half of VANGUARD that carries
`VERSION` and `CHANGELOG`, so `VERSION` went 213 to 214 and a student-readable
214 entry was added. `docs/VANGUARD_BACKLOG.md` is organised by build number and
now states that in its header, along with the fact that its other rows' line
numbers are 213's and drift by roughly fifty lines past 5450.

## Deliberately not done

The achievement-title broadcast row is still BLOCKED, and this bundle records why
it is a different kind of blocked than the paging row was. That one was blocked on
a QUESTION about the backend, which the supplied source answered. This one is
blocked on backend WORK -- a new column in the Scores sheet and a field on both
`submit` and `top` -- which no answer removes, and the client half cannot go
first: with nothing in the row to read, a chip drawn for a row other than `me`
would be empty on every row forever.
