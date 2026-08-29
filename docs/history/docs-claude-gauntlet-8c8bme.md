---
title: "CLAUDE.md and docs/GAUNTLET.md brought current with the GAUNTLET author tier (`0155`): a third-tier section, the admin route list, four missing migration table rows, and an applied-vs-queued note (`claude/docs-claude-gauntlet-8c8bme`, no migration)"
date: 2026-08-29
branches: [claude/docs-claude-gauntlet-8c8bme]
migrations: []
subsystems: ["Docs", "GAUNTLET", "Admin"]
---

**Starting state, checked before doing anything.** `git fetch origin`: `HEAD`
(pre-branch) and `origin/main` both at `2113f4d`, `origin/integration` ahead at
`a816a98`. Branched from `origin/integration` as instructed. Working directory
`/home/user/idea-app`. Wrote the placeholder `.env`
(`PUBLIC_SUPABASE_URL=https://example-ref.supabase.co`,
`PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key`) and ran `npx svelte-kit sync`
before the baseline, per the standing rule about the 11 phantom errors. `origin/integration`
did not move under this session -- refetched at the end and it is still
`a816a98`, so the "two other sessions are live" warning about `CLAUDE.md` never
materialized here.

This bundle touches only `CLAUDE.md` and `docs/GAUNTLET.md`, per the file
ownership the task set. Nothing under `src/`, `tests/`, `supabase/migrations/`,
`tools/` or `docs/HISTORY.md` was read for the purpose of editing it (only for
verification), and none of it was written.

## What was wrong, verified against the tree rather than trusted from the brief

**1. `CLAUDE.md` never mentioned the GAUNTLET author tier.** Read
`supabase/migrations/0155_gauntlet_authoring_tier.sql` in full: it adds
`gauntlet_authors` (an allowlist mirroring `app_admins`) and
`gauntlet_can_author()` (folds `is_admin()` in, so every re-gate is a pure
widening), and re-gates exactly eleven sites -- verified by reading section 4
and cross-checking its own section 5 census against the file's `do $chk$`
self-check, which counts the re-gated functions from `pg_proc` rather than
trusting its own prose. `CLAUDE.md`'s ADMIN TIER section still said "every
elevated capability requires an explicit ADMIN grant" with no exception, and
its `is_teacher()` naming-trap rule still said "never write a new call to it;
use `is_admin()`" with no carve-out for the eleven sites that now call
`gauntlet_can_author()` instead. `/gauntlet/run-review` (`0152`, admin-only,
confirmed by reading `src/routes/gauntlet/run-review/+page.server.ts`'s
`isAdmin` guard) was absent from the admin-tier route list. All three
confirmed true by grep before editing.

**2. `docs/GAUNTLET.md`'s migration table was missing `0149`, `0152`, `0154`,
`0155`.** Confirmed by listing `supabase/migrations/` and diffing against the
table's own rows. Read each migration's header to write an accurate one-line
summary rather than guessing from the filename:
- `0149` (`0149_grant_surface_reconciliation.sql`) is NOT GAUNTLET-specific --
  it is a `public`-wide grant sweep, of which four GAUNTLET objects
  (`gauntlet_speedrun_attempt_history`, `gauntlet_leaderboard`,
  `gauntlet_room_board`, `gauntlet_room_roster`) are one slice, all four
  revoked from `anon`.
