# 05 Foundry: publishing requires a description
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: A schema narrowing on the existing `description` column with a migration and a client message; a client-only check is bypassed by the next tool that writes rows.
- Why it is blocked on him: Which field is required, and whether an already-published app with no description is grandfathered or unpublished, is a policy call about student work already live.
- What it unblocks: A one-migration Foundry lane with its own answer for the rows already stored.
- Context: `supabase/migrations/0130_*.sql` (`student_apps.description`, nullable, 1 to 4000 characters when present; `foundry_create_app` and the field editor accept it); `src/routes/foundry/submit/+page.svelte` sends `p_description`. `CLAUDE.md`, "A VALIDATION GATE WIDENS IN ITS OWN BUNDLE" governs the narrowing shape.
- Tree check (2026-09-02): the column exists as described and is optional today, so the "existing description column" premise holds.
