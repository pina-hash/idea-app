# 0200 Land `integration` on `main`: the largest landing this repo has taken

- Issued: 2026-09-13
- By: router chat
- Owns: the merge of `integration` into `main`, the reconciling merge back,
  `tools/browser-verify/` generated regions if a merge conflicts inside them,
  `docs/prompt-ledger/entries/0200-*`, and its own `docs/history/` entry. NO OTHER
  SOURCE FILE. NO MIGRATION.
- Migration permitted: no. Claims: none. `0193` through `0210` are ALL applied to
  production by hand and verified against Mr. Pina's own verification queries; `0209`
  returned nine rows, every one true, with the concept count equal to the origin-row
  count, and `0210` returned `notes` 716, `notes_with_a_grid` 0, `grid_only_note_ok`
  true, `empty_grid_note_ok` false, `control_paragraph_ok` true,
  `anon_holds_the_helper` false. The chain ENDS at `0210` and both are applied.
  `0205` through `0210` inclusive are permitted in range; any other migration is a stop.
- Status: pushed
- Branch: `claude/admiring-ride-ba51b7`, branched from `origin/integration` at
  `f4616dca`.
- Notes: `integration` is 43 commits ahead of `main` and carries ten ledgers' work --
  the IdeaCAD history log, the timeline, the share and parts panels mounted on the real
  item page, the notebook grid with its gate and its producer, the draft-mirror hold,
  the material citation model, the applied-migration records and the read-back audit.
  The CI read is the load-bearing step, not the merge: `ci.yml` uses
  `continue-on-error`, so the jobs API reports a failing suite as `success` and only the
  four aggregator `outcome` values are truthful. A run's `head_sha` follows the dispatch
  ref while checkout uses `inputs.ref`, so the tree tested is the aggregator's
  `ref tested:` line and never `head_sha`. The migration range is re-read immediately
  before the merge rather than at branch time: ledger 0195 read a clean range and `0210`
  landed into it while its suite ran.

## Outcome

**`integration` landed on `main`.** Production answered **200** from this container,
which the last six landing lanes could not reach at all (`CONNECT tunnel failed,
response 403`, code `000`) -- both readings are correct and the difference is the
container, so no Vercel URL was substituted on any of them and none was needed here.

**THE WORK WAS THE CI READ, AND THE TIP MOVED BETWEEN THE TWO HALVES OF IT.** Read
once on `f4616dca` (run `34730322854`), all four aggregator values `success` with
`ref tested: f4616dcab08d20d2260791110f90bf50ebdbbb71`. The pre-merge re-read then
found `f4616dca..b06597f1`: `integrate.yml` had merged this lane's own ledger commit
plus ledger 0201 from `claude/peaceful-wright-hupa6x` while the local suite ran --
**exactly the race ledger 0195 stopped on**. The delta was two ledger entries and
nothing else (0 files under `src/`, `supabase/`, `tests/` or `.github/`), so the first
read still spoke for the code; it was **taken again anyway** on `b06597f1` (run
`34731281906`), same four values, `ref tested: b06597f1c7387fdc5be9359926f6a00d3c0f3b52`.
A docs-only delta is what made the first read harmless and is the accident rather than
the rule: nothing about that reading could have said which case it was in.

**THE MERGE NAMED THE TESTED SHA, NOT THE MOVING REF.** `b06597f1` was merged into this
branch (no conflict, in no file, `tools/browser-verify/` included), the branch tip was
read by a third CI run, and `main` took THAT -- so the tree that landed is the tree a
green run names, and anything `integrate.yml` merged afterwards belongs to the next
landing rather than riding in unverified.

**The migration range was read three times and never moved**: `integration` adds
exactly `0209_ideacad_history.sql` and `0210_notebook_note_grid.sql` over `main`,
highest `0210` on both sides, and `tools/migration-claims.mjs` independently answers
`highest landed 0210` / `next free 0211`. No migration outside `0205`-`0210` appeared at
any read. The `0190`/`0191` entries the tool reports as claimed-not-landed are
historical ledger claims against which no file was ever written, so the chain reads
`0189`, `0192`; they are accounted-for holes, not a missing file.

**Measured.** Local suite on the merged tree: **450 files, 8586 tests, 0 failures**
(555.56s), against ledger 0188's 433/8318. `svelte-check` with both `PUBLIC_` values
exported before `svelte-kit sync`: **0 errors, 37 warnings in 20 files, 31/5/1** --
`CLAUDE.md`'s baseline held exactly, **no correction needed, the second lane in a row**
after five drifts in three weeks. Landing size 100 files, 17,643 insertions, 207
deletions. `main` was already an ancestor of `integration` (0 commits left, 43 right at
branch time), so no merge of `main` into the branch was required. Nine new ledger
entries -- 0189, 0190, 0192, 0194, 0195, 0198, 0199, 0200, 0201 -- and **every one reads
`Status: pushed`**, read off `origin/integration` rather than the working tree.

**`Status: pushed` was written in this entry's FIRST commit rather than flipped at the
end, and that had a measurable effect**: `integrate.yml`'s gate reads the status, so it
merged this lane's ledger commit into `integration` immediately, which is half of the
tip movement above. Harmless for a docs-only commit; worth knowing before doing it on a
lane that touches `src/`.

**What remains standing: two agent branches of 51.** This lane's own, and
`claude/notebook-ui-theme-overhaul-0gnx0f`, archived by ledger 0182 at
`refs/heads/archive/notebook-theme-0gnx0f` and deliberately neither merged nor deleted
(a container cannot delete it; the proxy returns 403 and git reports success over that
failure). **The other 49 are contained** -- the measurable end of the state ledger 0193
found as its item 0, 37 standing and 35 conflicting.

**NOT VERIFIED: the browser pass**, deliberately -- this bundle wrote no component,
stylesheet or route, and `verify:browser` on an unchanged tree would re-measure other
lanes' work and report it as this one's. **No migration was applied from here** and none
could be; `0209`/`0210`'s applied state is Mr. Pina's verification, not a reading this
session took. **The deploy is not confirmed as carrying this merge**: the live sha is
recorded below, but one 200 from the root is not evidence about which commit served it.

**THE SHA LIVE ON PRODUCTION IS `247dfc4`, WHICH IS NOT THIS MERGE AND WAS NOT THE
PREVIOUS ONE EITHER.** `https://ideabosco.com/` answered 200 throughout and served
`IDEA Portal v1.1514 247dfc4` on every one of twenty reads across thirteen minutes
after the push. `247dfc4` is ledger 0188's merge (2026-09-12 21:22:27Z). `main` was
already at `85543209` (ledger 0191/0193, 2026-09-12 22:47:22Z) BEFORE this session
touched anything, and that commit was never served either -- **so production is two
landings behind and the lag predates this bundle by over three hours.** This merge
(`ee4a1c42`, 2026-09-13 02:01:29Z) had not appeared when the last read was taken.
Not diagnosed and not routed around: `deploy.yml` is the merge path and Vercel's own
git integration is what builds a push to `main`, neither of which this bundle owns a
file in. **Reported as what it is -- the deploy is unconfirmed, `main` is correct.**

