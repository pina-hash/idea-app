# docs/decisions/

One file per decision owed to Mr. Pina, under `entries/`, named `<nn>-<slug>.md`.

Nine decisions sat blocked for the whole of 2026-08-31 because each was raised as it
surfaced, one at a time, across nineteen hours. Together they were ten minutes of his
attention. This directory is the one list. `tools/idea-status.py` prints the open
entries first, above everything else it reports, and a router kickoff carries them at
its top (`IDEA_Chat_Handoff_Standard.md` 1.2, kickoff rule 7). A router chat that finds
an item's decision open does not open a lane on it; it puts the decision at the top of
its next message and moves on (`IDEA_instructions.md` 4.17, "Decisions owed to
Mr. Pina are one list, surfaced first").

## Why one file per decision

A shared list is a fork. Two chats or two sessions raising a decision in the same hour
would both append to the same file at the same closing line, which is the failure
`docs/HISTORY.md` and `tools/browser-verify/routes.mjs` each had before they were split.
One file per entry means two writers touch no line in common.

## How a number is claimed -- READ THIS BEFORE PICKING ONE

**A NUMBER CANNOT BE RESERVED, AND READING `origin/main` IS NOT A CLAIM.** This section
used to say the number was "taken from the highest on `origin/main` at the moment of
writing, like a migration number", which is how to CHOOSE one and says nothing about how
to HOLD one. On 2026-09-05 two prompts each read `origin/main`, each correctly found 15
free, and each wrote a `15-*.md`. Both were right when they looked. Both landed. Git
merged them without a murmur, because two files with different slugs conflict on nothing
-- so the collision was invisible until somebody listed the directory. That is the same
failure as duplicate migration 0177, one directory over.

There is no fix that makes the claim atomic at write time. The only thing that could
serialize two sessions is a shared file they both edit, and a shared file is exactly the
fork this directory was split to remove. So the number is settled AFTERWARDS, by a rule
that needs no coordination:

**THE EARLIER CREATING COMMIT KEEPS THE NUMBER. THE LATER ONE MOVES.** Compare
`git log --diff-filter=A --format=%ci -- <path>` for the two files; the later one is
renumbered to the next free number, above every number then in use on `origin/main` and
`origin/integration`. It is a total order, both sessions would compute the same answer,
and neither has to have been watching.

Which means: **write the entry with the number you read, and expect that you may have to
move it.** A session that finds a collision at HEAD fixes it in the same bundle rather
than leaving it -- an ambiguous number is worse than a gap in the sequence, and gaps are
fine. When you move one, add a `Renumbered` line to the entry saying what it was, when,
and why that one moved; entry 17 is the worked example.

**CITE A DECISION BY ITS SLUG, NEVER BY ITS NUMBER ALONE.** "decision 15" is what a
renumbering cannot repair: `docs/history/` is a dated record and is never edited, so two
history entries now say "decision 15" meaning two different things, permanently. Write
`decision 15 (scoped-migration-role)` or the full path, and the citation survives the
move. Entry 16's Context line already does this and is why it needed no repair.

**NOT BUILT, AND NAMED SO IT IS NOT REINVENTED: nothing detects a collision.**
`tools/idea-status.py` parses each entry's number out of its heading and never compares
two, so a duplicate prints twice and reads as two ordinary rows. A check that reddens --
in the status tool, or a test over this directory -- is the thing that would have caught
this in minutes instead of hours. Prompt 0065 owned the renumbering and not the tool, so
it is written down here rather than half-built.

## Format

    # <nn> <title>
    - Raised: <date>  By: <chat or session>
    - Status: open | decided | withdrawn
    - Decision: <blank until decided; then the answer in one sentence, dated>
    - Default this assistant would pick: <one sentence>
    - Why it is blocked on him: <one sentence>
    - What it unblocks: <the item or lane>
    - Context: <where the facts are; a doc path, a history entry, a migration number>

Every entry carries the default this assistant would pick, so answering it is a yes or
a correction rather than a design session. Every factual claim inside an entry is a
claim; where a session could check it against the tree, it did, and a `Tree check` line
records where the tree disagreed.

## How a decision is closed

**By editing its own file, never by deleting it.** Set `Status` to `decided` or
`withdrawn`, fill the `Decision` line with the answer in one sentence and the date, and
leave everything else as it was, so that "has this been decided, and what was the
answer" is answerable later by reading the file. A decided entry stays here; a removed
entry answers "was this ever raised" wrongly. Reopening is the same edit in reverse,
with a line saying why.

`tools/idea-status.py` reads `Status` and prints only the open ones; a decided entry
drops out of the list without anyone touching the tool.
