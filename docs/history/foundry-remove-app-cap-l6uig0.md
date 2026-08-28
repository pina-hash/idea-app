---
title: "The five-app cap is gone, and a student can take their own build home (`0141`)"
date: 2026-08-28
branches: [claude/foundry-remove-app-cap-l6uig0]
migrations: ["0141"]
subsystems: ["IDEA Foundry"]
---

## The five-app cap is gone, and a student can take their own build home (`0141`)

Two changes to IDEA Foundry that share a migration filename and almost nothing
else. `foundry_create_app` no longer counts a person's apps, and there is a new
portal-origin route that hands the author (or an admin) one whole version of a
bundle as a zip.

### The cap

`foundry_create_app` in `0130_foundry.sql` counted a caller's non-hidden apps
and raised at five. Nothing after 0130 had redefined the function -- checked
before anything was written, and 0130 is the only file in the tree that names it
at all -- so `0141` is a straight `create or replace` of 0130's body with the
count and the raise removed and every other line verbatim. The signature, the
normalizer, the slug rule, the name gate, the required build notes, the returned
jsonb and the grants are 0130's; a reader diffing the two should find the count
and nothing else.

Five was a guess about how many apps a student would publish in a year, made
before anybody had published one. It is not a resource limit -- the real ceilings
are per VERSION and are enforced where the bytes are -- and it is not moderation,
because every app still passes the same review queue. What it did was refuse a
student a slot at the point where they had already built the thing.

**The capacity lock stays, and its comment is what changed.** `perform 1 from
public.profiles p where p.id = v_uid for update` was written for the count: there
is no child row to lock for a caller who does not hold one yet, so the person is
the parent. With nothing being counted the honest question is whether it has
another job, and the answer is yes but narrower than it looks. The function still
contains a read-then-write -- the slug `exists`, then the insert -- and the lock
serializes that pair FOR ONE PERSON, so a double-submitted form gets the
considered "The address ... is already taken" instead of a constraint error.

That is measured rather than argued. `tests/foundry-app-cap.test.ts` runs two
genuinely concurrent transactions on one seed user racing for one address, with
T1 holding the lock until `pg_stat_activity` shows T2 actually waiting on it
(polled, not slept -- a timing-shaped test passes on the broken code whenever the
burst happens not to overlap). **With the lock, T2 answers `The address
"raced-address" is already taken.` Removing the `perform` line and re-running,
T2 answers `duplicate key value violates unique constraint
"student_apps_slug_key"`** -- a storage-vendor sentence naming a table, in front
of a student, which is what the repo's copy rules exist to prevent. The migration
file was restored md5-identically afterwards and re-verified green.

**It is emphatically NOT how slug uniqueness is guaranteed, and it never was.**
The lock is on the caller's own profile row, so two DIFFERENT people racing for
one address are not serialized by it at all. What guarantees uniqueness is `slug
text not null unique` on the column (0130 section 2), a real unique index that
serializes every caller regardless of who they are. The same mutation run
confirms the direction: with the lock removed, every other assertion in the file
-- the cap's absence, both slug refusals, the raw-insert constraint test -- stayed
green, and only the two lock assertions moved. The header says this in words
because "the lock is what keeps slugs unique" is the misreading that would cost
something later.

The alternative that would cover both cases is an exception handler around the
insert re-raising the considered refusal on `unique_violation`. It is
deliberately not in this file: it changes error semantics for every caller and
wants its own migration with its own answer for a client already reading the
current messages. This file removes a check; it does not rewrite refusals.

**The grants are restated naming all four roles**, per 0137's header, so the end
state does not depend on which default privileges the database carries -- and so
it does not matter whether a `create or replace` over an existing function
inherits that function's ACL or takes a fresh set of defaults. The test reads
`has_function_privilege` off the catalog for `anon`, `authenticated`,
`service_role` and `public`, with `foundry_list_apps` as the positive control so
a chain where every privilege answered false could not pass the sweep vacuously.
0141 sits AFTER 0137 in the test chain, which is where a fresh `anon` grant would
have gone unnoticed.

### The download

**What it hands over is what RUNS**, rebuilt per request from `student_app_files`
and the bytes in `foundry-bundles`, never the raw upload.

The raw upload was checked first, because the decision only means something
against what the alternative actually is. **A raw zip exists for EVERY version,
not only for versions uploaded as a zip**: `student_app_versions.zip_path` is
`not null`, and `normalizeFoundryInput` packs a picked folder or a single HTML
file into a zip in the browser before anything is sent, so the three input shapes
are one input shape by the time a row exists. (`foundry-uploads` also has no
SELECT policy of any kind, so no client -- the owner included -- can read their
own upload; only `service_role` reaches it.) It is still the wrong thing to hand
back: ingest decides what comes out of an archive, so the upload contains files
nothing serves and a layout nothing runs, and it does not round-trip, because it
is the INPUT to a transformation rather than a fixed point of it. That is the
source viewer's argument -- a reviewer reading the upload is reading something
nobody will execute -- applied to an author.

