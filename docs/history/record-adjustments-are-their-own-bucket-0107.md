---
title: "Adjustments are their own bucket (`0107`)"
date: 2026-08-14
branches: []
migrations: ["0107"]
subsystems: ["IDEA Coin economy"]
record_order: 14
---

Migration `0107_coin_public_adjustment_bucket.sql` (apply manually after
`0106`) plus a scoped edit to `static/coins/index.html`. It changes NO stored
data and NO write path: one read function, the CSV layer above it, and how the
page renders and reconciles.

**FREEZE NOTE: a fifth deliberate, scoped lift of the legacy-HTML freeze on
`static/coins/index.html`,** covering exactly the aggregation, the Adjustments
figure, and the stale URLs below. Its visual design is correct and unchanged.

### THIS WAS AN EXPLOIT, NOT AN UNTIDY NUMBER

`0089` bucketed EVERY positive row into `awarded`, so a REFUND counted as an
earning -- and the Ledger's "Lifetime Earned" headline is `awarded - fines`,
which the board's **default sort ranks by**. Buy something, take the refund
back, climb the board. Repeatably. Measured in production: Seth Delgadillo was
awarded 111i¢ and read **151**; Ezio Veneziano was awarded 57 and read **107**.

The mirror case is the same bug with the sign flipped: a NEGATIVE adjustment
fell into `spent`, because that bucket was "any negative that is not a fine",
so a clawback read as a purchase.

**And it hid the same way `0103`'s transfer bug did.** A refund and the
purchase it reverses net to zero in the balance, so `awarded - fines - spent`
still landed on the right total with two components wrong -- the arithmetic a
reader would check it with agreed with the inflated numbers. That is now twice
this exact failure mode has surfaced on this page; when adding a bucket, ask
what a row MEANS, not what sign it carries.

### The rule

An `adjustment`-kind row is excluded from `awarded` AND from `spent`
**regardless of its sign**, and its signed amount is summed into a new
`adjustments` column. The identity becomes:

```
balance = awarded - fines - spent + adjustments
```

and Lifetime Earned stays `awarded - fines`, which now excludes adjustments
entirely -- the whole point.

- **LEGACY WEALTH DECLARATIONS DELIBERATELY STILL COUNT toward Lifetime
  Earned.** They are `legacy_award` rows (kind `award`) recording coins a
  student genuinely earned before this system existed. **Only kind
  `adjustment` moved.** Delgadillo's 111 includes 80i¢ of declarations, so a
  sweep that took them too would drop his headline to 31; a test pins it.
- `fines` is untouched (an adjustment is never fine-kind, so that filter
  already excluded them). `balance` is untouched -- it is the sum of
  everything and always was.

### THE TWO EXCLUSIONS COMPOSE; NEITHER REPLACES THE OTHER

`0103`'s transfer exclusion is untouched and still applies. They answer
different questions: a transfer is coins **changing form**, an adjustment is
the record being **corrected**. So the new bucket carries `transfer_id is null`
too -- **without it a live payout's physical half
(`payout_physical_credit`, kind `adjustment`) would land in `adjustments` and
re-inflate in a new column exactly the figure `0103` deflated.** That is the
trap this migration had to avoid, and it has its own test.

### One computation site, on purpose

`coin_public_leaderboard` is the ONLY place these buckets are computed.
`coin_public_student` (the drawer) does not compute them and deliberately still
does not: **the drawer renders the same leaderboard row the card does**, and
calls the per-student endpoint only for the eating-pass flag and the history.
So the two surfaces cannot disagree by construction. Giving the drawer its own
copy of the bucket rule would be precisely the drift this exists to end.

Client-side, the fallback identity (used only against a feed that predates the
column) gained `+ adjustments` at both its sites -- the leaderboard card and
the drawer.

### Display

`Adjustments` renders as its own figure on the drawer stat cards and the
leaderboard card meta row, in the **violet** (`--violet: #B47CFF`) already
assigned to the Adjustment type on the transaction rows, so the figure and the
rows it sums agree by sight. **Shown only when nonzero**, so the common case
stays uncluttered. Nothing else on either surface was restyled.

### The Ledger's own navigation was 404ing, and the cause was NOT only the page

`static/coins/index.html` still carried GitHub Pages base-path URLs. All are
repointed at this app's real routes, each verified against a running dev
server rather than assumed:

- logo and **Portal** -> `/`; **Coins** -> `/coins/index.html` (the explicit
  index, because the Vite dev server does not resolve a bare directory to it).
- The printed **QR caption** is now filled from `LEADERBOARD_URL` when the code
  renders, so the caption can never again name a different address than the QR
  encodes -- which is exactly how it came to advertise a dead GitHub Pages URL
  while the code itself was correct.
- The footer's `mrpina-dev.github.io/IDEA` reads `ideabosco.com`.
- **The favicon `/IDEA/android-chrome-512x512.png` was NOT stale and is left
  alone** -- it is the live `static/IDEA/` mirror, serves 200, and is the exact
  path `src/app.html` uses for the whole portal. Changing it would have made
  the Ledger diverge from the rest of the site for no gain.

