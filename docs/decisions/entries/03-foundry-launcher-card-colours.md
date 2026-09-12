# 03 Foundry cards: the gallery becomes a thumbnail mosaic
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: decided 2026-09-12 as a BUILD, not a colour question. Scoped below.
- Decision: 2026-09-12, Mr. Pina: a redesign. Today every card is the same brownish
  orange. He wants it to look like a Steam library. THE CARD IS THE UPLOADED
  THUMBNAIL, no chrome and no generated colour. THE CARD'S ASPECT RATIO CONFORMS TO
  WHATEVER THE STUDENT UPLOADED, so the gallery is a mosaic of varying shapes edge to
  edge rather than a uniform grid. The app name lives IN the thumbnail the student
  makes, with a HOVER POPUP naming it. Students get more customization over their own
  card.
- Against the default: plainly, yes, and the answer is larger than the question. The
  default below is one accent pair on ONE launcher tile. He answered about the
  GALLERY, and the answer is that the card stops being a card. The title of this
  entry was "Foundry launcher card colours" and is now wrong; the filename is kept so
  citations resolve.
- Default this assistant would pick: Change the card and rewrite the test's rationale
  in the same commit.
- Why it is blocked on him: it was raised as an identity colour, which is his call.
  His answer made it a layout and authoring change, which is a bundle.
- What it unblocks: a Foundry gallery lane; item 1 below decides whether it carries a
  migration.
- Context: `src/lib/foundry/FoundryGallery.svelte`; `src/lib/foundry/forge.css`;
  `src/lib/AppLauncher.svelte` (`.app-card[data-app='foundry']`);
  `tests/home-order-and-accent.test.ts`; `CLAUDE.md`, "PANELS OF UNEQUAL HEIGHT LAID
  SIDE BY SIDE GO IN A MULTI-COLUMN CONTAINER" and "A CARD QUOTES ITS OWN ROOM".
- Tree check (2026-09-02): the test and the rule exist as described. Whether the
  test's written rationale is "now false" depends on what he wants the card to carry,
  which is the decision itself; the tree cannot settle it.

## What is true in the tree today (measured 2026-09-12)

The surface is `FoundryGallery.svelte`, the gallery at `/foundry`. Not
`AppLauncher.svelte`, which is the single Foundry tile on the portal home.

- **Line 420** -- the grid is UNIFORM:
  `repeat(auto-fit, minmax(min(20rem, 100%), 1fr))`.
- **Lines 433-446** -- `.fdy-card` IS the chrome: a `--boundary` border, `--space-3`
  padding, a radius, and `background: var(--surface-1)`.
- **Lines 466-474** -- the cover box is a FIXED `aspect-ratio: 16 / 9`, chosen
  deliberately because a browser window and a phone screen "sit close to it". This is
  the one line his answer reverses. **Line 489** is `object-fit: scale-down`, so a
  cover letterboxes inside that box rather than cropping.
- **Lines 230-244** -- title, tagline, author and class render in `.fdy-card-body`,
  BELOW the cover, as page text outside the image. **Lines 492-504** -- with no
  cover the tile is the app's first letter at `2.75rem`, sized for the 16:9 box.
- **The brownish orange is the room, not a per-card colour.** There is no `data-app`
  variation on `.fdy-card` at all: `forge.css` **lines 153-155** alias `--surface-1`
  to `--fg-surface` `#14110d` and `--surface-2` to `--fg-surface-2` `#1b1712`, the
  room's warm "worked steel" plate. Every card is that ground, identically.

## The build, in dependency order

1. **The aspect ratio needs a dimension nobody stores.** No `cover_width`,
   `cover_height`, `cover_aspect` or `cover_ratio` exists in `supabase/migrations/`
   or `src/` -- swept 2026-09-12, zero hits. Two shapes, and it is a real choice:
   measure the intrinsic ratio in the browser from the loaded image (no migration,
   but the mosaic reflows as covers arrive), or store it at upload (a migration plus
   a write at all THREE upload sites -- `FoundrySubmit.svelte` line 625,
   `FoundryMine.svelte` line 465, `FoundryInspector.svelte` line 721). Pick before
   any CSS is written.
2. **A mosaic of unequal heights is a multi-column container, never a grid.** A grid
   ROW is as tall as its tallest member, so one tall tile kills its neighbour's
   column -- measured, and written down in `CLAUDE.md`. `column-width` plus a count
   ceiling, `break-inside: avoid`, a row gap as a margin, column-major reading order.
3. **A name drawn into a PNG still needs a text name.** A phone cannot hover, a
   screen reader cannot read an image, and an app with no cover has no name at all.
   The accessible name stays on the link whatever the popup does, and the cover-less
   case needs a drawn fallback rather than the blank letter tile.
4. **"More customization" is unscoped.** He named it; he did not say what. It is the
   one half of the answer a lane cannot start from.

`AppLauncher.svelte` **line 824** is not part of this: it pins the launcher tile's
`--acc-primary: #f6952f` / `--acc-secondary: #c65a1d` from the forge's own
`--fg-heat` / `--fg-heat-ember`, which IS the card quoting its own room. The original
question, whether that test's rationale is false, is answered NO by leaving it alone.
