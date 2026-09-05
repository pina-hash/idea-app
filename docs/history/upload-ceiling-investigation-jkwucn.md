---
title: "The upload ceiling nobody can name: thirteen ceilings, five of them not in this repository, and a refusal that says which one stopped you (`claude/upload-ceiling-investigation-jkwucn`, no migration)"
date: 2026-09-05
branches: [claude/upload-ceiling-investigation-jkwucn]
migrations: []
subsystems: ["Portal shell", "Notebook", "IDEA Maps", "Foundry", "Feedback", "Classroom", "Browser harness", "Testing"]
---

Prompt 0064. An audit with a small build behind it, no migration, no database change,
no ceiling moved.

Started from `origin/integration` at `fdf8c688`; `origin/main` was `0ba816af` and is
strictly behind it. The container's git carried NO committer identity, so one was set
(`Claude <noreply@anthropic.com>`) before the first commit -- worth saying because the
failure it produces reads as a merge conflict and is not one.

Duplicate check ran and came back clean: no `docs/prompt-ledger/entries/0064-*` on any
ref, and `git log --all --diff-filter=A` over that glob returns nothing. The highest
ledger entry anywhere is 0052.

## What was reported, and what it turned out to be

Two reports from the same day's feedback pull, both `portal/bug`:

> "file size limit at 25 mb"

> "failed upload"

**There is no 25 MB limit in this repository, and the audit confirms the ledger's
sweep.** Every occurrence of "25 MB" under `src/` is nine lines of prose in comment
blocks -- `foundry-bundle.ts`, `maps/photo-prepare.ts`, `maps/ShelfEntry.svelte`,
`foundry/preflight.ts`, `foundry/zip-write.ts`, `foundry/preflight-browser.ts` and three
in `foundry/zip.ts` -- several of them stale by their own admission (`zip-write.ts`
literally says "This paragraph read '25 MB and 500 files' until the caps moved"). Not one
of them is inside a template literal, a constant, or anything a student could read.
`26214400` appears nowhere.

**So the number came from outside, through a sentence this application passes along
without understanding it.** Six files render an upstream `.message` verbatim into
something a student reads, and the audit's own sweep (below) pins them. That is the
mechanism, and it is also why the second report says nothing at all: the same failure,
on a path whose upstream sentence carried no number.

**The candidate that fits both reports is the Supabase project-wide upload limit**, and
this repository cannot read it. A bucket created with no `file_size_limit` does not have
no limit; it inherits the project's, which is a dashboard setting. **Five of the thirteen
upload paths are in exactly that state**, and one of them is the worst case in the tree:
a Foundry app upload passes a browser preflight at 75 MB and lands on a bucket
(`foundry-uploads`) that has never had a `file_size_limit` set on it at all. Anything
between the project limit and 75 MB transfers over school wifi in full and is refused at
the far end by a ceiling nobody here can name -- rendered as whatever storage said.

## A1 -- every upload ceiling in the portal

Read out of the migration chain and out of the module that enforces each one. "Bucket"
is `storage.buckets.file_size_limit` as the chain leaves it; "before sending" is whether
`File.size` is checked in the browser before a byte moves.

