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
- Status: issued
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
