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
- Status: pushed
- Branch: `claude/new-session-nfgovx`
- Notes: TWO PROMPT CLAIMS WERE WRONG AGAINST THE TREE AND BOTH ARE SCOPING
  ONES. (1) Claim 2 describes creation as having "no channel at any of the
  THREE layers" and names the composer, `ItemInput`/`createItem`, and the RPC.
  There are FOUR: `createItem` does not call `classroom_create_item`, it POSTs
  to `src/routes/api/classroom/item/+server.ts`, which exists because the item
  body is sanitized server-side. That route is on no Owns line, and without it
  a unit cannot reach the database at all -- the picker would have been a
  control that silently does nothing, which is the failure this bundle exists
  to remove. It was edited, minimally and in the file's own idiom (one body
  field, one conditional argument, one degrade rung mirroring the existing
  `formatting_dropped` one), and is reported as the single scope boundary
  crossed. Nothing else in the repo touches it: no `claude/**` or `codex/**`
  branch has a diff against it, and `origin/integration` had no classroom delta
  at all. (2) This bundle's own first draft asserted that 0176 left
  `classroom_create_item` anon-executable; it had not, because `create or
  replace` at an UNCHANGED signature preserves the ACL, so 0137's sweep
  survived. That is exactly why a NEW signature needs its own revoke, and 0218
  names the roles per `0166`. Claims 1, 3, 4, 5, 6, 7 and 8 are all correct as
  written; claim 5 understates nothing -- `stagedDeckIssue` really was
  `deckUploadSizeIssue(file.size)` and nothing else.
  AUDIT STEP 3 DECISION: a wrong `p_unit_id` RAISES rather than returning
  `{ok:false, reason:'wrong_course'}`. Same RULE as 0111 (an `exists` over the
  target sections' courses), different SHAPE, because this function's return
  value carries the new item's id and a second return shape is
  indistinguishable to its caller from a failure to create -- and because every
  other user-correctable refusal on `classroom_create_item` is already a raise
  the composer renders verbatim. AUDIT STEP 4 DECISION: ONE value, never one
  per section, because `unit_id` is a column on the canonical record; a
  multi-course post files into a unit of one course and reads as unfiled in the
  other, which is 0111's own accepted degradation. AUDIT STEP 5 DECISION: the
  zip gate went in `deck.ts` as `DECK_ACCEPT` + `deckUploadTypeIssue` +
  `deckUploadIssue`, not in `composer-staging.ts`, because the item page's
  `DeckPanel.svelte` is a second door that needs the same answer.
  TWO FILES BEYOND THE OWNS LINE, both reported in the history entry: the API
  route above, and `tests/classroom-item-unit-route.test.ts` (new), which is
  the only place the route's degrade rung and the composer's payload wiring are
  asserted -- a mutation proved the latter was otherwise unwatched.
  ONE OWNED FILE WAS NOT CHANGED: `src/lib/classroom/composer-staging.ts` was,
  but only to delegate. A rename of `categoryCourseIds` to `scopeCourseIds` was
  made and then REVERTED, because `tests/classroom-composer-effect-reactivity.test.ts`
  pins that identifier and that file is another lane's; the shared-derivation
  rule is kept as a comment instead.
  MUTATION PROOF: 8 mutants, 8 killed -- 6 by assertions, 2 (`revoke ... from
  public` alone, and not dropping the old arity) by the migration's own
  apply-time check. The script was wrong twice first; see the history entry for
  the third variant of the summary-line trap it found.
  MIGRATION 0218 IS NOT APPLIED. No cloud session can reach the production
  database. `tests/db/migrations-applied-record.test.ts` is therefore RED on
  this branch and on `integration` until Mr. Pina pastes the file and runs
  `tools/record-applied.mjs` -- which is the structural state of every
  migration branch in this repo, confirmed against 0216 and 0217, whose applied
  records both landed in separate later commits.
