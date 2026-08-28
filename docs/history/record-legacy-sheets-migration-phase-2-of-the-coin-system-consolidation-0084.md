---
title: "Legacy Sheets migration (Phase 2 of the coin-system consolidation, `0084`)"
date: 2026-08-11
branches: []
migrations: ["0003", "0069", "0071", "0075", "0084", "0087"]
subsystems: ["IDEA Coin economy"]
record_order: 9
---

## Legacy Sheets migration (Phase 2 of the coin-system consolidation, `0084`)

Migration `0084_coin_legacy_import.sql` (apply manually after 0083) plus the
real `/coin-desk/migrate` wizard: the old Google Sheets ledger's history (71
students, 216 transactions, the contract postings, as of the 2026-08-11 pull)
migrates into the 0070+ economy -- name-keyed data mapped to emails, fully
reconciled, idempotent, and reversible. It deactivated nothing at the time --
the Sheets system kept running beside it, and Phase 4 retired it later
(2026-08-12), archiving the wizard described below alongside it. **The 0084
schema and every RPC here are still LIVE**; only the wizard is gone, so
rollback and reconciliation are SQL-editor operations now.

- **DOCTRINE: RAW INSERTS, NEVER `coin_log_transaction`.** Imported rows are
  HISTORY, not new events, so `coin_admin_import_legacy` writes
  `coin_transactions` directly (the one deliberate exception to "every write
  funnels through the logging RPCs") and every live rule -- the debt lockout,
  Eating Pass strikes/revoke, Extra Credit's cap, the calendar caps -- stays
  a rule about what happens NEXT. Every imported row lands under one of four
  legacy categories seeded by this migration (`legacy_award` / `legacy_fine` /
  `legacy_purchase` / `legacy_payout`, kind-matched; payout is purchase-kind
  to match `coin_payout`), all `loggable = false, active = false`, so no live
  rule can ever read a legacy row as its own event: an old eating-pass
  purchase is a `legacy_purchase` row, which `coin_eating_pass_active()`
  (keyed on the literal `eating_pass` id) never sees -- the docs v3 item 9
  refund-only transition, enforced by construction -- and none of the four
  can ever be logged directly. Signs are applied by TYPE (Award /
  "Award - Held" credit; Fine / "Fine - Owed" / Purchase / Payout debit);
  per student the sheet's log sums exactly to its summary columns (verified
  live, 0 mismatches across all 71), so the imported balance is
  Awarded - Fines - Spent - Paid Out. The summary's Coin/Bank/Debt columns
  are old physical-coin bookkeeping and do not migrate. Naive sheet
  timestamps are interpreted as America/Los_Angeles and stored as the real
  `created_at`; `semester_key` is computed FROM THAT DATE via the existing
  `coin_semester_key(p_at)` -- 0070's function already takes a timestamptz
  parameter, so no second copy of the calendar logic exists (the column
  DEFAULT would have stamped today's key on every historical row).
- **Schema:** `coin_students` (email PK, the sheet name verbatim,
  `legacy_section`, `source`) is the name directory for students who may
  never sign in, and establishes THE STANDING COALESCE RULE for any surface
  showing a name for a coin email:
  `coalesce(coin_students.display_name, profiles display/full name, the
  email's local part)`. `coin_import_mappings` (legacy_name PK, email,
  status in unmapped/profile/pattern/hand/external) is the autosaved mapping
  DRAFT that survives multiple sittings; the mapping actually APPLIED at
  commit is snapshotted into the batch's report, so later draft edits never
  rewrite what a committed batch meant. `coin_import_batches` (raw jsonb =
  the verbatim pull, the archival record; committed_at/by; report) is one
  row per pull. `coin_contracts` gains a nullable `import_batch` uuid tag
  (claims need none: they cascade with their contract). All three tables are
  admin-read via RLS, zero client write grants; writes are the five
  `is_admin()`-gated SECURITY DEFINER RPCs (`coin_admin_save_import_mappings`,
  `_create_import_batch`, `_import_legacy`, `_rollback_import`,
  `_import_reconcile`).
- **Contracts import** maps Open -> open, In Progress -> open with a claim
  per contractor, Completed -> `completed_at = dateCompleted` (Cancelled ->
  `cancelled_at`, defensively), with `max_contractors = greatest(1, claim
  count)`, historical `created_at` from dateAdded, `section_id` null.
  **`coin_admin_complete_contract` is NEVER called** -- the completion
  payouts already exist in the imported transaction history and must not pay
  twice (test-pinned: zero `contract_completion` rows after import).
- **Idempotent and reversible.** Commit refuses (structured `{ok:false,
  reason:...}`) a batch already committed AND any batch while another
  committed batch exists un-rolled-back (serialized by an advisory lock), so
  the legacy history can only ever exist once; validation (unmapped or
  duplicate emails, unknown types, malformed rows) runs entirely before any
  insert, one transaction, nothing partial. `coin_admin_rollback_import`
  deletes exactly the batch's tagged rows (transactions by
  `meta->>'import_batch'`, contracts by column + cascading claims,
  `coin_students` by source) and clears committed_at -- untagged follow-ups
  (a refund correction, live purchases) survive, stated in its comment; this
  is the one delete path in the coin economy and it is scoped to the batch's
  own tags. `coin_admin_import_reconcile` is the VERIFY read: per student,
  expected (from the stored raw summary) vs actual -- **scoped to the
  batch's tagged rows**, deliberately, because real activity has been
  logging to this economy since `/coin-desk` launched and a whole-balance
  comparison would read any of it as a mismatch; the totals block reports
  the FULL live balances (circulation/debt, the eyeball-against-the-old-page
  numbers) separately.
