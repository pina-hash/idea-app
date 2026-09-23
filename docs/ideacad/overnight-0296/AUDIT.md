# IdeaCAD Phase 0 audit, ledger 0296

- Written: 2026-09-23, before any build agent started, as `OVERNIGHT_0296.md` section 2
  requires.
- Tree audited: `origin/main` at `bf04a223`, plus this branch's docs-only first commit.
- Governing intent: `docs/ideacad/VISION.md`. Scores and their evidence: `MATURITY.md`.
  Every friction line: `FRICTION.md`. Screenshots: `docs/ideacad/verification/0296/audit/`.

## How the audit was done

Two agents ran in parallel. One read the code and checked every claim the brief makes about
the repository. The other drove the real `SolidWorkspace` on `/dev/ideacad-solid`, the front
door on `/dev/ideacad-launch`, the home page `/` and `/ideacad` in the container's Chromium
(`/opt/pw-browsers`, through `tools/browser-verify/browser.mjs`) at **1440x900, 960x900 and
375x812**. It drove with real pointer and keyboard input and used the `window.ideaCadSolid`
dev hook only to read state, to find where a world point lands on screen, and to wait for
the worker to go idle. It tried to model three things from nothing: a motor bracket with a
bolt pattern, a spinner weapon disk, and a two-part assembly with a pin.

**What the numbers are worth.** Frame and pick timings in this audit are contaminated: a
full `npm test` run (21m35s) shared the four cores for the first twenty minutes, and the
container's WebGL is software. They are recorded, not relied on. Geometry, overlap, text-gap
and pixel-diff readings do not depend on timing and stand.

**Baselines measured before any change.**

- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings in 20 files**, matching
  `CLAUDE.md`.
- `npm test` (`tools/run-tests.mjs`, `--no-file-parallelism`): **548 files, 10,491 tests:
  10,490 passed, 1 failed, 0 skipped** in 1293 s. The one failure is
  `tests/identity-style-shared.test.ts > every preset that shipped still renders > moved
  exactly two colours, and both upward in contrast`. It reads `git show origin/main:src/lib/profile.ts`
  as its "before", and `origin/main` already carries the two colour moves it expects to see
  moved, so it is red on `main` itself. It is not an IdeaCAD test and this lane does not own
  it; it is re-checked at merge time (section 9).

## Scores

The full table is `MATURITY.md`. Summary: **Customization 0**; ten areas at **1** (fillets
and chamfers, reference geometry, design tree and history, dimensions, selection and
interaction, viewport and display, assembly, simulation and analysis, learning and
onboarding, branding and chrome); six at **2** (launch and documents, sketching, part
features, materials and appearance, add-ons, import and export). Nothing is at 3.

Where the code agent and the browser agent disagreed, the browser won, because the rubric
asks what a student can do, and a feature a student cannot reach is not usable for the
basic case. The code agent scored fillets, reference geometry, design tree, dimensions and
viewport at 2; driving them showed each fails its basic case in a way a student hits in the
first minute.

## The three modeling tasks

| Task | Actions | Outcome | Where a student gets stuck |
|---|---:|---|---|
| Motor bracket, attempt 1 (plate, leg sketched on the plate, 4 holes, inside fillet), 1440 | 26 | Wrong. The leg sketch press landed within the 7 px edge band, silently fell back to the XY datum at z = 0, and made a second overlapping body. The fillet then landed on the wrong edge. | Starting a sketch at a face edge, with no hover to say the press is on an edge. |
| Motor bracket, attempt 2 (L profile with Line on XZ, extrude, Hole tool x4, fillet), 1440 and 960 | 24 | One correct body, but only because points were placed from projected world coordinates. 0 constraints on the profile, no Front view to see it face on, and no way to type a line length without opening the sketch. | Making any dimension exact. |
| Motor bracket at 375 | 24 | Failed: the arm runs off screen and panels cover the viewport, so presses landed on chrome. | The first corner past the screen edge. |
| Spinner disk (disk, bore, one tooth, circular pattern of 2, union) | 27 | Three loose bodies. Union refused with "This change could not form a valid solid. Try a different size." though nothing was sized. No inertia or spin-energy readout. | Joining the teeth to the disk. |
| Pin assembly, attempt 1 (circle-cut hole) | 30 | Could not mate: the consumed sketches win every pick on the hole wall, from every angle (8 of 8). | Selecting the hole's wall. |
| Pin assembly, attempt 2 (Hole tool hole, concentric mate, move the pin) | 26 | Concentric mate solved at 21 actions with "2 degrees of freedom left, slides along Z, turns about Z". Moving the pin moved both parts, and the magnetic snap added an erroring redundant mate. | Moving one part within its freedom. |

The agent's SolidWorks action counts (about 40 for a dimensioned bracket, about 20 for the
disk) are its estimates from the usual workflow, not measured and not from documentation, so
they are not used as a benchmark.

## Measurements that matter for the plan

