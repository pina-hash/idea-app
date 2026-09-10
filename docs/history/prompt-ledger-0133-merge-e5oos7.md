---
title: "Landed four finished branches into `integration` (fixing the derived-numbers red on the way), then `integration` into `main`, and confirmed the deploy (`claude/prompt-ledger-0133-merge-e5oos7`)"
date: 2026-09-10
branches: [claude/prompt-ledger-0133-merge-e5oos7]
migrations: []
subsystems: ["Dev harnesses", "Testing", "Working conventions", "Short links", "Classroom"]
---

Prompt 0133, a landing bundle. It owns `tools/browser-verify/README.md` in
full (both generated regions), the merge of `integration` into `main`, the
reconciling merge of `main` into `integration`, the merges of four named
branches into `integration`, `docs/prompt-ledger/entries/0133-*` and this
file. No source file, and no source change turned out to be necessary.

## THE STARTING STATE

`integration` was red on `tests/derived-numbers.test.ts` before this bundle
touched anything, at its tip `541e00a1`. The cause is the same defect ledger
0130 diagnosed and named the durable fix for: the measured region of
`tools/browser-verify/README.md` is regenerated per lane, so a lane that adds
route specs and does not itself pay for a fresh six-minute browser pass
leaves the measured region silently describing a smaller tree. 0129 (already
merged onto `integration` ahead of this bundle) added three `html-rubric-*`
route specs; the region's last regeneration never covered them, so it kept
reporting `Measurements outside threshold: 0` over a set that was missing
three files entirely. Ledger 0130's own words: "every landing bundle inherits
this one's job" until the durable fix (regenerate once, in the landing
bundle, never per lane) is itself implemented as a workflow step. This bundle
is another instance of doing that job by hand.

## THE FOUR MERGES

In order, onto `integration` at `541e00a1`:

1. `claude/gauntlet-timing-flake-fix-i5kzst` (ledger 0132) -- a repair-only
   bundle fixing a timing flake in the GAUNTLET verification-floor fixture.
   Clean merge.
2. `claude/reserve-hx-slug-8zq09j` (ledger 0131, migration `0196`) -- reserves
   the `hx` slug in both `RESERVED_SLUGS` and the database predicate, closing
   a blocker ledger 0126 reported and could not fix from inside its own
   surface. Clean merge.
3. `claude/html-assignment-manifest-contract-gye4f7` (ledger 0127, migration
   `0195`) -- the HTML assignment manifest, its validator, the store. Clean
   merge.
4. `claude/html-assignment-manifest-contract-8xazmp` (ledger 0128, no
   migration) -- ports a real HTML assignment (`idea100-blade-01`) onto the
   manifest contract as a fixture and dev harness. Conflicted in exactly one
   file.

A fifth branch, `claude/html-assignment-manifest-contract-tpr7eg` (ledger
0126), was deliberately withheld. It adds `src/routes/hx/`, and with
`PUBLIC_HX_SANDBOX_ORIGIN` unset in production that route would answer on the
cookie-carrying production host while its CSP carries no `sandbox`
directive -- a direct navigation would not land in an opaque origin, which is
exactly the isolation the whole origin-split argument in `CLAUDE.md` depends
on for a served bundle. Mr. Pina sets the Vercel domain first; until then this
branch stays unmerged. `src/routes/hx/` was confirmed absent from
`integration` both before and after this bundle's four merges.

## THE ONE CONFLICT, AND WHY IT WAS SAFE TO RESOLVE BY REGENERATING

