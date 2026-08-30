---
title: "The classroom song queue (`0145`)"
date: 2026-08-28
branches: [claude/classroom-song-queue-knacpm]
migrations: ["0145"]
subsystems: ["IDEA Classroom", "IDEA Coin economy"]
---

A student pastes a link to a song; an instructor of that section approves or
rejects it; approval charges the student two coins. The approved list is what
the instructor plays from. It sits in a card beneath the hall pass at the top of
the class page.

Asked for by a student on 2026-08-21 -- "a program on the website for if a
teacher wants music to be played in the class, and it can be uploaded by
students and moderated by instructors" -- and built as a **moderated request
queue** rather than as the thing that sentence literally describes.

### The scope, which is most of the design

**It accepts no bytes.** No bucket, no storage policy, no ingest, no
`mime_type`. A request is an https URL and an optional note. That removes the
copyright question the school would otherwise have to answer about audio a
student uploaded, and an audio-playback safety question this codebase has never
measured. `0133` made classroom uploads cheap and safe, which is precisely what
makes "just add a bucket" the easy wrong instinct: the reason there is no bucket
is not that it would have been hard.

**Nothing plays.** No column is a duration, an offset or a position; there is no
ordering column meaning "next"; the component contains no `<audio>`, `<video>`,
`<iframe>` or `<embed>`. An instructor opens the approved list and plays from
whatever they already use.

**No service is parsed or special-cased.** `_classroom_song_url_ok` asks one
question -- is this https with a host -- and never which host. `songLinkLabel`
prints a host for legibility at 375px and branches on nothing. A per-service
integration is a maintenance commitment against somebody else's URL formats for
a feature worth two coins, and the instructor is already the filter a parser
would be pretending to be.

All three are swept for in `tests/classroom-song-queue-surface.test.ts`,
**over comment-stripped source**. The first run of that file failed on both
sweeps because these files document their own boundaries at length and the raw
substring search found the sentence saying the thing is absent. Each stripper is
now paired with a control asserting what survives, because a stripper that
removed everything would make every absence assertion vacuous.

### The price moved, which is a change to a live row

`0070` priced `song_request` at 3i¢ with the note "Approval-gated: nothing plays
until reviewed. The price is for the request, not a guarantee it gets played."
Under the new rule that sentence says the opposite of the truth -- requesting is
free and the coins are charged at approval, so the price is now exactly a
guarantee it gets played. Section 7 updates the row in place: **2i¢, and a note
describing what actually happens.**

**The id is kept.** `song_request` is a stable key that
`coin_transactions.category_id` references; a new id would orphan every charge
already logged and leave two categories meaning one thing.

**Rows already logged at 3i¢ are untouched**, and the migration says so with a
count. They are history: somebody really was charged three coins under the old
rule, and `coin_transactions` is append-only with no UPDATE grant precisely so a
price change cannot rewrite what happened.

The update is a plain UPDATE to fixed values, so it converges on re-application.
It is deliberately **not** guarded against a later admin edit, because `0080`
gives an admin no way to change a price at all -- `coin_admin_set_category_active`
only flips `active` -- so the SQL editor is the one place this number can move
and a re-paste of the file is a statement about what it should be.

### The purchase RPC, and why the charge does not go through it

**The real purchase path is `public.coin_log_transaction(text, text, integer,
numeric, text, text)`** -- introduced in `0070`, given `p_medium` in `0096`
(which dropped the five-arg form first, per the signature trap). Every existing
caller reaches it from an admin-gated RPC.

**It could not be used here, and the reason is measured rather than assumed.**
Its first line is `if not public.is_admin() then raise`, and a nested SECURITY
DEFINER call does not escape that: `is_admin()` reads the session's JWT claims,
so it answers about the original caller. The approver here is a section manager,
and `classroom_manages_section` is `is_admin() OR teacher_email = me` -- the
teacher of record is the normal case and is not an admin. Calling it would raise
"Only site admins can log IDEA Coin transactions" for exactly the person this
feature is for. `tests/classroom-song-queue.test.ts` asserts all three legs of
that directly: the fixture teacher manages the section, `is_admin()` is false
for them, and `coin_log_transaction` genuinely raises when they call it. **If
that last assertion ever stops holding, the duplication below can be retired.**

So `classroom_song_approve` mints the row itself, and the duplication is held to
two lines by using the existing single implementations for everything else:
`_coin_insert` is the row shape (actor, semester key, medium, transfer id) and
is called rather than reimplemented; `_coin_balance` (`0096` section 4, which
exists because there were seventeen inline copies of it) is the balance
derivation; and **the price is read from `coin_categories` on every approval**,
never written down in the migration. A test moves the row to 7 and asserts the
charge follows, so there is no second copy of the number.

