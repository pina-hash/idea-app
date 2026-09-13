---
title: "`integration` landed on `main`, the largest landing this repo has taken, and the tip moved mid-run so the CI read was taken twice and the merge named the tested sha (`claude/admiring-ride-ba51b7`, ledger 0200)"
date: 2026-09-13
branches: [claude/admiring-ride-ba51b7]
migrations: []
subsystems: ["Process", "IdeaCAD", "Notebook", "Testing", "Documentation"]
---

A landing bundle with no feature in it. What it owns is the merge of `integration`
onto `main` and the reconciling merge back, and it wrote exactly two files: this
entry and `docs/prompt-ledger/entries/0200-*`. No source file, no test, no
migration, no workflow, no decision entry.

## Production answered 200, and the six refusals before it were the container, not the host

`curl -sS -o /dev/null -w '%{http_code}' https://ideabosco.com/` answered **200**
from this container. The last six landing lanes each reported
`CONNECT tunnel failed, response 403` and code `000` for the same command, and
ledger 0188's entry records it as the proxy refusing that host. **Both readings are
correct and the difference is the container**, which is the whole reason the prompt
says the figure differs by container and must be reported rather than routed
around. A Vercel URL was not substituted on any of those lanes and was not needed
here.

## The load-bearing step was the CI read, and the tip moved between the two halves of it

`ci.yml` puts `continue-on-error: true` on all four of its real steps, so the jobs
API reports a failing suite as `success` and **only the aggregator's four `outcome`
values are truthful**. Equally, a run's `head_sha` follows the dispatch ref while
`actions/checkout` uses `inputs.ref`, so the sha in the API is not a claim about the
tree that was tested; the aggregator's own `ref tested:` line is.

Read once, on `f4616dca`, dispatched with the full forty-character sha
(run `34730322854`):

    ref tested:         f4616dcab08d20d2260791110f90bf50ebdbbb71 (HEAD)
    check:              success
    test:               success
    vanguard-changelog: success
    history-verify:     success

**Then the pre-merge re-read found the tip had moved**, `f4616dca..b06597f1`, while
the local suite was still running. That is exactly the race ledger 0195 stopped on,
and it is why the range is re-read immediately before the merge rather than at branch
time. What had landed was `integrate.yml` merging this lane's own ledger commit plus
ledger 0201 from `claude/peaceful-wright-hupa6x` -- **two ledger entries and nothing
else**: 0 files under `src/`, 0 under `supabase/`, 0 under `tests/`, 0 under
`.github/`. So the code the first read spoke for was unchanged, and the second read
was still taken rather than reasoned past, on `b06597f1`, with the same four values
(run `34731281906`).

**The first read would have been a true statement about a tree nobody was merging.**
A docs-only delta makes that harmless here, which is the accident and not the rule:
the re-read is what tells the two cases apart, and nothing about the first reading
could have.

## The migration range, read twice, and why five lanes stopped here for the wrong reason

`integration` adds exactly **`0209_ideacad_history.sql` and
`0210_notebook_note_grid.sql`** over `main`, and the highest number on either side is
`0210`. Identical at branch time and at the pre-merge re-read.
`node tools/migration-claims.mjs` independently answers `highest landed 0210`,
`next free 0211`.

`0193` through `0210` are all applied to production by hand and verified against
Mr. Pina's own queries -- `0209` nine rows, every one true, concept count equal to the
origin-row count; `0210` `notes` 716, `notes_with_a_grid` 0, `grid_only_note_ok` true,
`empty_grid_note_ok` false, `control_paragraph_ok` true, `anon_holds_the_helper`
false. Ledgers 0190, 0192, 0194, 0195 and 0199 each stopped correctly against a
prompt that vouched for a shorter chain than the one that now exists. **That is a
prompt-chain gap and not a defect in any of them**, and it is worth writing down
because the five stops look from the outside like five sessions being wrong about the
same thing.

The two holes at `0190` and `0191` that `migration-claims.mjs` reports as "claimed,
not landed" are historical: ledger entries 0092/0093/0098/0099 claimed those numbers
and no file was ever written at either, so the chain reads `0189`, `0192`. They are
accounted-for holes, not a missing migration.

## Measured

**`main` was already an ancestor of `integration`**, 0 commits on the left of
`origin/main...origin/integration` against 43 on the right at branch time and 45 at
merge time, so no merge of `main` into the branch was needed and the `--no-ff` merge
carried no conflict in any file -- none in `tools/browser-verify/`, which this bundle
owned the generated regions of in case it did.

Landing size: **100 files changed, 17,643 insertions, 207 deletions** at branch time.

| reading | this landing | ledger 0188's merged tree |
| --- | --- | --- |
| test files | **450** | 433 |
| tests | **8586** | 8318 |
| failures | **0** | 0 |
| `svelte-check` | **0 errors, 37 warnings in 20 files** | 0 / 37 in 20 |
| breakdown | **31 / 5 / 1** | 31 / 5 / 1 |

`svelte-check` was run with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
exported before `svelte-kit sync`, per the phantom-error rule, and the baseline
`CLAUDE.md` states **held exactly** -- 0 errors, 37 warnings in 20 files, splitting
31 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`.
**No correction to that line was needed, the second lane in a row it has held** after
five drifts in three weeks. The suite ran in 555.56s.

Nine ledger entries arrive with this landing -- 0189, 0190, 0192, 0194, 0195, 0198,
0199, 0200, 0201 -- and **every one reads `Status: pushed`**, checked against
`origin/integration` rather than against the working tree.

## What remains standing, and why

**Two agent branches of 51 are not contained in `main` or `integration`.** One is
this lane's own. The other is `claude/notebook-ui-theme-overhaul-0gnx0f`, archived by
ledger 0182 at `refs/heads/archive/notebook-theme-0gnx0f` and deliberately neither
merged nor deleted: a container cannot delete it, the proxy returns 403 and git
reports success over that failure. **The other 49 are contained**, which is the
measurable end of the state ledger 0193 found as item 0 -- 37 standing branches, 35
conflicting with `integration`, three consecutive red Integrate runs.

## Not verified

- **The browser pass was not run.** This bundle wrote no component, no stylesheet and
  no route; the surfaces in the landing were each measured by the lane that built
  them, and `npm run verify:browser` on a tree this lane did not change would
  re-measure somebody else's work and report it as this one's.
- **No migration was applied from here**, and none could be: a cloud container has no
  route to the production database. The applied state of `0209` and `0210` is
  Mr. Pina's verification, quoted above, not a reading this session took.
- **The deploy is not confirmed as carrying this merge.** Production answered 200 and
  the sha live at the time of the read is reported in the ledger outcome, but Vercel's
  build of the merge commit had not necessarily finished when it was taken, and one
  200 from the root is not evidence about which commit served it.
