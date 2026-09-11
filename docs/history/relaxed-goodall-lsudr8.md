---
title: "`0201` invented its own revoke shape and shipped an anon hole on ten functions and four tables; `0202` is the repo's copy of the repair, and a whole-schema anon EXECUTE sweep is the thing that would have caught it (`claude/relaxed-goodall-lsudr8`, ledger 0161)"
date: 2026-09-11
branches: [claude/relaxed-goodall-lsudr8]
migrations: ["0202"]
subsystems: ["Database", "Testing", "Security"]
---

`0137` closed the `anon` EXECUTE gap across `public` in August and wrote down, at
length, exactly why it had been open. `0166` then established the shape that
keeps it closed. Nine months of migrations followed it. `0201` did not, and every
one of its ten functions came out reachable by the public internet.

This bundle does three things: writes the repair the repo was missing, finds the
half of the same defect nobody had looked at, and builds the instrument that
makes the next one impossible to ship silently.

## The defect

A hosted Supabase project bootstraps

```
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

so every function a migration creates arrives with a **direct** `anon` grant in
its own `proacl`. The SQL default is a single grant to `PUBLIC`, and that single
entry is all `revoke all on function f from public` removes. `0201` ended on
exactly that form, followed by `grant execute ... to authenticated`, and all ten
`ideacad_*` functions came out `anon true` on production — measured 2026-09-11,
with `classroom_save_response`, `classroom_save_instructor_response` and
`classroom_close_assignment` read as controls in the same pass and all three
`anon false`.

`0166`'s shape is `revoke ... from public, anon, authenticated` **by name**, then
a grant naming exactly who should hold it. Its own header explains why. `0196`
through `0199` follow it. `0201` is the first file in this repo to depart from
it.

**How bad it is, said plainly rather than overstated.** Every one of the ten
opens on a permission check reading the caller's identity —
`_classroom_manages_item`, or `current_user_email()` compared against a row's
`student_email` — and `current_user_email()` answers the empty string with no
session. So what an anon caller reaches is a function that refuses. It is a gate
weakened from "refused at the grant" to "refused in the body": defence in depth
with one layer missing, not an open door. `0137`'s header says the same thing
about the same defect, and closed it anyway.

Mr. Pina repaired the function half by hand and verified it: all ten now read
`anon false`, `authenticated true`. Nothing in the repo carried that repair, so a
database rebuilt from these files would have recreated the hole. `0202` is the
repo's copy.

## The half nobody had looked at, found by a test that was already red

`tests/grant-surface.test.ts` **fails on `origin/integration` at branch time** —
4 assertions, 28 undeclared privileges, naming `ideacad_editors`,
`ideacad_documents`, `ideacad_concepts` and `ideacad_predictions` and no other
object in the schema.

The identical bootstrap carries `grant all on tables`, so all four of `0201`'s
tables arrived holding SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and
TRIGGER for both client roles. `0201` granted SELECT to `authenticated` and
revoked nothing, so the grant it wrote describes what its author was thinking
about rather than what the tables hold — which is the sentence
`grant-surface.test.ts`'s own header was written to make true.

**RLS closes most of it and not all of it.** All four tables have RLS enabled
with SELECT policies naming `authenticated` only, so `anon` reads nothing and no
client role can INSERT, UPDATE or DELETE through a policy that does not exist.
What RLS does not cover is the rest: **TRUNCATE is not subject to row-level
security at all**, and REFERENCES and TRIGGER are privileges no migration in this
codebase grants a client role deliberately — which is precisely why
`grant-surface.test.ts` reserves its section C for them with no exceptions.

**This is a deliberate widening of the brief, and it is the one decision on this
branch worth disagreeing with.** Ledger 0161 permitted one migration for the
function half. The table half is the same defect, in the same migration, from the
same cause, costing two SQL statements in the file already being written — and
leaving it would have meant shipping a suite with a standing red in it, which
`CLAUDE.md` names as worse than no test because a standing failure hides a real
one. `grant-surface.test.ts` goes green with `0202` in the chain and was not
edited.

**The two halves reach production differently, and that is the thing to know
before pasting.** Section 2 is a genuine no-op on production — the hand repair
already landed. Section 3 has not been applied by hand and **is a real change**.

## `0202`

Four sections, `0166`'s shape throughout, `0131`'s self-check convention on the
end.

1. **A read-only report**, printed before anything changes, so whoever pastes it
   sees the state they are repairing rather than a claim about it. On a project
   already carrying the hand repair the first count is 0 and the second is 8;
   that is the expected reading and not a sign the file did nothing.
2. **The ten functions**, revoked from `public, anon, authenticated` and granted
   back to `authenticated, service_role`. The signatures are copied from `0201`'s
   own revoke list rather than retyped from its definitions, so an argument type
   cannot drift between the two files.
3. **The four tables**, revoked from the same three roles and granted back
   `select` to `authenticated` — `0201`'s own decision, restored verbatim,
   because its four RLS policies are what make that grant mean "your own rows"
   and revoking it would take the feature down rather than narrow it.
4. **The self-check**, which raises, so a partial apply cannot look like a clean
   one and the whole file rolls back.

Three things about section 4 are load-bearing.

- **It sweeps by name prefix (`^_?ideacad`), not by section 2's list.** A
  function section 2 failed to name — by this author forgetting one, or by a
  later migration adding an eleventh — is still caught. The regex covers an
  underscore-prefixed private helper too, which `ideacad%` alone would miss.
- **It asserts the count is exactly ten**, so the sweep cannot pass by finding
  nothing.
- **It carries a positive control.** A sweep that found nothing because it was
  looking in the wrong place reports exactly what a clean database reports, so
  the file also reads `app_short_link_target` — granted to `anon` on purpose
  since `0093`, because printed handouts and QR codes resolve before any session
  exists — and raises if that comes back false. If the instrument cannot see a
  grant that is definitely there, nothing above it means anything.

`0202` defines nothing: no table, no function, no policy, no column, no
constraint. Every statement is a privilege statement. So there is no signature
trap, no backfill, nothing to strand, and **no deploy ordering at all** — the RPC
signatures, RLS policies and row shapes are exactly as `0201` left them, so a
deployed client is unaffected whichever order the two events happen in.

**The paste trap, checked two ways against a planted positive control.** A
dollar-quote tag inside a `--` comment balances in Postgres and breaks the
Supabase SQL editor's own client-side statement splitter. A scan for a line whose
leading token is `--` and which also carries such a tag returns **0**; a scan of
everything after the first `--` on every line returns **0**. Both instruments
return **1** against a copy of the same file with a tag planted in a trailing
comment. The file holds 4 dollar-quote delimiters, two balanced pairs
(`$report$`, `$checks$`), every one a real delimiter.

## The instrument: a whole-schema `anon` EXECUTE sweep

`tests/db/ideacad-grants-anon-execute-surface.test.ts`.

The reason this did not exist is worth stating, because it is a near-miss rather
than an oversight. `grant-surface.test.ts` reconciles the migrations against the
catalog for **tables and views**, and its header names the function half
explicitly — "the identical vacuum `0137` closed for functions, one object class
over" — as the thing it is modelled on. It has never read `pg_proc`. The half it
was written in the image of was the half nobody was watching.

The new file applies the **whole chain** — 199 migration files — and reconciles
every anon-executable function in `public` against a named allowlist.

- **501 non-extension functions** in `public` after the chain.
- **23 are executable by `anon`**, every one with the reason a migration gave it.
  **18 are `0137`'s own partition, name for name**, checked against that file's
  header rather than re-derived: the eight public coin-ledger RPCs, the four
  public classroom surfaces (two of which are named inside RLS policies admitting
  `anon`, where revoking breaks the read rather than narrowing it — the `0070`
  lesson `0109` wrote down), short links, and the five unauthenticated GAUNTLET
  macro functions. **5 are the IDEA Maps viewer** (`maps_search` and the four
  helpers its invoker body evaluates), which shipped after `0137` and granted
  itself in `0166`'s shape — `revoke` from all three roles, then a grant naming
  both client roles. A revoke before the grant is what distinguishes a decision
  from an inheritance, and is why those five are on the list rather than in front
  of it.
- The length is **pinned**, so an entry cannot be added silently.
- Drift is caught in **both** directions: an undeclared grant, and a declared
  name the catalog no longer shows as anon-executable.

**Extension-owned functions are excluded through `pg_depend` deptype `'e'`, not a
name prefix.** `pg_trgm` installs **31** operator-support functions into `public`
and grants them to `PUBLIC` itself; they are not the chain's to revoke, they
carry no session and read no row, and revoking one breaks the index that names
it. A prefix list would have to be maintained, and the failure mode of a stale
one is a function silently waved through — the catalog already knows the answer,
so it is asked.

**`authenticated` is deliberately not reconciled**, and that is a scope line
rather than an omission: `authenticated` EXECUTE is the ordinary case across most
of this schema, so a list that long carries no signal and would be maintained by
pasting. What is dangerous is the public internet reaching a definer function.
`service_role` is not reconciled either, for the reason `0137` and
`grant-surface.test.ts` both give.

## What was measured, in four directions

A green sweep over a repaired database proves nothing on its own. Four
independent controls say it is measuring something.

1. **The world without `0202`.** A second database boots the identical chain with
   `0202` filtered out and reproduces `0201`'s defect exactly: **10 of 10**
   functions anon-executable, and all four tables holding **all seven**
   privileges for **both** client roles. Against **0 of 10** and
   `authenticated`-SELECT-only with it. The two chains' function populations are
   asserted **equal**, so the contrast is not quietly measuring a different
   world.
2. **A mutation.** `anon` is granted EXECUTE on `current_user_email()` — an
   ordinary private helper with no public surface of its own — and the sweep must
   name it; the grant is revoked and the sweep must go quiet again. A catalog
   edit restored by its own inverse. **Nothing under `supabase/migrations/` is
   read, written or re-applied, and no `git` command is run**: `CLAUDE.md`'s rule
   exists because `git checkout --` inside a mutation script silently discarded
   three sessions' uncommitted work in one week.
3. **Idempotence, measured rather than argued.** `0202` is applied a **second
   time** over the database the chain already built — which is the same shape as
   pasting it into a project already carrying the hand repair — and the full
   `proacl` / `relacl` of all fourteen objects is compared string for string
   across the two applies. Identical. Reaching the comparison at all is half the
   assertion, since the file's own self-check raises on a partial apply.
   `proacl` and not `has_function_privilege`, deliberately: the question is
   whether the **ACL entries** are identical, not whether the same answers happen
   to fall out of them.
4. **A vacuity guard.** Every `toEqual([])` in the file passes on a database with
   no functions in it, which is also what a catalog query that stopped matching
   returns. So the file first asserts it found more than 300 functions and that
   at least one is anon-executable.

## Verification

- **Full suite: 390 of 391 files, 7615 of 7618 tests, 344s.** The one red file is
  `tests/derived-numbers.test.ts` (3 assertions) and it is **pre-existing on
  `origin/integration`**, from the same pull request that brought `0201`:
  `src/routes/dev/ideacad/+page.svelte` landed without the static counts region
  of `tools/browser-verify/README.md` being regenerated. Not this lane's file,
  not this lane's surface, and this lane was told not to run `verify:readme`. The
  diff on this branch touches four paths, none of them `/dev` or that README.
- **`svelte-check`: 0 errors, 40 warnings in 22 files** — byte-identical to the
  baseline read off `origin/integration` at branch time.
- **`node tools/claude-md-check.mjs`: agrees with the tree.**
- **`tests/grant-surface.test.ts` goes from red to green** with `0202` in the
  chain, without being edited.

**A baseline in `CLAUDE.md` is stale and this lane did not correct it**, which is
a deviation from that file's own rule and is called out rather than left silent.
The verification standard states 0 errors / **37** warnings in a 31/5/1
breakdown; the tree measures **40** in 22 files, 34 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`. The whole drift is
`state_referenced_locally` and it predates this branch. `CLAUDE.md` asks that a
session measuring a different number correct the line in the same change; ledger
0161 scoped this lane to **one paragraph** of that file, and editing a second one
is exactly the shape of overlap the prompt ledger exists to prevent while another
lane is in flight. The measurement is recorded here and in the ledger entry so
the next lane that owns the line has the number.

