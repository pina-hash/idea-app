---
title: "A unit can be chosen while an assignment is being created (`0218`: `classroom_create_item` gains `p_unit_id`), and the presentation-deck box stops accepting anything at all -- its drop target now hands the picker's own `accept` in, `DECK_ACCEPT` read twice (`claude/new-session-nfgovx`, migration 0218)"
date: 2026-09-22
branches: [claude/new-session-nfgovx]
migrations: ["0218"]
subsystems: ["Classroom", "Composer", "Migrations", "Uploads"]
---

Three of Mr. Pina's reports, which are two defects. On 2026-09-10 and again on
2026-09-12 he asked to choose which unit folder an assignment lands in **as it is
created**, "instead of just defaulting to not organized". On 2026-09-11 he wrote that
"zip files should not be automatically assumed as presentation decks and not all zip
files are meant to be presentations".

## The unit half

**Moving an item into a unit after creation already worked, three ways** -- a per-item
row menu, a bulk move over a selection, and dragging a row onto a group header, all
three through `classroom_set_item_unit` (0111), with null unfiling. Nothing about that
was broken and nothing about it moved. What had no channel was CREATION, at every
layer: no control in `ContentComposer`, no field on `ItemInput`, no argument on
`createItem`, and no `p_unit_id` on `classroom_create_item`.

**`0218` adds the one parameter and reproduces 0176's twelve unchanged.** The old
arity is `drop function`ed at its exact argument types first, because `create or
replace` keys on the parameter list and would otherwise leave 0176's form standing as
a second overload -- and two overloads differing only by a defaulted trailing
parameter make PostgREST unable to resolve the call AT ALL. That would not have cost
the unit; it would have broken every item creation in the app.

**THE DROP COSTS NO DEPLOY ORDERING, AND THAT IS WORTH READING CAREFULLY, BECAUSE THE
SIGNATURE-TRAP RULE USUALLY SAYS THE OPPOSITE.** PostgREST resolves a call by the set
of NAMED KEYS it was sent, never by position. The deployed client sends eleven keys
and no `p_unit_id`, and the wide form accepts exactly that call because the new
parameter is defaulted -- so the running client keeps working the moment the file is
applied, and the migration and the deploy are independent events in either order.
Measured rather than argued: `tests/db/classroom-create-item-unit.test.ts` makes that
exact eleven-key call against the applied function and reads the item back. Only a
positional twelve-argument call could tell the difference, and no client makes one.

**A wrong unit RAISES here where 0111 returns `{ok:false, reason:'wrong_course'}`, and
the rule underneath is identical.** The RULE is 0111's: the unit's course must be
shared by at least one section the item is posted to, an `exists` and not an `all`.
The SHAPE differs because the situations are not the same one. `classroom_set_item_unit`
is called about an item that already exists and that stays exactly where it was, so
there is a consistent world to report back about; here there is no item, and this
function's return value is what carries the new item's id, so a second return shape
would be indistinguishable to its caller from a failure to create. Every other
user-correctable refusal on `classroom_create_item` is already a raise whose sentence
the composer renders verbatim -- `You must be signed in.`, the field checks, the
publish-target check -- so the unit refusal is one too. A structured return would have
been the second behaviour, not the raise.

**The multi-section question decided the parameter's shape, and the answer was already
in the schema.** `unit_id` is a column on the CANONICAL record, never on a posting, so
an item posted to three classes is filed once and all three read the same answer by
construction. A unit belongs to one course; an item posted across two courses is filed
in a unit of one of them, groups under it there, and reads as unfiled in the other,
which `classGroups` already does with a unit id the reader cannot see. So it is ONE
value and never one per section, and the create path reuses 0111's tolerance rather
than inventing a stricter one.

**The picker is scoped live and clears itself out loud.** `unitChoices` is the units
whose course is among the ones "Post to" currently names, ordered by the existing
`sortUnits` rather than a second comparator. Empty renders no control at all -- there
is nothing to file into, so there is nothing to choose -- which is the same
absence-removes-the-control rule the five staged extras follow. A teacher who picks
Unit 3 of Engineering I and then changes the class list to another course is doing an
ordinary thing, not misuse, so the selection is cleared AND a sentence says so; the
RPC still refuses independently, because that gate is the boundary and this is only
the courtesy that stops anyone reaching it. The unit also resets after a publish,
with `category` and for the same reason: a unit left selected would file the NEXT post
without anybody choosing that, which is the same class of defect in a different hat.

## The zip half

**The report's premise is inverted and the real defect is worse than the one
described.** Nothing sniffs a file and routes it to the deck; a zip becomes a deck
only when it lands in the box marked "Presentation deck". What the code did was assume
**anything** dropped on that box was a deck: `stagedDeckIssue(file)` was
`deckUploadSizeIssue(file.size)` and nothing else -- no extension check, no `File.type`
check -- so a PNG staged happily, reported "Deck ready", and failed server-side after
Post. The composer's own comment beside the ported-document picker had already named it
as "the measured shape not to repeat", four hundred lines from the code doing it.

