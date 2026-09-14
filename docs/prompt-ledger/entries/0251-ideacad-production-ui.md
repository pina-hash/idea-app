# 0251 IdeaCAD production UI repair

- Issued: 2026-09-14
- By: user prompt
- Owns: `src/lib/ideacad/ui/FeatureTree.svelte`,
  `src/lib/ideacad/BladeEditor.svelte`, `src/lib/ideacad/ideacad.css`,
  `docs/prompt-ledger/entries/0251-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: pending
- Branch: `codex/ideacad-production-ui-0251`, branched from the supplied working tree.
- Notes: keeps numeric values inside their fields, replaces full-height pane labels
  with docked icon affordances, removes redundant editable tags and station rows
  from the feature tree, and visually separates reorder from commit controls while
  giving the fixed-feature state context. No control behavior, renderer, transport,
  route, or migration changed.
