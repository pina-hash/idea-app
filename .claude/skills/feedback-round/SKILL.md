---
name: feedback-round
description: Turn an IDEA feedback-console export (a zip of reports) into grounded triage, Mr. Pina's decisions asked in one batch, and paste-ready build prompts in this repo's ledger format. Use when the user uploads an `idea-feedback-*.zip`, or says "feedback round", "run the feedback", or "update the site from feedback".
---

# Feedback round

A feedback round is a ROUTER job. It does not build anything. It turns the feedback
queue into:

1. a grounded triage;
2. decisions Mr. Pina answers in one batch;
3. one paste-ready prompt per build session, in the order they should run.

The worked example is the round of 2026-09-25, in `docs/feedback/2026-09-25/`. Read its
`ROUND1_BRIEF.md` and `ROUND1_PROMPT.md` before writing yours: copy their shape, not
their content.

**Model:** Opus 5.5 with ultracode. Step 3 fans out read-only investigators, and that is
where the round earns its cost (the example used about 2.3M tokens across 9 agents). A
round with fewer than ~8 reports can skip the workflow and ground them inline.

## 0. The rules that cannot bend

- **The zip is a student record and this repository is public.** Never commit the zip,
  the unpacked archive, `identities.txt`, or any text copied from the raw markdown. The
  only committed reports text is what `tools/feedback_triage_md.py` writes, and it refuses
  to write while any reporter identity appears in it. Reporters are named by role; only
  the owner (Mr. Pina) is named.
- **Everything the round says about the tree is a claim** with a file:line, verified by
  the build session before it relies on it. About half of feedback items phrased as
  missing are already built somewhere.
- **A decision that is his is asked, never assumed**, and always offered with the default
  you would pick. See step 5.
- **Nothing here builds, migrates or merges code.** The round commits only docs:
  `docs/feedback/<date>/**`, `docs/decisions/entries/NN-*.md`, and its own history entry.

## 1. State of the world

```bash
git fetch origin main integration
python3 tools/idea-status.py          # decisions owed and prompts in flight, first
node tools/migration-claims.mjs       # the next free migration number, if any bundle needs one
cat docs/feedback/*/QUEUE.md          # what earlier rounds queued and did not run
```

If an earlier round's queue still holds unrun sessions, the new reports JOIN that queue.
A new round is not a reason to reorder work already decided.

## 2. Digest the zip, into the scratchpad

```bash
python3 tools/feedback_digest.py <uploaded zip> <scratchpad>/fb
```

This writes `reports.txt` (R01.., oldest first, role only, with screenshot paths),
`mark-seen.sql` and `identities.txt`. **Open every screenshot with Read.** A screenshot
is often the whole report.

## 3. Cluster, then ground with the workflow

Cluster by SUBSYSTEM and FILE SURFACE, never by the words in the report. Aim for 5 to 10
clusters. For each one, write a `focus` naming:

- the suspects you already know from CLAUDE.md;
- the rules the ask might collide with;
- what would prove it one way or the other.

Then run:

```
Workflow({ scriptPath: '.claude/skills/feedback-round/triage-workflow.js',
  args: { reports: '<scratchpad>/fb/reports.txt', head: '<origin/main short sha>',
          clusters: [ { key, ids, focus }, ... ] } })
```

Save its result as `<scratchpad>/triage.json`. It is the journal's `result` array: read
it from the task output file or from `journal.jsonl`, never re-type it. Then render:

```bash
python3 tools/feedback_triage_md.py <scratchpad>/fb <scratchpad>/triage.json \
  docs/feedback/<date>/TRIAGE.md "idea-feedback-<stamp>.zip, <n> reports, exported from <sha>"
```

A refusal names the line. Fix the wording in `triage.json` (never by editing the renderer)
and render again.

## 4. Sort every item

