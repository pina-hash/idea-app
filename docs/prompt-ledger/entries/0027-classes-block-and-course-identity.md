# 0027 The Your Classes block, and a course code that is doing two jobs
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/curriculum.ts`, the hero course tile in `src/routes/+page.svelte`, `src/lib/classroom/ClassroomFeed.svelte`, `feed.ts`, `src/routes/dev/home-order/**`, `tests/curriculum*`, `tests/classroom-feed*`, the course-count rows in `tests/home-order-and-accent.test.ts`, `tools/browser-verify/routes/home-order*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0027-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0175
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0024 handed both of these forward with measurements.

  THE COURSE TILE COUNTS WRONG, and the cause is an identifier doing two
  jobs. `activeCourseCount()` is `new Set(SECTIONS.map(s => s.course)).size`,
  which is correct arithmetic over incorrect data: `IDEA 100-1`, `IDEA 100-2`
  and `IDEA 100-3` are three ROTATIONS of one course with the rotation number
  written into the course code, while `IDEA 209H`'s three sections all carry
  `IDEA 209H` and collapse properly. The tile reads 4 where the function's
  own contract says 2. The bug is not in the counting.

  THE CLASSES BLOCK IS THE REAL SCROLL. 0024 measured a student's class block
  growing 616px per class, putting the first app card 1.76 screens down with
  one class and 4.07 with four, at 375px. It declined to reorder the page,
  correctly, because reordering moves that scroll onto the deep links rather
  than removing it. The height is the defect.

  Due-date urgency was reported separately and lives in the same cards: an
  instructor asked for assignments to stand out as their due date
  approaches.

  Deliberately excluded: the launcher ordering, which 0024 just landed; the
  empty-classes placeholder, which 0024 fixed; and any migration, since
  `curriculum.ts` is hand-maintained metadata.
