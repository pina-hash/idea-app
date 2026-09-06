---
title: "The duplicates tab lands, and 0081's whole branch with it: a tripwire that went red on a merge, answered rather than weakened (`claude/land-duplicates-tab-0by1zg`, no migration)"
date: 2026-09-06
branches: [claude/land-duplicates-tab-0by1zg, claude/classroom-nav-surfaces-v958ub]
migrations: []
subsystems: ["IDEA Classroom", "GREENLINE", "Testing"]
---

Prompt 0086. No migration, no database, no new dependency. What changed is one tab, and
the merge that brought three doors onto `main` at once.

Started from `5b3e14b`, which is `origin/main` exactly, in `/home/user/idea-app`.
`origin/integration` is 86 behind and 0 ahead, so main is the trunk and nothing needed
merging from it. `git config user.name` was already `Claude` and `user.email`
`noreply@anthropic.com`, so the merge below could not stall on a missing committer
identity; the prompt's warning about that failure looking like a conflict did not apply
here, and is worth keeping anyway because the shape is real.

## The premise, checked

The prompt carried six claims about the audit. Every one held.

**0081's six edits are all in `nav.ts`, and `classroomMeasure` needs nothing.** TRUE, and
the patch was verbatim in the branch's own history entry and again in `nav.ts`'s header
comment beside the function it edits. `SectionTabId`, `sectionTabs()`, `ClassroomPlace`,
`locateClassroom`, `activeTab`, `classroomCrumbs` -- six, applied as written. An unlisted
place still falls through to `page` in `classroomMeasure`, which is what a report table
wants, and it stays unlisted.

**All three doors were missing from `main`, not just the duplicates one.** This is the
finding the prompt suspected and it is the whole reason the bundle is bigger than a tab.
0085 held the entire `claude/classroom-nav-surfaces-v958ub` branch back, so:

| door | on `main` before this bundle |
| --- | --- |
| the Check-ins tab (`/notebook/review?section=`) | **NOT PRESENT** |
| the GREENLINE dashboard card | **NOT PRESENT** |
| the Duplicates tab | never built by anybody |

Every file the branch added was absent -- the card, both `/dev/classroom-nav` files, all
three browser specs, `tests/classroom-nav-doors.test.ts`, the branch's own history entry
and its ledger entry. What WAS on `main` was the other half of the pairing: 0074's
`/classroom/[sectionId]/duplicates` page, its remove endpoint, and `0187`, applied.

**So the route was to merge, not to rebuild.** Test-merged first, as the prompt asked.
Two conflicts, both append-shaped and neither in code:

* `classroom-updates.json` -- both sides had appended entries at the same array position.
  Resolved by keeping BOTH sides' entries, textually rather than by re-serializing: a
  round trip through a JSON writer is what normalized an unrelated entry's indentation
  on 0081's own branch, and doing it again would put somebody else's line in this diff.
* `tools/browser-verify/README.md` -- both generated regions. Resolved to `main`'s, which
  is the newer measurement (10:15Z on `3a24d23`, 131 specs, against the branch's 09:02Z
  on `83011f7`, 119), and then regenerated in this bundle rather than left stale.

Rebuilding work that already existed and had already been measured would have been waste,
and would have thrown away the branch's own measurements with it.

**The tripwire asserts the pairing as a biconditional, and it is not a "does the tab
exist" check.** `expect(tabExists).toBe(pageExists)`, with the failure message chosen by
which half is present -- "the duplicates page has landed: add its tab" when the page is
there, "the duplicates page is not on this base, so a tab for it would 404" when it is
not. That is what went red on 0085's merge with both parents green.

**The tab must not be the guard, and it is not.** `/classroom/[sectionId]/duplicates`'s
own load asks `classroom_manages_section` and `error(404)`s -- 404 and not 403 or a
redirect, because an enrolled student may legitimately read the section and a bounce
would confirm the page exists. Asserted rather than assumed; see control 3.

**The counts block matched 0085's claim exactly**: `covered` 131 against the tree, 2
outside threshold, both `/dev/notebook` `tap-reach`, which is decision 12 and sits with
the owner.

## What was built

### The tab

`sectionTabs()` gains `{ id: 'duplicates', label: 'Duplicates', href:
`${basePath}/${sectionId}/duplicates`, manageOnly: true }`, **between Grades and
Check-ins**. The position is the rule and not a preference: an in-classroom VIEW sits
above a DEPARTURE. Check-ins is `external: true` and leaves for `/notebook/review`;
Duplicates is an ordinary `/classroom` page, so unlike the departure it activates on
itself, takes the underline and `aria-current`, and has a crumb.

