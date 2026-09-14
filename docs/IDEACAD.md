# IdeaCAD

This document owns IdeaCAD's product scope. It separates Mr. Pina's decisions
from what the repository happens to implement today. Implementation is evidence,
not permission to infer the unanswered product decisions listed at the end.

## The product decision

Mr. Pina's framing is the governing definition:

> “This is not a technical precision program. You are sketching things in 3D
> space to get your idea across. It should be quick to use, extremely quick to
> use. It's IdeaCAD, as in it's to develop ideas. It's not to make technical
> drawings.”

When speed and directness conflict with precision or rigor, **speed and
directness win**. IdeaCAD is for developing and communicating an idea, not for
producing technical drawings. See decision 31.

## The application boundary

**IdeaCAD is a standalone, full-screen application reached from the home page.**
Embedding the editor in a classroom assignment page was tried, shipped, and
**rejected on sight**: the graphics area rendered about **373px wide**. That is a
rejected approach, not an unfinished layout to revisit. A classroom assignment
may point into IdeaCAD; it may not become the frame around the editor.

Today `/ideacad` is authenticated and removes the portal reading-column ceiling.
It renders its own 48px command bar and a viewport-filling document/editor area.
The home launcher routes to it. Desktop has independently collapsible, resizable
feature and property panes; their widths are saved in
`profiles.preferences.ideacad`. At 375px the panes become full-width overlays
selected by Features / Graphics / Properties. The existing Blade editor remains
the only editor render path. (`src/routes/ideacad/+layout.svelte`,
`src/routes/ideacad/+page.server.ts`, `src/lib/ideacad/app/IdeaCadApp.svelte`;
ledger 0227.)

## Assignments hand off; they do not contain the app

An assignment links to IdeaCAD through a plain embedded link that the student
clicks — **“nothing fancy.”** Import attaches that link automatically; it is not
confirmed by hand.

Assignment context is **copied into the assignment at import, never live-linked
to a template**. Editing a template later must never alter work a student has
already opened. The automatic import/link flow is not present in the inspected
IdeaCAD tree. What exists today is the older schema-4 attachment path:

- `ideacad_set_editor` changes a classroom assignment to schema 4 and stores the
  editor name and JSON configuration in the item-keyed `ideacad_editors` row.
- The teacher control supplies Blade's current `DEFAULT_BLADE_CONFIG`. Turning
  the editor off deletes that editor row and clears schema 4, but does not delete
  documents, concepts, or predictions; turning it back on exposes the existing
  work again.
- A student's first `ideacad_open_document(item_id)` copies
  `config.defaultFeatures` into the first concept. Existing documents are opened
  by document id through the non-creating `ideacad_open_shared_document` path.

Those facts describe the current implementation. They do not decide the open
import format or authorize a live template link. See decision 32 and migration
`0201`.

## Documents, workspaces, and contexts

### Decided invariants

- A document's workspace is **immutable once it has work**. Moving work to a
  different workspace is an explicit **copy**, never an in-place workspace
  change.
- Workspace contexts are **versioned**. Updating a workspace must never lose
  existing work. An unknown workspace or unknown/higher context version is
  refused loudly, never guessed, downgraded, or coerced.
- There will be a **BLANK / general workspace** alongside Blade. The blank
  workspace can **OPEN documents from other workspaces**. It is not built.
- While Blade is the only workspace, standalone IdeaCAD defaults to Blade. Once
  two workspaces exist, IdeaCAD presents a workspace chooser.

### What the workspace code actually supplies today

`workspaceRegistry` is an immutable, explicitly constructed registry containing
only `bladeWorkspace`. Unknown ids throw `UnknownWorkspaceError`; duplicate ids
are refused. Blade has context version 1. Missing, non-integer, older (there is
no older migration), or higher versions throw `WorkspaceContextVersionError`
before the adapter reads version-specific configuration. The adapter delegates
starting-tree creation, validation, and evaluation to the existing Blade code.

This contract is **not persisted by the current document schema**. There is no
workspace id or context-version column on `ideacad_documents`; the stored editor
configuration remains item-keyed. Consequently, immutable workspace identity,
explicit copy between workspaces, the blank workspace, cross-workspace opening,
and the two-workspace chooser are not built. (`src/lib/ideacad/workspaces.ts`,
`src/lib/ideacad/blade/workspace.ts`; ledger 0230.)

## What exists today

The shipped data model began in migration `0201` and was extended by the later
IdeaCAD migrations. Its core is:

- `ideacad_editors`: one editor registration and JSON config per classroom item.
- `ideacad_documents`: one student-owned document per `(item_id, student_email)`.
- `ideacad_concepts`: ordered, revisioned feature trees under a document, with an
  active concept selected by the document.
- `ideacad_predictions`: one selected concept and rationale per document. The
  prediction gates nothing; physics stays visible.
- `ideacad_materials`: global and student-custom material data, retired rather
  than deleted.
- Durable attributed action history, document grants, assembly parts with
  checkout, private Realtime broadcast, and archive/class-sharing layers are
  implemented by the migrations after `0201` and consumed under
  `src/lib/ideacad/`.

