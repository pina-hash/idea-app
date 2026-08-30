---
title: "Two owned coin-desk tests stop pinning PGRST202 for an anon permission denial, and assert the SQLSTATE the shim now actually reports (`claude/permission-denial-assertions-zq6yks`)"
date: 2026-08-29
branches: [claude/permission-denial-assertions-zq6yks]
migrations: []
subsystems: ["Coin economy", "Testing"]
---


`tests/db/postgrest-shim.ts` (commit `2053942`, a different bundle) stopped
reporting every RPC failure as a blanket `PGRST202` and started passing the
real SQLSTATE through, translating only `42883` (undefined_function, which is
what PostgREST's own schema-cache miss actually is) to `PGRST202`. That broke
one assertion in each of the two files this session owns:
`tests/coin-public-board-anon-projection.test.ts:442` and
`tests/coin-public-surface-hardening.test.ts:320`, both in a test named "THE
SHIM ITSELF IS ANON: the same client is refused what an admin is given". Both
call `coin_role_admin_list_role_questions` as `anon` and expect a refusal;
both were pinning `refused.error?.code` to `'PGRST202'` and, in the same
breath, asserting `refused.error?.message` matches `/permission denied/i` --
which was already the tell that the pinned code was describing the fixture's
old blanket behaviour rather than the real refusal. `anon` never held EXECUTE
on that function (0076 grants only `authenticated`; 0137's sweep keeps it
that way), so the true SQLSTATE for this refusal is Postgres' own `42501`
(insufficient_privilege), and that is what the shim now reports.

## The fix

Both assertions now read `expect(refused.error?.code).toBe('42501')`, with a
comment stating why: 42501 is what proves this is a refusal BY GRANT, not a
`PGRST202`-shaped "the function does not exist" 404, which is the one thing
the message-match assertion beside it could not tell apart on its own. Added
`expect(refused.data).toBeNull()` next to it in both files, which was missing
before -- "refused, and specifically not returning rows" is the actual claim
this test makes, and the code assertion is the sharpest single fact that
proves it (a `PGRST202` and a bare grant denial both refuse and both return
no rows; only the SQLSTATE tells you which kind of refusal happened, and that
distinction is exactly what commit `2053942`'s shim fix exists to make
testable).

**Why pin the code at all, rather than only asserting "refused, no rows"**:
because "refused, no rows" is satisfied equally by a missing-function 404 and
a real grant denial, and this test's own name -- "the same client is refused
WHAT AN ADMIN IS GIVEN" -- is a claim about a permission boundary, not about
whether a function resolves. Not pinning the code would make the test pass
just as well against a shim (or a future migration mistake) that quietly
turned this into a 404. Pinning `42501` is what keeps the test honest about
which kind of refusal it is proving.

## The sweep

Checked every other file naming `PGRST202` in `tests/` for the same
conflation (a real permission denial pinned as `PGRST202` because the old
shim manufactured it that way). Fifteen files reference the string; of those,
only three actually assert `.error?.code).toBe('PGRST202')` or similar
against a live shim call:

- `tests/postgrest-shim-rpc-error-codes.test.ts` and
  `tests/postgrest-shim-rpc-shape.test.ts` -- these are the shim's OWN test
  files (one of them is where commit `2053942`'s positive/negative controls
  for the fix live). Their `PGRST202` assertions are against genuinely
  missing functions or arity mismatches (`no_such_function_anywhere`,
  `admin_list` called with a parameter it lacks) -- real 42883 cases, exactly
  what `PGRST202` is supposed to mean now. Unaffected, correctly so.
- `tests/short-link-redirect.test.ts:409` -- "the pre-0093 chain genuinely
  answers PGRST202 (the rung's positive control)" -- a pre-migration chain
  where the RPC truly does not exist yet. Also a genuine 42883 case.

Every other `PGRST202` occurrence across the remaining twelve files is either
a comment/doc-string referencing the concept, a hand-constructed mock error
object fed straight to a stubbed transport (`tests/foundry-preview-route.test.ts`,
`tests/foundry-download-route.test.ts`, `tests/gauntlet-author-tier-routes.test.ts`,
`tests/gauntlet-knowledge-clock-client.test.ts`), or a real database call
through `db.sql`/`asUser` raw SQL rather than the shim's `.rpc()` wrapper
(`tests/classroom-roster-degrade.test.ts`, `tests/classroom-units.test.ts`,
`tests/classroom-feed-false-counts.test.ts`, `tests/coin-admin-list-gates.test.ts`,
`tests/gauntlet-run-review-route.test.ts`) -- none of those paths go through
`createPostgrestShim`'s RPC error translation at all, so commit `2053942`
cannot have changed what they see. Also swept for the broader pattern
`error(\??)\.code\).toBe\(` / `.toEqual({code: ...})` across all of `tests/`;
the only other hits were in `tests/notebook-session-postings.test.ts`, which
pin `error.code` off `captureError` around raw `db.sql` inserts (a real
`23503`/`42501` from Postgres itself, never touching the RPC shim). No other
file needed a change.

## Mutation proof

Built entirely outside the repo (`/tmp/.../scratchpad/mig-scratch/` plus a
standalone Node script using `embedded-postgres` and `pg` directly, never
importing or touching anything under `tests/db/`): copied the 21-migration
chain both owned test files share to the scratch directory, then mutated the
scratch copy of `0137_anon_execute_sweep.sql` to add
`coin_role_admin_list_role_questions` to BOTH of its `k_keep` arrays (the
sweep's own grant loop and its self-check), which is what actually opens the
gate -- mutating only 0076's own `grant execute ... to authenticated` (the
first thing tried) gets silently swept back closed by 0137's blind revoke,
which is itself worth knowing: the real gate for this function today is
0137's keep-list, not 0076's own grant line.

With the gate open, the scratch chain applied cleanly and calling
`coin_role_admin_list_role_questions('safety_officer')` as `anon` (`SET ROLE
anon`, no JWT claims, exactly what `asAnon` does) returned 0 rows with NO
error -- `is_admin()` still refuses inside the function body, so the query
resolves and returns empty rather than raising. That reddens both assertions
this bundle wrote: `refused.error?.code` is `undefined`, not `'42501'`, and
`refused.data` is `[]`, not `null`. Confirmed the real repo migrations were
never touched: `git status --porcelain supabase/migrations/` was empty
throughout, and `md5sum` on `0076_coin_role_quiz_and_expiration.sql` and
`0137_anon_execute_sweep.sql` matched their pre-session values before and
after the mutation script ran. Never used `git checkout --`.

## Verification

- `svelte-check`: 0 errors, 37 warnings (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`) -- unchanged from
  baseline, re-derived after `svelte-kit sync` with the placeholder `.env` in
  place.
- Full suite BEFORE this bundle's edit (measured against `origin/integration`
  at `a816a985cdf972836eb9a0a727be1491ad254354`, which is also this branch's
  base): **3 failed, 4284 passed** (of 4287) --
  `tests/coin-public-board-anon-projection.test.ts` (the assertion this
  bundle fixes), `tests/coin-public-surface-hardening.test.ts` (same), and
  `tests/dom/item-detail-ondeleted-mount.test.ts` (not owned by this
  session).
- Full suite AFTER: **1 failed, 4286 passed** (of 4287) --
  `tests/dom/item-detail-ondeleted-mount.test.ts` is still red. It is fixed
  on an unmerged branch (per this session's briefing) and is not this
  session's file to touch or claim.

## What was not verified

No live Supabase project, no signed-in session, no Drive round trip -- none
of this bundle's work touches any of those; it is two test-file assertions
plus a scratch, outside-the-repo mutation proof.
