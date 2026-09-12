---
title: "`ideacad_documents` held one feature tree, so there was nothing to check out: `0207` makes a document hold ordered PARTS, each with its own tree, and puts a row-locked exclusive hold on the part -- with the staleness rule recorded as this assistant's own (`claude/amazing-bohr-qxhly9`, ledger 0183)"
date: 2026-09-12
branches: [claude/amazing-bohr-qxhly9]
migrations: ["0207"]
subsystems: ["IdeaCAD", "Classroom", "Database", "Testing"]
---

Ledger 0179 finished the sharing half of decision 24 and left a sentence behind:
**`ideacad_documents` holds EXACTLY ONE FEATURE TREE, so THERE IS NOTHING TO
CHECK OUT YET.** This bundle confirmed that reading against `0201` before writing
anything, and then removed it.

## The blocker, confirmed rather than taken on trust

The reading is right, and it is worth stating precisely because the schema LOOKS
like it already holds several trees. It does: `ideacad_concepts` is one row per
feature tree and a document has many of them. But `0201`'s concepts are
**competing alternatives of one part**, not parts of one machine --
`ideacad_predictions` exists to ask which of a student's concepts they think will
win, and `ideacad_documents.active_concept_id` names the single tree the editor
is showing. Measured on the file: `unique(item_id, student_email)` on line 14,
one `active_concept_id` column, and no row anywhere that means "the hex shank" as
distinct from "the blade".

So there was no unit of ownership. A checkout has to claim something, and the
schema had nothing claimable in it. That is the whole of why this needed a
migration rather than an RPC.

## Mr. Pina's design, and the one part of it that is not his

His answer of 2026-09-12, in his terms: an assembly has several parts; **one
person holds a part at a time** -- industry checkout, not concurrent editing of
one part, which he named as a real future feature and explicitly did not want
here; switching who holds what must be "extremely easy and intuitive"; and **the
assembly owner has full control** over who is editing what and can reassign
teammates to parts live.

**The staleness rule is this assistant's and is recorded as ours.** He did not
specify one, and without it a holder who closes their laptop owns a part for the
rest of the term. `_ideacad_hold_window()` is ten minutes and is the only
statement of the number. Ten because the client heartbeat is ten SECONDS
(`IDEACAD_HEARTBEAT_MS`), so a live tab sits sixty beats inside the window and
survives a long wifi blip and a tab discarded under memory pressure and restored,
while a machine that was shut down frees its part inside one class period rather
than at the end of the unit. A lapsed hold is **taken over by the next claimant**
and nothing sweeps it -- there is no cron in this repo, and a stored "expired"
flag would be a derived value with nothing to keep it true, so the window is
evaluated at read time every time.

It is written down once because "may a new claimant take over" and "is my own
hold still alive to extend" are the same question about what one sitting is. Two
literals thirty lines apart is exactly how a resume window and a staleness window
stop being the same number, which is the `_foundry_play_window()` lesson.
`tests/db/ideacad-assembly-checkout.test.ts` asserts the single definition AND
sweeps every other ideacad function for a second `interval '10 minutes'` literal.

## What 0207 does

`ideacad_parts` is an ordered part list under a document. A concept gains
`part_id`, NOT NULL, so each part carries its own feature tree and its own
alternatives of it. The hold is four columns on the part row -- `held_by`,
`held_at`, `hold_beat_at`, `hold_revision` -- with a CHECK making the first three
all-null or all-set, so "held by nobody since a time" is not representable. Nine
RPCs, four private predicates and the trigger function.

**Every existing document became a one-part assembly, and the counts are the
proof.** `tests/db/ideacad-assembly-migration.test.ts` boots the chain SHORT of
`0207`, seeds two documents and three concepts through the REAL pre-migration
RPCs (including a second concept, so the fixture carries a document with more
than one tree in it before the column exists), counts, applies the file, and
counts again: **2 documents / 3 concepts / 0 parts, to 2 documents / 3 concepts /
2 parts, 0 concepts without a part, 0 documents without a part, and 0 concepts
pointing at another document's part.** The migration makes the same comparison
from inside its own transaction, carrying the before-counts in a temp table, and
RAISES rather than reporting -- so a backfill that changed a row count cannot
apply. The file was applied three times over the same database; the second and
third are no-ops.

