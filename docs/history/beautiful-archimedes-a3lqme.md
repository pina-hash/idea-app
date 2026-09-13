---
title: The production deploy is throttled, the 0211 record, and the probe that could never pass
date: 2026-09-13
branches: [claude/beautiful-archimedes-a3lqme]
migrations: []
subsystems: [deploy, ideacad, classroom-export, verification]
---

Production had been serving 2026-09-12 21:22Z code for two landings and nothing in
the repository recorded why. The cause is a Vercel Hobby quota that pauses
deploying; the fix is now a key in `vercel.json` rather than a setting in a
dashboard. Along the way the IdeaCAD realtime verification turned out to have
never tested anything, for two reasons, only one of which anybody knew about.

## What changed

- `docs/audits/2026-09-13-vercel-deploy-throttle.md` -- the audit.
- `vercel.json` -- an `ignoreCommand` that skips a production build for a commit
  touching `materials/` only.
- `supabase/data/0203-ideacad-realtime-verification.sql` -- part C rewritten to
  return rows, and two real defects in it fixed.
- `docs/migrations-applied/0211-lucid-dirac-8b6m2f.md` -- the applied record for
  `0211`, written from Mr. Pina's report.

No file under `src/`. No migration.

## The load-bearing decisions

**The `vercel.json` key was confirmed, not recalled.** The prompt said not to
invent a config key. `vercel.json` already declares
`"$schema": "https://openapi.vercel.sh/vercel.json"`, so the schema itself is the
authority: fetched (HTTP 200, 420,507 bytes), `ignoreCommand` is one of its 42
top-level properties, typed `string | null` with `maxLength: 256`. The rule is 145
characters and the whole file still validates, which matters because the schema
sets `additionalProperties: false`. Written with POSIX `[ ]` rather than `[[ ]]`,
because the Ignored Build Step is not guaranteed a bash.

**Exit 0 skips the build.** Backwards from the intuition, and the one thing most
likely to be got wrong later, so it is called out in the audit in its own
paragraph. The rule was replayed against real commits in both directions --
exports skip, landings build, a missing `HEAD^` builds -- and over the 30-day
retention window it skips 242 of 565 production builds.

**Every number in the prompt was re-derived, and one of them was wrong.** The
prompt said one assignment produced r3 through r9 as seven commits on 2026-09-09.
`IDEA-BLADE | PART 1` has four revision commits in the window and none of that
shape. The real seven-in-one-day case is `Shop Trophy: Presentation and Defense`,
and it is worse than the claim: three of the seven are **the same revision r1**,
pushed at 00:43:57, :59 and :01 -- one save fanning out into three production
builds because the item is posted to more than one section.

**"Byte-identical" was checked rather than asserted.** `materials/` is reachable
from no import: no `static/materials`, both `import.meta.glob` calls resolve
inside `src/`, and all ~16 references to the directory under `src/` are prose
comments or harness fixture strings.

**The export is the largest REMOVABLE cause, not the dominant one, and the audit
says so.** It is 43% of production deploys over the retention window and the only
category that is entirely waste. Across all deployments the lane workflow is
larger -- 565 production tips against 585 integration tips plus an unmeasured
agent-branch preview count. The prompt called the export dominant; the narrower
claim is the one the measurement supports.

## Part C: two defects, and why the obvious rewrite is wrong

The prompt asked for one change -- return rows instead of raising notices the
Supabase editor does not display. Making that change surfaced two more, both
inside the verification file and neither anything to do with `0211`.

**It signed nobody in.** `current_user_email()` (0067) does not read the claim's
`email`; it resolves `auth.uid()` -- the claim's `sub` -- against `auth.users`.
Part C set only `email`, so `current_user_email()` returned `''`, which is the
first branch `_ideacad_document_role` tests, and all eight answers came back
false. Measured against the **deployed** block's own sequence:
`current_user_email=[] frame_read=f`. The ladder reports that as
`FAIL -- REFUSING THE OWNER`, so part C could never have returned PASS on any
database, and the first person to run it with a document present would have gone
hunting a policy bug that does not exist.

