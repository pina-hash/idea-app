# 0170 IdeaCAD document state and durable autosave

- Issued: 2026-09-12
- By: router chat
- Owns: `src/lib/ideacad/transports.ts`, a NEW `src/lib/ideacad/store.ts`,
  `tests/db/ideacad-*`, `tests/ideacad-store*`, `docs/prompt-ledger/entries/0170-*`,
  and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0203
- Status: pushed
- Branch: `work`, branched from `main` at `37286982`
- Runs in parallel with: ledger 0171, which owns `BladeEditor.svelte`, `Viewport.svelte`,
  and `src/lib/ideacad/viewport/`; none is touched here.
- Notes: The ten production RPCs existed but the constructed transport was never consumed.
  This lane builds and documents the store contract only. Migrations 0201, 0202 and 0203
  are already applied and correct; no migration was written or changed.

## Outcome

`createIdeacadStore` now owns open, create, edit/save, rename, reposition, delete,
active selection, prediction and commit. Its 750 ms autosave collapses edit bursts,
serializes writes, and immediately follows an in-flight acknowledgement with the newest
queued revision. Errors remain visible in state. A stale response neither overwrites local
features nor retries: it exposes the server row separately in `conflictedServerConcept` for
an explicit resolution UI.

The typed transport boundary records 0201's actual save union. Unit tests prove rapid-edit
coalescing, the in-flight/newest-edit leg, stale retention, and failure state. Embedded
Postgres runs the full real migration chain and proves open/edit/save/reopen, stale refusal,
and all six ownership-sensitive mutations. Mutation runs reddened for newest-edit retention,
stale retention, the SQL stale predicate, and the SQL owner predicate; every mutated file was
restored byte-identically.

No browser pass was run: this bundle changes no mounted UI, and Chromium is unavailable in
the agent environment. Production was not queried (there is no network or secret). The
full suite ran 7,815 tests: 7,808 passed, six skipped and one unrelated workflow assertion
failed because its January schedule calculation produced hour 24. The two migration-tool files
also reported their expected environment failures because this checkout has no `origin/main`.
There is no migration in this bundle. No browser or production behavior was measured.
