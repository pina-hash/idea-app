---
title: "Avatars phase two: the four surfaces 0033 left, the second RPC family that made 0180 necessary, and two regressions only a before/after found (`claude/avatars-phase-two-surfaces-42h0pb`, migration 0180)"
date: 2026-09-05
branches: [claude/avatars-phase-two-surfaces-42h0pb]
migrations: ["0180"]
subsystems: ["IDEA Classroom", "Digital notebook", "Portal shell", "Browser harness", "Testing"]
---

Prompt 0038. One migration (0180), four surfaces, one bug fix, and a before/after
measurement that turned out to be the load-bearing part of the bundle.

## The base

Started from `origin/integration` at `8ad3648` (`origin/main` was `332ba73`). Working
directory `/home/user/idea-app`. **Git already carried a committer identity**
(`Claude <noreply@anthropic.com>`); none had to be set, and the "Please tell me who you
are" failure the prompt warned about did not occur.

**The duplicate check came back clean.** `docs/prompt-ledger/entries/0038-*` existed on no
ref -- `origin/main`, `origin/integration`, or HEAD -- so this is a first issue and not a
re-issue.

## A1: the privacy map, RE-VERIFIED rather than inherited

0033's map is four days old and is a claim. Every surface this bundle owns was re-read
from the route guard AND the deployed function body, and the notebook half was PROVED in
the database harness against a signed-in non-staff caller.

| Surface | Name already shown | The predicate that decides | Audience |
| --- | --- | --- | --- |
| `GradingConsole` roster LIST | display name + chips | per-section load redirects on `classroom_manages_section`; cross-section 404s on an empty managed set; `classroom_can_review_submission` under both | **STAFF-ONLY** |
| `SectionGrid` row header | roster name | `notebook_reviews_section(p_section_id)` raises at the top of `notebook_get_section_grid` | **STAFF-ONLY** |
| `ReviewConsole` empty-cell panel | same roster name | the same grid gate -- there is no roster to point a cursor at without it | **STAFF-ONLY** |
| `EntryReview` header | same roster name | the grid gate, plus `notebook_can_read_entry` | **STAFF-ONLY** |

**PROVED, not read off the policy.** `tests/db/avatar-notebook-grid.test.ts` puts
`notebook_get_section_grid` to `alice@boscotech.net` -- a student ENROLLED IN THE VERY
SECTION being asked about, signed in, with a profile row, which is the widest a student
can be with respect to this payload -- and gets
`Only the section instructor, a section reviewer, or a site admin can view the notebook
grid.` Beside it, on the same call, the instructor gets four rows. And `otherTeacher`, a
genuine instructor of Period 2, is refused Period 1 while getting their own section's row
back with its avatar keys present -- so the refusal is the SECTION gate answering rather
than a caller with no standing at all.

**No surface's audience is wider than the audience that sees the name.** The reviewer
tier (0169) is still the only non-instructor path and is still domain-locked:
`notebook_reviewer_grant` raises `'Notebook section review is limited to @boscotech.edu
accounts'`, and `.edu` is the STAFF domain by `role_for_email` (0001). Re-checked in the
tree; 0033's soft spot stands and is unchanged -- the `.edu` rule lives in that one `if`
and the table CHECK is still merely `email like '%@%'`. **Not this bundle's to fix and
reported again.**

## A2: why 0179 could not serve these, and what it cost

**The notebook review console does not call `classroom_section_roster` and never has.**
Since 0094 its roster is `_notebook_section_roster` -- a different function with a
different population (the section's ACTIVE enrollments UNION anyone holding submitted
entries or excusals in it, so a student who left mid-term keeps the work they filed) --
and `notebook_get_section_grid` is its only caller. That is 0033's "second RPC family",
confirmed against the deployed body rather than the prose:
`tests/db/avatar-notebook-grid.test.ts` reads `pg_proc.prosrc` and asserts it contains
`_notebook_section_roster(` and does NOT contain `classroom_section_roster(`.

**And the positive control on that claim is the one worth having:** 0179 is applied in the
same test, the classroom roster genuinely answers alice's `upload:` path to the same
teacher, and the grid still carries no `avatar` key. So "the grid has no avatar" is about
the grid and not about the data.

