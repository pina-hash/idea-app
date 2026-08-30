---
title: "Two uncovered route loads come under test: the printed short link, and the item page a student hands work in on"
date: 2026-08-29
branches: [claude/route-test-coverage-yw1a9z]
migrations: []
subsystems: ["Testing", "Classroom", "Short links"]
---

No migration, no `src/` file and no tool moved. Two test files are new:
`tests/short-link-redirect.test.ts` (39 tests) and
`tests/classroom-item-page-load.test.ts` (26 tests). Both drive the REAL shipped
`load` from its own file, against a REAL Postgres carrying the REAL migration
chain, through `tests/db/postgrest-shim.ts` -- the
`tests/notebook-page-load.test.ts` shape, copied rather than reinvented.

**THE BRIEF NAMED AN AUDIT FILE THAT DOES NOT EXIST.**
`docs/history/test-coverage-audit-lhl9bv.md` is on no ref reachable from here
(`origin/main`, `origin/integration`, and every commit either contains). Its
findings are quoted in the brief and were taken as claims to check rather than
facts, which the first section below is the result of. Its two named shim gaps
(storage and `fetch`) are correct and neither applied; a THIRD gap did turn up
and is recorded at the end.

---

## 1. `/[shortlink]` -- and what the four claimed behaviours actually are

The brief listed four behaviours "asserted by nothing". Reading the route and
0093 first, rather than writing to the list, moved two of them:

**307 vs 308 is exactly where the claim put it** -- `redirect(307, data)` on the
last line of the load. Asserted as `toBe(307)` AND as
`expect([301, 308]).not.toContain(status)`, because the failure mode is that a
re-pointable row gets cached by a browser or a QR reader past the point where
re-pointing helps.

**THE RESERVED-NAME GUARD IS NOT IN THE ROUTE AT ALL.** There is no reserved
check on the resolution path; `_app_short_link_reserved` is called by
`app_short_link_upsert`, so a shadowing slug cannot be CREATED. What the route
itself refuses is the slug's SHAPE, and the interesting half of that is that it
refuses BEFORE the database is asked -- so the test wraps the shim and counts
the RPC calls, which is the only way to tell a shape guard from a shape guard
that runs after the read and discards the answer. The reserved list is swept as
21 generated cases with its length pinned, against a positive control (a slug of
the same shape that shadows nothing is accepted).

**FRAGMENT PRESERVATION IS NOT SOMETHING THE SERVER DOES.** A fragment never
reaches the server; the browser carries the original URL's onto a target that has
none of its own (RFC 7231 7.1.2). So the assertable halves are that the database
refuses a target carrying its own `#` -- in the RPC AND, separately, in the
column's own CHECK, with RLS and the RPC both out of the way -- and that the
route returns the stored target BYTE FOR BYTE. `toBe`, not `toContain`: an
appended fragment, a trailing slash or a rebuilt absolute URL would each be a
Location the browser prefers over the visitor's.

**THE `PGRST202` RUNG IS NOT KEYED ON `PGRST202`, AND THAT IS CORRECT HERE.** The
route swallows ANY rpc error into the same 404. CLAUDE.md's rule is that a
degrade must key on `PGRST202` alone so a runtime error fails CLOSED; a 404
grants nothing, so this is already the closed direction and the test asserts the
behaviour the route has rather than a code check it does not make. The rung is
driven on a second chain that stops one migration short (the
`tests/classroom-roster-degrade.test.ts` shape), with the shim's own `PGRST202`
answer asserted first as the rung's positive control.

### What the mutation proof found: `rpcError` is redundant with `!data`

Removing ONLY the `rpcError` term from `if (rpcError || !data || typeof data
!== 'string')` reddens **nothing** -- PostgREST, and the shim, return `data:
null` alongside an error, so the null check catches the missing RPC on its own.
This is the defence-in-depth case CLAUDE.md names: the check is not dead, and the
proof is to open BOTH layers, which reddens three tests. Recorded here so nobody
deletes the redundant term on the strength of a mutation that stayed green.

### The mutations, all restored from copies

`git checkout --` was not used anywhere; every restore is `cp` from a scratchpad
copy, md5-verified afterwards.

