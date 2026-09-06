# 0086 Land the tab the page has been waiting for
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `src/lib/classroom/nav.ts`, `ClassroomShell.svelte`, `src/routes/classroom/+layout.svelte`, `src/routes/dev/classroom-nav/**`, the tab lists in the two `/dev` classroom harnesses, `GreenlineDashboardCard.svelte` and its mount, `tests/classroom-nav*`, `tests/dom/classroom-nav*`, `tools/browser-verify/routes/classroom-nav*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0086-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0189
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0081 built three doors and deliberately withheld one. The
  duplicates tab would have pointed at `/classroom/[sectionId]/duplicates`,
  which on its base existed only on an unmerged branch behind an unapplied
  migration -- a 404 offered to every manager of every section, strictly
  worse than the typed URL it replaced.
  
  Instead it built everything that makes the tab a small change later: the
  exact patch written into `nav.ts` beside the function it edits, a harness
  state measuring the bar at the tab count that tab brings, and a test
  asserting the tab and the page land together IN EITHER DIRECTION, so
  whichever half arrives first is a red test rather than a silent 404 or a
  silent orphan.
  
  That test then did its job. On 2026-09-06 prompt 0085 merged twenty-four
  branches and `tests/classroom-nav-doors.test.ts` went red with both parents
  green: 0074 landed the page, 0081's tripwire saw it and demanded the tab
  nobody had written. It is the exact "red merge, green parents" case prompt
  0075 had reconstructed two hours earlier.
  
  0085 had to drop one half and could not fix what it merged. It first
  dropped 0074 -- and the contiguity test corrected it, because the migration
  series must be a contiguous prefix and dropping `0187` takes `0188` and
  `0189` with it. Three branches against one. So 0081 was held back and its
  branch still stands.
  
  Now the page is on `main` and `0187` is applied. The tab can land.
  
  Deliberately excluded: `src/routes/classroom/[sectionId]/duplicates/**`,
  which is prompt 0074's and settled; and anything about what that page does.