| # | Path | Bucket | Bucket limit | Before sending | Server side | What the student is told when it fails |
|---|---|---|---|---|---|---|
| 1 | Class item attachment | `classroom-attachments` | 200 MiB (0133) | 200 MiB (`CLASSROOM_UPLOAD_MAX_BYTES`) | sign route, 413 | **Three-part sentence.** Size, cap, "split it, zip it, or link to it" (`tooLarge`) |
| 2 | Assignment hand-in | `submission-files` | 200 MiB (0133) | 200 MiB | sign route, 413 | **Three-part sentence** |
| 3 | Instructor-only file | `instructor-attachments` | 200 MiB (0135) | 200 MiB | sign route, 413 | **Three-part sentence** |
| 4 | Slide deck zip | none (POSTs to our function) | n/a | 4 MiB (`DECK_UPLOAD_MAX_ZIP_BYTES`) | 4 MiB | Size and cap, with advice |
| 5 | Notebook page photo | none (our function, then Drive) | n/a | 3.6 MiB (`fitForUpload`, re-encode; **falls through on failure**) | 4 MiB (`MAX_PHOTO_BYTES`) | *was* `Photos are capped at 4 MB.` -- cap only, **after the whole body was sent** |
| 6 | Shelf / drawer photo | `maps-media` | 20 MiB (0163, restated 0168) | 20 MiB (`mapsPhotoRefusal`) | bucket | **Three-part sentence** |
| 7 | Report screenshot | `feedback-media` | 8 MiB (0170) | 8 MiB (`feedbackScreenshotIssue`) | bucket | Three-part sentence for the pre-send refusal; *was* raw upstream text for a storage failure |
| 8 | GREENLINE decal | `greenline-decals` | 1 MiB (0051) | 1 MiB (`validateDecalFile`) | bucket | Size and cap; a storage failure is raw upstream text |
| 9 | **Foundry app zip** | `foundry-uploads` | **none set** | 75 MB (`FOUNDRY_LIMITS.maxZipBytes`) | **project-wide limit** | Raw upstream text, via `fail(error)` |
| 10 | Foundry cover image | `foundry-covers` | **none set** | **nothing** | **project-wide limit** | Raw upstream text, via `fail(error)` |
| 11 | Profile picture | `avatars` | **none set** (0020, 0181) | 2 MiB, in `ProfileMenu.svelte` | **project-wide limit** | `Image must be under 2 MB.` (no file size); a storage failure is raw upstream text |
| 12 | Tournament thumbnail / banner | `tournament-thumbs` | **none set** (0062) | **nothing** | **project-wide limit** | `Thumbnail upload failed: <raw>` / `Upload failed: <raw>` |
| 13 | GAUNTLET challenge asset | `gauntlet`, `-drawings`, `-models`, `-tools` | **none set** (0009, 0015, 0031) | **nothing** | **project-wide limit** | `Upload failed: <raw>` |

**Where the three disagree.** Rows 9, 10, 12 and 13 are the disagreements that matter,
and all four are the same shape: a client that permits (or does not check) what the far
end may refuse. Row 9 is the loudest -- 75 MB permitted against an unknown ceiling -- and
rows 10, 12 and 13 have no client check of any kind, so *every* size refusal on them is a
completed transfer followed by a sentence in somebody else's words. Row 11 disagrees the
safe way round (2 MiB client against an unknown but larger ceiling). Rows 1 to 3 agree
exactly by construction; rows 6, 7 and 8 agree exactly by transcription, which
`tests/upload-limits.test.ts` now pins.

## A2 -- the hunt for the 25

Searched `src/`, `static/`, `supabase/`, `tools/` for `25 MB`, `25 mb`, `25MB`,
`26214400`, `25 * 1024`. **Nine hits, all of them comment prose, all under `src/`, none
reachable by a student.** No constant, no template literal, no message, no migration
value. Reported plainly: it is not here.

What else could produce a refusal a student would describe that way, and whether this
repository can see it:

- **The Supabase project-wide upload limit.** A dashboard setting under Storage
  settings, applying to every bucket with no `file_size_limit` of its own, i.e. the five
  above. **This repository cannot see it**, cannot read it at runtime, and has no
  migration that sets it. A person would check it in the Supabase dashboard. This is the
  leading candidate and it is the one thing this bundle asks a human to look at.
- **A serverless request body cap.** Applies only to rows 4 and 5, the two paths that
  still POST bytes to our own function. Vercel's own figure is far above 25 MB now (the
  4.5 MB number several comments in this tree still cite is historical), and both rows
  refuse well below it anyway, so a 25 MB refusal cannot come from here. Visible in this
  repo only as the app's own constants.
- **The browser.** No engine refuses at 25 MB. A phone under memory pressure can fail a
  decode or an upload, but it produces a hang or a network error, not a number.
- **A message from something that is not this app at all.** 25 MB is Gmail's attachment
  limit, and a student who tried mailing a file before uploading it may be reporting that
  number. Unfalsifiable from here and stated only so it is not mistaken for a finding.

## A3 -- what a failed upload looks like, per path

