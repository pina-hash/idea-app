# 0089 Land three branches and deploy once
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: the merge of three finished `claude/**` branches into `main`, and one push. Changes no file's content beyond conflict resolution.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: issued
- Branch: claude/land-three-branches-deploy-go0ji5
- Notes: Three branches finished after prompt 0085's sweep and are unmerged:

    claude/sweep-cross-branch-visibility-xo9yz1   (0088, and it CONTAINS 0087)
    claude/land-duplicates-tab-0by1zg             (0086, and it contains 0081)
    claude/land-twenty-two-branches-fuv0tw        (0085's own record)

  `classroom-nav-surfaces-v958ub` and `number-allocation-ledger-c30ms5` are
  inside the first two and are not merged separately.

  ORDER MATTERS: 0088 merged 0087's lane into itself rather than write a
  third parser of the same format, so it must land first or its own history
  reads out of sequence.

  `main` is fully green: prompt 0086 left it at 310 files and 6,267 tests
  with zero failures, and prompt 0088 measured 309 and 6,282 on its own
  branch. There is no inherited red on this tree, so anything that fails
  after a merge was caused by the merge.

  Deliberately excluded: applying any migration, which no cloud container can
  do; repairing anything a merge reveals; and `integration`, which catches up
  afterwards.
