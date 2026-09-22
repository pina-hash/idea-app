# 0288 The five remaining grading-console asks
- Issued: 2026-09-22T00:00:00Z
- By: Lane D1, from Mr. Pina's five grading reports (an AI grade import plus
  hidden grading standards, a quick zero or incomplete, dictated feedback, a
  comment bank, and the rubric beside a ported HTML assignment).
- Owns: `src/lib/classroom/GradingConsole.svelte`, `grading-export.ts`,
  `grading-bulk.ts`, `transports.ts`, `assignment-spec.ts`,
  `RubricBuilder.svelte`, `RubricView.svelte`,
  `src/routes/classroom/[sectionId]/item/[itemId]/grade/+page.svelte`, new
  modules under `src/lib/classroom/`, `supabase/migrations/0219_*.sql`,
  matching `tests/`, one `tools/browser-verify/routes/` spec,
  `docs/prompt-ledger/entries/0288-*` and its own `docs/history/` entry.
- Migration permitted: yes, exactly one, number 0219.
  **Claims: NONE. No migration written, so 0219 is left free.**
  Highest on origin/main at issue: 0217. Starting sha `1ec2f640`, which is
  `origin/main` exactly.
- Status: pushed
- Branch: `claude/new-session-cf42g6`
- Notes: SHIPPED THREE OF THE FIVE (2, 3 and 5), and the three chosen are the
  three that need NO migration -- so this bundle deploys with nothing for Mr.
  Pina to paste and no ordering between the apply and the deploy. Reports 1
  (the AI grade importer and the hidden grading standards) and 4 (the comment
  bank) are LEFT, with reasons in the history entry; 4 is the one 0219 was for
  and it is released unclaimed rather than half-built.
  TWO PROMPT CLAIMS WERE WRONG AGAINST THE TREE, both on report 2 and report 5,
  and both in the direction that would have produced a worse change:
  (a) "Passing the `bulk` prop is the cheapest large win" is wrong -- `bulk`
  carries TWO capabilities and the console calls `bulk.loadAcross`
  unconditionally, so handing it to the per-section route turns that page into
  the cross-class page it already links to. The fix is to make `loadAcross`
  OPTIONAL, which splits the two one level in and keeps absence the mechanism
  at both.
  (b) Report 5's "measure the available width" found that the stated reason is
  stale AND that the harness cannot see it: `/dev/html-assignment-grading` does
  not set `--cr-measure-route`, so it measures 960px where the real route
  measures 100%. The 562px in the withholding comment is a harness reading.
