---
title: "Every stated upload limit was fiction: twelve of fifteen buckets claimed a ceiling the Free plan's 50 MB global would never honour, so 0185 writes the true number into every one and the Foundry preflight drops from 75 MiB to 45 MiB (`claude/upload-limit-fiction-jv9w43`, migration 0185, NOT APPLIED)"
date: 2026-09-06
branches: [claude/upload-limit-fiction-jv9w43]
migrations: ["0185"]
subsystems: ["Foundry", "Classroom", "Storage", "Toolchain"]
---

Prompt 0064 built the upload-ceiling registry and made every refusal name its
ceiling. It could not make them name the RIGHT ceiling, because the number was
in a Supabase dashboard nothing in this repository can read. Mr Pina read the
dashboard on 2026-09-05 and it settles it: the project is on the FREE plan,
whose global upload file size limit is **50 MB and fixed**.

Against that, twelve of the fifteen buckets were stating something untrue.

**THE HEADLINE, SAID FIRST BECAUSE IT IS THE ANSWER THAT MATTERS: THE MIGRATION
WAS NOT APPLIED, AND IT WAS NOT EVEN ATTEMPTED.** Two independent blockers, both
measured, neither worked around. Details in "What was not verified" below. The
migration file, the code change, the tests and the harness are all on the branch;
nothing went to `main`.

## Phase A -- the audit

**A1. Every bucket's `file_size_limit`, read from the chain rather than
remembered.** Measured by running `bucketLimitsFromChain()` (the parser inside
`tests/upload-limits.test.ts`) against the migration directory with 0185 removed,
under `node --experimental-strip-types`:

| bucket | chain says | vs the 50 MB global | dashboard |
| --- | --- | --- | --- |
| `classroom-attachments` | 209715200 (200 MiB) | **ABOVE** | 200 MB |
| `submission-files` | 209715200 | **ABOVE** | 200 MB |
| `instructor-attachments` | 209715200 | **ABOVE** | 200 MB |
| `avatars` | none | **UNSET** | Unset (50 MB) |
| `gauntlet` | none | **UNSET** | Unset (50 MB) |
| `gauntlet-drawings` | none | **UNSET** | Unset (50 MB) |
| `gauntlet-models` | none | **UNSET** | Unset (50 MB) |
| `gauntlet-tools` | none | **UNSET** | Unset (50 MB) |
| `tournament-thumbs` | none | **UNSET** | Unset (50 MB) |
| `foundry-uploads` | none | **UNSET** | Unset (50 MB) |
| `foundry-bundles` | none | **UNSET** | Unset (50 MB) |
| `foundry-covers` | none | **UNSET** | Unset (50 MB) |
| `maps-media` | 20971520 (20 MiB) | AGREES | 20 MB |
| `feedback-media` | 8388608 (8 MiB) | AGREES | 8 MB |
| `greenline-decals` | 1048576 (1 MiB) | AGREES | 1 MB |

Three above, nine unset, three true. **The tree and the dashboard agree exactly,
bucket for bucket**, which is worth recording: the ledger's dashboard reading was
taken as a claim and came back confirmed by an independent derivation.

**Which layer refuses first when a bucket claims more than the global.** Reasoned
from Storage's documented behaviour and NOT tested, because nothing in this
container can exercise the hosted service. The project-wide limit is applied by
storage-api ahead of the per-bucket one, so the global is what refuses and the
bucket's larger number is never consulted. What the caller gets is a 413 with
storage-api's own wording, not ours; `uploadFailureMessage` already maps a 413
onto a sentence, but before this bundle the sentence for `foundry-uploads` had no
number in it to give, because the registry correctly recorded `maxBytes: null`.
That is the shape a student described as "failed upload".

**A2. `FOUNDRY_LIMITS` and its readers.** 75 MiB zipped / 110 MiB unpacked /
1500 files / 5 MiB warn, set by prompt 0014 on a measured-memory argument.
Verified: 0014's figures are as claimed. Read by `preflight.ts` itself (the zip
check, the file-count check, the uncompressed-cap message, the build contract),
`preflight-browser.ts`, `FoundrySubmit.svelte`, `supabase/functions/foundry-ingest/index.ts`,
and three test files.

