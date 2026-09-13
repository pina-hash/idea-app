# 0205 Seven rules earned 2026-09-13, written into the two files that own them

- Issued: 2026-09-13
- By: router chat
- Owns: `docs/standards/IDEA_instructions.md`,
  `docs/standards/IDEA_VERIFICATION_ADDENDA.md`, `docs/standards/REGISTER.md`,
  `docs/prompt-ledger/entries/0205-*`, and its own `docs/history/` entry. NO OTHER
  FILE.
- Migration permitted: no. **Claims: none.**
- Status: issued
- Branch: `claude/dazzling-ramanujan-i2hry6`, branched from `origin/integration` at
  `78516fa`.
- Notes: Standards-only. Nine rules earned on 2026-09-12 and 2026-09-13 land in the
  file that owns each: two in `IDEA_VERIFICATION_ADDENDA.md` (rules 39 and 40, on a
  probe that reports through `raise notice` and on a probe that examined nothing), and
  seven in `IDEA_instructions.md` (a prompt's migration range going stale, a manual
  instruction giving the URL rather than a route through the menus, a push being a
  build, a decision entry's status line being a claim, and four communication rules
  Mr. Pina stated directly). No new file: every rule is written in the owning file's
  own voice with a changelog entry, and `REGISTER.md`'s rows move in the same commit
  because `tests/standards-version-header.test.ts` refuses a register row that
  disagrees with the file it names.

  **Ledger 0204 owns the Vercel audit and the verification SQL.** Its history entry and
  its audit were not on `origin/integration` at branch time, so the push-is-a-build
  rule points at that audit by name and marks its figures as 0204's claim rather than
  restating them as measured here. This session's own checkout is SHALLOW, so it cannot
  re-derive a commit count at all, which is verification rule 32 arriving in the middle
  of writing rule 38's neighbours.

  **The duplicate check ran three ways and all three came back clean**: no
  `docs/prompt-ledger/entries/0205-*` on `origin/integration` or `origin/main` (highest
  is `0203`), no commit subject on any ref naming ledger `0205`, and no document
  anywhere naming `ledger 0205`, `prompt 0205` or `entries/0205`. Every `0205` string
  already in the tree is the MIGRATION `0205`, which is a different sequence.

  **Both standards files were fetched with `git clone`, never `curl` on
  `raw.githubusercontent.com`**, and the identity check passed: the clone's copies are
  byte-identical to the working tree's, at `IDEA_instructions.md` 4.26 and
  `IDEA_VERIFICATION_ADDENDA.md` 2.5, which is what the prompt said the mirror held.
  The project-knowledge copies at 4.24 and a self-inconsistent 2.4 are stale copies and
  not a fork; nothing from them is merged in.
