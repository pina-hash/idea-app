# Tournament dry run: the sequence nothing covers

- **Date:** 2026-09-13
- **Branch:** `claude/peaceful-shannon-mwbnrr`
- **Ledger:** `docs/prompt-ledger/entries/0202-tournament-dry-run.md`
- **Scope:** READ-ONLY. No source file changed. No migration. Nothing fixed.
- **Event under audit:** IDEA-Blade, 2026-09-22, nine days out.

Every tournament STATE has a spec or a test. The SEQUENCE between them does not.
This walks `registration_open` -> seeding -> live -> results -> rewards as one run
and records, for each step, what the code does, what proves it, and what nothing
proves.

---

## 0. Reachability, and what could not be checked

| Target | Result |
| --- | --- |
| `https://ideabosco.com/` | **HTTP 200**, 1.61s |
| `https://apps.ideabosco.com/` | **HTTP 200**, 0.61s |
| Production **database** | **UNREACHABLE** |

The last six containers were refused outbound; this one was not. Production HTTP
is reachable. The **database is not**, and that is a different refusal:
`node tools/deploy-probe.mjs` answers

> `deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set cannot be read. This is "cannot confirm", never "applied".`

`.env` is absent (gitignored, fresh clone), `IDEA_MIGRATION_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are unset.

**So no statement below about what is APPLIED to production is verified.** In
particular **`0192_tournament_entry_members_and_admin_hosts.sql` has unknown
applied status**, and it is the migration that makes team entries, admin hosts
and per-registrant reward rows exist at all. If it is not applied on 2026-09-22,
a team entry pays one person instead of every registrant. *(Item 1 of the closing
list.)*

**Instrument note.** Everything else in this document is measured in this
container: a real embedded Postgres (`embedded-postgres`, one cluster per run via
`tests/db/cluster.ts` globalSetup) and a real Chromium
(`/opt/pw-browsers/chromium-1194`, 141.0.7390.37, probe clean: screenshots, rAF,
IntersectionObserver, ResizeObserver all live).

---

## 1. A student registers while `registration_open`, then the host seeds

### What the code does

`tournament_register_entry` (`supabase/migrations/0062_tournaments.sql:1045`)
takes `select * into v_t ... for update` on the tournament row, then:

```sql
if v_t.status <> 'registration_open' then
    raise exception 'Registration is not open for this tournament.';
