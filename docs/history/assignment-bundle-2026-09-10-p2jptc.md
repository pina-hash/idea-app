---
title: "IDEA-Blade rulebook v3.0 and IDEA100 Blade 01: team entry, a lighter blade, and two defects on the submission path (`main`, no migration)"
date: 2026-09-09
branches: [main]
migrations: []
subsystems: ["Legacy assignments", "IDEA-Blade"]
---

Prompt 0103, plus a mid-session supplement from Mr. Pina after he read the edited
rulebook. No migration, no schema, no new dependency. Two legacy HTML files, committed
straight to `main` because that is where the prompt put this bundle and because `main`
and `origin/integration` were level in both directions when it started
(`git merge-base --is-ancestor` each way, `rev-list --left-right --count` 0/0).

IDEA100 Rotation 1 opened this assignment the morning this was written. The rotation
runs its Blade tournament on 2026-09-22 and ends 2026-09-23, after which those students
leave the pathway, so nothing here could be deferred to a later unit.

## THINGS A PERSON HAS TO ACT ON

**The fabrication requirement now lives in one rubric row and nothing at inspection
enforces it.** The `3+ processes` and `3+ fasteners` spec cards were the only thing in
the rulebook that forced a team to actually fabricate parts rather than assemble a
printed shell. Both are withdrawn as inspected specifications and are now a two-sentence
"Design Guidance, Not Inspected" block, and `Fastener Presence` is gone from the Section
05 inspection checklist. What is left of the requirement is one criterion in Assignment
01 module 05, worth 2 points, graded by a person reading a table. **A blade held together
with adhesive alone now passes inspection.** That was the intent of the change, and it is
recorded here by name because it reads exactly like an oversight to whoever finds it
next.

**Three display titles still say "v2.2" and none of them lists the new assignment.**
`src/lib/curriculum.ts:306` ("IDEA-Blade - Official Rulebook v2.2"),
`src/lib/fsp/archive.ts:81` and `src/lib/legacy/index.ts:108` ("Blade Rulebook v2.2").
The rulebook is v3.0 now, so all three are stale. None of the three is owned by this
bundle (prompt 0027 owns `curriculum.ts`), and all three were left deliberately. The
FILENAME stays `IDEA-Blade_Rulebook_v2_2.html` and must not be renamed: the route derives
its slug from it, and QR codes and handouts in circulation name that slug.

**`legacy/index.ts`'s `COURSE_LAYOUT` does not list `idea100-blade-01`.** The ROUTE needs
no registration and works today (verified below), but the assignments index page will not
show a link to it. Mr. Pina reaches it by URL and by a Classroom post. Adding it means a
new `IDEA-100` course group in a file this bundle does not own.

**The `mrpina-dev/IDEA` GitHub Pages portal still serves its own copy of this rulebook,
and that copy has none of this.** No team entry, no Blade Handler, still 2 lbs, still
3+ processes and 3+ fasteners. This bundle cannot reach that repository. A student
following an old link, a printed QR code, or a bookmark reads a rulebook that contradicts
the one at `ideabosco.com` on the weight limit their blade is inspected against. That is
the most damaging of the three staleness items and it is not fixable from here.

## What changed

**The rulebook.** Hero, footer and the top version-log badge read v3.0 / 2026-27. A Team
Entry card opens Section 02 ahead of the win box: one blade per team, two or three
students each owning a named role, one Blade Handler declared per match at the match call
and the only member at the launch zone, declared modular swaps re-weighed under F-06, and
the team eliminated rather than a student. The load-bearing sentence is the callout at
the foot of that card, which is what carries team entry through Sections 04, 05 and 06
without touching them: everywhere the rulebook says "competitor", under team entry it
means the declared Blade Handler. Section 03's double-elimination card notes the IDEA100
Rotation 1 format. Max weight went from 2 lbs (907g) to 1.5 lbs (680g) in five places,
including the weight budget widget's own constant.

**The assignment.** `idea100-blade-01.html`, copied from `idea113-blade-01.html`, which
is the standard and which the prompt directed everything be derived from rather than from
any standards document. Six modules keep their points and each is marked TEAM or
INDIVIDUAL: 01 Blade Identity and 02 Design Rationale TEAM, 03 Angular Momentum Analysis
and 04 Technical Sketches INDIVIDUAL, 05 Manufacturing Plan and Role Charter TEAM, 06
Contact Compliance INDIVIDUAL. 25 team, 25 individual, 50 total, stated in the weight bar
and split out in the instructor scoring table. Module 05 gains an Owner column between
Component and Why, and its rubric is three flat rows worth 2, 1 and 2.