| # | mutation | reddens |
|---|---|---|
| M1 | `redirect(307)` -> `redirect(308)` | 2 |
| M2 | the slug shape guard removed | 1 (the rpc-call count) |
| M3 | the route appends `#top` to the Location | 3 |
| M4a | only the `rpcError` term removed | **0** (see above) |
| M4b | the whole degrade guard removed | 3 |
| M5 | `trim().toLowerCase()` removed | 1 |
| D1 | `_app_short_link_reserved` neutered to `false` | the 21-case sweep |
| D2 | the fragment `raise` removed from the upsert | the message assertion |
| D3 | `app_short_links_target_check` dropped | the direct-insert refusal |
| D4 | the `active` filter dropped from the resolver | the retired-slug 404 |

D1-D4 were applied as `create or replace` / `alter table` over a throwaway test
database in a probe file that was deleted after the run -- no file under
`supabase/migrations/` was edited at any point.

---

## 2. `/classroom/[sectionId]/item/[itemId]` -- covering the load, not the components

146 lines, imported by no test. Its three sibling loads under the same section
are driven this way already. The components are well covered, which is what makes
this dangerous: a defect in the four-rung ladder, in the `posted_in.section_id`
cross-check or in the spec and rubric fetch produces an empty or a wrong page
while AssignmentEngine, ItemDetail and SpecRenderer all pass their own tests.

**SEVEN DATABASES, ONE SEED FUNCTION.** Each chain stops short of a different
migration, and the seed's steps are gated on which migrations that chain carries
-- so no chain gets a second hand-shaped fixture that could disagree with the
widest one about what it contains. The chains are the full one, then one each
without 0111, 0109+0110+0111, 0108+0109+0110+0111, 0101+0128, 0133, and the whole
0085-era world (no 0086 and nothing after it).

**ABSENCE IS ASSERTED ON THE TABLES, NOT ONLY ON THE PAYLOAD.** The shim is
wrapped so every `from(table)` and `rpc(name)` the load makes is recorded. A
student's load provably never touches `classroom_instructor_attachments`,
`_resources`, `_responses` or `_keys`; a manager's load provably never touches
`classroom_responses` or `classroom_submissions`. Each sweep carries the other
role's load as its positive control, so "not contained" is a decision rather than
a table nothing reads.

**THE FOUR RUNGS ARE ASSERTED AS FOUR DIFFERENT COLUMN SETS**, not four separate
"it still works" claims: `[body_doc, publish_at, unit_id]` presence comes back as
`false/false/false`, `false/false/true`, `false/true/true`, `true/true/true`, and
the set of four is asserted to have four distinct members. `undefined` and `null`
are held apart deliberately at every rung -- "this read could not tell" is what
`classGroups` treats as unfiled and what `isScheduled` treats as live, and a rung
that answered `null` would file every item while claiming to know.

**ONE ASSERTION WAS VACUOUS ON THE FIRST WRITING AND IS RECORDED AS SUCH.** "No
0101 -> `deck` is null" could not fail: with no deck seeded anywhere, `null` is
the answer on every chain. A real deck now goes in through the real
`classroom_replace_deck`, so the wide chain answers `Day 1` and the narrow one
answers null. The same question was asked of every other fail-soft assertion:
`instructorCopy` (object vs null), `filesStorageReady` (true vs false), `engine`
(object vs null) and `referenceSpec` (object vs null) each already differed
between their two chains.

**`is_public` IS FALSE IN A STUDENT'S PAYLOAD FOR A MATERIAL THAT IS GENUINELY
PUBLIC**, because the column is fetched only for a manager and `normalizeItemRow`
normalises an absent one to false. That is the toggle's flag, not a visibility
signal, and it is now asserted in both directions so nobody reads a student
payload's `false` as "this material is private".

### The mutations

| # | mutation | reddens |
|---|---|---|
| N1 | `.eq('posted_in.section_id', ...)` removed | 2 |
| N2 | `!inner` removed from the posting embed | 2 |
| N3 | `canManage` inverted | 11 |
| N4 | the manager also loads the student slice | 1 |
| N5 | instructor material merged for a student too | 2 |
| N6 | the working copy loaded with no spec to fill in | 1 |
| N7 | the item ladder inverted (narrowest rung first) | 4 |
| N8 | the `publish_at` rung removed from the ladder | 2 |
| N9 | `storageReady` reported true on the narrow rung | 1 |
| N10 | the reference spec fetched for an assignment too | 1 |
| N11 | `is_public` fetched for a student | 1 |
| N12 | the signed-out redirect removed | 1 |
| R1 | **permissive**: `classroom responses own or reviewer` opened to `using (true)` | the response exclusion |

