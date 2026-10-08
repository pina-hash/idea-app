# 0375 Armory 0.3.2: who is connecting, and the app's Send feedback matching the website's

- Issued: 2026-10-08
- By: Mr. Pina, in a Claude Code session, from pina-hash/idea-armory `docs/agent/website-requests-v0.3.2.md` (Armory 0.3.2).
- Repo: `pina-hash/idea-app`
- Branch: `claude/adoring-archimedes-ywz3i5`
- Owns: `supabase/migrations/0235_armory_app_feedback_v2.sql`, `tests/db/armory-app-feedback-v2.test.ts`, `tests/db/armory-proposed*.ts`, `src/lib/armory/**`, `src/routes/armory/**`, `src/lib/feedback/**` (the Armory console), `src/lib/upload-limits.ts`, `tests/upload-limits.test.ts`, the Armory dev harness and browser specs, `docs/ARMORY.md`, this entry, and its own `docs/history/` entry.
- Does not touch: `materials/**`, `.github/**`, `pina-hash/idea-armory`, any other migration.
- Migration permitted: yes, exactly one. Claims: 0235.
- Status: issued
- Notes: Items 1 to 3 of the request are 0234 (ledger 0374), already live. Item 4 is the connect page only. Item 5 is 0235: a wide eight-argument armory_submit_app_feedback with no defaults beside the five-argument form (now a wrapper), armory_my_app_feedback, three columns and a private PNG bucket.
