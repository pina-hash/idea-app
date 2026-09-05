# 0033 A face beside a name, wherever a name appears
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/Avatar.svelte`, `src/lib/avatars.ts` (conditional), the avatar wiring in `ProfileMenu.svelte`, `PeoplePanel.svelte`, the student identity row in `GradingConsole.svelte` and the notebook's student rows, `supabase/migrations/0179_*.sql` (conditional), `src/routes/dev/avatars/**`, `tests/avatar*`, `tests/db/avatar*`, `tools/browser-verify/routes/avatars*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0033-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0179, only if proven. 0177 and 0178 reserved. Highest on origin/main at issue: 0176
- Status: pushed
- Branch: assigned by the harness
- Notes: An instructor asked for profile pictures wherever a name appears. An
  `avatars` bucket already exists and `ProfileMenu` already renders one, so
  this is almost certainly a REACH problem rather than a build problem, which
  is the shape four out of four such items in this repository have had.

  This bundle carries a privacy question that outweighs its difficulty. A
  face is personal data about a minor. Every surface that gains one is a
  surface where a student's face becomes visible to whoever can see that
  surface, and the reads differ: a roster is staff-only, a grading console is
  staff-only, but a notebook review surface may be reachable by a student
  reviewer. The audit establishes who can see each surface BEFORE anything
  renders a face on it, and any surface where the answer is unclear gets no
  avatar.

  Deliberately excluded: letting a student upload or change an avatar, which
  is a separate consent and moderation question; any public or anonymous
  surface, including the maps viewer; and any surface a student reviewer can
  reach unless the audit proves it is already showing that student's name to
  the same audience.
