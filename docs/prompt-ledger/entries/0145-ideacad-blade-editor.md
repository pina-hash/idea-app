# 0145 IdeaCAD: the IDEA-Blade editor, a native Classroom surface with a live teacher view

- Issued: 2026-09-10
- By: the IdeaCAD scoping chat's one-shot package, folded into the development chat's
  lanes. Students start SolidWorks on 2026-09-11; IdeaCAD ships 2026-09-14; design
  freeze 2026-09-15.
- Owns: `src/lib/ideacad/**`; `src/routes/dev/ideacad/**`;
  `supabase/migrations/0201_ideacad_blade_editor.sql`; `tests/ideacad*.test.ts`,
  `tests/dom/ideacad*.test.ts`, and `tests/db/ideacad*.test.ts`;
  `tools/browser-verify/routes/ideacad*.mjs` and the generated regions of
  `tools/browser-verify/README.md`; `docs/prompt-ledger/entries/0145-*`, new
  `docs/decisions/entries/` entries, and this bundle's own `docs/history/` entry; one
  final appended entry in `classroom-updates.json`; one subsystem paragraph in
  `CLAUDE.md`; the specified IdeaCAD regions of
  `src/lib/classroom/html-assignment/mount.ts`, `src/lib/classroom/ItemDetail.svelte`,
  `src/lib/classroom/ContentComposer.svelte`,
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.server.ts`,
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`, and the `ideacad` entry
  in `src/lib/site-manifest.ts`.
- Migration permitted: exactly one, 0201.
- Claims: 0201
- Lands on: NOT `main`. A pull request against `integration`; the migration is applied
  by Mr. Pina by hand before the merge to `main`, and that merge is the development
  chat's.
- Status: pushed
- Branch: the Codex-created `work` checkout, published by the environment under the
  `codex/` prefix, from the integration snapshot at
  `c44fb0e99511422f22cc2090dccad8db2dd1e75d`.
- Notes: Local duplicate checks found only this prompt and no IdeaCAD surface, 0145
  ledger entry, 0201 migration, or matching recent commit. The checkout has no remote
  refs, so the Codex preamble's no-fetch/no-push rule governed. Built the four-table
  schema-4 model and RPC boundary, feature tree, pure validation/evaluation and control
  math, live broadcast twin, transport factory, Classroom mount, editor and dev harness.
  The focused node suite passed 9 tests in 3.60 seconds and `npm run check`, the
  CLAUDE checker, and history verification passed. Production Realtime, school-network
  behavior, and a Vercel preview cannot be established here; Chromium/dev-server launch
  did not remain available for the required visual pass. The history entry names the
  migration-first deployment, verification query, measurements, physical measurements,
  SolidWorks confirmations, and follow-ons.
