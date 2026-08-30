---
title: "IDEA Maps: item entry at the shelf, a phone-first flow that keeps its drawer across a save and refuses an oversized photo before it leaves the building (`claude/editor-bundle-survey-q3gb7a`, no migration)"
date: 2026-08-30
branches: [claude/editor-bundle-survey-q3gb7a]
subsystems: ["IDEA Maps", "Testing"]
migrations: []
---

Application code only, on 0161-0167 exactly as they stand on `main` (0167 is
unapplied and is FRC's, not this bundle's). No migration was written and one
was not needed: 0163 already created the `maps-media` bucket and the
`maps_photos` table, and its own header hands the editor bundle the two
obligations this discharges.

## The branch, and why it was restarted

The previous bundle on this branch name (the maps placement surfaces) was
auto-merged into `integration` by `.github/workflows/integrate.yml` and the
branch deleted, which CLAUDE.md names as the workflow behaving correctly. So
this one was cut fresh from `origin/main` rather than stacked on the merged
history. **That means `main` does not carry `PlanCanvas.svelte` or
`UnitElevation.svelte` while this branch is open, and the merge of this branch
into `integration` can conflict in three files both bundles touched**:
`src/routes/dev/maps-edit/fixture.ts`, `src/routes/dev/maps-edit/+page.svelte`
and `tools/browser-verify/README.md`. All three are textual and obvious to
resolve; naming them here is cheaper than rediscovering them.

## What the survey found, before anything was written

The brief said part of this might already be built. The item half was not.

`MapsItemForm.svelte` exists and is a real item EDITOR -- type picker, own
name, serial, notes, draft-and-publish, delete -- mounted inside a node's
detail pane in the desktop master-detail split. It is not the flow spec 7 asks
for, and the gap is not cosmetic:

- **no aliases and no tags**, because those live on `maps_item_types` and this
  form can only PICK an existing type, never make one;
- **no photo of any kind.** `grep -rn -i 'camera|capture=|maps-media' src/lib/maps
  src/routes/maps` matched nothing at all, and `loadMapsEditorData` did not read
  `maps_photos`, so 0163's whole half of the schema had no client;
- **it closes on save** (`onclose()` after a create), so thirty things in a
  drawer is thirty presses of "Add unique item" inside a tree, on a desktop
  split, reached by walking down from a building.

So the whole surface was built.

## What shipped

`/maps/edit/shelf` -- a single-measure page, no split, reached with
`?node=<container>` -- mounting `ShelfEntry.svelte`. Photo first (camera or
gallery), name with live suggestions over the existing vocabulary, aliases and
tags through the editor's own `ChipListInput`, one branch for "just this one"
or "several of them", serial or quantity, notes. Save makes a DRAFT; publish is
a separate armed step that says what publishing means. Underneath: a receipt
list of what this session added, and what was already in the container.

Three new pure modules -- `media.ts` (the 0163 rules), `shelf.ts` (the entry
arithmetic and the save plan), `shelf-mirror.ts` (the local backup) -- plus
`MapsPhotoTransports` beside the existing write surface, `maps_photos` added to
the one editor read, the `/dev/maps-shelf` harness with four states, two
browser-verify route specs and three test files.

## The load-bearing decisions

**THE CONTAINER IS CONTEXT AND A SAVE MUST NOT TOUCH IT.** This is the whole
difference between the flow spec 7 asks for and a form somebody re-navigates
to: the card empties, the drawer stays, focus returns to the name box, and the
thing just made joins the receipt list. `containerId` is seeded once from the
route and changed only by a person pressing Change container -- never by a
save, a reload or a failure. Both the mount test and the browser probe measure
it as a BEFORE and AFTER pair rather than asserting it, and the required
mutation proof is exactly this line.

**THE RECEIPT LIST IS NOT DECORATION.** An acknowledgement has to survive the
act it reports, and here the act CLEARS the card that would have carried it --
so "saved" belongs on the surface that is on screen afterwards. Without it a
person on a phone presses save, watches a card empty itself, and has no
evidence anything happened. This is the delete-acknowledgement rule in its
other costume.

