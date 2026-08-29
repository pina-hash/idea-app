---
title: "Eleven concurrency-shaped tests audited, five guards mutated, and one instrument that measured the wrong lock"
date: 2026-08-29
branches: [claude/concurrency-test-audit-l32vmw]
migrations: []
subsystems: ["Testing", "Classroom", "Coin economy", "Foundry"]
---

## Eleven concurrency-shaped tests audited, five guards mutated, and one instrument that measured the wrong lock

No migration, no `src/` file and no tool moved. Two test files changed.

`docs/history/gauntlet-practice-rate-limit-xm7ye3.md` found that the obvious
concurrency test -- N simultaneous calls, assert one wins -- passed 31 times out
of 31 against a function whose advisory lock had been deleted, because the role
switch ahead of each `asUser` call staggers the callers past each other. This
bundle asks the same question of every other test in the suite that is shaped
like a race: **does it actually bite, or is it certifying nothing?**

The answer is better than feared and not clean. **Every guard's FILE bites. One
individual TEST is vacuous and is now labelled as such. And the deterministic
instrument written to replace it was itself wrong on the first attempt, in a way
that would have shipped a green test measuring a foreign key.**

### The classification, which is most of the value

Eleven files name `Promise.all` or `pg_stat_activity`. **Five of them are not
concurrency tests at all** and were named as such so the real list stayed short:

| file | why it matched | verdict |
|---|---|---|
| `gauntlet-knowledge-clock` | a COMMENT reading "SEQUENTIALLY, never `Promise.all`" | not a concurrency test |
| `gauntlet-target-disclosure` | the same comment | not a concurrency test |
| `rich-text-nested-lists` | `Promise.all` mapping a corpus through a SQL gate | speed only |
| `rich-text-nesting` | the same corpus map | speed only |
| `vanguard-admin-gate` | two independent renders awaited together | speed only |

**Six claim a concurrency property.** One of those, `gauntlet-practice-meter`,
is the reference instrument the previous bundle built and proved (3/3 reddening,
recorded there); it was not re-proved here. The other five were each put to a
mutant of the guard they believe they are testing.

### What each one believes it is proving, and whether it does

Every mutant was applied to a SCRATCH COPY of the migration in the scratchpad,
reached by a chain entry that escapes `supabase/migrations` with a relative
path, so **nothing under `supabase/migrations` was written at any point**. The
scratch TEST file was created and deleted by the driver; the tracked test files
were never opened for writing during a mutation run, so **`git checkout --` was
not used anywhere** -- it restores from HEAD rather than from what a script
saved, and three sessions have lost their own uncommitted work to it.

| file | guard it believes in | mutant | result |
|---|---|---|---|
| `classroom-hall-pass-race` | partial unique index, one open pass per section | `create unique index` to `create index`, same NAME so 0143's own self-check still passes | **RED 3/3**, 6 of 7 tests |
| `classroom-song-queue-race` | `for update` on the enrollment row, count taken after | the `for update` deleted | **RED 3/3**, via its blocking instrument -- **but its burst test stayed GREEN** |
| `classroom-submission-open-race` | `on conflict ... do nothing` plus a re-read | the conflict tolerance deleted from `classroom_open_submission` | **RED 3/3** |
| `foundry-app-cap` | the per-person profile lock 0141 deliberately kept | see below | **RED 3/3**, on exactly the concurrency test |
| `coin-contracts` | `for update` on the parent contract row | the `for update` deleted from `coin_contract_self_claim` | **RED 3/3** overall, but see below |

### The four capacity rules the prompt singled out

- **The hall pass is sound, and its instrument is the right one for an INDEX.**
  This is the case the prompt asked to be reasoned about separately: a partial
  unique index cannot be held from outside by a lock statement the way an
  advisory lock or a row lock can. What holds it is **an uncommitted INSERT** --
  student A opens the pass inside an explicit transaction, which creates the
  index entry without making it visible, and B's insert must wait on it. The
  test polls `pg_stat_activity` for that wait and then asserts B's promise
  UNSETTLED, which is the proof of overlap. With the index non-unique there is
  nothing to wait on, the poll times out, and the file reddens before it reaches
  any outcome assertion. It also reddens for a second, simpler reason worth
  knowing: with no uniqueness all four burst callers win, so that outcome is
  wrong whether or not they overlapped.
- **The song queue is sound and its burst is not.** The blocking instrument
  reddens 3/3. The test beside it, headed "THE BURST, WHICH IS THE CASE A
  COUNT-THEN-INSERT ACTUALLY LOSES", **passed 3 runs out of 3 on a function with
  no lock in it**. Four concurrent submits from one student left exactly three
  rows on code that could not have enforced that, because the callers never
  overlapped. That is the gauntlet finding reproduced exactly, one subsystem
  over.
