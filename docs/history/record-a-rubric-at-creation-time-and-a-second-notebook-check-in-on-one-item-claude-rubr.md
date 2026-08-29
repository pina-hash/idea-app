---
title: "A rubric at creation time, and a second notebook check-in on one item (`claude/rubric-staging-creation-k3g9lw`, code only, no migration)"
date: 2026-08-27
branches: [claude/rubric-staging-creation-k3g9lw]
migrations: []
subsystems: ["IDEA Classroom", "Digital notebook"]
record_order: 163
---

Two composer-adjacent gaps, closed the same way the deck, the spec and the
first check-in already were.

- **A rubric can now be staged while creating an assignment, not only added
  after it is posted.** `classroom_set_rubric` requires the item to exist and
  to have at least one posting, exactly like the two spec setters --
  `RubricBuilder`'s `itemId` prop is now `string | null` and, in the SAME
  staging mode `SpecImporter` already uses (`onstage` in place of the RPC,
  `staged` standing in for the not-yet-attached value), `ContentComposer`
  mounts it right after the spec importer whenever the item being created is
  an assignment and `teacherTransports` is available (`canStageRubric`). An
  INCOMPLETE rubric may be staged and flagged, the same way `RubricBuilder`
  already flags one at edit time -- refusing at creation what edit-time
  permits would have been the inconsistency, not the flag staying visible. A
  rubric is dropped, like the spec, the moment the item kind stops being
  `assignment` (a material or an announcement has no rubric setter to write
  through), and it is never staged on a surface that is not create-only, so
  it cannot end up staged against a draft that never gets posted.

  `composer-staging.ts` grew a fourth staged attachable
  (`StagedExtras.rubric`, `StagedExtrasTransports.setRubric`,
  `StagedExtrasResult.rubric`), applied in `applyStagedExtras` on the same
  terms as the spec: one write, attempted independently of the check-in
  after it, kept staged (named by "rubric:") on a refusal or a throw, and
  cleared only once it lands. Both new fields are optional on their
  interfaces rather than required, so the one existing caller
  (`ContentComposer`) and every pre-existing test in
  `tests/classroom-composer-staging.test.ts` needed no changes beyond adding
  the field to the two literal `ComposerDraft`/`StagedExtras` shapes that are
  now missing a key. `ComposerDraft.rubric` and `COMPOSER_DISCARD_WARNING`
  both changed to match: a staged rubric now counts as work a close or a
  navigation would discard.

- **An item can now carry more than one notebook check-in.** The schema
  already allowed it (`checkIns` was already a list, the create RPC already
  callable per class, and the student-facing render on `ItemDetail` already
  pluralized its own heading) -- the only thing enforcing "one" was a single
  `{#if checkIns.length}...{:else}<CheckInStager>` branch in `ItemDetail`'s
  MANAGEMENT half, which put the attach control behind an `{:else}` that a
  first check-in closed forever. `CheckInStager` now renders unconditionally
  alongside the list (heading pluralized to "Notebook check-ins" the same
  way the student-facing block already does), with its submit label reading
  "Attach another check-in" once one exists. `attachCheckIn` refuses a
  SECOND check-in on the SAME date, naming the reason in the refusal (a
  duplicate would put a second column on every affected class's grid and ask
  every student for the same page twice) -- a client-side courtesy check
  against the `checkIns` list already on the page, not a new database
  constraint; `class-check-ins.ts` and the RPC it wraps were not touched, per
  the session's scope. The composer's own create-time staging is unchanged
  and still stages exactly one check-in -- attaching a second is
  deliberately an edit-time-only action, matching how the deck and the spec
  already work once an item exists.

### What was measured

- **Full suite: 131 files / 3036 tests** (baseline 131/3030, +6 for the new
  staged-rubric cases and one `composerHasWork` case in
  `tests/classroom-composer-staging.test.ts`).
- **`svelte-check`: 0 errors / 37 warnings**, the same 31/5/1 breakdown as
  baseline.
- **`npm run verify:browser`: 18 route/width runs, 120 measurements, 2
  outside threshold** -- both are the pre-existing, unowned `/dev/pathways`
  harness-control tap-target finding (194.7x26.2 at both widths), unchanged
  from before this bundle. `/dev/classroom-split/s-1?manage=1`, the one route
  that mounts `ContentComposer` (with `teacherTransports` and
  `checkInTransports`) through this repo's dev harness, measured 0 console
  errors at both widths.

### What was NOT verified

- No dev harness route exercises `RubricBuilder`'s new staging mode or
  `ItemDetail`'s second-check-in path directly through a scripted browser
  interaction (clicking "Use this rubric" while creating an assignment,
  attaching a second check-in to an existing item) -- `verify:browser`'s
  route table has no entry that opens the composer's kind toggle on
  `assignment` or navigates to an item detail page, and adding one was out
  of scope for the two files this session does not own
  (`src/routes/dev/classroom-split/...`). Verified instead by
  `svelte-check`, the full test suite, and a manual trace of the new
  `stagingMode`/`shown` branches against `SpecImporter`'s existing ones,
  which they mirror line for line.
- No production or preview deployment; nothing here was opened on
  `ideabosco.com` or a Vercel preview.
- No signed-in surface and no live Supabase project -- the placeholder
  `.env` convention every prior bundle in this repo has used.
- No migration: both changes are render-path and staging-shape changes over
  RPCs (`classroom_set_rubric`, the check-in create RPC) that already exist
  and already accept the shapes now reaching them.

---

