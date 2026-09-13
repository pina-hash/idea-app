---
title: "The losers bracket, the reset the refusal promised, and rewards that actually pay"
date: 2026-09-13
branches: ["claude/busy-feynman-aupq55"]
migrations: ["0212"]
subsystems: ["tournaments", "coin-economy"]
---

Ledger 0207, nine days before IDEA-Blade runs on 2026-09-22 with real students in
a room. This fixes three of the findings ledger 0202's read-only audit
(`docs/audits/2026-09-13-tournament-dry-run.md`) measured the day before. 0202
was told not to fix anything because four lanes were in flight; this bundle is
the fixing half, and it rediscovered nothing.

All four of the audit's claims about the bracket were re-verified against the
tree before any of it was built, and all four held.

## ONE. The losers bracket was executed by nothing

`tests/db/tournament-bracket-topology.test.ts` is new: 61 tests, walking fields
of **4, 5, 6, 8 and 16** from generation to a champion through the real RPCs on
real Postgres, asserting match ROWS rather than a status string.

**Where the expected values come from is the whole question a test like this has
to answer**, and they are not read off the implementation. They are the
arithmetic of a double-elimination bracket, derived in `expectedShape()`: with
`P` the field rounded up to a power of two, winners matches are `P - 1`, losers
matches `P - 2`, the grand final 1, the total `2P - 2`, and byes `P - N`.
Checked against the published figures for these sizes (4 -> 6 matches, 8 -> 14,
16 -> 30). A test whose expectation is `count(*)` from the function under test
cannot fail.

**A BYE AND A DEAD MATCH ARE NOT THE SAME THING, and conflating them is what the
first draft of this file got wrong.** `isByeMatch` is true of any complete match
with a null side, which covers both; the discriminator is the WINNER. A bye
advances somebody (winner set, one side present); a dead match advances nobody
(winner null, BOTH sides null) and exists because a round-one bye sends no loser
down. Measured at N=5: three winners byes plus one dead losers match, which is
`_tournament_resolve_byes` doing exactly what its own comment describes. The
assertion that survives is the one that matters -- **a dead match may never hold
a participant**, because a dead-completion over an occupied slot would silently
eliminate a student who never played.

The bye is proven VISIBLE three ways, and the third is the one that connects SQL
to surface: the match row, the `{"bye": true}` event, and the REAL client
predicates `isByeMatch` / `eventIsBye` / `entryBracketRecord` imported from
`$lib/tournaments/tournaments.ts` and fed the REAL SQL rows. Not a hand-built
fixture.

### The mutant that survived, and what it taught

