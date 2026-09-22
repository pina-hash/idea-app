# 0278 The grading console: a false "Not opened", and three controls that existed only on the keyboard
- Issued: 2026-09-22T00:00:00Z
- By: Four of Mr. Pina's own feedback reports, filed 2026-09-12 and 2026-09-13 while grading (build `247dfc4`), routed as ledger 0278
- Owns: `src/lib/classroom/GradingConsole.svelte`, `src/lib/classroom/presence/state.ts`, `src/lib/classroom/presence/PresenceLine.svelte`, `src/lib/classroom/presence/transports.ts`, `src/routes/classroom/[sectionId]/item/[itemId]/grade/+page.svelte`, `src/lib/classroom/html-assignment/mount.ts`, one new or widened spec under `tools/browser-verify/routes/` plus the README counts block, `docs/prompt-ledger/entries/0278-*`, `docs/history/<branch slug>`.
- Migration permitted: no. Highest on origin/main at issue: 0217
- Status: pushed
- Branch: `claude/new-session-k7ykjw`
- Notes: Forbidden: `src/lib/shell/**` (lane L3 holds it), `src/lib/classroom/ClassView.svelte`,
  `src/lib/classroom/ContentComposer.svelte`, `src/lib/feedback/dictation.ts`, any migration.
  Four reports, one of them a data-correctness bug: a roster row read "Returned 18/20" with
  "Not opened" printed underneath it. Reproduced on FOUR independent paths before any change
  and fixed by giving a missing presence row three answers instead of one.

  Also touched, outside the Owns line, with the reason in each case:
  - `tests/dom/presence-console-mount.test.ts` -- the regression surface for the presence
    fix and the pager. It is the file that already owns this ground in both directions, and a
    second file asserting the same component's absences is the duplication that stops matching.
  - `src/routes/dev/presence/+page.svelte` -- the harness the new browser spec drives. A
    spec needs a route state, no existing harness could reach the four presence paths or a
    class large enough to measure names-visible, and this is the harness FOR the components
    this bundle owns. Every pre-existing URL renders byte-identically; the new states are
    query flags.
  - `tools/browser-verify/routes/grading-incomplete.mjs` and
    `tools/browser-verify/routes/html-assignment-grading-state-closed.mjs` -- both measured a
    panel this bundle collapses by default, so both now open it in `prepare` and measure the
    same things on the same elements. Widening a spec whose subject moved is the alternative
    to deleting its assertions.
  - `CLAUDE.md` -- one new rule, stated once: a derived instrument never contradicts the
    record beside it, and an instrument's silence is not a fact about a student.
