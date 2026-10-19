---
title: "The migration chain applies again: one claim per number, no reserved ranges (ledger 0407; 0285 renamed to 0273)"
date: 2026-10-19
branches: [lane/migration-chain-repair]
migrations: ["0273"]
subsystems: ["Migrations", "Workflow", "IDEA Armory"]
---

Every Migrate run since 2026-10-18T09:43Z refused at 0271, so 0271, 0272 and Armory's release-choice migration all waited. This bundle found why, removed the cause, renamed the Armory file into the hole the reserved numbers left, recorded what production holds for 0269, and replaced reserved migration ranges with one rule.

## The audit

All of this was read from the Migrate run logs through `gh run view --log` (runs 39087105134, 39087156492, 39116420233, 39116466702, 39178683672 and 39182738400), the committed ledger, and `docs/migrations-applied/`.

### Which two claims collide on 0271

**Not the 0271 ledger entry.** `0271-viewport-feature-edges.md` reads `Migration permitted: no. Claims: none.`, which `parsePermitted` answers `declared-none`, and the workflow's matcher reads only the permission field, never a file name or heading. The two claimants were:

- `0396-tab-icon-classes-feedback.md`: `Claims: 0268, 0269, 0270, 0271, 0272`. It reserved five numbers ahead of time, used 0268 and 0269, and released 0270 to 0272 only in its Notes ("Claims 0270, 0271 and 0272 were not used"). `parsePermitted` reads the `Claims:` clause and nothing in Notes, so the released three still read as claimed, and 0396's Status (`pushed`) is not terminal.
- `0400-website-connector-slice-1.md`: `Claims: 0270, 0271, 0272`, which wrote 0270 and 0271.

The same double claim stood on 0270, and run 39116420233 applied 0270 only because it was started by hand with `0400` in the dispatch box (`named by the dispatch input: 0400`). The chained run after it (39116466702, 09:43:57Z) printed `2 ledger entries claim migration 0271`. A second hand-started run (39116563644, 09:45Z, also `0400`) got past the claim and was refused by the apply tool's existence check ("0271 is ALREADY applied"), the defect ledger 0406 fixed at 22:28Z; after that fix nobody pressed the button again, and every push since (dada89e and the three dispatch commits for this bundle included) stopped at the double claim. `tools/migration-claims.mjs`'s own `classify` never reported the clash, because it drops any claim on a number that has already LANDED as a file, and 0271 had landed; the clash only exists for the workflow, which asks about landed-but-unapplied files.

### Whether 0285 was applied

**Never.** Every probe since the file landed (runs 39178683672, 39179624563, 39182672519, 39182700973, 39182738400) reads `0285 no row NOT APPLIED` for `function public._armory_release_ceiling` and for the 0285 bodies of `armory_create_project` and `armory_raise_pinned_release`, and no run reached its apply step (each stopped at the 0271 refusal). There is no `docs/migrations-applied/0285-*` record. So the rename was safe.

### What the 0269 gap is

0269 IS in production, and it reached production outside `tools/apply-migration.mjs`:

- 01:37:43Z on 2026-10-18 (run 39087156492): the probe read `_app_short_link_reserved` as NOT carrying 0269's body, and `apply-migration.mjs` refused 0269 as "ALREADY applied" on the existence finding alone, the defect ledger 0406 fixed. Nothing was applied.
- 09:43:15Z (run 39116420233) and every run since: the body probe reads 0269's body APPLIED, while 0271's distinguishing line (the only later definer) reads NOT APPLIED, so the live body is 0269's.
- `supabase_migrations.schema_migrations` has no row for 0269 in any run, so the apply tool, which writes the row in the same transaction, did not do it.

The marker for 0269 (`'dashboard', 'dev', 'downloads', 'feedback', ...`) is the same string with and without 0271 in the tree (`python3 tools/idea-status.py --local . --json --since 151`), so the flip is the database changing, not the derivation. Who put it there is not recorded anywhere this repository can read; a paste into the SQL editor in that window is the likely path. `docs/migrations-applied/0269-ledger-0396.md` records exactly that: `source: report`, `attested_by` stating that nobody reported it, the six probe lines as evidence, and a body that says it rests on the probe's reading and not on anybody's report. It closes the gap-free-prefix assertion in `tests/db/migrations-applied-record.test.ts` honestly. The missing history row for 0269 is NOT repaired (no session reaches production); the probe and the ordering rule already read a catalog-proved migration with no row as applied.

## What changed

