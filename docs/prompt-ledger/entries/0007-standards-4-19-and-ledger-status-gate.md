# 0007 Standards 4.19 and Handoff 1.3 to the mirror, plus the ledger status gate in integrate.yml
- Issued: 2026-09-02
- By: router chat for IDEA portal work (successor to the 2026-08-30/31 router)
- Owns: `docs/standards/IDEA_instructions.md`, `docs/standards/IDEA_Chat_Handoff_Standard.md`, `docs/standards/IDEA_REPO_WORKFLOW_STANDARD.md`, `docs/standards/REGISTER.md`, `tests/workflows.test.ts`, `docs/prompt-ledger/entries/0007-*`, `docs/prompt-ledger/README.md`, `.github/workflows/integrate.yml`, `tools/idea-status.py` (conditionally, see notes), and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0170
- Status: issued
- Branch: assigned by the harness
- Notes: Two landing paths in one session, the same shape 0005 used. The three
  `docs/standards/` files go straight to `main` in one commit; everything else
  rides this branch.

  4.18 withdrew 4.17's Fable-by-default routing and never reached the mirror.
  4.19 adds the finding that made this prompt necessary: a branch count stopped
  measuring the queue once the integrate workflow began deleting a branch on
  green CI, because a session commits its ledger entry first and is swept
  minutes later while still running. On 2026-09-02 both prompts in flight read
  as zero standing branches. The fix is three-part and this bundle lands all of
  it: the doc rule (prompts in flight come from the ledger, never the branch
  list), the `Status` lifecycle on a ledger entry (`issued` while the session
  runs, `pushed` set by its final commit, using the four states the ledger
  README already defines rather than a fifth), and the matching gate in
  `integrate.yml`.

  Also corrects `IDEA_REPO_WORKFLOW_STANDARD.md` to 1.1: its `frc-app`
  `integrate.yml` conformance row said "yes, inert" when that workflow
  triggered on `push:` to `claude/**` and merged a green branch straight into
  `main` with no person in the path, and had done so once on 2026-08-30. And
  it ports `frc-app`'s `tests/workflows.test.js`, which exists because an
  EMPTY `${{ }}` interpolation inside a `run:` block invalidated that repo's
  whole `deploy.yml` on its first push. PyYAML parses such a file happily, so
  the defect is invisible to a YAML check.

  Deliberately excluded: any migration (none permitted), any merge of this
  branch into `main`, and any edit to a standards file other than the three
  named.
