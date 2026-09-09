---
title: 'Site icon set: a real favicon, a real manifest, and one place the geometry lives'
date: 2026-09-09
branches: ['claude/site-icon-set-bybeed']
migrations: []
subsystems: ['portal shell', 'static assets', 'short links']
---

The site has never carried a favicon at its own document root. `src/app.html`
declared `rel="icon"` and `rel="apple-touch-icon"` as the SAME file --
`/IDEA/android-chrome-512x512.png`, a 512px PNG out of the legacy icon mirror --
and `static/manifest.webmanifest` named that file plus `/IDEA/favicon-32x32.png`,
declaring the 512 as `purpose: "any maskable"` when it is a transparent-cornered
tile with no maskable safe zone in it. There was no `.ico` anywhere in the tree,
no SVG icon, and no separately sized Apple touch icon.

This bundle lands six rendered icons under `static/IDEA/`, repoints the head and
the manifest at them, puts the two Python generators that produced them under
`tools/`, and adds a test that reads the BYTES rather than the filenames.

**THE ICONS LIVE UNDER `static/IDEA/`, NOT AT THE STATIC ROOT, AND THAT IS THE
ONE DECISION WORTH READING.** The first half of this bundle put them at the root,
which reddened `tests/short-link-reserved-names.test.ts` and could only have been
cleared by a migration this bundle was not permitted. See "The root was the wrong
place" below. Everything else here is as it was.

## What landed

- `static/IDEA/favicon.ico` (5 frames: 16, 24, 32, 48, 64, each a PNG payload at
  32bpp), `static/IDEA/favicon.svg`, `static/IDEA/apple-touch-icon.png`
  (180x180), `static/IDEA/icon-192.png`, `static/IDEA/icon-512.png`,
  `static/IDEA/icon-maskable-512.png`.
  Placed byte-for-byte as delivered, md5-checked against the attachment after
  the copy AND again after the `git mv` into `static/IDEA/`. Not re-encoded, not optimised, not stripped -- each carries a
  `caBX` chunk (and the SVG a `<c2pa:manifest>`) of content-credential
  provenance from the tool that rendered it, which is left alone.
- `src/app.html`: `/IDEA/favicon.ico` at `sizes="any"`, `/IDEA/favicon.svg` by
  `type="image/svg+xml"`, `/IDEA/apple-touch-icon.png`, the manifest (still at
  `/manifest.webmanifest`, which was already there and already reserved), and
  `theme-color` moved from `#020A04` to `#0A0C0D` to match the icons' own
  graphite ground.
- `static/manifest.webmanifest`: `/IDEA/icon-192.png` and `/IDEA/icon-512.png` at
  `purpose: "any"`, `/IDEA/icon-maskable-512.png` at `purpose: "maskable"`, each with
  its real `sizes` and `type`. The old single `"any maskable"` entry is gone --
  one file cannot honestly be both, because the two want opposite things at the
  edges.
- `tools/idea_icon_gen.py` and `tools/idea_logo_vector.py`, and one line in
  `CLAUDE.md`'s Commands block saying they are the only place icon and logo
  geometry is edited.
- A second `CLAUDE.md` paragraph, under Asset paths, saying that `static/IDEA/`
  now holds the site's own icon set as well as the legacy mirror, and why.
- `tests/site-icons.test.ts`, 21 assertions.

## The three properties the test exists for, and why a file listing cannot see them

Every failure in this area is silent on the machine that causes it. A
`rel="icon"` pointing at a file that is gone renders a blank tab and throws
nothing; a manifest naming a missing icon installs a home-screen app with no
picture on it and reports nothing to the page. So the test decodes:

- **`apple-touch-icon.png` must carry no alpha channel at all.** iOS composites
  it onto BLACK, so a transparent corner is a black corner. Measured: colour
  type 2, no `tRNS`. The assertion is the absence of the channel, not "every
  alpha is 255" -- an image with an all-opaque alpha channel would satisfy the
  weaker form and still be the wrong file to ship.
- **`icon-maskable-512.png` must be fully opaque.** Android crops a maskable
  icon to the launcher's own shape, so transparency inside it is a hole rather
  than a rounded corner. Measured: colour type 2, no `tRNS`. The test accepts
  either shape (no channel, or a channel that is all 255) because both are
  honestly opaque.
- **`icon-192.png` and `icon-512.png` must be transparent.** Measured: colour
  type 6, alpha spanning 0 to 255. The assertion carries its own positive
  control -- an image that is transparent EVERYWHERE would satisfy "has a fully
  transparent pixel" and be an invisible icon, so the test also requires a fully
  opaque pixel.

