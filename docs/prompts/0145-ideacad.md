THIS IS A CODEX CLOUD TASK AND ITS ENVIRONMENT IS NOT A CLAUDE CODE CONTAINER. Read this
before anything else; a previous attempt stopped because it received only this preamble and
none of the work below it.

You have NO git remote and NO network during the agent phase. `git fetch` will fail; a previous
run got `CONNECT tunnel failed, response 403`. Do not configure a remote, do not retry a fetch,
do not route around the denial. Your checkout IS the state. Codex opens the pull request at the
end; you never push. Commit LOCALLY as you go, ledger entry first.

THE DUPLICATE CHECK WAS DONE FOR YOU, from a clone on 2026-09-11: no `0145` ledger entry and no
`supabase/migrations/0201_*` on any ref. What you CAN check locally, and should: `git log
--oneline -40` for a subject saying this was already done, and `git ls-files` for your own
files. If either finds something, STOP -- your snapshot disagrees with the clone.

FIRST REPORT FOUR THINGS: `git rev-parse HEAD`, `git branch --show-current`, `pwd`, and
`git config user.email`. Your local branch is `work` and carries no prefix; the branch Codex
pushes is `codex/<slug>`, which the repo's guards admit as of ledger 0144. DO NOT READ YOUR
LOCAL BRANCH NAME TO LEARN THE PREFIX -- that cost a stopped session already.

YOUR MIGRATION IS 0201, NOT 0199 AND NOT 0200. `0199` went to ledger 0156 and `0200` to ledger
0152, both in flight and both invisible to any clone. Do not renumber for any reason.

THREE ENVIRONMENT FACTS, measured by ledger 0149 in this exact environment. `node_modules` and
the placeholder `.env` are present. `tests/db/` WORKS -- embedded Postgres resolves from
`node_modules` and fetches nothing at test time. But CHROMIUM MAY NOT BE INSTALLED, so a browser
pass may be impossible; if it is, say so plainly and name the verification you could not perform
rather than claiming it or skipping it silently. And expect `apply-migration-guard` and
`apply-migration-trace` to fail: they need an `origin/main` ref and a Codex checkout has none.
That is environmental, not a defect.

=== THE WORK BEGINS HERE ===

MODEL: GPT-6 Astra (Codex cloud task) | reasoning: high | REPO: pina-hash/idea-app only,
started from origin/integration in the environment docs/CODEX_ENVIRONMENT.md describes
LEDGER: 0145   MIGRATION: exactly one, 0201