## The load-bearing decisions

**The version log badge was not changed, and the prompt asked for it.** B1a named three
lines to move to v3.0, one of which is the badge on the existing v1 changelog entry, and
in the same breath asked for a new v3.0 entry ABOVE it whose own text says "this file has
carried the name v2_2 while its own version log read v1". Doing both literally would put
two v3.0 badges in the log and relabel the initial release as v3.0, destroying the record
the new entry points at. The new entry carries the v3.0 badge and the historical one keeps
v1, so the document's current version reads v3.0 in the hero, the footer and at the top of
the log, which is what the instruction wanted in substance.

**The rulebook link was a real change, and the prompt's reason for it was slightly
wrong in a way that made it worse, not better.** A5 said `rewriteLegacyLinks` does not
touch absolute `https://` links. It does: its regex `/\/IDEA\/([A-Za-z0-9._-]+)\.html/g`
is not anchored, so it matched inside
`https://mrpina-dev.github.io/IDEA/IDEA-Blade_Rulebook_v2_2.html` and rewrote it to
`https://mrpina-dev.github.io/assignments/IDEA-Blade_Rulebook_v2_2`, which is an external
404. Students were not reading a stale rulebook, they were reading nothing. The href is
now `/assignments/IDEA-Blade_Rulebook_v2_2`, verified by clicking it through the real
route and landing on the Team Entry block.

**The submission is the HTML with its data embedded, and the guard moved with the
action.** The source file's completeness preflight ran only on print, so as it stood a
student could click Download with Data on an empty document and be told nothing. Both
paths now run the same `runPreflight()`; only the title, the subtitle and the proceed
control's label differ, and `preflightAction` is what the proceed control replays. One
predicate, two wordings, rather than a second copy of "is this ready".

**Two defects in the source were fixed rather than copied, and both were found by
driving the real export rather than by reading it.**

`downloadHTML` cloned the LIVE document. The sketch previews and any manufacturing row
past the fifth are built by script from the saved data on every open, so cloning them
wrote them into the file as markup and `loadData` then built them AGAIN. Measured: one
sketch came back as two preview items, the first with a blank caption, because an
`<input>`'s live value is not serialized into `outerHTML`; six manufacturing rows came
back as seven, with two elements sharing `data-field="mfg-06-p"`. The clone now empties
`#sketch-preview` and drops any row outside 01-05, and the embedded data restores both.
The export is a blank template plus its data, never a template plus its data plus a
picture of its data. This defect is still live in `idea113-blade-01.html` and, by
inspection of the shared shape, very likely in `-02` through `-05`; this bundle owns none
of them.

Boot wrote `window.__IB_DATA__` into `localStorage` unconditionally. Under TEAM modules
these files get passed between teammates, so opening one destroyed the opener's own saved
work with no prompt and no undo. It now writes only when the key is empty; otherwise it
loads the data for reading, sets `openedAsCopy`, and shows a visible line. **The half that
had to come with it is that `saveToStorage` returns early in copy mode.** Without that the
30-second auto-save and every input handler would have overwritten the saved work three
seconds later anyway, and the notice on screen would have been a reassurance rather than a
fact. `confirmClear` leaves copy mode, because once the key is empty there is nobody
else's work to protect.

**The Owner column made module 05's table too wide for a phone, and that was caused
here.** Measured at 375px: four columns overflowed the module body by 7px, five overflowed
it by 64px, with the ancestor's `overflow-x` visible, so "Why This Process?" was clipped
and unreachable. The table now scrolls in its own `overflow-x: auto` container with a
460px minimum, per the repo's own rule for wide content, and `@media print` returns it to
`overflow: visible` so it still prints whole. That column goes from 79px to 159px at
375px; nothing scrolls at 1440px.

**The academic integrity declaration was corrected, which was not asked for.** It read
"Any collaboration is disclosed in the header above", pointing at the collaboration block
B2b deletes, and "submitting another student's work as my own ... constitutes academic
dishonesty" which, under TEAM modules where every member submits the same content, told
students that the behaviour the assignment requires is cheating. It now distinguishes
TEAM from INDIVIDUAL. Leaving it would have shipped a contradiction to a student on the
morning they signed it.

