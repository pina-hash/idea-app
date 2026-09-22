---
title: "Profile identity customization: the tournament style layer lifted off `TournamentEntry`, a person's own style on `profiles`, and the mascot pack a student asked to add to (`claude/nifty-euler-shpxf0`, migration 0220)"
date: 2026-09-22
branches: [claude/nifty-euler-shpxf0]
migrations: ["0220"]
subsystems: ["Profiles", "Tournaments", "Interface", "Database"]
---

Three reports, and they are one bundle because the answer to all three is the
same pipe.

> **14.** "the default picture selections for profiles are very mundane and
> uninteresting ... should be much higher quality than they currently are and
> there should be more options at least to customize them."

> **15.** "I want profiles that have more customization than we already have, I
> want banners like there are in the IDEA tournaments, and that same level of
> customization or more in the standard profile, so anywhere the profile shows
> up - authoring, publisher, leaderboard, my class - that banner and their name
> and other customization should be comprehensive throughout the entire
> website."

> **24.** A student, Ezio Veneziano: "add the phone cat to the mascot pack."

### FOR MR. PINA: what to tell Ezio, and the two things that need a decision

**There was no mascot pack.** Zero matches for `mascot` anywhere in the
repository. The eight default pictures were abstract geometric marks and
nothing else, which is also the whole of report 14's complaint: the set is
deliberately abstract, and he finds it mundane for exactly that reason.

**There is one now, and there is a cat in it.** The picture chooser has three
groups -- Marks (the original eight), **Mascots** (cat, fox, owl, bear,
axolotl) and Instruments (compass, turbine, circuit, orbit). He can pick the
cat today.

**What he cannot have is that cat.** "The phone cat" is a specific picture from
somewhere else. Every mark in this set is an ORIGINAL line drawing on a 24x24
grid in the program palette -- that is the format, and a photograph or a meme
image cannot be one; it is also somebody else's artwork, on a school site.
So the honest answer is: the pack he asked for now exists, it has a cat, and
the cat is ours rather than that one.

**And the door is genuinely open, which is the part worth telling him.** Adding
a mascot is now one entry in a list -- a name, a colour and the path data for
the drawing. No database change, no migration. If he wants to design a mark, it
can ship. That turns his request into a real path rather than a no, and it is
the reason the tier exists at all rather than the cat being added quietly on
its own.

**TWO THINGS FOR YOU TO DECIDE, both written up in full further down:**

1. **Somebody else's customization is not visible yet, on purpose.** Your own
   identity appears everywhere you appear. A *classmate's* does not, because
   their style has to travel through whichever database function feeds that
   particular screen -- the class roster, the notebook grid, the leaderboard --
   and each of those is a migration in a different part of the app that other
   people are working in right now. The client side is finished and proved; each
   of those is a one-line widening whenever you want it. Report 15 asked for
   "comprehensive throughout the entire website" and this bundle delivers the
   mechanism and one half of the coverage.
2. **The tournament banner has a legibility defect that predates this work and
   is still there.** A student who picks a mid-tone background colour gets a
   banner whose name measures **1.90:1** against it, where readable text needs
   4.5:1. This bundle did not cause it and deliberately did not fix it, because
   fixing it changes what the projector renders during a live tournament. The
   profile banner works differently and is not affected. Numbers below.

---

### The audit: seven claims, all seven confirmed

Every claim in the prompt held against the tree. The load-bearing ones:

- **Claim 4, the tournament system cannot be reused as-is.**
  `tournament_entry_styles.entry_id` is the primary key referencing
  `tournament_entries(id) on delete cascade`, so a banner dies with its entry;
  and `0064`'s own header says it in words -- "IDENTITY RULE (0062) still
  holds: nothing here touches profiles, Google names or avatars."
- **Claim 6, the measured refusal.** `$lib/avatars.ts` records that the eight
  preset `fg` values were refused as initials-tile ink because `#5500aa`
  measures 2.88 / 2.45 / 2.30 on the three portal grounds. Confirmed, and see
  below for what nobody had measured.
- **Claim 7, no policy change is needed.** `0001_profiles.sql:169` carries
  `"update own profile" ... using (id = (select auth.uid()))`. Confirmed, and
  0220 adds no policy at all.

