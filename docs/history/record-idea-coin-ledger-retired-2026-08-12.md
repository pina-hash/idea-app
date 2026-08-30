---
title: "IDEA Coin ledger: RETIRED (2026-08-12)"
date: 2026-08-12
branches: []
migrations: []
subsystems: ["IDEA Coin economy"]
record_order: 5
---

The IDEA Coin economy ran on a **Google Sheets / Apps Script ledger** from its
start until August 2026. That system is **retired**. Its entire history -- 71
students, 216 transactions, 12 contracts -- was imported into Supabase under
`0084_coin_legacy_import.sql`, reconciled in production, and the public Ledger
was moved onto Supabase under `0089`. **Supabase is the sole system of record
for IDEA Coins.** There is no side-by-side state and no second ledger.

**That import is superseded by `0100` and must be redone by hand:** it ran
before `0096` split the balance in two, so it landed the whole history on the
digital side and read a withdrawal as a loss. The archived data is unchanged and
nothing needs re-pulling. See "The legacy import, redone with media (`0100`)".

- **The code is ARCHIVED, not deleted:**
  `docs/coin-economy/archive/legacy-system/` holds the whole retired layer
  unchanged, at its original relative paths -- `coin-ledger.ts` (the single
  Apps Script egress point), the four `/api/coin-ledger/*` proxy routes,
  `coin-entry.html` and its `/coin-entry` route, the `/coin-desk/migrate`
  wizard and its pull endpoint, a copy of the Ledger page as it stood BEFORE
  the Phase 3 Supabase swap, and the parse test that pinned the import. `docs/`
  is not served and is not on any import path, so those files cannot route, be
  imported, be served, or run. Its README explains what each one did.
  **They are historical reference only and must never be reintroduced.**
- **The DATA snapshot** is the sibling `docs/coin-economy/archive/` (the
  verbatim 2026-08-11 pull: both CSVs plus the contracts JSON).
- **`COIN_API_KEY` and `COIN_LEDGER_URL` are gone** from the code, from
  `.env.example`, and should be removed from the Vercel project env. Nothing
  reads them. What they did is recorded in the archive README.
- **`0084`'s schema and RPCs stay LIVE**, including `coin_admin_rollback_import`
  and the verbatim batch snapshot in `coin_import_batches.raw` -- they are the
  archival record and the safety valve. Only the surface changed:
  **rollback and reconciliation are SQL-editor-only operations now**, run by
  hand in Supabase, since the wizard that drove them is archived.
- **Two deactivation steps live OUTSIDE this repo** and are done by hand:
  disabling the Apps Script deployment (the `/exec` URL is permanently in this
  repo's git history, so disabling the deployment -- not secrecy -- is what
  retires it) and un-publishing the Google Sheet.
- **VANGUARD's Apps Script backend is a DIFFERENT deployment and stays live**
  (leaderboard, telemetry, feedback, suggestions, reached from
  `src/lib/legacy/vanguard/index.html`). Check the script id before touching
  any Apps Script reference.
- Background: `docs/audits/2026-07-security-audit.md`, findings F2, F3 and F11,
  all **closed by this retirement** -- including the residual out-of-repo
  question about whether `Code.gs` enforced the key, which a disabled
  deployment makes moot.


