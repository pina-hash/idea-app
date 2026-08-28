---
title: "A manager is never a student row, and an enrollment can finally be removed (`0138`)"
date: 2026-08-27
branches: []
migrations: ["0138"]
subsystems: ["IDEA Classroom"]
record_order: 152
---

## A manager is never a student row, and an enrollment can finally be removed (`0138`)

An instructor with an enrollment row in their own section rendered as a STUDENT.
The reported shape was the check-in grid: their name, a LEFT status badge, a row
of dashed uncheckable cells, and a work count beneath it. The same row was also
in the grading roster, in the FACTS CSV, in the Grades tab denominator, and in
their own to-grade chip. Nothing anywhere could remove it, because
`classroom_set_enrollment` (0082) writes an `active` flag and no enrollment
DELETE path had ever existed.

Locked decision 17 had stopped `studentWorkRows` INVENTING roster rows from
payload emails. It could not help here: this row is a real enrollment.

### The audit that came first, and the two things it corrected

Four distinct roster builders exist, not one:

| Builder | Feeds |
| --- | --- |
| `studentWorkRows` (`assignment-spec.ts`) | the grading roster and the FACTS CSV, and nothing else |
| `_notebook_section_roster` (SQL, live definition 0118) | the check-in grid, through `notebook_get_section_grid` (live definition 0121) |
| a raw select in `grades/+page.server.ts` | the Grades tab denominator |
| a raw select in `people/+page.server.ts` | the People tab list |

So **the check-in grid and the Grades count were never downstream of
`studentWorkRows` at all**, and **the to-grade chip is not a roster build in any
sense** -- `buildFeed` tallies `classroom_submissions` per item with
`isAwaitingGrade`, and a manager reaches it only by having handed something in.

The audit also found **no enrollment removal path of any kind**, surfaced or
not: no migration to date names `delete from public.classroom_enrollments`, and
the table carries `grant select` and nothing else. And it found that **a roster
surface already exists** -- `PeoplePanel` (the People tab) has Add, Edit,
Deactivate/Reactivate and CSV import -- so Remove was added THERE rather than as
a second roster somewhere else.

### The exclusion: generalize the predicate, never write a second one

The instruction was to reuse the existing can-manage predicate. The existing one
is `classroom_manages_section(uuid)` and it asks about the CALLER; the question
here is about a THIRD PARTY'S email, and no email-scoped variant existed
anywhere. `is_admin()` is caller-scoped for the same reason.

Restating either rule inside a new function would have been the second copy this
codebase's own rule forbids. So 0138 LIFTS both into email-scoped functions and
turns the caller-scoped ones into thin wrappers:

- `_admin_is_email(text)` is the admin rule; `is_admin()` becomes
  `case when auth.uid() is null then false else _admin_is_email(current_user_email()) end`.
- `_classroom_manages_section_email(uuid, text)` is the manage rule;
  `classroom_manages_section(uuid)` becomes
  `_classroom_manages_section_email(p_section_id, current_user_email())`.

Both keep their name, signature and OID, so the ~90 applied references (policies
included) resolve unchanged. **The signed-out case is what made this need care:**
`current_user_email()` returns the EMPTY STRING and not null when `auth.uid()` is
null, so both helpers refuse `''` explicitly -- that is what reproduces
`is_admin()`'s own `auth.uid() is null` guard through the new shape. Asserted:
`is_admin=false, classroom_manages_section=false, current_user_email=''` on a
session with no claims, plus a four-account by-identity table across both
sections.

**The blast radius was the argument against doing it, and it was taken anyway,**
because the alternative was two definitions of admin. The full suite (110 files,
2517 tests) is heavy on admin gating and is what backs it.

### Where the exclusion is applied

Once per roster builder, from ONE definition:

- **SQL:** `_notebook_section_roster` gets `not _classroom_manages_section_email(...)`
  in BOTH branches. `enrolled` is the roster row. **`holders` is the branch that
  produced the reported LEFT badge** -- it puts back anyone with submitted
  entries or excusals in the section regardless of enrollment, so deactivating
  never removed the row and neither would deleting it. A holder with no email is
  KEPT: the predicate answers false for null, so the fail-open direction is
  "stays a student", which loses no work.
- **TypeScript:** `classroom_section_roster(uuid default null)` projects a
  `manages` flag beside the columns the roster already had, and `splitRoster` in
  `classroom.ts` is the ONE implementation of "drop the managers".
  `studentWorkRows` calls it, the Grades load calls it, the People hero calls it.
  The client never re-derives manage-ness and could not: admin-ness is keyed on
  `app_admins`, which is admin-only readable.

**The flag is projected rather than filtered** because the People tab has to SHOW
the manager row -- it is the row somebody came there to remove -- while every
other surface has to drop it.

**The to-grade chip needed the section->managers map**, since it is a submission
tally and not a roster. `buildFeed` takes `managerEmails` (defaulting to `{}`,
which is the honest pre-0138 answer) and skips those addresses when counting;
the home load fills it from ONE `classroom_section_roster(null)` call, which is
what the null section means.

**`studentWorkRows` reports the two findings on separate lines with separate
labels**, and the console renders them as two elements with different edges
(`--amber` for off-roster, `--boundary` for managers). They are different
findings and only one is an error: an off-roster response set means work arrived
with no enrollment behind it; a manager exclusion is the roster working.

### The removal: bounded, and it refuses rather than strands

`classroom_remove_enrollment(uuid, text)`. The gate is the EXISTING
`classroom_manages_section` (teacher of record, or admin) -- no new authority.
The table still has no DELETE grant and no write policy; the SECURITY DEFINER
function is the only path, which the suite asserts from
`information_schema.role_table_grants` and `pg_policies`.