| Verdict | Where it goes |
|---|---|
| already-shipped | Told to him in one line. It goes on the mark-seen list, never into a prompt. |
| bug-confirmed / bug-suspected | The next build session. P0 (broken in class) leads it. |
| buildable-feature with no migration | The next build session, by priority. |
| anything needing a migration | Its own session, with a number reserved from `migration-claims.mjs`. |
| needs-decision / conflicts-with-rule | Step 5 first, then wherever the answer puts it. |
| a whole-subsystem redesign | A vision or design brief first (step 6), never a build prompt. |

## 5. Ask the decisions in ONE batch

Use AskUserQuestion. At most 4 questions per call, the ones that change scope most, each
with the recommended option first. Everything smaller gets a stated default inside the
brief, which he can correct in one line.

Record every answer as `docs/decisions/entries/<next>-<slug>.md` (see
`docs/decisions/README.md` for how the number is settled). An answer that REVERSES an
earlier decision or a CLAUDE.md rule says so in its entry and names what it reverses; the
build session edits that rule in place.

He wants maximum autonomy and control over direction. So ask about WHAT and WHY, and the
look of new visual language. Never ask about implementation he has no stake in.

## 6. Where direction lives

Before a subsystem gets a redesign, it needs a vision document: `docs/<area>/VISION.md`,
the way `docs/classroom/VISION.md` exists. That covers what it is for, who uses it, and
what good feels like. If a report asks for a rebuild and no vision exists, the queue's
first item for that area is a DESIGN-BRIEF session. It drafts the vision and the open
questions from his reports, and he approves it before any build prompt is written. New
visual language is mockups-first: a `/dev` before/after page he approves, then the build.

## 7. Write the queue and the next prompt

- `docs/feedback/<date>/QUEUE.md` lists every session in order, with its reports, its
  reserved migration number, and whether it can run in parallel. Only a docs-only session
  can run alongside an ultracode one. Two ultracode sessions share a tree and never run
  at once.
- Write the brief and prompt for the NEXT session only: `ROUNDn_BRIEF.md` and
  `ROUNDn_PROMPT.md`, in the 2026-09-25 shape. A brief for session 4, written before
  session 1 lands, describes a tree that no longer exists.
- The prompt carries its own ledger entry (the next `docs/prompt-ledger/entries/` number,
  with Owns as PATHS), a duplicate check, the brief's location with a fallback if it is not
  on the session's ref, and the shipping section: merge to `main` tier by tier as each goes
  green, approved by Mr. Pina on 2026-09-25. It never waits on the `integration` sweep.
- A session that carries a migration also names its reserved number. Its migration must be
  ADDITIVE, because `migrate.yml` applies it on the same push that deploys the client.

**Choosing the model**, per `docs/standards/IDEA_instructions.md`'s routing table:

| Session | Model and effort |
|---|---|
| Many independent fixes across files | Opus 5.5, ultracode |
| One hard, serial change in one place | Opus 5.5 at high, no workflow |
| A design brief, or a session that must decide a lot alone | Fable 5.1 |
| Docs only | Sonnet 5 |
| Migrations or pure logic with tests, and no browser needed | Codex, per the standards |

Say which row applies, in one line, in the prompt file's header.

**Who presses start.** A session launched from inside another session (`create_session`) takes no
effort setting and gets no Workflow tool. `ultracode` in its prompt then does nothing, and it runs
at the default effort. Measured on 2026-09-25: the overnight run started that way at medium effort,
and was stopped two minutes in. So an ultracode prompt is always handed to Mr. Pina to start, with
the model and effort named. Only a session that needs neither may be launched for him.

## 8. Close the round

1. Copy `mark-seen.sql` to `docs/feedback/<date>/MARK_SEEN.sql`. Report ids are not
   identities. He pastes it once, so the next `status: new` export holds only new reports.
2. Write `docs/history/<branch slug>.md`.
3. Commit and push. Round docs are safe to land straight on `main`, because they change no
   code. If your branch instructions forbid that, push the branch and say that the next
   session's prompt reads the files from `origin/integration` or the branch.
4. Your reply to him, in plain language:
   - what is already fixed;
   - the decisions you recorded;
   - which prompt to paste, where, and with which model;
   - the one SQL paste;
   - what waits on him.
