---
title: "The launcher and portal surfaces: a spec that undercounted, the section order when there is nothing to order, and two admin cards that stay two (`claude/launcher-portal-surfaces-prgx6d`, no migration)"
date: 2026-09-03
branches: [claude/launcher-portal-surfaces-prgx6d]
migrations: []
subsystems: ["Testing", "Components and UI", "Visual theme", "Access model", "Working conventions"]
---

Four items on one surface, plus the verification gap prompt 0021 found while
landing the maps card. The gap is the part worth reading.

## The spec that stayed green while covering eleven of twelve

`/dev/marks` carried a hand-written array of eleven marks and
`tools/browser-verify/routes/marks.mjs` pinned `expectPresent: 12,
maxPresent: 12` and `22` beside a hand-written list of eleven ids.
`$lib/marks` held TWELVE components. `MapsMark.svelte` arrived in `ca5d950`,
which touched neither file, so the twelfth glyph was mounted by nothing and
swept by nothing.

The spec did not merely miss it, it REPORTED SUCCESS. The page went on
rendering eleven component cells plus the FRC cell, which is exactly the
twelve the ceiling allowed, so every row came back green over a page that was
one mark short. Nothing on screen says a glyph is absent: there is no wrong
colour to notice, only a card that is not there.

The old comment argued the ceiling PINNED the roster, and that "a mark added
on purpose is one line here and one line in `GATED`, which is the pair that
has to move together anyway". Both halves were wrong in the same way. A
ceiling pins how many cells the PAGE renders, which says nothing about how
many marks EXIST; and the pair did not move together, because a pair
maintained by memory is a pair that does not.

So the number was not bumped. Bumping eleven to twelve restores coverage today
and rebuilds the identical hole for the thirteenth, which is the shape
`IDEA_VERIFICATION_ADDENDA` rule 33 names: an assertion that cannot fail is
not an assertion.

**The roster is read from disk on both sides.** The page globs
`../../../lib/marks/*Mark.svelte` (relative, not `$lib`, so it cannot depend
on an alias staying configured) and mounts whatever comes back; the spec reads
the same directory through `readdirSync` and derives every count from its
length. `src/routes/dev/marks/mark-roster.js` is the one implementation of a
mark's id, plain `.js` with JSDoc because Node's ESM loader has to read the
same file Vite does, and it REFUSES an empty roster rather than returning one
(rule 29: a control that can silently go to zero is not a control).

**What makes a drift loud now, which is the property the old shape lacked
entirely.** Every mark becomes a `motion` row selecting `[data-mark="<id>"]`,
and `motionSweep` marks a `gated` row within threshold only when
`animated > 0`. A selector matching nothing sweeps zero elements, finds zero
animated, and REDDENS. The failure a forgotten mark actually causes is now the
failure this spec detects, where before it was the one case it could not.

One id moved as a consequence and it is deliberate: `CoinMark.svelte` yields
`coin` where the hand-written list said `coins`. The launcher keys its snippet
on `PortalApp.icon`, a registry field a card chooses; this harness is about
the files in `$lib/marks`, and naming a cell after anything but its own file
is how a roster derived from disk starts needing a translation table again.
`data-mark` appears in the page and its spec and nowhere else in the tree.

### The control, and what the gap was hiding

A throwaway `ScratchControlMark.svelte` was added to `$lib/marks` and the
harness re-run with BOTH files byte-identical (md5 checked before and after).
Coverage moved from 12 gated marks to 13 with nothing edited: the page mounted
14 cells and 26 svgs, and the spec produced a `motion [scratch-control mark]`
row that measured it. The file was then deleted and both files verified
md5-identical against the pre-control checksums, with `git status` clean on
`src/lib/marks`. Restoration was from the recorded checksums and by deleting
the added file, never `git checkout --`.

**Exactly one mark was going unmeasured: `maps`.** Measured now, it is CLEAN --
15 elements swept, 6 animated under no-preference, 0 not settled under reduce,
lowest resting opacity 1, at both widths. So the gap was not hiding a defect
this time. That is worth stating plainly rather than leaving implied: the cost
of the gap was that nobody could have known either way, and a green report
over eleven of twelve marks is what made the question unaskable.

## The section order: the report was right about the pain and wrong about the remedy

The report was that students want apps above their classes. The home page
already ordered the two blocks conditionally -- `managesAnySection` put Apps
first for a manager and Classes first for everyone else -- so this was an
ordering question rather than a layout one, and CLAUDE.md carries the rule
with its reason: the feed is the one thing on the page that deep-links a
student into the exact item that is due, so it keeps the top.

Measured at 375px on `/dev/home-order`, which mounts the real
`src/routes/+page.svelte`, as the first app card's distance from the top of
the document:

| viewer | first app card | screens |
| --- | --- | --- |
| student, 1 class | 1409px | 1.76 |
| student, 2 classes | 2027px | 2.53 |
| student, 3 classes | 2642px | 3.30 |
| student, 4 classes | 3258px | 4.07 |
| teacher (any) | 629px | 0.79 |
| **any viewer, 0 classes** | **900px** | **1.13** |

