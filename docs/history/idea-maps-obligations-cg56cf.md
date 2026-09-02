---
title: "IDEA Maps: a phone capture is stored in a format everybody can open, and a unique-constraint refusal that is a rule stops being retried (`claude/idea-maps-obligations-cg56cf`, no migration)"
date: 2026-09-02
branches: [claude/idea-maps-obligations-cg56cf]
migrations: []
subsystems: ["IDEA Maps", "Storage", "Client data access", "Testing"]
---

The two obligations `0168` wrote into its own header and handed forward, neither
of which had been built. No migration: neither needed one, and none was
permitted.

## The audit, before any of it was built

Both items are phrased as "add X", and on 2026-08-31 four out of four such items
in this repository turned out to already exist and be unreachable. Neither of
these did.

**1. What the maps media path does with a HEIC today.** `src/lib/maps/media.ts`
maps `heic` -> `image/heic` and `heif` -> `image/heif`, resolved from the
FILENAME when `File.type` is empty -- which is the conforming path for an
iPhone capture and is 0163's own stated obligation, discharged correctly.
Nothing anywhere under `src/lib/maps/**` re-encodes, resizes or transcodes:
`ShelfEntry.stagePhoto` refused on size and type and then staged the picked
`File` object itself, and `mapsPhotoTransports.attachPhoto` handed exactly those
bytes to the bucket. After a successful upload the surface showed the person
their own `URL.createObjectURL` preview, which on the phone that took the photo
renders perfectly. The "Already in this container" list drew a bare `<img>` off
the public object URL with no `onerror` at all.

So the whole failure was invisible from the surface that caused it: it looked
saved, it looked previewed, and the broken image only ever appeared to somebody
else, later, on a different device.

**2. The prior art in the notebook, which this bundle may read and not edit.**
`src/lib/notebook/PhotoStager.svelte` does NOT solve this. It says so in its own
copy ("Large photos are shrunk to fit") and `src/lib/notebook/camera.ts` says it
outright: `unusableReason` carries the comment "Undecodable HERE is not the same
as broken: HEIC is the ordinary case", and `fitForUpload` re-encodes **only when
`file.size > maxBytes`**, returning the same `File` object otherwise. The
notebook can afford that -- its photos go through a Drive-proxied route and its
corrector knows to skip an undecodable one. A public map viewer cannot.

What IS reusable, and what this bundle reuses rather than copying, is the pair
of primitives underneath: `decodeImageFile` (two strategies behind ONE shared
deadline, EXIF orientation requested explicitly of `createImageBitmap` and
applied by default by the `<img>` fallback) and `drawToCanvas` (which probes a
handful of pixels for a non-zero alpha, because a canvas past a phone's area
limit comes back blank rather than throwing). Both are portable with no edit at
all: nothing in either knows a notebook exists. `$lib/maps/photo-prepare.ts`
imports them.

**3. Every caller of `isTransientSqlstate`.** Three, and they divide cleanly.
`src/lib/classroom/upload-errors.ts` (read-only to this bundle) and the four
routes reading `rpcErrorStatus` are unaffected. Inside maps there were two:

- `failure()` in `transports.ts` -- reached by `insertRow`, `updateRow`,
  `deleteRow`, `discardPending` and `publish`. **This is the defect the prompt
  described and it is real**: `refusalMessage` already returned "This item type
  is already placed in that container. Edit the existing placement instead."
  for a `maps_stock` 23505, while the line beneath it set
  `retryable: isTransientSqlstate(error.code)`, which for 23505 is `true`. One
  expression said "we considered this and the answer is no" and the other said
  "send it again".
- `attachPhoto`'s row insert. `maps_photos.storage_key` is globally unique
  (0163) and the key is a fresh uuid, so a 23505 there cannot be a race a
  resend wins.

