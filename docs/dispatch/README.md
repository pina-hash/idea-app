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

## The usage guard (Mr. Pina, 2026-10-17)

- Automation starts nothing once his week is at 60% used. The remaining 40% is his.
- Before that it keeps an even pace: by a given point in the week it may have reached 10% plus 50% times the share of the week gone (about 35% at midweek).
- It waits while the current five-hour session is at 80% or more.
- Usage is read from https://claude.ai/settings/usage through his signed-in Chrome, on whichever computer he is using. Every reading is written to the private **Session Dispatcher** artifact (https://claude.ai/artifact/JwGj561ut4CU1pJq1R8zZQ, database doc `usage/latest`, with `read_at`), so a cloud run can use a reading a chat took on any of his machines. A reading older than 3 hours counts as unreadable.
- When no fresh reading exists, only size S jobs on Sonnet or Opus (at most high effort) start, one at a time, and everything else waits.
- No setting caps how much one running session can use, so the guard works by choosing what starts, never by stopping a session.

## Who runs the dispatcher

- **The chat that queues an entry**, right after pushing it, while Mr. Pina is there and his usage is readable.
- **The hourly dispatcher**, a scheduled task named "IDEA session dispatcher", every hour at any time of day, in the cloud, so it runs whichever computers are on. It reads usage itself when a browser is reachable, and otherwise uses the latest reading on the Session Dispatcher artifact if it is under 3 hours old. Each run that starts or holds something adds a line to that artifact's `runs`.
- **Any chat**, when he says "run the dispatcher" or "what's queued".

A dispatched session ends by setting its own entry to `done` (with the pushed sha) or `failed` (with a one-line note) in the same push as its work, so the next hourly run can start what was waiting behind it.

## What reaches Mr. Pina

The morning check lists what is running, what waits and why, anything waiting for his go, failed or held entries, and any run past six hours. A chat asked "what's queued" prints the same from `python3 tools/dispatch.py plan`.
