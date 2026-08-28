---
title: "Digital notebook (student UI)"
date: 2026-08-09
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 24
---

## Digital notebook (student UI)

The student-facing half of the notebook: `/notebook` (personal notebook +
upload) and the `/notebook/review` placeholder. UI ONLY -- it calls the
existing 0069/0071 data layer as it stands, and touches NOTHING in
`notebook-drive.ts`, the migrations, or the two `/api/notebook/*` routes.

- **Open to ANY signed-in account, deliberately, with no role check on the
  personal half.** A notebook is a personal record, so a teacher keeping one
  of their own is normal -- this is the opposite of `/coin-balance`, which is
  genuinely student-only. `/notebook` is in `hooks.server.ts`
  `authedPrefixes`, so anonymous visitors get the standard 303 to `/` (the
  `+page.server.ts` redirect is belt-and-braces for a direct load).
- **Every read runs as the CALLER'S OWN session with NO `student_id`
  filter** (the `/coin-balance` doctrine): 0069 already grants a signed-in
  user SELECT on their own `notebook_entries` and, via
  `notebook_can_read_entry`, their photos -- so the filtering IS the RLS
  policy, never application code. The page calls NO RPC at all;
  `notebook_create_entry` / `notebook_add_photo` are reached only through
  the two API routes.
- **`src/lib/server/notebook-access.ts` is the ONE review-tier check**,
  reusing both tiers the data layer already recognizes rather than inventing a
  third: INSTRUCTOR (**since `0094`, the TEACHER OF RECORD of a
  `classroom_sections` row -- the same question `classroom_manages_section()`
  asks inside every policy; it must FILTER ON `teacher_email`, because 0082
  lets an enrolled STUDENT read that table too and an unfiltered probe would
  hand every student the review link**) OR
  CHAIR (the 0067 admin tier via `isAdmin()`). **`role === 'teacher'` is NOT
  used** -- the 0067 naming trap. Fails CLOSED on any error.
