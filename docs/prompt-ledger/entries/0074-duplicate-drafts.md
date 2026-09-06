# 0074 Duplicate drafts in production, and the count nobody has
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: a panel entry in `InstructorTools.svelte`, `src/routes/classroom/[sectionId]/duplicates/**`, `DuplicateDrafts.svelte` (new), at most one read-only migration, `src/routes/dev/duplicate-drafts/**`, `tests/classroom-duplicate-drafts*`, `tests/db/duplicate-drafts*`, `tools/browser-verify/routes/duplicate-drafts*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0074-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, read-only, number taken at commit time. Highest on origin/main at issue: 0185
- Migration taken: `0186_classroom_duplicate_drafts.sql`. READ ONLY: it counts and lists, and deletes nothing. It was NECESSARY rather than convenient -- a browser-side count off the existing grants under-reports `classroom_submissions` in the unsafe direction, because the reviewer arm of its RLS policy requires the student to hold an enrollment row. NOT APPLIED anywhere; Mr. Pina applies it by hand, after `main`'s 0185.
- Status: pushed
- Branch: `claude/duplicate-drafts-count-wzworl` (from `origin/integration` at `13d1747`)
- Notes: Prompt 0061 found why Save draft made copies: it ran the
  end-of-session reset, so it dropped the item id and emptied every field.
  Five presses produced five rows and wiped the title, and separately
  `SaveState`'s durability net fired on every tab switch while `dirty`, which
  includes `failed`, so one press with a lost response plus six tab switches
  wrote seven rows with nobody pressing anything.
  
  It fixed both. It also said plainly that production almost certainly holds
  surplus copies and that THE COUNT IS UNKNOWN, because no cloud session can
  read the database. Prompt 0073 has since proved that is permanent: the
  egress proxy accepts a CONNECT to 5432 and then carries no bytes.
  
  So the count has to come to Mr. Pina through the app, not through a query
  he runs. He has said the interruption is the cost, not the typing, and a
  cleanup that needs him to paste SQL and read a result set is the shape he
  is trying to get away from.
  
  0061 wrote the grouping in its history entry: `author_email, kind, title,
  body` where `published = false`, keeping the oldest. And it named the trap:
  a surplus copy is a FULL duplicate, and anything with student work attached
  is not a surplus copy whatever it looks like.
  
  Deliberately excluded: deleting anything automatically, which is Mr.
  Pina's call on content teachers wrote; `ContentComposer`, fixed by 0061;
  and any write to `classroom_items` beyond the existing delete endpoint.
