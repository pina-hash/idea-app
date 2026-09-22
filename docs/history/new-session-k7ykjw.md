---
title: "The grading console: a false \"Not opened\" over work that was handed in, two panels collapsed above the names, a pinned Return control, and a student pager"
date: 2026-09-22
branches: ["claude/new-session-k7ykjw"]
migrations: []
subsystems: ["classroom", "grading", "presence", "verification"]
---

Ledger 0278. Four of Mr. Pina's own feedback reports, filed on 2026-09-12 and
2026-09-13 while he was grading (build `247dfc4`). One of them is a
data-correctness bug and the other three are reach; two of those three were
wiring something that already worked to a control.

### The correctness bug, and how it was found

**A roster row could read "Returned 18/20" with "Not opened" printed underneath
it.** `PresenceLine` had two branches -- a heartbeat row, or
`PRESENCE_NEVER_OPENED` -- and `GradingConsole` handed it
`presenceRows.get(s.email) ?? null` over a single nullable `PresencePayload`. So
`null` stood for FOUR different states and one sentence was printed for all of
them.

It was reproduced before anything was changed, by mounting the real component
with four transports (`tests/dom/`, because no URL can reach these states):

| state | Ana, chip "Returned · 18/20" | Ben, chip "Not submitted" |
| --- | --- | --- |
| presence never resolves (every load starts here) | **Not opened** | Not opened |
| transport answered null (no `0200` on this deployment) | **Not opened** | Not opened |
| the read threw (a swallowed network error) | **Not opened** | Not opened |
| resolved with zero rows (retention sweep, or pre-`0200` work) | **Not opened** | Not opened |

Only the last row is a state in which the verdict could be true, and only of the
student who also handed nothing in. After the change:

| state | Ana (work returned) | Ben (nothing) |
| --- | --- | --- |
| presence never resolves | *(no line at all)* | Not known |
| transport answered null | *(region removed entirely)* | *(region removed)* |
| the read threw | *(no line)* + a stale notice | Not known |
| resolved with zero rows | *(no line)* | **Not opened** |

### What changed

- **`presenceLineKind` in `$lib/classroom/presence/state.ts`** is the one
  decision, taking three facts (is there a row, has presence ANSWERED, has any
  work arrived) and returning `row` / `outranked` / `unknown` / `never-opened`.
  `PresenceLine` renders it and decides nothing; `outranked` renders no element
  at all.