- **The Foundry lock is real, and 0141 defends itself.** The first mutant --
  deleting `perform 1 from public.profiles p where p.id = v_uid for update` --
  never reached the test: the migration's own section 5 raises `The per-person
  lock is missing from foundry_create_app` on `v_src not like '%for update%'`,
  so the chain failed to apply and 14 tests SKIPPED. That is defence in depth
  working, and it is also a mutant that proves nothing about the test. The
  second mutant keeps the words `for update` in a COMMENT -- so the migration's
  self-check AND the test's own `prosrc` assertion both still pass -- while the
  executable lock is gone. That is the function that LOOKS locked and is not,
  and the concurrency test alone reddens on it, 3/3.
- **The submission open race is sound, and it is the best-shaped file of the
  five.** It fires the same burst at TWO databases, one whose chain stops at
  0133 and one with 0134 over it, and the 0133 run must raise at least once or
  the test fails its own premise. That control is what makes its burst
  legitimate where the song queue's is not: the burst is only trusted because a
  paired measurement proves it genuinely overlapped.

### Coin contracts: sound, unlisted, and proven only by luck

`coin_contract_self_claim` is a fifth capacity rule -- N slots on a contract, N
students racing -- and it is NOT in the prompt's list. Its concurrency proof was
a bare `Promise.all` of five claims, exactly the shape the gauntlet bundle
disproved.

**It does bite**, which was the surprise: with the `for update` gone, a 1-slot
contract accepted as many as **4 of 5** claims. But it bites BY CONTENTION,
which the suite does not control. Across three runs of the mutant the
five-round one-slot race reddened 3/3 while the three-slot burst reddened 1/3.
A guard proven only that way is one whose proof can go quiet on a loaded
machine, still passing.

### The instrument that measured the wrong lock

Both replacements hold the row the RPC needs from a separate transaction and
measure how long the call then waits, with a positive control on the same clock
so a slow database cannot pass for a held lock. **The first draft of that used
`for update` as the holder, and it was green 3 of 3 against the lock-deleted
coin mutant.**

The reason is the whole point of writing it down: `coin_contract_claims.contract_id`
is a **foreign key**, so the RPC's INSERT takes `for key share` on the parent row
on its way past, and `for key share` conflicts with `for update`. The holder was
stalling the claim through the FOREIGN KEY whether or not the function locked
anything itself. The instrument would have shipped green, looking deterministic,
and measuring a constraint rather than a guard.

**`for no key update` is the discriminator.** It conflicts with `for update` and
NOT with `for key share`, so the only thing that can wait on it is the RPC's own
`select ... for update`; the FK check walks straight past. Both replacements use
it and both now redden 3/3.

**`classroom_song_requests` has the same parent/child shape** -- 0145's header
calls the composite foreign key the guarantee that the enrollment exists -- so
the song queue instrument had the identical latent defect and took the identical
fix. It was caught there by inspection rather than by measurement, because the
coin case had already shown what to look for; that is stated rather than
implied.

### What changed in the tree

- **`tests/coin-contracts.test.ts`**: a new describe block, `concurrency: the
  capacity lock, held from outside and measured`, with two tests -- the wait
  measurement plus an uncontended control, and a per-contract keying check whose
  expectation is INVERTED so it cannot pass by the clock being slow either. The
  existing bursts are kept and their comment now records the measured reddening
  rates rather than claiming to be the proof. 19 tests to 21.
- **`tests/classroom-song-queue-race.test.ts`**: the same instrument on the
  enrollment row, and the vacuous burst DEMOTED in place rather than deleted --
  its row-count assertion is still worth making, so it keeps it under a comment
  saying in as many words that it is green on a function with no lock in it and
  must never be read as evidence, that the test above is the evidence, and that
  a bigger burst would not help. 4 tests to 5.

Nothing was deleted. A vacuous test whose OUTCOME assertion is still true is
worth keeping once it stops claiming to be a proof; what makes it dangerous is
the comment above it, not the assertions in it.

### Counts

**Audited 11. Not concurrency tests 5. Claiming a concurrency property 6** (one
of which, `gauntlet-practice-meter`, was proven by the previous bundle and taken
as read). **Mutated 5, all five files RED 3/3. Vacuous individual tests found:
1** (the song queue burst), **plus 1 probabilistic** (the coin three-slot burst,
1/3). **Replaced/added: 2 deterministic instruments**, each with a positive
control, each verified RED 3/3 against the same mutant that its file's burst
either passed or failed only sometimes.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `npx svelte-kit sync` with placeholder `PUBLIC_SUPABASE_*` exported per the
  fresh-checkout rule. Unchanged, and necessarily so: no file under `src/` was
  touched.
- **Full suite: 171 files / 3660 tests before, 171 files / 3663 tests after.**
  Both all-passing. The delta is exactly the three tests added here.
- **Started from `origin/integration` (`b4ceb02`), not `main`.** The checkout
  arrived on `origin/main` (`d8405aa`), which was **11 commits behind**
  integration -- the staleness the prompt warned about, present again.

### Not verified

- **The live project.** Nothing here can reach it; every number is the embedded
  Postgres fixture with the real migration files applied unmodified.
- **No browser pass, and none was needed.** No rendering path was touched.
- **The five files judged "not concurrency tests" were classified by reading
  them, not by mutation.** Each match is a comment or a corpus map with no
  concurrent guard behind it, so there is no guard to delete; a mutation proof
  for them would have nothing to mutate.
- **`gauntlet-practice-meter` was not re-proved.** Its 3/3 reddening is the
  previous bundle's measurement, taken as read.
- **The absolute wait thresholds (500ms floor, 400ms control ceiling) are this
  machine's.** They carry the measured value in the failure message so a
  threshold that ever becomes wrong says what it saw, but they have not been run
  on a loaded CI box.

### For whoever is next

- **The pattern to copy is `for no key update`, not `for update`, whenever the
  locked row is a PARENT in a foreign key.** Any future "hold the row and
  measure the wait" instrument over a parent/child pair has this trap in it, and
  it fails silently in the safe-looking direction: green, deterministic-looking,
  and measuring the constraint.
- **The three remaining bursts are not defects and should not be swept.** The
  hall pass burst reddens structurally, the submission burst carries its own
  pre-migration control, and the coin bursts now sit beside a deterministic
  instrument. What they must not do is stand alone.
- **A mutant that stops the migration applying proves nothing.** The Foundry
  first attempt is the case: 14 SKIPPED reads as a strong red and is actually a
  chain that never built. Check the test COUNT, not just the colour.
