# 0205 Seven rules earned 2026-09-13, written into the two files that own them

- Issued: 2026-09-13
- By: router chat
- Owns: `docs/standards/IDEA_instructions.md`,
  `docs/standards/IDEA_VERIFICATION_ADDENDA.md`, `docs/standards/REGISTER.md`,
  `docs/prompt-ledger/entries/0205-*`, and its own `docs/history/` entry. NO OTHER
  FILE.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/dazzling-ramanujan-i2hry6`, branched from `origin/integration` at
  `78516fa`.
- Notes: Standards-only. Ten rules earned on 2026-09-12 and 2026-09-13 land in the
  file that owns each: THREE in `IDEA_VERIFICATION_ADDENDA.md` (rules 39, 40 and 41 --
  a probe that reports through `raise notice`, a probe that examined nothing, and
  landed is not deployed), and SEVEN in `IDEA_instructions.md` (a prompt's migration
  range going stale, a manual instruction giving the URL rather than a route through
  the menus, a push being a build, a decision entry's status line being a claim, five
  communication rules Mr. Pina stated directly, and -- arriving MID-BUNDLE on the day,
  acted on immediately because that is the rule's own content -- a long router chat
  maintaining a live state document on disk. Rule 41 also corrects the three-state
  Hard Rule, which said a migration is the only artifact where all three states come
  apart. No new file: every rule is written in the owning file's
  own voice with a changelog entry, and `REGISTER.md`'s rows move in the same commit
  because `tests/standards-version-header.test.ts` refuses a register row that
  disagrees with the file it names.

  **Ledger 0204 owns the Vercel audit and the verification SQL.** Its history entry and
  its audit were not on `origin/integration` at branch time, so the push-is-a-build
  rule points at that audit by name and marks its figures as 0204's claim rather than
  restating them as measured here. This session's own checkout is SHALLOW, so it cannot
  re-derive a commit count at all, which is verification rule 32 arriving in the middle
  of writing rule 38's neighbours.

  **The duplicate check ran three ways and all three came back clean**: no
  `docs/prompt-ledger/entries/0205-*` on `origin/integration` or `origin/main` (highest
  is `0203`), no commit subject on any ref naming ledger `0205`, and no document
  anywhere naming `ledger 0205`, `prompt 0205` or `entries/0205`. Every `0205` string
  already in the tree is the MIGRATION `0205`, which is a different sequence.

  **Both standards files were fetched with `git clone`, never `curl` on
  `raw.githubusercontent.com`**, and the identity check passed: the clone's copies are
  byte-identical to the working tree's, at `IDEA_instructions.md` 4.26 and
  `IDEA_VERIFICATION_ADDENDA.md` 2.5, which is what the prompt said the mirror held.
  The project-knowledge copies at 4.24 and a self-inconsistent 2.4 are stale copies and
  not a fork; nothing from them is merged in.

  **The merge to `main` is BLOCKED on two of the six checklist items, and neither is
  this bundle's to fix.** Item 2: the suite is red on `integration`'s tip `78516fa` --
  `tests/db/migrations-applied-record.test.ts` finds no
  `docs/migrations-applied/0211-*.md` beside `supabase/migrations/0211_*.sql`, which is
  ledger `0203`'s record to write and is outside this file surface. Item 4:
  `tools/deploy-probe.mjs --ref origin/integration` exits 1 with `DEPLOY_PROBE_URL is
  not set`, and `CANNOT SAY` is never a pass. Items 1, 5 and 6 pass; item 3 was not
  reached. Suite measured twice at **1 failed, 8672 passed** -- once at the branch point
  and once on this branch, the same single file both times -- and `svelte-check` is at
  the stated baseline, 0 errors and 37 warnings in 20 files, 31/5/1.

  **Production serves `IDEA Portal v1.1514` at deploy sha `247dfc4`** (ledger `0188`'s
  merge, 2026-09-12 21:22 UTC), read at 05:01 UTC on 2026-09-13, with `origin/main` at
  `ee4a1c4` and 63 commits ahead of it. That is rule 41's own failure, measured on
  itself.
