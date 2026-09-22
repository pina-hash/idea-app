# 0293 Team rosters that persist, export, post, and can be customized
- Issued: 2026-09-22
- By: Lane D6
- Owns: `src/lib/classroom/PeoplePanel.svelte`, `picker.ts`, `roster-export.ts`,
  `src/routes/classroom/[sectionId]/people/`, one new teams module under
  `src/lib/classroom/`, `supabase/migrations/0223_*.sql`, matching `tests/`, one
  `tools/browser-verify/routes/` spec
- Migration permitted: yes, exactly one. Claims: 0223. Highest landed on
  origin/main at issue: 0217. Confirmed absent from BOTH the claimed and the
  hole lists with `node tools/migration-claims.mjs` before the claim.
  **`next free` read 0219; the prompt said "Use 0223 and no other number",**
  which leaves 0219 through 0222 as holes this branch does not account for.
  They are sibling lanes' to claim, and `tests/db/migration-0177-tombstone.test.ts`
  is red here until they push. Renumbering was rejected: it would break an
  explicit instruction and risk contesting a number another lane was given.
- Status: pushed
- Branch: `claude/intelligent-bardeen-4quab4`, started from `1ec2f640` (= `origin/main`)
- Gates, as of 2026-09-22 12:59 PDT (school hours, so NO merge to `main` from
  this session; reported and left to Mr. Pina):
  1. `git merge-base --is-ancestor origin/main origin/integration` -> PASS.
  2. This branch is NOT yet contained in `origin/integration`; nothing has swept
     it. Not assessable from here.
  3. Not attempted: no merge to `main` from this session.
  4. `node tools/deploy-probe.mjs --ref origin/integration` exits **1**
     (`cannotRun`, `DEPLOY_PROBE_URL` unset -- the ordinary cloud state), so the
     record-backed substitute governs. `git diff --name-only
     origin/main...origin/integration -- supabase/migrations/` names **zero**
     migrations, so the set checked is EMPTY and the set found is EMPTY.
     **This is the substitute being vacuously satisfied, NOT the probe passing.**
  5. This bundle's migration is `0223` and it is APPLIED NOWHERE. No probe
     reports it. It is Mr. Pina's to paste.
  6. This entry reads `Status: pushed` as of its final commit.
- Notes: The 2026-09-09 report asked for three things: a team COUNT input, export and
  posting of team rosters for a set period, and student visual customization. Verdict
  filed per ask in `docs/history/intelligent-bardeen-4quab4.md`.

  The one lane boundary that shaped the scope: the student-facing class stream is
  `ClassView.svelte`, mounted from `src/routes/classroom/[sectionId]/+layout.svelte`.
  Neither is this lane's. So the POSTED ROSTER'S STUDENT SURFACE and the STUDENT STYLE
  EDITOR are built as data and authorization only -- table, window, audience-gated read
  RPC, membership-gated write RPC -- and the mount is left to whoever owns D4. Said
  rather than crossed, as the prompt required.
