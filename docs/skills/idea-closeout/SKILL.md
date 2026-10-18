---
name: "idea-closeout"
description: "Close an IDEA chat or reconcile delivered standards files: sweep, merge forks by content, push docs to main with a ledger entry, confirm from a fresh clone, update project knowledge."
---

# IDEA closeout pass

Run when one or more chats finish and before opening the next ones; the next chats inherit whatever is wrong. Mr. Pina never has to ask for this, and he never uploads a text doc.

## 1. Collect and sweep

Put every delivered file in one directory, then from a blobless clone of pina-hash/idea-app:

```
python3 tools/standards-sweep.py --local <project knowledge copies> --delivered <that directory>
python3 tools/idea-status.py > /tmp/status.txt 2>&1
```

The sweep reports SAME, AHEAD, STALE, FORK or REGRESSION per standards file, register rows that disagree with their files, unregistered files in either direction, and copies whose header disagrees with their newest changelog entry.

## 2. Read the verdicts correctly

- FORK is a prompt to look, not a proof. A sentence rewritten in place counts as unique on both sides. Open the diff. If the mirror is simply ahead, take the mirror. Merging stale text back in is the failure.
- A real fork is merged section by section by content, never by picking the higher version number. Say in the changelog that the number was reused.
- A verdict about project knowledge is about project knowledge, not the mirror. Re-download a self-inconsistent local copy rather than editing it.
- The project instructions field is not in `docs/standards/` and carries no version. Check a delivered copy by diffing against the live one, looking for content the live copy has and the delivery lacks.

## 3. Land it (solo mode)

The router chat allocates the ledger number; never take the next free one. Commit the merged files, the corrected `docs/standards/REGISTER.md`, and the ledger entry in `docs/prompt-ledger/entries/` in ONE push to `main`, after rebasing and running only the doc checks for the files touched. Docs-only bundles run no test suite.

## 4. Confirm

Confirm by fetching each file back from a fresh `git clone` and quoting what changed. Never confirm by a report, a raw URL (CDN-cached), a branch page, or a green check.

## 5. Project knowledge

Write the same files to project knowledge with the Projects tool from `main` as it now stands, then read both back. The Projects tool replaces in place, so it cannot create the suffixed duplicate a web upload can.

## 6. Hand off

End with the closeout kickoff prompt, unprompted, per `IDEA_Chat_Handoff_Standard.md`: for each file, the base read and where it was read, the version left behind, the sections touched by heading, and what was considered and not changed. Put decisions owed and prompts in flight at the top, read from the status tool.