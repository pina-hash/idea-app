# 0295 Fold the five migration branches into one, record them, and deploy

- Issued: 2026-09-22T00:00:00Z
- By: Claude Code session
- Owns: the merge of five `claude/**` branches, `docs/migrations-applied/**` (four
  records, tool-written), `docs/prompt-ledger/entries/0295-*`,
  `docs/history/<this branch>.md`; `classroom-updates.json` and
  `tools/browser-verify/README.md` / `measured/*.json` for conflict resolution only
- Migration permitted: none written; burns two declined numbers. Claims: 0219, 0222
- Status: pushed
- Branch: `claude/new-session-zsum4t`
- Notes: No SQL authored and no file under `src/`, `supabase/` or `tests/` edited by
  hand; everything there arrived through the five merges.

## Why

Five lanes each wrote one migration at a router-assigned number (0218, 0220, 0221,
0223, 0224). Each branch's own tree has holes below its number that belong to its
siblings, and CI's shallow checkout sees no remote claims, so
`tests/db/migration-0177-tombstone.test.ts` is red on every one of them forever and
`integrate.yml` never sweeps any. Folding them into one tree closes every hole
except the two numbers nobody will ever use.

## The two burned numbers

- **0219** was allocated to ledger 0288 and released unused.
- **0222** was allocated to ledger 0291, which was withdrawn and replaced by lane E,
  which now uses 0225.

This is the `0190` / `0191` precedent, where ledgers 0092, 0093, 0098 and 0099
claimed numbers that never landed. No tombstone `.sql` is written for either: a file
at or above 0193 would need its own applied record, i.e. another hand paste for a
migration that does nothing.
