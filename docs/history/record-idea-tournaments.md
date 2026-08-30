---
title: "IDEA Tournaments"
date: 2026-08-05
branches: []
migrations: ["0061", "0062", "0063", "0064", "0065", "0066"]
subsystems: ["Tournaments"]
record_order: 22
---

Phase 1 of the tournament subsystem (migration `0062_tournaments.sql`, apply
manually after 0061): registration through a live, fully PUBLIC, host-run
double-elimination bracket with optional head-to-head qualifying pools. No
notifications, rewards, or banner customization yet; those are later phases.

- **Access model:** every tournament table is PUBLIC-SELECT to anon AND
  authenticated; the live bracket is a spectator surface with no login.
  `/tournaments` is deliberately NOT in `authedPrefixes`. `/tournaments/new`
  (session required) and `/tournaments/[id]/host` (a `tournament_hosts` row
  required) gate themselves in their own `+page.server.ts` (the
  role-gated-load pattern, `/dashboard`), redirecting non-hosts to the public view; that gating is
  convenience only, the RPCs are the boundary. There is NO client write path
  anywhere (no insert/update/delete grant or policy): every mutation is a
  SECURITY DEFINER `tournament_*` RPC that re-checks the caller server-side
  (host row, invited user, or self). Any signed-in user can create a
  tournament (they become its `creator` host; hosts add co-hosts and send
  invites by account email, resolved server-side against `profiles`).
- **Identity rule (hard):** a participant's public identity is
  `tournament_entries.display_name` + `thumbnail_url`, chosen at
  registration (uploads go to the public `tournament-thumbs` bucket,
  own-`<uid>/`-folder writes, the avatars pattern). No surface, INCLUDING the
  host console, ever shows a Google account name or avatar for a
  participant; invitees and co-hosts render as opaque id fragments only.
- **Naming:** the spec's bare names are prefixed to the repo convention:
  tables `tournaments`, `tournament_hosts`, `tournament_entries`,
  `tournament_invites`, `tournament_qual_pools`, `tournament_qual_matches`,
  `tournament_bracket_matches`, `tournament_match_games`,
  `tournament_match_events`; the RPCs are `tournament_create`, `_update`,
  `_set_status`, `_add_host`, `_register_entry`, `_host_add_entry`,
  `_remove_entry`, `_send_invite`, `_respond_invite`, `_shuffle_seeds`,
  `_reorder_seed`, `_generate_qual_pools`, `_submit_qual_result`,
  `_generate_bracket`, `_start_match`, `_submit_match_result`,
  `_correct_match_result` (internal `_tournament_*` helpers carry no grants).