**AND A SINGLE-STATEMENT REWRITE CANNOT WORK, WHICH IS THE THING WORTH KEEPING.**
The obvious shape for "return rows" is one large `SELECT`, and it was written and
then thrown away. `current_user_email()` is `STABLE` and takes no arguments, so
Postgres may evaluate it **once per statement** and reuse the answer. Measured:
inside one statement that signs the owner in, reads, then signs a stranger in and
reads again, the stranger's read came back **as the owner** (`str_seen` = the
owner's address, `str_fr` = true); the identical sequence split across two
statements answered correctly (`''`, false). So a single statement cannot probe
two identities at all, and the version that tried reported
`PERMITTING EVERYTHING` against a policy that was working -- a false conviction
traded for the old false acquittal. **A LATERAL that forces evaluation order does
not help**, because the ordering was never the problem; the cached stable result
is. plpgsql is correct because each assignment inside a block is its own
statement. The block stays, fills a temp table, and a plain `select` after it
returns the rows.

**Three additions beyond the brief**, each made because leaving them would have
shipped a probe that still tests nothing: the owner is signed in by `sub`; a new
`OWNER NOT RESOLVABLE` refusal covers a document whose owner has no `auth.users`
row, so the instrument admits its own blindness rather than blaming the policy;
and a **second stranger** was added, because the planted address is in no
`auth.users` row and is therefore only a signed-out control. The classmate is a
real signed-in account enrolled in a posted section, holding no grant, and
confirmed not to manage the item -- a manager is the teacher of record and would
manufacture a false FAIL. When none is found the verdict is `PASS (PARTIAL)` and
names what was not asked. A `NULL` rung was added and is read first: in the old
ladder a `NULL` fell through every test into the `PASS` arm.

**`0211` looks correct on this evidence.** Owner reads and sends; signed-out
stranger and signed-in classmate both get nothing; a mutation of
`_ideacad_realtime_can_read` to `select true` flips the verdict to
`PERMITTING EVERYTHING`. That is on the real migration chain on an embedded
Postgres, not on production.

## What the throttle actually cost

Part C returned `NO DOCUMENT EXAMINED` because `ideacad_documents` holds zero rows
in production. It holds zero rows because the IdeaCAD surfaces that would create
one are in `ee4a1c42` and production serves `247dfc4`. A dashboard quota kept the
surfaces off production, so no student could open a document, so the table stayed
empty, so the behavioural half of a migration's verification could not run. That
chain is the clearest statement of what a paused deploy costs.

## Measured

- `svelte-check`: **0 errors, 37 warnings in 20 files** (31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`), read off `integration` at
  branch time after exporting the two `PUBLIC_SUPABASE_*` placeholders and running
  `svelte-kit sync`. Matches the documented baseline exactly, both total and
  breakdown, so this line needed no correction.
- Full suite: **457 files, 8673 tests passed**, read off the summary line rather
  than the exit code. Nothing in the suite reads `vercel.json` or this file.
- Part C: 8 assertions across 6 branches, on the real chain.

## Not verified

- **Every Vercel dashboard figure is Mr. Pina's report**, relayed through the
  prompt. Nothing here can reach the Vercel API. The git measurements are this
  container's own.
- **`ignoreCommand` has not been observed taking effect.** The next production
  landing is the test.
- **The account's 262.5 GB total does not reconcile** with the per-project figures
  (~30 GB). Stated as unreconciled rather than explained away.
- **Part C has not been run against production** and cannot return a `probed`
  verdict there until a document exists.
- No browser pass; this bundle touches no mounted surface.

## Deferred

- Reducing PREVIEW deployments, which is causes (a) and (b) in the audit. The
  rule landed here skips every non-`main` ref, which is the opposite of what those
  need. Turning previews off for agent branches is a separate decision with a
  separate cost.
- Whether the classroom export should batch a multi-section save into one commit
  at source, rather than being skipped at the build. That is a change to
  `src/lib/server/classroom-export.ts`, which this bundle does not own.
