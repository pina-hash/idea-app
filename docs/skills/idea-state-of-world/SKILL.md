---
name: "idea-state-of-world"
description: "Run before writing any IDEA prompt, opening a lane, or answering what is on main, deployed, standing, or owed to Mr. Pina in pina-hash/idea-app."
---

# State of the world for idea-app

Never answer from memory of what was issued. Every claim names what was examined (a sha, a ref, a file), never a bare count.

## 1. Clone with real history

Never read git history from a shallow clone; it reports wrong metadata rather than missing metadata.

```
cd /tmp && rm -rf ops && git clone -q --filter=blob:none https://github.com/pina-hash/idea-app.git ops && cd ops && git fetch -q origin '+refs/heads/*:refs/remotes/origin/*'
```

Clone once per chat, then `git fetch` on later passes.

## 2. Status tool to a file

```
python3 tools/idea-status.py > /tmp/status.txt 2>&1
```

Read only the sections needed: decisions owed, prompts in flight, standing branches, main vs integration, migrations at or above the floor. Applied migration state is the one thing it cannot know; it prints the query.

## 3. Branch survey (not optional before any refill)

For every `origin/claude/**` and `origin/codex/**` ref, test `git merge-base --is-ancestor <ref> origin/main`, and against `origin/integration` while parallel work is open. Never `git branch -r --contains X | grep`, which matches a branch by its own name.

- Contained in neither: STANDING.
- Standing with no commit in 24 hours: STALLED. A stalled branch outranks any new lane.
- Green and behind: it conflicted, it did not stall.
- A vanished branch is correct: it merged.

Know the trunk first. If `integration` is behind `main`, survey against `main`.

## 4. Deploy check

Landed is not deployed. Read the footer of https://ideabosco.com/ ("IDEA Portal vX · <7-char sha> · <date>") and compare to `git rev-parse --short=7 origin/main`. If behind, count `git rev-list --count <deployed>..origin/main` and separate commits touching only `materials/` (no runtime effect) from runtime commits. If the site is unreachable from this container, say so; reachability differs per container.

## 5. Decisions owed

A decision entry reading `open` may describe work that shipped weeks ago. Check the tree for the build it names before calling it open. An entry with no `Build:` line appears in no status list, so grep `docs/decisions/entries/` directly when something seems missing.

## 6. Report

Lead with what to run NOW. Then, only what applies: decisions for Mr. Pina (one line each, with the default you would pick), stalled branches and the one action that unblocks each, deploy gap, and the single next solo lane with the file surface it owns. Short: he reads the decision and one line of reason.