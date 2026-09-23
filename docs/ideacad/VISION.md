# IdeaCAD vision

- Owner: Mr. Pina. This file holds his intent for IdeaCAD. It is not a build plan and
  it is not a backlog. A plan or a brief that disagrees with it is wrong, and this file
  is corrected only by him or by a session quoting him.
- Written: 2026-09-22, by the router chat, from his own words across 2026-09-12 to
  2026-09-22. Quotes are verbatim. Everything not in quotation marks is a restatement and
  should be read as one.
- Companion files: `docs/IDEACAD.md` (what exists, measured), `docs/decisions/entries/`
  24 and 27 through 33 (decisions), `docs/ideacad/specifications/` (the 09-14 spec and
  addendum), `docs/ideacad/research/2026-09-22-feature-and-ux-research.md` (the research
  behind the choices below).

## What IdeaCAD is

> "It's like an automatic SolidWorks. SolidWorks with less steps. A type of SolidWorks
> that's so easy to use that you don't need a tutorial to figure out how to use it."

> "You are sketching things in 3D space to get your idea across. It should be quick to
> use, extremely quick to use. It's IdeaCAD, as in it's to develop ideas. It's not to
> make technical drawings."

> "It should be as intuitive as drawing."

IdeaCAD is a general-purpose, browser-based 3D modeler for Bosco Tech students, standalone
and full screen, reached from the home page. Students still learn SolidWorks. IdeaCAD is not
a replacement for it and not a clone of it. In the 09-20 request, in his words: "not saying
to build solidworks but to adapt it to this platform."

## The thesis, in four parts

1. **The program itself is the tutorial.** A student who has never seen it can find every
   tool by looking and hovering. Learning happens at the moment of need, inside the work,
   never in a separate mode that blocks the work.
2. **Faster than SolidWorks for fleshing out an idea, even for an expert.** An experienced
   SolidWorks user should reach a rough, correct-looking model sooner here than there.
   Every added step, dialog or confirmation is a cost against this.
3. **Accurate, dimensioned work is still possible.** A student who wants a part at exact
   sizes can type every number and get it. Precision is available on request and never
   charged as a toll on the fast path. Decision 31 stands: this is not a technical-drawing
   program, and where speed and rigor conflict, speed wins.
4. **Freedom.** "I should be able to put any value I want in there." "I want freedom."
   "I should be able to model anything I want." Nothing is clamped. A limit that exists is
   a stated reason with a way forward, never a disabled control.

## Principles that decide design questions

- **SolidWorks conventions where they cross over.** He teaches SolidWorks and his students
  are learning it, so where IdeaCAD has the same concept, it behaves the same way: the
  mouse, orbit about the point under the cursor, the design tree, the default planes and
  Origin, sketch colors, right-click menus, box-select direction, selection breadcrumbs.
  Muscle memory from one program should work in the other. Where IdeaCAD can do it with
  fewer steps, it does, and the SolidWorks path still works.
- **Selection implies the tool.** Selecting something shows what can be done with it, near
  the pointer. The menu hunt is the thing being eliminated.
- **No prose instructions in the interface.** If a control needs a sentence explaining it,
  the control is wrong.
- **No dead space.** Every panel and toolbar earns its area. Empty regions, oversized
  padding, and tool menus with gaps are defects. Nothing overlaps at half-screen width.
- **Button text never touches its border**, on any page, at any width.
- **Customization, customization, customization.** In his words, three times. Layout,
  toolbars, shortcuts, view modes, units, colors and hint visibility are the user's, saved
  per user and following them to any computer. Shortcuts exist for experts and are always
  optional; nothing requires memorizing one.
- **Add-ons advise, never restrict.** IdeaBlade and every future add-on is off by default,
  enabled by the user, and can never constrain what the base program models.
- **Honest numbers.** A value IdeaCAD cannot stand behind is shown as unknown, not
  guessed. The density rule (no mass without a cited density) is an example of this, and
  a physics feature that would need to break it says so instead.
- **Undo is total and fearless.**
- **One file holds parts and their assembly.** Requested 2026-09-20. A document can hold
  several parts, their placements and their mates.

