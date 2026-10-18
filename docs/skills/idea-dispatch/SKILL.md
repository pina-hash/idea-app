---
name: idea-dispatch
description: Queue a Claude Code session for idea-app, frc-app or fll-app and start it safely - or run the dispatcher, or answer what is queued or running - instead of handing Mr. Pina a prompt to paste.
---

# Queue and dispatch Claude Code sessions

Source of truth: `docs/skills/idea-dispatch/SKILL.md` in pina-hash/idea-app. The queue's format and rules are `docs/dispatch/README.md`; the decision logic is `tools/dispatch.py`. Mr. Pina decided on 2026-10-17 that chats start sessions themselves and never hand him prompts, with a usage reserve of 40% of his week (automation stops at 60%).

## A. Queue a session (after the idea-code-prompt skill has written the prompt)

1. Fetch `main` of pina-hash/idea-app (the queue lives there for every repo). Read `docs/dispatch/queue/` and run `python3 tools/dispatch.py plan` so you know what is running and waiting.
2. If another queued or running entry touches the same files or the same feature from another chat, say so to Mr. Pina in one line and set `after:` to it unless he says otherwise. If his own words set an order ("coin first"), write it into `after:` on the entries concerned.
3. Check `docs/dispatch/repos.json` lists the target repo. If not (a new app), read that repo's rules file and add its row (rules file, ledger, migration path, its database token or null) in the same push as the entry.
4. Write `docs/dispatch/queue/<YYYY-MM-DD>-<slug>.md` per the README, including `migration` (a number or `none`); an entry that changes a database's tables or server code without a migration names that database's token (for example `db:idea-supabase`) in `owns`: the fields, `owns` copied verbatim from the prompt's Owns line, an honest `size`, and the full prompt below the front matter. Fable 5.1, xhigh, max and ultracode get `go: no` unless he said go in this chat. Before choosing Fable, ask whether the gaps can be closed by talking them through with him so Opus 5.5 can run it instead; that is his preferred path.
5. Push to `main` (rebase and retry on rejection). Then run B.
6. Tell him in one line: queued as `<id>`, and whether it started now or what it waits for.

## B. Run the dispatcher

1. Fetch `main`. Read usage: open https://claude.ai/settings/usage in his Chrome (Claude in Chrome tools; read the chrome-browser skill first) and read Current session %, This week %, Fable this week %, and the weekly reset time. Close the tab. Then write the reading to the Session Dispatcher artifact (https://claude.ai/artifact/JwGj561ut4CU1pJq1R8zZQ) with ArtifactData: `set` on `usage/latest` with `session`, `week`, `fable`, `reset` (ISO), `read_at` (now, ISO) and `read_by` (this chat or "hourly dispatcher"), pinned with `if_version` from a `get`.
   If the browser tools are absent or fail, `get` `usage/latest` from that artifact instead and use it with its `read_at`. Never guess usage.
2. `python3 tools/dispatch.py plan --usage session=<n>,week=<n>,fable=<n> --reset <ISO reset> [--read-at <read_at when the reading came from the artifact>]` (omit the usage flags when there is no reading at all). The tool treats a reading older than 3 hours as unreadable.
3. For each entry in `start`, in order:
   1. **Claim it first.** Set `status: running`, `started_at: <now ISO>`, push to `main`. If the push is rejected, rebase and re-read the entry: if someone else already claimed it, skip it.
   2. **Start the session**: `create_trigger` (load it through ToolSearch if deferred) with `run_once_at` one minute out, `initiation: human_schedule`, `name: <ledger> <short title>`, and as `prompt` the wrapper below followed by the entry's prompt verbatim.
   3. Write `trigger_id` into the entry and push.
4. If anything started or waits, add a document to the artifact's `runs` collection: `at`, `by`, `started` (ids), `waiting` (`id` and `reason`).
5. Report the plan's `wait` and `attention` lists in one short block. Anything waiting for his go goes at the top.

**The wrapper**, placed above the prompt:

```
You were started by the IDEA session queue as entry <id> (docs/dispatch/queue/<id>.md in pina-hash/idea-app), mode <mode>. In the same push that lands your work, set that entry's status to done and finished_at to the current time. If you stop without landing, push only that entry with status: failed and a one-line note saying why. Never edit any other queue entry.
```

## C. Answer "what's queued" or "what's running"

Fetch `main`, run `python3 tools/dispatch.py plan` (with usage if readable), and answer in a few lines: running, waiting and why, needs his go, failed or held. For a `done` entry, the sha is the commit that set it to done.

## Rules

- Never paste a prompt to him unless he asks, the work must run on his own computer, or it goes to Codex (GPT-6 Astra), which cannot be started from here.
- Never start anything the plan did not put in `start`, and never edit `go` to yes unless he said go in the chat doing it.
- A `failed` or `held` entry is reported, never retried automatically.
- `python3 tools/dispatch.py --selftest` must pass before any change to `tools/dispatch.py` is pushed.
