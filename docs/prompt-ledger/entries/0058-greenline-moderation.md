# 0058 GREENLINE moderation: student work waiting on a teacher who cannot see it
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `src/lib/greenline/**`, `src/routes/greenline/**`, its dev harnesses, at most one migration (number taken at commit time), `tests/greenline*`, `tests/db/greenline*`, `tools/browser-verify/routes/greenline*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0058-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0181
- Status: issued
- Branch: assigned by the harness
- Notes: GREENLINE has two moderation queues and neither has been put to a
  teacher. `0051` created decals with a `pending -> approved` or
  `pending -> needs_revision -> pending` flow, explicitly never a blunt
  reject, mirroring the FRC modeling gate from `0042`. `0057` created
  community tracks with reports, ratings and attempts beside them, and
  `TrackModerationPanel.svelte` sorts by pending, reports, rating and
  completion.

  The project's own record says the UGC moderation pipeline requires a
  production migration apply confirmation and has not had one, which means
  nobody has established that a student's submission actually reaches a
  teacher's queue and comes back.

  The shape of the failure, if it exists, is quiet in both directions. A
  student uploads a decal, sees it in their own garage because `0051` makes
  it usable immediately in their own context, and believes it is published. A
  teacher opens a queue that does not list it. Nobody is told anything.

  This bundle establishes what actually happens, end to end, driven as a real
  student and a real teacher, and fixes whatever is broken inside GREENLINE.

  Deliberately excluded: every file outside `src/lib/greenline/` and
  `src/routes/greenline/`, which is what makes this safe to run beside four
  other lanes.
