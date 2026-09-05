# 0036 A test that fails at midnight is a test nobody can trust at noon
- Issued: 2026-09-04
- By: router chat for IDEA portal work
- Owns: `tests/db/classroom-hall-pass-limits.test.ts`, a clock helper under `tests/db/helpers/` if the fix wants one, `tests/classroom-hall-pass*.test.ts`, `docs/prompt-ledger/entries/0036-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0178
- Status: pushed
- Branch: `claude/hall-pass-wall-clock-test-xmetyb`
- Notes: Six tests in `tests/db/classroom-hall-pass-limits.test.ts` fail
  between roughly 23:00 and 01:00 America/Los_Angeles and pass the rest of
  the day. Prompt 0034 proved it three ways, including reproducing the same
  six failures on unmerged `origin/integration` in a detached worktree.
  Prompt 0035 hit them again at 00:58 Pacific.

  On 2026-09-04 it stopped being a nuisance and became a blocker: three
  branches went red on CI, including both branches carrying the pipeline
  automation, because their CI happened to run inside that window. A red
  branch is not swept, so nothing merged, so the integrate push was discarded
  and the deploy stayed blocked. The automation approved to remove Mr. Pina's
  manual steps could not land because of a clock.

  The cause is the file's own stated rule, at line 21: "THE CLOCK IS FAKED BY
  MOVING THE ROWS, NEVER BY MOVING `now()`." A pass's age is
  `now() - opened_at`, so the fixture backdates `opened_at` by 60 to 90
  minutes. Near midnight that lands on the PREVIOUS Los Angeles day, and the
  cap the tests assert is counted per LA day, so `used_today` reads 0.

  The rule is not wrong. It is the reason these tests exercise the real RPCs
  against a real clock instead of a stubbed one. What is wrong is that a
  fixture positioned RELATIVE TO NOW cannot also guarantee WHICH DAY it lands
  on, and two of the three limits are day-scoped while the third is
  age-scoped.

  Deliberately excluded: `0174` and every hall pass RPC; the limits
  themselves; and any change to what the tests assert about the product.
