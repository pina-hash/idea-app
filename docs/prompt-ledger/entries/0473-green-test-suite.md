# 0473 A green test suite on main

- Issued: 2026-10-29
- By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List", sending a screenshot of red CI checks on main ("You good?"). Report f1bafc34 asked for the same.
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: the failing tests and the code or fixtures they test, as listed in this entry's queue below; `tests/db/coin-hallpass-minutes.test.ts` (a midnight-dependent clock); its `docs/history/` entry; this entry.
- Does not touch: anything lane 0469 or 0472 is editing (type, taps and width; the launcher), and student-facing content under `materials/` except where the validator, not the content, is wrong. A content fault in a material, or a header fault in a mirrored standard, is written up for the chat that owns it, never fixed here.
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo
- Branch: main (solo)

## Queue

CI on main has been red for days. Failing on af159374 (2026-10-30):
- `tests/classroom-panel-layout-render.test.ts` (4 tests, failing since before 2026-10-21)
- `tests/html-assignment-pacing.test.ts` on materials/idea209h/launcher-design and launcher-prototype-and-detail-design (new 2026-10-29, after the Launcher date commits)
- `tests/standards-version-header.test.ts` on IDEA_MORNING_ANNOUNCEMENTS.md (header 1.6, changelog 1.7, since 481afb99)
- the known set from docs/history/work-0441.md: cert-0262-exam, cert-flow, feedback-round-0380-foundry, ideacad-feature-graph-storage
- `tests/db/coin-hallpass-minutes.test.ts`, which fails only in the 35 minutes after midnight Pacific

For each: find the real cause, then fix the code, fix a stale test, or retire a test whose rule no longer exists (saying why). Never loosen a test to pass a real bug. Goal: the full `npm test` and CI green on main.