**The prompt's second claim was wrong and the tree won.** It said the
staged-insert path "around line 260" treats 23505 as a genuine race the loser
should re-read, which is correct and must keep working. The behaviour is
correct; the location is not. `stagePending` never reaches the classifier at
all: it checks `inserted.error.code !== '23505'` itself and loops back to update
the winner's row. The call at line 348 that the prompt may have been pointing at
is `attachPhoto`, which is a third case and a permanent one. Both were handled.

**4. What 0168 made reachable.** `maps_nodes_elevation_slot`, a partial unique
index on `(parent_id, elevation_order)` `where kind = 'compartment' and
elevation_order is not null and status = 'published'`. A violation reaches a
person through `NodeDetail`'s elevation field: on a published node the edit is
staged and the collision fires inside `maps_publish`, arriving at
`transports.publish` -> `failure()`; on a draft that is later published, the
same. 0168's header names the fix in as many words: "the fix is for the maps
write path to recognise this index by name and say 'that elevation slot is
taken', not to widen the transient list." That is what was built.

## The 23505 partition, and why it is at the call site

23505 is not transient or permanent as a property of the SQLSTATE. It is one or
the other as a property of WHICH uniqueness said no, and the only thing that
distinguishes them is the constraint's name -- which Postgres puts in the
message and PostgREST forwards.

So the shared whitelist did not move. `isTransientSqlstate` and
`rpcErrorStatus` keep their members, their signatures and their behaviour;
`tests/maps-constraint-refusals.test.ts` asserts both still answer exactly as
they did for 23505, and asserts their arity, so no caller outside maps can have
been touched. What `$lib/pg-errors.ts` gained is two functions:

- `constraintNameOf(error)` -- reads the quoted name out of `message` and then
  `details`. This is knowledge about Postgres and PostgREST, not about any
  feature, which is why it is here rather than in maps: the next subsystem with
  a rule-shaped unique index would otherwise write a second copy of it.
- `isTransientDbError(error, permanentConstraints)` -- `isTransientSqlstate`
  with an escape hatch the CALLER supplies. The list is a parameter on purpose:
  this module cannot know which of a feature's unique indexes encode rules, and
  guessing would be a second, softer copy of the whitelist. An error naming no
  constraint answers exactly as `isTransientSqlstate` does.

`MAPS_PERMANENT_UNIQUE` in `transports.ts` is one map whose KEYS are the
permanent set and whose VALUES are the wording. That shape is load-bearing:
"what do we tell them" and "may we send it again" were two independent
expressions, which is precisely how the shipped code came to contradict itself,
so `permanentRefusal` now answers both at once and a sentence added to the map
removes the retry in the same edit. `maps_revisions_*_slot` is deliberately
absent from it -- that one really is a race.

The name-less fallback (`TABLE_IMPLIED_UNIQUE`) has one entry, `maps_stock`,
because it is the one table in the write surface with exactly one unique index
a form can reach. Guessing on a table with two would be inventing an answer.

## The transcode, and the one thing it must not do

`$lib/maps/photo-prepare.ts`. The gate runs at the picker, in this order:
`mapsPhotoRefusal` first (size and type, instant, off the `File` alone -- and
refusing a 25 MB photo before spending seconds decoding it is the same argument
that put the size check ahead of the transfer), then the decode, which is only
worth doing for the formats that need it.

**The pass-through set is an intersection of two lists rather than an opinion
about formats.** A file may be stored as it arrived only when the BUCKET will
take it (0168 replaced 0163's `image/*` wildcard with jpeg/png/webp/heic/heif/
avif, enforced at upload against the declared type) AND every browser can draw
it. That is four types: jpeg, png, webp, avif. Everything else `mapsImageMime`
admits is re-encoded to JPEG:

- heic/heif are ON the bucket list and drawn only by recent Safari. 0168
  admitted them deliberately so that a capture can never fail at the far end,
  and named transcoding on capture as this bundle's obligation.
- tiff fails both tests.
- gif and bmp are universally drawable but OFF the bucket list, so passing one
  through is a refusal AFTER the transfer. Re-encoding makes it storable. An
  animated GIF loses its animation, which is the right trade on a path whose
  subject is a photograph of a drawer -- and the alternative today is not an
  animation, it is a failed upload.