**One thing the tree said that the prompt did not.** `profiles` carries FOUR
policies, not five: there is no insert policy, because a row is created by
0001's `on_auth_user_created` trigger. That is asserted now, so 0220's "adds no
policy" claim is checkable rather than stated.

### The design question, answered

The prompt's audit step 3 is the one that decides the bundle: *can the new
identity render inside `Avatar.svelte` so that every consumer picks it up with
no edit?*

**For the viewer's own identity: yes, completely, and it cost nothing.** The
root layout loads the profile once as `userProfile`, a key no page load
shadows, and `PROFILE_SELECT` -- the select that populates it -- is in
`$lib/profile.ts`, which this bundle owns. Widening that select and reading it
in `profileStyle()` is the entire pipe. All sixty-nine mastheads that mount
`ProfileMenu` inherited it unedited.

**For somebody else's: the client half is finished, the database half is
deferred and named.** A roster row is not a profile row, and `profiles` select
is own-row-or-admin, so a classmate's style can only arrive through the
SECURITY DEFINER RPC that already feeds that surface. `AvatarSubject` is
widened with the six columns read structurally off a widened row shape, and
`rosterSubject` / `gridStudentSubject` carry them across -- which is
byte-for-byte the shape `0179` and `0180` used to light up the avatar columns
on six surfaces that were read-only to the bundle that did it. The day
`classroom_section_roster` or `notebook_get_section_grid` projects the six
columns, every consumer renders them with no edit.

**Proved rather than claimed.** `tests/identity-consumer-inheritance.test.ts`
reads this lane's own `git diff origin/main...HEAD`, asserts seven identity
consumers are untouched (with the diff's non-emptiness as the positive control,
so an empty list cannot pass for a clean sweep), then mounts two of them --
`SectionGrid` and `PeoplePanel`, neither edited -- with rows carrying the six
columns and requires the accent out the other side. The negative control is the
identical payload with the columns absent, which is the pre-0220 shape every
deployment is in today.

**Zero identity consumers were edited.** The seven files named in the prompt's
hard boundary are all untouched.

### The restraint, and the number behind it

Report 15 read literally is a class roster drawing thirty gradient banners,
thirty background layers and thirty ambient animations, in a pane where the
thing a teacher came to read is the names.

So the split is: **`Avatar.svelte` takes exactly one thing from a style, the
accent, as the ring already drawn round every tile.** One `border-color`, no
extra node, no extra layer, no animation. `IdentityBanner.svelte` -- the one
new shared component -- takes the background, the badge, the tagline and the
ambient flourish, and is mounted where ONE person is being shown.

Both arrangements are on `/dev/avatars` at thirty identities so the cost is a
measurement rather than an opinion, and the difference is asserted as the
difference between the two components: the avatar paints the accent and NOT the
gradient, NOT `linear-gradient`, NOT the tagline; the banner paints all three,
which is the positive control for those four absences.

**What was rejected, and why each is worse than it looks:** a background wash
on the tile (a 24px circle with a gradient inside it competes with the initials,
which are what identify the person); the badge as a corner pip (six pixels of
glyph, and colour-only signal); the ambient flourish (thirty compositor layers
running forever on the six-to-eight-year-old school desktops that are the
stated performance budget); and a `size` threshold turning the banner on above
some number of pixels -- a magic constant deciding in the wrong place, since
whether a surface wants a banner is the surface's call.

### What measuring found, which reading would not have

