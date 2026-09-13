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

