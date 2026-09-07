---
title: "Three finished branches landed on main in one deploy, with no conflict to resolve and no red to walk back (`claude/land-three-branches-deploy-go0ji5`)"
date: 2026-09-06
branches: [claude/land-three-branches-deploy-go0ji5]
migrations: []
subsystems: ["Operations", "Browser harness"]
---

Prompt 0089. No migration written, none applied, production not reached. An
operations bundle: it authors no source code, and the one file it changed
outside a merge commit was written by a generator it was told to run.

Started from `origin/main` at `5b3e14b`, in `/home/user/idea-app`. Git identity
was already configured in the container (`Claude <noreply@anthropic.com>`), so
the "Please tell me who you are" failure the prompt warns about never arose and
nothing was set. `docs/prompt-ledger/entries/0089-*` did not exist at HEAD.

## The premise that was wrong, and it is the same shape as 0088's

The prompt says prompt 0085's report "is on `main` at `docs/history/`". **It is
not.** `git show origin/main:docs/history/land-twenty-two-branches-fuv0tw.md`
fails at `5b3e14b`; the file exists only on
`claude/land-twenty-two-branches-fuv0tw`, which is the third of the three
branches this bundle was sent to merge. It was read from the branch instead, and
landing it is what put it on `main`.

That is 0088's finding arriving a second time, one bundle later: a prompt
written from a tree that cannot see the branch it is describing. A branch cannot
see another branch, and neither can the chat that writes the prompt.

## A1: the eligibility table

| branch | tip | committed | contained in `main` | newest ledger `Status:` |
| --- | --- | --- | --- | --- |
| `sweep-cross-branch-visibility-xo9yz1` | `db0c8e7` | 11:36:31Z | no, 11 ahead | 0088 **pushed** |
| `land-duplicates-tab-0by1zg` | `7a7dc71` | 11:42:10Z | no, 11 ahead | 0086 **pushed** |
| `land-twenty-two-branches-fuv0tw` | `295fd6d` | 10:32:32Z | no, 3 ahead | 0085 **pushed** |

All three eligible; none skipped. Containment was read with
`git merge-base --is-ancestor` throughout and never with
`git branch -r --contains | grep`, which 0085 recorded matches a branch on its
own name.

The first branch also carries ledger entries 0084 and 0087 and the second
carries 0081, all three `pushed`, because each had already merged the lane it
was landing into itself.

## A4: no migration anywhere, which is what the bundle needed to be true

`git diff --name-status origin/main...<branch> -- supabase/migrations/` is empty
for all three. `main`'s highest is `0189`, unchanged by this bundle. **Whether
`0186` through `0189` are APPLIED is a property of production and no file in
this repository records it**; nothing here reached the database to ask, and this
bundle was not permitted to.

## The merges, and why there was nothing to resolve

A2 test-merged each into `main` in isolation: **all three clean.** The prompt
allows for conflicts in `tools/browser-verify/README.md` and
`classroom-updates.json`, with hunk-by-hunk and textual rules for each. Neither
rule was needed, and the reason is structural rather than lucky: the three
branches touch **18, 18 and 2 files and their pairwise intersections are all
empty.** Only the second branch touches `classroom-updates.json` or the browser
README at all, so no second writer existed to collide with.

Merged `--no-ff`, one commit each, in the prompt's order --
`sweep-cross-branch-visibility` first, because 0088 merged 0087's lane into
itself rather than write a third parser of the same format, then
`land-duplicates-tab`, then `land-twenty-two-branches`. Every one clean.
`50d4df5`, `2c33226`, `79a9faa`.

## What landing these three also landed

Both branches 0085 deliberately held back are now on `main`, carried in as
ancestors rather than merged again:

- `claude/classroom-nav-surfaces-v958ub` -- 0081's three doors, held back by 0085
  because the `nav.ts` tab patch its tripwire demanded was six edits 0085 was
  forbidden to write. 0086 wrote them and merged the branch; this bundle merged
  0086.
