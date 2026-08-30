---
title: "Testing: the three undriven props get mounts -- `ItemDetail.attachmentsEnabled` false, `ItemDetail.ondeleted`, and both `SiteFeedback` write paths (`claude/dom-undriven-props-coverage-w4k2np`, tests only, no migration)"
date: 2026-08-29
branches: [claude/dom-undriven-props-coverage-w4k2np]
migrations: []
subsystems: ["Classroom", "Feedback", "Testing"]
---

**Starting state, checked before doing anything.** `git fetch origin`: `HEAD` at
`e099f48` (the author-tier branch from the previous session), `origin/main` at
`2113f4d`, `origin/integration` at `6a8f125`. `git log --oneline
origin/main..origin/integration` showed 60 commits, including this session's own
predecessor merged twice (`9ff995c`, `6a8f125`); nothing there covers the three
props below. Branched from `origin/integration`.

**Precondition, checked and true.** `vitest.config.ts` defines a `dom` project
with `include: ['tests/dom/**/*.test.ts']`, `environment: 'happy-dom'` and
`resolve.conditions: ['browser']`.

**THE NAMED AUDIT FILE DOES NOT EXIST IN THIS REPOSITORY.** The task said to
read `docs/history/test-coverage-audit-lhl9bv.md` first. It is not on
`integration`, not on `main`, not in `git log --all --diff-filter=A` for that
path, and no branch matching `*lhl9bv*` exists on the remote (the only branches
are `integration`, `main`, and three `claude/**`). It is presumably still
unpushed in a live session. That changed nothing about the work, because the
task also said to verify each finding independently -- which is what the rest of
this entry is. Every claim below was re-derived from the source in this session;
none is quoted from the audit.

## Verifying the three findings

**1. `ItemDetail.attachmentsEnabled` -- CONFIRMED, exactly as stated.** It
defaults `true` (`ItemDetail.svelte:111`), is typed optional (`:138`), and
reaches the student hand-in as
`<AssignmentEngine ... uploadEnabled={attachmentsEnabled} />` (`:1124`). Nine
`ItemDetail` mounts exist across four dev harnesses (`/dev/classroom` x4,
`/dev/classroom-reference` x2, `/dev/classroom-phase1` x2,
`/dev/classroom-split` x1) and a sweep of `src/routes/dev/` for the prop name
returns NOTHING. The only writers are production
(`classroom/[sectionId]/item/[itemId]/+page.svelte:84`, `+layout.svelte:329`
and `:368`). No file under `tests/` names it either. The false branch had never
rendered anywhere.

It is inert today -- `+layout.server.ts:585` hardcodes `attachmentsEnabled:
true` -- and it was `driveConfigured()` before 0133, which is the outage
CLAUDE.md records. One line from live, and its off state undriven.

**2. `ItemDetail.ondeleted` -- CONFIRMED.** Defaults `null` (`:116`), fires as
the last statement of `remove()` (`:469`), and production wires it to
`goto()` (`item/[itemId]/+page.svelte:103`; the People tab has its own at
`people/+page.svelte:40`). Sweeping `src/routes/dev/` and all of `tests/`
returns nothing.

**3. `SiteFeedback.anonymous` -- THE CLAIM AS PUT TO ME IS WRONG, IN TWO
PLACES, AND SAYING SO IS THE POINT OF VERIFYING RATHER THAN TRANSCRIBING.**

  * "No harness does" is false. `/dev/feedback` passes `anonymous` at two of
    its nine `SiteFeedback` mounts (lines 267 and 276), both wired to the REAL
    `submitAnonymousFeedback` through a counting fetch.
  * "Leaves the branch that exists for the broken case untested" is also false.
    `tests/dom/feedback-contact-field-mount.test.ts` already mounts the real
    component and drives BOTH `anonymous: true` and `anonymous: false` across
    six of its eight tests, and `tests/feedback-anonymous-route.test.ts` drives
    the real `/api/feedback` route against a real Postgres and asserts
    `feedbackWriter` is non-null for a signed-out caller
    (`tests/feedback-coverage.test.ts` pins the same predicate four ways).

  **What IS untested is the join, and that is what got written.** Every existing
  mount injects a stand-in `submit`, so nothing had ever checked that a box
  mounted the way production mounts it reaches `app_feedback` on one branch and
  `POST /api/feedback` on the other. `feedbackWriter` was proven in isolation
  and `SiteFeedback` was proven against a fake; the wiring that decides which of
  two write paths a real report takes had never been driven end to end. The two
  helpers are called SEPARATELY at each of the four mount sites
  (`+layout.svelte:59` and `:85`, `gauntlet/+layout.svelte:48` and `:76`, the
  classroom deck route, the error boundary), and the day they disagree is the
  day the box says a name is attached to a row that carries none. The new file
  derives both props from ONE (client, userId) pair through the two real
  helpers, so a disagreement has somewhere to fail.

## What the three files assert

`tests/dom/item-detail-attachments-disabled-mount.test.ts` (6 tests). With the
flag false the picker is **removed, not disabled** -- 0 `input[type=file]` and 0
disabled ones, against a positive control that the default state renders at
least one -- and `File uploads are not configured on this deployment.`
(`AssignmentEngine.svelte:419`) stands in its place. The rest of the hand-in
survives (`Your work`, `Your files` both still present), so a false flag costs
the upload and not the student's whole work surface. The spec-driven half is
driven through the SAME prop: an `imageZone` module yields `Photo uploads are
not configured on this deployment.` (`SpecRenderer.svelte:632`), with a control
mount on the identical spec proving the sentence is the flag's doing. **Driven
from `ItemDetail` rather than by mounting `SpecRenderer`**, deliberately: the
existing `classroom-manager-spec-visibility-mount` and
`classroom-module-collapse-mount` files already pass `uploadEnabled: false`
straight to `SpecRenderer`, which proves that component's branch and says
nothing about whether `ItemDetail`'s prop ever reaches it. That wiring was the
untested part.

