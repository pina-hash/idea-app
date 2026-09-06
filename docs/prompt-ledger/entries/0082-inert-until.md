# 0082 A prepare step's `until` does nothing, and 71 spec files use that step
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `tools/browser-verify/run.mjs`, `tools/browser-verify/README.md`, an `until` in any route spec this bundle proves inert, `tests/browser-verify*`, `docs/prompt-ledger/entries/0082-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0186
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0070 spent most of a session chasing a flaky spec --
  one pass in two, always at 375, always on the first run after a cold
  `vite dev` boot -- and found the cause in the harness rather than in its
  own route:
  
    `run.mjs` judges an `evaluate` prepare step only on whether it THREW.
    An `until` written on one does nothing.
  
  So the keystrokes were landing on painted-but-unhydrated markup, and the
  step that was supposed to wait for hydration reported success without
  waiting for anything.
  
  `clickUntil` at line 216 passes `step.until` through and honours it. The
  `evaluate` branch beside it does not. **71 route spec files use an
  `evaluate` step.** Every `until` any of them carries has been inert since
  it was written, and each one reads in the source like a guarantee.
  
  0070 also reports a near miss worth keeping: its first fix was a
  storage-clearing prepare step that went green three times and was WRONG.
  Contexts are per-run so nothing leaked; the step was buying about 300ms of
  incidental delay, and its own output said "cleared 0 stale slot(s)" while
  passing. A fix that works for a reason nobody checked is the shape this
  repository has shipped several of.
  
  This is the eighth entry in the verification standard's list of green
  checks proving nothing, and the first where the instrument silently
  discarded a guard a spec author wrote on purpose.
  
  Deliberately excluded: every `src/` file; the counts block's own rules; and
  any route spec whose `until` this bundle does not prove inert.
