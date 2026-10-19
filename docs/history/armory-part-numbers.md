---
title: "Ledger 0405: IDEA Armory -- the part number registry (scheme A) and the shared COTS library, on the server and the website (`lane-armory-part-numbers`)"
date: 2026-10-18
branches: [lane-armory-part-numbers]
migrations: ["0274"]
subsystems: [Armory, Migrations, Connector]
---

Ledger 0405 (solo, through the session queue) builds the part number scheme Mr. Pina chose
on 2026-10-18 (decision 41, "Part numbers, as answered", scheme A) so the SolidWorks add-in
(a later lane in pina-hash/idea-armory) has something to ask for a number. The prompt named
migration 0286; the next free number at landing was 0274, which is what the file carries.

## The audit, answered before building

- **Did anything already exist?** Yes, and not the scheme. 0231 carries
  `armory_projects.part_number_pattern` (default `5669-{YY}-{SS}{NN}`), the table
  `armory_part_number_allocations` (numeric subsystem 0 to 99, sequence 0 to 99) and
  `armory_allocate_part_number(uuid, int, int, uuid)`, which FILLS THE FIRST GAP; 0232
  re-signed it to number a seasonless project by the Los Angeles year. Nothing under `src/`
  calls it (grepped: no `allocate_part_number` and no `part_number` outside IDEA Maps), and
  the Windows app may, so it is left exactly as it was. There was no COTS table, no
  subsystem table and no part-number code in `src/lib/armory`.
