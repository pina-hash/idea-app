---
title: "Removing the vercel.json ignoreCommand and landing integration into main"
date: 2026-09-13
branches: ["claude/magical-allen-257tpo"]
migrations: []
subsystems: ["ci", "deploy"]
---

Production had been stuck on `247dfc4` (v1.1514, dated 2026-09-12) while `main`
moved twice past it. GitHub's commit status API confirmed both `9738f998` (an
empty `chore: trigger production deploy` commit) and, more importantly,
`9b010f53` (a real merge of `integration` into `main`, with changes outside
`materials/`) were "Canceled by Ignored Build Step" -- so the rule in
`vercel.json`'s `ignoreCommand` was not merely skipping empty commits, it was
skipping real ones too. This bundle removed the rule rather than repairing it,
then landed `integration` into `main` behind it.

## Sequence, and why it was three pushes to `main` rather than one

Ledger 0221 was pushed alone first (`b20b4420`), before touching anything
else, so the record of intent exists even if the rest of the bundle had
stalled. `vercel.json`'s `ignoreCommand` key was then deleted whole (`30c0f403`)
-- `$schema` and `redirects` untouched byte for byte, tabs preserved, no
prettier run anywhere near it -- and production was watched until it actually
served that commit (`v1.1598` / `30c0f40`, confirmed at
`2026-09-13T10:50:18Z`) before anything else proceeded. Only after that
independent proof did the `integration` merge happen.

## The gate that looked wrong and was actually a race

`git merge-base --is-ancestor origin/main origin/integration` failed
immediately after the two `main`-direct pushes above (exit 1), because those
two commits did not exist on `integration` yet. This repo runs an `Integrate`
workflow (`workflow_run`, triggered after `CI` completes on `main`) that
merges `main` back into `integration` automatically; it had not yet run for
either new commit. Waiting for that workflow's own run against `30c0f403`
(`https://github.com/pina-hash/idea-app/actions/runs/34753102876`, completed
success at `11:06:03Z`) resolved it: `origin/integration` advanced to
`aa3bbafd`, which does contain both `main`-direct commits, and the ancestor
check then passed cleanly. **This is worth knowing for the next session that
pushes directly to `main` immediately before landing `integration`: the
ancestor gate will look broken for a few minutes and is not; it is waiting on
the same automation that keeps `integration` synced.**

## Gates, as actually run against the tree

1. `git merge-base --is-ancestor origin/main origin/integration` -- exit 0
   (after the wait above).
2. `npm test` on the merged tree (staged with `git merge --no-ff --no-commit
   origin/integration` before committing, so the working tree really was the
   merged state): **465 test files passed (465), 8833 tests passed (8833), 0
   failed.** Read off vitest's own summary line and its stderr, never off
   `npm test`'s exit code, per this repo's own documented distrust of it.
   `npx svelte-check`: **0 errors, 37 warnings in 20 files**, breakdown 31
   `state_referenced_locally` / 5 `css_unused_selector` / 1
   `perf_avoid_nested_class` -- exactly `CLAUDE.md`'s stated baseline, so it did
   not need correcting. Both required the two known-trap fixups first: `npx
   svelte-kit sync` before either command (a fresh `npm ci` checkout has no
   `.svelte-kit`, which otherwise makes `npm test` fail on a misleading
   rolldown/tsconfig error and `svelte-check` fail on phantom `$env/static/public`
   errors), and a placeholder `.env` (gitignored, never committed) exporting
   `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` before the sync.
3. The merge applied with no conflicts (`git merge --no-ff --no-commit` reported
   "Automatic merge went well").
4. `node tools/deploy-probe.mjs --ref origin/integration` printed "DEPLOY_PROBE_URL
   is not set, so production's applied set cannot be read. This is 'cannot
   confirm', never 'applied'." and exited 1, as expected in a container with no
   repository secret. Waived on gate 5.
5. `git diff --name-only origin/main origin/integration -- supabase/migrations/`
   printed nothing -- no migration in this range, so gate 4's waiver holds.
6. All five ledger entries newly on `integration` (0213, 0216, 0217, 0219, 0220)
   read `Status: pushed`.

Merged with `--no-ff` as `7c2c5857` (parents `30c0f403` and `aa3bbafd`), pushed
to `main`, and confirmed live: production served `v1.1611` / `7c2c585` at
`2026-09-13T11:24:25Z`, one poll after the push.

## What was NOT verified

- **Why the `ignoreCommand` canceled `9b010f53` specifically.** The prompt this
  bundle executed deliberately did not ask for that diagnosis (removal over
  repair), and nothing here establishes it. If a replacement gate is ever
  wanted, that investigation still has to happen first.
- **Anything about Vercel's own dashboard or build logs.** The only evidence
  used anywhere in this bundle for "did it deploy" is the version string
  `curl`'d from `https://ideabosco.com/` itself, per this repo's own standard
  that a green check or a dashboard screen is not proof.
- **Whether removing the `ignoreCommand` has any other effect on Vercel's build
  behavior** (e.g. whether preview deployments for `claude/**`/`lane/**`
  branches now build where they previously didn't -- the redirect and schema
  entries are unaffected either way, and this was out of scope for the bundle).
