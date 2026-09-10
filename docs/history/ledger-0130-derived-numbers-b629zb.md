---
title: "The measured region is regenerated per lane, so two lanes that both regenerate it merge into a silent lie: remeasured on the merged tree, and `integration` landed (`claude/ledger-0130-derived-numbers-b629zb`)"
date: 2026-09-10
branches: [claude/ledger-0130-derived-numbers-b629zb]
migrations: []
subsystems: ["Dev harnesses", "Testing", "Working conventions"]
---

Prompt 0130, a repair bundle and a landing bundle in one. It owns
`tools/browser-verify/README.md`, the two merges, its ledger entry and this
file. No source file, and no source change turned out to be necessary.

## THE ROOT CAUSE, BY NAME

**The measured region of `tools/browser-verify/README.md` is regenerated PER
LANE, so any two lanes that both regenerate it produce a merge that is silently
wrong with no conflict to warn anyone.** That sentence is the finding, and it
is the reason this bundle exists rather than a description of one bad week.

The mechanism, exactly. Ledger 0118 added eleven classroom route specs and
regenerated the region at `4274433b`, so its copy measured 0118's tree. Ledger
0124 regenerated the same region at `c62f5e76` for ITS tree, which did not carry
0118's specs. Both edits rewrite the same lines of the same file for two
different, each-internally-honest trees. Git therefore has an ordinary two-sided
choice and resolves it cleanly to one side: the merge took 0124's copy and
discarded 0118's. What survived was a region claiming
`Measurements outside threshold: 0` over a spec set missing all eleven of
0118's classroom specs.

`git merge-tree` reports no conflict, because there is none. **This is not a
conflict to resolve, and treating it as one is the trap** -- a session looking
for conflict markers finds a clean tree and concludes the merge was fine.
`tests/derived-numbers.test.ts` is what caught it, failing five ways on
`integration` at `fd8e136e`, and it caught it precisely because prompt 0046
made the region name the spec FILES it covered rather than only a count. A
count would have merged just as cleanly and said nothing.

**THERE WAS NOTHING IN GIT TO RESTORE.** The obvious repair -- take 0118's
discarded copy back -- does not work, and ledger 0125 had already established
why: 0118's region covers 169 of 177 specs and misses six more. Neither side of
the merge describes the merged tree, because neither side ever existed as the
merged tree. The only correct region is one measured ON the merged tree, which
is what this bundle produced.

## THE DURABLE FIX, WHICH IS NOT IN THIS BUNDLE

**Lanes should stop regenerating the measured region, and the landing bundle
should regenerate it once after the merge.** As long as a lane may write it,
this defect recurs on every pair of lanes that both do, and it recurs silently.
The static region is already safe from this and shows the shape of the answer:
`integrate.yml` regenerates the STATIC half once on the merged tree before it
pushes `integration`, which is exactly the "once, after the merge, by whoever
merged" placement the measured half needs. What stops the measured half from
simply joining it there is cost -- it needs a browser and about fifteen minutes,
and `README.md` argues at length that a browser-shaped flake must not sit in a
path that can block a deploy to a classroom. So the placement is a landing
BUNDLE rather than the workflow, and that is a change to how lanes are prompted,
not a change to a file this bundle owns.

Until that lands, every landing bundle inherits this one's job: check
`tests/derived-numbers.test.ts` on the merged tip before merging, and expect it
to be red whenever two lanes in the range both touched the region.

## WHAT WAS MEASURED

A full pass on the merged tree at `97475435`, clean working tree, `dirty:false`
recorded in the region's own data line.

