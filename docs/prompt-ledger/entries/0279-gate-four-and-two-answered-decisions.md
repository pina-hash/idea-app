# 0279 Gate four and two answered decisions
- Issued: 2026-09-22T04:00:00Z
- By: Claude Code session (Sonnet 5), docs-only lane
- Owns: `docs/decisions/entries/34-gate-four-record-backed-answer.md`,
  `docs/decisions/entries/35-foundry-leaderboards-ranked-by-app.md`,
  `docs/decisions/entries/36-maps-outline-is-the-interior-face.md`,
  `docs/standards/IDEA_instructions.md`, `docs/standards/REGISTER.md`,
  `docs/prompt-ledger/entries/0279-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0217
- Status: issued
- Branch: claude/new-session-i70xs0
- Notes: Three decisions recorded, not reopened, per the router chat's own
  framing. Entry 34 answers gate 4 (the merge-checklist item that has stopped
  ten lanes) with a record-backed substitute for `tools/deploy-probe.mjs`
  where `DEPLOY_PROBE_URL` is unset; entry 35 records Mr. Pina's "ranked by
  app, no student ranking" answer on the Foundry leaderboard question and
  what it does and does not unblock; entry 36 records his delegated "use your
  best judgement" answer on Maps wall thickness (the outline is the interior
  face). `IDEA_instructions.md` moves 4.28 to 4.29 (item 4 of the canned lane
  ending only) and `REGISTER.md`'s row moves with it. All three decision
  entries carry a `Build:` line, per claim 2's own finding that only 6 of the
  prior 33 did.

  Two of the three claims handed to this bundle needed correction against the
  tree, both recorded in entry 34's own body: the "decision 31" attribution
  for gate 4 does not exist anywhere in this tree (grepped `IDEA_instructions.md`,
  `CLAUDE.md` and every decision entry; decision 31 is real, decided, and
  about IdeaCAD's scope, with nothing about migrations in it), and the
  substitute's checked window is not "every migration file since 0001" --
  `docs/migrations-applied/` only reaches back to `0193`, so a literal reading
  would print roughly 190 numbers as missing on every run forever. The entry
  resolves that by scoping the substitute to the migrations a merge would
  newly deploy (the delta against `main`), matching ledger 0114's own
  precedent, and by naming the pre-`0193` gap as a known, pre-existing hole
  this bundle does not fix.

  This bundle carries no migration and touches nothing under `src/`, `tools/`
  or `tests/`.