- `claude/number-allocation-ledger-c30ms5` -- 0084, held back by 0085 on a
  `docs/standards/IDEA_instructions.md` conflict outside its permitted set. 0088
  resolved it on its own branch; this bundle merged 0088.

Twenty-eight `claude/**` branches are contained in `main` as of the push.

## Measured

**Baseline, `origin/main` at `5b3e14b`, before any merge: 308 files, 6248 tests,
0 failures, 263.66s.** That is 0085's final figure exactly, which is the honest
reading of "`main` is green": nothing had moved it since. The ledger's own note
predicted "310 files and 6,267 tests" for this tree and both numbers are low --
they were 0086's and 0088's branch measurements, not `main`'s.

**Merged tree, 2026-09-06 14:10:30 to 14:14:40 America/Los_Angeles: 311 files,
6301 tests, 0 failures, 248.46s.** Green on the first run. Prompt 0075's
two-file relation is the failure mode B4 exists to catch and 0085 hit one; this
bundle hit none, and the same empty-intersection fact is why: no two of these
branches edit a file in common, and the one cross-branch tripwire that could
have fired -- `tests/classroom-nav-doors.test.ts` -- had both its halves inside
a single branch.

`npm run check`, 14:15 PDT: **0 errors, 37 warnings over 3055 files**, breakdown
**31** `state_referenced_locally` / **5** `css_unused_selector` / **1**
`perf_avoid_nested_class`. The documented baseline exactly, re-derived from the
run's own summary line rather than trusted, with `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` exported to a placeholder `.env` before
`svelte-kit sync` so the 13 phantom errors a `.env`-less checkout reports never
appeared.

`npm run verify:counts` on the merged tree: **already current** (133 specs over
64 routes, 92 `/dev` pages, 266 runs), nothing written -- 0086's branch had
regenerated the static region and the merge carried it.

`npm run verify:readme`, once, on a clean tree with port 5199 confirmed bindable
first: **266 route/width runs, 3986 measurements, 2 outside threshold, 631.4s,
measured on `79a9faa`**, `dirty: false`, self-test 70 controls / 36 negative /
34 positive / 0 instrument failures. **`covered` is 133 of the 133 route specs
in the tree**, nothing uncovered and nothing covered that is not in the tree
(the two files in `routes/` it does not name are `_shared.mjs` and
`_theme-shared.mjs`, which are modules and not specs). The two outside threshold
are the two known ones, unchanged: `/dev/notebook` `tap-reach` "toolbar text
controls" at **375** and at **1440**, decision 12, with the owner.

The tree was committed before that run and left alone during it, which is the
condition 0086 had to repeat an eleven-minute pass to satisfy.

## Pushed

`5b3e14b..e06ed58` on `main`, **29 commits**, fast-forward, no force. `main` had
not moved since the fetch, so the B5 re-run branch was never entered. One push,
one deploy.

## Left undone: the branch deletions, again

`git push origin --delete` is refused by this container's agent proxy with
**HTTP 403** on the RPC, and git then prints **"Everything up-to-date"** over
the failure, which reads as success. Verified against `origin` rather than
against git's own report: `git ls-remote --heads origin 'refs/heads/claude/*'`
returns **29** branches after the attempt, the same 28 contained ones plus this
bundle's own. Attempted singly and as one 28-ref push; identical refusal. The
GitHub MCP server available here exposes `create_branch` and no delete-ref
operation of any kind, so there is no second route.

`.github/workflows/integrate.yml` deletes a green `claude/**` branch whose
commits `origin/main` already contains and reports it under "Already contained,
deleted", so all 28 are reaped on its next run without anyone doing anything.

## Not verified

No migration was applied and nothing reached the live Supabase project or
production; the applied state of `0186` through `0189` is unknown to this
bundle. Nothing was checked in a signed-in browser or on a Vercel preview. The
browser harness covers `/dev` routes only, blocks every non-loopback request (so
text is measured in the fallback stack and not the web fonts -- the run reported
`fonts.googleapis.com` blocked), and runs with `prefers-reduced-motion:
no-preference`, so that path is unexercised. `origin/integration` was not
touched and is now further behind; it catches up on its own.
