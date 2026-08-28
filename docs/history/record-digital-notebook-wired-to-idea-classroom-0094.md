---
title: "Digital notebook (wired to IDEA Classroom, `0094`)"
date: 2026-08-13
branches: []
migrations: ["0094"]
subsystems: ["Digital notebook"]
record_order: 29
---

## Digital notebook (wired to IDEA Classroom, `0094`)

Migration `0094_notebook_classroom_sections.sql` (apply manually after `0093`).
The notebook stops keeping its own parallel idea of a class: sections and
rosters are Classroom's (0082/0083), and the notebook reads them. **Schema and
data layer only** -- the Documentation Check gradebook integration is a
separate pass and is deliberately not started here.

- **WHY IT WAS TWO SYSTEMS.** 0069 shipped `notebook_sections` because at the
  time there was no sections table at all: a "section" was a free-form
  `curriculum.ts` string in `profiles.section_id`, and instructor assignment
  had no DB representation anywhere. 0082 then built the real thing. The
  notebook's copy was left with its own roster rule (`profiles.section_id`
  matching a free-form `course_id`) and its own instructor concept
  (`instructor_id`, a uuid) -- and it was the one **nobody could edit**:
  `notebook_admin_upsert_section` was never wired to a single UI surface, so
  no section could exist except by hand in the SQL editor. **Independently
  confirmed before dropping it**, not taken on trust: nothing in `src/`
  references that RPC.
- **`notebook_sections` and `notebook_admin_upsert_section` are DROPPED**;
  `notebook_sessions.section_id` and `notebook_entries.section_id` reference
  `classroom_sections` now (cascade and RESTRICT respectively, as before).
  **There was no UI to remove** -- the instruction to strip section
  create/edit surfaces found nothing to strip.
- **`notebook_is_section_instructor` is DROPPED, NOT REDEFINED**, and that is
  the point. 0067 redefined `is_teacher()`'s body to mean something else and
  this file calls that a trap by name; a function whose name says "instructor
  of a notebook section" must not survive meaning "manages a classroom
  section". Every caller -- two RLS policies, `notebook_can_read_entry`, and
  five RPCs -- is recreated naming `classroom_manages_section()`, the SAME
  function Classroom's own policies use. That function is
  `is_admin() or teacher of record`, so the separate `or public.is_admin()`
  those sites used to carry is gone rather than kept as a second, driftable
  statement of the same tier.
- **THE THREE TIERS ARE EXACTLY WHERE THEY WERE**, which is the whole
  correctness claim: own entries for a student, own sections for an
  instructor, everything for the chair tier. `student_id = auth.uid()` --
  the predicate the feature's isolation rests on -- is not touched at all.

### The identity bridge (uuid stays; only a translation is added)

The notebook is uuid-keyed end to end and Classroom is email-keyed (the
0070/0073 coin convention, so a roster imports before anyone signs in).
**Nothing migrates the notebook to email keys.** What is added is the
narrowest translation, in the two directions actually needed:

- **uuid -> email for the CALLER is already `current_user_email()`** (0067,
  reads `auth.users` authoritatively). No second copy exists; every
  authorization site reaches it through `classroom_manages_section`.
- **`_notebook_user_id_for_email` / `_notebook_email_for_user`** cover email ->
  uuid, and uuid -> email for someone who is NOT the caller. One job only:
  lining a Classroom roster row up against the notebook rows that belong to
  it. Both lowercase and trim both sides.
- **THEY ARE NO-GRANT FUNCTIONS, NOT A VIEW, and that is the decision.** A
  view mapping emails to account ids needs a SELECT grant, and any grant on
  that mapping hands every signed-in student the school's address book keyed
  to user ids -- the disclosure 0089 spent a whole migration refusing to make.
  As no-grant SECURITY DEFINER helpers (the `_notebook_log` /
  `_coin_public_roster` convention) they are reachable only from inside the
  definer functions here, and **no policy needs them at all**.
- **A ROSTER ROW WITH NO ACCOUNT IS A NORMAL STATE**, not an error: a teacher
  enrolls a class before anyone has signed in. The bridge answers null, the
  grid still gives that student a row, every cell reads 'missing'.

### The roster, and the row key that had to change

`notebook_get_section_grid` derives its roster from `classroom_enrollments`
via the one no-grant helper `_notebook_section_roster` (0069 spelled the CTE
out twice, once for the student list and once for the cells; two copies of a
roster rule is how the two quietly stop agreeing).

- Active enrollments for the section, **UNION anyone who actually holds
  entries or excusals in it**. A student added in Classroom appears at once
  with a full row of missing cells; one removed with nothing filed disappears.
  **A removed student who FILED work keeps their row**, flagged
  `enrolled: false` -- dropping them would hide submitted work that was
  already reviewable, which is a worse failure than showing a row for someone
  who has left. The UI renders a muted `left` chip and the CSV gains a
  `Still enrolled` column, appended last so every existing column keeps its
  position.
- **THE ROW KEY IS `student_key`, NOT the uuid.** An enrolled student who has
  never signed in has no uuid, and two of them would collide on a null key.
  It is the email where there is one and the uuid otherwise, so it is always
  present. `GridStudent.id` is nullable now, `GridCell` carries `student_key`,
  and `cellIndex` / `summarize` / `SectionGrid`'s `{#each}` key all moved onto
  it.
