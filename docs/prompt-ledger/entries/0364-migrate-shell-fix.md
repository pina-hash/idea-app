# Migrate workflow: stop `bash -e` killing the probe and apply steps

- Issued: 2026-10-06
- By: IDEA & FRC chat, run as a Claude Code session on `claude/intelligent-brahmagupta-56q6sx`, pushed straight to `main` (Mode: solo). Approved by Mr. Pina 2026-10-06.
- Owns: `.github/workflows/migrate.yml` (the "Ask production which migrations it has" and "Apply it" steps only), this entry, `docs/history/intelligent-brahmagupta-56q6sx.md`.
- Does not touch: `supabase/**`, `materials/**`, any historical ledger entry.
- Migration permitted: NO. This bundle only lets migrate.yml apply 0230 (ledger 0360) and 0231 (ledger 0363).
- Status: pushed
- Notes: The ledger matcher was checked and left alone: it matches exactly one entry for each migration (0360 for 0230, 0363 for 0231). Entry 0347 only mentions 0230 in prose, so `parsePermitted` reads its Claims list as 0225.