**The counting note went with the count.** Module 05's prompt carried "Note: two
variations of the same process count as one", which existed only to support the
three-process minimum. With the minimum withdrawn it is a rule about a number nobody is
counting, so it was removed with it. That is one step past the letter of the supplement,
which said only to remove the number.

## Measured

- Rulebook base64 payload byte-identical: 517,169 bytes, md5
  `dfb87c477eb6ca755080566cdf4ebebe`, before and after. It moved from line 446 to line
  440 because two spec cards were deleted above it, and it appears in the whole-file diff
  only as an unchanged context line. Every edit was located by surrounding markup. The
  payload contains `v1` 151 times, `907` **eight** times (the supplement said seven) and
  `680` once, so any token replace of any of those would have corrupted the figure
  silently.
- `svelte-check`: **0 errors, 37 warnings**, the documented baseline, with the two
  `PUBLIC_SUPABASE_*` placeholders exported before `svelte-kit sync`.
- Full suite `npm test`: **327 files, 6525 tests, all passed**, exit 0.
- Export round trip, driven in a real Chromium against the file loaded over `file://`:
  **22 of 22 checks**, zero page errors. All seven values return (one text field per
  module, the image caption for module 04, and the image itself), no duplicated preview
  items, no duplicated `data-field` names, the table back at its five static rows, and
  the filename `IDEA100_BLADE_A01_Student.html`. A negative control on a blank document
  confirms the reads are not passing vacuously.
- Copy-mode proof, same harness: with work already saved under the key, opening the
  export shows the notice, loads the export's content into the page, leaves the stored
  value **byte-identical**, and leaves it byte-identical again after typing into a field,
  with the toolbar reading "Auto-save OFF (opened as a copy)".
- Weight widget over-cap branch: 700 g gives `700g / 680g` and `⚠ OVER BY 20g`, class
  `over`, bar 100%, remainder amber. Control at 600 g reads `80g remaining`, class `warn`,
  not over. Zero JS errors.
- Spec grid after `auto-fill` to `auto-fit`: four cards at 1440px are 226px each filling
  the full 932px grid with 0px dead space at the right edge; one column at 375px.
  Inspection checklist is 7 items.
- Both pages through the REAL route at 375px and 1440px: HTTP 200, no horizontal scroll
  at either width, zero JS errors, and clicking the rulebook link from the assignment
  lands on `/assignments/IDEA-Blade_Rulebook_v2_2` with the Team Entry block and the v3.0
  hero present.
- Copy sweep on the new file: zero hits for Google Classroom, solo, Individual grades,
  Upload the PDF, mrpina-dev.github.io, every weekday name, the em dash, and colour /
  behaviour / analyse / modelled / centre / grey / licence / defence. Zero em dashes were
  added to the rulebook either.

## NOT verified

- **Neither page has been opened on the production deployment.** Everything above is a
  local dev server and a local Chromium.
- **Nothing was checked on a real phone.** The 375px numbers are a desktop Chromium at a
  375px viewport, which is not a touch device, not iOS Safari, and not a camera.
- **The print output was never rendered.** The print stylesheet was edited (the table's
  scroll container is returned to `overflow: visible`) and reasoned about, not printed.
  The instructor scoring table, the print mirrors and the pagination are unverified.
- **No student has round-tripped a real phone photo.** The D1 downscale was verified only
  against a small synthetic PNG, which is under its threshold and therefore takes the
  pass-through branch, so the canvas re-encode path itself is exercised by construction
  review and not by measurement. If it misbehaves, the symptom is a sketch that fails to
  decode, and the uploader's fallback returns the original data URL.
- **The type scale was not brought to a 9pt floor.** The file inherits 9px to 11px chrome
  type from `idea113-blade-01.html`, which the prompt named as the standard to derive
  from. Nothing added here is smaller than what surrounds it and nothing was compressed to
  save a page, but the inherited sizes are below a literal 9pt and fixing them is a
  restyle of the standard, not of this file.
- **The other four `idea113-blade-*` files were not touched**, so the export duplication
  defect above is still live in them.

## The prompt claim that was false

C7 called `/assignments/<slug>` "the gated route" and said it needs a Google session this
container does not have. It is **public**: `src/routes/assignments/[slug]/+server.ts`
reads no session and `authedPrefixes` in `hooks.server.ts` does not contain
`/assignments`, which is also what the access model in `CLAUDE.md` says. So both pages
were verified through the real route on a local dev server, which is strictly better than
the `file://` check the prompt asked for, and the `file://` harness was kept for the
export round trip because that is where a downloaded file actually lives.
