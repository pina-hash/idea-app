---
title: "IdeaCAD's scope is finally written: an extremely quick idea sketcher rather than technical CAD, standalone by a rejected 373px classroom embed, with copied assignment context and immutable versioned workspaces (`codex/ideacad-scope-0235`, no migration)"
date: 2026-09-14
branches: [codex/ideacad-scope-0235]
migrations: []
subsystems: ["IdeaCAD", "Documentation"]
---

`docs/IDEACAD.md` did not exist, and IdeaCAD's product boundary had to be
reconstructed from its implementation, migrations `0201` and `0214`, and the
history of ledgers 0223, 0224, 0227, 0228 and 0230. No ledger 0231 entry or
matching history file exists in this tree or any fetched ref, so nothing was
silently attributed to it.

This bundle records Mr. Pina's framing verbatim: this is an extremely quick way
to sketch in 3D and get an idea across, not a technical-precision or
technical-drawing program. Speed and directness win where they conflict with
precision and rigor. It also records the classroom embed as a tried, shipped,
on-sight rejection at about 373px of graphics width. The owning application is
the standalone full-screen route launched from home; the rejected embed is not
presented as an alternative awaiting polish.

The assignment handoff is now decided in writing even though it is not built in
this shape: import copies context into an assignment and automatically attaches
a plain IdeaCAD link — “nothing fancy.” There is no live template link and no
manual confirmation. The current schema-4 teacher control remains described as
what exists, not mistaken for that future import flow.

Workspace identity is immutable once a document has work, and cross-workspace
movement is an explicit copy. Contexts are versioned; unknown and higher
versions refuse loudly rather than coercing data. Blade remains the sole
registered adapter and version 1 refuses every other version today. The future
blank/general workspace can open other workspaces' documents; Blade is the
default only while it is alone, and the second workspace brings a chooser. The
blank workspace, persisted workspace/context identity, explicit copy, and
chooser are all named as unbuilt rather than implied by the adapter contract.

The tree audit keeps the two sharp defects in view. A genuinely assignment-free
document cannot exist because `ideacad_documents.item_id` is a NOT NULL foreign
key and both editor registration and creation are item-keyed. The standalone
chooser admits a teacher and may show an editor starter, but every new-document
button calls the student-only `ideacad_open_document` gate. Existing documents
take the separate document-keyed manager-capable read path; that does not repair
creation.

Three new decision entries split purpose/application boundary, assignment
handoff, and workspace/context invariants so their separate open questions do
not become accidental decisions. Decisions 27 and 28 had stale Status and Build
lines saying the history timeline and production shared-open route were not
landed. The current tree mounts both, so those current-status blocks now say
built while their dated build narratives remain as history. Decision 27's
separate unanswered question — whether one collaborator may undo another's
action — remains open.

The scope document reports prior measurements with their instrument limits: the
1440px standalone grid's 934px graphics allocation, the full-width 375px pane,
the removed 880px global ceiling, the 1900px resolved app width, the 972- and
1006-measurement robustness passes, the former 345px orientation list inside a
278px box, and durable history's 220.5 bytes per action. CSS arithmetic is not
called a browser measurement where Chromium did not launch. The three layout
limitations deliberately retained by ledger 0224 remain identified as observed
debt, not product decisions.

No source, test, or migration changed. There is no visual change to screenshot.
`npm run history:verify` passed before and after the new history entry. The first
`npm test` attempt under the container's default Node 20 failed during Vitest
startup while resolving `node:module`; after selecting cached Node 24 and running
`npx svelte-kit sync`, two attempts began tests but the Vitest child terminated
before writing its JSON report or final PASS/FAIL counts. The partial console
output is not reported as a suite verdict. This environment therefore produced
no honest full-suite pass/fail count, and the verification is recorded as failed
rather than inferred from a process exit.

All unmade choices are questions in `docs/IDEACAD.md`: blank-workspace tools and
cross-opening semantics, chooser behaviour, persisted identity/version shape,
the definition of “has work,” copy contents and permissions, older-context
migration and refusal recovery, import format/link details, refresh semantics,
transition of existing schema-4 items, a teacher creation path, the
assignment-free migration design, and remedies for the retained overflow. None
is answered by convenience, current code shape, or this documentation bundle.