**Is 110 MiB unpacked still coherent once the zip can never exceed 50 MB?** Yes,
and the reasoning is written into `preflight.ts` beside the constant. The two are
different axes: the zip cap bounds the wire and Storage, the unpacked cap bounds
what the ingest function holds in memory, and neither implies the other. Text and
JavaScript inflate four to ten times, so a 45 MiB source archive can still cross
110 MiB and the unpacked cap still bites; PNG and MP3 barely compress, so the zip
cap binds first there. Both retain cases where they are the refusing one. And the
worst-case resident set 0014 reasoned about FALLS from ~185 MiB (75 + 110) to
~155 MiB (45 + 110), so its argument is left with more headroom, never less.
`maxTotalBytes` was therefore not moved.

**A3. What a real bundle weighs: UNKNOWN, and it stays unknown.** There is no
committed record of published bundle sizes anywhere in the repo, and the only
channel to production is `tools/apply-migration.mjs`, which applies files and does
not answer questions. So the census was written INTO 0185 as a report-only
`raise notice` block over `student_app_versions.byte_size` (count, median, p90,
max, and how many exceed the new ceiling), guarded on the table existing. It
prints the moment the file is applied. **It has not printed**, because the file
has not been applied. Verified locally that the block runs and reports correctly
both over an empty table and over a seeded one.

Note the census reports the UNPACKED total, which is an over-estimate of the zip:
`student_app_versions` has no column for the archive's own size.

**A4. `maps-media`'s mime list: 0057's finding is now WRONG, and 0072's
correction is right.** 0163 did create the bucket with `array['image/*']`, which
does admit `image/svg+xml`. **0168 replaced it** with the six concrete raster
types (`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`,
`image/avif`) and asserts at apply time that no wildcard and no SVG spelling
survives. The dashboard reading matches the tree. So the answer is: SVG is
refused, the wildcard is gone, and any statement to the contrary is stale.

**One such statement is still live and this bundle did not own the file to fix
it.** `CLAUDE.md` still says, under IDEA Maps: "THE BUCKET'S `image/*` WILDCARD
ADMITS SVG AND THE CLIENT REFUSES IT ANYWAY ... closing it properly is a
migration replacing the wildcard with a concrete raster list, **which no bundle
has written yet**." 0168 wrote it. That paragraph should be corrected in place by
whoever next owns `CLAUDE.md`.

**A5. The counts block.** `npm run verify:counts` reports the static region
already current: 116 route specs over 57 distinct routes, 86 `/dev` pages,
2 widths, 232 runs. Nothing was written, because this bundle added no spec file --
it edited an existing one.

The measured region is from a full run at `4ecf48f` and covers **107** of the
tree's **116** specs. The nine it never measured, named by the tool itself:
`composer-draft.mjs`, seven `greenline-portal*.mjs`, and **`upload-limits.mjs` --
this bundle's own spec**. So the measured half cannot speak for this surface at
all, before or after the change. Rows are identified by filename (`routes.mjs`
derives a spec's identity from its own `path` and refuses a file whose name does
not match, so two specs can never share one), and the two outside-threshold rows
are `/dev/notebook` @375 and @1440, both `tap-reach`, both the toolbar text
controls decision 12 left with the owner. Unchanged by this bundle.

## Phase B -- what was built

**B1. `supabase/migrations/0185_bucket_limits_under_the_global.sql`.** One
statement of change:

```sql
update storage.buckets
set file_size_limit = least(coalesce(file_size_limit, 47185920), 47185920);
```

No table, no function, no policy, no view, no index, no grant. Unqualified on
purpose: `least(coalesce(...))` over every row is strictly more complete than a
list of fifteen ids, and it CANNOT RAISE anything, which is what leaves 1 MiB,
8 MiB and 20 MiB exactly where they were. Its self-check reads every row back and
raises rather than committing on three conditions -- a row above the global, a row
stating nothing at all, and a row under the global but above the portal ceiling
(the last matters because a row at 49,000,000 would satisfy the global and still
be a number the client preflights disagree with).

**IT CHANGES NO UPLOAD OUTCOME**, which is the property that makes it safe to
apply during a term: every ceiling it writes is at or below one the platform was
already enforcing. The single exception is the one that is the point -- a Foundry
zip between 45 MiB and the global, which today transfers in full and is refused at
the far end, and which is now refused in the browser instead.

