# IdeaCAD, the direct modeler and the materials library

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). IdeaCAD documents and archiving, the direct modeler workspace and kernel traps, and materials as data. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

**IDEACAD IS CLASSROOM'S SCHEMA-4 NATIVE CAD ENGINE.** Its tables are
`ideacad_editors`, `ideacad_documents`, `ideacad_concepts`,
`ideacad_predictions` and `ideacad_materials`. The feature tree is the document and every geometry and physics
readout is derived from it. Realtime broadcast is only the speed layer: the database poll
is the floor, frames are roster- and revision-filtered, and no frame can write state.
**The direct modeler (solid-v1, what `/ideacad` opens) has had the same shape since ledger
0298**: after each accepted save it sends a ping carrying only a document id, a concept id
and a revision, every open copy also reads the committed revision every `SOLID_LIVE_POLL_MS`
and on focus, and `liveDecide` in `$lib/ideacad/solid/live-sync.ts` is the one decision. A
copy with unsaved work is never replayed over (it is told in words and offered the newer
version); a copy whose own save is in flight waits, because the newer revision may be its
own. A ping is a reason to read the database and nothing else.

**A DOCUMENT IS ARCHIVED, NEVER DELETED, AND THAT IS MR. PINA'S DECISION OF
2026-09-13** (`docs/decisions/entries/29-*`, built as `0214`). He brings up past
student work to show current students as reference, and work from students who
have since left is exactly what he wants to be able to show, so `archived_at` on
`ideacad_documents` is a state a document survives its owner's enrollment in.
  - **THE INSTRUCTOR'S REACH WAS ALWAYS ITEM-KEYED; THE LISTING WAS NOT.**
    `_ideacad_can_read_document` asks `_classroom_manages_item`, which reads
    `classroom_postings` and NEVER `classroom_enrollments` -- so a teacher could
    always SELECT a departed student's rows. `ideacad_roster` drives off the
    ENROLLMENT and left-joins the document onto it, so the address leaving the
    roster takes the document off the only surface that names one.
    `ideacad_archive(p_item_id)` is the second function that fixes it, and it
    cannot be a parameter on the roster: that function's driving set is the
    thing that is gone.
  - **EVERY WRITE IN IDEACAD FUNNELS THROUGH TWO PREDICATES, NOT ONE, AND THE
    SECOND IS THE ONE THAT GETS MISSED.** `_ideacad_can_write_document` (0205)
    covers the seven concept writers, `ideacad_apply_actions` and
    `_ideacad_part_writer`'s WIDE rung. But `_ideacad_part_writer` SHORT-CIRCUITS
    on `_ideacad_part_owner` first, and `ideacad_add_part`,
    `ideacad_update_part_meta`, `ideacad_release_part` and `ideacad_assign_part`
    gate on that predicate DIRECTLY. A narrowing applied to the first alone
    leaves five assembly writes open while every concept write correctly
    refuses. Both call `_ideacad_document_archived`, so they cannot disagree.
  - **ARCHIVING IS AN INSTRUCTOR'S DELIBERATE ACT AND UNLOCKS NOTHING.** It is
    never triggered by a roster change -- a silent archive is the same class of
    defect as the silent delete `0213` closed -- and `0213`'s census counts
    `ideacad_documents` rows with no `archived_at` term, so a student with
    IdeaCAD work is refused a removal archived or not.
  - **A CLASS GRANT IS A SECOND TABLE AND IS ALWAYS A VIEWER.**
    `ideacad_section_grants` is keyed `(document_id, section_id)` and has NO ROLE
    COLUMN, so "a class can never be given write" is a property of the schema
    rather than a check. It is evaluated live against `classroom_enrollments`, so
    deactivating a recipient closes their access in the same statement; a
    snapshot fan-out into `ideacad_grants` was the rejected alternative and is
    the enrollment drift this whole area exists to stop reasoning from. Only an
    ARCHIVED document may be shared this way, and restoring one DELETES its class
    grants in the same statement.