**Two of the eight existing presets failed the contrast floor as glyph
strokes.** Measured on the six portal grounds against the 3:1 a graphical
object carries: `gear` (#3b6e8f) worst **2.57:1**, `wave` (#5500aa) worst
**1.33:1**. A student who picked Waveform had a mark that was very nearly not
there -- report 14's complaint in its most literal form, on an option that has
been in the picker since 0020. `$lib/avatars.ts` records that both values were
refused as initials INK; what nobody had measured is that they also fail as the
stroke they were kept for.

Repaired by `--acc-ink`'s own rule -- the hue and the saturation are the
identity and do not move, the lightness does:

| id | was | worst | now | worst | hue/sat held | lightness |
|---|---|---|---|---|---|---|
| `gear` | `#3b6e8f` | 2.57 | `#4785ad` | **3.53** | 203.6deg / 41.6% | 39.6% -> 47.8% |
| `wave` | `#5500aa` | 1.33 | `#a74fff` | **3.51** | 270deg / 100% | 33.3% -> 65.5% |

A violet waveform is still a violet waveform; it is now visible.

**The nine new marks share one pinned saturation and lightness (62%, 65%) with
their hues spread around the wheel** -- the shape `AVATAR_TINTS` uses, and for
its reason: it makes the whole set clear the floor TOGETHER, so a tenth hue is
checked by one sweep rather than one at a time.

| id | tier | hex | worst of six grounds |
|---|---|---|---|
| `fox` | creature | `#dd8a6e` | 5.35 |
| `cat` | creature | `#ddaf6e` | 7.04 |
| `bear` | creature | `#af6edd` | 4.11 |
| `owl` | creature | `#6eb8dd` | 6.45 |
| `axolotl` | creature | `#dd6eb8` | 4.72 |
| `circuit` | instrument | `#a6dd6e` | 8.90 |
| `turbine` | instrument | `#6edda6` | 8.47 |
| `compass` | instrument | `#6edddd` | 8.81 |
| `orbit` | instrument | `#6e81dd` | **3.95** |

Worst in the set 3.95:1, against a 3:1 floor.

**The marks were rasterized and looked at, twice, and the first attempt had two
failures a green check would never have reported.** A `raven` read as a
featureless blob and a `caliper` was mush at 24px. They were replaced by `bear`
and `compass`, re-rendered, and looked at again.

### The banner: legible by construction, not by a threshold

The first draft painted the student's colour at full strength and chose dark or
light text from its luminance with `bannerInk`, which is what the tournament
banner does. **Swept over the whole legal colour space, that bottoms out at
1.90:1 for the name** (worst case `#a5b478`, a mid olive) against the 4.5:1 body
text carries.

Three fixes were measured and two were rejected:

- **Pick whichever of the two inks measures better.** Reaches only **3.98:1**,
  and flips **35.7%** of the colour space -- a large visible change to a
  deployed tournament surface, which is not this bundle's to make.
- **A black scrim.** Needs **0.60 alpha** before light ink clears, which mutes
  the colour far more than a wash does, and still leaves the tagline at 3.90.
- **A wash, which is what shipped.** The colour is laid over the room's own
  plate at **0.22** -- `EntryChip`'s existing treatment, for its existing
  stated reason, a dense row where the name has to stay the most legible thing
  on it -- and the ink is the room's `--text-1`, already measured against every
  plate. **Name worst case over the whole colour space: 5.73:1.** Legibility
  becomes a property of the construction rather than a number that has to hold
  for a colour nobody has picked yet.

**The badge moved from the accent to the ink for a related reason.** Painted in
the accent on the student's own background it measured **2.11:1** (a red crown
on amber) and **2.50:1** (cyan on a blue-violet gradient), because the accent
and the background are TWO FREE COLOURS and no pairing of two free colours can
be guaranteed to contrast. A badge is a glyph somebody chose to display, so it
is a thing to be READ: it takes the text tier. The accent keeps the ring and
the rule, which are decoration -- and which DO clear where the shipping
arrangement puts them, on a bare plate: **worst 3.31:1** (violet) across all
nine accents and all eight plates.

**The tagline took `--text-2` at 0.82 opacity: 2.70:1 and 3.38:1 on the washed
ground.** It takes `--text-1` now, differentiated by size and the mono face
rather than by colour -- which is the repo's own "muted copy sitting on an
active fill takes the tier ABOVE" finding, one tier higher, for the same reason
(the wash lightens the ground out from under it, and a fade IS a lightening).

**AND THE CONTRAST CHECK COULD NOT SEE ANY OF IT.** The wash is a `::before`
layer and `checks-visual.mjs` walks ANCESTORS for a background-color, so on a
washed banner it reported `ground from html > body` and scored the ink at
**14.66:1** against the page plate -- a pass for a reason nobody checked, which
is worse than no row. Those rows are replaced by an `orderResult` probe that
composites the real computed values (the layer's own background and opacity,
the ground under it), scores EVERY gradient stop rather than a mean because a
gradient's light end is where ink fails first, and reports the COUNT it
examined so a probe that found no banners cannot report a perfect score. A
near-white `#fafafa` background is in the fixture as the adversarial case.
Measured: 10 ink/stop pairs across 4 washed banners, worst **7.36:1**.

