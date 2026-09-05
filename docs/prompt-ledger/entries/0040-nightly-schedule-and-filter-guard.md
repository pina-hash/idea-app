# 0040 Point the nightly at the hour defects hide in, and stop the CI filter coming back
- Issued: 2026-09-04
- By: router chat for IDEA portal work
- Owns: the schedule block in `.github/workflows/ci.yml`, `.github/workflows/README.md`, `tests/workflows.test.ts`, `tools/integrate-gate-proof.sh`, `docs/prompt-ledger/entries/0040-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0179
- Status: pushed
- Branch: assigned by the harness
- Notes: Prompt 0036 fixed six tests that failed only between 00:00 and 02:00
  America/Los_Angeles, and answered plainly that a scheduled run at a fixed
  hour inside that window would have caught them the night `0174` landed. The
  instrument already exists: `ci.yml` runs nightly on `integration`. Its cron
  is `30 4 * * *`, which is 21:30 Pacific in summer and 20:30 in winter, so
  it has never once run inside the hours a day-boundary defect shows.

  A test suite that only ever runs during the working day samples one part of
  the clock and calls it coverage. This defect passed every CI run for weeks
  and surfaced only when a person happened to re-run a branch at 00:58.

  The second half is a regression guard. Prompt 0037 removed
  `-f event=push` from the sweep's CI query and proved eleven cases against
  fixture repos, including the one nobody had noticed: with that filter, a
  branch whose newest run was a RED hand re-run would still be MERGED if a
  green push run preceded it. That filter was also silently acting as a fork
  guard, because a fork's run arrives as `pull_request`. Both properties are
  now load-bearing and neither is obvious from reading the file, which is
  exactly the shape that gets reintroduced by someone tidying.

  Deliberately excluded: `integrate.yml` and `deploy.yml` themselves, both of
  which have in-flight work on `integration` from prompts 0035 and 0037.
