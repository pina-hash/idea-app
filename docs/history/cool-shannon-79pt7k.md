---
title: "A teacher can turn the Blade editor on for an assignment: `ideacad_set_editor` gets its first caller outside `/dev` since 0201, and turning it off is measured to destroy nothing (`claude/cool-shannon-79pt7k`, no migration)"
date: 2026-09-13
branches: [claude/cool-shannon-79pt7k]
migrations: []
subsystems: ["IdeaCAD", "Classroom", "Browser verification"]
---

IdeaCAD was complete and unreachable. `ideacad_set_editor` shipped in `0201` and was
applied; `BladeEditor`, the store, the history timeline, sharing, assembly checkout
and the archive were all built on top of it across ledgers 0170 through 0218 -- and
**no surface outside `src/routes/dev/` had ever called that RPC**, so nothing could
put `assignment_schema_version` 4 on a classroom item, so no teacher could create a
Blade assignment and no student could open one. Every student-side path in the
subsystem was dead code behind a column nothing could set. This bundle is the control
that ends that.

## The audit, and what the tree said

Five questions were answered against the tree before a line was written. Four
confirmed what the prompt claimed; the fifth found the claim had no answer at all.

1. **Nothing teacher-reachable called it.** `grep -rn ideacad_set_editor src/` returns
   exactly one line, `src/lib/ideacad/transports.ts:175`, which is the transport. The
   only other references are `setEditor: async () => ({})` stubs in
   `/dev/ideacad-item` and `/dev/ideacad-shared`. Confirmed.
2. **`0201`'s clauses are all there, and there is a sixth the router chat did not
   name.** Teacher-gated on `_classroom_manages_item`, refuses a non-assignment,
   refuses schema 3, sets schema 4, upserts `ideacad_editors`, and a null editor
   deletes the row and clears the column -- plus `if p_editor<>'blade' then raise
   exception 'Choose the Blade editor.'`, which is a seventh refusal and is now
   covered.
3. **The instructor arm's assignment controls are the `Assignment engine` block**
   inside `insp-group-content` in the inspector, gated on `canEditAssignment`
   (`kind === 'assignment' && canManage && !!teacherTransports`). The new block sits
   beside it and is NOT inside it: `teacherTransports` is the v1 spec boundary and
   has nothing to do with this one, so folding them together would hide both controls
   on a deployment missing either.
4. **`DEFAULT_BLADE_CONFIG` passes `bladeConfigShaped` as written** --
   `validateBladeTree(DEFAULT_BLADE_CONFIG.defaultFeatures)` returns `[]` and the
   predicate returns `true`, measured by running it rather than by reading it. The
   prompt's contingency ("if it does not, that is the finding and the build changes
   shape") did not fire. It is pinned in `tests/ideacad-attach-control.test.ts`,
   because if it ever stopped being true every new Blade assignment would be one
   nobody can open and the only symptom would be a student in class.
5. **`/admin/ideacad-materials` supplies NO config, and there is no per-item config
   source anywhere.** That page reads and writes `ideacad_materials` -- the GLOBAL
   material library, `owner is null`, admin-only -- which `bladeConfigWithMaterials`
   resolves over a config at RENDER time inside `BladeEditor`. It never touches
   `ideacad_editors.config`. So the config written on attach is
   `DEFAULT_BLADE_CONFIG`, and it is the only one there is.

## THE ROUTE PAGE WAS ADDED TO THE LANE MID-SESSION, AND THAT IS THE POINT WORTH KEEPING

The prompt's Owns list could not make the feature reachable. The control belongs in
`ItemDetail`'s instructor arm, and **no manager-side IdeaCAD write transport reaches
`ItemDetail`**: `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` builds
`createIdeacadTransports(data.supabase)` on line 60 and hands the component only
student-shaped props, every one of which (`ideacadWrites`, `ideacadTeam`,
`ideacadShared`) is null for a manager by construction. Making the control live needs
one added prop line in that file.

