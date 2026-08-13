# The legacy IDEA Coin ledger (retired 2026-08-12)

This directory is the archived source of the **Google Sheets / Apps Script
coin ledger** — the system that ran the IDEA Coin economy from its start
through August 2026, and everything in this repository that talked to it.

It is kept because it is IDEA history. Git history alone is not enough: these
files should stay browsable in the working tree by anyone who wants to know
how the coin economy actually worked before Supabase, or why a particular
decision in the current system is shaped the way it is.

> **These files are historical reference only.** They are not part of the
> build, they are not routed, they are not imported by anything, and they do
> not run. `docs/` is not served and is not on any import path, so a file
> placed here is inert by construction. **Do not reintroduce them into
> `src/` or `static/`.**

The paths below mirror the original repo layout, so the old structure stays
legible: `src/lib/server/coin-ledger.ts` here was `src/lib/server/coin-ledger.ts`
in the live tree.

---

## Why it was retired

The IDEA Coin economy was rebuilt in Supabase across migrations `0070`
onward. The consolidation ran in four phases:

- **Phase 1** — `/coin-desk` became a route group (the day-to-day admin
  logging tool, on the Supabase schema).
- **Phase 2** — migration `0084_coin_legacy_import.sql` plus the
  `/coin-desk/migrate` wizard imported the Sheets ledger's entire history
  into Supabase: **71 students, 216 transactions, 12 contracts**, name-keyed
  data mapped to emails, fully reconciled, idempotent and reversible.
- **Phase 3** — migration `0089_coin_public_ledger.sql` swapped the public
  IDEA Coin Ledger (`static/coins/index.html`) off the published Sheets CSVs
  and onto Supabase through the new `/api/coin/` namespace.
- **Phase 4** (this archive) — with nothing left depending on it, the old
  system was retired and moved here.

Supabase is the **sole system of record** for IDEA Coins. Every balance,
transaction, contract and role now derives from `coin_transactions` and the
tables around it.

---

## What each archived file did

### `src/lib/server/coin-ledger.ts`

The **one egress point**: the only module in the repository that knew the
Apps Script `/exec` URL. It lived under `$lib/server`, which SvelteKit
refuses to bundle into client code, so neither the endpoint nor the API key
could reach a browser.

- `callLedger(action, params)` attached the server-only key and returned the
  upstream body verbatim.
- `forwardableParams()` stripped any client-supplied `action` or `key`, so a
  caller could never smuggle in a second action or override the key.
- `PUBLIC_LEDGER_ACTIONS` was the read-only allowlist the public proxy was
  restricted to.
- `nameTokens` / `matchRoster` / `fetchRoster` resolved an authenticated user
  to exactly one ledger roster row by comparing name **token sets**, so the
  sheet's "Last, First" convention and Google's "First Last" agreed without
  either side being reformatted. Zero matches or several was a refusal, never
  a fallback to a client-supplied name.

### `src/routes/api/coin-ledger/*`

Four same-origin proxy routes, each asking a different question about the
caller. No browser ever called the `/exec` endpoint directly.

- **`teacher/+server.ts`** — the entry tool's single path for every call it
  made, reads and writes alike, gated on the signed-in user's
  `profiles.role`. That session check was the security boundary; the tool's
  4-digit PIN pad was a UI-only confirmation for shared classroom devices.
- **`public/+server.ts`** — no session (the coin leaderboard was public
  tier), restricted to the read-only allowlist.
- **`apply/+server.ts`** — role applications. It took **no `student`
  parameter**: the applicant was resolved from the caller's own session
  against the ledger roster, which is what closed an impersonation gap the
  2026-07 security audit found.
- **`signin/+server.ts`** — started Google OAuth for `static/coins/index.html`,
  which had no Supabase client of its own, using the server client so the
  PKCE verifier `/auth/callback` needs actually got stored.

### `src/lib/legacy/coin-entry.html` and `src/routes/coin-entry/+server.ts`

