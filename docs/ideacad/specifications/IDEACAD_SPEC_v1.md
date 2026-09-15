# IdeaCAD — Product Specification v1

**For: a local Codex session running GPT-6 Astra, in the ChatGPT desktop app, with full tool access.**

Read this whole document before writing anything. It is not a task list. It is what the
program is, why the current one failed, and what "done" means.

---

## 1. What this is

A browser-based 3D modeling program for students, built into `pina-hash/idea-app`.

The owner's framing, verbatim, and it is the governing sentence of this document:

> "It's like an automatic SolidWorks. SolidWorks with less steps. A type of SolidWorks
> that's so easy to use that you don't need a tutorial to figure out how to use it."

> "You are sketching things in 3D space to get your idea across. It should be quick to
> use, extremely quick to use. It's IdeaCAD, as in it's to develop ideas. It's not to
> make technical drawings."

> "It should be as intuitive as drawing."

It is **general purpose**. A student opens it and models whatever they want. It is used
freely by anyone, with no class, no assignment, and no account requirement beyond signing
in to the site.

**IdeaBlade is an add-on, not the program.** It is one mode among future modes, enabled or
disabled by the user, which guides and checks a specific kind of design. It must never
constrain what the base program can model.

---

## 2. Why the current version failed, and it is architectural

This matters more than any feature in this document, because the rewrite exists to escape it.

The current IdeaCAD stores a **parameter tree** and **generates** a mesh from it. The
feature list is eight fixed rows — Body Revolve, Hex Extension, Blade Sketch, Blade
Extrude, Circular Pattern, Blade Mount, Materials, Standard Parts. The user edits numbers;
a generator emits geometry.

Everything the owner hates follows from that one decision:

- **He cannot drag anything on the model.** To drag a face you must solve backwards for
  which parameter to change. For most faces no parameter answers. This is not fixable
  within the architecture.
- **He cannot add or remove features.** The tree is fixed because the generator is written
  against exactly those eight.
- **Values are bounded and refuse his input.** In his words: "they stop at such a low
  value. I should be able to put any value I want in there."
- **The blade is defined by spokes and counts** rather than by shape. In his words: "for
  whatever reason you're defining blades by spokes and bullshit. That's not how we roll
  here. I want freedom."
- **"I feel like I'm being so neutered by this program. I should be able to model anything
  I want."**

A prior research bundle established the contrast precisely: Plasticity does direct editing
of solids **without a parametric history tree**, on the Parasolid kernel. The geometry *is*
the model, so grabbing a face moves the face. That is the opposite architecture, and it is
the one this program needs.

**So: the parametric blade generator is replaced by a direct solid modeler.** The blade
becomes something you *make* with general tools, guided by the add-on — not something the
program generates for you from numbers.

---

## 3. The architecture decision you must make first

The program needs real solid geometry in the browser: booleans that produce closed solids,
face/edge/vertex topology that can be selected and pushed, and speed good enough to feel
instant on a school laptop.

**Research the current options before choosing, and state your choice with the reason.**
This document's suggestion is a starting point, not a decree, and it may be out of date:

- **Manifold** (WASM mesh-boolean library) plus **three.js** for rendering. Fast,
  guaranteed-manifold booleans, small. The pragmatic path. Topology is mesh-level, so
  "face" means a coplanar face group you must track yourself.
- **OpenCascade.js** — a full B-rep kernel compiled to WASM. Real faces, edges and
  vertices as first-class entities. Much heavier and slower to load; evaluate whether it
  is viable on a classroom machine.
- Something newer. Check.

**Requirements the choice must satisfy:**

1. Boolean union, subtract and intersect that return closed, manifold solids.
2. Stable identity for faces and edges across an edit, so a selection survives a push.
3. Fast enough that dragging a face updates at 60fps on integrated graphics.
4. Runs entirely client-side in a browser. No server round-trip to model.

Report what you chose, what you rejected, and the measurement that decided it.

---

## 4. The interaction model

This section is the product. Everything else serves it.

### 4.1 Direct manipulation is the primary interface

- **Click a face, edge or vertex to select it.** Selection level is inferred from what is
  under the cursor, with a modifier to change level.
- **Drag a selected face to push or pull it.** The solid changes. No dialog, no Accept
  button, no parameter panel required.
- **Drag an edge to move it.** Drag a vertex to move it.
- **While dragging, the exact value appears at the cursor and can be typed** to override
  the drag. That is how precision enters — as an option, never as the only path.
