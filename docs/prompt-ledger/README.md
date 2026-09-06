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
4. Run `node tools/migration-claims.mjs`. It reads every ref and answers which migration
   numbers are LANDED, which a lane in flight is already HOLDING, and which are free. If
   the new prompt permits a migration, its `Claims:` number is the tool's `next free` and
   is written into the entry BEFORE the prompt is handed over. Do not derive it from
   `ls supabase/migrations/`, from `git ls-tree`, or from the highest number on
   `origin/main`: all three are truthful about the past and silent about what is in
   flight, and all three were consulted, correctly, by the three sessions that wrote
   `0186` on 2026-09-06.
5. If anything is flagged, do not issue. Name the collision and stop.

An entry is written **before** the prompt is handed over. An entry written afterwards
records history; an entry written first prevents a collision.

## The migration number is CLAIMED in the first commit, not chosen at the end

**A number for a new migration is not a fact this repository can answer. It is
allocation, and allocation needs an allocator.** For prompt ids the allocator is the
router chat, which is why this file's ids are stated in the prompt and never derived. For
migration numbers there was no allocator at all: the number was chosen by the SESSION, at
commit time, after the work was written -- which is the worst possible moment, because
every other session that started in the meantime chose from the same reading.

On 2026-09-06 three lanes each fetched `origin/main`, each read `0185` as the highest, and
each wrote `0186`, over four and a half minutes. Every one of them verified correctly.

**So the `Migration permitted` line names the number, and it is pushed before the work.**
A session's entry is already its FIRST commit, pushed alone before anything else -- that
was measured across the five branches that wrote a migration on 2026-09-06, and the file
appeared 24, 26, 28, 28 and 41 minutes after the entry. A claim recorded in the entry is
visible for that whole window. A claim recorded by the file is visible only after it.

`Claims: none` where no migration is permitted, so the line is never ambiguous between
"no migration" and "a migration whose number nobody has stated". The second is the shape
every collision to date was written in, and `tools/migration-claims.mjs` reports it
separately for exactly that reason.

**What this does not fix, stated here rather than discovered later.**

- **A session that claims and never lands burns a number.** A lane that claims `0190` and
  is abandoned holds it until somebody notices. That is why an abandoned entry gets a
  TERMINAL status rather than being deleted: a terminal entry stops claiming, and a
  deleted one takes its history with it.
- **Two sessions started inside the same few seconds still collide.** The three branches
  that took `0186` pushed their first commits at 07:17:42, 07:17:47 and 07:17:58 -- the
  claim helps only where one of them reads after another has pushed. This is the same
  limit the file already states above for prompts themselves, and nothing short of a lock
  closes it.

Both are better than two files with one name and a renumber after the work is written.

**Historical entries are NOT rewritten to this format.** Eleven of them already name a
number in advance (`0011` through `0034`, seven with an explicit RESERVED clause naming
another prompt's number), which is where this format came from -- it is a practice this
ledger had and dropped, not an invention. Fifteen later ones read "number taken at commit
time", which is the shape being replaced. An entry is a dated record of what was issued;
editing one to match a later rule falsifies it. `tools/migration-claims.mjs` reads all of
them, in every shape, and the shapes are pinned by `tests/migration-claims.test.ts`.

## Entry format

    # <id> <short title>
    - Issued: <UTC timestamp>
    - By: <which chat or session wrote the prompt>
    - Owns: <paths and globs, copied verbatim from the prompt's canned opening block>
    - Migration permitted: <yes | no>. Claims: <NNNN | none>. Highest on origin/main at issue: <NNNN>
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
A `claude/**` branch is NOT SWEPT while an entry it ADDED still reads `issued`: the workflow
skips it and records the reason in its job summary.

**An entry the branch ADDED, and never one it merely modified**, and the difference is not
pedantic. Advancing somebody else's entry from `pushed` to `deployed` is the bookkeeping this
file asks for, and a branch doing it while its own session runs would otherwise be judged by
that finished foreign entry. The first version of the gate ranked the changed entries and let
the highest-numbered one decide; the branch that built it advanced entry 0010 in passing, 0010
outranked its own 0007, and it read `deployed` and merged its own still-running branch. A
session's own entry is its FIRST COMMIT on its branch, which makes it an ADD against the merge
base, so the ADD is what identifies it. There is no ranking left: every added entry is asked
and one `issued` among them holds the branch.

A branch that introduces no ledger entry merges exactly as it always did, and so does one whose
entry carries any other status. The gate only ever ADDS a skip, and it skips on exactly two
things: an added entry reading `issued`, and a surprise it cannot read past (no merge base with
`origin/main`, or an added entry that yields no blob at the branch tip).

**That is what makes a standing branch mean something again.** Before the gate, the
workflow deleted a branch the moment its CI went green, and a session commits its ledger
entry FIRST, so a session still running was swept minutes in and left nothing standing
behind it. On 2026-09-02 both prompts in flight read as zero standing branches and a router
chat nearly took the queue as empty. Under the gate a branch stands while its session is
live, or because its CI failed, or because its merge conflicted, and those are the three
things a branch list is worth reading for. **The in-flight queue itself is still read from
this directory across every ref, never from the branch list** -- `tools/idea-status.py`
does that, and a short branch list proves nothing on its own.

**Only the exact token `issued` holds a branch.** The gate reads EVERY `Status` bullet in an
added entry, at any markdown bullet and through a value folded onto the continuation line, and
normalises it as a strict SUPERSET of `tools/idea-status.py`: the first whitespace-separated
token, lowercased, with surrounding punctuation stripped. Superset and not equality, on purpose
-- the tool strips only `.` and `,`, so `issued;` and `"issued"` read as `issued` here and would
not there. Reading one shape too many costs a finished branch standing until somebody looks at
it; reading one too few costs a running session its branch, and only one of those is
recoverable. Anything else merges, and that includes free
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
