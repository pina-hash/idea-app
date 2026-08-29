---
title: "GAUNTLET: an explicit AUTHOR tier (`gauntlet_authors`) that grants authoring, publishing and room hosting without granting admin, and a refusal that says so (`claude/gauntlet-authoring-allowlist-xui3ps`, migration 0155)"
date: 2026-08-29
branches: [claude/gauntlet-authoring-allowlist-xui3ps]
migrations: ["0155"]
subsystems: ["GAUNTLET", "Admin"]
---

**Starting state, checked before doing anything.** `git fetch origin` at session
start: `HEAD` and `origin/main` both at `2113f4d`, `origin/integration` ahead at
`8ff30f2`. `git log --oneline origin/main..origin/integration` listed 50
commits; none of them touches GAUNTLET authoring gates, `app_admins`, or the
author/rooms routes, so the work was not already done. Branched from
`origin/integration`. Working directory `/home/user/idea-app`. The highest
migration on `integration` is `0154_gauntlet_rank_what_is_checkable.sql`, so
`0155` is the correct next number.

## Why 0067 narrowed `is_teacher()`, and what that constrains

The task asked whether `0067_admin_tier.sql` records a reason. **It does, in
detail, and the reason is about BREADTH rather than about GAUNTLET.** Its header
names what every `@boscotech.edu` address inherited the moment it first signed
in: the ability to change anybody's role (including granting that power onward),
the FSP/FRC interest roster (student names, emails, phone numbers, parent
emails), the IDEA Coin entry tool, every student's graded work, moderation of
other people's content, and permanent deletion. "That is administrator access
handed out by email domain."

It also records why the fix was so blunt: migrations here are an immutable
applied record, ~90 policies already named `is_teacher()`, and Postgres resolves
a function by name at call time, so **redefining that one body was the only
instrument that could re-gate all of them atomically with no chance of missing
one.** GAUNTLET authoring was collateral, not a target. Nothing in 0067 says a
teacher must not author a challenge.

So this bundle is not re-widening an unrecorded decision -- but the recorded
reason is what CONSTRAINS it. The tier below may not reach a single item on that
list, and section 5 of the migration is the census that says so gate by gate.

## The shape: an allowlist, and what was mirrored from `app_admins`

The decision was handed down and is not relitigated here: an explicit allowlist,
never a predicate that infers authoring from teaching a section. The two reasons
are written into the migration's own header so they travel with it -- the
narrowing was deliberate, so inference would silently undo it for a population
nobody enumerated; and an inferred predicate hands the capability to every
teacher of record the moment a roster import runs, which is a capability
arriving as a side effect of unrelated data.

