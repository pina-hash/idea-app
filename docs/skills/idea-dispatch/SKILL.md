---
name: idea-dispatch
description: Queue a Claude Code session for any of Mr. Pina's repos (idea-app, fll-app, frc-app, Armory, robot code, Keystage, Unstuck, new apps) and start it at the right model and effort - or answer what is queued or running.
---

# Queue and dispatch Claude Code sessions

Source of truth: `docs/skills/idea-dispatch/SKILL.md` in pina-hash/idea-app. The queue's format and rules are `docs/dispatch/README.md`; the decision logic is `tools/dispatch.py`; the repos are `docs/dispatch/repos.json`; the models are `docs/dispatch/models.json`. Mr. Pina decided on 2026-10-17 that chats start sessions themselves and never hand him prompts, with a usage reserve of 40% of his week (automation stops at 60%), and that every session's model and effort are set automatically, Haiku through Fable.

## A. Queue a session (after the idea-code-prompt skill has written the prompt)

1. Fetch `main` of pina-hash/idea-app (the queue lives there for every repo). Read `docs/dispatch/queue/` and run `python3 tools/dispatch.py plan` so you know what is running and waiting.
2. If another queued or running entry touches the same files or the same feature from another chat, say so to Mr. Pina in one line and set `after:` to it unless he says otherwise. If his own words set an order ("coin first"), write it into `after:` on the entries concerned.
3. Check `docs/dispatch/repos.json` lists the target repo. If not (a new app), read that repo's rules file and add its row (rules file, ledger, migration path, its database token or null) in the same push as the entry.
4. Write `docs/dispatch/queue/<YYYY-MM-DD>-<slug>.md` per the README, including `migration` (a number or `none`); an entry that changes a database's tables or server code without a migration names that database's token (for example `db:idea-supabase`) in `owns`: the fields, `owns` copied verbatim from the prompt's Owns line, an honest `size`, the `model` and `effort` the idea-code-prompt skill chose, and the full prompt below the front matter. Fable 5.1, xhigh, max and ultracode get `go: no` unless he said go in this chat. Before choosing Fable, ask whether the gaps can be closed by talking them through with him so Opus 5.5 can run it instead; that is his preferred path.
5. Push to `main` (rebase and retry on rejection). Then run B.
6. Tell him in one line: queued as `<id>` with its model and effort, and whether it started now or what it waits for.

## B. Start the session (Mr. Pina, 2026-10-19)

A chat he is in starts each job itself as a normal, visible Claude Code cloud session. Nothing runs on a schedule: the hourly dispatcher, the worker lanes and the job board's Approve button were retired on 2026-10-19, because an unattended run can never start a session (each one waits for a person or is refused), and because the old launcher hid the work inside one helper where he could not watch it.

1. Claim the entry: set `status: running` and `started_at` in `docs/dispatch/queue/<id>.md`, push to `main`.
2. `create_trigger` with `prompt: "/effort <effort>"` (the entry's effort; ultracode is `/effort ultracode`), `initiation: human_request`, `name: "<ledger> <short title> (<model> <effort>)"`.
3. `update_trigger` with `model: <the model's exact id from docs/dispatch/models.json>`, unless it is already that model.
4. `fire_trigger` with `text`: one line "Do the work yourself in this session, in the open; do not hand the whole job to one subagent.", then the entry's prompt verbatim, then: "QUEUE: in the same push that lands your work, set docs/dispatch/queue/<id>.md to status: done with finished_at set to the current time. If you stop without landing, push only that entry with status: failed and a one-line note."
5. Give him the session link: the `session_id` returned is `cse_<x>`; the session is `https://claude.ai/code/session_<x>`. He watches it there like any Claude Code session, and its effort shows in the session (proven 2026-10-19 by the smoke test at `1d03333c`, Haiku at high).
6. Write `trigger_id` into the entry and push. Never delete a job's scheduled task: that deletes its session.

Run at most three at once, and never two whose files or database overlap (`python3 tools/dispatch.py plan` says which).

## C. Answer "what's queued" or "what's running"

Fetch `main`, run `python3 tools/dispatch.py plan` (with usage if readable), and answer in a few lines: running, waiting and why, needs his go, failed or held. For a `done` entry, the sha is the commit that set it to done.

## Rules

- Never paste a prompt to him unless he asks, the work must run on his own computer, or it goes to Codex (GPT-6 Astra), which cannot be started from here.
- Never start anything the plan did not put in `start`, and never edit `go` to yes unless he said go in the chat doing it.
- A `failed` or `held` entry is reported, never retried automatically.
- `python3 tools/dispatch.py --selftest` must pass before any change to `tools/dispatch.py` is pushed.
