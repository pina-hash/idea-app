---
title: Decision 05 reversed, decision 07 answered public, and the caller-scoped play read
date: 2026-09-12
branches: ["claude/busy-newton-trto6y"]
migrations: ["0204"]
subsystems: ["foundry"]
---

Prompt 0177. Mr. Pina answered three things on 2026-09-12 and all three are in
`0204`: a description is no longer required to publish or submit a Foundry app
(decision 05, REVERSING work already shipped), all THREE owner-only play metrics
go public (decision 07), and the n=1 case that widening creates is accepted
explicitly. The bundle also closes a `service_role` grant `0139` said it had
closed and had not. It is the follow-up ledger 0176 stopped short of for want of
an allocated migration number.

## The number, confirmed three ways before it was claimed

Ledger 0174 quoted `0204` in prose and then released it unused, which is a state
worth distrusting: a number named in a file is exactly what
`tools/migration-claims.mjs` reads as a live claim, and 0174's own notes record
that having the spelling on the `Migration permitted` line held the number until
it was moved down into the body. So the release was confirmed rather than taken
on its word. `node tools/migration-claims.mjs` reports `highest landed 0203`,
`next free 0204`, with `0204` absent from CLAIMED-NOT-LANDED (which holds only
`0190` and `0191`) and from the holes list. A `git ls-tree` scan of all 55 remote
and local refs for `supabase/migrations/0204*` returns **zero** hits, and both
`origin/main` and `origin/integration` top out at
`0203_sequence_anon_grant_sweep.sql`.

The duplicate check itself: `git log --oneline origin/main..origin/integration`
showed five subjects, all ledger 0174 and its merge, none touching Foundry; a
`git ls-tree` of all 55 refs for a `0177-*` ledger entry found none anywhere; and
the claims tool above. Ledger 0175, which owns the Foundry card and gallery
components, is `Status: issued` on `claude/serene-noether-d9iapn` and is NOT
contained in `origin/integration` -- so there was nothing to merge in, and its
surface was untouched by construction rather than by care. `git status` at the
end confirms it: neither `FoundryGallery.svelte` nor `FoundryDetail.svelte` nor
anything under `tools/browser-verify/` is in the diff.

## The three measurements, re-taken

0173 read the file rather than production and this container cannot ask
production either, so all three sites were re-measured against the file:

* `0173_foundry_section_gate_description_and_trust.sql` **line 283**, the
  publication trigger.
* the same file **line 498**, inside `foundry_submit_version` -- so a student
  could not SUBMIT FOR REVIEW without a description. This is the half that
  actually hurt, because decision 05 asked about PUBLISHING and the gate had
  reached the submit.
* `src/lib/foundry/surface.ts` **lines 129-142**, `foundryPublishBlockers`.

All three were exactly where 0173 said. Ledger 0176's telemetry reading was
confirmed too: `student_app_plays` answers `anon` false and `authenticated`
false with RLS on and no policy, and none of the four functions is
caller-scoped.

## Both replacements are diffs against the source, and that is shown rather than asserted

`CLAUDE.md` says to diff a re-signed function against its source. Both were
extracted mechanically and compared:

* **The publication trigger comes out BYTE-IDENTICAL to `0130`'s.** `0173`'s body
  is `0130`'s plus three things -- the `v_moved` declaration, its assignment and
  the raise -- so removing them is a return rather than a rewrite. `diff` of the
  two extracted bodies is empty. `v_moved` went with the gate because it had
  exactly one reader.
