# 0115 Landing the tournaments bundle, after 0192 was applied by hand

- Issued: 2026-09-10
- By: Mr. Pina, with the production verification output from the Supabase SQL
  editor in hand.
- Owns: the merge of `integration` into `main`, the reconciling merge of `main`
  into `integration`, `src/lib/server/push.ts`,
  `docs/prompt-ledger/entries/0115-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none.
- Lands on: `main` (the merge itself) and `integration` (the reconciling merge
  and the `push.ts` change).
- Status: pushed
- Branch: `claude/migration-0192-verification-0dqhto`
- Notes: this bundle exists because ledger 0114 stopped exactly where it was
  told to. Its stop rule fired at 13:22 UTC on 2026-09-09 when prompt 0110 set
  its ledger to `pushed`, `integrate.yml` swept
  `claude/tournaments-surface-scroll-yqplco` into `integration`, and
  `git diff --name-only origin/main...origin/integration -- supabase/migrations/`
  went non-empty for the first time with
  `supabase/migrations/0192_tournament_entry_members_and_admin_hosts.sql`.
  `main` was correctly not advanced past `09433a98` and `integration` has
  rested green and undeployed since.

  Mr. Pina has now applied 0192 BY HAND in the Supabase SQL editor. That is why
  the migration stop no longer applies TO THIS RANGE AND TO NO OTHER. The
  migration check is still run and still governs: if any file other than
  `0192_tournament_entry_members_and_admin_hosts.sql` appears in that diff, this
  bundle stops.

  **GATE 4 SUBSTITUTION, AND THERE ARE NOW TWO OF THEM, FOR TWO DIFFERENT
  REASONS. THIS ONE IS NOT 0114'S.** `node tools/deploy-probe.mjs` cannot pass
  in this container: `DEPLOY_PROBE_URL` is unset and the probe fails closed,
  where `CANNOT SAY` is never a pass. It was run anyway and said, verbatim:

      deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
      cannot be read. This is "cannot confirm", never "applied".

  exit 1.

  **0114 substituted for that gate on the grounds that its range held NO
  migration, so there was nothing for gate 4 to prove. That reasoning is
  unavailable here: this range DOES hold one.** The evidence is instead the
  verification output Mr. Pina ran in the Supabase SQL editor against
  production on 2026-09-10, immediately after applying 0192, which is the
  expected set in 0192's own header, value for value:

      members                    10
      entries_without_members    0
      register_overloads         2
      wide_form_has_no_defaults  true
      host_guard_admin_aware     true
      ledger_member_column       true
      anon_cannot_join           true

  This container cannot reach the database, so that output is the only evidence
  available and it is a PERSON'S reading of production rather than an
  instrument's. The next operations bundle should know that two different gate 4
  substitutions now exist and that they rest on different things: 0114's on an
  empty migration range, this one on a hand-run production verification. Neither
  generalises to the other's case.

  Only three files are permitted to conflict, and only on `integration`, never
  on `main`: the counts block in `tools/browser-verify/README.md`, hunk by hunk
  and never whole-file, and `static/classroom-updates.json`, resolved TEXTUALLY
  keeping both sides' entries. Any other conflict is a stop.

  **THE ONE SOURCE CHANGE.** `docs/history/tournaments-surface-scroll-yqplco.md`
  records an edit owed outside 0110's ownership:
  `sweepPairNotifications` in `src/lib/server/push.ts` pushes `entries.user_id`
  only, so after 0192 made an entry a ROSTER a linked teammate never hears that
  their next match is set. This bundle owns that file and makes exactly the
  change that entry describes, with a test that fails without it.

  **OUTCOME: STOPPED, WITH `main` NOT ADVANCED.** The migration gate PASSED --
  `0192` was the only migration in the range, so ledger 0114's stop rule did not
  fire and this bundle's premise held. The landing then stopped one step later,
  on a different rule.

  Steps 1 and 3 passed: `main` (`09433a98`) was already an ancestor of
  `integration` (`4b416b1e`), so no reconciling merge was needed; both ledger
  entries new on `integration` (0110, 0114) read `pushed`; and
  `git merge-tree --write-tree` returned clean, exit 0, zero conflict markers.

  **Step 2 is what stopped it.** CI dispatched on `integration`'s current tip
  with the FULL forty-character sha (run 34359474234) concluded FAILURE in
  5m22s -- five and a half minutes, so a real red tree and not ledger 0114's
  fifteen-second short-sha `actions/checkout` failure. Two tests red in
  `tests/derived-numbers.test.ts` against 342 of 343 files passing: 9 of the 17
  `tournaments-view-*.mjs` route specs on `integration` are missing from the
  measured region of `tools/browser-verify/README.md`. Verified independently
  against the committed tree, name for name, without running the suite.

  That file is prompt 0110's owned surface ("the generated regions of its
  README") and the repair is `npm run verify:readme`, a browser run of about six
  minutes that writes MEASUREMENTS. It is not this bundle's to write, and the
  one permission this prompt gives over that README is for resolving a CONFLICT
  in its counts block -- there was no conflict, and the short block is the
  measured region, not the counts block. So `integration` was NOT merged into
  `main`, nothing was cherry-picked around it, and production still serves
  prompt 0111's landing: read rather than inferred, `Assignments v1.13 ·
  09433a9 · local build`.

  **The one source change LANDED on this branch.** `src/lib/server/push.ts` now
  notifies the whole roster rather than the captain alone, with
  `tests/tournament-pair-recipients.test.ts` driving the real
  `sweepPairNotifications`. Mutation-proved both directions (reverting the
  recipient line reddens 1 of 9; removing the members read reddens 5), with
  `push.ts` restored from a COPY and md5-identical after each. CI green on
  `ef89489e`, dispatched with the full sha (run 34361678229). It is NOT
  deployed: it reaches production only when the landing above can happen.

  **`deploy.date` was reported and not fixed, as instructed.** `deriveDeploy`
  compares `VERCEL_GIT_COMMIT_SHA` against the head of a `--no-merges` git log;
  `main` advances by `--no-ff` merge commits now, which that log excludes, so
  the two never agree and the date is emptied. 0108 did not cause it. Full
  reasoning in this bundle's `docs/history/` entry.

  **This branch will stand rather than vanish**, because `integrate.yml` runs
  the suite on the tree it pushes and that merged tree still carries
  `integration`'s own red. Per `CLAUDE.md` that is a signal, not a leftover.
