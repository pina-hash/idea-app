---
title: "Mechanical conflict resolution in the Integrate sweep, and a Deploy that reads production's own catalog instead of asking (`claude/pipeline-automation-probe-ln83ek`)"
date: 2026-09-04
branches: [claude/pipeline-automation-probe-ln83ek]
migrations: []
subsystems: ["Repo tooling", "CI and workflows", "Testing"]
---

Prompt 0035. No `src/` change at all: two workflows, their README, their test, one new tool,
the gate-proof harness, and one decision's Status line.

## The base

Started from `origin/claude/unblock-pipeline-deadlock-j239zg` at `1254785`, as the prompt
required. That branch had NOT been swept into `integration` by the time this began
(`git merge-base --is-ancestor` said no), so branching from `integration` was not the case.
The container's checkout began on `origin/main` at `4a5dcc6` ("0177: a tombstone"), so the
first act was `git checkout -B claude/pipeline-automation-probe-ln83ek
origin/claude/unblock-pipeline-deadlock-j239zg`. `origin/main` is an ancestor of that base,
so nothing on main was left behind.

Git already carried a committer identity (`Claude <noreply@anthropic.com>`), so the "Please
tell me who you are" failure the prompt warns about did not arise and nothing was set.
Working directory `/home/user/idea-app`.

The duplicate check swept every ref for a ledger entry numbered 0035 and for any commit
adding a production probe: nothing. `docs/prompt-ledger/entries/` tops out at 0034 on the
base branch, 0033 on `integration`, 0017 on `main`; `git log --all -S'deploy-probe'` and
`git log --all -- tools/deploy-probe.mjs` are both empty.

Prompt 0034's push condition is intact on this branch and was built on, not reverted:

```
          pushed=no
          if target_push_gate "${remote_tip:-}" "$(git rev-parse HEAD)"; then
```

with `target_push_gate` still `[ "$2" != "${1:-}" ]` between its markers.

## The conflict census, which is the argument for half of this bundle

Every merge commit on `origin/integration`, this branch, `origin/main` and the two standing
`claude/**` branches since 2026-08-30 was REPLAYED with `git merge-tree --write-tree` -- so
the conflicts counted are the ones those merges actually hit, not an inference from what the
merge commits changed.

**24 conflicted merges, 30 conflicting paths:**

| path | count |
| --- | --- |
| `tools/browser-verify/README.md` | 19 |
| `classroom-updates.json` | 6 |
| `docs/history/editor-bundle-survey-q3gb7a.md` | 1 |
| `src/routes/notebook/review/student/[studentEmail]/+page.svelte` | 1 |
| `src/lib/maps/ShelfEntry.svelte` | 1 |
| `src/lib/maps/transports.ts` | 1 |

Twenty-five mechanical against four genuine, and the four genuine ones sit in three merges.
The prompt's instruction was to build only what the evidence supports; the evidence supports
both files it names and nothing wider.

Four further merges could not be replayed at all -- `git merge-base` finds no common ancestor
for their two parents in this clone, so `merge-tree` refuses with "unrelated histories". Three
of the four have an EMPTY combined diff (`git show --cc`), so nothing was resolved by hand in
them; the fourth (`3d13c5d`) touches `classroom-updates.json` only, which is a mechanical case
either way. They are an instrument limit, not a finding, and they are reported rather than
quietly dropped from the denominator.

## The generated region, measured

`tools/browser-verify/README.md` carries two generated regions inside
`<!-- counts:begin -->`/`<!-- counts:end -->`. Only the STATIC one is cheap:

- `node tools/browser-verify/readme-counts.mjs --static --check` ran in **0.386s** real, in a
  checkout with **no `node_modules`**, no browser and no dev server. That is the whole cost of
  a counts resolution.
- It is a pure function of the tree: `readdirSync` over `src/routes/dev`, plus an import of
  `tools/browser-verify/routes.mjs`. No clock, no commit. Regenerating on an unchanged tree
  writes nothing.
