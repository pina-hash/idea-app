---
title: "IdeaCAD shared-open: the half of 0205 that had no caller, and the four defects only rasterizing caught (`claude/peaceful-wright-hupa6x`, ledger 0201)"
date: 2026-09-13
branches: [claude/peaceful-wright-hupa6x]
migrations: []
subsystems: ["IdeaCAD", "Testing"]
---

`ideacad_shared_with_me` and `ideacad_open_shared_document` were applied to
production with `0205` and **had no caller anywhere in the repository**, and
`store.ts` had no `openShared`. Ledger 0190 built `SharePanel`, ledger 0195
mounted it on the real item page, and ledger 0195's own entry named this gap on
the way past. So the half that GRANTS access was live and the half that USES it
did not exist.

The gap was not merely unbuilt, it was unreachable by construction:
`ideacad_shared_with_me` is a grantee's ONLY route to a document id, because the
roster is teacher-only and a classmate's document appears on no surface they can
already read. Without a caller for it there was no path, at any width, by any
sequence of clicks, to a document somebody had shared.

No migration. `Claims: none.`

## What was built

- **`src/lib/ideacad/shared-open.ts`** -- the pure layer: row shaping, a TOTAL
  order, the summary, the capability ladder and the words. `sharing.ts`'s shape
  and `sharing.ts`'s reasons.
- **`src/lib/ideacad/ui/SharedDocuments.svelte`** -- the surface. One primary
  control per row whose word is the state, which is `PartsPanel`'s rule and Mr.
  Pina's ask there.
- **`store.ts`'s shared-open region** -- `openShared(documentId)`, the `role` /
  `canWrite` / `accessLost` snapshot fields, one write guard over all nine
  mutating methods, and the revocation path.

## The store gained a way in, not a second store

`openShared` is a method on the existing store rather than a store of its own,
which the prompt asked for and which is right for a reason worth writing down:
two stores would be two autosave machines, two ideas of what `conflict` means and
two places to fix the next bug in either. The 750ms debounce, the serialized
writes and the terminal conflict state are reused untouched.

**It is not `open` with a different argument, and the two must not be folded
together.** `open` takes an ITEM, resolves the caller's OWN document and CREATES
it and its first concept when absent; `openShared` takes a DOCUMENT ID, belongs
to somebody else, and never writes -- which is `0205`'s own header's reasoning.
A viewer must not mint rows in a document they cannot write.

**`open` publishes `role: 'owner'` and that is not a guess.**
`ideacad_open_document` resolves the caller's own document through
`_classroom_engine_student` and can return nobody else's.

**`canWrite` is the AND of two answers, not the payload's alone.** The RPC sends
`canWrite`; `ideacadCanWrite(role)` is the pure mirror. Taking both means an
unrecognised role fails CLOSED even when the payload says true, and
`ideacadRoleFromPayload` drops a role this build does not know rather than
coercing it. Both directions are asserted, because a self-contradictory payload
is exactly what a future role or a bad deploy produces.

## The viewer gate is structural, and it is proven the way 0195 proved its own

`refuseWrite()` gates all nine mutating methods on `current.canWrite` -- one
function rather than nine copies of the same `if`, because nine spellings is the
pair that stops agreeing and the one forgotten is whichever method is added next.
It THROWS rather than returning quietly: a silent no-op is how a surface bug
reaches a student as typing that never saves.

**The gate was proved against the payload's `canWrite`, never against the
presence of a callback.** That is ledger 0195's shape and the reason is that a
wiring mistake hands every callback down regardless, so a proof resting on
absence cannot see the case it matters for. `/dev/ideacad-shared?role=viewer&state=callbacks`
opens a read-only document and then calls all nine anyway: **9 attempted, 9
refused with `0205`'s own sentence verbatim, revision unmoved at 4**, measured at
both widths. The attempt count is asserted alongside the refusal count, so a
probe whose loop never ran cannot report nine-of-nine and read as a pass.