**The deferred patch note in `nav.ts` is gone, and its test was generalized rather than
deleted.** 0081 wrote the patch into the header so nobody would have to re-derive it, and
`tests/classroom-nav-doors.test.ts` asserted the note was there. Landing the tab
legitimately breaks that assertion -- a note telling a reader how to add a tab that is
already there reads as work outstanding. So it became its own biconditional: the note
stands exactly while the tab does not. Re-withdraw the tab without restoring the note and
it is red; leave the note over a shipped tab and it is red.

### The five-tab fixture is deleted, not kept

`/dev/classroom-nav` carried a local `withDuplicates` array and a `?tabs=5` switch,
because 0081 could not ship the tab and the bar at that count could still be measured
honestly with a fixture that never left the file. `sectionTabs()` returns five now, so a
hand-built fifth tab beside the real fifth tab is a second answer to a question the
shipping function answers -- the copy that drifts. It is gone, `?tabs=5` with it, and the
harness bar is the real one.

**The two browser specs folded into one for the same reason.**
`classroom-nav-tabs-5.mjs` drove `/dev/classroom-nav?tabs=5`, a URL that no longer means
anything; its width-independent wrap-equivalence probe was the valuable half and moved
into `classroom-nav.mjs`, replacing that spec's own four-tab probe. The base spec's
`expectPresent: 0` on the duplicates tab -- an absence, against Grades as its positive
control -- became `expectPresent: 1`. Net one spec fewer, no measurement lost.

## What was measured

**`svelte-check`: 0 errors, 37 warnings**, breakdown **31** `state_referenced_locally` /
**5** `css_unused_selector` / **1** `perf_avoid_nested_class`. Re-derived, not read off
`CLAUDE.md`. The first run reported **13 errors in 30 files** -- exactly the documented
no-`.env` phantom count, `$env/static/public` exporting nothing; exporting placeholder
`PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` before `svelte-kit sync` returned it to
0/37 with the breakdown intact. A fresh `npm ci` checkout also had no `.svelte-kit` at
all, which is the other half of that trap; `npx svelte-kit sync` cleared it. `npm ci` and
not `npm install`, and `package-lock.json` came out byte-identical.

**The five-tab bar, driven at both widths** on chromium 141.0.7390.37 at
`/opt/pw-browsers`:

| | 375px | 1440px |
| --- | --- | --- |
| tabs | 5 | 5 |
| `flex-wrap` | `wrap` | `wrap` |
| rows | **2** | 1 |
| bar scrollWidth vs clientWidth | **375 vs 375** | 960 vs 960 |
| bar height | 93.8px | 45px |
| document scrollWidth vs clientWidth | **375 vs 375** | 1440 vs 1440 |
| last tab right edge | 327.3 | 689.1 |

Every tab against the 44px floor at both widths, identical: Class 62.5x44.0, People
69.2x44.0, Grades 69.2x44.0, **Duplicates 96.1x44.0**, Check-ins 100.9x44.0. **0 of 5
under 44px**, 0 under the 24px floor. These reproduce 0081's own figures for the fixture
exactly, which is the check worth having: the real tab lays out where the fixture said it
would.

**Hydration was waited on by retrying against our own effect** -- open the class switcher
and require the menu to actually appear -- never on a timer and never on a window marker,
because `waitForApp` returns on DOM stability and SSR markup satisfies that before a
handler is attached. **5 attempts / 1158ms at 375px, 3 attempts / 613ms at 1440px.**

**The harness's own run of the folded spec: 4 route/width runs, 54 measurements, 0
outside threshold**, 12.9s wall clock. Contrast: section tabs **7.63:1**; the GREENLINE
card's three states **4.60:1** (waiting, `--amber`), **5.51:1**, **5.51:1**, on the real
ground `rgb(34, 46, 34)`. Text: "3 AWAITING REVIEW / 2 tracks / 1 decal", "NOTHING
AWAITING REVIEW" with "0 AWAITING REVIEW" forbidden, "REVIEW QUEUE" with "AWAITING
REVIEW" forbidden, and the superseded 0057 publish-then-moderate copy absent. On
`?manage=0` the switcher is present as the control that says the shell mounted at all,
against the tab bar, every tab, the departure and the duplicates tab all at exactly 0.

### The three controls

Each run against the single relevant test file, restored from a `cp` copy and
md5-verified. **`git checkout --` was not used on any file at any point.**

