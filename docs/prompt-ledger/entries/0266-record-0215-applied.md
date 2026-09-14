# 0266 Record that 0215 was applied
- Issued: 2026-09-14T16:40:00Z
- By: Claude Code session
- Owns: `docs/migrations-applied/**`, `docs/prompt-ledger/entries/0266-*`, `docs/history/sharp-gauss-tpmw7s.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0215
- Status: pushed
- Branch: `claude/sharp-gauss-tpmw7s`
- Notes: Documentation only. No file under `src/`, `supabase/` or `tests/` was
  touched, and no other document was edited. The migration this records was
  written by ledger 0234 and applied by hand by Mr. Pina; this bundle neither
  wrote nor applied it.

## What it did

`supabase/migrations/0215_short_link_reserve_ideacad.sql` was applied to
production by Mr. Pina and `docs/migrations-applied/` had no record for it, so
`tests/db/migrations-applied-record.test.ts` failed its no-gaps assertion on
`main` and reddened every branch cut from it. Four earlier sessions correctly
refused to write the record on their own belief. Production has now answered,
so the record is written from that answer:
`docs/migrations-applied/0215-reserved-short-link-slugs-0234.md`, by
`tools/record-applied.mjs` and never by hand.

`tools/record-applied.mjs` resolved the authoriser itself through
`authorisingEntry`: `ledger: "0234"`, branch `codex/reserved-short-link-slugs-0234`.
This bundle appears only as `recorded_by_ledger: "0266"`, which is the split the
tool exists to keep -- `apply-migration.mjs`'s `appliesUnderLedger` greps
`^ledger:` to ask which bundle applied a migration, and stamping the recording
bundle there would make that question answer about the wrong lane.

## The one place the prompt's premise did not survive measurement

The prompt asked for a note saying the probe was hand-written **because**
`record-applied` could derive none for this migration. It can:
`node tools/record-applied.mjs 0215 --query` returns a probe for
`table public.app_short_link_reserved_moves` and exits 0, because the file is on
`origin/main` now and `verificationQuery` derives from `HEAD`. Writing the
stated reason down would have put a sentence in a permanent record that the
record's own "What a verification query would cover" section contradicts three
lines further on.

The note therefore keeps both things that were actually true and load-bearing --
that the router chat wrote the probe by hand, and that `open-lab NOT reserved`
is a deliberate negative control so the evidence shows the predicate
discriminates rather than answering `true` to everything -- and states the
derivation's real coverage (one object) instead of claiming there was none.