The PNG decoder is written in the test out of `node:zlib`: signature, chunk
walk, IHDR, then inflate and unfilter the IDAT to read the alpha plane. It is
deliberately narrow -- 8-bit, non-interlaced, alpha-carrying colour types only,
each asserted before it decodes -- because a decoder that quietly handled more
shapes would be a second PNG library to keep correct, and a wrong one would
answer "opaque" for an image it could not actually read. No byte count is
hardcoded anywhere: the icons are regenerated from `tools/idea_icon_gen.py`, so
a pinned size would be a number somebody has to update rather than a property
somebody has to keep.

`favicon.svg` is parsed as real XML through `happy-dom`'s `DOMParser` in
`image/svg+xml` mode (measured: it produces a `parsererror` element on a
malformed document, so "no parsererror" is a real assertion and not a vacuous
one). It asserts an `svg` root with a `viewBox`, zero `rect` elements and no
`background` anywhere -- the tile is a chamfered path, so the icon keeps its
shape wherever a browser rounds it, and a rect would put a square behind it --
with a positive control that the paths it SHOULD contain are there.

## Measured

- **Six mutations, each reddening and each restored byte-identically** (md5
  compared before and after; restored from a copy taken first, never with
  `git checkout --`):
  1. `apple-touch-icon.png` replaced by an alpha PNG: 2 failed.
  2. `icon-maskable-512.png` replaced by a transparent PNG: 3 failed.
  3. manifest `src` pointed at a file that does not exist: 1 failed.
  4. a `<rect width="512" height="512">` inserted into `favicon.svg`: 1 failed,
     `expected 1 to be +0`.
  5. the `image/svg+xml` link removed from the head: 2 failed.
  6. `favicon.ico` rebuilt with only its 48 and 64 frames: 1 failed.
  Clean re-run afterwards: 21 passed.
  A seventh, added with the move: an unreserved slug-shaped file copied back to
  the static root reddened BOTH new root assertions (`expected [ 'favicon.ico' ]
  to deeply equal []`), and the root was restored. An eighth, `git mv`-ing
  `icon-192.png` back to the root, failed the file at COLLECTION rather than at
  an assertion -- the module reads the icons at import time -- which is a
  failure either way but a less legible one, and is why the root sweep is
  written to fail on its own terms.