| control | mutation | result |
| --- | --- | --- |
| 1 | the `duplicates` entry removed from `sectionTabs()` | **6 failed / 10 passed**, and the tripwire named the orphan verbatim: *"the duplicates page has landed: add its tab, per the patch in nav.ts"*. The second biconditional bit too -- *"the tab is withheld, so nav.ts must carry the patch that lands it"* -- which is the assertion doing exactly the job it was generalized for. |
| 2 | `visibleSectionTabs` opened to `filter(() => true)` | **2 failed / 14 passed**: a non-manager went from **1 tab** (`class`) to **5**, duplicates among them. So the absence is the predicate and not the fixture. |
| 3 | the page's own `if (manages !== true) error(404, ...)` opened to `if (false)` | **1 failed / 1 passed**: *"promise resolved instead of rejecting"* -- the page handed a non-manager the section. So the shipped refusal is the page's, not the tab's. |

`nav.ts` md5 `57a579a2d104c2b9a44a1dfa1068ae52` before and after controls 1 and 2;
`duplicates/+page.server.ts` md5 `39e8246c2171b725cc9fe8219773ea03` before and after
control 3. All three files restored and re-verified green.

**Control 3 became a permanent test**, `tests/classroom-nav-duplicates-gate.test.ts`. The
guarantee it holds regresses SILENTLY: a later bundle could read `visibleSectionTabs` as
the access decision and relax the page on the grounds that a student is never offered the
link, and every surface would still render correctly with the only symptom a typed URL
answering. It drives the REAL `load` from its own file with the manage answer under the
test's control, and carries a positive control so the refusal cannot pass vacuously.

**Full suite: 6267 tests over 310 files, run at 03:55 America/Los_Angeles on
2026-09-06.** See the note below on the two failures and what cleared them.

## What was NOT verified

* **Nothing was run against the live Supabase project, and no migration was applied.**
  `0187` was already applied before this bundle; this one carries no SQL at all. Every
  claim about `classroom_duplicate_drafts` is from reading `0187` and from a stub client
  in control 3, never from a live call.
* **No signed-in surface was driven.** The real `/classroom/<id>/duplicates` needs a
  Bosco Tech Google session. The tab bar was measured through `/dev/classroom-nav`, which
  mounts the shipping `ClassroomShell` fed by the shipping `sectionTabs()`; that is not
  the same as the real page and is not reported as if it were.
* **The GREENLINE card was still never seen on `/dashboard` itself**, only in the
  harness -- unchanged from 0081, since this bundle only merged it.
* **Web fonts do not load** in the harness (every non-loopback request is blocked;
  `fonts.googleapis.com` was refused on every run), so all text was measured in the
  fallback stack. **`prefers-reduced-motion` is `no-preference`**, so that path was not
  exercised; nothing here animates.

## What could not be reached

**`ItemDetail.svelte`'s duplicate-date refusal is STILL unowned and still unfixed**, and
0081's patch for it stands unchanged and unapplied. It reads "This item already has a
check-in on that date. Pick a different date, or edit the existing one instead -- ..." and
does not say where. The destination is the **Check-ins tab**, not the Duplicates tab:
`classroom_duplicate_drafts` groups duplicate DRAFT ITEMS, which is a different object
from a duplicate check-in on one item, so the tab this bundle landed is not the answer to
that sentence and must not be named in it.

## Deliberately not done

* **`main` was not merged into.** The branch is pushed and stands.
* **`src/routes/classroom/[sectionId]/duplicates/**` was not modified.** It was mutated
  once for control 3 and restored md5-identically; the shipped bytes are 0074's.
* **`src/routes/classroom/+layout.svelte` needed no edit at all.** It already derives its
  tabs from `sectionTabs(loc.sectionId)`, so the real page got the tab from the six edits
  and nothing else. It is in this lane's ownership and is untouched.
* **`src/routes/dev/classroom-split/[sectionId]/+layout.svelte` needed no edit either**,
  for the same reason -- it reads the real `sectionTabs()`. Only `/dev/classroom`'s
  `SHELL_PATHS` gained a line, `/classroom/s-1/duplicates`, so that harness can drive the
  path the new tab activates on.
* **`src/routes/dashboard/+page.server.ts` moved, and it is not in this lane's stated
  ownership.** The prompt gave this lane `+page.svelte`, the card MOUNT only. The 16-line
  server change is 0081's, is the `loadGreenlinePending` call that feeds the mount, and
  arrived as part of merging that branch rather than as an edit made here -- the mount
  cannot render without it. Flagged rather than hidden.