What is genuinely restated is that a `purchase` is signed negative and that an
already-negative balance refuses one. **The retrofit that would remove it is
named in the migration header**: give `coin_log_transaction` an authorization
seam other than `is_admin()`, or extract its price/sign/debt/insert middle into
a private helper both call. Either is a change to the busiest function in the
coin system and belongs in its own bundle with its own answer for every existing
caller. `grep _coin_insert` finds both minting sites in the meantime.

### What this coin system does when somebody cannot pay, read off `0096`

- **Balances may go negative.** The lockout fires only while the balance is
  *already* negative; a purchase that itself dips a non-negative balance below
  zero is allowed. So a student at 0i¢ can have a song approved and lands at
  -2i¢. This feature does not tighten that -- a test pins the boundary at exactly
  0 (approvable) and -2 (refused), because one feature quietly enforcing a
  stricter rule than the coin desk is the kind of divergence nobody would notice.
- **The refusal is `{ok:false, reason:'debt', ...}`**, structured jsonb rather
  than a raise. `0145` answers with the same word.
- **It is the digital balance.** `0096`'s two media are "coins handed over in
  class" and "credited digitally"; an approval happening in the app with nobody
  handing over a coin is digital by that definition. A test seeds a -50 physical
  balance and confirms the approval still lands, which a total-balance check
  would have refused.

The refusal **names the student**, because the instructor is who has to act on
it, and **nothing is written at all** -- the request stays pending, unmarked and
unmoved, so the same press works later with nothing to undo.

### A half-completed approval is unrepresentable, not merely avoided

Two independent mechanisms, and the second is the one that matters:

1. **One transaction.** A plpgsql body runs in the caller's transaction, so the
   coin insert and the flip commit together or roll back together.
2. **`classroom_song_requests_approved_is_charged`**, a CHECK saying
   `(charge_transaction_id is not null) = (decided_at is not null and
   rejection_reason is null)` -- **approved if and only if charged**. Reason (1)
   is the mechanism; reason (2) is what survives somebody changing the
   mechanism.

Both halves are attempted **as the connection owner**, past RLS and past every
grant, so nothing but the constraint can be what refuses. Mutating the RPC to
flip the row without minting a coin makes the RPC itself fail with
`23514 check_violation` rather than silently half-completing -- measured, and 11
tests redden.

### The cap, and why it is a lock rather than an index

Three coins was the only throttle, and it was never described as one. Making the
request free removed it, so the cap is now a rule: **three open pending requests
per student per section**, `_classroom_song_pending_cap()`, written down once.

It counts **pending only**, which makes it a queue-depth limit rather than a
quota: a decided request stops counting immediately, so a student whose songs
get played can keep asking and one who never gets reviewed cannot flood the
queue.

**It is `select ... for update` on the enrollment row, and that differs from
`0143` deliberately.** `0143` caps at one and can therefore be a partial unique
index -- the cap and the uniqueness are the same statement. A cap of three has
nothing to be unique on: it would need a synthetic slot number, which is a
stored value that can drift from the rows it counts and that a delete leaves a
hole in. So this takes the shape CLAUDE.md's own "SQL traps" section prescribes
for a capacity check that is not a uniqueness. The enrollment row is the parent:
exactly one per (section, student), guaranteed to exist by the composite foreign
key, and the natural parent of "this student's requests in this class". It is
not `pg_advisory_xact_lock` -- `0139` needed one because its window is
`now()`-relative and a volatile expression cannot appear in an index predicate,
leaving no row to lock; here there is a row.

`tests/classroom-song-queue-race.test.ts` forces and then **observes** the
overlap rather than sleeping: the third request is made inside an uncommitted
transaction, the fourth blocks, the block is waited for in `pg_stat_activity`
(`wait_event_type = 'Lock'`), and the second promise is asserted unsettled at
that moment. It also asserts the lock is **per student** -- Ana's in-flight
submit must not block Ben's, which locking anything shared would have done while
passing every other test.

### Disclosure

- **An enrolled student** sees the approved list for their section, plus their
  own requests in every state with their own rejection reasons, plus their own
  pending count. They never see another student's pending or rejected request in
  any form -- not the row, not the url, not the note, not a count, not the fact
  that one exists.
- **An instructor of the section** sees everything, with names.
- **Anyone else** gets NULL, the same answer a nonexistent section id returns.

Three independent enforcements, `0143`'s shape: the table has RLS on with **no
policy and no grant** (either half alone denies every select, and a student
selecting it raw gets `42501`, asserted as a permission error rather than as an
empty result); the read function builds two objects in **two separate branches**
rather than stripping fields from one; and the student's own query is pinned in
its WHERE clause to `r.student_email = v_email`.

**The approved list carries no requester name for a peer, and that is the one
disclosure judgement in this bundle nobody handed down.** An approved song is
going to be played out loud in the room, so the song is public within the class
by construction; who asked for it is not, and attaching a student's taste in
music to their name in a list thirty classmates read buys the feature nothing it
needs. The requester sees `mine` on their own rows and the instructor sees every
name. `SongApprovedRow` has no `student_name` and no `student_email` **as a
property of the type**, so the component has no expression that could render
one. Adding a name here is a disclosure decision, not a field addition.

