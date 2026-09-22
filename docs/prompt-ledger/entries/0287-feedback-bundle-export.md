# 0287 A feedback export a coding session can work from without a human in the middle
- Issued: 2026-09-22T00:00:00Z
- By: Lane C, from Mr. Pina's own triage loop: he pastes the markdown export
  into a chat and then pastes every screenshot separately by hand, because the
  export does not contain them.
- Owns: `src/lib/feedback/console.ts`, `src/lib/feedback/archive.ts` (new),
  `src/routes/classroom/feedback/+page.svelte`,
  `src/routes/dev/feedback/+page.svelte`, `src/lib/classroom/FeedbackConsole.svelte`,
  `tests/feedback-archive.test.ts`,
  `docs/prompt-ledger/entries/0287-*`, and its own `docs/history/` entry.
- Migration permitted: no, and none was needed. Claims: 1-6, five confirmed and
  one wrong in a detail (see below). Highest on origin/main at issue: 0217
- Status: pushed
- Branch: `claude/new-session-ewax89`
- Notes: TWO PROMPT CLAIMS WERE OFF AGAINST THE TREE, one scoping and one
  factual, and the tree won both times.
  THE SCOPING ONE: the Owns line names
  `src/routes/classroom/feedback/+page.svelte` as where the console lives. It is
  not -- that file is a 29-line shim, and the console is
  `src/lib/classroom/FeedbackConsole.svelte` (1084 lines), which the prompt
  neither granted nor forbade. "Surface them in the console beside the existing
  six" cannot be done anywhere else, so that file was edited. It is not on the
  do-not-own list, which names `screenshot.ts`, `FeedbackBox.svelte`,
  `SiteFeedback.svelte` and `dictation.ts`; none of those four was touched.
  THE FACTUAL ONE: claim 4 says the kinds are "bug, idea, other". There are
  FOUR -- `FEEDBACK_KINDS` in `feedback.ts:27` carries `praise` as well -- and
  the column is plain text that VANGUARD's in-game composer also writes. That is
  the argument for building the picker from `facetValues` over the loaded rows
  rather than from a list typed into the console, which is what shipped; a typed
  list would have been wrong on the day it was written.
  Claims 1, 2, 3, 5 and 6 are exact, with line numbers in the history entry.
  NO MIGRATION, AND THE PROMPT'S STOP CONDITION DID NOT FIRE: both new facets
  read columns that are already there (`app_feedback.kind` from 0053,
  `screenshot_path` from 0170) and no storage policy was widened -- 0170's
  `feedback media admin read` already gives an admin SELECT on every object in
  the bucket, which is the same policy the thumbnail already on screen goes
  through.
  THE BUILD-AGE LINE MEASURES AGAINST THIS BUILD'S OWN COMMIT, NOT
  `origin/main`, and says so in its own words. A browser has no git and cannot
  ask a remote what its head is; the two are the same thing on a production
  deploy and are not on a preview, so the sentence names its reference point
  rather than inviting a reader to believe a distance the page could not know.
  ONE REAL BUG WAS FOUND BY DRIVING THE PAGE AND BY NOTHING ELSE: a temporal
  dead zone in the dev harness (a `const` read by a `$state` initialiser above
  it) 500'd `/dev/feedback` while `svelte-check` reported 0 errors. Fixed, with
  the reason written beside it.
  MUTATION PROOF: eight mutants on the image-to-report mapping, eight killed,
  file restored md5-identical, clean re-verify green. Recorded in the history
  entry.
