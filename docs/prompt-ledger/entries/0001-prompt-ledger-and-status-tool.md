# 0001 Establish docs/prompt-ledger/ and add tools/idea-status.py
- Issued: 2026-09-01 01:05 UTC
- By: Cowork session "Claude computer use demo", lane 1
- Owns: `docs/prompt-ledger/**` and `tools/idea-status.py`
- Migration permitted: no. Highest on origin/main at issue: 0169
- Status: deployed
- Branch: `claude/prompt-ledger-setup-dxfpfa` at `57af18c`, merged into integration as `5f32c71`, deployed to main as `0ecb9c0` via PR #68 (each sha confirmed contained in `origin/main` on 2026-09-02 by the 0005 session)
- Notes: The first prompt issued through the automated lane, and the prompt that creates
  the directory it is recorded in. Placement only: four files, no logic to write, nothing
  outside the two owned paths.

  `docs/prompt-ledger/` is the live-fetchable half of the ledger. The project-knowledge
  copy at `claude/PROMPT_LEDGER.md` is read at chat open and therefore cannot see a chat
  that is already running, which is the case that produced two migrations claiming `0146`.
  This directory can be fetched mid-chat with `curl`, the same asymmetry `docs/standards/`
  relies on.

  `tools/idea-status.py` is the read-only status check: standing branches, main against
  integration in both directions, the register compared to its files, the migration
  high-water mark, and the two-author sweep across the possibly-unapplied range. It clones
  rather than calling the GitHub Actions API, which is sixty requests an hour on a shared
  container IP and routinely exhausted.

  Deliberately not included: any change to `IDEA_instructions.md`. One paragraph is owed to
  its freshness section, recording that a standards file which never reaches the mirror
  never reaches the test that would refuse it. It is held for the next pass that opens that
  file rather than shipped as its own deploy, and holding it is a decision rather than an
  oversight.
