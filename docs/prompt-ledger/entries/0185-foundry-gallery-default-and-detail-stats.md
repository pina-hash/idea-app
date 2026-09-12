# 0185 Foundry: most played by default, and the stats a student can actually see

- Issued: 2026-09-12
- By: router chat
- Owns: `src/lib/foundry/FoundryGallery.svelte`, `src/lib/foundry/telemetry.ts`, the
  Foundry detail route and its `+page.svelte`, `tests/dom/foundry-sort*`,
  `tests/dom/foundry-detail-stats*`, `tools/browser-verify/routes/foundry*.mjs` and its
  measured store entries, `docs/prompt-ledger/entries/0185-*`, and its own
  `docs/history/` entry. NO MIGRATION.
- Migration permitted: no. Claims: none. Highest landed migration at issue: 0203
  (`0204` is claimed by ledger 0177 and already applied to production by hand).
- Status: issued
- Branch: `claude/awesome-keller-pj6hkc`, branched from `origin/integration` at `b0a8101d`
  (level with `origin/main`).
- Notes: TWO DEFECTS MR. PINA FOUND BY USING THE APP ON 2026-09-12, both against the
  mosaic he otherwise liked. (1) The gallery still opens on Recent
  (`FoundryGallery.svelte:127`) although decision 04 was answered MOST PLAYED on
  2026-09-12 and ledger 0173 recorded the answer; no lane changed the code. (2) The
  three metrics `0204` made public are handed down on `/foundry/mine` and
  `/foundry/review` only, so the detail page a student lands on after tapping a card
  shows none of them -- Mr. Pina can read an app's numbers through the review controls
  and nowhere else. Both layers of decision 07 are owed on that page: the PUBLIC TOTALS
  for the app, and the VIEWER'S OWN playtime through `foundry_my_play_stats`.
  THE n=1 CASE IS ACCEPTED AND IS NOT A BUG -- on an app one person has played the
  totals identify when that student played, and Mr. Pina was asked precisely this and
  said it is fine. No threshold, no floor, no rounding, and decision 07 is not reopened.