**PUBLISHING SAYS WHAT PUBLISHING MEANS, ON THE CONTROL, AT THE MOMENT IT IS
PRESSED.** Every `maps_*_public_read` policy is `to anon` where status is
published, so a published row is readable by anybody with no account at all.
That belongs in a confirm step and not in a help page nobody on a shop floor
will open. **The default Save is one press with no confirm**, deliberately: it
makes a draft (4.3), a draft is not outward-facing, and the frequent action has
to stay frequent or the surface stops being the thing spec 7 asked for.

**A TYPE IS MINTED ONLY WHERE VOCABULARY HAS NOWHERE ELSE TO LIVE**, which is
the decision the three-table model forces and the flow must not make a person
read off a diagram. "Several" always needs one (`maps_stock.item_type_id` is
not null). "Just this one" WITH aliases or tags needs one. "Just this one" with
neither mints nothing -- 0161's named-or-typed rule allows a typeless item
carrying its own name, and 0162 indexes `i.name` at weight A beside its type's,
so the thing is findable by what was typed. Minting an empty type per one-off
would fill the searchable vocabulary with rows nothing will ever reuse.

**PICKING AN EXISTING TYPE REUSES ITS VOCABULARY AND DOES NOT EDIT IT.** A
published type's edit is a staged pending revision, which is a publish-model
decision with no business happening as a side effect of cataloguing a drawer:
somebody adding "allen" at a shelf would be staging an edit on a public row
whose consequences they cannot see from here. The picked type's aliases and
tags render read-only with a sentence saying where they are edited. The
suggestions match on name, alias AND tag, so the second hex key set in a drawer
finds the first by what somebody actually calls it.

**THE PHOTO REFUSAL HAPPENS BEFORE A BYTE MOVES, AND 0163 ASKED FOR IT.** That
migration's header states this bundle's obligations in as many words -- "the P1
editor's upload path must set a concrete image/* type from the file's extension
-- File.type is legitimately EMPTY for HEIC off an iPhone ... That obligation is
the editor bundle's and is stated here so it is not discovered as a field bug."
`mapsImageMime` is the one place that is discharged. The size gate is the half
0163 did not ask for and the posture demands: a 21 MB photo pushed up school
wifi and refused on arrival is a minute of somebody's time standing at a
toolbox, and the same refusal off `File.size` costs nothing. The sentence
states the size AND the limit, because "too large" with no number is a guessing
game.

**THE CONSTANTS ARE A MIRROR OF 0163 AND THE TEST READS THE MIGRATION.**
`tests/maps-shelf.test.ts` parses the bucket's `file_size_limit` literal and the
`storage_key` CHECK regex out of `0163_maps_media.sql` itself and puts every
produced key back through that regex -- a mirror compared against a description
proves only that somebody typed the description twice.

**STORAGE FIRST, ROW SECOND, AND THE ORDER IS THE ARGUMENT.** Row-first would
leave a row naming bytes that are not there, which renders as a broken image on
a public map and which nobody can repair without the file. Object-first leaves
at worst an orphaned public image nobody references -- the same acceptable
failure 0163 already argues for on the deletion side.

**A FAILED PHOTO NEVER ABANDONS THE ROW.** The item is created first and the
photo attempted after; a failure leaves a saved row, a receipt that says
`photo not uploaded` rather than reading as a failed save, the file still
staged, and a Retry that uploads only the photo.

**WITHHOLDING THE PHOTO TRANSPORTS REMOVES THE CAMERA.** They are a separate
injected object rather than four more methods on `MapsTransports`, which keeps
`MapsTable` meaning the four tables that carry publish state (a photo carries
none -- 0163: it is content of its owner) and makes read-only-ness structural.

## What was done about losing the signal mid-entry

Three mechanisms, because the ways this fails are different:

1. **The typed card is mirrored into `localStorage`** on a 400ms debounce
   (`shelf-mirror.ts`), keyed per viewer and per container. The failure it
   exists for dispatches nothing and so has no failed write to report: a phone
   browser discarding a backgrounded tab while the camera app is in front. Per
   CONTAINER rather than one slot, so walking from one drawer to the next and
   back finds what was left in each. Per VIEWER, so a shared school device
   cannot hand one person's half-typed entry to the next -- asserted in both
   directions, including the positive control that the SAME viewer does get it
   back.
2. **A failed save leaves the card exactly as it was** and says why, so the
   retry is one press and nothing is retyped.
