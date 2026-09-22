---
title: "A student can set their own pathway without the modal, and the panel's problem list was 113px below the fold"
date: 2026-09-22
branches: ["claude/eloquent-thompson-p2gc2s"]
migrations: []
subsystems: ["portal", "verification"]
---

Ledger 0280. Ledger 0276 shipped a seven-day cap on deferring the first-login
pathway sheet -- `PATHWAY_DEFER_MAX_AGE_MS`, on the correct reasoning that a
deferral with no end quietly means this student never gets a pathway. That cap
is right and it set a deadline: every student who presses "Choose later" meets
the sheet again about a week later, and until this bundle there was no other
way in the product for them to set one. A cap with no second route turns a
one-time modal into a recurring one.

`ProfileMenu` already rendered the pathway twice -- a chip beside the avatar, a
chip in the menu's meta row -- and tinted the display name with
`pathwayColor(profile.pathway)`. It read the column on every one of the 69
product pages that mount it and wrote it nowhere.

## The gap was UI, and the prompt's own framing of why was wrong in a useful way

Ledger 0276 reported the cause as "`/dashboard`'s write is admin-only". That is
true of the dashboard's interface and false of the database, which is what made
this bundle cheap. `0038_profile_pathway.sql` says so in its own header, in
advance:

> NO new policies or grants are needed: students set their own pathway through
> the existing "update own profile" policy (same trust level as display_name /
> section_id)

Confirmed against the tree rather than taken from the comment.
`supabase/migrations/0001_profiles.sql:169` carries
`create policy "update own profile" ... using (id = (select auth.uid())) with
check (id = (select auth.uid()))`. The only trigger on `profiles` is
`enforce_role_change`, at `0001_profiles.sql:116` and re-signed by
`0067_admin_tier.sql:276`; both bodies open `if new.role is distinct from
old.role` and neither mentions any other column. No later migration redefines
either policy. So a student has been able to write their own `pathway` since
0038 and nothing in the product offered it to them.

No migration. No policy. No grant.

## What shipped

A `Pathway` section in the profile menu's body, between the name controls and
the picture presets -- six tiles, three across, each carrying its pathway glyph
and its code, in a `role="radiogroup"` the way the theme picker beside it is.
One tap is the write; it goes through the component's existing `saveProfile`,
which already selects the row back.

Three decisions are worth keeping.

**Any of the six, changeable, not set-once.** The audit asked this explicitly
and it could have gone either way: a pathway is a real school placement, which
argues for set-once. It is also, by `CLAUDE.md`'s and 0038's own words,
IDENTITY AND ATTRIBUTION ONLY -- no route, policy or feature may branch access
on it -- so a wrong value is a misattribution on a leaderboard rather than an
access decision, and a teacher can already correct it from the dashboard
roster. Set-once would leave a student who mis-tapped inside a modal they were
trying to dismiss with no way out but asking staff, which is the dead end this
control exists to remove. The display name two rows above is the same trust
level and is freely editable. The section says so in its own sentence, so the
answer is on screen and not only here.

**One tap writes, rather than the sheet's pick-then-confirm.** The picture
presets in the section below already work that way, a confirm step buys nothing
for a change undone by tapping a different tile, and the chips are the
acknowledgement. Tapping the tile that is already checked writes nothing.

**Nothing was imported from `PathwayPicker.svelte`**, per the prompt, and the
control would not want to: the sheet is the prompt and this is the setting, and
a shared control would couple a permanent surface to a modal's lifecycle.

## The defect the verification found

Adding a section to an anchored popover grew it from **669px to 886px**, at 375
and 1440 alike. The panel's single `.pm-error` -- the one problem list that the
name, the picture, the upload and now the pathway all report into -- went with
it. Measured on the harness with the write forced to be declined, the refusal
sentence sat at **y 1013..1053 in a 900px viewport**, at both widths: present,
painted, `expectVisible` satisfied, and 113px below anything a student could
see. So a refused pathway write reported to nobody, the tile did not take, and
the only thing on screen was a chip still showing the old value -- which is
exactly the silent failure `saveProfile` selects the row back to prevent, one
layer up.

**Nothing on screen reports that, and no presence check can.** `expectVisible`
asks whether an element is painted, not whether it is on screen; and this
Chromium paints no scrollbar into a screenshot, so the panel photographs whole.
The row that caught it reads the refusal's own `getBoundingClientRect` against
`innerHeight`.

The fix is an `$effect` that brings the panel's one problem list into view when
it fills, `block: 'nearest'` (so a sentence already on screen does not move the
page) and `behavior: 'instant'` (`src/app.css` sets a global
`scroll-behavior: smooth`, and a refusal is not an animation). That took it to
**860..900 of 900** -- whole, but flush against the bottom edge with nothing
under it, which reads as a line the page cut off -- so `.pm-error` gained
`scroll-margin-block: var(--space-3)`, a property read only by a scroll that
targets that element. Inside the viewport at both widths after that.

