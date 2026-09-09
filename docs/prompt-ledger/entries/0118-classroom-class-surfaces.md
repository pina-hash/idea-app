# 0118 Classroom class surfaces: the nine

- Issued: 2026-09-10
- By: Mr. Pina, from the nine class-surface items in his own words: the hall
  pass and class music (SIX, TEN), the folder and unit organizer (SEVEN,
  ELEVEN, TWELVE), and the editor and its files (FOUR, FIVE, EIGHT, NINE).
- Owns: `src/lib/classroom/ClassView.svelte`, `HallPass.svelte`,
  `SongQueue.svelte`, `UnitManager.svelte`, `ClassroomFeed.svelte`,
  `ContentComposer.svelte`, `ItemDetail.svelte`, `ItemBody.svelte`,
  `AttachmentList.svelte`, `FileUploadPanel.svelte`;
  `src/lib/classroom/attachments.ts`, `feed.ts`, `hall-pass.ts`,
  `file-upload.ts`, `composer-staging.ts`, `classroom.css`, and every export of
  `src/lib/classroom/transports.ts` EXCEPT the rubric ones;
  `src/lib/file-drop.ts`; `src/routes/classroom/**` except `**/grading/**` and
  `**/item/**/grade/**`; `supabase/migrations/0193_*.sql`;
  `src/routes/dev/classroom-*/**`, `src/routes/dev/composer-attach/**`,
  `src/routes/dev/hall-pass/**`; `tests/classroom-*`, `tests/dom/classroom-*`,
  `tests/db/classroom-*`; `tools/browser-verify/routes/classroom-*.mjs`,
  `composer-attach*.mjs`, `hall-pass*.mjs`; the generated regions of
  `tools/browser-verify/README.md`; `docs/prompt-ledger/entries/0118-*`, and its
  own `docs/history/` entry. NEW FILES this bundle created, added here the moment
  they existed so the collision check covers them: `src/lib/classroom/live.ts`,
  `src/lib/classroom/sort-drag.ts`, `src/routes/dev/classroom-tools/**`,
  `tools/browser-verify/routes/classroom-tools*.mjs`, `tests/classroom-live*`,
  `tests/classroom-sort-drag*`.
- Migration permitted: at most one. Claims: 0193.
- Lands on: `integration`. If it writes `0193`, it stops at its branch and does
  NOT merge to `main`: a migration is applied by hand in the Supabase SQL editor
  first, and this container cannot reach the production database.
- Status: issued
- Branch: `claude/classroom-class-surfaces-5wk29o`, branched from `origin/main`
  at `b03a9410`.
- Notes: four lanes run beside this one and none overlaps its ownership: 0117
  owns the portal (`src/routes/+page.svelte`, `src/routes/dashboard/**`,
  `AppLauncher`, `ProfileMenu`, `portal-apps.ts`, `src/routes/admin/**`,
  `ThemeRoot.svelte`); 0119 owns `src/lib/notebook/**` and
  `src/routes/notebook/**`; 0120 owns `src/lib/gauntlet/**`; 0121 owns
  `src/lib/site-versions.ts` and two legacy assignment files. Anything found
  outside this entry's paths is reported, never changed.

  `0193` is claimed here, in this first commit, whether or not the work ends up
  needing it. It is written only if ordering or top/bottom placement of an
  item's attachments genuinely needs persistence; if written it is NOT applied
  from here, and its `tests/db/` test and the SQL-editor verification query are
  reported with it.
