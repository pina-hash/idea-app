---
title: "Seven notebook defects an audit named and nothing had run: a staff removal stops being blamed on the student, a chip that could only ever be empty stops rendering, the way back keeps its section, and the Live pill starts reporting the channel instead of the transport"
date: 2026-08-30
branches: [claude/notebook-audit-fixes-0tkfek]
migrations: []
subsystems: ["Notebook", "Testing", "Browser verification"]
---

An audit produced seven items and ran nothing. Every claim in it was checked
against the files before anything was changed; six were exactly right, one was
wrong in the direction that matters (it predicted a failure and there is none),
and one of the seven turned out to be stated in two places rather than one. No
migration: another lane owns notebook access, and nothing here needed schema.

## 1. A staff-deleted entry was labelled as if the student deleted it

`NotebookDeletedZone` said "Entries {studentName} removed from this notebook"
over a list its own docblock correctly described as unconditional, and the
database agreed with the docblock -- `notebook_review_student_notebook`'s
`deleted_entries` projection carries no `deleted_by` filter (0118 line ~1249,
0119 line ~990). So an instructor read that a student had thrown away work
their own colleague had deleted, and nothing about the screen said otherwise.

**The data was already on the wire and thrown away one layer up.**
`deleted_by` is projected by the payload function and typed in the route's
payload interface, and then simply not passed to a component whose entry type
had no such field. Three small changes closed it: `deleted_by?: string | null`
on `NotebookDeletedEntry`, `deletedEntryActor` beside it, and two new props on
the zone.

**NO UUID IS RESOLVED TO A NAME, which is the AdminLogPanel rule and is why
this is four answers rather than a lookup.** `adminLogActor` resolves only the
viewer's own id to "You" because joining `profiles` for arbitrary actor ids
would add a read of other people's rows for a cosmetic gain, and 0069's "a log
row must survive the deletion of what it describes" means half of them name
nothing. The same reasoning holds here, so the derivation uses only the two ids
the page already has:

- `deleted_by === student.user_id` -> the student
- `deleted_by === viewerId` -> "you" (the one other id, exactly as the log does)
- any other non-null uuid -> "staff"
- **null -> `unknown`, NOT `staff`.** 0116 declares
  `deleted_by uuid references auth.users (id) on delete set null`, so a null
  names an actor whose account has gone. Answering "staff" there attributes a
  removal to somebody on no evidence at all.

**THE ATTRIBUTION MOVED TO THE ROW AND THE HEADING GAVE IT UP.** A section-level
sentence over a mixed list can only be wrong about half of it -- that IS the
defect -- so the heading is now neutral and each row reads
`Deleted by <who> · <when>` off one template with one substitution. One
template, because four sentences written out separately are four things that
can stop agreeing.

**A STUDENT WITH NO ACCOUNT IS A NORMAL STATE AND IS HANDLED EXPLICITLY.** 0094
puts a student on a roster before they have ever signed in, so
`student.user_id` is legitimately null; matching null against null would have
credited them with every staff removal. `deletedEntryActor` requires a truthy
`studentUserId` before it can answer `student`, and the test pins it.

## 2. A control whose only possible outcome was an empty state

`NotebookView`'s `deletionReady` defaults to `true` and `deletedEntries`
defaults to `[]`, so every mount that mentions NEITHER -- which is both
read-only mounts -- drew the "Recently deleted" chip over a list that was
permanently empty. Clicking it swapped the pane to second-person copy promising
the reader nothing was there.

**THE CHIP ASKED HALF THE QUESTION THE EMPTY-STATE LINK BESIDE IT ALREADY
ASKED.** `filter-deleted-empty` was already gated
`deletionReady && deletedEntries.length > 0`; the chip was gated on
`deletionReady` alone. `deletionReady` asks whether 0117 is APPLIED and says
nothing about whether this caller was handed an answer. Both now read one
derived `deletedOffered`, so they cannot diverge again.

**ONE GATE FIXED BOTH SURFACES AND NEITHER ROUTE WAS EDITED.**
`/classroom/view-as/[email]/notebook` has the same phantom chip and renders no
Deleted zone at all, so there the chip was the page's ONLY deleted affordance
and it was structurally empty. That tree is another lane's and was not touched;
a new browser-verify spec is what says the fix reaches it.

**IT NEEDED A CLAMP, AND THAT IS THE PART THE AUDIT DID NOT NAME.** Gating the
chip on the length means it DISAPPEARS when the last deleted entry is restored
-- which would have left the pane in the deleted view with the only control
that leaves it gone from the screen. A one-line `$effect` clamps
`showingDeleted` to `deletedOffered`, the same shape as the component's
existing stale-selection clamps, and it reads nothing it writes so it cannot
cycle.

