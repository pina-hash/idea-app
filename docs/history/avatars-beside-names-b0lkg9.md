---
title: "A face beside a name: what the audit found, what got one, and the four surfaces that deliberately did not (`claude/instrument-defects-repo-record-b0lkg9`, migration 0179)"
date: 2026-09-04
branches: [claude/instrument-defects-repo-record-b0lkg9]
migrations: ["0179"]
subsystems: ["Portal shell", "IDEA Classroom", "Digital notebook", "Browser harness", "Testing"]
---

Prompt 0033. One migration (0179), one shared component, two surfaces, and a privacy map
that is the more useful half of the bundle.

## The base, and a filename that had to deviate

Started from `origin/integration` at `f4a2dc0` (`origin/main` was `d98704b`, one ahead and
58 behind). Git already carried a committer identity; none was set.

**THE HARNESS ASSIGNED NO NEW BRANCH FOR THIS PROMPT**, so this bundle ran on
`claude/instrument-defects-repo-record-b0lkg9` -- prompt 0029's branch, whose work had
already merged into `integration` at `f4a2dc0`. The standing instruction is to develop on
the designated branch and never push to another without permission, so the branch name was
kept and restarted from `integration`. **That breaks the one premise the history filename
rule rests on**: CLAUDE.md says the name is the branch and that this is collision-free "BY
CONSTRUCTION" because a branch name cannot be taken twice. It was taken twice.
`docs/history/instrument-defects-repo-record-b0lkg9.md` is 0029's record, and writing this
entry there would either overwrite it or append to a file another bundle owns -- the exact
thing the one-file-per-entry split exists to prevent. So this file keeps the branch's unique
token and adds the bundle's own slug. Flagged rather than silently resolved; if the rule
should say something different when a branch is reused, that is a decision for whoever owns
that paragraph.

## A1: the avatars bucket, measured rather than read off the policy

`tests/db/avatar-bucket-boundary.test.ts`, six assertions against a real Postgres with
`0020_profiles_identity.sql` applied. The finding is not a refusal -- it is that **there is
no read boundary at all**, and every decision below was made knowing it:

- `storage.buckets.public` is **true** for `avatars`, in the column and not only in 0020's
  prose.
- **A GENUINELY ANONYMOUS CALLER READS ANOTHER PERSON'S AVATAR OBJECT.** `asAnon`, no
  claims, count 1. A signed-in non-staff peer reads it too.
- Writes are own-folder only: `bruno` inserting into `alice/` is refused with a
  row-level-security error, and `bruno` writing his own succeeds -- the pair that says RLS
  is actually on rather than the select having passed because it was off.
- **But the PATH is not public.** `profiles` is own-row-or-admin, so `bruno` reads 1 of his
  own rows and 0 of `alice`'s.

So the bytes were never private and the pointer is what protects a face. `avatarUploadUrl`
builds an unsigned, unexpiring public URL, and `gauntlet_leaderboards` (0024) has projected
student avatars to every signed-in user since it shipped. That is the honest frame for
everything that follows: this bundle hands a manager a pointer to bytes anyone could already
fetch, about a student whose name and address that manager already reads.

## A2: the mechanism reused

`ProfileMenu` gets the viewer's own avatar from `page.data.userProfile`, loaded once by the
root `+layout.server.ts`, resolved by `avatarSource` in `$lib/profile.ts`: chosen preset ->
uploaded image -> Google photo -> initials. **Not signed and with no expiry**, because the
bucket is public. That is the one projection and this bundle wrote no second one --
`$lib/avatars.ts` either adapts another row shape onto it or answers a question it does not.

## A3: THE PRIVACY MAP

Every surface in the repository that renders another person's NAME, with the audience taken
from the route guard AND the RLS/RPC rather than from the UI.

