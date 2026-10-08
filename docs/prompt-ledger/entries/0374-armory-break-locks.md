# 0374 Armory: armory_break_locks, the site's bulk controls, and Realtime bursts

- Issued: 2026-10-08
- By: Mr. Pina, in a Claude Code session, from pina-hash/idea-armory `docs/agent/website-requests-v0.3.1.md` (Armory 0.3.1).
- Repo: `pina-hash/idea-app`
- Branch: `claude/adoring-archimedes-ywz3i5`
- Owns: `supabase/migrations/0234_armory_break_locks.sql`, `tests/db/armory-break-locks.test.ts`, `src/lib/armory/**`, `src/lib/server/armory/**`, `src/routes/armory/**`, `src/routes/api/armory/**`, the Armory dev harness and browser specs, `docs/ARMORY.md`, this entry, and its own `docs/history/` entry.
- Does not touch: `materials/**`, `.github/**`, `pina-hash/idea-armory`, any other migration.
- Migration permitted: yes, exactly one. Claims: 0234.
- Status: pushed
- Notes: 0234 adds one function, `armory_break_locks(uuid[], uuid, uuid)`, the batch twin of `armory_break_lock` in the shape of 0233's `armory_release_locks`. Additive; no client depends on it until it is applied.