Driven against the real functions (`tests/upload-limits.test.ts`) and rendered on
`/dev/upload-limits` rather than described. Counting the thirteen rows:

- **3 of 13 name all three things** (what, the limit, what to do): the classroom trio,
  through `tooLarge` / `classifyUploadError`.
- **3 of 13 name the limit but not the file and not the action**: the deck zip, the
  notebook photo, the avatar. `Photos are capped at 4 MB.` is the archetype -- a student
  cannot tell whether they missed by 200 KB or by 40 MB, and the obvious next move is to
  pick the same file again.
- **7 of 13 tell a student nothing useful at all**, because they render whatever the far
  end said: the two tournament sites, the two GAUNTLET sites, the Foundry zip and cover,
  and the decal storage failure. `Upload failed: <raw>` is literally the copy on two of
  them, and "failed upload" is literally the bug report.

Four kinds of failure, and which of them a student can tell apart:

| Failure | Distinguishable before | Distinguishable now |
|---|---|---|
| Too large, ceiling stated here | on 6 paths | on 8 paths, all naming size + cap + action |
| Too large, ceiling NOT stated here | **nowhere** | named as the site-wide limit, with no invented number |
| Wrong type | on maps, feedback, decals, notebook | unchanged |
| Network dropped | only on maps and the classroom | plus the two notebook routes and the feedback screenshot |
| Permission refused | only on the classroom | unchanged |
| Session / signed URL expired | only on the classroom | unchanged |

The middle row is the finding. Before this bundle, a size refusal arriving from a ceiling
this repository does not set was indistinguishable from every other storage failure on
every one of the five paths it can happen on.

## A4 -- which paths fail after the bytes have been sent

`ShelfEntry.svelte` already makes the argument in a comment ("on school wifi a photo
refused by the bucket costs a minute of somebody's time for a refusal that could have
been immediate"), and it is the path that follows it. Not every path does:

- **Refuse before sending, correctly:** maps (6), feedback screenshot (7), decals (8),
  classroom 1-3 (the sign route refuses in the first round trip, before the PUT), deck
  zip (4), avatar (11).
- **Send first, then fail:** rows 9, 10, 12, 13 -- no client size check exists, or the
  one that exists is looser than the ceiling that actually refuses.
- **Send first, then fail, on a path that *tried*:** row 5, the notebook photo, and this
  is the subtle one. `fitForUpload` re-encodes an oversize capture, and every failure
  branch -- a format it cannot decode, a canvas refusal, an encode that comes out bigger
  -- deliberately returns the ORIGINAL file, over the cap, because "a legible server
  error" was judged better than substituting something worse. That reasoning is sound and
  is untouched. What it costs is that the legible server error arrives after the transfer.

## A5 -- the counts block

Before: `106 specs over 53 routes, 83 /dev pages, 212 runs`, with the measured region
naming 3 uncovered specs (`themes-signedout-1.mjs`, `themes-state-matrix.mjs`,
`themes.mjs`). That is inherited from `integration` and is not this bundle's.

After: `107 specs over 54 routes, 84 /dev pages, 2 widths, 214 runs` -- one spec, one
route, one `/dev` page, two runs, exactly this bundle's addition.

**`covered` now equals the tree: 107 of 107, nothing unmeasured**, because this bundle
regenerated the measured region and the full pass covers every spec in the directory. So
the two `tests/derived-numbers.test.ts` assertions that were RED on `integration` -- both
about the three `themes*` specs the measured region had never covered -- are green here,
as a side effect rather than as a repair. Nothing was done to the `themes*` specs
themselves; they were simply included in a run that happened. **If a later bundle
regenerates the static region without re-running the full pass, they go red again**, and
that is the inherited condition rather than a new one.

## What was built

**`src/lib/upload-limits.ts` is the one place the ceilings are stated.** Thirteen rows,
each carrying the number, the bucket, every guard the bytes meet in order, where the
number is written down, and the advice for that path specifically. Plus
`uploadTooLargeMessage`, `uploadSizeRefusal` and `uploadFailureMessage`.

- **`maxBytes: null` is a real answer, not a missing value.** It means the bucket carries
  no `file_size_limit`, so the project limit is what applies. Filling those five in with a
  plausible number would have been a second "file size limit at 25 mb".
- **The byte vocabulary is imported, not rewritten.** `formatBytesShort` and `formatCap`
  come from `$lib/classroom/upload-errors`, which already owns them and already speaks
  them on three sign routes. The direction of that import is slightly odd and it is still
  the right call: a second spelling of "how big is this file" is exactly the duplication
  CLAUDE.md names. **Two other byte formatters remain** -- `describeBytes` in
  `$lib/maps/media` and `formatScreenshotBytes` in `$lib/feedback/screenshot` -- and
  folding them in is a rename across `src/lib/maps/**`, which this bundle does not own.
  Reported, not done.
- **No ceiling moved.** Every number is a transcription of what was already enforced.

**`src/lib/notebook/photo-prepare.ts`** states the notebook photo size rule once, reading
the registry, so the browser and the route ask the same question. The prompt listed this
file as owned; it did not exist (only `src/lib/maps/photo-prepare.ts` did), so it was
created, deliberately narrow: **size only**. The type question on this path is genuinely
harder -- an iPhone HEIC arrives with an empty `File.type` and the notebook resolves it
from the filename inside `readPhotoForm`, server-side -- and restating that resolution
here would be a second copy of the mapping this codebase is most careful about.

**The two notebook API routes** now refuse with a sentence naming the size, the cap and
the camera button, and classify a Drive failure through `uploadFailureMessage` instead of
handing back Google's own words (or the string `Drive upload failed.`, which named our
storage vendor and told a student nothing).