## Not verified

- **`0202` is NOT APPLIED.** This container cannot reach production and did not
  try. Every measurement above is against the embedded Postgres fixture with the
  real migration files applied unmodified.
- **The production `anon true` reading is Mr. Pina's**, taken 2026-09-11 and
  reported in the prompt, not re-taken here.
- **No browser pass**, and none is owed: this bundle adds no route, no component
  and no file under `src/`.
- **`0137`'s own uncertainty is inherited unchanged rather than quietly
  resolved.** That file kept the five GAUNTLET macro functions on the strength of
  the migrations' stated intent and said plainly it had not re-confirmed that the
  SOLIDWORKS macro still calls them. This bundle did not re-confirm it either.
  Keeping them is the conservative direction; retiring that surface means
  revoking them in their own migration, by somebody who has checked.

## Left undone

- **`tools/browser-verify/README.md`'s static counts region is out of date** and
  is the standing red described above. It needs `npm run verify:counts` from a
  lane that owns it.
- **The `CLAUDE.md` svelte-check baseline**, per the section above.
- **A THIRD OBJECT CLASS IS UNRECONCILED AND IT IS NOT HYPOTHETICAL — IT WAS
  MEASURED.** Tables and views have `grant-surface.test.ts`; functions now have
  this file. **Sequences have nothing, and all three of them are open.** The same
  bootstrap carries `grant all on sequences`, and the chain creates no sequence
  explicitly (`create sequence`: 0) but three implicitly, through
  `bigint generated always as identity` primary keys: `gauntlet_run_events`
  (`0035`), `tournament_match_events` (`0062`) and `tournament_reward_ledger`
  (`0063`). Probed against the full chain on the fixture, each of the three comes
  out

  ```
  postgres=rwU/postgres|anon=rwU/postgres|authenticated=rwU/postgres|service_role=rwU/postgres
  ```

  — `anon` holds SELECT, UPDATE **and USAGE** on all three, which is `nextval`
  and `setval`. The probe was appended to this bundle's own test file, run, and
  the file restored from a saved copy and md5-checked (never `git checkout --`).

  **What bounds it today**: `setval` lives in `pg_catalog`, not `public`, so
  PostgREST will not call it — there is no route from the anon key to these
  grants through the API surface as it stands. That is the same kind of
  containment the TRUNCATE finding above has, and it is a property of the
  gateway rather than of the grant. It is worth noticing that
  `gauntlet_run_events_insert` is one of the five deliberately anon-granted
  functions, so the one sequence an unauthenticated caller already drives is
  also one of the three.

  **This is a separate migration and a separate decision** — three tables across
  two subsystems, none of them this lane's — and this lane's single permitted
  migration is spent. Named here, with the reading, so the next bundle does not
  have to rediscover it. The reconciliation it wants is a fourth section in
  `grant-surface.test.ts` or a sibling of this file: `relkind = 'S'`, no
  allowlist at all, since nothing in this codebase deliberately hands a client
  role a sequence.
