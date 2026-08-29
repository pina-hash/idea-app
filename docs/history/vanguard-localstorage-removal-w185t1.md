---
title: "VANGUARD: a removal that never reached the cloud save"
date: 2026-08-28
branches: ["claude/vanguard-localstorage-removal-w185t1"]
migrations: []
subsystems: ["VANGUARD"]
---

## VANGUARD: a removal that never reached the cloud save

The injected bootstrap wrapped `localStorage.setItem` and pushed every write to
`/api/vanguard-save`. It wrapped neither `removeItem` nor `clear`. Since the
seed merges the cloud save back INTO localStorage before the game reads it, a
deletion changed the local copy, never reached the cloud one, and was undone by
the next load. It looked like it worked and it did not, which is the worst shape
a data bug takes.

### What was verified before anything was designed

Both halves of the claim, read out of the code rather than assumed:

- **`removeItem` is not wrapped, and `clear` is not wrapped.** The only
  `localStorage.*` assignment in the whole injection was `localStorage.setItem =
  function (key, value)`.
- **`localStorage.clear` has ZERO occurrences in the legacy build.** Every
  `.clear()` hit in `index.html` is a `Map`/`Set` clear in the co-op code. The
  game never calls it. This is the fact the `clear` decision below rests on, and
  it is now pinned by a test.
- **`removeItem` has exactly three call sites**, and their classification is not
  uniform:

  | key | call site | classified as | was it actually broken? |
  | --- | --- | --- | --- |
  | `vanguard_ach_title` | `:6459`, unwearing an earned title | **PROGRESSION** | **Yes.** `mergeProgression` keeps `a` when `b` lacks the key, and `applyCloud` then re-seeds the cloud title explicitly. Unwearing undid itself on every reload. |
  | `vanguard_sfx_lvl` | `:8162`, RESET in the audio panel | preference | Only partly. The pref bucket is REPLACED wholesale, so the removal landed as soon as anything else triggered a push -- but nothing scheduled one, so it waited for the next unrelated write or the `pagehide` beacon. |
  | `vanguard_baltune` | `:8402`, RESET ALL in TUNE (admin) | preference | Same as above. |

- **A stale comment in the build already said so**, at `:6388`: "Removing a
  title (removeItem) is not wrapped, so clearing one is still a local-only
  change." It was correct when written. It is now false, which is handled below.

### The question that had to be answered first: can the shape express a removal?

**No, and that is why wrapping `removeItem` alone would have fixed nothing.**

`StoredSave` is `{ v: 2, progression: Record<string, string>, prefs: { mobile?,
desktop? } }`. Every value is a present string. The only other state a key can
be in is ABSENT -- and absence is **already spoken for**: it is how a device
says "I have nothing to contribute about this key", which is precisely what
lets a second device push without wiping the first one's progress.
`mergeProgression` therefore keeps `a` on every branch where `b` is missing,
correctly. A removal expressed as absence is indistinguishable from a device
that simply never had the key.

So a wrapped `removeItem` would have fired a push, the snapshot would have
arrived with the key missing, and the merge would have handed the value straight
back. **The fix is in the shape before it is in the wrapper**, exactly as the
task suspected.

`REMOVED` in `src/lib/vanguard-save.ts` is that shape change: a reserved
sentinel value (a NUL byte followed by `vanguard:removed`) a key can be mapped to in the
snapshot. `splitSnapshot` routes those out of both maps into a new `removed`
array; `mergeIntoStored` deletes them from `stored.progression`.

**It rides the snapshot rather than a new parameter, and that is a deploy
decision as much as a shape one.** `src/routes/api/vanguard-save/+server.ts`
calls `mergeIntoStored` at a fixed arity and forwards the snapshot object
through untouched after only an is-object check, so a fifth parameter would have
been dead code until that handler changed too -- and that handler was outside
this session's file ownership. Carried as a value, the removal path needs no
route change, no new endpoint, and no ordering between the two halves. Both
halves ship in one Vercel deploy, so unlike a migration and a client they cannot
be out of step in production.

### Three decisions inside that, each with a reason

