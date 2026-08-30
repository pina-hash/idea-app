---
title: "Classroom: ItemDetail acknowledges its own delete, the PostgREST shim stops reporting every RPC failure as PGRST202, and the `$app/navigation` stub carries the real export list (`claude/itemdetail-delete-ack-qermq5`, no migration)"
date: 2026-08-29
branches: [claude/itemdetail-delete-ack-qermq5]
migrations: []
subsystems: ["Classroom", "Testing"]
---

**Starting state, checked before anything else.** `git fetch origin`: `HEAD` and
`origin/main` both at `2113f4d`, `origin/integration` at `6a8f125`. `git log
--oneline origin/main..origin/integration` is 61 commits; the only one anywhere
near this work is `e6f7d2e` (the shim's SET-RETURNING shape), which is a
different question about the same file. Nothing there does any of the three
below. Branched from `origin/integration`. Working directory
`/home/user/idea-app`.

**The prior entry this bundle acts on is not on `integration` either.**
`docs/history/dom-undriven-props-coverage-w4k2np.md` lives on
`origin/claude/dom-undriven-props-coverage-w4k2np`, unmerged, and was read from
there. Its three claims were re-derived here rather than transcribed, and all
three held.

---

## 1. `ItemDetail` acknowledges its own delete

**THE DEFECT, MEASURED BEFORE IT WAS CHANGED.**
`tests/dom/item-detail-delete-acknowledgement-mount.test.ts` was written first
and run against the SHIPPING component: 4 of its 8 tests failed, all four of the
no-callback ones, and the four describing behaviour that was already correct
passed. `remove()` ended at `ondeleted?.()` and did nothing to the component --
no unmount, no blanking, no acknowledgement -- so with no callback the write
landed, `res.ok` was true, and `target.textContent` did not move. Production
wires `goto()` (`item/[itemId]/+page.svelte:103`), so the navigation carried the
outcome and nobody on the live site ever saw the gap; every dev harness passes
nothing, and there a successful delete was indistinguishable from a silent
failure.

**THE RULE IT IS FIXED UNDER IS THE `/foundry/mine` ONE, AND IT CONSTRAINS THE
SHAPE RATHER THAN SUGGESTING IT.** An acknowledgement must survive the act it
reports; a delete's cannot render in the pane the delete just destroyed.
`FoundryMine` splits `deleteNote` (a version delete, which leaves the app open,
so the note goes in the detail pane) from `removedNote` (an app delete, which
unmounts that pane, so the note goes in the list). `ItemDetail` has no second
pane to put a note in -- it IS the whole page -- so the surface on screen
afterwards is either whatever the caller navigated to, or, with no caller, this
component still mounted showing a row that is gone.

**SO THE CALLBACK'S PRESENCE DECIDES, and both arrangements are asserted because
either alone is a component that is wrong in the other place.**

  * **No `ondeleted`** -> the page is REPLACED by an acknowledgement naming the
    item (`role="status"`), plus a `basePath`-derived link back to the class.
    Replaced rather than prefixed: every control below acts on a row that no
    longer exists, so leaving the hand-in, the instructor tools and the Delete
    button on screen would offer a second press of a thing already done.
  * **An `ondeleted`** -> the callback fires and the component renders EXACTLY
    what it rendered before Delete was ever pressed. Asserted as a byte
    comparison of `target.innerHTML` across the two presses.

**RENDERING THE NOTE UNCONDITIONALLY WAS THE REJECTED ALTERNATIVE, and the
reason is a duration rather than a taste.** `goto()` is a client-side navigation
that runs the next route's loads, so a "Deleted" panel painted on the way out
sits there for as long as that takes -- a flash of a page about to be destroyed,
and a second acknowledgement beside whatever the caller shows. Mutant I2 is
exactly that arrangement and it reddens the no-flash test. The gate is the
codebase's ordinary absence-is-the-mechanism rule pointed at an OUTCOME rather
than at a control: wiring `ondeleted` is claiming the outcome.

**WHAT THE `{#if removed}` BRANCH DOES NOT CHANGE.** The `<svelte:head>` title
still names the item, deliberately untouched -- it is not part of the
acknowledgement problem and rewriting it would widen a diff whose whole argument
is that it is small. `git diff --stat src/` is one file, +84/-1.

**AN INTEGRATION HAZARD, NAMED RATHER THAN WORKED AROUND.**
`origin/claude/dom-undriven-props-coverage-w4k2np` carries
`tests/dom/item-detail-ondeleted-mount.test.ts`, whose last test pins the
undriven arrangement -- with no callback, `target.textContent` byte-identical
after a successful delete. That is the DEFECT, and this bundle removes it, so
that one test must go red when the two branches meet. The rest of that file
survives on purpose: its callback-order assertions read `target.textContent`
INSIDE the callback, and the gate above leaves the page byte-identical on the
callback path, so those still hold. That file is not this session's to edit; the
fix when they merge is to invert the final assertion, not to weaken this one.

---

## 2. The PostgREST shim reported every RPC failure as `PGRST202`

**THE CONFLATION.** Every throw out of `createPostgrestShim(...).rpc()` came
back `{ code: 'PGRST202' }`. `PGRST202` is the one code this codebase degrades
on, deliberately and on that code ALONE (`$lib/server/admin.ts`,
`$lib/classroom/transports.ts`, `$lib/gauntlet/knowledge-clock.ts`,
`$lib/server/gauntlet-authoring.ts`, the short-link and reference loads), and
the rule exists so a runtime error inside a function fails CLOSED rather than
falling through to a weaker read. A fixture that answers `PGRST202` for a
refusal makes that rule untestable in the one direction that matters -- which is
how a mutant degrading on ANY error survived all ten database-driven assertions
of the roster read.

**THE FILE'S OWN COMMENTS WERE READ FIRST, AS ASKED, AND THEY DO NOT DEFEND
IT.** Two things ARE deliberate and both are outside the `try`: an overload
disagreement and an unmodelled `setof <scalar>` throw rather than answering,
because they are defects in the fixture and not answers PostgREST gives. That
reasoning is intact and untouched. The one comment on the catch says only that
PostgREST reports a missing function -- "including one whose arguments do not
match any overload" -- as `PGRST202`, which is true and is not a claim that
everything else is one too. So the conflation was an omission, not a decision,
and it is fixed.

**WHAT POSTGREST ACTUALLY DOES, and the discriminator is not this file's to
choose.** A call it cannot resolve against its schema cache is `PGRST202`; a
call that resolved and then raised is reported with the SQLSTATE as the code.
Postgres draws that same line itself with `42883` (undefined_function), which
covers an unknown name and an unmatched named-argument set identically -- so
`rpcError()` translates `42883` and passes everything else through verbatim.

**IT REPORTS, IT DOES NOT CLASSIFY.** A whitelist here would be a second copy of
`$lib/pg-errors`' transient/refusal partition, living in the fixture, able to
stop agreeing with the one that ships. Passing the SQLSTATE through is instead
what makes that partition reachable from a database test at all: the new file
drives a `23505` raise through the shim and asserts
`isTransientSqlstate` / `rpcErrorStatus` answer 503 on it, with a `P0001` raise
from the same source as the negative control at 400. Before this, that whitelist
was assertable only against hand-written error objects.

**A THROW WITH NO SQLSTATE RETHROWS**, and that branch is DRIVEN rather than
asserted into existence: a parameter node-postgres cannot serialize (a circular
object) throws a plain `TypeError` with no `code`, measured, with an
ordinary-value call on the same probe function as the positive control. A branch
nothing can reach and no mutation can kill is the thing this repo says not to
write, so it was worth finding a real driver -- mutant H3 survived the first
draft of that test, which asserted the OUTSIDE-the-try guard instead and
therefore never entered `rpcError` at all. Both are now separate tests.

**THE SECOND HALF DRIVES A SHIPPED TRANSPORT, not the shim twice.**
`loadSectionRoster` is the call site the surviving mutant lived in. Two
situations that used to answer identically now differ:

| situation | before | after |
| --- | --- | --- |
| `classroom_section_roster` absent (0138 unapplied) | `{ ok: true, managesReady: false }` | unchanged -- the degrade rung |
| present and RAISING | `{ ok: true, managesReady: false }` | `{ ok: false, message: <the raise> }` |

The probe is created under 0138's real name and signature on a five-file chain;
0138's own semantics are proven in raw SQL by
`tests/classroom-manager-exclusion.test.ts` and reproducing them here would be a
second copy of them. Both rungs are driven with a NULL section -- the home
feed's call -- whose degraded answer reads no table, so the assertion is about
the transport's error branch and not about which tables the chain happens to
have.

**EXPECTED TESTS TO CHANGE RESULT. NONE DID, AND THAT IS A MEASUREMENT RATHER
THAN A HOPE.** The shim was instrumented to log every error it returns and the
whole suite run through it: **159 RPC errors, of which 152 are `PGRST202`, and
of the 7 that are not, 6 are this bundle's own new file.** The seventh is
`42501 permission denied for function coin_admin_list_section_students` in
`tests/coin-admin-list-gates.test.ts` -- the one existing call site whose ANSWER
moved. Its result did not, because its `rows()` helper keys on `res.error` being
set and never on the code. Its header comment DID say "a refusal inside a
function body reaches the shim as PGRST202", which was true of the fixture and
never of PostgREST, and is now false of both; that comment is corrected in this
bundle. Nothing else in that file is touched.

The 152 remaining `PGRST202`s are what they have always been: 134 of them are
`classroom_song_queue` and `classroom_hall_pass_state` on chains that predate
those functions, plus 7 `classroom_section_roster` (the hole
`postgrest-shim-rpc-shape.test.ts` already records) and a handful of others.
Every one of them is a genuinely missing function, so every one still degrades.

**THE SELECT PATH HAS THE SAME SHAPE OF DEFECT AND IS DELIBERATELY NOT TOUCHED.**
`Query.run()`'s catch hardcodes `{ code: '42P01' }` for every throw, so a
missing COLUMN (`42703`) and an RLS or grant denial (`42501`) both report as a
missing TABLE. It is the same one-line fix. It is not in this bundle because
nothing asked for it, it would move a second set of call sites in the same
change, and the RPC path is the one with a recorded surviving mutant behind it.
Named here so the next session does not have to rediscover it.

---

## 3. `tests/stubs/app-navigation.ts` carries the real export list

The stub exported five names; `@sveltejs/kit`'s `$app/navigation` re-exports
twelve. A name the real module has and the stub lacks is not a missing feature,
it is a MOUNT THAT DIES naming the wrong thing: `AssignmentEngine` reaches
`guardSaveNavigation`, which calls `beforeNavigate` during component init
(`save-guard.svelte.ts:64`), so the call landed on `undefined` and the component
rendered no node with a stack pointing at the guard.

**ALL TWELVE, NOT THE ONE.** The seven that were missing: `beforeNavigate`,
`afterNavigate`, `onNavigate`, `disableScrollHandling`, `refreshAll`,
`pushState` and `replaceState`. Sweeping `src/` for each, `afterNavigate` is the
second one a mount actually reaches (`gauntlet/+layout.svelte:52`, also during
init) and the remaining five have no caller today; `pushState`/`replaceState`
appear in `ReferenceDoc.svelte` but as `history.pushState`, the DOM one, not
Kit's. Listing all twelve makes the failure class impossible instead of fixing
one instance of it.

**THE THREE LIFECYCLE REGISTRARS ARE NOT `record()`.** They take a CALLBACK, not
a destination, and they KEEP it (`navigationHooks`), so a test can fire the
guard a component registered and assert what it does about a navigation --
which is the assertion neither previous session's local `vi.mock` could make,
and which the new file uses to prove a clean surface does not cancel. They do
NOT fire on their own: the real `afterNavigate` runs its callback once on mount,
and a stub that simulated that would be deciding a component's behaviour rather
than recording it, silently giving every existing mount in `tests/dom/` a
navigation nobody asked for.

**THE ASSERTION IS THE RULE, NOT THE SEVEN NAMES.** The test reads Kit's own
re-export block off disk and requires the stub to carry every name in it, so the
day Kit adds a thirteenth this file says so rather than a mount elsewhere
failing obscurely. Two halves, because `name in stub` is true for a name
exported as `undefined` -- which is exactly the state that killed the mount --
so callability is asserted separately and is the half that bites (mutant S3).

**A TRAP FOUND ON THE WAY, worth the next reader's time:** under happy-dom
`import.meta.url` is an `http://` URL, so `fileURLToPath(new URL('...',
import.meta.url))` throws `The URL must be of scheme file`. Anything in
`tests/dom/` that reads a file resolves from `process.cwd()`.

---

## Measured

| | before | after |
| --- | --- | --- |
| `svelte-check` | 0 errors / 37 warnings, 31/5/1 | **identical** |
| full suite | 193 files, 4123 tests, 167.56s | **196 files, 4146 tests, 172.56s** |
| `node` project | 182 files | **183 files, 4066 tests** |
| `dom` project | 11 files, 67 tests, 6.10s | **13 files, 80 tests, 6.84s** |

+23 tests = 8 (`item-detail-delete-acknowledgement-mount`) + 10
(`postgrest-shim-rpc-error-codes`) + 5 (`app-navigation-stub-mount`). Every
existing file's result is unchanged; the one call whose ANSWER changed is
accounted for above.

`npm run verify:browser`: 50 route/width runs, 418 measurements, **2 outside
threshold** -- both the `/dev/pathways` harness's own controls at 194.7x26.2px,
at 375 and 1440. Pre-existing, in `src/routes/dev/`, which this session must not
touch, and on a route that mounts nothing this bundle changes.

## Mutation proof, 13 mutants, every one reddening

Applied to the real files. Restore was `cp` from `/tmp/mut/orig`, **never `git
checkout --`**, and verified by `md5sum -c` after every run.

| mutant | | result |
| --- | --- | --- |
| I1 | `remove()` restored to `ondeleted?.()` (the shipping code) | 4 failed / 4 passed |
| I2 | acknowledge unconditionally -- production gets a flash | 1 / 7 |
| I3 | acknowledge a REFUSED delete | 3 / 5 |
| I4 | the note is ADDED above the page instead of replacing it | 1 / 7 |
| I5 | the back link hardcodes `/classroom` | 1 / 7 |
| I6 | the note stops naming the item | 1 / 7 |
| I7 | the note drops `role="status"` | 1 / 7 |
| H1 | the blanket `PGRST202`, restored | 5 / 4 |
| H2 | no schema-cache translation: `42883` passes through raw | 3 / 6 |
| H3 | a throw with no SQLSTATE dressed as `PGRST202` | 1 / 9 |
| S1 | `beforeNavigate` removed (the shipping stub) | 5 / 0 |
| S2 | present, but drops the callback on the floor | 3 / 2 |
| S3 | exported as `undefined` -- `in` is true, the call dies | 4 / 1 |

I1 and S1 are the two findings restated as mutants: each is the code as it
stood, and each reddens. I4 is the one worth reading -- the acknowledgement
rendered but the page kept underneath it still passes "names the item" and fails
only "takes the dead item off the page", which is the assertion separating a
note from a working outcome.

**Two of this file's own assertions failed the first time they ran, and both
were the instrument rather than the code.** The delete control's positive
control was read BEFORE `openInspector`, where it does not exist yet -- the
false absence that directory's rules warn about, caught by the helper asserting
its own step landed. And the no-flash comparison was first taken against the
ARMED frame, which differs by one word because `remove()` disarms the confirm on
its way out; the correct reference is the page before Delete was pressed at all.
Both are written up in the file so the next reader does not repeat them.

## What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder (`example-ref`); no migration, RPC or signed-in session here
  touches production. No migration is in this bundle.
- **No geometry, contrast or tap-target claim is made anywhere in the three new
  test files.** happy-dom has no layout engine. The deleted page's own layout is
  therefore NOT measured: it is reachable only by pressing Delete, and no `/dev`
  route spec drives that, so `verify:browser` does not cover it and this session
  may not add one. What it reuses -- `.card`, `.btn secondary` (the 44px floor)
  and `.page-footer` -- are existing measured primitives, and it introduces no
  new colour token.
- **No signed-in browser pass.** That needs `/dev/login` against a local
  Supabase stack; none was started.
- **No `classroom-updates.json` entry.** The only student-visible change is what
  a page shows after an instructor deletes an item, on a path a student cannot
  reach: delete is `canManage`-gated, and production navigates, so no student
  sees the new branch.