`tests/dom/item-detail-ondeleted-mount.test.ts` (7 tests). The two-press
confirm, then the ORDER: the callback fires exactly once and AFTER the transport
answers, never on a refusal, and re-arms rather than sticking. **The finding is
what the component has done to itself by then: nothing.** `remove()` disarms the
confirm, clears `busy` and calls out; it does not unmount, blank the item or
render any acknowledgement. Asserted by reading `target.textContent` INSIDE the
callback rather than after it -- the item's title is still there and no
"deleted" sentence exists. So the entire user-visible outcome of a successful
delete lives in the caller's callback, which is the same shape as the recorded
lesson that a delete's note belongs on the surface that is on screen afterwards.
The last test pins the undriven arrangement itself: with no callback -- every
harness -- the write lands and `target.textContent` is byte-for-byte what it was
before the press. A successful delete is indistinguishable from a silent
failure, which is what a reviewer driving `/dev/classroom` has always seen.

`tests/dom/feedback-write-path-mount.test.ts` (7 tests). Signed in: one insert
into `app_feedback` carrying `user_id`, and `fetched` is empty. Signed out: one
POST to `/api/feedback` carrying the message, and `tables`/`inserted` are empty.
Each asserts the OTHER path was not taken, because a writer that fell through
would still land the report -- just stripped of its account, or attributed when
it should not be. The third case is the one a two-state test misses: a session
with NO client (`feedbackIsAnonymous(null, 'u-1')` is true), which is the error
boundary after a layout load failed and is exactly the broken-sign-in case the
branch exists for. Plus `askContact` agreeing with the writer in both
directions, a typed contact reaching the route body and no table, and
`allowAnonymous: false` removing the trigger entirely.

## Measured

| | before | after |
| --- | --- | --- |
| `svelte-check` | 0 errors / 37 warnings, 31/5/1 | **identical** |
| full suite | 193 files, 4123 tests, 148.79s | **196 files, 4143 tests, 149.70s** |
| `dom` project alone | 11 files, 67 tests, 5.04s | **14 files, 87 tests, 6.05s** |

The `dom` figures are two real runs of `--project dom`, the "before" taken by
moving the three new files out of the directory and back rather than by
subtracting. +20 tests for +1.01s, which is about 50ms per mounted test against
roughly 2ms for an SSR one -- the ~22x the directory's README warns about, and
the reason all three files stay narrow.

**Mutation proof, 12 mutants, every one reddened.** Applied to the real
components; restore was `cp` from `/tmp/mut2/orig`, never `git checkout --`.

| mutant | result |
| --- | --- |
| A1 `uploadEnabled={attachmentsEnabled}` hardcoded true | 3 failed / 3 passed |
| A2 the not-configured sentence dropped (control still gone) | 1 / 5 |
| A3 the picker renders regardless of the flag | 2 / 4 |
| A4 `SpecRenderer` drops its own explanation | 1 / 5 |
| B1 callback fires BEFORE the write answers | 2 / 5 |
| B2 callback fires on a REFUSED delete | 1 / 6 |
| B3 the two-step confirm collapses to one press | 5 / 2 |
| B4 the confirm stays armed after the attempt | 3 / 4 |
| C1 a signed-in report falls through to the route | 1 / 6 |
| C2 the flag ignores a missing client | 1 / 6 |
| C3 `allowAnonymous: false` stops removing the control | 1 / 6 |
| C4 the route body drops the typed contact | 1 / 6 |

A2 is the one worth reading: dropping only the SENTENCE, leaving the control
correctly absent, still reddens. That is the assertion that separates "refused
and said so" from the silent loss the rule exists to prevent, and it is the
whole reason this file mounts rather than greps.

Restore verified byte-identical by md5 across all five touched components, and
`git diff --stat src/` is empty.

## Two things worth knowing for the next mount test

**`$app/navigation` needs one more export than the shared stub has.**
`AssignmentEngine` calls `guardSaveNavigation`, which calls `beforeNavigate`
during component init (`save-guard.svelte.ts:64`). `tests/stubs/app-navigation.ts`
exports the four navigation functions an SSR render reaches and NO lifecycle
hook, so the call lands on `undefined` and the mount dies before rendering a
node -- with a stack that names the guard rather than the missing export. Both
`ItemDetail` files mock it locally with `vi.mock` + `importActual` rather than
widening the shared stub, because that file is imported by three other suites
and two other sessions are live. **If a third mount test needs it, widening
`tests/stubs/app-navigation.ts` is the right move and this is the note that says
so.**

**The manager's delete control is behind a collapsed disclosure.** It lives
under `{#if inspectorOpen}` (`ItemDetail.svelte:603`), the "Instructor tools"
strip, so it is not on screen at mount. A test that queried for it directly
would report it missing -- a false absence, which is the exact failure shape
this directory exists to avoid producing. `openInspector()` presses the strip
first and is a step in the instrument, not an assumption.

## What was deliberately not done

No geometry, contrast or tap-target assertion appears in any of the three files.
happy-dom has no layout engine: `getBoundingClientRect()` answers 0x0 and
`getComputedStyle(el).color` is the empty string while `.display` resolves
correctly, so one working computed read is not evidence about the next. Those
claims belong to `npm run verify:browser`, which was not run here -- this bundle
adds no CSS, touches no `/dev` route and changes nothing it measures.

Nothing under `src/`, `supabase/migrations/`, `tools/`, `tests/db/`,
`CLAUDE.md` or `docs/HISTORY.md` was modified. No migration. No
`classroom-updates.json` entry: nothing a class sees changed.
