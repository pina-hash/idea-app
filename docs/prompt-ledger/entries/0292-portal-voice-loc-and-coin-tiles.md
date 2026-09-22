# 0292 Voice navigation, a lines-of-code counter, and the two coin tiles
- Issued: 2026-09-22T00:00:00Z
- By: Lane D5, answering reports 11, 12 and 16.
- Owns: `src/lib/portal-apps.ts`, `src/lib/AppLauncher.svelte`,
  `src/lib/marks/CoinMark.svelte`, `src/lib/marks/CoinDeskMark.svelte`,
  `src/routes/+page.svelte`, `src/app.css` (the `.legacy-index` header block
  only), `vite.config.ts`, `src/lib/site-versions.ts`, one new module for code
  stats, a new `src/lib/voice/` and its mount in `src/routes/+layout.svelte`,
  `src/lib/site-manifest.ts` (read-only unless a label is wrong), matching
  `tests/`, `tools/browser-verify/routes/home-*.mjs`, a new
  `src/routes/dev/voice/`, `docs/prompt-ledger/entries/0292-*`.
- Migration permitted: no. None written.
  Highest on origin/main at issue: 0217. Starting sha `1ec2f640`, which matched
  `origin/main` exactly.
- Status: pushed
- Branch: `claude/new-session-avpli9`
- Notes: EVERY PROMPT CLAIM WAS CONFIRMED AGAINST THE TREE, including all four
  structural reasons on report 16, with one addition the prompt did not make:
  the two coin MARKS are already differentiated on purpose (`CoinMark` flips,
  `CoinDeskMark` strikes a `+`, and `CoinDeskMark`'s own header names the
  relationship), so neither was edited. The confusion was in the copy, which is
  where the fix went.
  REPORT 16 ANSWERED WITH COPY, and the two costs of the merged tile are named
  in `portal-apps.ts` beside the entries: reason 3 (a merged admin-only tile
  deletes the public Ledger card, which is worse than the problem) and reason 4
  (retiring `coin-desk`'s id drops every admin's pin, dragged position and
  usage count for the tool Mr. Pina himself uses most, which is exactly what
  the `dashboard` entry refused to do when `admin` merged into it). The shipped
  answer is parallel copy plus differing CTA verbs, and the shape is buildable
  later with the price known.
  REPORT 11 NEEDS NO AI AND NOTHING TO PAY FOR, which is said in the history
  entry in as many words because he has assumed otherwise twice. The recogniser
  is the browser's own, driven through the EXISTING `$lib/feedback/dictation.ts`
  (imported, never copied); what this bundle adds is the intent table.
  FOUR FILES OUTSIDE THE OWNS LINE, all reported in the history entry:
  `src/site-versions.d.ts` (the ambient declaration for the third virtual
  module, which has to sit beside its two siblings), `vitest.config.ts` +
  `tests/stubs/site-code.ts` (without a stand-in for that id the home page
  cannot be imported by any test, which would take the section-order and
  accent-mechanism suites down with it), and
  `tools/browser-verify/routes/voice*.mjs` (the prompt named `home-*.mjs`; the
  voice surface needs specs of its own and they cannot be home routes).
  `src/lib/site-versions.ts` was on the Owns line and needed no change.
  FIVE FILES OUTSIDE THE OWNS LINE, not four: `src/routes/dev/code-census/` is
  the fifth, and it is forced rather than chosen -- the readout is HIDDEN below
  768px (see below), and the browser pass runs every spec at 375 and 1440, so
  the panel cannot be measured from the home harness at one of the two widths.
  TWO DEFECTS FOUND BY VERIFICATION RATHER THAN BY READING, both in this
  bundle's own work, and both invisible to the instrument that should have
  caught them.
  (a) THE HEADER GREW, TWICE, AND THE SECOND TIME THE HARNESS HID IT. In
  `.header-right` it took the banner 125.5 -> 158.7 at 375. Moved to a
  `.header-left` group it measured 125.5 -> 125.5 on `/dev/home-order` and the
  browser spec agreed -- but that fixture is SIGNED IN, where the banner has
  already wrapped. On the real signed-out `/` at 375 it is 75.5 -> 115.1, and
  the arithmetic says no chip could fit: 343px inner, less a 104px emblem, less
  a 210px actions row, less the gap, leaves THIRTEEN PIXELS. The readout is
  gated above the breakpoint the banner already wraps at; swept at 15 widths on
  both fixtures, zero growth and zero overflow at all 30.
  (b) `recognizer={null}` FELL THROUGH A `??` TO THE LIVE BROWSER CONSTRUCTOR,
  so the no-support harness rendered a control that would have opened a real
  microphone -- GREEN in `tests/dom/` the whole time, because happy-dom has no
  `webkitSpeechRecognition` and the fallback answered null there too. The mount
  test now plants one on `window` as its positive control.
  WHERE A PHONE READER SHOULD GET THE READOUT IS LEFT TO MR. PINA rather than
  guessed at, with the measurement in the history entry.
