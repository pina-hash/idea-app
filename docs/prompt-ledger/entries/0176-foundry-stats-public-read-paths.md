# 0176 Foundry telemetry: decision 07 answered public, in two layers

- Issued: 2026-09-12
- By: router chat
- Owns: the Foundry telemetry read paths and stats surfaces, `tests/db/foundry-stats*`,
  `tests/dom/foundry-stats*`, `docs/prompt-ledger/entries/0176-*`, and its own
  `docs/history/` entry. NO MIGRATION.
- Migration permitted: no. Claims: none. Highest landed migration at issue: 0202
- Status: issued
- Branch: `claude/inspiring-dirac-wtoe9z`, branched from `origin/integration` at `eef6e851`
- Runs in parallel with: ledgers 0171 through 0175. 0175 owns the Foundry CARD and gallery
  components and neither is touched here.
- Notes: DECISION 07 IS ANSWERED, against the default this assistant would have picked.
  Mr. Pina wants Foundry stats FULLY PUBLIC in two layers -- every student sees their OWN
  stats for any app they played ("if I play twenty hours of cookie clicker I should see my
  playstats"), and totals aggregated across everyone are public. AUDIT FIRST: does
  per-player playtime exist in the database at all, or is only an aggregate stored? That
  question decides whether this is a read-path change or a data-collection change. If the
  data is not collected, STOP and report what is missing and what collecting it would
  cost; do not start collecting telemetry in a bundle scoped to exposing it. If it exists,
  widen the read path and prove the boundary: A STUDENT MUST NOT SEE ANOTHER NAMED
  STUDENT'S PLAYTIME, with a signed-in peer control the way ledger 0152 proved presence
  isolation.
