# 0060 GAUNTLET's reference says it is unreliable and it is right
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `docs/GAUNTLET.md`, `docs/GAUNTLET-DESIGN.md` if the audit finds it wrong, `tools/gauntlet-doc-check.mjs` (new), `tests/gauntlet-doc*` (new), `docs/prompt-ledger/entries/0060-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0181
- Status: issued
- Branch: assigned by the harness
- Notes: `docs/GAUNTLET.md` carries a freshness header saying a claim in it
  is a lead rather than a fact, because it was found stale in eight places on
  2026-08-29 including every mention of teachers. That header is honest and
  it is also an admission that the document has stopped being usable: a
  reference a reader must independently verify is a reference that costs more
  than it saves.

  Measured 2026-09-05: the repository holds 42 GAUNTLET migrations and the
  document's migration table has 22 rows. Its own header says it stopped
  being maintained after `0027` and stood unchanged through ten later
  migrations. Twenty are missing.

  GAUNTLET is a large subsystem, 32 files under `src/lib/gauntlet/`, and it
  has had no attention this week while eleven bundles worked elsewhere.
  Whoever opens it next reads this document first.

  The fix is not a rewrite. It is a correction plus a check, because a
  document corrected by hand once is a document stale again in a month, and
  this one has proved that.

  Deliberately excluded: every file under `src/lib/gauntlet/` and
  `src/routes/gauntlet/`, and every migration. This bundle changes no
  behaviour, which is what makes it safe beside five other lanes.
