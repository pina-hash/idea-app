---
title: "Two overflow fixes registered, three CLAUDE.md traps written down, two false comments corrected"
date: 2026-08-29
branches: [claude/horizontal-overflow-routes-4fqmwe]
migrations: []
subsystems: ["browser-verify", "FRC", "classroom", "documentation"]
---

## Two overflow fixes registered, three CLAUDE.md traps written down, two false comments corrected

Scoped session, file ownership: `tools/browser-verify/`, `CLAUDE.md`,
`src/lib/file-drop.ts` only. Started from `origin/main` at `319fc76`
(matched `HEAD`, already the designated branch).

### 1. `/dev/frc` and `/dev/classroom-deck` registered in `tools/browser-verify/routes.mjs`

c04e448 fixed three 375px overflow defects and registered three routes, but
left the FRC header nav's own fix (`flex-wrap: wrap` on `.frc-nav`) and the
classroom-deck harness's own fix (`min-width: 0` on `.controls label`)
unprotected -- both CSS rules were already on `main`, just never driven by
anything automated. Registering a route is enough on its own to get the
horizontal-scroll check, which `run.mjs` runs unconditionally for every
listed route at every width; no per-route config is needed for that half.

**`/dev/frc`** is asserted in its DEFAULT state (no `prepare` step): `rankCount`
is `0`, not `null`, so the rank chip renders, and `simulateTeacher`
(`adminOverride`) defaults `true`, so the admin "View as student" toggle
renders too -- the harness starts already in the widest nav configuration the
original defect needed. Presence checks pin the header, the nav, the admin
toggle and the rank chip.

The FRC fix needed a second, non-obvious assertion beyond zero overflow: the
task's own instruction was right that `min-width: 0` alone did NOT fix this
shape (it moved the overflow one flex level down onto the rank badge's own
nowrap text) and that `flex-wrap: wrap` is what converged -- so the outcome
worth locking in is that the wrap did not cost the >=1024px nav its single
line, not a rule restating which CSS property did it. First attempt at that
check compared each child's own rounded `top` and was WRONG: measured
`[216, 216, 216, 218, 218]` at 1440px on a render that is genuinely one line,
because `align-items: center` centers each child against the tallest one, so
children of slightly different heights (28.7px links vs 25.6/25.2px button
and chip) land at tops that differ by ~2px even on the identical line. That
false positive would have reddened this check on every future run and taught
whoever saw it to distrust it. Fixed by comparing the ROW'S OWN height
against its tallest child (`navH <= maxChildH + 4`): a genuine second line
adds a whole line-height plus the row's `gap` (~35px+), which the few px of
centering slack cannot produce. Verified both ways with the real harness
Chromium: `false` at 1440px under the top-comparison version (the bug),
`true` under the height-comparison version, `true` at 375px where wrapping is
expected and the check is a deliberate no-op below 1024px. The 1440px nav
height measured 28.71875px -- reproduces c04e448's hand-measured 28.7px
exactly.

**`/dev/classroom-deck`** needed no `prepare` step either -- the default
`view` is `'panel'`, which renders `.controls` (the mode/fault selects,
including the widest option string) immediately. Presence checks pin the
controls block and its two selects; the horizontal-scroll check covers the
regression itself.

### 2. Three `CLAUDE.md` traps

Checked first whether any were already written down in some form (the task
warned another session had recently added two environment facts). The
happy-dom "one working computed-style read is not evidence about the next"
rule was ALREADY THERE, near-verbatim (the `getComputedStyle().color` empty
string / `.display` "block" pair, "THE TRAP INSIDE THE TRAP"), so it was left
alone rather than duplicated.

Two were genuinely new and are now in `CLAUDE.md`:

- **`git checkout -- <file>` restores from HEAD, not from what a mutation
  script saved**, added beside the existing mutation-proof guidance under
  "Verification standard." States the failure the way it presents (a
  mutation suite that suddenly all passes, because the remaining mutants ran
  against a `git checkout`-restored pristine original with the session's own
  uncommitted edits silently discarded too) rather than as an abstract
  warning, per the task's instruction.
- **`dispatchEvent` runs a `disabled` control's listener anyway**, added as a
  sibling bullet to the existing "a genuinely `disabled` control swallows
  pointer events" rule in the DOM known-traps section, since both are about
  the same attribute's real vs. assumed behavior. States what to assert
  instead: the `disabled` (or `aria-disabled`) attribute's presence, which is
  what a real click actually refuses -- never that a synthetic dispatch was
  refused, since it never is.

Both edited in place; neither is a second copy of an existing rule.

### 3. Two false comments in `src/lib/file-drop.ts`

The module header and the `createDropController` docstring both said "This
repo has no DOM/event-dispatch harness," citing
`tests/classroom-manager-spec-visibility.test.ts` as the evidence. That
harness now exists (`tests/dom/`, a second vitest project on happy-dom +
svelte's client build, added by a prior session's SSR/DOM project split) and
this file's own drag/drop/paste is one of the four cases `tests/dom/README.md`
names as depending on it. Corrected both comments to name the real state:
`tests/classroom-file-drop.test.ts` still drives `createDropController` with
synthetic event-shaped objects in the plain node project (no DOM needed for
that), while `tests/dom/classroom-upload-picker-parity-mount.test.ts` and
`tests/dom/drag-events.ts` now drive the `dropTarget` Svelte action itself
through real `dispatchEvent` calls against a mounted node. Swept the rest of
the file for the same assumption; nothing else referenced it.

### Verification

- `svelte-check`: 0 errors, 37 warnings (fresh checkout: `npm ci`, placeholder
  `.env`, `svelte-kit sync`, matches the documented baseline breakdown).
- `npm run verify:browser` (all routes): before this session's route
  additions (`git stash`), 40 route/width runs, 306 measurements, 4 outside
  threshold. After, 44 route/width runs, 328 measurements, 4 outside
  threshold -- the same two known findings (`/dev/pathways` harness controls
  tap-target, `/dev/notebook` free-entry title+folder field presence), each
  occurring at both widths, and nothing new. Total wall clock ~101.5s before,
  ~107-108s after (+2 routes x 2 widths cost roughly 6s, as expected).
  `/dev/frc` and `/dev/classroom-deck` alone: 4 route/width runs, 22
  measurements, 0 outside threshold.
- `npm test`: 156 files, 3395 tests, all green -- unchanged from before this
  session, as expected for a change that adds no application logic.

### Not verified

- The live Supabase project, a real Drive round trip, a signed-in session: not
  touched by this change, so not exercised.
- Web fonts do not load in the harness Chromium (external requests blocked);
  the FRC nav height and line-count measurements above are against the
  fallback font stack, matching every other reading `verify:browser` reports.

Pushed to `claude/horizontal-overflow-routes-4fqmwe`. Not merged to `main`, per
standing instructions.
