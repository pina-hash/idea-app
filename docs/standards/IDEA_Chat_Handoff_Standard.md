# Chat Handoff Standard
**Version 1.3 - 2026-09-02**

Governs every prompt this assistant writes for Mr. Pina to paste into a **new claude.ai chat**. This is the chat-surface counterpart to the Claude Code routing section in `IDEA_instructions.md`. CC prompts follow that section; new-chat kickoff prompts follow this one. Do not mix the two rubrics.

---

## When a handoff happens

Write a kickoff prompt (and follow this standard) whenever any of these occur:

1. **Scoped spinoff.** A sub-project deserves its own thread (e.g., a Unit 1 detail chat spun off from a course-planning chat).
2. **Continuation.** A multi-session workflow resumes in a fresh chat (e.g., grading sessions spanning days).
3. **Context reset.** The current chat is long, near usage limits, or has accumulated enough noise that a clean start is cheaper than continuing.
4. **Explicit request.** Mr. Pina asks for a prompt to start a new chat.
5. **Closeout.** Any chat that delivers files ends by writing the closeout kickoff
   prompt, unprompted, in the same turn as the downloads. See "Closing a chat" below.

If Mr. Pina asks a question that clearly belongs in a new scoped chat, propose the handoff rather than answering in place.

---

## Mandatory routing header

Every kickoff prompt is immediately preceded by a one-line header in this exact shape:

`MODEL: <recommended> (min: <model>) | THINKING: <on/off> | EFFORT: <High/Extra/Max> - <one-line reason>`

Rules:

- The header lives in the surrounding chat text, directly above the pasteable block, never inside it. It tells Mr. Pina what to set before pasting; the new chat never reads it.
- **Recommended** is the model the task deserves. **Min** is the cheapest model that can still succeed. When they match, write `(min: same)`. Both are always stated - this is standing policy, not only for low-usage days.
- The one-line reason must name which routing row the task matches, so the stated row and the chosen model can be checked against each other at a glance.
- No kickoff prompt ships without the header. If Mr. Pina has to ask "what model and thinking level," that is a failure of this standard.

---

## Chat model routing

The claude.ai effort dial exposes **High** (default), **Extra**, and **Max** only. Low and medium are Claude Code labels and never appear in a chat header.

| Task profile of the new chat | Model | Thinking | Effort |
|---|---|---|---|
| Trivial lookups, short blurbs, format fixes | Haiku 4.5 | off | High |
| Bounded execution off a locked architecture: grading runs, spec'd builds, generating CC prompts from settled designs, iterative edits | Sonnet 5 | off | High |
| Well-scoped work needing careful reasoning: content authoring against fixed standards, rubric application, debugging, multi-file planning within a known structure | Opus 5 | on | High |
| Genuinely ambiguous first-draft architecture, evaluate-from-scratch questions, novel system or rubric design, vague briefs with real structural unknowns | Fable 5.1 | on | High or Extra |

Overrides:

- **Highest-scrutiny or hard-to-reverse work** (A-G reclassification drafting, anything submitted to UC, live-data migrations): bump one tier and set **Max**.
- **Thinking follows the adaptive-thinking framework**, same as always: ON for first-draft architecture, novel rubric design, multi-constraint planning, vague briefs; OFF for execution against a settled spec.
- **Ambiguity must be real.** Before routing to Fable, list what is actually undecided. If the list is minor polish rather than structural unknowns, it is an Opus chat. A router chat is an Opus 5 chat: it holds a queue that is already written, and what degraded the 2026-08-31 router was its length, not its model. A router is Fable 5.1 only when the queue itself is undecided.
- **This table routes chats. Claude Code prompts route by the table in `IDEA_instructions.md`.** The two tables answer different questions and are not to be reconciled with each other.
- **Re-derive every time.** Classify each handoff on its own. Never inherit the tier of the chat that spawned it - a Fable planning chat routinely spawns Sonnet execution chats.

---

## Kickoff prompt content rules

The new chat starts with zero memory of the originating conversation beyond project knowledge, memory summaries, and past-chat search. Write the prompt accordingly:

1. **Self-contained.** State the task, the scope, and the boundary (what is explicitly out of scope) without assuming the new chat can see this one.
2. **Locked vs open.** List decisions already made as locked, so the new chat does not relitigate them. List open questions separately - those are the chat's actual work.
3. **Name the files.** Point to the exact project knowledge files the new chat must read before starting. If the task depends on a file built in the current chat, that file must be uploaded to project knowledge **before** the handoff; the prompt does not ship until the upload is confirmed. Flag any pending uploads explicitly.
4. **Past-chat pointers.** If the new chat needs history that lives only in conversation (logged data, prior grading records), instruct it by name to search past chats for the specific thread before proceeding, and state what it should find there.
5. **Workflow carryover.** Restate only the behavioral rules the new chat needs that are not already in project instructions. Do not duplicate what `IDEA_instructions.md` already enforces.
6. **Delivery format.** One directly-pasteable quoted block containing only what the new chat should read. Header above it, nothing extra inside it.
7. **A router kickoff carries the decisions owed at its top and the prompts in flight beneath them.** Both are read from `tools/idea-status.py` at the moment the kickoff is written, not from the closing chat's memory, and the kickoff says when it read them. A router chat that opens without this list raises the same nine questions one at a time, which is the 2026-08-31 failure.

---

## Closing a chat: the closeout prompt is written by the chat that is closing

A closing chat hands over files. Somebody then has to check that those files do not
overwrite work done in parallel, that everything reached the mirror, and that
`REGISTER.md` still describes reality. That check is the closeout pass, and until
2026-08-29 it only ever ran because Mr. Pina wrote a fresh prompt asking for it by hand.
That is the wrong place for it: the closing chat knows exactly what it changed, and
whoever runs the closeout does not.

**Every chat that delivers one or more files ends by emitting a closeout kickoff prompt,
unprompted, in the same turn as the downloads.** Not on request. It is the last thing in
the chat, after the files and after the summary.

It applies to any delivery, not only standards files. A chat that delivers a spec, a
deck prompt, a schedule, or a runbook still names what it changed, because a receiving
chat cannot tell a first draft from a revision by looking at the download.

### What the closing chat must state before writing the prompt

For every file it hands over:

1. **The base it started from.** The version it read, and where it read it: the mirror,
   project knowledge, or a file uploaded mid-chat. A chat that edited a standards file
   without fetching the mirror first says so, because that makes a fork likely rather
   than possible.
2. **The version it is leaving behind**, and whether that number was already taken.
3. **The sections it touched**, by heading. Not a summary of intent, the actual headings.
   This is the only thing a receiving chat can diff a rival copy against.
4. **What it deliberately did not touch**, where it considered a change and decided
   against it, so the next chat does not read the absence as an oversight.

A handoff that lists a file as an upload with no statement of what changed gives the
receiving chat no way to notice it is about to fork the same file, and that is the exact
failure of 2026-08-28.

### The closeout kickoff prompt

The prompt is a routing header plus one pasteable block, per the rules above. The block
is short by design: the closeout chat does not need the closing chat's reasoning, it
needs the file list and the tool. Fill the bracketed parts and change nothing else.

`MODEL: Opus 5 (min: Sonnet 5) | THINKING: on | EFFORT: High - bounded execution against an established protocol, but the merge judgment on a FORK verdict is real`

```
Closeout pass for the chat "[TITLE OF THE CLOSING CHAT]".

Files delivered by that chat, with what it did to each:

| File | Base it read | Version delivered | Sections touched |
|---|---|---|---|
| [file] | [where, at what version] | [version] | [headings] |

[Repeat the table for every other chat closing in this same sitting. If two chats
delivered the same filename, say so here in plain words: that is a suspected fork and
it is the whole reason this pass exists.]

Deliberately not touched: [anything considered and rejected, or "nothing"].

Run the closeout. Do not open any other chat first; they will inherit whatever is wrong.

1. Unzip or collect the delivered files into one directory.
2. Run the sweep, which is the whole reconciliation in one command:

   curl -sfL https://raw.githubusercontent.com/pina-hash/idea-app/main/tools/standards-sweep.py -o /tmp/sweep.py
   python3 /tmp/sweep.py --local /mnt/project --delivered <that directory>

   It reads only. It clones nothing into a working repo, commits nothing, and collides
   with no open session. Read `tools/standards-sweep.py` for what each verdict means.
   Then run the repo status the same way, because the kickoffs in step 6 need it:

   curl -sfL https://raw.githubusercontent.com/pina-hash/idea-app/main/tools/idea-status.py -o /tmp/status.py
   python3 /tmp/status.py

3. Act on every verdict it prints. FORK is a prompt to look, not a proof: a sentence
   rewritten in place counts as unique on both sides. Open the diff before merging
   anything, and where it is a real fork merge by content section by section and record
   in the changelog that the version number was reused.
4. Also check the delivered project instructions, if any, against what is currently live.
   The sweep does not cover that file: it is not in `docs/standards/` and has no version
   header, so the only check is a diff for content present in the live copy and absent
   from the delivered one.
5. Deliver the merged files, a corrected `REGISTER.md`, and one Claude Code prompt that
   pushes all of it to `docs/standards/` in `pina-hash/idea-app`. The push is confirmed
   by fetching each file back and quoting what changed, never by the session's report.
6. Only then write the kickoff prompts for the next chats.
```