**The feedback screenshot storage failure** was `That screenshot did not upload.
${error.message}` -- our four words in front of whatever came back. It is now classified.
The interesting property: an 8 MiB refusal cannot reach that branch, because the size is
already checked from `File.size` before a byte moves, so a 413 arriving there is almost
certainly the project limit -- and the sentence says so rather than restating 8 MB at
somebody whose file was under it. Retryability is still decided locally, because a size
refusal must not offer a retry.

## What was NOT fixed, and why

Ownership. Prompt 0064 owns `src/lib/upload-limits.ts`, the two `photo-prepare` modules,
`src/lib/feedback/**`, upload refusal messages under `src/routes/api/**`, the dev route,
the tests and the harness spec. It owns none of the following, and each is a one-import
adoption of `uploadFailureMessage`:

- `src/routes/tournaments/[id]/+page.svelte` -- `Thumbnail upload failed: <raw>` and
  `Upload failed: <raw>`, on a bucket with no ceiling and no client check. **The closest
  match in the tree to the literal words of the second bug report.**
- `src/routes/foundry/submit/+page.svelte` and `.../mine`, `.../review` -- `fail(error)`.
- `src/lib/gauntlet/ChallengeForm.svelte` -- two `Upload failed: <raw>` sites.
- `src/lib/greenline/decals.ts` -- `error: up.error.message`.
- `src/lib/ProfileMenu.svelte` -- `errorMsg = upErr.message`, and a size refusal that
  states 2 MB without stating the file's size.
- `src/lib/maps/transports.ts` -- `The photo did not upload: <raw>`. The gentlest of them,
  since the pre-send gate catches nearly everything first.
- The notebook's client-side pickers (`NotebookPhotos`, `PhotoStager`, `CameraCapture`)
  -- `notebookPhotoRefusal` is written to be called from one, and until one does, the
  refusal it produces is the route's, which is still better than what was there.

`tests/upload-limits.test.ts` pins that set as a sweep, with a positive control, so it
cannot grow quietly and each removal is a visible change.

**No migration was written.** The permission was for one, "only if a bucket's
`file_size_limit` is genuinely wrong". Five buckets have none at all, which is arguably
worse than wrong -- but setting one is choosing a number, which is raising or lowering a
ceiling, which this bundle was explicitly told not to do and should not do on a hunch
about what the project limit is. **Setting `foundry-uploads` to 75 MB to match its own
preflight is the obvious candidate and it is a decision, not a repair**: it needs the
project limit read first, because a bucket limit above the project limit does not help.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`**, re-derived after
  `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported (without them
  a fresh checkout reports 11 phantom errors). Baseline held exactly.
