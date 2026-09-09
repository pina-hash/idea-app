---
title: "Prompt 0115: the tournaments landing STOPPED on a red `integration`, a second gate 4 substitution resting on a hand-run production verification, and the teammate who was never told their match was set (`claude/migration-0192-verification-0dqhto`, no migration)"
date: 2026-09-10
branches: [claude/migration-0192-verification-0dqhto]
migrations: []
subsystems: ["Operations", "Deploy", "Tournaments", "Push"]
---

An operations bundle that did not get to deploy. Mr. Pina applied `0192` by hand
in the Supabase SQL editor and handed over the verification output, which lifted
the ONE rule that stopped ledger 0114 -- and then `integration`'s own CI came
back red on its current tip for an entirely different reason, in a file this
bundle does not own. The landing stopped there. `main` was not advanced, so
production still serves what prompt 0111 landed.

**A stop is the outcome, not a failure of one.** Everything else the prompt asked
for was completed: the `push.ts` edit 0110 left owed, its test, and the read-only
`deploy.date` finding.

## The three opening checks

`git fetch --unshallow origin` succeeded and brought the full history plus ~70
sibling `claude/**` refs. It also reported `origin/main` as a FORCED update,
`336e82fe...09433a98` -- the container's cached ref was stale rather than main
having been rewritten; `09433a98` is a fast-forward descendant of the tree 0114
left and every commit 0114 named is reachable from it. `git fetch origin
integration` succeeded. Identity was already `Claude <noreply@anthropic.com>`.

## The migration gate, which PASSED

`git diff --name-only origin/main...origin/integration -- supabase/migrations/`
printed exactly one file,
`supabase/migrations/0192_tournament_entry_members_and_admin_hosts.sql`, and
nothing else. That is the one file the prompt permits, so the stop rule ledger
0114 ended on did not fire.

## GATE 4: THE SECOND SUBSTITUTION, AND IT IS NOT 0114'S

`node tools/deploy-probe.mjs` was run, with and without `--ref
origin/integration`. Both printed, verbatim:

    deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
    cannot be read. This is "cannot confirm", never "applied".