## 3. Student-voice copy on a staff surface

"Search your notebook" and "Entries you have written something on", on a page
where the reader is not the author. **The audit named two and there were four**:
the Drafts hint ("Entries you have not turned in yet") renders on the read-only
page too, since `draftsReady` also defaults true, and the Deleted hint is the
same shape. Fixing two of four instances of one defect is how a rule ends up
stated twice, so all four go through one function.

**THE SHARED CONSTANTS IN `$lib/notebook-folders` ARE NOT REWRITTEN.** The
student's own view is the common case and keeps its own words; `readOnly`
re-voices at the point of use through `READ_ONLY_FILTER_HINTS`, which is
**sparse on purpose** -- a hint that says nothing about who wrote the work
("Entries with at least one page photographed") is already correct for both
readers, and restating it here would be a second copy of a string that did not
need changing.

## 4. The return link threw away the console's state

`StudentReviewBackStrip` linked to a bare `/notebook/review`, so coming back
reset the section to the first one, the unit to "All units", the cursor to
nothing and the panel to closed. `/notebook/review`'s own load already reads
`?section=` and validates it against the viewer's section list; nothing was
putting one in front of it.

`studentNotebookHref` in `ReviewConsole` now appends the section, the student
page's load echoes it (page load, so reading `url` is fine -- it is a LAYOUT
load that must never), and the strip builds the href from it.

**THE UNIT IS NOT CARRIED, AND THE REASON IS THAT THERE IS NOTHING TO CARRY.**
The console reads `?section=` and nothing else off the URL; `unitChoice` is
component state with no `?unit=` behind it. Inventing one means a second piece
of URL state to keep valid against a section's own unit list -- a bigger change
than this, with its own reset rules -- so it is named rather than guessed at.

**THE ECHOED VALUE IS SHAPE-CHECKED, NOT AUTHORIZATION-CHECKED.** The load
admits it only if it looks like a uuid, so nothing else a caller types reaches
an href; whether that section is the caller's is `/notebook/review`'s question,
and it already answers it by falling back to the default. A second copy of that
check here could only stop agreeing with it.

## 5. A test that spelled out two filenames instead of the rule it meant

`tests/notebook-shell.test.ts` swept for `revealDetailPane` in two named files.
The rule is `reveal.ts`'s own: under `scroll="page"` neither pane bounds itself,
so a detail pane opened from a row forty down renders above where the click
happened -- a click that looks like it did nothing.

**SIX CALLERS OUTSIDE THE NOTEBOOK TAKE THAT COST, MEASURED RATHER THAN
PREDICTED**, and the generalised sweep names all six when the exemption list is
emptied:

```
src/lib/coin-desk/LogView.svelte
src/lib/foundry/FoundryGallery.svelte
src/lib/foundry/FoundryMine.svelte
src/lib/foundry/ReviewQueue.svelte
src/lib/maps/MapsEditor.svelte
src/routes/dev/classroom-inspector/+page.svelte
```

Every one is another lane's file, so they are a PINNED EXEMPTION LIST with a
reason each, not a silent gap -- a list is something somebody can shorten.

**IT BITES IN FOUR DIRECTIONS, all four proved by mutation:** a page-flow caller
not on the list that does not reveal fails; an entry on the list that HAS been
fixed fails (so the list can only shrink and a fix cannot be quietly
re-exempted); an entry that has stopped being page-flow fails; and a positive
control fails if the walker or the tag regex stops finding anything.

**`ReviewConsole` IS `scroll="fill"`, NOT `page`**, which the audit's framing
did not anticipate -- so the generalised rule does not require it to reveal,
though it does. The named two-file assertion is KEPT beside the sweep rather
than replaced by it, so that coverage is not lost to the generalisation.

**A BOUND `scroll` IS A FAILURE, NOT A SKIP**, on the `ALLOWED_PURE` reasoning:
a file the checker could not classify is a file it never checked. Every caller
today writes a literal, and the sweep asserts that rather than assuming it.

## 6. A comment stating a reason that is no longer true

`MAX_PHOTO_BYTES` was justified by "Vercel serverless rejects request bodies
past ~4.5 MB". That figure is historical -- the platform accepts far more, and
the classroom stopped POSTing bytes to our own functions entirely in 0133/0135
(browser to a private bucket, 4 MiB to 200 MB). **The cap did not move**: that
is a decision with a transcode question attached and it belongs in its own
bundle.

