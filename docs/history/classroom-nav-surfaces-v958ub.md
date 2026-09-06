---
title: "Three surfaces were built and reachable only by typing the URL; two of them now have doors, and the third has a page that is not on this base (`claude/classroom-nav-surfaces-v958ub`, no migration)"
date: 2026-09-06
branches: [claude/classroom-nav-surfaces-v958ub]
migrations: []
subsystems: ["IDEA Classroom", "Notebook", "GREENLINE", "Testing"]
---

Prompt 0081. No migration, no database, no new dependency, and no surface being linked
TO was touched. What changed is the chrome around three finished features: one new tab,
one rewritten dashboard card, one stylesheet rule that decides what a phone does when
the bar is one tab too wide, and a refusal to add the third door because the room it
would open onto is not on this base.

Started from `eec8151`, which is `origin/main`, and which strictly contains
`origin/integration` (4 commits ahead, 0 behind). The prompt asked to start from
`origin/integration` and merge `origin/main` in early; the harness had already branched
from main, so there was nothing to merge and no merge could stall on a missing committer
identity. `git config user.name` was already `Claude`. Working directory
`/home/user/idea-app`.

## The premise, checked one claim at a time

The prompt carried three claims. Two survived and one did not.

**Claim 1, the duplicate-drafts page: FALSE on this base, and that is the finding.**
`/classroom/[sectionId]/duplicates` does not exist in this tree -- not the page, not the
server load, not the remove endpoint, not a migration behind it. It exists on
`origin/claude/duplicate-drafts-count-wzworl`, an unmerged branch whose migration is
`0187_classroom_duplicate_drafts.sql`. `origin/main`'s highest migration is `0185`;
`origin/integration`'s is `0184`. So prompt 0074's lane has not landed, its migration is
unapplied, and a duplicates tab shipped here would be a 404 offered to every manager of
every section -- strictly worse than the typed URL it was meant to replace. It is not
built. What is built instead is everything that makes it a small change later: the exact
patch, written down in `nav.ts` beside the function it edits; a harness state that
measures the bar at the tab count that tab will bring; and a test that asserts the tab
and the page land together in either direction, so whichever half arrives first is a red
test rather than a silent 404 or a silent orphan.

**Claim 2, the GREENLINE card: TRUE in all three parts.** The card was three lines of
markup inside `/dashboard/+page.svelte` reading "Published GREENLINE community tracks:
reports, star ratings, completion telemetry, featuring (ranked eligibility + IC payout),
and removal." Every noun in that sentence is about a track that is already live, which
is 0057's publish-then-moderate model; 0059 inverted it, so the one entry point to the
queue described the flow that had been replaced. It carried no count, so it looked
identical over an empty queue and over six students' work. And `loadGreenlinePending`
was already written, already the one reader of both queues, and already backing
GREENLINE's own title screen -- so the card was the only surface in the subsystem still
saying nothing.

**Claim 3, the check-in path: TRUE, but narrower than stated.** Prompt 0031 reported the
classroom has "no path to any of it". It has two, and both are inside `PeoplePanel`'s
Notebook-compliance card ("Add one in the review console", "Open the review console"),
which renders only when that panel's `loadNotebookGrid` transport is handed in. So the
path exists, is three levels deep, is on one tab, and is conditional on a transport. The
class page has none, and `ItemDetail`'s duplicate-date refusal still says "edit the
existing one" without saying where.

## What was built

### The Check-ins tab, and what `external` is for

`sectionTabs()` gains a fourth entry pointing at
`/notebook/review?section=<encoded id>`, `manageOnly`, `external: true`.

**`?section=` is what makes it a tab rather than a link to a hub, and the review console
already reads it.** `src/routes/notebook/review/+page.server.ts` takes that parameter and
validates it against the caller's own accessible section list rather than passing it
through, so a manager lands on this class's grid and anybody else lands on their default
-- courtesy on top of a boundary, since `notebook_get_section_grid` refuses a section the
caller neither teaches nor administers whatever the URL says. Nothing on that page needed
changing; the deep link was already there and nothing used it from the classroom.