- **The wizard (`MigrateWizard.svelte` + `migrate.ts` for the pure layer;
  ARCHIVED in Phase 4 under `docs/coin-economy/archive/legacy-system/`, since
  its PULL step ran through the retired Apps Script egress and the import it
  existed to perform is done):** five sequential
  steps on one stepper, resumable via the draft table + batch rows (a
  committed batch resumes at Verify). PULL is a server endpoint
  (`/coin-desk/migrate/pull/+server.ts`) fetching the two published CSV URLs
  (server-side constants carried from `static/coins/index.html`, which stays
  frozen) plus the contracts via the existing `callLedger` egress
  (`contracts` + `contractHistory`; an unconfigured ledger key degraded to
  zero contracts with a warning, never a block) -- **the endpoint re-checks
  `isAdmin` itself, because `+server.ts` routes never run the group's layout
  gate**. MAP is all names in one table (the union of summary, transaction,
  and contractor names -- exactly the 71 in the real data): profile
  token-set prefill (the resolveApplicant idea restated client-side in
  migrate.ts, since the ledger module was `$lib/server`), a pattern picker
  ({first}.{last} etc.) applied live to all still-unmapped rows, hand
  editing, per-row status chips, the 7 'External'-section rows as their own
  group with the domain rule relaxed per row; unmapped rows, duplicate
  emails, and wrong domains block advancing; autosave on change. PREVIEW
  recomputes expected vs parsed-transaction sums per student client-side (0
  diff required, red rows block), checks every contractor resolves, and
  shows the non-blocking flags panel (the three eating-pass purchasers with
  amounts, External rows, names in transactions but not summary and vice
  versa). COMMIT is one RPC call rendering the per-student results the
  bulk-RPC way, with rollback behind a two-step confirm. VERIFY runs the
  reconciliation RPC (green only at universal 0 diff), shows the totals
  strip, then the guided refunds panel: one click per flagged pass purchaser
  logs a `coin_admin_adjust_balance` of exactly the purchase amount with the
  note "Legacy eating pass refund - refund-only policy (v3 item 9)",
  disabling itself -- and the already-refunded detection re-reads
  `coin_transactions` by that note prefix, so the button stays disabled
  across reloads AND across a rollback + re-import (a double refund is
  unreachable).
