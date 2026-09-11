# 0148 IDEA Foundry: full screen on an iPhone

- Issued: 2026-09-11
- By: the router chat, from a student report. Enrique Mercado, student,
  2026-09-10, build `fca512a`, route `/foundry`, iPhone running iOS 18.7 /
  Safari 26.3, viewport 607x320 (landscape). His words: "doesn't full screen on
  mobile good".
- Owns: `src/lib/foundry/**`, `src/routes/foundry/**`, `tests/dom/foundry*`,
  `tools/browser-verify/routes/foundry*.mjs` and the generated regions of its
  README, `docs/prompt-ledger/entries/0148-*`, and its own `docs/history/`
  entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0198
- Status: pushed
- Branch: `claude/lucid-mccarthy-88p4bl`, branched from `origin/integration` at
  `7be051f6`.
- Notes:

  **DUPLICATE CHECK, CLEAN, THREE WAYS.** (1)
  `git log --all --oneline --diff-filter=A -- 'docs/prompt-ledger/entries/0148-*'`
  returned nothing -- no commit on any ref, at any point in history, ever added
  a file under that path. (2) Every one of the 43 heads on `origin` was swept
  individually at its tip with
  `git ls-tree -r --name-only origin/<ref> -- docs/prompt-ledger/entries`
  filtered to `/0148-`; zero hits. (3) The live GitHub contents API for
  `docs/prompt-ledger/entries?ref=main` was fetched rather than read from the
  mounted tree, and the highest id it carries is `0146`. A fourth reading came
  free from `tools/idea-status.py`, whose PROMPTS IN FLIGHT section lists 129
  entries across `main`, `integration` and every `claude/**` and `codex/**`
  branch and names no `0148` (highest listed: `0146`). Ledgers 0147, 0149 and
  0150, named by this prompt as running in parallel, had pushed no entry at the
  time of this check.

  **THE THREE OPENING FETCHES.** `git fetch --unshallow origin` succeeded and
  `git rev-parse --is-shallow-repository` answers `false`. `git fetch origin
  integration` succeeded. The identity check found one already set:
  `user.name` -> `Claude`, `user.email` -> `noreply@anthropic.com`; nothing had
  to be set.

  **`origin/main` CAME BACK AS A FORCED UPDATE** (`+ 336e82f...7be051f main`),
  which is the shallow clone's remote-tracking ref being repointed, not a
  force-push on `main` -- `origin/integration` and `origin/main` are the SAME
  commit, `7be051f6`, 0 ahead and 0 behind each other, so branching from
  `integration` and branching from `main` were the same act here.
