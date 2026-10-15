# 0391 IDEA Certification Portal, the whole idea-app build

- Issued: 2026-10-15
- By: Mr. Pina, via the IDEA Certification Portal scoping chat. Mode: solo.
- Repo: `pina-hash/idea-app`
- Branch: assigned by the harness; rebased onto `origin/main` and pushed straight to `main`.
- Owns: `src/routes/certifications/**`, `src/lib/certifications/**`, `src/lib/server/certifications/**`, `src/lib/server/email/**`, the Certifications entry in the IDEA Classroom header and the profile-menu notification badge (surgical edits only), any `src/routes/api/certifications/**`, any new scheduled-job workflow or `vercel.json` `crons` entry the build needs, `docs/CERTIFICATIONS.md` (corrections only, each stated), `docs/certifications/**`, its `docs/history/` entry, tests for all of the above, `classroom-updates.json`, `package.json` and its lockfile (new dependencies only), this entry, and migrations 0250 through 0254.
- Does not touch: `materials/**`, any migration below 0250, any existing table's columns, policies or functions.
- Migration permitted: yes, additive only (new `cert_` objects). Claims: 0250, 0251, 0252, 0253, 0254
- Status: issued
- Notes: Numbers 0244 through 0249 are left free as a firebreak for other chats' in-flight allocations (0384 records 0244 to 0248 as allocated and unused). Spec: `docs/CERTIFICATIONS.md`.
