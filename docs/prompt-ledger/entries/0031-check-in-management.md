# 0031 Notebook check-ins: edit, reschedule, and delete one after it exists
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/notebook/SessionManager.svelte` (the notebook-side check-in editor; the prompt named `src/lib/notebook/CheckInStager.svelte`, which does not exist), the check-in paths in `src/lib/notebook/admin-actions.ts` (the prompt named `src/lib/notebook/transports.ts`, which does not exist), `DocumentationCheck.svelte`, `src/lib/classroom/CheckInStager.svelte`, `src/routes/classroom/**/check-ins/**`, `supabase/migrations/0177_*.sql` (conditional), `src/routes/dev/check-in-manage/**`, `tests/notebook-scheduled-check-ins.test.ts`, `tests/classroom-notebook-checkins.test.ts`, `tests/db/notebook-check-in*`, `tools/browser-verify/routes/check-in-manage*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0031-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0177, only if proven necessary. 0176 reserved for prompt 0030. Highest on origin/main at issue: 0175
- Status: pushed
- Branch: `claude/notebook-check-in-management-y5z4b4`
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

- Outcome: Every operation the prompt asked for already existed and was already
  reachable. `notebook_admin_upsert_session`'s trailing `p_id` IS the edit,
  `notebook_admin_delete_session` is the delete, and `SessionManager.svelte`
  mounts all of it at `/notebook/review` behind the Check-ins mode. **No
  migration was written**; 0177 is unused and still free.

  What was actually wrong was what a teacher is told. A rename landed silently
  under work already filed, and the delete confirm stated the rule with no
  number in it. An edit is now classified by what it moves: a reschedule warns
  about nothing and says Reschedule, a rename names how many students have
  filed. The delete confirm names the count before it destroys anything, and
  names the excusals it destroys -- the one thing a delete really does destroy,
  which nothing on any screen had ever mentioned.

  Handed over: `ItemDetail`'s "edit the existing one" message that never says
  where, the missing classroom-side tab (four sites in `nav.ts`, not one), and
  `notebook_admin_delete_session` not returning the excusal count it already
  computes.