**A second error slot beside the pathway tiles was the rejected alternative and
is worse**: it is the "second place they must learn about" `CLAUDE.md` names,
it fixes one section and leaves the other three below the fold, and two
elements saying one thing is the pair that stops agreeing. The fix as shipped
helps all four write paths on this surface, including the three that predate
this bundle.

## What was measured

`npm run verify:browser`, container Chromium 141.0.7390.37, at 375 and 1440.
Four specs over the route, **162 measurements, 0 outside threshold**.

- **The header did not grow.** `.pm-trigger`'s painted box is **34.0px** at
  both widths, before and after, with the reach at 88x45. That is the number
  ledger 0025 pinned across 69 product pages and the one thing this bundle
  could most easily have broken; the control went in the panel body for exactly
  that reason.
- **The six tiles measure 97.7x56.9 at 375 and 100.7x56.9 at 1440.** 44px with
  no exemption: this is the menu on every product page, so the 24px instructor
  floor is not available to it.
- **Contrast.** The six codes 4.96:1 at worst on `--bg2` (MSET), the checked
  CSEE code **4.9:1 on its own 12% identity tint**, the section sentence
  5.88:1. CSEE is one of the three pathways whose raw identity does NOT clear
  as text on that tint (3.31-4.17), so `pathways.ts`'s ink derivation is
  load-bearing here and the driven spec taps CSEE deliberately rather than a
  pathway that would have passed either way.
