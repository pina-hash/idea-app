---
title: "The grading-category datalist gets the read it never had (`0142`)"
date: 2026-08-28
branches: [claude/classroom-course-categories-3r5j5z]
migrations: ["0142"]
subsystems: ["IDEA Classroom"]
---

An earlier bundle shipped the whole suggestion surface for
`classroom_items.category` -- the `datalist`, the `list` attribute, the pure
ranking function `courseCategorySuggestions`, its tests, and the optional
`loadCategorySuggestions` slot on `ClassroomComposerTransports` -- and never
implemented the transport. The optionality did exactly what it was designed to
do: the absence removed the datalist and left a working free-text input, so
nothing was broken and nothing reported anything. The field on production has
been a plain text box since the day the feature "shipped".

This bundle writes the read.

### The premise, confirmed and corrected in one place

The task arrived with a previous session's finding as its premise: a plain
client select cannot be the transport, because `classroom_items` is read
through `classroom_can_read_item`, which gates PER SECTION, so a select
filtered on `course_id` is not refused and does not error -- RLS silently
narrows it to the caller's own sections and hands the short list back looking
like a success. `ContentComposer`'s own comment says the scope is the COURSE
deliberately ("a teacher's vocabulary follows the course rather than one block
of it"), so the narrowing delivers the opposite of the intent while wearing the
appearance of having worked.

**All of that is true and is now measured rather than reasoned about.**
`describe('the premise')` in `tests/classroom-course-categories.test.ts` runs
the narrowed select as the caller, through RLS, and shows it returning a
non-empty answer that is missing the other teacher's half of the course
vocabulary, with no error anywhere. If RLS on `classroom_items` ever widens to
the course, that block reddens and this whole function becomes deletable, which
is the finding a future session would want to be handed.

**One clause of the premise was wrong, and correcting it improved the fix.**
The premise said there is no course-level "manages any section of this course"
predicate anywhere. There is: `_classroom_manages_course(uuid)`, added by 0111
for the units feature, is exactly "an admin, or the teacher of record of at
least one section of this course". What is true is the CONSEQUENCE the premise
drew -- it is internal (revoked from every role by 0111, and swept again by
0137), it is named by no policy on `classroom_items` or `classroom_postings`,
and no client can call it, so it does nothing to stop the silent narrowing and
a browser cannot even use it to scope its own select correctly.

The correction matters because it changes what the right fix is. Writing a
fresh gate inside 0142 would have been a second statement of the manage rule,
which this repo's conventions specifically forbid and which is the thing that
quietly stops matching. 0142 calls the 0111 predicate instead: no new
authority is created, and if that rule ever widens, this widens with it.
`tests/classroom-course-categories.test.ts` pins that the predicate stays
unreachable from both client roles, so the argument for needing a definer
function at all cannot silently expire.

### The function

`classroom_course_categories(p_course_ids uuid[])`, `SECURITY DEFINER`,
`stable`, `set search_path = ''`, revoked from `public, anon, authenticated,
service_role` and granted back to `authenticated` alone.

**It projects one column.** Not a title, not a body, not an author, not an item
id, not a section. That narrowness is not tidiness, it is the entire safety
argument for granting a read that bypasses RLS to every authenticated caller,
and it is written on the object itself with `comment on function` rather than
only in the file header -- because the header is not where somebody stands when
they add a second column, and a second column would inherit a grant nobody
re-examined.

**Two existing definer functions were read first and both are followed.**
`classroom_section_roster` (0138) supplied the shape: the gate lives in the
query rather than in a `raise`, so a row the caller has no claim on is simply
absent; and the revoke names all four roles rather than only `public`, because
this project's default privileges write direct grants into every new function's
`proacl` at creation and `from public` alone would leave it callable by `anon`.
`classroom_view_as_students` (0083) supplied the return shape -- `returns
jsonb`, `coalesce(..., '[]'::jsonb)`. That was a deliberate choice over
`returns table`: a scalar jsonb is what the test shim models exactly, so the
transport test drives the same shape production does rather than a shape only
the shim produces.

**Access is per course, and an unmanaged id is skipped rather than raised on.**
The parameter is an array because the composer's scope is every course its
currently-checked sections belong to, and one id the caller has no claim on
must not cost them the other three. A null element, an empty array and a null
array all answer `[]`.

**One row per ITEM, not per posting.** The client ranks by use count, so an
item posted to three blocks of one course has to contribute its category once;
counted per posting, a teacher who posts widely would outrank a teacher who
posts often, for a reason no reader of the list could ever guess. Hence an
`exists` rather than a join that multiplies.

**It does not rank, de-duplicate or normalize, and there is no `distinct` and
no `order by` on the value.** Those live in `courseCategorySuggestions` and are
already tested there; the repeats this returns ARE the ranking signal. The only
ordering is a deterministic one (oldest item, `id` breaking the tie) so two
calls handed the same course produce the same first-seen order and the offered
list does not reshuffle between two renders. That is determinism, not ranking.

**Drafts count.** An unpublished item's category is still a category its author
chose. Recorded as a decision rather than left as a side effect of widening
past RLS: what crosses is the word, never the draft.

### The transport, and why neither route needed editing

`loadCategorySuggestions` is implemented once, in `createClassroomTransports`.
Both routes that assemble a composer -- the class layout (create) and the item
page (edit, through `ItemDetail`) -- already build from that one factory and
already pass the object through whole, so both were covered by construction and
neither file was touched. That is the outcome the module's own header asks for
("ONE module, not one per route"); a per-route implementation would have been
two failure semantics for one call.

**It has no `PGRST202` rung, deliberately.** There is no narrower read worth
degrading to: the select this replaces is the wrong answer, not a lesser one.
Every failure maps to no suggestions, which is the whole failure story rather
than an unhandled case, because the composer already maps a non-ok result to an
empty list and that removes the datalist and leaves the plain input. So the
deploy ordering is free in both directions: this branch can merge before 0142
is pasted in, and a deployment in that gap behaves exactly as production does
today.

### What was measured

- **`svelte-check` 0 errors / 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`,** re-derived after
  `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported.
  Unchanged from the baseline in both numbers and mix.
- **Full suite before: 135 files, 3110 tests, all passing. After: 136 files,
  3134 tests, all passing.** The 24 new tests are the one new file.
- **Mutation proof, both directions, each with its controls.** Opening the gate
  permissively (`where public._classroom_manages_course(c.course_id)` to `where
  true`) reddens exactly 5 assertions -- the foreign-course refusal, the mixed
  array, the mirror case, the enrolled-student refusal, and the transport-level
  refusal -- and leaves the 18 positive-direction assertions green, which is the
  correct signature for a widening. Narrowing it instead (adding
  `classroom_manages_section(s.id)` to the inner `exists`, which is the original
  defect reproduced inside the definer function) reddens exactly the 3
  positive-direction assertions. So neither direction is vacuous. The migration
  was restored byte-identically after each (md5 `55021467cee9bf633b2891e100ed72a6`)
  and re-verified green.
- **The migration re-applies.** A test pastes the file into the same database a
  second time and asserts one `pg_proc` row, an answering function and `anon`
  still false afterwards; the file's own self-check raises if the ACL is wrong,
  so the ACL is read back rather than inferred from the revoke having run.
- **Browser, in Chromium 141.0.7390.37**, driving the REAL `ContentComposer`
  (never a copy of its markup) with a transport shaped like the shipped one.
  The `list` attribute resolves to a real `<datalist>` whose id matches
  (`input.list` non-null, `resolvedIdMatches` true); it carries **4 options** in
  exactly the order `courseCategorySuggestions` produces from the raw list
  (`Unit Labs, Documentation, Design Review, Shared Thing`), compared against
  the function's own output rather than against a list retyped in the driver;
  picking option 0 puts `Unit Labs` in the field and it survives the re-render;
  a category not on the list types in and stays (`Brand New Category`) with the
  input still `type="text"`, not `required`, and the datalist still present, so
  suggestions never became a constraint. At 375px `scrollWidth` 375 =
  `clientWidth` 375, no horizontal overflow. Tap target measured at the
  `<label>`, which is what a finger hits: **58.8px**, clearing the 44px floor,
  hit-tested down its span (the input's own box is 35.4px and is not the
  target). One console error, the harness's blocked `fonts.googleapis.com`
  request, so text was measured in the fallback stack.
- **`npm run verify:browser`: 24 route/width runs, 174 measurements, 8 outside
  threshold** -- identical counts with this branch's `transports.ts` and with
  `main`'s, run both ways. All 8 are pre-existing tap-target findings on dev
  harness controls, the rubric builder and the attach/detach controls; none is
  in anything this bundle touched.

### What is explicitly NOT verified

- **The migration has NOT been applied.** There is no live database in reach
  from this session and the local `.env` points at a placeholder project. 0142
  is authored and tested against embedded Postgres running the real chain; it
  is pasted into the Supabase SQL editor by hand after this merges.
- **No signed-in surface was driven in a browser.** The real
  `/classroom/[sectionId]` composer needs a Bosco Tech Google session, and
  no local Supabase stack exists in this container, so `/dev/login` was not
  available either. The component was driven through a temporary harness page
  that mounted the real `ContentComposer`; that page was deleted before
  committing, because this session was scoped out of `src/routes/dev/`, where a
  permanent harness for it belongs.
- **The permanent dev harness still cannot exercise this.**
  `src/routes/dev/classroom/+page.svelte` mounts the composer but supplies no
  `loadCategorySuggestions`, so `npm run verify:browser` does not and cannot
  cover the datalist. Adding it there is a one-line change in a file another
  live session owns.

### Deferred

- **A dev-harness transport for the datalist**, per the note above, so the
  browser check becomes a standing regression tool rather than a one-off drive.
- **No `classroom-updates.json` entry.** The datalist is an instructor-only
  affordance inside the composer; nothing a class sees changes, and the
  standing directive asks for an entry only when it does.
