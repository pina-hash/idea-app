---
title: "The tournament sequence audit: every state is covered, no transition is"
date: 2026-09-13
branches: ["claude/peaceful-shannon-mwbnrr"]
migrations: []
subsystems: ["tournaments", "coin-economy"]
---

A read-only audit, nine days before the IDEA-Blade tournament runs with real
students in a room. It changed no source file, by instruction: four lanes (0196,
0197, 0200, 0201) were in flight and a fix would have conflicted with them.
Everything found is written down in `docs/audits/2026-09-13-tournament-dry-run.md`
and nothing is fixed.

## Why the bundle existed

Nineteen browser specs under `tools/browser-verify/routes/tournaments*` and
fourteen files matching `tests/**/tournament*` cover the surface generously. They
cover it one STATE at a time. Nothing walks `registration_open` -> seeding -> live
-> results -> rewards as one continuous run, so every transition between the
proven states was assumed.

## What the walk found, in the order it matters

**The losers bracket is executed by nothing.** This is the finding. The only
occurrences of `'losers'` in `tests/` are two hand-built `match({...})` fixtures in
`tests/tournament-live.test.ts` exercising the display helpers in `live.ts`; they
touch no SQL. The only real-SQL bracket walked end to end
(`tests/db/tournament-entry-members.test.ts:1089`) is a TWO-entry field, and
`tournament_generate_bracket` builds a losers bracket only `if v_r >= 2` — so that
fixture has none, and its own assertion says so. The one test that generates an
ODD field (`:854`, five entries) asserts `statusOf === 'live'` and reads no match
row, so the three byes a five-entry field produces are never looked at. Roughly
130 lines of pointer arithmetic — the losers construction, the even-round slot
reversal that delays rematches, the losers-final -> grand-final-B wiring — have
never run under test on a field large enough to contain them.

**And the browser pass cannot see it either**, which is the part worth writing
down as a rule-shaped fact rather than a bug. All nineteen specs drive
`/dev/tournaments`, whose engine is `src/routes/dev/tournaments/sim.ts` — an
in-memory REIMPLEMENTATION that says so in its own first eight lines. That is the
right design for what those specs are for (driving the real `BracketView` with no
auth or Supabase), but it means a topology defect in the SQL would leave the
harness drawing a perfectly correct bracket.

**A result becomes permanent the moment the next match starts, and the refusal
names a remedy that does not exist.** `_tournament_check_unwindable` admits only a
`pending` downstream match or an auto-bye; `tournament_correct_match_result`
refuses a match that is not `complete`; and the full RPC enumeration across 0062,
0063, 0065, 0066, 0068 and 0192 (26 functions) contains no reset, reopen or
un-complete path. So a downstream match that is `in_progress` blocks the
correction, and the advice in the refusal text — *"Correct or reset that match
first"* — cannot be followed. It is an operational rule for the room rather than a
code change nine days out: confirm a score before starting the next match.
`tournament_correct_match_result` has zero test callers, so the unwind, the reset
deletion and the `champion_entry_id = null` rollback are all unexercised.

**The coin questions both answer clean, and one of them for a reason worth
knowing.** Entering cannot cost coins: no entry trigger exists, `amount integer
not null check (amount >= 1)` sits on both reward tables, the RPC raises below 1
and the form's `parseAmount` rejects it. A negative balance cannot withhold a
reward: `_tournament_award` reads no balance at all, and the debt lockout is
`kind = 'purchase'`-only, so even the manual `competition_winnings` credit is
unblocked. The charge-then-validate sweep is clean everywhere — every
`_coin_insert` in `0070` follows every `ok:false` return.

**But a tournament reward never reaches a student's balance, and the panel calls
it a payout.** `tournament_reward_ledger` is written by `_tournament_award` alone
and read only by tournament surfaces; nothing in the repo bridges it to
`coin_transactions`. The intended path is manual and the price list says so
(`competition_winnings`, "entered by the admin at logging time"). Meanwhile
`RewardsPanel.svelte` renders a `Payout history` heading and bare gold numbers,
and `DeleteTournament.svelte` renders the same total as `40i¢` because it is on
`COIN_SOURCES` in `tests/coin-symbol.test.ts` and the panel is not — that list is
explicit rather than globbed, which is deliberate and is exactly why the panel
slipped out of scope without anything reddening.

## What was measured

Production HTTP is reachable this time (`ideabosco.com` 200, `apps.ideabosco.com`
200) where the last six containers were refused. The production DATABASE is not:
`deploy-probe` answers `DEPLOY_PROBE_URL is not set ... This is "cannot confirm",
never "applied"`, so **no claim about the applied set is verified** — including
whether `0192` is applied, which decides whether a team entry pays every
registrant or one.

Browser, default widths: 36 route/width runs, 966 measurements, 0 outside
threshold. At `--width 1920`, which no spec ever drives (`_shared.mjs:11` is
`WIDTHS = [375, 1440]` and no tournament spec overrides it): 4 runs, 65
measurements, 0 outside threshold. Tests: 143/143 across the five pure tournament
files plus `coin-symbol`, and 57/57 in `tests/db/tournament-entry-members.test.ts`
with no skip guard anywhere in `tests/db/harness.ts` or `cluster.ts` — checked
because 3.64s for a Postgres-backed file reads like a suite that never ran.

Rasterizing earned its place. The 16-entry bracket at 375px reports zero page
overflow, correctly, while `.bracket-scroll` hides 1047px (clientWidth 337 ->
scrollWidth 1384) behind an overlay scrollbar that reserves no gutter
(`offsetHeight - clientHeight` is 0) and that no screenshot on this Chromium
paints. Reading the numbers alone that looks like a reachability defect. Looking
at the image, it is not: the next round's column is drawn partially at the right
edge and a `FULL SCREEN` control sits above the bracket, so the affordance is
there — it is just not a scrollbar. The measurement could not settle that and the
picture could.

## Explicitly not verified

Production's applied migration set. Any signed-in surface (the harness covers
`/dev` only). Web fonts — the harness blocks every non-loopback request, so all
text figures are the fallback stack. `prefers-reduced-motion: reduce`.

Ledger entries 0196 and 0197 exist on no ref; scanning every
`refs/remotes/origin` for `docs/prompt-ledger/entries/019[6-9]-*` returns only
0198 and 0199.

## Deferred, deliberately

Every finding. A fix on this branch would have conflicted with four lanes, which
is why the bundle was scoped read-only. The audit's closing list ranks nine days'
worth of work into what is already true, what is a build, and what Mr. Pina does
in a room — and puts the room first, because a thirty-minute dry run at the real
entry count exercises more of the untested engine than any test written in the
time remaining.
