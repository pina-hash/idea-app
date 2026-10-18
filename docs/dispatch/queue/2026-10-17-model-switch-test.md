---
id: 2026-10-17-model-switch-test
repo: pina-hash/idea-app
chat: Felix integration (router)
ledger: 0399
migration: none
model: haiku-5.5
effort: low
size: S
owns: docs/dispatch/smoke/**
after: 2026-10-17-dispatch-smoke-test
needs_go: no
go: no
status: queued
queued_at: 2026-10-17T22:58:00-07:00
---
This is the second smoke test of the IDEA session queue (ledger 0399): it proves a dispatched session runs at the model and effort its entry names. Do exactly this and nothing else.

1. `git clone https://github.com/pina-hash/idea-app.git` (a full clone, so you can push), `cd idea-app`, and set the committer to `Claude <noreply@anthropic.com>`.
2. Create `docs/dispatch/smoke/2026-10-17-model.md` containing three lines: the current time in ISO-8601, the exact model you are running as (as your system prompt states it), and the line "Expected: Claude Haiku 5.5 at low effort, set by the queue."
3. Commit that file together with the queue entry update your instructions describe, with the message "Ledger 0399 smoke test 2: model and effort set by the queue", rebase on origin/main, and push HEAD:main once. Report the pushed sha.