**THE SAME CLAIM WAS IN TWO PLACES, and the audit named one.**
`$lib/notebook/camera.ts` repeated it for `MAX_UPLOAD_BYTES`. Both are
corrected, and camera's keeps the part of the margin argument that is still
true and was never about Vercel: a multipart body is the file plus its part
headers plus the other fields, so a file sized exactly at the server's cap
still posts a body over it.

## 7. A status pill that may have been lying

`ReviewConsole` set `live = true` the moment `subscribe` RETURNED, and the route
called `.subscribe()` with no status callback. That is a claim about the
TRANSPORT EXISTING, not about the channel: a publication that does not carry the
notebook tables, a failed join and a socket a school proxy eats all produced a
green Live pill over a console that would then silently never update.

`subscribe` takes a REQUIRED `onStatus` now, and the console relays it into a
three-state `channel`. A transport that cannot report its channel therefore
cannot claim Live -- absence is the mechanism here as everywhere else.

**WHAT THE PILL SAYS WHEN THE CHANNEL IS NOT UP, and what it deliberately does
not say:**

- `connecting` -> **nothing at all.** It is both the ordinary sub-second state
  after every subscribe AND what a transport reporting no status gets. A pill
  that flickers on every section change is noise, and a console about to be live
  is not a fault worth announcing.
- `live` -> the existing green pill, unchanged.
- `stalled` -> **"Not live. Reload to see new work."**, in `--text-2`, beside
  the same muted "Loading..." pill. A dropped socket is common and supabase-js
  rejoins on its own, so this must not read as an alarm. What it carries is the
  one fact the reader cannot see for themselves: new work will not appear by
  itself. Not `--nb-warn` -- the room's amber is what the grid uses for a LATE
  check-in, and the grid is not wrong here, it is only not moving.

`CLOSED` maps to `stalled` with the other two failures, and the console ignores
every status after its own teardown, so an ordinary unsubscribe never paints one.

**THE RESIDUAL GAP IS NAMED RATHER THAN LEFT TO BE REDISCOVERED.** A status
callback reports what the SOCKET did. A channel that JOINS while the publication
carries none of the notebook tables reports `SUBSCRIBED`, shows Live, and still
never updates. Closing that needs a heartbeat, which is a different bundle. The
dev harness has a `silent` mode that reproduces exactly this, sitting beside the
new `stalled` mode so the two are visibly not the same state.

## What was measured

**`npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings in 20 files**,
31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class` -- the documented baseline, before and after. The
`.env`-less checkout does report the 11 phantom errors CLAUDE.md describes;
exporting two placeholder values before the sync clears them, as it says.

**`npm test`: 216 files, 4488 tests, all passing.**

**One existing assertion legitimately broke and was GENERALISED, not deleted.**
`tests/notebook-review-console.test.ts` pinned the whole `subscribe` signature
verbatim while the rule it meant is about the change handler carrying NO
PAYLOAD. It asserts `onChange: () => void` now, plus that the handler takes no
argument at all.

### Mutation proofs

Every one restored from a SCRATCH COPY and md5-verified, never `git checkout --`
(CLAUDE.md: it is a discard-to-HEAD that takes uncommitted work with it).

| Mutation | Result |
| --- | --- |
| `deletedEntryActor` collapsed to always `'student'` | 8 assertions red, including "the two sentences differ" |
| the original defect shape restored (one section sentence, no per-row line) | 6 red |
| `KNOWN_UNREVEALED` emptied | 1 red, naming exactly the six files above |
| a file that DOES reveal added to `KNOWN_UNREVEALED` | 2 red |
| a `fill` caller added to `KNOWN_UNREVEALED` | 2 red |
| the `<ClassSplit` tag regex broken (dead sweep) | 2 red -- the positive control |
| the Live pill put back on transport-existence | 1 red (see below) |

**THE PILL MUTANT PASSED THE FIRST ASSERTION WRITTEN FOR IT, and that is worth
recording.** A check that only looked for `live = true` was green against a
mutant that set `channel = 'live'` in the subscribe effect and dropped the
status callback -- the identical defect wearing a different name. The assertion
now ENUMERATES every assignment to `channel` and requires exactly
`'connecting'` (the reset) and `status` (the relay), which reddens it. A check
that has never failed has not been tested; this one had not been, until it was.

### The browser pass

`npm run verify:browser`, Chromium 141.0.7390.37, at **375px and 1440px**.
`--probe` and `--selftest` both run: 64 controls, 32 negative and 32 positive,
0 instrument failures.