| | |
| --- | --- |
| Route specs covered | 175 (against the static region's 175) |
| Route/width runs | 350 |
| Measurements | 6084 |
| Measurements outside threshold | **0** |
| Wall clock | 916.7s |
| `--selftest` controls | 70 (36 negative, 34 positive), 0 instrument failures |

**Every one of the 6084 check lines came back `ok`.** There are no rows outside
threshold to name, which is a result and not a formality: no threshold was
widened, no spec deleted, and no digit hand-edited.

**The two standing `/dev/notebook` toolbar tap-reach rows are CLOSED, and
ledger 0119 closed them.** The prompt carried them as known-and-standing with
the caveat that 0119 may have fixed them; it did, and the spec says so in its
own label, which now reads `toolbar list controls (boxes, formerly the standing
tap-reach rows)`. They measure 78.4x44 at one width and 57.5x44 at the other,
`0/2` and `0/1` under 44px. The fix was structural rather than a threshold move:
they stopped being tap-REACHES (a pseudo-element hit area, which has to be
hit-tested) and became real boxes that own their row, which is the `.tap-44`
mechanism rather than `.tap-reach-44`.

## THE INSTRUMENT, AND WHY THE BOOT WAS TAKEN OUT OF ITS HANDS

`startDevServer` gives a cold `vite dev` a 180-second window and polls
`/dev/pathways` rather than trusting the ready banner. The cold boot has been
measured at 180 to 187 seconds, so it lands on both sides of that window and
fails about half the time -- and the failure reads as a hang rather than as a
timeout anyone would recognise.

So Vite was started separately on 5199 with its pid recorded to the scratchpad,
`/dev/pathways` was warmed with a 900-second curl timeout (it answered `200` in
**0.80s** on this container, so the cold boot was not the ~185s case here), and
the harness reused it. The reuse is not a hack: `startDevServer` probes the
origin first and returns `alreadyRunning` for any answer at all. Recorded server
boot in the report: **4392ms**, against a 916.7s total.

Two rules were followed that have cost prior sessions real work, and both are
worth restating because neither is obvious from the code:

* **`pkill -f` was never used.** It matches the shell running the command as
  well as the target, and has cost two prior sessions their builds. A recorded
  pid or a port is the way to kill this server.
* **Nothing else ran while the pass ran.** Prompt 0120 crashed its own
  regeneration by running `npm test` concurrently against the same Vite server.
  The suite was run only after the region was written and committed.

One informational line in the log deserves recording so the next reader does not
take it for a finding: a single `net::ERR_ABORTED` on
`/dev/pathways/__data.json?x-sveltekit-invalidated=10`, which is SvelteKit's own
client-side invalidation being cancelled, is reported under "failed requests"
and is not a console error -- the `console-errors` check on that run read
`0 error(s), 1 ignored by pattern`. Every run also reports one blocked external
request to `fonts.googleapis.com`; that is the harness's own non-loopback block,
and it is why **text on every one of these runs is measured in the fallback
stack**. `prefers-reduced-motion` is `no-preference` throughout, so that path is
not exercised by any of these numbers.

## VERIFICATION

* `npx vitest run tests/derived-numbers.test.ts` -- **18 passed**, from 5 failed
  / 13 passed before the regeneration.
* `npm test` -- **355 files, 7002 tests, all passed**, 330.59s.
* `node tools/browser-verify/readme-counts.mjs --static --check` -- the static
  region already agreed with the tree and was not rewritten.
* `npm ci`, never `npm install`; `git status` was clean afterwards, so the
  lockfile's two-space indentation was not reformatted into a 4,649-line diff.

## WHAT WAS NOT VERIFIED

**The eight values behind gate 4's substitution, and I cannot verify them.** The
substitution rests on Mr. Pina having applied `0193` by hand on 2026-09-10 and
reporting its verification query returning `2, 2, 7, true, true, true, 0` and
`Bridge-lab-final-v2-.png`, every value matching the migration's own header. No
session in this container can reach the production database: the local `.env` is
a placeholder project. `node tools/deploy-probe.mjs` fails closed here and its
output is recorded verbatim in this bundle's report; its exit 1 was not treated
as a stop, because the evidence gate 4 exists to produce came from production
through the person who ran it, which is the only channel available. The probe's
own rule is unchanged: `CANNOT SAY` is never a pass.

Also not verified: any signed-in surface. The harness covers `/dev` routes only,
and a real route needs a Bosco Tech Google session no automated run in this
container holds.