- `0152` is `gauntlet_run_review`, explicitly a REPORT and not a gate (the
  migration's own header states and defends this with four measured facts);
  backs `/gauntlet/run-review`.
- `0154` changes what a student sees on the board TODAY once applied: a wrong
  knowledge answer and an under-floor modeling run stop holding a ranked seat.
  The migration's own header warns this removes rows already occupying seats,
  including possibly rank 1, so this is flagged in the table rather than
  stated as a quiet narrowing.
- `0155` is the author tier itself.

## The applied-vs-queued question, and where the answer actually comes from

The task's instruction not to document anything queued as done sent me looking
for where migration apply-state is recorded. **I did not run any query against
a live database -- the local `.env` is the `example-ref` placeholder, exactly
as CLAUDE.md's environment section says it must be read.** The one measurement
I could rely on is `docs/history/anon-coin-public-projections-mrlg0d-queued-migration-sweep.md`,
written earlier the same day (2026-08-29) by a concurrent session, which
states its unapplied set was **derived from `comm` between `origin/main` and
`origin/integration`, not assumed**: `0151`, `0152`, `0153`, `0154`, `0155` and
`0157` (`0156` does not exist on `integration` -- held by a session running
concurrently with that one). I read that entry in full and checked its
reasoning (the structural chain-filter argument, the bisection table, the
`0151`-reverts-`0148` finding) before relying on its conclusion rather than
just its headline number.

**Both files now say explicitly**: `0149` and everything before it is applied;
`0151`-`0155` and `0157` are queued; the record of that is
`docs/history/anon-coin-public-projections-mrlg0d-queued-migration-sweep.md`,
named so the next reader can re-check it rather than trust either doc file.
Both files also say this is a snapshot, not a standing fact, and name the
live-catalog checks (`supabase migration list --linked`, or the schema
migrations table) a reader should run instead of trusting a number written
down here -- consistent with CLAUDE.md's own migration-tracking rule, which
this bundle did not invent, only applied to itself.

**One consequence surfaced by that sweep that neither doc previously said out
loud, added to `CLAUDE.md`'s GAUNTLET AUTHOR TIER section and to
`docs/GAUNTLET.md`'s new "Applied vs. queued" section**: `0151` is not safe to
paste over `0148` as it currently stands -- it was diffed against `0147` and
silently drops `0148`'s server-stamped knowledge-clock fix, per the sweep's own
measurement (`0147` 119 lines / `0148` 158 lines with 6 clock references /
`0151` 150 lines with 0). This is reported, not fixed -- `supabase/migrations/`
is outside this bundle's file ownership.

## The freshness header and the Authoring section were also stale, beyond the four table rows

Read the whole file rather than only the section the task named. Two more
things had gone stale since the header was last written (2026-08-29, per its
own text, the day of `docs/history/gauntlet-component-harnesses-gnddjg.md`):

- **The header's "TEACHER MEANS ADMIN, no exceptions" paragraph is no longer
  true even in the queued-vs-applied sense** -- once `0155` is applied it
  stops being universally true, and the paragraph needed to say so rather than
  make a blanket claim a reader would carry past the apply. Rewritten to
  describe the third tier, point at CLAUDE.md for the full shape, and state
  plainly that the two-tier world is still the LIVE one today because `0155`
  is queued.
- **The header's redirect claim is now simply wrong, independent of the tier
  question.** It said `/gauntlet/author` "answers a redirect, not a permission
  message." Read `docs/history/gauntlet-authoring-allowlist-xui3ps.md` and
  `docs/history/gauntlet-authoring-quiz-harness-it0oat.md`: the redirect was
  replaced with a spoken refusal panel in the FIRST of those two bundles (part
  of the same `0155` work, both files already in `origin/integration`), and
  the second wired the `/gauntlet` landing page's Authoring card onto the new
  check (verified directly against `src/routes/gauntlet/+page.server.ts` and
  `+page.svelte`, which call and gate on `canAuthorGauntlet`, not `isAdmin`).
  Corrected and both history entries cited so the claim is checkable.
- **The "Authoring" section's opening paragraph** ("admins (not teachers)
  create, edit, publish, and delete") is still literally true today (`0155`
  queued) but would go stale silently the moment `0155` is applied, with
  nothing in that section pointing a reader anywhere. Added a note ahead of
  the detailed bullets saying what changes once `0155` lands and pointing at
  CLAUDE.md's census for the exact eleven sites, rather than duplicating that
  census a second place it could drift from.

## What was verified, and how

- **Read the actual code, not just history entries, for every load-bearing
  claim added**, per the task's explicit instruction. Specifically:
  `src/routes/gauntlet/run-review/+page.server.ts` for the admin-only guard
  backing `0152`'s route; `src/lib/server/gauntlet-authoring.ts` for the
  `canAuthorGauntlet` ladder and refusal copy; `src/routes/gauntlet/+page.server.ts`
  and `+page.svelte` for the landing-card wiring; `supabase/migrations/0149`,
  `0152`, `0154`, `0155` in full for the table rows and the tier's shape.
- **`svelte-check`: 0 errors, 37 warnings, the 31/5/1 mix** -- re-derived
  after `npx svelte-kit sync` and again after all edits (both files are
  Markdown, so no change was expected or found).
- **`npm run history:verify`: OK**, unaffected -- this bundle writes only this
  new entry file and does not touch `docs/HISTORY.md` or `docs/history/_tools/`.
  237 entry files exist under `docs/history/` (168 `record-*.md` from the
  original split plus 69 later per-bundle entries, counted with `find
  docs/history -maxdepth 1 -name '*.md' | wc -l`).
- **Full suite baseline, run once, before any edit: 3 failed / 202 passed test
  files, 4284 passed / 4287 tests, 210.24s.** Two of the three failures are
  `tests/coin-public-board-anon-projection.test.ts` and
  `tests/coin-public-surface-hardening.test.ts`, both asserting a `PGRST202`
  error code and getting `42501` instead -- consistent with the task's note
  that another session is mid-fix on the coin files. **A third failure was
  also observed and is reported honestly rather than folded into "the two coin
  files"**: `tests/dom/item-detail-ondeleted-mount.test.ts` failed on an
  unrelated assertion about post-delete DOM text. This bundle changed no code
  and no test, so the suite was not re-run afterward -- it would show the
  identical three failures, and running it again would burn ~3.5 minutes to
  confirm a fact already established. None of the three failures are this
  session's; none of this session's changes could affect any of them (Markdown
  only).

## Not verified

- **The live Supabase project.** No migration was applied and no RPC was run
  against production; the `.env` stayed the `example-ref` placeholder
  throughout, per the environment rules. The applied-vs-queued claim rests
  entirely on the cited history entry's `comm`-based derivation, not on a
  fresh catalog read here.
- **A real signed-in session or `npm run verify:browser`.** This bundle is
  documentation only and touches no route, no component and no `/dev` harness,
  so there is nothing for either to exercise.

## Files touched

Modified: `CLAUDE.md`, `docs/GAUNTLET.md`.
New: `docs/history/docs-claude-gauntlet-8c8bme.md` (this entry).

**No migration files were created.**
