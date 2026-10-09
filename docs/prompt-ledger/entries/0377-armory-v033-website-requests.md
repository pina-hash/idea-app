# 0377 Armory 0.3.3: instructors force a check in, empty files can be removed, leads organize checked-out files, same-named computers are told apart

- Issued: 2026-10-09
- By: Mr. Pina, in a Claude Code session, from pina-hash/idea-armory `docs/agent/website-requests-v0.3.3.md` (Armory 0.3.3). "When completed, everything should push straight to main and go live."
- Repo: `pina-hash/idea-app`
- Branch: `claude/pensive-lovelace-6f3qcv`, pushed straight to `main` (solo).
- Owns: `supabase/migrations/0236_armory_v033.sql`, `tests/db/armory-v033.test.ts`, `tests/armory-v033-website.test.ts`, `tests/armory-page-loads-ladder.test.ts` (one case), `tests/armory-team-presence.test.ts` (one sentence), `src/lib/armory/**`, `src/lib/server/armory/page-loads.ts`, `src/routes/armory/[project]/+page.svelte`, `src/routes/dev/armory/**`, `src/lib/feedback/armory-reports.ts` and the two Armory consoles, `src/routes/admin/feedback/{armory,incidents}/+page.server.ts`, `tools/browser-verify/routes/armory.mjs`, `docs/ARMORY.md`, the one Armory rule in `CLAUDE.md`, this entry, and its own `docs/history/` entry.
- Does not touch: `pina-hash/idea-armory`, `materials/**`, `.github/**`, any other migration.
- Migration permitted: yes, exactly one. Claims: 0236.
- Status: pushed
- Notes: All four items in one migration, 0236. `armory_can_take_back` is the one predicate behind `armory_my_projects`, `armory_break_lock` (so `armory_break_locks`), the new `armory_remove_empty_file` and the lead path of `armory_move_file` and `armory_rename_folder`. The one narrowing: only a mentor may make or change an instructor, because the role now carries Force check in. `armory_app_incidents.machine_id` is a stored generated column. Armory needs no change for any item.
