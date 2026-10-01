# Armory A: the Windows agent end to end (tray app, sync engine, client, missing RPCs, installer)

- Issued: 2026-09-30
- By: IDEA & FRC chat, for one overnight Claude Code session (Opus 5.5, ultracode)
- Owns: in `pina-hash/idea-armory`, `server/sql/**` additions per its contract section 6, `src/Armory.Client/**`, `src/Armory.Agent.Engine/**`, `src/Armory.Agent/**`, `tests/**` additions, the Core release-gate mode, CI and release workflows, `docs/agent/**`, `docs/overnight/2026-10-01-A.md`.
- Does not touch: anything in `pina-hash/idea-app` or `pina-hash/idea-unstuck` (read only); `spike/`; the safe-replace adapter's internals.
- Migration permitted: no. The SQL stays a draft in idea-armory.
- Status: COMPLETE, report `docs/overnight/2026-10-01-A.md` at idea-armory `55cc977`. Verified by the chat 2026-10-01: full suite reproduced on Linux with PostgreSQL 16 (Core 182, Server 31, Storage 8, Client 11, TestSupport 50, Engine 13, EndToEnd 20, Agent 57 + 13 skipped, Platform 1 + 29 skipped; 0 failed); screenshots inspected. The container could not push tag v0.1.0 (proxy refused the tag ref), so `release.yml` was extended at `b18791d` to also run on a release published from the web page.
- Notes: Supersedes the unrun 2026-09-29 draft. UI follows idea-app's Plate (IDEA_INTERFACE_STANDARDS section 14), with a bounding-box diff across two themes. Release gate defaults to `warn` until a release reader or the add-in exists, because enforcing it would refuse every SolidWorks upload. Installer follows idea-unstuck's USB-zip pattern. No tag is pushed by the session.
