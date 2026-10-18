# 0399 The session queue: chats queue Claude Code sessions and a usage-guarded dispatcher starts them

- Issued: 2026-10-17
- By: the claude.ai router chat "Felix integration", pushing its own bundle. Mode: solo.
- Repo: `pina-hash/idea-app`
- Branch: none; pushed straight to `main`.
- Owns: `tools/dispatch.py` (new), `docs/dispatch/**` (new), `docs/skills/idea-dispatch/SKILL.md` (new), `docs/skills/idea-code-prompt/SKILL.md` (section 6), this entry, its `docs/history/` entry.
- Does not touch: `src/**`, `supabase/**`, `tests/**`, `materials/**`, `CLAUDE.md`, any standards file.
- Migration permitted: no. Claims: none.
- Status: pushed
- Notes: Mr. Pina, 2026-10-17: chats start sessions themselves instead of handing him prompts; several chats that cannot see each other must not collide; the dispatcher runs at any hour; automation keeps 40% of his weekly usage (stops at 60%, lowered from 70% the same evening), never starts Fable or xhigh-and-above without his go, and talks gaps through with him so Opus can run what Fable otherwise would. `python3 tools/dispatch.py --selftest`: 21 of 21, and four mutants (ceiling, go gate, blind-start limit, file-overlap check) each fail it. No suite: no file the suite reads changed.