The fourth merge conflicted in `tools/browser-verify/README.md`, in two hunks,
both entirely inside the `<!-- counts:static:begin -->` /
`<!-- counts:static:end -->` markers -- one side (this bundle's tree after
three merges) had 179 specs / 72 routes / 99 dev pages / 358 runs; the other
(the fourth branch alone) had 175 / 70 / 98 / 350. No prose conflict appeared
anywhere in the file, which is exactly the shape `README.md`'s own text
describes as the correct-by-construction outcome for the static region:
"regenerating it on a merged tree produces the merged tree's own answer
whatever either side had written." Resolved with `npm run verify:counts` on
the merged tree, landing 179/72/**100**/358 (100, not 99 -- the fourth
branch's own dev harness route pushed the dev-page count up by one more than
either side's pre-merge count showed).

## THE MEASURED REGION, REGENERATED ONCE

After all four merges landed and the tree was clean, Vite was started
manually on port 5199 (`nohup npx vite dev --port 5199 --host 127.0.0.1
--strictPort`, never `pkill -f`, which matches the shell running it and has
cost prior sessions their builds) and warmed with a plain `curl` before the
pass. Nothing else ran concurrently -- no `npm test`, no second browser pass.

`npm run verify:readme` reported:

```
358 route/width run(s), 6246 measurement(s), 0 outside threshold
server boot 87ms; total wall clock 923843ms (923.8s)
```

measured on `82ea7e2` (the tip of the four merges, before this regeneration's
own commit). Coverage grew from the 176 specs the stale region had claimed to
179, now including `html-rubric-state-graded.mjs`,
`html-rubric-state-single.mjs` and `html-rubric.mjs` -- exactly the three
specs 0129 added and the prior regeneration never saw. Zero measurements
outside threshold, which is the expected reading: ledger 0130 measured 352
runs and 6130 measurements at zero outside on a smaller tree, and the
two long-standing `/dev/notebook` rows it referenced were already closed by an
earlier bundle. Nothing new turned up.

`tests/derived-numbers.test.ts`: 18/18 green. Full suite, run once at the
end: 363 files, 7166 tests, all passed.

## CI, DISPATCHED ON THE EXACT SHA

This bundle's work was pushed to `origin/integration` first (a plain
fast-forward, `541e00a1` -> `7fff63f5c27b0e9e47bc833d0253c51e67b648b9` --
not the `GITHUB_TOKEN` push `integrate.yml` makes, so this one DID trigger an
ordinary `push`-event CI run in addition to the dispatched one below; both
ran against the identical sha and both came back green). `ci.yml` was then
dispatched via `workflow_dispatch` with `inputs.ref` set to the full
forty-character sha, never the branch name or a short form -- a run that
completes in under a minute on a short sha is `actions/checkout` failing
outright, with the remaining steps reporting `success` only because they
carry `if: always()` against an empty workspace. This run took about 5.5
minutes (`06:01:34` to `06:07:14`, `Test suite` alone `06:02:33` to
`06:07:09`), which is the shape of a real checkout and a real suite run.

`ci.yml` uses `continue-on-error` on each of its four checks, so the run's
own rolled-up `conclusion` field is not evidence of anything -- it reads
`success` whether or not the underlying checks actually passed. What was read
instead is the "Fail the job if any step failed" step's own log output, which
echoes each `steps.<id>.outcome` before evaluating them:

```
ref tested:         7fff63f5c27b0e9e47bc833d0253c51e67b648b9 (HEAD)
check:              success
test:               success
vanguard-changelog: success
history-verify:     success
```

All four green, on the confirmed exact sha.

## LANDING ON `main`

`origin/main` (`d4001065`) was already an ancestor of this bundle's
`integration` tip -- it had been since the branch point, because `integration`
already contained everything `main` did from the previous landing cycle
(ledger 0130). No reconciling merge of `main` into `integration` was
necessary beyond that pre-existing fact. `integration` was merged into `main`
with `--no-ff`, and it merged clean: no conflict in `classroom-updates.json`
or anywhere else. The diff carries substantially more than this bundle's four
branches -- `integration` had accumulated other already-landed work since
`main`'s last landing (a GAUNTLET verification-floor migration and its
fixture, the notebook theme reconciliation, an earlier HTML-assignment
bundle) -- which is the correct behaviour of a reconciling merge: it carries
forward everything `integration` holds, not only what this bundle itself
added. Pushed non-force: `d4001065` -> `a3e6576e`.

## GATE 4, SUBSTITUTED AND NAMED

`node tools/deploy-probe.mjs` cannot pass in this container --
`DEPLOY_PROBE_URL` is unset -- and it says so rather than guessing:

```
deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
cannot be read. This is "cannot confirm", never "applied".
```

(exit 1, not treated as a stop.) This bundle's Gate 4 rests instead on three
migrations already hand-applied to production and reported verified in the
prompt itself: `0194` (`floor_ms` 30000 at apply, `held_with_a_seat` 0),
`0195` (1, 1, 2, 1, true, false, false, true, 0), `0196` (true, true, false,
34, false, false, true). None of those eight-and-more values were verified
independently here -- no session in this container can reach the production
database. Of the three, only `0195` and `0196` were newly introduced by this
bundle's own four merges; `0194` was already present on `integration` at the
branch point, landed by an earlier cycle.

## DEPLOY, CONFIRMED BY READING PRODUCTION

After the push to `main`, `https://ideabosco.com/assignments/
IDEA-Blade_Rulebook_v2_2` was polled directly (never trusted from push
output) until its footer stamp changed. It read
`Assignments v1.14 · d400106 · Sep 9, 2026` (the pre-push sha) on the first
several checks, then `Assignments v1.14 · a3e6576 · Sep 10, 2026`, matching
the pushed sha `a3e6576e1690b1b7b3ce6ee02f0aee89124d0686`. Re-fetched once
more independently after the poll exited; the stamp held.
