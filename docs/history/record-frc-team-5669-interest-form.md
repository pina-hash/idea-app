---
title: "FRC Team 5669 interest form"
date: 2026-07-15
branches: []
migrations: ["0045", "0046", "0047"]
subsystems: ["FRC / FSP / feedback"]
record_order: 70
---

`/fsp/frc-interest` is a standalone, **public, unauthenticated** intake form
for FRC Team 5669 (distinct from the `/frc` training track above and from
`/fsp-pulse`'s FRC-interest question): full name, email, optional phone,
optional parent/guardian email, a multi-select interest-area chip picker
(Mechanical & Build, Electrical & Wiring, Programming & Controls, CAD &
Design, Business & Outreach, Drive Team, Not sure yet), and an optional
prior-experience text field. Reached cold from a QR code like the other FSP
tools, so it needs no sign-in: prospective freshmen and parents scanning it
will not have Bosco Tech accounts.

- **Genuinely anonymous INSERT, the one exception to the "no direct client
  write" convention.** `fsp_frc_interest` (`0046_fsp_frc_interest.sql`,
  `parent_email` added in `0047_fsp_frc_interest_parent_email.sql`) grants
  `insert` to `anon, authenticated` under an `with check (true)` RLS policy,
  no RPC: unlike every other FSP/GAUNTLET/FRC table, there is no grading,
  ranking, or session to forge here, so the anon insert itself is the safe
  write path. Reads are teacher-only (`is_teacher()`, no anon/authenticated
  `select` grant beyond that RLS-scoped policy). No update/delete grant at
  all (v1 is submit + read only). `src/lib/fsp/frc-interest.ts` is the client
  seam (`submitFrcInterest`, `loadFrcInterestSubmissions`, the latter failing
  soft to `ready:false` pre-migration, the `frc/gate-submissions.ts`
  convention).
- **If the visitor already has a session, the email field pre-fills (never
  locks)** from `claims.email`; every other field starts blank. No other
  auto-population.
- **Styled after `/fsp/ask`**, not the neutral `.fsp-root` navy/gold theme:
  IDEA green on near-black, mobile-first single card, since this pair
  (Supabase-backed, QR-reached, no-login) is the closer structural precedent.
  The form is `src/lib/fsp/FrcInterestForm.svelte` (takes a `submit` callback,
  the `FspTechSelection`/`FspPulse` convention, so the dev harness mounts the
  identical component against a fake endpoint), wired to the real insert by
  `src/routes/fsp/frc-interest/+page.svelte`.
- **`/fsp/frc-interest/admin`** is the teacher-only roster:
  `+page.server.ts` gates the same way `/dashboard` does
  (role lives in `profiles`, looked up server-side; signed out or non-teacher
  redirects to `/`). The table itself is `src/lib/fsp/FrcInterestAdmin.svelte`
  (sortable by submission date, defaults newest-first, no edit/delete for
  v1), shared with the dev harness the same way.
- **Neither route is in `authedPrefixes`** (`hooks.server.ts`): the base form
  must stay reachable signed-out, and the admin roster gates itself in its own
  `+page.server.ts`, exactly like `/dashboard`.
- **Dev harness `/dev/fsp-frc-interest`** (404 in production, no auth /
  Supabase): mounts the real `FrcInterestForm` (signed-out vs. signed-in
  email-prefill entry states, a fake logged submit endpoint) and the real
  `FrcInterestAdmin` (sample rows, plus the pre-migration "not ready" state)
  side by side.
- **Migrations `0046_fsp_frc_interest.sql` and
  `0047_fsp_frc_interest_parent_email.sql` must be applied manually** in the
  Supabase SQL editor, in order, after `0045`.