end if;
```

**A late registration is REFUSED. It is not queued and it is not silently
dropped.** The `for update` serializes it against the host's status change, so
there is no window in which a registration lands into a tournament that is
already seeding.

An entry already created is untouched by seeding: `tournament_set_status`
(`0062:983`) only writes the `tournaments.status` column.

### The two ways a host takes a late registrant anyway

1. **Seeding is reversible.** `tournament_set_status` (`0062:993-996`) permits
   `draft -> registration_open`, `registration_open -> seeding` **and
   `seeding -> registration_open`**. Its own refusal text names the round trip:
   *"Allowed: draft -> registration_open, registration_open <-> seeding; the
   bracket generator moves it to live."*
2. **`tournament_host_add_entry` works during seeding** (`0062:1097`, header:
   *"Allowed while registration is open and during seeding (the host is the
   supervisor)"*).

### The one-way door

`live` is terminal for the field. Nothing in the schema returns a tournament from
`live` to `seeding` — the `if not (...)` above admits no such transition, and
`tournament_generate_bracket` is the only writer of `'live'` (`0062:1815`).

### What proves it

- `tests/db/tournament-admin-manage.test.ts:576` — `test('tournament_set_status:
  registration_open -> seeding')`, against the real RPC.
- `tests/db/tournament-entry-members.test.ts:870` — asserts `tournament_join_entry`
  refuses with `NOT_OPEN` after the bracket is generated, and `:875`/`:879` that
  adding and removing a teammate refuse with *"only while registration is open or
  during seeding."*

### What nothing proves

- **No test walks `seeding -> registration_open -> register -> seeding`.** The
  reverse transition is asserted nowhere; only the forward one is. It is three
  lines of `plpgsql` and very likely fine, but on 2026-09-22 it is the host's
  entire recovery path for a student who arrives late, and it has never been run.
- No test asserts that an entry created before seeding still holds its `seed`
  after `_tournament_compact_seeds` runs during bracket generation.

---

## 2. Seeding to live: byes, odd fields, uneven pools

### What the code does

`tournament_generate_bracket` (`0062:1574`) rounds the field up to the next power
of two (`while v_p < v_n loop v_p := v_p * 2`), builds the standard recursive
seed-placement order, and places round 1 with

```sql
case when v_round = 1 then v_entry_by_seed[v_order[2 * v_slot - 1]] else null end
```

An out-of-range seed indexes past the array and yields NULL — that is the bye.
`_tournament_resolve_byes` (`0062:571`) then loops to fixpoint, and the loop
**re-reads each row fresh inside the cursor** with a comment explaining why:
completions earlier in the same pass advance entries into later matches, and
judging a slot dead off the stale cursor snapshot would wrongly dead-complete a
match that had just received its participants (two adjacent round-1 byes feeding
one parent). A slot is "dead" only when no *incomplete* feeder points at it.

Where both sides are dead the match completes with `winner_id = null` and
metadata `{dead: true}`.

### Can a student see and understand a bye? Yes — four surfaces

| Surface | Evidence |
| --- | --- |
| Bracket | `src/lib/tournaments/BracketView.svelte:99` — `<span class="bye-chip">{m.winner_id ? 'BYE' : '—'}</span>` |
| Entry page | `src/lib/tournaments/EntryDetail.svelte:104` — `return { text: 'Bye', tone: 'neutral' }` |
| Match page | `src/lib/tournaments/MatchDetail.svelte:107,170` — `'Bye'`, *"advanced on a bye"* |
| Match page, rewards | `MatchDetail.svelte:252` — *"None. A bye advances a side without a contested win, so it pays…"* |
| Timeline | `src/lib/tournaments/MatchTimeline.svelte:93` — `'Advanced on a bye'` |

A bye is also visually distinct from a forfeit by deliberate decision —
`BracketView.svelte:201`: *"A forfeit was never played: marked, not dimmed like a
bye, because two…"*

### A pool that finished uneven

`_tournament_qual_seed_order` (`0062:756`) ranks on **`win_pct`, not raw wins**:

```sql
win_pct = case when games > 0 then wins::numeric / games else 0 end
```

That is the correct choice for uneven pools — a pool of five plays more matches
than a pool of four, and raw wins would favour the larger pool. The tie-break is
`rand_key = random()`, which is safe here because the resolved order is written
**once** into `tournament_entries.seed` (`0062:1656`) and frozen; it is not
re-rolled per read.

`tournament_generate_bracket` also refuses a field where quals are enabled but an
entry sits in no pool (`0062:1638`, naming the count) or any qual match is
unplayed (`0062:1647`).

### What proves it

Very little, and this is the audit's headline.

- `tests/tournament-live.test.ts:64` — `it('splits in-progress, ready, waiting and
  completed, and drops byes from completed')` and `:134` — `it('excludes byes from
  the total and the played count')`. **These are pure tests over hand-built
  `match({...})` fixtures**, exercising the display helpers in
  `src/lib/tournaments/live.ts`. They touch no SQL.

### What nothing proves — **the losers bracket is unproven**

- **No test anywhere asserts the losers bracket's wiring against the real SQL.**
  The only occurrences of `'losers'` in `tests/` are
  `tests/tournament-live.test.ts:86` and `:89` (the hand-built fixtures above) and
  `:241` (a regex pinning a constant's source text). Grepped across `tests/db/`
  and `tests/*.ts`: zero.
- **The one real-SQL bracket that is walked end to end has no losers bracket at
  all.** `tests/db/tournament-entry-members.test.ts:1089` fixtures **2 entries**;
  `tournament_generate_bracket` builds a losers bracket only `if v_r >= 2`
  (`0062:1712`), and a 2-entry field has `v_r = 1`. Its own assertion says so:
  `expect(ms.map((m) => m.bracket).sort()).toEqual(['grand_final', 'winners'])`.
- **The one test that generates an ODD field asserts nothing about it.**
  `tests/db/tournament-entry-members.test.ts:854` —
  `describe('after tournament_generate_bracket: 5 rosters locked')` — generates
  from 5 entries and its entire assertion is
  `expect(await statusOf(db, t1)).toBe('live')` (`:858`). It never reads a match
  row, so the three byes a 5-entry field produces are never looked at.
- **All 19 browser specs measure a reimplementation, not the engine.**
  `src/routes/dev/tournaments/sim.ts:1-8` says so in its own header: *"In-memory
  double-elimination simulator for the /dev/tournaments harness. Mirrors the
  topology + advancement + bye-resolution rules of
  supabase/migrations/0062_tournaments.sql (which is the authority…)"*. Every
  `tools/browser-verify/routes/tournaments*` spec drives `/dev/tournaments`. This
  is legitimate for what those specs are for — they exist so the REAL
  `BracketView`/`PoolsView` components can be driven with no auth — but it means
  **a topology bug in the SQL is invisible to the entire browser pass**, because
  the sim would keep drawing a correct bracket.

So: roughly 130 lines of pointer arithmetic in `tournament_generate_bracket`
(`0062:1712-1804` — the losers-bracket construction, the slot reversal on even
winners rounds that delays rematches, and the losers-final -> grand-final-B
wiring) have never been executed by any test on any field large enough to contain
them. *(Item 2 of the closing list.)*

---

## 3. A result posted, then corrected

### What the code does

`tournament_correct_match_result` (live version:
`supabase/migrations/0065_tournament_forfeits.sql:248`) requires a reason, requires
the match be `complete`, refuses a bye, then calls
`_tournament_check_unwindable` (`0062:1909`), which walks the winner and loser
pointers and **raises unless every downstream match is `pending` or an
auto-completed bye**:

```sql
'Cannot correct this result: the downstream % match (round %, slot %) is already %
 and its outcome may depend on the wrong winner. Correct or reset that match first.'
```

If it passes, `_tournament_unwind_downstream` (`0062:1939`) recurses down both
pointers, sets each completed downstream match back to `pending`, clears its
`winner_id`/`completed_at`, and nulls the slot the corrected entry occupied. The
grand-final branch additionally **deletes the `grand_final_reset` row** and returns
the tournament to `live` with `champion_entry_id = null` (`0065:293-300`). Then the
new result is written and `_tournament_resolve_byes` re-runs.

**So yes: the losers bracket does re-derive**, and correctly — the unwind is
recursive and follows `loser_to_match_id` as well as `winner_to_match_id`.

### What a student who already advanced sees

Their slot in the downstream match is set to NULL and that match returns to
`pending`. On the bracket that is `BracketView.svelte`'s `TBD` placeholder; their
entry page (`EntryDetail.svelte`) drops the advanced match from their record. The
correction is logged as a `'corrected'` event carrying `previous_winner_id`
(`0065:388`), which `MatchTimeline` renders — so the history says what happened
even though the bracket no longer does.

### FINDING 3a — a correction becomes impossible the moment the next match starts, and the refusal names a remedy that does not exist

`_tournament_check_unwindable` admits only `pending` and auto-byes. A downstream
match that is **`in_progress`** therefore blocks the correction — and there is no
way out:

- `tournament_correct_match_result` itself refuses a match that is not `complete`
  (`0065:340`: *"Only a completed match can be corrected"*), so you cannot correct
  the downstream one while it is running.
- Completing the downstream match makes it `complete`, which
  `_tournament_check_unwindable` also refuses.
- **There is no reset, reopen or un-complete RPC.** Enumerated every
  `tournament_*` function across `0062`, `0063`, `0065`, `0066`, `0068` and
  `0192`: 26 functions, and the only writers of `status = 'pending'` on a bracket
  match are `_tournament_unwind_downstream` (`0062:1954`, `:1965`) — which is
  gated behind the check that just refused.

So the refusal's own advice, *"Correct or reset that match first"*, is
unreachable in the `in_progress` case. **Once the next round is started, the
previous round's result is permanent.** In a room where the host starts matches
promptly, that window is minutes.

**Evidence:** `0062:1909-1934` (the check), `0065:340` (the `complete` gate), and
the absence established by the RPC enumeration above.

### FINDING 3b — a corrected match pays the new winner nothing, and the wrong winner keeps their coins

`tournament_correct_match_result` never calls `_tournament_award_match_win`.
Compare `tournament_submit_match_result` (`0065:215`), which does. This is
**deliberate and documented** —
`supabase/migrations/0063_tournament_push_rewards.sql:16-21`:

> *"Only the FIRST is a played, earned win, so the win/round-bonus hook lives in
> tournament_submit_match_result — byes pay nothing (nothing was played) and
> corrections pay nothing (the ledger is a permanent record; an erroneous earlier
> payout stays visible rather than being silently rewritten, and no new row is
> minted for the corrected winner)."*

It is a decision, not a defect. But its consequence in a room is concrete: a match
scored wrong and then fixed leaves the student who actually won with **zero**
reward rows for that match, and the student who did not win keeping theirs.
Placements are guarded separately and also never re-issued (`0063:36-41`). Mr.
Pina should decide whether he is content with that before the 22nd rather than
discover it at the awards. *(Item 5.)*

### What proves it

- Nothing. **No test drives `tournament_correct_match_result` at all** — grepped
  `tests/` for the name: zero hits. The unwind, the reset deletion, the
  `champion_entry_id = null` rollback and the `pending` restoration are all
  unexercised.

---

## 4. A forfeit at each state

`ForfeitForm.svelte` (262 lines) posts into the `forfeit` branch of
`tournament_submit_match_result` (`0065:157-203`). Measured behaviour:

| State | Outcome | Evidence |
| --- | --- | --- |
| `draft` / `registration_open` / `seeding` | No bracket exists; and `raise 'The tournament is not live.'` | `0065:152` |
| `live`, match `pending` | **ALLOWED**, deliberately | `0065:159` — *"A no-show is usually spotted before the clock starts, so pending is allowed here where an entered result requires in_progress."* |
| `live`, match `in_progress` | **ALLOWED** | only `complete` is refused, `0065:161` |
| `live`, match `complete` | Refused: *"This match is already complete; use a correction instead."* | `0065:162` |
| Match awaiting upstream (a null side) | Refused: *"This match is still waiting on participants from earlier matches."* | `0065:165` |
| `complete` tournament | `raise 'The tournament is not live.'` | `0065:152` |

Also enforced: a winner must be one of the two participants (`0065:172`), a reason
is mandatory (`0065:176`) and capped at 200 characters (`0065:178`).

**What a forfeit does:** deletes any `tournament_match_games` rows (`0065:186`),
sets `forfeit = true` and the reason, **deliberately leaves `started_at` as-is**
so the timeline reads honestly and duration statistics skip it (`0065:188-190`),
then routes through the same `_tournament_complete_match` as every other outcome —
so advancement, elimination, the grand-final rules and champion settlement are
shared code, not re-implemented. **It pays no reward** (`0065:203`: *"No reward
call at all: this is not a contested win."*).

**A forfeit that is later corrected** clears the flag (`0065:311-315`) and writes
real games — but, per Finding 3b, still pays nothing.

### What proves it

- `tests/db/tournament-entry-members.test.ts:1122` —
  `test('a FORFEIT in the winners final pays 0 rows')`, driving the **real**
  `tournament_submit_match_result` with `{forfeit: true, winner_id, reason}` and
  asserting both `ledgerOf(db, t2)).toHaveLength(0)` and that the grand final
  received both entries. This is a real-SQL forfeit and it is good.
- Browser: the forfeit form is measured at both widths — `tap-target [forfeit side
  picks] smallest 278.3x44`, `[forfeit preset chips] 84.6x44`, `[forfeit award
  control] 141.3x44`, `[forfeit reason input] 278.3x44`; contrast `[forfeit form
  tag (gold)] 5.93:1`, `[forfeit form note] 5.3:1`, `[forfeit preset chips]
  10.9:1`. All within threshold.

### What nothing proves

- The **`pending`** forfeit — the deliberate, unusual case, and the one a host
  will actually use for a no-show — is never tested. The one SQL forfeit test
  forfeits a match that the fixture left pending, but asserts only the ledger
  count and the grand-final slots; it never asserts that forfeiting a `pending`
  match is permitted *as opposed to* an `in_progress` one, so the branch that
  makes it legal is not pinned.
- No test forfeits in the **losers** bracket, where elimination is the outcome.

---

## 5. The grand final and the bracket reset

### The engine DOES model a second grand final

`tournament_generate_bracket` inserts **exactly one** `grand_final` match
(`0062:1726-1729`) and never a `grand_final_reset`. The reset is **created
lazily**, by `_tournament_complete_match` (live version `0065:229`), when the
grand final is won by the entry that came up through the losers bracket:

```sql
where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset'
...
(v_m.tournament_id, 'grand_final_reset', 1, 1, ...)
```

and `elsif v_m.bracket = 'grand_final_reset' and p_winner_id is not null` settles
the champion (`0063:500`). `tournament_submit_match_result` returns
`reset_created` in its payload (`0065:227`) so the host console can say so.

The wiring that feeds it is in place: the winners final's winner is the grand
final's **A** side (`0062:1746`), the losers final's winner is its **B** side
(`0062:1791-1794`), and for a 2-entry field with no losers bracket the winners
final's *loser* goes straight to the grand final's B side (`0062:1753-1758`).

`grand_final_reset` also has a `best_of` override that folds onto the grand
final's (`0062:407`), a display label (`tournaments.ts:327` — `'Bracket Reset'`),
a push label (`src/lib/server/push.ts:108`), and a place in the bracket ordering
(`live.ts:20`, `tournaments.ts:725`).

### What proves it — this is the best-covered step

`tests/db/tournament-entry-members.test.ts`, against the real RPCs on real
Postgres:

- `:1134` — `test('the SOLO wins the grand final contested: 1 row, amount 10 … a
  reset is created')`, asserting `expect(out.reset_created).toBe(true)`.
- `:1150` — `test('the TEAM wins the reset contested: 2 rows for the win (one per
  member, 10 each) and 2 rows for 1st place (50 each); champion = the team')`,
  asserting `expect(out.tournament_status).toBe('complete')` and
  `expect(out.champion_entry_id).toBe(team)`.

I ran this file: **57 tests declared, 57 passed, 0 skipped**, 3.64s on a cluster
booted once in `globalSetup` (`tests/db/cluster.ts`). No skip guard exists in
`tests/db/harness.ts` or `cluster.ts` (grepped).

### What nothing proves

- The reset is proven **only for a 2-entry field**, where the grand final's B side
  is fed by the winners final's loser rather than by a losers final. **The
  losers-final -> grand-final-B pointer (`0062:1791`) — the normal path, the one
  the 22nd will use — is never exercised.**
- No test corrects a grand final, so the reset-deletion + `champion_entry_id =
  null` rollback (`0065:293-300`) is unproven.

---

## 6. The rewards panel, and the coin constraint

### Q1: Can a tournament be configured so that ENTERING costs coins? **NO.**

Three independent layers, any one of which is sufficient:

1. **No entry trigger exists.** `trigger_type text not null check (trigger_type in
   ('win', 'round_reached', 'placement'))` — `0063:202`. There is no
   registration, entry or participation trigger, and `tournament_register_entry`
   (`0062:1045`) touches no coin object at all.
2. **The amount cannot be negative at the database.** `amount integer not null
   check (amount >= 1)` on `tournament_reward_rules` (`0063:205`) and again on
   `tournament_reward_ledger` (`0063:226`).
3. **The RPC and the form both refuse it.** `tournament_set_reward_rules`
   (`0063:304`): `if v_amount is null or v_amount < 1 then raise exception 'Every
   rule needs a positive whole amount.'`. `RewardRulesEditor.svelte:57` —
   `parseAmount` returns `null` unless `Number.isFinite(n) && n >= 1`; every input
   carries `min="1"`.

**A tournament reward can only ever be a credit.** There is no configuration in
which entering, playing or losing costs a student anything.

### Q2: Can a student with a negative balance be refused a reward they won? **NO.**

`_tournament_award` (`0063:334`) is a plain insert. It reads no balance, calls no
coin function, and has no refusal path:

```sql
insert into public.tournament_reward_ledger
    (tournament_id, entry_id, user_id, amount, reason, match_id)
select p_tournament_id, e.id, e.user_id, p_amount, p_reason, p_match_id
```

And the debt lockout it would have to pass does not apply anyway —
`supabase/migrations/0070_coin_economy.sql:593`:

```sql
-- Debt lockout: only while ALREADY negative, and only for purchases.
if v_cat.kind = 'purchase' and v_balance < 0 then
    return jsonb_build_object('ok', false, 'reason', 'debt', 'balance', v_balance);
```

`competition_winnings` is `kind = 'award'` (`0070:241`), so **even the manual
payout path cannot be blocked by a negative balance.** The standing rule holds on
both readings.

### FINDING 6a (the significant one) — a tournament reward never reaches a student's coin balance, and the panel calls it a payout

**`tournament_reward_ledger` is not connected to `coin_transactions`.** Swept
repo-wide: the table is written by `_tournament_award` alone and read only by
tournament surfaces (`src/routes/tournaments/+page.server.ts:83`,
`[id]/+page.server.ts:73`, `[id]/host/+page.server.ts:91`,
`[id]/match/[matchId]/+page.server.ts:85`, `[id]/entry/[entryId]/+page.server.ts:54`).
No migration, route or component bridges it. Nothing under `src/lib/tournaments/`
or `src/routes/tournaments/` calls a coin RPC (grepped: the only `coin` hits are
`DeleteTournament.svelte`'s `COIN_SYMBOL` import and four comments).

The intended path is **manual** and it is written down in the price list —
`0070:241`:

> `('competition_winnings', 'Competition Winnings', 'award', 'core', 'variable', … 'No fixed price: purely tournament-dependent, entered by the admin at logging time.')`

That separation is defensible. What is not is the **wording on the student-facing
surface**. `src/lib/tournaments/RewardsPanel.svelte` renders:

- a heading `<h3>Payout history</h3>` (`:85`)
- an empty state *"No payouts yet. Rewards land here as matches are won."* (`:101`)
- amounts as bare gold numbers: `+{r.amount}` (`:61`), `+{t.total}` (`:79`),
  `+{row.amount}` (`:94`)

A student reads "Payout history: +60" in gold and their IDEA Coin balance has not
moved and will not until an admin logs `competition_winnings` by hand. `0068`
reinforces the reading from the other side — its delete confirmation says *"This
tournament has paid out % IDEA Coins"* (`0068:87`), past tense.

**And the two surfaces disagree on the symbol.** `DeleteTournament.svelte` imports
`COIN_SYMBOL` and renders the same total as `40i¢`; `RewardsPanel.svelte` renders
`+40`. That is not caught, and cannot be: `tests/coin-symbol.test.ts:30-56`
enumerates `COIN_SOURCES` **explicitly** ("Listed EXPLICITLY rather than globbed")
and the list contains `src/lib/tournaments/DeleteTournament.svelte` and
`src/routes/dev/tournaments/+page.svelte` but **not** `RewardsPanel.svelte` or
`RewardRulesEditor.svelte`. I ran the test: it passes, correctly, over a scope that
does not include the panel. *(Item 3.)*

### The charge-then-validate sweep: **clean**

Asked of every path a tournament can reach.

- **The tournament path charges nothing at all.** There is no debit anywhere in
  `0062`/`0063`/`0065`/`0066`/`0068`/`0192`.
- **`coin_log_transaction` validates before it charges**, on every branch. Every
  `_coin_insert` call site — `0070:607`, `:727`, `:786`, `:855`, `:936` — sits
  *after* every `return jsonb_build_object('ok', false, …)` in its function
  (`:574`, `:582`, `:594`, `:599`, `:718`, `:842`, `:924`, `:931`). Category
  lookup, cap checks, the debt gate and the eating-pass check all precede the
  insert.
- **One ordering worth naming, though it is safe.**
  `tournament_set_reward_rules` (`0063:287`) runs
  `delete from public.tournament_reward_rules where tournament_id = …` **before**
  validating the incoming array (`:290-320`). A `raise` on rule 4 of 5 rolls the
  delete back, because a `plpgsql` function is one transaction — so nothing is
  lost today. It is recorded here only because splitting that function into two
  calls, or moving the loop into a client, would destroy a host's whole rule set
  on a malformed rule. No change needed.

### What proves the reward arithmetic

`tests/db/tournament-entry-members.test.ts:1134` and `:1150`, against the real
RPCs: one row at amount 10 for a solo win with `member_id` set; two rows of 10 and
two of 50 for a two-member team's win and 1st place; five rows total. This is
genuinely good coverage of the per-registrant fan-out `0192` added.

### What nothing proves

- **`round_reached` is never tested.** The winners-bracket-only restriction
  (`0065:112-120`) — written precisely so a "round 1" bonus does not misfire on
  the grand final and so round numbers common to both brackets are not
  double-paid — has no test.
- **3rd place is never tested.** `_tournament_award_placements` (`0063:358`)
  resolves third as the entry eliminated in the losers final; the 2-entry fixture
  has no losers bracket, so `:406-409` never runs.
- **No browser spec renders `RewardsPanel` with a populated ledger.** The 19
  specs cover `list`, `register`, `team`, `host`, `page` and `tv`; none drives
  `state=complete`, and the rewards standings and payout history are therefore
  never measured for contrast, tap targets or overflow.

---

## 7. The TV stage: which width, if any, is pinned

**No spec pins the projector width, and 1920 is never driven by a default run.**

- `tools/browser-verify/routes/_shared.mjs:11` — `export const WIDTHS = [375, 1440];`
- **No tournament spec declares a `widths` override.** Grepped all 19 files under
  `tools/browser-verify/routes/tournaments*`: `widths` appears once, in prose
  (`tournaments-view-tv-status-live-field-8-state-live.mjs:6` — *"The harness
  widths are a phone and a desk; the projector figure is a third width the report
  quotes from `--width 1920`"*).
- Enumerated programmatically from `ROUTES`: all 19 tournament entries resolve to
  `375,1440`.

The specs are written **width-agnostic on purpose** rather than left un-pinned by
oversight — `tournaments-view-tv-status-live-field-4-state-live.mjs:131-137`:

> *"`.tv-body` is a `<main>`, so a 1920-wide … went full bleed. Measured before the
> fix at 1920x1080: stage 880/1920, and the up-next entry names laid out at ZERO
> pixels wide. This asserts the stage takes the width it is given, at whatever
> width the harness is running."*

That assertion (`stage:full-width`, `cap:none`) is the right shape — it catches a
cap at any width. What it means in practice is that **the projector figure is
opt-in: it is measured only when a session remembers `--width 1920`.** *(Item 6.)*

**So I ran it.** `npm run verify:browser -- --route "view=tv" --width 1920`:
**4 route/width runs, 65 measurements, 0 outside threshold.** Including
`tap-target [the exit control] smallest 400.2x63.8`, `contrast [the exit control
word] 15.86:1`, and the hit-test
`["exit:present","pair:present","covers-the-pair:no","covers-the-stage:no","hit:exit"]`.

I rasterized it and looked: full-bleed, `WINNERS ROUND 1` and the two entry
banners at projector scale, the clock, and the join address
`ideabosco.com/tournaments/sim-demo` along the bottom. Zero horizontally-scrolling
elements at 1920x1080. **The TV stage is projector-ready.**

The `REPORT A PROBLEM` pill does sit in the bottom-right of the projector image.
That is known and deliberate — `TvStage.svelte:851-861` explains that
`SiteFeedback` is a root-layout mount owning that corner at every width, and that
the footer is left-packed and wraps (`order: -1`) *because* Chromium refused to
click the exit control when it was written into the right end. Not a finding.

---

## 8. The browser pass, and what rasterizing caught

**Default widths — `npm run verify:browser -- --route tournaments`:
36 route/width runs, 966 measurements, 0 outside threshold.** Server boot 6.4s,
total 99.2s.

Then I rasterized, because this Chromium paints no scrollbar into a screenshot.

### The 16-entry bracket at 375px

| | value |
| --- | --- |
| page `scrollWidth` / `clientWidth` | 375 / 375 — **no page overflow** |
| `.bracket-scroll` | `clientWidth` 337 -> `scrollWidth` **1384** (**+1047px hidden**) |
| `.bracket-section` / `.rounds` | 337 -> 1384 and 337 -> 917 |
| `overflow-x` | `auto` |
| `scrollbar-width` | `auto` (**not** `none` — the region does not hide its bar) |
| `offsetHeight - clientHeight` | **0** — overlay scrollbar, no reserved gutter |
| scrolls for real | yes (`scrollLeft` 0 -> 500) |

So the harness's `horizontal-scroll` check is right to read 0px: the page does not
overflow, a nested region scrolls. **75% of the bracket is off-screen at phone
width with no persistently painted scrollbar.**

**Looking at the raster, that is fine, and the reason is visible rather than
argued:** the next round's column is drawn *partially* at the right edge —
`WINNERS ROUND 2` with two `TBD` nodes clipped mid-column — which is itself the
affordance that says there is more sideways, and a `FULL SCREEN` control sits
directly above the bracket. Round 1 is fully legible: match ids, entry marks,
names, seeds, the `LIVE` tag. This satisfies the intent of *"no region may hide its
scrollbar"* — the bar is not suppressed, it is the platform's overlay bar — and
the partial column plus the full-screen control carry the meaning. **No finding.**

### FINDING 8a (cosmetic) — the entry chip clips its own text

Four `span.entry-chip` elements report `scrollWidth` 6-7px past `clientWidth`, at
**both** 375 and 1440 (`128->134`, `140->146`, `141->148`, `135->141`). It is not a
width problem — it is the same at desk width — so it is padding or the glow
inset, and it costs the last few pixels of a display name. Cosmetic, in
`src/lib/tournaments/EntryChip.svelte`. Written down, not fixed.

### The states no browser spec covers

The 19 specs cover `view=list|register|team|host|page|tv` crossed with
`state=live|open` and `status=live|registration_open`. **Neither `seeding` nor
`complete` has a spec** — so the seeding console a host uses for the ten minutes
before the bracket generates, and the final standings every student looks at
afterwards, are unmeasured at both widths.

---

## What must be true by 2026-09-22

Ranked. Each is **already true**, a **build**, or **a thing Mr. Pina does in a
room**.

**1. `0192` is applied to production. — MR. PINA, before anything else.**
Unverifiable from here (no database route, §0). If it is not applied, a team entry
pays one registrant instead of all of them and admin hosts do not exist. Paste
`tools/idea-status.py`'s probe block into the Supabase SQL editor and check for
`tournament_entry_members` and `tournament_reward_ledger.member_id`. Everything
else on this list assumes it is applied.

**2. The losers bracket is run once, on a real field, before the 22nd. — MR. PINA,
in a room (30 minutes).** §2. No test and no spec has ever executed the
losers-bracket construction, the even-round slot reversal, or the losers-final ->
grand-final-B pointer on a field with `v_r >= 2`. A full dry run at the real entry
count — generate, play every match to a champion, including at least one bye —
would exercise in half an hour what nothing in the repo exercises at all. A build
(a real-SQL test over an 8- and a 5-entry field) is the durable answer and is
worth doing after the event; it is **not** worth doing instead of the dry run,
because the dry run also catches the operational items below and a test does not.

**3. A decision on what the rewards panel promises. — MR. PINA, one decision;
then a small build.** §6a. `tournament_reward_ledger` never reaches
`coin_transactions`; the panel says "Payout history" and renders bare numbers.
Either (a) the wording changes to say the coins are logged separately — a
copy-only change to `RewardsPanel.svelte:85,101` — or (b) the coins genuinely move,
which is a migration and not a nine-day change. Whichever way, the panel and
`DeleteTournament.svelte` should agree on `i¢`, and `RewardsPanel.svelte` should
join `COIN_SOURCES` in `tests/coin-symbol.test.ts`. **If nothing is done, decide
now what is said to a student who asks where their coins are.**

**4. The host knows a generated bracket cannot be regenerated. — ALREADY TRUE in
the code; MR. PINA must know it.** `tournament_generate_bracket` raises *"A
bracket already exists for this tournament"* (`0062:1616`), and the only
`delete from tournament_bracket_matches` scoped to a tournament is inside
`tournament_delete` (`0066:115`, `0068:107`, `0192:1538`). **Pools are
regenerable until a result is recorded (`0062:1452`); brackets never are.** So
the field must be exactly right before pressing generate — the only undo is
deleting the whole tournament. `seeding -> registration_open` (§1) is free and
reversible; `-> live` is not.

**5. The host knows a result is permanent once the next match starts. — ALREADY
TRUE in the code; MR. PINA must know it, and may want a decision.** §3a.
`_tournament_check_unwindable` refuses a correction when any downstream match is
`in_progress` or `complete`, and no reset RPC exists, so the refusal's advice
*"Correct or reset that match first"* cannot be followed. **Operational rule for
the 22nd: confirm a score before starting the next match.** §3b is the related
decision — a corrected match pays the new winner nothing and the wrong winner
keeps their row; that is deliberate (`0063:16-21`) and Mr. Pina should confirm he
accepts it.

**6. The projector is measured at its real width before the day. — ALREADY TRUE,
measured here.** §7. 4 runs / 65 measurements / 0 outside threshold at
`--width 1920`, rasterized and inspected. No spec pins 1920 (`_shared.mjs:11`,
`WIDTHS = [375, 1440]`), so this is worth re-running with `--width 1920` after any
change to `TvStage.svelte`, and worth a `widths: [375, 1440, 1920]` override on
the four TV specs as a small build.

**7. Byes, forfeits and the grand-final reset behave. — ALREADY TRUE, proven.**
§2 (four surfaces name a bye in words), §4 (`tests/db/tournament-entry-members.test.ts:1122`,
real SQL, a forfeit pays 0 rows), §5 (`:1134` and `:1150`, real SQL, the reset is
created and settles the champion). Verified here: 57/57 in that file, 143/143
across the five pure tournament files and `coin-symbol`, no skips.

**8. Entering cannot cost coins and debt cannot withhold a reward. — ALREADY TRUE,
three layers deep.** §6, Q1 and Q2. `check (amount >= 1)` at the table
(`0063:205`), `raise` in the RPC (`0063:304`), `min="1"` and `parseAmount` in the
form (`RewardRulesEditor.svelte:57`); the debt gate is purchases-only
(`0070:593`) and `competition_winnings` is an `award` (`0070:241`). The
charge-then-validate sweep is clean: every `_coin_insert` follows every refusal.
**Nothing to do.**

---

## Deliberately not done

Read-only bundle: **no source file was changed** and nothing above was fixed. Four
lanes (0196, 0197, 0200, 0201) are in flight and a fix here would conflict with
them. `node_modules` was restored with `npm ci` (never `npm install` — the
lockfile-reformat trap); `git diff --stat package-lock.json package.json` is
empty.

**Not verified:** anything about production's applied migration set (§0); any
signed-in surface (the harness covers `/dev` routes only); web fonts (the harness
blocks every non-loopback request, so all text above is measured in the fallback
stack); `prefers-reduced-motion: reduce` (the harness runs `no-preference`).

**Ledger entries 0196 and 0197 exist on no ref** — scanned every
`refs/remotes/origin` for `docs/prompt-ledger/entries/019[6-9]-*` and found only
0198 and 0199. If those two lanes are in flight, their entries have not been
pushed.
