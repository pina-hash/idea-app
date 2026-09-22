---
title: A feedback archive a coding session can be handed whole
date: 2026-09-22
branches: [claude/new-session-ewax89]
migrations: []
subsystems: [feedback, classroom, export]
---

Mr. Pina triages feedback by pasting the markdown export into a chat and then pasting
every screenshot separately by hand, because the export does not contain them. A
layout complaint is mostly its picture, so the one thing a session needs most is the
one thing that does not travel with the report. This bundle builds a third download
beside the two that were there: a zip in which each report's image sits in the folder
with the report that names it.

Nothing about the two existing downloads changed. That is asserted rather than
claimed -- `feedbackMarkdown` with no options still prints the console's own
screenshot sentence and no build-age line, and both are pinned with a positive
control that the overridden forms DO appear.

## The audit, claim by claim

Every claim was checked against the tree at `1ec2f640`, which is `origin/main`.

1. **Confirmed.** `feedbackMarkdown` (`console.ts:621`), `feedbackJson` (`:747`),
   `feedbackExportName` (`:778`), `FEEDBACK_MARKDOWN_BUDGET = 60_000` (`:424`),
   `FEEDBACK_GROUPING_THRESHOLD = 5` (`:435`).
2. **Confirmed.** `console.ts:610` wrote exactly
   `_A screenshot is attached. Open this report in the feedback console to see it._`
3. **Confirmed.** `rowScreenshotPath` at `console.ts:167`, and its own comment says
   the value is a key and never a URL. `FEEDBACK_MEDIA_BUCKET = 'feedback-media'` is
   `screenshot.ts:32`; `0170` creates it private at 8 MiB with
   `array['image/png','image/jpeg','image/webp']` (`0170:218-226`). `feedbackJson`
   dumps rows verbatim, so the key was already in the JSON export and only the bytes
   were missing.
4. **Confirmed in substance, WRONG IN A DETAIL, and the detail is the one that
   decides the design.** The six facets are at `console.ts:264` and there was no
   `kind` and no screenshot facet. But the prompt says the kinds are "bug, idea,
   other" and there are FOUR: `FEEDBACK_KINDS` (`feedback.ts:27`) carries `praise`.
   `app_feedback.kind` is also plain text on the row, this queue reads every app, and
   VANGUARD's in-game composer writes its own rows. So the picker is built from
   `facetValues` over the loaded rows, exactly as `role` and `section` already are,
   rather than from a list typed into the console -- a list would have been wrong on
   the day it was written, and would fall behind its own producers afterwards.
5. **Confirmed.** `FeedbackStatus = 'new' | 'seen' | 'resolved' | 'spam'`
   (`feedback.ts:546`).
6. **Confirmed.** `rowBuild` at `console.ts:84`, returning `{value, source, means}`.

A seventh thing the prompt got wrong is scoping rather than fact: the Owns line puts
the console at `src/routes/classroom/feedback/+page.svelte`. That file is a 29-line
shim. The console is `src/lib/classroom/FeedbackConsole.svelte`, 1084 lines, and
"surface them in the console" cannot be done anywhere else. It is not on the
do-not-own list; `screenshot.ts`, `FeedbackBox.svelte`, `SiteFeedback.svelte` and
`dictation.ts` were not touched.

## How the console reads the bytes, and why no policy moved

**A signed-in admin already has SELECT on every object in the bucket.** `0170` creates
`feedback media admin read` -- `for select to authenticated using (bucket_id =
'feedback-media' and public.is_admin())` -- and `is_admin()` is evaluated as the
querying role, which holds EXECUTE on it since 0067. So an admin's own browser client
can call `supabase.storage.from('feedback-media').download(key)` and the policy
answers. **Nothing was widened**; the page load already reads the same bytes through
the same policy to draw the thumbnail on the row.

**A download rather than the signed URLs the load already mints, and the difference
is staleness.** Those URLs last five minutes, which is right for a thumbnail on a page
somebody is looking at now. A queue is worked through for longer than that, so an
export pressed twenty minutes in would fetch a set of expired links and produce an
archive with no images and no reason visible on screen. Asking storage at the moment
of the press has no window to be outside of.

**The zip is built in the browser, and a server route was the rejected alternative.**
The rows are on screen, both existing exports are already assembled there, and
`buildZip` is the same writer the Foundry submit path runs in a browser tab. A route
would re-derive rows it was handed, add a second surface holding an admin payload, and
make the bytes travel twice. `$lib/foundry/zip-write.ts` is REUSED rather than copied:
it is a pure writer with no Foundry knowledge in it, and a second zip writer is
exactly the duplication that quietly stops matching.

### What a session can derive for itself, and what it cannot

What it CANNOT, so it is in the archive: the message, what the reporter tried, the
screenshot bytes, the route, path, role, section, viewport and browser they were on,
the build they saw, the error id that joins the report to a server log line, and the
section id resolved to a course name (which lives in `classroom_sections`, not in the
tree).

