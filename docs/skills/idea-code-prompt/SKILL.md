---
name: idea-code-prompt
description: Write a Claude Code or Codex prompt for idea-app, frc-app or fll-app - model and effort header, solo or parallel mode, ledger and migration numbers, audit gate, checks, landing on main.
---

# Writing a Claude Code prompt

Source of truth: `docs/skills/idea-code-prompt/SKILL.md` in pina-hash/idea-app, with the full rationale in `docs/standards/IDEA_instructions.md` ("Claude Code Prompting"). This file is the procedure.

## 0. Before writing anything

1. Run the idea-state-of-world skill. Take from it: decisions owed (a lane never opens on an open decision), prompts in flight on the same file surface (never issue a second prompt for a surface already in flight), standing or stalled branches (a stalled branch outranks any new lane), and the next free ledger number and migration number.
2. If the request is large or vague, run deeper-not-bigger first.
3. Read the target repo's own `CLAUDE.md` for its migration apply path. Never carry one repo's apply path to another: idea-app applies migrations through `migrate.yml` on push to main; fll-app uses `supabase db push` and `scripts/land-migration.sh`; frc-app declares its own.

## 1. Choose model and effort, per prompt, never carried forward

Use the current generation only. As of 2026-10: Sonnet 5.5, Opus 5.5, Fable 5.1. Never write a 5.0 name.

| The session must... | Model | Effort |
|---|---|---|
| Make a fully specified docs-only or copy change | Sonnet 5.5 | medium |
| Build anything in `src/`, any migration, any verification that will be relied on, with every unknown answerable from the tree | Opus 5.5 | high |
| Decide what the prompt could not specify: an undocumented subsystem, a port between repos, a repo-wide sweep, first-draft architecture, an irreversible operation | Fable 5.1 | high (xhigh only if irreversible or repo-wide) |
| Grind high-volume work stated completely as data and tests (migrations, RPCs, validators, pure logic) with nothing to look at | GPT-6 Astra as a Codex cloud task | high |

- Anything that asks what something looks like stays with Claude; Codex has no browser.
- `ultracode` is an effort setting on its own (it is xhigh plus orchestration), used for multi-part work inside ONE lane. Only one xhigh, max or ultracode bundle runs at a time.
- Hard-to-reverse work: one tier up and xhigh.

## 2. Mode

- **Solo** (default): no other writing session is open on that repo. The session fetches main, works, rebases, runs its local gate, and pushes ONCE to main with the ledger entry inside the same push. It reports the sha and does not wait on CI.
- **Parallel**: two or more sessions writing one repo at once. Each pushes a branch; the ledger entry is its first commit and claims the numbers. Prefer one solo lane over two parallel lanes unless the second saves more than the integration overhead.

## 3. The routing header (outside the code block, directly above it)

`MODEL: Opus 5.5 (min: Sonnet 5.5) | EFFORT: high | Mode: solo | Ledger: <nnnn from step 0> | Migration: none - one-line reason naming the table row`

The first line INSIDE the block is `Before doing anything else` (or `This is a READ-ONLY audit`). If it starts with `MODEL:`, the header is in the wrong place.

## 4. The prompt body, in order

1. **Opening.** `git fetch origin main` and the committer-identity check. Add `git fetch --unshallow origin` and `git fetch origin integration` only in parallel mode or when a history-reading tool runs.
2. **Claims sentence.** Every statement about the repo is a claim the session checks before relying on it.
3. **Owns.** The exact file paths and globs this prompt may write. Nothing outside them.
4. **Numbers.** The ledger number, and the migration number(s) if permitted, stated outright. Never "take the next free number".
5. **Audit phase.** Questions the session answers from the tree first, gating the build. Expect about half of "open" items to have shipped already.
6. **The build**, described as outcome and constraints, not line edits, unless code drafted in chat must land verbatim.
7. **Checks, sized to the job.** Targeted test files during the work (name them where knowable), mutants against the targeted file, the browser harness on touched route specs only, `npm run check` (svelte-check catches what vitest cannot), then ONE full `npm test` at the end with its summary line read (it can exit 0 with a failure). Docs-only: only the doc checks for files touched, no suite.
8. **Landing.** Rebase on origin/main, push HEAD:main once, never force-push, never delete a remote branch. A real content conflict is a stop.
9. **Report.** Pushed sha, what was found vs built, the live site's version sha if reachable (landed is not deployed), and anything a person must act on, also written into the `docs/history/` entry.
10. **Ledger entry text** for `docs/prompt-ledger/entries/`, with Owns copied verbatim and `Migration permitted:` set.

## 5. Rules that bite

- Full prompts, never "add this line to the earlier prompt". One prompt goes to one session; never paste it twice.
- Never route Mr. Pina through GitHub Actions. If he must merge, it is a pull request with exact button names.
- A cloud container cannot reach the production database. Never ask a session to apply SQL by hand.
- `revoke ... from public` does not remove Supabase's direct anon grants; revoke from anon by name.
- A verification query returns rows naming what it examined, never `raise notice`.
- Large code or data goes as an attached file, not pasted inline.
- Website work ships complete and refined, never bare minimum. Visual work names the idea-design skill.

## 6. Delivery

Lead the reply with what to run NOW. If more than one prompt, say which is live and which is queued.
