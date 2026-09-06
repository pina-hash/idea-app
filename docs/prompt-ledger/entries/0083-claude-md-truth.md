# 0083 Seven bundles have found CLAUDE.md wrong and none of them owned it
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `CLAUDE.md`, `tools/claude-md-check.mjs` (new), `tests/claude-md*` (new), `docs/prompt-ledger/entries/0083-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0186
- Status: issued
- Branch: assigned by the harness
- Notes: `CLAUDE.md` is read by every Claude Code session in this repository
  before it does anything. Seven bundles between 2026-09-05 and 2026-09-06
  found a sentence in it that is false, and every one of them correctly
  declined to edit it because the file was outside their ownership. Each
  wrote the correction into a history entry instead, where the next session
  will not read it.
  
  What has been reported, each to be verified against the tree rather than
  taken from this list:
  
  - 0055: the `claude/**` paragraph still says a session must never merge to
    `main` unconditionally, which contradicts decision 16.
  - 0060: the GAUNTLET AUTHOR TIER section names `gauntlet_practice_meter`.
    No such object exists; the function is `gauntlet_practice_pressure`, and
    the wrong name originates in `0155`'s own immutable comment.
  - 0071: the paragraph saying `maps-media`'s `image/*` wildcard admits SVG
    and that closing it "is a migration which no bundle has written yet".
    `0168` wrote it, replacing the wildcard with six raster types and raising
    if any SVG spelling survives.
  - 0071 and 0074 independently: the phantom-error figure says 11; both
    measured 13.
  - 0070: the draft-mirror convention it introduced wants a paragraph, and
    the repo's own rule says a new convention updates this file in the same
    change.
  - 0075: a red Integrate run may now mean the merged tree failed the suite,
    which is a rule a future session needs and which nothing states.
  - The applied-migrations paragraph is a snapshot and was wrong for a whole
    night on 2026-08-31; `CLAUDE.md` itself records that, and the paragraph
    is still a snapshot.
  
  A correction alone does not hold. Prompt 0060 hit the same shape with
  `docs/GAUNTLET.md`, found fifteen stale claims, and its answer was a
  correction PLUS a check, because a document corrected by hand once is stale
  again in a month. That document had already proved it.
  
  Deliberately excluded: every file this document describes. This bundle
  changes no behaviour.
