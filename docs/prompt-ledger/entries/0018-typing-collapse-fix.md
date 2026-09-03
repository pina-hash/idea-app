# 0018 Fix the typing collapse in Disclosure.svelte
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/Disclosure.svelte`, `src/lib/disclosure.ts`, the `collapseWhen` call sites in `ItemDetail.svelte` and `SpecRenderer.svelte`, the three disclosure test files, `docs/prompt-ledger/entries/0018-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0174
- Status: issued
- Branch: assigned by the harness
- Notes: The instructor report was "while starting to type, random modules or
  drop down menus suddenly minimize and entirely throw the viewing to the
  bottom of the page, and it deselects the text box."

  The cause, located by prompt 0012 and confirmed in the tree:
  `disclosureOpen(stored, collapseWhen)` returns `stored ?? !collapseWhen`,
  and `ItemDetail.svelte` and `SpecRenderer.svelte` pass
  `collapseWhen={started}`. A person who has never toggled that panel has
  `stored === null`, so the first keystroke flips `started` to true, `open`
  recomputes to false, and the panel folds while they are inside it, taking
  focus and scroll position with it.

  0012 shipped the harness RED on purpose. `classroom-interaction-case-typing`
  fails today, and `classroom-interaction-case-fresh` exists to refuse the
  cheapest wrong fix, which is to stop honouring `collapseWhen` at all: a
  panel must still start collapsed for someone arriving at already-started
  work.

  Deliberately excluded: the browser specs themselves, which are the oracle;
  any other `collapseWhen` caller, since notebook and SpecImporter pass
  constants or unrelated signals; and the counts-block architecture.
