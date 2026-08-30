---
title: "The IDEA course was a predicate all along (`0132`, corrected IN PLACE)"
date: 2026-08-24
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 129
---

**`0132_foundry_author_class.sql`**, edited rather than followed by an 0133.
The file had **never been applied to production**, which is the only reason
that is allowed: a migration is an immutable applied record from the moment it
touches the live database, and this one had only ever run against local stacks
and the embedded-Postgres suite. Nothing else in the tree named the function it
replaces.

### What was wrong

The entry above pinned `_foundry_idea_course_code()` to the literal `'IDEA'`,
and defended the choice at length. The defence was sound and the value was
wrong. **`classroom_courses` in production holds exactly two rows**: `IDEA209H`
"Engineering I Honors" and `IDEA 100` "Intro to IDEA", both active. The constant
matched NEITHER.

The failure mode is the one the original file's own section 5 was written to
catch, arriving before anybody ran section 5: every author projects null, the
gallery shows no class for anyone, and that is **indistinguishable from a roster
that has not been imported yet**. Nothing would have been on screen to say the
feature was broken rather than merely early.

It was found by reading the production catalog, not by anything in the suite --
and the suite could not have found it, because the fixtures created a course
called `IDEA` to match the constant. **A test whose fixture is shaped to the
code cannot disagree with the code.** That is the more durable lesson here than
the string itself.

### The predicate

```sql
create or replace function public._foundry_is_idea_course(p_code text)
returns boolean language sql immutable set search_path = '' as $$
	select regexp_replace(upper(coalesce(p_code, '')), '\s', '', 'g') like 'IDEA%';
$$;
```

- **WHITESPACE STRIPPED, not `btrim`ed.** `IDEA 100` carries a space INSIDE the
  code, which `btrim` does not touch and the column's own CHECK
  (`code = upper(btrim(code))`) does not forbid. A bare `like 'IDEA%'` happens
  to match that one anyway, purely because the space falls after the prefix;
  stripping means the predicate answers the same for `IDEA 100`, `IDEA100` and
  `' IDEA 100 '`, and the leading-space case is what a mutation proved bites.
- **UPPERCASED** is belt and braces: a stored code is already upper, but the
  function takes TEXT rather than a row and a caller should not get a different
  answer from the same value.
- **PREFIX, so the A-G numbers are free.** `IDEA210`, `IDEA305`, `IDEA306` and
  `IDEA404` all match the day somebody creates them, with no second migration.
- **WHAT BREAKS IT: an IDEA course whose code does not START with IDEA** --
  `ENGR209H`, `HON-IDEA-209`. It breaks the same silent way the constant did.
  Section 5 now prints the codes that matched AND the codes that did not, so the
  answer is on the screen of whoever pastes the file.
- **The looser direction is stated rather than papered over:** `IDEALART` would
  match. No such code exists, the prefix is a school-wide naming convention, and
  the alternative -- a list of exact codes -- is the thing that goes stale every
  time the A-G work adds a number.

### Two IDEA enrollments is a real state, so the answer is a total order

The single-course premise assumed "their class" was unique. With a prefix
predicate a student can hold two matching enrollments outright, so
`_foundry_author_class` resolves them, and every key is there for a reason:

| # | Key | Why |
| --- | --- | --- |
| 1 | `c.active desc` | Prefer a LIVE course. A student carrying a retired IDEA course and a current one is described by the current one. |
| 2 | `e.created_at desc` | The most recent enrollment, by the enrollment's OWN timestamp. |
| 3 | `s.created_at desc` | The section's, as the fallback. |
| 4 | `s.id` | The absolute tiebreak, which is what makes the order TOTAL. |

- **`created_at` AND NOT `updated_at`.** `classroom_set_enrollment` and
  `classroom_import_roster` both upsert on the PK and stamp `updated_at = now()`
  on every write, so re-importing last year's roster file would make last year's
  class look like the newest one. `created_at` is when this student joined this
  roster and never moves again.
- **KEY 3 IS LOAD-BEARING, NOT DEFENSIVE.** `now()` is TRANSACTION time and
  `classroom_import_roster` writes a whole file in one transaction, so two
  enrollments made by one import tie EXACTLY on key 2. A `coalesce` onto the
  section would have been the wrong shape and is refused in the file's comment:
  `e.created_at` is NOT NULL with a default, so it could never fire and would
  read as a guard while guarding nothing.
