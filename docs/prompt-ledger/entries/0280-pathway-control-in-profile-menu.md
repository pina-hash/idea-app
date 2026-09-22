# 0280 A student can set their own pathway without the modal
- Issued: 2026-09-22T00:00:00Z
- By: Lane N1, following ledger 0276's seven-day deferral cap
  (`PATHWAY_DEFER_MAX_AGE_MS`), which gives every student who defers the
  first-login sheet a deadline and, with no second route to a pathway, turns a
  one-time modal into a recurring one.
- Owns: `src/lib/ProfileMenu.svelte`, `src/lib/pathways.ts`,
  `src/routes/dev/profile-menu/+page.svelte`, one new or widened spec under
  `tools/browser-verify/routes/` and its `measured/*.json`,
  `docs/prompt-ledger/entries/0280-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: 1-5, all five confirmed against the tree.
  Highest on origin/main at issue: 0217
- Status: issued
- Branch: `claude/eloquent-thompson-p2gc2s`
- Notes: ONE PROMPT CLAIM WAS WRONG AGAINST THE TREE and it was the scoping
  one, not a technical one: ledger 0276 is described as "pushed and unmerged on
  `claude/new-session-5uia88`", and it is MERGED -- `453850c3` into
  `integration`, `38b54232` into `main`, which is this session's own starting
  sha, and the branch has been deleted by `integrate.yml`. So the stated reason
  for the three forbidden files (a conflict on a reporting branch) no longer
  holds. They were left untouched anyway, and nothing was imported from
  `PathwayPicker.svelte`. Claims 1 through 5 are all correct, claim 3 most of
  all: `0038_profile_pathway.sql`'s own header says a student writes their own
  pathway through 0001's "update own profile" policy, and `enforce_role_change`
  (0001, re-signed by 0067) guards `role` alone. No migration, no policy.
  DECISION ON THE AUDIT'S OPEN QUESTION: any of the six, changeable, not
  set-once -- a pathway gates nothing, a teacher can already overwrite it, and
  set-once would manufacture a fresh dead end for the student who mis-tapped
  inside the modal they were dismissing. TWO FILES OUTSIDE THE OWNS LINE were
  needed and are reported in the history entry: `src/routes/dev/profile-menu/
  +page.ts` (the harness stub, the only thing that can force the refusal the
  prompt requires verified) and `tools/browser-verify/README.md`'s generated
  counts block, regenerated with `npm run verify:counts` and never hand-edited.
  `src/lib/pathways.ts` was on the Owns line and did NOT need changing; the
  registry already exported everything the control renders from.
  THE MUTATION PROOF DID NOT PIN: with the select-back and its zero-row guard
  removed, `npm test` reports 527/527 files and 9826/9826 tests passed, exit 0,
  identical to the clean run. Nothing in the suite asserts it. The browser
  harness does -- 10 of 32 measurements outside threshold on the refusal spec,
  against 0 restored -- but it is outside `npm test` and outside CI. Reported
  as a gap rather than claimed as a proof.
  ONE DEFECT FOUND AND FIXED BY THE VERIFICATION rather than by reading: the
  panel's one problem list sat 113px below the fold once the section was added
  (measured y 1013..1053 in a 900px viewport, at both widths), so a refused
  write was reported to nobody. ONE DEFECT FOUND AND LEFT ALONE as out of
  scope: `tools/browser-verify/_shot.mjs` silently drops every `click` prepare
  step, so it photographs a state its own header promises it cannot.