The measurement refuses the reported remedy and finds a real defect beside it.
It refuses the remedy because a student's block grows 616px per class: the
cost is proportional to how many classes they have, so flipping the order does
not remove that scroll, it moves it onto the deep links, which is the content
the page exists to surface. Bounding a class card's height is the fix for that
half and it belongs to `ClassroomFeed`, which this bundle does not own.

What it finds is the last row. A viewer with NO feed got the student order, so
`ClassroomFeed`'s own empty state ("You are not in any classes yet") sat above
the launcher as a 230px card with **zero due-soon rows** -- nothing in it to
open, costing a full screen of scroll to say there is nothing here. That is
every student between enrolment and the roster import, every viewer whose
classroom read failed, a teacher between terms, and every signed-out visitor
on a public-first landing page.

So the rule keeps its stated reason and stops applying where the reason does
not: **Your Classes holds the top exactly while it has a class in it.** The
first app card moves from 900px to 629px (1.13 to 0.79 screens) at 375px, and
a student who has classes is untouched -- re-measured at 1411px for one class,
against 1409px before, which is rendering jitter on the same layout.

The predicate is `managesAnySection || !hasClasses`, and `hasClasses` is
`classroomFeeds.length > 0` rather than a session check. That distinction is
load-bearing: `buildFeed` is `sections.map(...)` with no filtering, so an
enrolled student always has at least one feed entry and can never take this
branch, while a signed-IN student on nobody's roster -- the commoner case, and
the one a "signed out?" check gets wrong -- can.

## Two admin cards stay two cards

Reported as two doors to one room, and they are not. `/dashboard` is a REVIEW
console: its own section labels are Profile, FRC Model Reviews, GREENLINE Decal
Reviews, Feedback, Students & Pathways, Content. `/admin` is a CONFIGURATION
one: the admin roster with grant and revoke, IDEA Coin links, short links, and
the Google Drive connection. Nothing on either is on the other, and `/admin`
links ACROSS to `/dashboard` from its own header, which is what two rooms with
a path between them look like rather than one room with two doors.

The `icon` comment explaining the split is still true and stays: the two cards
did draw the same gauge until one was given its own glyph, and in the compact
view, which is the default, the tagline is dropped so the title is all a reader
gets.

What was actually wrong was the sub. It read "Who can administer the portal.
Owner manages the list.", which describes the first of that route's four
sections and none of the rest -- so the card advertised a slice of "Admin
Dashboard" and duly read as a second way into it. It now names the room. A
merge would have been fixing a label with an architecture change.

## The stale paragraph

`AppLauncher.svelte`'s maps accent rule carried "THERE IS NO `maps` ENTRY IN
`PORTAL_APPS` YET AND THIS RULE PAINTS NOTHING UNTIL THERE IS". True the day
0020 wrote it, false from the next commit. 0021 was right not to revise
another bundle's prose while landing the entry; this bundle owns the file and
corrects it. The reason it mattered is the reason the sentence was written: a
comment claiming a rule is unreachable is what stops the next person measuring
it, which is the same failure the marks spec had one layer down.

## What was NOT verified

- **No live Supabase, no signed-in session, no production data.** The local
  `.env` is absent in this container and the harness routes need neither.
- **The course tile is REPORTED, not fixed** -- see below. It is outside this
  bundle's files.
- **Web fonts do not load in the harness** (it blocks every non-loopback
  request), so all text was measured in the fallback stack, and
  `prefers-reduced-motion` is `no-preference` for every check except the
  motion sweep, which sets both states itself.
- **The real `/` was never opened**, only `/dev/home-order`, which mounts the
  same `+page.svelte` with a fixture payload. Production sign-in is Google
  OAuth against a Bosco Tech account, which no automated run here holds.

## Found and deliberately not fixed: the course tile counts a term suffix as a course

The hero's "Active Courses" stat is NOT "being told" a number, which is what
the report assumed -- it is `activeCourseCount()` in `src/lib/curriculum.ts`,
derived at render time from `SECTIONS`. The defect is in what it counts.

It counts distinct `course` codes, and its own docstring says why: "Counting
codes, not sections, is deliberate -- the three IDEA 209H sections are one
course." But three of the seven sections carry the codes `IDEA 100-1`,
`IDEA 100-2` and `IDEA 100-3`, all titled "Intro to IDEA", in terms T1, T2 and
T3. The `-1/-2/-3` suffix is a SECTION label written into the course field, so
the dedupe the docstring describes does not fire on them: they count as three
courses where 209H's three sections correctly count as one.

Measured: `SECTIONS` holds 7 entries and 5 distinct codes; the tile therefore
reads **4** after the concluded FSP is excluded. By the function's own stated
rule the honest answer is **2** -- Intro to IDEA and Engineering I Honors.

It is left alone because `src/lib/curriculum.ts` is not this bundle's file and
neither is the hero region of `src/routes/+page.svelte`; this bundle owns the
launcher region of that file only. The fix is also not obviously a one-liner:
either the three section rows take `IDEA 100` as their course and something
else carries the term, or `activeCourseCount` strips a trailing section
suffix, and the first is a registry change with `profiles.section_id` values
pointing at those ids. It wants its own bundle.