**And it broke a rule the repo states in its own words.** `src/lib/file-drop.ts`: "A
surface whose picker carries an `accept` hands its own rule in as `accept`, so a drop
can never take what its picker would refuse." The box's `<input>` carried
`accept=".zip,application/zip,application/x-zip-compressed"` and the `use:dropTarget`
on the same element passed only `onfiles`, `onactive` and `disabled`. `PeoplePanel`
and `SpecImporter` both comply; this one did not. Every mechanism the fix needs
already existed -- `matchesAccept`, the `accept` callback, `onrejected` -- and was
simply not wired.

**THE GATE WENT IN `deck.ts`, NOT IN `composer-staging.ts`, AND THAT WAS A REAL
CHOICE.** What a deck is made of is a fact about the FEATURE: the size cap already
lives there and the server imports that constant rather than keeping a second copy of
the number. The item page has its own separate deck door (`DeckPanel.svelte`), so a
predicate kept in the composer's staging module would be a rule the other door could
not reach. `DECK_ACCEPT` is now ONE value read twice -- the `<input accept>` attribute
and the drop predicate -- which is the shape `SpecImporter` already uses, and
`stagedDeckIssue` delegates to `deckUploadIssue` rather than deciding.

**Type before size**, deliberately: a 10 MB photograph is both the wrong kind of file
and too big, and "remove large media from the deck and upload it again" is useless
advice about a photograph, because it describes work on a deck the person does not
have. `.zip` on this input is NOT the `accept` the repo forbids -- that rule is about
what a PERSON may hand in, and `tests/classroom-attachment-mime.test.ts` already
exempts this one input by its own testid for exactly that reason.

## What was measured

- `tests/db/classroom-create-item-unit.test.ts`, 18 assertions against real embedded
  Postgres with the real migration chain applied unmodified, booted SHORT of 0218 and
  then applying it. Pre-migration: one arity, twelve arguments, creation lands unfiled,
  filing afterwards works. Post: one arity at thirteen arguments with `p_unit_id` last;
  the deployed eleven-key call still resolves and creates; a valid unit is filed; a
  null unit is unfiled; a wrong-course unit raises and creates NOTHING; a nonexistent
  unit raises; two sections of one course accept; two COURSES accept and post twice;
  a unit matching neither course refuses; the create path and `classroom_set_item_unit`
  agree on the same pair; anon cannot execute the new arity and authenticated can; and
  the file re-applies cleanly. Every assertion runs at the SQL layer through
  `db.asUser`; none goes through `tests/db/postgrest-shim.ts`, which models `select`
  and `rpc` and not `insert`, and none of these claims is about a client select string.
- `tests/classroom-item-unit-route.test.ts`, 8 assertions driving the REAL route
  handler: no `p_unit_id` when no unit was picked, `''` treated as none, the parameter
  named when one was, an update never carrying one, the PGRST202 rung dropping the unit
  and reporting `unit_dropped`, the chain below it still narrowing independently, and
  -- the silent one -- a considered refusal never retried into a weaker call that would
  have succeeded and reported a clean post over an unfiled item.