- The MEASURED region needs a browser and about six minutes and is never run here. Its data
  line carries a date and a sha, so two branches that both regenerated it genuinely disagree;
  taking the target's side there is a deliberate choice and it is what the file's own header
  calls "a stale-but-honest measured half".

A conflict OUTSIDE those markers is prose. It is left conflicted, and that is enforced rather
than intended -- see below.

## `classroom-updates.json`, and whether "keep both appends" is well defined

It is an object, not an array: `{ "_readme": [ ...strings ], "entries": [ ... ] }`, 120
entries, keys `date`, `title`, `body`, `tags`. **There is no id and no key.**
`src/lib/classroom/updates.ts` sorts by `date` descending at read time and the file's own
`_readme` says "Newest entries may go anywhere in the list -- the page sorts by date", so file
ORDER is not semantic. Duplicate dates are the norm (13 entries share 2026-08-27); duplicate
`(date, title)` pairs: none today.

So two branches CAN append entries that collide on `(date, title)`, and nothing dedupes them.
The merge keeps BOTH, and that is deliberate: two rows with one title is visible and harmless,
while dropping one is invisible and destroys a session's changelog entry. Entries are compared
by VALUE with their keys sorted, so an entry that reached both sides through the merge base is
counted once and is not duplicated.

What is NOT auto-resolved: anything that is not an append. If the `_readme` block differs
between the sides, or any entry present in the MERGE BASE is missing from either side (an edit
or a removal), the resolver refuses and the branch stays conflicted. `jq --tab` round-trips
this file byte-identically, which is measured, so the result keeps the shape the reader
imports.

## What was built: `auto_resolve` in `integrate.yml`

Between `# auto_resolve_marker:begin`/`:end`, five functions, cut and driven by the proof
harness the way `ledger_gate` already is.

**The hunks are resolved by GIT, and there is no marker parser in this bundle.**
`git merge-file --ours` and `--theirs` run the same three-way merge over the same three index
stages and differ ONLY where that merge conflicted -- a hunk both sides merged cleanly comes
out identical in both. So requiring the two outputs to be BYTE-IDENTICAL from the top of the
file down to the begin marker, and from the end marker to the last byte, PROVES every conflict
lay strictly between them. A prose conflict above the block makes the prefixes differ and the
resolver returns 1. That is why "only inside the generated region" is a fact here rather than
a regex, and it is also why `=======` never has to be interpreted (it is a markdown setext
underline as well as a conflict marker, in a markdown file).

The rest of the shape:

- The allowlist is asked about EVERY unmerged path before a single one is touched. One path
  outside it and the whole merge is abandoned.
- The unmerged set is read NUL-delimited through `mapfile -d ''` with git's exit status riding
  back as a final record -- the same shape `ledger_gate` uses, for the same reason (`$(...)`
  drops NUL bytes).
- After resolving, nothing may carry `<<<<<<< `, `||||||| ` or `>>>>>>> `, and the index is
  re-asked for unmerged paths rather than assumed clean.
- On any refusal the caller runs `git merge --abort`, which is what makes a PARTIAL resolution
  safe: the resolver can write one file and then refuse on the next.
- Every resolution is named in the job summary under a new "Resolved mechanically" section,
  per branch and per file, with what was done.

The one thing it trusts from the tree is the generator it runs. `readme-counts.mjs` comes off
the MERGED tree and is therefore mutable by a session branch, unlike `integrate.yml`, which
GitHub always takes from the default branch. That is inherent -- regenerating a generated
region needs the generator -- and it is written down beside the call rather than left implicit.

## The five cases, executed

`tools/integrate-gate-proof.sh` was EXTENDED, not forked: the marker cut became a
`cut_marker` function (two copies of the cut is the duplication the cut exists to prevent one
level down) and a second half was appended. Each fixture repository gets `tools/browser-verify`,
`src/routes/dev` and `src/lib` copied from the WORKING TREE, so the generator that runs is a
session's own, and the branches move the counts by adding `/dev` pages -- a pure directory
count with no module to load.