- **Overlap at 960**: `.view-tools` and `.right-tools` overlap 59.6x46 px; the "3D" button is
  unreachable (`elementFromPoint` at its centre returns "Objects 1"). No overlap at 1440.
  At every width the shell's Voice control covers the footer counts, and at 375 it covers the
  tool strip by 89.7x22 px; the Report control sits over the bottom of the panel column.
- **Text touching its border**: four front-door button types at 1.0 px left and right at all
  three widths; the workspace "Tree" button at 1.0 px from its top; "Edit advisory limits" at
  1.0 px from its left. The likely root is `.ic-root button` setting min sizes and no padding
  (`ideacad.css:262-277`) plus panel rules that add none.
- **Dead space**: the expanded palette is a 2x17 grid for 24 buttons (10 empty cells, 34%
  empty); the workspace header is 67% empty at 1440; the front-door masthead is 90% empty;
  the Reference panel is 2013 px tall.
- **Sideways scroll**: the Mates panel content is 279 px in a 258 px panel, so the whole
  panel column scrolls sideways 20 px and clips the unit "in" to "n".
- **Hover**: 0 canvas pixels change when the pointer moves over a face or edge, against
  208,120 pixels for a click-select. There is no hover pipeline to time.
- **Typed-value race**: "0.25" then Enter right after releasing a drawn rectangle gave plate
  thicknesses 2, 0.25 and 0.25 over three trials and 25 in another run.
- **Frame cost** (contaminated): median 4.8 ms, p95 80.4 ms over 87 frames.

## Claims in the brief that were wrong or need a correction

Verified against the tree; the history entry repeats this list.

1. "`contextmenu` absent from `solid/**`" is wrong. `viewport.ts:87` registers a
   `contextmenu` listener that only calls `preventDefault`, so right-click is swallowed and no
   menu exists.
2. "Six-sided polygon" is wrong. The side count is typed in the open-sketch panel
   (`SketchEditor.svelte:149-153`); six is only the default. The top-level tooltip and
   `docs/IDEACAD.md:547` are stale.
3. Fillets: "no edge-set expansion" is wrong. Tangent-chain propagation (`blends.ts:49-96`)
   and "use the faces' edges" exist, behind options that default off. Hover preview and a
   largest-radius answer are what is absent.
4. Simulation: "no CG" is wrong in part. CG and Z inertia are computed under the density
   rule and shown, but only inside the IdeaBlade add-on panel; body-to-body minimum clearance
   with witness points already exists in Measure.
5. Customization: "no per-user preference store" is literally true of `solid/**`, but a
   per-user server store already exists: `profiles.preferences` under the `ideacad`
   namespace, written by the legacy chooser (`IdeaCadApp.svelte:187-194`) and read by
   `/ideacad`'s server load. **Preferences can follow the user to another computer with no
   migration**, so the 0226 proposal is not needed. Caveat: the legacy writer replaces the
   whole `ideacad` object and must be made to merge.
6. "Student surfaces keep 44px targets (`IDEA_INTERFACE_STANDARDS.md` 2.12)" cites the
   document's version, not a section. The 44 px rule is section 10.
7. "STEP needs the separate `remus-wasm-io` module" is overstated. The vendored core kernel
   already exposes `toBREP` (STEP text) and `fromBREP` (STEP, single solid). Whether that
   text opens in SolidWorks is unverified; a spike should precede vendoring 2.5 MB.
8. "Vendor `remus-wasm-io` at the same vendored commit (`9307e73`)" needs a correction:
   `9307e73` is the containment revision; the bytes are an artifact refresh at `f7907f5`
   (package v2.130.20), and saved documents carry the kernel id `remus-f7907f5-2.130.20`,
   pinned in the client and in 0217's SQL validator. An IO module must match that package.
9. "Face-to-face fillet absent from the kernel" is partly wrong: `faceFaceBlend` exists but
   returns a standalone sheet, not a filleted solid. Full round and vertex chamfer have no
   method.
10. The triad seed ("keeping its current visual design") is ambiguous in the repo: the solid
    modeler's only axes marker is an unlabeled `THREE.AxesHelper` at the world origin; a
    lettered corner triad exists only in the legacy blade viewport. This run keeps the
    AxesHelper's red, green and blue lines and puts them in the corner.
11. "Sketch entry rotates normal" and "reorder only while every parent stays above its child"
    are already built (`SolidWorkspace.svelte:93-96`, `features.ts` `reorderRange`). The
    missing part is restoring the view on cancel.
12. `docs/IDEACAD.md` "Limits of the current tools" is stale on polygon sides, pattern and
    revolve axes and mirror planes; selected references already drive them.
13. Materials: true as stated, but the solid modeler's materials are a code constant
    (`advisory.ts:8`), not the 0208 `ideacad_materials` table CLAUDE.md records as Mr. Pina's
    decision. That is a real gap, logged, and not a thing this run changes without a
    decision.

