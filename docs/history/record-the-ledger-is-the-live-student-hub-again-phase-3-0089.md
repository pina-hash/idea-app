---
title: "The Ledger is the live student hub again (Phase 3, `0089`)"
date: 2026-08-12
branches: []
migrations: ["0072", "0089"]
subsystems: ["IDEA Coin economy"]
record_order: 10
---

## The Ledger is the live student hub again (Phase 3, `0089`)

`static/coins/index.html` -- the IDEA Coin Ledger -- reads the real Supabase
economy now instead of the frozen Google Sheets export, and is once more what
it always was: ONE hub carrying balance, leaderboard, transaction log,
analytics, contracts and roles together. Migration
`0089_coin_public_ledger.sql`, apply manually after `0088`. **Nothing about
the legacy Sheets/Apps Script system was deactivated here** -- it kept working
alongside this change. **Phase 4 has since retired it** (2026-08-12); see
"IDEA Coin ledger: RETIRED" above.

- **Its visual design did not change, on purpose.** This is a data-layer swap
  behind unchanged markup plus the few additions below, styled with the
  file's own local tokens. It is a THIRD deliberate lift of the legacy-HTML
  freeze, scoped exactly to: the network constants and fetch/parse layer, the
  role modal's submission path, the claim control, the drawer's two new
  stats, and removal of the amber legacy banner. Not licence to edit that
  file generally.

### THE ABSOLUTE RULE: no public response ever carries an email

The Ledger is a PUBLIC page over an EMAIL-KEYED schema
(`coin_transactions`, `coin_wage_tiers`, `coin_section_students`,
`coin_contract_claims`, `coin_students` are all keyed on a real school
address), so a public table grant or a `security_invoker` view would hand a
school directory to anyone who opened the network tab. Hence RPCs, not
grants:

- Nothing is granted SELECT on any email-keyed table. `anon` gets EXECUTE on
  the eight read functions in 0089 and nothing else, and each one PROJECTS
  THE EMAIL AWAY inside the database -- there is no parameter, filter or
  field through which an address can be requested or returned.
- **Public identity is a display name**, resolved once in the internal
  `_coin_public_roster()` by 0084's standing rule
  (`coalesce(coin_students.display_name, the profile's display/full name, the
  email's local part)`), so every public surface agrees.
- **Per-student detail is addressed by an OPAQUE id**, `md5(secret salt ||
  email)`: stable across sessions, and non-reversible in practice because the
  salt is two random uuids minted WHEN THE MIGRATION IS APPLIED --
  `coin_public_id_secret` has no grant and no policy, so it exists only in
  the database and never in this repo, and a dictionary attack over the
  school's address space has nothing to attack with. Reverse lookup happens
  only inside the SECURITY DEFINER functions.
- **DRAWER DISCLOSURE BOUNDARY, decided deliberately:** the public drawer
  shows name, section, balance, wage tier, transaction history, and whether
  an Eating Pass is CURRENTLY HELD. It does NOT show the strike count -- a
  strike is disciplinary, and "two from losing it" is between the student and
  an admin, so `coin_my_eating_pass_status()` (0072, own-identity only) and
  the coin-desk lookup stay the only places it appears. Do not widen
  `coin_public_student()`.

### What 0089 adds

- **Reads** (all `anon`-granted): `coin_public_leaderboard`,
  `coin_public_transactions`, `coin_public_student(opaque id)`,
  `coin_public_reasons` (the REAL `coin_categories` price list, replacing the
  Apps Script `getReasons`), `coin_public_contracts`, `coin_public_roles`,
  `coin_public_role_questions` (answer key projected away),
  `coin_public_sections`. Plus two `authenticated`-only ones,
  `coin_my_contract_claims` and `coin_me`.
- **The three summary buckets are mapped honestly, not invented:** awarded =
  every positive amount, fines = every negative from a fine-kind category,
  spent = every other negative -- so `awarded - fines - spent` IS the balance
  and the page's own arithmetic stays internally consistent. The legacy
  `Bank Balance` and `Debt` columns were physical-coin bookkeeping with no
  counterpart here: Bank Balance is served EMPTY (the page renders that stat
  only for a positive number, so empty correctly shows nothing) and debt is
  simply the balance being negative.
  **AMENDED BY `0103`, and the amendment is the interesting part:** that
  awarded/spent rule was right while every row was a real event, and `0096`
  made a payout TWO rows -- so both buckets counted coins that only changed
  form. The identity above kept holding the whole time (the inflation
  cancels), which is exactly why nothing looked wrong. Transfers are excluded
  from both now; `Bank Balance` is gone, replaced by explicit
  `Physical Balance` / `Digital Balance` columns. See "The coin display layer"
  below.
  **AMENDED AGAIN BY `0107`, for a reason that was an EXPLOIT rather than an
  untidy number:** "every positive amount" also swept up a REFUND, and
  "every other negative" swept up a CLAWBACK, so an `adjustment`-kind row was
  being counted as earning or spending. Since Lifetime Earned is
  `awarded - fines` and the board's default sort ranks by it, a student could
  buy something, take the refund, and climb. Adjustments are their own bucket
  now and the identity is `awarded - fines - spent + adjustments`. See
  "Adjustments are their own bucket" below.