- **`/dev/upload-limits` at 375px and 1440px: 42 measurements, 0 outside threshold.**
  0px horizontal overflow at both widths (scrollWidth 375 vs clientWidth 375, and 1440 vs
  1440), which is real work on this page -- every row is a three-clause sentence, and a
  long unbroken string is exactly what pushes a grid child past the viewport. Refusal
  copy 14.66:1, the project note 14.66:1, the stated/not-ours tags 5.62:1 against a 3:1
  boundary threshold. 13 ceiling rows present and visible, 5 tagged "not ours" against 8
  tagged "stated" as its positive control, 5 non-size failure cases. Page rendered in
  446ms at 375 and 817ms at 1440 on a WARM server (the first run after a cold `vite dev`
  boot was discarded and the pass re-run).
- **Two spec bugs found by running it**, both of the same shape and both worth recording:
  the `mustNot` rows were scoped to the whole ROW, which also carries the harness's own
  provenance line ("refuses at 75 MB in the browser") and its own fixture description ("a
  40 MB file into a 200 MB bucket"). Both are true sentences a student never sees, and
  both reported a correct page as a failure. The selectors are now scoped to the refusal
  paragraph itself. A `mustNot` is only as good as the node it is asked about.
- **Full suite: 277 files, 5680 tests, all passing.** Run at **13:54 PDT on 2026-09-05**
  (America/Los_Angeles), 207.7s. The run before the measured region was regenerated had
  277 files with 2 failing assertions in `tests/derived-numbers.test.ts`; both are the
  inherited uncovered-spec pair described under A5 and both are green in the final run.
- **The full browser pass on a CLEAN tree: 214 route/width runs, 3140 measurements, 2
  outside threshold, 482.8s, measured on `ca18cd7` with `dirty: false`.** The two outside
  threshold are `/dev/notebook`'s `tap-reach` toolbar rows at both widths, which are
  pre-existing and annotated in the README as decision 12, with the owner. An earlier
  regeneration was taken on a dirty tree and stamped itself `dirty: true`; the bundle was
  committed and the pass re-run so the region's claim is about a real commit.
- **Both mutation controls**, below.

## The two positive controls

Both required by the prompt, both run, both restored from a `cp` copy and md5-verified
(`b2259ad4e9394425e84c0edc00d74061` before and after each), and the file re-run green
afterwards. **`git checkout --` was not used at any point.**

**Control 1 -- the sentence is derived, not typed.** Moved `feedback-screenshot`'s
`maxBytes` from 8388608 to 4194304. **3 tests reddened**, including `derives the sentence
from the ceiling rather than repeating it` (and, as a bonus, the two agreement assertions
against the enforcing module and against the migration chain -- which is the registry
working as designed). Restored, 22/22 green.

**Control 2 -- a non-size failure is not told about size.** Replaced the `tooBig` guard
in `uploadFailureMessage` with `true`, so every failure takes the size branch. **3 tests
reddened**, including `does not mention size when size was not the problem`. Restored,
22/22 green.

## What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder ref; no migration was applied, no RPC called, no bucket written. Every
  claim about `file_size_limit` is read from the migration FILES, which is what the
  applied state should be and is not proof that it is.
- **The Supabase project-wide upload limit was not read, because it cannot be read from
  here.** The whole A2 conclusion rests on it being lower than at least one client-side
  check, and confirming that is a dashboard visit.
- **No signed-in surface was driven.** `/dev/upload-limits` needs no session; the
  tournament, Foundry, avatar and GAUNTLET paths this audit names all do, and none of
  them was opened in a browser. Their behaviour is read from source.
- **No real oversize upload was performed against any bucket**, so the exact wording
  Supabase Storage returns for a project-limit refusal is not pinned here.
  `uploadFailureMessage` keys on the 413 status FIRST and on three text spellings second,
  which is the shape `classifyUploadError` already uses for that reason.
- `--selftest` was not run; no new harness CHECK was added, only a new spec using the
  existing ones.
