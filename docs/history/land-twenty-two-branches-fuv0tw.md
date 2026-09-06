---
title: "Twenty-four finished branches landed on main in one deploy, and the two the tree would not take (`claude/land-twenty-two-branches-fuv0tw`)"
date: 2026-09-06
branches: [claude/land-twenty-two-branches-fuv0tw]
migrations: []
subsystems: ["Operations", "Browser harness"]
---

Prompt 0085. No migration written and none applied. An operations bundle: it
authors no source code, and every file it changed beyond a conflict seam was
written by a generator the bundle was told to run.

## What this was

Twenty-four `claude/**` branches stood unmerged at issue. Mr. Pina asked for them
on `main`. Every push to `main` deploys `ideabosco.com` during class, so twenty-two
pushes would have been twenty-two deploys with nobody watching. This merged them
locally, proved the merged tree, and pushed once: `eec8151..5b3e14b`, 82 commits,
fast-forward, no force.

## The starting picture was already stale, in the bundle's favour

`origin/main` moved from `336e82f` to `eec8151` during the opening fetch. Eight of
the twenty-four branches were already ancestors of it: `frc-quiz-bias-10avj9`,
`full-auto-migration-deploy-w9w48f`, `gauntlet-doc-audit-4o4r7n`,
`gauntlet-run-events-zspf1y`, `guard-outside-database-0uczmi`,
`student-submission-boundary-4nke2j`, `submission-bytes-deletable-r66zwt`,
`vanguard-board-paging-sjx6uv`. Containment was read with
`git merge-base --is-ancestor` throughout and never with
`git branch -r --contains | grep`, which matches
`claude/four-red-integration-tests-62a7ba` on its own name.

## The ledger gate, and the two it caught turning green mid-run

At the gate, `claude-md-truth-izb551` (0083) and `number-allocation-ledger-c30ms5`
(0084) each carried a single commit -- their opening ledger reservation, `Status:
issued`, and no work. Both were correctly excluded.

Both sessions then FINISHED while this bundle was proving its tree: 0083 flipped to
`pushed` at 09:25 UTC and 0084 at 09:29, against a gate read at 09:12. A gate is a
snapshot and the world is not, which is worth writing down: the useful response was
not to re-run the gate in a loop but to re-test the cheap ones once, at the end,
against an already-proven tree.

`tournament-bracket-surface-jf28qc` also gained a commit at 09:11 after being
merged, which would have left a partially-landed branch nobody could delete. Its
extra commit was its own history entry, so it was merged again at the end and the
branch is now fully contained.

## The two-branch red, which is the thing this bundle existed to catch

The full suite on the merged tree was red at one assertion:
`tests/classroom-nav-doors.test.ts`, "no tab names it while no page answers it".
Neither parent was red. Prompt 0081 had written a deliberate bidirectional tripwire:
`/classroom/[sectionId]/duplicates` was on 0074's unmerged branch, so 0081 refused
to ship a tab that would 404, and asserted the pairing in BOTH directions so
whichever half landed first would be a red test rather than a silent 404 or a
silent orphan. Merging 0074 and 0081 together landed the page without the tab and
the tripwire fired exactly as designed.

Walked back per the bundle's own instruction, one file at a time:

| merge | page present | test present | result |
| --- | --- | --- | --- |
| `5ed17b0` duplicate-drafts-production | no | no | green |
| `26e5fc9` duplicate-drafts-count (0074) | YES | no | green |
| `4200630` classroom-nav-surfaces (0081) | YES | YES | **red** |

The bundle forbids repairing anything it merges, and the remedy 0081 documents is
six edits it did not write (`nav.ts` gains `'duplicates'` in the union, a list
entry, a `ClassroomPlace`, a `locateClassroom` branch, an `activeTab` case and a
`classroomCrumbs` case). So one of the pair had to be held back.

## Which half to drop was decided by a second test, not by preference

The first attempt dropped 0074. That was wrong, and a test said so:
`tests/db/migration-0177-tombstone.test.ts` asserts the migration series is a
contiguous prefix. 0074 owns `0187`; `maps-media-bucket-he0wnn` owns `0186`,
`instructor-requests-surfaces-j2dfjc` owns `0188` and
`tournament-thumbs-listing-psuleu` owns `0189`. Dropping `0187` puts a hole at 0187
and takes `0188` and `0189` down with it -- three branches held back, and two of
the three are storage-listing and feedback-policy migrations.

Dropping 0081 instead costs one branch and lands all four migrations contiguously.
It also leaves the tree in the state 0081 was written and measured against: no
duplicates tab, the page reachable by the typed URL it was always reachable by. No
404 is created, because a 404 needs a tab pointing at a missing page, which is the
opposite case. `classroom-nav-tabs-5.mjs` measures its five-tab wrapping against a
LOCAL harness fixture and says so in its own header, so it did not depend on the
real page either.

**`claude/classroom-nav-surfaces-v958ub` is therefore still standing, green, and
should land together with the six-edit `nav.ts` patch its own comment specifies.**
It also holds three other doors -- a `/dashboard` GREENLINE card and the check-ins
tab -- which are held back with it.