| Surface | Name shown | The predicate that decides | Audience |
| --- | --- | --- | --- |
| `PeoplePanel` roster (`/classroom/[sectionId]/people`) | display name + **email** | route 404s on `classroom_manages_section`; `classroom_section_roster` gates every row on `classroom_manages_section(e.section_id)` inside its own definer | **STAFF-ONLY** |
| `GradingConsole` roster list + identity row (`/classroom/[sectionId]/item/[itemId]/grade`, `/classroom/grading/[itemId]`) | display name + email | per-section load redirects on `classroom_manages_section`; cross-section 404s on an empty managed set; underneath, `classroom_can_review_submission(item_id, student_email)` on submissions, responses, approvals and files | **STAFF-ONLY** |
| `SectionGrid` / `ReviewConsole` (`/notebook/review`) | name coalesced roster -> profile -> **email** | `notebook_reviews_section(p_section_id)` raises inside `notebook_get_section_grid` | **STAFF-ONLY** |
| `EntryReview` (`/notebook/review`) | same roster name | the grid gate, plus `notebook_can_read_entry` with `submitted_at is not null` | **STAFF-ONLY** |
| `DocumentationCheck` (`/notebook/review`) | same roster name | the grid gate **plus** `sectionManages` -- 0169 keeps this shut for reviewers | **STAFF-ONLY, narrower** |
| `StudentReviewBackStrip` / `NotebookNoAccountNotice` (`/notebook/review/student/[email]`) | display name, falling back to **the raw email** | `_notebook_reviews_student_email(v_email)` raises inside the RPC; the load's own comment says "THE GUARD IS THE RPC" | **STAFF-ONLY** |
| `/classroom/view-as/**` picker + banner | display name + email | `isAdmin` in the layout, and `_classroom_view_as_guard` re-checks `is_admin()` in every read | **STAFF-ONLY (admin)** |
| `gauntlet_leaderboards` board | display name **and avatar, already** | any signed-in user | **SAME-CLASS-STUDENT-REACHABLE and wider** -- every signed-in student |
| `AdminLogPanel` | **no name at all** -- bare uuids, deliberately | table RLS `using (is_admin())` | n/a |

**THERE IS NO STUDENT-REVIEWER PATH, and that was the question the prompt was right to
make the audit answer first.** A reviewer tier does exist -- `notebook_section_reviewers`
(0169) -- and it is domain-locked: `notebook_reviewer_grant` raises
`'Notebook section review is limited to @boscotech.edu accounts'`, `.edu` being the STAFF
domain by `role_for_email` (0001). 0169's own header states the reasoning ("a .net grant
would put a student account over classmates' work") and diverges from 0167 and 0172, which
do admit `.net`. The table has no client write path at all.

**One soft spot found and NOT fixed here, because it is nobody's to fix in this bundle:**
the `.edu` rule lives only in that one `if` inside the grant RPC. The table CHECK is merely
`email like '%@%'`. A second write path, a service-role script, or a copy-paste of 0167's
grant body would bypass it, and the invariant this whole map rests on is one migration deep.
A table-level `check (email like '%@boscotech.edu')` would make it structural. Reported.

## What got an avatar, and what deliberately did not

**GOT ONE** -- both no wider than the name already there, both staff-only:

- `PeoplePanel`'s roster row, 28px, keyed on the student email.
- `GradingConsole`'s student identity row (the `work-head` heading and address), 40px.

**DELIBERATELY DID NOT**, which is the list worth reading:

1. **`GradingConsole`'s roster LIST.** The audience is identical and it is where thirty
   faces would help most, but the prompt scoped this file to "the student identity row
   ONLY". Under-reaching on a scoped file beats over-reaching. **The obvious follow-up.**
2. **Every notebook surface** (`SectionGrid`, `ReviewConsole`, `EntryReview`,
   `DocumentationCheck`, `StudentReviewBackStrip`). Staff-only, so the privacy test passes
   -- what stops it is the MIGRATION BUDGET. `notebook_get_section_grid` and
   `_notebook_student_payload` are a different RPC family from the classroom roster, and
   widening them is a second projection this bundle was allowed one of. `SectionGrid` has a
   second reason of its own: the review grid's density and its 1.9rem cell box are a locked
   contract, and a face in a row header changes a row height inside it.
3. **`/classroom/view-as`.** Admin-only, so again not a privacy refusal. It is an
   impersonation surface whose picker is a plain RLS-scoped select rather than the roster
   RPC, so it would need its own read widened.
4. **Anything public or anonymous, including the maps viewer**, per the prompt.
5. **The GAUNTLET leaderboard**, which already shows student avatars to every signed-in
   user. Untouched, and named here because it is the one place in the repository where a
   student's face is already visible to other students -- which is a live disclosure this
   bundle did not create and did not widen, and which is worth somebody deciding about
   deliberately rather than inheriting from 0020's "avatars are non-sensitive by design".

## A4 / 0179: the projection, and why it is not optional

**No payload carried an avatar. Not one.** `classroom_section_roster` returns six columns
off `classroom_enrollments` and never joins `profiles`; `_notebook_section_roster` returns
five; `_notebook_student_payload`'s `student` object is three keys; the grading rows are
built field-by-field in `studentWorkRows` and drop everything else. `grep -rn "avatar"` over
`src/lib/classroom/`, `src/lib/notebook/` and every classroom or notebook migration returns
zero.

And the client cannot fill the gap, which is the fact that makes 0179 necessary rather than
convenient: **a teacher of record cannot read a student's `profiles` row.** The
"teachers select all profiles" policy (0001) calls `is_teacher()`, which 0067 redefined to
`is_admin()`. Measured in `tests/db/avatar-roster-projection.test.ts`: the teacher sees 0 of
alice's rows, an admin sees 1.

