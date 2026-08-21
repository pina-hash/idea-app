# IDEA Material Spec v1 - SUPERSEDED, NOT AUTHORITATIVE

**This file is a stub. Do not author against it and do not cite it.**

The canonical authoring format for IDEA course materials is
**`IDEA_MATERIAL_SPEC_v2.md`**, which is **maintained outside this repository**
and was at **version 2.2 (2026-08-20)** when this stub was written. It supersedes
the v1 schema this file used to describe: v2 adds the `kind` discriminator
(`assignment` keeps everything v1 had, unchanged; `reference` is the read-only
document kind), moves rubrics to leveled descriptors, and describes rules the
database actually rejects rather than conventions.

Its companion standards live outside this repo too, and none of them is mirrored
here:

- `IDEA_MATERIAL_SPEC_v2.md` - the schema, both kinds, the enforcement matrix
- `IDEA_RUBRIC_STANDARDS.md` - leveled criteria, `short` forms, descriptor writing
- `IDEA_INTERFACE_STANDARDS.md` - layout, role parity, legibility, viewport verification
- `IDEA_VERIFICATION_STANDARDS.md` - how a claim about a build is proven
- `IDEA_Design_System.md` - color, typography, effects, themes

## Why this file still exists

Deleting it would be worse than stubbing it. It was cited as authority by an
agent reading this repo, which is the exact failure a stale copy causes: the
agent had no way to know a newer version existed, because from inside the repo
this file looked like the standard. A stub that says "not this one, and here is
the name of the real one" fails loudly where a deleted file fails silently and a
stale file does not fail at all. `IDEA_MATERIAL_SPEC_v2.md` 2.2 records this
specific incident in its changelog.

## What IS authoritative inside this repo

For anything the code actually enforces, read the code, not a document:

- `src/lib/classroom/assignment-spec.ts` - assignment spec types and `validateSpec`
- `src/lib/classroom/reference-spec.ts` - reference spec types, `validateReferenceSpec`,
  and the authored-prose parser (`parseMarkdown`)
- `supabase/migrations/0086_classroom_assignment_engine.sql` - `_classroom_check_spec`,
  the SQL boundary for assignment specs
- `supabase/migrations/0092_classroom_reference_specs.sql` - the reference-spec
  validator and the public read path

Where a standard and the code disagree, that is a bug in one of them and worth
raising. It is not a licence to pick whichever is convenient.

## What used to be here

Schema v1.1, dated 2026-08-13: top-level structure, `meta`, `modules[]`, flat
then leveled `rubric[]`, the six block types, `declarations`, `approvalGate`,
`print`, derived behaviour, and the authoring workflow. All of it is in v2 Part 1
in current form. Two things it described are now known to be wrong and are
corrected in v2.2 rather than here: there is no separate print renderer for spec
blocks (print is `@media print` CSS inside the rendering components), and
`printAs` / `printConfig` were declared and read by nothing. Both have since been
removed from `assignment-spec.ts`.
