---
name: idea-dispatch
description: Retired 2026-10-19 (Mr. Pina pastes prompts himself). Use only to answer what Claude Code work is running or landed in his repos.
---

# Retired on 2026-10-19

Mr. Pina decided on 2026-10-19 to paste every Claude Code prompt himself. Chats do not queue, dispatch, schedule or start Claude Code sessions. Write prompts with the idea-code-prompt skill and hand them over to paste.

This skill now only answers "what is running or landed": read `main` (recent commits, `docs/history/`, `docs/prompt-ledger/entries/`) and say what landed and what is still open. The files under `docs/dispatch/` and `tools/dispatch.py` are kept as history and for the file-overlap check (`python3 tools/dispatch.py plan`), not as a process.