The session stopped and asked rather than editing it. **The router chat amended the
Owns list to add exactly that one file**, verified against the tree -- none of the
three branches ledger 0222 is landing (`claude/busy-feynman-aupq55`,
`claude/sharp-einstein-cqrnx6`, `claude/youthful-lovelace-kg9482`) touches it, and it
is not in ledger 0224's surface; re-verified here by diffing each branch against its
merge base before the edit. **The reason it was granted rather than deferred is that
ledgers 0201 and 0217 both left exactly this kind of wiring gap for somebody else to
clean up** -- 0201 built `SharePanel`, `shared-open.ts` and `store.openShared` and
could mount none of it, and the grant sat live and unreachable BY CONSTRUCTION for
three days until 0217 was issued to close it. A lane whose entire purpose is "make
the subsystem exist for a user" must not end by handing the last line to the next
lane.

One line was added, at line 1043, and no existing line in that file was changed:

```
	ideacadAttach={data.canManage ? ideacadTransports : null}
```

`data.canManage` is the predicate that file already uses for `teacherTransports`,
`referenceTransports`, `deckTransports`, `revisionTransports`, `instructorCopy` and
`gradeHref`, read off the file rather than invented.

**`IdeacadTransports` satisfies the attach prop structurally**, which is what makes
that one line the whole change: `IdeacadAttachControl` declares `bladeConfig` and
`setEditor`, and `createIdeacadTransports` returns `IdeacadTransports &
IdeacadAttachControl`. The narrowing is the prop's type -- an instructor arm typed to
the two-member interface sees two members and not twenty -- and the page needs no new
import, no object literal and no second construction.

**The intersection is not an `extends`, and that was measured rather than chosen.**
The first attempt had `IdeacadTransports extends IdeacadAttachControl`, which makes
`bladeConfig` a REQUIRED member of the boundary interface and reddened every
hand-built stub of it: `tests/ideacad-store.test.ts:33` and
`tests/dom/ideacad-mount.test.ts:303`, both outside this lane's Owns. The property
belongs to the CLIENT object, not to the boundary, so the factory's return type
carries it and the interface is untouched.

## What the control does

`ItemDetail`'s instructor arm, inside the inspector's one `{#if canManage}`, in the
`Content and work` group beside the assignment engine. Three conditions gate it, each
doing a different job: `canManage` is the person, `kind === 'assignment'` is the item
(the RPC raises for anything else, so a control on a material could only ever refuse),
and the transport is the deployment. `hasInspector` and `groupContent` both widened,
or a manager whose only affordance is this control would get no tools strip -- or a
strip that opens onto an empty region.

**State is read from the item on every render and never remembered.**
`ideacadAttachState(item)` asks `isIdeaCad` and `isHtmlAssignment`, the two predicates
every other surface already uses, rather than reading the column a third time. A local
`$state` mirror is exactly what would look right and be wrong after a failed write.

**ON validates the config BEFORE the call and writes nothing when it fails.**
`ideacad_open_document` mints a student's first concept out of
`config->'defaultFeatures'`, so a row written with a config `validateBladeTree`
refuses is an assignment that accepts a student and then will not open for them, days
later, in front of the wrong person. The database has no opinion about this -- `0201`
takes whatever jsonb it is handed -- so the check is the client's and the only
observable difference between running it before and after the write is a call count.
That count is what the browser spec measures.