- `svelte-check`: **0 errors, 37 warnings** (31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived rather than
  read off `CLAUDE.md`. A `.env` with placeholder `PUBLIC_SUPABASE_*` values was
  written before the sync, per the phantom-error rule; it is gitignored.
- `node tools/claude-md-check.mjs`: agrees with the tree.
- Full suite: **327 files, 6525 passed, 0 failed**, after the move.

## The root was the wrong place

`tests/short-link-reserved-names.test.ts` failed on the first half of this
bundle:

    every slug-shaped top-level static entry is reserved
    expected [ 'apple-touch-icon.png', 'favicon.ico', 'favicon.svg',
               'icon-192.png', 'icon-512.png', 'icon-maskable-512.png' ]
    to deeply equal []

That test was right. `SLUG_RE` is `/^[a-z0-9][a-z0-9._-]{0,60}$/`, which matches
a dotted filename -- which is why `robots.txt`, `push-sw.js` and
`manifest.webmanifest` are already in `RESERVED_SLUGS`. A static file at the root
is served ahead of the `[shortlink]` catch-all, so a short link with any of those
six slugs could never be reached, and 0156's own reasoning applies: accepting
such a slug does not create a working link, it only misleads whoever created it.

**Adding the six names to `RESERVED_SLUGS` was not available, and that is what
decided the move.** The same file's second half reads
`_app_short_link_reserved`'s own `prosrc` out of a real migrated database and
asserts the SQL set and the TypeScript set are EQUAL, both directions, with a
length check ruling out a duplicate masking a missing name. So the TypeScript
list cannot move without the function moving with it, and the function moves only
in a migration -- which this bundle's ledger entry does not permit, and which
would in any case be a global change to the one production database in service of
where six static files sit.

So the icons went into `static/IDEA/` instead, `git mv`, all six md5-identical
across the move. **`IDEA` is uppercase, so `SLUG_RE` refuses it and no slug can
ever equal it** -- the same exclusion the reserved-names test already asserts for
`_platform`. Nothing under that directory can collide with a short link, ever,
without a migration and without a reservation.

- **`static/manifest.webmanifest` stayed at the root**: it was already there
  before this bundle, is already in `RESERVED_SLUGS`, and was never part of the
  problem. Only the six icon files moved.
- **The `/IDEA/` prefix is not redirected out from under them.** `hooks.server.ts`
  keys its legacy 308s on EXACT paths -- `/IDEA` and `/IDEA/coins`, nothing else
  -- so `/IDEA/favicon.ico` reaches the static asset. Read from the hook rather
  than assumed.
- **`tests/site-icons.test.ts` carries the tripwire now**, three assertions: no
  unreserved slug-shaped FILE at the static root, the six icons present under
  `static/IDEA/` and absent from the root, and `IDEA` itself unmatched by
  `SLUG_RE`. It is in the icons' own test on purpose -- a session adding a
  seventh icon reads the reason beside the icons rather than in a file about
  short links, and reddens there first.

**WHAT THIS COSTS, STATED PLAINLY: `/favicon.ico` AT THE ROOT IS STILL A 404.**
Every current browser honours `<link rel="icon">`, so the declared icons resolve;
what does not is the bare root request some crawlers and tools make without
reading the document. Closing that needs either the migration above or a
`src/routes/favicon.ico/+server.ts` redirect, and neither was this bundle's to
take.

## Deliberately not done

- **NOTHING WAS REMOVED FROM `static/IDEA/`, and the six new files sit beside
  what was already there.** The prompt asked for any icon file nothing
  references to be deleted afterwards; there is none. Every one of the nine
  files that mirror already held still has a referrer after this change: `static/push-sw.js` uses `android-chrome-512x512.png` as the push
  notification icon and `favicon-32x32.png` as its badge, nine legacy assignment
  documents and the coin ledger reference the per-programme variants through
  `rewriteLegacyLinks`, and `idea-gear.png` / `idea-logo-text.png` are the
  brand marks `AnimatedLogo.svelte` and the FSP day-2 bundle draw. The mirror is
  legacy serve-path machinery under the freeze, and this bundle edits none of it
  -- it adds six new names into the same directory and repoints only the two
  consumers it owns. The directory therefore now holds two unrelated things: the
  legacy mirror, frozen, and the current icon set. `CLAUDE.md`'s Asset paths
  section says so, because a reader finding `favicon.svg` next to
  `md2-android-chrome-512x512.png` would otherwise have no way to tell which is
  which.
- **`/IDEA/logo.svg`, `/IDEA/idea-logo.svg`, `/IDEA/x.svg`, `/IDEA/gear.png` and
  `/IDEA/this-object-was-deleted-0076.png` are referenced and do not exist.**
  All five are FIXTURE paths -- SVG-refusal cases in the classroom figure gate,
  a deleted-object case in the tournament thumbs harness -- so they are correct
  as they stand and are recorded here only so the next person sweeping for
  broken references does not chase them.
- **One line of `tools/idea_icon_gen.py` was changed, and it is not geometry.**
  As delivered it opened `sys.path.insert(0, '/home/claude')`, the authoring
  environment's path, so the `from idea_logo_vector import ...` on the next line
  would fail from anywhere in this tree. It now inserts the script's own
  directory. Nothing else in either file was touched; both still need `cairosvg`
  to rasterise, which is not a project dependency and is not being added.
- **Nothing was verified in a browser.** The icons were not opened in a tab, on
  a phone home screen, or through an Android launcher's mask. `npm run
  verify:browser` covers `/dev` routes and reads no favicon, and the head links
  are asserted from the source rather than from a rendered document. What a
  maskable crop actually looks like at 512 is a visual judgement nobody has made
  yet.

## Open, for a person rather than a session

**`static/push-sw.js` still points push notifications at the OLD icons** --
`icon: '/IDEA/android-chrome-512x512.png'` and
`badge: '/IDEA/favicon-32x32.png'`, lines 32 and 33. Switching them to
`/IDEA/icon-192.png` and `/IDEA/icon-maskable-512.png` is a one-line change on
each, and **nobody has authorised it**, so this bundle did not make it. It is not
a defect: both files are still there and both still serve, so every push
notification renders the icon it has always rendered. It is a consistency gap
that will read as an oversight to whoever finds it next, which is why it is
written down here rather than left to be rediscovered. A notification badge is
also the one place a maskable icon is genuinely wanted, so the swap is probably
right -- but "probably right" is not authorisation, and the two files it names
are also the two the nine legacy assignment documents reference, so anyone
changing them should read the mirror's other callers first.
