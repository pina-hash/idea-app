---
title: "IDEA Armory projects linked to a class: the roster becomes the team, each student a Last_First folder only they write in, team folders from the class teams, all enforced in the write functions, and a placeholder file per folder so Armory 0.5.1 shows it (ledger 0463, migration 0319)"
date: 2026-10-28
branches: [main]
migrations: ["0319", "0320"]
subsystems: ["Armory", "Connector", "Migrations"]
---

Ledger 0463, built 2026-10-28 evening for IDEA 100 Section 3 (21 students, first class 2026-10-29 8:00 a.m.). Spec: `docs/feedback/2026-10-28/QUEUE-0463.md`.

### The audit, answered from the tree before building

- **How folders existed.** There was no folder table. A folder was only `armory_files.folder` on some file (0231); `armory_valid_folder` and `armory_valid_segment` check a path's shape, `armory_folder_files` lists the live files at or under one, and `armory_rename_folder` (0232, 0236) and `armory_delete_folder` (0232) act on those files. An empty folder did not exist on the server at all.
- **How the current Windows client (0.5.1, released 2026-10-26, the newest) finds folders.** `armory_my_projects`, then `armory_list_changes` and `armory_project_files` per project (`src/Armory.Client/ArmoryApi.cs` in pina-hash/idea-armory). It makes a local folder only when it downloads a file into it (`SyncEngine.Actions.cs` `DownloadAsync`; the platform's replace creates the parent), and it never downloads a file whose `current` is null (`SyncEngine.View.cs`: such a row reads "No first version"). Its window lists folders that exist on disk (`localFolders`). Its own docs say "the server keeps no empty folders" (ENGINE.md, Window actions). So the only way a folder reaches a 0.5.1 lab computer with no client change is a file with a real version inside it.
- **Who could write where.** Any member could create, check out, check in, move and rename anywhere in a project (0231 to 0236). Leads (`armory_can_take_back`: mentor, CAD lead, instructor, site admin) could also force check in and move over someone else's checkout.
- **`armory_add_member` and the people picker.** The RPC overwrites an existing member's role (armory.md, "An add is never a role change"); the website's `addPeople` avoids that client side. A link that reused it would demote a mentor on the roster, so the link inserts only people who are not members.
- **Classroom storage.** `classroom_sections` (0082, teacher of record `teacher_email`), `classroom_enrollments` keyed (section, email) with `display_name` ("Last, First Middle" from the roster import) and `active`; teams are `classroom_team_sets`, `classroom_teams` (`name`, `team_number`) and `classroom_team_members`, and a section's current draw is `_classroom_section_team_set` (0302, the newest posted, visible draw). Managers are excluded from a roster by `_classroom_manages_section_email` (0138).
- **An existing link.** None: nothing tied an Armory project to a section.
- **Free migration numbers.** Main held 0314 (this ledger, applied) and 0315 (ledger 0457, applied 21:03Z); 0319 was next.
- **The apply path.** `.github/workflows/migrate.yml` applies the lowest unapplied file through `tools/apply-migration.mjs` as `idea_migrator`, one per run, chaining after a clean apply, refusing top-level DML, destructive DDL and anything not claimed by exactly one ledger entry.

### What 0319 does

- Four tables (RLS on, no policy, no client grant): `armory_project_sections` (one class per project), `armory_section_members` (who the link added, so only they are ever removed), `armory_folders` (each class folder: personal with its owner, or team with its team) and `armory_folder_writers`.
- `armory_link_section(project, section)`: one call, one connector confirmation, adds every active roster student as student and the teacher of record as instructor, never touching anyone already a member (their role is kept and reported back). Each student gets `Last_First` (`_armory_person_folder`: letters and digits only; a clash on the roster or with an existing folder adds the middle initial, then a number). A folder, once made, keeps its name.
- A trigger on `classroom_enrollments` keeps a linked project on its roster: a student who joins gets membership and a folder at once; a student the link added who leaves (inactive or deleted) is removed and their files stay. The trigger catches its own errors and raises a warning only, so it can never fail an enrollment write.
- `armory_unlink_section` stops following and changes nobody. `armory_make_personal_folders` re-runs the sync. `armory_make_team_folders` makes `Teams/<team name>` for each team of the current draw, replaces each folder's writers with the team's members on every run, takes over an existing folder of the same name, and never moves or removes a file (the test counts move, tombstone, rename and delete changes before and after: equal).
- `armory_folder_list` (folders, kind, owner, writers, file count without the placeholder) and `armory_project_class` (the linked class) for the website and the connector.
- **The write rule, in the database.** `_armory_folder_rule` finds the class folder governing a path (deepest prefix); `_armory_may_write_folder` passes where no rule applies, for a lead, and for the folder's writers. Added to `armory_create_file`, `armory_acquire_lock` (so `armory_lock_files` per file), `armory_move_file` (source and target), `armory_rename_folder` and `armory_delete_folder` (a class folder, or a folder holding one, is reshaped only by a lead; inside one, only by its writers); `armory_commit_version` (and so `armory_commit_version_with_release`) keeps a check in by a lock holder who may no longer write as a side version, reason "not your folder". The refusal is SQLSTATE `PT403` (PostgREST answers HTTP 403) with the student's words, "This is Ben's folder. Save your work in your own folder." (the first name from the roster), DETAIL `{reason: not_your_folder, folder, kind, owner}`, no address. Every replaced body is the deployed one with only lines marked 0319 added; signatures unchanged.
- **Why PT403 and what 0.5.1 shows.** 0.5.1 reads 42501 as "you may no longer be in this project" and asks whether the project was deleted, which is wrong for a folder refusal; PT403 is none of the codes it branches on, so a refused create shows its generic "The server didn't take it this time. It stays on this computer" and a refused check out shows "The server said: This is Ben's folder. Save your work in your own folder." (`BatchRefusalWords`). The student's file never reaches the classmate's folder on the server either way.
- **The placeholder, and why.** Because 0.5.1 learns folders only from files with versions (above), every class folder gets `README - <folder>.txt` (a file name is unique per project, so the folder is in it), one real version authored by whoever made the folder, whose bytes are one of two fixed texts (`$lib/armory/placeholders`; SHA-256 and length are literals in 0319, `_armory_placeholder_hash`, held equal by `tests/armory-class-placeholders.test.ts`). `handleBlobUrl` stores those bytes in R2 by a presigned PUT the first time a member's computer asks to GET them (only for that hash with that exact length, only after the membership and hash-in-project checks), so no person uploads anything. `armory_folders.placeholder_file_id` marks it; it is not counted as work. A removed placeholder is made again on the next sync.

### The website and the connector

- The Project view gains a Class panel (`ArmoryClassLink.svelte`, `$lib/armory/class-link.ts`): Link to a class (two presses, the cost said before the second), Make team folders from class teams, Unlink, and a disclosure of the class folders with who can save in each.
- Six hand entries in `registry/armory.yaml`: link, unlink, make personal folders, make team folders at `confirm` (the link adds many people, so one preview and one confirmation; nothing reverses a made folder); the folder list and the project's class at `read`.

### Measured

- `tests/db/armory-class-projects.test.ts`, 25 tests, on the tree short of 0319 seeded through the deployed RPCs: the deployed-app corpus on an unlinked project answers identically before and after (each call rolled back); a re-paste changes no catalog object.
- Mutation proof, permissive direction: `_armory_may_write_folder` made to return true for everyone; 9 of 25 failed (the classmate create, check out, batch check out, demoted check in, move, rename and delete, team folder writes, the roster-moves count); restored byte-identically (md5 428c4ad9eabb52e49df469c6986a7ac9 before and after) and green again.
- `svelte-check`: 0 errors, 33 warnings in 18 files (with placeholder public env values in a gitignored `.env`; without them this container reports 20 env-only errors).

### Not verified, and why

- The live apply, and a real lab computer running 0.5.1 showing the folder: this container cannot reach the database or a Windows lab machine. The first R2 PUT of the placeholder is untested against real R2 (the fake fetch in `tests/armory-endpoints.test.ts` stands in).

### 0320: the WHERE pg-safeupdate demands

After 0319 applied (01:40Z), a connector preview of `armory_link_section` on production answered 21000 "DELETE requires a WHERE clause": `_armory_sync_section` empties its temporary roster with a bare delete, and the hosted project loads pg-safeupdate for API requests (0317 met the same thing for tournaments). The test database does not load it, so 0319's suite could not see it. 0320 re-creates that one body with `where true`; `tests/db/armory-class-projects.test.ts` now scans every Armory function body on the chain for an UPDATE or DELETE with no top-level WHERE (0317's rule), with 0319's own bare delete as the planted control. Nothing had been linked before it (0319's notice: 0 projects linked), so nothing needs repair. Undo: none needed; 0319's body refuses on production.
