---
title: "Team rosters that persist, export and post -- and the one ask whose surface belongs to another lane (`claude/intelligent-bardeen-4quab4`, migration 0223)"
date: 2026-09-22
branches: [claude/intelligent-bardeen-4quab4]
migrations: ["0223"]
subsystems: ["IDEA Classroom", "Testing", "Browser harness"]
---

Prompt 0293, lane D6. Started from `1ec2f640`, which was exactly `origin/main`.
`origin/integration` was ahead at `9ecfcbb4`. One migration, claimed as 0223 in the
first commit after `node tools/migration-claims.mjs` reported it absent from both the
claimed and the hole lists.

The report of 2026-09-09 asked for three things. They are verdicted separately below,
because two of them were largely buildable and one of them is mostly a mount in a file
this lane does not own.

## The claims, checked

Every claim in the prompt held. The ones worth recording with line numbers:

- **The TEAMS block is the random picker.** `PeoplePanel.svelte` renders
  `data-testid="picker-teams"` with `<h4>Team {i + 1}</h4>`, members named
  `display_name || student_email.split('@')[0]`.
- **(a) The input is inverted from the ask.** `pickerTeams` at `picker.ts:115-127`
  derived `const count = Math.ceil(candidates.length / Math.floor(size))` at `:121`;
  the only control was a Team size number input, min 1 max 20, default 3.
- **The round-robin deal at `:123-125` is the quality worth preserving.** It is what
  stops 13 students in fours becoming 4, 4, 4 and one person alone.
- **Nothing persisted.** `teams` was `$derived` behind `drawn = $state(false)`; a
  repo-wide grep found no team table in any migration -- the five migrations matching
  the word are FSP interest, tournament entry members, HTML assignments and IdeaCAD
  assembly parts, none of them a classroom team.
- **`visible_until` and `reveal_at` belong to GAUNTLET.** Confirmed: every non-gauntlet
  file matching an expiry column is coin or deck ingest, and no classroom item has a
  visibility end date.
- **(c) The tournament style module is bound in three layers.** `EntryStyle` carries
  `entry_id` and `tournament_id` at `entry-styles.ts:22-23`; the writer authorizes on
  `entries.user_id = auth.uid()`.

**One refinement to the prompt's reading of (c), and it changed the scope for the
better.** The prompt says the pure parts "take a style record and know nothing about
tournaments" but that three layers bind the rest. That is true of `EntryStyle` -- and
`EntryStyleDraft` is a `Pick` that already EXCLUDES `entry_id` and `tournament_id`, and
every pure function (`accentOf`, `hasStyle`, `backgroundCss`, `isImageBackground`,
`bannerInk`) takes `EntryStyle | EntryStyleDraft`. So the renderers are structurally
reusable **today**, with no adapter and no extraction. This lane consumes them read-only
and does not touch the module. **The shared extraction is lane D2's**, and it had not
landed: `origin/integration` at `9ecfcbb4` carries no generalized style module, only
`src/lib/tournaments/entry-styles.ts` and `EntryStyleEditor.svelte`.

## THE LANE BOUNDARY, WHICH IS THE MOST IMPORTANT THING IN THIS ENTRY

**The student-facing class stream is `ClassView.svelte`, mounted from
`src/routes/classroom/[sectionId]/+layout.svelte`. Neither file is this lane's**, and
`/classroom/[sectionId]/people` -- which is this lane's -- answers 404 to a student by
design.

So "post team rosters for the whole class to see" and "customizeable by the students who
are in them" both need a surface this lane may not write. The prompt said to stop and say
so rather than cross into D4, and that is what happened. **What was built instead is
everything underneath both**: the posting window, the audience-gated read that answers a
student differently from a teacher, and the membership-gated write. A later bundle that
owns `ClassView.svelte` mounts a surface against RPCs that already exist and already
refuse the right people, with no schema work and no second authorization model.

**This is the single thing worth Mr. Pina's attention out of this bundle**: two thirds of
what he asked for on 2026-09-09 are one mount away, and the mount is a two-file lane
assignment rather than a piece of design that still needs deciding.

## What shipped

**(a) Count mode -- SHIPPED, complete.** `pickerTeamsBy(candidates, mode, value, seed)`
beside the untouched `pickerTeams`. Both go through one private `pickerDeal`, so the two
modes provably share a dealer; `pickerTeamCount` is the only place the arithmetic lives.
`pickerTeams`'s signature, defaults and refusal behaviour are byte-compatible -- the 151
pre-existing picker assertions passed unchanged after the refactor, before any new test
was written, which is the measurement that says the refactor was a refactor.

