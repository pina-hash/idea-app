---
title: "Armory 0.3.3's four website requests in migration `0236`: an instructor can force a check in through one shared `armory_can_take_back`, `armory_remove_empty_file` removes a file with no first version (shown as No first version on the Files view, with a Remove key for leads), a lead moves or renames over someone else's checkout keeping the lock, and two computers with one name read NAME (abcd) on the team and checkout lists while the incident and note consoles show the machine id"
date: 2026-10-09
branches: [claude/pensive-lovelace-6f3qcv]
migrations: ["0236"]
subsystems: ["IDEA Armory", "Feedback console", "Migrations"]
---

**What changed.** pina-hash/idea-armory `docs/agent/website-requests-v0.3.3.md` asked for
four things; all four are one migration, `supabase/migrations/0236_armory_v033.sql`, plus
the website. `docs/ARMORY.md` carries the contract ("The v0.3.3 server contract
(migration 0236)").

1. **Instructors force a check in.** `armory_can_take_back(project)` (mentor, CAD lead,
   instructor, or a site admin) replaced the two inline role lists in `armory_my_projects`
   and `armory_break_lock`; `armory_break_locks` follows through `armory_break_lock`. The
   refusal text the app reads is unchanged.
2. **A file with no first version.** `armory_remove_empty_file(p_file, p_operation)`, for a
   caller the predicate admits; refused for a version (55000), a live lock (55006, the
   caller's own included), a non-lead (42501). One tombstone and one `tombstone` change
   with `reason: no_first_version`. The Files view says "No first version" instead of
   "Available" and offers Remove.
3. **Leads organize checked-out files.** `armory_move_file` and `armory_rename_folder` go
   over another person's lock for that caller and leave the lock alone; the change rows gain
   `checked_out_by` / `over_checkouts` on that path only.
4. **Same-named computers.** `labelProjectDevices` labels "IDEA-06 (a030)" on the Files,
   Checked out and Team views; `armory_app_incidents.machine_id` (stored, generated from the
   report) feeds the incident and note consoles.

**Load-bearing decisions.**

- **The one narrowing.** Before 0236 a CAD lead could make someone an instructor. With the
  instructor now holding Force check in, that would let a CAD lead hand out a power they
  cannot grant as CAD lead, so `armory_add_member` refuses it (`only a mentor may grant
  instructor`, `only a mentor may change an instructor`, both 42501). Every refusal that
  existed keeps its text, SQLSTATE and order; the website no longer offers CAD leads the
  role.
- **The website asks the server.** `armory_can_take_back` is granted to `authenticated`, so
  the project page reads the server's answer rather than a second copy of the role list; it
  answers false for a project the caller cannot see, so it reveals nothing. A database
  without it is `canTakeBack: null`, the old rule, and no Remove.
- **A lead moving a file nobody holds still has to check it out**, exactly as before; the
  request was over another person's lock only, and that is the narrowest reading.
- **No read RPC changed its answer.** Device labels are computed from ids the website
  already had (the team's devices and each file's lock); machine ids are read from a new
  stored column beside the unchanged admin lists, not from 1 MiB reports.

**Measured.** `tests/db/armory-v033.test.ts`: 23 tests, including a corpus of 22 calls
(refusals and answers) put to the deployed 0233 to 0235 bodies and again after 0236,
identical case for case, and `armory_my_projects` identical for everyone but the
instructor. Mutation proof on that file, each restored md5-identical: admitting `student`
to the predicate reddens 7 tests, dropping the instructor-grant guard 1, the version check
1, the lead check on a move 2. svelte-check: 0 errors, 37 warnings in 20 files (the
baseline).

**Applied.** `migrate.yml` applied 0236 to production from `main` at `57b0b3ca` on
2026-10-09T16:17:43Z, with the file's own self-check notice and all eight objects verified
present (`docs/migrations-applied/0236-main.md`).

**Not verified.** A signed-in page against the live database; Armory 0.3.3 itself reading the extra payload keys
(additive JSON keys; the app was not run here).
