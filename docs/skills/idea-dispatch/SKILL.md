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

## B. Run the dispatcher

1. Fetch `main`. Read usage: open https://claude.ai/settings/usage in his Chrome (Claude in Chrome tools; read the chrome-browser skill first) and read Current session %, This week %, Fable this week %, and the weekly reset time. Close the tab. Then write the reading to the Session Dispatcher artifact (https://claude.ai/artifact/JwGj561ut4CU1pJq1R8zZQ) with ArtifactData: `set` on `usage/latest` with `session`, `week`, `fable`, `reset` (ISO), `read_at` (now, ISO) and `read_by` (this chat or "hourly dispatcher"), pinned with `if_version` from a `get`.
   If the browser tools are absent or fail, `get` `usage/latest` from that artifact instead and use it with its `read_at`. Never guess usage.
2. `python3 tools/dispatch.py plan --usage session=<n>,week=<n>,fable=<n> --reset <ISO reset> [--read-at <read_at when the reading came from the artifact>]` (omit the usage flags only when no reading exists at all). A reading of any age is used; the tool adds the estimated cost of everything started since it.
3. For each entry in `release`: set it back to `status: queued`, remove `started_at`, add the plan's reason as `note`, and push. It reappears in `start` when it can run.
4. For each entry in `start`, in order, without pausing between steps:
   1. **Claim it first.** Set `status: running`, `started_at: <now ISO>`, push to `main`. If the push is rejected, rebase and re-read the entry: if someone else already claimed it, skip it.
   2. **Create the session** with `create_trigger` (load `create_trigger`, `update_trigger`, `fire_trigger` and `delete_trigger` through ToolSearch in one call) with no `cron_expression` and no `run_once_at`, `initiation: human_schedule`, `name: <ledger> <short title> (<model> <effort>)`, and as `prompt` the wrapper below followed by the entry's prompt verbatim.
   3. **Set the launcher's model**: `update_trigger` with `model: claude-haiku-5-5`. Mr. Pina asked on 2026-10-17 for every dispatched session's model to be set this way. If it fails, `delete_trigger` and set the entry back to `queued` with a note; never let it run on the default model.
   4. **Start it now**: `fire_trigger` on that task. No clock time is involved, so nothing can be rejected as past.
   5. Write `trigger_id` into the entry and push.
5. If anything started, was released or waits, add a document to the artifact's `runs` collection: `at`, `by`, `started` (ids), `released`, `waiting` (`id` and `reason`).
6. Report the plan's `wait` and `attention` lists in one short block. Anything waiting for his go goes at the top.

**The wrapper**, placed above the prompt (fill in the plan's `subagent_model` and `effort`; for an ultracode entry use `xhigh`):

```
You are the launcher for IDEA session queue entry <id> (docs/dispatch/queue/<id>.md in pina-hash/idea-app), mode <mode>. Do not do the work yourself. Invoke exactly one general-purpose subagent with model "<subagent_model>" and effort "<effort>", and give it everything below the line "TASK" verbatim, plus this sentence: "In the same push that lands your work, set docs/dispatch/queue/<id>.md in pina-hash/idea-app to status: done with finished_at set to the current time; if you stop without landing, push only that entry with status: failed and a one-line note. Never edit any other queue entry." When the subagent returns, fetch pina-hash/idea-app main and confirm the entry's status changed. If it is still running, push it as failed with the subagent's last line as the note. Then call fire_trigger on trig_01KfUhW1L9Tbnes5LvspXUev (the IDEA session dispatcher; load fire_trigger through ToolSearch) so whatever waited behind this entry starts now. End with one line: the entry id, done or failed, and the pushed sha.

TASK
```

## C. Answer "what's queued" or "what's running"

Fetch `main`, run `python3 tools/dispatch.py plan` (with usage if readable), and answer in a few lines: running, waiting and why, needs his go, failed or held. For a `done` entry, the sha is the commit that set it to done.

## Rules

- Never paste a prompt to him unless he asks, the work must run on his own computer, or it goes to Codex (GPT-6 Astra), which cannot be started from here.
- Never start anything the plan did not put in `start`, and never edit `go` to yes unless he said go in the chat doing it.
- A `failed` or `held` entry is reported, never retried automatically.
- `python3 tools/dispatch.py --selftest` must pass before any change to `tools/dispatch.py` is pushed.