### Mutation proof

Six mutations, permissive direction, migration restored byte-identically after
each (md5 `6513cc94495bb0272f51d3b77e76d6fe`, verified). The first attempt at the
table-opening mutation was caught by the migration's **own self-check** before
any test ran, so it was re-applied past that block to make the tests do the
work.

| mutation | reddens |
|---|---|
| table opened (`grant select` + `using (true)`) | 2 |
| student's own-rows pin removed from the read | 3 |
| manage check removed from both decision RPCs | 2 |
| cap check removed | 3 in the main file, 2 in the race file |
| **`for update` removed, count kept** | **0 sequential, 2 in the race file** |
| approved-is-charged constraint dropped | 2 |
| approval flips without minting a coin | 11 |
| debt lockout removed | 2 |

**The lock row is the one worth reading.** Removing it left all 36 sequential
tests green; only the race file caught it, by timing out waiting for a block
that never came. That is the count-then-insert defect, and it is invisible to
every test written as a sequence.

The client-side reason-parity guard was mutated too: renaming one `reason` in
the migration reddens two assertions, which is a refusal that would otherwise
reach a student as "Something went wrong. Try again."

### Verified

- **`svelte-check`: 0 errors, 37 warnings, mix 31 / 5 / 1** -- the documented
  baseline, unmoved, re-derived after `svelte-kit sync`.
- **Full suite before: 143 files, 3255 tests, all passing.** After: 146 files,
  3314 tests, all passing.
- **375px and 1440px, in the harness Chromium (141.0.7390.37)**, transitions
  frozen and animations left running:
  - **Horizontal overflow: 0px at both widths** (scrollWidth == clientWidth).
  - **23 buttons and inputs at exactly 44.0px, hit fraction 1.0**, matching the
    hall pass controls.
  - **20 `tap-reach-44` links: box 24.3px, hit-tested reach exactly 44.0px, hit
    fraction 1.0, 0 taps stolen from the 15 buttons.** Measured by walking
    `elementFromPoint` outward from each link's centre, never by reading a
    computed height -- the reach is a pseudo-element.
  - **Contrast: 19 values composited over the real rendered ground by painting
    to a canvas, 0 below threshold**, worst 4.02:1 on the card edge (a boundary,
    needing 3:1). The three status chips measure 5.91 (teal), 7.91 (green) and
    6.06 (amber) against 4.5.
  - **The read-only mount renders 0 inputs, 0 Approve and 0 Reject against 2/2
    on the identical payload with transports handed in** -- read-only is
    structural, not a flag.
  - **0 student mounts contain any name or email**, against a positive control
    confirming the manager mount does.
  - Interaction: the student submit carries no identifier, both decisions carry
    the request id, and the reject-send control is `aria-disabled="true"` on a
    blank reason and `"false"` on a real one.

### An instrument note

**Playwright's `locator.click()` refuses an `aria-disabled` control**, timing
out on its actionability check. That reads exactly like a dead button and is
not one: a real `page.mouse.click()` at the control's own coordinates lands, and
the capped Request button answers "You already have 3 requests waiting in this
class..." while sending nothing. This matters because `aria-disabled` over
`disabled` is a deliberate rule here -- a genuinely disabled control swallows
the tap and can never explain itself -- so the instrument refuses exactly the
control the rule exists to create. **Drive such a control with `page.mouse`,
and scroll it into view first**: an `elementFromPoint` probe on an off-screen
control reported `hitsSelf: false` and read as an overlap that did not exist.

### Not verified

- **`0145` has not been applied to the live database**, and nothing in this
  session could apply it. Every claim about it is against embedded Postgres
  running the real migration chain.
- **No signed-in browser pass.** The class-page mount was verified through the
  dev harness only; `/classroom/<section>` needs a real Bosco Tech Google
  session.
- No real coin was moved anywhere.

### Owed, and deferred

- **`/dev/song-queue` is NOT registered in `tools/browser-verify/routes.mjs`.**
  Another session owns that directory this week. It is a one-line addition and
  would put this surface into the automated 375/1440 sweep; until it happens,
  every number above has to be re-measured by hand. The same debt is recorded in
  `/dev/hall-pass`, which is still unregistered from `0143`/`0144`.
- **A student cannot withdraw their own pending request.** A mistyped link burns
  one of three slots until an instructor decides. The instructor rejecting it is
  the designed path and is one tap, so this is a real but small usability hole
  rather than a defect; adding a withdraw RPC is a deliberate bundle.
- **No notification of any kind.** A student learns their request was decided by
  looking, or by the card's 90-second poll while the page is open.
- **The pending cap is not configurable per section.** It is one constant in one
  function, which is the right shape until somebody asks for a second number.
