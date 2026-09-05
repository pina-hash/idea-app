# 16 A lane may merge `integration` into `main` unattended
- Raised: 2026-09-05  By: session on `claude/full-auto-migration-deploy-w9w48f` (prompt 0055)
- Status: decided 2026-09-05
- Decision: YES, asked for. Mr. Pina asked on 2026-09-05 for every remaining manual step
  to be automated, and the merge to `main` was the second of the two that were left. The
  canned lane ending in `IDEA_instructions.md` 4.20 now grants it, against a six-item
  checklist the session must REPORT with the command it ran and the answer it got. This
  entry records what gates it and what the worst case is.
- Default this assistant would pick: Grant it, with the checklist. Decision 10 declined an
  unattended deploy in 2026-09-02 for a stated blocker -- CI could not read production's
  applied migration set -- and that blocker is gone: `tools/deploy-probe.mjs` reads
  production's own `pg_catalog` and fails closed. What is left is the same set of checks
  `deploy.yml`'s guard job already performs, which a session can perform itself.
- Why it is blocked on him: a push to `main` deploys `ideabosco.com`, which students use
  during class. That is the one gate no session can evaluate -- a session has a clock but
  not a timetable -- and the ending says so in words rather than implying the checklist is
  complete.
- What it unblocks: a lane finishing its own work end to end, rather than pushing and
  waiting for a person to press Deploy.
- The six gates, all of which a session can establish for itself: `origin/main` is an
  ancestor of `origin/integration`; the branch is contained in `integration` and CI is
  green on `integration`'s CURRENT tip; the merge into `main` is clean; `deploy-probe`
  exits 0 (2 or 3 is a stop, and `CANNOT SAY` is never a pass); every migration the bundle
  added is reported APPLIED by that probe, by number; and every ledger entry newly on
  `integration` reads `Status: pushed`.
- The three it cannot establish, named in the ending: whether students are in class right
  now; whether the Vercel preview renders correctly, which no cloud container can check
  (established 2026-08-26 and unchanged); and whether a migration's EFFECT on real data
  was what was intended, since the probe answers that an object exists and never that a
  backfill did the right thing.
- Worst case: a lane merges a green, probe-clean `integration` into `main` during a class
  period and deploys a change mid-lesson. `main` is never force-pushed, so the recovery is
  an ordinary revert commit and a redeploy. The second worst case is a change that is
  green, probe-clean and still wrong on a surface only the preview would have shown, which
  is the same exposure the Deploy button already carried, since nobody was opening the
  preview before pressing it either.
- Context: `docs/decisions/entries/10-unattended-nightly-deploy.md` (the blocker this
  removes), `.github/workflows/deploy.yml` (the guard job the checklist mirrors),
  `.github/workflows/integrate.yml` (its header states both original reasons),
  `docs/standards/IDEA_instructions.md` 4.20, `docs/decisions/entries/15-scoped-migration-role.md`
  (decision 15, scoped-migration-role -- cited by path because a second entry briefly held
  the number 15; see `docs/decisions/README.md`, "How a number is claimed").
- Tree check (2026-09-05): `deploy.yml` does check main-is-ancestor-of-integration, does
  run `deploy-probe.mjs` and does refuse a conflicted merge, so the checklist mirrors an
  existing implementation rather than inventing one. `CLAUDE.md` still carries an
  unconditional "push the branch, do not merge to `main`" in its `claude/**` branch
  paragraph, which this decision contradicts and which prompt 0055 did not own; correcting
  it is a line for a later bundle and is reported rather than edited.

## What actually happened to the OTHER half, 2026-09-05, recorded by prompt 0065

This decision and decision 15 (scoped-migration-role) were the two halves of the same
request: automate applying a migration, and automate merging to `main`. **The merge half
is unaffected and stands exactly as decided.** The six gates are all things a session can
still establish, none of them depends on the scoped role existing, and a lane that cannot
apply its own migration simply reports the migration as one Mr. Pina still pastes, which
is the state everything was in before either decision.

**The apply half did not survive contact with the platform.** The event-trigger guard
decision 15 describes cannot be installed on Supabase -- `create event trigger` needs
superuser -- so it is removed, the compensating control is now the only control, and it
is client-side and bypassable. Decision 15's own "What actually happened" section carries
the measurements. Two things follow for this decision that are worth saying here rather
than leaving to be inferred:

1. **The sixth gate is not weakened, but the thing it gates is now weaker.** "Every
   migration the bundle added is reported APPLIED by that probe, by number" is still a
   real check, still reads production's own `pg_catalog`, and still fails closed. What
   changed is who applied it: possibly a session holding a credential that nothing in the
   database restrains, rather than a person in the SQL editor. The gate answers "did this
   land", which it always did; it never answered "was this safe to send", and the layer
   that does now has no database half behind it.
2. **The worst case in this entry is unchanged and the worst case NEXT DOOR is not.**
   A bad merge here is an ordinary revert commit and a redeploy, because `main` is never
   force-pushed. A bad APPLY has no revert: `supabase/roles/idea_migrator.sql`'s header
   lists seven things the credential can do that nothing will stop, and a dropped table
   is not recovered by a git revert. Those are different exposures and this entry should
   not be read as having decided the second one.
