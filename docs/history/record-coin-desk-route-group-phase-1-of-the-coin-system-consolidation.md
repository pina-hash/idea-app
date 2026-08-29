---
title: "Coin Desk route group (Phase 1 of the coin-system consolidation)"
date: 2026-08-11
branches: []
migrations: ["0073", "0074", "0076", "0077"]
subsystems: ["IDEA Coin economy"]
record_order: 7
---

`/coin-desk` was one long scrolling page mounting every manager component at
once. It is a ROUTE GROUP now: same components, same RPCs, same rules -- a
UI/route reorganization with NO schema change, no new migration, and no
behavior change to any RPC. The then-live Sheets tooling was untouched by it
(and has since been retired), as is
the homepage launcher card (still `/coin-desk`, so bookmarks and muscle
memory keep working -- the Log view kept the group's root URL for exactly
that reason).

- **The admin gate is hoisted to `+layout.server.ts`** and applies to the
  WHOLE group. Same gate as before (`isAdmin()`, 404 -- not a redirect -- for
  a signed-in non-admin AND for an anonymous visitor, deliberately still out
  of `authedPrefixes` so a probe learns nothing), just stated once instead of
  per page: a new area cannot ship ungated by forgetting to copy the check.
  Verified by curl on all six routes signed out. UI gating stays convenience;
  every write RPC is `is_admin()`-gated itself, which is the real boundary.
- **`+layout.svelte` carries the persistent chrome** (header, hero,
  sub-nav, version footer) and `+page.svelte` per area renders only its own
  cards. The one CSS subtlety: card spacing lives in the layout as
  `.coin-desk-page > :global(.card)`, because Svelte's scoping cannot reach
  a card rendered by a child route's own component -- without `:global` every
  area would have to repeat the rule.
- **`src/lib/coin-desk/nav.ts`** is the area registry (plain data, the
  `curriculum.ts` / `portal-apps.ts` convention: id, label, href, blurb) and
  `CoinDeskNav.svelte` renders it in ONE of two modes -- real `<a href>`
  links for the layout (active state derived from `page.url.pathname` via
  `areaForPath`, so it is never tracked in state), or buttons driven by an
  `onSelect` callback for the dev harness, which has no router. One
  component, so the real nav and the harness can never drift on what areas
  exist.
- **The areas.** `/coin-desk` = **Log**, the primary day-to-day view.
  **ITS INTERNALS ARE SUPERSEDED BY `0115`** -- it is a two-pane surface on the
  shared shell now (roster on the left, entry form on the right), the summary is
  a compressed strip, and the recent transactions and the debt panel are both
  behind disclosures. See "The Log area, rebuilt around one constraint" below.
  What this bullet still describes correctly is the AREA: Log is the primary
  day-to-day view and holds the whole logging flow and nothing else.
  `/coin-desk/students` = `SectionManager` plus the balance lookup/adjust
  tool MOVED off `/admin` (see above) as `BalanceAdminPanel.svelte`.
  `/coin-desk/contracts` = `ContractsManager`. `/coin-desk/roles` =
  `RolesManager`. `/coin-desk/economy` = `CategoriesManager` then
  `PayoutManager`. **There was a sixth, `/coin-desk/migrate`** -- the
  one-time legacy Sheets import wizard (Phase 2, `MigrateWizard.svelte` +
  migration 0084) -- **retired in Phase 4** once the import was done and the
  Sheets system it read from was gone; the area is out of `nav.ts` and the
  wizard is archived under `docs/coin-economy/archive/legacy-system/`.
  0084's RPCs are still live as SQL-editor operations.
- **PER-ROUTE DATA LOADING REPLACES THE OLD `$bindable` COUPLING, and that
  is the structural point of the split.** The single page owned one
  `sections` array bound two-way into `SectionManager` so a mutation there
  was instantly visible to the bulk-log picker, and one `categories` array
  bound into `CategoriesManager` the same way. There is no shared mutable
  state across routes now: each `+page.server.ts` loads exactly what its
  area needs (Log gets ACTIVE sections only, since an archived section is
  not a bulk-log target; Students gets EVERY section, since archiving is
  reversible and an archived one still has to be reactivatable; Economy gets
  every LOGGABLE category regardless of active state, since retired rows
  have to stay visible there; Log gets the same loggable list and filters to
  active for its dropdowns). A create or retire on Economy shows up on Log
  at that route's next load rather than through shared state --
  browser-verified. The `$bindable` props on `SectionManager` /
  `CategoriesManager` are unchanged; they simply write back into a local on
  their own route now.
- **The manager components moved by reference, not rewrite.** Only their
  doc comments were corrected where they described the old single-page
  wiring. The former `CoinDeskTool.svelte` is DELETED; its lookup +
  debt-panel + logging half was extracted verbatim into
  `LogView.svelte` (which additionally takes `sections` as a plain
  read-only prop, not the old bindable one), and its header/hero/footer
  became the layout.
- **Fail-soft banners survive PER AREA**, each on the route that owns it:
  0070 on Log and Economy, 0073 on Students and inside Log's Section mode,
  0074/0076 on Roles, 0077 on Contracts.
- **Dev harness `/dev/coin-desk`** (404 in production, no auth/Supabase)
  mirrors the group: the REAL `CoinDeskNav` in callback mode switching
  between the same real components per area, each seeded the way its own
  route's load seeds it, against the same `fake-ledger.ts`. That fake ledger
  gained `coin_admin_adjust_balance`, implemented the way the REAL one is
  DEFINED -- a thin hand-off to its own `coin_log_transaction` case under
  `balance_correction` -- rather than a second copy of the rules.
- **Verified** in the harness with zero console errors throughout: every nav
  item renders its own area with the right active state and blurb; on Log a
  full lookup -> log -> refreshed-summary cycle for a flat category
  (Disruptive Behavior, 42 -> 39i¢, the success notice surviving the
  post-write refresh), a formula category (Perfect Score, 75pt -> the
  previewed and charged 3i¢), and Section mode against the seeded sophomore
  section (2 students, both +1i¢), with the debt panel appearing pre-filled
  at exactly the debt for the seeded in-debt student and disappearing the
  moment it was paid to 0i¢; on Students a roster expand, a lookup, and a
  real SIGNED (-15i¢) adjustment with its required reason landing a
  `Balance Correction / Refund` row; Contracts rendering all five seeded
  claim states with claimant names and share previews and filtering to
  Completed; Roles rendering a pending application with its real question
  text, live capacity chip and MC correctness badge; Economy creating a real
  category that then appeared in Log's dropdown on that route's next load,
  beside a live payout candidate list; Migrate rendering its placeholder;
  and all seven fail-soft banners appearing on their own areas when the
  migration toggles are switched off. `npm run check`: 0 errors, 0 new
  warnings. `npm test`: 220/220. **NOT verified: the live Supabase project**
  -- same placeholder-`.env` caveat as every other coin-economy change; the
  signed-in render of the real routes needs a real admin session, so only
  the anonymous 404 on all six was checked here.

