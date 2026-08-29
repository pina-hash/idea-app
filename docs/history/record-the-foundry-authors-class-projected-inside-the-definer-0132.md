---
title: "The Foundry author's class, projected inside the definer (`0132`)"
date: 2026-08-23
branches: []
migrations: ["0132"]
subsystems: ["IDEA Foundry"]
record_order: 128
---

> **SUPERSEDED IN PLACE.** The file this describes was never applied to
> production and has since been corrected there: the pinned course code and the
> section-label projection below are both gone. See [The IDEA course was a
> predicate all along](#the-idea-course-was-a-predicate-all-along-0132-corrected-in-place)
> for what the file actually says now. Everything else here still holds.

**`0132_foundry_author_class.sql`** -- one pinned constant, one private helper,
one `returns table` function dropped and recreated, one jsonb key added. No
table, no column, no policy, no grant to anybody. The gallery needs to say whose
app it is and which class they are in; the name was already there from 0130 and
the class was not.

### Why it is projected rather than joined

Neither table behind the answer is readable by the student doing the browsing,
and both are meant to stay that way:

- `profiles` is own-row-or-admin ("select own profile" is `id = auth.uid()`;
  all-profiles is `is_teacher()`, which since 0067 means `is_admin()`).
- `classroom_enrollments` is `student_email = current_user_email() or
  classroom_manages_section(...)` -- own rows or a manager's.

So a client-side join cannot produce this and a view would have to be granted,
which is the disclosure the arrangement exists to avoid. The projection happens
inside `foundry_list_apps` and `foundry_get_app`, which are SECURITY DEFINER and
already decide who may see which app. **Nothing here grants anything to anybody**
-- both tables stay exactly as locked as they were.

### The load-bearing decisions

- **THE ROSTER IS THE SOURCE, AND `profiles.section_id` IS REFUSED.** That column
  is the easy wrong answer because it sits on the row these functions already
  join. 0003 added it as a value the student SELF-SELECTS, free-form text,
  "intentionally not a FK", validated by nothing. Rendering it under a published
  app presents a student's own claim about themselves as a roster fact. It must
  not appear on any Foundry surface.
- **THE COURSE IS PINNED IN `_foundry_idea_course_code()`**, a one-line constant
  in the `admin_owner_email()` shape. Chosen over a config table for a single
  row: a table would need a policy, a write path, an admin surface and an answer
  for what happens when it is empty, all to hold one string that changes roughly
  never. **The migration's own comment carries the two ways it can change** so the
  next session does not read it as an oversight -- a changed code is a new file
  with a new literal; IDEA taught under SEVERAL codes at once means the
  SIGNATURE is wrong rather than the literal, because a student could then hold
  two matching enrollments and "their class" stops being one value.
- **The literal is UPPERCASE** because `classroom_courses.code` carries a CHECK
  that it equals `upper(btrim(code))`. A lowercase constant would match nothing,
  silently, forever.
- **THE uuid/email BRIDGE IS `_notebook_email_for_user`, THE 0094 ONE.**
  `student_apps.owner` is a uuid and enrollments are email-keyed. Its `_notebook_`
  prefix says where it was born, not what it does -- it is a pure lookup with no
  notebook in it -- so copying it under a `_foundry_` name would be a second
  implementation of the one mapping this codebase is most careful about. No view,
  ever: a granted email-to-uuid view is a school directory.
- **NULL IS A NORMAL ANSWER.** An app outlives an enrollment, a roster import lags
  a term, a student transfers, an alumnus keeps a published app. The surfaces
  render nothing at all for it -- no placeholder, no fallback, no empty label.
- **Only `active` enrollments**, because 0082 soft-deletes a roster row by
  clearing `active`; an inactive row is a student who has LEFT that class.
- **`order by ... limit 1` is a tie-break, not a rule.** The enrollment PK is
  `(section_id, student_email)`, so one student CAN sit in two sections of one
  course. Deterministic beats flickering between page loads.
- **The label is the SECTION's, not the course's** -- every row is from the same
  course by construction, so repeating "IDEA" on every card would be noise.
  `block` ("Block 3", what a person says out loud) falls back to `label`.
- **`foundry_list_apps` is DROPPED and recreated**, because a `returns table`
  function's shape is part of its identity and Postgres refuses to replace with a
  different return type. `foundry_get_app` returns jsonb, which has no declared
  shape, so it is a plain `create or replace` at the same signature and carries
  none of the signature trap.
- **Section 5 prints what the constant actually matched** at apply time. The one
  thing the file cannot know is whether `IDEA` is the real course code, and a
  constant that matches nothing fails SILENTLY -- every author simply has no
  class, which is indistinguishable from a roster not yet imported. Notices only:
  a course that does not exist yet is a legitimate state, so it reports and does
  not raise.

### What undoes it

Stated in the file's own header, and it loses no data -- nothing here writes a
row, drops a column or changes a policy:

```
drop function if exists public.foundry_list_apps(uuid, boolean, boolean);
drop function if exists public._foundry_author_class(uuid);
drop function if exists public._foundry_idea_course_code();
-- then re-run 0130's definitions of foundry_list_apps and foundry_get_app
-- verbatim; both are reads and carry no state.
```

### What was measured

`tests/foundry-author-class.test.ts`, 11 cases, all through `asUser` -- a student
caller with the JWT GUC set and `SET ROLE authenticated`, never the connection
owner and never service-role. The file is in two halves on purpose, because the
disclosure half passing says nothing about whether the tables behind it are still
shut.

**The half that discloses** (6 cases): the name and class come through both reads;
a block beats a label; a non-IDEA course never projects; an author with no
enrollment projects null; an enrollment going inactive stops projecting.

**The half that would fail silently** (5 cases), each paired with a positive
control so it cannot pass vacuously: the viewer cannot read the author's
`profiles` row while reading their own; cannot read the author's enrollment while
reading their own; cannot enumerate the roster of the class it just learned the
name of; cannot call any of the three private helpers directly (with
`foundry_list_apps` succeeding for the same caller, so the refusals are about the
grant and not a broken session); and neither payload contains an email anywhere.

**MUTATION PROOF, three layers opened separately in the PERMISSIVE direction**,
each restored md5-identical afterwards and re-verified green:

| Layer opened | Mutation | Result |
| --- | --- | --- |
| The private helpers | `grant execute` on all three to `authenticated` | 1 failed -- the viewer read `"Block 3"` for a peer directly |
| `profiles` RLS | "select own profile" -> `using (true)` | 1 failed -- the peer's profile row came back |
| `classroom_enrollments` RLS | "own or managed" -> `using (true)` | 2 failed -- the peer's enrollment AND the whole roster |

Each layer reddens on its own, which is what says the three are independent
rather than one check with two spare copies. `git status` clean and all three
md5s verified after restore.

### NOT verified

- **Nothing ran against the production project.** The local stack only. In
  particular **it is not known whether `IDEA` is the real `classroom_courses.code`
  in production** -- section 5's notices are what will answer that, on the screen
  of whoever pastes the file, and until then every author may legitimately
  project null.
- **No UI calls the new shape.** That is deliberate and is the deploy-ordering
  rule: `foundry_list_apps` does not exist between its drop and its create, so
  the migration is applied by hand BEFORE any client naming `owner_class` ships.
  The gallery, the public detail view and the review queue are all still unbuilt.
- **`svelte-check` was not re-run for this bundle** and did not need to be: the
  change is SQL and a test file, and no `.svelte` or client module was touched.

