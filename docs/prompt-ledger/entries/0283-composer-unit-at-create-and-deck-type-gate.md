# 0283 A unit at creation time, and the deck box that accepts anything

- Issued: 2026-09-22T00:00:00Z
- By: Lane N4, from three of Mr. Pina's reports -- 2026-09-10 and 2026-09-12
  asking to choose a unit folder while creating an assignment rather than
  always landing unfiled, and 2026-09-11 on zip files being assumed to be
  presentation decks.
- Owns: `src/lib/classroom/ContentComposer.svelte`,
  `src/lib/classroom/composer-staging.ts`, `src/lib/classroom/classroom.ts`
  (`ItemInput` and `createItem` only), `src/lib/classroom/transports.ts`,
  `src/lib/classroom/deck.ts`,
  `src/routes/classroom/[sectionId]/+layout.svelte` (the composer mount only),
  `supabase/migrations/0218_*.sql`,
  `tests/classroom-composer-staging.test.ts` and the matching `tests/db/`
  coverage, `docs/prompt-ledger/entries/0283-*`, and its own `docs/history/`
  entry.
- Migration permitted: yes, exactly one. Claims: 0218.
  Highest landed on origin/main at issue: 0217. `node tools/migration-claims.mjs`
  reports `next free 0218` and names 0218 in neither the claimed-not-landed
  list nor the holes list.
- Status: issued
- Branch: `claude/new-session-nfgovx`
- Notes: (filled in at the end of the session)