- **`ledgerClaimants(number, entries)`** in `tools/migration-claims.mjs` is now the one answer to "which entries claim this migration", read through `parseEntry`, `permittedText` and `parsePermitted`, keeping only entries `--ledger` can name. `.github/workflows/migrate.yml` calls it through `node tools/migration-claims.mjs --claimants <n>` instead of its own inline script, which read the bare field and so missed a `Claims:` written as its own bullet (entry 0138's shape).
- **`pendingClaimProblems`** lists every migration above the newest `docs/migrations-applied/` record with zero or several claimants. `tests/apply-migration-claimants.test.ts` asserts it is empty on the committed tree, with a planted second claim as its positive control, so a landing session's own suite reddens on a double claim instead of the next Migrate run. The same file pins the own-number shape (an entry numbered 0271 whose line says no, or permits without a number, or names 0271 in Notes, claims nothing), both claim shapes, the "Highest at issue" exclusion, and the 2026-10-18 collision itself.
- **0396's `Claims:` line** now names the two numbers it used, with the reason in a parenthesis that carries no number. This is outside the Owns list and forced: it is the collider, and the root is that entry's text.
- **`0285_armory_release_choice.sql` is now `0273_armory_release_choice.sql`**, its own `0285` mentions (notices, self-check refusals) rewritten to `0273`. It was never applied anywhere, so this is a correction in place, not an edit to an applied record. 0404's entry claims 0273 and says why. Every test and doc naming it moved with it: `tests/db/armory-release-choice.test.ts`, `tests/db/armory-proposed.ts` (outside the `tests/db/armory*.test.ts` glob, but it holds the file name the armory tests read), `tests/db/armory-proposed.test.ts`, `tests/armory-solidworks-version.test.ts` (a comment), `docs/ARMORY.md`, the IDEA ARMORY line of `CLAUDE.md`, three source comments (`src/lib/armory/solidworks-version.ts`, `src/routes/armory/+page.svelte`, `src/routes/armory/[project]/+page.svelte`), and `src/lib/server/connector/schema.generated.json`'s `last_migration`, rewritten by `npm run connector:build` (one line; the build's "1 with no function in the database" is the same on main). The earlier queue entry for 0404 and 0404's history entry still say 0285, as records.
- **0407's own entry claims nothing** (`Claims: none`), so 0273 has exactly one claimant, 0404, which is the bundle that wrote it and the one its applied record should name.
- **The rule**: a new bullet in `CLAUDE.md`'s migration rules ("A MIGRATION NUMBER IS TAKEN AT LANDING, NEVER RESERVED AHEAD") and item 4 of `docs/skills/idea-code-prompt/SKILL.md` (with the two places in that skill that told the writer to allocate a migration number). The NUMBERS lines of the coin-later-features and armory-part-numbers queue entries now say "the next free migration number at landing"; nothing else in them changed (their front matter still says 0275 and 0286, and the coin prompt's body still says 0275 to 0284 in places; its NUMBERS line tells the session to read its final numbers there).

After this push the claimants are: 0271 and 0272, 0400 only; 0273, 0404 only. `migrate.yml` should apply 0271 under 0400 (0400's budget is three, one used by 0270), chain to 0272 under 0400, then 0273 under 0404.

## Measured

- Mutation proof on the claim reader, against `tests/apply-migration-claimants.test.ts`, restored from a copy and md5-identical (`29a7a21652bf9608ec96ccfbcace704a`): reading the file's own number as a claim (4 failed), dropping the `Claims:`-bullet join (1 failed), counting only zero claimants as a problem (2 failed), keeping unnumbered entries (1 failed). 4 of 4 killed; verdicts read from the vitest summary line on stdout plus stderr.
- Targeted: the three apply-migration files, the claimants file, the tombstone, the applied-record file, `tests/migration-claims.test.ts`, `tests/armory-solidworks-version.test.ts` and `tests/workflows.test.ts` passed 313 of 313; every `tests/db/armory*.test.ts` plus the connector coverage and registry tests passed 553 of 553.
- `npm run check` (placeholder `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported before the sync): 0 errors, 33 warnings in 18 files, the baseline.
- Full `npm test` on 2026-10-19, read from the summary line with stderr merged in: `Test Files 849 passed (849)`, `Tests 15983 passed (15983)`, no failed suites. The tombstone contiguity test and the applied-record test, both red on main before this bundle, are green.

## Not verified

- **Production.** No session reaches it. Whether the Migrate run on this push applied 0271, 0272 and 0273 is read from that run's log after the push, and said in the report.
- **Who applied 0269**, and its missing history row.

## Owed

- `docs/standards/IDEA_instructions.md`, "Numbers are allocated, never derived" (and its 4.22 changelog entry), still says every prompt names its migration number. That contradicts the rule this bundle wrote into `CLAUDE.md` and the skill, and it is outside this bundle's Owns, so it needs its owner's amendment.
- 0400's Notes still say "0272 not used"; 0401 wrote 0272 and named it only in prose, so 0400 is its de facto claimant, which is what `migrate.yml` will record. 0401's line (`0272, and 0273 if needed`) reads as unspecified and claims nothing, which is why it does not collide with 0273.
- `ledgerPermission` in `tools/apply-migration.mjs` still reads the first permission line alone, without the `Claims:`-bullet join `ledgerClaimants` makes. No pending entry uses that shape, and the gate treats a permitting entry with no number as a budget of one, so it cannot refuse a migration the workflow matched; unifying the two is a change to the trace corpus test and was left alone.
