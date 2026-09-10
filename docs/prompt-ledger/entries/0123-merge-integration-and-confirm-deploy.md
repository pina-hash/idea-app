# 0123 Merge `integration` into `main`, confirm the deploy from production

- Issued: 2026-09-10
- By: Mr. Pina, carrying ledger 0114's gate 4 substitution, ledger 0117's
  portal-shell lane sitting green on `integration`, and ledger 0121's fix to
  the build stamp's date field, which this merge is the first opportunity to
  read back from a merge-commit deployment.
- Owns: the merge of `integration` into `main`, the reconciling merge of `main`
  into `integration`, `docs/prompt-ledger/entries/0123-*`, and its own
  `docs/history/` entry. It owns NO source file.
- Migration permitted: no. Claims: none.
- Lands on: `main`.
- Status: pushed
- Branch: `claude/ledger-0123-merge-deploy-jx5vib`, branched from `origin/main`
  at `131aeec2`.
- Notes: a landing bundle, not a change bundle.

  **THE RULE THAT OVERRIDES EVERYTHING, CHECKED FIRST.**
  `git diff --name-only origin/main...origin/integration -- supabase/migrations/`
  printed nothing at `21b0801d`, so the range carries no migration and no code
  on `main` will run against a schema production does not have. Four lanes are
  live beside this one and two of them (0118 on `src/lib/classroom/**` claiming
  0193, 0120 on `src/lib/gauntlet/**` claiming 0194) stop at their own branches
  precisely because they carry migrations; neither races this bundle to `main`.
  The check is re-run before every merge in the loop, not once at the start.

  **GATE 4 SUBSTITUTION, recorded by name as a deliberate deviation from
  `IDEA_instructions.md` 4.20, and it is ledger 0114's substitution reused
  verbatim rather than a new one.** `node tools/deploy-probe.mjs` cannot pass in
  this container: `DEPLOY_PROBE_URL` is unset and the probe fails closed, where
  `CANNOT SAY` is never a pass. The gate exists to prove every migration in the
  range is applied; the migration check above establishes the range holds none,
  so there is nothing for gate 4 to prove. The probe is run anyway and its
  output reported verbatim, and its failure is not treated as a stop while the
  migration check comes back empty. If that check ever comes back non-empty the
  stop rule fires first and this substitution never applies. **Ledger 0117
  stopped at this gate on a prompt that wrongly said the substitution did not
  apply to it. It did, and it does here.**

  **CONFLICT POLICY.** Conflicts are resolved on `integration`, never on `main`,
  and only in two files: the counts block of `tools/browser-verify/README.md`,
  hunk by hunk and never whole-file, and `classroom-updates.json`, textually
  keeping both sides' entries. Any other conflict is a stop.

  **THE DEPLOY IS READ, NOT INFERRED.** Push output is a claim about what was
  sent, not about what is serving. Production is fetched at
  `/assignments/IDEA-Blade_Rulebook_v2_2` and the sha in its footer stamp
  matched against what was pushed. This is the first merge-commit deploy since
  ledger 0121 widened `deriveDeploy`'s corroboration to include merge commits,
  so the report states whether the date field beside the sha renders a real date
  or still reads `local build`.