* **`foundry_submit_version` is `0173`'s line for line** apart from the four-line
  description block and one stale comment clause ("re-checks the description and
  the ownership" to "re-checks the ownership"). Nothing else. **Decision 06's
  trusted-publisher arm therefore rides through untouched**, which is the thing
  most likely to be lost here: re-signing from `0130` would look right, compile,
  and silently delete auto-publish for trusted students.

## Decision 07: the gate becomes the population, not the owner

`foundry_app_play_stats` now asks
`_foundry_app_in_population(owner, hidden_at, published_version_id, true, true)`
-- the same predicate `foundry_play_counts` and `student_apps`' own select policy
already use, with both widening flags gated on `is_admin()` inside the function.
That is the smallest change that answers the decision while keeping every other
refusal: a published app answers any signed-in caller (the widening), an
unpublished one still answers its author alone, a hidden one still an admin
alone, and an app outside the population answers identically to one that does
not exist, so an id still cannot be probed.

**There are THREE metrics and the decision's title says two.** `plays` was never
owner-only -- `foundry_play_counts` has answered it since `0139`. The owner-only
set is `players`, `seconds_played`, `last_played_at`, and widening two of three
would pass any assertion phrased over the returned object as a whole, because the
object carries all four keys either way. The test names each separately.

`foundry_my_play_stats(p_app_id uuid)` is the caller-scoped read, and **it takes
no identity parameter** -- there is no call anybody can write that names another
player, so the boundary is a property of the signature rather than a check. It
gates on the same population, so a hidden app hides the player's own history with
it; that is deliberate and consistent, and staff un-hiding restores it. It
returns no `players` column, which for one caller would be a restatement of the
question.

## The n=1 case, accepted rather than guarded

On an app one person has played, the public aggregate IS that person's figure:
"1 player, last played 3:47pm" says when that student played. Ledger 0176 raised
it precisely and Mr. Pina was asked precisely it and said it is fine. **No
threshold, floor, minimum player count or rounding scheme was added**, and
`docs/decisions/entries/07-*` now carries the acceptance in a paragraph written
to stop the next session re-raising it as a finding.

## `service_role` held SELECT on `student_app_plays`, and it is closed

Ledger 0176 reported it; it holds. `0139`'s comment says `service_role` "gets
nothing either, and that is deliberate", and its table revoke then names
`anon, authenticated` and stops -- while all five of its FUNCTION revokes in the
same file name `service_role` too. So the role held SELECT from `0139` until now.
`0204` revokes naming all four roles.

**The reason nothing reported it for that whole period is the more useful
finding.** `tests/foundry-telemetry.test.ts` asserted the table answers nobody
and checked the two CLIENT roles only -- the same blind spot in the test as in
the migration, so the test could never have caught the bug it was adjacent to.
Both are widened, and the test now also reads the ACL for the table generically
rather than asking about three names somebody remembered to list.

Nothing in `src/` breaks: all four telemetry call sites go through the caller's
own Supabase client, and `SUPABASE_SERVICE_ROLE_KEY`'s five readers do not touch
this table.

## What was proven, and how

**The description half is a PAIRED MEASUREMENT across two chains**, because a
test asserting a blank description publishes passes identically on a database
where the gate was never written. `tests/db/foundry-publish-description-optional.test.ts`
boots the chain stopping at `0173`, where both gates FIRE and are pinned by
0173's own sentences, then the same chain with `0204` over it, where both are
gone -- across three emptiness cases (null, empty string, newlines and tabs, the
last being the one a length check would let through). It also asserts the
publication checks that are NOT decision 05 survive, and that decision 06 still
works behaviourally rather than only textually.

**Mutation proof, restored from a `cp` copy and md5-verified, never from git.**
Four mutants, each in the permissive direction:

| mutant | result |
| --- | --- |
| `foundry_my_play_stats` loses `and pl.player = v_uid` | 1 test fails: Bob asks for his own 1200s and gets the 1245s aggregate |
| the aggregate's population gate made `if false` | 1 test fails: the peer/draft/hidden refusals |
| `service_role` left holding SELECT | 1 test fails: the grant sweep |
| HALF a restoration -- submit opens, trigger still refuses | 6 of 8 fail; the 2 that pass are the BEFORE-chain controls, correctly |

The first two had to be run TWICE. On the first attempt `0204`'s own self-check
raised and the file refused to apply, so the whole suite failed to boot and 26
tests reported as *skipped* -- which is defence in depth working, and is also a
mutation proof that proves nothing about the tests. Softening the matching
self-check so the assertions are the detector is what turned each into a real
measurement. **A mutant caught by the migration's own guard is not evidence the
test suite would catch it.**

The leak mutant is worth keeping in mind for its shape: the fixture gives two
players deliberately DIFFERENT durations (1200s and 45s), so a leak surfaces as a
WRONG NUMBER rather than as an extra field. A fixture with equal durations would
have passed.

## The paste trap: zero, two ways, against three planted controls

A dollar-quote token inside a `--` comment balances in Postgres and breaks the
Supabase editor's client-side statement splitter. Over `0204`: **193 commented
lines carry ZERO `$` characters of any kind**, and all **10** dollar-quote tokens
are on code lines in **5 balanced pairs**.

Checked against planted positive controls rather than reported as a bare zero: a
copy with `-- ... a $tag$ token inside a comment` reports 1 and fails; a copy
with a bare double-dollar in a comment reports 1 and fails; a copy with an
orphaned token on a code line reports the unbalanced stack and fails. The real
file reads CLEAN on both ways.

## The client half, and the part that is deliberately NOT here

`foundryPublishBlockers` and `foundryCanSubmit` are **deleted rather than left
returning an empty list**: a predicate that can only answer one way is a dormant
second idea of "is this ready", and `CLAUDE.md` is explicit that a retired path is
removed. `draftIsSubmittable` is now the whole predicate and is still read by the
control and the handler alike. `.fdy-hint-block` went with the branch it styled,
because a scoped rule nothing selects is reported as an unused selector and would
have moved the project's warning baseline.

**No surface renders another app's play stats yet, and that is a boundary rather
than an omission.** `FoundryPlayStats` is mounted in exactly two places --
`FoundryInspector` (the admin review queue) and `FoundryMine` (a student's own
shelf) -- and the gallery route hands down no `playStats` transport at all. The
surface where a student would see the stats of an app they PLAYED is
`FoundryDetail`, the gallery detail view, which ledger 0175 owns and which is
still in flight. So `0204` opens the door at the database, where the decision
actually lives, and the rendering is the next bundle's. Wiring a transport with
no consumer would have been the dormant path the same paragraph above refuses.

**A thumbnail was not made a gate.** The answer names one, but nothing in the
schema requires a cover: across all 202 migration files `cover_path` appears in
two places that could be a gate and neither is one -- `0130`'s
`check (cover_path is null or ...)`, which constrains a path's shape and admits
null, and `0136`'s delete sweep. Adding one is a narrowing outside this bundle's
grant and needs its own file with its own count of the apps already published
without one.

## Measured

* **Full suite: 407 files, 7848 tests, 0 failures, 409.72s.** Against ledger
  0176's 405/7819, the delta reconciles exactly: +1 file and +14 tests from
  ledger 0174's `coin-ledger-policy.test.ts`, which landed on `integration` in
  between, and +1 file and +15 tests from this bundle (`foundry-telemetry` 19 to
  26, plus 8 in the new description file).
* **`svelte-check`: 0 errors, 38 warnings in 21 files** at 32
  `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class` -- identical to the branch point, which was
  re-derived in a clean `git worktree` at `origin/integration` `8241494` rather
  than trusted from this tree or from another lane's report. **`CLAUDE.md` said
  40 in 22 and is corrected in place to 38 in 21**; the warning that moved is
  `state_referenced_locally`, 34 to 32. This is the fourth drift of that figure
  and the first DOWNWARD one, which is the direction that matters more: a
  baseline that is too high is a budget a session can spend without noticing.
* **Browser: 4 route/width runs, 28 measurements, 0 outside threshold** on
  `/dev/foundry-forge` and `/dev/foundry-submit` at 375px and 1440px, the two
  specs that drive `FoundryMine`. 0 console errors. Chromium 141.0.7390.37.
* `node tools/claude-md-check.mjs` clean after the `CLAUDE.md` edits.

## NOT verified, stated rather than left silent

* **Nothing was applied to production and nothing could have been.**
  `IDEA_MIGRATION_URL` and `SUPABASE_SERVICE_ROLE_KEY` are unset and the local
  `.env` is the placeholder ref, so `0204` is a file awaiting a hand paste. Every
  measurement above is against the embedded Postgres fixture with the real
  migration files applied unmodified.
* **The three sites were re-measured against the FILE, not against the deployed
  database**, for the same reason. If production has drifted from
  `supabase/migrations/`, this bundle cannot see it.
* **`npm run verify:readme` was NOT run**, deliberately. It rewrites the measured
  files under `tools/browser-verify/routes/` and the generated README regions,
  both of which ledger 0175 owns and is still working in. The targeted
  `run.mjs --route` pass above measures the same surfaces and writes nothing.
* No signed-in production surface was opened; there is no Bosco Tech session
  here.

## Deferred

* **Rendering the public stats** on the gallery detail view, which is 0175's
  surface (above).
* **A thumbnail requirement**, if Mr. Pina wants the "name, thumbnail and app"
  sentence enforced rather than merely described (above).
* `foundry_my_play_stats` has no caller in `src/` for the same ownership reason,
  so the RPC ships ahead of its surface. That is the safe order: a gate that
  accepts a shape nothing produces is inert, and the reverse is not.