Ten new assertions, all executed, `passed 37, failed 0` in **8.9s**:

| case | observed |
| --- | --- |
| 26. two branches each append to `classroom-updates.json` | RESOLVED |
| 27. every entry from both sides survived, in the file's own shape | all 3 present, `jq --tab` byte shape kept |
| 28. two branches each regenerate the counts block | RESOLVED |
| 29. the static region is the MERGED tree's answer, not either side's | `--static --check` green on the merged tree |
| 30. a conflict in the counts README's PROSE | CONFLICTED |
| 31. a conflict in `src/` | CONFLICTED |
| 32. an update log that is not valid JSON | CONFLICTED |
| 33. an entry the merge base carried, edited on one side | CONFLICTED |
| 34. renamed markers cut nothing (negative control) | empty |
| 0b. the workflow actually calls the resolver (structural, by grep) | four call-site strings found |

Case 28 is the one that needed care: two branches that each add exactly ONE `/dev` page
regenerate to the SAME number, git merges the identical text cleanly, and the case proves
nothing. The fixture adds TWO pages on one branch and one on the other so the region genuinely
conflicts, and the merged tree's answer (84 pages) is neither branch's.

**Mutation proof, both directions.** Widening the allowlist to admit `src/*` alone did NOT
redden case 31 -- the marker check downstream still refused it, which is defence in depth
working. Per CLAUDE.md, both layers were then opened together (allowlist widened, marker check
removed, and a `src/*` arm added that takes a whole side): case 31 went RESOLVED and reddened.
Separately, dropping the two `cmp` comparisons that confine the counts fix reddened case 30.
Both mutations were restored from a `cp` copy taken beforehand -- never `git checkout --`,
which discards uncommitted work -- and `.github/workflows/integrate.yml` md5s back to
`eb32e40e1468c135e7041e85d7822c02`.

## `tools/deploy-probe.mjs`

It writes nothing, ever: every statement is a `select` over `pg_catalog` inside
`set transaction read only`, and it writes nothing to the repository either. Its own header
says so.

**The derivation is not duplicated.** `tools/idea-status.py` already turns a migration file
into a catalog probe -- the first object it creates, plus a body marker for a function another
migration in the range also defines -- so the probe RUNS that tool (`--json --local`) and reads
its `probes` array. It accepts exit 1 from it, because that tool exits 1 when two migrations
define one object, which is a finding and not a failure.

**Three probes were moved off `information_schema`**, and they are exactly the three
`alter table ... add column` migrations in range:

| migration | object |
| --- | --- |
| 0170 | `column public.app_feedback.tried` |
| 0171 | `column public.classroom_submissions.extra_credit` |
| 0173 | `column public.classroom_sections.foundry_closed_at` |

`toCatalogOnly` rewrites that one shape into the `pg_attribute` equivalent, from the same three
SQL literals the derivation already put in it, and REFUSES anything else naming
`information_schema` rather than guessing at a rewrite. `tools/idea-status.py` itself was not
edited: it is not this bundle's to own, and the translation is a consumer's, not a second
derivation. `node tools/deploy-probe.mjs --print-sql` over the real range emits **zero**
occurrences of `information_schema`.

### The measurement that decides it

On a throwaway PostgreSQL 16.13 with a stand-in production schema and exactly the role this
ships with (`login`, a password, `connect` on the database, nothing else):

| question | grantless role | owner |
| --- | --- | --- |
| `information_schema.columns` sees `app_feedback.tried` | **false** | true |
| `pg_attribute` sees `app_feedback.tried` | **true** | true |
| rows in `information_schema.columns` for schema `public` | **0** | -- |
| rows in `pg_class` for schema `public` | 12 | -- |

All three column probes answered `false` in their `information_schema` form and `true` in the
`pg_catalog` form, against the same database in the same second. A deploy built on the first
would have refused forever with nothing on screen saying why.

### Fail closed

Four exit statuses, every one exercised against that database:

| exit | meaning | observed |
| --- | --- | --- |
| 0 | every migration in range applied | `--since 178 --ref origin/main` |
| 2 | at least one NOT applied | `--since 151`: 25 applied, 4 not, 3 unknown |
| 3 | applied where it could ask, but a migration has no probe | `--since 177` (0177 is a tombstone) |
| 1 | could not run: no credential, unreachable, query error | all three tried |

It prints per migration and never a bare count. A migration with NO probe contributes no row
to the query, so it can never come back `true` by accident; a probe that was sent and got no
row back is `unknown` too.

**The connection string is never printed.** It is passed to `psql` in an `execFile` argument
list with no shell anywhere on the path, and `redact()` strips both the whole URL and the
password on its own out of anything the tool prints. Verified: an error text carrying both
comes back as `<connection string>` and `<redacted>`.

**A real finding fell out of building it.** `0179_classroom_roster_avatar.sql` is on
`origin/integration` and NOT on `origin/main`, while `0177_reserved_number_tombstone.sql` is
on `main` and not on `integration`. CLAUDE.md says migration work happens on `main` and never
on a branch, so the probe reports a migration present only on the candidate as
`CANNOT SAY -- only on <ref>, not on origin/main`, rather than silently probing a set that is
missing one. That is worth somebody's attention independently of this bundle.

## `deploy.yml`

Four jobs now: `guard`, `migrations`, `checks`, `deploy`. All three gates or it does not run,
and each is a separate `needs`, so a failure or a skip in any of them takes the deploy with it.

- **`schedule` at 10:00 UTC (03:00 Pacific), plus `workflow_dispatch`.** The night window is
  what decision 0010 was about; the probe is what removes its stated blocker.
- **The typed confirmation is now OPTIONAL and is the fallback.** Empty means "let the probe
  answer". A non-empty string that does not match is still refused before any check runs. It
  carries exit 1 and exit 3 -- the cases where the machine is silent -- and only on
  `workflow_dispatch`.
- **Exit 2 is refused on every trigger and no typed string overrides it.** It is a
  machine-read fact about production: the code about to go live calls something the database
  does not have.
- **Nothing to deploy is GREEN.** `integration` level with `main` is the ordinary state on
  most nights, and a red mark on most nights is a red mark nobody reads.
- **A scheduled run the probe cannot speak for STOPS and stays green** (`go=no`), for the same
  reason. A dispatched one with nothing typed is red.

The decision was driven end to end against the fixture database, nine runs, by extracting the
job's own script from the YAML:

| case | step exit | `go=yes` |
| --- | --- | --- |
| probe 0 (all applied), schedule | 0 | yes |
| probe 2 (one NOT applied), schedule | 1 | no |
| probe 2, dispatch WITH the typed line | 1 | no |
| probe 3, schedule | 0 | no |
| probe 3, dispatch, nothing typed | 1 | no |
| probe 3, dispatch, typed | 0 | yes |
| probe 1 (no secret), schedule | 0 | no |
| probe 1, dispatch, typed | 0 | yes |
| probe 1, dispatch, nothing typed | 1 | no |

The refusal summary for exit 2 came out 1226 lines, carrying `0158`, `0165` and `0166` in
`<details>` blocks with their full SQL. That is the whole of what is left for a person: paste
and run.

## What Mr. Pina has to do, once

In the Supabase SQL editor, as the project owner:

```sql
create role deploy_probe login password '<a long random password>'
  nosuperuser nocreatedb nocreaterole noinherit;
grant connect on database postgres to deploy_probe;
```

**Nothing else. No `usage`, no `select`, no schema grants.** Every probe reads `pg_catalog`,
which is readable by PUBLIC and is not privilege-filtered; a grant added here would only widen
what a leaked string reaches. This is NOT a migration and must not become one: it carries a
password and migrations are committed to a public repository.

Then, in GitHub, **Settings -> Secrets and variables -> Actions -> New repository secret**,
named exactly:

```
DEPLOY_PROBE_URL
```

with the value:

```
postgresql://deploy_probe:<the password>@<project host>:5432/postgres?sslmode=require
```

Optionally, on the **Variables** tab beside it, `DEPLOY_PROBE_SINCE` -- the lowest migration
number the probe asks about. Unset takes `tools/idea-status.py`'s own default of 151. It is
there so the watermark can be moved past a migration with no probeable object (a tombstone, a
data-only fix) without editing a workflow, and every run prints the window it used and every
row it read.

**One thing to check at setup time, which cannot be checked from here:** GitHub's runners are
IPv4-only and Supabase's direct database host resolves to IPv6 on projects without the IPv4
add-on. If the first run reports a connection failure, the session pooler's host and port are
the answer, and the workflow prints `psql`'s own (redacted) error, which will say so. The
probe fails CLOSED on that, so a misconfigured secret stops a deploy rather than passing one.

## Decision 0010

Its Status line now records the transition: raised 2026-09-02, answered "not yet" for a stated
blocker, approved by Mr. Pina on 2026-09-03, implemented here. Nothing above it was rewritten.
Note that the file is `docs/decisions/entries/10-unattended-nightly-deploy.md` -- the prompt
named `0010-*.md`, and this directory numbers its entries with two digits.

## Verification

- `npx svelte-check`: **0 errors, 37 warnings**, breakdown **31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`** -- the baseline, re-derived rather
  than trusted, after `npx svelte-kit sync` with `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY`
  exported as placeholders (this checkout has no `.env`, which is the 11-phantom-error case).
  One real error was found and fixed on the way: `spawnSync`'s `error.code` is not on `Error`'s
  type.
- `tools/integrate-gate-proof.sh`: **37 of 37**, 8.9s.
- `tests/workflows.test.ts`: **36 of 36**. Every new assertion was mutation-checked and bites
  (widened allowlist, removed schedule, a typed confirmation allowed to override a NOT-APPLIED
  migration, the below-the-block prose confinement dropped).
- `npm run check` (`svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`): **2924 files,
  0 errors, 37 warnings, 20 files with problems** -- the same numbers as the bare
  `svelte-check` above, which is the point of running both.
- **Full suite: 260 files, 259 passed, 1 failed; 5419 tests, 5413 passed, 6 failed**, 269.6s.
  All six failures are in `tests/db/classroom-hall-pass-limits.test.ts` and are the
  time-of-day failures prompt 0034 measured and proved pre-existing: the cases backdate 60 to
  90 minutes and land on the previous America/Los_Angeles day. **The run started at 00:58
  Pacific (07:58 UTC on 2026-09-04)**, inside the 23:00-01:00 window the prompt named. They
  are not this bundle's -- it touches no `src/`, no migration and no database code -- and
  nothing was done to them.

## What was NOT verified, and will not be from here

- **The production path is entirely unexercised.** This session holds no credential, asked for
  none, and ran nothing against `ideabosco.com`'s database. Everything above was measured
  against a throwaway PostgreSQL 16 built in this container with a stand-in schema. Whether
  Supabase's host accepts this role, what its connection string has to look like, and what
  production's real applied set is are all unknown here.
- **Neither workflow change takes effect until `integration` reaches `main`.** GitHub runs the
  copy of a workflow that is on the DEFAULT BRANCH, for `workflow_run` and for `schedule`
  alike. The next Integrate sweep will still behave the old way, and the nightly Deploy will
  not exist at all, until a person merges. Do not read that as this failing.
- No browser pass and no dev server: this bundle changes no `src/` file and renders nothing.
- The local Supabase stack was not started and no migration was applied anywhere.

## Deferred

- `tools/idea-status.py` still emits the `information_schema` column probe for a person to
  paste into the SQL editor, where the caller is the project owner and the filter does not
  bite. Moving it to `pg_attribute` there would remove the translation in `deploy-probe.mjs`
  entirely, and it belongs to whoever owns that tool.
- `contained_delete_gate` and `target_push_gate` still have no in-repo harness; this bundle
  extended the one that exists rather than writing two more.
