# 0210 The tier is chosen per prompt and is never a default, Codex included

- Issued: 2026-09-13
- By: router chat
- Owns: `docs/standards/IDEA_instructions.md`, `docs/standards/REGISTER.md`,
  `docs/prompt-ledger/entries/0210-*`, and its own `docs/history/` entry. NO OTHER
  FILE.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/confident-cannon-ljdhfe`, branched from `origin/integration` at
  `34a44f2d`.
- Notes: Standards-only, one rule, written into the section of
  `IDEA_instructions.md` that already covers model tiers. It REPLACES the default
  that document stated -- Opus 5 at `high` as the build tier with Fable 5.1 for what
  a session must decide alone -- with a per-prompt choice: there is no build tier
  because there is no default. Sonnet 5 for a docs-only bundle, Opus 5 at `high` for
  anything touching `src/`, any migration and any verification whose result will be
  relied on, Fable 5.1 only where the session must decide something the prompt could
  not specify, and GPT-6 Astra as part of the same choice rather than a separate
  question. Mr. Pina stated on 2026-09-13 that roughly the last twenty prompts all
  carried Opus 5 at `high` without the choice being made, and that saving usage
  matters even on a 20x Max plan. Effort serialization is POINTED AT rather than
  restated; the Codex cloud-task constraints are cross-referenced to "Two agents, one
  repository" rather than repeated.

  **The duplicate check ran three ways and all three came back clean.** No
  `docs/prompt-ledger/entries/0210-*` exists on `origin/integration`, on
  `origin/main`, or on any of the remote refs (the highest entries anywhere are
  `0205`, `0206`, `0207` and `0209`, each on its own unmerged lane; `0208` and `0210`
  are both unwritten). No commit subject on any ref names ledger `0210` -- every
  `0210` in the history is the MIGRATION `0210`, the notebook note grid, which is a
  different sequence and is already landed. And `node tools/migration-claims.mjs`
  reports highest landed `0211`, next free `0213`, with `0212` held by
  `claude/busy-feynman-aupq55` for ledger `0207`; this bundle claims nothing, so it
  collides with none of it.

  **The file was fetched with git, never `curl` on `raw.githubusercontent.com`**, and
  the fetch is the finding. `origin/integration` and `origin/main` both hold
  `IDEA_instructions.md` at **4.26**; **4.27 exists only on
  `origin/claude/dazzling-ramanujan-i2hry6`**, ledger `0205`'s lane, which is not
  merged into `integration`. Building 4.28 on the 4.26 that this branch's own base
  holds would have silently dropped ten rules, so 0205's file is carried in verbatim
  as this branch's FIRST content commit, separate from and before anything this
  bundle wrote, and 4.28 is built on top of it. `IDEA_VERIFICATION_ADDENDA.md` 2.6 is
  0205's too and is NOT carried -- it is outside this bundle's file surface -- so
  `REGISTER.md` moves only its `IDEA_instructions.md` row and leaves the addenda row
  at 2.5, matching the addenda file this branch actually holds.

  **Ledger 0205's open count is decided rather than inherited, and it was NOT
  internally consistent.** Its 4.27 changelog entry opened "Ten rules ... eight of
  them written here and two of them corrections", then narrated eleven items and
  introduced "The two corrections:" over one correction followed by a new rule. What
  actually landed is ten rules in this file (nine from the prompt, a tenth that
  arrived mid-bundle) plus one correction to the three-state Hard Rule, whose rule
  proper `IDEA_VERIFICATION_ADDENDA.md` rule 41 owns. Three surgical edits to that
  entry's prose make the number, the split and the narration agree; no rule text is
  touched.

  **The migration range was checked before any merge and no merge is proposed.**
  `origin/integration` holds `0209`, `0210` and `0211` and does not hold `0212`, so
  the permitted ceiling is not exceeded and there is nothing to stop. This bundle
  pushes its branch and stops there.

  **The suite is GREEN off `integration` at branch time (`34a44f2d`): 457 test files,
  8673 tests, 0 failed**, read off the summary line and not the exit code. The one
  pre-existing failure this prompt warned about is CLOSED --
  `tests/db/migrations-applied-record.test.ts` passes, because ledger `0204`'s
  `docs/migrations-applied/0211-lucid-dirac-8b6m2f.md` is on `integration`.
  `svelte-check` is at the stated baseline, 0 errors and 37 warnings in 20 files,
  31/5/1, with the two `$env/static/public` placeholders exported before the sync. That
  run overlapped this branch's own edits, so the three test files that read `docs/` were
  re-run afterwards on the FINAL tree (3 files, 71 tests, all passing) and again at
  `origin/integration` in a clean `git worktree` (3 files, 71 tests, all passing), which
  is the same reading in both places. No browser pass, by instruction; nothing under
  `src/` moved. The checkout is NOT shallow -- `git fetch --unshallow origin` succeeded,
  `origin/main` carries 2381 commits -- and the committer identity is
  `Claude <noreply@anthropic.com>`.

  **Production serves `IDEA Portal v1.1514`**, read at 05:40 UTC on 2026-09-13, while
  `origin/main` is at `ee4a1c42` (2026-09-13 02:01 UTC) and `origin/integration` is 26
  commits ahead of that. Ledger `0205` read the same string at 05:01 UTC and traced it to
  ledger `0188`'s merge at deploy sha `247dfc4` on 2026-09-12; it has not moved since, so
  rule 41's own failure is still live and was measured twice, forty minutes apart, by two
  lanes.