- **Format config** (`tournaments.config` jsonb, normalized + validated
  server-side): `quals_enabled`, `score_entry` (per-game scores vs win/loss
  only), `best_of_default`, and a `best_of` override map keyed `'winners' |
  'losers' | 'grand_final' | 'winners:<round>' | 'losers:<round>'` (odd,
  1..15). Each match's `best_of` is stamped at generation
  (specific-round > bracket > default; the reset inherits the grand
  final's); config locks once the bracket exists.
- **Lifecycle:** draft -> registration_open <-> seeding -> live -> complete.
  Self-registration only while registration_open (one entry per account);
  host walk-up adds (linked or unlinked) and invite ACCEPTS also work during
  seeding. Seeds shuffle/reorder during pre-live states and lock at
  `tournament_generate_bracket`, which stamps the final order, logs it, and
  sets live; grand-final (or reset) completion sets complete +
  `champion_entry_id`.
- **Quals:** `tournament_generate_qual_pools` snake-drafts the seeded field
  (pool 1 takes seed 1, direction alternating per pass) and builds each
  pool's circle-method round robin; regeneration is allowed until a result
  is recorded. At generate_bracket, standings become seeds: pool position by
  wins -> two-way head-to-head -> point differential -> a LOGGED random
  draw; across pools by position -> win percentage -> differential -> logged
  random draw (h2h cannot apply across pools). The draws log as 'seeded'
  events, the one extension to the spec's event-type list.
- **Bracket model:** P = next power of two over N (2..128 entries), standard
  1-vs-P recursive seeding; losers bracket has 2(R-1) rounds (minor 2k-1 /
  major 2k, each P/2^(k+1) matches; winners-drop slots reverse on even
  winners rounds to delay rematches); `grand_final_reset` is created ONLY
  when the losers-bracket finalist wins the first grand final. N=2 has no
  losers bracket (the final's loser drops straight to the grand final).
  Matches carry explicit `winner_to_match_id/pos` + `loser_to_match_id/pos`
  pointers wired once at generation, so advancement and correction never
  re-derive topology. BYES: a slot is DEAD when it is empty and no
  non-complete match feeds it; one live + one dead side auto-completes as a
  bye, dead + dead completes with a null winner, and the resolver loops to a
  fixed point at generation and after every result. The resolver MUST
  re-read each row inside its pass: judging off the stale cursor row
  dead-completes a match that just received two adjacent byes' winners
  (found by the integration test, not by review).
- **Corrections:** `tournament_correct_match_result` (reason required,
  logged) BLOCKS with a clear error when a downstream match holding this
  match's winner or loser is in_progress or completed from an entered
  result, and when the grand-final reset already has a recorded result.
  Downstream BYE auto-completions are derived state, so they are unwound and
  re-derived instead of blocking (strict blocking would make nearly every
  early correction in a non-power-of-two field impossible). Grand-final
  corrections delete/recreate the pending reset and re-derive
  champion/status both directions.
- **Audit:** `tournament_match_events` is append-only (created / checked_in /
  started / completed / corrected / seeded; match_kind 'bracket' | 'qual' |
  null for tournament-level rows), written from Phase 1 because it cannot be
  reconstructed retroactively; the public analytics view is a later phase.
- **Realtime:** tournaments, entries, qual pools/matches, bracket matches,
  and match games are in `supabase_realtime`; the public and host pages
  subscribe filtered on `tournament_id` (`tournament_match_games` carries a
  denormalized `tournament_id` for exactly this) and refetch debounced. RLS
  is public-select, so signed-out spectators receive the stream too.
- **Client:** `src/lib/tournaments/tournaments.ts` (row types + pure display
  helpers; the client-side pool standings are display-only, the server
  ranking is authoritative) and the presentation-only `EntryChip` /
  `BracketView` / `PoolsView` / `ResultForm` components. Routes:
  `/tournaments` (public list + own pending invites), `/tournaments/new`,
  `/tournaments/[id]` (public live view + registration / invite accept +
  thumbnail upload), `/tournaments/[id]/host` (console: phase moves, pool
  generation, entries + seeding, invites + co-hosts, qual results, match
  start/submit/correct). Launcher card in `portal-apps.ts` (
  public) and app `tournaments` in `site-manifest.ts`.
- **Verified:** the migration file was applied UNMODIFIED to a real embedded
  Postgres (Supabase-shaped auth/storage/publication stubs) and
  integration-tested end to end: 161 assertions covering the full
  acceptance flow on a 6-entry qualifying tournament (registration, invites
  accept/decline/re-invite, snake pools, standings-driven seeding, byes in
  the right slots, bye-unwinding and blocked corrections, the grand-final
  reset both directions, champion), privilege checks (anon reads
  everything, every direct client write denied, anon cannot call RPCs), and
  randomized full-bracket sweeps at N = 2..17, 21, 27, 33, 48, 64 asserting
  the double-elimination loss invariant (every non-champion loses exactly
  twice). The UI was browser-verified through `/dev/tournaments` (404 in
  production, no auth/Supabase: an in-memory simulator mirroring the SQL
  rules drives the REAL components). NOT verified: the live Supabase
  project (the local `.env` is placeholder-only) — apply 0062 by hand in
  the SQL editor and re-run the realtime + OAuth acceptance checks there.
- **Phase 2a (migration `0063_tournament_push_rewards.sql`, apply manually
  after 0062): registration QR + web push match alerts + the reward engine
  and permanent ledger.**
  - **QR:** the public `/tournaments/[id]` view renders a client-side QR of
    its own URL while `registration_open` (`TournamentQr.svelte`, the
    `qrcode` npm package dynamic-imported browser-only — never an external
    image service), with a full-screen white-sheet "Present" mode for a shop
    TV or printout (Esc closes, print CSS strips chrome).
  - **Web push.** `push_subscriptions` (PORTAL-WIDE, unprefixed like
    `profiles`; endpoint text PK so a device re-signing-in reassigns its row)
    holds one row per browser subscription; own-row SELECT only, writes only
    via the `push_subscribe` RPC (signed-in, https-endpoint + length checks,
    20-device cap per account). The Web Push SEND cannot run in Postgres
    (VAPID signing + payload encryption), so the split is: SQL owns WHO
    (subscriptions + authorization), `src/lib/server/push.ts` owns the SEND
    (`web-push`, service-role reads, silent failure by design; 404/410 Gone
    prunes the dead row). Keys: `PUBLIC_VAPID_PUBLIC_KEY` +
    `VAPID_PRIVATE_KEY` (+ optional `VAPID_SUBJECT`), see Environment;
    unconfigured = alerts UI hides, sends no-op. The service worker is
    `static/push-sw.js`, the repo's FIRST service worker: push +
    notificationclick handlers ONLY, deliberately NO fetch handler so it can
    never grow caching/offline behavior; `manifest.webmanifest` predates it
    and is untouched. Client flow: `MatchAlerts.svelte` on the public
    tournament page (signed-in competitors, not complete) via
    `push-client.ts` (permission -> SW -> subscribe -> RPC, device label
    like "Windows · Chrome").
  - **The pairing trigger** is the SvelteKit server route
    `/api/tournament-push` WRAPPING the three RPCs that can newly pair a
    bracket match (`generate-bracket`, `submit-result`, `correct-result`) —
    chosen over a Database Webhook / pg_net because the send needs the
    server-only VAPID key + Node crypto and this repo's idiom for
    server-triggered side effects is SvelteKit routes (no Edge Function
    surface). The RPC runs under the caller's OWN cookie session (host
    authorization unchanged); after it commits, `sweepPairNotifications`
    atomically CLAIMS newly-paired matches (one UPDATE ... WHERE
    `pair_notified_at IS NULL`, the new claim column on
    `tournament_bracket_matches`, so concurrent sweeps never double-send)
    and pushes both linked competitors "your next match is set". A
    correction's unwind clears the claim via `_tournament_set_slot` (0063
    recreation), so a re-derived pairing re-notifies. Push failures can
    never fail the committed mutation. The host console routes those three
    calls through the endpoint (`callPush`); every other RPC stays a direct
    browser call. `tournament_ping_entry(match, entry)` is the ping's
    authorization + target-resolution half (host-only, entry must be in the
    match and linked, NO match-state check by design); the endpoint's
    `ping` action does the send. Per-participant "ping" buttons sit on the
    host console's ready/in-progress matches.
  - **Reward engine.** `tournament_reward_rules` (win / round_reached /
    placement + amount, one rule per trigger, host-edited via
    `tournament_set_reward_rules` full-set replacement, locked once
    complete) and the INSERT-ONLY `tournament_reward_ledger` (entry,
    user_id copied at award time, amount, short reason, match_id, stamp; no
    update/delete path at all — a permanent record). Both public-select +
    realtime-published; the public page shows rules chips, per-entry
    totals, and full history (`RewardsPanel.svelte`), the host console
    edits rules (`RewardRulesEditor.svelte`). Hook placement follows what
    0062 actually ships: win + round-bonus rows are inserted in
    `tournament_submit_match_result` (ONLY entered results pay — byes and
    corrections never mint or claw back rows), and placements settle inside
    `_tournament_complete_match` on its two tournament-completing branches,
    because `tournament_set_status` NEVER moves a tournament to complete.
    Semantics: `round_reached` matches the won match's own round, WINNERS
    BRACKET ONLY (the grand final is round 1 of its own bracket and losers
    rounds are numbered differently, so raw cross-bracket matching would
    misfire); placements settle ONCE per tournament (guarded by the
    existence of null-match_id rows), champion + runner-up from the
    deciding grand final (or reset), third = the loser of the losers final;
    N=2 has no third. A post-completion correction changes the champion but
    deliberately not the settled ledger.
  - **Verified:** 0062+0063 applied UNMODIFIED to a real embedded Postgres
    (same stub approach as Phase 1) and integration-tested with 48
    assertions: rule validation + atomic replacement + host gating, the
    sweep claim (exact initial pairings, idempotent repeat, re-claim after
    a correction's unwind), a scripted 6-entry bracket through the
    grand-final reset asserting every ledger row (11 wins + 2 winners-r2
    bonuses + 3 placements, per-entry totals, byes pay nothing, losers-r2
    pays no round bonus, corrections mint nothing, user_id copied), the
    N=2 no-third-place settlement, rules locked after completion, and the
    anon boundary (reads ledger/rules, cannot write or call any new RPC;
    push_subscribe upsert/reassign/RLS/https checks; ping target
    resolution + unlinked/non-host refusals). Browser-verified via
    `/dev/tournaments` (sim now mirrors the reward semantics and mounts the
    REAL RewardRulesEditor/RewardsPanel/TournamentQr; full play-through
    with correct payouts, QR painted at both sizes, present overlay + Esc)
    plus live checks that `/push-sw.js` serves + registers with no fetch
    handler and `/api/tournament-push` answers 401 signed-out. NOT
    verifiable here: a real push arriving (the embedded pane auto-denies
    notification permission) — enable alerts on a real signed-in device and
    submit a pairing result, or use ping.
- **Phase 2b (migration `0064_tournament_entry_styles.sql`, apply manually
  after 0063): per-entry banner customization + TV mode.**
  - **System chrome vs. entry content — the split this phase rests on.**
    `src/lib/tournaments/tournaments-theme.css` (scoped `.tnm-root`, the
    `.frc-root` / `.glb` convention) holds the FEATURE'S OWN palette:
    emerald `#0FBE7A`, base `#0E1412`, panel `#16211C`, gold `#E0AC4E`
    (placement and rank ONLY), ink `#EDEDE8`. **Restraint is a hard rule:
    at most ONE dominant emerald element per screen** — the active-match
    indicator, the primary action, or one key status; a third or fourth
    surface takes `--tnm-panel` instead. Per-entry styles are a SEPARATE
    palette the students own, never constrained by these tokens. The
    existing Phase 1 pages keep their portal-green look; only the NEW
    chrome (TV mode, the banner editor) adopts `.tnm-root`.
  - **Data (`tournament_entry_styles`):** one optional row per entry
    (`entry_id` PK, denormalized `tournament_id` for the realtime filter),
    holding `background_type` (solid / gradient / image) + `background_value`
    (**jsonb**: a hex string, a two-hex array, or an https URL — the shape
    follows the type, and a CHECK ties the two null-together),
    `accent_color`, `badge`, `flourish`, `tagline`. Public-select to anon +
    authenticated, ZERO client write path, realtime-published. The badge and
    flourish allowlists live as CHECK constraints (the DB is the authority;
    `entry-styles.ts` mirrors them for label + artwork — edit both together).
    **Absent row = the Phase 1 default treatment**, which is what every
    entry looks like until its owner customizes it.
  - **`tournament_set_entry_style`** is the only writer: FULL REPLACEMENT
    (the `tournament_set_reward_rules` convention), and an all-empty call
    DELETES the row — that is the reset. Authorization is deliberately
    asymmetric: the entry's own linked user, OR a host **but only for an
    UNLINKED walk-up** (`user_id is null`). A host cannot restyle a
    registered player's banner; it is that player's identity, and the host
    already controls seeding, matches and removal. Background art reuses the
    EXISTING public `tournament-thumbs` bucket (same visibility, same
    own-`<uid>/`-folder rule) rather than adding a second bucket to keep in
    sync.
  - **Accent palette, deliberately not green-dominated** (`ACCENT_PRESETS`,
    measured hues): red 358°, orange 23°, gold 41°, emerald 157°, cyan 180°,
    blue 221°, violet 261°, pink 330° — emerald is ONE of eight, and a new
    entry starts with **no accent at all** (falls back to the neutral
    `#8a938c`), never pre-selected to emerald. A freeform `<input
    type="color">` sits beside the presets.
  - **Two render scales, one style.** `EntryChip` (bracket nodes, host rows)
    applies the accent rule, accent thumbnail ring, badge and a **0.22
    opacity wash** of the background — faint on purpose, because a chip
    lives in dense rows where the name must stay the most legible thing.
    `EntryBanner` (entries list, live match view, TV, editor preview) is the
    full-strength version: background, tagline, flourishes, sizes
    `sm|md|lg|xl`. Ink flips to dark over a light custom background by
    measured luminance (`bannerInk`), and an IMAGE background always gets
    light ink plus a scrim since the art is unknown.
  - **Flourishes are cosmetic only** and never encode match state. AMBIENT
    (`glow-pulse`, `particle-trail`) render continuously; EVENT
    (`confetti-on-win`, `screen-shake-on-elimination`) are one-shots a
    surface plays at a moment it already knows about, via `EntryBanner`'s
    `event` prop, and only for an entry that OPTED IN. Every animation is
    off under `prefers-reduced-motion` (containers `display: none`).
  - **TV mode `/tournaments/[id]/tv`:** public and session-blind (no guard,
    and `/tournaments` must stay out of `authedPrefixes`). `TvStage.svelte`
    owns everything visual so the dev harness drives the identical component
    with no backend; the route owns only the load + the realtime channel
    (the same subscription shape the public live view uses — **no polling**).
    Five self-advancing states: `register` (large QR + roster), `match`
    (single live pairing at `xl`; rotates every 12s if several are live),
    `result` (a 13s beat on a newly-decided match, where the event
    flourishes get their moment), `champion` (gold, zero emerald), and
    `between` (next-up pairings + QR). **A BYE is skipped by the result
    beat** — it completes at generation with an empty side, so celebrating
    it would park the projector on a match nobody played. The loser reads
    "Eliminated" only when `loser_to_match_id is null` (0062's own rule),
    else "Drops to losers". **Deliberately NOT the dense bracket grid:** a
    16-node bracket on one screen is unreadable across a room, so TV mode
    shows who is playing now and who is up next. `TournamentQr` gained
    `variant="panel"`, the same white-sheet present-mode treatment inline,
    because a screen with no interactive chrome cannot open a modal.
  - **Verified** in `/dev/tournaments` (the sim now carries sample styles
    covering all three background types, all four flourishes and unstyled
    entries side by side, and mounts the REAL EntryStyleEditor + TvStage):
    a save propagates to the bracket chip, the banner grid and the TV stage
    in one pass, and Reset returns all three to the default treatment; an
    unstyled entry seeds the editor with "No accent" selected, not emerald;
    the light-background entry flips to dark ink (`rgb(14,20,18)`) while
    dark ones stay light; confetti fired 14 pieces on a real
    `confetti-on-win` winner and 0 on a winner who had not opted in, and the
    shake fired (0.55s x 3) on a real `screen-shake-on-elimination` loser in
    Losers Round 2 while a winners-round loser correctly read "Drops to
    losers"; every animated selector has a matching reduced-motion override;
    and at a 1920x1080 projector scale the type measures 147px names / 69px
    title / 42px LIVE / 28px smallest, with **0 links, buttons or inputs**
    anywhere in the stage. Emerald audit per state (excluding entries' own
    palettes): register 1, live 1, result 1, between 1, champion 0 — and
    zero emerald SURFACES in any state. **NOT verified:** the live Supabase
    project (the local `.env` is placeholder-only) — apply 0064 by hand and
    re-check the owner-vs-host RPC boundary and the signed-in editor
    round-trip there.
- **Phase 3a (migration `0065_tournament_forfeits.sql`, apply manually
    after 0064): match + entry detail pages, tournament-level timing stats,
    and forfeit / no-show handling.**
  - **The detail pages and the stats needed NO schema at all.** Every figure
    is derived from what Phase 1 already captured: the append-only
    `tournament_match_events` stream plus `started_at` / `completed_at` on
    the match row. A tournament that ran before this phase existed reports
    the same numbers as one that runs after it. `0065` exists only for the
    forfeit path.
  - **Detail routes, both fully PUBLIC (no session, no guard, reads only,
    the whole Phase 1 access model unchanged):** `/tournaments/[id]/match/
    [matchId]` serves BOTH match kinds — a bracket and a qual match live in
    different tables with disjoint uuid spaces, so the id is looked up in
    the bracket first and falls through to quals — and
    `/tournaments/[id]/entry/[entryId]`. Each route owns ONLY its load and
    its realtime channel; everything visual lives in
    `MatchDetail.svelte` / `EntryDetail.svelte` (the TvStage convention), so
    `/dev/tournaments` drives the identical components with no backend.
  - **Match detail** shows WAIT (created -> started: how long the pairing
    sat before it was called) and DURATION (started -> completed), the games
    or the qual score, the corrections (each rendered as *what changed* —
    "Winner changed from X to Y" plus the logged reason), the full event
    log with per-event offsets, the rewards this match paid, and where each
    side advanced to. **A figure that genuinely does not exist reads as a
    dash with its reason, never as zero:** a qual match is never "started"
    ("qualifying matches are recorded, never started") and a no-show
    forfeit usually never started either ("this match was never started").
  - **Entry detail** shows the record, every match with a link to its own
    detail page, and the reward ledger with a running total. The entry
    renders in its OWN 0064 style at the two established scales
    (EntryBanner full-strength in the header, EntryChip with the faint wash
    in the dense match rows) — neither rule re-implemented.
    **`matchScorelineFor(m, games, entryId)`** is new and load-bearing: the
    bracket's A-first `matchScoreline` printed "4–10" beside the word
    "Won" for an entry sitting on side B, so an entry-scoped list orients
    the pair to that entry. `matchScoreline` stays A-first for the bracket
    and the TV stage, which show both sides in order.
  - **Record semantics:** a BYE is excluded from the win/loss line (an
    advancement the bracket's shape handed over, not a result) and counted
    separately; a FORFEIT IS included (it really did advance one side and
    eliminate the other) and is ALSO reported separately, so the record can
    be read honestly. Qualifying is its own line, labelled seeding-only.
  - **Tournament stats** (`TournamentStats.svelte`, on the existing public
    page directly UNDER the bracket): average match duration, event span,
    fastest and slowest match linking to their detail pages. Duration
    figures count only contested, timed matches — averaging in a bye or a
    forfeit would report an event running faster than it did — while the
    SPAN is deliberately wider (wall clock, so a forfeit that ended the
    event still closes the window) with byes out of it entirely, since they
    complete the instant the bracket is generated. Restraint: a muted
    `--dim` label where every other section on that page is green, compact
    neutral cells, no accent surface, and it renders nothing at all until a
    match has been timed. The bracket stays the attraction.
  - **Forfeit: four rules, each mirroring how a BYE already behaves,
    because neither is a contested win.** (1) It ADVANCES through the same
    `_tournament_complete_match` every other outcome uses — no parallel
    advancement code, so pointers, elimination, the grand-final reset,
    champion settlement and the bye resolver are all unchanged. (2) It PAYS
    NOTHING, and the mechanism is the EXISTING one named rather than a
    second skip: the reward block was lifted verbatim out of the 0063 hook
    into `_tournament_award_match_win`, which is now called from the ONE
    contested-result branch; byes never reach that function and forfeits
    take the other branch, so both are covered by the same rule. (3) It
    writes NO `tournament_match_games` rows. (4) It logs as a `completed`
    event with metadata `{ forfeit, reason, forfeited_by }` — exactly the
    way a bye logs `{ bye: true }` — and NO new `event_type` value.
  - **Entry point is `tournament_submit_match_result`, extended not
    duplicated** (same name, signature and grant), because a forfeit IS a
    match result — it just carries `{ forfeit: true, winner_id, reason }`
    instead of games. Unlike a normal result it is accepted on a PENDING
    match: a no-show is usually spotted before anyone starts the clock, and
    requiring a start would fabricate a `started_at`. It therefore leaves
    `started_at` exactly as it found it, which keeps the timeline honest
    and keeps forfeits out of the duration statistics for free.
  - **`tournament_bracket_matches.forfeit` / `forfeit_reason` are not
    redundant with the event.** A bye is distinguishable from the ROW alone
    (an empty slot), and every surface that lists results — the bracket, the
    host console, the TV stage — reads rows, never the audit stream. The
    flag is what lets those surfaces mark a forfeit without loading it.
    Rendered as: a dashed gold frame + `FF` chip (reason in the tooltip) on
    the bracket node, "by forfeit" on the host console's completed row,
    "Won/Lost by forfeit" with the scoreline suppressed on entry detail, a
    gold FORFEIT state chip on match detail, and a gold "By forfeit ·
    reason" line replacing the (absent) scoreline on the TV result beat —
    which a forfeit still gets, since it is a real elimination, but is
    never shown as a played result.
  - **A correction clears the flag**, because a corrected outcome runs
    `_tournament_write_games` and is therefore a played result; the
    `corrected` event carries `previous_forfeit` so the match detail says
    "(replaced a forfeit with a played result)". Corrections still mint no
    reward row (0063's permanent-ledger stance, unchanged).
  - **Host console:** a gold `forfeit` action on both ready-to-start and
    in-progress matches opening `ForfeitForm.svelte` — deliberately a
    separate panel, not a mode of ResultForm, so "nobody turned up" is
    never one mis-click from entering a real scoreline. Required side +
    required short reason + a two-step confirm naming who is out. It rides
    the SAME `/api/tournament-push` `submit-result` action, so downstream
    newly-paired competitors still get their alert.
  - **DOUBLE NO-SHOW is deliberately not handled.** Both sides absent is a
    judgement call about who (if anyone) advances, and a host can already
    reach any outcome through `tournament_correct_match_result`; automating
    it would mean inventing a policy the spec does not have.
  - **Verified:** 0062+0063+0064+0065 applied UNMODIFIED to a real embedded
    Postgres (the Phase 1/2a stub approach) and integration-tested with **47
    assertions**: a forfeit from PENDING advances the winner, drops the
    loser into the losers bracket, leaves `started_at` null, writes 0 games,
    pays 0 ledger rows and logs exactly one `completed` event whose metadata
    carries forfeit/reason/forfeited_by with no new event_type — against a
    control contested result on the same bracket that DOES pay its 2 rows
    (win 10 + round bonus 25) and DOES write its game; validation (reason
    required, blank reason rejected, winner must be in the match, a garbage
    uuid rejected cleanly, an already-complete match refused); correcting
    the forfeit clears the flag and the reason, flips the winner, writes the
    game, logs `previous_forfeit: true` and mints no reward; the bracket
    plays through to a champion with placements settling while the
    once-forfeited match still pays nothing; and the anon boundary is
    unchanged (cannot call the RPC, cannot write the new column, can still
    read it). Browser-verified in `/dev/tournaments` (the sim now mirrors
    the events stream, a virtual clock so timing figures are real
    arithmetic, plus forfeit and correction paths, and mounts the REAL
    MatchDetail / EntryDetail / TournamentStats / ForfeitForm): stats
    checked digit-for-digit against the raw stamps (durations 1021/901/260/
    739s -> average 730s = "12m 10s", fastest 260s, slowest 1021s, span
    4624s = "1h 17m"); a played match's wait 1682s = "28m 02s" and duration
    1238s = "20m 38s" against its own created/started/completed stamps; the
    forfeited match reading "—" for both with its reasons, "None. A forfeit
    advances a side without a contested win, so it pays nothing", and 0
    ledger rows; a correction rendering "Winner changed from Redline to
    Nimbus" with its logged reason; the forfeit-then-correct case dropping
    the FF chip everywhere while keeping both events in the log; an entry
    page cross-checked against the raw rows (record 4–1, by-forfeit 1–0,
    ledger 5 rows running 10/35/45/145/155 totalling the same +155 the
    public RewardsPanel shows); and the REAL ForfeitForm emitting exactly
    `{"forfeit":true,"winner_id":"…","reason":"…"}` through its
    validation and two-step confirm. **Restraint audit (computed, not
    eyeballed):** match detail and entry detail each render exactly ONE
    emerald element (the headline label, which becomes the live indicator
    on a running match) and ZERO emerald surfaces; the stats strip contains
    no green at all. **Also verified against the LIVE project** (see the note
    below: the local `.env` reaches a real Supabase, and 0062-0065 are applied
    there): a real bye match renders its BYE state, its honest dashes and its
    "a bye pays nothing" note with a true +14s event offset; the stats strip
    reads 5 played matches / 3s average / 34s span / 2s fastest / 4s slowest
    off real stamps with byes excluded; and a real champion's entry page reads
    3–1 with the scorelines correctly oriented (0–1 LOST on the grand final it
    lost, 1–0 WON on the reset). **NOT verified even so:** a real forfeit, which
    needs a signed-in host session and would mean mutating live tournament
    data.

- **Deleting a tournament (migration `0066_tournament_delete.sql`, apply
    manually after 0065).** Phase 1 shipped no delete path at all: entries
    could be removed pre-bracket and qual pools regenerated, but a tournament
    itself was permanent once created. `tournament_delete(id, confirm_name)`
    is the one missing lifecycle action.
  - **WHO: any of the tournament's own hosts, OR any teacher.** 0062 documents
    every `tournament_hosts` row as granting full control and deletion is not
    carved out of that. The teacher clause is what makes the feature usable
    rather than a nicety: a teacher clearing up somebody else's abandoned test
    event is by definition NOT one of its hosts, and the host console
    redirects non-hosts away, so a host-only rule would leave that case with
    no route in at all. `is_teacher()` reads `profiles.role`, which 0001
    derives from the `@boscotech.edu` sign-in domain, so "teacher" and
    "@boscotech.edu account" are the same set. Enforced INSIDE the function
    (the cross-user staff-write convention); UI gating is convenience.
  - **It is a HARD delete, and it is the one place the "permanent record"
    stance on `tournament_reward_ledger` (0063) gives way.** That stance is
    about never rewriting history WITHIN a live tournament — you cannot un-pay
    a competitor, and a correction mints nothing. Removing the whole
    tournament retracts the record rather than editing it, and the
    alternative (a soft-deleted row lingering forever) is worse in a school
    tool whose common case is clearing out test events.
  - **The confirmation is SERVER-SIDE, not just a UI step:** once a tournament
    has any entries the caller must pass its exact name back
    (case-insensitive, ends trimmed; internal whitespace is NOT collapsed,
    since typing it is the point). A tournament with no entries has nothing to
    lose and skips it. Putting the check in the RPC means no client bug, stray
    retry or hand-rolled PostgREST call can destroy a real event by id alone.
    `DeleteTournament.svelte` mirrors the rule so the button is never enabled
    on input the server would reject, and is three gestures either way:
    reveal, type, confirm.
  - **The teardown is spelled out** rather than left to ON DELETE CASCADE (the
    `gauntlet_room_delete` rule). Worth being precise, because the FK graph
    looks more dangerous than it is: `tournament_entries` is referenced ON
    DELETE RESTRICT from four places, so a bare `delete from tournaments`
    LOOKS like it should trip a RESTRICT — tested against a real Postgres, it
    does not (the cascade removes the referencing rows before those checks are
    evaluated). The explicit order is therefore insurance, not a workaround:
    it survives any of those FKs being re-declared and puts the full blast
    radius in one readable place. There is deliberately no audit row —
    `tournament_match_events` is tournament-scoped and goes with it, and a
    global deletion log is a bigger change than this action warrants.
  - **Surfaces:** a crimson "Danger zone" card at the foot of the host console
    (which navigates to `/tournaments` afterwards rather than invalidating a
    page whose load would then 404), and a compact control under each card on
    `/tournaments` — the latter is not a duplicate, it is the ONLY surface the
    non-host teacher case can act from. The list card stays one big link with
    the control as a SIBLING beneath it, never nested inside the anchor (a
    button in an `<a>` is invalid markup and its clicks would navigate). The
    list load now also reports `isTeacher` (a `profiles` lookup, the
    role-gated-load pattern) and the host load a `rewardLedgerCount` (a
    head-only count) so the warning can say what will be lost.
  - **Verified:** 0062-0066 applied UNMODIFIED to a real embedded Postgres and
    integration-tested with **38 assertions**: a fully played tournament
    (entries, bracket, games, events, reward rules, a paid ledger and a 0064
    entry style) deleted by its host leaves ZERO rows across all twelve
    tournament-scoped tables and no orphans anywhere, while a neighbouring
    tournament is byte-for-byte untouched and keeps its champion; the name
    confirmation refuses a missing name, a wrong name and an internally
    re-spaced name, tolerates case and surrounding whitespace, reports what
    would be lost, and deletes nothing when it refuses; an empty draft deletes
    with no name; a student and an outsider are both refused, anon cannot call
    the RPC at all, and a teacher who is NOT a host CAN delete (the case the
    whole teacher clause exists for); an unknown id reports not found; and the
    bare-cascade behaviour the header describes is pinned by its own
    assertion so the comment cannot drift. Browser-verified in
    `/dev/tournaments`, which mounts the REAL control against an in-memory
    mirror of the RPC's rules: with entries the typed name is required and the
    button stays disabled on a wrong name then enables on a case- and
    space-tolerant match; a student attempt shows the server's refusal and
    keeps the panel open; a teacher on a zero-entry tournament gets no input
    at all and deletes in one click; and the compact variant renders as the
    bare trigger. **NOT verified:** the signed-in round trip on the live
    project — 0066 is not applied there, and running a real deletion would
    destroy real tournaments.
  - **Payout-loss acknowledgment (migration
    `0068_tournament_delete_payout_ack.sql`, apply manually after 0067).** A
    SECOND, distinct confirmation for the case that actually matters most:
    the tournament being deleted has already paid real IDEA Coins to real
    students via `tournament_reward_ledger` (0063). Triggered purely on
    whether that tournament has ANY ledger rows — a tournament with zero
    payouts is completely unaffected by this migration, no new step, no
    behavior change from 0066.
    - **New parameter `p_acknowledge_payout_loss boolean default false`**,
      checked BEFORE the existing name-match check (a caller who has not
      acknowledged the payout loss never even reaches "type the name"). A
      refusal names the real numbers — total coins paid, distinct entries
      paid — computed in the same query 0066 already ran for its own message,
      so the caller has what it needs to build the warning without a second
      round trip. Required dropping the old `(uuid, text)` overload first:
      `create or replace` keys on the exact parameter list, so merely adding
      a parameter would have left the 0066 two-argument signature callable
      and unguarded as a second overload.
    - **UI:** `DeleteTournament.svelte` gained a THIRD gesture that sits
      strictly before the name step whenever the tournament has payouts: a
      distinct gold-bordered panel (never the crimson danger color, since
      it is a "read this" step rather than the point of no return) stating
      the real coin total and entry count as loaded by the page, with its
      own checkbox and a Continue button that stays disabled until it is
      checked. Checking the box does not itself advance — a separate
      "acknowledged" flag only flips on the Continue click — so ticking the
      box and reaching the name field can never be the same accidental
      gesture. A tournament with no payouts skips this panel entirely and
      keeps the exact single-step flow from 0066.
    - **Real numbers, not placeholders:** the host console's load
      (`/tournaments/[id]/host/+page.server.ts`) now selects
      `entry_id, amount` from the ledger (replacing the old head-only count)
      and reduces it into `rewardLedgerCoins` / `rewardLedgerEntries`
      alongside the existing `rewardLedgerCount`. The tournament list load
      (`/tournaments/+page.server.ts`) fetches the same per-row data, but
      ONLY for tournaments the signed-in caller could actually delete (every
      tournament for an admin/teacher, else just the ones they host) since
      most visitors to that public page see no delete control at all; it
      reduces into `rewardCoinsById` / `rewardEntriesById` /
      `rewardCountById` maps keyed by tournament id.
    - **Verified** in `/dev/tournaments`: reward rules saved and a bracket
      played forward through the real sim to a real paid ledger (109 coins
      across 5 entries, 13 rows); opening the delete panel showed that exact
      warning text; Continue stayed disabled with the box unchecked and
      enabled the instant it was checked; clicking Continue advanced to the
      existing name-confirmation step (summary line correctly reading the
      grown reward-row count); typing the name and deleting logged
      `ack=true` in the attempt trail; and, separately, a freshly rebuilt
      tournament with zero ledger rows went straight from the trigger button
      to the name step with no payout panel at all, matching 0066's
      original one-step behavior exactly.

**Note on the local `.env` (supersedes the "placeholder-only" caveat repeated
throughout the tournament and GREENLINE sections above):** it now points at a
REAL Supabase project, so `npm run dev` serves live data and the public
tournament surfaces can be verified end to end without auth. Two consequences.
First, those older "NOT verified: the live project" notes are stale for
anything read-only. Second, and more important: **anything you run against it
is production.** Signed-in and host-only paths still cannot be driven (there is
no session), which is the main remaining verification gap — and that limit is
also what keeps a stray RPC call from mutating real tournaments. Confirm which
migrations are actually applied before assuming: as of Phase 3a, 0062-0065 are
live and 0066 is not.

**This note itself is now stale, confirmed 2026-08-09.** The checked-in
`.env` is back to the two placeholder Supabase vars
(`https://placeholder-local-dev.supabase.co`), not a real project, and every
GREENLINE entry from Phase 8 onward independently calls it "the placeholder
local `.env`" -- so whatever real project this note describes was reachable
only for the Phase 3a tournament session, not a durable repo state. Treat
every "NOT verified: the live Supabase project" note across this file
(coin economy included) as still accurate, and do not assume `npm run dev`
reaches live data without first checking `.env` yourself.