`0179_classroom_roster_avatar.sql` therefore adds `avatar` and `avatar_url` to
`classroom_section_roster` and nothing else:

- **The predicate is unchanged** -- `classroom_manages_section(e.section_id)` per row. No
  new gate, no widened gate. The disclosure is WHAT, never WHO.
- **Two columns, named.** Not `pathway`, `role`, `section_id`, `preferences` or
  `tour_completed_at`; each of those is a separate decision and none is made here.
- **The email/uuid bridge is `_notebook_user_id_for_email`, the 0094 one**, reading
  `auth.users` rather than `profiles.email` (a copy written once at signup). No
  `_classroom_`-prefixed second implementation of the mapping this codebase is most careful
  about.
- **Two LEFT joins**, so a roster row with no account, or an address that does not match
  one, keeps its row and answers null. Null is the ordinary case at three separate steps and
  renders as an initials tile.
- **The DROP is required**, because `create or replace` cannot change a `returns table`.
  It is NOT the deploy-ordering case: the argument list is `(uuid)` before and after, so a
  deployed client keeps calling the same signature and simply does not name the new columns.
  **Migration and deploy are independent and either may go first.**
- **The grants are restated**, because a drop/create pair takes fresh default privileges --
  which on a hosted Supabase project include `anon`. 0137 repaired what existed when it ran
  and does not cover a function created after it. The file's own self-check reads
  `has_function_privilege` back rather than trusting that the revoke ran.

### Cold apply

```
supabase/migrations/0179_classroom_roster_avatar.sql
```

One file, paste into the Supabase SQL editor. It re-applies cleanly (asserted). It expects
`_notebook_user_id_for_email` (0094) and `classroom_manages_section` (0138) to exist, which
they do on any project carrying 0138.

**What undoes it:** re-apply 0138's own definition of `classroom_section_roster` verbatim,
then re-apply `0137_anon_execute_sweep.sql`. No table, column, policy or grant is otherwise
touched.

## The component, and a false name the tests caught

`Avatar.svelte` keeps its `profile` prop (ProfileMenu renders byte-identically) and gains
`subject` for anybody else, `tintKey`, and handling for the three states that must not
produce a hole.

**The failure is keyed on the URL, not on a boolean.** A `{#each}` over a roster reuses the
instance, so a latched boolean would paint a tile over the NEXT person's working picture.
Asserted directly: error the image, swap the subject, the img comes back.

**THE TEST FOUND A NAME THAT WAS NOT A NAME.** `initials()` bottoms out in `displayName()`,
whose last rung is the literal string `'Signed in'` -- correct for `ProfileMenu`, which is
always describing the session holder, and **false** about anybody else: a roster row with no
name and no address rendered the initials **`SI`**, which reads as a person called S. I.
rather than as an absence. `subjectInitials` answers `'?'` for a subject with no identifying
field, and `subjectAvatar` corrects only the tile's TEXT so the priority order stays in
`avatarSource`.

**The tint palette is a measured refusal.** The obvious move was to reuse `AVATAR_PRESETS`'
eight `fg` values -- and two of them are unreadable as text on this ground (`#5500aa` is the
violet CLAUDE.md records at 2.88 / 2.45 / 2.30, `#3b6e8f` no better). This is `--acc-ink`'s
rule in a third costume: the identity may paint a fill, the ink is a separate value, the
move is lightness only. Eight hues at one pinned lightness and saturation, cleared as a set.

## Measured

`npm run verify:browser -- --route avatars`, both widths, **40 measurements, 0 outside
threshold**.

**Row heights, which is the claim the spec exists for.** The five PARITY rows carry
byte-identical text and differ only in what the picture is doing:

| | 375 | 1440 |
| --- | --- | --- |
| loads (a real image) | 40.2 | 40.2 |
| no picture at all | 40.2 | 40.2 |
| a broken `avatar_url` | 40.2 | 40.2 |
| a chosen preset glyph | 40.2 | 40.2 |
| a broken `upload:` path | 40.2 | 40.2 |

Avatar box: **28.0x28.0 in all eleven rows at both widths**, including the long-name row,
which is the assertion that a 50-character name does not squeeze the face. No horizontal
overflow at either width.

**THE FIRST DRAFT OF THAT PROBE REPORTED A DIFFERENCE AND IT WAS THE FIXTURE'S**, which is
worth recording because it is the shape a measurement most easily gets wrong. Comparing the
six ILLUSTRATIVE rows gave `loads=40 none=68 broken=68 noaccount=68 preset=40` at 375 -- a
real height difference caused entirely by each row carrying a different case LABEL and a
different name, which wrap differently at a narrow width. A fixture that varies two things
at once cannot answer about either. The parity group exists for that reason; the
illustrative rows still measure 40.2 / 67.7 / 67.7 / 127.3 / 67.7 / 40.2 at 375 and all
40.2 at 1440, and that variation is their own text.

