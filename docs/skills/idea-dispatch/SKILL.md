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

Every job shows on Mr. Pina's **job board**, the pinned Session Dispatcher page (https://claude.ai/artifact/JwGj561ut4CU1pJq1R8zZQ, called BOARD below). He watches work there, not in scheduled tasks. Its database: `jobs/<id>` (one document per queue entry: `title`, `repo`, `ledger`, `model`, `effort`, `size`, `status` queued|starting|running|done|failed|held, `wait_reason`, `queued_at`, `started_at`, `finished_at`, `updated_at`, `step`, `sha`, `report`, `needs` [lines only he can act on], `trigger_id`), `jobs/<id>/steps/<UTC time>` (`at`, `text`), `usage/latest`, `runs`. Write with ArtifactData (load it through ToolSearch), pinning each write to the version last read. Times are UTC ISO. Text is plain, one line where it says line, no em dashes.

1. Fetch `main`. Read usage: open https://claude.ai/settings/usage in his Chrome (Claude in Chrome tools; read the chrome-browser skill first) and read Current session %, This week %, Fable this week %, and the weekly reset time. Close the tab. Then write the reading to BOARD: `set` on `usage/latest` with `session`, `week`, `fable`, `reset` (ISO), `read_at` (now, ISO) and `read_by` (this chat or "hourly dispatcher"), pinned with `if_version` from a `get`.
   If the browser tools are absent or fail, `get` `usage/latest` instead and use it with its `read_at`. Never guess usage.
2. `python3 tools/dispatch.py offer --usage session=<n>,week=<n>,fable=<n> --reset <ISO reset> [--read-at <read_at when the reading came from the artifact>]` (omit the usage flags only when no reading exists at all). A reading of any age is used; the tool adds the estimated cost of everything started since it. `offer` lists every entry he may approve now (Mr. Pina, 2026-10-18, approve ahead): it applies dependencies, registry and the usage ceiling but not slots, files or databases, because each approved job waits for its own turn when it starts. Write its `projected_after_starts` to `usage/latest` as `projected_week`.
3. **Sync the board.** For every queue entry that is `queued`, `held` or in `wait`, set or update `jobs/<id>` with its fields, `status` (`held` stays held), and the plan's reason as `wait_reason`. One batch.
4. For each entry in `release`: set it back to `status: queued`, remove `started_at`, add the plan's reason as `note`, and push. It reappears in `start` when it can run.
5. **Offer each entry in `start` on the board.** Mr. Pina, 2026-10-18: every start is approved on the job board, one button, and nothing else asks him. A session created by a run nobody watches waits for a person's tap, so the dispatcher never calls `create_trigger`; his Approve on the board creates and starts the session from his own click. For each entry, in order:
   1. **Claim it.** Set `status: ready` and `started_at: <now ISO>` in the entry, push to `main`. If the push is rejected, rebase and re-read: if someone else claimed it, skip it. A `ready` entry holds nothing; it only says it is on the board.
   2. **Put it on the board**: set `jobs/<id>` with its fields, `status: ready`, `est_cost_pct` from the plan, `wait_reason` ("Starts as soon as you approve." when `python3 tools/dispatch.py check --id <id>` says ok, otherwise "Approve now; it starts by itself when <the check's reason> clears."), `updated_at`, and `launch: {name: "<ledger> <short title> (<model> <effort>)", prompt: <the wrapper below, filled in, followed by the entry's prompt verbatim>}`.
   An entry the plan holds only for his go (Fable 5.1, xhigh, max, ultracode): copy the queue to a scratch folder, set that entry's `go: yes` there, and re-run `offer` on the copy. If it then appears in `start`, do the two steps above with `status: needs_go` instead of `ready` (in the entry and on the board). His Give go button on the board is the go; the launcher records it.
6. If anything was offered, released or waits, add a document to the artifact's `runs` collection: `at`, `by`, `started` (ids offered), `released`, `waiting` (`id` and `reason`).
7. Report the plan's `wait` and `attention` lists in one short block.

Never delete a finished job's scheduled task: deleting a task deletes the sessions it started, and with them the record of the work.

