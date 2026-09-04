# 10 Unattended nightly deploy of integration into main
- Raised: 2026-09-02  By: closeout chat for "Managing multiple FRC platform projects"
- Status: decided 2026-09-03. RAISED 2026-09-02 and answered "not yet" for a stated blocker:
  CI could not read production's applied migration set, so a person typed the assertion.
  Mr. Pina approved the read-only Postgres credential on 2026-09-03, which is exactly what
  the default answer named as the thing that would unblock it. Prompt 0035 implements it:
  `tools/deploy-probe.mjs` reads production's `pg_catalog` through a `DEPLOY_PROBE_URL`
  secret and answers per migration, and `deploy.yml` gained a nightly schedule that runs
  only when the probe says every migration in range is applied. The typed confirmation is
  KEPT as the fallback for a checkout with no secret and for a migration the probe has no
  probe for, and it can never override a migration the probe read as NOT applied. The
  transition is appended here; nothing above it is rewritten.
- Decision:
- Default this assistant would pick: Not yet. It becomes safe when a workflow can read production's applied migration set, which needs a read-only Postgres credential in a GitHub secret; until then the Deploy button is the cadence.
- Why it is blocked on him: The credential is his to decide on, and a nightly merge removes the students-in-class risk but not the second reason in `integrate.yml`'s header: hand-applied migrations must land before the code that calls them, and CI cannot see production's catalog.
- What it unblocks: A scheduled `deploy.yml`, replacing the button, once the applied set is machine-readable.
- Context: `.github/workflows/integrate.yml` (header), `.github/workflows/deploy.yml` (the button, prompt 0005), `docs/standards/IDEA_instructions.md` 4.17, "An unattended overnight deploy was proposed on 2026-09-02 and declined".
- Tree check (2026-09-02): `integrate.yml`'s header states both reasons as described; production has no `supabase_migrations.schema_migrations` table (`CLAUDE.md`, "NEVER RUN `supabase db push`"), so no workflow can read the applied set today.
