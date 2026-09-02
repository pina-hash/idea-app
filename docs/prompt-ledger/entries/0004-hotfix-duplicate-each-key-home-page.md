# 0004 HOTFIX: duplicate `{#each}` key blanks the home page in production
- Issued: 2026-09-01 04:20 UTC
- By: Cowork session "Claude computer use demo", lane 1
- Owns: `src/lib/site-versions.ts`, `src/routes/+page.svelte`, `tests/site-versions.test.ts`
- Migration permitted: no. Highest on origin/main at issue: 0169
- Status: deployed
- Branch: `claude/ideabosco-home-blank-fix-6eglbg` at `0d73f72`, swept into integration as `2b54d87`, deployed to main as `9b534a3` via PR #70, merged by Mr. Pina 2026-09-01 04:35 UTC
- Notes: **A live outage. `ideabosco.com/` has been blank for students since
  2026-09-01 01:23 UTC (6:23 PM PT); first complaint 6:51 PM PT.** Every other route is
  unaffected, because only the home page carries the changelog panel.

  `logMonths` in `src/routes/+page.svelte` groups the changelog into months in a single
  pass, comparing each entry only against the last group it opened. That is correct only
  while the log is monotonic by displayed date, and it stopped being monotonic because of
  timezones rather than ordering. `entry.iso` derives from `%cI`, which carries each
  commit's own UTC offset. Claude Code commits from cloud containers are stamped `+00:00`;
  GitHub web-UI commits are stamped in the author's local zone. Git orders by absolute
  instant, so `2cf9b94` at `2026-08-31T18:20:17-07:00` sorts between two commits stamped
  `2026-09-01T01:08` and `02:05` UTC while displaying a date one day earlier. The pass then
  opens a second `2026-09` group and a second `2026-08` group, and
  `{#each logMonths as month (month.key)}` receives duplicate keys. Svelte 5 treats that as
  fatal: `each_key_duplicate`, thrown during hydration, which is why the server HTML is
  correct and the client is blank.

  Measured, not reasoned: running the shipped grouping over the real 971-commit log gives
  6 groups with duplicate keys `{'2026-09': 2, '2026-08': 2}`. The Map-keyed replacement
  gives 4 groups, no duplicates, 971 entries in and 971 out.

  **This ledger records that the outage came through this lane.** Entry 0001 deployed as
  PR #68 at 01:23 UTC under the standing deploy approval, and that deploy is what carried
  the crash to production. Nothing in 0001's own diff caused it: the lane's files were
  `docs/prompt-ledger/**` and `tools/idea-status.py`, neither of which reaches the client.
  What the deploy carried was everything else that had accumulated in `integration`,
  including `2cf9b94`. That is the finding worth keeping: **a deploy PR from `integration`
  ships every commit sitting in `integration`, not the lane's diff, so "my change is
  inert" is not a statement about what a deploy will do.** The blast radius of a lane's
  deploy is the branch, never the lane.

  Second finding, and the reason this defect existed at all: the grouping lived inline in a
  `.svelte` file, where no unit test could reach it, while the pure module beside it
  carries 35 tests. The fix moves `groupEntriesByMonth` into `src/lib/site-versions.ts`
  for that reason and not for tidiness. The regression test reproduces the five real
  commits and also asserts what the old single-pass rule would have produced, so it states
  the defect rather than merely passing.

  **Closed 2026-09-01 04:40 UTC, and confirmed by measurement on the deployed artifact
  rather than by the merge.** Same tool, same browser tab, same URL, before and after:

      before   ideabosco.com   console: each_key_duplicate      get_page_text: NO TEXT CONTENT
      after    ideabosco.com   console: clean                   get_page_text: full page

  The empty-text result is what makes the pair worth anything. A clean console on its own
  is the failure mode `IDEA_VERIFICATION_ADDENDA.md` names first - an instrument that
  cannot fail reports success either way - so the check was run against the broken build
  first and it did fail, loudly, with the same stack the browser showed at 6:51 PM. The
  page now returns its full content: four active courses, every section's stream, the
  changelog panel, badge `IDEA PORTAL V1.808 - 9B534A3`.

  The session's own verification, which exceeded what the prompt asked for: full suite
  green at 225 files and 4664 tests, `svelte-check` 0 errors against the documented 31/5/1
  warning baseline, and a **mutation proof** - it reverted `groupEntriesByMonth` to the
  single-pass rule, confirmed 7 of the new tests fail, then restored the file and verified
  it byte-identical. It also built its fixtures through `parseGitLog`, the real producer,
  rather than hand-typed objects.

  Two errors of mine on this lane, recorded because the ledger is worth less without them.
  The prompt told the session to run `npm run lint`; there is no lint script, no config and
  no linter dependency in this repo, and I asserted the command existed without checking.
  It checked, found nothing, and declined to substitute prettier against a tab-indented
  repo. And while hunting a positive control I navigated to an older preview URL behind
  Vercel SSO, which **sent an access-request email to the team owners**. It was a read I
  intended, with a side effect I did not, and the lesson is that a navigation is not
  automatically a read-only act.

  One cosmetic thing observed and deliberately not fixed: the production badge reads
  `LOCAL BUILD` where the preview read `SEP 1, 2026`. `deriveDeploy` takes the date from
  the log's head only when that head is the env sha, and `--no-merges` hides the merge
  commit every deploy PR creates, so the two never agree on `main`. Pre-existing, present
  on every production deploy, and not a regression from this change.

  Deliberately not included: any change to how commit timestamps are produced. Normalising
  the log to UTC at parse time would fix the symptom and hide a class of defect that has
  now shown up once; history timezones are immutable and mixed-zone commits will keep
  arriving, so the grouping is made correct for a non-monotonic log instead.
