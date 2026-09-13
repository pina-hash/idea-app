# 0218 A departed student's IdeaCAD document is archived, not lost, and an instructor can show it to a class

- Issued: 2026-09-13
- By: router chat
- Owns: `supabase/migrations/0214_*.sql`, the archive RPCs it adds, the
  instructor surface that reaches archived work, `tests/db/ideacad-archive*`,
  `tests/dom/ideacad-archive*`, `docs/decisions/entries/29-*`,
  `docs/prompt-ledger/entries/0218-*`, and its own `docs/history/` entry.
  Ledgers 0216 and 0217 run alongside; `ItemDetail.svelte` is 0217's and was not
  touched.
- Migration permitted: exactly one. **Claims: 0214.** Highest landed on
  `origin/integration` at issue: 0211. `0212` is HELD by ledger 0207 on
  `claude/busy-feynman-aupq55` and `0213` by ledger 0212 on
  `claude/sharp-einstein-cqrnx6`; `node tools/migration-claims.mjs` reports
  `next free 0214`, and 0214 is absent from both of its lists. No ref anywhere
  carries a `supabase/migrations/0214_*` file.
- Status: pushed
- Branch: `claude/youthful-lovelace-kg9482`, branched from `origin/integration`
  at `9b010f53`.
- Notes: Decision 29, answered by Mr. Pina on 2026-09-13, in his own terms: when
  a document's owner leaves a section the document AND ALL ITS WORK IS ARCHIVED,
  NOT DELETED, and stays accessible to the admin instructor; if the instructor
  shares an archived document with a class, those students get access to it too.
  His reason is the design constraint rather than a footnote -- he regularly
  brings up past student work to show current students as reference, and work
  from students who have since left is exactly what he wants to be able to show.

  WHAT WAS ALREADY TRUE, VERIFIED BY READING AND THEN MEASURED. The instructor's
  READ was already item-keyed and needed no change: `_ideacad_can_read_document`
  (0205) is `role is not null or _classroom_manages_item(the document's item)`,
  and `_classroom_manages_item` reads `classroom_postings` and never
  `classroom_enrollments`. The four select policies all delegate to it, and so do
  0207's part reader and 0209's history policy. What was NOT true is that
  anything would LIST it: `ideacad_roster` drives off the enrollment and
  left-joins the document onto it. The reach was there; the listing was not. That
  is why this bundle is a new item-keyed function and not a new policy.

  THE 0213 CENSUS IS NOT WEAKENED AND ARCHIVING DOES NOT UNLOCK A REMOVAL. 0214
  names `classroom_remove_enrollment` nowhere, an archived row is still a row,
  and that count has no `archived_at` term -- so a student with IdeaCAD work is
  refused before this file and refused after it. The two migrations are
  independent and may be applied in either order. Proven three ways rather than
  argued: the deployed body is byte-identical across a real pre-0214 database,
  the exact count 0213 takes still answers 1 for an archived document, and 0138's
  four-way census still refuses end to end through the real RPC.

  THE FOURTH PIECE REVERSES A STATED DEFAULT, so the migration's header names the
  four narrowings that buy it and says plainly which are the builder's judgement
  rather than his: a class grant is ALWAYS a viewer (no role column exists, so it
  is a property of the schema); only an ARCHIVED document may be shared with a
  class; the target section must be one the assignment is posted to; and the
  owner's address is shown rather than redacted, with the surface saying so in
  words before the press. The third is the one with a real cost and it is written
  into decision 29 as the open half.

  A DEFECT IN 0205 WAS FOUND BY A TEST AND FIXED HERE.
  `ideacad_open_shared_document` computed `canWrite` from the ROLE rather than
  from `_ideacad_can_write_document`, so an archived document told its own owner
  it was writable while every write refused -- a full set of editing controls
  whose only possible outcome is a refusal. It now asks the same predicate the
  writes ask.

  Grant shape follows `0166`: revoke from `public, anon, authenticated,
  service_role` BY NAME, then grant back deliberately, on the functions AND the
  new table, because `revoke ... from public` removes neither the direct `anon`
  execute grant nor the seven table privileges this project's default privileges
  write at creation.

  THE MIGRATION IS NOT APPLIED. It is Mr. Pina's to paste, so
  `tests/db/migrations-applied-record.test.ts` reports `0214` missing and that is
  the mechanism working rather than a defect to paper over -- ledger 0207 met the
  same collision on `0212` and left it for the same reason. Writing a record for
  an unapplied migration would make the one property that directory has false.