The teacher-facing coin entry tool, carried over verbatim from the old static
IDEA site, and the role-gated endpoint that served it to teachers only. This
was the **only write surface** of the Sheets economy: everything logged here
went to the Google Sheet and never to `coin_transactions`, which is why it
carried a red non-dismissible banner in its final months warning that
anything entered went nowhere the new system could see.

Its replacement is `/coin-desk`.

### `src/routes/coin-desk/migrate/*` and `src/lib/coin-desk/MigrateWizard.svelte`, `src/lib/coin-desk/migrate.ts`

The five-step import wizard (PULL, MAP, PREVIEW, COMMIT, VERIFY) that moved
the Sheets history into Supabase, and its pure parsing/reconciliation layer.
Its PULL step ran through `callLedger`, so it could not outlive the Apps
Script deployment — and it had already done its job: the import is committed,
reconciled and verified in production.

**The `0084` schema and every one of its RPCs are still live**, including
`coin_admin_rollback_import` and the verbatim batch snapshot in
`coin_import_batches.raw`. They are the archival record and the safety valve.
What changed is only how they are reached: **rollback and reconciliation are
now SQL-editor-only operations**, run by hand in Supabase, because the page
that used to drive them is gone.

### `static/coins/index.html`

The IDEA Coin Ledger **as it stood before the Phase 3 Supabase swap** —
recovered from git history at the commit preceding `dcd0cdc`. This is the
Sheets-era page: it read the two published-CSV URLs directly and called the
Apps Script for contracts and roles.

The live page at `static/coins/index.html` was **not** touched by the
retirement. It is the same file, same design, reading Supabase through
`/api/coin/` instead. This copy exists so the before-and-after is legible.

### `tests/coin-legacy-parse.test.ts`

Pinned the parsing layer against the real archived pull in
`docs/coin-economy/archive/` — 71/216/12 counts, all transaction types known,
universal zero-diff reconciliation, and the pattern generator against the
roster's real name shapes. It is archived alongside the code it tested, so it
no longer runs.

The sibling suite `tests/coin-legacy-import.test.ts` **is still live**: it
tests the `0084` SQL against a real embedded Postgres, and that schema stays.

---

## Environment variables (both retired)

Neither is read by anything any more. **Remove both from the Vercel project
environment.** They are recorded here so the archived code above stays
comprehensible.

- **`COIN_API_KEY`** — the server-only shared key attached to every ledger
  call. It rode as a **query parameter** named `key`
  (`COIN_API_KEY_PARAM` in `coin-ledger.ts`), not a header, because an Apps
  Script `doGet(e)` can only ever read `e.parameter` — it cannot see custom
  request headers at all. Until it was set, `ledgerConfigured()` was false
  and every `/api/coin-ledger/*` route answered 503, so the coin tools did
  not function. That fail-soft branch existed only because the Apps Script
  might be unconfigured, and it went with the rest.
- **`COIN_LEDGER_URL`** — an optional override for the deployed `/exec` URL,
  so the deployment could be rotated without a commit. The literal in
  `coin-ledger.ts` was the working default.

---

## Outside this repository

Two things are **not** in this archive and are deactivated separately, by
hand, outside the repo:

1. **The Apps Script project** (the coin ledger's `Code.gs` web app). Its
   deployment should be disabled so the `/exec` URL stops answering. The URL
   is permanently in this repo's git history, so disabling the deployment —
   not secrecy — is what actually retires it.
2. **The published Google Sheet** (the summary and transaction tabs that were
   published to the web as CSV). Un-publish it. Its final contents are
   preserved verbatim in `docs/coin-economy/archive/`.

## Not affected

**VANGUARD's Apps Script backend is a completely separate deployment** —
leaderboard, telemetry, feedback and suggestions — and stays live. It is a
different script id, reached from `src/lib/legacy/vanguard/index.html`, and
nothing in this retirement touches it.