**SHARING A DIRECT MODEL WITH PEOPLE IS ONE PANEL OVER THREE FUNCTIONS
(ledger 0470, 0325, report 155bba3d).** `ShareModelPanel` sits in a model's
Manage area on the launch page: who has it (Can view or Can edit, changed or
removed in place), a picker, and one Share for everyone picked. Every change is
confirmed in words from what the database says changed (`outcomeSentence` in
`$lib/ideacad/solid/launch/share.ts`) with Undo for `UNDO_MS`, and Undo is the
database's own inverse list handed back to the same function.
  - **`ideacad_set_direct_document_access` CALLS THE SINGLE-ROW FUNCTIONS PER
    PERSON** (`ideacad_share_direct_document`, `ideacad_unshare_document`), so
    owner-only, not-trashed, not-yourself and has-signed-in stay stated once.
    One call, one transaction, per-row refusals, at most 100 changes a call;
    there is no cap on how many people a model has.
  - **WHO A STUDENT MAY FIND IS 0325'S, AND WHAT THEY SEE OF A PERSON IS MR.
    PINA'S DECISION 72 (`ideacad-sharing-shows-name-and-email`, 0329, ledger
    0471): A NAME AND AN EMAIL, EVERYWHERE.** `ideacad_share_people` answers
    only the owner of the model it is asked about, lists only Bosco Tech
    accounts that have signed in (never a visitor), needs two letters (an
    empty box suggests teammates only), returns twelve at most, teammates
    then classmates then the school, and matches any part of the shown name,
    the account name or the address. Every person it, `ideacad_direct_document_access`
    and the batch share's results return carries `email`; the launch list
    (`ideacad_direct_documents`) names a shared model's owner with
    `ownerName` beside `ownerEmail`. A person is still keyed by an opaque key.
  - **THIS IS THE ONE EXCEPTION TO "A CHOSEN PUBLIC IDENTITY REPLACES THE
    ACCOUNT IDENTITY COMPLETELY", AND ONLY FOR THE EMAIL.** His words: "I
    think it should show name and email in any case. I really don't know why
    you would hide the email. Everyone knows everyone's email already."
    `_ideacad_share_person_json` is still the one statement: the shown name is
    the chosen one, else the account name, the email is beside it, and the
    Google photo is sent only when the person chose neither a name nor a
    picture. No other surface's payload widened with it.
    `tests/db/ideacad-direct-share-people.test.ts` holds both directions:
    email present for every school account, nothing to a caller who does not
    own the model, no visitor by name or address, no photo behind a chosen
    name, mutation proved.
  - **THE PICKER IS THE SITE'S ONE PERSON PICKER, `$lib/ui/PersonPicker.svelte`.**
    Each surface hands in its own directory and maps its rows onto
    `PickerPerson`; tournaments' `src/lib/tournaments/PersonPicker.svelte` is
    an adapter over it. A new surface that picks people mounts it rather than
    writing a second one.