- **The write, end to end, from the state the cap actually strands a student
  in.** The driven spec opens with the first-login sheet UP (a student with no
  pathway), presses its own "Choose later", opens the menu and taps CSEE.
  Before: `stored=unset, chips=0, checked tiles=0`. After:
  `stored=CSEE, chips=2 (CSEE/CSEE), checked tiles=1`, the display name tinted
  `rgb(61, 125, 255)` (CSEE's identity `#3D7DFF`), and the sheet did not come
  back.
- **"With no reload" is measured, not assumed.** A marker is planted on
  `window` before the tap and read back after; a reload destroys the realm and
  takes it with it. The plant step echoes the value it set, so a marker that
  was never planted cannot read as one that survived.
- **The refusal, forced.** `?refuse=rls` makes the stub answer ZERO ROWS with
  `error: null` -- the shape an RLS-declined UPDATE has through supabase-js,
  which `if (error)` does not catch. The student reads
  `"Could not save your profile. Try signing out and back in."` in a 309x40
  box at 375 and 318x40 at 1440, inside the viewport at both. The stored row
  stays `unset`, **no tile is checked and no chip appears anywhere** -- the
  markup never ran ahead of the write, which is the standard way this goes
  wrong and is invisible in a screenshot taken a moment later.
- **Rasterized and looked at**, at both widths and in both outcomes, not only
  asserted on.

`npm test`: **527 test files passed, 9826 tests passed**, exit 0, 1564.79s.
Read from the summary line with both streams merged.

`npx svelte-check`: **0 errors, 37 warnings in 20 files (31
`state_referenced_locally`, 5 `css_unused_selector`, 1
`perf_avoid_nested_class`)**, before and after, re-derived in this container
with the two `$env/static/public` values exported before `svelte-kit sync`.
`CLAUDE.md`'s baseline line is correct as written on this tree and needed no
correction.

## The mutation proof, and what it says about where the pin lives

The mutation: `saveProfile`'s `.select('id')` and its `!data || data.length
=== 0` branch both removed, which is what "somebody simplifies this" looks
like. Against the harness stub that is a faithful reproduction of the defect --
with nothing selected back, a zero-row refusal has no `error`, so the write
reads as success, `invalidateAll()` runs, and the chip sits there showing the
value that was not written.

**`npm test` DOES NOT PIN IT. The mutant survives, and that is reported rather
than dressed up as a proof.** 527 test files passed, 9826 tests passed, exit 0
-- byte-for-byte the same verdict as the clean run, which was also 527/527 and
9826/9826. Read from the summary line with stdout and stderr merged, not from
the exit code. `tests/profile-menu-tap-reach.test.ts` is the only file in the
suite that reads this component at all and it parses the source for the
`.tap-reach-44` mechanism; nothing anywhere asserts the select-back. A census
of `tests/` for `saveProfile` or `.select('id')` against `profiles` finds
nothing either, so the survival is a property of the suite rather than of this
run.

**The browser harness kills it, hard, at both widths.** `?refuse=rls` on the
mutant: **10 of 32 measurements outside threshold**, against 0 on the restored
tree. The readings, in the order they matter:

- `the student reads: "NOTHING" (zero box)` -- the whole defect in one line;
- `presence [the refusal, visible in the panel] present 0, visible 0` against
  an expected 1;
- `order-result [the row did not move and the panel names the problem]
  ["unset","NO SENTENCE"]` -- the row correctly did not move, and nothing said
  so, which is exactly the silent half;
- the prepare step's own `until` never satisfied, 12 attempts, so the run
  reports that it never reached the state its numbers describe.

So the pin is real but it lives in an instrument that is deliberately outside
`npm test` and outside CI, and therefore bites only when a session chooses to
spend a browser on it. That is the same gap `tests/profile-menu-tap-reach.test.ts`
was written to close for the reach, and the same argument would justify a
`node`-project source test here. **This bundle did not write one**, because a
source-parsing assertion that `.select('id')` appears in a string is a spelling
check rather than a behavioural one, and `CLAUDE.md`'s rule is that a test
earns its place by making a SILENT regression loud. Whether the harness's
coverage is enough for a write path this quiet is a judgment worth recording
rather than settling unilaterally.

The file was restored from a `cp` taken before the mutation, never with
`git checkout --`, and verified md5-identical (`56a2d73c...`) with `git status`
clean afterwards. `npx svelte-check` and the four-spec harness pass were both
re-run after the restore: 0 errors / 37 warnings, and 162 measurements with 0
outside threshold.

## Two files outside the Owns line, and why each was needed

**`src/routes/dev/profile-menu/+page.ts`.** The prompt requires "the refusal
path, forced, showing what the student sees". `saveProfile` has three outcomes
and only one is reachable by pressing something; the other two are decided by
what the client answers, and the harness's stub client is the only thing in
reach that can answer them. It gained `?refuse=rls` and `?refuse=error`, and a
`?pathway=` seed so the unset state is drivable. **The component is unchanged
and unaware** -- this only changes what the stub returns, which is the one
thing a real refusal changes too.

The seed applies ONCE, and that is not a micro-optimisation: `invalidateAll()`
re-runs the load with the same URL, so a seed applied on every run would
overwrite the value the write had just stored with the one in the query string.
The write would land, the chip would flicker to it, and the next frame would
put it back.

**`tools/browser-verify/README.md`'s counts block**, regenerated with
`npm run verify:readme -- --route /dev/profile-menu` (237 -> 239 specs,
474 -> 478 runs). Never hand-edited; `tests/derived-numbers.test.ts` exists to
redden on a hand-edited digit.

`src/lib/pathways.ts` was on the Owns line and needed no change at all. The
registry already exported `PATHWAYS`, `pathwayColor`, `pathwayInk` and
`withAlpha`, and the ink derivation already covers the tint the tiles paint on.

## For Mr. Pina

**`tools/browser-verify/_shot.mjs` photographs the wrong state, silently, for
any spec whose `prepare` uses `click`.** It handles `waitFor` and `evaluate`
and drops `click` on the floor, so a spec that presses something to reach the
state it measures is rasterized before the press. Found here because two shots
of two genuinely different states came back **byte-identical** (md5
`e61dc643...`, 47593 bytes both) -- the menu had never been opened in either.
The script's own header says "a screenshot of a surface the checks never saw
proves nothing about them", which is precisely what it produces. Its
`console.log('  state:', ...)` readout is also IdeaCAD-specific
(`timeline`/`rows`/`whos`), so on every other route it prints
`{"timeline":false,"rows":0,"whos":[]}` and says nothing about whether the
picture is right. It is outside this bundle's file list, so it was reported and
not touched; the looking was done from a scratchpad copy that runs the clicks.
Any bundle that has rasterized a clicked state since that file shipped should
re-check what it was looking at.

**The panel is 886px tall and is not its own scroller.** The whole of it is
reachable by scrolling the document at both widths, which the widened spec now
asserts, and the refusal is scrolled to when it appears. But on a real product
page the panel now starts at roughly y=74 and ends near y=960, so on a short
laptop viewport the theme rows and Sign out are below the fold and reachable
only by scrolling the page behind an open popover. That is a pre-existing shape
this bundle made 217px worse. Capping the panel at the viewport and letting it
scroll internally is the obvious answer and is a bundle of its own: it touches
every surface the menu lands in, and `CLAUDE.md`'s "no region may hide its
scrollbar" is the constraint it has to satisfy.

**A `classroom-updates.json` entry was judged not required and that judgment is
worth a second opinion.** The standing directive covers classroom-facing
behavior; this is a portal profile control that changes nothing about what a
class sees -- no assignment, no posting, no grading. It is student-visible on
every page, though, including every classroom page, so if the directive is
meant to read wider than "what a class sees", this bundle owes an entry.

## Not verified

- **The live Supabase project.** No session here can reach it; this container
  has no `IDEA_MIGRATION_URL`, no `DEPLOY_PROBE_URL` and no
  `SUPABASE_SERVICE_ROLE_KEY`. Every claim about the RLS policy above is read
  from the committed migration files, not from production's catalog. The write
  was exercised against the harness's stub client, never against a real row.
- **A signed-in session.** `/dev/login` against a local Supabase stack is the
  instrument for that and there is no Docker in this container; `wsl` is a
  Windows-side path and this is Linux. So the control has been driven with a
  mock session and never with a real one, and the RLS policy has never been
  observed accepting or declining this particular UPDATE.
- **The Vercel preview.** No cloud session can check it.
- **Reduced motion.** The harness runs `prefers-reduced-motion: no-preference`,
  so the `.pm-pathway` transition's reduced-motion path is written and not
  measured.
- **Web fonts.** The harness blocks every non-loopback request, so all type
  above is measured in the fallback stack.
