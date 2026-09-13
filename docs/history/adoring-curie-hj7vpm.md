---
title: Two rules from ledger 0213, a race that killed a mutant and a fixture with an unwritten expiry date
date: 2026-09-13
branches: [claude/adoring-curie-hj7vpm]
migrations: []
subsystems: [standards, verification, testing]
---

Ledger `0213` (2026-09-13, `claude/sharp-einstein-cqrnx6`) measured two instrument
defects while proving out `0213_classroom_remove_enrollment_ideacad_census.sql`, and
this bundle's whole job was to write both into `IDEA_VERIFICATION_ADDENDA.md` in the
document's own voice, as members of the family it already collects, citing `0213`
rather than presenting either as this bundle's own finding.

## The duplicate check, three ways, before touching anything

`docs/prompt-ledger/entries/` on the local tree, on `origin/integration`, and on
`origin/main` all carry no `0219-*` file. A sweep of every remote ref
(`git for-each-ref` over `refs/remotes/origin`, then `git ls-tree -r <ref>` against
`docs/prompt-ledger/entries` and `docs/standards`, plus a branch-name grep) found no
ref carrying a `0219` ledger, a `0219` standards edit, or a `0219`-named branch.
`git log --all --oneline | grep -i 0219` matched nothing. Clear on all three.

`git fetch --unshallow origin` ran clean against a shallow checkout; `git fetch
origin integration` confirmed `origin/integration` and `origin/main` sat at the
identical commit, `9b010f53`, when this session started -- which made "branch from
`origin/integration`" and "develop on the harness-assigned `claude/adoring-curie-hj7vpm`"
the same instruction, since that branch was already at `9b010f53` too. The committer
identity check read `git config user.name`/`user.email` as `Claude` /
`noreply@anthropic.com`; the session's attribution instructions name
`Claude Sonnet 5 <noreply@anthropic.com>` as the commit trailer and do not ask for a
config change, so the commit carries the trailer and git config was left alone.

## The fetch, and what it confirmed before either rule was written

The task's own instruction was to fetch the owned file with a clone, never `curl` on
`raw.githubusercontent.com` -- that CDN path served ledger `0205`'s work six versions
stale once already. `git clone --depth 1 --branch main
https://github.com/pina-hash/idea-app` into a scratch directory, then a byte-for-byte
diff of both owned files against the working tree: identical. The working copy
already carried `IDEA_VERIFICATION_ADDENDA.md` 2.6 (2026-09-13, landed by ledger
`0205`, merged onto both `main` and `integration` by ledger `0215`), so the two rules
below were written on top of the current file rather than a stale local copy.

## Rule 42: a mutant killed by a race proves nothing