**THE COST EITHER WAY, since the prompt asked.** A signed URL is not the shape: 0033
measured the `avatars` bucket PUBLIC (`storage.buckets.public` is true, an anonymous
caller reads any object), so `avatarUploadUrl` builds an unsigned, unexpiring URL and a
grid of thirty faces mints nothing at all. What is unreachable is the PATH, because
`profiles` is own-row-or-admin -- re-measured here: the instructor of record sees 0 of
alice's `profiles` rows, an admin sees 1. So the choice was between one column on a row
the helper ALREADY left-joins, and no faces. **`_notebook_section_roster` already carries
`left join public.profiles p on p.id = c.student_id`** -- that is where its `name` and
`email` fallbacks come from -- so 0180 opens no new table, adds no join, and asks no new
predicate. Thirty rows read a column that was already in hand.

## A3: SectionGrid's density, and what it meant for the row

`SectionGrid` is an **instructor density surface**: `notebook_get_section_grid` raises for
anybody who is not the section instructor, a section reviewer or an admin, so no student
reaches it at any width. Decision 09's answer therefore puts it on the 24px floor, not the
44px one -- and its cells are 1.9rem (30.4px) buttons, which is already between the two
and is the LOCKED DENSITY CONTRACT CLAUDE.md names (the 1.9rem box, the 0.35/0.4rem
padding, Share Tech Mono, the seven status hues).

**So the face had to go UNDER whatever already sets the row, never over it**, and that is
the whole argument for the size: 24px, against a 30.4px cell. Measured, at both widths:
`cell=30 avatar=24 row=43 avatar-under-cell`. The cell is still the tallest thing in the
row and the row is still the cell plus its padding, so the contract is untouched.

## A4: the 'SI' bug -- half fixed, and this bundle closed the other half

**0033's account is accurate and INCOMPLETE, which is the answer the prompt asked for.**
`subjectInitials`/`subjectAvatar` corrected the tile's text for a SUBJECT, so every roster
row was already safe. What was left is the `profile` path: `avatarSource(profile)` builds
its own text with `initials()`, and `Avatar.svelte` rendered that verbatim.

Measured on the real exported functions rather than reasoned about:

```
initials(<nameless profile>) = "SI"
initials(null)               = "SI"
displayName(<nameless>)      = "Signed in"
```

So a profile row with no display name, no full name and no address still painted **SI** --
two capitals that read as a person called S. I. rather than as an absence.

**FIXED INSIDE `Avatar.svelte`, which this bundle owns**, in one line: the tile text is now
`subjectInitials(profile ?? subject)` unconditionally, never `source.text`. It renders
**`?`**. The change costs nothing anywhere else -- for a subject it is the same call
`subjectAvatar` already made, and for an IDENTIFIED profile it delegates straight back to
`initials()` with the same three fields, so every existing tile paints byte-identical
letters. Asserted in both directions: a nameless profile answers `?`, a named one answers
`AR`, an address-only one answers `TC`.

**`initials()` ITSELF IS UNCHANGED AND STILL ANSWERS 'SI'.** It lives in
`$lib/profile.ts`, which this bundle does not own. What keeps it off a screen is that
nothing reads its answer any more, and that is a property of the tree, so
`tests/avatar-initials.test.ts` **sweeps `src/` for callers** and pins the answer at
exactly two -- `subjectInitials` delegating (which is the point of that function) and
`avatarSource` filling in a field nothing renders. A third is a new way back to 'SI'. The
`initials(<nameless>) === 'SI'` expectation is written as a TRIPWIRE, with a comment
saying that a failure means somebody fixed it at the source and the expectation should be
deleted rather than weakened.

**The sweep strips comments first, and that is not tidiness.** Both files discuss the
defect at length and quote the very expressions it looks for, so a raw text search matches
the explanation as readily as the bug -- which it did, on the first run. There is a
positive control on the stripper itself.

## A5: the counts block's outside-threshold rows

**ZERO, by identity, confirmed twice.** The block carried
`"outside":0,"outsideRows":[]` before this bundle, and the regeneration at the end of it
carries `"outside":0,"outsideRows":[]` again.

## 0180: the projection

`0180_notebook_grid_avatar.sql`. **The number was taken at commit time and verified free
across every ref** -- all nine remote refs at the time (`origin/main`,
`origin/integration` and seven `claude/**` branches) carried `0179` as their highest and
none carried an `0180`.

Two halves, each re-signed from its own latest applied definition with the diff spelled
out:

- **`_notebook_section_roster`**, 0138's definition verbatim plus two columns in the
  `RETURNS TABLE` and two expressions (`p.avatar`, `p.avatar_url`) in the final select,
  read off the `profiles` row it already left-joins. **The DROP is required**: this
  changes the return type, which `create or replace` refuses.
