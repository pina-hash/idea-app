---
name: idea-code-prompt
description: Write a Claude Code or Codex prompt for any of Mr. Pina's repos - model and effort chosen from Haiku to Fable, solo or parallel mode, ledger and migration numbers, audit gate, checks, landing on main - handed to Mr. Pina to paste.
---

# Writing a Claude Code prompt

Source of truth: `docs/skills/idea-code-prompt/SKILL.md` in pina-hash/idea-app, with the full rationale in `docs/standards/IDEA_instructions.md` ("Claude Code Prompting"). This file is the procedure.

## 0. Before writing anything

1. Run the idea-state-of-world skill. Take from it: decisions owed (a lane never opens on an open decision), prompts in flight on the same file surface (never issue a second prompt for a surface already in flight), standing or stalled branches (a stalled branch outranks any new lane), and the next free ledger number. Never a migration number: see section 4, item 4.
2. If the request is large or vague, run deeper-not-bigger first.
3. Read the target repo's own rules file (listed in `docs/dispatch/repos.json`) for its migration apply path. Never carry one repo's apply path to another: idea-app applies migrations through `migrate.yml` on push to main; fll-app uses `supabase db push` and `scripts/land-migration.sh`; frc-app declares its own.

## 1. Choose model and effort, per prompt, never carried forward

The current models, their exact ids and what each is for are in `docs/dispatch/models.json` in pina-hash/idea-app; read it rather than trusting memory or an older document. As of 2026-10-17: Haiku 5.5, Sonnet 5.5, Opus 5.5, Fable 5.1. Never write a 5.0 name. Pick the cheapest model that will do the job well, and Opus 5.5 only where it is the best fit.

| The session must... | Model | Effort |
|---|---|---|
| Make a mechanical, fully specified change: a rename, a status flip, a copy edit, one docs file | Haiku 5.5 | low or medium |
| Make a fully specified docs-only bundle, specified UI copy, or a small fix with a named file and test | Sonnet 5.5 | medium |
| Build in `src/` with judgment, any migration, verification that will be relied on, every unknown answerable from the tree | Opus 5.5 | high (xhigh if hard to reverse) |
| Decide what the prompt could not specify: undocumented subsystem, port between repos, repo-wide sweep, first-draft architecture, irreversible operation | Fable 5.1 | high (xhigh only if irreversible or repo-wide); needs his go |
| Grind high-volume work stated completely as data and tests with nothing to look at | GPT-6 Astra as a Codex cloud task | high |

- Before choosing Fable, ask whether talking the gaps through with Mr. Pina (by voice) would let Opus 5.5 run it instead; that is his preferred path.
- Anything that asks what something looks like stays with Claude; Codex has no browser.
- `max` effort is for a single hard verification, never a whole build. xhigh, max and ultracode need his go. A dispatched session cannot run ultracode; it runs at xhigh.
- Effort serializes: only one xhigh or max session runs at a time.

## 2. Mode

- **Solo** (default): no other writing session is open on that repo. The session fetches main, works, rebases, runs its local gate, and pushes ONCE to main with the ledger entry inside the same push. It reports the sha and does not wait on CI.
- **Parallel**: two or more sessions writing one repo at once. Each pushes a branch; the ledger entry is its first commit and claims its ledger number. Migration numbers are still taken at landing (section 4, item 4). Prefer one solo lane over two parallel lanes unless the second saves more than the integration overhead.

## 3. The routing header (outside the code block, directly above it)

`MODEL: Sonnet 5.5 | EFFORT: medium | Mode: solo | Ledger: <nnnn from step 0> | Migration: none - one-line reason naming the table row`

The first line INSIDE the block is `Before doing anything else` (or `This is a READ-ONLY audit`). If it starts with `MODEL:`, the header is in the wrong place.

## 4. The prompt body, in order

