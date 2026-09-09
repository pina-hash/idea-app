# 0114 The overnight landing

- Issued: 2026-09-09
- By: Mr. Pina, unattended overnight bundle.
- Owns: the merge of `integration` into `main`, the reconciling merge of `main`
  into `integration`, `docs/prompt-ledger/entries/0114-*`, and its own
  `docs/history/` entry. It owns NO source file.
- Migration permitted: no. Claims: none.
- Lands on: `main` (the merge itself) and `integration` (the reconciling merge).
- Status: pushed
- Branch: claude/overnight-merge-reconciliation-cub8ku
- Notes: **This bundle runs UNATTENDED.** Mr. Pina is asleep and authorised
  every merge and deploy in it in advance. He cannot answer a question, so
  where the prompt does not cover a case the bundle STOPS and writes what it
  found rather than improvising. A stop is a success; a clever recovery is not.

  The loop is: fetch, reconcile `main` into `integration` if `main` has drifted
  (the app's own `classroom:` export commits move it), wait for CI green on
  `integration`'s CURRENT tip, run the migration check, confirm a clean merge,
  confirm every newly-landed ledger entry reads `pushed`, merge `integration`
  into `main` with `--no-ff`, and confirm the deploy by READING PRODUCTION
  rather than by the push output. Then return to the top, because the five
  live lanes (0108 loading, 0109 docs, 0110 tournaments, 0111 feedback, 0112
  maps) are still landing while it runs.

  **THE ONE RULE THAT OVERRIDES EVERYTHING ELSE**: if
  `git diff --name-only origin/main...origin/integration -- supabase/migrations/`
  prints any file, DO NOT MERGE TO `main`. This container cannot reach the
  production database and Mr. Pina applies migrations by hand in the Supabase
  SQL editor while awake, so a migration reaching `main` deploys application
  code against a schema that does not exist. Prompt 0110 is permitted
  migration 0192 and is running now, so the range may well become non-empty
  overnight. Landing everything up to that point and stopping there is the
  correct outcome, not a failure. Cherry-picking around a migration is
  forbidden.

  **GATE 4 SUBSTITUTION, recorded here as a deliberate deviation from
  `IDEA_instructions.md` 4.20.** `node tools/deploy-probe.mjs --ref
  origin/integration` cannot pass in this container: `DEPLOY_PROBE_URL` is
  unset, and the probe fails closed, where `CANNOT SAY` is never a pass. That
  gate exists to prove every migration in the range is applied. The migration
  check above already establishes the range contains NO migration, so there is
  nothing for gate 4 to prove. The probe is run anyway and its output reported
  verbatim; its failure is not treated as a stop while the migration check
  comes back empty. If the migration check ever comes back non-empty, the stop
  rule fires first and the substitution never applies.

  Only three files are permitted to conflict, and only on `integration`, never
  on `main`: the counts block in `tools/browser-verify/README.md`, resolved
  hunk by hunk and never whole-file, and `static/classroom-updates.json`,
  resolved TEXTUALLY keeping both sides' entries. ANY OTHER CONFLICT IS A STOP.

  This bundle does not merge any lane's branch. `integrate.yml` sweeps a
  `claude/**` branch into `integration` when its CI goes green and its ledger
  entry reads `pushed`, then deletes it; a branch that vanishes has landed and
  is not a problem.

  **OUTCOME.** `integration` was landed on `main` at `5e7b44f1` and the two are
  level in both directions, 0 commits either way. CI run 34344181802 concluded
  success on `a3f26f1d`, the exact tip merged. The migration check was empty at
  every reading and 0110 had not written 0192, so the stop rule never fired and
  the gate 4 substitution applied as written. Production was read rather than
  inferred: `Assignments v1.12 · 5e7b44f · local build`, the pushed sha, two
  minutes after the push. Nothing was cherry-picked and no source file was
  touched.

  **SECOND PASS.** The loop then ran again: this bundle's own branch was swept
  into `integration` and deleted by `integrate.yml`, prompt 0108's loading lane
  landed on top of it, and `main` went on to `1e258835` behind a second
  independently-gated merge (CI run 34346541626 on `eecb6880`, green, tip
  confirmed unmoved). Production read `Assignments v1.13 · 1e25883 · local
  build`. `main` and `integration` are level in both directions, 0 commits
  either way. Prompts 0110, 0111 and 0112 were all still `Status: issued` at
  the last reading and were correctly NOT landed.

  **STOPPED ON THE MIGRATION RULE, WHICH IS THE INTENDED ENDING.** The loop ran
  four full passes and landed 0104, 0106, 0109, 0113, 0108, 0112, 0114 and 0111,
  each behind its own gates and each confirmed against the production stamp:
  `main` went `917d976f` -> `5e7b44f1` -> `1e258835` -> `999e0612` -> `09433a98`.
  At 13:22 UTC prompt 0110 set its ledger to `pushed`, `integrate.yml` swept
  `claude/tournaments-surface-scroll-yqplco` into `integration` and deleted it,
  and the migration check went non-empty for the first time:
  `supabase/migrations/0192_tournament_entry_members_and_admin_hosts.sql`,
  claimed by `docs/prompt-ledger/entries/0110-tournaments-surface.md`
  (`Migration permitted: exactly one. Claims: 0192.`). Per the rule that
  overrides everything else, `main` was NOT advanced past `09433a98`. Nothing
  was cherry-picked around it. `integration` rests 7 commits ahead at
  `b2a2026d`, green and undeployed, waiting on Mr. Pina to apply 0192 by hand.
