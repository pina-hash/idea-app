---
title: "The student half of 0160: the preflight stops describing a gate that is gone, the dead refusal branch is deleted, and the unfinished list survives the hand-in (`claude/assignment-submission-ui-sync-g428o2`, no migration)"
date: 2026-08-30
branches: [claude/assignment-submission-ui-sync-g428o2]
migrations: []
subsystems: ["Classroom", "Assignment engine", "Browser verification"]
---

0160 is applied to production and its instructor half shipped the same night on
`claude/grading-console-incomplete-indicator-qg0tuy`. The STUDENT half was never
touched, so `AssignmentEngine` was still describing the refusal the migration
removed: a preflight list headed "Before you can submit" over a Submit button
the database had already stopped refusing, and a branch reading a
`reason: 'incomplete'` no server can return. This bundle is that half.

## The dead branch, and how it was established dead rather than assumed dead

`submit()` carried `if (res.data.reason === 'incomplete') { serverUnmet = ... }`.
Three independent readings say it cannot fire:

  * 0160's installed body returns `jsonb_build_object('ok', true, 'state',
    'submitted', 'submitted_at', v_now, 'unmet', coalesce(v_unmet, '[]'::jsonb))`
    and has no `'reason', 'incomplete'` return anywhere in it.
  * The migration's own section 4 raises at APPLY TIME if the literal
    `'reason', 'incomplete'` survives in `pg_get_functiondef`, matched on the two
    strings as they appear together in the returned object so a comment cannot
    satisfy or defeat it. A database that took 0160 provably cannot answer that
    reason; one that did not take it never ran the check at all.
  * Only three migrations name `classroom_submit_assignment` and only two define
    it: 0086 (the original) and 0160. 0134 mentions it in a comment while
    discussing the file-open race and does not touch it. So 0160's body is the
    live one and there is no third definition to re-introduce the branch.

Driven as well as read: `/dev/classroom?view=assignment` at 375 and 1440,
pressing Submit with five requirements outstanding, greps the rendered document
for "The submission was refused", "Before you can submit" and "still needed:".
All three are absent before the press and absent after it.

`serverUnmet` went with the branch, because carrying it was the whole of what it
did. **NOTHING READS THE ACCEPTANCE'S `unmet` EITHER, and that is the load-bearing
decision here rather than an omission.** `liveUnmet` is `specUnmet` over the
responses the component already holds, which is the same pure mirror of
`_classroom_spec_unmet` the grading console computes for the teacher -- so the
two halves of the feature read ONE answer. A payload copied into a second piece
of state would be the copy that goes stale the moment anything below it is
edited, which is the argument 0160's own header makes for storing no column.

## The copy

The heading is now `Still unfinished`, with a sentence under it and the same
`unmetLabel` list below:

  * editable: "You can submit without finishing these. Your teacher sees this
    same list beside your work."
  * submitted: "You submitted with these unfinished. Your teacher sees this same
    list beside your work."

Neutral on purpose. Submitting incomplete work is a legitimate act and the
sentence says so without recommending it: it states what is true and stops. And
it says the teacher sees the same list, because since the instructor half they
do, and that is what a student needs to know before deciding what to write.

**THE CARD RENDERS IN BOTH STATES NOW, which is why it moved OUT of the
`editable` block the submit row keeps.** Before this it was inside, so a
successful submit unmounted the whole thing and a student who had just handed in
unfinished work saw nothing at all about what was unfinished -- while their
teacher saw a named list of it. "Your teacher sees this same list" is only a
true sentence if the student can still see the list.

## Four double hyphens in rendered copy, and one sentence that was still lying

The named one was `unmetLabel`'s approval sentence,
`${label} -- ask your teacher...`, now `${label}: ask your teacher...`. It was
fixable as COPY ALONE: `unmetLabel` is a display function, not part of
`specUnmet`, and nothing about what any check computes, returns or is shaped
like moved. The hard constraint held with room to spare.

Beside it, `unmetLabel`'s approval FALLBACK still read "Instructor approval is
still needed **before this can be submitted**", which is the same false claim as
the heading one function over, and it is rendered to the teacher too. It reads
"Instructor approval is still needed on the work so far."

The other three were found by grepping the RENDERED document rather than the
source, which is the only way the last one would have turned up:
`AssignmentEngine`'s "Unsubmitted -- you can keep working" and
"Returned -- N / M pts", and `SpecRenderer`'s "No rows yet -- add one below."
`SpecRenderer`'s "Approved -- the modules below are unlocked." was found by the
source scan afterwards, since the fixture never reaches an approved gate.
`SpecImporter` gave up three more once its own route was being driven
("No interactive spec --", "Preview -- what students see", "Valid: ... --").
Grep of the rendered document is now zero on both surfaces at both widths.

## The dev harness was still the pre-0160 server

`/dev/classroom`'s in-memory `submitAssignment` still returned
`{ok: false, reason: 'incomplete', unmet}`. A harness must mirror the whole
mechanism it stands in for, and this one was mirroring the half that used to
refuse -- so the branch being deleted was the only branch the harness could
reach, and the branch that ships was unreachable in the one place it could have
been driven. It now runs the preflight, keeps the answer, accepts, and returns
`unmet` on the acceptance exactly as the function does.

## Two route specs, and the third that could not be written

`tools/browser-verify/routes/` had nothing for `SpecImporter` at all. Added:

  * `spec-importer-case-assignment.mjs` -- the attached-spec panel, the copy
    control, and the seeded editor reached by a real press. The `until` is the
    paste box's existence, which is 0 at rest, so `clickUntil` cannot
    short-circuit on a state the page already satisfies and the prepare step is
    a genuine measurement of a genuine click.
  * `spec-importer-case-staging.mjs` -- the composer's mount, where the panel
    and the copy control are ABSENT because there is no item to read a document
    off and no transports to reach.

Both were written to the FIXED core: every `expectPresent: 0` carries an
explicit `maxPresent: 0`, and every prepare step is a measurement that gates
`--strict`.

**THE ABSENCES ARE PROVED IN BOTH DIRECTIONS, BY MUTATING THE COMPONENT.**
Suppressing the copy control everywhere reddened the assignment spec (2 rows);
rendering it unconditionally reddened the staging spec (1 row). `SpecImporter`
was restored from a `cp` copy, never with `git checkout --`, and md5-checked
identical (`1eb398480d8c8dd02d17bc533c3816a4`) before the confirming green run.
The staging spec also pins `[1, 'staging']` for the rendered cases: without it,
a `?case=` that stopped being read would render all four mounts and every zero
would redden for a reason nobody could name from the report.

**THE GRADING CONSOLE'S INCOMPLETE INDICATOR HAS NO SPEC AND COULD NOT GET ONE
HERE.** Both the indicator and its harness route (`/dev/grading-incomplete`)
exist only on `claude/grading-console-incomplete-indicator-qg0tuy`, which is
unmerged: `origin/integration` has neither, `GradingConsole.svelte` on this base
imports neither `specUnmet` nor `unmetLabel`, and that file is a branch in
flight this bundle must not touch. A spec pointing at a route that 404s is a
harness red for a surface nobody can reach, so none was written. It belongs to
whoever lands that branch, and the slug it needs is
`routes/grading-incomplete.mjs`.

## Tap targets: 24, measured, not 44

`.btn.tiny` measures 24px on the importer's controls at both widths. The 44 a
phone would want is a property of the SHARED `.btn.tiny` rule rather than of
this component, so raising it is an app-wide change and not a spec's to assert
into existence. The specs assert the 24px floor with the reason in the label,
which is the reading `classroom-split-s-1-item-i-crowded-manage-1` and
`short-links` already take on their own chip rows. The JSON disclosure trigger
is a real 44 and is asserted as one.

## Measured

`/dev/classroom?view=assignment`, Chromium 141.0.7390.37, transitions frozen,
five requirements outstanding, at 375px and 1440px identically:

  * preflight card present 1, note present 1, list 5 items, heading
    "Still unfinished"; Submit ENABLED (`disabled` false), 96x44px.
  * submit landed on the first click attempt; afterwards `.locked-card` present,
    notice "Submitted. Your teacher can see your work now.", the card still
    present with the submitted sentence and the same 5 items, submit row gone.
  * `scrollWidth === clientWidth` (375/375 and 1440/1440), before and after.
  * contrast, composited and read back off a canvas rather than taken from a
    token name: heading 8.26:1 (rgb(90,189,168) on rgb(16,19,18)), note sentence
    15.42:1 (rgb(231,234,232) on rgb(16,19,18)), unmet item 6.06:1
    (rgb(208,128,48) on rgb(16,19,18)), submit hint 7.63:1. All clear 4.5.
  * double hyphens in the rendered document: 0, before and after submit, both
    widths.
  * console errors 0.

Mutation proof on the render condition, checked against a script asserting
[card 1, note 1, items 5, heading is the new one]: forcing the condition false
reddened it (0/0/0/false); doubling the list reddened it (items 10), which is
what proves the check counts rather than merely detecting presence.
`AssignmentEngine.svelte` restored from a `cp` copy and md5-checked identical
(`8f2d522404f39fa65032d238d812c9cd`), then green again.

`npm run verify:browser --route spec-importer`: 4 route/width runs, 80
measurements, 0 outside threshold. Whole suite: 78 route/width runs, 886
measurements, 2 outside threshold, both PRE-EXISTING on `/dev/pathways`
(its two harness controls at 26.2px against a 44 threshold) and on a route this
bundle does not touch. `--selftest`: 64 controls, 0 instrument failures.
`routes/_tools/verify-loader-guards.mjs`: all guards fired, `pathways.mjs`
restored byte-identically.

`npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings, breakdown
31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class` -- the baseline exactly. `npm test`: 211 files, 4397
tests, all passing.

## NOT verified

  * Nothing ran against the live Supabase project. Every claim about 0160's
    installed body is read off `supabase/migrations/0160_*.sql`, not off a
    catalog read; the local `.env` is the placeholder project and this session
    never had one at all (`PUBLIC_SUPABASE_URL`/`_ANON_KEY` were exported as
    placeholders for `svelte-kit sync`, per CLAUDE.md's phantom-error note).
  * No signed-in surface. The real `/classroom/...` item page needs a Bosco Tech
    Google session; everything here is the REAL components under the dev
    harness's in-memory transports.
  * No Vercel preview. Deployments are rate limited tonight, as expected.
  * `prefers-reduced-motion: reduce` was not exercised; the harness runs at
    `no-preference`, and web fonts do not load (the harness blocks every
    non-loopback request), so all text was measured in the fallback stack.
  * The approval-gate branch of `unmetLabel` and `SpecRenderer`'s "Approved."
    line were changed but never rendered: the fixture's gate is unapproved and
    only a teacher can approve it. Both were verified by source scan only.

## Deferred

  * `.btn.tiny` at 24px on instructor tools, against the 44 a phone wants. It is
    one shared rule under a great many controls and its diff is a whole-app
    visual pass, not a line in a copy bundle.
  * A double-hyphen sweep of the classroom's remaining copy. This bundle fixed
    every one on the two surfaces it drove and every one in the files it owns;
    it did not sweep the subsystem.
