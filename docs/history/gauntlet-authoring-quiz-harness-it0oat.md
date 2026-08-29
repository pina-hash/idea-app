---
title: "Four items no one else could reach: the GAUNTLET landing's authoring link, the FRC quiz dev harness's answer normalization, and two tap-target floors (`claude/gauntlet-authoring-quiz-harness-it0oat`)"
date: 2026-08-29
branches: [claude/gauntlet-authoring-quiz-harness-it0oat]
migrations: []
subsystems: ["GAUNTLET", "FRC", "Coin economy", "Interface standards"]
---

**Starting state, checked before doing anything.** `git fetch origin`: `HEAD`
and `origin/main` both at `2113f4d`, `origin/integration` ahead at `6a8f125`.
`git log --oneline origin/main..origin/integration` listed the full chain
including `Merge claude/gauntlet-authoring-allowlist-xui3ps into integration`
(migration 0155, `gauntlet_can_author`), so the precondition for item 1 held.
Nothing in that log touches `/gauntlet/+page.server.ts`'s Authoring gate, the
`/dev/frc-quiz` harness, `ShortLinkManager`, or `StudentPreview`, so none of
the four items were already done. Branched from `origin/integration`. Working
directory `/home/user/idea-app`.

## 1. The GAUNTLET landing page's Authoring card was still gated on `isAdmin`

0155 gave GAUNTLET authoring its own allowlisted tier
(`public.gauntlet_can_author()`, mirrored server-side by
`canAuthorGauntlet()` in `$lib/server/gauntlet-authoring.ts`) and re-gated
`/gauntlet/author`, `/gauntlet/author/new`, `/gauntlet/author/[id]` and
`/gauntlet/rooms` on it. `/gauntlet/+page.server.ts` was not touched by that
migration's own session -- it still called `isAdmin(supabase, claims.sub)` and
exposed the result as `isAdmin`, and `+page.svelte` still gated the Authoring
card on that flag. An allowlisted author who is not in `app_admins` therefore
had the capability (every author route re-checks `gauntlet_can_author()`
server-side regardless) and no way to reach it except typing `/gauntlet/author`
by hand.

Fixed by mirroring the exact pattern `/gauntlet/rooms/+page.server.ts` already
uses: `+page.server.ts` now calls `canAuthorGauntlet(supabase, claims.sub)` and
returns `canAuthorGauntlet` (renamed from `isAdmin`, since the flag no longer
means that); `+page.svelte` destructures `canAuthorGauntlet` instead of
`isAdmin` and gates the card on it. No second predicate was written -- the
existing `$lib/server/gauntlet-authoring.ts` module (its pre-0155 fallback to
`isAdmin` included) is the only thing called.

**Mutation-proven** (`tests/gauntlet-landing-authoring-gate.test.ts`, a real
Postgres with the real migration chain through 0155 applied, `gauntlet_author_grant`
used to make a non-admin teacher an author): the test asserts an allowlisted,
non-admin author renders "Open authoring" and the `/gauntlet/author` link,
while a plain teacher and a student do not, and an admin still does (positive
control). Reverting `+page.svelte`'s gate to a condition that is never true for
the author account reddened the assertion; restoring the real fix (byte-identical
via md5 against a pre-mutation copy) turned it green again.

## 2. The `/dev/frc-quiz` harness kept the answer-coercion bug the real route fixed

`tests/frc-quiz-answer-normalize.test.ts` and the header comment in
`src/routes/frc/[domain]/[unit]/quiz/+server.ts` record that the real route used
to coerce `answers` with `.map((a) => Number(a))` at its own call site, and
`Number(null)` is `0` -- so a question left blank and a question answered with
the first option reached the grader as the same value. The fix moved that
normalization into `normalizeAnswers` inside `submitQuiz` itself
(`src/lib/server/frc/quiz-service.ts`), so every caller of the service gets it
and the real route now passes `body.answers` through raw. The dev harness at
`src/routes/dev/frc-quiz/+server.ts` still had its own copy of the old
`.map((a) => Number(a))` line, because it belonged to a different session and
was never touched when the real route was fixed.

