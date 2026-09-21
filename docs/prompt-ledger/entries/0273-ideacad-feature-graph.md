# 0273 IdeaCAD feature graph, design tree, reference geometry, mates, storage and add-on tools
- Issued: 2026-09-21T00:00:00Z
- By: Mr. Pina's list after driving the 2026-09-15 direct modeler, routed as ledger 0273
- Owns: `src/lib/ideacad/solid/**`, `src/lib/ideacad/kernel/**`, `src/routes/ideacad/**`, `src/routes/dev/ideacad-solid/**`, `supabase/migrations/0217_*`, tests for those files, `docs/IDEACAD.md`, `docs/prompt-ledger/entries/0273-*`, `docs/history/<branch slug>`.
- Migration permitted: yes, exactly one. Claims: 0217. Highest on origin/main at issue: 0216
- Status: issued
- Branch: `claude/optimistic-mayer-rcq01p`
- Notes: Phase 0 is the feature graph (the spine) and is serial; the ten surfaces fan out after it, one agent per file surface. Forbidden: `src/lib/ideacad/blade/**`, `src/lib/classroom/**`, `src/lib/ideacad/BladeEditor.svelte`, `ideacad.css`, `src/lib/ideacad/viewport/**`, any other migration. 0217 persists the feature list and carries the schema for reference geometry, mates, materials/colour and storage (folders, tags, trash) so no second migration is needed. Applied by hand by Mr. Pina; the PR targets `main` and is not merged by the session.