`npm test` in this repository passes `--no-file-parallelism` to vitest for a stated
reason: the database test files share one embedded-Postgres cluster and collide when
run concurrently. Ledger `0213`'s mutation script first shelled out to the bare `npx
vitest run` instead of to `npm test`, and measured the collision directly -- 4
failures under the bare form, the same 33 tests passing when the identical files ran
serially. Its own first mutation pass, under that same racing invocation, had reported
eleven mutants killed and zero survivors; the ledger discarded that number rather than
report it, because a kill and a flake produce an identical red test and only the
invocation used says which one happened.

## Rule 43: a premise true when written can have an expiry date nobody wrote down

Ledger `0213` built a paired test against migration `0211` as the one
`tools/idea-status.py` could derive no probe for, taken from the seed file's own
header. `origin/main` moved mid-session and picked up `0211` itself, so the tool began
deriving a probe for it where it previously could not, and both directions of the
paired test -- the exit-3 case and the exit-0 case -- traded places at once, silently,
because the fact the fixture rested on had quietly stopped being true between the
session starting and the assertion running.

The remedy recorded is the one `0213` actually took: not re-pointing the fixture at a
different migration that happens to satisfy the same fact today, which only re-hides
the same expiry date under a new number due whenever a migration lands in that slot,
but **synthesising** the no-probe migration -- a commit off `origin/main` carrying one
extra file, planted alone, so the probe-derivability row is the only thing that
changes between the exit-3 run and the exit-0 run, with nothing about the live tree's
own numbering load-bearing. Generalised in the rule's own words: a fixture resting on
a fact about the live tree has an unwritten expiry date, and the fix is to construct
the condition the test needs rather than to name something that currently satisfies it.

## What changed, in the same commit

`IDEA_VERIFICATION_ADDENDA.md`: header 2.6 -> 2.7, rules 42 and 43 inserted after rule
41 and before the internal-organization note (the document's existing home for newly
numbered rules), and a 2.7 changelog entry citing ledger `0213` by number, date, and
both measured results. Header re-read against the newest changelog entry before
committing: both say 2.7.

`REGISTER.md`: the `IDEA_VERIFICATION_ADDENDA.md` row moved to 2.7 with the new rules
folded into its description, in the same commit -- a register row disagreeing with the
file it names is exactly what `tests/standards-version-header.test.ts` refuses. All 20
register rows were then checked against their own files' version headers,
programmatically, in both directions (a row with no file, a file with no row, a
version that disagrees): **zero mismatches**, matching ledger `0215`'s prior sweep of
the same 20 rows. No other standards file or register row was touched.

## What was measured

- `npx svelte-kit sync && npx svelte-check` off `origin/integration`: **0 errors, 37
  warnings in 20 files** -- the documented baseline, unmoved, because this bundle
  changes no `.svelte` or `.ts` source.
- `npm test`, read from the summary line rather than the exit code (this repo's own
  rule 19: `npm test` can exit 0 on a failing suite): **460 test files passed (460),
  8737 tests passed (8737)**, 568.96s. `tests/standards-version-header.test.ts` and
  `tests/claude-md.test.ts` both ran inside that pass and are green.

## What was NOT verified

- No browser pass. Nothing under `src/` changed.
- Whether `tools/deploy-probe.mjs` or `deploy.yml` still carry the `bash -e` /
  `set -uo pipefail` defect ledger `0215` found -- neither file was read or touched
  by this bundle, per the prompt's explicit fence. Ledger `0216`
  (`claude/kind-euler-vlt4u7`, title "the deploy fallback and the history probe")
  merged onto `integration` between this bundle's own merge and its check of the
  six-item gate below, so whatever it did to those two files is on `integration`'s
  tip by the time this bundle read it, but this bundle did not read either file to
  find out what.

## The merge, and the gate that failed exactly as expected

No migration in this bundle, so `Claims: none` and the six-item checklist governs
merging `integration` into `main` directly. `integration` moved once between this
bundle's own merge (`a456ec47`, `Merge claude/adoring-curie-hj7vpm into integration`)
and the checklist being run: ledger `0216` landed on top of it at `caef1c07`
(`Merge claude/kind-euler-vlt4u7 into integration`) while this bundle was still
setting up the checks. **The checklist below is read against `caef1c07`, the tip at
the moment of checking, not against the tip at the moment of this bundle's own
merge** -- rereading the range immediately before acting on it is `IDEA_instructions.md`
4.27's own rule, and ledger `0215` was bitten by the opposite once already this week.

| # | Item | Command | Answer |
| --- | --- | --- | --- |
| 1 | `main` ancestor of `integration` | `git merge-base --is-ancestor origin/main origin/integration` | **YES** |
| 2 | CI green on `integration`'s CURRENT tip | `ci.yml` dispatched by hand on `integration` (it takes no push-triggered run of its own), run `34747987895` against `caef1c07` | **completed / success** |
| 3 | Merge into `main` clean | `git merge-tree --write-tree --name-only origin/main origin/integration` | **no conflict** (single tree sha, no names) |
| 4 | `deploy-probe` exits 0 | `node tools/deploy-probe.mjs --ref origin/integration` | **exit 1 -- "DEPLOY_PROBE_URL is not set ... this is 'cannot confirm', never 'applied'."** |
| 5 | Every migration this bundle added reported APPLIED | `git diff --name-only origin/main..origin/integration -- supabase/migrations/` returns nothing: no migration in range at all | **N/A** |
| 6 | Every ledger entry newly on `integration` reads `pushed` | `0216-deploy-fallback-and-history-probe.md` and `0219-verification-addenda-2-7.md` are the two entries in the diff; both read `- Status: pushed` | **2 of 2 pushed** |

**Item 4 fails exactly as the prompt said it would, and that is not this bundle
passing itself.** `DEPLOY_PROBE_URL` is a repository secret; it reaches GitHub
Actions runners and never a container, so `deploy-probe` exits 1 here on every
invocation and `CANNOT CONFIRM` is never read as a pass. Seven lanes had stopped at
this exact gate before this one, per the prompt's own count; ledger `0216`'s title
suggests it may be the eighth, on the same gate, in the same window -- this bundle
did not read `0216`'s entry to confirm that, since its files are outside this
bundle's owned surface. **This bundle stops here, reports the failure rather than
working around it, and does not merge `integration` into `main`.** The merge is left
to a session that can run the probe where it answers, or to Mr. Pina directly.

## Production, read rather than assumed

The footer badge at `https://ideabosco.com/`, the instrument
`IDEA_VERIFICATION_ADDENDA.md` rule 41 names, reads **`IDEA Portal v1.1514`, deploy
sha `247dfc4`** -- unchanged from ledger `0215`'s reading. This bundle's merge to
`main` is a docs-only change with no migration, and per rule 41 landing it on `main`
is not a claim that it is served: whether it reaches this deploy sha or a later one is
a fact about Vercel's queue, not about this commit.

Ledger `- Status:` line for `0219` is set to `pushed` as the last change in the
commit that lands this entry.
