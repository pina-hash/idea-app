---
title: IdeaCAD joins the reserved short-link namespace and the refusal sweep follows the route tree
date: 2026-09-14
branches: ["codex/reserved-short-link-slugs-0234"]
migrations: ["0215"]
subsystems: ["short-links", "ideacad"]
---

### What changed

The top-level route audit found one and only one slug-shaped route absent from
`RESERVED_SLUGS`: `ideacad`. No slug-shaped entry under `static/` was missing.
The TypeScript mirror and database predicate now include it.

The creation-refusal sweep is now derived from the top-level names under
`src/routes/` and `static/`. It deliberately does not derive from either
`RESERVED_SLUGS` or the SQL predicate it exercises, so a new route produces a
new independent refusal case. The runtime TypeScript list remains explicit
because it is bundled for the browser and cannot read the repository, and the
Postgres function necessarily remains explicit because the database cannot read
the deployed SvelteKit route tree. The independent tree, TypeScript, and SQL set
comparisons make either explicit copy drifting a test failure.

### Migration and existing data

Migration 0215 is required even without a known collision: browser validation
is only friendly feedback, while `app_short_link_upsert` calls the database
predicate as its real guard. If an `ideacad` row already exists, 0215 moves the
whole row to the first free `ideacad-link` spelling and records its complete
before-state and new slug in `app_short_link_reserved_moves`. It prints the move
and a count. A replay sees no `ideacad` row, preserves the audit row, and makes
no second move. No link is deleted.

The production database was not reachable from this container, so whether the
conditional move will fire is intentionally answered by the migration's notices
when Mr. Pina pastes it, not guessed from the working tree.

### Verification

- The two short-link suites pass 61 tests, including a real-Postgres proof that
  a planted `ideacad` row is moved, audited, and unchanged by replay.
- `svelte-check` reports the established baseline: 0 errors and 37 warnings in
  20 files.
- Two independent scans find no dollar character in any SQL line comment in
  0215, and each scan catches the same forbidden character in a planted control.

### Not applied and not merged

Migration 0215 was not applied: this environment has no production migration
URL, and this prompt assigns the paste to Mr. Pina. Because the bundle carries
a migration, it must not merge before that hand application and verification.