**The count-mode clamp is the decision worth recording.** `count` is clamped to the class
size. Three students into seven teams gives three teams, not seven cards four of which
are empty. That is the count-mode twin of the round-robin deal: a team nobody is on is
not a smaller team, exactly as a team of one is not a smaller team. The panel states the
clamp BEFORE the draw, because a clamp nobody is told about reads as the control being
ignored.

**Persistence -- SHIPPED.** Three tables in 0223. Saving is a separate deliberate press,
never a side effect of drawing.

**(b) Export -- SHIPPED, complete.** `teamsCsv` writes one row per student rather than
one row per team with the names joined into a cell: a spreadsheet of comma-separated
names in single cells cannot be sorted, filtered, counted or pasted into anything, which
is most of what an export is for. The draw label and the seed ride on every row.
`csvCell` is reused rather than rewritten, and that matters more here than on the roster
CSV: **a team name is a string a STUDENT wrote**, so it is the most hostile input this
app puts in a spreadsheet, and Excel executes a leading `=`, `+`, `-` or `@`.

**(b) Posting -- the WINDOW shipped, the student surface did not.** `posted_at` and
`visible_until` on the team set, with visibility derived at call time. Post and unpost are
two verbs rather than one toggle taking a timestamp, because "post until Friday" and "take
it down" are different intentions and a single toggle makes the second one an argument
value.

**(c) Customization -- the AUTHORIZATION shipped, the editor did not.** The style columns
and `classroom_set_team_style`, gated on `_classroom_team_member`. The teacher's own panel
renders a styled team, which is what makes the render path drivable before the editor
exists.

## The decisions

**Audience: the section's own students and its managers, never `anon`.**
`tournament_entry_styles` is public to `anon` because a TV projector holds no session. A
classroom team roster names students in a class, so the reasoning does not carry. All
three tables have RLS enabled with NO policy AND no client grant -- two independent
refusals, either of which denies on its own -- and every read and write goes through a
SECURITY DEFINER function. The read is audience-dependent (a manager sees every live
draw; a student sees only a posted one inside its window), and an RLS policy expressing
that would have been a second statement of the same rule.

**The posting window is on the teams record, not on the item model.** The rejected
alternative was making a posted roster a `classroom_items` row with an end date, which
would have meant inheriting the `(item_id, student_email, block_id)` answer model for
something that takes no answers, and editing files D4 owns. The narrower shape touches
nothing else, which is what the prompt suggested and what the tree supported.

**Who may write a team's style: any member, last write wins, writer recorded. This
DEPARTS from decision 30 and the departure is deliberate.**

Decision 30 ruled out symmetric team rights for an IdeaCAD assembly, on the stated grounds
that "members of a team hold DIFFERENT RESPONSIBILITIES, so they hold different
responsibilities on the assembly", and gave that subsystem an owner, an agreed manager,
granular permissions and transferable ownership. **Every clause of that reasoning is about
a work product divided into parts and checked out one part at a time.** A team's banner is
not a work product: there is no division of labour in picking an accent colour, nothing to
check out, and nothing one member is more responsible for than another. Building an owner,
an agreed manager and a transfer path for a colour swatch would be four columns and three
RPCs of ceremony protecting a decision that costs one click to reverse -- and the report's
own words were "customizeable by the students who are in them", plural, with no owner
named.

**What to do if that is wrong:** the agreed-per-team-manager alternative is ONE nullable
column and ONE branch in `classroom_set_team_style`. It is the right change the day
somebody reports an actual dispute, and it is not worth building before then.
`style_updated_by` means a teacher can already see who to have the conversation with,
which is strictly more than an owner column would have given them.

**A section manager may also write, which the tournament rule deliberately refuses a
host.** A tournament entry is a person's own identity in a bracket. A classroom team's
banner is displayed to a class by the teacher who posted it, so that teacher needs to be
able to take something down without retiring the whole draw.

**What happens when the roster changes: the team is annotated, never shrunk.** A member
row carries an email and nothing else; `classroom_team_board` LEFT joins
`classroom_enrollments` and projects `still_enrolled`. The prompt warned that presence
reads elsewhere in this app inner-join enrollments and silently drop a row, and that is
exactly the defect avoided: an inner join would make a team of four quietly become a team
of three, destroying the record of who worked with whom in the one artifact that held it.
Both cases are exercised rather than described -- an enrollment deactivated, and an
enrollment DELETED outright, where the name falls back to the local part of the address.

