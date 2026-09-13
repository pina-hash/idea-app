---
title: "Four IdeaCAD lanes landed into integration, 0225 first to clear a red the other two inherited (`claude/trusting-meitner-md2kmj`, ledger 0226)"
date: 2026-09-13
branches: [claude/trusting-meitner-md2kmj]
migrations: []
subsystems: ["Repo workflow"]
---

Ledgers 0222, 0223, 0224 and 0225 all finished and pushed and none was swept
into `integration`. This bundle merges them directly. It applies nothing: no
process in this container has a route to the production database, and none was
attempted.

## What landed, and why the order was not optional

Three merges, `--no-ff`, in the order the prompt fixed:

| # | Branch | Ledger | Merge sha | Conflicts |
| --- | --- | --- | --- | --- |
| 1 | `claude/sweet-knuth-1no6mh` | 0225 (carrying 0222) | `165004b6` | none |
| 2 | `claude/keen-thompson-yydv8r` | 0224 | `2142bf5a` | `tools/browser-verify/README.md` |
| 3 | `claude/cool-shannon-79pt7k` | 0223 | `a75e0d03` | `tools/browser-verify/README.md` |

`sweet-knuth` carries `blissful-bohr-79y23g` (ledger 0222) inside it -- it was
branched from that lane rather than from `integration`. Confirmed with
`git merge-base --is-ancestor`, which answered yes, before anything was merged;
the whole order rests on it. All four branches were confirmed absent from
`origin/integration` the same way, which is the check that does not lie:
`git branch -r --contains` matches a branch by its own name and has reported a
branch as merged when it was not.

**`sweet-knuth` had to go first because `integration` was RED**, and the red was
measured on `integration` itself before any merge rather than taken from the
prompt: `tests/db/migrations-applied-record.test.ts` failed 1 of 23 on the
sha256 of `0210`, expected `550f5597...` and received `48a4ad20...`. After merge
1 the same file is 23 of 23. The other half of the claim -- missing applied
records for `0212`, `0213` and `0214` -- **is not a property of `integration`**:
those three migrations do not exist there at all. It is a property of the merged
tree, which is why it could only have reddened after the other lanes landed and
why landing 0225 first is what stops it ever appearing.

## The one conflict, twice, and why taking a side would have been wrong

Both conflicts are the generated counts blocks in
`tools/browser-verify/README.md`, and in both cases **both sides were wrong**:
each lane regenerated correctly for its own tree, and the merged tree has more
route specs than either parent. The README's own account of this failure names
it -- green parents, red merge -- and the numbers here are the same shape:

| Stage | Merge 2 | Merge 3 |
| --- | --- | --- |
| base (merge-base) | 222 specs | 222 specs |
| ours | 224 | 225 |
| theirs | 223 | 227 |
| merged tree, on disk | **225** | **230** |

So each conflict was resolved hunk by hunk as the UNION, never by taking a side:

* the static table and its data line to the merged tree's own counts. Both
  `sweet-knuth` and `cool-shannon` add one distinct `/dev` route each
  (`ideacad-archive` and `ideacad-attach`), so routes and dev pages each gain
  two while `keen-thompson`, whose new spec drives an existing route, adds
  neither. Read off the added specs' own `path` fields rather than assumed from
  the two deltas agreeing.
* the measured table and data line to the union of both lanes' measurement
  stores: `covered` as a set union, the counters as base-plus-both-deltas. This
  is the half `integrate.yml`'s resolver gets wrong by taking the target's side,
  which throws one lane's seventeen-minute browser pass away. Nobody's
  measurement was discarded here.
* the one prose sentence naming the newest measurement, to whichever
  measurement is genuinely newest (`c05f09f`, 20:17:36Z, `cool-shannon`'s).

**The union was then checked rather than trusted.** One regeneration on the
clean committed fully-merged tree, `npm run verify:counts`, answered *"both
counts regions were already this tree's own answer. Nothing written"* --
230 specs over 88 routes, 116 `/dev` pages, 460 runs, 230 specs measured, 8156
measurements, 0 outside threshold -- and `-- --check` confirmed both regions
agree with the tree. `verify:readme` was NOT run: it needs a browser and about
seventeen minutes, and both lanes had already written their own measurement
files, which merge additively by construction.

`static/classroom-updates.json` never conflicted; no lane touched
`classroom-updates.json` at all, so there was nothing to resolve textually.

## Migrations: nothing renumbered, nothing edited

`0205` through `0214`, one file each, no number appearing twice in either
`supabase/migrations/` or `docs/migrations-applied/`. An applied record now
exists for `0210`, `0212`, `0213` and `0214`, which is the thing 0225 was for.

`tools/migration-claims.mjs` reports three CONTESTED numbers, and **all three
are merge artifacts rather than contests** -- each pits this branch against a
branch it has just merged. Proven by blob identity rather than by argument:
`0212` is `cf009fd2` on this branch and on all three of `blissful-bohr`,
`busy-feynman` and `sweet-knuth`; `0213` is `008c3b40` on this branch and on
`blissful-bohr`, `sharp-einstein` and `sweet-knuth`; `0214` is `390b7cf4` on
this branch and on `blissful-bohr`, `sweet-knuth` and `youthful-lovelace`. One
file each, byte for byte, so there is nothing to reconcile.

It also reports `0190` and `0191` as claimed and not landed, by ledgers 0092,
0093, 0098 and 0099. That is inherited from `integration` and predates every
branch merged here; `supabase/migrations/` has a real gap between `0189` and
`0192`. Named rather than touched -- it is not this bundle's.

## Verified

* **Full suite, foreground, once, on the merged tree: 475 test files passed,
  9093 tests passed, 0 failed.** Read off the summary line and off stderr, never
  off the exit code, which `tools/run-tests.mjs` says in its own header cannot be
  trusted here. stderr carries 7.7KB and none of it is a failure report: it is
  the deliberate logging of the two draft-mirror tests that MEASURE Tiptap
  discarding a document it cannot render, and the foundry delete route's own
  orphan log line. The three source branches' individually reported failures --
  0224's eight plus the `0210` red, 0223's `0210` red -- are all gone.
* **`svelte-check`: 0 errors, 37 warnings in 20 files, 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`.** Exactly the baseline, breakdown included, so the
  figure in `CLAUDE.md` needed no correction for the sixth time. Re-derived
  rather than trusted: `npx svelte-kit sync` after exporting placeholder values
  for `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`, because this
  checkout has no `.env` and without them the sync writes a module exporting
  nothing and phantom errors land in files no change touched.

## Not verified, and deliberately

* **Nothing was applied to any database.** Migration permitted: no. This bundle
  lands files.
* **No browser pass.** `npm run verify:browser` was not run and neither was
  `verify:readme`; the counts regions were settled by the sub-second tree read
  the README's own design makes sufficient for a merge.
* **No preview URL was opened.** This is a merge of four already-verified lanes,
  and each carries its own verification in its own history entry.
* **`main` was not merged and must not be.** This carries migrations `0212`,
  `0213` and `0214`, which is the case Mr. Pina holds for himself; he merges it
  as a pull request, after applying them.

## One thing worth knowing next time

The harness cut this branch from `origin/main` rather than from
`origin/integration`, and `main` is neither ahead of nor behind `integration`
but two commits each way. Re-pointing the local branch at `origin/integration`
before the first merge cost nothing here -- the remote ref did not yet exist, so
the first push created it and no force was needed -- but a session that starts
merging without checking what its branch is actually on would have landed
`main`'s two commits into `integration` as a silent side effect of its own
merge.