## The plan

### Catch-up order

Customization is the only area at 0, so it goes first, and until it reaches 1 every area at
2 (launch, sketching, part features, materials, add-ons, import and export) gets defect
fixes only. Once Customization moves, the lowest is 1 and the ten areas at 1 lead. Defects
Mr. Pina named (text touching borders, overlap at half width, dead space) are fixed wherever
they are, regardless of score.

1. **Round 1, the foundation** (section 4) plus Customization, Selection, Viewport and
   Branding, which the foundation itself moves, in parallel with the design tree (1) and
   branding and chrome (1) on files the foundation does not touch.
2. **Round 2**: dimensions in the viewport (1), fillets (1), reference geometry (1),
   assembly (1), simulation (1), learning (1), each on its own files, with the single writer
   applying their requests to the shared files.
3. **Round 3 and after**: the seek-out loop (section 6) over `FRICTION.md`, re-scoring from
   evidence and taking the lowest area first each time.

### One writer for the shared files

**The single writer** owns, and is the only agent that edits:
`src/lib/ideacad/solid/SolidWorkspace.svelte`, `viewport.ts`, `viewport/**`, `engine.ts`,
`worker.ts`, `client.ts`, `workspace-api.ts`, `features/core.ts`, `tools.ts`, and the new
`command-registry.ts` and `preferences.ts`. Writer stages run one after another in the main
checkout, each committing when its checks pass.

**Parallel agents** each own a disjoint file set, work in their own git worktree on a
`wip/0296-*` branch, and never edit a writer file. When one needs a change there, it writes
the exact request (file, function, what to add) into its report and the next writer stage
applies it. New optional `WorkspaceApi` members are declared by the writer.

| Owner | Files |
|---|---|
| Writer stage 1 | preferences store, command registry, shortcuts, command search, corner triad, view controls, default planes shown and pickable, empty-document cue, numeric entry, Escape |
| Writer stage 2 | hover and preselection, pick filter, Select Other, box select, right-click menu, context toolbar, breadcrumb, consumed-sketch picking |
| Writer stage 3 (round 2) | dimensions drawn in the viewport, fillet gesture and preview, view modes, size-relative display tessellation, rollback and timeline engine support, requests from round 1 |
| Branding agent | `src/lib/ideacad/solid/launch/**`, `src/lib/ideacad/ideacad.css`, `src/lib/marks/IdeaCadMark.svelte`, the IdeaCAD entry in `src/lib/AppLauncher.svelte`, `AddonPanel.svelte` button padding |
| Tree agent | `FeatureTree.svelte`, `FeatureParams.svelte`, `tree/**`, their tests and tree browser specs |
| Analysis agent | new `solid/analysis/**`, `AnalysisPanel.svelte`, new add-ons under `addons/`, their tests |
| Later agents | fillets (`features/blends.ts`, `FeaturePanel.svelte`), assembly (`MatePanel.svelte`, `features/mate.ts`, `mates/**`), learning (`ToolButton.svelte`, new `solid/learn/**`), sketching (`SketchEditor.svelte`, `sketch/**`), customization UI (new `PreferencesPanel.svelte`) |

### Coordination rules for every agent

- **One browser at a time.** Every browser or dev-server run takes `flock` on
  `$SCRATCH/browser.lock`. The writer's dev server uses port 5199; worktree agents use 5201.
  A finding on a spec the diff cannot reach is re-run alone before it is called a bug.
- **Worktrees** symlink `node_modules` from the main checkout, copy `.env`, and run
  `npx svelte-kit sync` before any check.
- **Checks before a commit**: `npx svelte-check` (0 errors; the warning count and its
  breakdown reported against 37 in 20 files), the test files the change touches, and a
  browser pass of the surfaces it touches at 1440, 960 and 375. The full suite runs once, at
  the end.
- **Nothing under `supabase/migrations/`**, no clamps, no prose instructions in new UI,
  44 px targets, reduced motion honoured, American spelling, no em dashes, no prettier.
- **Saved documents open unchanged.** Anything that is not the model (rollback position,
  hover, view mode, layout) stays out of the manifest, because `record()` diffs manifests
  and every difference becomes a history row and a save.

### Decisions this plan takes, and why

- **No 0226 SQL.** `profiles.preferences` already holds a per-user `ideacad` namespace
  under RLS "update own profile", so the preferences store can be server-backed with no
  migration. The store writes under `preferences.ideacad.solid` with a spread-merge, and
  the legacy chooser's writer is changed to merge rather than replace.
- **Part definitions and occurrences** (research section 1) are a manifest-format change.
  0217's validator accepts new feature types, so it is possible without a migration, but it
  is also the riskiest change to saved documents this run could make. It is deferred to a
  later round and only started if the lowest areas have moved first; the history entry
  records it either way.
- **STEP** waits for a spike of the core kernel's `toBREP` and `fromBREP` before any module
  is vendored (claim 7).