- **The removal is an EVENT, not a tombstone, and nothing about it is
  persisted.** A stored tombstone would have to be adjudicated against another
  device's push, and a snapshot carries no per-key timestamps to adjudicate
  with. The only two tombstones actually available are "block this key forever",
  which stops a student ever re-earning what they reset, and "block until
  something overwrites it", which is what an event already does. Re-earning is
  the ordinary case and is asserted.
- **Removals are applied AFTER the merge and AFTER the `MIGRATED_PREF_KEYS`
  fold.** That fold carries a stale pref-bucket copy of the three achievement
  keys into progression; applied before it, an unwear would be undone by the
  fold on the very same request. Proven by mutation (M2).
- **Preferences need no explicit delete, but the sentinel must still be routed
  out of `prefs`.** The bucket is replaced wholesale, so a key absent from the
  replacement is already deleted -- but a sentinel left in the map would be
  written back as the key's new VALUE and seeded into the game. Proven by
  mutation (M4).

`pickStrings` also strips the sentinel out of anything already stored. That is
fail-safe rather than decoration: `REMOVED` is a wire value with no meaning in
the stored blob, and a browser posting to a serverless instance still running
the previous build during a rollout is a real, if brief, window.

### The client half

`localStorage.removeItem` is wrapped beside `setItem`, **inside the same
`if (SIGNED_IN)` block**. Signed-out inertness here is not what it looks like:
the bootstrap is emitted BYTE-IDENTICALLY for everyone and `SIGNED_IN` is a
runtime `var`, so the wrappers, `doPush` and the endpoint literal are all in the
signed-out page's source too. What makes them inert is that one guard. A first
draft of the test asserted the strings were ABSENT from a signed-out serve and
failed -- correctly, because it was asserting a mechanism this file does not
use. The test now asserts the real one: `var SIGNED_IN = false;` is emitted, and
both wrappers resolve to the *same* `if (SIGNED_IN) {` index.

Two smaller things the wrapper needs to be right:

- **A pending removal is cleared on a CONFIRMED push, never on dispatch**, and
  the body is built once so the acknowledgement clears exactly the removals it
  carried -- a removal made while the request was in flight was not in it and is
  still owed.
- **`snapshot()` re-reads localStorage rather than trusting the pending set.** A
  remove-then-set inside one debounce window (unwear a title, wear another) must
  send the new value, not a deletion. `setItem` also drops a pending removal for
  the key it writes.

### `clear` is reported, not solved, and that is the decision

Propagating `clear()` would mean one call wiping a student's entire cloud save.
The game never calls it, so any caller is by definition code we cannot
attribute: another surface on this origin, an extension, a console. A removal we
can attribute to a key the game owns is a different proposition from a wipe we
cannot attribute at all. Wrapping it needs a caller worth attributing first, and
the test reddens if the build ever grows one.

### The stale comment in the build, corrected through the rewrite table

The build's achievements header now says the opposite of what happens, and it is
the block a future change to title persistence gets read from -- so the wrong
sentence is the one that would be trusted. The build is frozen except for
game-feature work, so this went in as a third `_UNIVERSAL_REWRITES` entry
(`removalWrappedNote`) rather than an edit, which is the repo's convention for
anything added to legacy HTML. It costs nothing at runtime: anchor and
replacement are both inside a block comment.

The existing suite already walks the real table and asserts, per entry, that the
anchor matches the build exactly once, the marker is absent from the raw build
(the positive control) and the marker reaches an admin, a student and a
signed-out visitor exactly once. The new entry is covered the moment it is
added; the pinned length went 2 -> 3.

### The other two items

**`summarizeRuns` (`vanguard-history.ts:5`).** The comment claimed both the read
endpoint and "the portal history page" call it. Re-counted across `src/` and
`tests/`: **one importer, one call site** (`src/routes/api/vanguard-run/+server.ts`
lines 2 and 45), and no route under `src/routes` serves a VANGUARD history page
at all. The in-game overlay reads the summary off that endpoint's response.
Corrected in place, with the reason the count matters stated so the next reader
does not re-generalize for a caller that does not exist.

