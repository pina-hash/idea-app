# 0005 Standards 4.17 and infrastructure: ledger mirror, decisions, status tool, derived numbers, CI on integration, Deploy button
- Issued: 2026-09-02 08:39 UTC (the time the session received it; the issuing chat stamped none)
- By: closeout chat for "Managing multiple FRC platform projects"
- Owns: `docs/standards/IDEA_instructions.md`, `docs/standards/IDEA_Chat_Handoff_Standard.md`, `docs/standards/REGISTER.md`, `docs/prompt-ledger/entries/**`, `docs/decisions/**`, `tools/idea-status.py`, `tools/browser-verify/README.md`, `tools/browser-verify/readme-counts.mjs` (new), `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` (new), `.github/workflows/README.md`, `CLAUDE.md` (one paragraph, named below), `package.json` (scripts only), `tests/derived-numbers.test.ts` (new), and your own entry under `docs/history/`.
- Migration permitted: no. Highest on origin/main at issue: 0169
- Status: pushed
- Branch: `claude/standards-workflow-setup-6awqu0`
- Notes: Two landing paths in one session. The three standards files and the
  register went straight to `main` in one commit (`e7ac4d5`), the established
  path for `docs/standards/`; everything else rides this branch and is swept
  into `integration` by the integrate workflow. This entry is the branch's
  first commit, so a chat that fetches the ledger sees the work as in flight.

  What the branch carries: entries 0002 to 0004 mirrored from project
  knowledge, this entry and 0006; `docs/decisions/` with the eleven decisions
  owed to Mr. Pina; `tools/idea-status.py` extended with decisions owed,
  prompts in flight across every ref, the applied-state probe block, the
  known-red harness findings, `--repo` and `--json`; a generated counts block
  in `tools/browser-verify/README.md` with `tests/derived-numbers.test.ts`
  guarding it; the `CLAUDE.md` migration-status paragraph replaced by a
  pointer to the tool; a scheduled and dispatchable CI run on `integration`;
  and `deploy.yml`, the one workflow that writes `main`.

  Deliberately excluded: any migration (none permitted), any file outside the
  Owns list, and any merge of this branch into `main`.