- **`coin_role_self_apply(p_role_id, p_answers)`** is the ONE write: 0076's
  `coin_role_apply` with the email parameter REMOVED, the
  `coin_contract_self_claim` shape, so "a student can only apply as
  themselves" is a property of the signature rather than a check that could
  be got wrong. Every rule is enforced identically (active role, roster
  section required, one application per currently-held role, answers
  snapshotted with MC correctness computed once at submission) plus a
  `profiles.role = 'student'` requirement. Nothing is loosened. Contract
  claiming needed no new function -- `coin_contract_self_claim` (0077)
  already takes no email.
- **`0087` is honored throughout:** the leaderboard's `Wage` column and the
  drawer's Weekly Pay are the student's own `base x tier` rate, so the hub can
  never contradict what Coin Desk pays.

### The `/api/coin/` layer

A NEW namespace, built beside the legacy proxy routes, which Phase 4 has
since retired. `src/lib/server/coin-public.ts` is the one shaping module and
`/api/coin/public` the one read route, with a hard action allowlist --
the same two-independent-checks discipline the old proxy used. **There is no
service-role client anywhere in this path**: every read runs as the caller's
own (usually anonymous) client, because the no-email boundary is the
database's, not something a route has to remember. Session routes:
`/api/coin/me`, `/api/coin/claim` (GET own claim ids, POST to claim),
`/api/coin/role-apply`, `/api/coin/signin`. The summary and transaction feeds
are emitted as CSV under the EXACT headers the page's own `parseCSV` already
looks for (`Name, Section, Wage, Awarded, Fines, Spent, Coin Balance, Paid
Out, Bank Balance, Debt, Wage Tier, Student Id` / `Date / Time, Name, Amount,
Type, Reason`), so the page edit stayed near-trivial.

### The page's changes

- Endpoint constants swapped; **no Google URL remains in the file**; the
  amber legacy banner removed.
- `SECTION_COLORS` is now a FALLBACK: `coin_sections.color` from
  `action=sections` is merged over it, so a section with no color keeps the
  page's hardcoded one (which is every legacy section id the 2026-08 import
  carried).
- **Contracts tab gained a claim control** -- signed-in students only, through
  the session endpoint, with the real refusals (`full`, `wrong_section`,
  `already_claimed`, `not_open`) rendered inline in the file's own message
  styling and a "You're on this" marker on claimed contracts. **A signed-out
  visitor sees the tab exactly as it rendered before**: no button, no prompt,
  no placeholder. A successful claim re-reads the board rather than guessing,
  since a claim can legitimately lose a race for the last slot.
- **Role modal** rewired to `coin_role_self_apply` with the real question set,
  including the legitimate "no application questions have been set for this
  role yet" state (0076's content-ownership rule: real quiz text is pasted
  into `coin_role_quiz_questions` by hand and never committed here), and the
  copy corrected -- the application fee is 0i&cent; on purpose (0074), so the
  old "costs 1 i&cent;" line is gone.
- **Drawer** gained Wage Tier and Eating Pass within the existing stats
  layout, and its history now comes from the per-student endpoint by opaque
  id rather than filtering the global feed on a display name (which two
  students can legitimately share).

### The homepage is down to TWO coin cards

`portal-apps.ts` carries only **IDEA Coin Ledger** (public, legacy flag and
stale sub copy removed) and **Coin Desk** (admin). The `coin-balance`,
`contracts` and legacy coin-entry cards are gone. `/coin-balance` and `/contracts`
are 308 REDIRECTS to the Ledger and were removed from `authedPrefixes` --
they must be reachable anonymously or the guard would bounce a visitor to `/`
before the redirect. `CoinBalanceView.svelte` and `ContractsView.svelte` are
deliberately KEPT: preview mode mounts them.

### Preview as student (`/coin-desk/preview`)

A per-row "preview as student" link on each `/coin-desk/students` roster row.
**IT IS NOT IMPERSONATION, AND THE DESIGN IS WHAT MAKES THAT TRUE:** no
session is swapped, no token minted, no cookie or header changes who the
caller is. Every read runs as the ADMIN'S OWN session against
`coin_admin_lookup` / `coin_admin_list_contracts` -- the same RPCs the pages
beside it already call -- so it can reveal nothing an admin could not already
see; only the arrangement on screen changed. **If a future change here needs a
session swap, a service-role client, or a new grant, that is the signal it has
stopped being a preview: stop rather than build it.** Writes are absent
structurally: `CoinBalanceView` has no write path at all, and `ContractsView`
takes a new `readOnly` prop that removes every claim control from the markup
AND makes `claimContract` return before it can call anything AND skips the
on-mount refresh (that read is RLS-scoped to the caller, so on this page it
would answer with the ADMIN'S claims under a student's name). Admin gating is
the route group's existing `+layout.server.ts` 404. The screen itself is
`src/lib/coin-desk/StudentPreview.svelte` (the CoinDeskTool convention) so
`/dev/coin-preview` mounts the identical component.

