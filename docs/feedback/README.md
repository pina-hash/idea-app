# Updating the site from feedback

One folder per feedback round, named for the day it ran. Each holds the triage, the queue,
the prompts, and the SQL that closes the round. The procedure a session follows is
`.claude/skills/feedback-round/SKILL.md`. This page is the human side of it.

## What Mr. Pina does

1. **Export.** In the feedback console, filter to `status: new` and download the zip.
2. **Start a round.** Open a Claude Code session on this repo with Opus 5.5 and ultracode
   on. Upload the zip and type: `run a feedback round`.
3. **Answer the decisions.** The session asks at most a few questions at once, each with
   a recommended answer. Click, or correct it in a line.
4. **Paste the prompt it hands you** into a NEW session, with the model it names. That
   session builds and ships to `main` tier by tier, so fixes go live as they land.
5. **Paste `MARK_SEEN.sql` once** in the Supabase SQL editor, so the next export holds
   only new reports.
6. When a build session finishes, paste the next prompt in the queue. The previous
   session's report says what landed.

## Writing a report that gets built right

- One topic per report.
- Choose **bug** when something is broken, and **idea** when you want something new or
  different.
- Attach a screenshot whenever something looks wrong.
- Say WHY in one sentence ("students never collapse the list, so the worksheet is
  cramped"). The why is what lets a session choose the right design, not just a fix.
- A redesign ask ("the notebook needs rethinking") is welcome. It becomes a design brief
  you approve before anything is built.

## Where your control lives

| You decide | Where it is recorded |
|---|---|
| What a feature is for, and whether to reverse something built | `docs/decisions/entries/` |
| What a whole area should feel like | `docs/<area>/VISION.md` |
| How new visual language looks | a `/dev` mockup page you approve first |
| When the next session runs | you paste its prompt |

Everything else, including code, tests, merging and applying additive migrations, runs
without you.

## Rounds

- [2026-09-25](2026-09-25/): 35 reports, decisions 37 to 40, 6 queued sessions.