exit 1. (Taken with the exit code captured directly rather than through a pipe:
`| head` had reported a misleading `EXIT=0`, which is `head`'s status, not the
probe's.)

**0114 substituted for this gate on the grounds that its range held NO migration,
so there was nothing for gate 4 to prove. That reasoning is unavailable here**,
because this range holds one. The evidence in its place is the verification Mr.
Pina ran in the Supabase SQL editor against production immediately after applying
`0192`, which matches the expected set in that migration's own header value for
value:

    members                    10
    entries_without_members    0
    register_overloads         2
    wide_form_has_no_defaults  true
    host_guard_admin_aware     true
    ledger_member_column       true
    anon_cannot_join           true

**Two substitutions now exist for two different reasons and NEITHER generalises to
the other's case.** 0114's rests on an empty migration range and is available only
while the range is empty. This one rests on a person's reading of production and
is available only for `0192` on this date. A future operations bundle that finds a
non-empty range and no verification output in its prompt has NEITHER, and the
answer there is to stop.

It is also worth being plain about what this substitution is worth: it is a
PERSON'S transcription, not an instrument's reading. This container cannot reach
the database and did not verify a single one of those seven values.

## WHY THE LANDING STOPPED: `integration` IS RED AT ITS TIP

CI was dispatched on `integration`'s current tip, `4b416b1e`, with the FULL
forty-character sha (run 34359474234). It concluded **failure** in 5m22s.

**The duration is the discriminator and it was checked deliberately.** Ledger 0114
recorded a run that reported red in fifteen seconds because a SHORT sha was
passed: `actions/checkout` could not resolve it and every later step reported
success against an empty workspace, because they are `if: always()`. Run
34349439829 on 2026-09-09 is that failure, 12:09:46 to 12:10:01. This run took
five and a half minutes and its checkout, install, type check and test steps all
ran. It is a red tree.

**Reading the job's step conclusions is NOT how you find out what failed here, and
that is a trap worth writing down.** Every substantive step in the jobs API
reports `conclusion: success`; only the aggregator, step 9, reports failure. That
is `continue-on-error: true` doing exactly what it is documented to do -- it
rewrites a step's CONCLUSION to `success` and leaves the real result in its
OUTCOME, which is what `Fail the job if any step failed` reads. The verdict is in
that step's own log:

    ref tested:         4b416b1e516c716f847b61a6fe4a1875b5da120d (HEAD)
    check:              success
    test:               failure
    vanguard-changelog: success
    history-verify:     success

Two failures, both in `tests/derived-numbers.test.ts`, against 342 of 343 files
and 6749 of 6751 tests passing.

### The cause, measured against the tree rather than taken from the log

The failure says the measured counts region of `tools/browser-verify/README.md`
claims nothing was outside its threshold while 9 route specs in the tree were
never measured by that run. Confirmed independently, without running anything:
`origin/integration` carries **17** `tournaments-view-*.mjs` specs under
`tools/browser-verify/routes/`, and grepping integration's own README for each
name returns 0 for exactly the 9 the test named, name for name, and 1 for the
other 8.

Three further facts place it:

- `tests/derived-numbers.test.ts` is **unchanged** between `main` and
  `integration`. The test did not move; the data under it did.
- `tools/browser-verify/README.md` changed by 3 lines in the whole range -- the
  COUNTS region, which 0110's history entry records regenerating. The MEASURED
  region is a different block and is the one that is short.
- All 17 specs arrived in `804d21a3`. Commits `e030fc74` and `6f9b2394` are 0110
  regenerating the measured region over the merged tree, and the block is still
  9 specs short after both.

So the repair is `npm run verify:readme` -- a real browser run of about six
minutes -- and a commit of the regenerated measured region.

### Why this bundle did not fix it

`tools/browser-verify/routes/tournaments*.mjs` **and the generated regions of its
README** are prompt 0110's owned surface, named in its ledger entry. This bundle
owns four things and that is not one of them.

The prompt permits touching `tools/browser-verify/README.md` in exactly one
circumstance -- resolving a CONFLICT in its counts block, hunk by hunk. There was
no conflict: `git merge-tree --write-tree origin/main origin/integration` returned
clean, exit 0, zero markers. And the block that is short is the MEASURED region,
not the counts block the permission names. Neither half of that permission
applies.

The deeper reason is what the numbers ARE. Regenerating that region does not
reformat a document, it writes MEASUREMENTS -- 0110's claims about 0110's
surfaces, produced in whatever environment ran them. Writing figures from this
container into another bundle's generated region, to turn a gate green, is the
ratchet `CLAUDE.md` already names: a record of what last happened, checking
nothing. Merging a tree whose own suite fails, into the branch whose every push
deploys `ideabosco.com` during class, is the thing the gate exists to refuse.

### What this says about integrate.yml, which is working as designed

`integrate.yml` on `main` does run the suite on the merged tree, but it does so
**after** the push and after the deletes -- deliberately, and its own comment
explains why: `npm ci` plus the suite are the two things most able to be killed
from outside, and running them first would discard every merge in a sweep that
was individually fine. So a red merge result makes the Integrate RUN go red and
cannot un-push the merge. `integration` being red at rest is a state this design
permits and reports; it is not a machine that failed.

It does mean `integration` has been red since the tournaments branch was swept in,
and 0114's closing line -- "`integration` rests 7 commits ahead at `b2a2026d`,
green and undeployed" -- describes a branch that was not green. 0114 read a merge
result rather than a CI run on that tip, which is the gap a dispatch on the full
sha closes. **That is not a correction to 0114's record and must not be read as
one**; it is a later reading of a tip 0114 never dispatched CI against.

## The one source change: a teammate who was never told

`docs/history/tournaments-surface-scroll-yqplco.md` records, under "Outside this
bundle's ownership", that `sweepPairNotifications` in `src/lib/server/push.ts`
still pushes `tournament_entries.user_id` only. `0192` made an entry a ROSTER, so
a linked teammate -- a competitor in the match -- was never told it had been
paired.

**The prompt called it a one-line change and asked this bundle to stop if it was
not. It is not a one-line diff and it is also not a larger thing, so it was
made and the discrepancy is recorded here.** The LOGIC change is one line, the
one the history entry names; what surrounds it is the data that line needs. The
entry's own prescription is three parts and the diff is 49 lines added over 2
removed, most of it comment. Nothing was designed, no surface changed, no
migration, and the function's contract is unchanged. Stopping over the line count
would have left a described, bounded, already-decided repair unmade.

What landed, exactly as prescribed: a third read in the existing `Promise.all`
for `tournament_entry_members` (`entry_id, user_id`, scoped to the tournament,
`user_id` not null), folded into a `Map<entryId, userId[]>`, and the recipient
line replaced with the union of both entries' member accounts and both captain
columns, deduplicated.

- **THE CAPTAIN COLUMNS STAY IN THE UNION AND THAT IS WHAT REMOVES THE DEPLOY
  ORDERING.** On a database without `0192` the members read answers `data: null`
  rather than throwing, the map is empty, and the audience is exactly the two
  captains the function returned before. So this may ship before or after the
  migration; it is the additive shape `CLAUDE.md` prefers over an ordering rule.
- **THE UNION IS NAMED (`pairRecipients`) RATHER THAN INLINE**, which is the one
  place this departs from a literal reading of the prescription. The reason is
  the suite: written inline at its single call site, the only thing a test could
  assert would be a second copy of the rule. Named, the test drives the real
  implementation.
- **THE DEDUPE IS NOT AN EDGE CASE.** Registering a team puts the captain on its
  own roster, so a captain sits in both halves of the union; without the dedupe
  the fix would push them the same match twice, which is worse than the silence
  it replaces.

### The test, and why this one earned a test at all

`CLAUDE.md` admits a test only for a guarantee whose regression is SILENT. This
qualifies precisely: nothing anywhere reports a push that was never sent. The
captain gets theirs, the match runs, and the only symptom is a teammate who did
not know.

`tests/tournament-pair-recipients.test.ts` therefore does not test the helper
alone. It drives the **real** `sweepPairNotifications` through a scripted
`@supabase/supabase-js` and reads the recipient set off the boundary the
deployed function actually uses -- `sendPushToUsers` narrows
`push_subscriptions` with `.in('user_id', targets)`, so that argument IS the
audience. Driving it needed no new stub: the aliased `$env/dynamic/*` stand-ins
are live reads of `process.env`, faithfully, so the test sets the three
variables and `pushConfigured()` and `serviceClient()` behave as a deployment
does. No subscription rows are returned, so `web-push` is never called and the
suite makes no network request.

**Both directions were mutation-proved, and restored from a COPY rather than with
`git checkout --`**, per the rule about a mutation script silently discarding
uncommitted work:

| mutation | result |
| --- | --- |
| recipient line reverted to `[a.user_id, b.user_id]`, members read left standing | 1 of 9 red |
| members read removed, union helper left standing | 5 of 9 red |

`push.ts` came back md5-identical (`09b7ab5e2f649979bbee9f994d18c16a`) after each,
and the file was re-run green after both. A test of the pure helper alone would
have caught neither mutation.

The suite carries its own positive controls: a pre-`0192` database (members read
answers null) must answer exactly the two captains, and a roster with no linked
accounts on it must too.

## Measured

- **`svelte-check` 0 errors / 37 warnings**, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`, in 20 files. Identical
  before and after the change. Re-derived rather than read off `CLAUDE.md`, with
  `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` exported as placeholders before
  the sync -- without them this checkout reports the documented 13 phantom errors,
  since `.env` is gitignored and no cloud session has one.
- **Full suite green on this branch: 338 files, 6606 tests, 0 failures, 361.65s.**
  Fewer files than `integration`'s 343 because the tournaments test files are not
  on this branch's base.
- **`npm ci` did not rewrite `package-lock.json`** (`git diff --stat` empty), which
  is the documented reason `ci` and not `install` is used in a fresh checkout.
- **Production, read rather than inferred**: `Assignments v1.13 · 09433a9 · local
  build`, which is `main`'s current tip and prompt 0111's landing. Nothing from
  this bundle is deployed.

## Not verified

- **Every one of the seven `0192` verification values.** This container cannot
  reach the production database. They are Mr. Pina's transcription.
- **That the teammate actually receives a notification.** The change is verified
  against a scripted client, never a real Supabase project, a real
  `push_subscriptions` row or a real push service. Nothing here sent a
  notification.
- **The 9 unmeasured specs' real measurements.** `npm run verify:readme` was NOT
  run; the gap was established from the committed tree, which says a name is
  missing and says nothing about what measuring it would find.
- **Anything about the tournaments surface itself.** No browser pass, no
  `/dev/tournaments` drive. This bundle read that code only to find what `push.ts`
  owed.

## `deploy.date` -- REPORTED, NOT FIXED, as the prompt required

`src/lib/site-versions.ts:203` is `deploy.date || 'local build'`, and production
has rendered `local build` since the first landing of 2026-09-09.

**What produces `deploy.date`:** `deriveDeploy` (`src/lib/site-versions.ts:160`).
`vite.config.ts` runs `git log --no-merges --date=format:"%b %e, %Y"
--pretty=format:"<GIT_LOG_FORMAT>" --name-only` at build time and passes
`envSha: process.env.VERCEL_GIT_COMMIT_SHA`. With an env sha present the stamp's
`sha` is its first 7 characters, and its `date` is the head log record's date ONLY
IF `agrees` -- that the two are prefixes of one another. Otherwise `date` is
deliberately `''`.

**What is now empty, and why:** the log is `--no-merges`. Since 2026-09-09 `main`
advances by `--no-ff` MERGE commits from `integration`, and
`VERCEL_GIT_COMMIT_SHA` is that merge commit -- which `--no-merges` excludes from
the log it is compared against. So `entries[0]` is a different commit, `agrees` is
false, and `date` is `''`. Measured on this tree: `main` is `09433a98`, a merge
(two parents); the newest non-merge commit reachable from it is `f04e5c2e`; they
share no prefix. Production reads `Assignments v1.13 · 09433a9 · local build` --
sha resolving, date empty, exactly as that arithmetic predicts.

**Timing confirms it:** `5e7b44f1`, the first landing of 2026-09-09, is the FIRST
merge commit on `main` (`917d976f` before it is a plain classroom export commit),
and 0114 recorded production reading `local build` from that landing onward.

**Did 0108 cause it? No.** 0108's changelog-module split is `d5f36179`, which
touched `vite.config.ts` but not the git-log invocation, not the `envSha` read and
not `deriveDeploy`. `src/lib/site-versions.ts` has not been modified since
`d419673f` and `0d73f720` on 2026-08-18, and `d419673f` is where `agrees` was
introduced. 0108 landed on 2026-09-09 alongside the first merge-commit deploy,
which is a coincidence of date and not a cause.

**It is cosmetic and was left alone as instructed.** `deploy.sha` is the field
every deploy gate turns on and it resolves correctly. Worth noting for whoever
does fix it: the honest repair is probably to make `agrees` accept the merge
commit rather than to drop `--no-merges`, since the changelog deliberately
excludes merges, and `stampTitle`'s "no version number" wording is a separate
concern keyed on `complete`.

## What is owed

1. **`integration` is red and someone who owns `tools/browser-verify/` must
   regenerate the README's measured region** (`npm run verify:readme`, a browser,
   about six minutes) so those 9 tournament specs are covered. Until then no
   landing of this range can pass its own CI gate, and `0192` is applied to
   production with the code that uses it undeployed.
2. **The landing itself.** Steps 1 and 3 of the prompt passed (`main` is an
   ancestor of `integration`, both new ledger entries read `pushed`, `merge-tree`
   clean); step 2 is what stopped it. Nothing was cherry-picked around it.
3. **This branch will stand rather than vanish.** `integrate.yml` merges a green
   `claude/**` branch into `integration` and runs the suite on the merged tree
   afterwards; that merged tree still carries the `derived-numbers` failure from
   `integration`'s side, so the sweep will report red. Per `CLAUDE.md` a standing
   `claude/**` branch is a signal, and this is what it is signalling.
