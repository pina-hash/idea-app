# 0198 The draft mirror discards a whole restored draft on an unknown block: hold it, and bump the shape version

- Issued: 2026-09-12
- By: router chat
- Owns: `src/lib/notebook/draft-mirror.ts` and its callers' version handling,
  `tests/dom/notebook-draft-mirror*`, `docs/prompt-ledger/entries/0198-*`, and its own
  `docs/history/` entry. NOT the grid node or its NodeView (ledger 0192 owns those and
  they are landing), and no file of ledgers 0195, 0196 or 0197.
- Migration permitted: no. Claims: none.
- Status: pushed
- Branch: `claude/tender-davinci-gl6z72`, branched from `origin/integration` at `843b3860`.
- Notes: The defect was measured by ledger 0192 and PINNED IN A TEST IT COULD NOT FIX,
  because `draft-mirror.ts` was outside its surface. A build without the grid node,
  handed a mirrored document that contains one, does not throw -- Tiptap swallows the
  `RangeError` and discards the WHOLE document, paragraphs included. Silent total loss of
  a student's written work.

## Outcome

**Reproduced first, through the module's own read path and a real editor**: 29 characters
to 0, `{"type":"doc","content":[{"type":"paragraph"}]}`. **And it is wider than 0192
found** -- the same total discard was measured for an unknown INLINE node and an unknown
MARK, not only an unknown block; an unrecognised attr on a known node is harmless. Since
`underline`, `strike` and `code` are all off in `NOTE_SCHEMA_OPTIONS` today, the mark case
is a live future path, so the vocabulary is two lists rather than one.

**THE FIX IS `hold`, NOT DROP AND NOT STRIP.** `planMirrorRestore` answers
`{ action: 'hold', unknown }` for a document naming anything
`NOTE_MIRROR_VOCABULARY` does not, the composer restores nothing and clears nothing, and
the writing stays in `localStorage` untouched so a roll-forward restores it whole. Dropping
is total loss of the only copy; stripping destroys the rest 400ms later, because the
restored box IS what the composer mirrors next. **Three write paths were told to steer
around a held key**, and `writeMirror`'s quota sweep is the one that would actually have
eaten it.

**The version bump is real and is the SMALLER half.** `mirrorVersionFor` derives it from
the document -- the `v: 1` literal at the call site was the other half of the defect --
and `V1_MIRROR_VOCABULARY` is frozen against a moving `NOTE_MIRROR_VOCABULARY` so the bump
arms itself with no second edit. It only helps builds that already know to look, which is
said plainly rather than papered over.

**Measured**: suite **447 files / 8541 tests / 0 failures**, against **446 / 8518** at the
branch point measured in a clean worktree -- the prompt's `443 / 8,463` was stale by 3
files and 55 tests, and the delta is exactly this bundle's one test file.
**`svelte-check` 0 errors / 37 warnings in 20 files (31/5/1)**, identical at the branch
point and on this tree, so **`CLAUDE.md`'s figure is correct and needed no correction**.
`verify:readme --route notebook`: 26 runs, 428 measurements, 0 outside threshold; the
regenerated README and thirteen `measured/*.json` were **restored, not committed** --
timestamp and sha churn only, and outside this bundle's Owns.

**Mutation-proved both directions**, restored from a saved copy with md5 verified and never
`git checkout --`: seven permissive module mutants and six caller mutants all red, plus an
over-strict "hold everything" mutant that reddens the ordinary-prose and new-build cases.

**NO MERGE TO `main`, AND THE RANGE CHECK IS WHY.**
`git diff --name-only origin/main...origin/integration -- supabase/migrations/` prints
**`0209_ideacad_history.sql` and `0210_notebook_note_grid.sql`**. Ledger 0114's own rule:
*"If the migration check ever comes back non-empty, the stop rule fires first and the
substitution never applies."* So gate 4's substitution is void and the stop rule governs.
`0210` is ledger 0192's own grid gate, so this is the expected state. Item 1 passes
(`origin/main` is an ancestor of `origin/integration`); item 4 answers
`DEPLOY_PROBE_URL is not set ... "cannot confirm", never "applied"`.
**Production is unreachable from this container**: `403` on CONNECT for both
`ideabosco.com` and `apps.ideabosco.com`.

**`CLAUDE.md` WAS EDITED AND IS NOT IN THIS BUNDLE'S OWNS**, flagged here deliberately.
Two rules had become false in a load-bearing way about a mechanism a student's writing
depends on: *"A stored SHAPE VERSION older or unknown is DROPPED"* (a known older one is
now READ), and the third-mirror obligation list, which went from seven properties to
eight. Kept to one paragraph and its list.