- `tests/classroom-composer-staging.test.ts`, the deck half: a zip accepted (including
  typeless, Explorer's `application/x-zip-compressed`, and extension-only), a PNG
  refused with the sentence quoted, type answered before size, an oversize zip still
  refused on size, and a ten-case corpus where the drop predicate and the picker
  predicate must agree file for file with BOTH counts pinned (4 accepted, 6 refused).

**THE MUTATION PROOF: eight mutants, eight killed, and the instrument was wrong
twice before it was right.** M1 removing the deck drop target's `accept` (1 test),
M2 removing the deck type gate so the box is size-only as it was (3 tests), M3
removing the wrong-course refusal from 0218 (3 tests), M6 gating the route's degrade
rung on "the call errored" instead of PGRST202 alone (1 test), M7 naming `p_unit_id`
unconditionally (2 tests), M8 a composer that renders the picker and never sends the
choice (2 tests). M4 (`revoke ... from public` alone, `0201`'s shape) and M5 (not
dropping the old twelve-argument arity) are killed by the MIGRATION'S OWN APPLY-TIME
CHECK rather than by an assertion, which is the stronger kill and reads differently: 0
tests failed and the SUITE failed, because `beforeAll` could not apply the file.

**That difference is what the script got wrong twice, and it is a third variant of the
summary-line trap worth writing down.** The first version judged by the `Tests` line
alone and called M4 and M5 survivors. The second added a `Test Files ... failed |
... passed` pattern and still called them survivors -- because a run whose only
failure is a SUITE prints `Test Files  1 failed (1)` with **no `passed` group on that
line at all**, and `Tests  4 passed | 14 skipped` with **no `failed` group on that
one**, so a regex expecting `failed | passed` matches neither. Only matching
`Test Files\s+(\d+)\s+failed` independently, and treating `Failed Suites` as a kill,
gave the true verdict. M8 was a genuine survivor and stayed one until a sweep was
written for it: a composer that renders the picker, records the selection and silently
never sends it passed every other assertion in the bundle, which is the exact defect
this work exists to remove. All four mutated files were restored from an in-memory
copy, never from git, and md5-checked identical afterwards.

**Two of this bundle's own claims were wrong and the tree corrected them.** The first
draft asserted that 0176 had left `classroom_create_item` anon-executable, on the
grounds that a hosted project's default privileges write a direct `anon` grant and
`revoke ... from public` does not remove it. It had not: `create or replace` at an
UNCHANGED signature PRESERVES the existing ACL, so 0137's sweep survived 0176 intact.
That is exactly why 0218 cannot lean on the same mechanism -- a NEW signature is a
CREATE, so the thirteen-argument form does arrive with a fresh direct `anon` grant that
no earlier sweep can reach -- and the revoke names the roles per `0166`'s shape. The
second: `classroom_upsert_unit` asks `classroom_manages_section` about the course, so a
course with no sections has no teacher of record and its own creator cannot write a
unit into it; the test's third course needed a section before it could have a unit.

## For Mr. Pina

- **`supabase/migrations/0218_classroom_create_item_unit.sql` must be pasted into the
  Supabase SQL editor before this is merged to `main`.** No cloud session can apply it
  -- the egress proxy accepts a CONNECT to 5432 and then carries no bytes -- so
  `tools/apply-migration.mjs` was not run and could not have been. The file ends with a
  commented VERIFICATION QUERY that returns rows, one per thing examined, with a
  positive control; paste that after the migration, because the editor renders only the
  last statement's result set and a probe reporting through `raise notice` looks
  exactly like one that never ran. The file was checked both ways for the dollar-quote
  paste trap against a planted control: no `$` inside any `--` comment, and both
  dollar-quote tokens (`$fn$`, `$chk$`) in balanced pairs.
- **It is an ADDITIVE widening, so the order does not matter for correctness** -- the
  deployed client keeps working with the migration applied, and the new client degrades
  and says so without it. Applying it first is still the right order, because then
  nobody ever reads the "the unit was not set" sentence.
- **The picker offers this class's course's units only.** The layout load reads
  `loadCourseUnits(supabase, section.course_id)`, so composing inside Engineering I and
  cross-posting to an IDEA100 section offers Engineering I's units and nothing to file
  into for IDEA100. Filing from the class page still covers every course. Widening the
  offer means widening the layout LOAD, which is a different bundle's file, and is worth
  deciding on rather than assuming: it is a real limit, not an oversight.
- **ONE RULE THIS BUNDLE LEARNED IS NOT IN `CLAUDE.md`, AND WAS DELIBERATELY NOT
  ADDED THERE**, because the prompt's Owns line does not carry that file and it is the
  one file parallel lanes keep conflicting in. It belongs in the SIGNATURE TRAP
  section, beside the existing exception, and it is offered here for whoever owns the
  next edit to it: *dropping the old arity is available, with no deploy ordering at
  all, whenever the RUNNING client calls by NAMED KEYS and the added parameter is
  DEFAULTED -- because PostgREST resolves against the key set it was sent, so the old
  call binds to the new wide form and the pair never has to coexist.* The section
  currently reads as though a deployed caller always forces the keep-both-arities
  shape; it does not, and the discriminator is whether any caller passes arguments
  positionally. `0218` is the worked example.
- **What was deliberately NOT built**, because it is blocked on schema and was asked
  for separately: a zip of images becoming an image gallery, more than one zip per item,
  and a lightbox over the result. `classroom_decks.item_id` is `unique`, so it is one
  deck per item, and the unpacker refuses a zip with no top-level HTML entry page. The
  unique constraint was not touched.

## What is NOT verified

- **The migration's effect on real data.** It was exercised against seeded
  pre-migration data on embedded Postgres, which is the strongest thing available here;
  no session in this repository can reach the production database.
- **The preview render.** No cloud session can open a Vercel preview, so nothing here
  is a claim about how the picker looks on a real page at a real width. The 44px floor
  on the select is written as a `min-height`, not measured.
- **`npm run verify:browser` was not run for this bundle.** The unit picker and the
  deck box both live inside `ContentComposer` in create mode, which the `/dev` routes
  the harness covers do not mount with units in scope; adding a harness route for it
  was outside this bundle's Owns line.
- **Whether students are in class right now.** A push to `main` deploys
  `ideabosco.com`, and a session has a clock but not a timetable.
