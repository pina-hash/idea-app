# 0128 Port `idea100-blade-01` against the HTML-assignment contract, and report where the contract breaks

- Issued: 2026-09-10
- By: Mr. Pina, as the fourth of four parallel lanes building the HTML
  assignment effort against one normative contract. Ledger 0126 owns the
  bridge, the frame component and the `/hx/[docId]` serving route; 0127 owns
  the manifest and store modules; 0129 owns the rubric module. This lane owns
  the FIXTURE, and its job is to find out whether the contract survives
  contact with a real document.
- Owns: `src/routes/dev/html-assignment/fixtures/**`,
  `tests/html-assignment-port*`, `docs/prompt-ledger/entries/0128-*`, and its
  own `docs/history/` entry. It owns NO file another lane owns, and
  specifically NOT `src/lib/classroom/html-assignment/**` or
  `src/routes/hx/**`.
- Migration permitted: no. Claims: none.
- Lands on: `integration`, via the branch below. Not `main`.
- Status: issued
- Branch: `claude/html-assignment-manifest-contract-8xazmp`, branched from
  `origin/integration` at `fd8e136e`.
- Notes: a porting bundle whose real deliverable is a findings list.

  **THE SOURCE FILE IS LIVE STUDENT WORK AND IS NOT TOUCHED.**
  `src/lib/legacy/assignments/idea100-blade-01.html` is the IDEA100
  assignment students are working in right now. This lane COPIES it into
  `src/routes/dev/html-assignment/fixtures/` and ports the copy. A defect
  found in the original is reported and not changed.

  **THE PORT IS MECHANICAL, NOT A REWRITE.** Author the `idea-manifest`
  block for all six modules; delete `saveToStorage`, `loadFromStorage`, the
  30-second autosave interval and the `__IB_DATA__` boot block, because
  `localStorage` throws in an opaque origin; delete `downloadHTML` and the
  Download with Data control, because submission stops being a download;
  route the sketch uploader's `FileReader` result to `idea:image` instead of
  an array. Every widget, counter, demo and print rule is left alone.

  **MODULE 05's RUBRIC IS THE AUTHORING JOB.** Its three criteria are flat
  rows worth 2, 1 and 2; the contract requires three or four LEVELS per
  criterion. The levels this bundle authors did not exist before it and are
  stated, with their basis, in the history entry.

  **THE FINDING OUTRANKS THE PORT.** Three lanes are building against this
  contract right now. Anywhere it is awkward, insufficient or wrong is
  reported loudly and is not worked around silently, and the contract is not
  edited locally.
