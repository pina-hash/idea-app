# 0017 Land the five standing branches into integration
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: the merge of five branches into `integration`, the conflict resolutions it requires, one regeneration of the counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0017-*`, and its own `docs/history/` entry.
- Migration permitted: no. 0171 to 0174 are on main and applied.
- Status: pushed
- Branch: `claude/land-five-branches-integration-aw487k`, branched from `origin/integration` at `22084e4`.
- Notes: Five finished branches all pass CI and none has been swept, because
  every one of them conflicts on `tools/browser-verify/README.md`. Each
  regenerated the counts block against its own tree, each wrote different
  numbers into the same lines, and the automation is correctly refusing five
  mutually exclusive edits to one generated file.

  This is decision 12 arriving as a blockage. A generated block committed
  per-branch serialises every branch that adds a route spec. Fixing that is
  a separate bundle; this one only unblocks the queue.

  `claude/maps-editor-grants-2ktnt3` carries two real code conflicts on top,
  in `ShelfEntry.svelte` (1 hunk) and `transports.ts` (2 hunks), because
  prompt 0008's maps work is already in `integration` and 0013 touched the
  same files. Both are correct and both must survive.

  Deliberately excluded: any feature change, any migration, any fix to a
  defect a merge reveals, and the counts-block architecture itself.
