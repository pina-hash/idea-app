# 0059 The FRC quiz answer key is recoverable from option length
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: the quiz bank and its lint under `src/lib/frc/`, `src/routes/dev/frc/**`, `tests/frc-quiz*`, `tools/frc-quiz-bias.mjs` (new, conditional), `docs/frc/**`, `docs/prompt-ledger/entries/0059-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0181
- Status: pushed
- Branch: `claude/frc-quiz-bias-10avj9`
- Notes: The project's standing record states it plainly: across 140 items
  the longest option is correct 68% of the time against 25% at chance, and a
  student who knows nothing and always picks the longest passes one unit 57%
  of the time. The code is correct; the leak is in the content.

  A quiz that can be passed by measuring string length is not measuring what
  it says it measures, and the students most likely to find that pattern are
  the ones who most need the unit it gates.

  Rewriting distractors is Mr. Pina's and stays his. What is missing is
  everything around it: a current measurement rather than a remembered one, a
  per-item report he can work from, and a guard that fails if the bank gets
  worse.

  The record says a lint already fails if it worsens. Establish whether that
  lint exists, whether it runs, and whether it can actually fail, because a
  guard nobody has seen redden is a guard nobody has tested.

  Deliberately excluded: the words in any question or answer; every file
  outside `src/lib/frc/`; and the quiz engine itself, which is correct.