**From a chat Mr. Pina is in**, a chat may still start an entry directly (claim it as `running`, `create_trigger`, `update_trigger` model `claude-haiku-5-5`, `fire_trigger`, record `trigger_id`), because he is present; the job then shows on the board the same way. Write `session_url` on `jobs/<id>` from the `session_id` `fire_trigger` returns: `cse_<x>` is the session at `https://claude.ai/code/session_<x>` (checked 2026-10-18 against this chat's own session id and address). The board's Approve button does the same, and passes `create_new_session_on_fire: true` to `create_trigger`, which a call from a page needs.

**A Needs you item** (a job's `needs`) is an object: `text` (one line), `steps` (the exact numbered steps, each one sentence with exact names and values to type), `links` (`label`, `url`: every page he must open, exact URLs). Never a bare file path to go read.

**The wrapper**, placed above the prompt (fill in `<id>`, `<owner>/<repo>`, the plan's `subagent_model` and `effort`, and the model's name; for an ultracode entry use `xhigh`):

```
You are the launcher for IDEA session queue entry <id> (docs/dispatch/queue/<id>.md in pina-hash/idea-app). Do not do the work yourself. Mr. Pina watches and approves every job on his job board, https://claude.ai/artifact/JwGj561ut4CU1pJq1R8zZQ; write to it with ArtifactData (load it through ToolSearch), pinning each write to the version you last read or wrote. A board report below means: one batch of two writes, set collection jobs/<id>/steps with doc_id the current UTC time in ISO form and data {at, text, lines}, and update collection jobs, doc_id <id>, with {step: text, updated_at: now}.

0. Get repository access. Load add_repo through ToolSearch and call it with owner "pina-hash", repo "idea-app", access "push" (the queue lives there), and again for the entry's repo <owner>/<repo> with access "push" if that is a different repository. Clone with the command it returns. If add_repo is refused, update jobs/<id> with status failed, the refusal as report, and a needs item {text, steps, links} with the exact fix and the URL it names, then stop.
1. Wait for your turn. Get jobs/<id> from the board. In a fresh clone of pina-hash/idea-app main run `python3 tools/dispatch.py check --id <id>`. While it says ok: false, post a board report "Approved; waiting: <its reason>" whenever the reason changes, wait five minutes (a background sleep), fetch main and check again; this costs almost nothing. When it says ok: true, set the queue entry to status: running, started_at now (UTC ISO), trigger_id from the board document, and go: yes if the board document's status was needs_go (his Give go on the board is that go), and push. If the push is rejected, rebase and run the check again before claiming. The check's `mode` is this job's mode.
2. Update jobs/<id>: status running, started_at and updated_at now, step "Started: <Model name> at <effort> effort, <mode> mode". Also post it as a board report.
3. Invoke exactly one general-purpose subagent with model "<subagent_model>" and effort "<effort>", and give it everything below the line "TASK" verbatim, plus these three paragraphs:
"Repository access is already granted to this session; if a push is refused, call add_repo (load it through ToolSearch) with access push for that repository and retry once."
"In the same push that lands your work, set docs/dispatch/queue/<id>.md in pina-hash/idea-app to status: done with finished_at set to the current time; if you stop without landing, push only that entry with status: failed and a one-line note. Never edit any other queue entry unless your Owns names it."
"Mr. Pina watches your work live on his job board, the way he would watch a Claude Code session. About every five minutes of work, and at each milestone (audit answered, build done, each check's result, rebased, pushed), post one report with ArtifactData (load it through ToolSearch) on url https://claude.ai/artifact/JwGj561ut4CU1pJq1R8zZQ, as one batch of two writes: set collection jobs/<id>/steps, doc_id the current UTC time in ISO form (for example 2026-10-19T02:41:07Z), data {at, text, lines}; and update collection jobs, doc_id <id>, data {step: text, updated_at: now}, pinned with if_version from your last read or write of that document (get it first the first time). text: one plain line under 120 characters saying where you are. lines: up to 15 short plain lines, one per action since your last report, in order: each file read or written (path and lines changed), each command and its result (counts, pass or fail), each finding or decision. No em dashes. A failed board write never stops the work."
4. When the subagent returns, fetch pina-hash/idea-app main and confirm the entry's status changed. If it is still running, push it as failed with the subagent's last line as the note.
5. Update jobs/<id>: status done or failed, finished_at and updated_at now, sha (the pushed commit), report (at most five plain sentences: what changed, numbers measured, anything not verified), needs (a list; each item {text, steps, links}: one line saying what only Mr. Pina can do, the exact numbered steps, and every page to open with its exact URL; an empty list if none; anything he can ask about here in this session, because the board links to it), and post a final board report.
6. Put the next jobs on the board now: follow section B steps 1 to 6 of docs/skills/idea-dispatch/SKILL.md in pina-hash/idea-app (offer only; never create, fire or delete a scheduled task).
7. End with one line: the entry id, done or failed, and the pushed sha.

TASK
```

## C. Answer "what's queued" or "what's running"

Fetch `main`, run `python3 tools/dispatch.py plan` (with usage if readable), and answer in a few lines: running, waiting and why, needs his go, failed or held. For a `done` entry, the sha is the commit that set it to done.

## Rules

- Never paste a prompt to him unless he asks, the work must run on his own computer, or it goes to Codex (GPT-6 Astra), which cannot be started from here.
- Never start anything the plan did not put in `start`, and never edit `go` to yes unless he said go in the chat doing it.
- A `failed` or `held` entry is reported, never retried automatically.
- `python3 tools/dispatch.py --selftest` must pass before any change to `tools/dispatch.py` is pushed.