**The tab is not the gate, and the populations really do line up.** `canManage` is
teacher of record or admin (`classroom_manages_section`); `notebookAccess.canReview` is
instructor (teacher of record of any section) or chair (admin) or a 0169 section
reviewer. A manager of a section is inside the review console's population by
construction, and the section they manage is in the list `?section=` is validated
against -- so the tab is offered exactly where it resolves, and withholding it from a
student decides nothing that `/notebook/review`'s own 404 does not already decide.

**`external` exists because `activeTab` cannot ever name that tab, and a tab that
silently never highlights reads as a broken tab.** `activeTab` takes a
`ClassroomLocation`, and `locateClassroom` only ever describes a `/classroom` path;
`/notebook/review` is `other`, forever. So a `case 'check-ins'` in `activeTab` would be
dead code that reads as coverage. The flag says the tab is a door rather than a view: the
shell withholds `.active` and `aria-current` from it structurally (`!t.external && ...`
rather than a condition that could be met) and prints a guillemet, which is
`aria-hidden` because the accessible name is already the label.

**The visibility filter moved out of the shell into `visibleSectionTabs`.** It was
`tabs.filter((t) => !t.manageOnly || canManage)` written inline; it is now one exported
function the shell calls, for the ordinary no-second-implementation reason and because
that is what let the mutation control open the real predicate rather than a copy of it.

### The bar wraps, and the negative control is the whole argument

`.sec-tabs` was `display: flex` with no `flex-wrap` and `overflow-x: visible`. Measured
on the warm dev server at 375px BEFORE the change: three tabs from 16px to 226.4px, so it
fit with 132.6px to spare and nothing anywhere said what a fourth would do. Every label
is one unbreakable word, so a flex item's automatic minimum is its whole width: a bar one
tab too wide does not scroll and does not clip, it pushes the DOCUMENT past the viewport.

Measured AFTER, at 375px:

* four tabs (as shipped): one row, ending at 332.1 of 375, document 375px, no overflow.
* five tabs (the duplicates fixture): two rows, bar 93.8px tall, document still 375px.
* five tabs with `flex-wrap` forced back to `nowrap` on the same page: one row, last tab
  ending at 401.3, **document 401px against a 375px viewport -- 26px of horizontal
  overflow.**

That last number is the whole reason the rule is there. It is the Coin Ledger defect
prompt 0025 spent a bundle undoing: a tab off the right edge of a phone under
`body { overflow-x: hidden }`, unreachable by scrolling, by swiping, or at all. Wrapping
cannot produce it at any tab count, which is why the next tab added to this bar needs no
second look at the stylesheet.

At 1440px there is room either way (five tabs end at 689.1 of a 960px bar), so the
harness asserts the EQUIVALENCE -- forcing `nowrap` overflows exactly when the bar is too
wide for its own content box, worked out from the tabs' own widths rather than from a
pinned pixel figure -- because a row count that differs between the two widths cannot be
one `expected`, and a fixture claiming 26px of overflow at 1440 would be asserting a
number the layout does not produce.

### The GREENLINE card

`src/lib/greenline/GreenlineDashboardCard.svelte` is the card, extracted from the
dashboard page and fed a finished `GreenlinePending` from `loadGreenlinePending` in the
dashboard's own load. The count, the label and the breakdown all come from that one
module -- `pendingLabel` and `pendingBreakdown` are what the GREENLINE title screen
already reads, so the two surfaces cannot describe one state two ways.

**Three states, not two.** Work waiting ("3 AWAITING REVIEW", plus "2 tracks · 1 decal",
because a bare 3 does not say which page to open); nothing waiting ("NOTHING AWAITING
REVIEW", never "0 AWAITING REVIEW" and never a vanishing badge, since a badge that
disappears at zero is indistinguishable from one that broke); and a count that could not
be read ("REVIEW QUEUE"), which is a pre-0051/0059 deployment or a failed select and is
NOT zero.