**The schema-3 refusal is surfaced twice, at two different moments, and the two are
deliberately not the same sentence.** The control is ABSENT on a schema-3 item with
`IDEACAD_ATTACH_OTHER_SURFACE` standing in its place, because a button there could
only ever produce a refusal. The database's own sentence -- `This assignment already
uses another work surface. Remove it first.` -- is rendered VERBATIM if the RPC raises
it anyway, which is reachable in production when another manager imports a document
between the page loading and the press. `ideacadAttachRefusal` never re-tones a
database sentence; its fallback fires only where there is no message at all.

## WHAT HAPPENS TO STUDENT WORK WHEN A TEACHER TURNS IT OFF

**Nothing is deleted. Every document is stranded until it goes back on.** Both halves
are measured against the real function in
`tests/db/ideacad-attach-set-editor.test.ts`, not read off the migration:

- `ideacad_set_editor(item, null, null)` deletes the `ideacad_editors` row and sets
  `assignment_schema_version` back to null.
- `ideacad_documents`, `ideacad_concepts` and `ideacad_predictions` all cascade off
  `classroom_items` and NEVER off `ideacad_editors`. There is no trigger on that table
  but `touch_updated_at`, and no `delete from public.ideacad_documents` anywhere in the
  migration chain. Driven: two students open, one saves work and files a prediction,
  the editor is turned off -- 2 documents, 2 concepts, 1 prediction still there
  afterwards, with the saved feature tree byte-identical, against the same three counts
  taken a moment earlier as the positive control.
- `ideacad_open_document` then raises `This assignment does not have the Blade editor.`
  for that student. **That is the cost, and it is what the confirmation names.**
- Turning it back on returns every student to the concept they left: the document
  upsert is `on conflict do nothing` and a document that already has an
  `active_concept_id` mints no second concept. Driven: same concept id, same features,
  same revision, still 2 documents and 2 concepts.

So the control asks for a **typed confirmation** (`TURN OFF`) behind a warning that
says both halves. A confirmation reading "this cannot be undone" would be false; one
saying nothing would let a teacher take a class's work off the screen mid-period
without knowing it. The confirm is `aria-disabled` and never `disabled`, so the press
lands and is refused by the same predicate that greys the control -- two spellings of
"is this ready" is what produces a press that does nothing.

## The defect that every measurement passed

**The warning was invisible, and only the rasterized picture said so.** It shipped as
a `.hint` beside the state sentence, which is another `.hint`: same size, same ink, no
gap. At 375 and at 1440 the two read as ONE grey paragraph -- the sentence saying a
whole class loses access to their work looked exactly like the sentence saying what
the editor is. Contrast measured 14.07:1, presence 1, inside its block, over the
floor: every check green, because **none of them asks whether a reader can tell two
sentences apart**. It is a `.feedback` box in `--amber` with a glyph now, and the
sentence itself is the third signal.

That is the second time on this surface that looking found what measuring could not
(ledger 0201's 873px button, ledger 0196's three defects). The habit holds.

## THE PROMPT CONTRADICTED ITSELF ON ROUTE SPECS, AND THE FIX WAS THE SCOPED FORM

The prompt said this bundle changes no route spec and, in the same breath, asked
for a browser route spec at 375 and 1440. Those cannot both hold, and the way it
surfaced was a suite regression rather than an argument: `tests/derived-numbers.test.ts`
enforces that a README measured block claiming `Measurements outside threshold: 0`
must cover every route spec the tree actually has, so five unmeasured
`ideacad-attach-*` specs reddened **seven** of its assertions. Measured before the
fix: **8 failed / 8855 passed**, of which one is the pre-existing
`migrations-applied-record` hash and seven are all that one file.

**The correction was `npm run verify:readme -- --route /dev/ideacad-attach`, the
SCOPED form, never the whole-tree one.** Scoped takes 52 seconds and writes only
this lane's five files; the full pass is about seventeen minutes and would rewrite
measurements belonging to lanes that are still running. **Proved rather than
asserted:** every one of the 223 pre-existing measurement files was md5-hashed
before the run and after it, and the only entries that moved are the five new
`ideacad-attach-*.json` and `README.md` itself.

## Measured

- **`svelte-check` 0 errors / 37 warnings in 20 files (31/5/1).** The baseline was
  re-derived in a clean `git worktree` at `origin/integration` (`709827d7`) rather
  than trusted from `CLAUDE.md`, and reads **identically**: 0/37/20 at 31/5/1. Delta
  zero. `.env` was written before `svelte-kit sync` in both trees, per the
  phantom-error rule.
- **`npm run verify:browser -- --route /dev/ideacad-attach`: 10 route/width runs, 116
  measurements, 0 outside threshold**, across five states at 375 and 1440.
- **Five states rasterized and looked at**, not only measured: `off` at both widths,
  `on` armed at both widths (before and after the warning fix), `badconfig` refused,
  `other`, and the student's empty page.
- **The full suite: 467 files, 8863 tests, 1 failed / 8862 passed**, against a
  baseline re-run on `origin/integration` at `709827d7` of **465 files, 8833
  tests, 1 failed / 8832 passed**. The one failure is the SAME pre-existing one in
  both trees -- `tests/db/ideacad-attach-set-editor.test.ts` is not it;
  `tests/db/migrations-applied-record.test.ts` fails on the `0210` record's hash,
  identically and with identical digests, on a clean worktree at the branch point.
  **Delta: +2 files, +30 tests, 0 new failures.**
- **Six mutants, four killed, and the two survivors each resolved rather than
  accepted.** Every file was copied to a buffer first and restored FROM THAT
  BUFFER with an md5 check, never `git checkout --`; every verdict was read off
  the summary line, never the exit code.
  - `M1` the DATABASE teacher gate (`_classroom_manages_item` -> `false`, opened
    rather than removed, so a non-manager gets through): **KILLED**, 3 failed / 9
    passed.
  - `M4` the ROUTE PROP LINE deleted -- valid TypeScript, clean compile, feature
    gone: **KILLED**, 1 failed / 17 passed. That is the regression this lane
    exists to make loud.
  - `M2` the CLIENT `canManage` gate dropped from `canAttachIdeacad`:
    **SURVIVED**, and it is genuine defence in depth rather than a test gap.
    Proved pairwise, which is what `CLAUDE.md` requires instead of deleting the
    redundant check: opening the OUTER layer alone (`{#if canManage &&
    hasInspector}` -> `{#if hasInspector}`) ALSO survives, and opening BOTH
    reddens (1 failed / 17 passed). Neither layer is observable while the other
    still refuses.
  - `M3` the config guard bypassed (`if (false && !bladeConfigShaped(...))`):
    **SURVIVED under vitest and KILLED by the browser, 4 of 116 measurements
    outside threshold.** That is a finding about the TEST rather than about the
    code, and it is written down here because it would otherwise read as
    coverage: the source-level assertion pins only that the guard appears BEFORE
    the call, and a mutant that keeps the guard's text in place keeps that order.
    The claim that actually matters -- the RPC is never reached -- is behavioural,
    and the only instrument that can see it is the harness counting calls.

## For a person to act on

- **NOTHING ABOUT THIS NEEDS A MIGRATION AND NOTHING SHOULD GET ONE.**
  `ideacad_set_editor` is applied; this bundle claims nothing.
- **The first real Blade assignment is now one press away**, and the press is one
  click behind `Instructor tools` on the item page, in the `Content and work` group.
  That is the inspector's own rule (a fresh load starts collapsed) and matches every
  other assignment control, but it is the first thing anybody will ask about, so it is
  pinned as a measured fact in the test file rather than left to be discovered.
- **A teacher cannot see a student's CUSTOM material and still cannot.** `0208`'s
  select policy is `owner is null or owner = auth.uid()`, and nothing here widened it.
  A class set on a shared library is fine; a student who invents their own is invisible
  to whoever grades it. That hole is `CLAUDE.md`'s and is unchanged by this bundle.
- **`classroom-updates.json` WAS NOT WRITTEN, AND SOMEBODY SHOULD WRITE IT.** The
  standing directive in `CLAUDE.md` says every session that changes
  classroom-facing behaviour appends a student-readable entry before committing.
  This bundle's student-visible effect is conditional -- nothing changes for a class
  until a teacher presses the control -- but the moment one does, students on that
  assignment open a CAD document instead of whatever the hand-in was, which is
  exactly what that log is for. The file was left alone because it is outside this
  lane's Owns and because it is a root-level shared write point three lanes landing
  on the same day would all conflict on. **The entry to write, when the first Blade
  assignment is posted:** that some assignments now open a drawing tool in the page
  instead of a hand-in, that each student gets their own document, and that nothing
  they draw is lost if a teacher turns it off.
- **`ideacad_roster` still has no caller in `src/`.** A teacher can now attach the
  editor and can read every student's document through RLS, but there is no console
  that does. That is the next visible gap in the subsystem and is nobody's lane yet.