**A REAL BUG IN `hooks.server.ts` FOUND WHILE VERIFYING, and fixed:** its
legacy redirect map was keyed on the WITH-SLASH paths (`'/IDEA/'`), but
**SvelteKit normalizes `/IDEA/` to `/IDEA` and redirects BEFORE any hook
runs**, so the map could never match. Measured: `/IDEA/` -> `/IDEA` -> **404**,
and `/IDEA/coins/` -> `/coins/` -> `/coins` -> **404**. So the redirects
CLAUDE.md has documented as working since Phase 2 have never fired. They are
keyed without the trailing slash now (and the handler strips one either way, so
both spellings work), targets carry the explicit `index.html`, and the mirrored
icons still serve directly rather than being shadowed. This matters beyond this
page: printed material outside this repo still carries those paths.

### Verified

- **`tests/coin-public-adjustments.test.ts` (12 tests), and THE FIXTURE IS THE
  REAL ARCHIVED DATA** -- the `coin-legacy-reimport` convention, for the same
  reason. `docs/coin-economy/archive/2026-08-11-*.csv` is imported through the
  REAL `0100` RPC, then the three refunds from that migration's own remediation
  runbook are logged through the REAL `coin_admin_adjust_balance`. So the rows
  these buckets are computed over have production's actual shapes -- legacy
  awards, held awards, payout transfers, live adjustments -- rather than shapes
  invented to make the assertions come out.
- **All six figures asserted for each of the three students production was
  measured on**, so a bucket that gained what another lost cannot pass:
  Delgadillo `111 / 0 / 44 / +40 / 107 / 111`, Veneziano `57 / 0 / 62 / +50 /
  45 / 57`, and **Chavarria `27 / 13 / 12 / 0 / 2 / 14` as THE CONTROL** -- he
  has a withdrawal and no adjustment, so he proves `0103`'s exclusion still
  holds and that these assertions are not just "the column is always zero".
  Plus the identity across all 60 rows, a NEGATIVE adjustment landing in the
  new bucket rather than in `spent`, a withdrawal on top of a refund leaving
  every bucket untouched, and the declarations rule.
  **ONE FIGURE IN THE BRIEF WAS A TYPO and is asserted as the stated rule
  gives it:** Veneziano's Lifetime Earned is `57 - 0 = 57`, not 7 (the pre-fix
  reading was 107 = 57 + the 50 refund).
- **MUTATION-CHECKED THREE WAYS.** Reproducing the pre-`0107` bucketing reddens
  **6** tests including both headline students; keying the new bucket on kind
  alone (dropping the transfer guard) reddens exactly the compose test; a
  half-fix that leaves negative adjustments in `spent` reddens exactly the
  clawback test. Migration restored byte-identical (md5-checked) each time.
- **A PRE-EXISTING FLAKE FOUND AND FIXED** in `coin-public-ledger.test.ts`:
  `student_id` is `md5(random salt || email)`, i.e. 16 uniformly random bytes,
  and the suite decoded them as UTF-8 and asserted no `'@'` -- which trips
  whenever any byte is `0x40`, about **6% of runs**, on a salt regenerated
  every apply. Reproduced, then rewritten to look for the ADDRESS (in
  byte-preserving latin1, since utf8 mangles invalid sequences to U+FFFD)
  rather than for one character; four consecutive fresh-salt runs green.
  Unrelated to this change -- that suite's chain contains neither `0103` nor
  `0107`.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **843/843 across 37 files** (was 831/36).
- **Browser-verified** against the dev server through `/dev/coins`, which
  serves the REAL page byte-for-byte with only its endpoints repointed. The
  fixture carries a POSITIVE adjustment (Ada, who also has a withdrawal), a
  NEGATIVE one (Grace) and NONE (Joseph), so all three states render at once.
  **Card and drawer agree figure for figure** on all three -- Ada `Awarded 174
  / Spent 40 / Adjustments +40 / Lifetime 155 / Balance 155`, Grace `88 / 135 /
  -15 / 76 / -74` -- with Adjustments measuring `rgb(180, 124, 255)` (the
  Adjustment type's own violet) on both surfaces, and **Joseph showing no
  Adjustments figure on either**. The CSV carries the new column through the
  real shaping layer; the identity holds on screen for both students; the
  transaction rows and the analytics breakdown (`Adjustment 2 / +25`) are
  unchanged and still agree with the rows above them. All three header links
  and the favicon fetch **200**, the QR caption reads
  `https://ideabosco.com/coins/index.html` with the code rendered, and all four
  tabs render with **zero console errors and zero trapped window errors**.
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so `0107` has never been applied anywhere.
  **Apply it by hand after `0106` BEFORE deploying** (the page reads
  `Adjustments`; without the migration it renders no Adjustments figure and
  falls back to the pre-`0107` identity -- degraded, not broken), then check
  Delgadillo and Veneziano: their Lifetime Earned should DROP by 40 and 50. The
  Chrome extension was unavailable this session, so the visual claims above are
  measured computed-style and DOM reads, not an eyeball.