### The migration

**Columns on `profiles`, not a `profile_styles` table, and the reason is the
gate rather than the shape.** `profiles` already carries the four policies this
feature needs -- own-row and admin, for select and for update -- so a separate
table would mean restating all four, which is a second authorization model for
one person's identity. 0038 (pathway) and 0045 (tour_completed_at) both took
the column route on exactly this argument. **0220 adds no policy, no grant and
no function**, which the test asserts rather than the header merely claiming.

**Which also means there is no SECURITY DEFINER RPC in front of the write**, and
that is the one real difference from 0064: a tournament style has exactly one
writer that validates before it inserts, where a profile style is written by the
student's own browser under RLS. So validation is the DATABASE's, as CHECK
constraints, and it has to be complete rather than advisory.

**Two deliberate narrowings against 0064:**

- **An image background is refused.** A tournament banner may carry one because
  its URL arrives through the RPC and points into a bucket the student owns a
  folder in. A profile is written directly, so an image background would be an
  ARBITRARY https URL that every viewer's browser fetches automatically, on
  every surface that person appears on -- handing their IP and Referer to
  whatever host a classmate named, before anybody decided anything. That is the
  img-src-is-not-an-href rule the classroom already enforces with
  `resolveFigureSrc`. Solid and gradient are colours and carry no request.
- **Only the ambient flourishes are accepted.** An event flourish names a
  decisive moment ('confetti-on-win') a tournament has and a profile does not,
  so storing one would be a value no surface can ever play.
  `PROFILE_FLOURISHES` is DERIVED by filtering on kind rather than typed out,
  and the test reconciles the derivation against the constraint in both
  directions.

**The accent constraint is case-INSENSITIVE where 0064's is lowercase-only**,
because 0064's RPC lowercases before the column ever sees the value and nothing
lowercases a direct RLS write. A strict constraint would refuse `#AABBCC` -- a
value every part of the client considers valid -- with a raw constraint
violation no student could act on. The client normalizes on the way out, so
what is STORED is canonical.

**Verified on real Postgres through `db.asUser`**, not the postgrest shim, which
models `select` and `rpc` but not `insert`: 31/31, covering the apply, a clean
re-apply, the student / other-student / admin / signed-out write matrix WITH ROW
COUNTS (an RLS UPDATE that matches nothing does not raise -- it reports zero
rows, so a test checking only for a throw would pass on a policy that had been
removed entirely), and a 21-case shape corpus of 7 accepts and 14 refusals.

**The paste trap was checked both ways.** The file carries exactly one
dollar-quote token pair (`$$` at lines 99 and 192); every other `$` in it is a
regex anchor inside a single-quoted string INSIDE that pair. The tail
verification block has **no `$` of any kind** -- the first draft had a `$probe$`
plpgsql block inside `--` comments, and rather than reason about whether the
editor's splitter balances it, it was rewritten to need none.

**The tail verification is read-only and carries a planted control that MUST
read `**FAIL**`** -- it looks for `image` among the accepted background types,
which section 1 refuses on purpose. A run in which every row reads PASS, that
one included, is a run whose matcher is not looking at anything.

### The lift

`ACCENT_PRESETS`, `NEUTRAL_ACCENT`, `BADGES`, `FLOURISHES`, `accentOf`,
`hasStyle`, `backgroundCss`, `isImageBackground`, `bannerInk` and `accentAlpha`
moved to `$lib/identity-style.ts`. Every one already took a style RECORD and
knew nothing about tournaments; what was tournament-shaped was the TYPE they
were declared against. `entry-styles.ts` re-exports all of it and keeps what is
genuinely about tournaments -- the row type with its two ids, and `styleMap`.
No tournament surface changed an import. The test asserts the re-exports are
the IDENTICAL function objects rather than equal ones, because a re-export
rewritten as a wrapper would pass a behavioural check on the cases somebody
thought of.

### Deviations from the prompt, and why

