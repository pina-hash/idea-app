# 0199 Notebook spreadsheet: the insertion path

- Issued: 2026-09-12T22:30:00Z
- By: router chat
- Owns: the grid insertion path in the notebook editor toolbar and menu,
  `tests/dom/notebook-grid-insert*`,
  `tools/browser-verify/routes/notebook*.mjs` and its measured store entries,
  `docs/prompt-ledger/entries/0199-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0210
- Status: issued
- Branch: claude/funny-faraday-feobl2 (cut from origin/integration 843b3860)
- Notes: THE LAST PIECE of decision 08. `0210` is applied, so the gate admits a
  grid; ledger 0192 landed the ProseMirror node and its NodeView and said in so
  many words that "the producer is the next bundle"; ledger 0187 landed the
  formula engine. This bundle is the producer: a student adds a grid to a note,
  sizes it, types into it, and writes a formula.

  Ledger 0198 owns `draft-mirror.ts`. 0192's own outcome note asks the producer
  bundle for a `draft-mirror` `v: 2`; that file is NOT owned here, so whatever
  this bundle needs from it is reported rather than written.

  MR. PINA'S BAR is that it must work as well inside a note as text editing
  does, which is mostly a bar about undo -- proven end to end rather than argued
  from the node being a ProseMirror node.

  FORMULAS ARE LIVE AND LOOKUPS ARE NOT. VLOOKUP does not exist and Mr. Pina
  accepted that; a student who types it gets the engine's ordinary
  malformed-formula error, which carries a position. Do not half-build one.

  THE FOUR REFUSALS ARE ALREADY BUILT AND MUST SURFACE READABLY, not as raw
  codes in a cell a fifteen-year-old cannot act on.

  AN ALL-EMPTY GRID CANNOT BE SAVED is `0210`'s text floor working as decided.
  A student who inserts a grid and types nothing must be TOLD, not silently
  refused on save.

**Duplicate check, three ways, all clear.** (1) `git ls-tree` over all 54 remote
refs after `--unshallow` (2,330 commits): 182 distinct ledger entry paths, no
`0199-*` on ANY ref, highest ledger id anywhere `0193`. (2) A live GitHub
contents listing of `entries?ref=main`: 179 entries, highest `0193`, no `0199`.
(3) `tools/idea-status.py` across `main`, `integration` and every `claude/**`
and `codex/**`: 174 prompts in flight, **zero** still `Status: issued`. `0199`
exists in this repo ONLY as a MIGRATION number -- `0199_classroom_html_instructor_write_gate.sql`,
claimed by prompt `0156` and landed 2026-09-11 -- exactly the shape `0191` was
in. This entry claims no migration, so nothing collides. `node tools/migration-claims.mjs`
reports highest landed `0210`, next free `0211`, and the only two claimed-not-landed
numbers are `0190`/`0191`, neither of which this bundle touches.

**The three fetches and the identity check.** The clone WAS shallow
(`is-shallow-repository` true); `git fetch --unshallow origin` took it to 2,330
commits and 54 remote refs and reported false afterwards. `git fetch origin
integration main` exit 0, bringing `origin/integration` into existence in this
clone at `843b3860`. The identity was already set -- `Claude
<noreply@anthropic.com>`, confirmed with `git var GIT_AUTHOR_IDENT` -- so
nothing was written. Identity read from the session rather than asserted:
configured `claude-opus-5`, permission mode auto.