**Mirrored from `app_admins` deliberately, rather than invented:** identity is
the lowercased email with the same `email = lower(btrim(email)) and email like
'%@%'` CHECK (so an account can be authorized before it has ever signed in);
the same `granted_by` / `granted_at` / `note`-capped-at-200 columns; SECURITY
DEFINER with `set search_path = ''` on every function, which is 0067 section 3's
reason for why the predicate can appear inside the roster table's own policy
without recursing; the roster readable by admins ONLY and writable by no client
at all (it carries staff emails, which is `app_admins`' own stated reason);
grant/revoke/list as three RPCs shaped like `admin_grant` / `admin_revoke` /
`admin_list`, with the same `@boscotech.edu` restriction, the same
`lower(btrim())` normalization and the same `on conflict do update` idempotence;
and `gauntlet_can_author()` granted to `authenticated` exactly as `is_admin()`
is. The predicate is caller-scoped only -- there is deliberately no email-scoped
`_gauntlet_author_is_email` twin of 0138's `_admin_is_email`, because 0138's own
rule is to ask the email-scoped form only about a THIRD PARTY and nothing here
asks about one.

**Two deliberate deviations, both narrowings or neutral, both argued in the
file.** No owner column, flag, pinned constant or single-owner index: the owner
concept exists so the site cannot lock itself out of ADMIN, and this tier cannot
lock anyone out of anything -- it is a strict subset of what an admin already
holds, an empty roster degrades to exactly the world 0067 left behind. And
grant/revoke are ADMIN-gated rather than owner-gated: `admin_grant` is
owner-only because granting admin grants the power to grant admin onward, an
escalation an admin must not perform; authoring does not propagate, and every
capability in the tier is one the granting admin already holds, so owner-only
would buy no containment and would make one person the only route to a routine
staffing decision.

**`gauntlet_can_author()` folds `is_admin()` in, and that is what makes every
re-gate a pure WIDENING.** Each of the eleven sites replaces `is_teacher()`
(which since 0067 IS the admin check) with the new predicate, which returns true
for every caller `is_admin()` does -- so an admin cannot lose a gate, and nobody
had to write `is_admin() or ...` at eleven call sites and get it right eleven
times.

## The census: eleven gates opened, and every one left shut, with the reason

**OPEN.** 0004's `read published challenges` (without it an author's list has no
drafts and the edit form cannot load its row -- this widens WHICH ROWS, never
which columns; the `answer` stays behind 0004's column grant); 0009's
`gauntlet_author_get` / `_upsert` / `_set_status`; `gauntlet_author_delete` **from
0019, not 0009** (0009's body loses the demo hard-delete branch); 0022's three
`gauntlet_series` policies and `gauntlet_series_assign`; 0009's two `gauntlet`
bucket write policies and 0015's three `gauntlet-drawings`/`gauntlet-models`
ones; `gauntlet_room_create` **from 0028, not 0010** (0028's also enrolls the
host as a racer); and 0025's `gauntlet_room_delete`.

`gauntlet_room_delete` is the one worth naming: **without it the tier is a
trap.** An author could create rooms and never clear one, and every room they
hosted would accumulate with no control able to remove it. The
`host_id = auth.uid()` conjunct is unchanged and is still the real boundary.

**SHUT, and each for a stated reason.** The four student-work reads --
0004's `teachers read all submissions`, 0033's `read own attempts`, 0035's
`read own run events` and `read own run analysis` -- are item four on 0067's own
list; authoring a challenge is writing the question, not a licence to read what
every student answered. 0151's `gauntlet_practice_pressure` and 0152's
`gauntlet_run_review` are the same rows one level up as per-student analytics.
0015's `teachers update speedrun ruleset` is ONE global singleton shown to every
Speedrun player on every challenge, so editing it is a site-wide settings change
and none of the three things the decision enumerates (the read policy is
`using (true)`, so an author still SEES the ruleset). 0031's `gauntlet-tools`
bucket has **no reader anywhere in `src/`** -- swept for the literal, zero hits.
And the eleven `if not v_published and not is_teacher()` draft-PLAY gates stay
shut, which is the one deliberate ergonomic cost and is stated plainly rather
than hidden: an author writes, publishes, and plays like anybody else;
test-driving a DRAFT run stays admin-only. Nothing in the authoring UI depends
on it (the edit form reads through `gauntlet_author_get`, and
`gauntlet_room_set_challenge` refuses an unpublished challenge for an admin too,
so the room path never wants one).

**0004's three `teachers insert/update/delete challenges` policies are left
alone on purpose, and that is the one that looks like an oversight.** 0009 ran
`revoke insert, update, delete on public.challenges from authenticated`, so no
client holds the privilege those policies would permit; re-gating them would
change no behaviour while implying to the next reader that direct DML on
challenges is a live path.

## What was measured

**`svelte-check`: 0 errors, 37 warnings, mix 31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`** -- re-derived, not trusted,
both before and after. A fresh checkout needed `npm ci`, then a placeholder
`.env` with the two `PUBLIC_SUPABASE_*` values, then `npx svelte-kit sync`;
without the `.env` first the count is the documented 11 phantom errors.

**Full suite before: 185 files, 3897 tests, all passing, 140.55s.**
**After: 187 files, 3942 tests, all passing, 143.62s.** The delta is exactly the
two new files and their 32 + 13 = 45 tests; nothing else moved.

**Mutation proof, PERMISSIVE direction, both halves.** Ten SQL mutants appended
to a COPY of 0155 (`/tmp/mutproof/0155.orig`; restore was `cp` from that copy,
never `git checkout --`) and six route mutants over copies of the three TS
files. Every one reddened:

| mutant | result |
| --- | --- |
| M1 `teachers read all submissions` widened | 2 failed / 29 passed |
| M2 `read own attempts` widened | 2 / 29 |
| M3 `read own run events` + `run analysis` widened | 2 / 29 |
| M4 global Speedrun ruleset widened | 1 / 30 |
| M5 `gauntlet-tools` bucket widened | 1 / 30 |
| M6 author roster read opened to the tier itself | 1 / 30 |
| M7 grant/revoke opened to the tier | 1 / 30 |
| M8 draft-play gate widened (`gauntlet_knowledge_start`) | 1 / 30 |
| M9 the predicate stops including `is_admin()` | **11 / 20** |
| M10 `anon` keeps EXECUTE (the 0137 trap) | 2 / 29 |
| R1 the `redirect` comes back on `/gauntlet/author` | 4 / 9 |
| R2 rooms hosting closed to the tier | 2 / 11 |
| R3 the author refusal blanked in the payload | 3 / 10 |
| R4 degrade on ANY rpc error, not just `PGRST202` | 1 / 12 |
| R5 the app-side tier collapsed back to `isAdmin` | 7 / 6 |
| R6 the degrade matched on the MESSAGE instead of the code | 2 / 11 |

M9 is the interesting one: dropping `is_admin()` out of the predicate reddens
eleven assertions, which is the measurement behind the claim that the eleven
re-gates are a superset and not a swap. Both file sets were md5-verified
byte-identical afterwards.

**R4 SURVIVED THE FIRST TIME, AND THE REASON IS A FIXTURE LIMIT WORTH WRITING
DOWN.** `tests/db/postgrest-shim.ts` answers EVERY rpc failure as
`{ code: 'PGRST202' }`, so a missing function and a deliberate `raise` inside a
live one are indistinguishable coming out of it. A test that made the real
`gauntlet_can_author()` raise therefore exercised the DEGRADE path while
appearing to exercise the fault path, and passed whether the code matched on
`PGRST202` or on nothing at all -- measured: the mutant passed all ten
DB-driven assertions. The distinction is only observable at the boundary the
rule is about, so it is now asserted there, against the two error shapes
PostgREST actually produces, with the comment saying why it is not driven
through the shim. The shim is shared and was not this bundle's to change.

**Not verified:** the live Supabase project (the local `.env` is the
`example-ref` placeholder, so nothing here applied a migration or ran an RPC
against production), a real signed-in Google session, and screenshots.
`npm run verify:browser` covers `/dev` routes only and this bundle adds no CSS
and touches no `/dev` route, so it cannot cover the two panels; it was run for
regression value and reported here rather than skipped. **50 route/width runs,
418 measurements, 2 outside threshold, exit 0, 127.7s.** Both findings are the
same one twice (once per width): `tap-target [harness controls] smallest
194.7x26.2 (min dim 26.2px); 2/2 under 44px, 0 under the 24px floor`. Those are
the `/dev` harness's OWN buttons on a route this bundle never touched, and they
are pre-existing -- the diff adds no stylesheet rule anywhere, so nothing in it
can move a measured box. The two documented harness limits apply to those
numbers: `fonts.googleapis.com` is blocked so text is measured in the fallback
stack, and `prefers-reduced-motion` is `no-preference`, so that path is not
exercised.

## The UI half: a refusal that is spoken

An audit found a non-admin teacher got a **redirect** off `/gauntlet/author`, so
being refused was indistinguishable from a broken link -- they landed on the
dojo with nothing saying what happened or who to ask. **The redirect also bought
no secrecy**: a redirect confirms a route exists, which is exactly why
CLAUDE.md's probing rule uses 404 for surfaces whose existence is private, so it
disclosed the same fact while being less useful about it. `/gauntlet/rooms` had
the same finding in a different costume: it rendered fine and simply omitted the
host section, so a refusal read as the feature not existing.

`/gauntlet/author` now returns a `refusal` and renders a panel in the app's own
chrome, and **nothing below it is rendered** -- absence stays the mechanism, the
sentence is what the absence was missing. `/author/new` and `/author/[id]`
redirect to `/gauntlet/author`, deliberately: one panel that speaks, rather than
a third and fourth copy of one sentence, and the destination explains itself.
The rooms load returns `canHost` (named after the CAPABILITY, so nothing
admin-only gets gated on it by mistake) plus the same `refusal`, and joining is
untouched -- anyone with a code always could and still can.

`GAUNTLET_AUTHORING_REFUSAL` lives in `src/lib/server/gauntlet-authoring.ts`
beside the predicate, in ONE place, because four surfaces refuse for the same
reason and three hand-written spellings of "you do not have this" is how they
come to disagree about who to ask. It names `ADMIN_OWNER_EMAIL` for DISPLAY
only, the contract `src/lib/admin.ts` already states for that constant.

`canAuthorGauntlet` mirrors `isAdmin`'s ladder exactly: the RPC when it answers,
a degrade to `isAdmin` on **`PGRST202` alone**, and deny on anything else.
Migrations here are applied by hand and separately from the deploy, so a
deployment sitting between this code shipping and 0155 being pasted is a real
state -- and in that world the database has no author tier and every gate still
reads `is_teacher()`, so falling back to the admin answer is not a hole, it
mirrors what the backend will actually allow.

## Two things reported, not changed

**`0067` did NOT leave the same hole elsewhere.** Every non-GAUNTLET
`is_teacher()` site was enumerated and every one of them is on 0067's own list:
`0001` (role changes; read and update ANY profile), `0039`-`0042` (FRC student
progress, quiz answers, completion overrides, gate submission review),
`0046` (the FSP FRC interest roster -- names, emails, phones, parent emails),
`0051`/`0057`/`0058`/`0059` (GREENLINE decal and community-track moderation,
featuring, review), `0053` (the all-users feedback read), `0066`/`0068`
(tournament deletion). Not one of them is content authoring; every one is
student data, moderation of other people's content, or permanent deletion.
GAUNTLET was the outlier precisely because authoring is content creation with
no student data in it at all. **Nothing was moved, and nothing should be moved
mechanically** -- each of those would be a decision about student data with its
own argument, not a repeat of this bundle.

**The `/gauntlet` landing page still gates its Authoring card on `isAdmin`.**
`src/routes/gauntlet/+page.server.ts` and `+page.svelte` are outside this
bundle's file ownership (two other sessions were live), so they were not
touched. The consequence is real and should be closed next: an allowlisted
author has the capability but no link to it, and reaches the console only by
typing the URL. The change is one line in each -- swap `isAdmin` for
`canAuthorGauntlet` in the load and rename the flag it feeds -- and the
predicate and its refusal copy are already in place for it.

## Files touched

New: `supabase/migrations/0155_gauntlet_authoring_tier.sql`,
`src/lib/server/gauntlet-authoring.ts`, `tests/gauntlet-author-tier.test.ts`,
`tests/gauntlet-author-tier-routes.test.ts`.
Modified: the three `src/routes/gauntlet/author/` loads plus that route's
`+page.svelte`, and both `src/routes/gauntlet/rooms/+page.*`.

`src/routes/gauntlet/rooms/+page.svelte` was edited although the task named only
`rooms/+page.server.ts`: the host section's gate lives in the component, so the
rooms half of "someone refused should be told they are refused" could not be
delivered from the server file alone. The diff there is three lines -- the
`isAdmin` -> `canHost` rename in the destructure and the `{#if}`, and an
`{:else if refusal}` branch. `src/lib/gauntlet/ChallengeForm.svelte` was NOT
touched.

**0155 has NOT been applied.** No migration in this session ran against any live
database.

## What undoes this

Section 8 of the migration lists it statement by statement. The fast partial
revert is `delete from public.gauntlet_authors;`, which empties the tier in one
statement, leaves every admin untouched (their authoring comes from
`is_admin()` inside the predicate, never from a row) and is re-grantable through
`gauntlet_author_grant` afterwards.
