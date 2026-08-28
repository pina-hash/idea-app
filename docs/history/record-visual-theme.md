---
title: "Visual theme"
date: 2026-06-20
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 80
---

## Visual theme

The app shell uses the **IDEA Green** program aesthetic. The token set and font
stack are the source of truth; do not invent colors or swap fonts.

- **Tokens:** defined once as CSS variables in `src/app.css` (`:root`).
  Backgrounds `--bg0`/`--bg1`/`--bg2`; semantic colors `--green` (primary),
  `--gold` (special callouts), `--cyan` (metadata: role, timestamps, version),
  `--amber` (warning), `--teal` (in progress), `--violet` (special, sparingly),
  `--white` (body text), `--dim` (secondary/placeholder), `--ice` (disabled).
  The semantic roles are fixed; do not reassign them. Never use pure red, pure
  white (`#FFFFFF`), or pure yellow.
- **Fonts:** `Rajdhani` (display headings, body, input values) and
  `Share Tech Mono` (metadata, button/nav labels, mono chrome), loaded via
  `@fontsource` imports in `src/routes/+layout.svelte`. Never use Arial, Inter,
  Roboto, or system fonts. The landing page `/` and `/archive` additionally use
  `Orbitron` (also `@fontsource`) for display type, matching the original IDEA
  index aesthetic.
- **Shared classes** live in `src/app.css`: the app-shell set (`.wordmark`,
  `.btn`/`.btn.secondary`, `.card`, `.field`, `.hero`, `.eyebrow`, `.app-header`)
  and the `.legacy-index ...` theme (header/hero/course-card/assignment-item/
  picker/changelog/footer) shared by `/` and `/archive`. All `.legacy-index`
  rules are scoped under that wrapper class so they never affect the app shell.
- **Wordmark + animated emblem:** the plain `IDEA` wordmark (green,
  `--glow-green`, no trailing period or accent dot) is the live-text mark; the
  **gear emblem lockup** is `src/lib/brand/AnimatedLogo.svelte`, the port of the
  design-system `AnimatedLogo` (`components/brand/AnimatedLogo.jsx`). It layers
  the isolated gear (`/IDEA/idea-gear.png`) behind the isolated text plate
  (`/IDEA/idea-logo-text.png`) at the emblem's exact geometry (2560x1204 canvas,
  gear 46.95% wide anchored top-left) and turns the gear slowly behind the
  plate. It is **prop-driven** (`width`, `spin`, `duration`, `srcText`,
  `srcGear`) so the same component is the animated hero mark and the static
  fallback (`spin={false}`); the spin is gated behind
  `prefers-reduced-motion: no-preference`, so it NEVER rotates for reduced-motion
  users. It stands in for the top-left `IDEA` wordmark in every portal header
  (landing `/`, `/archive`, `/dashboard`, `/fsp/class`, the GAUNTLET
  `IDEA // GAUNTLET` lockup) and the `/auth/error` hero. The `.logo-mark` helper
  (in `src/app.css`) frames the emblem inside the wordmark anchor. Dev harness:
  `/dev/animated-logo` (404 in production, no auth) renders the header/hero
  scales, the static fallback, and a fast-spin variant to eyeball the
  reduced-motion gate. The intentionally-off-brand scoped themes (FRC navy/red,
  FSP navy/gold) keep their own marks and do NOT use the IDEA emblem.
- **Background:** a restrained CSS-only scanline + vignette overlay (`.bg-fx`
  in the root layout), disabled under `prefers-reduced-motion`. Legibility
  first; keep ambiance subtle and load light.

