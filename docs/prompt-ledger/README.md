# docs/prompt-ledger/

One prompt goes to one session. This directory records every Claude Code prompt at the
moment it is **issued**, not when it lands, so a chat can tell whether the work is already
in flight before writing a rival prompt for it.

Parallel chats and parallel sessions cannot see each other. That is the entire problem
this directory exists for.

**One file per entry, under `entries/`, named `<id>-<slug>.md`.** Never one shared file.
A shared append-only file is a fork waiting to happen: `docs/HISTORY.md` was split for this
reason and stopped conflicting, and `tools/browser-verify/routes.mjs` then took its place
and blocked a merge outright three times in one day before it was split the same way.

## Why this is fetched, never read from a mount

The project-knowledge copy of this ledger is a snapshot taken when a chat opened. An entry
written at 2pm is invisible to a chat that opened at 1pm, which is exactly the case that
produced two migrations claiming `0146`. So the check fetches this directory live:

    curl -sfL https://raw.githubusercontent.com/pina-hash/idea-app/main/docs/prompt-ledger/entries/<file>

Same asymmetry as `docs/standards/`: a fetch that shows an entry proves the work is in
flight. A fetch that shows nothing proves only that nothing has been recorded yet, which
is weaker, because an entry lands here only when the issuing chat remembers to write one.

## What this catches, and what it does not

**Catches:** a later chat re-issuing work already issued, and two prompts in flight whose
owned file surfaces overlap.

**Does not catch:** two chats that both write a prompt in the same minute, before either
records an entry. Nothing short of a lock catches that, and a lock is not worth building
for a two-person workflow.

**Does not dedup on prompt text, deliberately.** The key is the owned file surface. The
2026-08-29 `0146` collision was two textually different prompts for overlapping work, so a
content hash would have produced two different ids and admitted both. Text identity is the
easy case and not the dangerous one.

## The check, before issuing any prompt

1. Fetch `entries/` live. Do not read a mounted copy.
2. List every entry whose Status is not `deployed`.
3. Flag any whose **Owns** paths intersect the new prompt's Owns paths. Intersection is by
   path prefix and glob, not by topic. Two prompts for unrelated features that both touch
   `src/lib/components/` intersect.
4. Flag any entry with **Migration permitted: yes** if the new prompt also permits one,
   regardless of file surface. There is one migration number sequence and two sessions
   cannot both take the next number.
5. If anything is flagged, do not issue. Name the collision and stop.

An entry is written **before** the prompt is handed over. An entry written afterwards
records history; an entry written first prevents a collision.

## Entry format

    # <id> <short title>
    - Issued: <UTC timestamp>
    - By: <which chat or session wrote the prompt>
    - Owns: <paths and globs, copied verbatim from the prompt's canned opening block>
    - Migration permitted: <yes | no>. Highest on origin/main at issue: <NNNN>
    - Status: <issued | pushed | in-integration | deployed>
    - Branch: <from the session's FINAL REPORT, never from the prompt>
    - Notes: <including anything deliberately excluded>

**Owns is copied verbatim, never summarised.** A boundary stated as a topic is not
checkable; a boundary stated as paths is. A prompt whose opening block names no paths is
not finished and does not get an entry yet.

**Branch is the one in the session's final report.** A session's branch is assigned by the
harness, not chosen by the prompt, and a resume never returns to the branch it resumes
from. Reading the prompt to decide what to merge is reading the request rather than the
result.

## Status transitions, and how each is confirmed

    issued          -> pushed          the session's OWN final commit, as its last act
    pushed          -> in-integration  the branch is gone and integration contains its sha
    in-integration  -> deployed        confirmed by reading the artifact on main and quoting it

Never advance a status on the strength of a report, a branch page, or a green check. Each
transition is confirmed by reading the thing itself.

**The session makes the first transition itself, and only that one.** An entry reads
`issued` for as long as its session is running, and the session's FINAL commit on its
branch sets it to `pushed`. That is not an exception to the rule above: a session setting
`pushed` on its own entry as its last act is the session reporting on itself at the only
moment it can be certain, and it is the same evidence `git ls-remote` would give a chat
reading it afterwards. Every LATER transition is still confirmed by reading the artifact,
and no session ever writes one of those about itself.

**`.github/workflows/integrate.yml` reads this line, which is why it is not decoration.**
A `claude/**` branch whose newest introduced entry still reads `issued` is NOT SWEPT: the
workflow skips it and records the reason in its job summary. A branch that introduces no
ledger entry merges exactly as it always did, and so does one whose entry carries any other
status; the gate only ever ADDS a skip, and it fails safe by skipping when it cannot read
the entry at all.

**That is what makes a standing branch mean something again.** Before the gate, the
workflow deleted a branch the moment its CI went green, and a session commits its ledger
entry FIRST, so a session still running was swept minutes in and left nothing standing
behind it. On 2026-09-02 both prompts in flight read as zero standing branches and a router
chat nearly took the queue as empty. Under the gate a branch stands while its session is
live, or because its CI failed, or because its merge conflicted, and those are the three
things a branch list is worth reading for. **The in-flight queue itself is still read from
this directory across every ref, never from the branch list** -- `tools/idea-status.py`
does that, and a short branch list proves nothing on its own.

**Only the exact token `issued` holds a branch.** The gate normalises a `Status` value the
way `tools/idea-status.py` does, taking the first whitespace-separated token, lowercased,
with a trailing period or comma stripped. Anything else merges, and that includes free
text: entry 0006 read `partly landed. Its MIGRATION is on origin/main; its client half is
not on any ref this session can see` for most of 2026-09-02, and a value of that shape is
written whenever somebody has something true to say that the four states cannot carry. The
vocabulary is still the four states above and this adds no fifth, but a status a tool does
not recognise must never be able to pin a branch open forever, so an unrecognised value
fails toward merging while only `issued` holds.

An entry reaching `deployed` stays here. It is not deleted and not archived, because the
question a later chat asks is "has this been done", and a removed entry answers it wrongly.

## Who writes the entry, and where the check reads

**The session writes the entry, not the chat, as its first commit on its branch.** A chat
cannot push. So the entry text travels inside the prompt, and the session that receives
it commits and pushes the entry before touching anything else, on the branch the harness
gave it. An entry that exists only in project knowledge is invisible to every other open
chat; an entry pushed first is visible to any chat that fetches after it.

**The check reads entries across `origin/main`, `origin/integration` and every
`claude/**` branch**, not `main` alone. An entry on an unmerged branch is exactly the
in-flight work the check exists to find: it was pushed minutes ago by a session that has
not finished, and `main` will not carry it until the branch is swept and deployed.
`tools/idea-status.py` performs that read (its PROMPTS IN FLIGHT section), deduping by
id and preferring the copy with the most advanced status, so a single run answers the
question without anyone fetching three refs by hand.