The Blade surface provides a feature tree, property manager/profile preview,
Three.js graphics viewport, concept cards, always-visible rule and physics
readouts, prediction, durable attributed history with undo/redo, sharing,
assembly parts/checkout, and archive surfaces. Documents are private by default;
named classmates can be viewers or editors, and the instructor managing the
item can read and edit. The separate decision entries 24–30 own those answers;
this scope document does not replace them.

Migration `0214` adds `archived_at` and `archived_by`. Archiving blocks writes but
not reads. Its instructor archive listing is item-keyed because the live roster
is enrollment-driven and cannot name a departed owner's document. A class share
is always view-only, is live against enrollment, and is available only for an
archived document. Documents and materials are retired/archived rather than
deleted under their existing decisions.

## What has been measured

These numbers are historical measurements of the named builds, not promises
about an unmeasured browser today:

- The rejected classroom embedding produced an approximately **373px-wide**
  graphics area; that sight test established the standalone boundary.
- The standalone desktop grid at 1440px resolves to **260 + 6 + 934 + 6 + 240px**,
  leaving **934px** for graphics. At 375px each switched pane occupies the full
  **375px** width. Ledger 0227 records these as CSS arithmetic because Chromium
  could not launch in that environment.
- Before the route-specific layout reset, the global app shell capped the
  supposedly full-screen route at **880px**. At a 1900px viewport the reset
  changes that resolved constraint to the application's full **1900px** width.
  Ledger 0228 also records this as CSS arithmetic rather than live DOM output.
- The robustness pass began with **50 route/width runs, 972 measurements, 0
  outside threshold**, despite interaction defects. After its fixes it recorded
  **52 route/width runs, 1006 measurements, 0 outside threshold** and **70
  self-test controls with 0 instrument failures**. This is why a green geometry
  threshold is not treated as proof that the editor is usable. Ledger 0224
  contains the drive and screenshots.
- That drive measured seven orientation rows at **345px in a 278px box** before
  the phone menu fix. It also found an unpressable phone confirmation, an empty
  concept-list crash, and a two-word stale-save message; those four defects were
  fixed in ledger 0224.
- The durable history schema measured **220.5 bytes per action**, including heap,
  indexes, and page overhead, against a **400-byte** budget. Decision 28 owns the
  retention implication.

## Known broken or structurally impossible today

### A genuinely assignment-free document is impossible

`ideacad_documents.item_id` is a **NOT NULL** foreign key to
`classroom_items`, and its uniqueness is `(item_id, student_email)`.
`ideacad_editors` is item-keyed too. Therefore the standalone app is a standalone
*surface*, not an assignment-independent storage model. “New document” currently
means “create from an available assignment-backed editor registration.” A truly
general document requires a migration; ledger 0235 authorizes none.

### The chooser sends a teacher toward a student-only creation gate

`/ideacad/+page.server.ts` admits any signed-in user and builds its chooser from
documents visible through RLS plus editor registrations. The chooser's “New
document” buttons always call `store.open(itemId)`, which invokes
`ideacad_open_document`. That RPC begins with `_classroom_engine_student` and
therefore requires an actively enrolled student. A teacher can reach the chooser
and can be shown a starter, but clicking it routes the teacher through a
student-only gate and refuses. Existing document buttons use
`openShared(documentId)`, whose deployed manager branch is different; this does
not repair the new-document path.

### The workspace boundary is not connected to stored documents

Blade's versioned adapter refuses bad context in isolation, but the route/store
still load item configuration directly and documents carry no workspace/context
identity. The safety contract exists in code; the persistence path needed to
enforce it for a document does not.

### Known layout debt retained after the robustness pass

Ledger 0224 deliberately left three observed limitations: the Materials panel
was measured **446px taller** than its pane at 1440; the 375px compare sheet held
**1151px of content in a 650px scroll box**; and the no-store preview harness
showed “Saved” immediately. These are recorded limitations, not new product
decisions. Their desired remedies remain open.

## Open questions — no answer is implied

Everything below is open unless a cited existing decision entry already owns it:

1. What exact tools and feature model make up the blank/general workspace?
2. What does “open documents from other workspaces” do: interpret in place,
   offer a copy, or open read-only?
3. What does the workspace chooser show, and can a person save a preferred
   default after the second workspace exists?
4. What exact database shape persists workspace id and context version?
5. What exact event means a document “has work” and freezes its workspace?
6. What data and permissions carry into an explicit cross-workspace copy?
7. How are supported older contexts migrated while preserving the original,
   and what recovery/export is offered for a loudly refused newer context?
8. What is the assignment import/template format, and exactly which context is
   copied at import?
9. Where and how is the plain IdeaCAD link attached automatically, and what are
   its link text and destination parameters?
10. What happens when import encounters an unknown workspace or unsupported
    context version?
11. May an unopened assignment be deliberately refreshed from a newer template,
    and how is “unopened/no work” proven?
12. How, if at all, are existing schema-4 assignments transitioned to the
    copied-context/plain-link flow?
13. Should teachers be offered any document-creation path in the standalone
    chooser, and if so what do they create and own?
14. What migration makes genuinely assignment-free documents possible without
    weakening assignment ownership, sharing, archive, or instructor access?
15. Should the retained Materials-panel and phone compare-sheet overflow be
    redesigned, and what interaction should replace each?

The current tree, its convenience defaults, and the names of existing RPCs do
not decide any of these questions.