What it CAN, so nothing re-derives it: the current state of any file, route, rule or
token a report names. The README does not describe the code, does not say how to
branch, test or merge, and is not a prompt -- a session already has all of that from
`CLAUDE.md` and the standards, and a second copy here would go stale and then
contradict them. `tests/feedback-archive.test.ts` sweeps the README for ten process
words and reddens on any of them.

## Build age: what it measures, and what it refuses to claim

The prompt asks each report to state how far behind `origin/main` its build now is.
**A browser has no git and cannot ask a remote what its head is**, so what is actually
computed is the distance to the commit THIS BUILD was built from, counted in
`virtual:site-changelog`'s newest-first log. The two are the same thing on a production
deploy and are not on a preview, so the sentence names its reference point rather than
saying "behind main". That is the honest version of the requirement, and it is stated
in the function's own header so nobody re-reads it as the other thing.

`virtual:site-changelog` is imported through `await import()` INSIDE the press
handler. That is the payload boundary its own declaration sets out -- it is the whole
commit history, and a static import in a console would put it in whatever shared chunk
the console lands in. A press is exactly the moment it is about to be read.

**Five answers, every one a sentence.** An instrument's silence is never a fact about
what it measures, so "no build identifier was captured", "that is a build timestamp
rather than a commit" and "that commit is not in this build's log" are three different
things to know, and a line that was simply absent for all three would read as a fourth.
The not-in-the-log sentence gives BOTH reasons a commit can be missing -- the log omits
merges and is truncated on a shallow clone -- because a reader told only one of them
draws the wrong conclusion about half the time. It is not a rare branch: the container
this ran in is a shallow clone, so it is the branch the real browser drive exercised.

`sameCommit` matches two short shas when either is a prefix of the other, with a
seven-character floor. `%h` picks its own length and it grows with the repository, so
an equality test would read every older report as an unknown commit -- a failure that
produces a plausible sentence on every row and is therefore never investigated.

## The size question, measured

Measured by building real archives with genuinely incompressible image bytes.
**The first measurement was wrong and is worth recording**: a hand-rolled LCG's low
bits have a very short cycle and deflate to almost nothing, so 13 MB of "images" came
out as a 0.41 MB zip and understated every figure roughly thirtyfold. Re-measured with
`randomBytes`, which is what an already-compressed PNG behaves like:

| set | zip | images in | left out | build |
|---|---|---|---|---|
| 38 reports, no screenshots | 0.04 MB | 0 | 0 | 88 ms |
| 38 reports, 12 at 350 KB | 4.14 MB | 12 | 0 | 204 ms |
| 38 reports, all 38 at 350 KB | 13.04 MB | 38 | 0 | 611 ms |
| 38 reports, all 38 at 2 MB | 64.05 MB | 32 | 6 | 2844 ms |
| 38 reports, all 38 at the 8 MiB bucket cap | 64.04 MB | 8 | 30 | 2830 ms |

Text and zip overhead is **about 1 KB per report** and essentially constant, so the
archive's weight is its images. **A realistic thirty-eight-report batch is about
13 MB and builds in under a second.** The pathological case is 38 x 8 MiB = 304 MB of
images, which is not a thing to build in a tab, so `FEEDBACK_ARCHIVE_IMAGE_BUDGET` is
64 MiB: `buildZip` buffers input plus output, so that is roughly 128 MiB at the peak.

**Past the budget images are left out and NAMED, never dropped silently.** `index.json`
carries a null path and a reason, the report's own markdown says which of the two
reasons applies, and the README states the cap and what to do about it. The mapping
stays exact in both directions, which matters more than carrying every image.

## What is asserted, and the mutation proof

`tests/feedback-archive.test.ts`, 32 tests, **reads the tree back out of the zip with
the repo's own reader** (`readCentralDirectory` + `inflateEntry`) rather than trusting
the builder. Both directions of the mapping are swept -- every path in `index.json`
resolves to a real file, and every file in the archive is named by `index.json` -- with
the claimed-set size asserted so a sweep over nothing cannot pass.

**The mapping is pinned by CONTENT, not only by shape.** Each fixture image carries
distinct bytes, because a swap against identical fixtures passes every assertion while
handing a session one student's picture under another student's words. That is the
failure the prompt calls worse than no screenshot at all, and it is the one the
mutation run targets.

Eight mutants, **eight killed**, on `src/lib/feedback/archive.ts`:

| mutation | verdict |
|---|---|
| every image written into the first report's folder (the swap) | KILLED (2) |
| index points at an image the archive does not write (dangling) | KILLED (2) |
| image written but the index names nothing (orphan) | KILLED (5) |
| a missing image left silent instead of named | KILLED (2) |
| an over-budget image dropped silently | KILLED (1) |
| the submitter toggle ignored by the per-report markdown | KILLED (1) |
| the build age never asked for | KILLED (1) |
| an unknown content type silently beats the key extension | KILLED (1) |

The file was copied into memory and restored FROM THAT COPY, never with
`git checkout --`, which is a discard-to-HEAD that takes a session's uncommitted work
with it; the verdict is read off vitest's summary line with stdout and stderr
concatenated, never off the exit code, which is 0 on a clean assertion failure here.
Restore was md5-identical (`5d19ee2029d01f21686bde531b6532c7`) and the clean re-verify
was green.