**The gate is `previewViewerMayRun`, the same predicate the preview mount uses,
not a second copy of it.** Downloading a build and running a build are the same
question about the same three rows. A student takes any version of an app they
own at any status; an admin takes any version of any app; a shelved app is
refused to its OWNER and served to an ADMIN, matching 0130 refusing the owner's
edit of one and 0136 their delete. **Nobody else gets anything, deliberately**:
peer download is a different question about student work and nobody has asked it.
The route says so in words so the absence does not read as unfinished.

Because it is one gate, the surface mirror is one function: `foundryDownloadable`
is `foundryPreviewable` **by assignment**, and the test asserts
`toBe(foundryPreviewable)` rather than re-deriving the clauses -- so "they cannot
drift" is mechanical. It exists as a name only because `{#if
foundryPreviewable(app, v)}` above a Download button reads as a copy-paste
mistake somebody would "fix" by spelling the condition out.

**It answers on the PORTAL origin, and refuses on the apps origin explicitly**,
following the preview route rather than inventing a second answer:
`foundryOnAppsOrigin(url.origin)` and out. The implicit refusal (no session
there, so no viewer) would work today and rests on the session cookies being
host-only, which is a property of `@supabase/ssr`'s defaults rather than of this
feature.

**It runs nothing, so it needs no sandbox.** Preview has to state the strict CSP
`sandbox` set because it executes a student's document on the cookie-carrying
host; this is an `application/zip` attachment, so no document is created and
there is no origin for script to run in. `nosniff`, the attachment disposition,
`private, no-store`, `no-referrer` and `noindex` are stated on the response
rather than inherited.

The filename is `<slug>-v<ordinal>.zip`. The address rather than the title,
because a title is free text carrying spaces, punctuation and any script Unicode
has, while `_foundry_slug_ok` already constrains the slug to lowercase letters,
digits and hyphens -- ASCII by construction, so no `filename*` parameter. The
ordinal is there because a downloads folder is a flat namespace and two builds of
one app are otherwise the same name with a browser-invented `(1)` between them.
`foundryDownloadFilename` re-applies the slug charset anyway: the value is
interpolated into a response header and the route reads it through a service-role
client that bypasses every check RLS would have made.

### Size, measured rather than reasoned about

**`zip-write.ts` BUFFERS.** Every entry is compressed into memory and the whole
archive is concatenated into one array, so the resident set is the input plus the
output rather than one entry at a time.

Measured with `buildZip` itself, on Node 22.22, at the caps' worst case -- 1500
files, 75 MB unpacked, which is the largest bundle `FOUNDRY_LIMITS` permits to
exist:

| bundle | archive | build | peak RSS |
|---|---|---|---|
| 75 MB, fully incompressible | 75.2 MB | 3.48 s | **268.2 MB** |
| 75 MB, half compressible (source + PNG/woff2, the realistic shape) | 37.7 MB | 2.42 s | **223.7 MB** |

Against a Vercel Node function's 1024 MB that is comfortable, so **no new cap is
added and no existing one is raised.** A download limit below the upload limit
would refuse an app that legitimately exists, and every version in the table is
already under `FOUNDRY_LIMITS` by construction.

**What would bite first is DURATION, not memory**: 1500 files is 1500 Storage
round trips. They are issued at concurrency 8 rather than serially for that
reason. If a byte cap is ever raised, the answer is a streaming writer (one entry
at a time, the deck reader's `ZipSource` shape), not a bigger function -- which is
now written into `zip-write.ts`'s own header, along with a correction: that header
said "the cap is 25 MB and 500 files" and `buildZip`'s doc said "a 25 MB cap",
both stale since the caps moved to 50/75/1500. The Zip64 conclusion was unchanged
(75 MB and 1500 entries are still nowhere near a uint32 size or a uint16 count),
only the distance to the boundary.

### Verified

- **`svelte-check`: 0 errors, 37 warnings, 31/5/1** -- baseline held, re-derived
  after `svelte-kit sync`. (The new route hit the known stale-generated-types
  trap first: 5 phantom errors about `./$types`, gone after a sync.)
- **Full suite before: 135 files, 3110 tests, 0 failures, 89.4s. After: 137
  files, 3150 tests, 0 failures.** The 40 new tests are the two files below.
- **`npm run verify:browser`: 20 route/width runs, 146 measurements, 2 outside
  threshold** -- unchanged from baseline, and the 2 are the known `/dev/pathways`
  harness-control tap targets (26.2px) at both widths.
- **The new controls, measured directly** in the harness Chromium at 375px and
  1440px with transitions killed, since `tools/` is out of this session's scope
  and the two routes carrying them could not be added to the harness's route
  list:

  | control | size | min dim | contrast |
  |---|---|---|---|
  | `FoundryInspector` "Download this build" (`/dev/foundry-gallery`) | 208 x 45.4px | 45.4px | 8.28:1 |
  | `FoundryMine` "Download vN" (`/dev/foundry-forge`) | 138.8 x 45.4px | 45.4px | 7.97:1 |

  0px horizontal overflow on both routes at both widths; the one console error at
  each is the harness-blocked `fonts.googleapis.com` request the runner itself
  reports as ignored.
- **The shared predicate, measured on the surface**: driven across all three
  forge fixture apps, the Run-a-preview and Download counts are equal for every
  one (5/5, 1/1, and **0/0 on the shelved app**), which is the surface-level
  evidence that one predicate drives both.
- **Mutation proof of the download gate, permissive direction.**
  `previewViewerMayRun` replaced with `return true`: **6 of
  `tests/foundry-download-route.test.ts`'s refusal assertions redden** (a second
  student's bundle, a second student's unpublished build, the not-found
  indistinguishability, the cross-app version pairing, an admin's two
  positive/negative pairs). Two refusals stayed green and are meant to -- the
  no-session and apps-origin cases are refused independently, before the gate,
  which is the defence in depth working. `foundry-bundle.ts` restored
  md5-identically and re-verified green.
- **Mutation proof of the lock**, above.
- **The round trip is asserted, not assumed**: the route's response is read back
  through `./zip.ts` -- the same `readCentralDirectory` / `inflateEntry` the
  preflight and `foundry-ingest` use -- and every path and every byte compared
  against the stored rows, on a fixture with binary files (a PNG, a woff2, an
  ico) so a writer that mangled bytes could not pass.

### NOT verified

- **The migration has not been applied.** Nothing in this session can reach the
  live project; it is proven only against the real chain on embedded Postgres.
- **No real Supabase Storage round trip.** `downloadBundleZip`'s non-dev branch --
  the two row reads, the bounded-parallel object fetch and the failure path -- is
  exercised only through the dev fixture. The gate, the archive and the headers
  are the real code; the client under them is not.
- **The memory figures are `buildZip` on Node 22.22 in this container**, not a
  Vercel function under load. They bound the archive-building step, which is the
  part that buffers; they say nothing about what else is resident in a real
  invocation.
- **The 1500-file duration was not measured against real Storage latency**, only
  reasoned about, which is why concurrency 8 is a hedge rather than a tuned
  number. An app anywhere near the file cap is the first thing to watch.
- **No signed-in browser pass.** `/foundry/mine` and `/foundry/review` need a
  Bosco Tech Google session; the controls were driven through their dev
  harnesses, which mount the real components.

### Deferred

- **Adding `/dev/foundry-forge` and `/dev/foundry-submit` to the
  `verify:browser` route list.** They carry the owner-side control and are not
  covered by the runner; `tools/` was out of this session's scope, so the two
  controls were measured by hand instead.
- **A `unique_violation` handler in `foundry_create_app`**, which would give the
  considered refusal to two DIFFERENT people racing for one address as well as to
  one person's two tabs. It is a change to error semantics and wants its own
  migration.
- **Peer download.** Deliberately unanswered, not overlooked.
- **A streaming zip writer.** Not needed at the current caps, and named as the
  prerequisite for raising one.

### Files

- `supabase/migrations/0141_foundry_app_cap_and_download.sql`
- `src/routes/foundry/download/[appId]/[versionId]/+server.ts` (new)
- `src/lib/server/foundry-bundle.ts` (`downloadBundleZip`, `fetchBundleBytes`)
- `src/lib/foundry/bundle-url.ts` (`FOUNDRY_DOWNLOAD_PREFIX`,
  `foundryDownloadUrl`, `foundryDownloadFilename`, `foundryDownloadable`)
- `src/lib/foundry/zip-write.ts` (header corrections only)
- `src/lib/foundry/FoundryMine.svelte`, `src/lib/foundry/FoundryInspector.svelte`
- `tests/foundry-app-cap.test.ts` (new), `tests/foundry-download-route.test.ts`
  (new), `tests/foundry-policies.test.ts` (one comment)