**The prompt's build item 1 says "`EntryStyleEditor` requires an `entry`; the
generalized editor takes a style and a save function." The pure layer was
lifted; the EDITOR was not generalized.** It imports `tournaments-theme.css`,
previews through `EntryBanner` (which renders an entry's display name and
thumbnail, not an avatar), and its chrome is `.tnm-*` -- so making it the
portal's editor means pulling a room's stylesheet and a room's render path into
a component mounted in sixty-nine portal mastheads, which is the light-paper-
plate argument `ProfileMenu`'s own header already records as rejected. Making
it generic instead means a pluggable preview, no theme import and rewritten
chrome: a rewrite of a 464-line live student-facing surface with three callers
this bundle may not edit, verified only through tournament harnesses. That is a
bigger and riskier change than the one this bundle is for and would be
unreviewable beside the rest.

**What was shared is the thing that would actually drift** -- the registries,
the CSS derivation and the ink, all read by both. The profile's controls are
button grids over those same registries, which is exactly the idiom
`ProfileMenu` already uses for the pathway tiles and the picture presets.

### Mutation proof, one per shipped change

| # | mutation | result |
|---|---|---|
| 1 | the wash becomes a fill (`opacity: 0.22` -> `1`) | **KILLED** by the browser probe: `WORST 1.16:1 FAILS 4.5 at .idb-name on rgb(250,250,250)`, on the adversarial case |
| 2 | `Avatar` stops deriving the style (the inheritance mechanism) | **KILLED**, 4 failures across SectionGrid, PeoplePanel and the restraint |
| 3 | `rosterSubject` stops carrying the columns | **KILLED**, 3 failures including the undefined-preservation case |
| 4 | 0220 accepts an image background | **KILLED** by the registry reconciliation -- but the DB test stayed GREEN |
| 4b | both constraint layers opened | **KILLED**, the DB test's image case fails |
| 5 | `presetMarks` collapses to the single path | **SURVIVED `npm test`**, killed by the browser spec |

**Mutation 4 is the defence-in-depth case CLAUDE.md names**, and it behaved
exactly as that rule predicts: opening the type constraint alone left the value
constraint independently refusing the same write, so the database test could not
see it. Verified by opening BOTH, which reddens it.

**Mutation 5 found a defect in this bundle's own test.** The loop read
`for (const mark of presetMarks(p)) expect(html).toContain(mark.d)` -- the
function under test generating its own expectation, so collapsing it left the
assertion checking that one path, finding it, and passing. The expectation is
built from `p.d` and `p.marks` directly now, the PATH COUNT is asserted before
the contents so a shortened list cannot pass by being a prefix, and the repair
was verified by re-running it against the still-mutated source: `cat drew 1
paths, not 7`.

Every file was restored from a byte copy (never `git checkout --`) and md5
checked; nothing was committed while a mutation was in place.

### What the browser harness caught that reading would not have

Four things, on a surface the unit tests call green:

1. **`waitForApp` returns on DOM stability and `/dev/profile-menu` is
   `ssr = false`**, so the first scripted click landed while SvelteKit was
   still finishing its own first navigation. The next step threw `Execution
   context was destroyed` with an ABORTED `__data.json` behind it, and every
   measurement after that point was of a page that no longer existed. The spec
   waits on the profile row having reached the component first.
