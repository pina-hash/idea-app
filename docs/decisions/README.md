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
One file per entry means two writers touch no line in common. The number is taken from
the highest on `origin/main` at the moment of writing, like a migration number, and a
collision on the number is the signal that two chats raised decisions at once.

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
