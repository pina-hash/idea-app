---
title: "The shared-open mount, and the four defects behind it -- including a writable Blade editor that had never rendered (`claude/vibrant-keller-4wtm7c`, ledger 0217)"
date: 2026-09-13
branches: [claude/vibrant-keller-4wtm7c]
migrations: []
subsystems: ["IDEACAD", "Classroom", "Testing"]
---

`0205` applied `ideacad_shared_with_me` and `ideacad_open_shared_document` to
production. Ledger 0190 built the panel a student GRANTS from; ledger 0195
mounted it; ledger 0201 built everything remaining -- `shared-open.ts`,
`SharedDocuments.svelte`, `store.openShared`, `refuseWrite`, thirteen tests, six
browser states -- and could mount NONE of it, because `src/lib/classroom/ItemDetail.svelte`
was outside its Owns and it said so in full rather than leaving it to be found.

So for three days the grant was live and unreachable BY CONSTRUCTION.
`ideacad_shared_with_me` is a grantee's only route to a document id: the roster
is teacher-only and a classmate's document appears on no surface they can
already read. There was no path, at any width, by any sequence of clicks, to a
document somebody had shared. This bundle is that path.

No migration. `Claims: none.`

## What was wired

**`ideacadShared`, ONE PROP, which is ledger 0195's shape.** `rows`,
`capability`, `openDocumentId`, `accessLost`, `busy`, `onopen`, `onreturn`. Null
removes the surface entirely and that is the whole gate -- a manager (no store
exists for one, `ideacad_open_document` raises), a page with no IdeaCAD item, and
a document that has not opened are the same answer. The pre-`0205` deployment is
a SECOND, narrower expression inside the object (`capability.ready` false), so
that student learns the difference between "nothing is shared with you" and
"this site cannot tell" rather than seeing nothing at all.

**Nothing about permissions is derived in `ItemDetail`.** `row.canWrite` is
`sharing.ts`'s answer over the role the DATABASE sent, `capability` is the
probe's, `accessLost` is the store's. The five things ledger 0201's entry named
as the wiring left were verified by reading rather than trusted from the list --
`0211` had landed the timeline into the same neighbourhood since it was written,
and the transports and the `0205` probe were both still exactly where it said.

**The panel sits BELOW the editor and ABOVE `SharePanel`.** Two reasons, and the
first is the one that decided it: private by default is decision 24's premise, so
for almost every student on almost every assignment this panel is a heading and
one quiet line, and a permanently empty box above a student's own work spends
vertical space at 375 to say nothing. Measured: 122px at 375 and 75px at 1440.
`PartsPanel` earns its place above the editor because a part hold is CONTENDED
and time-limited -- not reading it costs you the part -- and nothing is lost by
finding a shared document a moment later. Within the sharing pair, inbound reads
before outbound.

**It is mounted independently of `ideacadTeam`.** Two migrations, two questions:
a deployment can answer `0205`'s list and not `0207`'s assembly, and a student
can have something shared with them on an item whose own document has not opened.
One `{#if}` over both would let each absence hide the other.

## Two editors over one seed, and the gate is `canWrite || accessLost`

Before `openShared` had a caller the editor branch had one arm, correctly: `open`
resolves the caller's own document and can publish nothing but `role: 'owner'`.
It is three answers now -- an owner, an EDITOR a classmate granted, and a VIEWER
-- so the read-only arm mounts the SAME seed with `readOnly` and WITHOUT `writes`,
`undoStep`, `redoStep`, `setPrediction` and `commitConceptCard`.

**It is the SEED and not `ideacad`, which is why this is not the manager arm.**
That arm renders the LOAD's payload, which is the student's OWN document -- so
sending a viewer there would put their own blade on screen under a heading about
a classmate's. A mutant that does exactly that is in the proof.

