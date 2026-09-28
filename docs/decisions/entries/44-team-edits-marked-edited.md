# 44 A posted draw can be edited by hand, and says it was

- Raised: 2026-09-28  By: feedback round 2026-09-28, report R18.
- Status: DECIDED 2026-09-28 by Mr. Pina ("Mark it edited").
- Build: OPEN, ledger 0347 (one session, one push), `docs/feedback/2026-09-28/QUEUE.md`.
- Decision: A saved or posted set of teams can be changed after the fact (a student moved between teams by drag, or by a Move to control as the non-drag path; a team renamed). The edit happens in place, the draw keeps its seed, and the draw is marked as edited by hand on the People tab, on the class page and in the CSV.
- Default this assistant would pick: the same.
- Why it was blocked on him: CLAUDE.md stores and exports the seed because it is what makes a draw checkable; a hand edit breaks that match, so either the record says so or every edit becomes a new draw.
- What it unblocks: ledger 0347 (its SQL is half of migration 0230, shared with decision 45).
- Context: `docs/feedback/2026-09-28/TRIAGE.md` R18; `supabase/migrations/0223_classroom_teams.sql`; CLAUDE.md "CLASSROOM TEAMS", whose seed rule gains one clause in the build session.