**`refuseWrite` deliberately does NOT answer for a store with nothing open.**
Each method already has a more specific sentence ('Open an IdeaCAD document
before creating a concept.'), and answering here would have replaced every one of
them and changed refusals that have nothing to do with sharing.

## The grant removed mid-session: which half is the migration's, and which is ours

The prompt asked this to be decided and stated plainly. It is two questions and
only one of them was ours.

**THE REFUSAL IS THE MIGRATION'S AND IS ALREADY SETTLED.** `0205` re-asks
`_ideacad_can_write_document` inside every write RPC, so a revoked grantee's next
save is refused by the database whatever any client believes. No client decision
widens or narrows that, and nothing here is the boundary. Verified against the
real RPCs: the write lands while the grant is in place and comes back **'You can
only save your own concept.'** after `ideacad_unshare_document`.

**WHAT THE OPENER DOES IS OURS, and the decision is to ask the database rather
than read the refusal.** That sentence is not the viewer sentence -- the role is
NULL by then, not `'viewer'`, so the refusal does not take the viewer arm -- and
it is indistinguishable by text from several other refusals. CLAUDE.md forbids
classifying or re-toning a refusal string anyway.

**So the question goes to `ideacad_shared_with_me` and NOT to
`ideacad_open_shared_document`, and that choice is the whole design.** Both can
answer; only one answers safely. `open_shared_document` RAISES for a caller whose
role has become null, so a revoked grant and an unreachable network arrive as the
same thrown error and cannot be told apart -- and guessing is wrong in one
direction either way (a blip reported as permanent, or a real loss reported as
retryable forever). `shared_with_me` raises for neither: a revoked grantee gets a
list with the document missing. **A call that SUCCEEDS is a decision; a call that
FAILS is undecided.** Both halves of that asymmetry are asserted against the real
database in `tests/db/ideacad-shared-open-path.test.ts`, because the client picked
one function over the other on the strength of it.

A NARROWED grant counts as a loss too: an owner who demoted an editor to a viewer
has taken the write away as surely as one who removed the grant.

**The terminal state is `store.ts`'s `conflict`, reused rather than reinvented**
-- `checkout.ts`'s precedent for a lost part hold, and the same argument: the work
on screen is still the student's, it is no longer saveable here, and continuing
would overwrite. **The SENTENCE is its own**, because `conflict`'s 'This concept
changed elsewhere' would be a lie: nothing changed elsewhere, the access did.

## The instructor path was read and left alone

`0201`'s read policies carry `_classroom_manages_item`, so a teacher of record
opens any document in their item with no grant at all. Confirmed rather than
assumed, against the real RPCs: the teacher gets `role: 'manager'`, `canWrite:
false`, and holds no row in `ideacad_grants`; a teacher of a section the item is
NOT posted to is refused **identically to a stranger**, so neither can learn the
document exists. Nothing in this bundle grants a teacher anything.

`canWrite: false` for a manager is `sharing.ts`'s recorded GAP rather than a
rule, and the test asserts today's database rather than what decision 24 wants.

## Four defects that only rasterizing caught

Every browser check passed on the first full run -- 162 measurements, 0 outside
threshold. Then the six states were rendered at 375 and 1440 and looked at, which
is what ledger 0190's experience says is not optional. **Four real defects, none
of which any check could see**, because in every case the words were correct, the
elements were present and visible, and the contrast cleared.

**1. A count answering a question the panel had just said it could not ask.** In
the no-`0205` state the summary chip rendered "2 documents shared with you (1 you
can edit, 1 to look at)" in the header, two lines above a sentence saying the
question could not be asked. The rows were correctly absent; the number was not.
`capability.ready` gates the summary now, which is the same condition the list is
already behind -- saying it twice is what let the two drift.

**2. Two sentences saying one thing.** Every viewer row carried
`IDEACAD_ROLE_NOTES.viewer` and then a second, separate view-only constant under
it, in different words. Both present, both clearing contrast, and no content
check can see that a reader is being told twice. **The constant is deleted**: it
was a second statement of a rule `sharing.ts` already owns, in the words the
owner reads on the same screen. The row renders the role note and TAGS it when
the role cannot write, so one sentence, from one place.

**3. A row contradicting the notice three lines above it.** In the access-lost
state the row still read **"Can edit"**, **"Open now"** and "you can make
changes" under a notice saying the access was gone -- because the list is fetched
once and the loss is learned later. Every check passed: the notice was present,
the rows were present, and nothing compares two claims on one screen for
agreement. The row is also the half a student actually reads. A claim the panel
can no longer stand behind is now REPLACED rather than softened: the chip reads
"Access removed", the note says what to do, and there is no control and no
Open-now mark, because both would be claims about a document this caller cannot
reach. The header count goes with it, for the same reason and one level up.

**4. An "Open" button 873px wide.** The row note spans both columns, so the
button fell into the next implicit grid row and stretched across `minmax(0, 1fr)`
at 1440. It was present, visible, over 44px, correctly labelled and inside its
panel -- every check it had. This is ledger 0190's 103px-select in reverse, and
the fix is explicit placement at column 2 of the first row. All four are pinned
by name in the browser specs so they cannot return quietly.

**And one the harness revealed about the store.** The debug line showed
`canWrite=true` in the terminal state. `conflict` stops the autosave MACHINE, but
`create`, `rename`, `delete` and the rest are explicit presses that go straight to
their RPC, and with `canWrite` left true `refuseWrite` waved every one of them
through to a raw database error. `canWrite` goes false with `accessLost` now, and
`refuseWrite` reads the access-lost sentence rather than the view-only one --
telling that student they have "view-only access" describes a state they were
never in.

## The mutation proof found an instrument defect before it found anything else

The first run reported **12 of 16 mutants SURVIVED**, split perfectly by file
type: every `.ts` mutant survived and every `.svelte` mutant was caught. That
split is the shape CLAUDE.md names -- a mutation suite that suddenly all passes --
and it was the instrument, not the coverage.