Before doing anything else: `git fetch --unshallow origin || git fetch origin`, then
`git fetch origin integration`, then `git config user.email` and set one if it is empty
and say so. Then `git fetch origin`, and report the sha this session is starting from and
whether it matches `origin/integration`. Report the absolute path of your working
directory. Report the branch Codex created for this task and its prefix; it must carry
the prefix the parity bundle admitted (read `AGENTS.md` and `docs/CODEX_ENVIRONMENT.md`;
`codex/` is expected), and if it does not, stop and report. You may not `cd` outside it and may not touch any other checkout of this repo, including
through a relative path or a symlink; every file operation uses an absolute path under
your own root. This bundle does not need the local Supabase stack. These are the
directories and files you own for this bundle:

  src/lib/ideacad/**                                   (new)
  src/routes/dev/ideacad/**                            (new harness)
  supabase/migrations/0201_ideacad_blade_editor.sql   (new)
  tests/ideacad*.test.ts, tests/dom/ideacad*.test.ts, tests/db/ideacad*.test.ts   (new)
  tools/browser-verify/routes/ideacad*.mjs and the generated regions of
    tools/browser-verify/README.md
  docs/prompt-ledger/entries/0145-*, docs/decisions/entries/ (new entries only),
    and your own docs/history/ entry
  one appended entry in classroom-updates.json (locate it with
    `git ls-files | grep classroom-updates.json`), appended LAST by ONE agent
  one paragraph in CLAUDE.md under the subsystems list (see PART 9)
  EXACTLY these regions outside the tree above, and nothing else in those files:
    - src/lib/classroom/html-assignment/mount.ts: add the sibling predicate for schema 4
      (PART 7) and correct the one comment that says the CHECK "admits nothing else"
    - src/lib/classroom/ItemDetail.svelte: one `{:else if}` branch in the engine slot,
      placed AHEAD of the spec branches, and the props it needs
    - src/lib/classroom/ContentComposer.svelte: one attachable, "IdeaCAD: Blade editor",
      rendered only when the ideacad transport was supplied
    - src/routes/classroom/[sectionId]/item/[itemId]/+page.server.ts: one rung in the
      existing schema-version ladder
    - src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte: the transport lines
      that hand ideacad data and transports to ItemDetail
    - the site-manifest entry for `ideacad` in src/lib/site-manifest.ts

Anything outside them is out of scope even if it looks wrong; report it and change
nothing. Every statement in this prompt about the current state of the repo is a claim,
not a fact: confirm each one against the tree before building on it, and where the tree
disagrees, the tree wins and your report says which claims were wrong.

DUPLICATE CHECK. Run `git log --oneline origin/main..origin/integration`, read the
subjects, and stop if a bundle already there did this. Also `grep -rli "ideacad" src
supabase docs` across origin/main, origin/integration and every claude/** branch
(`git ls-tree -r --name-only <ref> | grep -i ideacad`), and stop if any ref carries an
`ideacad` surface or a `0145` ledger entry. A branch on origin carrying a ledger
commit and nothing else is a prompt pasted twice: stop on that too.

LEDGER ENTRY, YOUR FIRST COMMIT, before anything else is touched. Write
`docs/prompt-ledger/entries/0145-ideacad-blade-editor.md` in the shape of the
existing entries (read two of them first):

  # 0145 IdeaCAD: the IDEA-Blade editor, a native Classroom surface with a live
    teacher view
  - Issued: 2026-09-10
  - By: the IdeaCAD scoping chat's one-shot package, folded into the development chat's
    lanes. Students start SolidWorks on 2026-09-11; IdeaCAD ships 2026-09-14; design
    freeze 2026-09-15.
  - Owns: (the list above, verbatim)
  - Migration permitted: exactly one, 0201.
  - Claims: 0201
  - Lands on: NOT `main`. A pull request against `integration`; the migration is applied
    by Mr. Pina by hand before the merge to `main`, and that merge is the development
    chat's.
  - Status: issued
  - Branch: the branch Codex created, under the `codex/` prefix, from origin/integration
    at <sha>. If the slug already has a docs/history entry, suffix yours and say why.
  - Notes: (filled at the end)

Commit it with the message `Ledger 0145: issued` and push the branch. Then read
`AGENTS.md`, then `CLAUDE.md` in full, `docs/standards/IDEA_INTERFACE_STANDARDS.md`,
`docs/standards/IDEA_VERIFICATION_ADDENDA.md`, and
`docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md` sections 1, 5, 7, 8 and 9, because IdeaCAD
is built as the fourth engine beside the one that spec describes as the third.

SESSION CONTROL, each of which has cost a whole session: long commands run in the
foreground; if a wait exceeds the thing's known runtime (full suite about three minutes,
browser pass about six on 2026-09-10 per the README's measured region), the notification
is not coming and the run is gone. Commit and push when your own work is proven; if a
final measurement is slow or unavailable, commit with the per-file results you have and
name exactly what you could not measure. `git checkout --` restores from HEAD and
silently discards uncommitted work: a mutation proof copies the file first and restores
from the copy, verified by hash. A mutation that reddens nothing has three causes and
only one is a finding: check the count, not the color, and run database test files with
`--no-file-parallelism`. Write `.env` before `svelte-kit sync`, and re-sync after
changing base. Do not run prettier. Do not set or read SUPABASE_ACCESS_TOKEN. Do not run
`supabase db push` under any circumstances. The agent phase of a Codex cloud task runs
with internet off by default: everything the suite and the browser pass need was
installed at setup per `docs/CODEX_ENVIRONMENT.md`; if something is missing, name it,
continue, and record it in the history entry as an environment gap.

==========================================================================================
PART 0. WHAT IDEACAD IS
==========================================================================================

IdeaCAD is a 3D concept tool inside IDEA Classroom whose tools belong to one project.
The first and only editor in this bundle is the IDEA-Blade editor: it makes IDEA-Blades
(the class's combat spinning tops) and nothing else. It is for brainstorming: it exports
no design files, and students then model their chosen concept in SolidWorks, where the
concept card they committed is their target. A student makes and keeps several concepts,
compares them side by side, predicts which spins longest before the comparative physics
is revealed, and commits one as a concept card. Mr. Pina watches any student's model
change live as they work and orbits it himself in his own view: a "3D Google Doc".

Navigation and orientation are IDENTICAL to SolidWorks (students move between SolidWorks,
Bambu Studio and the CNC router software, and every program navigating differently is a
real problem). Interface conventions mirror SolidWorks where they fit: a FeatureManager
tree, PropertyManager editing with confirm and cancel, Edit Feature and Edit Sketch.
Many students do not know finished SolidWorks work can be edited; IdeaCAD makes editing a
feature the natural way to change a design.

The bar: no compromises, Apple-level attention to detail, and a Monday ship met by cutting
scope, never quality. Everything in this bundle is built on the final architecture. What
is out of scope is listed in PART 10 and is not started.

Governing standards, read them: `IDEA_INTERFACE_STANDARDS.md` (desktop first-class,
role parity, saved state is visible state, local mirror for composed work, 44 px targets
on every student surface, viewport verification at 375 and 1440, keyboard path for
repeated operations, every surface reports its own defects through the shell), and
`IDEA_VERIFICATION_ADDENDA.md`. The design tokens are read from
`src/lib/design-system/colors.css` and `effects.css` at HEAD and never transcribed from a
document; no hex value is invented. Fonts: Chakra Petch is the display face, Rajdhani is
body, Share Tech Mono is chrome and readouts. Crimson is error and fail only. No emoji.
American spelling in every file and every string. Student-facing copy names no weekday.

==========================================================================================
PART 1. AUDIT (read-only, gates the build)
==========================================================================================

Answer each with the file and line you read. Any item phrased "add X" below is assumed to
exist until this audit says otherwise. Report what was found separately from what was
built.

A1. Does anything IdeaCAD-shaped exist? `grep -rli "ideacad\|blade editor\|spinning top"
    src supabase tests docs` on origin/main and origin/integration. Claim: nothing.
A2. Three.js consumers and their controls. Claim (read 2026-09-10): `three` ^0.185.0 is
    a dependency; `src/lib/gauntlet/StlViewer.svelte` and
    `src/lib/greenline/builder/Builder3D.svelte` both use OrbitControls with dynamic
    `import('three')` inside onMount for SSR safety. Confirm the import pattern; you
    reuse the pattern and NOT OrbitControls (PART 4 says why).
A3. The engine discriminator. Claim: `src/lib/classroom/html-assignment/mount.ts`
    exports `HTML_ASSIGNMENT_SCHEMA_VERSION = 3`, `htmlAssignmentSchemaVersion(source)`,
    `isHtmlAssignment(item)`, `withHtmlAssignmentVersion(item, raw)` and
    `htmlAssignmentMount(item, data)` returning `'html' | 'spec' | 'unavailable'`, and
    for a version-4 item `htmlAssignmentMount` returns `'spec'`. List EVERY caller of
    `htmlAssignmentMount` and `isHtmlAssignment` in `src/` (the item page, the manager
    view, the grading console, the class stream, the export). For each, say what it
    would render for a schema-4 item today. The requirement is that a schema-4 item
    takes the existing NO-SPEC assignment path everywhere the spec engine would otherwise
    render (an assignment with no interactive spec already exists as a shape), and the
    IdeaCAD editor only where PART 7 mounts it. Report each site with a decision.
A4. The CHECK. Claim: migration 0195 adds
    `classroom_items_assignment_schema_version_check` as
    `check (assignment_schema_version is null or assignment_schema_version in (1, 3))`.
    Confirm the exact constraint name and text.
A5. The item page ladder. Claim: `+page.server.ts` under the item route runs a two-rung
    ladder (probe `assignment_schema_version` as its own narrow select, then the document
    row only when the probe answered 3), with `htmlAssignmentReady` starting false and
    turned on only by a rung that answered. Confirm, and confirm `ItemDetail.svelte`
    branches `{#if htmlMount === 'html' && htmlAssignment}` ahead of the spec branches
    inside `{#if item.kind === 'assignment'}`.
A6. The hand-in path. Claim: `classroom_add_submission_file(p_item_id, p_drive_file_id,
    p_filename, p_mime_type, p_size_bytes, p_block_id, p_caption, p_storage_key)` is
    last defined in 0197 and carries the block gate only on its `p_block_id` path; the
    client path is `uploadSubmissionFile(itemId, file, blockId = null, caption = null,
    onProgress)` in `src/lib/classroom/transports.ts` (line ~1173 on 2026-09-10) and
    bytes go browser-to-storage, never through the app server. CONFIRM that the student
    transport carrying `uploadSubmissionFile` is constructed for an assignment that has
    NO spec row, because the concept card commit (PART 5) uploads a PNG with
    `blockId = null` through it. If it is only built when a spec exists, say so and name
    the smallest additive change that hands it to a schema-4 item (that change is inside
    the `+page.svelte` transport lines you own).
A7. Who the caller is. Find the helper the classroom RPCs use to resolve the calling
    student's email and enrollment (claim: `_classroom_engine_student(p_item_id)` in 0086
    and later), the manager predicate (claim: `_classroom_manages_item(p_item_id)`), and
    the live-item predicate (claim: `_classroom_item_live`). Your RPCs call these by
    name; you do not re-derive them.
A8. Realtime. Claim: `src/lib/classroom/live.ts` is a broadcast-only, payload-free notice
    channel per section with a reference-counted subscribe and an in-memory twin
    `createMemoryClassroomLive`; and `src/routes/dev/coop-netcheck/+page.svelte` is a
    two-client ping/pong harness measuring broadcast RTT and loss at 25 Hz. Confirm both
    and read them in full; PART 6 is written in their doctrine.
A9. The composer's attachables. Read `ContentComposer.svelte` and find how the HTML
    assignment attachable is gated (claim, from ledger 0139: on a transport prop, so the
    panel stays off the screen of anyone not handed the transport). You add the IdeaCAD
    attachable with the identical gating shape.
A10. Tokens. Read `colors.css` and `effects.css`. Report the exact token names you will
    use for: page ground, card ground, input ground, body text, secondary text,
    hairline, strong line, primary (mint), patina, copper, crimson, focus ring, bevel
    raised, bevel inset. Names, not values.
A11. `tools/browser-verify/`: read `README.md` and one route spec, and note how a spec
    declares its states and widths.
A12. `docs/history/_tools/front-matter.mjs` and one entry: the front matter fields, and
    the rule that headings are derived from front matter (an entry that retypes its own
    `##` heading fails `npm run history:verify`).

Gate: if A1 finds an IdeaCAD surface, stop and report. Otherwise build.

==========================================================================================
PART 2. THE MIGRATION: 0201_ideacad_blade_editor.sql
==========================================================================================

Header, in the repo's own convention (read 0195's and 0197's heads first): "Apply
manually in the Supabase SQL editor, after 0197"; the DO NOT APPLY FROM THE SESSION
CONTAINER block, verbatim from 0197 with the numbers changed; what this file does in one
sentence; what it assumes about the state before it (0195's CHECK present, 0197 applied)
and what it does when that assumption is false (raises and applies nothing); deploy
order: MIGRATION FIRST, because a client that attaches an editor writes
`assignment_schema_version = 4` and the 0195 CHECK refuses it, while a client deployed
ahead of this SQL is safe because every IdeaCAD read fails soft to `unavailable`; and
what undoes it (the reversal statements, listed). State in the header that this file
REDEFINES `classroom_items_assignment_schema_version_check` from 0195 on purpose,
widening `(1, 3)` to `(1, 3, 4)`, so the two-authors sweep in `tools/idea-status.py`
will list that object, and that listing is expected rather than a defect.

Tables (all with RLS enabled, `set search_path = ''` on every function, timestamps
`created_at`/`updated_at` with the repo's touch-trigger convention if one exists,
otherwise updated inside the RPCs):

  ideacad_editors
    item_id uuid primary key references public.classroom_items(id) on delete cascade
    editor text not null check (editor in ('blade'))
    config jsonb not null default '{}'::jsonb
  ideacad_documents
    id uuid primary key default gen_random_uuid()
    item_id uuid not null references public.classroom_items(id) on delete cascade
    student_email text not null
    active_concept_id uuid null   (FK to ideacad_concepts added after that table exists,
                                   on delete set null)
    unique (item_id, student_email)
  ideacad_concepts
    id uuid primary key default gen_random_uuid()
    document_id uuid not null references public.ideacad_documents(id) on delete cascade
    name text not null check (length(name) between 1 and 60)
    position integer not null
    features jsonb not null
    revision integer not null default 1
    committed_at timestamptz null
    deleted_at timestamptz null
  ideacad_predictions
    document_id uuid primary key references public.ideacad_documents(id) on delete cascade
    predicted_concept_id uuid not null references public.ideacad_concepts(id)
    rationale text not null default ''
    made_at timestamptz not null default now()

Nothing here joins the `supabase_realtime` publication. The live layer is broadcast
(PART 6).

RLS policies (reads only; zero client write grants, every write is an RPC):
  - ideacad_editors: select to authenticated where the caller can read the item (use the
    predicate A7 found for item reads; do not invent one).
  - ideacad_documents, ideacad_concepts, ideacad_predictions: select where the document's
    student_email is the caller's own email (the same email resolution the classroom
    RPCs use, A7) OR `_classroom_manages_item(item_id)`.
  - No insert, update or delete policy on any of the four.

RPCs, all `security definer`, all returning jsonb in the repo's shape:
  ideacad_set_editor(p_item_id uuid, p_editor text, p_config jsonb)
    Gate `_classroom_manages_item`. Upserts the editor row and sets
    `classroom_items.assignment_schema_version = 4`. A null p_editor removes the row and
    sets the version back to null, the way 0195's remove does. Refuses if the item is not
    kind 'assignment'. Refuses if the item currently carries schema 3 (an item is one
    engine; say so in the error).
  ideacad_open_document(p_item_id uuid)
    For the calling student (A7's resolution; refuses a non-student, an unpublished item,
    a non-schema-4 item). Creates the document on first open with one concept named
    "Concept 1" seeded from `config.defaultFeatures`, sets it active, and returns
    { document, concepts (not deleted, by position), prediction, config }.
  ideacad_new_concept(p_document_id uuid, p_name text, p_features jsonb)
    Owner only. Appends at the next position, sets active, returns the row.
  ideacad_save_concept(p_concept_id uuid, p_features jsonb, p_revision integer)
    Owner only. A NARROW write: updates `features` and sets `revision = p_revision` only
    when `p_revision > stored revision`; otherwise writes nothing and returns
    `{ ok: false, reason: 'stale', concept: <current row> }`. Refuses after
    `committed_at` is set? NO: a committed concept stays editable and a later commit
    supersedes (PART 5); do not lock it.
  ideacad_update_concept_meta(p_concept_id uuid, p_name text, p_position integer)
  ideacad_delete_concept(p_concept_id uuid)   soft delete; refuses to delete the last
    live concept; if it was active, activates the lowest-position survivor
  ideacad_set_active(p_document_id uuid, p_concept_id uuid)
  ideacad_set_prediction(p_document_id uuid, p_concept_id uuid, p_rationale text)
    Owner only; upsert; refuses a concept outside the document.
  ideacad_commit_concept(p_concept_id uuid)   sets committed_at = now(), returns the row
  ideacad_roster(p_item_id uuid)
    Gate `_classroom_manages_item`. Returns every document for the item with its live
    concepts (features included), predictions and the section roster join the classroom
    already has for "who is enrolled" (reuse the roster function A7 or the grading
    console uses; name it), so students who have not opened IdeaCAD appear as
    "not started".

Every RPC's refusal is a plain sentence a student or teacher can act on, never a code.

Verification query at the foot of the file (repo convention): one row per object created,
plus a row proving the CHECK text contains `(1, 3, 4)`. The probes the status tool will
pick up: `table public.ideacad_documents`, `function public.ideacad_save_concept`.

tests/db/ideacad-*.test.ts against the real chain in embedded Postgres, serialized:
  - a student can select their own document and concepts and NOT a peer's (two students,
    same item; assert the peer read returns zero rows, not an error)
  - a section manager can select both; a manager of another section cannot
  - `ideacad_save_concept` with a stale revision writes nothing and returns the current
    row; with a fresh revision writes and bumps
  - `ideacad_set_editor` flips the version to 4 and back to null; the CHECK admits 4 and
    refuses 5
  - `ideacad_delete_concept` refuses the last live concept and re-activates correctly
  - `ideacad_roster` returns not-started students
  - a schema-3 item refuses `ideacad_set_editor`, and a schema-4 item refuses
    `classroom_set_html_assignment` if that function checks the version (read it; if it
    does not, report it as a finding rather than changing it)
Each test names the behavior it pins and carries a negative control.

==========================================================================================
PART 3. EVALUATE AND GEOMETRY: src/lib/ideacad/blade/
==========================================================================================

`tree.ts`: the feature tree schema, versioned (`schema: 1`), with SEMANTIC, PERMANENT ids.
A positional id like `f1` is a rename waiting to happen. Shape:

  {
    schema: 1, editor: 'blade', units: 'in',
    rotation: 'cw' | 'ccw',            // viewed from above
    materials: { body: <materialId>, bodySolidFraction: number 0.1..1,
                 bladeStock: <stockId> },
    features: [
      { id: 'body-revolve', type: 'revolve',
        stations: [{ r, z }, ...] },   // 3..8 stations, z strictly increasing, r >= 0,
                                       // first z = config.tipHeight, last z = body top;
                                       // straight segments only: the body is a stack of
                                       // frustums and cylinders and the SolidWorks
                                       // sketch is the same polyline
      { id: 'hex-extension', type: 'hexBoss', acrossFlats: <from config>, height: 0.5 },
      { id: 'blade-sketch', type: 'bladeSketch',
        rootWidth, tipWidth, length, sweepDeg, mountRadius },   // planform in the
                                       // horizontal plane; sweepDeg > 0 rakes the
                                       // leading edge forward into the rotation
      { id: 'blade-extrude', type: 'extrude', sketch: 'blade-sketch',
        thickness: 'stock' },          // thickness comes from the stock
      { id: 'blade-pattern', type: 'circularPattern', feature: 'blade-extrude',
        count: 2..8 },
      { id: 'blade-mount', type: 'mount', feature: 'blade-pattern', z }
    ]
  }

`validate.ts`: a pure validator returning a list of problems with the feature id, the
parameter, and a sentence. Applied on every edit and at import. Never throws.

`materials.ts`: the material and stock lists live in `config` on the editor row, seeded by
PART 7's composer default, so Mr. Pina edits them without a deploy. Seed:
  materials: PLA 1.24 g/cm3 (default), PETG 1.27 g/cm3
  stock: steel 0.125 in 7.85 g/cm3 (default), steel 0.1875 in 7.85, aluminum 0.125 in 2.70
  standardParts: hex core, hex collar, tip bolt, each { name, massG: 0, verified: false,
    geometry }, and the UI shows an "unverified" chip on the mass readout while any
    standard part has verified: false. These three are real parts on Mr. Pina's machine
    that nobody has weighed; 0 g is a placeholder, not a value.
  launcher: { acrossFlatsIn: null }: NOT in rulebook v3.0 (read 2026-09-10); until Mr.
    Pina supplies it the hex extension renders at 0.50 in across flats with an
    "unverified" chip and the rule check still runs on HEIGHT only.
  tipHeightIn: 0.125 (the template sketch's 0.550 x 0.125 tip step, as recalled in the
    content chat of 2026-09-10; a claim)
  rules: from rulebook v3.0, read from the mirror 2026-09-10: maxDiameterIn 5.00; full
    height 2.90..3.10 measured tip to body top; hex extension 0.45..0.55 above the body
    top; maxMassG 680 fight-ready including the hex shaft; contact edges present an
    inward-facing surface in the direction of rotation (inspected visually).

`evaluate.ts`: ONE pure function `evaluate(tree, config) -> Evaluation`, no DOM, no three.
Returns geometry primitives for the renderer AND every readout:
  - diameterIn: twice the largest radial extent of anything (body max r, hex boss
    circumradius, every blade planform vertex after mounting)
  - fullHeightIn: body top z (measured from the tip)
  - hexExtensionIn
  - massG: body + hex boss + N blades + standard parts (Σ, with the solid fraction on the
    printed body only)
  - comHeightIn: mass-weighted centroid height from the tip
  - inertiaGcm2: I about the spin axis
  - radiusOfGyrationCm: sqrt(I / m)
  - rules: [{ id, label, value, limit, pass }] for diameter, fullHeight, hexExtension,
    mass, engagement
Closed form, exact for this vocabulary:
  frustum (r1, r2, h, density): V = πh(r1² + r1·r2 + r2²)/3;
    I_axis = (3/10)·m·(r2⁵ − r1⁵)/(r2³ − r1³), and ½·m·r² when |r2 − r1| < 1e-9;
    centroid from the r1 end = h(r1² + 2·r1·r2 + 3·r2²)/(4(r1² + r1·r2 + r2²))
  regular hexagonal prism, side a (across-flats f = a·√3): A = (3√3/2)·a²,
    I_axis = (5/12)·m·a²
  blade: planform polygon in the horizontal plane with the spin axis at the origin;
    m = ρ·t·A; I = ρ·t·(Ixx + Iyy) of the polygon about the origin by the shoelace
    second-moment formulas (exact for any simple polygon); N instances multiply
  engagement: from sweepDeg's sign against `rotation`, pass when the leading edge is
    raked forward (inward-facing contact); the readout says "inspector verifies visually"
Units: inches in the tree (the rulebook's unit); convert once to mm/cm inside evaluate;
readouts display inches primary with mm secondary, mass in g, I in g·cm².

tests/ideacad-evaluate.test.ts, each against a hand-computed number with its derivation
in a comment: a solid PLA cylinder r = 2 in h = 1 in (mass and I); a frustum that reduces
to the cylinder when r1 = r2; a hex prism whose I approaches the inscribed cylinder's as
the polygon count would grow (bound, not equality); a rectangular planform against
b·h³/12 plus the parallel axis; the whole seeded default blade against the sum of its
parts; every rule check on either side of its limit; the engagement sign both ways.
`evaluate` on the seeded default must PASS every rule, because the first thing a student
sees must be a legal blade.

`geometry.ts`: `Evaluation -> three BufferGeometries`, the only file that imports three:
`LatheGeometry` from the stations at 128 segments; hex boss as a 6-segment cylinder
rotated so a flat faces +X; blades as ONE `ExtrudeGeometry` from the planform in an
`InstancedMesh` with N instances rotated about the spin axis; `EdgesGeometry` at a 30°
threshold for the tangent edges. Regenerated whole from the tree on every change, never
patched.

==========================================================================================
PART 4. SOLIDWORKS CONTROLS AND VIEWPORT: src/lib/ideacad/viewport/
==========================================================================================

WHY NOT OrbitControls. OrbitControls is a turntable: azimuth and polar angle about a
world up vector with clamps, left-drag rotate, damping. SolidWorks' default rotation is a
free arcball about a rotation center: horizontal mouse motion rotates about the SCREEN
vertical axis, vertical motion about the SCREEN horizontal axis, no world-up lock (the
"Rotate about scene floor" option is what ADDS the lock, and it is off by default), no
inertia. Students feel that difference in the first second. Write `SolidWorksControls`
(`controls.ts`, DOM binding) over `controls-math.ts` (pure, tested). No OrbitControls, no
TrackballControls.

The map, verified against SolidWorks' own help (Middle Mouse Button Functions 2020, Rotate
View, Roll View, Zoom In/Out, Reference Triad 2022, View Options, View Selector) and the
official 2007 quick reference; the ONE item from a reseller blog is marked:

  rotate ............ middle-drag, free arcball about the rotation center
  rotate about geometry  middle-click (press and release, no drag, under 200 ms) on a
                     face or edge raycasts and sets the rotation center, drawing the small
                     center glyph; middle-click on empty space resets to the model
                     bounding-box center. Whether the center persists after the drag on
                     Mr. Pina's install is unknown; ship persistent, expose the switch.
  pan ............... Ctrl + middle-drag; Ctrl + arrow keys
  zoom .............. Shift + middle-drag (drag up zooms in); wheel zooms to the pointer
                     position, and to the model center when the pointer is outside the
                     viewport; discrete factor per notch, default 1.25 (calibrate later);
                     "Zoom about screen center" and "Reverse wheel direction" as options,
                     both off by default
  roll .............. Alt + middle-drag; Alt + left/right arrows
  arrow keys ........ rotate by the arrow increment, default 15° (blog-sourced; config);
                     Shift + arrow = 90°
  keys .............. F zoom to fit; Z zoom out; Shift+Z zoom in; Ctrl+Shift+Z previous
                     view; Spacebar opens the Orientation popover; Ctrl+Spacebar the View
                     Selector (Monday: the popover's standard-view list; the cube is a
                     follow-on)
  standard views .... Ctrl+1 Front, Ctrl+2 Back, Ctrl+3 Left, Ctrl+4 Right, Ctrl+5 Top,
                     Ctrl+6 Bottom, Ctrl+7 Isometric, Ctrl+8 Normal To the selected
                     planar face (does nothing with no selection, as in SolidWorks)
  reference triad ... bottom-left; click an axis = view normal to it; click the axis
                     pointing at you = flip 180°; Shift+click = 90° about it;
                     Ctrl+Shift+click = the opposite direction; Alt+click = the arrow
                     increment; Ctrl+Alt+click = its opposite; the current standard view
                     name reads under the triad
  projection ........ ORTHOGRAPHIC by default (SolidWorks' parallel projection);
                     Perspective is a toggle in the heads-up toolbar
  view change ....... animated transition, 250 ms eased, off under prefers-reduced-motion
  selection ......... left-click selects a face or edge (pre-highlight on hover),
                     selects its feature in the tree; Escape clears; right-click opens
                     the context menu (Edit Feature, Edit Sketch, Zoom to Fit, Rotate
                     about scene floor, Perspective). Mouse gestures on right-drag are a
                     follow-on and right-drag does nothing on Monday.
  touch ............. one finger rotates, two fingers pan, pinch zooms

Implementation notes:
  - Camera state is { quaternion, rotationCenter, orthoZoom or distance, projection }.
    Rotation applies a screen-axis quaternion delta about rotationCenter, preserving the
    center's screen position exactly (test it).
  - Wheel zoom about the cursor in ortho: scale `camera.zoom`, then translate the camera
    so the world point under the cursor stays under it (assert to 1e-6 in a test). In
    perspective: dolly along the ray through the cursor.
  - Standard views are fixed target quaternions (SolidWorks convention: Front looks down
    −Z with +Y up; Isometric is the view from (1, 1, 1) with +Y up); transitions slerp.
  - No damping, no inertia, 1:1 motion. Sensitivity constant exposed as
    `mouseSpeed`, default calibrated so a drag across the viewport width rotates about
    180°; note it for calibration against Mr. Pina's install.
  - A previous-view stack of 20.
  - The triad is an SVG overlay driven by the camera quaternion (three projected axis
    lines with arrowheads and X/Y/Z labels in Share Tech Mono, token colors), not a
    second WebGL scene, so it is crisp and themed.
  - Shortcuts never fire while a text input, number field or the PropertyManager's
    inputs have focus (interface standard 8). The key map is visible on the surface
    behind a `?` control (a legend, interface standard 8: an undiscoverable shortcut has
    the adoption of no shortcut).
  - 60 fps: render on demand (invalidate on change), never a free-running loop when
    idle; measure frame time in the harness and report the p95 for a 300-frame drag.

Rendering (`Viewport.svelte`): `three` dynamically imported in onMount (A2 pattern),
`OrthographicCamera` by default, `WebGLRenderer({ antialias: true })`, pixel ratio
clamped to [1.5, 2]. Display style "Shaded With Edges" (SolidWorks' default): matte faces
under a plain three-light rig (key, fill, rim at low intensity, no environment map, no
tone-mapped product shot; the GAUNTLET StlViewer is a hero render and the wrong
reference), dark tangent edges in the edge token. Body faces in a light neutral from the
neutral ramp, blades in the steel token, hex boss and standard parts in the gear token,
selection in mint with the strong line, hover pre-highlight at reduced mint, rule-fail
geometry outlined in crimson (the one permitted use), dimension overlay lines in patina.
A rotation-direction arrow drawn above the blades. The viewport fills its pane at every
width; the canvas resizes with a ResizeObserver and re-renders. Ground is the page token;
no grid.

Heads-up view toolbar (top center of the viewport, 44 px targets): Zoom to Fit, Previous
View, View Orientation (popover with the eight standard views and Trimetric/Dimetric),
Display Style (Shaded With Edges, Shaded, Wireframe), Perspective toggle.

tests/ideacad-controls.test.ts (pure math): zoom-about-cursor invariant; each standard
view lands on its quaternion; rotation preserves the rotation center's projection; the
previous-view stack; the triad's six click behaviors produce the right rotation; arrow
increments; Normal To with a face normal.

==========================================================================================
PART 5. THE EDITOR: src/lib/ideacad/BladeEditor.svelte and friends
==========================================================================================

ONE component, `BladeEditor`, gated by `readOnly` and by which transports it is handed
(role parity, interface standard 2: presence of a transport is presence of a control).
The student mounts it with the document transports; the teacher mounts the SAME
component read-only against a chosen student's document with no write transport, own
camera. No second render path anywhere.

Desktop layout (>= 1024 px; the surface uses the width of the window, interface standard
1): a three-region console. Left pane 300 px: the FeatureManager tree, replaced in place
by the PropertyManager while a feature is being edited. Center: the viewport. Right rail
280 px: readouts. Bottom strip: the saved concepts. Each pane owns its own scroll; the
page does not scroll (prove it). Widths from tokens, never literals. At < 1024 px the
regions stack: viewport first, readouts, then tree, with the PropertyManager as a bottom
sheet; it must be usable to orbit and read at 375 px and nothing may become unreachable.
Measure both ends and report the numbers.

FeatureManager tree: the features in order (Body Revolve, Hex Extension, Blade Sketch,
Blade Extrude, Circular Pattern, Blade Mount) plus a Materials node and the Standard
Parts node (read-only, with the unverified chip). Selecting a feature highlights it in
the viewport. Double-click, Enter, or the context menu opens Edit Feature; on the sketch
node, Edit Sketch. A feature with a validation problem carries the problem chip in the
tree, the way SolidWorks marks a feature with a rebuild error.

PropertyManager: the feature's parameters as labeled number fields with units, sliders
where a range is bounded, live preview in the viewport on every change, a green check
(accept, Enter) and a red X (cancel, Escape) that reverts the preview to the accepted
tree. The body's stations edit as a small table with add and remove (3 to 8) and a
2D profile preview beside it; dragging a station handle in the viewport's Front view is
a follow-on. Accepting writes to the document (PART 6 persistence). Undo and redo
(Ctrl+Z, Ctrl+Y) over accepted edits, client-side, 50 deep.

Readouts rail: diameter, full height, hex extension, mass vs 680 g, each with its rule
chip (PASS in mint, FAIL in crimson with a word, never color alone); center-of-mass
height; the standard-parts unverified chip when applicable. I and k are NOT shown here.
Every number carries its unit and updates on every accepted edit and during preview.
Contrast measured against the rail's own ground (interface standard 10).

Concept strip: the student's concepts as cards (thumbnail rendered offscreen from the
tree, name, rule chips, committed chip). New, Duplicate, Rename, Delete (confirm; the
last cannot be deleted), reorder. Selecting one makes it active and loads it. A
"Compare" control opens the compare surface.

Compare surface: a table, one column per concept, with thumbnails and the rule readouts.
The comparative physics row group (I, k, center of mass) is LOCKED until the prediction
exists: the lock reads "Which of your concepts spins longest? Pick one and say why."
with a concept picker and a one-sentence field (the prediction gate, interface standard
7: the editor never offers what the pipeline discards, so the picker only lists live
concepts). Submitting calls `ideacad_set_prediction`; the rows unlock and the prediction
shows beside them with its date. The gate is pedagogical, not a security boundary, and a
code comment says so.

Concept card commit: a "Commit as concept card" control on the active concept. It
renders the card offscreen (isometric and top views, the parameter table of every feature
value, the readouts, student name, concept name, item title, date) at 1600 x 1000 to a
PNG blob, uploads it through `uploadSubmissionFile(itemId, file, null, 'Concept card:
<name> (r<revision>)')` (A6), then calls `ideacad_commit_concept`. Re-committing makes a
new file and leaves the old one; the card also renders live in the strip from the tree,
so the PNG is for grading and printing, not for the app. Progress and failure are shown
per the file-pipeline rule (interface standard 13: the message names the gate).

Saved state (interface standard 6): four states always on screen (unsaved, writing, saved
at HH:MM, failed with retry), driven by the RPC acknowledgement and never by dispatch or a
timer; a per-surface indicator using `SaveIndicator.svelte` if its contract fits (read it;
if it does not, say why and use its vocabulary). Autosave 400 ms after the last accepted
edit, flushed on blur and `pagehide`, plus explicit Save (Ctrl+S). Local mirror: every
accepted tree is written to localStorage keyed by concept id and cleared only on a server
ack; on mount, a mirror newer than the server row is offered for restore with both dates
shown. Dirty is a divergence from the seeded baseline, never "there is content here"
(use `edit-baseline.svelte.ts` and `save-guard.svelte.ts` if their contracts fit; read
them). The unsaved-work guard fires only when work would be lost; exempt the safe paths
and test each exemption stays silent. A refusal (stale revision) is reported once, in
the words of the refusal, with the server's row offered, no retry loop.

Teacher view: the instructor item page mounts the student view plus an inspector region
(visually distinct, instructor-only) holding the Live roster: master-detail. The master
lists every enrolled student (from `ideacad_roster`) with a live dot (ping within 20 s),
concept count, rule chips for the active concept, last save time, committed count; sorted
live first. Selecting a row renders the detail: the same `BladeEditor` read-only against
that student's active concept, teacher's own camera, with a switcher for the student's
other concepts and the prediction if made. Nothing selected gives the full measure to the
list (interface standard 1). Both selection states are measured at both widths.

Every string is student-facing copy in the IDEA voice: terse, imperative, no emoji,
sentence case for headings and body, uppercase mono for labels and chips, no weekday.

==========================================================================================
PART 6. LIVE: src/lib/ideacad/live.ts
==========================================================================================

Written in the doctrine of `src/lib/classroom/live.ts` (read it in full before writing a
line): the poll is the floor, the channel is the speed, and the cost is stated in the
module header. The difference is that this channel carries payload, because a "re-ask
the server" round trip per drag frame is the wrong shape.

Two channels, both broadcast, `self: false`, `ack: false`:
  ideacad-live:<item_id>   students SEND a ping `{ documentId, conceptId, revision }` on
    every server-acknowledged save and every 10 s as a heartbeat; the TEACHER subscribes.
    A ping means "re-read this document through ideacad_roster or a narrower read";
    nothing is applied from the ping itself. Students do not subscribe here, so nothing
    about peers is readable by a student, and no presence API is used: "live" is ping
    recency on the teacher's side.
  ideacad-doc:<document_id>   the student SENDS frames `{ conceptId, revision, features }`
    at a maximum rate while a parameter is being dragged or previewed, one frame on
    accept, nothing at idle; the teacher's detail pane subscribes to exactly one of these
    (the selected student) and applies frames whose documentId is in the roster result
    and whose revision >= the last seen. Camera state never travels.

Rate: MEASURE FIRST. Run `src/routes/dev/coop-netcheck` with two headless Chromium pages
against the real Supabase Realtime from this container; record median, p95 and loss at
25 Hz for 60 s in your history entry with the date and the instrument. If this container
cannot reach Realtime (a Codex agent phase runs with internet off by default, and the
database port is unreachable from any cloud session in any case), record the exact
failure and ship the conservative default: frame rate 4 Hz, adaptive up to 10 Hz when the measured RTT p95
is under 150 ms, and name the check Mr. Pina runs between two machines on the school
network in your history entry. Frames are coalesced (only the newest tree is sent per
tick); a student idle sends nothing.

The cost, in the header: a broadcast channel is open to any client holding the anon key,
so a signed-in student could send forged frames for a peer's document. The teacher view
applies frames only for roster documents and only forward in revision, and re-reads
from the database on every revision jump and every 15 s, so a forgery can show a wrong
intermediate shape for at most one poll interval and can write nothing. Closing it is
authorized private channels with a `realtime.messages` policy; record that as a decision
entry (PART 9), not as work in this bundle.

`createMemoryIdeacadLive()`: the in-memory twin, a real implementation of the same
interface with no network, used by the harness and the tests, exactly as
`createMemoryClassroomLive` is.

tests/ideacad-live.test.ts: the twin's semantics; the frame filter (foreign document
dropped, backward revision dropped, forward applied); coalescing; heartbeat cadence with
fake timers; the roster's live-recency derivation.

==========================================================================================
PART 7. WIRING: how an item becomes IdeaCAD, and how the page mounts it
==========================================================================================

`src/lib/ideacad/mount.ts`: `IDEACAD_SCHEMA_VERSION = 4`, `isIdeaCad(item)` reading the
same `assignment_schema_version` the HTML predicate reads, and `ideacadMount(item, data)
-> 'ideacad' | 'other' | 'unavailable'`, pure, taking `unknown`, in the exact shape of
`htmlAssignmentMount`. In `html-assignment/mount.ts` add nothing but the corrected
comment (the CHECK now admits 4) and, only if A3 shows it is needed for the no-spec path,
a sibling export; do not change its return union.

`ItemDetail.svelte`: inside `{#if item.kind === 'assignment'}`, AHEAD of the html branch:
`{#if ideacadMountState === 'ideacad' && ideacad}` -> `<section class="engine-host">` with
the section label the html branch uses ("Your work" for a student, "Assignment" for a
manager) and `<BladeEditor ... />` handed the document transports for a student and none
for a manager (read-only by absence, never by flag), plus the Live roster in the
inspector for `canManage`. One mount for both roles. `'unavailable'` renders the same
stated absence the html branch renders.

`+page.server.ts`: one rung after the version probe: when the version is 4, read
`ideacad_editors` for the config (narrow select; fail soft to null) and, for a student,
call `ideacad_open_document`; set `ideacadReady` on the same rule as
`htmlAssignmentReady` (true only when a rung actually answered). Config is jsonb and
arrives `unknown`; narrow it in `src/lib/ideacad/config.ts` with a structural check the
way ledger 0139 exported `htmlManifestShaped`.

`+page.svelte`: hand `ideacad` and `createIdeacadTransports(data.supabase)` (from
`src/lib/ideacad/transports.ts`: the RPC calls, the live factory, and the card upload
delegated to the existing student engine transport per A6) down to ItemDetail.

`ContentComposer.svelte`: an attachable "IdeaCAD: Blade editor" beside the existing
attachables, gated on the ideacad transport being supplied (A9's shape), which stages the
choice and fires `ideacad_set_editor(item_id, 'blade', <seed config>)` immediately after
create, reporting failure per attachment (interface standard 4: creation completeness;
nothing is deferred to after the row exists as a design choice). The same control appears
in the instructor inspector for an existing assignment, with Remove (which resets the
version to null and keeps every document). The seed config is `DEFAULT_BLADE_CONFIG` in
`src/lib/ideacad/blade/materials.ts`, and the inspector shows it as an editable JSON
field with the validator's problems inline, so Mr. Pina corrects materials, standard
parts, the launcher across-flats and the tip height without a deploy.

`src/lib/site-manifest.ts`: an `ideacad` app entry owning `src/lib/ideacad/` and
`src/routes/dev/ideacad/`, so the next lane can name the boundary.

==========================================================================================
PART 8. HARNESS AND VERIFICATION
==========================================================================================

`src/routes/dev/ideacad/+page.svelte`: mounts the REAL `BladeEditor` (never a copy; prove
it by changing an observable inside the component, confirming the harness sees it, and
restoring) against in-memory transports and `createMemoryIdeacadLive()`. States by query
string: `role=student` (fresh, one seeded concept), `role=student&state=three` (three
concepts, one failing diameter), `state=compare`, `state=prediction` (gate open),
`state=committed`, `role=teacher&students=6` (roster with two live, one not started, one
committed), `role=teacher&selected=1`. No auth gate, tracked example env if any is needed.

`tools/browser-verify/routes/ideacad*.mjs`: one spec per state, at 375 and 1440:
viewport canvas width against the pane width and the pane against the window (a console
holding less than the window is a defect); no page scroll (document scrollHeight equals
clientHeight while a pane scrolls to its end and the others do not move); every control
44 px at both widths (this is a student surface; no 24 px exception); the readouts' text
contrast against the rail's own ground; the focus ring measured on every palette the
surface can reach; the concept strip scrolls with a real control and steps by item; the
Orientation popover positioned against the viewport and flipped at the edges; the frame
time p95 for a scripted 300-frame middle-drag. Regenerate the README's generated regions
with `npm run verify:counts`; run `verify:readme` once, at the end, on a clean committed
tree with the port guarded.

Every visual state is rasterized and LOOKED AT (interface standard: measurement is not
visual verification), transitions settled before the capture, at both widths, and the
report names each image. A layout claim is never made from a content check.

Mutation proofs (copy first, restore from the copy, verify by hash): the revision guard
in the RPC (drop the comparison; the stale-write test must redden), the frame filter
(drop the revision check; the live test must redden), the prediction gate (drop the
lock; the DOM test must redden), the zoom invariant (drop the translate; the math test
must redden). Report the count of tests that reddened, not the color.

Run the full suite serialized and report its count and duration. `npm run check` clean.
`node tools/claude-md-check.mjs` and `npm run history:verify` clean.

==========================================================================================
PART 9. RECORDS
==========================================================================================

- `docs/history/<branch-slug>.md` with the front matter A12 found (title, date, branches,
  migrations: [0201], subsystems: ["Classroom", "IdeaCAD", "Realtime",
  "Testing"]). Anything a person must act on goes HERE, not only in your report: the
  exact SQL file to apply and the verification query; the netcheck measurement or the
  check Mr. Pina runs on the school network; the three standard parts to weigh and where
  to type the masses; the launcher across-flats to measure; the SolidWorks settings to
  confirm on his install (arrow increment, wheel direction, scene floor, perspective,
  rotation-center persistence, mouse speed); every claim in this prompt the tree
  contradicted.
- `docs/decisions/entries/`: three new entries in the existing shape with Status: open
  and the default you would pick: (1) IdeaCAD documents per student vs per team (rulebook
  v3.0 runs team entry, two or three students per blade; default per student, team
  compare as a follow-on); (2) private Realtime channels with a `realtime.messages`
  policy to close the forgery cost (default: next bundle); (3) the prediction gate scope
  (default: comparative physics only, rule readouts always visible).
- `classroom-updates.json`: ONE appended entry in the file's own shape, student-facing,
  describing IdeaCAD in two sentences, appended last by one agent.
- `CLAUDE.md`: one paragraph under the subsystems list naming IdeaCAD, its four tables,
  schema version 4, the broadcast doctrine, and the rule that the tree is the document
  and every readout is derived. Run `node tools/claude-md-check.mjs`.
- Ledger Notes: the duplicate-check evidence, every claim corrected, what was found vs
  built, the measurements with dates and instruments.

==========================================================================================
PART 10. OUT OF SCOPE, NOT STARTED
==========================================================================================

Editors for other projects; any file export (STL, STEP, DXF, anything); grading
automation or a card-vs-SolidWorks check; the hex core (optional per the rulebook, and a
real cut needs CSG); profile fillets; a linked split viewport; server-side revision
snapshots; mouse gestures; the View Selector cube; Track 2 vocabulary (arcs, all-metal
bodies, non-planar mounts); a teacher-to-student reverse channel; team compare; private
Realtime channels. Each is recorded in the history entry as a follow-on with one line on
what it needs.

==========================================================================================
ENDING
==========================================================================================

If you use Codex's multi-agent mode, agents split INSIDE this lane and never across:
assign each agent a FILE SURFACE (PART 2 migration and db tests; PART 3 blade/; PART 4
viewport/; PART 5 editor components and DOM tests; PART 6 live and PART 7 wiring; PART 8
harness and route specs), never a topic; one agent owns classroom-updates.json and
appends last; nothing runs `verify:readme` until every agent is done and the tree is
committed; the suite is serialized. Show the planned phases before starting.

Pull the latest `integration` into this branch and resolve any conflicts here, never on
`integration` or `main`. Your final commit sets the `Status:` line of your own ledger
entry under `docs/prompt-ledger/entries/` from `issued` to `pushed`, and it is the last
thing you change. Push the branch. Never force-push. Do not delete any remote branch.
Open a pull request against `integration` (not `main`) titled `0145: IdeaCAD Blade
editor`, whose description is your report; do not merge it. Report the Vercel preview URL
and the exact checks to run on it, in terms specific enough to run without rereading
this prompt.

THIS BUNDLE CARRIES A MIGRATION THAT NO CLOUD SESSION CAN APPLY. Do not run
`tools/apply-migration.mjs` against production and do not attempt any connection to the
database; a Codex cloud task cannot reach it and must not try. The SQL is applied by
Mr. Pina in the Supabase SQL editor. Report the file path, the verification query, and
the deploy order (migration first). DO NOT merge anything into `main`; this lane lands as
a pull request against `integration`, and the merge to `main` is the development chat's
after the apply is confirmed by the verification query.

Three things you cannot establish and must not claim: whether students are in class
right now; whether the preview renders correctly, which no cloud task can check; and
whether the live channel behaves on the school network, which only two machines in the
building can measure.

REPORT, in this order: starting sha; duplicate-check evidence; each audit answer with
file and line and every claim the tree contradicted; what was found vs what was built;
the migration file and its verification query; the measurements (suite count and
duration, browser pass, netcheck, frame time p95, both-width numbers per spec, the
images looked at); the mutation-proof counts; the follow-ons; the preview URL and its
checks; and the exact list of things Mr. Pina must do, which is also in the history
entry.
