# Legacy Sheets ledger: archived pulls

Verbatim snapshots of the old Google Sheets / Apps Script coin ledger, kept
as the committed archival record beside the migration system that imports
them (migration `0084_coin_legacy_import.sql` + the `/coin-desk/migrate`
wizard).

## Files

- `2026-08-11-summary.csv` -- the published summary sheet (one row per
  student: Name, Section, Wage, Awarded, Fines, Spent, Coin Balance,
  Paid Out, Bank Balance, Debt). 71 students at pull time.
- `2026-08-11-transactions.csv` -- the published transaction log (Date /
  Time, Name, Amount, Type, Reason; naive local timestamps, interpreted as
  America/Los_Angeles by the import). 216 rows at pull time.
- `2026-08-11-contracts.json` -- the Apps Script ledger's `contracts` action
  response, fetched through the public read-only proxy
  (`/api/coin-ledger/public?action=contracts`). 12 postings at pull time.
- `2026-08-11-contract-history.json` -- the `contractHistory` action
  response. Empty at pull time.

## Provenance and refresh rule

These files were fetched on 2026-08-11 straight from the same sources the
wizard's PULL step reads: the two published-CSV URLs (the constants in
`src/routes/coin-desk/migrate/pull/+server.ts`, carried over from
`static/coins/index.html`) and the coin-ledger proxy. They are a snapshot,
not a live mirror: the wizard always pulls fresh at migration time and
stores its own pull verbatim in `coin_import_batches.raw`, which is the
authoritative record of what was actually imported.

**If the wizard's live pull ever differs from these files (the sheet gained
rows after this snapshot), refresh this archive** by re-downloading the same
URLs and committing the new dated files beside these; do not edit these in
place. The wizard's PULL step shows this reminder with the live counts.