- **No value is clamped unless the geometry genuinely cannot exist.** If a student types
  40 inches, they get 40 inches. Rules and limits belong to the add-on as *warnings*,
  never as input refusals.

### 4.2 The tool set, minimum viable

General-purpose tools a student can combine to model anything:

- **Sketch** on a face or a plane: line, rectangle, circle, arc, polygon. Dimensions
  optional, inferred where possible.
- **Extrude** a sketch or a face, by dragging.
- **Revolve** a sketch about an axis, by dragging.
- **Cut / subtract** — the same tools working inward.
- **Fillet and chamfer** an edge, by dragging.
- **Shell** a solid.
- **Pattern** — circular and linear, driven by dragging a count and a spacing, not by a
  form.
- **Move, rotate, scale** a body or a selection, with a gizmo.
- **Mirror** about a plane.
- **Boolean** union, subtract, intersect between bodies.

Each is a tool a fourteen-year-old can find and use without being told how.

### 4.3 What "no tutorial required" means concretely

These are acceptance criteria, not aspirations:

- **Every tool has an icon and a hover description.** Bold name, then one plain sentence
  saying what it does, in a student's language. SolidWorks does exactly this and it is why
  people learn it by hovering. Currently IdeaCAD has neither icons nor descriptions on its
  features — the owner raised this twice.
- **Selecting something suggests what you can do with it.** Plasticity activates the
  extrude tool when faces are selected. Selection implies the tool; the menu hunt is the
  thing being eliminated.
- **No prose instructions anywhere in the interface.** If a control needs a sentence
  explaining it, the control is wrong. Fix the control.
- **Nothing is locked without an obvious, stated reason and an obvious way forward.** The
  owner: "half of the features to modify this thing are just not usable. They're locked or
  something. And there's no obvious way to get around that."
- **Undo is total and fearless.** Ctrl+Z undoes anything, always.

---

## 5. The viewport

### 5.1 Mouse controls — SolidWorks, exactly

Two defects in the current build have been reported twice and are the owner's single
biggest physical complaint. He is a SolidWorks instructor; these are muscle memory.

1. **Vertical orbit is inverted.** In his words: "when I hold to orbit and move my mouse
   upwards, the model should orbit to show its underside." Horizontal is correct. Fix the
   vertical sign and pin it in a test so it cannot silently flip again.

2. **Orbit must pivot about the point under the cursor.** In his words: "in SolidWorks
   when you hover your mouse over a specific point on an object, it orbits around that
   point until you let go." Raycast at middle-mousedown, use the hit point as the pivot for
   that entire drag, release on mouseup. Capture it once — recomputing mid-drag makes the
   model swim. If the ray hits nothing, fall back to the view-plane point through the
   current target and say so.

Establish the rest of SolidWorks' real bindings from documentation you can cite, write the
full table into your report, and implement the defaults. Where you cannot source a binding,
leave the gesture unbound and say so — a wrong binding is worse than none, because muscle
memory fights it.

Also required: wheel zooms toward the cursor; right-click does not open the browser context
menu inside the viewport; the page never scrolls while the pointer is over the viewport;
every gesture invalidates the frame so render-on-demand actually repaints.

### 5.2 Remove the ground

Delete the grid ground plane and the drop shadow. The owner: "Get rid of the ground. Why is
there a fucking ground? It's completely useless, it's just for looks."

Keep the origin triad. Nothing else on the floor.

### 5.3 Rendering

- Shaded with edges as the default. Silhouette and feature edges only — an edge whose two
  adjacent faces differ in normal beyond a threshold. Tessellation boundaries on a smooth
  curve are **not** feature edges and must not draw. The current build hatches every
  triangle on curved surfaces and it looks like a fence.
- Three-point lighting so curvature reads.
- A material that reads as machined stock against a dark ground.
- Render on demand. Report the frame cost.

---

## 6. The add-on system

**IdeaBlade is the first add-on and the proof the system works.**

- An add-on is enabled or disabled by the user, per document. Disabled is the default for
  a new free-form document.
- An add-on may: contribute extra tools, watch the model and report rule results, provide
  a starting template, and compute domain numbers (mass, inertia, center of mass, radius of
  gyration).
- An add-on may **never** restrict what the base tools can do, clamp a value, or prevent
  the user modeling something. It advises. It does not neuter.

### IdeaBlade specifically

It guides the design of a combat-robot blade for the IDEA100 competition. It knows the
rules and reports pass/fail as the student models — diameter, full height, hex extension,
mass, and the standard-parts check.

