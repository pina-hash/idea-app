# 0234 Derive reserved short-link slugs from the top-level route tree

- Issued: 2026-09-14
- By: Codex cloud task
- Owns: `src/lib/server/short-links.ts` (or wherever `RESERVED_SLUGS` lives -
  find it), `supabase/migrations/0215_*`, its tests,
  `docs/prompt-ledger/entries/0234-*`, `docs/history/<yours>`.
- Migration permitted: yes. Claims: 0215. Highest on origin/main at issue: 0214
- Status: pushed
- Branch: `codex/reserved-short-link-slugs-0234`, branched from the supplied working tree.
- Notes: Add every missing top-level application route to the short-link reservation
  sweep and derive the reservation set from the route tree when feasible. Migration
  0215 keeps the RPC's database guard equal to the browser mirror and conditionally
  moves, records, and reports an existing collision without deleting it.
