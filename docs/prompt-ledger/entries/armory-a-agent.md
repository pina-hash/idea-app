# Armory A: the Windows agent end to end (tray app, sync engine, client, missing RPCs, installer)

- Issued: 2026-09-30
- By: IDEA & FRC chat, for one overnight Claude Code session (Opus 5.5, ultracode)
- Owns: in `pina-hash/idea-armory`, `server/sql/**` additions per its contract section 6, `src/Armory.Client/**`, `src/Armory.Agent.Engine/**`, `src/Armory.Agent/**`, `tests/**` additions, the Core release-gate mode, CI and release workflows, `docs/agent/**`, `docs/overnight/2026-10-01-A.md`.
- Does not touch: anything in `pina-hash/idea-app` or `pina-hash/idea-unstuck` (read only); `spike/`; the safe-replace adapter's internals.
- Migration permitted: no. The SQL stays a draft in idea-armory.
- Status: issued
- Notes: Supersedes the unrun 2026-09-29 draft. UI follows idea-app's Plate (IDEA_INTERFACE_STANDARDS section 14), with a bounding-box diff across two themes. Release gate defaults to `warn` until a release reader or the add-in exists, because enforcing it would refuse every SolidWorks upload. Installer follows idea-unstuck's USB-zip pattern. No tag is pushed by the session.
