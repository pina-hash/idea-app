---
title: "Chats queue Claude Code sessions and a usage-guarded dispatcher starts them (ledger 0399, no migration)"
date: 2026-10-17
branches: [main]
migrations: []
subsystems: ["Workflow", "Skills"]
---

Mr. Pina had been pasting every Claude Code prompt himself and ordering them by hand, because the chats that wrote them could not see each other. Now a chat queues the prompt as a file in `docs/dispatch/queue/` and the dispatcher starts it when nothing running touches the same files, its `after:` dependencies are done, and his claude.ai usage has room.

What changed here:

- `tools/dispatch.py`: the decision logic, read-only, with `--selftest` (21 checks including negative controls; four mutants each caught).
- `docs/dispatch/README.md`: the entry format and the usage guard. Automation stops at 60% of his week (lowered from 70% the same evening), keeps an even pace before that, waits while the current session is at 80%, never starts Fable 5.1 or xhigh, max or ultracode without his go, and runs only size S Sonnet or Opus jobs when his usage cannot be read.
- `docs/skills/idea-dispatch/SKILL.md`: queue, dispatch, and "what's queued". A session is claimed by a push before it is started, so two dispatchers cannot start it twice.
- `docs/skills/idea-code-prompt/SKILL.md` section 6: prompts are queued, never handed over, except on request, for his own computer, or for Codex.

For a person to act on: save the idea-dispatch and updated idea-code-prompt skill cards. The hourly "IDEA session dispatcher" scheduled task needs his computer on with the Claude desktop app open, because his usage is readable only through his signed-in Chrome.