- **`notebook_get_section_grid`**, 0169's definition verbatim plus two keys in the
  `students` object. **`create or replace` and NOT a drop**: the return type is `jsonb`
  before and after, so nothing forces one and a drop would only put the grants at risk.

**IT IS NOT THE DEPLOY-ORDERING CASE.** Neither argument list changes, the grid returns
jsonb, and a client that does not know the two keys simply does not read them. The
migration and the deploy are independent events and either may go first.

**WHY THERE IS NO CAPABILITY FLAG.** Every select ladder here reports itself
(`notesReady`, `foldersReady`) because a missing column costs a feature. This one costs
nothing a viewer can see: absent columns and "chose no picture" render the IDENTICAL
initials tile, so a flag would turn off a control that does not exist and would say
"unavailable" about the state most people are in anyway. Asserted rather than argued --
`gridStudentSubject({name, email})` and `gridStudentSubject({name, email, avatar: null,
avatar_url: null})` are `toEqual`.

**THE plpgsql CALLER GUARD CLAUDE.md REQUIRES, run the other way round.** Postgres records
no dependency from one plpgsql body to another, so dropping the helper under its caller
succeeds silently. Both halves are re-created in the same file, and the self-check then
reads `pg_proc.prosrc` back looking for any OTHER body that calls the helper and was not
re-signed. The suite asserts the same thing independently and gets exactly
`['notebook_get_section_grid']`.

**THE GRANTS ARE NAMED, not revoked from `public` alone**, because a drop/create pair
takes fresh default privileges -- which on a hosted Supabase project include a direct
grant to `anon`. The helper stays granted to NOBODY (its only caller is definer; a grant
to `authenticated` would hand any signed-in student a read of any section's roster
straight through PostgREST). The self-check reads `has_function_privilege` back rather
than trusting the revoke ran.

### Cold apply

```
supabase/migrations/0180_notebook_grid_avatar.sql
```

One file, pasted into the Supabase SQL editor. It re-applies cleanly (asserted). It
expects `_notebook_user_id_for_email` (0094), `_classroom_manages_section_email` (0138)
and `notebook_reviews_section` (0169) to exist, which they do on any project carrying
0169.

**What undoes it:** re-apply 0138's own `_notebook_section_roster` verbatim, then 0169's
own `notebook_get_section_grid` verbatim, then re-apply `0137_anon_execute_sweep.sql`. No
table, column, policy or grant is otherwise touched.

## The client: one component, one adapter per row shape

`gridStudentSubject` in `$lib/avatars.ts` joins `rosterSubject`, and **the two stay apart
deliberately**. A classroom roster row is email-keyed and spells the name `display_name`;
a grid row is keyed on `student_key` and spells it `name` -- and that `name` has ALREADY
been through `_notebook_section_roster`'s SQL coalesce ladder (display_name, full_name,
address, then the literal `'Student'`). So the adapter puts it in `display_name` and
leaves `full_name` null: **re-running a second ladder in the client is how a row header
and its tile come to disagree about who this is.** A test drives a grid row through the
ROSTER adapter and gets `?`, which is exactly the failure the separation prevents.

Read STRUCTURALLY, following 0033's own precedent with `ClassroomEnrollment`: no shared
type gains the two columns, so nothing outside this bundle's files moved.
**`src/lib/notebook-review.ts` was not touched at all**, and neither was
`src/routes/notebook/review/+page.svelte` -- the grid RPC returns jsonb and the transport
passes it straight through, so the new keys ride along with no route change and no ladder.

## The two regressions a before/after found, and nothing else would have

This is the part worth reading. Both were introduced BY this bundle, neither is visible in
a diff, and both were caught by copying the pre-change file in with `cp`, re-running the
harness, and comparing -- restoring from the copy and md5-verifying, never
`git checkout --`.

**1. `SectionGrid`'s `left` chip: 43px -> 66px.** The chip is `display: inline-block` and
sat on the name's line. Wrapping the avatar and the name in a block-level flex container
pushed it onto a SECOND line, and the row for a student who has left the class grew by
23px -- on the one surface whose density is a locked contract, for a reason having nothing
to do with the picture. The chip now sits inside the name line, where it belongs (it
qualifies the name), and its inline `margin-left` is gone because the flex `gap` supplies
that space. **43 before, 43 after.**