1. **Opening.** `git fetch origin main` and the committer-identity check. Add `git fetch --unshallow origin` and `git fetch origin integration` only in parallel mode or when a history-reading tool runs.
2. **Claims sentence.** Every statement about the repo is a claim the session checks before relying on it.
3. **Owns.** The exact file paths and globs this prompt may write. Nothing outside them.
4. **Numbers.** The ledger number, stated outright. For migrations, only whether they are permitted and how many, written as "the next free migration number at landing": never a fixed migration number and never a reserved range (ledger 0407, idea-app `CLAUDE.md`, "A MIGRATION NUMBER IS TAKEN AT LANDING"). The session writes its file under the next free number, takes the next free number again when it rebases to land, renames its file if someone landed first, and states the final numbers on its ledger entry's `Claims:` line. A reserved number nobody wrote stops `migrate.yml` (two entries claimed 0271 on 2026-10-18) and leaves a hole in the series.
5. **Audit phase.** Questions the session answers from the tree first, gating the build. Expect about half of "open" items to have shipped already.
6. **The build**, described as outcome and constraints, not line edits, unless code drafted in chat must land verbatim.
7. **Checks, sized to the job.** Targeted test files during the work (name them where knowable), mutants against the targeted file, the browser harness on touched route specs only, `npm run check` (svelte-check catches what vitest cannot), then ONE full `npm test` at the end with its summary line read (it can exit 0 with a failure). Docs-only: only the doc checks for files touched, no suite.
8. **Landing.** Rebase on origin/main, push HEAD:main once, never force-push, never delete a remote branch. A real content conflict is a stop.
9. **Report.** Pushed sha, what was found vs built, the live site's version sha if reachable (landed is not deployed), and anything a person must act on, also written into the `docs/history/` entry.
10. **Ledger entry text** for the repo's prompt ledger, with Owns copied verbatim and `Migration permitted:` set.

## 5. Rules that bite

- Full prompts, never "add this line to the earlier prompt". One prompt goes to one session; never paste it twice.
- Never route Mr. Pina through GitHub Actions. If he must merge, it is a pull request with exact button names.
- A cloud container cannot reach the production database. Never ask a session to apply SQL by hand.
- `revoke ... from public` does not remove Supabase's direct anon grants; revoke from anon by name.
- A verification query returns rows naming what it examined, never `raise notice`.
- Large code or data goes as an attached file, not pasted inline.
- Website work ships complete and refined, never bare minimum. Visual work names the idea-design skill.

## 6. Delivery: the chat starts the session

Mr. Pina, 2026-10-20: chats start Claude Code sessions themselves, as one-time scheduled tasks, rather than handing him prompts to paste. This replaces the 2026-10-19 rule (he pasted the prompt or said which way each time). Interrupt him only for decisions that are his. He wants fewer, larger sessions: merge work into as few sessions as the file surfaces allow, and shrink a repo's rules file first when it is large, because every session reads it.

To start a session from the chat:

1. Push the session's context to `main` first: a `docs/feedback/<date>/QUEUE.md` (or similar) with every item word for word, its ids and route, his answers from the chat, and every screenshot as a file beside it. A session must never need the chat to understand its task.
2. `create_trigger` with `prompt: "/effort <effort>"`, `initiation: human_request`, `name: "<ledger> <short title> (<model> <effort>)"`, and neither `cron_expression` nor `run_once_at`, so it runs only when step 4 fires it, once (a schedule as well would start a second run).
3. `update_trigger` with `model:` the exact id from `docs/dispatch/models.json`.
4. `fire_trigger` with `text`: "Do the work yourself in this session, in the open; do not hand the whole job to one subagent." then the full prompt.
5. Give him the session link: `session_id` `cse_<x>` is `https://claude.ai/code/session_<x>`. Never delete a session's scheduled task: that deletes the session.
6. Run at most three at once, never two whose files or database overlap. Sessions in other repos may run alongside.
7. **A scheduled session can push only to a repository in its sources, and `create_trigger` cannot add one** (ledgers 0422 and 0423, 2026-10-21: both built everything and pushed nothing). Before starting one, check that every repository it must push to is a source. If not, run the work from the chat instead: `add_repo` with `access: push`, then a background subagent in the chat's own container, which can push.
8. **A session that cannot push leaves its work as `git format-patch` output in project knowledge.** The chat that lands it deletes that project doc in the same turn, and says so. A patch doc left behind gets applied twice by the next chat that finds it.

If a chat cannot start a session (no scheduled-task tools there), say so in one line and give him the routing header and the prompt in one code block, ready to paste. Before writing, check `main` for anything already running or landed on the same files, and name any overlap in one line.