- **`/notebook/review` is a PLACEHOLDER** (the real grid is a later session
  and will call 0069's existing `notebook_get_section_grid`). What ships is
  the permission check and the URL so neither has to move. A non-reviewer
  gets a **404, not a redirect** (the `/admin` rule), though anonymous
  visitors never reach it -- the `/notebook` prefix guard fires first.
- **`src/lib/notebook.ts`** is the client-safe pure layer (row types +
  display/selection helpers, the `curriculum.ts` convention) and
  **`src/lib/notebook/NotebookView.svelte`** is the whole screen, so
  `/dev/notebook` mounts the identical component (the `CoinBalanceView`
  split). The view owns the UPLOAD SEQUENCING -- photo 1 creates the entry,
  every later photo joins it -- but not the transport: `createEntry` /
  `addPhoto` / `createNote` are INJECTED, so the real page points them at the
  three API routes while the harness answers in memory. That split is what
  makes the multi-photo orchestration itself testable with no network.
- **The free-form tier can be a NOTE with no photo at all (0075).** *(The
  note's CONTENT moved out of `custom_label` into its own table in 0078 -- see
  "Digital notebook (written notes)" below. The mode picker, the tier split and
  the separate `/api/notebook/note` route described here are unchanged; what
  the note mode renders is now the rich editor, and `custom_label` is an
  optional title.)* A mode
  picker ("Photos" / "Just write a note") renders ONLY when no session is
  selected; the session-linked path is byte-identical to before, shows no
  note option, and still refuses to submit without a photo. Photos is the
  default, so the existing free-form photo flow is unchanged. Note mode swaps
  the "Label (optional)" field for a required "Note", hides the photo picker
  (and CLEARS anything staged, so a dropped file is visible rather than
  silent), and submits ONE call to `/api/notebook/note`. Because the mode is
  read through a derived `selectedSession === null && freeMode === 'note'`
  rather than stored as the form's state, picking a session can never leave
  the form in a mode that tier does not offer -- browser-verified by
  switching to note mode and then choosing a check-in.
- **`/api/notebook/note` is its own route, not a branch in
  `/api/notebook/upload`.** A note shares exactly ONE step with a photo
  upload (the `notebook_create_entry` call); multipart parsing, the size/mime
  gate, the Drive-configured gate, the human-readable filename, the upload,
  the rename to the entry's short id and the orphan delete are all about a
  FILE, and folding a note in would grow an "if there is a photo" branch
  around every one of them. Consequence worth keeping: a note works on a
  deployment where Drive is not configured at all (the UI keeps the note path
  live when `uploadReady` is false, and says so), which is correct -- a note
  needs no Drive. It takes JSON, not multipart, requires a real session (401
  otherwise), and passes `session_id` THROUGH rather than blocking it, so the
  photo-required rule stays in the RPC alone instead of gaining a second copy.
- **A blank label is sent as NOTHING AT ALL, not an empty string.** 0071
  made the label optional and the upload route falls back to the file's own
  name, so the UI must not re-impose a required-label rule the backend
  dropped. Browser-verified: a free-form submit with an empty label puts
  only `photo` on the FormData -- no `custom_label` key.
- **Entry titles bottom out in a placeholder, never a blank line.**
  `entryTitle()` walks session label -> `custom_label` -> the first photo's
  `original_filename` (extension stripped) -> `'Untitled entry'`, because
  since 0071 a fully unlabeled entry is a VALID state.
- **Session quick-picks** cross-reference the student's own section's
  `notebook_sessions` against their own entries (both already readable, no
  new RPC) and default to the outstanding session NEAREST TODAY in either
  direction. **A pick that stops being outstanding is treated as STALE and
  drops back to the default** -- found in the browser, not review: the feed
  reloads after every save, so a pick that just received an upload would
  otherwise persist and silently file the NEXT entry against an
  already-covered check-in.
- **Photos are the priority content**: one per row at full column width
  (measured 744px at a 1280 viewport, up to 40rem tall), never a thumbnail
  grid, with reserved height so a slow load cannot collapse the frame.
- **Editorial light theme (`.nb-root`), the notebook's own room.** The
  student feed, upload flow (photo corrector included), and instructor
  review console all render inside a light, editorial skin deliberately
  distinct from the portal's dark technical theme -- warm off-white
  `#fafaf7`, warm near-black ink, restrained gray meta, hairline borders,
  system sans stack (no new webfont), and ONE accent thread back to the
  platform: the existing `--gold` for links, active states (selected picks,
  the corrected/original toggle), and the flag-status accent (`--nb-accent`
  IS `var(--gold)`; `--nb-accent-ink` is the same brass deepened only for
  text legibility on light, since raw #c8a848 measures ~2.2:1 there).
  - **Tokens live in the design-system layer** (`colors.css` / `effects.css`,
    the `--nb-*` blocks -- purely ADDITIVE, no existing token changed;
    status feedback colors derive from existing tokens via color-mix, never
    new hues). `src/lib/notebook/notebook-theme.css` is the scoped skin over
    the shared global classes (.app-header/.card/.btn/.hero/.eyebrow) plus
    the FRC/FSP-convention neutralizations (no green `// ` h2 prefix, no
    link glow, opaque above `.bg-fx`), imported by NotebookView and
    ReviewConsole, which both wrap their templates in `.nb-root`. The
    homepage launcher card is untouched.
  - **Two deliberate dark islands:** the masthead (`.app-header` stays an
    ink band, because the AnimatedLogo emblem and ProfileMenu are drawn for
    dark ground) and the PhotoCorrector overlay (warm near-black so the
    green drag quad/handles keep their contrast over arbitrary photos; only
    its chrome -- sans type, sentence-case paper buttons -- went editorial).
  - **The review grid's density and status cells are a LOCKED CONTRACT the
    restyle verified, not assumed:** cell size (1.9rem), paddings, all six
    glyph characters (✓ ⤴ ○ ! E –) in Share Tech Mono (now set explicitly
    on the legend `.chip`, which used to inherit it), and every state's
    exact token colors (--green/--amber/--cyan/--crimson/--ice/--gear) were
    measured identical before/after; only chrome (hairlines, sticky
    name-column now `--nb-surface`, the multi-entry badge bg, legend label
    type) changed. EntryReview's PANEL status chips are the one deliberate
    exception: same hue families deepened via color-mix for small-text
    legibility on the light card.
  - **A real pre-existing mobile bug fixed in passing:** the review page's
    section `<select>` had no width constraint, so its longest option text
    forced the whole layout viewport to ~424px at a 375px phone (also true
    at HEAD, analytically); `width:100%; min-width:0` on it fixed the page
    to exactly 375/375 with the grid still scrolling in its own container.
  - **Verified** by measurement in `/dev/notebook` + `/dev/notebook-review`
    (computed styles, not eyeballing): bg rgb(250,250,247), ink
    rgb(38,34,27), white cards with hairline #e8e5dd + 10px radius + paper
    shadow, 42px feed gap + 29px entry padding, photo at 649px the widest
    element in the column, flag chip/callout on the gold thread, corrector
    functional layer byte-identical (quad stroke rgb(120,184,112), 18px
    dots, 44px targets), homepage/coin-desk tokens + `// ` prefix + bevel +
    launcher card gold icon all unchanged, 0 new svelte-check warnings,
    78/78 tests. **HARNESS TRAP found while verifying:** the non-compositing
    preview pane freezes CSS TRANSITIONS at t=0, so a computed style read
    through one (the .btn background transition) reports the PRE-transition
    value forever -- set `el.style.transition='none'` before asserting
    computed colors on anything the global .btn transition covers.
- **Pre-upload photo correction (client-side only, no schema/RPC change).**
  Every picked photo passes through an interactive correction step before it
  uploads (`src/lib/notebook/PhotoCorrector.svelte`, one photo at a time even
  for a multi-file pick, never one correction applied to a batch): the image
  full-screen with four draggable corner handles seeded by best-effort page
  detection (bright-page-on-darker-desk model; unconfident falls back to
  near-corner defaults), confirm flattens the chosen quadrilateral into a
  rectangle plus a percentile contrast/brightness auto-level, and an
  always-visible Skip uploads the original untouched (a photo the browser
  cannot decode, e.g. some HEICs off-device, auto-skips with a note).
  - **Zero-dependency by choice:** OpenCV.js (or jscanify wrapping it) is
    ~8-10 MB of wasm for a camera-first phone flow whose real needs are a
    4-point homography (closed-form 8x8 solve), an inverse-mapped bilinear
    warp, a levels stretch, and an Otsu-threshold largest-bright-region
    corner guess -- all in `src/lib/notebook/photo-correct.ts` (pure, no
    Svelte/DOM, importable by a harness or `await import(...)` in a dev
    console). Touch dragging is native pointer events with capture either
    way. **Deliberately NOT corrected: page curvature near the spine** -- a
    straight four-corner warp handles skew and angle only; modelling curl is
    a mesh-warp problem left for later if this proves insufficient.
  - **PAIRING IS BY ADJACENCY, because literal sequence-sharing is
    unrepresentable.** The intent "the enhanced shares the original's
    sequence_order" collides with 0069's `unique (entry_id, sequence_order)`
    AND `notebook_add_photo`'s unconditional max+1 -- fixing either is a
    schema/RPC change this feature deliberately avoids, and 0069's own
    header already defines the design: "'enhanced' variants stored NEXT TO
    the 'original'". So a corrected photo uploads IMMEDIATELY after its own
    original (original via the usual route, then the corrected JPEG through
    the same `/api/notebook/add-photo` with `variant=enhanced`), landing on
    adjacent sequence numbers; an original whose upload failed skips its
    enhanced so a pair can never form against the wrong original.
  - **Display groups rows into LOGICAL PAGES** (`photoPages` in
    `notebook.ts`: walk rows in sequence order, attach each 'enhanced' to
    the immediately preceding original). A page with both variants renders
    ONCE in `NotebookPhotos.svelte` -- the shared renderer, so the student
    feed AND the instructor review panel get it identically -- showing the
    CORRECTED version by default with a small Corrected/Original toggle,
    never as two separate pages; photo-count lines count pages. A page with
    only an original (the entire pre-correction history) renders exactly as
    before, page numbers included, since all-original sequences are
    contiguous from 1 by construction.
  - **Verified** in `/dev/notebook` + `/dev/notebook-review` by driving the
    REAL flow with generated test images (the harness stashes every received
    upload on `window.__notebookReceived` so outputs are decodable):
    detection landed within ~8px of an authored page quad; a synthetic
    pointer drag moved exactly the dragged corner and Reset restored
    detection; the decisive warp proof dragged all four handles onto colored
    markers and found those exact colors at the output's four corners in
    TL/TR/BR/BL order, with the output sized to the dragged quad's own
    geometry (600x432 vs the page quad's 1075x780 -- dragging genuinely
    moves where the warp samples); auto-levels pushed paper to 94.9% bright
    pixels; a corrected submit produced exactly upload + add-photo
    `variant=enhanced` (adjacent rows) and the feed showed one page
    defaulting to the enhanced with the toggle flipping img src both ways;
    Skip (and Escape) produced exactly ONE upload call, no enhanced row, no
    toggle; a 2-file pick ran the corrector twice ("Photo 1 of 2" / "2 of
    2") and correct-then-skip yielded upload, add-photo enhanced, add-photo
    original with page 1 paired and page 2 plain; the review panel defaulted
    to the enhanced (drive-p-1e) and toggled to the original; a
    single-original review cell rendered unchanged; mobile 375px asserted
    geometrically (canvas fits, 44px handle hit targets, all controls in
    view, SVG overlay pixel-aligned). `npm run check` 0 errors / no new
    warnings; `npm test` 59/59. **Checked by eye only: nothing** -- but the
    pane could not composite a mobile screenshot, so the phone-width look
    was asserted geometrically rather than visually.
- **Camera capture (`src/lib/notebook/camera.ts`), after a real phone test
  found the flow broken two ways: the wrong lens, and a capture that went
  nowhere.** The "nothing happens" half had TWO independent causes, both
  reproduced before anything was changed rather than guessed at.
  - **CAUSE 1, the silent stall: `PhotoCorrector.load()` guarded only the
    DECODE.** Everything after it -- sizing the canvas up to `SOURCE_MAX`
    square, `getContext`, and drawing a full-resolution bitmap into it -- ran
    unguarded inside a function invoked as `void load()`, so a throw from any
    of them became an unhandled rejection that nothing surfaced while
    `loading` stayed true FOREVER. What the student sees is a dark overlay
    stuck on "Opening photo...", Flatten and Reset both disabled, nothing
    staged behind it, and Save never enabling -- i.e. exactly "I took a photo
    and nothing happened". **Camera-specific because it is size-dependent:**
    those are the allocations a 12 MP capture makes, and the smaller images a
    gallery pick tends to be never reach them. Reproduced by making
    `drawImage` throw on a 4032x3024 file, which pinned the corrector open
    with a real `rejection: out of memory` and an empty staging list; with
    the fix the identical injection stages the photo, explains itself, and
    enables Save. `load()` now ends every path in an `onDone()` call.
  - **CAUSE 2, the size cap: a real 12 MP camera JPEG is over it.** The
    corrector uploads the picked file UNTOUCHED as the 'original' variant,
    and `MAX_PHOTO_BYTES` is 4 MB. A synthesized 4032x3024 frame with genuine
    photographic noise measures **4.38 MB**, and published figures put real
    12 MP captures at 4-7 MB and modern sensors well past that -- so the
    camera path was failing at the route on size while gallery picks sailed
    through. `fitForUpload()` re-encodes only what is over the ceiling
    (**measured 4.38 MB -> 841 KB**, entry saved); anything under it is
    returned as the SAME object, byte-identical, and every failure returns
    the original rather than something worse.
  - **A THIRD, latent one found on the way: `File.type` can legitimately be
    empty.** The File API REQUIRES an empty string when the platform cannot
    determine a media type, which is the norm for HEIC/HEIF off an iPhone --
    and `readPhotoForm` keyed its allowlist on `photo.type` alone, so a real
    camera photo was refused as "must be JPEG, PNG, WebP, or HEIC". It now
    falls back to the filename extension (and accepts the `image/jpg` alias),
    exposing a resolved `mimeType` both routes store the bytes under.
  - **Decoding can never hang.** An oversized image on a pressured phone can
    leave an `<img>` that fires NEITHER load nor error, and
    `createImageBitmap` can sit on a decode that never settles;
    `decodeImageFile` imposes ONE deadline shared across both strategies
    (`DECODE_TIMEOUT_MS`, total -- a per-attempt budget silently doubles, and
    the first cut of this shipped that bug: measured 24s before it was made a
    single shared deadline). `SOURCE_MAX` also dropped 3200 -> 2400, which
    takes the `getImageData` allocation from ~30 MB to ~17 MB while staying
    above the 2000 px warp output, so the warp still supersamples.
  - **THE FRONT/BACK FIX IS NOT getUserMedia AS THE PRIMARY PATH, and the
    reasoning is the point.** `capture="environment"` is a HINT the spec only
    says a browser SHOULD honour, and **Android Chrome, Samsung Internet and
    Firefox Android act on the PRESENCE of `capture` but not its VALUE**
    (mdn/browser-compat-data#19603 reports `capture="user"` opening the REAR
    camera on Android 13; MDN now flags the attribute as not Baseline). iOS
    Safari does honour it. So on Android you get the camera app with whatever
    lens it was last left on -- which is usually the rear one, which is
    exactly why this is easy to miss and unsafe to rely on. The obvious
    replacement is worse for THIS feature: **iOS Safari serves getUserMedia
    at roughly 720p regardless of the resolution constraints asked for**
    (~0.9 MP against a 12 MP native capture), and the OS camera app also
    brings autofocus, HDR and multi-frame stacking. Making it the default
    would trade away the one thing a notebook photo exists to be -- legible.
    So the file input STAYS primary, and the fix is threefold:
    1. **Two inputs instead of one.** `capture` makes an input camera-ONLY on
       Android, so the single combined input left Android students with no
       gallery path at all. "Take a photo" carries `capture` and drops
       `multiple` (a capture returns one file, and the combination is
       unspecified); "Choose a photo" carries `multiple` and no `capture`.
    2. **An in-app camera as the explicit escape hatch** (`CameraCapture.svelte`),
       offered as a quiet secondary control and never the default. Here the
       facing mode is a real constraint (`{ exact: 'environment' }` first,
       falling back to the hint, then to any camera) with a Switch button and
       a notice when the track reports back a different lens than was asked
       for. It also never backgrounds the page.
    3. **Surviving the OS camera app.** Android killing the browser for
       memory while the camera app is in front is documented and unfixed
       (Bugzilla 868937, still reproducing in 2025 on Android WebView 139):
       the tab reloads, the input is empty, and `change` never fires. The
       photo is unrecoverable, but the form around it is not -- the pending
       state is written to sessionStorage on the capture CLICK and restored
       on the next load with an explanation. It is cleared both when the
       capture arrives and when the page merely becomes visible again, since
       the page surviving at all is proof there was nothing to recover.
  - **Verified in `/dev/notebook`** by driving the REAL component: the
    stall reproduced and then fixed under the identical injection; a decode
    that never settles bailing at the deadline instead of hanging; 4.38 MB ->
    841 KB with the entry saved, against an under-cap file returned as the
    same object and an undecodable HEIC returned untouched; both file inputs
    carrying exactly the intended attributes; the in-app camera opening with
    `{exact:'environment'}` first, showing Switch on two video inputs, firing
    the wrong-lens notice when a stub reported `facingMode:'user'` (the
    Android behaviour), and its shutter producing a timestamped JPEG that
    flowed into the corrector, which then detected the page corners
    correctly; **exactly ONE getUserMedia call on a permission denial** (the
    ladder correctly stops rather than re-prompting); no-camera and denied
    both closing to a readable message with the file inputs still live; the
    eviction recovery restoring the label and the free-form selection with
    its note, while a gallery pick never arms the marker, a delivered capture
    clears it, and a cancelled one clears it on return. Regressions held:
    multi-photo still issues `upload` -> `add-photo variant=enhanced` ->
    `add-photo variant=original` with the corrected file ADJACENT to its own
    original, a blank label still sends no `custom_label`, the note tier
    still posts one JSON call, and the review console is untouched. A REAL
    LAYOUT REGRESSION was caught this way and fixed: the shared `.field`
    class is a ROW flex, so growing this block past three children pushed the
    hint off the right edge at 375 px (scrollWidth 426 vs 375) -- `.photo-field`
    now states `flex-direction: column`, which is what the stacked
    label/hint margins always assumed. `npm run check` 0 errors, no new
    warnings; `npm test` 83/83; 0 console errors on a fresh tab.
  - **NOT VERIFIED, and it cannot be from here: a real phone camera.**
    Everything above was driven with synthesized files and a stubbed
    getUserMedia against a desktop browser. What still needs a live phone
    test is specifically: which lens `capture="environment"` actually opens
    on the school's real Android devices, whether the in-app camera's
    `{exact:'environment'}` genuinely selects the rear one there, whether a
    real capture survives without the tab being evicted, and what a real
    HEIC off an iPhone does end to end. The eviction recovery in particular
    was verified by SIMULATING the reload, not by inducing a real
    out-of-memory kill.
- **The capture path that LEADS is chosen per platform, after a real Android
  device confirmed the native one broken there.** `preferredCapturePath()`
  (camera.ts) is the whole decision, and it is one line of user-agent
  sniffing on purpose: there is no feature test for "does this browser honour
  the capture attribute's VALUE" -- the attribute is reflected and reported
  as supported either way, and the difference only surfaces as which physical
  lens the OS camera app opens. Getting it wrong costs a tap, not a
  capability, since both paths stay on screen everywhere.
  - **ANDROID leads with the IN-APP CAMERA.** The native `capture` input is
    confirmed broken on a real device (opens the front camera; the photo
    never lands), and Android browsers are separately documented to ignore
    the attribute's value in BOTH directions -- mdn/browser-compat-data#19603
    reports `capture="user"` opening the ENVIRONMENT camera on Chrome 112 and
    74 / Android 13, with MDN stating the normative escape hatch that a user
    agent "may fall back to its preferred default mode". So the front camera
    opening is documented behaviour, not a bug in itself.
  - **iOS and desktop keep the native input, unchanged.** iOS honours the
    facing hint, and getUserMedia's ~720p ceiling on iOS Safari makes the
    in-app camera strictly worse for photographing a page there. Only Android
    is singled out, so only Android is detected -- there is deliberately no
    `isIOS()`, since nothing would branch on it.
  - **The native path on Android is DEMOTED, not removed:** a small labelled
    link ("Use your phone's camera app instead (known to open the wrong
    camera on some Android phones)") rather than a peer button, so it is not
    presented as the normal thing to tap while it is known broken. It stays
    reachable because the OS camera takes a better photo when it works and
    another device may not share the fault.
  - **"Choose a photo" is untouched and equally prominent on every
    platform** -- measured identical at 272x48 beside the primary on all
    three. Picking an existing photo is a DIFFERENT capability, not a
    different way of capturing, so it has nothing to do with which capture
    path is more reliable.
- **The Android "Take a photo" failure was NOT reproduced, and no further
  cause was found. Read this before assuming it is fixed.** What was checked,
  concretely, all against the real code path in `/dev/notebook`:
  - **All 8 valid EXIF orientations, INCLUDING the mirrored set (2/4/5/7)** a
    front camera is documented to sometimes write. Real EXIF APP1 segments
    were injected into real JPEGs. Every one decoded, with the dimension swap
    applied exactly where it belongs (5-8 swap, 1-4 do not) and the canvas
    draw succeeding. **Not the cause.**
  - **Invalid orientation values 0, 9 and 255.** This was the strongest
    documented lead: orientation `0` is out of EXIF's 1-8 range and is
    reported as a FRONT-CAMERA-SPECIFIC defect on Samsung, Xiaomi and OnePlus
    (triniwiz/fancycamera#25), with a documented precedent of invalid
    orientation metadata killing a browser image pipeline outright on Android
    (Donaldcwl/browser-image-compression#187). Measured: all three decode in
    ~25-29ms with correct dimensions and draw fine. **Not the cause either**,
    at least in Chromium's decode path.
  - **The size/memory theory is actively WRONG for a front-camera-only
    failure**, and the previous session's size fix therefore cannot explain
    it: front sensors are far LOWER resolution than rear (12 MP front against
    up to 200 MP rear on a Galaxy S25 Ultra), so a front capture is normally
    the SMALLER file and a byte or memory ceiling would hit rear photos
    first.
  - **What WAS found and fixed, without claiming it is the reported cause:** a
    capture that comes back EMPTY or TRUNCATED used to be staged like any
    other photo and only failed later at the upload route, whose complaint
    ("attach a photo as the photo form field") reads as nonsense to someone
    looking at a photo they just staged. Android's camera intent IS documented
    to produce zero-byte results. `unusableReason()` now screens every file
    before it is staged -- measured: a 0-byte capture and a truncated one are
    both refused by name with "take it again", the corrector never opens,
    Save stays disabled, and a good photo straight afterwards still works.
    Truncated files are the interesting case: they decode and report their
    real dimensions from the header, so only the draw probe distinguishes
    them.
  - **No documented case exists anywhere of a front-camera image failing to
    decode in a browser** -- that search came back empty, which is itself
    worth knowing before someone spends another session on it.
  - **The decisive next step needs the device**, not more searching: on the
    failing phone, capture front and rear and compare `File.name`, `.type`,
    `.size`, the first four bytes, the raw EXIF orientation byte, and whether
    `createImageBitmap` resolves or rejects. Every remaining hypothesis
    separates cleanly on those six values.
- **Staged photos are shown as PHOTOS before saving, not filenames.** The
  pre-save list was a row of names, which say nothing about whether the page
  is in frame, in focus, or even the right page -- the questions someone
  actually has at the moment of committing. The whole staged set renders as
  thumbnails at once (three queued photos = three tiles, two per row at 375px,
  three across the desktop column), so it is a glance rather than a
  one-at-a-time review.
  - **The thumbnail is the CORRECTED version wherever one exists**, matching
    how a saved entry renders everywhere else (`NotebookPhotos` defaults to
    the enhanced variant). There is deliberately no original/corrected toggle
    here: that choice already exists at display time, and this step is "is
    this the photo I want", not "which version". Browser-verified by
    DIMENSION rather than by trusting the binding -- a corrected tile renders
    933x689 (the warp output) against 1200x900 for a skipped one in the same
    staged set.
  - **`object-fit: contain`, not `cover`.** Cropping to fill the tile would
    hide a cut-off page edge, which is the exact mistake the preview exists
    to catch.
  - Blob URLs are cached in a plain (NON-reactive) Map, since the effect that
    builds them reads `staged` and writes `previews` and routing the URLs
    through reactive state as well would have it re-trigger on its own
    writes. Removing a tile revokes its URL (verified: the removed URL stops
    resolving while its neighbour still does) and `onDestroy` revokes the
    rest. A photo the browser cannot decode -- HEIC being the ordinary case
    -- falls back to a tile naming the file rather than a broken-image glyph,
    and still uploads.
- **Photo bytes are served by THIS APP, through a proxy
  (`/api/notebook/photo/[photo_id]`).** This supersedes the original direct
  `drive.google.com/thumbnail?id=...` `<img>` src, which only ever rendered
  for a viewer who personally had access to the school's restricted shared
  drive -- i.e. staff, not the students whose photos they are.
  - **`downloadNotebookFile(fileId)` in `notebook-drive.ts`** is the new (and
    only new) export: it reads the file on the school account's behalf using
    the SAME cached access token upload/rename/delete already use, with the
    same one-shot 401 re-mint retry, and STREAMS the body through rather than
    buffering it. Upload, rename and the naming logic are untouched. It
    deliberately knows nothing about who is asking.
  - **Authorization is a real query, not a check written in the route.** The
    row is read under the CALLER'S OWN cookie session, so 0069's policies
    decide; `notebook_entries!inner(id)` makes the parent entry a second
    hurdle, since PostgREST applies RLS to an embedded resource too. **An
    empty result is 404, never 403** -- RLS returning nothing is
    indistinguishable from the row not existing, and a 403 would confirm a
    real id to a stranger. A caller who IS authorized but whose Drive fetch
    fails gets **502**, so "you may not see this" and "we could not fetch it"
    stay distinguishable in logs.
  - **Serving from the app's own origin is why the content type is an
    allowlist**, not an echo of Drive's header: a response typed `text/html`
    here would run as same-origin script. Anything outside the five image
    types uploads already enforce is served as `application/octet-stream`,
    with `nosniff` and `Content-Disposition: inline`. Cache is
    `private, max-age=60` -- short, because a photo is immutable but WHO may
    see it is not (an admin override can re-point an entry's section).
  - `photoSrc(photoId)` (notebook.ts) is what the UI uses; it is keyed on the
    PHOTO ROW id, never the Drive file id, which the proxy resolves itself
    from a row the caller proved they may read. The per-photo `onerror`
    fallback stays (a proxied fetch can still fail for ordinary reasons) but
    is no longer the default outcome for every viewer; it now offers **Try
    again** (a cache-busted retry) with the Drive link demoted to a staff
    escape hatch.
- **The two RLS hurdles on that route are genuinely redundant, and a mutation
  check is what established it.** Opening EITHER the `notebook_entries`
  policy or the `notebook_entry_photos` policy to `using (true)` leaves
  `tests/notebook-photo-route.test.ts` fully green; only opening BOTH turns
  its 5 denial assertions red. That is defense in depth working, not a weak
  test -- but it means dropping the `!inner` embed to "simplify" the query
  would silently leave a single point of failure that the suite would not
  catch, because the surviving policy still denies.
- **EVERY CONTROL ON AN ENTRY ROW CARRIES A VISIBLE WORD, AND FILING IS ONE OF
  THEM.** The `.tools` group is a SIBLING of the disclosure button (a button
  inside a button is invalid markup and its clicks would toggle the row), so it
  renders in BOTH the collapsed and expanded states -- which is the point:
  - **Filing moved out of the expanded body into the row.** `notebook_move_entries`
    was reachable only from a `<select>` at the foot of an expanded card, under
    the photos and the notes, so discovering that an existing entry could be
    filed meant opening one and scrolling past everything in it. The control is
    a labelled `Folder` pill in the row now, showing the entry's own folder (or
    `Unfiled`); the folder's colour rides the select's LEFT BORDER, since a
    native select cannot draw a dot inside itself. The meta-row folder CHIP is
    now the read-only counterpart and renders only when `canMove` is false --
    one indicator, and it is a control wherever it can be. The bulk-select path
    is untouched.
  - **Pin and Copy carry their words** (`Pin`/`Pinned`, `Copy`/`Copied`) beside
    their glyphs. They were bare icons with a `title`, i.e. learnable only by
    hovering, which a phone cannot do at all.
  - **THE COST IS A SECOND LINE ON A PHONE, TAKEN DELIBERATELY.** Three labelled
    controls plus a readable title do not fit one line under 42rem, so `.row`
    wraps and `.tools` takes its own. Shrinking the words back out is what
    created the problem this fixes.
  - `moveError` renders OUTSIDE `.row`, because a move started from a collapsed
    entry has no expanded body to report into.
- **Launcher card** `notebook` in `portal-apps.ts` (
  `requiresAuth`, NOT `adminOnly` -- every signed-in user sees it) with a
  new `notebook` icon case in `AppLauncher.svelte`. It declares
  `theme: { primary: '#C8A848', secondary: '#78B870' }` -- the `--gold` /
  `--green` design-system tokens themselves, which is also the `.app-card`
  CSS default and what the coin cards already carry. **Omitting `theme` does
  NOT give you the gold `--acc` convention:** `appCard`'s fallback is
  `var(--green)` primary, so an unthemed card renders green-led. Measured:
  the card's icon and title now compute `rgb(200, 168, 72)`, byte-identical
  to the Coin Ledger and Coin Balance cards. Registered in
  `site-manifest.ts` as its own app for versioning/changelog.
- **Verified** in `/dev/notebook` (404 in production, no auth/Supabase/Drive;
  three accounts, both fail-soft toggles, and a log of the exact FormData
  fields each transport received): all three role branches render as
  described (student sees no review link, instructor sees it, plain account
  sees neither it nor any section chip and gets the empty state); the
  blank-label free-form submit sends no `custom_label` and the resulting
  entry renders from its filename; a 3-photo submit issues exactly one
  `upload` then two `add-photo` calls carrying the returned `entry_id`, and
  the used session leaves the quick-picks live; the fully unlabeled entry
  renders "Untitled entry" in italic; newest-first ordering was proven by
  feeding the component OLDEST-first; the per-photo error fallback swapped
  exactly one frame and kept the other seven; both fail-soft cards render;
  no horizontal overflow at 375px and the file input carries
  `accept="image/*" capture="environment" multiple`; 0 console errors.
  **0075's note tier was driven the same way:** with a session selected the
  form offers no note option at all, keeps its photo picker and stays
  un-submittable; on the free-form path the mode picker appears with "Photos"
  preselected and the photo flow unchanged (a 2-photo submit still issues one
  `upload` + one `add-photo` and no `custom_label`); "Just write a note"
  hides the picker, relabels the field "Note", disables submit until text is
  typed, and then POSTs exactly `{"custom_label":"..."}` to
  `/api/notebook/note` -- one call, no FormData, no session -- landing an
  entry that renders its label as the title with "No photos yet" and zero
  image frames; a file staged in Photos mode is cleared by the switch and
  does not come back; with Drive toggled OFF the note still saves while photo
  submits stay disabled; and picking a check-in while in note mode snaps the
  form straight back to the session shape. The
  shipped `notebookAccess` guard was additionally driven directly with
  mocked sessions (7 cases, all passing), including the two that must fail
  closed: a plain `teacher` account teaching nothing gets NO review access,
  and a runtime error inside `is_admin()` denies rather than falling through
  to the pre-0067 teacher rule. The proxy route additionally has its own
  committed suite (see "Automated tests"), and was driven live from a real
  `<img>` in the harness: the browser genuinely requested
  `/api/notebook/photo/<id>`, got 401 signed out, rendered the fallback, and
  retried through it with a cache-buster.
  **NOT verified: a real photo reaching the real Drive folder through this
  UI** -- that needs a live signed-in session and the one-time
  `/admin/drive-connect` consent, exactly as every Drive-touching feature
  before it, and 0069/0071 must be applied by hand first. The local `.env`
  carries only the two PUBLIC Supabase vars -- no Drive credentials at all --
  so `driveConfigured()` is false locally and the proxy answers 503 there
  even for a signed-in caller; a live end-to-end check is a
  deploy-then-verify step, not something reproducible from this repo.
- **HARNESS NOTE:** `/dev/notebook`'s photos are `loading="lazy"`, and a
  non-compositing preview pane never fires the intersection observer, so they
  never request at all (the same reason screenshots time out there). Remove
  the attribute or dispatch `error` by hand to exercise the image paths.