## The constraint that shaped everything: 0201's ten functions are not redefined

`0205` replaces SEVEN of them to admit a shared editor, and `0207` is pasted
AFTER it. A `create or replace` of any of those seven here would have reverted
0205's sharing widening **silently** -- the function would compile, the feature
would look present, and every grantee would quietly start being refused again.

So the ten are untouched, which `tests/db/ideacad-assembly-migration.test.ts`
asserts two ways: `pg_proc` holds exactly one row for each of the ten after
`0207`, and a sweep of the file's own `create function` lines finds none of the
ten names (with the positive control that the sweep does find this file's own
creates, so an empty result is not an empty sweep).

The compatibility is paid by a trigger instead. `_ideacad_concept_part_default`
fills `part_id` on any insert that does not name one, which is every insert 0201
writes:

- **On a document with no parts it CREATES the one-part assembly.** This is the
  `ideacad_open_document` path for a brand-new document, and without it that
  function -- one of the ten -- would have failed outright on the NOT NULL column.
  It works because column defaults are filled in before a BEFORE ROW trigger sees
  the tuple, so `new.id` is already the concept's real id and the part's FK to it
  is deferred to commit. **Measured rather than assumed**: a brand-new document
  opened after `0207` comes out with one part named `Part 1` whose
  `active_concept_id` is the concept that created it.
- **On a one-part document it points the concept at that part.**
- **On a document with two or more parts it RAISES**, naming
  `ideacad_new_part_concept`. There is no honest way to guess which part an
  unqualified concept belongs to, so the multi-part case fails loudly instead.
  The test asserts both directions on one database: the same call that worked
  before a second part was added refuses after, while a single-part document
  beside it still accepts it -- so the refusal is per assembly, not per
  deployment.

A trigger is normally the wrong tool here; CLAUDE.md's "derived, never stored"
exists because a trigger that stops firing leaves a subtly wrong value forever
with nothing to catch it. **This one is the opposite shape.** `part_id` is NOT
NULL, so a trigger that stops firing makes the insert FAIL, immediately and
visibly. It fills a column it cannot silently get wrong.

## The row lock, proved with two concurrent transactions

Ledger 0179 named the trap: a transient exclusive claim needs a ROW LOCK and
never a count-then-insert, or two students racing both acquire it. **Sequential
calls cannot tell those two implementations apart** -- `select then update` is
perfectly correct when nobody is in the middle of it -- so
`tests/db/ideacad-assembly-claim-race.test.ts` overlaps two real transactions on
two real connections and holds the first open until the second is demonstrably
blocked.

- The real function: the second transaction **blocks**, observed from a THIRD
  connection while the lock is held, and when it unblocks it re-reads the
  committed row and answers `{ok:false, reason:'held', heldBy:<the winner>}`.
  One holder, one generation bump.
- **The negative control is the point.** `ideacad_claim_part_nolock` is built
  MECHANICALLY from the shipping function's own `prosrc` with `for update`
  removed -- not retyped, because a retyping characterises what the author
  believed the function does -- and the assertion that the mutation took is part
  of the setup. The same schedule against it lets **BOTH** callers acquire the
  part: two `ok:true` answers, two different `heldBy` values, `hold_revision` at
  2, and the loser's own client believing it holds a part somebody else has.

