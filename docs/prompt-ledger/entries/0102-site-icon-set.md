# 0102 Site icon set: one favicon, one manifest, one place the geometry lives

- Issued: 2026-09-09
- By: Mr. Pina, with the six rendered icon files and the two Python generators attached to the prompt.
- Owns: `static/favicon.ico`, `static/favicon.svg`, `static/apple-touch-icon.png`,
  `static/icon-192.png`, `static/icon-512.png`, `static/icon-maskable-512.png`,
  `static/manifest.webmanifest`, `src/app.html`, `tools/idea_icon_gen.py`,
  `tools/idea_logo_vector.py`, `tests/site-icons.test.ts`, one line in `CLAUDE.md`,
  `docs/prompt-ledger/entries/0102-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none.
- Lands on: `main` directly (static assets, one head file, one test, two tools, one CLAUDE.md line).
- Status: issued
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
  through `rewriteLegacyLinks`. This bundle adds a root icon set and repoints
  `src/app.html` and the manifest at it; the mirror stays where the freeze and the
  legacy serve path need it.

  Surface-intersection check at issue: no other ledger entry, landed or in flight,
  owns `static/`, `src/app.html` or `static/manifest.webmanifest`. No `0102` entry
  exists on `origin/main`, `origin/integration` or any `origin/claude/**` ref.