- **The committed archive:** `docs/coin-economy/archive/` holds the
  2026-08-11 pull verbatim (both CSVs + the contracts/history JSON + a
  README with the refresh rule); the wizard's PULL step reminds that the
  archive should be refreshed if a live pull ever differs. The parse layer
  is additionally pinned AGAINST that real archived data by
  `coin-legacy-parse.test.ts` (pure, no DB; ARCHIVED in Phase 4 alongside the
  parse layer it tests, so it no longer runs -- the SQL suite below is still
  live): 71/216/12 counts, all
  types known, universal 0-diff reconciliation through the real helpers,
  the 40/50/50 eating passes, 7 External rows, and the pattern generator
  against the roster's real name shapes ("de la Loza, Joseph",
  "Jette-Kouri, Abraham", the partial "Colin").
- **Verified** two ways. `tests/coin-legacy-import.test.ts` (25 assertions,
  0001+0003+0020+0067+0069+0070+0071+0075+0078+0073+0077+0084 applied
  UNMODIFIED to a real embedded Postgres): sign mapping per type against the
  real inserts; `semester_key` = '2026-spring' on a May-2026 row with
  `created_at` round-tripping the exact LA timestamp (and provably not
  today's key); the legacy categories seeded retired and refusing
  `coin_log_transaction` even for an admin; an imported eating-pass purchase
  leaving `coin_eating_pass_active()` FALSE while a live pass purchase after
  import still works; the import succeeding for a net-negative student while
  the live debt lockout still refuses her purchases; contracts landing in
  their terminal states with claims, historical stamps, and ZERO
  `contract_completion` rows; reconciliation 0-diff batch-scoped past live
  activity; both idempotency refusals; rollback removing exactly 13/3/4/4
  tagged rows while an untagged refund and a live purchase survive, then a
  clean re-import reconciling to zero again; and the permission boundary
  (every RPC refusing a student, admin-only reads, no client writes for
  student OR admin, no anon EXECUTE). MUTATION-CHECKED both ways: breaking
  the sign mapping reddens 6 tests, making `legacy_award` loggable reddens
  7; migration restored byte-identical and re-verified green.
  Browser-verified in `/dev/coin-desk` (fake-ledger extended with in-memory
  mirrors of all five RPCs -- raw inserts tagged with the batch, never its
  own `coin_log_transaction` handler -- plus a fixture whose CSV text parses
  through the REAL migrate.ts parsers) through all five steps end to end:
  pull counts (8 students, 18 transactions, 3 contracts); profile matches
  prefilled via real token-set matching; the pattern chip filling all four
  unmapped rows live (hyphen and multi-token surnames correct) while
  external/profile rows stayed untouched; a hand edit flipping its chip; a
  wrong-domain and a duplicate-email entry each blocking Continue by name; a
  partial External name hand-mapped to any-domain; preview at universal 0
  diff with all four flags correct; commit rendering 8 per-student results
  (the net-negative student included); verify green with the batch-scoping
  visible (seeded live balances differ from imported sums, diff still 0);
  one refund click logging +40i&cent; and disabling, staying disabled
  through a re-run, a REMOUNT, and a rollback + re-import; rollback's
  two-step confirm removing exactly 18/3/4/8 with the untagged refund
  surviving; the 0084-unapplied fail-soft banner; and a regression pass over
  Log (the imported history resolving real legacy category names),
  Contracts, and Economy. Zero console errors and zero trapped window
  errors throughout; anonymous 404 on `/coin-desk/migrate` and the pull
  endpoint both curl-checked. `npm run check`: 0 errors, 0 new warnings.
  `npm test`: 253/253.
- **CORRECTION (2026-08-13): `0084` IS APPLIED IN PRODUCTION AND ITS BATCH IS
  COMMITTED.** The note that used to sit here -- "0084 has never been applied
  anywhere" -- was written before the import ran and is wrong: the real
  end-to-end run happened, the 2026-08-11 pull was committed, and the
  reconciliation passed, which is exactly why Phase 4 was able to retire the
  Sheets ledger. Read every "NOT verified: the live Supabase project" note in
  the coin sections as being about the migration IT sits under, not about
  0084. The rest of that placeholder-`.env` caveat still holds for anything
  0087 and later, which have not been applied from this repo.
- **SUPERSEDED BY `0100`: THAT COMMITTED BATCH IMPORTED THE WRONG NUMBERS, AND
  ITS RECONCILIATION COULD NOT HAVE NOTICED.** Everything above is an accurate
  record of what 0084 does; what it does is wrong now that `0096` has made
  "the balance" two numbers. It digitized ~474i&cent; of physical coins and
  destroyed 19i&cent; that had only changed form, and the "0 mismatches across
  all 71" verified above was computed with the same formula the import's own
  sign rule implements, so it agreed with itself. See "The legacy import,
  redone with media (`0100`)" below for the corrected mapping, the reasoning,
  and the hand-run remediation. **`coin_admin_import_reconcile` is redefined
  by `0100`**, so the reconcile described above no longer exists in that form.

### Weekly Wage pays the student's own tier (`0087`)

Migration `0087_coin_weekly_wage_tier.sql` (apply manually after `0086`)
closes a gap open since `0070`: `coin_wage_tiers` was real and
`coin_log_pay_raise` charged a real cost and persisted a real tier bump, but
nothing ever paid it out -- `weekly_wage` stayed a plain `flat` 1i&cent;
category regardless of tier, on every code path, generic or dedicated. A
2026-08 audit pass re-confirmed the gap was still there even once `/coin-desk`
existed (its Weekly Wage entry read `wage_tier` only to preview a Pay Raise's
cost, never to size a Weekly Wage award).

- **The stored `amount` stays the BASE rate; the tier multiplies it.** The
  source docs' Pay Raise pricing ("a permanent +1i&cent;/week against a
  ~130-week horizon") only makes sense if tier 1 pays the 1i&cent; base and
  each raise adds another 1i&cent;/week -- i.e. the rate IS `base x tier`, not
  a flat 1i&cent; regardless. Re-pricing the base later needs no schema
  change: `coin_categories.amount` for `weekly_wage` is still just "1".
- **Implemented as a special case inside the `flat` branch of
  `coin_log_transaction` (0070's generic RPC), not a new `pricing_model`, a
  `formula` category, or a dedicated RPC.** `isBulkEligible`
  (`src/lib/coin-desk/sections.ts`) only admits flat/range/variable for bulk
  logging, and `coin_bulk_log_section` (0073) reimplements no pricing at all
  -- it just calls `coin_log_transaction` once per student. Keeping Weekly
  Wage `flat` means a section-wide Weekly Wage log pays each student at
  THEIR OWN tier in one round trip, for free, which a single
  "amount typed once for the section" bulk model could never express
  otherwise. Mirrors how 0070 already special-cases `eating_pass` /
  `eating_violation` by category id in the same function.
- **No `coin_wage_tiers` row means tier 1**, and the function does not
  provision one on a Weekly Wage log -- the row is owned by
  `coin_log_pay_raise` alone; deriving "no row = base rate" is correct and
  needs no write.
- The RPC response gains a `wage_tier` field (null for every other category)
  so a caller can show what rate was actually applied without a second read.
  `src/lib/coin-desk.ts` exports `WEEKLY_WAGE_CATEGORY_ID` +
  `weeklyWagePreview()` so `LogView.svelte`'s flat-amount preview (single
  student and section mode) and the dev harness's `fake-ledger.ts` mirror the
  same math instead of re-deriving it.
- **NOT verified: the live Supabase project** -- same placeholder-`.env`
  caveat as every other coin-economy migration; 0087 has never been applied
  anywhere. Verified via `/dev/coin-desk` (`fake-ledger.ts`'s flat-pricing
  branch mirrors the tier multiply) and by reading the RPC body directly.