**The first lock instrument read ZERO while the block was really happening**, and
that is worth writing down because it looks exactly like "nothing was
serialized". `pg_locks where relation = 'ideacad_parts'::regclass and not
granted` finds nothing: a waiter on a ROW lock does not queue on the relation, it
takes a ShareLock on the HOLDER'S TRANSACTIONID, so the ungranted entry has a
null `relation`. Counting ungranted locks of any locktype, cross-checked against
`pg_stat_activity.wait_event_type = 'Lock'`, is what actually sees it. Both
numbers are asserted now.

A note the mutant made necessary: **a block DID still happen in the no-lock
case** -- on the UPDATE, after both callers had already read the row as free.
So waiting on a lock is not on its own evidence that a claim was serialized,
which is why the file asserts the ANSWERS and not the timing.

## Who may claim: a select ladder in SQL

Under `0201` alone only the document's own student can write it, so "one person
at a time" would have had nobody to refuse. `0205` is what makes an assembly a
team, and `_ideacad_can_write_document(uuid)` is its rule.

`_ideacad_part_writer` **delegates** to that predicate -- calling, never copying
-- but a deployment sitting between two hand-applied migrations is a real state,
so it is written as a ladder: it asks `to_regprocedure` whether 0205's predicate
exists, calls it through `execute` when it does, and degrades to owner-only when
it does not. Fail-closed in the degraded direction.

`tests/db/ideacad-assembly-claim-ladder.test.ts` measures **both rungs on one
database, in order**: 0207 alone refuses a classmate and admits the owner; the
predicate created, the same classmate is admitted with no change to 0207; the
predicate dropped, refused again with nothing raised. A ladder that ignored its
wide rung fails the middle case, and a plain call to a function that does not
exist fails the first and last, so neither direction can pass vacuously. It also
pins that a `viewer` grant reads the assembly and is refused the claim, and that
the OWNER-only controls stay owner-only -- 0205 widens editing, never structure.

**A hold is necessary and not sufficient, deliberately.** Holding a part does not
grant the write; the write gate is still 0201's and 0205's, on the concept path.
And `ideacad_assign_part` does NOT verify that the person named can write the
document, because there is no third-party form of 0205's rule to ask
(`_ideacad_document_role` reads `current_user_email()`, per 0138's rule about
when to ask the email-scoped form -- and 0205 did not write one). The owner's
intention is recorded and is visible in `ideacad_assembly`.

## The four properties, each in both directions

`tests/db/ideacad-assembly-checkout.test.ts`, 23 cases.

1. **A second holder is REFUSED while a part is held.** `{ok:false,
   reason:'held', heldBy:<holder>}`, and the refusal is inert: the holder and the
   generation are untouched. Positive control: the same caller succeeds on the
   other part. The holder can RESUME their own live hold, which does NOT move the
   generation -- so their client's revision stays good.
2. **The assembly owner can FORCE a reassignment at any time.** A live hold moves
   from one teammate to another; the answer reports `previousHolder`; the
   generation increments. Refused for a teammate, the teacher and a bystander
   alike. An unchanged assignment answers `unchanged` and must NOT move the
   generation, or every holder on the assembly would be told they lost their
   part. The email is normalised, so `A@x` and `a@x` are one person.
3. **A released part is immediately claimable**, with no window to wait out. The
   owner may release somebody else's hold; a third party gets `not_yours`; a
   double release answers `already_free` rather than failing.
4. **A holder who never releases does not lock the part forever.** At nine
   minutes the takeover is refused and `holdLive` is true -- that is the control
   that makes the next case mean something -- and at eleven minutes the next
   claimant gets `{ok:true, reason:'takeover'}`. The lapsed holder is TOLD rather
   than quietly revived: their heartbeat answers `lapsed`, because anybody could
   have taken the part in the meantime and a client that believes it never lost
   it will overwrite work.

## Live reassignment tells the holder, and the mechanism is the poll floor

`hold_revision` increments every time the HOLDER CHANGES and never when the same
person extends. A client keeps the revision its claim returned and passes it back
to `ideacad_beat_part`; a heartbeat whose revision has moved answers
`{ok:false, reason:'lost'}` and **names who holds it now**. Asserted with its
positive control, so `lost` is not what that function always says.

That is deliberately the DATABASE POLL and not realtime -- the same division of
labour `0201` already has, where the poll is the floor, broadcast is only the
speed layer and no frame may write state. `src/lib/ideacad/assembly.ts` carries
the channel name and `holdFrameAllowed`, which applies the same
known-parts-and-forward-revision filter `frameAllowed` applies in `live.ts`,
because any anon-key holder can forge a frame.

The revision is **not a credential**: every RPC that acts on a hold re-checks
`held_by = current_user_email()` independently of it, so holding somebody else's
number gets nothing. That is why it can be projected to every reader of the
assembly, which matters because "who is on which part" is the thing a teammate
has to be able to see.

## The client surface, and the number that is deliberately absent from it

`src/lib/ideacad/assembly.ts` is types, the RPC boundary, the channel and pure
predicates. **No `.svelte` file is touched** and nothing in it renders.

It is self-contained rather than folded into `transports.ts`, which belongs to
ledger 0179's lane in flight; wiring `IdeacadAssemblyTransports` into
`IdeacadTransports` is one line for whoever owns that file next.

**The staleness window is not written down in this file.** `ideacad_assembly`
returns it as `holdWindowSeconds` and every predicate takes the number as a
parameter, so there is no second copy of a rule the database owns. `holdIsLive`
takes `now` as a parameter for the same reason CLAUDE.md gives: a component that
reads its own clock silently disagrees with the payload it is rendering.

`holdLostAgainst` answers false for a revision BEHIND ours -- that is a stale
read, not a loss, and answering true for it would tear down a live editor over a
slow poll.

## The grant shape, and the guard interaction this bundle reproduces

`0166`'s shape, revoking from `public, anon, authenticated` **by name**, because
this project's default privileges write a direct `anon` grant that
`revoke ... from public` never touches. Measured after the whole chain: **0 of
this file's 14 functions are anon-executable**, and `anon` holds none of the
seven table privileges on `ideacad_parts` while `authenticated` holds SELECT and
nothing else. The positive control (`app_short_link_target` reads
anon-executable) is asserted beside it, so the zeros are not a sweep looking in
the wrong place. `tests/grant-surface.test.ts` and
`tests/db/ideacad-document-round-trip.test.ts` are green.

`_ideacad_part_reader` holds `authenticated` because it is named directly inside
the RLS `using` clause, where a function is evaluated as the querying role -- the
0070 lesson `0109` wrote down. The other three private helpers hold only
`service_role`, and the ladder test pins that a client calling
`_ideacad_part_writer` gets `permission denied`.

The RLS policy DELEGATES to that definer predicate rather than spelling the
cross-table lookup out inline. That is `0205`'s first measured lesson: an inline
`exists (select ... from ideacad_documents)` here, against 0205's policy on that
table which looks back, is mutual recursion and Postgres answers
`infinite recursion detected in policy` on the first read a grantee makes.

### Two files go red on this branch, and neither is this bundle's to fix

#### 1. `0202`'s guard -- the blocker ledger 0179 already diagnosed

`tests/db/ideacad-grants-anon-execute-surface.test.ts` fails in `beforeAll` with

```
0202: expected 10 ideacad functions in public, found 24.
```

`0202`'s self-check pins `^_?ideacad` at exactly ten and requires every one of
them to hold `authenticated`. **Any future ideacad migration trips the first
assumption** -- 0202's own message says so ("if a later migration added another,
revoke it there and update this count deliberately") -- so it is not avoidable by
anything this file could have done differently, short of naming its functions
outside the subsystem's own prefix to evade a guard.

Ledger 0181 owns that guard, `0206` replaces it, and this bundle must not touch
either. So the interaction was **measured one assumption at a time** instead, to
hand that lane numbers rather than a description:

| what was relaxed | what happens |
| --- | --- |
| nothing | `expected 10 ideacad functions, found 24` |
| the count only | `4 ideacad function(s) LOST the authenticated grant: _ideacad_concept_part_default(), _ideacad_hold_window(), _ideacad_part_owner(uuid), _ideacad_part_writer(uuid)` |
| the count and the authenticated sweep | **applies cleanly** |

Those four are the private helpers narrowed on purpose, and the census is 10
from `0201` plus 14 from `0207`. **The fix ledger 0179 verified -- scoping
0202's loop to its own ten by name -- covers this bundle too**, and the measured
`anon` count is 0 either way, so nothing here is an actual grant defect. `0202`
and that test file are byte-identical to `origin/integration` on this branch.

**This file's own self-check is deliberately NOT that sweep.** It hard-fails only
on this bundle's fourteen objects and raises a NOTICE, by name, about any other
anon-executable ideacad function -- because 0205 measured that a sweep over
`^_?ideacad` falsifies that same test's section E, which boots the chain MINUS
0202 on purpose so that "0202 closes them" is a measured difference rather than a
claim about a file.

#### 2. The migration-series contiguity walk, on a hole at `0206`

`tests/db/migration-0177-tombstone.test.ts` fails one case:

```
the migration series has a hole nothing accounts for.
Holes a branch IS holding: 190 (claude/amazing-bohr-qxhly9); 191 (same);
204 (claude/busy-newton-trto6y); 205 (claude/great-bell-ppysbn).
expected [ 206 ] to deeply equal []
```

That walk accounts for a hole a `claude/**` branch is HOLDING and fails an
unexplained one -- its own header says a held hole "is the system working" and
"is not this session's to fix". `0204` and `0205` are accounted for because
their lanes have pushed. **`0206` is not, because ledger 0181's lane has pushed
nothing at all:** no branch carries the file and no ref carries the ledger entry
that would claim it. This branch is the first to sit above that hole, so it is
the first to see it.

**Diagnosed rather than argued with, and confirmed in both directions.** A local
simulation of ledger 0181's first commit -- one scratch ledger entry reading
`Claims: 0206`, which is exactly what that lane pushes before any work -- makes
the walk pass 4 of 4 with **no other change to this tree**; removing it again
reproduces the failure exactly. So the case resolves the moment ledger 0181
pushes its entry, and there is nothing here to fix. The scratch file was
deleted; `git status` is clean of it.

Renumbering to `0206` is the wrong answer and was not taken: the router chat is
the allocator, this prompt states `Claims: 0207`, and taking `0206` would
collide with the lane that owns it. Writing `0206` into this bundle's own ledger
entry would be a false claim on a number it does not hold.

## Nine mutants, and the one that found a real gap

Every mutant was applied to `0207` itself, the file copied FIRST and restored
FROM THE COPY rather than with `git checkout --` (which is a discard-to-HEAD and
has cost three sessions their uncommitted work), and the restore md5-checked
byte-identical at the end of the run. Each mutation was asserted to have
actually changed the file, so a replace that silently missed could not read as a
pass -- **two of them did miss on the first attempt and said so** rather than
reporting a green mutant.

| mutant | detected by |
| --- | --- |
| the select policy becomes `using (true)` | 1 assertion |
| `ideacad_claim_part` drops the held-and-live refusal | 3 assertions |
| `ideacad_claim_part` skips the writer gate | 4 assertions, across two files |
| `ideacad_release_part` drops the `not_yours` gate | 1 assertion |
| `ideacad_assign_part` drops the owner gate | 1 assertion |
| `ideacad_assign_part` bumps the generation when nothing changed | 1 assertion |
| the trigger fills `part_id` from any part instead of refusing on ambiguity | 1 assertion |
| `_ideacad_hold_window()` becomes 30 minutes | **the file's own self-check refused the apply** |
| `ideacad_beat_part` stops comparing the generation | **NOTHING -- see below** |

**THE LAST ONE PASSED, AND IT WAS A REAL HOLE IN THE TESTS RATHER THAN A WEAK
MUTANT.** Removing `hold_revision <> p_hold_revision` from `ideacad_beat_part`
left all 22 assertions green, because the case that exercised it discriminated on
IDENTITY: the displaced holder is no longer `held_by`, so an identity-only gate
answers `lost` for the right reason by accident.

The case that needs the generation is the owner taking a part off somebody and
giving it straight BACK: `held_by` is then identical to what that client
believed, while the generation has moved twice, and somebody else could have held
it in between and changed the tree. That case is now asserted -- with its
positive control, that the same caller at the CURRENT generation is accepted --
and the mutant is detected.

Adding it also exposed an order dependency: the case after it had been inheriting
the holder its predecessor left behind. It seeds its own now, because every file
here must pass in any order.

## The numbers

- **Full suite on this branch: 414 files, 412 passed / 2 failed; 7971 passed + 1
  failed + 14 skipped = 7986 tests; 339.91s.** Against a baseline of **410 files
  / 7935 tests / 0 failed / 330.88s**, measured on a clean `git worktree` at
  `origin/integration` `b0a8101d`. **The arithmetic reconciles exactly:** 7935 +
  this bundle's 51 new tests = 7986. Delta **+4 files**, all four this bundle's.
  Every one of the 51 passes. The 1 failure and the 14 skips are the two files
  above, neither of them this bundle's.
  - The branch run was done TWICE, and the first one is discarded rather than
    reported: it overlapped the mutation runs, which rewrite `0207` on disk, so
    the suite may have applied a mutant. A suite reading a file another process
    is editing is not a measurement of anything. The number above is from the
    clean run, with nothing else touching the tree.
- **svelte-check: 0 errors, 37 warnings in 20 files -- 31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`.** Byte-identical to the
  baseline measured on a clean `git worktree` at `origin/integration`
  `b0a8101d`, which is expected: this bundle adds one `.ts` file and edits no
  `.svelte` file. **`CLAUDE.md` still says 38 in 21 at 32/5/1.** That is the
  sixth independent measurement of this drift and the second time it has moved
  DOWNWARDS; this bundle does not own that file, so the correction is reported
  rather than made.
  - A fresh container reports **14** phantom `$env/static/public` errors across
    **11** files with no `.env`, which is what CLAUDE.md predicts. Exporting two
    placeholder values before `svelte-kit sync` returns it to 0.
- **Paste trap: zero, two ways, against FOUR planted positive controls.** The
  comment portion of all **392** commented lines carries **0** dollar-quote
  tokens and **0** bare `$` of any kind; all **40** tokens in the file are on
  code lines, in **20 balanced pairs**, every one a real delimiter. Control A (a
  `$tag$` in a leading comment) reads 1 both ways; control B (a bare `$$` in a
  leading comment) reads 1 both ways; **control C (a `$tag$` in a TRAILING
  comment) reads 0 on way 1 and 1 on way 2**, which is what proves the two ways
  are independent rather than two spellings of one; control D (a lone `$`) reads
  1 only on the bare-dollar scan.
- **The verification query at the foot of the file returns 13 rows, every `ok`
  column `t`** -- measured by extracting it from the file's own comment block and
  running it against the real chain on embedded Postgres, not predicted.
- `tools/claude-md-check.mjs`: agrees with the tree. `npm run history:verify`:
  the split is lossless.
- `verify:readme` NOT run, per the prompt.

## What is NOT verified

- **The live Supabase project.** This container cannot reach production and did
  not try. `0207` is **not applied**.
- **`0205` and `0206` themselves.** Neither is in this tree. `0205` was READ from
  `origin/claude/great-bell-ppysbn` to confirm that
  `_ideacad_can_write_document(uuid)` takes a DOCUMENT id and returns
  `role in ('owner','editor')`, and the ladder tests stand a function of that
  exact signature and semantics in for it. **`0206` could not be read at all** --
  ledger 0181's branch has pushed nothing -- so "satisfies the NEW guard" rests
  on the measurement above (0 anon-executable, and the file's own scoped
  self-check) plus the fix 0179 verified, not on having read the file.
- **No browser pass.** There is no surface: no `.svelte` file is touched and no
  route renders a part.
- **Nothing about the trigger under CONCURRENT first-opens of the same
  document.** `ideacad_open_document`'s own `on conflict do nothing` plus re-read
  is 0134's shape and is unchanged here, but two students cannot open the same
  document (it is keyed to one student), so the case does not arise; a second
  concept insert into one document from two connections at once is not tested.

## Deferred

- **Part deletion**, and what it does to the concepts under it.
- **Part-level prediction.** `ideacad_predictions` is still keyed to the
  document, so an assembly has one prediction rather than one per part.
- **The instructor edit path**, which is still ledger 0179's open half: a teacher
  cannot open a student document at all, so neither a manager force here nor a
  manager write there is reachable yet.
- **Wiring `IdeacadAssemblyTransports` into `IdeacadTransports`**, and the UI:
  the part rail, the Take-this-part control, and the owner's reassignment
  surface.