2. **`Disclosure` HIDES IN CSS AND NEVER REMOVES**, which is its documented
   contract -- so an `until` keyed on a swatch being PRESENT already held, the
   harness correctly refused to fire the click ("the predicate ALREADY HELD, so
   the click never fired -- this step reached no state"), and all 24 controls
   were measured present-and-invisible. The predicate is `aria-expanded`.
3. **`:nth-of-type` counts among siblings of the same TYPE**, so
   `.pm-swatches .pm-swatch:nth-of-type(5)` matched two buttons across two
   groups. Each group carries its own hook now.
4. **The contrast check cannot reach a `::before` wash** -- see the banner
   section above. Its 14.66:1 was a pass for a reason nobody checked.

**AND ONE DEFECT I REPORTED THAT WAS NOT ONE.** A probe written for this spec
asked whether Sign out sat inside the VIEWPORT, reported `AND IT IS
UNREACHABLE: bottom 1678 of 900 with no scroll`, and produced a `max-height` /
`overflow-y: auto` on `.pm-panel`. **That was wrong and is backed out.** This
panel is not its own scroller BY DESIGN: it is reached by scrolling the
DOCUMENT, which is exactly what `profile-menu-state-open.mjs` asserts, and that
spec was still passing while mine claimed a defect. Two probes answering one
question is the pair that stops agreeing, and these disagreed on the first run
-- so the new probe asks the established question about the Sign out control
rather than inventing a second predicate. The panel CSS is byte-identical to
what it was.

### Two tests are RED on this branch, both structurally, and neither is fixable here

`npm test`: **7 failed, 9936 passed** before the counts regeneration; after it,
**2 failed** and both are consequences of carrying a migration that has not been
applied.

1. **`tests/db/migrations-applied-record.test.ts`** wants a record under
   `docs/migrations-applied/` for every migration from 0193 onward, read off the
   WORKING TREE. 0220 has not been applied -- a cloud container cannot reach the
   production database -- and that directory's own README says in its first two
   lines: "One file per migration that actually applied to the production
   database. **Nothing here is a plan.**" So writing a record now would be
   writing down something that did not happen.
   **THIS IS HOW EVERY MIGRATION-CARRYING LANE LEAVES THE TREE, and it is
   checkable rather than asserted:** `0217`'s SQL landed in `5a2bd197` and its
   record in `e44bc034`, a separate commit; `0216`'s in `e525425c` and
   `7d91cb91`. The record is written by a LATER bundle, from Mr. Pina's report,
   once he has pasted the file. It goes green the moment 0220 is applied and
   recorded.
2. **`tests/db/migration-0177-tombstone.test.ts`** requires the migration series
   to be contiguous apart from holes a lane in flight is holding. The prompt for
   this bundle says "**Use 0220 and no other number**", and `0220` is free --
   but `0219` is unclaimed, so it is a hole nothing accounts for. `0218` is
   CONTESTED between `claude/new-session-8ff2od` and
   `claude/new-session-nfgovx`, which is very likely why 0220 was assigned: one
   of those two moving to 0219 closes this by itself. **The instruction was
   followed rather than second-guessed**, because renumbering against an
   explicit directive could collide with a lane this session cannot see. If the
   contest resolves some other way, renumbering this file to `0219` is the whole
   fix and nothing else in the bundle names the number.

**Neither failure existed on `origin/main`** and neither is about the code this
bundle changed.

### What was NOT verified

- **Nothing was run against the live Supabase project.** This container cannot
  reach it: outbound 5432/6543 are refused and no session holds
  `IDEA_MIGRATION_URL`. Every database claim above is measured against the
  embedded Postgres with the real migration files applied.
- **No signed-in surface was driven.** `npm run verify:browser` covers `/dev`
  routes only; the real profile menu behind a Bosco Tech Google session was not
  opened.
- **`prefers-reduced-motion: reduce` was not exercised.** The harness runs at
  `no-preference`, so the two ambient flourishes were verified as CSS structure
  (nothing hidden in a base state; transform and opacity only) rather than by
  being seen in the reduced state.
- **Web fonts did not load.** The harness blocks non-loopback requests, so every
  text measurement above is in the fallback stack.
- **The contrast probe is arithmetic over the browser's computed values, not a
  rasterized pixel sample.** It would catch a wrong colour, a wrong opacity or a
  wrong ink, and would NOT catch something painting over the top of the banner.
  The surface was separately rasterized and looked at.
- **The tournament surfaces were not re-driven.** The lift is behaviour-
  preserving by identity of the exported function objects and by a corpus run
  through both spellings, but no tournament harness was opened.

### Deferred, with what each would take

1. **Somebody else's style on a roster, a grid or a leaderboard.** One `select`
   widening per RPC, in that subsystem's own lane. The client side is done and
   proved.
2. **The tournament banner's 1.90:1 ink defect.** Needs a decision about
   changing what a live projector renders, and its own visual pass over
   `EntryBanner`, `EntryChip` and `TvStage`.
3. **A teacher setting a student's identity.** The policy already allows it
   (`teachers update any profile`); there is no UI, and the dashboard roster is
   not this bundle's to edit.
4. **A profile background IMAGE.** Refused by 0220 on the disclosure argument
   above. It would need an upload path into a bucket we own and a proxy in
   front of it.
