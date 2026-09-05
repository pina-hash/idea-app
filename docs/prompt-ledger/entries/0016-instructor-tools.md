# 0016 Classroom instructor tools: roster export, email the class, a picker, and the hall pass limit
- Issued: 2026-09-02
- By: router chat for IDEA portal work
- Owns: `src/lib/classroom/PeoplePanel.svelte`, `HallPass.svelte`, `InstructorCopy.svelte`, `roster-export.ts` (new), `picker.ts` (new), `src/routes/classroom/people/**`, `supabase/migrations/0174_*.sql` (conditional), `src/routes/dev/instructor-tools/**`, `tests/classroom-roster-*`, `tests/classroom-picker*`, `tests/classroom-hall-pass*`, `tests/db/classroom-hall-pass*`, `tools/browser-verify/routes/instructor-tools*.mjs`, the generated counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0016-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0174, only for the hall pass. 0171 taken, 0172 reserved for 0013, 0173 for 0015. Highest on origin/main at issue: 0171
- Status: pushed
- Branch: `claude/classroom-instructor-tools-040i06`
- Notes: Four instructor reports on the roster and hall-pass surfaces.

  "Students can spam bathroom pass" is the one with a real cost.
  `HallPass.svelte` says so in its own comment around line 370: nothing
  enforces a time limit. A pass that can be taken repeatedly is a pass that
  stops meaning anything, and the instructor finds out afterwards.

  The other three: no roster export; no way to email a whole class or start
  a draft addressed to it; and no picker for choosing teams, presentation
  order and the like, which is currently done by hand.

  Deliberately excluded: the six classroom feed and item files, which prompt
  0012 owns and has finished; due-date highlighting, which lives in the feed
  and belongs to whoever takes that surface next; and notebook check-in
  editing, which is the notebook rather than the classroom.
