# 0062 VANGUARD: the backend does honour offset, so the board can page
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: the board overlay in `src/lib/legacy/vanguard/index.html`, `src/routes/vanguard/+server.ts`, `src/lib/vanguard-save.ts`, `src/lib/vanguard-history.ts`, `docs/VANGUARD_BACKLOG.md`, `tests/vanguard*`, `docs/prompt-ledger/entries/0062-*`, and its own `docs/history/` entry.
- Migration permitted: no. The backend is an Apps Script deployment outside this repo.
- Status: pushed
- Branch: `claude/vanguard-board-paging-sjx6uv`
- Notes: `docs/VANGUARD_BACKLOG.md` records the board's pagination as
  BLOCKED on a question this repository could not answer: whether the Apps
  Script backend honours `offset` at all. `fetchOnline(then, fail, offset)`
  accepts one and forwards `&offset=<n>`, four call sites pass none, and no
  LOAD MORE control exists.

  Mr. Pina supplied the backend source on 2026-09-05 and the answer is YES.
  `top(p)` reads `const offset = Math.max(0, Math.floor(+p.offset || 0))`,
  sorts descending, and returns `rows.slice(offset, offset + n)`. `n` is
  clamped to 500 and `TOP_N` is 10; the client's `BOARD_N` is 250.

  So the block is lifted and the work is client-side only.

  What the backlog says this actually costs a student: with more than 250
  scores on a mode, ranks 251 and below are off the board. A player below the
  cut IS shown, appended after a separator with a rank computed from the 250
  fetched rows, so a genuinely 400th-place player reads as 251st. That
  inaccuracy is the thing paging fixes, not the missing rows.

  ONE THING THE BACKLOG WARNS ABOUT AND IT IS THE WHOLE RISK:
  `fetchOnline` OVERWRITES `onlineBoard` rather than appending, so paging is
  a change at the call site as well as a new control. Getting that wrong
  replaces the board with page two instead of extending it.

  Deliberately excluded: the achievement-title broadcast, which needs a new
  column in the Scores sheet and a field in `submit` and `top`, so it is
  backend work Mr. Pina owns; and every gameplay item on the backlog.