### Why the closing chat writes it rather than the closeout chat

The closing chat is the only party that knows its own base, and it is also the party
with the motive to be wrong about it. Making it write the table is what forces it to go
and check. A closeout chat handed a bare zip has to reconstruct all four facts from the
files themselves, which is possible for content and impossible for intent.

---

## After the handoff

- The originating chat stays open as the fallback. If the new chat asks for context it should have received, the fix is a patch to this standard, not a one-off answer.
- On request, this assistant reads the new chat back via past-chat tools to verify the handoff landed and to sync any decisions made there.
- Decisions made in the spinoff chat flow back through project knowledge updates, not through re-narration across chats.

---

## Changelog

- **1.3 (2026-09-02)** - Withdraws 1.2's "router chats are always Fable 5.1", same day, on
  Mr. Pina's stated preference that Fable 5.1 be used appropriately rather than by
  default. A router chat is Opus 5 unless its queue is itself undecided; the 2026-08-31
  router degraded with length, not with model. Kickoff rule 7 and the status tool in
  closeout step 2 are unchanged.

- **1.2 (2026-09-02)** - Fable 5 becomes Fable 5.1 in the chat routing table, and a router
  chat is always Fable 5.1 regardless of the ambiguity test, because the 2026-08-31 session
  showed the routing itself is where a long session degrades. Added a line stating that
  this table routes chats only, since `IDEA_instructions.md` 4.17 makes Fable 5.1 the
  default for Claude Code prompts with the lower tiers as exceptions, and the two tables
  would otherwise read as contradicting each other. Added kickoff rule 7: a router kickoff
  carries the decisions owed and the prompts in flight at its top, read from
  `tools/idea-status.py` when the kickoff is written. Added the status tool to closeout step
  2 for the same reason. Prompted by the 2026-09-02 closeout of the nineteen-hour session,
  where nine decisions had been raised one at a time across the whole night.

- **1.1 (2026-08-29)** - Added "Closing a chat: the closeout prompt is written by the
  chat that is closing." Until now the closeout pass only ran when Mr. Pina wrote a fresh
  prompt asking for it by hand, which put the check on the one party with no knowledge of
  what changed. Every chat that delivers files now ends by emitting the closeout kickoff
  prompt itself, and states four things per file first: the base it read and where it read
  it, the version it leaves behind and whether that number was already taken, the sections
  it touched by heading, and what it considered changing and did not. Added the pasteable
  closeout template, which routes the reconciliation to `tools/standards-sweep.py` rather
  than to six prose steps a chat has to remember to execute. Added closeout as a fifth
  handoff trigger. Prompted by the 2026-08-29 closeout, where three standards files were
  found sitting in project knowledge ahead of the mirror, two of them for days, because
  nothing had ever swept the whole set in one pass.

- **1.0 (2026-08-26)** - Version header and this changelog added. The file was authored
  earlier in August 2026 and shipped without either, which went unnoticed until the
  freshness protocol was built and a Claude Code session mirroring the standards set
  found it was the one registered file with no version, no date, and no changelog
  anywhere in it. That is not a formatting complaint: the protocol compares line 2 of the
  mirrored copy against line 2 of the working copy, so a file with no version line cannot
  be checked for staleness by any means and silently opts out of the only mechanism
  protecting it. No content changed in this pass. Stamped 1.0 rather than assigned a
  reconstructed history, since what the earlier versions were is not recoverable.