**Emails: matched the way the rest of the code does, which turns out to need no
normalization at the comparison.** `current_user_email()` already returns
`lower(btrim(...))` and `classroom_enrollments.student_email` is CHECK-constrained to
exactly that form, so the two compare as exact strings BY CONSTRUCTION. 0223's own email
column carries the identical CHECK and every write normalizes with `lower(btrim(...))` on
the way in, so a teacher pasting a mixed-case address cannot create a member row no
enrollment will ever match.

**An address with no enrollment behind it is refused by count and by name**, and the raise
rolls the whole save back. Reported, never silently dropped.

**Archive, never delete.** There is no delete RPC and no delete grant; a test asserts the
absence rather than the intention. A team draw records who worked with whom, which is
what somebody wants six weeks later when a project is being marked.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`.
  **The baseline was re-derived in a clean `git worktree` at the branch point
  (`1ec2f640`), not on the tree under test**, and came back identical, so `CLAUDE.md`'s
  stated figure is CORRECT as of this date and needed no correction. Both readings were
  taken with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported to placeholders
  before `svelte-kit sync`; without them the checkout reports phantom errors that no
  change touched.
- **`tests/db/classroom-teams.test.ts`: 30 assertions, all at the SQL layer** through
  `db.asUser` / `db.asAnon` against the real deployed functions. None goes through
  `tests/db/postgrest-shim.ts`, which models `select` and `rpc` but not `insert` -- and a
  team write is an insert. The chain applies 0223 AFTER `0137_anon_execute_sweep.sql`,
  which is the real deployment order and the one where a new function arrives holding a
  fresh `anon` grant from the project's default privileges.
- **`tests/classroom-picker.test.ts`: 254 assertions**, of which 151 are the pre-existing
  size-mode cases passing unchanged. Count-mode expected sizes are computed from stated
  arithmetic -- `(n mod c)` teams of `ceil(n/c)` and the rest of `floor(n/c)` -- across
  every remainder class for counts 2 through 8, never from a second call to the dealer.
- **`tests/classroom-team-export.test.ts`: 30 assertions**, every one read back through an
  RFC4180 parser written in the test rather than compared against the writer's output.
- **The paste traps, checked both ways against a planted control.** The migration has 0
  dollar signs in comments, 0 bare dollar signs on code lines, and 18 `$teams$` tokens in
  9 balanced pairs. The checker was then run against a copy carrying a planted
  dollar-quote-in-a-comment and an unbalanced token, and reported PROBLEM -- so the clean
  reading is a reading and not a blind spot. The accent-colour regex originally carried an
  end-anchor `$`; it was rewritten as `char_length = 7` plus a prefix match, which is the
  same assertion and leaves the file with no bare dollar at all. That matters because this
  file is applied by HAND.
- **The DB suite was proven real with a planted control** before being trusted: flipping
  one expected team-size array reddened exactly one assertion, and the file was restored
  from a byte copy (md5 match), never `git checkout --`.

## The mutation proof

Eight mutations, each in the PERMISSIVE direction, each judged through
`npm test` on the relevant file, each restored from an in-memory byte copy and
md5-checked (all eight byte-identical afterwards). **Eight killed, none
survived.**

| mutation | verdict | summary |
| --- | --- | --- |
| count mode stops clamping to the class size | killed | 3 failed / 251 passed |
| the size mode gets its own slicing dealer | killed | 48 failed / 206 passed |
| the team name bypasses `csvCell`'s formula guard | killed | 3 failed / 27 passed |
| the board INNER joins enrollments | killed | 1 failed / 29 passed |
| the style write admits any signed-in caller | killed | 5 failed / 25 passed |
| one function keeps only `revoke ... from public` | **killed by 0223's own apply-time check** | 30 skipped |
| a draw is visible whatever its window says | killed | 4 failed / 26 passed |
| the member primary key stops pinning one team per draw | killed | 1 failed / 29 passed |

**THE ANON-REVOKE ONE IS THE INTERESTING RESULT AND MY OWN INSTRUMENT GOT IT
WRONG FIRST.** Replacing the by-name revoke with `revoke ... from public` -- the
form that does NOT close a function on this project -- made the migration REFUSE
TO APPLY, with its own sentence:

    0223: anon can execute public.classroom_team_board(uuid) -- revoke from anon BY NAME, per 0166.

That is the strongest kill available: the gate caught it before a single test
body ran. But a migration that refuses to apply SKIPS every test rather than
failing one, so the summary line read `Tests 30 skipped (30)` with no "failed"
in it anywhere -- and the script, which judged on the word "failed", scored it
as **SURVIVED**. That is the false-clean direction, on the one mutation whose
kill matters most. It was caught by reading the summary rather than the verdict,
and the script's logic was corrected to treat a skip-all beside a `failed to
apply` line as the strongest kill. **CLAUDE.md names this trap and it still bit
an instrument written with it in view**, which is worth recording: the rule is
not "parse the summary line", it is "know every shape a kill can take".

**The browser-measured change has a separate proof and it is not a test.** The
blank `Post for` select was found by RASTERIZING the panel and looking at it --
every content assertion passed over it, because the element was present, was the
right size, and had the right options; what it did not have was a selected one.
Reverting the fix returns the control to an empty box, which the spec's new
`selectedIndex` read now catches, but nothing in the repository caught it before
a screenshot did.

## What is NOT verified

- **The migration has not been applied anywhere but the test harness.** A cloud container
  cannot reach the production database, `tools/apply-migration.mjs` was correctly not run,
  and `DEPLOY_PROBE_URL`'s credential is stale as of 2026-09-22. `supabase/migrations/0223_classroom_teams.sql`
  is Mr. Pina's to paste. The commented verification query at its tail is read-only,
  returns one row per object examined with the expected value beside the actual, and
  carries `gauntlet_macro_start` as a POSITIVE CONTROL that must read `anon=yes` -- if it
  does not, the query is not reading grants and every OK above it means nothing.
- **No signed-in production surface was opened.** Nothing in this bundle was seen against
  real student data.
- **No `classroom-updates.json` entry was written, deliberately.** Nothing a student can
  see changed: the People tab 404s to students and the posted-roster surface is the part
  this lane could not build. An entry announcing that students can see their teams would
  be false until D4 mounts it. The standing directive is for changes to what a class SEES,
  and this bundle changes what a TEACHER sees.

## TWO TESTS ARE RED ON THIS BRANCH AND NEITHER IS FIXABLE HERE

Both were GREEN at the branch point, measured in a clean worktree at `1ec2f640`,
so both are this bundle's doing. Neither can be made green truthfully.

**1. `tests/db/migrations-applied-record.test.ts` -- structural for ANY unapplied
migration.** It asserts a record under `docs/migrations-applied/` for every
migration file from 0193 onward. That directory is, by its own README, "one file
per migration that actually applied to the production database. Nothing here is
a plan." 0223 has not been applied; a cloud container cannot reach the database;
writing a record would be fabricating an applied state. **This is not specific to
this bundle**: `git log --diff-filter=A` shows 0216 and 0217 each landed their
migration and their applied-record in SEPARATE, LATER commits, so every
migration-bearing branch in this repository carries this red between the two.
It clears when Mr. Pina applies 0223 and somebody runs `tools/record-applied.mjs`.

**2. `tests/db/migration-0177-tombstone.test.ts` -- 0219 through 0222 are holes
nothing on this branch accounts for.** `tools/migration-claims.mjs` reported
`next free 0219`; the prompt said **"Use 0223 and no other number"**, twice. Taking
0223 leaves four numbers with no file and no claim. The tool reads CLAIMS from
refs, so the moment the sibling lanes holding 0219-0222 push their branches or
their ledger entries land, those holes become `inFlightHoles` and the test goes
green with no action from anyone -- which is exactly how 0218 is already
classified, held by `claude/new-session-8ff2od` and `claude/new-session-nfgovx`.

**Renumbering to 0219 was considered and rejected.** It would violate an explicit,
repeated instruction, and it would very likely collide head-on with whichever
sibling lane was told to take 0219 -- trading a transient red for a real
contested number, which is the failure `migration-claims.mjs` exists to prevent.
**If the lane assignment was not what I have assumed, this is the one decision in
the bundle to overturn, and it is a rename of one file plus one line in the
ledger.**

## Deferred, with the reason

1. **The student-facing posted-roster surface.** Needs `ClassView.svelte`. Everything
   below it exists.
2. **The student style editor.** Needs the same mount. `classroom_set_team_style` already
   refuses the right people, proven in both directions.
3. **An agreed per-team manager**, if last-write-wins turns out to be wrong in a real
   classroom. One column, one branch.
4. **Image backgrounds.** Refused by 0223 rather than admitted with nowhere to put the
   bytes -- an image needs a bucket, an upload path and a storage policy, none of which
   exist for a classroom team.
5. **`.picker-teams` still uses a grid** where the repo's own rule prefers multi-column
   for unequal-height panels. Left alone because the drawn cards are equal within one
   member by construction, so the cost is one line of height rather than a dead column.
   The new `.team-cards` container, whose cards genuinely vary, is multi-column.