## Well-rounded, and the catch-up rule

Stated 2026-09-22, in his words:

> "If one part of the program is built out really in depth right now, I want the other
> parts to catch up before further progress is made on the more developed parts."

IdeaCAD should be well-rounded rather than excellent in one corner. The assembly side has
"a ton of stuff" left, and so does basic simulation. When deciding what to build next, the
least mature area goes first. Depth in an area that is already ahead waits.

## How work on IdeaCAD should behave

From the 2026-09-22 request, in his words: "I want for claude code to seek out improvements
to work towards my vision rather than just relying on the prompt for things to add/change."

A session working on IdeaCAD uses the program the way a student would, notices what is
slow, confusing, ugly or missing, and fixes it, checked against this file. A list in a
prompt is a set of seeds, never the boundary of the work.

## Things he has asked for by name

These are recorded so they are never lost. They are the seed list, not the whole vision.

- An interactive tutorial that can be opened at any time and never blocks work.
- View modes.
- A history slider along the bottom, with a play button that runs a time-lapse of the
  model being built at a defined rate.
- An animated cube in the home page banner, themed so it is recognizable as IdeaCAD
  without saying "IdeaCAD", respecting reduced motion.
- On the chooser, top left: the regular website logo linking home, with the IdeaCAD logo
  beside it.
- The IdeaCAD logo refined so it is less plain, keeping the logo itself.
- Fillets rebuilt. In his words, they "totally suck."
- The feature tree rebuilt to resemble SolidWorks'. In his words, it "totally sucks."
  Sketches nest under the features that consume them, rows collapse, and names edit in place.
- The axes triad moved to the bottom-left corner, rotating with the view, keeping its
  current visual design.
- Default reference geometry in every part: Front, Top and Right planes and the Origin.
- Right-click menus everywhere they make sense.
- Breadcrumbs and tool icons near the pointer when something is selected.
- Box select, with left-to-right and right-to-left behaving as in SolidWorks.
- A formal sketch system: sketches as first-class objects with relations and dimensions.
- Curvature: tangent and smooth transitions, and a way to see them.
- Quick selection of many edges at once.
- No toolbar overlap at half-screen width, and no dead space in the tool menu.
- Earlier, 2026-09-20: SolidWorks-level dimensional control, storage and delete, the
  launch page, the design tree, mates and the one-file assembly, moving parts, materials
  and color, complex sketches, reference geometry, fillets and chamfers, and IdeaBlade's
  tools living in its add-on.

## Rejected, and not to be revisited

- **Embedding IdeaCAD inside a classroom assignment page** (decision 31). It rendered
  about 373px wide and was rejected on sight.
- **A parameter-generator architecture** where the model is a fixed list of rows emitting
  a mesh (spec section 2). It is why the first IdeaCAD could not be dragged and felt, in
  his words, "neutered."
- **Clamped value ranges.**
- **A ground plane and drop shadow.** In his words, "completely useless, it's just for looks."
- **A first-run tour that blocks the work.**
- **Technical drawings** as a goal.

## Open questions only he can answer

Recorded here so a session does not answer them silently. Each goes to
`docs/decisions/entries/` when it becomes blocking.

- Decision 31's four open questions about the blank workspace remain open.
- Decision 30 (who owns an assembly, permissions by team role, transfer) is answered and
  unbuilt.
- Whether any simulation beyond closed-form checks and exact geometry (for example linear
  static stress) belongs in IdeaCAD at all, given the density rule and his framing.
- Raised by ledger 0296: whether a part used several times in one file (four wheels) should
  become one definition with several placements, so editing one edits all, and "make
  unique" breaks the link. It changes the saved document format, so it was not started.
- Raised by ledger 0296: whether the solid modeler's materials should come from the
  admin-edited materials table (his 2026-09-12 decision that materials are data) instead of
  the fixed list it still carries.
- Raised by ledger 0296: whether hiding a body should be saved with the document, so it is
  still hidden when the file is reopened. Today hiding lasts only until the file closes.
- Raised by ledger 0296: whether Front, Top and Right should show until the first solid (the
  default chosen) or always, as SolidWorks does until they are hidden.
