# 0102 Site icon set: one favicon, one manifest, one place the geometry lives

- Issued: 2026-09-09
- By: Mr. Pina, with the six rendered icon files and the two Python generators attached to the prompt.
- Owns: `static/IDEA/favicon.ico`, `static/IDEA/favicon.svg`,
  `static/IDEA/apple-touch-icon.png`, `static/IDEA/icon-192.png`,
  `static/IDEA/icon-512.png`, `static/IDEA/icon-maskable-512.png`,
  `static/manifest.webmanifest`, `src/app.html`, `tools/idea_icon_gen.py`,
  `tools/idea_logo_vector.py`, `tests/site-icons.test.ts`, two paragraphs in
  `CLAUDE.md` (the `tools/` command line and the icon-location rule under Asset
  paths), `docs/prompt-ledger/entries/0102-*`, and its own `docs/history/` entry.
  **The six icons moved out of `static/` and into `static/IDEA/` in the second
  half of this bundle, which is a change to the Owns surface and the reason this
  entry is amended rather than reissued.** Each of those six filenames is
  slug-shaped, so at the static root they were served ahead of the `[shortlink]`
  catch-all and had to be reserved -- and reserving one means moving
  `RESERVED_SLUGS` and `_app_short_link_reserved` together, which is a migration
  this entry does not permit. `static/manifest.webmanifest` stays at the root: it
  was already there and already reserved, so it was never part of the problem.
- Migration permitted: no. Claims: none.
- Lands on: `main` directly (static assets under `static/IDEA/`, one head file, one
  test, two tools, two `CLAUDE.md` paragraphs).
- Status: pushed to `main`
- Branch: `claude/site-icon-set-bybeed`
- Notes: the site has never carried a favicon at the document root. `src/app.html`
  points `rel="icon"` and `rel="apple-touch-icon"` at
  `/IDEA/android-chrome-512x512.png` -- a 512px PNG from the legacy icon mirror,
  used at both sizes -- and `static/manifest.webmanifest` names that file plus
  `/IDEA/favicon-32x32.png`, with the 512 declared `purpose: "any maskable"`
  despite having a transparent-cornered tile rather than a maskable safe zone.

  The `static/IDEA/` mirror is NOT this bundle's to clean out. Every file in it is
  still referenced: `static/push-sw.js` uses `android-chrome-512x512.png` as the
  push notification icon and `favicon-32x32.png` as its badge, and nine legacy
  assignment documents plus the coin ledger reference the per-programme variants
  through `rewriteLegacyLinks`. This bundle adds a CURRENT icon set into the same
  directory and repoints `src/app.html` and the manifest at it; the mirror's own
  files stay untouched, where the freeze and the legacy serve path need them.

  Surface-intersection check at issue: no other ledger entry, landed or in flight,
  owns `static/`, `src/app.html` or `static/manifest.webmanifest`. No `0102` entry
  exists on `origin/main`, `origin/integration` or any `origin/claude/**` ref.

  THE FIRST HALF OF THIS BUNDLE WAS BLOCKED BEFORE `main` AND THE SECOND HALF
  UNBLOCKED IT BY MOVING THE FILES. With the six icons at the static root,
  `tests/short-link-reserved-names.test.ts` reddened -- correctly -- and its
  second half asserts the TypeScript `RESERVED_SLUGS` and the deployed
  `_app_short_link_reserved` name the identical set, so the list could not move
  without the function moving with it. Rather than take a migration this entry
  does not permit, the icons went to `static/IDEA/`, where the shape guard the
  `[shortlink]` route and `app_short_link_upsert` both enforce cannot reach them.
  `tests/site-icons.test.ts` gained a tripwire so a later session putting an icon
  back at the root reddens on the icons' own test rather than on a short-link one.
