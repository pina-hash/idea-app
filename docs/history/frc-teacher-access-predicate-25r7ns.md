---
title: "FRC Training: an explicit REVIEWER tier (`frc_reviewers`) re-gates the six FRC teacher sites off the 0067 admin check, a /frc/review console makes it usable, and `fsp_frc_interest` stays shut (`claude/frc-teacher-access-predicate-25r7ns`, migration 0167)"
date: 2026-08-30
branches: [claude/frc-teacher-access-predicate-25r7ns]
migrations: ["0167"]
subsystems: ["FRC", "Admin"]
---

**Starting state, checked before doing anything.** `git fetch origin main
integration`: `origin/main` at `47d70ee`, `origin/integration` at `25a4d41`,
highest migration `0166` on both, and a sweep of both branches for
`frc_teacher|frc_reviewer|frc_can_|frcCanReview` found nothing -- the work did
not already exist anywhere, so `0167` is the next free number and all of it was
mine to do.

## The problem, verified against the files rather than the prompt

Every live FRC teacher gate reads `public.is_teacher()`, which since 0067 IS
`is_admin()`: `frc progress select teacher` (0039:53), `frc quiz select
teacher` (0040:65), `frc_mark_complete` (0041:66) and `frc_unmark_complete`
(0041:88), `frc gate select teacher` (0042:68) and `frc gate update teacher`
(0042:97-98). The audit's site list was accurate. Two more 0039 sites (`frc
progress insert`/`delete`, 0039:56-69) are DEAD -- 0041 dropped both policies
and revoked the client write grants -- and were not re-gated; the suite asserts
they stayed dead. `0046`'s `teachers read frc interest` shares the name and
predicate by accident, holds student phone numbers and (0047) parent emails,
and is on 0067's own list of what the narrowing was FOR: left on the admin
check, asserted in the migration's self-check AND the test suite from both the
behavioural and the catalog side.

**Overloads: none.** `frc_mark_complete` and `frc_unmark_complete` each appear
in exactly one migration (0041) at one signature, `(uuid, text)`, swept across
`supabase/migrations/`; the migration's self-check counts `pg_proc` rows (2)
and the suite pins one row per name, so `create or replace` was the correct
instrument and the signature-trap drop was not needed.

## The shape: 0155 copied, with two deliberate deviations

`0167_frc_reviewer_tier.sql` mirrors `0155_gauntlet_authoring_tier.sql`:
lowercased-email allowlist (`frc_reviewers`), predicate folding in `is_admin()`
(`frc_can_review()`), admin-gated grant/revoke/roster RPCs, per-site re-gate,
census of what stays shut, catalog-reading self-check, named-role revokes on
every function (the 0137 rule). Mid-session correction absorbed from the
standards bundle merged 2026-08-30: `create or replace` over an EXISTING
function PRESERVES its ACL rather than re-minting the bootstrap grants -- the
file's first draft claimed the opposite -- so the named-role revokes on the
two re-created 0041 functions are there to pin one end state across both
histories (a live project post-0137, and a chain where 0137 never ran and
0041's bare `from public` left the bootstrap anon grant standing), not to
undo a re-grant the replace never performs.

Deviations, both stated in the header:

1. **The grant admits `@boscotech.net` as well as `@boscotech.edu`.** The
   decided reviewer population is a mix of both, added by hand, so 0155's
   .edu-only rule does not carry over -- and this is also why the tier is an
   allowlist at all: no domain predicate describes that set. An outside
   address is still refused.
2. **One NEW read surface, `frc_review_queue()`,** which the audit did not
   name and the feature cannot function without: pending submissions joined to
   the submitter's name and email inside the definer. `profiles` is
   own-row-or-admin, so a non-admin reviewer reading the queue through the
   re-gated table policy gets bare uuids -- a queue nobody can review. The
   projection is deliberately parameterless (a `uuid[]` argument would be an
   id-to-identity bridge for ANY account, the school-directory trap), scoped
   to `status = 'submitted'` rows only, and answers a non-reviewer an EMPTY
   SET, the same answer an empty queue gives.

No seed row: granting is by hand (direct insert from the SQL editor, or the
RPC from an admin app session), matching "added by hand by Mr. Pina".

## The app half

`src/lib/server/frc-review.ts` mirrors `gauntlet-authoring.ts` exactly:
`canReviewFrc()` calls the `frc_can_review` RPC, degrades to `isAdmin` on
`PGRST202` ALONE (0167 unapplied is a real deployment state, and pre-0167
every gate is the admin check, so the fallback mirrors the backend), denies on
any other error.

Interface gates re-pointed (the audit named FrcShell and track.ts; the full
set found):

- `src/routes/frc/+layout.server.ts` -- loads `frcCanReview` once per /frc
  page via the helper.
- `src/lib/frc/FrcShell.svelte` -- `page.data.isAdmin` -> `frcCanReview`;
  prop `adminOverride` -> `reviewerOverride`; the view-as toggle, preview
  banner and a NEW "Gate review" nav tab all key on `canReview` (the tab also
  hides under view-as-student, because the banner promises reviewer tools are
  hidden).
- `src/lib/frc/track.ts` -- `FrcViewContext.isAdmin` -> `canReview` (only
  FrcShell wrote it and only DomainLanding read the derived `showOverride`).
- `src/lib/frc/DomainLanding.svelte` -- visible label "Teacher tools" ->
  "Reviewer tools" (copy only; the gate was already the context).
- `src/routes/dev/frc/+page.svelte` -- prop rename, "Simulate admin" ->
  "Simulate reviewer", plus a Review-console view mounting the real console.

**The new surface: `/frc/review`.** The review queue lived only on
`/dashboard`, which is admin-tier and stays admin-tier (role editor, full
roster, three moderation queues -- not the FRC panels' call to widen). A
database-only change would have widened the database while the only console
remained unreachable, which reads exactly like the change not working. So
`FrcReviewConsole.svelte` is the whole screen (route and dev harness mount the
identical component), wrapping the same `FrcReviewQueue` the dashboard mounts,
wired to the same `approveSubmission`/`requestRevision` seams;
`loadReviewQueue` in `gate-submissions.ts` is the client seam onto
`frc_review_queue`, reporting `ready: false` on error so an admin arriving
before 0167 is applied reads an apply-migration note naming the file. A
non-reviewer gets **404** -- the Foundry-review/GAUNTLET-run-review precedent
(a review lane's existence is not public), not 0155's rendered refusal, which
belongs to authoring surfaces that are advertised on a landing card. The
dashboard needed no change: admins pass `frc_can_review()` through the
fold-in, and its FRC panels keep working as they were.

## Verified

- **DB suite** `tests/frc-reviewer-tier.test.ts` (26 tests): a five-caller
  matrix -- admin, granted .edu reviewer, granted .net reviewer, plain .edu
  teacher, student -- across every opened gate (with effect assertions: the
  progress row genuinely lands/leaves, a refused approve leaves `submitted`)
  and every shut one (fsp_frc_interest, rosters, grant/revoke, direct table
  writes, the untouched student quiz path with a live positive control).
  Chain: 0001, 0003, 0020, 0067, 0039-0042, 0046, 0137, 0167.
- **Mutation-proven in the permissive direction**, restored from a copy and
  md5-checked, never `git checkout`:
  - re-gating the fsp policy onto `frc_can_review()` reddened 3 tests (the
    behavioural read, the policy-expression census, the re-apply);
  - widening the predicate to `else true` reddened 10 (every open-gate
    matrix caught the teacher and student being admitted).
- **Browser pass** (`npm run verify:browser -- --route "/dev/frc"`, Chromium
  141.0.7390.37, 375px and 1440px): 8 route/width runs, 82 measurements, 0
  outside threshold. Reviewer state: view-as toggle, Gate review tab and
  override strip each present 1/visible 1 at both widths (toggle 133.6x25.6,
  tab 91.4x28.7, both over the 24px floor; tab label 15.74:1). Student state
  (positive control): all four reviewer selectors present 0 with the ungated
  tabs present 1 each and 10 `.fuo-unit` nodes alive in the ungated sim panel.
  Review console: 2 seeded rows, approve removes exactly one ([2,1] measured),
  lead copy 6.03:1 on the FRC plate, names 11.34:1 on the dark panel, 0px
  overflow at 375. **Both directions proven**: swapping each spec's state
  reddened 3 presence rows and 3 absence rows respectively (9 of 21
  measurements outside threshold on the deliberately-wrong runs), and the
  reviewer spec carries a view-as flip control ([1,true,true,0,true]) so the
  preview-banner absence row has a live positive control too.
- **svelte-check**: 0 errors, 37 warnings (31 state_referenced_locally, 5
  css_unused_selector, 1 perf_avoid_nested_class), re-derived with the two
  PUBLIC_ env values exported before `svelte-kit sync`.
- **npm test**: 215 files, 4446 tests, all green.

## NOT verified

- Nothing here touched the live Supabase project: 0167 is written, not
  applied. The local `.env` does not exist and the placeholder project cannot
  run an RPC.
- No real signed-in session drove `/frc/review`; the console was verified
  through the dev harness mounting the identical component. The 404 for a
  non-reviewer and the layout's `frcCanReview` load are exercised by
  type-checked code paths and the helper's tested degrade ladder, not by a
  live browser session.
- The dashboard's FRC panels were not re-driven (unchanged code).

## Deferred

- No admin UI for granting/revoking reviewers (SQL-editor only), the same gap
  0155 shipped with and named acceptable.
- The reviewer console shows the pending queue only; a per-student progress
  roster for reviewers (the dashboard's other FRC panel) would need its own
  roster projection and its own disclosure argument.
