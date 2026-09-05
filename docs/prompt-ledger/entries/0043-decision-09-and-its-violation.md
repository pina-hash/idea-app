# 0043 Decision 09 written down, and the live violation it names
- Issued: 2026-09-04
- By: router chat for IDEA portal work
- Owns: `docs/standards/IDEA_INTERFACE_STANDARDS.md`, its `REGISTER.md` row, decision 09's Status line, the row-action controls in `SpecRenderer.svelte`, `tools/browser-verify/routes/spec-table*.mjs`, the generated regions in `tools/browser-verify/README.md`, `tests/classroom-spec-table*`, `docs/prompt-ledger/entries/0043-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: Mr. Pina answered decision 09 on 2026-09-02: 44px on every student
  surface, 24px only on an instructor density surface DECLARING A NAMED
  CLASS. Two days and forty bundles later the clause is still not in
  `IDEA_INTERFACE_STANDARDS.md`, so five prompts have quoted the decision
  from a router chat's memory rather than from the standard. That is the
  shape this project has a written rule against: a routing entry is not
  evidence a rule exists.

  It now has a live violation to name. Prompt 0039 measured the spec table's
  four row-action glyphs at 23.2x23.2 and deliberately did not fix them,
  recording two outside-threshold rows instead. Its reason was real: four
  44px targets is about 11rem inside a 6.4rem column, in a table that already
  scrolls at 375px. A spec table is a STUDENT surface and declares no density
  class, so under decision 09 as answered there is no exception available to
  it.

  So the standard has to say what a surface does when the floor and the
  column both cannot be satisfied. That sentence does not exist yet and this
  bundle writes it.

  Deliberately excluded: `classroom.css`; every other surface's tap targets;
  and the Add-row control, which prompt 0039 already took from 24 to 44.
