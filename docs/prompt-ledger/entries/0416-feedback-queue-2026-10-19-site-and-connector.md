# 0416 Feedback queue 2026-10-19: site items 1 to 12 and connector gaps C1 to C7

- Issued: 2026-10-19
- By: Mr. Pina, scheduled run of the feedback queue `docs/feedback/2026-10-19/QUEUE.md` (his answers at its top). Mode: solo. Model: Opus 5.5, effort high.
- Repo: `pina-hash/idea-app`
- Branch: none; pushed straight to `main`, in two pushes (connector, then site).
- Owns: the src/ files each item touches (list them on the ledger entry's Claims line), src/lib/legacy/coins/index.html for item 10, the connector source and its registry or catalog, the RPCs and admin endpoints the connector or an item needs changed, at most one migration under the next free migration number at landing (take it again when you rebase; rename yours if someone landed first; state the final number on the Claims line), the tests and browser-verify route specs for those surfaces, the docs/subsystems/ files whose rules you change, the Status line of decision 69, docs/prompt-ledger/entries/0416-*, and your own docs/history/ entry.
- Migration permitted: at most one. Claims: 0282
- Claims (files, push 1, the connector): `src/lib/server/connector/{registry.ts,engine.ts,endpoints.ts,tools.ts,resolve.ts,types.ts,backend.ts,backend-local.ts,log-tables.ts}`, `src/lib/server/connector/registry/{market.yaml,armory.yaml,site.yaml,coin.yaml,tools.yaml}`, the generated `src/lib/server/connector/{inventory,overlay,schema,auto}.generated.json` and `endpoints.generated.ts`, `src/lib/site-manifest.ts` (one bookkeeping subject), `tools/connector/{auto.mjs,gates.mjs,inventory.mjs,schema-query.mjs,build.mjs}`, `.github/workflows/connector.yml`, `supabase/migrations/0282_app_feedback_file.sql`, `docs/connector/DESIGN.md`, `docs/subsystems/connector.md`, `CLAUDE.md` (one standing-trap line), and tests (`tests/connector-coverage.test.ts`, `tests/connector-registry.test.ts`, `tests/workflows.test.ts`, `tests/site-versions.test.ts`, `tests/db/connector-{0416,permissions,levels,requests}.test.ts`, `tests/db/connector-samples.ts`).
- Status: issued
- Notes: written in the first push, before the site work.