**B2. The Foundry ceiling: 75 MiB -> 45 MiB (47,185,920 bytes).** The arithmetic,
in 0014's own shape and written down in `PORTAL_UPLOAD_MAX_BYTES`:

1. **The binding global is 50,000,000, not 52,428,800.** "50 MB" is ambiguous --
   read as MiB it is 52,428,800, read as decimal MB it is 50,000,000 -- and
   nothing available to this session settles which. Every consumer is a CEILING,
   and a ceiling read too high is exactly the defect this bundle exists to end, so
   the smaller reading binds and ~2.4 MB of possible headroom is left on the table
   deliberately.
2. 45 MiB is 94.4% of that, leaving **2,814,080 bytes**.
3. The margin has to absorb the REQUEST ENVELOPE and not just the file:
   supabase-js wraps a Blob in a `FormData` in the browser, so what crosses the
   wire is the zip plus a multipart boundary, two part headers and a
   `cacheControl` field -- under a kilobyte, three orders of magnitude inside the
   margin. The tree already leaves headroom for precisely this: the notebook photo
   path refuses at 3.6 MiB in the browser against a 4 MiB route cap.
4. It renders as "45 MB" through `formatCap`, matching the MiB convention every
   other limit uses, so a student reads a round number and not 47.2.

**Why not closer to the global.** A couple more megabytes of app spends the whole
of the margin that makes the number true under both readings, to buy a refusal
that arrives after a full transfer over school wifi instead of before one.

**THE NUMBER IS RESTATED IN THREE PLACES AND THAT IS FORCED.** `preflight.ts`
cannot import the registry: it is imported by `supabase/functions/foundry-ingest/index.ts`,
a Deno isolate that resolves relative `.ts` paths and cannot resolve a `$lib`
alias, and `$lib/upload-limits` imports `$lib/classroom/upload-errors` in turn. So
the constant, the registry row and the bucket row are pinned to each other by
`tests/upload-limits.test.ts` and `tests/db/bucket-limits.test.ts` instead.

**B3. The registry states the global once.**
`SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES` and `PORTAL_UPLOAD_MAX_BYTES` in
`src/lib/upload-limits.ts`, with the ambiguity and the arithmetic beside them. A
Pro upgrade is those two constants plus a migration, not a hunt. Every row's
`maxBytes` is now its enforcing module's number capped at the portal ceiling, and
**no row carries `null` any more** -- it was five.

`PROJECT_CEILING_SENTENCE` and its branch are KEPT as a tripwire rather than
deleted. No row can reach it today, which is asserted; a bucket added tomorrow
with no `file_size_limit` puts a row back in that state, and the sentence is what
it should then say.

## What was measured, and how, given no `npm`

`npm ci` cannot run in this container (see below), so `npm test`, `svelte-check`
and `npm run verify:browser` were all unavailable. **A real PostgreSQL 16.13 is
installed at `/usr/lib/postgresql/16`**, and it was used to run the DB test's
scenarios by hand against the real SQL. This is a LOCAL database; nothing was run
against production.

* **The migration, over the fifteen buckets seeded at their pre-0185 values.**
  Applied clean. The three 200 MiB rows became 47185920, the nine unset rows
  became 47185920, and `greenline-decals` (1048576), `feedback-media` (8388608)
  and `maps-media` (20971520) came through **untouched** -- the direction that
  proves `least` cannot raise, and the one a plain assignment would have failed.
  Final notice: `15 bucket(s), every one stating a limit, none above 47185920
  bytes (45 MiB) and none above the 50000000 byte global.`
* **The migration over data a REAL migration wrote.** Chain `0001` + `0003` +
  `0020` on the real stub: `avatars` is genuinely `NULL` after 0020 (the positive
  control), and 47185920 after 0185.
* **REQUIRED CONTROL 1 -- the self-check refuses a bucket above the global.**
  Driven by extracting the self-check between its own markers from the shipped
  file, so the text under test is the text that ships. Negative control first:
  silent on the database 0185 just left. Then three distinct refusals:
  * `209715200` -> `0185 REFUSES: 1 bucket(s) still state a limit above the 50000000 byte global: fiction-bucket = 209715200.`
  * `null` -> `0185 REFUSES: 1 bucket(s) still carry no file_size_limit at all: unstated-bucket.`
  * `49000000` -> `0185 REFUSES: 1 bucket(s) exceed the portal ceiling of 47185920 bytes: nearly-bucket = 49000000.`