This is safe in both worlds, which matters because the applied state of
0167-0170 against production is unknown to this session: all four pass-through
types are on the wildcard list and on 0168's list, and JPEG is accepted by
both.

`avif` is left in deliberately. It is written by a tool and never by the camera
button this flow exists for, so transcoding one would throw away the smaller
file for an older Safari nobody at this school is holding at a toolbox.

**Nothing widens or narrows the bucket.** `allowed_mime_types` is untouched and
unreadable from here; what changed is only which bytes the one shipped upload
path produces.

**Where the browser cannot decode the file either, it refuses at the picker.**
The alternative -- upload it and hope -- is the defect. The message names the
format and offers the one remedy the person can act on standing at the drawer
(Settings, Camera, Formats, Most Compatible).

Orientation is preserved by flattening rather than by carrying EXIF: both
decode paths bake the rotation into the pixels before `drawToCanvas` sees them,
so the JPEG that comes out needs no orientation tag and cannot lose one.

`MAPS_TRANSCODE_MAX_DIM` is 4096, ABOVE a 12 MP phone capture's long edge
(4032), so the ordinary case is not resized at all and the transcode costs only
the format. The notebook's own 2400 would quietly halve the resolution of a
photo somebody may need to read a part number off.

## What the browser pass found that nothing else did

`npm run verify:browser` reported a regression in `ShelfEntry` that
`svelte-check` passed, the unit suite passed, and no console error mentioned.

`stagePhoto` became async, so it took a generation ticket to discard a stale
decode when a second photo is picked mid-flight. It took the ticket BEFORE
calling `clearPhoto`, which bumps the same counter -- so `mine` was one behind
`picking` the moment the clear ran and **every** prepared result was discarded
as stale. `photoPreparing` then stayed true forever, which blocked the save.
Four assertions across two specs reported a working surface as broken. The fix
is two lines swapped, with the reason written beside them.

It also forced a design change that is an improvement rather than a repair. The
picker no longer awaits anything it does not have to: `planMapsPhoto` is the
SYNCHRONOUS half -- refuse, pass through, or "this needs re-encoding" -- and it
settles an oversize photo, an SVG and an ordinary JPEG from the `File` alone, so
the refusal paints in the same frame as the press and a storable file is staged
with no pending state flashing past. Only a format that has to be converted
waits, and only that one says it is waiting. `prepareMapsPhoto` is still the one
async front door for a caller with nothing to render in between (the
`/dev/maps-media` harness is one); `ShelfEntry` calls the two halves in the same
order for the sole reason that it needs the first answer synchronously. One
rule, two readers, not two rules.