It counts four things, all scoped to the SECTION through `classroom_postings`
(a student in two classes has work in both, and removing them from one must not
be refused by the other's): `classroom_responses`, `classroom_submissions`
(files cascade off these), `classroom_module_approvals`, and `notebook_entries`
**without a `deleted_at is null` filter** -- locked decision 13 makes a
soft-deleted entry restorable, so an entry in the bin is work somebody can still
get back. Nonzero total returns
`{ok:false, reason:'work_attached', total, counts:{...}}` and writes nothing;
every count is taken before the single DELETE, in one function and therefore one
transaction, so there is no partial state to reach.

`not_enrolled` is a REFUSAL rather than a raise: two managers with the page open
is ordinary, and the second Remove is a no-op somebody should be told about.

Notebook EXCUSALS are deliberately not counted: an excusal is a staff annotation
keyed `(session_id, student_id)` that neither belongs to the enrollment nor
becomes unreadable without it.

### The surface

Remove sits in the EXISTING People tab roster, beside Deactivate. Two-step arm
then confirm; the confirm names what it costs and points at Deactivate as the
alternative. A refusal renders IN PLACE under that row with its counts and its
own "Deactivate instead" button, because the counts are about one person and
sending them to the top of the page means reading a sentence about somebody
whose row has scrolled away. `enrollmentWorkSummary` names NONZERO counts only,
and the "a notebook entry in the bin still counts" clause appears only when an
entry is actually in the count.

Each row gained a status chip: `Manages this class` / `Enrolled` / `Not on the
live roster`. **Managing outranks enrolled**, because it is the fact that
explains why this name is absent from every student surface, which is exactly
what somebody arriving at this page after looking for it elsewhere is asking.

**The People hero was reconciled with the Grades tab.** It read `active.length`,
so a roster carrying the teacher said "25 enrolled" while Grades beside it said
24, with nothing on either page to say why. It now reads
"24 enrolled - 1 manages this class - 1 inactive" off the same `splitRoster`.

`removalReady` (from the roster read's own rung flag) plus the optional
`removeEnrollment` transport are both required for the control to render, so a
project sitting between two hand-applied migrations gets Deactivate exactly as
before and no button that would answer `PGRST202`.

### What was measured

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `svelte-kit sync`. Unchanged from the baseline.
- **Full suite: 110 files, 2517 tests, all passing.**
- **`tests/classroom-manager-exclusion.test.ts`, 22 tests**, over seeded
  PRE-migration data (the 0128 pattern), applied twice to prove re-appliability.
- **Three mutation proofs, each in the permissive direction**, with the files
  restored byte-identically (md5-checked) and re-verified green:
  `_classroom_manages_section_email` -> `select false` reddened **13**;
  the work guard -> `if false` reddened **4**; the authorization gate ->
  `if false` reddened **2**.
- **Browser pass through `/dev/classroom`, Chromium, measured DOM and computed
  styles only.** Desktop 1440: 26 roster rows, exactly one carrying
  `data-tone="manager"` (`tvargas@boscotech.edu`), every row offering Remove; row
  846x35, no horizontal document overflow. The grading console at the same width
  listed 25 rows, none of them the teacher, with the manager notice and the
  off-roster notice as two distinct elements. 375px: document
  `scrollWidth == clientWidth == 375`, no element right edge past 375.5.
- **Contrast, composited to a canvas and read back** (never a regex over computed
  styles): the manager notice measured **7.27:1** for its text and **4.23:1** for
  its edge on `rgb(16, 19, 18)`. Both clear.
- **The destructive confirm was HIT-TESTED, not read.** It first measured
  `allHit: false`, which was the INSTRUMENT: the button sat below the 780px
  viewport and `elementFromPoint` answers null off-screen, which reads exactly
  like an overlap. Scrolled into view it hit across its full span. It was also
  23px, below the 24px floor, so the confirm block's controls took `.tap-44`
  (`min-height: 44px`, measured 44, hit across all 44 rows of pixels).
- **The refusal and success paths were both driven end to end** in the browser:
  alice (work attached) produced the counted refusal with her row still listed,
  dara (nothing attached) was removed and `removed exactly ["dara@boscotech.net"]`.
- **The degraded rung was driven**: with the harness's 0138 toggle off, 0 Remove
  controls and 25 Deactivate controls.

### What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder (`example-ref`), and this container had no `.env` at all until one
  was written from `.env.example` to reach the `svelte-check` baseline. 0138 has
  NOT been applied to production; the apply is pending approval.
- **No screenshots.** Every visual claim above is a computed-style, geometry or
  hit-test read.
- **The notebook-entry branch of the refusal sentence was not seen in a
  browser.** The classroom harness has no notebook fixture, so its
  `notebook_entries` count is always 0; that branch is covered by the database
  test (`enrollmentWorkSummary` = `"1 notebook entry"` against a real
  soft-deleted entry) and by the conditional itself.
- **`_notebook_section_roster` was exercised through SQL, not through the
  rendered grid.** The check-in grid's own component was not driven for this
  bundle; what was asserted is the roster function's output by identity, which
  is the input that grid renders.

### Deferred

- **The roster row's own controls are 23px**, below the 24px absolute floor.
  Edit and Deactivate were already 23px before this bundle and the new Remove
  matches them rather than being the one inflated button in a row of three.
  Raising all three is a restyle of the panel's density, and a `.tap-reach-44`
  on them would overlap the reaches of the rows above and below (35px apart),
  which hands the tap to the wrong control. It needs its own bundle.
- **`classroom_import_roster` can still put a manager back on a roster.** The
  exclusion means it no longer matters for display, but nothing refuses the
  write. Left alone deliberately: refusing it would be a narrowing of a bulk
  path that silently changes what an already-working roster file does.

---

