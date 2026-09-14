# 0263 IdeaCAD parts panel reaches the 0255 model layer
- Issued: 2026-09-14T07:00:00Z
- By: Claude Code session
- Owns: `src/lib/ideacad/ui/PartsPanel.svelte`, `src/lib/ideacad/assembly.ts`, `src/lib/ideacad/checkout.ts`, their tests, `docs/prompt-ledger/entries/0263-*`, `docs/history/gifted-volta-sfz8zo.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0215 (`supabase/migrations/`)
- Status: pushed
- Branch: `claude/gifted-volta-sfz8zo`
- Notes: UI only. `blade/parts.ts` and `blade/ops.ts` were READ and IMPORTED, never
  modified. No file under `viewport/`, no other file under `ui/`, no route,
  `BladeEditor.svelte`, `ideacad.css`, `store.ts`, `transports.ts` or migration
  touched. THE CONTROLS ARE NOT YET REACHED FROM A MOUNTED SURFACE: the two
  `PartsPanel` mounts are `src/lib/classroom/ItemDetail.svelte` and
  `src/routes/dev/ideacad-team/+page.svelte`, both outside this ledger's ownership,
  and each needs four props added. See the history entry's "What is still
  invisible" section, which names the exact lines.
