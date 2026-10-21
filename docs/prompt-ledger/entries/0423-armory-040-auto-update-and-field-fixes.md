# 0423 Armory 0.4.0: field fixes, auto-update with Velopack, warn-not-block SolidWorks years

- Issued: 2026-10-21
- By: Mr. Pina, scheduled routine (Armory feedback and incidents through Oct 21)
- Owns: everything in pina-hash/idea-armory; in idea-app only Armory server code, Armory migrations, Armory tests, docs/prompt-ledger/entries/0423-*, and its own docs/history/ entry.
- Migration permitted: yes. Claims: 0293. Highest on origin/main at landing: 0292.
- Status: deployed
- Branch: main (solo)
- Notes: idea-armory commits 3154b22 to c2d9d69 (Armory 0.4.0). idea-app: migration 0293 (armory_check_release records a release newer than the pin instead of refusing it) and tests/db/armory-newer-release.test.ts. Record: docs/history/armory-040-field-fixes-0423.md. 0422 took 0288 to 0292, so this landed as 0293.
- Deployed: 0293 applied, live footer 6c58039 on 2026-10-21. The v0.4.0 release built no installers (a test, fixed in 0424); the client ships in v0.4.1
