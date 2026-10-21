# 0424 Armory 0.4.1: the Windows check that stopped 0.4.0's installers, organizing over check outs, quiet passes, slow check ins

- Issued: 2026-10-21
- By: Mr. Pina, through the IDEA & FRC chat (the three items 0.4.0 left unbuilt, docs/history/armory-040-field-fixes-0423.md "Not built, and why", and the failed v0.4.0 release build)
- Owns: everything in pina-hash/idea-armory; in idea-app only docs/prompt-ledger/entries/0424-* and its own docs/history/ entry. No server code: idea-app 0236 already lets a lead organize over check outs.
- Migration permitted: no. Claims: none. Highest on origin/main at landing: 0294.
- Status: pushed (idea-armory 83ea2fa, all checks green); awaits Mr. Pina publishing v0.4.1
- Mode: solo
- Branch: main (solo)
- Notes: idea-armory commits f23a76b (Task A, pushed alone) and d371a78, 2284d7d, 1d22f35, da855af, f6fa09a, 83ea2fa (Task B); main is 83ea2fa. Task A: the Windows test copied a hand-kept list of the app's files, which 0.4.0's Velopack.dll was not on, so the copy died in Main before --check printed and both v0.4.0 release builds stopped; v0.4.0 is published with no assets and its tag is untouched. Task B: a lead renames and moves over other people's check outs (0236, mirrored in idea-armory's tests as armory_v3_organize.sql); the Windows scan takes an unchanged read-only file from an attributes-only stamp instead of opening it; a click during the loop's scan goes on from that scan. Version 0.4.1. The record is docs/history/0424-armory-041-organize-scan-checkin.md.
