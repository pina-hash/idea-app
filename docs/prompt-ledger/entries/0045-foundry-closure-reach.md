# 0045 The Foundry closure was a shutter on five documents
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `src/lib/foundry/access.ts`, `/foundry/preview`, `/foundry/download`, `/foundry/starter`, the gate on `/a/` and `/b/`, `src/lib/foundry/serve*.ts`, one migration (conditional, number taken at commit time), `src/routes/dev/foundry-admin/**`, `tests/foundry-section-gate*`, `tests/db/foundry-section-gate*`, `tools/browser-verify/routes/foundry-*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0045-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0180
- Status: pushed
- Branch: claude/foundry-closure-reach-bcmoom
- Notes: Decision 01 exists so an instructor can stop students playing games
  during their lesson. Prompt 0015 built the per-section toggle and prompt
  0042 narrowed its reach so one closed class no longer locks a student out
  of five others.

  0042 then reported what neither had checked: THE CLOSURE NEVER BLOCKED
  PLAYING A GAME. `/foundry/preview`, `/foundry/download` and
  `/foundry/starter` are `+server.ts` with no layout, so the layout load that
  carries the gate never runs for them. `/a/` and `/b/` are on the sessionless
  apps origin and were never gated at all. `foundry_section_access` has
  exactly one caller. In 0042's words, it was a shutter on five documents.

  So the control an instructor presses does not do the thing they press it
  for. A student in a closed class opens a bundle by its direct URL and plays.

  The hard part is the apps origin. It is sessionless BY DESIGN: a published
  bundle is served without a portal session so a student app cannot reach a
  student's data. Gating it must not undo that, and a design that puts a
  session on the apps origin is the wrong answer even though it would work.

  Deliberately excluded: `FOUNDRY_LIMITS`; the four surfaces 0042 deliberately
  opened, which are settled; and any bell-schedule awareness, which is
  decision 01's deferred half.
