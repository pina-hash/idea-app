---
title: "IDEA Coin economy (Supabase foundation, `0070`)"
date: 2026-08-06
branches: []
migrations: ["0001", "0003", "0020", "0058", "0060", "0067", "0069", "0070", "0071", "0072", "0073", "0074", "0075", "0076", "0077", "0079", "0080", "0081", "0087"]
subsystems: ["IDEA Coin economy"]
record_order: 6
---

## IDEA Coin economy (Supabase foundation, `0070`)

A second, independent coin system living in Supabase, built to eventually
**replace** the Sheets/Apps Script ledger above as the source of truth.
Migration `0070_coin_economy.sql` (apply manually after `0069`) is
**schema, pricing, and enforcement only** -- it shipped with no entry UI of
its own. That gap has since closed: `/coin-desk` (documented at length
further down, "Day-to-day entry tool") is the real day-to-day logging
surface built on this schema in a later pass. **The side-by-side period is
OVER:** the old Sheets ledger ran alongside this schema until Phase 4
retired it (2026-08-12), and this schema is the sole system of record now.
Every category name, price, and
rule is a direct transcription of
`docs/coin-economy/idea_coin_economy_draft_v3.md` and
`idea_coin_quick_reference.md` -- read those before changing a price.

- **Keyed by lowercased email, not user id** -- the `app_admins` (0067)
  idiom. `coin_transactions.student_email` is plain text, no FK to
  `auth.users`, so a balance can exist for an email that has never signed in.
  The moment that student logs in, `coin_balances` already has their row --
  there is no separate linking step, because nothing was ever keyed by user
  id. This is what satisfies the docs' "attach a balance to an email
  independent of login status" requirement (Part 8) for free.
- **Balance is derived, never stored.** `coin_balances` is a
  `security_invoker` view summing `coin_transactions.amount` (signed: negative
  for fines/purchases, positive for awards, either sign for adjustments) per
  email -- there is no mutable balance column anywhere to drift from the
  ledger's own sum. Every coin traces to one insert with an actor, a reason,
  and a timestamp.
