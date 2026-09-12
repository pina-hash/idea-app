---
title: "IdeaCAD's RPCs gain one document store and a stale-safe autosave machine"
date: 2026-09-12
branches: [work]
migrations: []
subsystems: ["IDEACAD", "Classroom", "Transports"]
---

IdeaCAD's ten RPCs were deployed, and the classroom item route constructed their transport,
but no object consumed it. The visual editor could build a blade entirely in component-local
state and lose it all. This bundle creates the state boundary the following UI lane can mount;
it deliberately does not touch that lane's components or any migration.

## One contract owns all persistence

`IdeacadStore` is the UI contract. It opens the student's document and owns create, edit/save,
rename, reposition, delete, active selection, prediction and commit. `IdeacadStoreState` is an
immutable snapshot with a Svelte-compatible subscription, but the implementation has no rune
or DOM dependency, so its ordering guarantees can be tested under deterministic timers.

The transport is now typed against the rows and payloads 0201 actually returns. In particular,
save is a discriminated union: success carries the written concept; stale carries
`{ ok: false, reason: 'stale', concept: <stored row> }`. Treating both as a concept would be the
silent overwrite this layer exists to prevent.

## The autosave machine

The production debounce is **750 ms**. CAD inputs commonly emit many events during a drag or a
short numeric edit, so writing every event needlessly queues old geometry. At the other end,
750 ms keeps the ordinary memory-only window below one second. The interval is exported so the
UI can describe it and tests do not have to infer it.

Edits advance a client revision and replace local features immediately. One timer represents
the entire pending burst. A write captures its revision and features. If another edit arrives
while it is in flight, the acknowledgement is not allowed to replace the newer local row; when
the old write settles, the machine writes the latest queued revision immediately, without a
second debounce. Intermediate revisions are intentionally coalesced. There is never more than
one write in flight.

A thrown transport error leaves the latest local row intact and puts its message in `error`.
It does not retry invisibly. A subsequent edit or explicit save is the student's retry.

A stale result is different from a network failure and is terminal for automatic saving. The
local row remains the primary concept, including the student's features and proposed revision;
the database row is exposed separately as `conflictedServerConcept`, phase becomes `conflict`,
and the machine does not spin. A later UI must make reconciliation explicit rather than guess
which work to discard.

## What was proved

The unit store test uses deterministic timers and injected transports. Three rapid edits become
one RPC containing only the third feature tree. A deferred first RPC followed by a newer edit
becomes exactly two serialized calls and ends with the newer features. Stale and thrown results
both retain the student's tree and expose different states.

The database test boots embedded Postgres, applies the full migration directory unmodified,
and creates the course, section, enrollment, assignment and editor through real RPCs. It proves
open -> edit -> save -> reopen, proves equal revision returns stale and preserves the database
tree, and drives save, metadata, delete, active, prediction and commit as a second student; all
six reject and the owner's row remains unchanged.

Mutation proofs were run one relevant file at a time. Replacing the newest acknowledged tree,
overwriting local features on stale, disabling 0201's stale predicate, and removing the owner
predicate from save each reddened its corresponding test. Each source or migration was copied
before mutation and restored from that copy; SHA-256 equality confirmed byte-identical restore.

No browser measurement was made. This bundle changes no rendered surface and Chromium is not
available in the agent environment. No production connection was attempted. Migration guard
and trace produced their documented environment failures because this checkout has no
`origin/main`; this bundle has no migration. The full suite reached all 405 files: 7,808 tests
passed, six skipped, and one unrelated workflow assertion failed because its January schedule
calculation returned hour 24 rather than the expected 00:00-02:00 interval.
