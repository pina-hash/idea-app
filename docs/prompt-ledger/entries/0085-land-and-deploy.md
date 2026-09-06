# 0085 Land twenty-two branches and deploy once
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: the merge of finished `claude/**` branches into `main`, and one push. Changes no file's content beyond conflict resolution.
- Migration permitted: no. Highest on origin/main at issue: 0185
- Status: pushed
- Branch: `claude/land-twenty-two-branches-fuv0tw`; `main` advanced `eec8151..5b3e14b` (82 commits, fast-forward)
- Notes: Twenty-two branches finished across 2026-09-05 and 2026-09-06 and
  none is merged. Lanes have begun building around each other rather than on
  each other: prompt 0081 could not add a duplicates tab because 0074's page
  is on an unmerged branch, and adding one would have offered every manager a
  404. Prompt 0069's Spam button raises until `0188` applies. The two
  `gauntlet-doc` assertions have been red on `main` since 2026-09-05 with the
  fix sitting on `four-red-integration-tests-62a7ba`.
  
  Mr. Pina asked for these merged straight to `main`. Every push to `main`
  deploys the site students use. So this merges all of them locally, proves
  the merged tree, and pushes once.
  
  Two branches need care and both are known:
  `upload-limit-fiction-jv9w43` conflicts on
  `0185_bucket_limits_under_the_global.sql`, which is already on `main`;
  `tournament-bracket-surface-jf28qc` may still have a session running.
  
  Deliberately excluded: applying any migration, which no cloud container can
  do; repairing anything a merge reveals; and `integration`, which catches up
  afterwards.