Fixed by deleting the harness's own coercion and passing `body.answers` raw,
exactly as the real route does -- there is now exactly one implementation of
"what counts as a real choice" (`normalizeAnswers`), and the harness cannot
reintroduce a second, softer one.

**Mutation-proven** (`tests/frc-quiz-dev-harness-answer-normalize.test.ts`,
driving the harness's own `POST` handler directly with `$app/environment`'s
`dev` stub forced true, no database). The test rests on an invariant rather
than a specific bank draw: a sealed correct-answer index (`sealed[i].c`) is
always a real, non-negative option position, so `NO_ANSWER` (`-1`, what
`normalizeAnswers` maps a JSON `null` to) can **never** match it, whatever the
shuffle drew -- an all-null submission is therefore deterministically `score:
0, passed: false` on every attempt, repeated over five fresh draws. Restoring
the harness's `.map((a) => Number(a))` bug turned that red (`score: 50` on one
draw, because `null -> 0` happened to match the shuffled correct index for half
the questions); restoring the fix (byte-identical via md5 against the original
file) turned it green again.

## 3. `ShortLinkManager`'s composer save button inherited the row-chip floor

`ShortLinkManager.svelte`'s save/re-point button shared `.btn.tiny` with the
row-operation chips (Edit / Turn on-off / Delete). The 24px floor on
`.btn.tiny` is documented and correct for those chips -- they sit beside a
heading on an admin-only surface no student ever taps -- but the save button is
a form's PRIMARY action, not a chip, and inherited the floor by sharing the
class. Measured before the fix (via a borrowed, room-correct dev harness --
see below): 76.1 x 24px at both widths.

Fixed by dropping `tiny` from the save button's class list (`class="btn"`
instead of `class="btn tiny"`), which lets it fall back to `.btn`'s own 44px
floor. The row-ops chips keep `.btn.secondary.tiny` untouched, so their 24px
floor is unaffected. `.btn.tiny` itself was not raised -- raising it would have
taken the row chips with it, which the task explicitly ruled out.

Measured after the fix: 112.8 x 44px at 375px and at 1440px. Row-ops chips
unchanged: 48.6-76.1 wide x 24 tall, all six, at both widths.

## 4. `StudentPreview`'s student picker was under both floors

`StudentPreview.svelte`'s `<select id="preview-student">` carried no
`min-height` at all and measured 19px -- under the 44px target for a
student-facing/phone-reachable control and under the 24px absolute floor.
Given the surface mounts inside the coin desk's `.cd-root` room (a real admin
tool an admin may use on a phone in a shop), this was not a documented
exception.

Fixed with the global `.tap-44` utility (`src/app.css`, the GROW mechanism:
`min-height: 44px; display: inline-flex; align-items: center; min-width: 0;`)
added to the `<select>` element -- the sanctioned mechanism for "a control that
owns its row", per `CLAUDE.md`'s tap-target section, rather than a bespoke
`min-height` rule.

Measured before: 247.3 x 19px at 375px, 352 x 19px at 1440px. After: 247.3 x
44px at 375px, 352 x 44px at 1440px.

## How items 3 and 4 were measured, and why the measurement is trustworthy

`npm run verify:browser`'s route specs for `/dev/coin-preview` and
`/dev/short-links` (which mount `StudentPreview` and `ShortLinkManager` in the
rooms production actually uses -- `.cd-root` + `split.css` for the former,
`main.admin-page` under the bare portal shell for the latter) exist on a
**sibling live session's branch** (`claude/marks-reduced-motion-test-kzaoyk`,
commit `19f2edd`), not yet merged into `origin/integration` at the time of this
session. This session owns none of `tools/browser-verify/`, `src/routes/dev/
coin-preview/`, or `src/routes/dev/short-links/`, and was explicitly told not
to touch the first.