**2. `GradingConsole`'s roster row: 44px -> 46px.** That row is `min-height: 44px` -- the
tap floor, which its padding was tuned to carry after the row measured 35px. With 18px of
padding and border, a **28px** face made the avatar the tallest thing in the box. At
**24px** the floor decides again. **44 before, 44 after, at both widths.**

**The lesson is the shape of the mistake, not either number.** In both cases the changed
tree measured a plausible value, and the first draft of the spec wrote that value down as
the expectation -- so a 23px regression on a locked-density surface would have shipped AS
the new contract, with a green tick beside it. What separates the two is having the
pre-change tree to measure, and nothing about the diff would have said so.

**And the probes themselves needed the same correction twice**, which is 0033's parity
lesson in a third costume: the first drafts compared every row against every other row and
reported DIFFER for content -- the `left` chip's second line at 66px, and a 45-character
name wrapping to 120px at 375 and 90px in the grading roster. A fixture that varies two
things at once cannot answer about either. Both probes now compare a row against ITSELF in
the other two payloads, so the avatar columns are the only thing that varies.

## Measured

`npm run verify:browser -- --route avatars`, both widths: **98 measurements, 0 outside
threshold.**

**Row heights, per position, across the three payloads** (`with` = every student has a
picture, `without` = the PRE-0180 shape with the columns absent, `mixed` = some faces,
some tiles, one image that 404s, one 45-character name):

| Surface | 375 | 1440 |
| --- | --- | --- |
| `SectionGrid` ordinary row | 43 / 43 / 43 | 43 / 43 / 43 |
| `SectionGrid` `left`-chip row | 66 / 66 / 66 | 66 / 66 / 66 |
| `SectionGrid` long-name row | 120 / 120 / 120 | 43 / 43 / 43 |
| `GradingConsole` ordinary row | 44 / 44 / 44 | 44 / 44 / 44 |
| `GradingConsole` long-name row | 90 / 90 / 90 | 44 / 44 / 44 |

Identical per position in every case. The rows that differ from each other differ by their
own TEXT and read the same in all three payloads.

**Boxes**: `SectionGrid` 24x24 in every row including the long-name one; `EntryReview`'s
header face 28x28 in all four states including the 404 and the wrapping name;
`GradingConsole` 24x24. `cell=30 avatar=24 row=43 avatar-under-cell` and
`row=44 avatar=24 face-under-floor`.

**Contrast on the NOTEBOOK plate, which is a different room and was never measured
there**: the tile tints worst-of-eighteen **6.88:1**, the grid name **15.42:1**, the entry
panel eyebrow **6.68:1**. (On the classroom plate the eight tints still measure worst
6.77:1, unchanged.)

**`EntryReview`'s Close button stays on its edge** (`button-right face-left`) -- the row
that would catch losing `.head-who`'s `flex: 1 1 auto`, which is exactly how a third child
in a `space-between` header floats the text into the middle.

**Full harness run**: 194 route/width runs, **2776 measurements, 0 outside threshold**,
439.3s, on `5d587bb`, clean tree. The measured region was regenerated from it (2718 ->
2776); the static region was already current and nothing was written to it (this bundle
adds no spec file and no `/dev` page -- `/dev/avatars` already existed).

