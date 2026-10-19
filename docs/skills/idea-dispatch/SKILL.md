---
name: idea-dispatch
description: Answer what Claude Code work is running or landed in Mr. Pina's repos. Starting sessions is in the idea-code-prompt skill, section 6.
---

# Retired on 2026-10-19

At 01:00 on 2026-10-19 Mr. Pina chose to paste prompts himself; at 10:23 the same day he reversed it: chats start sessions themselves, as section 6 of the idea-code-prompt skill describes. The queue, dispatcher and job board stay retired.

This skill now only answers "what is running or landed": read `main` (recent commits, `docs/history/`, `docs/prompt-ledger/entries/`) and say what landed and what is still open. The files under `docs/dispatch/` and `tools/dispatch.py` are kept as history and for the file-overlap check (`python3 tools/dispatch.py plan`), not as a process.