**Measured: `npx vitest run` on a deliberately broken store printed "Tests 3
failed | 9 passed (12)" and EXITED 0.** An `execSync`-based runner therefore read
every caught mutant as a survivor. The runner now parses vitest's own summary
line, treats an unreadable summary as an error rather than as either answer, and
runs the UNMUTATED tree first as a positive control -- a runner that reported red
unconditionally would "catch" everything and prove nothing.

Re-run correctly: **16 mutants, 15 caught, 1 survivor, every file restored
md5-identical from an in-memory copy and never with `git checkout --`.**

**The survivor is genuine defence in depth and was kept.** `refuseWrite` gates
the mutating METHODS; `if (!current.canWrite) return` gates the autosave MACHINE,
which is reached by a timer nobody calls directly. Opened separately and together
per CLAUDE.md's own instruction: layer 1 alone **REDDENS (3 failed)**, layer 2
alone is **green (12 passed)** -- correctly, since with layer 1 intact nothing
dirty is ever scheduled -- and both together **REDDEN (3 failed)**. A redundant
check is not removed because a test did not notice it.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, re-derived on
  `origin/integration` at branch time with `.env` written before the sync, and
  identical after the change. Breakdown held at 31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`. One transient error was
  found and fixed on the way: the harness declared a local `function document()`
  that shadowed the global, which took the DOM away from every geometry probe.
- **The full suite: 454 files, 8628 tests, 0 failures**, 455.8s.
- **The four new files**: 13 pure, 12 store, 9 panel (`tests/dom/`), 8 database.
- **`npm run verify:browser -- --route /dev/ideacad-shared`: 12 route/width runs,
  176 measurements, 0 outside threshold.** Six states at 375 and 1440. No new
  CHECK KIND was added, so no `--selftest` or `--break` preset was owed; every
  claim rides an existing check whose negative control already exists.
- **`npm run verify:readme`, scoped to these routes**: six measurement files
  written under `measured/`, both counts regions regenerated. The store now holds
  214 specs, 428 runs, 7650 measurements, 0 outside threshold.
- **The pages rasterized at 375 and 1440 and looked at, twice** -- once to find
  the four defects and once to confirm the fixes.

## What is NOT verified, stated rather than left to be discovered

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project; no `0205` RPC was called for real from this container.
  Every database claim here comes from the embedded Postgres with the real
  migration files applied unmodified.
- **No signed-in surface was driven.** `/dev/ideacad-shared` needs no session by
  construction; the real classroom item page was not opened, because that needs a
  Bosco Tech Google account.
- **Production was unreachable and was not routed around.** `curl` to
  `ideabosco.com` answered `CONNECT tunnel failed, response 403` and `000`, as it
  did for ledgers 0188, 0190 and 0195 on the preceding days. The same proxy
  allows `raw.githubusercontent.com` and `api.github.com` freely -- all three
  opening fetches succeeded -- so this is host-specific refusal and not a
  container with no network.
- **`prefers-reduced-motion` is `no-preference` in the harness**, so that path is
  not exercised. Nothing in this panel animates, which is an argument rather than
  a measurement.
- **Text is measured in the fallback stack.** The harness blocks every
  non-loopback request, so Rajdhani and Share Tech Mono are not the faces the
  contrast figures were taken against.
- **`0209` and `0210`'s applied state was taken from the prompt**, which states
  both are applied to production and verified against Mr. Pina's own queries.
  Nothing in this container can confirm it; CLAUDE.md is explicit that applied
  state is a property of production no file in this repo records.

## What was deliberately left undone

**`SharedDocuments` IS NOT MOUNTED ON THE REAL CLASSROOM ITEM PAGE, and that is
a boundary rather than a decision.** The only route to a Blade surface is
`ItemDetail.svelte` and the item page's IdeaCAD region, which this prompt's Owns
line does not include and which it assigns explicitly: *ledger 0200 owns the
landing.* So a student still cannot reach this, and **that is the same shape
ledger 0190 was criticised for and it must not be allowed to sit** -- it is named
here in full rather than left to be found, which is the one thing 0190 did right.

What is left is genuinely one decision, where the panel sits relative to the
editor, and the wiring is already there: `ideacadTransports.openSharedDocument`
and `.sharedWithMe` are populated by `createIdeacadSharingTransports`, the item
page already runs the `0205` probe once per item and holds `ideacadSharingReady`,
and `store.openShared(documentId)` is the whole of the open. The panel needs
`rows` (from `ideacadSharedRows(await sharedWithMe(itemId))`), `capability`,
`openDocumentId`, `accessLost` off the store snapshot, and `onopen`.

**A teacher still cannot EDIT a shared document**, unchanged from `sharing.ts`'s
own note: `CAPABILITIES.manager.canWrite` is false because `0205` deliberately
left `0201`'s read-only grant alone. This bundle records what the database does
today and does not move it.

**No `classroom-updates.json` entry is owed by this bundle**, and the reason is
the mount above: the surface is reachable only from `/dev/ideacad-shared`, which
404s in production, so there is no student-visible change yet. The entry belongs
to whichever bundle lands the mount, and it should say that a student can open
what a classmate shared with them.
