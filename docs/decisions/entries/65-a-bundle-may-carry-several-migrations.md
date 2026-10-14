# 65 A bundle may carry several migrations

- Raised: 2026-10-14  By: Mr. Pina, in the building session (ledger 0381): "There might be some stupid rule that you're only allowed to write one migration per prompt ... Whatever that is, remove it ... Whatever you think ideal is ideal."
- Status: DECIDED 2026-10-14 (ledger 0381). RETIRES the one-migration-per-bundle rule in `docs/standards/IDEA_instructions.md` 4.33 and `tools/apply-migration.mjs`.
- Decision: A prompt or bundle may write as many migrations as its work needs, listed on its ledger entry's `Claims:` line. Each is still applied alone and in order (the lowest unapplied first, refused otherwise), and the Migrate workflow starts itself again after each clean apply, so every file a bundle carries lands on one merge. It never continues past a refusal or an apply it could not verify.
- What did not change: one file per apply, the scoped migration role, the record row, and that a destructive migration is applied by a person.
- Context: CLAUDE.md "A BUNDLE MAY CARRY SEVERAL MIGRATIONS"; `.github/workflows/migrate.yml`.