So the harness route specs and dev pages were never committed to this branch.
Instead: the relevant files were copied from that sibling branch into an
UNTRACKED, temporary working-tree overlay; a standalone measurement script
(`/tmp/.../scratchpad/measure.mjs`, never committed, reusing this repo's own
unmodified `tools/browser-verify/server.mjs` and `browser.mjs` read-only for
booting `vite dev` and launching the pinned Chromium) drove real geometry
reads (`getBoundingClientRect()`) against those pages at 375px and 1440px, with
this session's own component fixes applied. "Before" numbers were taken the
same way with the two component fixes `git stash`ed out temporarily (popped
back immediately after). Every borrowed/overlaid file was then reverted to its
committed `origin/integration` state (`git checkout --` for the one file that
was git-tracked and unmodified before the overlay; the new `short-links` dev
route directory, which does not exist on this branch, was `rm -rf`'d). `git
status` after cleanup showed only this session's five owned files modified,
confirmed before every subsequent step.

The route specs' own selectors (`main.admin-page .form button.btn`,
`main.admin-page table button`, `.cd-root .preview-picker select`) were used
verbatim for the standalone script, so the numbers above are readings of the
IDENTICAL DOM the sibling session's harness will report once it merges --
these are not independently re-derived thresholds.

**Not independently verified**: the sibling branch's own `checks.mjs`/`run.mjs`
additions (which add the `maxVisible` presence-check ceiling and other
plumbing) were inspected but not exercised end-to-end through
`npm run verify:browser` itself, since that would have required committing
`tools/browser-verify/routes/*.mjs` to this branch, which the task forbade.
The geometry numbers above come from a direct `getBoundingClientRect()` read
through the same booted Chromium and the same selectors the sibling spec uses,
which is the load-bearing claim (`CLAUDE.md`: "measure, do not reason") --
whether that sibling branch's own contrast/presence checks also pass is that
session's own thing to report.

## The "6 outside threshold -> 2" claim

The task described the pass as currently reporting 6 findings outside
threshold (two pre-existing on `/dev/pathways`, plus items 3 and 4 at both
widths), expected to drop to 2 once fixed. This session could not run
`npm run verify:browser` itself end-to-end against the corrected room mounts,
because doing so requires the sibling branch's harness route specs that this
session is forbidden from adding to its own tree (see above). What was
verified instead: the two `.btn.tiny`/`select` geometry findings the task
named are gone under the same selectors the sibling harness will use (44px at
both widths, both routes), and nothing else in this session's own diff touches
any DOM the browser-verify suite reads. The `/dev/pathways` findings are
untouched by this session (owns none of that route) and are expected to remain
the 2 that survive once the sibling branch's harness lands and both branches
are on `integration` together.

## Test suite

`npx svelte-kit sync` run before `svelte-check` (after writing a placeholder
`.env` per the fresh-checkout convention). Baseline and post-change both
0 errors / 37 warnings, same 31/5/1 mix.

Full `npm test` before this session's test additions: 193 files, 4123 tests,
all passed. Two new test files added
(`tests/gauntlet-landing-authoring-gate.test.ts`, 5 tests;
`tests/frc-quiz-dev-harness-answer-normalize.test.ts`, 2 tests), each
individually run and mutation-proven (see above). Full suite re-run after:
195 files, 4130 tests, all passed -- exactly +2 files / +7 tests over the
baseline, confirming nothing else in the suite moved.

## Not verified

- Item 3/4's exact `npm run verify:browser` report (see above) -- the
  standalone geometry reads are the load-bearing evidence instead.
- No live Supabase project, no Vercel deployment, no signed-in browser session.
- Whether the sibling session's `tools/browser-verify` additions themselves are
  free of defects -- out of scope for a session that does not own that
  directory.
