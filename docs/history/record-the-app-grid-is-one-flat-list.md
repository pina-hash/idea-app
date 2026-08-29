---
title: "The app grid is one flat list"
date: 2026-08-15
branches: []
migrations: []
subsystems: ["Home page, launcher, tour"]
record_order: 73
---

The launcher's Games / Tools / Class sections are gone, and with them
`AppGroupId`, `APP_GROUPS`, `PortalApp.group`, the per-group order map, the
collapsed-group set and `orderedGroupApps`. At a dozen cards the headers cost a
third of the launcher's height to say what the card titles already said, and
they made "reorder" mean "reorder within your group" -- which is not what anyone
wants from a launcher.

- **THE REGISTRY'S ARRAY ORDER IS THE CURATED DEFAULT ORDER**, and it is the
  fallback every other mode resolves ties and unknowns against. Class work
  first, then the personal record, then the economy, then training and games:
  Classroom, My Notebook, IDEA Coin Ledger, GAUNTLET, FRC Training, GREENLINE,
  VANGUARD, Tournaments, then the three admin tools. `visibleApps` additionally
  STABLY PARTITIONS admin-only cards to the end, so an admin entry written
  mid-array still sorts after every student-facing one.
- **Four sort modes** (`AppSortMode`, a quiet `<select>` in the toolbar):
  `default` (curated), `used` (open count desc), `recent` (last-opened desc,
  never-opened after everything opened), `custom` (the dragged order). The mode
  persists in the same prefs blob. **Switching modes never destroys the stored
  custom order** -- `order` and `sort` are separate keys, so leaving Custom and
  coming back restores exactly what was dragged.
- **PINNING MOVES A CARD, IT NEVER DUPLICATES ONE.** Pinned apps used to render
  twice, once in a "Pinned" row and again in their group; now `arrangeApps`
  hoists them to the front of the single grid, in PIN order (not the active
  sort, so the pinned block holds still while the mode changes underneath it),
  and the card carries a small gold star. Every app appears exactly once.
- **Drag to reorder, native HTML5 DnD, no dependency** -- the
  `PieceChainBuilder` pattern: ONLY the grip is `draggable`, so the card's own
  link and its text stay usable, and the card the drag is over is marked
  `.dropinto`. Grips appear in customize mode only; the up/down buttons remain
  the keyboard path and write the SAME flat order. **Any manual reorder switches
  the mode to `custom`** -- including the arrows, since a reorder that left the
  mode on `used` would visibly do nothing. The order written is the order the
  user was LOOKING at, so rearranging while sorted by most-used snapshots that
  view. A pinned card dragged below an unpinned one is still hoisted back to the
  front, which is inherent to pins always leading.
- **Compact is the DEFAULT view.** `prefs.compact` absent reads as TRUE; only an
  explicit `false` gives the roomy cards. Customize mode takes the roomy TRACK
  width even while compact (`.app-grid.compact.customizing`), because the grip
  plus three tool buttons otherwise squeeze the title into breaking mid-word
  ("MY NOTEB OOK") -- found in the browser, not in review.
- **USAGE TELEMETRY, the first in the app** (the audit's "would require new
  instrumentation"): `prefs.usage` is `{ [appId]: { count, last } }`, written
  from `appClick` -- the ONE funnel both card variants already pass through, so
  neither can be missed. It is FIRE AND FORGET (never awaited, so it cannot
  delay the navigation already underway) and `silent` (no "Saving..." flash on a
  page that is leaving). `recordUsage` spreads the CURRENT in-memory prefs, so a
  usage write can never clobber a layout change the user just made. Anonymous
  visitors keep the early return: nothing recorded, nothing persisted.
  **Accepted cost:** a write still in flight when the page unloads is lost,
  which for a launch counter is fine. **Contention watch:** usage and layout
  share the one `homepage` JSONB, which is what the audit flagged. Nothing has
  shown up in practice; if it does, say so rather than silently moving storage.
- **v1 PREFS MIGRATE ON READ, in code, with no DB migration.**
  `readHomepagePrefs` detects the old shape by `order` being an OBJECT rather
  than an array, flattens it by walking the legacy groups in the order their
  sections used to render (games, tools, class) and concatenating each group's
  saved ids, drops `collapsed`, keeps pins and `compact`, and filters ids for
  apps that no longer exist. A migrated order also sets `sort: 'custom'` -- the
  user HAD arranged their grid, and leaving the mode at `default` would keep
  their arrangement in storage while quietly ignoring it. A v1 user who never
  reordered has no order to migrate and lands on the curated default. The new
  flat shape is written back on the next persist.
- **Verified in a browser** against the real component and the real pure layer
  (`/dev/tour`, whose stub client now persists `preferences` and takes a
  `?prefs=<json>` seed so a v1 layout can be cold-loaded and watched migrate):
  a v1 blob with per-group order + pins + `compact: false` rendered 8 cards, no
  duplicates, pins marked and hoisted, `sort` on custom, comfortable view, zero
  group headers, and the next write replaced it with the flat shape while a
  sibling `classroomFeed` preference key survived. Real clicks recorded
  4/2/1/3 opens and produced correct, DIFFERENT Most-used and Recent orders.
  Signed out: customize is reachable, arrows reorder for the session, and
  **nothing is written** (empty prefs, zero write-log entries) including after
  opening an app.

