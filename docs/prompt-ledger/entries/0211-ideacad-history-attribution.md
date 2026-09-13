# 0211 IdeaCAD history: land 0196, and make decision 27's attribution deliberate

- Issued: 2026-09-13
- By: router chat
- Owns: the history timeline surface under `src/lib/ideacad/`, the history
  region of `src/lib/ideacad/store.ts`, `src/lib/ideacad/ui/undo.ts`,
  `tests/dom/ideacad-timeline*`, `tools/browser-verify/routes/ideacad*.mjs` and
  its measured store entries, `docs/prompt-ledger/entries/0196-*` (0196's own
  entry, which never landed), `docs/prompt-ledger/entries/0211-*`, and its own
  `docs/history/` entry. Ledgers 0206, 0207, 0209 and 0210 run alongside and
  none of their files were touched; `store.ts`'s shared-open region is ledger
  0201's and is landed, and was not reverted.
- Migration permitted: no. Claims: none. Migration `0211` exists and is applied;
  this is the LEDGER number and a different namespace, not a collision.
  Highest LANDED migration at branch time: **0211**. `0212` is CLAIMED BUT NOT
  LANDED by ledger 0207 (`claude/busy-feynman-aupq55`) and is absent from the
  tree, so it is NOT in the `main..HEAD` range.
- Status: pushed
- Branch: `claude/eager-curie-6s4xcz`, branched from
  `claude/gracious-hopper-a46lec` at `94419ab8` (ledger 0196's branch: 34
  behind `integration`, 3 ahead, never merged, and the branch `integrate.yml`
  reported as conflicting on every run), then merged with `origin/integration`
  at `34a44f2d`.
- Notes: 0196's work is good and was unlanded. This bundle lands it and answers
  decision 27 deliberately.

  **THE MERGE, AND THE ONE CONFLICT THE PROMPT DID NOT EXPECT.** Two files
  conflicted, not three: `classroom-updates.json` merged cleanly this time.
  `tools/browser-verify/README.md` was resolved HUNK BY HUNK as instructed --
  each side held specs the other lacked, so a whole-file take would have
  discarded five specs or one -- and the union was computed independently
  (215 specs, 430 runs) BEFORE `npm run verify:counts` regenerated the region
  from the merged tree, as a control on the regeneration. They agreed, and the
  measurement total came to 7710, which is integration's 7650 plus the 60 that
  0196 reported for the timeline's own route.

  **`src/lib/ideacad/store.ts` ALSO CONFLICTED, AND IT IS NOT A STOP.** The
  prompt said anything beyond those two is a genuine content conflict and a
  stop. This one is the two-region case the prompt separately describes: both
  sides guard `step()`'s entry, and the two guards answer DIFFERENT questions --
  0201's `refuseWrite()` (may this caller write at all) and 0196's `historyOn()`
  (is this deployment's history region live). Neither side was lost:
  `historyOn()` is `historyTransports !== null && !historyOff`, which SUBSUMES
  integration's bare `!historyTransports` and additionally honours the
  `PGRST202` ladder, so the resolution keeps 0201's guard, its ordering and its
  comment, and replaces only the weaker of the two capability tests. A stop is
  for a conflict where picking either side loses behaviour; here neither is
  given up.

  **DECISION 27 WAS SATISFIED BY ACCIDENT AND IS NOW SATISFIED BY
  INSTRUCTION.** `HistoryTimeline.svelte` rendered `entry.actor` raw, and
  `actor` is an EMAIL -- `0209` says so in its own header. That is the letter of
  "each entry clearly shows who made it" and none of its point. `timelineActors`
  resolves the log once; the reasoning is in the history entry.

  **NO MIGRATION WAS NEEDED AND BOTH HALVES WERE VERIFIED BY READING**, as the
  prompt required: `0209` line 184 declares `actor text not null`, and
  `ideacad_concept_history` projects `h.actor` at line 551.

  **Four things were done outside a strict reading of the Owns line.**

  1. `src/lib/classroom/ItemDetail.svelte` and the classroom item route forward
     one more prop (`ideacadViewerEmail`) into the IdeaCAD region -- the same
     three-line shape 0196 already established there. The route's existing
     `ideacadOwnerEmail` now reads from the new single source rather than taking
     a second `data.claims` read; one line, no behaviour change.
  2. `src/lib/ideacad/BladeEditor.svelte` forwards `viewerEmail` unread.
  3. `src/routes/dev/ideacad/+page.svelte` and
     `tests/dom/ideacad-timeline-mount.test.ts` had fixtures seeding actor
     values the database CANNOT PRODUCE (`'you'`, `'A. Reyes'`). That is the
     shape `CLAUDE.md` calls a fixture the producer cannot emit, and it is why a
     surface printing a raw address passed sixty browser measurements: the
     made-up values already read like names. Both seed addresses now.
  4. `tools/browser-verify/_shot.mjs` is new -- it rasterizes a spec at a width
     from the spec's OWN `path` and `prepare`, so a session can look at the
     surface the checks measured. `_`-prefixed and outside `routes/`, so no
     count moves.

## Outcome

**Landed on `claude/eager-curie-6s4xcz`, NOT merged to `main`, and item 4 of
the six-item checklist is the stop -- the same stop 0196 hit.**
`node tools/deploy-probe.mjs --ref origin/integration` exits **1**:
"DEPLOY_PROBE_URL is not set, so production's applied set cannot be read. This
is 'cannot confirm', never 'applied'." The rule is that it must exit 0 and that
`CANNOT SAY` is never a pass, so the merge is Mr. Pina's. This container has no
`.env`, no `DEPLOY_PROBE_URL` and no `IDEA_MIGRATION_URL`.

**The RANGE check passes and is not the blocker.** `main..HEAD` carries exactly
one migration, `0211`, which is applied and permitted; `0212` is claimed by
ledger 0207 and is absent from the tree, so it is not in range. Item 1 passes
(`git merge-base --is-ancestor origin/main origin/integration` exits 0) and
item 3 is clean (`git merge-tree --write-tree origin/main HEAD` reports no
conflict). Item 2 cannot pass yet, because this branch is not in
`origin/integration` until `integrate.yml` merges it. Items 4 and 5 are the
stop.

**Production reports `IDEA Portal v1.1514 · 247dfc4 · Sep 12, 2026`**, read
from the live footer. That sha is contained in both `origin/main` and
`origin/integration`, with **63 commits on `main` after it** -- so production
is behind `main`, which is a fact about the deploy and not about this bundle.
Per `CLAUDE.md` that value is `deploy.sha`, the commit the deployment was built
FROM: exact about the input and silent about the output.

The full suite, `svelte-check`, the browser pass, the mutation proof and the
rasterized reading are reported in
`docs/history/eager-curie-6s4xcz.md`.