## Conflicts, and the three rules that were allowed to resolve them

Nine merges conflicted. Every one fell inside the permitted set; a resolver script
refused anything else by path and would have aborted that merge.

- `tools/browser-verify/README.md`, seven times, always inside the
  `counts:measured` region. Resolved hunk-by-hunk taking the merged branch's side,
  never by taking the whole file: by the fourth merge the file also carried clean
  static-count changes from earlier merges, and a whole-file checkout would have
  silently discarded them. The region was regenerated at the end regardless, so
  which side won intermediately decides nothing.
- `classroom-updates.json`, four times. The conflict lands INSIDE one entry object,
  because two entries share their trailing `tags` lines, so "accept both" yields one
  object with two titles and duplicate keys where the last silently wins. Resolved
  by rebuilding from the three merge stages: take ours, append the entries theirs
  adds that the base lacks. The file is exactly
  `JSON.stringify(x, null, '\t') + '\n'` -- verified by byte-identical round-trip
  before writing -- so the rebuild has zero formatting churn, and the only diff
  against ours each time was the added entry. Count asserted equal to the sum and
  keys asserted unique on every one.
- `supabase/migrations/0185_bucket_limits_under_the_global.sql` never conflicted in
  the end. `upload-limit-fiction-jv9w43` was already an ancestor of
  `database-migration-probe-dnxvth`, which the ledger says was started from it, so
  it arrived pre-reconciled at merge three and `0185` on the merged tree is
  byte-identical to `main`'s -- which is the outcome the rule asked for anyway.

`number-allocation-ledger-c30ms5` (0084) conflicted on
`docs/standards/IDEA_instructions.md` and `docs/standards/REGISTER.md`, which are
outside the permitted set. That merge was aborted and the branch left unmerged,
exactly as instructed. It is standing and green.

## Measured

Baseline on `origin/main` at `eec8151`, before any merge: **4 failed / 5923 passed
over 290 files.** Two `gauntlet-doc` assertions (0184 had no row in
`docs/GAUNTLET.md`) and two `derived-numbers` assertions (nine specs the measured
counts region had never measured). The bundle predicted the first pair only; the
second pair is recorded here because a baseline you did not take is a baseline you
cannot subtract.

Final on the pushed tree, 2026-09-06 03:15 to 03:20 America/Los_Angeles:
**308 files, 6248 tests, 0 failures.** All four inherited failures cleared -- the
`gauntlet-doc` pair by `four-red-integration-tests-62a7ba`, the `derived-numbers`
pair by the measured-region regeneration below.

`npm run check`: **0 errors, 37 warnings**, breakdown 31 `state_referenced_locally`
/ 5 `css_unused_selector` / 1 `perf_avoid_nested_class`, over 3046 files. The
documented baseline exactly, re-derived rather than trusted.

`npm run verify:counts` ran between every merge; the static region was rewritten
six times as specs accumulated, each as its own commit. `npm run verify:readme` ran
once on the clean merged tree with port 5199 confirmed bindable first (the server
silently reuses an already-running one): **262 route/width runs, 3932 measurements,
2 outside threshold, 628.2s, on `3a24d23`**, `dirty: false`, self-test 70 controls
/ 36 negative / 34 positive / 0 failures. `covered` is **131 of the 131 specs in
the tree**, nothing uncovered and nothing covered that is not in the tree. The two
outside threshold are the two known `/dev/notebook` tap-reach decisions carried
with the owner.

Three browser passes were run in total, one per candidate tree, rather than
carrying a measurement across a tree it was not taken on -- the region records the
sha it measured, and a sha not in `main`'s history would be a lie in the one place
whose whole job is to say what was actually measured.

## Not verified

No migration was applied and nothing reached the live Supabase project or
production. `0186`, `0187`, `0188` and `0189` are on `main` as files and unapplied
in the database; until `0188` lands, the Spam control on the feedback console
raises on every press. Nothing was checked in a signed-in browser or on a Vercel
preview. The browser harness covers `/dev` routes only, blocks every non-loopback
request (so text is measured in the fallback stack, not the web fonts) and runs
with `prefers-reduced-motion: no-preference`, so that path is unexercised.

## Left undone

Branch deletion. `git push --delete` is refused by this container's agent proxy
with HTTP 403 -- masked by git reporting "Everything up-to-date" over the failed
RPC, which is worth knowing because it reads as success -- and the GitHub MCP
server exposes no delete-ref operation. All twenty-two contained branches were left
standing. `.github/workflows/integrate.yml` deletes a green `claude/**` branch
whose commits `origin/main` already contains and reports it under "Already
contained, deleted", so they are reaped without anyone doing anything.

Still standing and deliberately not merged: `claude/classroom-nav-surfaces-v958ub`
(needs the `nav.ts` tab patch) and `claude/number-allocation-ledger-c30ms5` (needs
a `docs/standards/` conflict resolved by someone entitled to resolve it).