Three mutants were put to the file. Two died immediately: the losers-final ->
grand-final-B pointer flipped to `'a'` (10 failed), and the losers bracket never
built at all (22 failed). **The third survived: deleting the even-round slot
reversal (`0062:1766`, "Slot order reverses on even winners rounds to delay
rematches") left all 57 assertions green.** The bracket is still structurally
valid without it -- every count, pointer, round-width and completion assertion
holds -- it just starts pairing people who have already played.

The reason the first rematch assertion could not see it is that **the walk was
the instrument**. Under "the A side always wins" the reversal makes no
observable difference: measured, 0 rematches either way at N=8 and N=16, because
the entry dropping out of winners round 2 has never played anyone in the losers
half it lands in. The case the reversal exists for needs an UPSET. With the B
side taking every winners match from round 2 on, the real code produces **0
rematches** and the reversal-removed mutant produces **2 at N=8 and 4 at N=16,
all in losers round 2**. That walk is now its own fixture and all three mutants
die.

The other rematch invariant, under the ordinary walk, is that a double
elimination forces EXACTLY ONE rematch and it is the grand final -- the winners
finalist necessarily beat whoever comes up the losers side.

## TWO. The correction reset: built, not reworded

`_tournament_check_unwindable` admits only a downstream match that is `pending`
or an auto-completed bye, and refuses everything else with *"... Correct or reset
that match first."* There was no reset. Correcting the downstream match instead
is refused too (`tournament_correct_match_result` takes only a `complete` match),
and 0202's enumeration of all twenty-six `tournament_*` functions found no reset,
reopen or un-complete path anywhere. **Once the next match was started, the
previous round's result was permanent**, and the only undo in the schema was
deleting the whole tournament.

The two options were to build the reset or to change the refusal. **This builds
it**, and the argument is:

* A wrong score entered during a live bracket is the ORDINARY human error, not an
  exotic one. In a room where the host starts matches promptly the unrecoverable
  window is minutes wide.
* **Rewording buys a host nothing.** "Confirm a score before starting the next
  match" is an operational rule, not a remedy: it tells somebody who has already
  made the mistake that they should not have made it. The audit's own item 5
  could offer only that, and filed it as a thing Mr. Pina must KNOW rather than a
  thing the software does.
* The remedy the message names is the correct one. Building it turns a sentence
  that is currently false into a sentence that is true, which is strictly better
  than turning it into a different sentence.

`tournament_reset_match(uuid, text)` withdraws a match's outcome and returns it
to `pending` with its participants intact -- they are the legitimate output of
the matches above it, which the reset is not touching. It runs **the same
`_tournament_check_unwindable` a correction runs**, called and not restated, so
it cannot orphan a result recorded independently deeper down; where it refuses,
the answer is to reset THAT match first, which terminates because each step moves
closer to the leaves. It clears the games rows, the winner, `completed_at`, the
forfeit flag, and `started_at` -- **`pending` must mean pending**, and a pending
match carrying a start time is a state no other path in this schema can produce.
The grand-final branch (delete the bracket-reset row, return the tournament to
`live`, null the champion) is copied from `tournament_correct_match_result`
rather than invented.

**It logs as a `'corrected'` event carrying `{"reset": true}` rather than as a
new event type**, and that is a constraint rather than a preference:
`event_type` is CHECK-constrained and every renderer switches on it, with
`MatchTimeline.svelte` falling through to the raw string, so a new type would put
the bare word "reset" on a student's timeline. The flavour-in-metadata shape is
this codebase's own convention for exactly this -- `eventIsBye` reads
`'completed'` plus `{"bye": true}` the same way. A dedicated "Result withdrawn"
label in `MatchTimeline.svelte` is a one-line follow-up and belongs to whoever
owns that file; this bundle did not.

`tests/db/tournament-correction-reset.test.ts` (23 tests) walks the room case end
to end: four round-one results with one entered WRONG, the host starts round two,
the correction is REFUSED naming the remedy, the reset withdraws the downstream
result, the correction then goes through, **the losers bracket re-derives** (the
newly-losing entry drops into losers r1s1 and the wrongly-eliminated one is no
longer there), and the bracket still walks to a champion. Before this file, zero
tests called the correction path at all.

## THREE. Rewards reach the coin ledger

Mr. Pina's answer on decision 6a, 2026-09-13: MAKE IT PAY.

The hook is `_tournament_award` and nothing else, because it is already the
single write point -- `_tournament_award_match_win` and
`_tournament_award_placements` both call it, so a match win, a round bonus and
every placement are covered by one change that cannot drift. Section 1 of the new
body is 0192's per-member select VERBATIM, ordering included, so ledger row ids
are assigned exactly as before.

**It mints through `_coin_insert`, not `coin_log_transaction`, and 0145 is the
precedent.** Every public coin write opens with *'Only site admins can log IDEA
Coin transactions.'* and a tournament host is routinely a teacher who is not an
admin, so the public path would raise at exactly the person the feature is for.
The medium is `'digital'`, for 0145's reason: nobody hands over a physical coin
when a bracket advances.

The four standing rules, each proven rather than asserted, in
`tests/db/tournament-bracket-reward-payout.test.ts` (31 tests):

1. **A negative balance never withholds winnings.** A student is put genuinely
   into debt with a real fine row (the positive control -- without it, "they got
   paid" only proves they were never in debt), wins, and their balance moves from
   **-40 to -30**. The lockout is purchases-only and cannot reach an award.
2. **Entering still cannot cost coins.** All three layers are asserted from the
   catalog and the RPC, and none is weakened; plus the structural one 0212 adds,
   that `amount >= 1` makes the signed value positive by construction. A sweep
   confirms every `competition_winnings` row the suite produced is a credit, with
   a positive control that the sweep looked at something.
3. **Validate before you write.** The category is resolved once, ahead of the
   loop.
4. **Nothing pays twice.** `coin_transaction_id` is UNIQUE, and the constraint is
   proven by a write, not only by its pinned definition.

**A coin problem may never strand a bracket, and that decides the shape.** A
missing, retired or reshaped `competition_winnings` does NOT raise: the reward
row is written and `coin_transaction_id` is left null. Refusing would mean a host
unable to record a result because a price-list row was retired, which gates a
COMPETITION OUTCOME on the coin system. 0145 refuses in the same situation and is
right to -- there, refusing leaves a request pending and recoverable; here it
would strand the bracket. A registrant with no account is unpaid for the same
reason and says so, rather than being silently skipped; the uuid-to-email bridge
is `_notebook_email_for_user`, called and not copied.

### What the debt test found on the way

The debt assertion first passed for the wrong reason twice, and both are worth
recording. The player pool was shared across sections, so earlier winnings
carried into the debt fixture and it read a balance of 60 where it expected -30 --
every section that asserts a BALANCE now owns its own students. And **the debt
lockout has been PER-MEDIUM since 0096**: the fine and the award are both
`digital`, `coin_log_transaction` defaults to `physical`, and asking the physical
balance about a digital debt correctly found none and allowed the purchase. That
is 0096 behaving as designed, but a test that had stopped there would have read
"the lockout is gone".

Six mutants were put to the payout path and all six died, including a wrongly
added debt gate on the award path -- which is what proves rule 1 is enforced by
the test rather than merely stated by it.

## The surface, and two findings the rasteriser produced

`RewardsPanel.svelte` and `RewardRulesEditor.svelte` now render every figure
through `signedCoins`, and both joined `COIN_SOURCES` in
`tests/coin-symbol.test.ts` so the mismatch cannot recur. Measured on the real
harness: **24 of 24 figures carry `i¢`** at 375 and 1440.

**Finding 8a is a MEASUREMENT ARTEFACT, not a defect, and the raster is what
said so.** The audit recorded four `span.entry-chip` elements reporting
`scrollWidth` 6-7px past `clientWidth` at both widths and called it the chip
clipping its own text. Reproduced exactly (128->134, 135->141, 140->146,
141->148), then diagnosed: the correlation with `has-bg` is PERFECT (4 of 4 both
ways), the pseudo-element inset reads `-2.88px -6.4px`, and the 6.4px is
`.entry-chip.has-bg::before` -- a deliberate background wash that bleeds outside
an `overflow: visible` box. **No name is truncated**: all four have
`scrollWidth === clientWidth` on `.name`, and the crop shows "V ⚡ Vortex #1"
painted in full. A `min-width: 0` fix was written, measured to change nothing,
and REVERTED rather than kept with a comment claiming a repair that did not
happen.

**What the raster did find is a real one the audit had not: at 375 a student's
name disappeared from the Standings.** Every qualifier on a reward row is
`flex: none` and `EntryChip` carries `min-width: 0`, so the chip was the only
thing that could shrink -- and it shrank to its thumbnail. Measured on the
8-entry harness: the Kilowatt row rendered a **14.6px chip with the name at ZERO
WIDTH**, an initial and nothing else, on the surface that announces what that
student won. Only rows carrying the `each · N registrants` chip were affected and
at 1440 none were, so it read as fine on a desk. The new `not paid` mark would
have put a fourth competitor on the same row.

The row now wraps and the chip keeps a floor. **The floor is on the standings row
only, and that is a measurement rather than a preference**: applying it to the
history rows too wrapped all sixteen of them, doubling the length of a list that
already fit on one line with its names whole. Measured after: 0 names at zero
width at either width, and 0 under a stress case with the `not paid` mark forced
onto every row, with no panel or page overflow.

## Verified

* `tests/db/tournament-bracket-topology.test.ts` 61 passed; three mutants, three
  killed.
* `tests/db/tournament-correction-reset.test.ts` 23 passed.
* `tests/db/tournament-bracket-reward-payout.test.ts` 31 passed; six mutants, six
  killed.
* `tests/dom/tournament-rewards-payout-mount.test.ts` 11 passed; three mutants,
  three killed. One of them survived first and the assertion was SCOPED as a
  result: an unscoped `.unpaid` sweep passed while the history mark alone was
  disabled, because the standings mark was still there.
* `tests/coin-symbol.test.ts` 65 passed with the two new sources.
* `svelte-check` 0 errors, 37 warnings, 20 files -- the baseline, re-derived on
  this tree with the two public env values exported before the sync.
* `npm run verify:browser -- --route tournaments`: 36 route/width runs, 966
  measurements, 0 outside threshold, before and after.
* Paste trap, two ways against a planted control: **0 findings**, control
  detected 2 of 2.

**Every mutation run parsed the summary line and restored from a COPY**, never
from git: `git checkout --` restores from HEAD and discards uncommitted work, and
vitest's exit code is 0 with a failing test in this repo. Both traps are named in
`CLAUDE.md` and both have cost a session here.

## Not verified

* **Anything about production's applied migration set.** `DEPLOY_PROBE_URL` and
  `IDEA_MIGRATION_URL` are unset in this container and `.env` is absent, so 0212
  is UNAPPLIED as far as this session can tell and every statement about what
  production holds is "cannot confirm". `https://ideabosco.com/` answered **200**
  and serves **v1.1514**.
* **Any signed-in surface.** The harness covers `/dev` routes only.
* **Web fonts** (the harness blocks every non-loopback request, so all text above
  is measured in the fallback stack) and **`prefers-reduced-motion: reduce`** (the
  harness runs `no-preference`).
* The 1920 projector width was not re-run; `TvStage.svelte` was not touched.

## Deliberately not done

* **A "Result withdrawn" label in `MatchTimeline.svelte`.** Outside the owned
  surface; the reset renders as "Result corrected", which is true.
* **Re-issuing rewards after a correction.** 0063's documented stance is that the
  permanent ledger is never rewritten, so a corrected match still pays the new
  winner nothing and the wrong winner keeps their row -- now with real coins
  behind it. That is the audit's item 5 and a decision for Mr. Pina, not
  something to change inside a bundle about something else. It is asserted as
  UNCHANGED so the stance is pinned rather than drifting.
* **A settle-unpaid-rewards RPC.** An unpaid row is visible and can be logged by
  hand through the coin desk; an admin path to sweep them is a feature, not a
  fix.

## Files just outside the stated surface, and why

Two, both flagged rather than quietly taken. `src/lib/tournaments/tournaments.ts`
gained `coin_transaction_id` on `RewardLedgerRow`, `rewardUnpaid`, and an
`unpaid` count on the two folds -- the alternative was a second definition of the
row shape inside the panel. `tests/coin-symbol.test.ts` gained the two entries
the prompt asked for. Every ref was swept first: ledgers 0205 and 0206 are
documentation-only ("NO FILE UNDER `src/`") and no branch anywhere touches
`src/lib/tournaments`.