| Measurement | 375px | 1440px |
| --- | --- | --- |
| the four attribution sentences, read back from the DOM | `Deleted by Ana Reyes \| Deleted by staff \| Deleted by you \| Deleted by an account that no longer exists` | identical |
| "Recently deleted" chip, `/dev/notebook-review-student` | present 0 | present 0 |
| "Recently deleted" chip, `/dev/classroom-view-as-notebook` | present 0 | present 0 |
| "Recently deleted" chip, `/dev/notebook` (the positive control) | present 1 | present 1 |
| back link href | `/notebook/review?section=1111...5555` | identical |
| per-row attribution line, contrast | 5.31:1 | 5.31:1 |
| Deleted section note, contrast | 5.51:1 | 5.51:1 |
| "Not live" pill, contrast | 7.63:1 | 7.63:1 |
| restore controls (4 rows) | 104.2x44 | 104.2x44 |
| **free-entry chip (`.pick.free`)** | **293x67.6** | **234x67.6** |
| horizontal overflow, every notebook route | 0px | 0px |

**THE AUDIT PREDICTED THE FREE-ENTRY CHIP FAILS THE 44px FLOOR AND IT DOES
NOT.** 67.6px min dimension, comfortably over, at both widths -- and nothing
had ever measured it, which is exactly why the prediction was worth checking
rather than acting on. It now has a permanent `tapTargets` row, listed
whatever it measures.

**ONE CONTRAST FINDING WAS FOUND BY THE PASS AND FIXED.** The Deleted section
note measured **4.24:1** on the zone's `--bg2` -- the exact figure CLAUDE.md
already records for `--dim` on that ground (5.31 / 4.46 / 4.24 across the three
plates). The token was NOT moved: `--dim` is also read by five FRC components
on `.frc-root`'s paper where lightening it makes things worse, so the CALL SITE
took `--text-2`, exactly as the two sites in that rule already did. 5.51:1
after, matching that rule's own figure. `.deleted-meta` stays on `--dim`
because it sits on the row's `--bg0` at 5.31:1, which clears.

**Every absence check was proved to redden in BOTH directions on the real
surface, not only in fixtures:**

| Live mutation | Result |
| --- | --- |
| chip gate reverted to `deletionReady` alone | 4 red (both staff surfaces, both widths); `/dev/notebook`'s presence row stayed green |
| chip removed entirely (`{#if false}`) | 2 red (the presence row); every absence row stayed green |
| the Live pill made unconditional | 8 red on `?realtime=stalled`, including `green Live pill (must NOT render when the join failed) present 1` |
| the back link's section dropped | 2 red, `THREW: back link lost the section: /notebook/review` |

Every mutation restored and md5-verified against a scratch copy.

**THE FULL RUN REPORTS 4 MEASUREMENTS OUTSIDE THRESHOLD over 90 route/width
runs and 1064 measurements**, and both findings are pre-existing and belong to
other lanes: `/dev/pathways`' harness controls at 194.7x26.2 (already documented
in the harness README), and `/dev/foundry-submit`'s refusal-sentence row reading
`present 2` against an expected 4. **The foundry one was proved pre-existing
rather than assumed**: measured on a `git stash`ed tree with this branch's
changes removed entirely, foundry files `touch`ed afterwards per the stash trap,
and it reproduces identically. The diff was captured to scratch first and
verified byte-identical after the pop.

## What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder (`example-ref`); no migration was applied, no RPC called, no
  session signed in. Every claim about `deleted_by` comes from reading the
  migration files, not from a query.
- **No signed-in surface was driven.** `browser-verify` covers `/dev` routes
  only, which is a hard boundary; `/dev/login` against a local Supabase stack
  was not run this session.
- **`prefers-reduced-motion: reduce` was not exercised** on any route here --
  the harness runs at `no-preference` for every check except `motion`, and none
  of these specs uses it.
- **Web fonts do not load in the harness**, so every geometry number above,
  including the free-entry chip's 67.6px, is measured in the FALLBACK STACK.
  Contrast is unaffected (it is read back off a painted pixel).
- **The `silent` realtime mode's residual gap is reproduced, not closed.** A
  channel that joins over a publication carrying none of the notebook tables
  still shows Live and still never updates.

## Deferred, and why

- **The six unrevealed page-flow splits.** Each is another lane's file
  (coin-desk, maps, foundry x3, and the classroom-inspector harness), and
  reaching into a surface somebody else is working in to add an effect and a
  binding is how two lanes collide. They are a list somebody can shorten.
- **The 4 MiB photo cap.** Correcting the comment was the item; moving the
  number is a transcode decision.
- **A heartbeat for the `silent` channel case.** See item 7.
- **`/dev/foundry-submit`'s presence finding.** Foundry lane's, pre-existing.
