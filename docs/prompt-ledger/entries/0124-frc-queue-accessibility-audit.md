# 0124 The FRC review queue's tap targets, a mark nothing draws, and a coin-desk link to a route that moved

- Issued: 2026-09-10
- By: Mr. Pina, three items handed on from ledger 0117's final report, routed as
  one lane beside 0118 (classroom), 0120 (gauntlet), 0122 (notebook) and 0123
  (the merge).
- Owns: `src/lib/frc/FrcReviewQueue.svelte` and `FrcReviewConsole.svelte`,
  `src/lib/marks/AdminMark.svelte`, `src/routes/coin-desk/+layout.svelte`, their
  tests and route specs, the generated regions of
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0124-*`, and its
  own `docs/history/` entry.
- Does NOT own: `src/lib/classroom/**` (0118), `src/lib/gauntlet/**` (0120),
  `src/lib/notebook/**` (0122). None overlaps; nothing to report against them.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0192
- Lands on: `integration` only. `main` is ledger 0123's, and this lane does not
  merge there.
- Status: pushed
- Branch: `claude/frc-queue-accessibility-audit-bk0ch8`, from
  `origin/integration` at `21b0801d`, because two of the three items exist only
  there.
- Notes: three items, the first the only real violation. ONE: the full harness
  pass on `integration` reports exactly two rows outside threshold, both the FRC
  review queue's controls on the merged admin console -- links at 18.4px and
  buttons at 26.2px, against `IDEA_INTERFACE_STANDARDS.md`'s 44px student floor
  and its 24px instructor-density floor, which 18.4px clears neither of. That
  standard's four-step resolution order is read first, and its rule that writing
  the number in a report is not a way to finish means this ends as a fix, as a
  decision entry with an owner, or as a handed-on item, and the session says
  which. TWO: `src/lib/marks/AdminMark.svelte` is drawn by nothing since 0117
  merged `/admin` into `/dashboard`; every import is found, and the file is
  deleted if and only if none exists. THREE: `/coin-desk`'s "Site Admins" link
  points at `/admin`, which now forwards to the roster panel rather than being
  its own app -- it works, so this is tidying: the link is repointed and the
  label made to match what the person arrives at. Baseline on `integration` is
  svelte-check 0 errors / 37 warnings at 31/5/1 and a full suite of 346 files /
  6822 tests; every claim in the prompt is ledger 0117's, from 2026-09-10, and
  the tree wins over it.