### Verified

- **`tests/coin-public-ledger.test.ts` (19 tests, 0001 + 0003 + 0020 + 0067 +
  0070 + 0072 + 0073 + 0074 + 0076 + 0077 + 0084 + 0087 + 0089 applied
  UNMODIFIED to a real embedded Postgres).** The headline assertion does not
  spot-check a field: it serializes EVERY row of EVERY public RPC under every
  parameter the surface accepts -- including each student's drawer
  individually, the unknown-id path, and an email passed AS the student id --
  and asserts the text contains no address in any form, signed out and signed
  in. It is kept honest by row-count assertions (a leak test over an empty
  result set proves nothing) and by a fixture student whose email has NO
  profile row and NO `coin_students` row, so identity resolution reaches its
  last branch. Also: the opaque id is stable / hex / not a disguised address,
  the salt table is unreadable by anon, authenticated AND an admin, anon may
  execute exactly the eight reads and none of the writes or admin RPCs and
  read none of the seven email-keyed tables, `_coin_public_roster` is
  reachable by nobody, the drawer emits `eating_pass_held` while a REAL strike
  exists (verified against `coin_eating_pass_strikes`) and no key anywhere
  carries the count, the leaderboard's tier-aware wage equals what a real
  `coin_log_transaction('weekly_wage')` actually paid (read from the RPC, not
  computed here), and `coin_role_self_apply` applies as the caller only,
  snapshots MC correctness both ways, succeeds on a role with ZERO questions,
  and refuses a teacher / an unrostered student / an unknown role / a
  duplicate held role. **MUTATION-CHECKED BOTH WAYS:** leaking the email
  through the identity fallback reddens 2 tests, opening the
  `coin_transactions` and salt grants reddens 2 others; migration restored
  byte-identical. `npm run check` 0 errors, 0 new warnings; `npm test`
  370/370.
- **Browser-verified** through `/dev/coins` (404 in production, no auth, no
  Supabase, no Google), which serves the REAL `static/coins/index.html`
  byte-for-byte with one substitution (`/api/coin/` -> `/dev/coins/api/`) and
  answers from fixture rows fed through the REAL `readCoinPublic`, so the CSV
  headers, date formatting, contract mapping and role grouping are produced
  by the shipping code. Signed out: every tab renders, no claim control, no
  "you're on this" marker, the role modal offers sign-in, and the reasons
  guide renders all three sections with real prices. Signed in: all 10
  leaderboard sorts order correctly, the name and type filters and the 2-page
  pagination and the column sort all work, analytics reads its weekly
  comparison and a correctly-SIGNED type breakdown, the drawer opens with
  Wage Tier / Eating Pass / the server's section color and a balance that
  reconciles (214 - 19 - 40 = 155), an in-debt student shows Debt and no
  Eating Pass row and no Bank Bal row anywhere, a real click claimed a
  contract (Open -> In Progress, marker added, button gone, contractor named)
  and a section-restricted one rendered the real `wrong_section` refusal, and
  the role modal loaded the real questions, gated submit until answered, and
  posted `question_id` + `selected_option_index`. **Payload check:** every
  public response fetched in the browser contains not one `@` character.
  375px width, no horizontal overflow, 44px claim target, zero window errors
  throughout. Preview mode verified in `/dev/coin-preview`: sticky banner,
  picker, both student components rendering real data, and **zero buttons on
  the entire page**. Signed-out probes: `/coin-balance` and `/contracts` 308
  to the Ledger, `/coin-desk/preview` 404s, an unknown action 400s,
  `/api/coin/claim` and `/api/coin/role-apply` both 401.
- **TWO REAL BUGS found in the browser, neither visible to `svelte-check`:**
  (1) the role modal's MC radios carried the option TEXT as their value, so
  `parseInt` gave NaN and every multiple-choice answer posted
  `selected_option_index: null` -- the server would have refused every MC
  application with "Missing an answer"; the value is the option INDEX now.
  (2) a failed read answers with a JSON error body, which `parseCSV` happily
  turned into a nonsense row while the page stamped a fresh "Last updated"
  over an empty board -- `fetchData` checks `res.ok` now and a real outage
  reads as one.
- **NOT verified: the live Supabase project.** Same placeholder-`.env` caveat
  as every other coin-economy migration -- 0089 has never been applied
  anywhere, and the signed-in round trip (a real claim, a real role
  application, the admin preview) needs a real session. Apply 0089 by hand
  after 0088, then spot-check with two real accounts that the drawer carries
  no strike count and that a student can only claim and apply as themselves.

