# 0023 Make the browser harness tell the truth about its own findings
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: seven route specs under `tools/browser-verify/routes/`, `_shared.mjs` if a fix belongs there, the harness page's own controls in `src/routes/dev/pathways/+page.svelte`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0023-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0174
- Status: pushed
- Branch: claude/browser-harness-truthfulness-l4zk0b (from origin/integration a7cd032)
- Notes: Every prompt written in the last two days has carried a sentence
  telling the session which browser findings are "known and not yours". Five
  of them have. A standing finding that every bundle must be warned about is
  not a finding, it is noise the instrument produces, and it is training
  every session to skim the one list that should be read closely.

  Four rows have stood for weeks: `/dev/pathways` tap-target at 375 and 1440,
  and `horizontal-scroll` on `/dev/coins` and `/dev/coins-signedin-1` at 375.
  Two specs are documented flakes: `/dev/notebook` at 375 preps with a fixed
  timeout then forces a click, and `/dev/gauntlet-shell-countdown` at 1440
  reads an overlay that has already finished counting, measured at 0, 3 and 3
  findings across three consecutive runs.

  And prompt 0018 found that `classroom-interaction-case-fresh` DOES NOT
  REDDEN when `collapseWhen` is ignored outright, which is the exact wrong
  fix it was built by prompt 0012 to refuse. The fixture answers nothing, so
  every signal is already false on arrival and the check cannot separate
  honouring a false signal from ignoring one. The behaviour is guarded by ten
  assertions across four vitest files, so nothing is unprotected; the browser
  control is simply vacuous. 0018 reported it rather than editing its own
  oracle, which was correct.

  Deliberately excluded: every file under `src/lib/`. If a finding is a real
  product defect it is reported with evidence and left for its owning lane.