**Preserve the domain knowledge that already exists and is correct**, reading it out of
the current code rather than re-deriving it: the rule thresholds, the mass and inertia
math, the material densities with their cited sources, and the hex-core interface. The hex
extension minimum is 0.5 inches with **no maximum** — a competitor may take as much or as
little of the hex core as their stack-up needs.

What it must **not** do is generate the blade from spokes and counts. The student models
the blade with general tools; IdeaBlade tells them whether it is legal and what it weighs.

---

## 7. Documents, classes and sharing

- **No pre-made content on open.** A new document is empty. The owner has said this three
  times. The program currently drops him into a half-built blade and it is the first thing
  he sees.
- **The app opens on a chooser**, never straight into a document.
- **Class linking is optional.** Anyone signed in can model freely with no class and no
  assignment. If a class has an assignment that links to IdeaCAD, a student can link their
  document to it, and that is how the work reaches the instructor.
- Preserve the decisions already made and recorded in `docs/IDEACAD.md`: a document belongs
  to its creator and is private by default; the owner may share it view-only or as editor;
  instructors see and edit everything in their sections by default; when an owner leaves a
  section the document is **archived, never deleted**, and stays instructor-reachable;
  assignment context is **copied** at link time, never live-linked, so a later template edit
  cannot change work a student already opened.

---

## 8. What to reuse and what to throw away

**Read the tree before deciding. This list is a claim, not a fact.**

Likely worth keeping:
- The rule thresholds and the physics math (mass, center of mass, inertia, radius of
  gyration) in `src/lib/ideacad/blade/`.
- Material densities with their cited sources in `blade/materials.ts`. These were sourced
  carefully and anything unsourced is marked unverified — preserve that discipline.
- The Supabase schema, document storage, sharing, archiving and realtime in migrations 0201
  through 0214, and `store.ts`'s autosave and conflict handling.
- The design tokens in `src/lib/ideacad/ideacad.css`.
- The export layer in `src/lib/ideacad/export/` — STL, 3MF, DXF.

Likely to throw away:
- The parametric feature tree and its generator. This is the thing that failed.
- The eight fixed features and everything written against them.
- `blade/evaluate.ts`'s mesh generation, including any remaining voxel sampler.
- The PropertyManager's numeric-table editing model.

Say what you kept, what you discarded, and why.

---

## 9. How to work

- **Run locally with full tool access.** Cloud containers for this repo have no browser, no
  GPU, and a proxy that blocks pushes. You need to *look* at what you build.
- **Look at your own output.** Rasterize, open it, judge it. Three separate bundles shipped
  visual work nobody could see and one produced a completely black viewport that passed
  every test. A content check cannot see an empty canvas or a model that looks like a cube.
- **Volume and connectedness are acceptance tests, not watertightness alone.** A watertight
  mesh of the wrong shape passed every test in this repo for two days. Assert the evaluated
  volume against an analytic bound, and assert the mesh is a single connected component.
- **Test it as a person.** Model something that is not a blade. If you cannot make a simple
  bracket with the general tools, the general tools are not done.
- `npm test` exits 0 with failing tests. Read the summary line and stderr, never the exit
  code. Baseline is roughly 487 files / 9226 passing / 0 failed. `npx svelte-check` baseline
  is 0 errors, 37 warnings in 20 files.
- Do not run prettier — not a project dependency here, and it reformats a tab-indented
  codebase.
- `CLAUDE.md` in the repo root carries the operating rules. `AGENTS.md` points at it.
  `docs/IDEACAD.md` carries the product decisions. Read all three.

---

## 10. Rejected patterns — do not rebuild these

Each one shipped and was rejected on sight:

- Editing geometry through a table of numeric rows.
- Sliders or bounded numeric inputs as the primary way to change a shape.
- Clamping a value the user typed because a rule says it is out of range.
- Defining a shape by counts and spokes rather than by its actual geometry.
- A fixed feature list the user cannot add to or delete from.
- Prose instructions in the interface explaining how a control works.
- A control discoverable only by trying it.
- Embedding the modeler inside a classroom assignment page.
- Opening onto pre-made content the user did not create.
- A ground grid and drop shadow that serve no purpose.
- Two ways to do the same thing.

---

## 11. Done means

A student who has never used CAD opens the program, and within five minutes and with no
instruction, models a recognizable object of their own design and exports it.

Then they enable IdeaBlade, model a blade, and the panel tells them whether it passes and
what it weighs.

Nothing in that sentence describes a parameter table.
