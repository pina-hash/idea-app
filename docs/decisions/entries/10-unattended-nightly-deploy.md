# 10 Unattended nightly deploy of integration into main
- Raised: 2026-09-02  By: closeout chat for "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: Not yet. It becomes safe when a workflow can read production's applied migration set, which needs a read-only Postgres credential in a GitHub secret; until then the Deploy button is the cadence.
- Why it is blocked on him: The credential is his to decide on, and a nightly merge removes the students-in-class risk but not the second reason in `integrate.yml`'s header: hand-applied migrations must land before the code that calls them, and CI cannot see production's catalog.
- What it unblocks: A scheduled `deploy.yml`, replacing the button, once the applied set is machine-readable.
- Context: `.github/workflows/integrate.yml` (header), `.github/workflows/deploy.yml` (the button, prompt 0005), `docs/standards/IDEA_instructions.md` 4.17, "An unattended overnight deploy was proposed on 2026-09-02 and declined".
- Tree check (2026-09-02): `integrate.yml`'s header states both reasons as described; production has no `supabase_migrations.schema_migrations` table (`CLAUDE.md`, "NEVER RUN `supabase db push`"), so no workflow can read the applied set today.