- **How membership and roles are checked.** `armory_is_member(project)` (0231),
  `armory_require_role(project, roles, message)` (0231), `armory_can_view(project)` (0233:
  member or site admin, the website's read gate) and `is_admin()`. The 0233 shape is that a
  site admin acts as a mentor. 0274 reuses all four and adds no role list: taking a number
  is a member or a site admin; setting a project's prefix is `armory_require_role(...,
  mentor)` or a site admin; the library and the subsystem codes are
  `armory_parts_curator()`, "a site admin, or `armory_members.role = 'mentor'` on any
  project", which reads the same enum column.
- **What gives the prefix and the season.** The season is `armory_projects.season` (a full
  year, nullable since 0232), taken modulo 100, or the Los Angeles year for a project with
  none (0232's own rule for the old allocator). Nothing carried a team or course prefix, so
  0274 adds `armory_projects.part_prefix` (`5669` by default, two to ten capitals or digits),
  which a mentor sets for a class project (`IDEA100`).

## What changed

- **Migration 0274.** `armory_part_number_problem(text)` and `armory_cots_problem(text,
  text)`, the SQL statements of the two formats, answering null or the sentence a person
  reads. `armory_part_subsystems` (data, seeded with the nine codes inside a `do` block,
  extended by a curator, retired never deleted). `armory_projects.part_prefix`.
  `armory_part_numbers`, the registry: unique on the number across every project, foreign
  keys to the project and the file `ON DELETE SET NULL`, and a trigger that refuses DELETE
  and any renumbering, even by the table's owner. A purge's SET NULL clears the address,
  the file name, the description and made-from, so a deleted project leaves its numbers
  taken and nobody named (the `armory_purged_projects` rule). `armory_cots_parts`, the
  library, with a generated `cots_number`, a unique index on its upper case, and the same
  never-delete, never-renumber trigger. The writes are `armory_part_number_take`,
  `armory_part_number_describe`, `armory_set_part_prefix`, `armory_part_subsystem_save` and
  `_retire`, `armory_cots_add`, `_correct` and `_retire`; the reads
  `armory_project_part_numbers` and `armory_cots_list`. Every write is SECURITY DEFINER,
  takes no identity parameter, replays through `armory_replay`/`armory_remember`, and
  refuses by raising a SQLSTATE with a JSON detail carrying a `reason`. Grants are 0166's
  shape, named roles; the three tables grant SELECT to `authenticated` only (RLS on) and
  revoke everything else from `service_role` too, TRUNCATE included.
- **Numbering.** The next assembly is the highest assembly EVER taken under that prefix,
  season and subsystem plus one, and a part the highest part ever taken in that assembly
  plus one. Never the first gap, which is the difference from 0231's allocator and the
  reason a number cannot come back. The space is shared by every project with the same
  prefix and season (two robot projects in one season continue one sequence), serialized
  by an advisory lock on the stem after the project row is taken `for key share` (the
  Armory lock order). A part may only be taken in an assembly whose `00` row is on the same
  project.
- **Names, never addresses.** A number's row carries `assigned_name` (0233's
  `_armory_person`: display name, else full name). The project read adds the address only
  for a mentor or a site admin, the Team view's rule.
- **Website.** `src/lib/armory/part-numbers.ts` (format, parser, validator, sentences,
  grouping, search, refusal words); `ArmoryProjectParts.svelte` at
  `/armory/<project>/parts` (readouts, a Take a number form, how a number reads, a
  mentor's prefix form, then every number by subsystem and assembly with its revision chip,
  file link, made-from and who took it); `ArmoryCotsLibrary.svelte` and
  `ArmoryPartSubsystems.svelte` at `/armory/cots` (search by vendor and number, vendor keys,
  a curator's Add, Correct, Retire, and the subsystem codes). A Part numbers key in the
  project page's title bar and a COTS library key on `/armory`. Every write control is a
  transport handed in only when the database's own `can_*` answer says so; absent, the
  control is not rendered. `/dev/armory-parts` mounts the real components over memory.
- **The add-in's contract** is in `docs/ARMORY.md`, "Part numbers and the COTS library":
  the function, every argument and every refusal reason.

## Outside the Owns list, each forced

- `tests/db/armory-proposed.ts` and `tests/db/armory-proposed.test.ts`: the list of
  migrations that may name `armory_` gains 0274, which that test exists to require.
- `src/lib/server/connector/registry/armory.yaml`, the three generated connector files and
  `docs/connector/DESIGN.md` section 7: `tests/connector-coverage.test.ts` reddens on any
  new `.rpc('name')` and on any new migration (the schema count) until the overlay answers
  and `npm run connector:build` re-runs. The two reads are `call`/`read` entries; every
  write is excluded with the reason that a connector write needs a sample and its log
  tables, which is follow-up work, not this bundle's.
- `tools/browser-verify/routes/armory-parts.mjs` and `armory-parts-theme-space-white.mjs`,
  their `measured/` files and the README counts: a new `/dev` route moves the README's
  static region and `tests/derived-numbers.test.ts` reddens until `verify:readme` writes it.

## What was measured

- `tests/db/armory-part-numbers.test.ts`: 22 tests over the whole chain short of 0274,
  seeded through the real 0231 to 0273 RPCs (three projects, members, a file, and an
  old-style allocation, `5669-26-0300`), then 0274 on top. The old allocator answers
  `5669-26-0301` afterwards. Two callers at once: one holds the stem's lock in an open
  transaction, the other waits (observed in `pg_stat_activity`) and gets the next number;
  twelve concurrent takes get twelve different numbers, 0100 through 1200. A file removed
  keeps its number; a project deleted forever keeps its numbers with `project_id` and
  `assigned_by` null, and the next project continues past them. A re-paste changes no
  catalog object.
- `tests/armory-part-numbers-parity.test.ts`: 44 part number cases and 29 COTS cases put
  to both the SQL (read out of the migration file) and the TypeScript; 0 mismatches, 9 and
  11 valid respectively.
- Mutation proof against the db suite, permissive direction, restored from a copy and
  md5-checked equal: a DELETE let through (killed, 1 failed), a cascading project key with
  DELETE let through (killed, 1), the take role gate opened (killed, 1), the curator gate
  opened (killed, 4), the advisory lock removed (killed, 1). 5 of 5.
- `npm run verify:browser` on the two new specs: 4 route/width runs (375 and 1440, the
  default theme and Space White), 142 measurements, 0 outside threshold. 0px horizontal
  overflow at both widths; smallest tap target 44px (73.2x44 subsystem keys); smallest
  contrast 6.47:1 dark and 7.76:1 Space White. Screenshots looked at; the two top panels
  were stretching to each other's height and now start at the top.
- `svelte-check` with placeholder public values: 0 errors, 33 warnings in 18 files, the
  baseline.
- The full suite, once: 852 files, 15,984 passed, 1 failed, 6 skipped, read off the
  summary line and stderr. The one failure was real and forced: `tests/db/armory-proposed.test.ts`
  holds the list of migrations allowed to name `armory_`, and 0274 joins it (the list in
  `tests/db/armory-proposed.ts`, outside the Owns list). Three more FILES failed before any
  assertion because this checkout had no `origin/integration` ref and a shallow history
  (`apply-migration-guard`, `apply-migration-trace`, `identity-style-shared`); with the refs
  fetched, those four files pass 103 of 103.

## What was not verified

- The live database: no session here can reach production. `migrate.yml` applies 0274 on
  the push to `main`; whether it did is that run's own summary.
- A signed-in session against the real routes: the harness mounts the real components over
  memory; the routes' loads and transports were type-checked, not driven.
- The SolidWorks add-in itself, which is a later lane.

## Deferred

- Connector writes for the new functions (a sample each, and the three tables in
  `src/lib/server/connector/log-tables.ts`).
- A `part_number_assigned` change-feed kind, for the add-in lane to propose once it knows
  how the Windows app treats an unknown kind.
- Clearing a COTS part's model file, and editing a number's description or revision from
  the website (the add-in's `armory_part_number_describe` does it; no website form yet).
- What happens to `armory_allocate_part_number` and `armory_part_number_allocations`
  (dropping them is a destructive migration and the Windows app's call, not this one's).
