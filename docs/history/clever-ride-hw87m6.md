---
title: "Four branches into `integration` and `integration` into `main`: classroom presence, the sequence grant sweep, the merged-tree suite gate, and six decisions made answerable (`claude/clever-ride-hw87m6`, migrations 0200 and 0203 already applied)"
date: 2026-09-12
branches: [claude/clever-ride-hw87m6, claude/hopeful-edison-pd3p6r, claude/inspiring-planck-gp601z, claude/cool-cori-0vzwcz, claude/awesome-cannon-83mfjf]
migrations: ["0200", "0203"]
subsystems: ["CI", "Classroom", "Tooling", "Documentation"]
---

A landing lane. It carries no source change of its own: what it added to the tree
is two regenerated generated regions in `tools/browser-verify/README.md`, this
entry, and ledger 0166. Everything else it moved was written by the four lanes
it merged.

## What landed

In the order the prompt issued, all four `--no-ff`, all four clean:

- **`claude/hopeful-edison-pd3p6r`** (ledger 0164) -- migration `0203`, closing
  the three sequences `anon` could `setval`, and widening
  `tests/grant-surface.test.ts` to see them.
- **`claude/inspiring-planck-gp601z`** (ledger 0152) -- migration `0200`,
  classroom presence on the grading console: who is working, who is elsewhere,
  who is away.
- **`claude/cool-cori-0vzwcz`** (ledger 0163) -- one `npx svelte-kit sync` in
  `integrate.yml`, which is the whole of what stopped `merged_suite()` from ever
  returning a verdict.
- **`claude/awesome-cannon-83mfjf`** (ledger 0165) -- six open decision entries
  rewritten so they can be answered in under a minute.

## The one conflict, and why taking `HEAD` was the right resolution

`git merge-tree --write-tree` predicted exactly one conflict before any merge
ran, and exactly one happened: `inspiring-planck` against
`tools/browser-verify/README.md`. Every conflicted hunk sat **inside** the
`counts:static` and `counts:measured` generated regions -- four hunks, all of
them stale numbers on both sides.

The diff of that file between `integration` and the branch was read in full
first, with the two `counts:*:data` comment lines filtered out, to check whether
anything outside the generated regions was being discarded. Nothing was: the
branch's every change to that file was a generated number. So `--ours` was
equivalent to a hand resolution, and the regions were regenerated on the merged
tree afterwards, which is what that file's own header prescribes for exactly
this case -- the static region is a pure function of the tree and carries no
date and no sha precisely so that a merge can be resolved by rerunning it.

## The numbers, measured rather than carried forward

**Static**, a tree read, committed on its own so the measured run had a clean
committed tree under it: 196 specs over 80 routes, 108 `/dev` pages, 2 widths,
392 route/width runs. Regenerating it printed its own warning that the
then-current measured region had never measured the two `presence-*` specs, which
is the tripwire working.

**Measured**, one full pass, on `80aae10` with `dirty: false`, vite started by
hand on 5199 and warmed across five `/dev` routes to 200 first, nothing else
running, stopped afterwards by its own task id rather than by `pkill -f`:

| | |
| --- | --- |
| Route specs the run covered | 196 |
| Route/width runs | 392 |
| Measurements | 6838 |
| **Measurements outside threshold** | **0** |
| Full-run wall clock | 991.6s |
| `--selftest` controls | 70 (36 negative, 34 positive), 0 instrument failures |

Zero outside threshold is the expectation, so there is no row to name. The
static and measured spec counts now agree at 196, which is the comparison the
README tells a reader to make before trusting any number in it.
`tests/derived-numbers.test.ts` then passed 18 of 18.

## The baseline that is stale in the other direction now

`svelte-check` measures **0 errors and 38 warnings in 21 files** here, breakdown
**32** `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`. That was read twice: once at the branch point on
`origin/integration`, and once on the merged tree after `rm -rf .svelte-kit &&
npx svelte-kit sync` with both public variables exported. Identical both times,
so the four merges moved neither number.

`CLAUDE.md` says 40 in 22 files at 34/5/1, and the prompt repeated that figure.
Both are stale by two `state_referenced_locally` warnings and one file -- and
the direction is the interesting part. Every previous instance of this drift had
`CLAUDE.md` **behind** a growing tree: 36 against 37, then 37 against 40, each
time found independently by two sessions before either said so. This one is the
first where the file is **ahead**: `cool-cori`, merged in this very round,
corrected the line from 37 to 40 on 2026-09-11, and something between ledger
0161's measurement and this one fixed two warnings. The rule in `CLAUDE.md` says
a session that measures a different number corrects the line in the same change;
this lane's prompt scopes it to no source file at all, so it is reported here
and left alone, which is the position ledger 0162 took on the same sentence one
round earlier and in the opposite direction. **The instrument, not the number**
remains the whole lesson.

Full suite on the merged tree: 398 files, 7717 tests, 331.77s, exit 0.

## What was NOT verified

- **No database value.** `tools/deploy-probe.mjs` has no `DEPLOY_PROBE_URL` in
  this container and answered, verbatim, `deploy-probe: DEPLOY_PROBE_URL is not
  set, so production's applied set cannot be read. This is "cannot confirm",
  never "applied".` -- exit 1. Whether `0193` through `0203` are applied to
  production rests entirely on Mr. Pina's report.
- **Two of those eleven have no written verification from anyone.** Mr. Pina
  states he has not seen `0200`'s or `0203`'s verification output. They are the
  two this round actually ships a client against.
- **Nothing signed in, and no `/dev` route behind a session.** The harness
  covers `/dev` only, blocks every non-loopback request (so text is measured in
  the fallback stack, not the web fonts), and runs with
  `prefers-reduced-motion: no-preference`, so that path is unexercised.

## What was reported and not fixed

Production had been serving `dcbb741` for fourteen hours while `main` sat at
`8e834ba6` for nine, with no Vercel deployment for `8e834ba6` at all -- not
failed, never created. The prompt named this as a thing to report rather than
fix, and this entry records only what this lane could observe: the merge and the
deploy are separate facts, and a merge landing is not evidence that a deploy
followed it.
