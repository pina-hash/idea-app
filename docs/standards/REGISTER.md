# docs/standards/ -- register

One row per registered standards file. `Version` and `Date` come only from a
file's own header once it has been mirrored here; a file not yet present in
this directory shows `not yet mirrored` in both cells rather than a guess.

| Filename | Version | Date | Owns |
| --- | --- | --- | --- |
| `IDEA_instructions.md` | 4.15 | 2026-08-31 | Standing directive: doc-maintenance triggers, the freshness protocol for this directory, materials production pointer, Claude Code prompting and routing, cloud-container environment facts, git/branch/migration rules |
| `IDEA_MATERIALS_PROCESS.md` | 3.1 | 2026-08-28 | The process for authoring and publishing IDEA materials: pipeline, placement, tool roles, phases, the instrument-vs-material routing rule, the sources-citation standard, delivered filenames, notebook attachment, printed work surfaces, no weekday in student-facing copy, verifying a rendered artifact by what the file contains, regenerating rather than patching generated geometry, where mechanical drawings route, and "One File, One Fork" |
| `IDEA_MATERIAL_SPEC_v2.md` | 2.4 | 2026-08-27 | The canonical material authoring format: both kinds, the block types, the enforcement matrix, the instructions word ceiling, sentence floors set against the count of required items, and block ids unique across the whole spec |
| `IDEA_RUBRIC_STANDARDS.md` | 1.3 | 2026-08-25 | Leveled criteria, `short` forms, descriptor writing, grading behavior |
| `IDEA_PRINT_STANDARDS.md` | 1.0 | 2026-08-10 | Rendering rules for print-first materials: page rules, typography, color in print, document structure |
| `IDEA_CLAUDE_DESIGN_STANDARDS.md` | 2.1 | 2026-08-27 | The IDEA pathway's sole hand-maintained design standard: visual identity (absorbed from the retired `IDEA_Design_System.md`) plus the scoping and prompting of every Claude Design artifact |
| `IDEA_INTERFACE_STANDARDS.md` | 2.11 | 2026-08-26 | Layout, viewport behaviour, role parity, legibility, interaction structure for shipped app surfaces |
| `IDEA_VERIFICATION_ADDENDA.md` | 2.2 | 2026-08-30 | The owning verification standard (no longer staging, despite the filename it deliberately keeps): how any build claim is proven, harnesses, mutation proof, positive controls, mock fidelity |
| `IDEA_HUMOR_STANDARDS.md` | 2.2 | 2026-08-26 | Governs deliberate humor in IDEA and Team 5669 presentation artifacts: the three admission gates, sourcing, density and placement |
| `IDEA_HUMOR_LEDGER.md` | 1.4 | 2026-08-25 | The anti-repetition record and cooldown mechanism for every humor insertion. 1.3 is void and was never a real state; discard any copy carrying that number |
| `IDEA_REFERENCE_LIBRARY.md` | 4.3 | 2026-08-31 | Owning document for the three Google Drive libraries: what A and B hold, retrieval rules, consult-before-authoring, and Library C, the artifact store this assistant writes to at every delivery |
| `IDEA_Chat_Handoff_Standard.md` | 1.1 | 2026-08-29 | Governs every prompt written for a new claude.ai chat: when a handoff happens, the mandatory routing header, chat model routing, kickoff content rules, and closing a chat, where the closing chat writes the closeout kickoff prompt itself |
| `IDEA_CLASSROOM_REBUILD_PLAN.md` | 1.21 | 2026-08-24 | Records the locked decisions and phase history of the IDEA Classroom / notebook rebuild |
| `IDEA_MAPS_SPEC.md` | 1.1 | 2026-08-30 | The locked scoping decisions and build contract for IDEA Maps, the public spatial index of the IDEA building: domain model, draft-and-publish, search requirement, viewer, editor, phasing, verification requirements, and what was deliberately left undecided |
| `IDEA_context.md` | 2.0 | 2026-08-20 | Program-level facts that rarely change: school, pathway, courses, platforms, A-G status |
| `FRC_Design_System.md` | 1.6 | 2026-08-23 | FRC Team 5669's visual identity system: brand, marks, grounds, color roles, typography, motion, component manifest |
| `FRC_CLAUDE_DESIGN_STANDARDS.md` | 2.4 | 2026-08-25 | FRC counterpart to the IDEA Claude Design standard: scoping and prompting rules for every FRC artifact authored in Claude Design |

Every row above now carries a version and date read from line 2 of the file
itself, with no fallback and no footnote. The two exceptions this table used
to carry are closed: both files were delivered with a version header added.

## This table is maintained by a tool, not by memory

`tools/standards-sweep.py` in this repository reconciles this table against the
directory it describes and against the project knowledge copies, in every
direction at once, and reports each disagreement by name. Run it at the start of
any closeout and before editing any standards file in a batch. A row here is only
ever read from a **mirrored** file, so a row can be perfectly correct about the
mirror while the real current version of that file sits unmirrored in project
knowledge. That is not a defect in the register and the register cannot detect it;
the sweep can, and on 2026-08-29 it found three files in exactly that state.

## FRC files also live in a second repository

`FRC_Design_System.md` and `FRC_CLAUDE_DESIGN_STANDARDS.md` also live in
**`FRC-Team-5669-Techmen/frc-app`** at `src/lib/design-system/docs/`, for
Claude Code sessions working in that repo. **This directory
(`idea-app/docs/standards/`) is the freshness authority for both files
regardless of which repository a session is reading them from.**
