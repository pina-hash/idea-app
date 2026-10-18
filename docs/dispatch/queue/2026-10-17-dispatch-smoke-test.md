---
id: 2026-10-17-dispatch-smoke-test
repo: pina-hash/idea-app
chat: Felix integration (router)
ledger: 0399
migration: none
model: sonnet-5.5
effort: low
size: S
owns: docs/dispatch/smoke/**
after:
needs_go: no
go: no
status: running
started_at: 2026-10-17T22:30:00-07:00
trigger_id: trig_01WGTnwt29hT76giPxmSwxX8
queued_at: 2026-10-17T22:31:00-07:00
---
This is a READ-ONLY-except-one-file smoke test of the IDEA session queue (ledger 0399). Do exactly this and nothing else.

1. `git clone https://github.com/pina-hash/idea-app.git` (a full clone, so you can push), `cd idea-app`, and set the committer to `Claude <noreply@anthropic.com>`.
2. Create `docs/dispatch/smoke/2026-10-17.md` containing four lines: the current time in ISO-8601, the model you are running as (as your system prompt states it), the output of `python3 tools/dispatch.py --selftest | tail -1`, and the line "Dispatched by the session queue; no other file changed."
3. In the same commit, edit `docs/dispatch/queue/2026-10-17-dispatch-smoke-test.md`: set `status: done` and add a line `finished_at: <now ISO>` to its front matter. Change nothing else in that file or any other file.
4. Commit with the message "Ledger 0399 smoke test: a dispatched session landed", rebase on origin/main, and push HEAD:main once. Report the pushed sha.
