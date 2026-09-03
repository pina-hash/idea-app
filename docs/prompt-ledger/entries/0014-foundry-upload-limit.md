# 0014 Raise the IDEA Foundry upload limit
- Issued: 2026-09-02
- By: router chat for IDEA portal work
- Owns: the `FOUNDRY_LIMITS` constant in `src/lib/foundry/preflight.ts`, its three test files, `supabase/migrations/0173_*.sql` (conditional), `docs/prompt-ledger/entries/0014-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0173, only if the bucket needs an explicit limit. 0171 reserved for 0011, 0172 for 0013. Highest on origin/main at issue: 0170
- Status: pushed
- Branch: claude/foundry-upload-limit-mlg0eb
- Notes: A student hit the cap and reported it as "75mb limit". Today
  `maxZipBytes` is 50 MB and `maxTotalBytes` is 75 MB unpacked.

  The binding constraint is NOT storage. `foundry-uploads` declares no
  `file_size_limit` so it inherits the project ceiling, and `0133` already
  sets a classroom bucket to 200 MB, so that ceiling is at least 200 MB. The
  binding constraint is FUNCTION MEMORY during unpack, which `preflight.ts`'s
  own comment says the byte caps are gated on. Raising the number without
  establishing that ceiling trades a clean refusal for an out-of-memory
  crash, which fails worse.

  Deliberately excluded: `maxFiles`, which is gated on function duration
  rather than memory and is a different axis; and any change to what the
  preflight checks.