**THE DIRECT MODELER'S WORKSPACE STATE NEVER ENTERS ITS MANIFEST, BECAUSE
`record()` IN `SolidWorkspace.svelte` DIFFS MANIFESTS.** Every difference
between two manifests becomes a history row and a save, so hover, the rollback
position, the time-lapse, hidden bodies, the view mode and panel layout live in
the workspace or in the per-user preference store at
`profiles.preferences.ideacad.solid` (`mergeSolidPreferences` in
`$lib/ideacad/solid/preferences.ts`), which needed no migration. A hidden body
therefore does not survive a reopen, and making it do so is a manifest decision
that is Mr. Pina's to make, not a field to add (`docs/ideacad/VISION.md`, open
questions).
  - **`solidToSolidDistance` IS NOT A MINIMUM DISTANCE, AND NOTHING SAYS SO.**
    On the vendored kernel it returns the nearest pair of CORNERS when the true
    closest points lie inside a curved face. Measured: 0.564 in for a disk
    0.125 in above a plate, and 1.0 for two OVERLAPPING boxes. Clearance and
    interference go through `checkPair` / `minimumDistance` in
    `$lib/ideacad/solid/analysis/interference.ts`, which starts from the
    kernel's answer, refines, and calls a figure exact only when it equals the
    bounding-box gap. A new caller of the kernel function is the defect this
    replaced.
  - **A TOOL SWEPT AGAINST ITS OWN PROFILE'S FACE NORMAL BREAKS THE BOOLEAN.**
    Extruding a profile face opposite its normal makes a solid the kernel
    reports as valid on its own, and `cut` or `fuse` against it produces an
    invalid result, so every blind pocket sketched on a top face was refused
    with "could not form a valid solid" from the day the modeler shipped. The
    extrude executor in `features/core.ts` rebuilds the tool from the far end,
    swept along the profile normal, when and only when the first boolean comes
    back invalid; `tests/ideacad-solid-blind-pocket.test.ts` pins the exact
    volume and the face names. Any new feature that sweeps a tool reuses that
    fallback rather than rediscovering it.
  - **TWO TESSELLATIONS, AND ONLY ONE MAY MOVE.** `DISPLAY_TESSELLATION` in
    `$lib/ideacad/solid/engine.ts` is size-relative and is the display's to
    tune; `EXPORT_TESSELLATION` feeds export and the advisory readouts, whose
    stated tolerance rests on it, and
    `tests/ideacad-solid-display-tessellation.test.ts` pins it.
  - **THE KERNEL ROUNDS A CORNER WITH A SHARP THIRD EDGE AS A BALL AND A FLAT STEP.**
    Where a round ends at a convex corner whose third edge is left sharp (rounding
    only the four top edges of a block is the common case), the vendored kernel
    builds the ball-shaped corner that is only right when all three edges are
    rounded and closes the gap with a FLAT face, a notch r cubed times (2/3 minus
    pi/6) short of a true round per corner. That, and not the display mesh TRIAGE
    suspected, is R06 (ledger 0298, measured on the real kernel). The feature row
    DISCLOSES it (`flatSteps` in `features/blends.ts`) and
    `tests/ideacad-solid-fillet-corner.test.ts` reddens the day a kernel fixes it.
    Repairing it changes stored geometry and face names, so it is Mr. Pina's call
    or an upstream fix, never a quiet patch.
  - **A TRANSLUCENT FILL COPLANAR WITH A MODEL FACE Z-FIGHTS, AND `depthWrite:
    false` DOES NOT STOP IT** (the depth TEST still runs). The datum-plane fill in
    `viewport/reference-layer.ts` carries a polygon offset for exactly this; any
    new plane-like overlay drawn where a face can lie needs the same.

