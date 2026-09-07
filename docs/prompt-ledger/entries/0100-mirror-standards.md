# 0100 Mirror the standards updates
- Issued: 2026-09-07
- By: router chat for IDEA portal work
- Owns: `docs/standards/IDEA_instructions.md`, `docs/standards/IDEA_VERIFICATION_ADDENDA.md`, `docs/standards/REGISTER.md`, `docs/prompt-ledger/entries/0100-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: pushed
- Branch: assigned by the harness
- Notes: `IDEA_instructions.md` to 4.23 and `IDEA_VERIFICATION_ADDENDA.md` to
  2.4, carrying what the 2026-09-05/06 run established. Both files were built
  from `origin/main` at `01cb9cb1` and their headers, newest changelog
  entries and `REGISTER.md` rows were checked to agree before delivery, which
  is what `tests/standards-version-header.test.ts` refuses a file for.
  
  4.23 adds five things to Claude Code prompting and two to Hard Rules: the
  three fetches every prompt now opens with, since five sessions each
  rediscovered the shallow clone independently and two mistook it for a tool
  defect; numbers allocated in the prompt rather than derived by a session;
  agents splitting inside a lane and never across; four-of-eight as the
  ordinary rate at which an open item turns out already shipped; a report to
  the router chat not being a record; never routing Mr. Pina through GitHub
  Actions; and the permanence of a cloud container being unable to reach the
  database.
  
  2.4 adds five ways a measurement lies, all observed in one week, plus the
  clean-tree rule for `verify:readme`, the red-merge-green-parents shape with
  its 47 cross-file tests, and `aria-disabled` disabling nothing beside the
  in-flight write guard that investigation actually needed.
  
  Deliberately excluded: every other standards file; and any change to the
  claude.ai project's own instruction text, which carries no version header,
  is not mirrored here, and is Mr. Pina's to paste.