**The eight tints, worst-first on the real rendered ground: 6.77, 6.88, 7.07, 7.38, 8.41,
8.56, 8.88, 8.99:1** -- against a 4.5 floor, at both widths. The name beside the face is
14.22:1 and the address under it 6.91:1.

**A second probe defect the instrument caught:** `distinct:6` where 8 was expected. Eight
hand-picked sample addresses hashed into six buckets -- a correct answer to a question that
was not worth asking. The harness now SEARCHES for one key per bucket through the real
`avatarTint`, so the page exercises every colour and a hash that collapsed would fail to
find eight.

## The three controls

All three bite, all restored from `cp` copies and md5-verified, never `git checkout --`.

1. **The avatar read is refused for a person the caller may not see.** `otherTeacher`
   genuinely manages Period 9, so a zero for Period 3 is the SECTION gate answering rather
   than a caller with no standing -- and the positive control on the same call returns their
   own section's row WITH its avatar columns. Opening the clause to `and true` reddens it
   (2 failures), restored to `3b52e77993e1a14fd1aae684367fa2d9`.
2. **Removing the no-avatar fallback reddens 5 of 11**, and removing the `onerror` handler
   alone reddens exactly the 2 that are about a broken image. Restored to
   `ce36169a66273d1d65707df1a72d6a2c`.
3. **Breaking the projection's guard stops a non-staff caller being refused** -- the same
   `and true` mutation, which is what control 1's mutation is: `THE GATE DID NOT MOVE`
   fails with `expected 4 to be +0`.

## Counts

- **Static region regenerated**: 94 -> **95 specs**, 47 -> **48 routes**, 78 -> **79 /dev
  pages**, 188 -> **190 runs**. One spec, one route, one dev page: `/dev/avatars`.
- **Measured region** regenerated on a clean tree; the block carries its own figures and sha.
- **Full suite**: 256 files, 5337 tests, green (was 253 / 5309).
- **`svelte-check`**: 0 errors, 37 warnings, breakdown 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- the baseline.

## What was NOT verified

- **NOTHING WAS MEASURED AGAINST PRODUCTION, and one figure would change how this reads.**
  How many students actually have an avatar is unknown from here: `avatar_url` comes from
  Google Workspace metadata and may be populated for most students or for none. If it is
  none, every roster is initials tiles and this bundle is a nicer empty state. The `.env` in
  this container is a placeholder project.
- **0179 is not applied anywhere.** It is proved against embedded Postgres with the real
  migration files, seeded through the real RPCs; applied state is a property of production
  and no file in this repo records it.
- **The two wired surfaces were not opened in a browser.** Both are behind a Bosco Tech
  Google session the harness does not hold, and `/dev/classroom` mounts `PeoplePanel`
  against in-memory fixtures whose rows carry no avatar columns. What was driven is
  `/dev/avatars`, which mounts the REAL `Avatar.svelte` in a byte-identical copy of
  PeoplePanel's row shape. The component is measured; its two mounts are argued from the
  markup.
- **No Vercel preview.** Not opened.
- **`prefers-reduced-motion` is `no-preference` in the harness and web fonts are blocked**,
  so text is measured in the fallback stack. Neither qualifies a contrast ratio.
- **The `tests/dom/` filename is a small deviation from the owned glob.** The prompt owns
  `tests/avatar*.test.ts`; the `onerror` swap needs a DOM, and `tests/dom/` is the only
  project where `mount()` runs an effect. It is
  `tests/dom/avatar-fallback-mount.svelte.test.ts` -- the `.svelte.test.ts` suffix is what
  lets a `$state` fixture compile inside a test file, which is how the instance-reuse case
  is driven at all.

## Out of scope, reported and not changed

- **The `.edu` reviewer restriction is RPC-only, not a table constraint** (above).
- **`gauntlet_leaderboards` shows student avatars to every signed-in student** (above).
- **`src/lib/classroom/classroom.ts`'s `ClassroomEnrollment` type does not carry the two new
  columns.** Not this bundle's file, so `rosterSubject` in `$lib/avatars.ts` reads them
  structurally instead -- which is also the better place for "how do I get an avatar out of
  a row" to live.
- **`assignment-spec.ts`'s `StudentWork` does not carry an avatar**, so `GradingConsole`
  looks one up on the roster rows it already holds rather than widening a shape used by the
  CSV export, the bulk plan and the outcome tables.
- **`/dev` routes have no guard**, which is why `/dev/avatars` is fabricated end to end: a
  data: URI and a path that resolves to nothing, no real person, no request.