The second finding is the instrument's, not the code's, and is worth more than
the first. The four `orderResult` probes on `/dev/maps-shelf` press a control
after a fixed timeout, and `waitForApp` returns once the DOM has stopped
changing -- which a SERVER-RENDERED page satisfies before any handler is
attached. CLAUDE.md states this exactly ("PAINT IS NOT INTERACTIVITY, AND NO
WINDOW MARKER SEPARATES THEM"). It had gone unnoticed while the route's module
graph was small; adding two imports to `ShelfEntry` was enough to push the
first press before hydration. Both shelf specs now open with a `prepare` step
that types into the name box and RETRIES until the plan line appears, reporting
the attempt count -- the shape CLAUDE.md prescribes over any timer or marker.
**Measured, it takes 2 to 7 attempts (200-700ms) after `waitForApp` returns**,
so the gap is real and was being run through blind.

## The one test outside this bundle's owned surface, and why it was edited

`tests/dom/maps-shelf-mount.test.ts` is not in this bundle's owned list. It
carried an assertion that PINNED THE DEFECT:

    pick(camera, photoOf(2048, 'IMG_0042.HEIC', ''));
    expect(photos.log[0].mimeType).toBe('image/heic');
    expect(photos.log[0].storageKey).toBe('item/....heic');

That is exactly the photo nobody but its author can open, required by a test.
It is now false in every environment, not merely under this bundle: 0168 admits
HEIC at the bucket ON PURPOSE so a capture can never fail at the far end, and
names transcoding on capture as the editor bundle's obligation, which this
bundle discharges. Leaving it red would have left the branch permanently
unmergeable into `integration`, and CLAUDE.md's own reason applies -- a standing
failure hides a real one.

**So it was edited, minimally, and this is stated here rather than buried.** The
whole diff to that file is five deleted lines (the two assertions above and the
comment justifying them) and two new cases; the file's other twenty tests are
byte-identical, verified from the diff. What replaces it asserts the CONTRACT
rather than the behaviour: a HEIC is HELD while it is prepared, the surface says
so, and the upload transport's log stays empty -- with an already-universal
photo beside it as the positive control, so "Preparing the photo" cannot be a
state every pick enters and never leaves.

**Why not the full refusal.** happy-dom supplies a `createImageBitmap` that
never settles -- measured: `decodeImageFile` returns null only after burning its
whole deadline -- so the refusal there takes `DECODE_TIMEOUT_MS`, ten seconds.
That is the deadline doing its job and is far too slow to assert on. The two
outcomes downstream of the decode are measured in real Chromium instead:
`maps-shelf.mjs` drives the success (a conversion notice on the real component)
and `maps-media.mjs` drives the refusal (named by format, with a remedy).

A `refusalMessage` helper that had become a dead second reader of the same
decision was removed in the same commit; `failure()` now reads
`permanentRefusal` once, which is the shape that stops the message and the
retry flag contradicting each other again.

## What was measured

`svelte-check`: **0 errors, 37 warnings**, before and after, re-derived after
`npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*` values exported (a
checkout with no `.env` reports 11 phantom errors, which this is not).

`/dev/maps-media` at 375 and 1440: **44 measurements, 0 outside threshold**.
Every picked-file fixture lands on the right one of the three outcomes; the
converted one changed type, extension AND byte length; the pass-through one is
returned as the same object (identity, not equality); the undecodable one is
refused, names HEIC, and says what to do; the two rule-shaped constraints come
back permanent and worded with no driver text, and the race control beside them
stays retryable.

`/dev/maps-shelf` (four route/width runs): **84 measurements, 0 outside
threshold**, including a new end-to-end case that stages a `.HEIC` at the REAL
camera input and reads the conversion notice off the REAL component.

All eight maps route specs together, at both widths: **16 route/width runs, 318
measurements, 0 outside threshold**.

`tests/maps-constraint-refusals.test.ts`: 12 passing.
`tests/maps-photo-prepare.test.ts`: 10 passing.
`tests/dom/maps-shelf-mount.test.ts`: 22 passing (20 before, plus the two that
replace the one described above).
Full suite: **232 files, all passing**, after the counts block was regenerated
(`npm run verify:readme`, which `tests/derived-numbers.test.ts` reddens on until
it is).

## The positive controls

A check that has never failed has not been tested.

- **Transcode broken** (the canvas read-back returns the original bytes):
  `THE TRANSCODE PRODUCED DIFFERENT BYTES...` reddened at both widths with
  `BYTES IDENTICAL (160 vs 160)`. Note what this proves about the check's
  shape: the outcome row alone still said `converted`, so the byte-length half
  is what actually bites.
- **Classification reverted** (`retryable: isTransientSqlstate(error.code)`):
  the browser check reddened at both widths
  (`maps_stock_one_row_per_placement=true`, `maps_nodes_elevation_slot=true`),
  and three assertions in `tests/maps-constraint-refusals.test.ts` failed.
- Both files were restored from an in-memory copy, never with
  `git checkout --`, and md5-verified identical afterwards
  (`af5f7293...` for `transports.ts`, `1576bdf3...` for `photo-prepare.ts`).
  The suite was re-run green after each restore.

## Where the expected values come from

`tests/maps-constraint-refusals.test.ts` does not hand-write
`duplicate key value violates unique constraint "..."`. It boots the real
migration chain plus 0168, seeds through the real RLS policies as a real admin,
publishes through the real `maps_publish`, and PROVOKES each of the three
duplicates -- the placement, the elevation slot, and the pending-revision race
-- capturing the driver's own `code`, `message` and `detail`. Those are then
handed to the REAL `mapsTransports`. What is faked is the wire, not the
decision. A test that typed the message in would have been asserting that the
parser agrees with the author's guess about PostgREST's wording.

The `stagePending` case is driven the same way, with the REAL pending-slot
error, and asserts a plain success plus two update passes -- so the race path
demonstrably never asks the classifier anything.

## What is NOT verified

- **No live Supabase project was touched**, and none can be from here: the
  local `.env` is a placeholder ref. Every claim about the bucket comes from
  reading 0168 and 0163.
- **The applied state of 0167-0170 against production is unknown to this
  session.** Nothing written here requires 0168 to be applied; the
  pass-through set is correct under both the wildcard and 0168's list.
- **The Safari half of the HEIC rule is not proven and cannot be from this
  container.** There is no HEIC encoder here -- no ImageMagick, no libheif, no
  ffmpeg, checked -- so no genuine HEIC photograph exists to decode. The
  success branch is driven with a real PNG under a `.HEIC` name and an empty
  `File.type`, which is exactly the state Safari is in with a real HEIC (a
  browser decodes by content and never by filename) and is the only way to
  reach that branch at all. The refusal branch uses real ISOBMFF bytes with a
  genuine `heic` `ftyp` box, which Chromium refuses identically to a real
  HEIC. **Both caveats are printed ON THE HARNESS PAGE**, and a `presence` row
  in the spec asserts there are exactly two of them, so the admission cannot be
  quietly deleted.
- **The real `/maps/edit` and `/maps/edit/shelf` surfaces were not opened.**
  They are admin-only and no cloud session holds a Bosco Tech account.
- Web fonts do not load in the harness (non-loopback requests are blocked), so
  every text measurement is in the fallback stack, and
  `prefers-reduced-motion` is `no-preference` throughout.

## Reported, not changed

Three things outside this bundle's owned surface.

**`CLAUDE.md`'s IDEA Maps section is stale about the bucket.** It says "THE
BUCKET'S `image/*` WILDCARD ADMITS SVG AND THE CLIENT REFUSES IT ANYWAY ...
closing it properly is a migration replacing the wildcard with a concrete
raster list, which no bundle has written yet." 0168 wrote it. The same
paragraph in `src/lib/maps/media.ts`'s own header carries the same stale claim;
it is left alone because rewriting a pre-0168 file's reasoning is not what this
bundle was asked for, and because the SVG refusal it describes is still correct
and still wanted (0168 does not retroactively remove an SVG already stored).

**`$lib/notebook/camera.ts` is misnamed for what it now is.** Nothing in
`decodeImageFile`, `drawToCanvas`, `imageSize` or `releaseImage` knows a
notebook exists, and maps is now its second consumer. Moving it to a neutral
module is the tidier answer and is a rename across two subsystems, one of which
is read-only to this bundle.

**`toBlob` stays private to the notebook**, so `photo-prepare.ts` has its own
eight-line promise wrapper around `canvas.toBlob`. That is a DOM call, not a
rule: the notebook's version is hardcoded to its own quality curve and its own
target type, and exporting it would mean editing a file this bundle may not
touch. `tests/maps-photo-prepare.test.ts` sweeps the module (comments stripped,
with a positive control proving the stripping) to make sure a second DECODER
never appears beside it.

## Deliberately not done

No migration (none permitted, and neither item needed one). The public viewer
at `/maps` is not in this bundle. No edit under `src/lib/classroom/**`,
`src/lib/notebook/**` or `src/lib/server/**`. No `classroom-updates.json`
entry: the maps editor is admin-only and nothing a class sees changed.