**MATERIALS ARE DATA, NOT CONSTANTS, AND THAT IS MR. PINA'S DECISION OF
2026-09-12.** He rejected a bundle that hardcoded six materials into
`src/lib/ideacad/blade/materials.ts`: a material is four numbers in a form, the
engine already does the calculation from input values, and shipping a code
change to add one is overkill. `ideacad_materials` (0208) is one table with TWO
LAYERS -- `owner` NULL is a GLOBAL material only an admin writes, from
`/admin/ideacad-materials`, with no deploy; `owner` set is a student's own
CUSTOM material, visible to nobody else. `DEFAULT_BLADE_CONFIG` survives as the
FALLBACK a deployment with no library still resolves against, and is not the
list anybody edits.
  - **THICKNESS IS DATA TOO AND IT IS THE LESSON.** In real life you work with
    the thicknesses of material you actually have; you cannot make it any
    thickness you want. So a material carries a list of real stock thicknesses
    and a student PICKS from it. There is no free-text thickness field on either
    layer -- a custom material lists the thicknesses that student actually has.
  - **THE STORED TREE DID NOT CHANGE AND MUST NOT.** A schema-1 blade tree still
    carries `materials.body` and `materials.bladeStock` as two strings; material
    and thickness are two CONTROLS over ONE stored stock id,
    `<slug>-<thickness with the decimal point removed>`. Two stored fields would
    make every row already in `ideacad_concepts` a legacy shape
    `validateBladeTree` answers for forever. `thicknessKey` is the one spelling
    of that rule and it is FORCED: 0.125 -> `0125` and 0.1875 -> `01875` is what
    reproduces the deployed `steel-0125`, `steel-01875` and `aluminum-0125`, so
    the seed gives the carbon-steel row the slug `steel` and the 6061 row the
    slug `aluminum` and no stored concept is rewritten. A fixed-decimal spelling
    gives `01250` and every saved concept stops resolving, silently.
  - **RESOLUTION AND SELECTION ARE TWO SETS, AND THAT IS HOW RETIRING STOPS
    BREAKING A SAVED PART.** `bladeConfigWithMaterials` is the RESOLUTION set and
    is TOTAL -- retired rows included, the fallback config's own ids included,
    and a zero-density placeholder for anything left over -- because `evaluate()`
    non-null-asserts both lookups and an unresolved id is a rail of NaN.
    `materialChoices` / `bladeStockChoices` are the SELECTION set and are live
    rows only, PLUS whatever the part is already on, marked retired. It has to
    resolve every id every concept on screen names, not just the draft's: the
    compare sheet evaluates them all against one config.
  - **NOTHING IS EVER DELETED, BY ANYBODY, ON EITHER LAYER.** `retired_at`
    shelves; there is no delete RPC and no delete grant. A material is named by
    id inside a jsonb blob of student work and nothing can find every tree that
    names one.
  - **A DENSITY NAMES ITS PUBLISHED SOURCE AND CARRIES A `source_verified`
    COLUMN.** Every row 0208 seeded lands FALSE, because the session that wrote
    it had no network route to any of the named documents and did not open one
    (`IDEA_MATERIALS_PROCESS.md`: an AI's recollection of a datasheet is not a
    datasheet). Every surface renders an UNVERIFIED chip while the flag is
    false. Clearing it is the act of somebody with the source in front of them.
  - **NO 3D-PRINTED MATERIAL IS A LIVE GLOBAL.** A printed part's density
    depends on slicer settings, so a shared figure is a stated mass that is a
    lie; that is exactly what the custom layer is for. `pla` and `petg` are
    seeded RETIRED, and only because documents saved against the pre-0208
    hardcoded list name them.
  - **THE DIRECT MODELER DOES NOT READ THIS TABLE, AND THAT IS AN UNMADE
    DECISION RATHER THAN A DEFECT TO FIX SILENTLY.** `src/lib/ideacad/solid/`
    takes its materials from `STOCK_MATERIALS` in
    `$lib/ideacad/solid/advisory.ts`, a code constant, where the blade editor
    reads 0208. Ledger 0296 raised it with Mr. Pina in
    `docs/ideacad/VISION.md` rather than moving it.
  - **THE MATERIALS PANEL IS IN THE TREE PANE, NOT THE RULES RAIL, AND THE RAIL
    HAS NO ROOM.** Ledger 0178 put the rail's content 40px over its box by adding
    two rows, under a fold this container's Chromium draws no scrollbar for; it
    sits at 502px in 515px with 13px spare. `panelFor('materials')` returns NULL
    and `BladeEditor` branches on `panelId === 'materials'` before it reads the
    panel, so there is exactly one materials panel rather than a generic one and
    a purpose-built one.
  - **A TEACHER CANNOT SEE A STUDENT'S CUSTOM MATERIAL, and that is a known open
    hole rather than an oversight.** The select policy is
    `owner is null or owner = auth.uid()`. Widening it would mean putting
    `_notebook_email_for_user` inside an RLS `using` clause, which needs an
    `authenticated` EXECUTE grant on the uuid/email bridge 0137 deliberately
    closed. The fix, when it is wanted, is `ideacad_roster` projecting the four
    numbers -- not a policy.