- **The NAME follows 0084's standing coalesce rule with the roster in front**
  (`classroom_enrollments.display_name` -> profile display/full name -> email),
  so the notebook and Classroom show a student the same way.

### What did NOT change, deliberately

- **The composite FK is preserved exactly.** `notebook_entries (session_id,
  section_id) -> notebook_sessions (id, section_id)` references the SESSIONS
  table, not the sections table, so repointing `section_id` costs it nothing;
  a mismatched pair stays unrepresentable (test-pinned by a real
  `23503`). **SUPERSEDED BY `0098`**, which makes a check-in multi-section and
  therefore repoints that key at `notebook_session_postings (session_id,
  section_id)` -- preserving the guarantee and widening it. The reasoning
  below, about why nothing reaches into `classroom_sections`, still governs. There is deliberately no equivalent reaching into
  `classroom_sections` -- it has no column to pair against, and who may touch
  a section is a LIVE question (a teacher of record is reassignable), so it is
  answered by `classroom_manages_section` at every read and write rather than
  frozen into a key. 0088's `(folder_id, student_id)` composite is untouched.
- **`notebook_create_entry` still only checks that the section EXISTS**, not
  that the student is enrolled in it. 0069 did the same, and filing your own
  entry against a class you are not in discloses your own work to that teacher
  and nobody else's to anyone. Tightening it would be a behaviour change
  smuggled into a wiring change; it belongs in its own pass if wanted.
- **`classroom_delete_section` does not count notebook rows**, so a section
  holding entries is stopped by the FK's raw `23503` rather than its own
  structured refusal. In practice its "refuses while enrollments exist" check
  fires first. The FK is what makes the loss impossible either way.

### Idempotency, and the refusal that guards it

- **Every structural step is `if exists` / `if not exists` or catalog-guarded.**
  0088 shipped a drop-then-add on a constraint another constraint depended on
  and died with `2BP01` on its second run in the live SQL editor. The FK drop
  here is a catalog loop over `confrelid = to_regclass('...notebook_sections')`
  (which matches nothing once the table is gone), and both adds are guarded
  conditionals rather than drop-then-add.
- **The migration REFUSES rather than destroys.** If any session or entry still
  references a `notebook_sections` row it raises with the counts and what to do
  -- repointing the FKs would otherwise strand a term of check-ins. An orphan
  section with no sessions and no entries has nothing to lose and is dropped
  with the table.

### Verified

- **`tests/notebook-classroom-sections.test.ts` (32 assertions)**, on the real
  embedded Postgres with the real files: the three tiers through plain RLS AND
  through the grid RPC separately (it is SECURITY DEFINER, so RLS does not
  apply inside it -- if its own check regressed every RLS assertion would still
  pass while a teacher read the whole school), a teacher of another section
  refused both ways, a student refused their own section's grid, a staff
  account teaching nothing seeing nothing, the chair tier reaching everything,
  the roster add/remove/kept-work cases, the never-signed-in student's null id
  and stable key (plus two of them not colliding), the bridge's
  case-insensitivity and its **complete absence of grants to anon AND
  authenticated**, the preserved composite FK, and the file re-applying twice
  with the constraints, policies and overloads re-checked afterwards.
- **MUTATION-CHECKED FOUR WAYS, both directions.** Staff policy -> `using
  (true)` reddens 4; -> `using (false)` reddens 3; removing the grid RPC's own
  authorization check reddens 4; dropping the roster's section filter reddens
  2. Migration restored byte-identical and re-verified green each time.
- **The full suite: `npm test` 489/489 across 23 files** (was 457; the eight
  existing notebook suites reseed from `classroom_sections` +
  `classroom_enrollments` through the real 0082 RPCs via new
  `createClassroomSection` / `enrollStudent` harness helpers, and **the RLS
  isolation assertions pass unchanged**). `npm run check`: 0 errors, 36
  warnings -- the same 36 as HEAD.
- **A REAL PRE-EXISTING GAP the chain change exposed:**
  `notebook-notes.test.ts` asserted no anon grant on
  `notebook_create_note_entry(jsonb, text, uuid)` -- a signature 0088 DROPPED
  when it added the folder parameter. It only passed because 0088 was not in
  that suite's chain; adding it made the assertion fail loudly. Corrected to
  the 4-arg signature that actually ships.
- **Browser-verified** in `/dev/notebook-review` (extended with a classroom
  roster, a never-signed-in student and a transferred-out one): the picker
  reads `ENG1H · Period 2 · B`, the never-signed-in student gets a full row of
  4 missing cells, the transferred student keeps their on-time entry with the
  `left` chip, the chair sees both sections while the instructor sees one, all
  six cell states and glyphs render unchanged, a real cell click opens the
  panel and a real flag reaches `notebook_flag_entry` with the exact arguments
  and flips the cell (proving the re-keying survives the post-write refetch),
  adding a check-in still calls `notebook_admin_upsert_session` and grows the
  grid 4 -> 5 columns, and the CSV carries the BOM, RFC 4180 quoting and
  `Still enrolled` reading `no` for the departed student only. 0 window errors
  throughout; no horizontal overflow at the pane's narrowest (425/425 -- the
  pane would not go below 425, so this is not a 375 measurement).
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0094` has never been applied anywhere. Apply it by
  hand after `0093` and spot-check with two real accounts that a teacher of one
  section cannot open another's grid, and that a student enrolled but not yet
  signed in shows up as a row of missing cells.

