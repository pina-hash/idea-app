# 0031 Notebook check-ins: edit, reschedule, and delete one after it exists
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/notebook/CheckInStager.svelte`, `DocumentationCheck.svelte`, the check-in paths in `src/lib/notebook/transports.ts`, `src/lib/classroom/CheckInStager.svelte`, `src/routes/classroom/**/check-ins/**`, `supabase/migrations/0177_*.sql` (conditional), `src/routes/dev/check-in-manage/**`, `tests/notebook-scheduled-check-ins.test.ts`, `tests/classroom-notebook-checkins.test.ts`, `tests/db/notebook-check-in*`, `tools/browser-verify/routes/check-in-manage*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0031-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0177, only if proven necessary. 0176 reserved for prompt 0030. Highest on origin/main at issue: 0175
- Status: issued
- Branch: assigned by the harness
- Notes: An instructor reported no way to edit or manage a notebook check-in
  once it has been created. `notebook_create_item_check_in` exists;
  a sweep for an edit or delete counterpart found none.

  A check-in is scheduled work that students answer, so an edit is not a
  free-form update. Changing the question under answers that already exist
  is the hard case and the reason this needs designing rather than adding a
  form: an instructor fixing a typo and an instructor replacing the question
  are different acts with different consequences for a student who already
  answered.

  Deliberately excluded: anything about how a check-in is graded or reviewed,
  which is a different surface; and `Disclosure.svelte`, which prompt 0018
  owns.