The submitter toggle is swept over the WHOLE archive rather than over `index.json`
alone -- the per-report markdown is a second place a name can reach, and a toggle that
cleaned one file and not the other is the failure worth catching -- with the positive
control in the same reading: all three withheld strings ARE found when the toggle is on.

## What the browser found that nothing else did

`/dev/feedback` now mounts the console with an in-memory screenshot source, a row whose
image resolves and a row whose image does not, and two rows carrying the two different
build-stamp kinds. Driven in the harness Chromium (141.0.7390.37) at 1440px:

- the two new facets render and filter: 6 of 6 shown, 2 with a screenshot, 4 without,
  5 of kind `bug`;
- `#fbc-kind` 160.9 x **44**, `#fbc-shot` 162.5 x **44**, against `#fbc-role` and
  `#fbc-section` at 160.9 x 44 -- the `.fbc-control` floor, inherited rather than
  restated. The archive button is 216.7 x 44 and **hit-tests to itself** at its own
  centre;
- the press downloads `idea-feedback-2026-09-22T18-19-16.zip`, 9 entries, and the
  74-byte fixture PNG comes back byte-identical with its magic intact
  (`89 50 4e 47 0d 0a 1a 0a`);
- `report.md` carries `![Screenshot filed with this report](./screenshot.png)`, and the
  report whose image did not resolve says so instead;
- 0 console errors.

**One real bug was found here and by nothing else.** The harness fixtures were declared
below the `$state` initialiser that reads them -- a temporal dead zone, so
`/dev/feedback` answered 500 on load while `svelte-check` reported 0 errors, because it
is valid TypeScript. Fixed by hoisting, with the reason written beside it. Two wording
defects came from the same drive: the build-age reference point was an apposition
mid-sentence ("its distance from `1ec2f640` (Sep 22, 2026), the build this archive was
exported from cannot be counted") and is now its own trailing sentence, pinned by a
test; and a 74-byte image reported as "0 KB", which reads as an image that did not make
it, so sizes under a kilobyte print as bytes.

## Verification

- `npx svelte-check`: **0 errors, 37 warnings in 20 files**, breakdown
  31 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`
  -- identical to the baseline measured on this tree before any edit, and to the figure
  `CLAUDE.md` carries. Re-derived rather than trusted, with the two public Supabase
  values exported before `svelte-kit sync` so the phantom-error case did not apply.
- `npm test`: green, summary line in the report.
- `npm run verify:browser -- --probe`: a real Chromium at
  `/opt/pw-browsers/chromium-1194`, screenshots and rAF and both observers working.

**NOT VERIFIED, and stated rather than left silent:**

- **Nothing ran against the live Supabase project.** No session in this repository can;
  the container has no service key and cannot open a database socket. So
  `supabase.storage.from('feedback-media').download(key)` has never been called against
  the real bucket by this bundle. What IS established is that the policy admitting it
  is already there and is the same one the existing thumbnail goes through, read out of
  `0170` itself.
- **No signed-in surface was driven.** `/classroom/feedback` needs a Bosco Tech Google
  session; the archive was driven on `/dev/feedback`, which mounts the identical
  component with a different transport.
- **Real screenshot bytes were never zipped.** The fixtures are a real 74-byte PNG and
  synthetic incompressible buffers. The size table is arithmetic over measured overhead,
  not a reading off thirty-eight real reports.
- **`prefers-reduced-motion` is `no-preference`** in the harness, and the harness blocks
  non-loopback requests, so text was measured in the fallback font stack.
- No `npm run verify:browser` spec was added for the new controls. Their geometry was
  measured by a scripted drive of the real page, reported above; a standing spec under
  `tools/browser-verify/routes/` is the durable version and was not written.

## For Mr. Pina

- **The archive is a student record and the README says so on its face.** With the
  submitter toggle ON it carries names and addresses; with it OFF it carries neither,
  nor any anonymous contact string. Decide that before the export, not after -- it is
  the same toggle the markdown and JSON downloads already use.
- **One thing the identity toggle does NOT withhold, and it predates this bundle.**
  `index.json` is `feedbackJson`'s output, and a row's `screenshot_path` survives the
  withholding by design (`withoutSubmitter` says so, on the grounds that a key is an
  opaque pointer into a private bucket). But that key's first segment is the uploader's
  `auth.uid()`. It is a uuid rather than an address, it resolves to a person only for
  somebody with database access, and `0170`'s CHECK means an anonymous row can never
  carry one -- so an anonymous report stays anonymous. It is worth knowing anyway,
  because an archive goes somewhere a JSON download might not. Changing it means
  changing `feedbackJson`, which this bundle was told to leave exactly as it is.
- **The build-age line measures against the build the archive was exported from, not
  against `origin/main`**, for the reason above. On production those are the same commit.
- **The images budget is 64 MiB and a batch will not reach it.** A realistic
  thirty-eight-report archive is about 13 MB.