**`|| accessLost` IS NOT A LOOPHOLE. It is what stops the flip destroying the
student's unsaved work.** `accessLost` is reachable only from a document that
opened writable and had a write refused, and `store.ts` takes `canWrite` false
with it. Without that term the branch would swap the writable editor for a
read-only one at exactly that moment, unmounting the instance holding the edit
that was just refused and re-seeding from the last SAVED state -- the opposite of
what `IDEACAD_SHARED_ACCESS_LOST` promises in words ("What is on screen is still
here"), with nothing reporting it. Keeping the editor costs nothing:
`refuseWrite` is the floor and throws that same sentence at every press.

**`=== true`, so a self-contradictory payload opens READ-ONLY.** Role `editor`
with `canWrite` false is what a future role or a bad deploy produces, and a
control whose only possible outcome is a refusal must not be offered.

## Opening a classmate's document is not a one-way door

`store.openShared` REPLACES the store's snapshot, and a student's own document is
never a row in `rows` -- that list is what was shared WITH them. So without a
return control, Open is a one-way door out of your own work whose only exit is a
reload. That is CLAUDE.md's Foundry rule one subsystem over: "the Hide control is
a ONE-WAY DOOR with a Restore nothing can ever be selected to press."

The banner is FIRST in the slot, above even the parts list, which is
`PartsPanel`'s own argument taken one step further: which part is mine gates the
modelling, and WHICH DOCUMENT I AM IN gates that in turn. The heading two lines
up says "Your work", which on a classmate's document is wrong, and a student who
reads it after modelling for ten minutes has found out far too late. It costs
nothing in the ordinary case, because `open` can publish no role but `owner`.

Its absence is still the mechanism: no `onreturn` means no button, and the line
beside it says to reload instead, so a missing control reads as a rule rather
than a defect. The owner's name is looked up through `ideacadSharedIsOpen` and
NULL is a normal answer that renders no name -- the list is fetched once, so a
document opened before a refresh has no row to name, and a placeholder there
would be this file inventing an identity.

## Four defects, and only one of them any check could have caught

**1. THE WRITABLE BLADE EDITOR HAD NEVER RENDERED ON THE REAL ITEM PAGE.**
`BladeEditor.svelte` line 147 was `features: structuredClone(c.features)` with no
`$state.snapshot`. `+page.svelte` holds the store's snapshot in `$state` and
`ideacadEditorSeed` carries each row's `features` REFERENCE into the seed, so
every `c.features` reaching that line is a deep Svelte proxy -- and
`structuredClone` throws `DataCloneError` on a proxy. Measured in the harness
Chromium: `structuredClone(new Proxy({a:1}, {}))` throws `DataCloneError` while
the plain object clones, and before the fix `/dev/ideacad-item?role=editor`
reported `editors 0` with a pageerror at that map. This file's own `snap()` block
already states the rule ("`structuredClone`, which throws `DataCloneError` on a
`$state` proxy -- so the boundary is here, where the proxy is"); those two calls
were the one place in the file that did not follow it.

It has stood since ledger 0178 wired `ideacadDoc`, and nothing found it because
nothing in the repository had ever mounted `ItemDetail` with a real store
snapshot: the DOM tests pass plain objects, `/dev/ideacad` mounts `BladeEditor`
directly, and the real page needs a Bosco Tech Google session. **This is the
strongest argument for the harness this bundle adds.** `$state.snapshot` on a
value that is not a proxy returns it unchanged, so every existing harness is
untouched -- which the 50 route/width `/dev/ideacad*` runs confirm.

**2. `+page.svelte` HARDCODED `role: 'owner'` INTO `ideacadTeam`.** True while
`sharedWithMe` had no caller, and a guess the moment `openShared` was wired --
the wrong one for a classmate's document, because `ideacadCanShare` is true for
`owner` alone and a hardcoded owner would put a share form under a document the
caller does not own. It reads `ideacadDoc?.role ?? null` now; `?? null` and never
`?? 'owner'`, because "cannot tell" must not render as the permissive answer.

**3. `SharePanel` SAID ONE SENTENCE TWICE.** Found by rasterizing at 1440 and
looking, and only after the harness was corrected -- the first version of it did
not pass `ideacadTeam`, so it was a picture of a page production never shows.
With the panel there, a classmate's document rendered a heading reading
"Sharing", a "CAN EDIT" chip and `IDEACAD_ROLE_NOTES.editor`, which is
BYTE-IDENTICAL to the note the shared row for the same document renders 150px
above it, and which the banner says a third time in its own words. This is ledger
0201's second rasterized defect exactly, moved from inside one panel to between
two -- a thing only the mount could produce. `SharePanel` is now mounted on the
caller's own document only, which loses nothing: `ideacadCanShare` is false for
editor, viewer AND manager, so on a shared document it could never have offered a
form.

**4. THE SAVE CHIP CLAIMED "Changed elsewhere" WHEN IT WAS THE ACCESS THAT
CHANGED.** `store.ts` reuses `phase: 'conflict'` because the consequence is
identical, and `shared-open.ts` already gives the state its own SENTENCE for
precisely this reason; the one-word chip was still reading the phase, so at 375
the editor header said "Changed elsewhere" about 1200px above a notice saying the
access was removed. **Fixed at the call site rather than in `ideacadSaveLabel`,
deliberately.** That function maps a PHASE to a word and cannot tell a revoked
grant from a stale revision, and giving it a second parameter is the obvious
change and a trap: `tests/dom/ideacad-mount.test.ts` calls it point-free as
`[...].map(ideacadSaveLabel)`, so `map`'s index would arrive as the new argument
and be truthy for four of the five phases. `ideacadSaveLabel('error')` is the
existing vocabulary's word for a write that did not land, which is true here and
adds no second spelling of anything.

## Decision 27's open case, closed

Ledger 0211 named its own gap plainly: two real editors on one shared document
had never been driven through the timeline, which is the case decision 27 is
actually about, and only a mount could make it reachable. It is reachable now and
it was driven: `/dev/ideacad-item?role=editor` opens a classmate's document
through the real store and the real `0209` transports, and the timeline reads
`0 Part created ... luis.ortega 6:00 PM` and `1 Body Revolve, Extension height
0.5 in to 0.75 in ... You 9:12 AM`. Rasterized and looked at.

The read-only arm carries `history` and `viewerEmail` too, because reading how a
part was built is the same disclosure as reading the part -- `0205`'s own
policies scope both -- and `BladeEditor` already withholds Undo from a surface
with no `undoStep`. A viewer gets the timeline and no undo, asserted in both
directions.

## `canWrite` in the terminal state, confirmed on the tree branched from

Ledger 0201 found `canWrite` staying true with `accessLost`, which let `create`,
`rename` and `delete` reach the database after the grant was gone, and closed it.
Confirmed here on `origin/integration` at `9b010f53` rather than taken on trust:
`store.ts`'s access-lost publish carries `canWrite: false` beside `accessLost:
true`, and `/dev/ideacad-item?role=editor&state=lost` reports
`phase conflict, accessLost true, canWrite false` through the real store driven
by a real refusal. It is fixed.

## The harness, and why it is a new route

`/dev/ideacad-item` mounts the REAL `ItemDetail` on a real schema-4 assignment
with the real `createIdeacadStore` behind it. `/dev/ideacad-shared` measures the
PANEL and passes on the day the panel is mounted nowhere, which is the state the
repository was in for three days.

A NEW ROUTE rather than a state on an existing one, which is `/dev/ideacad-team`'s
own header's argument: a new URL collides with nobody, and
`tools/browser-verify/routes.mjs` derives a spec's filename from its own path, so
two lanes adding two routes always produce two different files. **That derivation
caught a filename mistake at load time** -- `ideacad-item-state-lost.mjs` for path
`?role=editor&state=lost` was refused with the name it should have had, which is
the guard working.

**It is in the room production is in.** `ItemDetail` only ever renders under
`/classroom/+layout.svelte`, which is `.cr-root` and imports
`$lib/classroom/classroom.css`; the harness carries both, and a `presence` row
asserts the room actually mounted rather than trusting the markup.

**`state=lost` was unreachable on the first run and the reason is worth writing
down.** With `0209`'s transports present the store's write goes through
`applyActions` and never touches `saveConcept`, so a harness that refused in only
one of them drove the terminal path in neither. Both refuse now.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. Re-derived at the branch point with the two
  `PUBLIC_SUPABASE_*` values exported before the sync and the change stashed, and
  identical after. The line in CLAUDE.md was right this time and was still
  re-measured.
- **The full suite: 461 files, 8767 tests, 0 failures**, 579.1s.
- **`tests/dom/ideacad-shared-mount.test.ts`: 30 tests**, mounting the real
  `ItemDetail`.
- **Mutation proof: 14 mutants, 13 caught, 1 survivor**, every file restored
  md5-identical from an in-memory copy and never with `git checkout --`, the
  runner parsing vitest's summary line rather than its exit code (measured in
  this repo: a clean assertion failure exits 0) and running the unmutated tree
  first as a positive control.
  - **The survivor is genuine defence in depth and was kept**, proved pairwise
    per CLAUDE.md: layer 1 alone open (writes handed back, `readOnly` kept) is
    GREEN, layer 2 alone open (`readOnly` dropped, writes withheld) is RED with
    3 failed, and both open is RED with 4 failed. `readOnly` is what removes the
    controls; the withheld transports are what stop a write reaching an RPC if a
    control ever did render (`if (!writes || readOnly) return` inside
    `BladeEditor`), which no rendering can observe. `accept` was added to the
    control census specifically so layer 2 is independently visible -- counting
    only Undo and Redo, which BOTH layers gate, would have made one of the two
    invisible to the test.
- **`npm run verify:browser -- --route /dev/ideacad`: 50 route/width runs, 972
  measurements, 0 outside threshold** -- the seven new specs plus every
  pre-existing `/dev/ideacad*` route, which is what says the `BladeEditor` change
  regressed nothing.
- **Reported figures rather than thresholds**, through `prepare` evaluate steps:
  the banner is 311px at 375 and 896px at 1440, the way back 176px at both, and
  the empty shared panel is 122px tall at 375 and 75px at 1440.
- **One `npm run verify:readme -- --route ideacad-item` pass**: seven measurement
  files written under `measured/`, both counts regions regenerated. The store now
  holds 222 specs, 444 runs, 7940 measurements, 0 outside threshold.
- **The pages rasterized at 375 and 1440 and looked at, twice** -- once to find
  defects 3 and 4 and once to confirm the fixes.

## What is NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project; no `0205` RPC was called for real from this container.
  Every claim about what the database answers comes from ledger 0201's own
  database tests and from `store.ts`'s source, not from a live call here.
- **No signed-in surface was driven.** `/dev/ideacad-item` needs no session by
  construction; the real classroom item page was not opened, because that needs a
  Bosco Tech Google account. **This is exactly where defect 1 lived for weeks**,
  and the harness is what makes that gap smaller rather than what closes it.
- **Production was unreachable and was not routed around.** `curl` to
  `ideabosco.com` was not attempted from this session; the deploy probe's answer
  is reported in the ledger's landing note rather than guessed.
- **`prefers-reduced-motion` is `no-preference` in the harness**, so that path is
  not exercised. Nothing this bundle adds animates, which is an argument rather
  than a measurement.
- **Text is measured in the fallback stack.** The harness blocks every
  non-loopback request, so Rajdhani and Share Tech Mono are not the faces the
  contrast figures were taken against.
- **The `applyActions` path was not driven for a real 0209 write on the mount.**
  The harness's `applyActions` answers the shape and refuses when revoked; it
  does not append rows, so the timeline the mount shows is the seeded log rather
  than one grown by editing through this surface.

## What was deliberately left undone

**THE SHARED LIST IS ITS OWN ROUND TRIP AND SHOULD NOT BE.**
`createIdeacadSharingTransports` asks `ideacad_shared_with_me` purely to find out
whether `0205` is deployed and throws the payload away, so the page now asks the
same question twice per schema-4 item. `probeIdeacadAssembly` avoids exactly this
one migration over by handing its payload back, and its own comment says so.
Fixing it means changing that function's return shape, which is `transports.ts`
and outside this bundle; it is named here rather than folded in, because a second
reader of a probe wants its own answer for every caller.

**A TEACHER STILL CANNOT EDIT A SHARED DOCUMENT**, unchanged: `CAPABILITIES.manager.canWrite`
is false because `0205` deliberately left `0201`'s read-only grant alone. And a
manager reaches none of this at all, because `ideacad_open_document` raises for
one, so there is no store and `ideacadShared` is null.

**THE RETURN CONTROL RE-OPENS, IT DOES NOT RESTORE.** `store.open(itemId)` reads
the caller's own document afresh; anything unsaved in the classmate's document is
in the debounce and is flushed by `openShared`/`open`'s own leading `write()`,
which is the store's existing behaviour and not this bundle's to change.
