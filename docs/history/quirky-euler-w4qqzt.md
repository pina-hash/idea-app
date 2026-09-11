---
title: 'Blade 01 sketches in the order they were picked, a caption on its own picture, and the template off the public routes'
date: 2026-09-11
branches: ['claude/quirky-euler-w4qqzt']
migrations: []
subsystems: ['legacy-assignments']
---

Three fixes in a file IDEA100 students are working in right now. Two are behavioural
defects in the Module 04 image zone, both of which end with a student's caption attached
to the wrong sketch; the third takes the blank authoring template off the public routes.
No migration, no SQL, no write, and `Claims: none`.

## The base and the duplicate check

Branched from `origin/integration` at `7be051f6`, which is the same commit as
`origin/main`. The three opening commands ran before anything else: `git fetch
--unshallow origin`, which found the clone shallow and FORCE-UPDATED `origin/main` from
`336e82fe` to `7be051f6` (the crippled-container case again, and a session that had
trusted the stale ref would have branched twenty commits back); `git fetch origin
integration`; and the identity check, which found `Claude <noreply@anthropic.com>`
already set.

All three duplicate checks came back clean. `git log --oneline
origin/main..origin/integration` was EMPTY, `integration` being fully contained in
`main`; no ledger entry numbered `0150` existed on any ref, the highest on any ref being
`0146`; and no commit outside `origin/main` touched the owned surface. The branches that
`git ls-tree` reports as carrying `idea100-blade-01.html` all carry it from main's own
history, which is why the check that matters is the one over COMMITS rather than over
file presence.

The harness minted `claude/quirky-euler-w4qqzt`, which already existed on the remote and
was identical to `main`, with no `docs/history/` entry under that slug. No suffix needed.

## The two defects, measured before the fix rather than argued

Both were driven in the container's real Chromium over `file://` against an unmodified
copy of the shipped file, with two deliberately mismatched fixtures: a 1800x1800 noise
PNG (9.7 MB, slow to read, slow to decode, and forced through the downscale canvas
because it clears the 700000-character early-out) and an 8x8 flat PNG (73 bytes). Two
pictures that finish at the same time cannot tell "the order they were picked" from "the
order they finished", so the fixture pair IS the instrument.

**ORDER.** Picked as `[01-top.png, 02-side.png]` in ONE multi-select, the model came back
`[02-side.png, 01-top.png]`. `addImageFiles` started a `FileReader` per file and pushed
from inside each `reader.onload`, so the array order was decode order.

**CAPTION, as a consequence of the order.** A caption typed into the SECOND row landed on
`01-top.png` -- the picture the student picked FIRST. A student captioning the rows top to
bottom has labelled both pictures wrong.

**CAPTION, independently, on duplicates.** The same picture picked twice: a caption typed
on the second row landed on `images[0]`, because both handlers found their row with
`images.findIndex(i => i.dataUrl === dataUrl)` and two copies of one picture share that
string. Deleting the second row then removed `images[0]` as well: the survivor came back
carrying the OTHER object's blank caption.

**And it reaches the handed-in artifact, which is the half that makes this a
grading-accuracy defect rather than a cosmetic one.** With the two distinct pictures in,
labelling row 0 "Top view" and row 1 "Side view" the way a student does, Download with
Data was clicked through its own preflight dialog and the export reopened: the exported
file carried "Top view" on the SIDE picture and "Side view" on the TOP picture. The
export is faithful; what it is faithful to is wrong.

## Transcribed from `_TEMPLATE.html`, not re-derived

Ledger 0137 had already written and proved both fixes in the template, so both were read
first and carried over. Two notes on what that means in practice.

**The template's caption fix is not the mechanism the prompt sketched, and the template's
is better.** The prompt asked for a stable id at creation, matched on afterwards. The
template instead has `renderImageItem` take the image OBJECT and close over it, so the
handlers hold the row's identity directly and there is no lookup to get wrong -- exact,
and strictly less code than minting and matching an id. An id would have been a second
identity for a thing that already has one. The template's comment says so in the same
words and it was kept.

**The template's ordering fix is a sequential `await`, not an index reserved at selection
time.** Same argument: reserving a slot and filling it later is a second ordering to keep
in step with the array, where awaiting each file makes the array order BE the pick order
with nothing to keep in step. "Awaiting each file costs nothing a person can feel" is the
template's claim and the measurements above are consistent with it -- the 9.7 MB fixture
is far past anything a phone camera produces and the pass was not slow.

**What was deliberately NOT transcribed:** the template sets `img.alt = imgObj.name ||
'Uploaded image'`, which the live file does not. That is a third change on a live file
whose brief was two surgical fixes, so it was left. It is a real one-line improvement and
a candidate for whoever next has a reason to open this file.

The third call site, `loadData` rebuilding the previews from `_images`, moved with the
signature. It is the one the export round trip exercises.

## After the fix, same fixtures, same browser