3. **A save whose row landed and whose photo did not** is reported as exactly
   that, with the photo still staged.

**The one thing the mirror cannot hold is the PHOTO**, and the surface says so
while the picture is staged rather than after it is gone: a picked or captured
`File` is a handle into that tab's own memory with nothing to serialise. A
storage refusal is said out loud and never thrown -- `blocked` and `full` get
different sentences, because a safety net nobody knows is missing is worse than
none.

It is the same PATTERN as `$lib/notebook/draft-mirror.ts` and not a reuse of
it: every rule is that module's, followed here, but its payload is a
ProseMirror document and an entry id with no shelf draft inside it. Generalising
it would mean editing a notebook module from a maps bundle.

## Measured, 375px first, because that is the width this surface is used at

`npm run verify:browser`, Chromium 141.0.7390.37, two new specs at both widths:
**78 measurements over 4 route/width runs, 0 outside threshold** after three
real fixes (below).

- **No horizontal overflow at 375px**: `0px overflow (scrollWidth 375 vs
  clientWidth 375)`, and the same at 1440.
- **Every control in the flow clears 44px at 375px**: name box `315.4x44`,
  camera and gallery buttons `117.3x44`, the how-many choices `112.1x44`, Save
  `315.4x48`, Save & publish `315.4x48`, Change container `182.1x44`, the
  aliases and tags chip inputs `300.6x44`. Nothing joins a density row and
  nothing takes an exemption.
- **A photo over the bucket's limit is refused before the upload starts, and
  visibly**: `["refused","said the size","said the limit","nothing staged"]`.
  The last element is the one that matters -- a refusal shown after the bytes
  went is not this rule -- and the transport's own call log is asserted empty in
  the mount test, where it is reachable.
- **After a save the next entry is in the same container**: `["Drawer 1","Drawer
  1","card empty","name focused","Bevel Protractor in Drawer 1."]`, measured as
  a before/after pair rather than asserted.
- **The draft state is visible on a freshly created item**: `["draft
  chip","not published","Draft"]` -- both directions, and the chip's WORD with
  its glyph stripped, because colour is never the only signal.
- **Publishing explains first and writes nothing on the first press**:
  `["explained","said who can read it","nothing written yet"]`.
- **Contrast** at 375px, read back off a canvas against the real rendered
  ground: field labels and hint copy **5.88:1**, the save control **6.39:1**,
  the containment chain **6.91:1**, the eyebrow **7.85:1**, the how-many choices
  **12.09:1**. All above 4.5.
- **0 console errors** on both states at both widths.