- **`presenceStatus` in `GradingConsole`** replaces the nullable payload as the
  thing the region keys on: `pending`, `ready`, `unavailable`, `stale`.
  `unavailable` (the transport's `PGRST202` rung answering null) removes the
  region, which is what that rung always meant -- the region had keyed on the
  TRANSPORT OBJECT, which both grading routes hand in unconditionally and
  correctly, so the absence-removes-the-region rule never fired for the one
  state it was written for.
- **`workArrived` asks `statusChip` itself** (`statusChip(s).cls !== 'none'`)
  rather than walking `submission`, `responses` and `files` a second time. The
  second walk is precisely the copy that stops matching, and what it produces is
  the pair of contradicting verdicts this whole repair is about.
- **`PRESENCE_STALE_NOTE`** is the quiet line a failed read earns. Keeping the
  last payload is right; keeping it silently is how an absent reading passes for
  a fresh one.
- **`presenceCoverageNote(limits)`** replaces the constant, so the retention
  window comes from the payload rather than from a literal;
  `PRESENCE_COVERAGE_NOTE` is derived from `PRESENCE_LIMITS_FALLBACK`. The
  sentence now says what presence does NOT cover: only the assignment page, only
  since it was switched on, only the retention window, and that a blank line is
  never evidence a student did nothing.
- **An unpublished ported assignment shows the student's saved answers.**
  `/hx/<docId>` refuses a document whose item is not live with a bodyless 404
  (`$lib/server/html-assignment-document.ts`), and that gate is not loosenable
  from any side -- the route answers on a host holding no session, so
  publication status IS its whole authorization. So the notice stays and
  `htmlAnswerSheet` (in `html-assignment/mount.ts`) projects the answers from
  the SAME seed the document would have been given, grouped the way the manifest
  groups its blocks, labelled by each block's own `field`. A block the student
  left alone says so, and an empty string says "Left blank" rather than nothing.
- **The two panels above the names are `Disclosure` callers, closed by default**,
  with the open/closed count in the `meta` snippet so shutting the panel does not
  hide the number a teacher acts on. `.roster-tools` is a scroll region with
  `max-height: 45%`, which is the list's floor written as a ceiling on the thing
  that was starving it.
- **`Return to student` is a sticky dock bounded by a new `.grade-main`**, with
  `z-index` and an opaque ground. `.grade-main` exists only to bound it: the
  batch panel is further down the same card.
- **Next and previous student are buttons**, `aria-disabled` at the ends,
  routed through the existing `moveStudent` so the unsaved-work guard still
  fires and focus still lands on the first criterion. No new logic and no server
  change; the keys and the legend are untouched.

### What was measured

**Ledger 0278 is the fourth and fifth time a figure in this repo was wrong
because somebody trusted it rather than the instrument, so every number below is
this session's own reading.**

`npx svelte-check`: **0 errors, 37 warnings in 20 files, 31 / 5 / 1**, before
and after, with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported
before the sync (a checkout with no `.env` reports phantom errors).

`npm test`: **527 files, 9841 tests, all passed, exit 0.**

**The space above the names**, measured as the distance from the roster card's
top to the list's top, at the harness's natural height. The before column was
taken by checking `origin/main`'s files out over the tree, touching them to wake
Vite's watcher, and confirming from a TREE TOKEN (`[data-testid=
"work-export-disclosure"]`, 0 before and 1 after) that the served bundle was the
one being claimed -- a `git stash` is not reliable here and the token is what
makes the reading auditable.

| route | width | before | after, collapsed | after, expanded |
| --- | --- | --- | --- | --- |
| `/dev/html-assignment-grading` (both panels) | 1440 | 385.3px | **138.3px** | 233.1px |
| `/dev/html-assignment-grading` | 375 | 581.5px | **196.8px** | 546.0px |
| `/dev/grading-bulk` (export only) | 1440 | 467.1px | **272.4px** | 473.2px |
| `/dev/grading-bulk` | 375 | 839.0px | **498.3px** | 819.0px |
| `/dev/presence` (export only) | 1440 | 284.8px | **179.8px** | 307.6px |
| `/dev/presence` | 375 | 480.0px | **262.5px** | 510.0px |

**Names visible.** No `/dev` route mounts the console inside the `.cr-app`
frame, so on a harness the roster card sizes to its content and the saving shows
up as a shorter card rather than a longer list. With the card pinned to a real
frame height (380px at 1440), which is a FORCED condition and is reported as
one:

| route | before | after |
| --- | --- | --- |
| `/dev/html-assignment-grading` | list **0px**, **0 of 2** names | list 44px, **2 of 2** |
| `/dev/presence` | list **18.2px** with 225px of content, **0 of 5** names | list 156.9px, **4 of 5** |

That zero is Mr. Pina's "I can only see like one student at a time", measured.
`clippedRegions` is empty in every one of those readings, before and after: no
region above the names holds more than it shows without a scrollbar.

**The dock.** Measured in the scrolled state rather than asserted from the CSS,
and HIT-TESTED at the Return control's own centre, which is the only read that
tells a covered control from a clickable one:

- 1 dock and 1 Return control at every scroll position, at both widths.
- Pinned to its container's bottom edge while the block runs past the fold, with
  `document.elementFromPoint` at the button's centre answering `grade-return`.
- Released into its flow position at the end of the block, covering nothing.
- Dock height **86.4px with all four controls on one row** at the real rubric
  column width (~480px, forced, because no harness reaches it) and 162.1px in
  the narrowest column this tree can render (170px on `/dev/grading-bulk` at
  1440). `flex: 1 1 5rem` on the buttons is what fixes both ends.

**The browser harness**: 27 specs over the grading console, presence, ported
assignments and the manifest rubric -- **54 route/width runs, 844 measurements,
0 outside threshold**. The measured store went back to its pre-existing **146**
findings, so the eight specs this bundle wrote or widened contribute none.

### Mutation proof

Six mutants, each restored from a COPY taken before mutating (never
`git checkout --`, which is a discard-to-HEAD) and md5-verified afterwards.
Nothing was committed while a mutation was applied.

| mutant | judged by | killed by |
| --- | --- | --- |
| `presenceLineKind` returns `never-opened` for every missing row (the pre-0278 behaviour) | `npm test` summary | **6 of 22** tests |
| `loaded` weighed BEFORE `workArrived` | `npm test` summary | 2 of 22 |
| the console stops passing `workArrived` | `npm test` summary | 3 of 22 |
| and then stops passing `loaded` as well | `npm test` summary | 5 of 22 |
| `position: sticky` removed from the dock | the harness's own outside-threshold count | **4 measurements**, including the hit test answering `DIV` instead of the button |
| `z-index` removed from the dock | the same | 2 measurements |

The z-index mutant is the one worth noting: the HIT TEST still passed under it,
because nothing on that fixture happens to paint over the dock. That is exactly
why the explicit `zIndexAboveAuto` row earns its place rather than being left to
the hit test -- it is the notebook grid's sticky-header trap, which shipped.

### Two things this session got wrong first, and they are the same mistake

**The list's floor was written as a `min-height` on the list, twice, in two
directions, and both starved the other region.**

1. `min-height: min(18rem, 100%)` on `.roster-list` won the flex fight outright
   and took `.roster-tools` to **0px tall with 156px of content in it** --
   clipped rather than scrolled, which is precisely the failure the scroll
   container had just been added to prevent. It also stretched the grid rows to
   252px each.
2. Correcting that with a 9rem `min-height` on `.roster-tools` inverted it: on
   `/dev/html-rubric?state=single` at 1440, where the roster card is 257.9px,
   the list came out **11.9px tall with 44px of content**. The first name was
   clipped out of its own list and `elementFromPoint` at the row's centre
   answered the bulk checkbox's label, so a click stopped selecting a student.
   **Nothing about that was visible** -- it surfaced as a browser-harness prepare
   step that never reached its state, at one width only.

A proportional ceiling and no absolute floor on either side cannot do either.
The lesson is in `CLAUDE.md` as a rule; the second failure is also the argument
for the harness, which caught a click that had stopped working through a spec
about something else entirely.

### Not verified

- **The real `/classroom/[sectionId]/item/[itemId]/grade` page.** It needs a
  Bosco Tech Google session no automated run holds, and no local Supabase stack
  is reachable from this container (`wsl docker ps` is not available, ports 54321
  and 54322 have no listener, `docker` has no socket). Every measurement above is
  a `/dev` harness, and where the real page's geometry differs -- the `.cr-app`
  frame, the ~480px rubric column -- the condition was FORCED and labelled.
- **A class of thirty.** The largest harness roster is seven. The starvation was
  reproduced by pinning the card's height instead, which is the same arithmetic
  from the other side.
- **The Vercel preview.** No cloud session can open one.
- **Whether students are in class right now.** A session has a clock but not a
  timetable.
- **`prefers-reduced-motion: reduce`.** The harness runs at `no-preference`.
  Nothing this bundle added animates, but that path was not exercised.
- **Web fonts.** The harness blocks every non-loopback request, so all text was
  measured in the fallback stack.

### Deferred, and for Mr. Pina

- **A comment bank, a grade importer, audio feedback, a quick-zero action and
  the side-by-side rubric for HTML assignments** are four further reports of
  yours and were explicitly out of scope here. They were queued behind this
  bundle because they all need this file.
- **The roster row stays at 44px.** `IDEA_INTERFACE_STANDARDS` 2.12 permits
  24px only on an instructor-density surface that DECLARES itself in a named
  class, and the row's own comment records that 44px was chosen after measuring
  35px. The cheaper win was taken instead: a row whose work has arrived no
  longer draws a presence line at all, so the third line is gone from exactly
  the rows you are reading when you grade. **If you want the density, say so and
  it can be declared** -- but it should be a decision, not a side effect.
- **A teacher still cannot see a student's custom IdeaCAD material**, and
  presence still cannot see a student who did the work on a path that emits no
  heartbeat. Neither is fixable from the browser; both are named in `CLAUDE.md`.
- **The browser harness recorded 22 findings on one run of eight specs and 0 on
  an immediate re-run of the identical set**, with the pre-existing 146 restored.
  The stored measurement is the clean one. A single harness run is not a reliable
  verdict on its own for these specs, which is worth knowing before anybody
  treats that store as a gate.
