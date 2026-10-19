---
title: "The Armory Drive mirror asked for a column that does not exist: it now reads `armory_projects.archived_at`, the column migration 0232 made (`main`, no migration)"
date: 2026-10-19
branches: [main]
migrations: []
subsystems: ["Armory", "Tooling"]
---

The first real run of `armory-drive-mirror.yml` (2026-10-19, run 2, after the ten
`ARMORY_MIRROR_*` secrets were set) stopped at its first read: `reading
armory_projects failed (400)`, Postgres 42703, column `armory_projects.archived`
does not exist, hint `archived_at`. Migration 0232 records archiving as
`armory_projects.archived_at timestamptz` and there never was a boolean `archived`.
The mirror's tests ran against a fixture that carried the same wrong name, so they
passed. Nothing in Drive had been touched; the run stopped before any write.

Changed: the select in `tools/armory-drive-mirror.mjs`, the project mapping in
`tools/armory-drive-mirror-plan.mjs` (`archived` is now `archived_at != null`),
the dry-run fixture and the two test rows. The manifest's `archived` yes/no column
is unchanged.

Measured: `tests/armory-drive-mirror.test.ts`, 16 of 16 pass, on 2026-10-19.

NOT verified: a real mirror run against production. That is the next step.