Every measurement flipped and none of them by half. Order `[01-top, 02-side]`, selection
order. The caption typed on row 1 landed on `02-side.png`. The duplicate caption landed on
`images[1]`, and deleting the second row left `images[0]` still carrying its own caption.
The export round trip came back with two rows, no duplicates, "Top view" on the top
picture and "Side view" on the side one, and no page errors on either document.

## What this does NOT do, stated here rather than discovered by a student

**Work already saved is not repaired.** `loadData` pushes `_images` in the order it was
stored, so a student whose pictures were scrambled by the old code still has them
scrambled, and a caption already attached to the wrong object stays attached to it. The
fix stops the defect happening; it cannot know which of two stored pictures the student
meant. Anyone grading Module 04 on work saved before today is grading captions that may
not be the student's intent, and no code change reaches that.

`STORAGE_KEY` is untouched -- it does not appear in the diff at all, which is the
cheapest way to say that. Nothing was restructured and nothing was reformatted.

## The template was a public page

`src/lib/legacy/index.ts` globbed `./assignments/*.html` and took everything, so
`_TEMPLATE.html` resolved at `/assignments/_TEMPLATE` -- a public route reading no
session -- and served "IDEA-000 / Assignment 00 / Placeholder prompt" to anyone who found
the URL. The glob is `./assignments/[!_]*.html` now.

**A leading underscore rather than a named exclusion**, because a one-off exclusion is a
rule about one file and a convention is a rule about the directory: the next scaffold or
fragment dropped in there is off the public routes by its filename alone, with nothing to
remember.

Confirmed by READING the resolved list rather than assuming it. Twelve slugs resolve --
`IDEA-Blade_Rulebook_v2_2`, `MSET-Mold-01`, `idea100-blade-01`, `idea113-blade-01`
through `-05` and `-05-qr`, `idea403-senior-final`, `idea403-senior-progress`,
`mset-mold-02` -- which is all thirteen `.html` files in the directory less
`_TEMPLATE.html`, and `loadAssignmentHtml('_TEMPLATE')` answers `null`, which is the
route's 404.

## The test, and why there is one at all

Tests here are the exception. This one earns its place on the narrowing direction only:
widening the glob again puts a scaffold back on a public URL and NOTHING ON ANY SCREEN
REPORTS IT. The opposite direction fails loudly, in front of a class.

So the expected slug set is derived from the DIRECTORY, which is the real producer, never
from the module under test -- a glob that matched nothing would otherwise satisfy every
absence assertion vacuously. The first test in the file is the positive control for the
whole file: it asserts an underscored file is actually on disk, because if none is, every
"is not reachable" assertion below is true for the wrong reason.

**It was mutated to confirm it bites.** Widening the glob back to `./assignments/*.html`
reddened 3 of 8 assertions; the file was restored FROM A COPY taken first, not with `git
checkout --` (which discards to HEAD and would have taken this session's uncommitted work
with it), md5-checked identical at `1026fd127a3e9846deeaf90854ea49d0`, and re-run green.

The three assertions over `idea100-blade-01.html` itself are structural only -- the
storage key, the absence of the `findIndex` shape, the presence of the sequential read --
because the behavioural half is the browser pass above and a source sweep cannot stand in
for it. They read the source **with block comments stripped**, the way
`tools/claude-md-check.mjs` reads a migration, for a reason worth writing down: both
fixes carry a comment QUOTING the expression they replaced, which is most of the comment's
value, and the first version of the sweep found the defect's own epitaph and reddened. The
stripped copy is asserted to still contain the replacement, so stripping cannot be what
makes the test pass.

## Verification

- **Full suite: 379 files / 7462 tests, all green.** Baseline was 378 / 7454 and this
  bundle adds exactly one file and its eight tests.
- **`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`.** Re-derived rather than read off
  `CLAUDE.md`: `.env` was written with the two `PUBLIC_SUPABASE_*` placeholders FIRST, then
  `svelte-kit sync`, then the check. Without that a fresh checkout reports the phantom
  `$env/static/public` errors.
- `npm ci`, never `npm install`: `git status` reports `package-lock.json` unmodified, so
  the 4,649-line reformat did not happen.
- **NOT verified:** nothing was run against the live Supabase project (this is a static
  document with no session, no RPC and no row), no signed-in surface was driven, and
  `verify:browser` was not run because this bundle adds no `/dev` route and the file is
  not a SvelteKit surface. `verify:readme` was not run, per the prompt: no route spec is
  added.

## Deliberately left undone

**No `classroom-updates.json` entry.** The standing directive covers classroom-facing
behaviour, and the honest reading is that this is close to the line: it changes what an
IDEA100 student experiences, but the document is served at `/assignments/<slug>`, outside
`/classroom` entirely, reached from a QR code or a handout rather than from a class feed,
and `classroom-updates.json` renders at `/classroom/updates`. Against that, the file is
not in this bundle's owned surface and ledgers 0147, 0148 and 0149 were in flight --
a single shared root JSON is exactly the write point this repository split `docs/HISTORY.md`
to stop creating. So it is flagged here rather than written or silently skipped. If a
student-facing note is wanted, it is one entry and somebody with the whole picture should
decide its wording, particularly around work already saved in the wrong order.