- **KEY 4 CANNOT TIE**: the enrollment PK is `(section_id, student_email)` and
  the email is fixed inside the function, so every candidate row carries a
  distinct `section_id`. Arbitrary, but STABLE, which is the whole requirement --
  a card must not change its class between two page loads.
- **THE COURSE'S `active` IS A PREFERENCE; THE ENROLLMENT'S IS A FILTER.** A
  roster row says whether this student is still in the class (0082 soft-deletes
  by clearing it, so an inactive row is someone who LEFT). A retired course says
  the school stopped teaching it, which is not a claim about whether they took
  it -- so a student whose only IDEA course has been retired still has one.

### It projects the COURSE TITLE now, not the section label

The original projected `block` falling back to `label`. That was defensible
while exactly one course could match -- "repeating IDEA on every card would be
noise" -- and stops being defensible the moment two can: `Block 3` is internal
scheduling, it tells a viewer nothing, and in the corrected fixture both IDEA
sections are labelled `Block 3`, so it does not even distinguish the two courses
from each other. `Engineering I Honors` is what somebody browsing a gallery can
use. NULL still projects nothing at all.

### What was measured

`tests/foundry-author-class.test.ts`, **20 cases** (was 11), all through
`asUser`. The fixtures are the courses that actually exist -- `IDEA209H`,
`IDEA 100` with its space, `PHYS` as a deliberate non-match, `IDEA404` retired,
and `IDEA305`/`IDEA306` for the same-instant tie -- plus one direct table of
predicate inputs read as the owner, because an enrollment cannot distinguish
"did not match" from "no such row".

**EVERY EXPECTED VALUE COMES FROM THE FIXTURE.** Each tiebreak case names its
winner before asking, asserts the stored timestamps that make it the winner
(read as the connection owner, so RLS is not in the way), and the key-2 case is
run a SECOND TIME with the same pair of courses enrolled in the opposite order --
without which it is also passed by a function sorting on the title, the code or
the section id, none of which is a recency rule. The `updated_at` case touches
the OLDER enrollment so its `updated_at` inverts while its `created_at` does
not, and asserts both before asking. `null` on the predicate is asserted
`not.toBeNull()` as well as false, because a NULL gate in a `where` clause is a
fall-through and not a refusal.

**MUTATION PROOF, ten mutations, each restored md5-identical and re-verified
green.** The four sort keys first, to show the order is four independent
decisions rather than one with three spares:

| Mutation | Result |
| --- | --- |
| drop `c.active desc` | 1 failed -- the retired course won on recency |
| `e.created_at asc` | 3 failed -- both orders and the touch case |
| `e.updated_at` for `e.created_at` | 1 failed -- the touched older row won |
| `s.created_at asc` | 1 failed -- the same-instant pair picked the older section |
| predicate back to `= 'IDEA'` | **14 of 20 failed** -- the original bug, now caught |
| predicate without the whitespace strip | 1 failed -- `' IDEA210 '` |

Then the three privacy layers again, since the helper changed, each opened in
the PERMISSIVE direction on its own:

| Layer opened | Mutation | Result |
| --- | --- | --- |
| The private helpers | `grant execute` on all three to `authenticated` | 1 failed |
| `profiles` RLS | "select own profile" -> `using (true)` | 1 failed |
| `classroom_enrollments` RLS | "own or managed" -> `using (true)` | 2 failed -- the peer's row AND the whole roster |

Full suite: **99 files, 2329 tests, green.** `npx svelte-kit sync && npx
svelte-check`: **0 errors, 37 warnings**, the baseline unmoved (run even though
only SQL, a test and two documents changed).

### NOT verified

- **Nothing ran against the production project, and nothing was applied to it.**
  The two course codes above were read from the catalog and supplied to this
  session; the predicate was verified against fixtures built from them on the
  local embedded Postgres, not against the live rows.
- **No UI calls the new shape.** The gallery, the public detail view and the
  review queue are all still unbuilt, and the deploy-ordering rule is unchanged:
  `foundry_list_apps` does not exist between its drop and its create, so the
  migration is applied by hand BEFORE any client naming `owner_class` ships.
- **No `classroom-updates.json` entry.** Nothing a class can see changed: the
  migration is unapplied and Foundry has no student-facing surface yet.