- **`coin_categories`** is the price list (server-authoritative; a future
  entry UI reads it rather than hardcoding prices), one row per fine/award/
  purchase from the docs, tagged `kind` (fine/award/purchase/adjustment),
  `scope` (`core` vs `209h`), and a `pricing_model`: `flat` (fixed price),
  `range` (admin picks within min/max, e.g. Above and Beyond 1-3i¢),
  `per_unit` (a rate x an admin-entered quantity, e.g. Extra Credit 2i¢/point),
  `variable` (no lookup at all, the admin enters the whole amount -- the
  prompt's own instruction for Contract Completion / Competition Winnings,
  generalized to every other judgment-call item), or `formula` (real computed
  logic: Perfect Score, Pay Raise, Property Damage (Careless), 3D Printing,
  Extra Credit's cap). A couple of rows are `loggable = false` mechanisms with
  no per-student coin amount (Mint Tampering Suspect Unknown's section-wide
  freeze; `eating_pass_revoked`, a system-only event) and can never be logged
  directly.
- **Write path:** the generic `coin_log_transaction(email, category_id,
  amount?, quantity?, note?)` handles every `flat`/`range`/`per_unit`/
  `variable` category; `formula` categories (and Extra Credit specifically,
  since it needs the cap check) are refused and route through their own RPC:
  `coin_log_perfect_score`, `coin_log_pay_raise`,
  `coin_log_property_damage_careless`, `coin_log_three_d_printing`,
  `coin_log_extra_credit`. All are **SECURITY DEFINER, gated on `is_admin()`
  directly -- never `is_teacher()`** (per the 0067 naming trap: it means "is
  an admin", not "is a teacher"), a deliberate scope boundary since this is a
  brand-new write surface holding real value; whether a rebuilt entry tool
  should later loosen this to a teacher-role session check (matching the old
  Sheets tool) is that pass's call. Refusals a caller needs to display
  gracefully (debt, an already-active pass, a cap already hit) return
  structured `{ok:false, reason:...}` jsonb, the `greenline_purchase_item`
  convention; genuine misuse raises an exception.
- **Rules enforced in the database, not just documented:**
  - **Debt:** balance can go negative with no cap; while it is ALREADY
    negative, no `purchase`-kind transaction is allowed (fines and
    adjustments still apply past zero). A purchase that would itself dip a
    non-negative balance negative is allowed -- matches the docs' literal
    condition.
  - **Eating Pass:** `coin_eating_pass_active()` / `coin_eating_pass_strikes()`
    are pure derived reads over the ledger (no side-table state): "active" is
    whichever of the two event types -- an `eating_pass` purchase or the
    system `eating_pass_revoked` event -- is most recent; "strikes" counts
    `eating_violation` rows flagged `meta.strike = true` since the latest
    purchase. `coin_log_transaction` special-cases both categories: an
    `eating_pass` purchase is refused (`pass_already_active`) while one is
    already held; an `eating_violation` logged while a pass is active is
    flagged as a strike and, on the third, `coin_log_transaction` inserts the
    revoke event itself. A violation with no pass held is an ordinary fine,
    not a strike. A permanently-revoked pass can still be re-earned and
    re-bought later at full price -- "permanently" describes the revocation
    itself being unrefunded, not a lifetime ban.
  - **Extra Credit (209H only):** `coin_log_extra_credit` sums
    `quantity` (points) already logged this `coin_semester_key()` (a pure
    Jan-Jun/Jul-Dec function of the calendar, the `role_for_email` idiom --
    deliberately not a maintained term-boundary config table) for the student
    and hard-refuses (`cap_exceeded`) once `used + requested` would exceed
    `coin_categories.semester_point_cap` (21, from 2% of 209H's 1,050
    semester points), regardless of balance. `p_grading_category` is
    restricted to `unit_labs` / `unit_assignments` / `documentation`.
  - **Quality Desktop Background / Correct Answer in Class:** a generic
    `cap_period` (`day`/`month`) + `cap_count` on the category, checked
    against **calendar boundaries** (`current_date`, `date_trunc('month', ...)`)
    -- never a rolling window from the last submission.
  - **Perfect Score on Graded Work:** `coin_log_perfect_score` computes
    `greatest(1, round(points / 25.0))`.
  - **Pay Raise:** `coin_wage_tiers` (email-keyed, tier starts at 1) is the
    one genuinely stateful piece nothing else derives -- `coin_log_pay_raise`
    reads the current tier, charges `40 * current tier` (1->2 = 40i¢,
    2->3 = 80i¢, ...; per both source docs' own worked examples, which their
    "40i¢ x new tier" prose shorthand does not literally match -- the
    examples are the authority), and persists the new tier. **The tier is
    what Weekly Wage is PAID AT since `0087`, see "Weekly Wage pays the
    student's own tier" below; it was decorative for six migrations before
    that.**
  - **Contract Completion / Competition Winnings:** `variable` pricing --
    the admin enters the whole amount at logging time, never a lookup, per
    the prompt's own instruction.
- **Balance lookup + signed adjustment** (`coin_admin_lookup` returning
  balance, wage tier, eating-pass status and recent history in one round
  trip; `coin_admin_adjust_balance`, a thin wrapper over
  `coin_log_transaction` under the `balance_correction` adjustment category,
  with a required reason). Open to any admin, not owner-gated. This is also
  how a legacy Sheets balance gets attached: whatever the old balance was
  becomes the adjustment amount, no conversion math, and it works whether or
  not that email has ever signed in. **It shipped as an "IDEA Coin balances"
  card on `/admin` (0067's roster page) and MOVED to
  `/coin-desk/students`** in the route-group pass below -- the RPCs are
  untouched, only the surface moved, and `/admin` keeps a short pointer card
  in its place. Nothing else on `/admin` changed.
- **Day-to-day entry tool: `/coin-desk`.** The real logging surface this
  migration's own comments flagged as a later pass -- a NEW route, built
  beside the then-live Sheets tooling rather than by changing it (that
  tooling has since been retired outright). Admin-gated the `/admin`
  way (`isAdmin()`, 404 for anyone else, not in `authedPrefixes` so a probe
  learns nothing), and identical for every admin -- there is no owner-only
  step, matching "admin is site-wide already." **It is a ROUTE GROUP now, not
  one page; see "Coin Desk route group" below for the current structure.**
  - **Every write is a call to an EXISTING 0070 RPC, never a direct table
    write, because there is no direct write path to route around: 0070
    grants `coin_transactions` `select` only and puts no trigger on it, so
    `coin_log_transaction` and the five dedicated RPCs (`coin_log_
    perfect_score`, `coin_log_pay_raise`, `coin_log_property_damage_
    careless`, `coin_log_three_d_printing`, `coin_log_extra_credit`) are
    the only place any rule (debt, caps, Eating Pass strikes, Extra
    Credit's cap and category allowlist) can be enforced.** A second
    implementation of "check the debt lockout" client-side would be exactly
    the kind of duplicate that quietly stops applying somewhere -- this
    tool has none. `src/lib/coin-desk.ts` (`DEDICATED_RPC`) is a lookup
    table routing five category ids to their dedicated RPC (four true
    `formula` categories plus `extra_credit`, which is `per_unit` pricing
    but refused by `coin_log_transaction` by name); every other loggable
    category goes through the generic RPC with `p_amount`/`p_quantity`
    shaped by its `pricing_model`.
  - **The amount input adapts to `pricing_model`:** `flat` shows the fixed
    price, never an input; `range` is a bounded number input (Above and
    Beyond's 1-3i¢); `per_unit` takes a quantity with a live `quantity x
    rate` preview; `variable` takes a raw amount, POSITIVE-only for
    award/purchase kinds and explicitly SIGNED (+/-) for the one
    `adjustment` category, `balance_correction`; each dedicated category
    gets its own inputs (points for Perfect Score and Extra Credit, a
    dollar cost for Property Damage, grams/hours/overnight for 3D
    Printing, nothing but a note for Pay Raise, whose cost the server alone
    computes). Every preview number in `coin-desk.ts` is informational
    only -- the RPC response is always the authoritative one, and the UI
    re-renders from it, never from the client's own guess.
  - **Student lookup reuses `coin_admin_lookup` as-is** (balance, wage
    tier, Eating Pass status, recent history in one round trip) so the
    admin sees context before logging anything new, not a blank form; a
    successful write re-runs it to refresh the summary. A typeahead
    against `profiles` (`role = 'student'`, matched on `display_name` /
    `full_name` / email, admin readable via the existing "teachers select
    all profiles" policy -- 0067's naming trap again, it means admins) is
    a SHORTCUT, never a requirement: profiles only has rows for students
    who have actually signed in, so a plain email input is the primary,
    always-working path (the same "attach a balance to an email
    independent of login status" doctrine coin_admin_adjust_balance relies
    on), and a typeahead miss shows a plain "they may not have logged in
    yet" note rather than blocking entry.
  - **Verified** via a dev harness at `/dev/coin-desk` (404 in production,
    no auth/Supabase) mounting the real interactive tool --
    `src/lib/coin-desk/CoinDeskTool.svelte`, extracted from the route so
    both mount the identical component -- against an in-memory ledger
    (`fake-ledger.ts`) that mirrors 0070's actual rules closely enough to
    reach every refusal shape: a flat fine, a range award, and the
    per_unit/formula preview math all landed the exact server-computed
    amount; the debt lockout blocked a purchase-kind category and left the
    balance untouched; Eating Pass strikes 1-2 stayed active, strike 3
    auto-revoked, a 4th violation post-revoke read as an ordinary fine, and
    a second purchase attempt while a pass was already held was refused
    with `pass_already_active`; Extra Credit succeeded at exactly the 21pt
    cap and blocked one point over it; Pay Raise's preview and the RPC's
    charged cost agreed (tier 2 -> 3 for 80i¢) and the wage tier updated;
    Quality Desktop Background blocked a same-month repeat with the
    calendar-cap message; Property Damage's submit stayed disabled with no
    note and enabled once one was typed; the typeahead surfaced a real
    match and, separately, a graceful no-match note for an unknown name; a
    plain walk-up email with no profiles row resolved to a genuine
    zero-balance, no-history lookup; and the "migration not applied"
    toggle rendered the fail-soft banner. **A real bug surfaced by this
    same testing pass, fixed before commit:** the post-submit refresh call
    unconditionally cleared the success-message state, so a successful
    log's confirmation flashed and vanished on the same tick even though
    the balance and history updated correctly -- `runLookup` now takes a
    `refresh` flag that skips clearing it when called from `submitEntry`'s
    own follow-up read.
  - **Separately cross-checked against the REAL, unmodified 0070 SQL** (the
    dev-harness pass above talks to `fake-ledger.ts`, a hand-written JS
    approximation of the rules -- useful for the interactive states but not
    proof the real RPCs agree). A temporary route (mounting the same
    `CoinDeskTool.svelte`, deleted before commit, never part of the repo)
    had its `supabase.rpc()` calls forwarded VERBATIM -- same fn name, same
    param object the component actually builds -- to a bridge server that
    executes them as real named-parameter calls (`fn(p_x => $1, ...)`)
    against 0001+0067+0070 applied unmodified on embedded Postgres, under a
    real `role authenticated` session with the pinned owner's uid as the
    JWT sub. Every one of `coin_admin_lookup`, `coin_log_transaction`
    (flat/range/per_unit/variable-award/variable-adjustment/cap_reached/
    debt/Eating-Pass-strikes-and-auto-revoke), `coin_log_perfect_score`,
    `coin_log_pay_raise`, `coin_log_property_damage_careless`,
    `coin_log_three_d_printing`, and `coin_log_extra_credit`
    (cap-before-debt ordering, confirmed by triggering `cap_exceeded` on an
    already-negative balance and getting the cap reason, not `debt`) was
    driven through real browser interaction and matched what the component
    predicted, with **zero mismatches** between what `CoinDeskTool.svelte`
    constructs and what the real SQL does.
  - **The two behaviors the source docs never pinned down, resolved by
    running the real RPCs (not inferred):**
    1. **3D Printing's grams-to-coins rounding is round-half-up (away from
       zero), not banker's rounding.** `round(p_grams / 10.0)` at
       `p_grams = 25` (an exact 2.5 tie) returned material cost **3**, not
       2 -- banker's rounding would tie 2.5 to the even neighbor (2).
       Confirmed a second, independent `round()` call site agrees:
       Property Damage's `round(p_cost_dollars / 0.25)` at `p_cost_dollars
       = 0.125` (also an exact 0.5 tie) also rounded up. Matches
       `Math.round()`, which the client preview already uses -- so the
       preview and the real charge agree at ties too, not just off them.
    2. **The hour-band boundaries are right-exclusive at BOTH ends -- an
       exact boundary hour always lands in the pricier band, never the
       cheaper one.** Read directly off the `<` operators in
       `coin_log_three_d_printing` and confirmed by real RPC calls: `1.0`
       hours exactly is NOT "under 1 hour" (charged 2i¢, the 1-3hr band,
       not free) and `3.0` hours exactly is NOT "1-3 hours" (charged 4i¢,
       the 3-6hr band). So the effective bands are `[0,1) free / [1,3) 2i¢
       / [3,6) 4i¢ / [6,∞) 6i¢`, despite the docs' prose ("1-3
       hours: 2i¢") reading as if 3.0 could go either way.
- **Admin balance tool is single-email only, currently.** Both
  `coin_admin_lookup` and `coin_admin_adjust_balance` take exactly one
  `p_email`; there is no bulk/multi-email path in the RPCs or in the UI
  (now `/coin-desk/students`). Worth revisiting once real onboarding volume makes
  one-at-a-time linking slow, but that is a follow-up, not something this
  foundation pass solves.
- **Two correctness bugs found and fixed before this migration was ever
  applied anywhere (verification below):**
  1. `current_user_email()` (0067) is `revoke`d from `public` and, unlike
     every pre-0070 caller (`is_admin()`, `is_owner()`, `admin_grant()`),
     0070 is the first to reference it DIRECTLY inside an RLS `using`
     clause (`coin_wage_tiers`, `coin_transactions`) rather than from
     inside another SECURITY DEFINER function. Evaluated as the querying
     role (`authenticated`), that means a genuine student reading their own
     balance or transaction history hit `permission denied for function
     current_user_email` and saw nothing -- the entire own-row read path
     was broken. Fixed by granting execute on it to `authenticated` inside
     0070 (idempotent, harmless whether or not 0067 already covers it;
     the function only ever returns the caller's own email).
  2. `coin_log_pay_raise` charged `40 * new_tier` (1st raise = 80i¢); both
     source docs' worked examples say 1st raise = 40i¢, 2nd = 80i¢, i.e.
     `40 * the tier being LEFT`. Fixed to `40 * current_tier`.
  - **Verified** against a real embedded Postgres (0001 + 0067 + 0070
    applied unmodified after the fixes, Supabase-shaped `auth` schema
    stub) covering all five scenarios from the review prompt: debt goes
    negative with no floor and blocks purchase-kind transactions only
    while already negative, clearing exactly at zero re-enables them;
    Eating Pass strikes 1-2 stay active, strike 3 auto-revokes, a 4th
    violation post-revoke is an ordinary fine (not a strike, confirming the
    revoke check can't double-fire since it only runs inside the
    just-flagged-a-strike branch), and a rebought pass costs the full
    150i¢ again; Extra Credit succeeds up to exactly the 21pt cap and
    blocks the 22nd regardless of balance, AND the grading-category
    allowlist is genuinely enforced server-side (an `integrated_design_
    challenge` or `final_exam` value raises an exception, it is not left to
    the caller); Pay Raise now costs 40i¢ for the first purchase and bumps
    the tier to 2, and a subsequent Weekly Wage award still pays flat 1i¢
    -- confirmed by tracing the code, not inference, that no path reads
    `coin_wage_tiers` when logging `weekly_wage`; Quality Desktop
    Background and Correct Answer in Class both cap correctly and reset on
    the calendar boundary (1st of the month / midnight) even when the prior
    row is backdated to just inside that boundary with far less than a
    30-day/24-hour gap, proving the cap is calendar-based, not rolling.
    Also verified as a consequence of fix 1: a signed-in non-admin student
    can read their own `coin_balances` / `coin_transactions` /
    `coin_wage_tiers` rows, a different student reading the same rows gets
    zero rows (not an error, not someone else's data), a non-admin still
    cannot call `coin_log_transaction`, and 0070 re-applies cleanly over
    its own already-created objects (idempotency). **NOT verified: the
    live Supabase project** -- this repo has no live database credentials
    available to apply migrations or run RPCs against production; 0070 is
    code-only until it is pasted into the Supabase SQL editor by hand, per
    the migration convention, and the five scenarios above should be
    spot-checked there too before treating real student balances as safe.
- **Student-facing balance page: `/coin-balance`. SUPERSEDED IN PHASE 3** --
  the route is a 308 redirect to the IDEA Coin Ledger, which carries all of
  this now; `CoinBalanceView.svelte` survives and is mounted by
  `/coin-desk/preview`. The rest of this bullet is the historical record of
  how it worked, and the RLS doctrine in it still governs. The read-only
  counterpart to `/coin-desk` -- a signed-in `@boscotech.net` student's own
  balance,
  reverse-chronological transaction history (category display name via
  `coin_categories`, amount, date), wage tier, and Eating Pass status
  (strike count shown only while a pass is currently held). Gated in
  `+page.server.ts` on `profiles.role === 'student'` (redirects anonymous or
  non-student visitors to `/`, the `/dashboard` non-admin pattern), and also
  listed in `hooks.server.ts` `authedPrefixes` for defense in depth.
  **Balance and history run as the signed-in caller with no RPC and no
  `student_email` filter at all** -- `coin_transactions` / `coin_wage_tiers`
  already grant a non-admin SELECT on `student_email = current_user_email()`
  rows only (0070), so the filtering is entirely the RLS policy this page
  exercises, never `coin_admin_lookup` or any other `is_admin()`-gated RPC.
  **Eating Pass status is ONE RPC call, `coin_my_eating_pass_status()`
  (`0072_coin_my_eating_pass_status.sql`, apply manually after 0071), not a
  second implementation of the rule.** `coin_eating_pass_active` /
  `coin_eating_pass_strikes` (0070) were never granted to `authenticated` --
  only their SECURITY DEFINER callers could reach them -- so this page used
  to re-derive that same logic in pure TS over the transaction list, a second
  copy of the rule liable to drift from the SQL if it were ever tuned later
  with nothing to catch the mismatch. `coin_my_eating_pass_status()` closes
  that: a thin, NO-PARAMETER SECURITY DEFINER wrapper that resolves the
  caller's own identity via `current_user_email()` (the exact function the
  RLS policies above already key on, so a student can only ever see their own
  status) and calls the two existing functions DIRECTLY -- one implementation
  of the rule, safely exposed, never re-derived. `+page.server.ts` calls it
  and passes the jsonb result straight through; `src/lib/coin-balance.ts`
  keeps only the `EatingPassStatus` type (the RPC's response shape), not any
  logic. `src/lib/coin-balance/CoinBalanceView.svelte` is the presentation
  component (the `CoinDeskTool.svelte` split), so `/dev/coin-balance` (404 in
  production, no auth/Supabase) mounts the same component against sample data
  -- balance still run through the real `sumBalance`/`withCategoryNames`
  helpers, Eating Pass status hardcoded per scenario to the same answer
  `coin_my_eating_pass_status()` would give (there being no TS mirror left to
  compute it from) -- covering a populated account, an Eating Pass revoked on
  its third strike (active reads false, strikes still reads 3 -- "since the
  last purchase", exactly like the SQL), the empty-history state, and the
  pre-0070 fail-soft state. Linked from the homepage app launcher
  (`portal-apps.ts`, `coin-balance`, `requiresAuth`, not
  `adminOnly`) beside the public coin leaderboard and the two admin coin
  tools. **NOT verified: a real non-admin session against a live project** --
  this repo's `.env` points at a placeholder Supabase project
  (`example-ref.supabase.co`), so there is no live database to sign in
  against, and 0072 has never been applied anywhere; verified instead via the
  dev harness (all four states render correctly with 0 console errors) and by
  reading 0070/0072's RLS policies and grants directly.

- **Sections + bulk logging (`0073_coin_sections.sql`, apply manually after
  0072): the foundation the roles/contracts work builds on next, and a real
  fix for "logging Weekly Wage means one email at a time, 10-20 times."**
  - **The relationship to `curriculum.ts`: reused, never duplicated.**
    `coin_sections` stores NO title, course, year, or instructor -- only what
    the coin economy needs that curriculum.ts has no business knowing
    (`color`, a carried-forward legacy Sheets feature, plus an optional
    `note` and a `label` override). `id` is normalized (lowercased, trimmed)
    the same way a curriculum `Section.id` already looks, so in the common
    case the coin-desk "from curriculum" picker inserts a section keyed on
    the EXACT `Section.id`, and `sectionDisplayName()`
    (`src/lib/coin-desk/sections.ts`) resolves the display name client-side
    via `sectionById()` rather than storing it -- the 0003
    `profiles.section_id` decision (free-form text, not a FK, so the
    curriculum can change in code with no migration) applied a second time.
    A section with no curriculum counterpart (a combined class, a one-off
    group) falls back to its stored `label`, then the bare id.
  - **Assignment is email-keyed** (`coin_section_students`, one row per
    student, PK `student_email`), the same `coin_transactions` /
    `coin_wage_tiers` pattern (0070) that lets a balance be pre-provisioned
    for an email that has never signed in -- `profiles.section_id` cannot be
    what bulk logging targets, since it is only ever populated by a
    signed-in student's own self-selection. Both tables are `is_admin()`-only
    to read AND write (no client insert/update/delete grant on either; every
    write goes through a SECURITY DEFINER RPC): `coin_admin_upsert_section`
    (create/edit/archive, one function for all three via `on conflict`),
    `coin_admin_list_sections` / `coin_admin_list_section_students` (reads,
    the `admin_list()` inline `where public.is_admin()` shape), and
    `coin_admin_set_student_section` (one email) /
    `coin_admin_assign_section_students` (a whole pasted array, invalid
    entries reported not silently dropped) for roster changes.
  - **`coin_bulk_log_section(p_section_id, p_category_id, p_amount, p_note)`
    is ONE round trip, ONE server-side transaction** -- not a client-side loop
    calling `coin_log_transaction` N times, which can be interrupted partway
    (a closed tab, a dropped call) leaving an ambiguous state where nobody
    can tell how many of the 20 students actually got logged. It returns a
    STRUCTURED per-student result array (the `{ok:false, reason:...}`
    convention every other refusal in this schema already uses:
    `{total, succeeded, refused, results: [{email, ok, reason?, balance?,
    amount?}, ...]}`), so a debt-lockout refusal on student #7 never
    obscures whether the other 19 succeeded. It reimplements NO business
    rule: per student it calls the EXISTING `coin_log_transaction` (nested
    SECURITY DEFINER, exactly the pattern `coin_admin_adjust_balance`
    already relies on -- `is_admin()`/`current_user_email()` read the
    session's JWT claims, not the executing role, so the inner call is
    authorized as the same admin who called the outer function), wrapped in
    its own exception handler so a per-student failure can never abort the
    rest of the section.
  - **Scope, deliberately narrow: `pricing_model in ('flat', 'range',
    'variable')` only** -- one amount, entered once, applied uniformly.
    `per_unit` (Extra Credit, Text Printing) and `formula` (Perfect Score,
    Pay Raise, Property Damage, 3D Printing) both need real PER-STUDENT
    input (a quantity, points, grams, hours) that cannot be one number typed
    once for a whole section; building that is a real per-student input
    grid, a later pass. Extra Credit is refused by category id explicitly
    (on top of its `per_unit` exclusion) since it's the category this gap is
    most often confused with. Shape validation (missing note, out-of-range
    amount) runs ONCE before the loop, mirroring `coin_log_transaction`'s own
    checks, so a config mistake fails with one clear error instead of the
    same refusal N times over.
  - **UI (`/coin-desk`):** `src/lib/coin-desk/SectionManager.svelte` is a new
    "Sections" card (the `CoinDeskTool.svelte` factored-component
    convention) -- add a section either from a curriculum dropdown (only
    classes with no coin section yet) or as a custom group (id + label),
    edit label/color/note, archive/reactivate (soft state, never delete,
    keeps roster + history), and per-section roster management (paste emails
    to add, remove a row). Its `sections` prop is `$bindable`, owned by
    `CoinDeskTool.svelte` and passed straight through, so a mutation there is
    immediately visible to the bulk-log picker with no separate refresh
    wiring. "Log a transaction" gained a Single student / Section mode
    toggle: Section mode swaps the student lookup for a section `<select>`
    (active sections only) and filters the category dropdown to
    `isBulkEligible()` categories, reusing the SAME flat/range/variable field
    blocks (a shared `{#snippet amountFields}`) the single-student flow
    already renders, since bulk categories are exactly that subset. Submit
    shows the per-student results list (green amount or the refusal reason,
    reusing the existing `reasonMessage()` helper extended with an `'error'`
    case for the bulk RPC's per-student exception fallback).
  - **Verified** in `/dev/coin-desk` (`fake-ledger.ts` extended with an
    in-memory `coin_sections`/`coin_section_students` mirror, two seeded
    sections -- one keyed to the real curriculum id `eng1h-sophomore`, one a
    custom "Period 3 Makeup Group" -- and every 0073 RPC, including a bulk
    handler that recurses into the SAME `coin_log_transaction` case the
    single-student RPC uses, mirroring the real nesting): roster add (with an
    invalid entry silently filtered client-side, reported if it reached the
    server) and remove both live-refresh the section's student count; a bulk
    Weekly Wage (flat) log against the sophomore section succeeded for both
    students; a bulk Song Request (flat, purchase-kind) log correctly
    refused the in-debt student with the debt message while the healthy
    student still succeeded -- confirming one student's refusal never blocks
    the rest; a bulk Above and Beyond (range) log respected the entered
    amount for both; the single-student flow (lookup, the full category
    list including formula/per_unit categories, a real Perfect Score submit)
    was unaffected by any of the above; creating a custom section
    immediately appeared in the bulk-log section picker; editing a section's
    note persisted; and archiving a section flipped its badge, changed its
    action to "reactivate", and removed it from the bulk-log picker while
    leaving it in the section list. Both migration-unapplied fail-soft
    banners (the Sections card and Section mode of the logger) render
    correctly when toggled off. `svelte-check`: 0 errors. **NOT verified: the
    live Supabase project** -- this repo's `.env` points at a placeholder
    project, so 0073 has never been applied anywhere; verified via the dev
    harness and by reading the RLS policies and grants directly.

- **Roles: Shop Steward / Quartermaster / Safety Officer / Lab Tech
  (`0074_coin_roles.sql`, apply manually after 0073).** Keyed off
  `coin_sections`/`coin_section_students`
  (0073) for section-scoped eligibility and ratio caps -- the same "reuse
  real infrastructure, not a parallel concept" doctrine 0073 itself
  established for bulk logging, applied a second time. Source:
  `docs/coin-economy/idea_coin_economy_draft_v3.md` Part 5.
  - **Application fee is 0i¢, on purpose.** Per the doc, the free-response
    answer is the real gate, not payment -- nothing in this migration
    touches `coin_transactions` at apply or approve time. The only coin
    ever tied to a role is the RECURRING Weekly Role Stipend (2i¢/week
    while holding one, already seeded in 0070 as `weekly_role_stipend`,
    scope `209h`), logged separately (see the bulk-logging bullet below).
  - **The real quiz content is NOT in this repo (superseded by `0076`, see
    below).** The doc references "The Role Questions sheet already has a
    full application quiz written for all four roles" -- that quiz's actual
    question TEXT lived in the legacy Google Sheet behind
    `getRoleQuestions`/`submitRoleApplication` (the retired Apps Script
    layer, archived under
    `docs/coin-economy/archive/legacy-system/`), outside this repo. This
    migration originally shipped a hardcoded stand-in
    (`src/lib/coin-desk/roles.ts`'s `ROLE_APPLICATION_QUESTIONS`, two
    free-response prompts per role) so an admin could log a real
    application before real question storage existed. `0076` removes that
    stand-in entirely and replaces it with a real, empty question table --
    see "Real question storage + expiration" below for where responsibility
    for the actual content now sits.
  - **Ratios: two are real, two are a proposed default.** Shop Steward is
    `per_students`: 3 per ~25 students, `floor(3 x section size / 25)`,
    where section size is the LIVE `coin_section_students` count, never a
    stored headcount -- checked against the doc's own worked examples:
    Junior (20 students) -> `floor(60/25)` = 2, Sophomore (10) -> 1, Senior
    (11) -> 1, all three exact. Quartermaster is `fixed` at 1 per section
    regardless of size, also documented. Safety Officer and Lab Tech were
    NOT specified in the source quiz ("propose 1-2 per section, your
    call") -- both seeded `fixed` at 2, flagged `ratio_is_default = true`
    (surfaced in the UI as a "DEFAULT, not settled" chip with the reasoning
    in a tooltip). The flag is a UI marker only; enforcement is identical
    either way. Changing the actual number is a hand-edit in the SQL
    editor, the same "price list edited by hand, no client write path"
    doctrine 0070 established for `coin_categories` -- there is no
    ratio-editing UI in this pass.
  - **The ratio cap is enforced on APPROVAL, not on application** -- Extra
    Credit's shape (`coin_log_extra_credit`'s point cap), not a new
    pattern: a hard block returned as structured `{ok:false, reason:
    'ratio_cap_reached', role_id, section_id, cap, held}` jsonb, never an
    exception, so the admin UI displays it gracefully. A pending
    application that hits the cap stays pending -- nothing silently drops;
    the admin revokes an existing holder or rejects the new application and
    tries again. `_coin_role_capacity` / `_coin_role_active_holder_count`
    are internal helpers (the `_coin_insert` convention, no grant) shared
    by both the admin-facing `coin_role_admin_capacity` preview RPC and
    `coin_role_admin_review`'s hard block, so the two can never disagree
    about what the cap or the current count is.
  - **Current holders: `coin_role_holders`, one row per approved
    application** (`application_id` not null + unique -- there is no way to
    grant a role that skips review). A partial unique index
    (`(student_email, role_id) where revoked_at is null`) is what makes
    "current holder" a real, checkable state and is the actual mechanism
    the ratio count reads: a revoked row simply stops counting, so
    "revoking frees a slot" needed no separate bookkeeping. The same
    "earned once, can still be lost, can be re-earned" shape the Eating
    Pass strike system already uses -- a student can be re-approved for the
    same role after a revoke (a fresh row, full history kept, never a
    delete).
  - **Weekly Role Stipend bulk-logging is its OWN RPC,
    `coin_bulk_log_role_stipend`, deliberately NOT routed through
    `coin_bulk_log_section` (0073).** `coin_bulk_log_section` pays every
    student IN A SECTION; the stipend is "every student who currently holds
    a role" money, not "every student in the class" money -- routing it
    through the section-wide bulk logger would pay every student, role or
    no role, which is wrong. So `weekly_role_stipend` is explicitly
    EXCLUDED from `isBulkEligible()` (`src/lib/coin-desk/sections.ts`,
    alongside Extra Credit) and `coin_bulk_log_role_stipend` iterates
    ACTIVE ROLE HOLDERS instead (optionally filtered by role and/or
    section), reusing the exact same nested-`coin_log_transaction`,
    one-round-trip, structured-per-student-results shape
    `coin_bulk_log_section` already established -- same jsonb shape, same
    "one refusal never blocks the rest" guarantee, just over a different
    roster. `distinct` on `student_email` is deliberate: a student holding
    two roles at once (nothing forbids it) is paid the stipend once per
    run, not once per role.
  - **Admin UI (`src/lib/coin-desk/RolesManager.svelte`), mounted in
    `CoinDeskTool.svelte` directly under `SectionManager`, built the SAME
    way SectionManager was built** -- its own card, plain email inputs (no
    separate typeahead), and the identical expand-a-section-row pattern for
    "current holders by section" (mirroring `SectionManager`'s roster
    expand/collapse, not a parallel roster view), rather than one shared
    student-lookup threaded across both components. Sections: role
    definitions with ratio description + default badge; "Log an
    application" (email + role + the stand-in free-response questions,
    since no student self-serve flow exists yet -- see below); "Pending
    applications" (free-response Q&A shown expanded, a live capacity chip
    per role/section fetched via `coin_role_admin_capacity`, Approve/Reject
    with an optional review note, the ratio refusal shown inline while the
    application stays in the list); "Current holders by section" (the
    expand-per-section pattern, revoke behind a two-step inline confirm,
    the `SectionManager`/gauntlet-room-delete convention); "Pay Weekly Role
    Stipend" (optional role/section filters, the same per-student results
    list rendering as bulk logging).
  - **A real staleness bug found and fixed during verification.** The
    "current holders" list is cached per section the same way
    `SectionManager`'s roster is (fetch once on first expand, reuse) -- but
    unlike the roster, a role holder can change from a DIFFERENT panel (an
    application approved in "Pending applications") while that section's
    holder list sits cached, including while collapsed. An approval used to
    leave that cache stale indefinitely (collapsing and re-expanding did
    NOT refetch, since the cache-populated check only fetches once ever).
    Fixed: `reviewApplication` now force-refetches
    `holdersBySection[app.section_id]` after a successful approve whenever
    that section was EVER loaded, not only when currently expanded.
  - **Verified** in `/dev/coin-desk` (`fake-ledger.ts` extended with an
    in-memory `coin_role_definitions`/`coin_role_applications`/
    `coin_role_holders` mirror and all seven 0074 RPCs, nesting into the
    same `coin_log_transaction` handler the section bulk logger already
    recurses into): a third seeded section, "Ratio Cap Demo (10 students)"
    (10 bare emails, kept separate from the other two seeded sections so
    neither's existing bulk-log demo was disturbed), holds two PENDING Shop
    Steward applications -- Shop Steward's `floor(3 x 10 / 25)` computes a
    real cap of exactly 1 here. Approving the first (0 held < cap 1)
    succeeded and the remaining application's capacity chip live-updated to
    "1 of 1 filled"; approving the second immediately afterward (1 held >=
    cap 1) was refused inline with "Blocked: role at capacity (1/1 filled
    for this section)." and stayed pending, nothing lost; revoking the
    first holder (two-step confirm) live-updated the section to "No one
    currently holds a role" and the capacity chip back to "0 of 1 filled";
    approving the still-pending second application then succeeded, and
    -- with the staleness fix in place -- the already-expanded "Current
    holders" panel updated immediately with no manual collapse/re-expand
    needed. Also verified: "Pay Weekly Role Stipend" with no filters
    (defaults) logged the 2i¢ stipend against exactly the one current
    holder (`+2i¢`), not the section's other 9 students; logging an
    application for a student with no coin section assigned refused with
    "This student has no coin section assigned yet -- assign one above..."
    (an exception, not a structured refusal, since it is a setup
    precondition); logging a second application for a role the student
    already holds refused with "This student already holds this role."
    Zero console errors throughout. `npm run check`: 0 new errors, 0 new
    warnings (8 pre-existing errors in `tests/db/harness.ts` and
    `tests/notebook-security.test.ts` are missing-devDependency issues
    unrelated to this change). **NOT verified: the live Supabase project**
    -- same placeholder-`.env` caveat as every other coin-economy
    migration; 0074 has never been applied anywhere, verified via the dev
    harness and by reading the RLS policies and grants directly.
  - **Explicitly scoped OUT of this pass: any student-facing surface.** No
    self-serve apply flow, no "my roles" view -- every application is
    admin-entered, the same way every other coin-desk write already is.
    The `/coin-balance` pattern (a signed-in student's own read-only view,
    RLS-scoped with no RPC) is the right model whenever that becomes real
    scope, but building it now would mean a new signed-in route, resolving
    the caller's own section, and rendering the stand-in question set as if
    it might be the real quiz -- real, separate work this pass does not
    take on.
- **Real question storage + holder expiration
  (`0076_coin_role_quiz_and_expiration.sql`, apply manually after 0075).**
  Replaces `roles.ts`'s hardcoded `ROLE_APPLICATION_QUESTIONS` stand-in with
  a real question bank, links every application answer to the specific
  question it answered (for both MC and written), and adds an expiration to
  `coin_role_holders`. Structure only -- see the "content ownership" bullet
  below for exactly where the real question text is expected to come from.
  - **`coin_role_quiz_questions`** (id, `role_id` -> `coin_role_definitions`,
    `type` `mc`/`written`, `question_text`, `sequence`, and for `mc` a JSON
    `options` array + `correct_option_index`) is left COMPLETELY EMPTY by
    this migration -- no placeholder rows, no real content. `is_admin()`-
    gated read, no insert/update/delete grant or policy at all: it is edited
    BY HAND in the Supabase SQL editor, the exact "price list edited by
    hand, no client write path" doctrine `0070` established for
    `coin_categories` and `0074` already applied to `coin_role_definitions`.
  - **CONTENT OWNERSHIP, stated plainly since this is where responsibility
    actually sits:** the real quiz text (per `docs/coin-economy`) is never
    committed to this repo and is never added by a future commit either --
    it is pasted into `coin_role_quiz_questions` directly by whoever has
    Supabase SQL editor access, the same way `coin_categories`' real prices
    are maintained. A role with zero rows here (every role, until someone
    seeds it) is a legitimate state, not a bug: `coin_role_apply` requires
    zero answers for zero questions, and the admin form shows "No
    application questions have been added for this role yet." instead of a
    broken empty form.
  - **`coin_role_application_answers`** replaces
    `coin_role_applications.answers` (a freeform `{question, answer}` jsonb
    array with no real link back to a question, dropped outright -- the
    role-application flow had never gone live with real content per `0074`'s
    own header, so there was no real data in that shape to preserve). One
    row per question per application, SNAPSHOTTED at submission time
    (question text, options, which option was correct, whether the selected
    one matched) rather than live-joined against the question bank --
    deliberate, because the question bank is maintained by hand outside
    normal migrations and can be edited or replaced at any time; a live join
    would let editing a question after the fact silently rewrite what a
    completed review looked like.
  - **MC scoring is informational only, exactly like the application fee is
    0i¢ on purpose.** `is_correct` (plus the correct option's index) is
    computed ONCE, at submission, from the question's answer key at that
    moment, and shown on the review screen as a right/wrong indicator next
    to whatever the student picked. Nothing reads it to gate, hide, or
    auto-decide anything -- the written portion is never blocked or hidden
    based on MC score, and approve/reject stays a manual admin call
    regardless of how the MC portion scored.
  - **Expiration is a COMPUTED condition, never a scheduled job.**
    `coin_role_holders.expires_at` (nullable) plus the existing `revoked_at`
    combine into one condition used EVERYWHERE a holder is counted or
    listed: `revoked_at is null and (expires_at is null or expires_at >
    now())`. A holder stops counting toward ratio capacity
    (`_coin_role_active_holder_count`), stops appearing in the default
    "current holders" list (`coin_role_admin_list_holders`), and stops being
    paid the Weekly Role Stipend (`coin_bulk_log_role_stipend`) the instant
    ANYTHING evaluates that condition past the expiration date -- no cron,
    no timer, nothing that runs on a schedule.
  - **The one place a natural expiration is ever physically WRITTEN, and
    why it has to be.** The partial unique index that makes "one active
    holder per (student, role)" enforceable
    (`coin_role_holders_active_unique`, `where revoked_at is null`) can only
    reference `revoked_at is null` -- Postgres does not allow a volatile
    expression like `now()` in an index predicate, so the index has no way
    to know a row has lapsed. Approving a NEW application for a student
    whose prior holder expired naturally (revoked_at still null) would hit
    that index. `coin_role_admin_review`'s approve branch handles this by
    lazily stamping `revoked_at = expires_at, revoked_by = 'system'` on any
    such lapsed-but-open row for that exact (student, role) pair the moment
    a new approval needs the slot -- a write triggered by a real action
    touching that row, not a background sweep. `roles.ts`'s `holderStatus()`
    is the one place that distinguishes the result from a MANUAL revoke:
    `revoked_by === 'system'` reads as "expired", anything else as
    "revoked" -- and a row that is naturally past its expiration but not yet
    lazily finalized (`revoked_at` still null) also reads as "expired" via
    the server's own `is_active` flag, never "active".
  - **Approval sets the expiration; it is never server-guessed.**
    `coin_role_admin_review` gained `p_expires_at` (nullable, default
    null) -- adding a parameter changes the function's real signature, so
    the migration explicitly `drop function`s the old 3-argument overload
    first (the exact "0058 naming trap" lesson this codebase already
    documents: `create or replace` alone would have left the old signature
    callable as a second overload). The server stores exactly what it's
    given, including null for "no expiration" -- it never applies a default
    on its own. `coin_role_definitions.suggested_duration_days` (seeded to
    90, roughly a semester, for all four roles -- a proposed convenience
    like `ratio_is_default`, always hand-editable, never enforced) is a
    CLIENT-SIDE pre-fill only: `RolesManager.svelte` fills the approval
    screen's expiration date input from it before the admin clicks Approve,
    and the admin can clear or change it before submitting. This keeps the
    RPC free of the ambiguity a server-side "null means use the default"
    rule would create.
  - **Editing an expiration is independent of revoking, always.**
    `coin_role_admin_set_expiration(p_holder_id, p_expires_at)` works on a
    holder in any state (active, expired, even already revoked) and needs
    no revoke first; `coin_role_admin_list_holders` gained `expires_at` and
    a computed `is_active` output column (also required an explicit
    `drop function` first, same reasoning as above but for a return-type
    change rather than a parameter).
  - **Admin UI (`RolesManager.svelte`, `roles.ts`).** "Log an application"
    now loads a role's REAL question set live
    (`coin_role_admin_list_role_questions`) the moment a role is picked --
    written renders a textarea, MC renders radio options -- and Log is
    disabled until every currently-active question has an answer
    (`questionsAnswered()`); a role with none configured shows a plain note
    instead of a broken form. "Pending applications" shows each answer next
    to its real question text, with a correctness badge on MC answers
    (`✓ correct` / `✗ incorrect -- correct answer: ...`) and an expiration
    date input pre-filled from the role's suggested duration next to
    Approve. "Current holders by section" shows a status badge (active /
    expired / revoked, from `holderStatus()`) and an "expiration" action
    beside "revoke" that opens an inline date editor, independent of
    revoking.
  - **Verified** in `/dev/coin-desk` (`fake-ledger.ts` extended with a
    dev-only sample question bank -- shop_steward/safety_officer/lab_tech
    each get one written + one MC question, quartermaster deliberately gets
    ZERO to exercise the "no questions yet" state -- and `holderIsActive()`
    mirroring the 0076 active condition everywhere the real RPCs use it):
    picking Quartermaster in "Log an application" showed "No application
    questions have been added for this role yet." with Log disabled;
    picking Safety Officer live-loaded its real written + MC question, Log
    stayed disabled after only the textarea was filled and enabled once an
    MC option was picked, and submitting showed the new application in
    Pending with the real question text and a `✓ correct` badge on the
    matching MC answer; approving it pre-filled the expiration input to
    exactly today + 90 days and, after approval, the new holder read
    "active · expires <that date>" under Current holders; editing that
    holder's expiration to a past date flipped it to "expired" immediately
    (verified against a genuine local-timezone "yesterday", not a UTC one --
    an earlier attempt using `Date.prototype.toISOString()` for "yesterday"
    silently produced today's date under UTC-7 and was caught by the
    resulting "active" reading not matching the intended edit) and dropped
    it out of a freshly-computed capacity chip (0 of 2 filled, correctly
    excluding the expired-but-unrevoked row); re-applying and re-approving
    the SAME student for the SAME role then succeeded (no `already_holds_role`
    block) and the lazy-finalize left the old row reading "expired" with no
    `revoke` button left on it (since it was already closed) while the new
    row read "active" with a fresh expiration; manually revoking the new
    row separately showed "revoked", confirming `holderStatus()` tells the
    two apart; the pre-existing Ratio Cap Demo section still enforced its
    cap-of-1 refusal identically to before (unaffected regression check);
    and "Pay Weekly Role Stipend" with no filters paid exactly the two
    remaining ACTIVE holders (`+2i¢` each), skipping both of the
    now-expired/revoked Alex Rivera rows entirely. Zero console errors
    throughout. `npm run check`: 0 errors, 0 new warnings. **NOT verified:
    the live Supabase project** -- same placeholder-`.env` caveat as every
    other coin-economy migration; 0076 has never been applied anywhere,
    verified via the dev harness and by reading the RLS policies, grants,
    and the partial-unique-index-vs-`now()` reasoning directly.

- **Contracts: post a job, students self-claim it, an admin completes it or
  cancels it (migration `0077_coin_contracts.sql`, apply manually after
  0076).** Built on 0070's existing `contract_completion` category --
  `docs/coin-economy/idea_coin_economy_draft_v3.md` Part 3's guideline
  ("~1i¢/hour, +50% for specialized skill") is a client-side HINT shown
  while posting, never enforced; `payout_amount` is always a free amount the
  admin types in, exactly like a single-student Contract Completion entry
  always was. No new pricing model, no new category.
  - **`coin_contracts`** (title, description, `payout_amount`,
    `max_contractors` default 1, nullable `section_id` -> `coin_sections` on
    delete set null meaning "open to everyone" once unset, `created_by`,
    `completed_at` / `cancelled_at` mutually exclusive by CHECK,
    `cancel_reason`) and **`coin_contract_claims`** (PK `(contract_id,
    student_email)`, `claimed_at`) are the only two tables. **"Open" /
    "full" / "completed" / "cancelled" is computed, never stored** -- the
    `coin_wage_tiers` / Eating Pass doctrine applied a third time: only
    `completed_at`/`cancelled_at` are real state, everything else derives
    from those plus a live claim count.
  - **The capacity check needs a ROW LOCK, not just a count-then-insert,
    because there is no claim row to lock for a student who does not hold
    one yet.** `coin_contract_self_claim(p_contract_id)` -- no email
    parameter, resolved from `current_user_email()` like every other
    student-facing action, so a student can only ever claim for themselves
    -- opens with `select ... from coin_contracts where id = ... for
    update`, locking the PARENT contract row. A second concurrent claim on
    the SAME contract blocks on that lock until the first transaction
    commits or rolls back; because Postgres gives each STATEMENT inside a
    transaction a fresh snapshot under the default READ COMMITTED
    isolation, the count taken after the wait resolves genuinely sees the
    first call's just-committed claim. This is the real guarantee --
    application-level sequencing on one request says nothing about two
    concurrent ones. The `(contract_id, student_email)` PK is a second,
    independent backstop against a literal double-claim by the SAME
    student, caught with an explicit `unique_violation` handler so it
    returns the same structured refusal shape as everything else here
    rather than a raw constraint error. Refusals: `not_open` (completed or
    cancelled), `wrong_section` (the contract is section-restricted and the
    student's `coin_section_students` row does not match), `already_claimed`,
    `full` (with `max_contractors`/`claimed_count`). An unknown contract id
    raises -- genuine misuse, not an expected race.
  - **Read model: a public aggregate view for browsing, an admin RPC for
    identities.** `coin_contracts` itself is broadly readable to any
    signed-in user (the `coin_categories` precedent: a job list is not
    sensitive), so browsing is a direct table read, no RPC -- the
    `/coin-balance` doctrine applied to a new surface.
    `coin_contract_status` is an OWNER-PRIVILEGED view (not
    `security_invoker`, so it can aggregate past `coin_contract_claims`' own
    narrower RLS) exposing only `claimed_count` + computed `status` per
    contract id -- no student identities, so there is no row-level data
    being bypassed for it to leak (the 0060 rule about an owner-privileged
    view needing its own row predicate has nothing to apply to here, since
    every column it returns is a safe aggregate). `coin_contract_claims`
    itself keeps the `coin_transactions` own-row-or-admin RLS shape
    (`student_email = current_user_email() or is_admin()`), so "contracts
    I'm on" is the same no-filter-needed read `/coin-balance`'s history
    already is. The admin side wants claimant IDENTITIES too, which is
    exactly what that RLS keeps from a plain student, so
    `coin_admin_list_contracts()` is its own `is_admin()`-gated RPC (the
    `coin_role_admin_list_applications` precedent) returning every contract
    with a `claimants` jsonb array (email, display name, claimed_at).
  - **`coin_admin_post_contract`** (title, description, payout_amount,
    max_contractors, optional section_id) is the only writer of a new
    contract, `is_admin()`-gated like everything else in this schema.
  - **`coin_admin_complete_contract(p_contract_id, p_note)`** splits
    `payout_amount` evenly across every current claimant and logs each
    share as an ordinary Contract Completion award via the EXISTING
    `coin_log_transaction`, never a direct write -- so the debt lockout (a
    no-op here, since awards always land regardless of balance) and every
    other rule stay in the one place they always lived. **Even split, round
    half up** (Postgres `round()`, away from zero -- the SAME convention 3D
    Printing's material charge and Property Damage's exchange rate already
    use): `share = round(payout_amount::numeric / count)`, identical for
    every claimant. When the payout does not divide evenly the total
    actually paid can differ from `payout_amount` by a coin or two either
    way -- accepted deliberately, the same way a per-unit rate rounds
    elsewhere in this schema with no reconciliation step; singling out
    which claimant gets an odd leftover coin is a judgment call this
    migration does not make. Refuses (exception) a contract with zero
    claimants ("there is no one to pay") or an already-terminal one, wrapped
    per-claimant in its own exception handler so one student's failure can
    never block the rest -- the `coin_bulk_log_section` per-student-results
    convention, over a two-row roster instead of a section.
  - **`coin_admin_cancel_contract(p_contract_id, p_reason)`** pays nothing,
    ever -- the only path that pays anyone is `_complete_contract` above.
    Claims are left in place as a historical record, the revoke-not-delete
    convention this schema uses everywhere (`coin_role_holders`,
    `coin_section_students`).
  - **`coin_admin_reset_contract(p_contract_id)`** clears every claim and
    returns a contract to open. Only valid while neither completed nor
    cancelled (both genuinely terminal, exception otherwise) -- there is no
    "un-complete" or "un-cancel" anywhere in this schema, and reset does not
    invent one.
  - **UI:** `src/lib/coin-desk/ContractsManager.svelte` is the admin card
    (mounted in `CoinDeskTool.svelte` directly under `RolesManager`, the
    `SectionManager`/`RolesManager` convention -- its own card, a plain post
    form with the guideline hint computed client-side, a status-filtered
    list, two-step confirm on cancel/reset). `/contracts` was the
    student-facing route (`src/lib/contracts/ContractsView.svelte` +
    `src/routes/contracts/+page.server.ts`) -- **SUPERSEDED IN PHASE 3**: it
    is a 308 redirect to the IDEA Coin Ledger's Contracts tab now, and the
    component survives only as what `/coin-desk/preview` mounts. The rest of
    this bullet is the historical record, and its reasoning still governs. It
    was gated to signed-in
    `profiles.role === 'student'` exactly like `/coin-balance` (redirect
    anonymous or non-student to `/`; also in `hooks.server.ts`
    `authedPrefixes` for defense in depth) -- browse every open contract,
    claim one, see "Contracts you're on". Reads run the `/coin-balance` way
    (RLS/the view does the filtering, no `.eq(student_email, ...)`
    anywhere); the one write, self-claim, re-fetches afterward rather than
    guessing the new state client-side, since a claim can legitimately lose
    a race to fill the last slot between the click and the response.
    `contractSharePreview()` (`src/lib/coin-desk/contracts.ts`) mirrors
    `round()`'s half-up behavior via `Math.round()`, which agrees with
    Postgres at every tie for a positive input, so the admin's "N&cent; if
    completed now" preview per claimant always matches the real charge.
  - **Verified against a REAL embedded Postgres** (the `tests/db/harness.ts`
    fixture other feature tests already use, extended with an optional
    `migrationFiles` parameter -- defaulting to the notebook chain those
    tests need, so nothing about them changed -- rather than editing the
    shared constant; `npm test` reruns the FULL suite afterward, 78/78
    green, confirming zero regression). `tests/coin-contracts.test.ts`
    applies 0001+0003+0020+0067+0070+0073+0077 UNMODIFIED and covers, with
    genuine Postgres transactions rather than a mock: **RLS** (any
    signed-in user reads `coin_contracts`/`coin_contract_status`;
    `coin_contract_claims` scoped to own rows unless admin); **no direct
    write** on either table for a student OR an admin (`42501` both ways);
    **every self-claim refusal shape** (full with the exact counts,
    already_claimed, wrong_section, not_open after a cancel, an unknown id
    raising); **the concurrency guarantee itself, against REAL concurrent
    connections** -- exactly 3 of 5 simultaneous claims succeed on a 3-slot
    contract with the claims table agreeing at exactly 3 rows, exactly 1 of
    5 succeeds on a 1-slot contract repeated across 5 independent rounds
    (a single passing round would be consistent with "got lucky"; five
    rounds with real network/scheduling jitter between them is not), and
    the SAME student firing two simultaneous claims never produces two
    rows; **the even-split arithmetic against the real RPC**, including the
    genuine round-half-up case (15i¢ across 2 claimants -> 8i¢ each, not 7,
    Postgres `round()`'s away-from-zero tie-break exercised directly, not
    asserted from documentation) alongside an ordinary non-tie remainder
    (100i¢ across 3 -> 33i¢ each, 99 of 100 actually paid); **admin
    lifecycle** (post -> list with claimants, complete refusing zero
    claimants and a re-complete, cancel leaving claims as history with no
    payout and refusing a re-cancel or a complete afterward, reset
    returning a full contract to genuinely reclaimable open slots and
    refusing on a completed or cancelled one); and the **permission
    boundary** (a non-admin student refused with an exception on all four
    admin RPCs and reading zero rows from `coin_admin_list_contracts()`,
    `anon` holding no `EXECUTE` grant on any of the six RPCs, checked via
    `has_function_privilege` rather than attempting a call with no
    session). 19 assertions, all green. Browser-verified live against the
    dev server (`/dev/coin-desk` and the new `/dev/contracts`, both against
    `fake-ledger.ts` extended with a module-level contracts mirror and a
    student-identity switcher for the self-claim caller, since that RPC
    takes no email parameter at all): the real wrong-section refusal
    message rendered on a real click, a real successful claim moved the
    contract from "Open contracts" into "Contracts you're on" and updated
    the live count, Complete paid the real Contract Completion award
    (confirmed by re-looking up the claimant's balance in the SAME admin
    tool, `-8i¢ -> 7i¢` for a 15i¢ payout), Cancel and Reset both drove
    their real two-step confirms, Post created a real new row, the status
    filter tabs partitioned all six seeded/created contracts correctly, and
    the guideline hint computed `10 -> 15i¢` when the specialized checkbox
    was ticked. A REAL BUG was found and fixed during this pass: the fake
    ledger's `from('coin_contracts')` (and the two other new tables/view)
    initially skipped the `.select()` step entirely, throwing
    `supabase.from(...).select is not a function` on every load -- caught
    immediately by the browser console, not assumed fixed by writing the
    fix. `npm run check`: 0 errors. **NOT verified: the live Supabase
    project** -- same placeholder-`.env` caveat as every other coin-economy
    migration; 0077 has never been applied anywhere, verified via the real
    embedded-Postgres suite above and the dev harness.
- **Bulk payout (`0079_coin_bulk_payout.sql`, apply manually after 0078).**
  Pay every student with a positive balance in one click, or one at a
  time, from a new "Payout" card on `/coin-desk`. Reuses the EXISTING
  `coin_payout` category (purchase-kind, `variable` pricing, already
  loggable via the single-student flow) as the actual write -- no new
  category, no new pricing model.
  - **`coin_payout_student(p_email, p_note?)`** re-reads the student's
    CURRENT `sum(coin_transactions.amount)` inside the function, in the
    same statement that decides what to log, and passes that as the amount
    to the EXISTING `coin_log_transaction('coin_payout', ...)` -- which
    negates it for us (purchase-kind), converting the balance to exactly
    zero. Nothing left to pay (balance <= 0) returns a structured
    `{ok:false, reason:'no_balance'}`, never an exception.
  - **`coin_bulk_payout(p_note?)`** is ONE round trip, not a client-side
    loop: it selects every `student_email` with `sum(amount) > 0` fresh at
    the top of its loop, then calls `coin_payout_student` (nested SECURITY
    DEFINER, the `coin_bulk_log_role_stipend` pattern) once per student
    INSIDE the loop -- so a fine or award landing on a not-yet-reached
    student mid-run is still picked up when the loop gets to them, per
    statement-level snapshotting under READ COMMITTED. Returns the same
    `{total, succeeded, refused, results}` shape every other bulk RPC here
    uses, wrapped per-student in its own exception handler.
  - **The race this closes:** the candidate LIST (`src/lib/coin-desk/
    PayoutManager.svelte`) is a plain read of the existing `coin_balances`
    view (0070; admin already sees every row there, `student_email =
    current_user_email() or is_admin()`) joined client-side against
    `profiles` for a display name -- a snapshot that can go stale the
    instant it renders. Neither RPC ever takes a client-supplied amount, so
    whatever Pay/Pay All actually logs is always the ledger's answer at the
    moment of the write, never the number the list happened to show.
  - **Verified** in `/dev/coin-desk`: paying a single candidate zeroed their
    balance and removed them from the list; and, the decisive check, adding
    a fresh fine against a listed candidate (dropping their real balance
    from 204i¢ to 202i¢) WITHOUT refreshing the still-stale "204i¢" row,
    then clicking Pay All, paid exactly **202i¢** -- confirmed against the
    real balance, not the number the list was still showing.
- **Admin-managed categories (`0080_coin_category_admin.sql`, apply
  manually after 0079).** 0070 documented `coin_categories` as "edited by
  hand in the SQL editor, no client write path" -- this migration opens a
  real but narrow write path onto it from a new "Categories" card on
  `/coin-desk`.
  - **`coin_admin_create_category(...)`** can define `flat`, `range`,
    `per_unit`, and `variable` pricing -- every shape that is just DATA.
    It explicitly REFUSES `pricing_model = 'formula'` with an exception
    explaining why: a formula category (Perfect Score's rounding, Pay
    Raise's tier math, Extra Credit's semester cap, ...) needs bespoke
    plpgsql beyond a lookup, which is a code change (a dedicated RPC), not
    something a form can produce -- `coin_log_transaction` already refuses
    to log ANY formula category directly (0070), and this migration does
    not touch that rule, it only adds a second, narrower door for the four
    shapes that genuinely are configuration. `src/lib/coin-desk/
    category-admin.ts`'s `CREATABLE_PRICING_MODELS` is that same refusal
    surfaced in the UI before a submit is even attempted, and the create
    form states the boundary in plain language. New rows default
    `loggable = true, active = true` and sort after their kind's existing
    rows; validation mirrors the table's own CHECK constraint (0070) with
    friendlier per-field messages, but that CHECK is still the real
    backstop.
  - **`coin_admin_set_category_active(p_id, p_active)`** only ever flips
    `active` -- there is no delete RPC and none is planned:
    `coin_transactions.category_id` references `coin_categories(id)` with
    no ON DELETE clause, so `active = false` is what already removes a
    category from every loggable list (`coin_log_transaction` and
    `coin_bulk_log_section` both already refuse `not active`; the
    `/coin-desk` load query dropped its old `.eq('active', true)` filter so
    CategoriesManager can show retired rows too, and `CoinDeskTool.svelte`'s
    own `selectableCategories` derived value is what filters back to
    active-only for the actual logging dropdowns) while the row itself, and
    every historical transaction's `category_id`, stays exactly as valid
    and readable as always -- the sections.ts "archive/reactivate, never
    delete" convention applied to the price list.
  - **Pricing-band guidance, hint not a gate:** `PRICE_BAND_GUIDANCE` in
    `category-admin.ts` (drawn straight from
    `docs/coin-economy/idea_coin_economy_draft_v3.md` Parts 2-4, the same
    source the Contract Completion guideline in `contracts.ts` cites) shows
    where the existing fine/award/purchase scale sits for whichever kind is
    selected -- informational only, never enforced, the exact
    "guideline only, never enforced" treatment the contract-posting formula
    already established.
  - **Verified** in `/dev/coin-desk`: creating a `variable` award landed
    immediately in the "Log a transaction" dropdown with no reload;
    retiring a category already used in a logged transaction dropped it
    from that dropdown (and from the bulk-log picker) while the student's
    transaction history still rendered its real name, not a raw id or a
    blank; the create form's pricing-model select offers only the four
    creatable shapes, never `formula`.
- **Debt payment (`0081_coin_debt_payment.sql`, apply manually after
  0080).** A pre-seeded category, `debt_payment` -- award-kind, `variable`
  pricing, credits the balance the same direction as Physical Coin
  Submission -- inserted the same way 0070's own seed rows are (a plain
  `insert ... on conflict (id) do update`), needing no new RPC since
  `variable`/`award` already routes through the existing
  `coin_log_transaction`. Kept as its OWN category id rather than reusing
  `physical_coin_submission` specifically so debt settlement is
  reportable separately by filtering `category_id = 'debt_payment'`, with
  nothing to disambiguate after the fact.
  - **`src/lib/coin-desk/DebtPaymentPanel.svelte`** is the dedicated UI,
    mounted in `CoinDeskTool.svelte` directly under the student summary
    card and rendered ONLY while the looked-up student's `balance < 0` --
    a student with no debt gets no panel at all, not a disabled or empty
    one. It reuses the EXISTING student lookup (no second "find a
    student" flow) and shows the current debt prominently, pre-fills the
    payment amount from it, and leaves the amount fully editable with NO
    cap: `coin_log_transaction`'s debt lockout (0070) only blocks
    PURCHASE-kind transactions while a balance is already negative, and an
    award (this one included) always applies past zero with no ceiling, so
    a payment larger than the debt legitimately leaves the balance
    slightly positive -- a correct outcome, never a refusal.
  - **Verified** in `/dev/coin-desk`: looking up "debt.student" (seeded at
    -8i¢) showed the amber Debt Payment card pre-filled with `8`; logging
    it moved the balance to exactly `0i¢`, logged a `+8i¢` "Debt Payment"
    transaction, and the panel disappeared (no more debt to pay); the
    category also appears as an ordinary option in the general "Log a
    transaction" dropdown, tagged distinctly from Physical Coin
    Submission.
  - **NOT verified: the live Supabase project** -- same placeholder-`.env`
    caveat as every other coin-economy migration; 0079-0081 have never
    been applied anywhere, verified via the dev harness (`fake-ledger.ts`
    extended to mirror the RPCs' behavior) and by reading the RPC bodies
    directly.