`npx svelte-check`: **0 errors, 37 warnings** (31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`) -- the CLAUDE.md baseline,
unmoved. `npm test`: **218 files, 4497 tests, all passing**, 179.1s.
`verify:browser --selftest`: 64 controls, 0 instrument failures. The whole
browser suite: **1080 measurements over 90 route/width runs, 4 outside
threshold**, none of them in maps (see below).

Harness limits belong beside these numbers: web fonts do not load, so text is
measured in the fallback stack and every PIXEL figure is approximate (contrast
is not -- colour is resolved by painting and reading the pixel back); and
`prefers-reduced-motion` stays `no-preference`, though nothing here animates.

## Three real defects the browser pass caught, at 375px

Worth recording because two sessions have now used this instrument to find
things nothing else would have:

1. **The chip inputs measured `300.6x32`, under the 44px floor.**
   `ChipListInput` shipped in the previous maps bundle at `min-height: 32px`,
   which nothing had measured at the width its busiest caller is now used at.
   It is the one control in this flow a person types the SEARCH VOCABULARY into,
   so it is not a candidate for the 24px density exemption the chip's own remove
   button legitimately takes (44px there would overlap the chip beside it and
   steal its taps). Raised to 44 and re-measured; its `min-width` went from
   `8rem` to `0` in the same edit, so a long chip cannot push the wrapping row
   past a 375px viewport.
2. **Two presence rows asked the wrong question**, and the report said so
   rather than passing: `present 1, visible 0` on the camera and gallery
   inputs. Those are deliberately transparent and stretched over the `<label>`
   that paints the button, which is the only way to style a file input -- so
   the VISIBLE control is the label, measured as such by the tap-target row.
   The spec now asserts `expectVisible: 0, maxVisible: 0` on the inputs and a
   separate visible-count row on the two labels, which is a stronger claim in
   both directions than the one it replaces.
3. **A receipt assertion sliced through a status chip's glyph**
   (`"Bevel Protractor in Drawer 1. ○Dra"`). The probe reads the label element
   now rather than the whole row.

## The negative controls

Three, each restored from a scratch copy taken BEFORE the mutation -- never
`git checkout --`, which is a discard-to-HEAD that would have taken this
session's whole uncommitted tree -- then md5-verified and re-run green.

1. **THE REQUIRED ONE: the container resets after a save**
   (`containerId = null` in the save's clear step). It reddened **7 of 20**
   mount assertions and **4 of 39** browser measurements at 375px, including
   the container probe itself. Restored: md5
   `d23b07296dafe711849bec5648337834` both sides, 20/20 green.
2. **Every absence forced to appear at once** -- the container picker, the
   receipts, the publish confirmation and the photo refusal all initialised to
   their shown state, and the `no-photos` harness state handed the transports it
   is supposed to lack. **All seven absence rows across the two specs reddened**
   (`present 1` against `exactly 0`), plus one honest consequence (the
   `Save & publish` tap-target row found nothing, because arming the confirm
   replaces that button). Restored byte-identically, 0 outside threshold.
3. **The hoisted gate**, asserted rather than mutated in the tree:
   `tests/maps-shelf-route.test.ts` drives the real layout load and proves the
   editor page's own second `isAdmin` layer stays closed independently, which
   is the defence-in-depth claim measured rather than described.

## The third schema gap, reported and built around

The brief named two known gaps and asked for a third if one turned up. It did.

**`maps-media`'s `allowed_mime_types` is the single wildcard `image/*`, on a
PUBLIC bucket, which admits `image/svg+xml`.** An SVG is a document, not a
picture: it carries script, external references and event handlers, and Storage
serves it as `image/svg+xml` rather than rewriting it the way its renderer
unconditionally rewrites `text/html` to `text/plain`. So an accepted one is a
scriptable document on a public URL served from the project's own Storage
origin. Nothing in this bundle can close that -- the fix is a migration
replacing the wildcard with a concrete raster list
(`image/jpeg, image/png, image/webp, image/gif, image/heic, image/heif,
image/avif`), which is `update storage.buckets set allowed_mime_types = ...`
plus a self-check reading it back. **What this bundle does instead is refuse
SVG client-side, by declared type AND by extension**, because either can be the
only spelling present, with the reason in the person's terms. That narrowing
cannot close the hole (a caller skipping the module reaches the same bucket);
what it buys is that the one shipped upload path never produces one.

## Not verified

- **The live Supabase project.** No upload, write or publish here touched
  production or the real `maps-media` bucket. Every photo in every test is a
  `File` handed to an in-memory transport that logs what it was given.
- **A real camera on a real phone.** `capture="environment"` is asserted as an
  attribute and reasoned about from the spec and CLAUDE.md's own measured
  Android behaviour; no run here opened a lens. The two-input shape exists
  precisely because that attribute is a hint, and the fallback is the thing
  that has to work when it is ignored.
- **A signed-in browser session on `/maps/edit/shelf`.** It needs a Bosco Tech
  admin account no automated run holds. The harness mounts the identical
  component, so what stays unverified is the route's own load and RLS, which
  `tests/maps-shelf-route.test.ts` drives in the db fixture instead.
- **An actual dropped connection.** The mirror is driven through real
  `localStorage` across two mounts; a genuinely discarded tab is not
  reproducible here.

## Two findings that are not this bundle's

The full run's 4 measurements outside threshold are the same two findings as
the last maps bundle, both outside maps, both at both widths:
`/dev/pathways`'s harness controls at `194.7x26.2px`, and
`/dev/foundry-submit`'s preflight sentence sweep measuring `present 2` against
`exactly 4`. Nothing in this diff is reachable from either route.
`tools/browser-verify/README.md`'s counts were corrected in place as that file's
own rule requires: 36 specs -> **45**, 780 measurements over 72 runs -> **1080
over 90**, 184.7s -> **204.0s**, and the foundry finding added to its known list.
