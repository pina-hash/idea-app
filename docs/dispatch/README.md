# The session queue

Chats do not hand Mr. Pina Claude Code prompts to paste. They queue them here, and a dispatcher starts each one when it is safe to: nothing running touches the same files, its dependencies are done, and his claude.ai usage has room. Decided by Mr. Pina on 2026-10-17 (ledger 0399), after several chats that could not see each other handed him prompts that had to be ordered by hand.

The procedure is the idea-dispatch skill (`docs/skills/idea-dispatch/SKILL.md`). The decision logic is `tools/dispatch.py`, which checks itself with `python3 tools/dispatch.py --selftest`.

## A queue entry

One file per session, `docs/dispatch/queue/<YYYY-MM-DD>-<slug>.md`, pushed to `main`. Git accepts one push to `main` at a time, so two chats can never claim the same slot without one of them seeing the other's entry on rebase.

```
---
id: 2026-10-18-coin-v2-session-3
repo: pina-hash/idea-app
chat: Idea coin system reform
ledger: 0412
migration: 0262
model: opus-5.5
effort: high
size: M
owns: src/lib/coin/**, src/routes/coin-desk/**, supabase/migrations/0262_*.sql
after: 2026-10-17-coin-v2-session-2
needs_go: no
go: no
status: queued
queued_at: 2026-10-18T09:12:00-07:00
---
<the full Claude Code prompt, exactly as the idea-code-prompt skill writes it>
```

| Field | Meaning |
|---|---|
| `id` | the file name without `.md`; date first, then a slug |
| `repo` | `pina-hash/idea-app`, `pina-hash/fll-app` or `FRC-Team-5669-Techmen/frc-app` |
| `chat` | the chat that queued it, so a question can find its way back |
| `ledger`, `migration` | the numbers the prompt states (`migration: none` when it writes none) |
| `model` | `sonnet-5.5`, `opus-5.5` or `fable-5.1` |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max` or `ultracode` |
| `size` | `S` (under an hour, docs or one file), `M` (a feature), `L` (several subsystems or many files). Stated by the queueing chat; a session that turns out much bigger is reported |
| `owns` | the file globs the prompt may write, copied from its Owns line. Two entries whose globs overlap never run at once |
| `after` | ids that must be `done` first. Mr. Pina's ordering goes here ("coin first") |
| `needs_go`, `go` | Fable 5.1 and the xhigh, max and ultracode efforts always need `go: yes`, which only Mr. Pina gives, in a chat. Any other entry may ask for it with `needs_go: yes` |
| `status` | `queued`, `running`, `done`, `failed`, `held` or `cancelled` |
| `started_at`, `finished_at`, `trigger_id`, `sha`, `note` | written by the dispatcher and by the session itself |

## Many repos, one queue

The queue lives in idea-app but serves every repo in `docs/dispatch/repos.json`: idea-app, fll-app, frc-app, idea-armory, the robot code, idea-keystage and idea-unstuck as of 2026-10-17.

- **Per repo:** one session at a time, or two whose files do not overlap.
- **Across repos:** at most three sessions at once in total, and the same file path in two different repos never collides.
- **Shared things outside a repo** are resource tokens. Each repo's database is one (`db:idea-supabase`, `db:fll-supabase`, `db:frc-supabase`). An entry with a migration holds its repo's database automatically, and an entry that changes tables or server code for a database can claim it by writing the token in `owns`. idea-armory's server talks to the idea-app database, so its row names `db:idea-supabase`: an Armory change and an idea-app migration wait for each other.
- **A new app** (the scouting app, the next small one) becomes dispatchable by adding its row to `repos.json` in the same push that queues its first session, after reading its rules file. An entry for an unlisted repo is flagged and never started.

## How each session gets the right model and effort

Mr. Pina, 2026-10-17: model and effort are chosen per session, automatically and on purpose, from Haiku 5.5 up to Fable 5.1; Opus 5.5 is used only where it is the best fit. The models, their exact ids and what each is for are in `docs/dispatch/models.json`, compared with Anthropic's own pages on the date it states; the morning check re-reads those pages when that date is more than 7 days old.

The tool that starts a scheduled session takes no model or effort, so the dispatcher does it in two moves:

1. **The launcher runs on Haiku 5.5.** Right after creating the one-time scheduled task, the dispatcher sets that task's model to `claude-haiku-5-5`. The launcher only hands the work over and checks it landed, so it costs almost nothing.
2. **The work runs in one subagent at the entry's exact model and effort.** The launcher passes the whole prompt to a single general-purpose subagent invoked with `model` (haiku, sonnet, opus or fable) and `effort` (low to max) from the entry. Claude Code honors a per-invocation model and effort from v2.1.292; this container ran v2.1.302 on 2026-10-17.

`ultracode` cannot be turned on for a dispatched session (it is a session setting, not a subagent parameter). An entry marked ultracode runs at xhigh, and the dispatcher says so when it starts it.

## The usage guard (Mr. Pina, 2026-10-17; reworked 2026-10-18)

- Automation never takes his week past 60%, or his weekly Fable limit past 60%. The remaining 40% is his. Below that it runs at any hour with nobody watching.
- **Projection, not freshness.** On 2026-10-18 nothing big started overnight because a reading over 3 hours old counted as unreadable. Now the dispatcher uses the last reading at any age and adds the estimated cost of every session started since it (`COST` in `tools/dispatch.py`: Opus 5.5 is about 1, 3 and 6% of a week for S, M and L). A job starts only if that projection plus its own cost stays at or under 60%. The estimates are kept high, and each new reading corrects them.
- A reading under 3 hours old also waits while the current five-hour session is at 80% or more.
- Usage is read from https://claude.ai/settings/usage through his signed-in Chrome, on whichever computer he is using. Every reading is written to the private **Session Dispatcher** artifact (https://claude.ai/artifact/JwGj561ut4CU1pJq1R8zZQ, database doc `usage/latest`, with `read_at`), so a cloud run can use a reading a chat took on any of his machines.
- Only if no reading has ever been taken do size S jobs alone start.
- No setting caps how much one running session can use, so the guard works by choosing what starts, never by stopping a session.

## Self-healing

- An entry left `running` with no `trigger_id` for 20 minutes means the dispatcher that claimed it died before launching (this happened on 2026-10-18 and held a job for about 10 hours). The next run releases it and starts it again.
- Sessions start the moment they are created (`fire_trigger`), not at a clock time, so a clock mismatch can no longer reject a start.
- Every launcher's last step runs the dispatcher, so the job queued behind a finished one starts within minutes, not at the next hour.
- Owns items that begin "its own" (its own `docs/history/` entry) are new files each session creates and never count as a collision.

## Who runs the dispatcher

- **The chat that queues an entry**, right after pushing it, while Mr. Pina is there and his usage is readable.
- **The hourly dispatcher**, a scheduled task named "IDEA session dispatcher", every hour at any time of day, in the cloud, so it runs whichever computers are on. It reads usage itself when a browser is reachable, and otherwise uses the latest reading on the Session Dispatcher artifact, projected forward. Each run that starts or holds something adds a line to that artifact's `runs`.
- **Any chat**, when he says "run the dispatcher" or "what's queued".

A dispatched session ends by setting its own entry to `done` (with the pushed sha) or `failed` (with a one-line note) in the same push as its work, so the next hourly run can start what was waiting behind it.

## What reaches Mr. Pina

The morning check lists what is running, what waits and why, anything waiting for his go, failed or held entries, and any run past six hours. A chat asked "what's queued" prints the same from `python3 tools/dispatch.py plan`.
