# Standards mirror and scope

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). docs/standards as the freshness authority, and the scope rules. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### Standards mirrored from project knowledge -- `docs/standards/` IS THE FRESHNESS AUTHORITY

`docs/standards/` holds the IDEA programme standards. They are **authored in chat
and delivered into project knowledge**, which is the working copy every chat reads
by default; this directory is the **second copy, with a history**, so a chat (or a
session in this repo) can fetch a file here and tell whether its own copy is stale.
**Every standards delivery commits the updated file here in the same turn it is
delivered**, before it is re-uploaded to project knowledge. It is not read-only:
a file found behind project knowledge here is a defect in the delivery that
produced it, and the fix is to land the current file, not to leave this copy stale.
See `docs/standards/README.md` and `docs/standards/REGISTER.md`.

- `docs/standards/IDEA_INTERFACE_STANDARDS.md` -- layout, viewport behaviour, role
  parity, legibility, interaction structure.
- `docs/standards/IDEA_MATERIAL_SPEC_v2.md` -- the canonical material authoring
  format: both kinds, the block types, the enforcement matrix.
- `docs/standards/IDEA_RUBRIC_STANDARDS.md` -- leveled criteria, `short` forms,
  descriptor writing, grading behaviour.
- `docs/standards/IDEA_VERIFICATION_ADDENDA.md` -- the owning verification
  standard. The filename is kept deliberately (see below) though the document is
  no longer staging.

**Cite them by section**, the way the code already does (`IDEA_INTERFACE_STANDARDS`
10, `IDEA_MATERIAL_SPEC` v2.2), and cite the path under `docs/standards/` so the
reference resolves for the next reader.

- **The header version and the newest changelog entry must agree**, which
  `tests/standards-version-header.test.ts` asserts over every file in the
  directory. A header that has fallen behind its own changelog reads as correct and
  has already caused a document to be rewritten from a stale base. The test refuses
  the copy; it does not repair it.
- **`IDEA_MATERIALS_PROCESS.md` is mirrored here** alongside the rest of the
  registered set in `docs/standards/REGISTER.md`. It does not live upstream-only.
- **Two names that used to route upstream never resolved to anything, and now
  resolve here.** `IDEA_Design_System.md` was retired 2026-08-25; its content is
  absorbed into `docs/standards/IDEA_CLAUDE_DESIGN_STANDARDS.md`. `IDEA_VERIFICATION_STANDARDS.md`
  was a name cited into being and never written; the real document is
  `docs/standards/IDEA_VERIFICATION_ADDENDA.md`, which deliberately keeps that
  filename so existing references do not orphan.
- **`docs/IDEA_MATERIAL_SPEC_v1.md` is a deliberate stub, not a standard**, and
  says so. It stays because an agent once cited it as authority; a stub that names
  the real document fails loudly where a deletion fails silently.
- **Where a standard and the code disagree, that is a bug in one of them and worth
  raising.** It is not licence to pick whichever is convenient. `CLAUDE.md` still
  wins on how work in THIS repo is done.

---

## Scope

- **AI levels on assignments are set by ASKING THE INSTRUCTOR**, never inferred
  from the content. `docs/policy/IDEA_AI_Use_Policy.md`'s category-defaults table is
  the starting point for that conversation, not a rule that self-applies.
- **A module's `instructions` carry a 250-word TARGET and a 300-word CEILING**
  (`IDEA_MATERIAL_SPEC` v2.1). Instructions and the input tables share one scroll
  column on the item page, so teaching that explains WHY belongs in the unit
  reference document and only bench procedure stays in the item. **NEITHER NUMBER
  BLOCKS ANYTHING, and that is now the whole of it:** 251-300 is a non-blocking
  WARNING from `validateSpec`, rendered in SpecImporter's problem list and never
  gating publish, and 301 is the same warning with a different sentence. **The
  count comes from the renderer's own `parseMarkdown` walk**
  (`instructionsWordCount`), never a regex stripper -- a second syntax parser
  would charge an author for their own list markers and the number reported
  would not be the number on the page.
  **`tests/spec-instructions-budget.test.ts` PINS THE COUNTER AND THE WARNING,
  NOT THE CATALOGUE.** It used to sweep every spec under `materials/` and fail
  on any module over the ceiling, with three specs exempted by path and by
  pinned hash. That is deleted: `materials/` is an EXPORT the app writes on
  every item save, so the sweep enforced an authoring standard against a mirror
  of already-published work, could gate nothing, and turned CI red whenever a
  teacher pressed save. **If the ceiling should ever BLOCK, that is a narrowing
  of `validateSpec` with its own answer for the specs already stored** -- not a
  test over a directory nobody edits by hand.
- **Real quiz and rubric CONTENT is not committed to this repo.** It is pasted into
  its table by hand by whoever has SQL editor access, the same way the coin price
  list is maintained. A role or unit with zero questions is a legitimate state, not
  a bug.
- **A student-facing surface never gains a second scoring path for work that is
  already graded once.** A notebook check-in is a notice with a link, not a
  submittable item. **It may HANG OFF a classroom item** (0120: the posting
  carries an `item_id`, so the day's material and its notebook requirement are
  one row), and that changes only WHERE it renders -- it gains no points, no due
  date, no submission and no rubric by being attached, and the unit is still
  graded exactly once through `notebook_unit_items`.
- The phase-by-phase scope history (Phases 1-5 and what each deferred) is in
  `docs/history/record-scope-guardrails.md`.