R1 is the one this repo's rule requires to be mutated in the PERMISSIVE
direction, and it was: opened to `using (true)`, Alice's payload comes back
carrying Bruno's answer, which is what her exclusion assertion refuses. Run in a
probe file deleted after the run.

`src/routes/[shortlink]/+page.server.ts`,
`src/routes/classroom/[sectionId]/item/[itemId]/+page.server.ts` and
`src/lib/classroom/transports.ts` were each md5-verified byte-identical to their
pre-mutation state afterwards.

---

## Findings

**A THIRD SHIM GAP: THERE IS NO ANON MODE.** `createPostgrestShim` runs every
statement through `TestDb.asUser`, which does `set role authenticated`. `/[shortlink]`
is a PUBLIC route -- the whole point is a parent scanning a QR code with no
account -- so the caller a real request carries is the `anon` role, and the load
can only be driven here as `authenticated`. It is stated in the test file rather
than stubbed around, and closed for THIS route by a separate direct assertion:
`app_short_link_target` is SECURITY DEFINER with `search_path = ''` and reads no
`auth.uid()`, so the only thing that can differ between the two roles is the
EXECUTE grant, which is asserted as `anon` (with the negative control that `anon`
can enumerate the table by neither door). **That reasoning does not generalise.**
A public route whose read branches on the caller cannot be driven honestly
through this shim at all, and giving `createPostgrestShim` an anon mode is the
real fix -- it is a change to `tests/db/`, which this bundle deliberately did not
make.

**0093's RESERVED LIST HAS DRIFTED, AND ELEVEN NAMES CAN NOW BE CREATED THAT
WOULD NEVER RESOLVE.** The list was written when 0093 shipped and nothing
re-derives it. Measured against `src/routes` and `static/` as they stand, these
are slug-shaped, shadow a real name, and are NOT reserved:

    a  b  foundry  fsp-pulse  fsp-tech-selection  sitemap.xml
    downloads  tools  manifest.webmanifest  push-sw.js  robots.txt

`foundry` is the one that matters -- a whole subsystem added after 0093. The cost
is exactly what 0093's own comment says it is: accepting one "would only ever
mislead whoever created it", because SvelteKit resolves the static route first
and the slug is dead on arrival. It is not a security hole (nothing is shadowed
INTO, only away from) and the fix is a migration widening
`_app_short_link_reserved`, which this bundle may not write.

**NO TEST WAS SHIPPED FOR THAT DRIFT, DELIBERATELY.** A sweep asserting "every
single-segment route name is reserved" is red on arrival, and a sweep with the
eleven exempted by name is the ratchet `tests/spec-instructions-budget.test.ts`
was deleted for: it records what last happened and checks nothing. The right home
for the assertion is the migration that fixes the list.

Also noted while reading: `coin-entry` is on the reserved list and is not a route
or a static directory. Harmless -- reserving a name nothing serves costs a slug
nobody wanted.

## Verification

- `svelte-check`: **0 errors, 37 warnings**, mix 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- re-derived, unchanged
  from the baseline. (Both numbers were measured with the two placeholder
  `PUBLIC_SUPABASE_*` values exported before `svelte-kit sync`, per the note in
  CLAUDE.md; without them a fresh checkout reports the eleven phantom errors.)
- Full suite BEFORE: 183 files, 3864 tests, all passing, 158.13s.
- Full suite AFTER: 185 files, 3929 tests, all passing.
- Every mutation above was applied to a working copy and restored with `cp` from
  a scratchpad copy, never `git checkout --`.

## Not verified

- Nothing was run against the live Supabase project. The local `.env` is the
  placeholder project, as always.
- No browser pass. Neither file renders anything: both drive a server `load` and
  assert on its return value, so `npm run verify:browser` has nothing to say
  about either.
- The `anon` half of `/[shortlink]` is asserted at the DATABASE (the grant and an
  actual `anon` execution), NOT through the load. See the shim finding above.
- The reserved-list drift is measured against this checkout's `src/routes` and
  `static/`; it was not checked against what is actually deployed.