**`fetchOnline` offset -- reported, nothing built.** Re-verified at build 213:
`fetchOnline(then, fail, offset)` forwards `&offset=<n>` when non-zero; four
call sites (`:2186`, `:5472` in `refreshBoard`, `:5777`, `:7792`), none passing
one; and **no LOAD MORE control exists anywhere -- not present, not hidden, not
disabled**, so there is nothing to enable.

The part that decides whether this is a feature or a defect: **it is a cap, not
a defect.** `BOARD_N` is 250, the backend is asked for `n=250` sorted
descending, and `renderBoard` draws all 250. With more than 250 scores on a mode
the ranks below that are off the board, which is what every leaderboard does, at
an unusually deep cut. **The case that matters most is already handled**: when
the player's own row falls below the cut, `renderBoard` appends it after a `···`
separator with a computed rank, so they are told where they stand rather than
vanishing. The one real inaccuracy is that this rank is computed from the 250
fetched rows, so a genuinely 400th-place player is shown as 251st -- and fixing
that properly is what the offset is for.

**It is blocked on a question this repo cannot answer:** whether the Apps Script
backend honours `offset`. `action=top` is a different deployment, the parameter
has never been exercised, and the client half is pointless if the backend
ignores it and returns the same first page. That check comes before any UI work.

### Verification

| | before | after |
| --- | --- | --- |
| `svelte-check` | 0 errors / 37 warnings (31 `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`) | 0 errors / 37 warnings, same 31/5/1 mix |
| `npm test` | 147 files / 3327 tests passed | 148 files / 3348 tests passed |
| `npm run verify:browser` | 34 runs, 258 measurements, 2 outside threshold | 34 runs, 258 measurements, 2 outside threshold |

**Mutation proof, nine cases, each opening one guarantee in the permissive
direction and each restored byte-identically (md5-checked):**

| | mutation | result |
| --- | --- | --- |
| M1 | the merge stops applying removals | 3 failed |
| M2 | removals applied before the migrated-pref fold | 1 failed |
| M3 | `pickStrings` stops stripping the sentinel | 1 failed |
| M4 | `splitSnapshot` keeps the sentinel as a pref value | 1 failed |
| M5 | the bootstrap's sentinel literal drifts from the module's | 1 failed |
| M6 | pending removals cleared on dispatch instead of on ack | 1 failed |
| M7 | the `removeItem` wrapper is not installed | 2 failed |
| M8 | the wrapper is hoisted out of the `if (SIGNED_IN)` guard | 1 failed |
| M9 | the rewrite anchor drifts | 3 failed |

M8 is worth recording because the FIRST version of it passed. That mutation
closed and reopened the `try` block but left the wrapper inside the guard, so it
was not the defect it claimed to be -- a badly formed mutant, not a gap in the
test. Rewritten to hoist the wrapper out of the `if (SIGNED_IN)` block entirely,
it reddens.

### NOT verified, stated plainly

- **No signed-in browser drive.** Nothing here can be driven signed in from this
  container. **Whether a removal actually reaches `/api/vanguard-save` over the
  wire is not proven.** What is proven is that the rewrite fires, that the
  emitted bootstrap wraps the right method against the right endpoint with the
  body shape the deployed handler reads, that the handler's merge applies a
  removal, and that the path is inert signed out.
- **No live Supabase.** No RPC, no real `vanguard_saves` row, no cross-device
  round trip. The merge is exercised as a pure function, which is what it is.
- **The second-device resurrection case is open by design.** A device still
  holding the old value pushes it back on its next push, because a removal is an
  event and the snapshot has no per-key write stamps. Recorded in the backlog.
- **The Apps Script `offset` support is unknown** and was not probed; it is a
  different deployment.
- `npm run build` was not run (the Vercel adapter's known Windows EPERM does not
  apply here, but nothing in this change is build-shaped).

### A process note worth keeping

Mid-session, a mutation script used `git checkout -- <file>` to undo a mutant on
an **uncommitted** tree. That restores from HEAD, not from the working state, so
it silently discarded every source edit made up to that point and the remaining
mutants then ran against pristine originals, reporting nothing. The tests
survived (they were untracked or unlisted) and were the specification the source
was rebuilt from. **Commit before mutating, or copy the file aside and restore
from the copy** -- `mutate2.sh` does the latter, and the md5 check at the end is
what makes the restore auditable rather than assumed.
