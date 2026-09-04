# 0028 Land the four standing branches into integration
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: the merge of four branches into `integration`, the conflict resolutions it requires, one regeneration of the counts block, `docs/prompt-ledger/entries/0028-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0175
- Status: issued
- Branch: assigned by the harness. BRANCHED FROM `origin/integration`.
- Notes: Four finished branches stand. All four conflict on
  `tools/browser-verify/README.md` and two also conflict on
  `classroom-updates.json`.

  The README conflicts are expected and are now cheap: prompt 0019 split the
  block so the static region is a pure tree read with no date and no sha, and
  prompt 0021 measured the resolution at 0.201s. This bundle is the second
  test of that.

  `classroom-updates.json` is a NEW conflict source and a different kind.
  It is one shared array and two bundles appended to its tail, so git sees
  two edits to the same lines. Unlike the counts block, NEITHER SIDE IS
  DISCARDABLE: both entries are real and both must survive. This is a content
  merge, not a take-one-side.

  `claude/two-live-reachability-defects-2tajpx` already merged
  `claude/browser-harness-truthfulness-l4zk0b` into itself, deliberately,
  because it owned four of the same five spec files. Merging 0025 therefore
  brings 0023 with it, and the order below accounts for that.

  Deliberately excluded: any feature change, any migration, any fix to a
  defect a merge reveals, and the dead branch
  `claude/idea-maps-public-viewer-hxz2cx`, whose tip `integration` already
  contains and which only Mr. Pina can delete.