**The load is safe to call unconditionally there and only there.** `loadGreenlinePending`
is documented as gated on `isAdmin` at each call site, and `/dashboard`'s load has
already redirected every non-admin two dozen lines above -- so the gate is the redirect,
stated in a comment beside the call rather than duplicated as a second `isAdmin`.

**Colour is never the only signal, and `--green` was refused.** The waiting state takes
`--amber`, the warning token: `--green` in this register means active navigation, focus,
success and completion, and an unattended queue is none of those. The line carries a
glyph and the words either way. Measured contrast on the real ground the card sits on
(`rgb(34, 46, 34)`): waiting **4.60:1**, the other two **5.51:1** -- `--text-2` rather
than `--dim`, which clears only the darkest of the three portal grounds and measures
4.46:1 on this one.

## What was verified

`svelte-check`: **0 errors, 37 warnings**, breakdown 31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`. Re-derived with
`PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` exported before `svelte-kit sync`, per
the no-`.env` phantom-errors rule; the placeholder `.env` written for the browser pass
is gitignored and was the only thing written outside the repo's tracked files.

`npm test`: **5935 passed, 7 failed** across 291 files, run at **01:50 America/Los_Angeles
on 2026-09-06**. Five of the failures are `tests/derived-numbers.test.ts` and were mine
-- three new route specs against a not-yet-regenerated counts region, which is exactly
what that test exists to say; they clear once the README regions are rewritten. The other
two are `tests/gauntlet-doc.test.ts`, which wants `0184_gauntlet_run_event_bounds.sql`
named in `docs/GAUNTLET.md`. That file is on `origin/main`, this diff touches nothing
under `supabase/migrations/`, `docs/GAUNTLET*.md` or anything GAUNTLET at all, and the
failure reproduces on the base. **Not mine**, and the prompt's note that 0067 fixed them
on a branch matches what the tree shows.

The three mutation controls, each run against the single test file, restored from a `cp`
copy and md5-verified (never `git checkout --`), then re-verified green:

| control | mutation | result |
| --- | --- | --- |
| 1 | `visibleSectionTabs` opened to `filter(() => true)` | **2 failed / 13 passed** -- "a student sees exactly one tab" and "one surviving tab renders no bar" |
| 2 | `loadGreenlinePending` forced to return `EMPTY` | **2 failed / 13 passed** -- the 3-awaiting render and the zero-is-a-sentence control |
| 3 | the People tab removed from `sectionTabs` | **3 failed / 12 passed** -- the manager positive control, the shipped-set assertion, and the on-disk route check, all naming it |

`nav.ts` md5 `5a175a2d40fc160422806392e229260f` and `moderation.ts` md5
`ad5cc125e022347b3a064143a1dcd1b0` before and after each; **15 passed** on the restored
tree.

Browser pass, `npm run verify:browser -- --route classroom-nav`, chromium 141.0.7390.37
at `/opt/pw-browsers`: **6 route/width runs, 62 measurements, 0 outside threshold.** Tap
targets: every tab 44px minimum dimension at both widths (0/4 and 0/5 under the floor),
the card's Open panel 130.1x45.4. Contrast as above plus the tabs themselves at 7.63:1.
Presence in both directions on the same page -- 4 tabs present and visible, Grades
present as the positive control, the duplicates tab at exactly 0, and on `?manage=0` the
switcher present (the control that says the shell mounted at all) against a tab bar and
every tab at exactly 0.

Hydration was waited on by retrying an effect of our own -- opening and closing the
section switcher until the menu actually appeared -- rather than on a timer or a window
marker: `waitForApp` returns on DOM stability, which SSR markup satisfies before any
handler is attached. **2 attempts, 13.5-14.1s elapsed** on the ad-hoc measurement runs;
the harness's own runs reported the page rendered in 455-994ms.

`node tools/browser-verify/routes/_tools/verify-loader-guards.mjs`: all guards fired,
`pathways.mjs` restored byte-identically at 6022 bytes.

## What was NOT verified

* **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project; no RPC ran, no migration was applied, and every claim about
  `loadGreenlinePending`'s counts is against a stub client answering the two head-counts
  PostgREST would.
* **No signed-in surface was driven.** `/classroom/<id>/people`, `/dashboard` and
  `/notebook/review` all need a real Bosco Tech Google session. The tab bar and the card
  were measured through `/dev/classroom-nav`, which mounts the shipping components with
  the shipping functions and no router; that is not the same as the real page and is not
  reported as if it were.
* **`prefers-reduced-motion` is `no-preference`** in the harness, so that path was not
  exercised (nothing here animates).
* **Web fonts do not load** -- the harness blocks every non-loopback request, so all text
  was measured in the fallback stack. Both facts are in every run's own output.
* **The GREENLINE card was never seen on `/dashboard` itself**, only in the harness. The
  wiring is asserted from source rather than from a render.

## What could not be reached, and the patches it needs

**`ItemDetail.svelte` is not in this lane's ownership.** Its duplicate-date refusal
reads "This item already has a check-in on that date. Pick a different date, or edit the
existing one instead -- ..." and still does not say where. With the tab in place the
answer is one sentence away. The patch, in `attachCheckIn`:

```
-				'This item already has a check-in on that date. Pick a different date, or edit the ' +
-				'existing one instead -- a duplicate would put a second column on every affected ' +
-				"class's grid and ask students for the same page twice.";
+				'This item already has a check-in on that date. Pick a different date, or edit the ' +
+				'existing one in the Check-ins tab above -- a duplicate would put a second column on ' +
+				"every affected class's grid and ask students for the same page twice.";
```

**The duplicates tab, when `claude/duplicate-drafts-count-wzworl` lands.** Prompt 0074's
history entry called it four lines. It is six edits, all in `nav.ts`:

1. `SectionTabId` gains `'duplicates'`.
2. `sectionTabs()` gains
   `{ id: 'duplicates', label: 'Duplicates', href: \`${basePath}/${sectionId}/duplicates\`, manageOnly: true }`,
   between Grades and Check-ins (an in-classroom view sits above a departure).
3. `ClassroomPlace` gains `'duplicates'`.
4. `locateClassroom` gains
   `if (rest[1] === 'duplicates') return { place: 'duplicates', sectionId, itemId: null };`
5. `activeTab` gains `if (loc.place === 'duplicates') return 'duplicates';`
6. `classroomCrumbs` gains
   `case 'duplicates': return [home, section(false), { label: 'Duplicates' }];`

`classroomMeasure` needs nothing: an unlisted place already falls through to `page`,
which is what a report table wants. `tests/classroom-measure.test.ts`'s `SURFACES` is an
explicit list rather than an exhaustive switch, so it does not redden;
`tests/classroom-nav-doors.test.ts`'s last block DOES, in both directions, until the tab
and the page agree.

## Deliberately not done

* **No duplicates tab.** See above. The refusal is the point.
* **`/dev/classroom`'s `SHELL_PATHS` is unchanged.** The prompt gave this lane that tab
  list, but Check-ins is not a `/classroom` path, so there is no shell path to add for
  it; the tab appears in that harness already, because it reads the real `sectionTabs()`.
* **`PeoplePanel`'s two review-console links are left exactly where they are.** They are
  in the right place for what they say ("no check-ins are scheduled: add one"), and
  removing them because a tab now exists would cost the empty-state its call to action.
* **The `divider-label` above the dashboard card still reads "GREENLINE Decal Reviews".**
  The decal queue really is in that block; renaming the divider is a change to a section
  this lane does not own and would have been churn inside an unrelated diff.
* **One line of `classroom-updates.json` outside this entry moved.** Re-serializing the
  file normalized a pre-existing over-indented `"tags": [` on the 2026-09-05 "Turning
  work in now really does lock its files" entry. Noted rather than hidden; nothing about
  its content changed.