* **The whole file over those same rows sweeps them instead of refusing** (the
  unqualified update reaches them), and **re-applying is a no-op**: the row set
  after a second apply is byte-identical to the first.
* **REQUIRED CONTROL 2 -- the message follows the constant.**
  `PORTAL_UPLOAD_MAX_BYTES` and `FOUNDRY_LIMITS.maxZipBytes` were mutated 45 MiB
  -> 30 MiB and both sentences moved with them ("the limit for an app upload for
  the Foundry is 30 MB", "The zip is 60.0 MB. The limit is 30.0 MB"), so neither
  is a literal. The same mutation makes the registry-vs-bucket sweep report
  **7 problems**, so that assertion bites in the other direction too. Both files
  were restored from `cp` copies and md5-verified identical
  (`bfb962a1163382020fef174dc609dea6`, `7ae45e18d9b4c282faaefa0994076d63`). No
  `git checkout --` was run at any point.
* **Both directions on every registry row**: at the ceiling returns null, one
  byte over returns a sentence, 13 of 13, 0 failures.
* **The chain parser against real Postgres.** The static parser in
  `tests/upload-limits.test.ts` and the real database produce **byte-identical**
  fifteen-row results. That is what makes the second implementation of `least`
  safe: something fails when they disagree.
* **A parser bug found and fixed on the way.** The sweep was inventing a
  sixteenth bucket called `id`, from the `(id)` in `on conflict (id) do update`.
  Pre-existing (confirmed against `origin/integration`), harmless while every
  assertion only looked up buckets the registry named, and NOT harmless once a
  sweep walks the whole map asking whether any bucket is left unstated. The tuple
  scan now stops at `on conflict`.
* **Syntax**: every edited `.ts` file parses clean under `tsc 6.0.2`
  (`--noResolve`, so only unresolved-import diagnostics remain); the Svelte page's
  script block parses clean and its template's braces balance; the browser-verify
  spec parses as a module (7 presence rows, 12 text rows, 4 contrast rows).

## What was NOT verified, and why

**1. `npm ci` CANNOT RUN IN THIS CONTAINER. The npm registry is blocked by the
network egress policy.** Measured:

```
$ curl -sSI https://registry.npmjs.org/
HTTP/2 403
x-deny-reason: host_not_allowed
Host not in allowlist: registry.npmjs.org. Add this host to your network egress
settings to allow access.
```

Every tarball and the metadata endpoint alike. `node_modules` is empty, the npm
cache holds 256 packages from an unrelated project (of this tree's dependencies
only `playwright-core@1.56.1`), and `npm ci --offline` fails `ENOTCACHED`. The
README at `/root/.ccr/README.md` is explicit that a 403 from the egress proxy is
to be reported and not routed around, so no alternate registry or mirror was
tried. Consequently **NOT RUN**:

* `npm test` -- no vitest, no embedded Postgres. **The two test files this bundle
  wrote and edited have never executed.** Their logic was exercised by hand
  against a real Postgres and a real `node --experimental-strip-types` run, as
  above, but that is not the same thing as the suite going green.
* `npx svelte-check` -- so the **0 errors / 37 warnings** baseline and its 31/5/1
  breakdown are UNCONFIRMED for this tree. No number is reported for it. (Note
  that a checkout with no `.env` reports 11 phantom errors anyway; that is not the
  reason it was not run.)
* `npm run verify:browser` -- needs the dev server, which needs vite. The
  `/dev/upload-limits` visual pass at 375 and 1440 was **not run**, so no measured
  contrast, geometry or tap-target number is reported for the changed panel. The
  spec was updated to match the new page and parses, but has not been executed.
  Chromium is present at `/opt/pw-browsers`; it is the toolchain that is missing,
  not the browser.

**2. THE MIGRATION WAS NOT APPLIED, AND `tools/apply-migration.mjs` WOULD REFUSE
IT EVEN IF IT COULD RUN.** Two independent blockers:

* **The tool cannot start.** `node tools/apply-migration.mjs 0184 --dry-run`
  (chosen because it is already applied and would therefore write nothing) fails
  before any connection with
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg' imported from
  /home/user/idea-app/tools/apply-migration.mjs`. So **whether a cloud container
  can reach the pooler host is STILL UNPROVEN** -- this session did not answer that
  question either way, because it never got as far as opening a socket.
  `IDEA_MIGRATION_URL` was exported once, into that one command's environment, and
  never printed, echoed, written to a file or committed.
* **The probe cannot speak for the file, which is a REFUSAL BY DESIGN and is
  independent of the network.** Measured offline against the real derivation, with
  a positive control:

  ```
  first_object(0185) -> None
  first_object(0184) -> ('function public._gauntlet_run_event_cap', ...)
  ```

  `tools/idea-status.py`'s `first_object` derives a catalog probe from the first
  object a migration CREATES -- a function, table, view, index, policy, trigger,
  type, schema, extension, an added column or an added constraint. **0185 creates
  none of those**, because the prompt's own scope rule was "it writes
  `storage.buckets` rows and nothing else. No policy, no table, no function." With
  no probe, `verdicts()` returns state `unknown` and `orderVerdict()` refuses:
  *"the probe cannot say whether 0185 is applied. Cannot say is never a pass."*

  **This is a real collision between the bundle's scope rule and the tool's
  precondition, and it is the finding.** It was not worked around. The obvious
  workarounds were considered and rejected: a CHECK constraint on
  `storage.buckets` would be probeable and would make the invalid state
  unrepresentable, but every migration in this chain only ever INSERTs or UPDATEs
  rows in that table and never ALTERs it -- on Supabase the table is owned by
  `supabase_storage_admin` and `postgres` may well not be able to alter it, so the
  apply would likely fail outright on a live production database; and a function
  or a view is exactly what the prompt excluded. Widening scope silently, on the
  first migration a session has ever applied, to a live database holding real
  student work, is not a trade worth making without the owner.

  Two further facts for whoever applies it: the file is pure DML, so it needs
  **`--allow-dml`** (the tool classes top-level `insert`/`update` as a `warn`,
  releasable by that flag, not a refusal); and `idea-status.py` derives its probes
  from `git show origin/main:...`, so the file has to be on `origin/main` before
  the tool can see it at all.

**3. Nothing was applied, deployed, or pushed to `main`.** The prompt's
instruction was that the migration commit goes to `main`, on the precondition
that every test passes locally and the file is applied. Neither precondition can
be met in this container -- no test can run at all, and the apply is refused twice
over -- so **the whole bundle is on the branch and `main` was not touched**.
Pushing an unrun test and an unapplied, unappliable migration to the branch that
deploys `ideabosco.com` during class is precisely the risk this environment cannot
retire.

**4. The classroom browser guard is still 200 MiB, and this bundle did not own the
file.** `CLASSROOM_UPLOAD_MAX_BYTES` in `$lib/classroom/file-upload` is
209715200, so a classroom pick between 45 MiB and 200 MiB still passes the
browser and is refused by the bucket -- the Foundry defect, one directory over,
and now the last instance of it. It is asserted in that shape
(`still has a classroom browser guard looser than the classroom bucket`), so
closing it REDDENS that test, which is the intent: the fix is one constant, and
the reader is then told to delete the assertion rather than left wondering whether
the gap was deliberate.

**5. Stale prose about the old caps, in files this bundle did not own.**
`src/lib/foundry/zip-write.ts` (twice) and `src/lib/server/foundry-bundle.ts` each
describe the worst case as "75 MB unpacked", which was already stale before this
bundle -- 0014 raised the unpacked cap to 110 MiB and those sentences were not
updated. `foundry-bundle.ts`'s memory measurement (peak RSS 268 MB) was taken
against the OLD caps; with the zip cap now 45 MiB its worst case is smaller, so
its conclusion holds with more margin, but the number in it is not this tree's.

## Deferred

* Applying 0185. It needs either a probeable object added to the file (a scope
  decision), or a hand-paste into the Supabase SQL editor by Mr Pina.
* Lowering `CLASSROOM_UPLOAD_MAX_BYTES` to the portal ceiling (item 4).
* Correcting `CLAUDE.md`'s stale `maps-media` SVG paragraph (item A4).
* Raising the global, which is a Pro plan decision and Mr Pina's. When it moves,
  the two constants in `src/lib/upload-limits.ts` and a new migration are the
  whole of it; three tests name every other statement of them.
