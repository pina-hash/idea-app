# 0212 `classroom_remove_enrollment` counts four kinds of work and IdeaCAD is not one of them

- Issued: 2026-09-13
- By: router chat
- Owns: `supabase/migrations/0213_*.sql`, `tests/db/classroom-remove-enrollment*`,
  `docs/prompt-ledger/entries/0212-*`, and its own `docs/history/` entry. NO FILE
  UNDER `src/` unless a refusal message lives there, and the session says so if it
  does.
- Migration permitted: exactly one. **Claims: 0213.** Highest on origin/main at
  issue: 0211. `0212` is HELD by ledger 0207 on `claude/busy-feynman-aupq55`;
  `node tools/migration-claims.mjs` reports `next free 0213` and 0213 is absent
  from both its lists.
- Status: issued
- Branch: `claude/sharp-einstein-cqrnx6`, branched from `origin/integration` at
  `34a44f2d`.
- Notes: The defect was found by ledger 0206 on 2026-09-13 and REPORTED, not
  fixed. `classroom_remove_enrollment` (0138) is a hard delete whose refusal
  counts four kinds of student work scoped through `classroom_postings`. IdeaCAD
  is absent from that census while `ideacad_roster` drives off the enrollment, so
  a student whose only work is a finished IdeaCAD part is removed outright, the
  refusal never fires, and the document survives with nothing able to list it.

  THIS BUNDLE IS THE CENSUS, NOT THE ARCHIVE. It widens the count so such a
  removal refuses with a count, exactly as the other four already do. Decision 29
  is answered -- a departing owner's document is ARCHIVED and stays reachable by
  the admin instructor, and an instructor who shares it with a class gives those
  students access -- but that is a document state, an archive path and an
  instructor surface, and it is a bundle of its own. Explicitly NOT built here.

  Grant shape follows `0166`: revoke from `public, anon, authenticated` BY NAME,
  then grant back deliberately, because `revoke ... from public` does not remove
  the direct `anon` grant this project's default privileges write at creation.
