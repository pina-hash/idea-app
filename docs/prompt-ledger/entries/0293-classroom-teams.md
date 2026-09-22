# 0293 Team rosters that persist, export, post, and can be customized
- Issued: 2026-09-22
- By: Lane D6
- Owns: `src/lib/classroom/PeoplePanel.svelte`, `picker.ts`, `roster-export.ts`,
  `src/routes/classroom/[sectionId]/people/`, one new teams module under
  `src/lib/classroom/`, `supabase/migrations/0223_*.sql`, matching `tests/`, one
  `tools/browser-verify/routes/` spec
- Migration permitted: yes, exactly one. **0223 claimed here.**
  Highest landed on origin/main at issue: 0217. Confirmed free with
  `node tools/migration-claims.mjs` before the claim.
- Status: issued
- Branch: `claude/intelligent-bardeen-4quab4`, started from `1ec2f640` (= `origin/main`)
- Notes: The 2026-09-09 report asked for three things: a team COUNT input, export and
  posting of team rosters for a set period, and student visual customization. Verdict
  filed per ask in `docs/history/intelligent-bardeen-4quab4.md`.

  The one lane boundary that shaped the scope: the student-facing class stream is
  `ClassView.svelte`, mounted from `src/routes/classroom/[sectionId]/+layout.svelte`.
  Neither is this lane's. So the POSTED ROSTER'S STUDENT SURFACE and the STUDENT STYLE
  EDITOR are built as data and authorization only -- table, window, audience-gated read
  RPC, membership-gated write RPC -- and the mount is left to whoever owns D4. Said
  rather than crossed, as the prompt required.