**Full suite**: 263 files, **5463 tests, all passed**, run **2026-09-04 18:43-18:47
America/Los_Angeles**. **Prompt 0036's six time-of-day hall-pass failures did NOT appear,
and the run time is why** -- 18:43 is outside the ~22:00-02:00 Pacific window, so this run
says nothing about whether that defect is still there. `npm run check`: **0 errors, 37
warnings**, breakdown **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`** -- the baseline exactly.

## The controls

All five bite, all restored from `cp` copies and md5-verified, never `git checkout --`.

1. **The avatar read is refused for a person the caller may not see, and opening the
   clause proves it bites.** Inside `tests/db/avatar-notebook-grid.test.ts`, last because
   a mutant poisons the database it runs in: `notebook_reviews_section` is replaced with
   `select true` (the PERMISSIVE direction -- a predicate commented out fails closed and
   reddens almost nothing), and the student who was refused now reads all four roster rows
   INCLUDING carla's Google photo. Restored, and the refusal is green again in the same
   test.
2. **Removing the no-avatar fallback reddens 11 of 29**, across the mount tests and the
   surface renders.
3. **Removing the `onerror` handler alone reddens exactly the 2 that are about a broken
   image**, and nothing else -- which is what says the fallback rows and the swap rows are
   measuring different things.
4. **Reverting the 'SI' fix reddens exactly 2**: the mount that asserts `?`, and the source
   assertion that the old expression is gone.
5. **Breaking the projection's guard stops a non-staff caller being refused.** Two
   file-level mutants on 0180 itself, both chosen to APPLY CLEANLY so the failure is the
   assertion biting rather than the migration raising: projecting `null::text` for both
   columns reddens 3 of 16 (the projection rows only), and granting the helper to
   `authenticated` -- which slips past the file's own self-check, since that only asserts
   `anon` -- reddens exactly the 2 ACL rows.

**The first attempt at control 5 was worse than it looked and is recorded because of it.**
Deleting the two jsonb keys outright left a dangling comma, so the migration RAISED, the
`after 0180` block's `beforeAll` threw, and 11 of 16 tests were SKIPPED. One red line
against eleven skips reads like a control that bit; what it actually proved was that a
syntax error is a syntax error. A mutant that does not apply is not a mutation proof.

## What was NOT verified

- **NOTHING WAS MEASURED AGAINST PRODUCTION.** The `.env` here is a placeholder project
  (`example-ref`). How many Bosco Tech students actually have an avatar is still unknown
  from this container -- `avatar_url` comes from Google Workspace metadata and may be
  populated for most or for none. If it is none, every one of these surfaces is initials
  tiles and this bundle is a nicer empty state.
- **0180 is not applied anywhere.** It is proved against embedded Postgres with the real
  migration files, seeded through the real RPCs, with 0179 applied beside it. Applied
  state is a property of production and no file in this repo records it.
- **The four real surfaces were not opened behind a real session.** All four are behind a
  Bosco Tech Google session the harness does not hold. What was driven is `/dev/avatars`,
  which mounts the REAL `SectionGrid`, the REAL `EntryReview` and the REAL
  `GradingConsole` against fabricated payloads in exactly the shape the RPCs return, plus
  `/dev/grading-bulk` for the before/after. The components are measured; their production
  mounts are argued from the markup.
- **`ReviewConsole`'s empty-cell panel was not driven in a browser.** It needs a cursor on
  a cell with nothing in it inside a full console mount; its header is byte-identical in
  shape to `EntryReview`'s, which was measured, and the wiring is asserted in
  `tests/avatar-surfaces.test.ts`. **Stated rather than implied.**
- **No Vercel preview.** Not opened.
- **`prefers-reduced-motion` is `no-preference` in the harness and web fonts are blocked**,
  so text is measured in the fallback stack. Neither qualifies a contrast ratio.
- **No student-visible change, so `classroom-updates.json` gained nothing.** All four
  surfaces are staff-only. The one change that touches a student-reachable surface is the
  `Avatar.svelte` tile-text fix, which alters `ProfileMenu` only for a profile carrying no
  display name, no full name AND no address -- a state no Google-signed-in account can be
  in, since the address is always present.

## Out of scope, reported and not changed

- **The `.edu` reviewer restriction is still RPC-only, not a table constraint.** 0033
  reported it; it is unchanged, and the whole notebook half of this bundle's privacy claim
  rests on that one `if`.
- **`gauntlet_leaderboards` still shows student avatars to every signed-in student.**
  Untouched, and read-only by this prompt's own instruction.
- **`/classroom/view-as`** still has no faces: admin-only, so not a privacy refusal, but
  its picker is a plain RLS-scoped select rather than a roster RPC and would need its own
  read widened.
- **`initials()` in `$lib/profile.ts` still answers 'SI'.** Fixed at every render path,
  not at the source, because that file is not this bundle's. The sweep is what holds it.
- **The prompt's owned glob named `src/lib/notebook/transports.ts`, which does not
  exist.** The notebook review transports are typed in `src/lib/notebook-review.ts` and
  implemented in `src/routes/notebook/review/+page.svelte`. Neither needed a change -- the
  RPC returns jsonb and the new keys ride along -- so the deviation cost nothing, but it is
  recorded because a future prompt copying that glob will find the same gap.
- **`tests/dom/avatar-fallback-mount.svelte.test.ts` was appended to rather than created.**
  The owned glob is `tests/avatar*.test.ts`; the mount for the profile-path fix needs a DOM
  and `tests/dom/` is the only project where `mount()` runs an effect. 0033 created that
  file for the same reason and recorded the same deviation.
