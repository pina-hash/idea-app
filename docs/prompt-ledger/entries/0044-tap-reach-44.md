# 0044 A class that promises 44px and delivers 16, and every surface that trusted it
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: the `.tap-reach-44` definition, `SpecRenderer.svelte`, the `tapReach` probe in `tools/browser-verify/checks.mjs`, `tools/browser-verify/routes/spec-table*.mjs`, the generated regions of its README, `tests/classroom-spec-table*`, a decision entry if 2.12 requires one, `docs/prompt-ledger/entries/0044-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: pushed
- Branch: `claude/tap-reach-44-class-bug-fschcn`
- Notes: Prompt 0043 measured `button.info-tip-trigger.tap-reach-44` and found
  its hit-tested reach runs 16.4 to 42.4 and NEVER 44. The class is named for
  a promise it does not keep.

  That matters far past one button. `.tap-reach-44` is the mechanism this
  repository reaches for whenever a control cannot be painted at 44px, and
  prompt 0025 used it to bring the profile menu to the floor across 69 pages.
  If the class delivers less than it says, every surface that used it is
  unmeasured rather than passing, and the reports that said otherwise were
  reading the class name rather than the geometry.

  0043 also left two measured violations on the same surface: an
  `input[type=checkbox]` at 13x13 inside a 23px label, under the absolute
  floor, and a `textarea.cell` at 33px. Under 2.12 those have exactly three
  endings and "recorded in a report" is not one of them.

  And 0043's own reach probe was over-permissive on its first pass: it counted
  a plain ancestor `td` as a hit. A probe that scores a miss as a hit is worse
  than no probe, because everything it reports is a pass.

  Deliberately excluded: `IDEA_INTERFACE_STANDARDS.md`, whose 2.12 clause this
  bundle is the first to work under; and every surface outside `SpecRenderer`,
  which is a report rather than a fix.
