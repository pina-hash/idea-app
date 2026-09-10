---
title: "Prompt 0127: the HTML assignment manifest, its validator, the store and migration 0195 (`claude/html-assignment-manifest-contract-gye4f7`)"
date: 2026-09-10
branches: [claude/html-assignment-manifest-contract-gye4f7]
migrations: ["0195"]
subsystems: ["Classroom", "HTML assignments", "Testing"]
---

One of four lanes building against a single normative contract for PORTED HTML
ASSIGNMENTS -- a whole document a student works inside, served from a second
origin under `sandbox="allow-scripts"` with no `allow-same-origin`. This lane
owns the MANIFEST (the thing that makes such a document gradeable), the store in
front of it, migration `0195`, and the import path in the composer. It creates
none of the bridge, the frame, the serving route, the fixtures or the rubric
translation; those are 0126, 0128 and 0129.

One migration, `0195`, claimed in the ledger BEFORE any work and **NOT APPLIED
from this container** -- the agent proxy carries no bytes to port 5432, so a run
from here hangs and then reports a connection that never existed.

**FOR MR. PINA, in order. Nothing below depends on reading further.**

1. **Apply** `supabase/migrations/0195_classroom_html_assignments.sql` in the
   SQL editor, after 0193. It re-applies safely (measured: applied twice in a
   row against a real Postgres with the real chain, second apply changes
   nothing). Then run the verification query at the foot of the file; the
   expected answer for every column is written beside it.
2. **`0194` IS ANOTHER LANE'S AND IS ACCOUNTED FOR.** For part of this session
   it read as a hole nothing claimed, and
   `tests/db/migration-0177-tombstone.test.ts` was red on it -- correctly, since
   this lane was allocated `0195` and numbers are allocated rather than derived,
   so renumbering was never available. `claude/gauntlet-verification-floor-oclq47`
   (ledger 0120) then pushed `0194_gauntlet_verification_floor.sql` and the hole
   closed on its own. **`0194` applies before `0195`.** Nothing was done about
   this here beyond re-reading `node tools/migration-claims.mjs`, which is the
   instrument, and the record is kept because the transient red is what a lane
   sitting above an unpushed sibling looks like.
3. **Nothing is student-visible yet, so `classroom-updates.json` gains no
   entry.** The import panel is admin-only, and until 0126's serving route
   exists no document is put in front of a class. The entry belongs to whichever
   bundle first makes a class see one.
4. **Two things this lane could not do inside its ownership** are under
   "What was left undone", with the exact change each needs.

---

## What this bundle is

**THE MANIFEST IS WHAT MAKES AN OPAQUE DOCUMENT GRADEABLE.** The document is not
parsed, not rewritten and not trusted; what it carries is a
`<script type="application/json" id="idea-manifest">` block declaring the
modules, the answer blocks and the rubric. The parent reads that AT IMPORT,
stores it, and from then on maps every `field` the frame reports to a `block_id`
through the stored copy -- never through anything the frame sends, because a
frame naming a `block_id` directly is a frame writing to an arbitrary row.

- `src/lib/classroom/html-assignment/manifest.ts` -- the contract's types and a
  validator that REFUSES a document rather than accepting part of one.
- `src/lib/classroom/html-assignment/store.ts` -- staging, the type and size
  refusals, and the write.
- `supabase/migrations/0195_classroom_html_assignments.sql` -- the table, the
  SQL boundary, the two gates, the revision target and the restore branch.
- The `schemaVersion` gate region of `src/lib/classroom/assignment-spec.ts`.
- `tools/validate-assignment-spec.py` -- now reads a manifest too.
- The HTML-import path in `src/lib/classroom/ContentComposer.svelte`.

## The load-bearing decisions

**THE LEVEL AND POINTS RULES ARE SHARED, NOT COPIED.** `criterionIssues`,
`criterionMax`, `MIN_LEVELS` and `MAX_LEVELS` are `assignment-spec.ts`'s own and
are CALLED. A manifest criterion is shaped into a `RubricCriterion` and handed to
the same function the spec importer and the rubric builder use, so a change to
what a leveled criterion means reaches all three in one commit. What lives in
`manifest.ts` is only what is genuinely this format's: the manifest script tag,
the field/`data-field` correspondence, and `short`.

**THE LOW-POINTS RULE IS REPORTED BEFORE THE DESCENT RULE, AND THE ORDER IS THE
WHOLE VALUE OF THE CHECK.** Level points are whole numbers and the bottom level
is 0, so `[1, 1, 0]` is the only three-level shape a 1-point criterion can take
-- which means the descent rule fires on it too. An author who reads "level 2
must be worth less than the level above it" first goes and rewrites levels that
were never the problem; the problem is that the criterion has no room. In SQL
the ordering is load-bearing rather than cosmetic, because a `raise` stops at the
first refusal: the top level's points are read and validated BEFORE the level
loop so the room check can precede the descent. **Measured:** with the check
ordered the other way the reported error was `Module "stack" criterion
"reasoning": Level 2 must be worth less than the level above it.`

**AN ANSWER IS AN ORDINARY `classroom_responses` ROW.** That is the whole reason
the feature is additive: grading, extra credit, bulk grading, the Grades tab and
the FACTS export read `(item_id, student_email, block_id)` and cannot tell an
HTML assignment from a spec-driven one. So a manifest block id is validated
against the same `^[A-Za-z0-9_-]{1,40}$` every authored id in 0086 is validated
against -- a looser pattern here is a row 0086's own CHECK would refuse,
discovered by a student at the moment they answer.

**`kind` STAYS THE THREE-VALUE CHECK.** An HTML assignment IS an assignment: it
has points, a due date, a rubric, a submission and a grade. A fourth kind would
fork every list, feed query, export and policy that names the set, to record a
fact about how the item RENDERS. `classroom_items.assignment_schema_version` is
that fact, in one nullable integer, written only by the setter and only in the
same transaction as the row it describes -- which is what makes it a fact rather
than a cache. The verification query's last column watches for drift and is
worth re-running later.

**THE SERVING HANDLE IS NOT THE ITEM ID.** `document_id` is its own uuid, stable
across every revision. The sandbox origin holds no session -- that absence is the
security model -- so whatever appears in that URL is readable by anyone who has
it, and an item id appears in the signed-in classroom URL a teacher projects on a
whiteboard. One extra column buys a handle that appears nowhere else. Stable
rather than per-revision so a re-upload does not change the frame src out from
under a student who is working in it.

**REVISIONS ARE 0110'S MACHINERY, NOT A CHAIN OF THIS BUNDLE'S OWN.** The
instructor edit path for a sandboxed document is RE-UPLOAD -- there is no
in-place editing of a document we do not parse and must not rewrite -- so "a new
revision" is the entire edit story, and the table that already records four kinds
of that records the fifth. `classroom_restore_revision` is recreated in full with
one branch added, and restoring goes through the ORDINARY setter, which is what
makes the consequences free rather than remembered: the head it displaces is
snapshotted, the manifest is validated again, and BOTH gates are re-checked
(measured: a non-admin restoring an admin-only upload is refused by the season
gate).

**TWO GATES, IN THAT ORDER.** `_classroom_manages_item` is the PERMANENT bar;
`is_admin()` is the SEASON bar, written as its own statement so lifting it is
deleting one `if`. Were the season gate the only one, deleting it would open the
write to every signed-in account. Measured in both directions: a student is
refused by the permanent bar and the message does not mention the season, and a
non-admin teacher of record is refused by the season bar with nothing stored.

**WHAT THE SQL BOUNDARY DOES NOT CHECK, AND WHY IT IS A BOUNDARY RATHER THAN AN
OMISSION.** The copy rules (a weekday, a British spelling) and the field
correspondence all require reading the HTML. A second HTML scanner written in
plpgsql is a parser that drifts from the one the importer runs, which is worse
than the gap -- a document would then pass one and fail the other with nothing
able to say which was right. What SQL refuses is everything that would corrupt a
ROW: ids, uniqueness, the level rules and the arithmetic. The db suite asserts
BOTH halves of that claim, including the positive half (SQL accepts the
document-shaped fixtures), so a later file that quietly added a plpgsql scanner
reddens rather than making this paragraph silently wrong.

**THE PYTHON TOOL IS A MIRROR, AND SOMETHING COMPARES IT.** `WEEKDAYS`, the
British alternation, the id pattern, the block types, the manifest element id and
the six-word `short` cap exist in both languages because python cannot import
TypeScript and a browser cannot run the tool.
`tests/html-assignment-manifest-parity.test.ts` reads the python SOURCE and
asserts every one of them still agrees, with a positive control under each so a
regex that stopped matching cannot report an empty list equal to a real one.
Inside the tool itself there is ONE copy of the rubric rules (`level_errors`),
called by the spec path and the manifest path alike.

## Amendment 1, and what it changed here

The amendment arrived mid-bundle, after ledger 0128 ported a real 933-line
document. Five of its six items land in 0126's files. Two CONFIRM this lane
rather than changing it, and one is a real addition:

- **Tables.** `type: 'table'` is one block whose value is a JSON string of rows;
  there is no per-cell `data-field`. The validator already refused a
  `[data-field]` the manifest does not declare, which is exactly the door
  `addMfgRow()`'s `mfg-06-p` went through. The python tool now additionally
  refuses a document that BUILDS a `data-field` at runtime, which is the
  generator rather than the markup and is the only form the browser check cannot
  see.
- **No half points.** Level points must be whole numbers, and the low-points rule
  already told an author to merge or repoint rather than level `1 / 0.5 / 0`.
- **HEADER BLOCKS, which are the addition.** `header?: HtmlBlock[]` holds
  identity fields (name, team, date) that carry no points and never reach the
  rubric. 0128 had to invent a 0-POINT MODULE to hold them, and a 0-point module
  renders in the grading console as something to score. A header block is a block
  in every other respect -- same id pattern, same manifest-wide uniqueness, same
  field correspondence -- because a student's name is an answer stored under a
  block id, and a renamed id loses it just as silently. It is walked FIRST so a
  collision names the header's block; `manifestBlocks` includes it, which is why
  that is a function rather than a `flatMap` at two call sites (a mapping that
  skipped the header would accept the identity fields from the frame and drop
  every one of them). A header block declaring `points` is refused: that is the
  0-point module problem in a smaller costume.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`** -- the baseline exactly,
  re-derived after `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*` values
  exported (without them a fresh checkout reports the documented 13 phantom
  errors).
- **The python tool's v1 output is BYTE-IDENTICAL on all 24 committed
  `assignment.json` exports**, before and after the refactor, both exiting 1.
  `diff` of the two runs is empty. Of the twelve IDEA100 exports, **4 fail and 8
  pass** -- the prompt said four of eleven, and four is still the failing count;
  the denominator is twelve in this tree.
- **The tool end to end on real documents:** a legal one PASSes; a bad sum FAILs
  naming it; a document whose fields drifted FAILs with all four problems at once
  (both directions of the field correspondence, a weekday and a British
  spelling); a bare manifest `.json` PASSes with a warning that the document half
  was not checked; a document reaching for `localStorage` PASSes with the shim
  warning.
- **80 tests across the three new files**, all passing.
- **The panel in a real browser** (Chromium 141.0.7390.37, a throwaway harness
  route since this lane owns no `/dev` path; see below). With a deliberately
  broken document staged through the real picker: **0px horizontal overflow at
  375 and at 1440**; panel box **343x451 at 375**, **1408x208 at 1440**; **3
  issues rendered**, first one `Module "stack" criterion "c" level 3 needs a
  short form...`; contrast **14.22:1** for the panel label, the issue heading and
  each issue item, **6.91:1** for the hint copy; **0 console errors**.
- **The three composer-mounting harnesses** (`/dev/composer-attach`,
  `/dev/composer-draft`, `/dev/classroom-upload`) at both widths: **134
  measurements, 0 outside threshold, 0 console errors**. Web fonts do not load in
  the harness, so text is measured in the fallback stack, and
  `prefers-reduced-motion` is `no-preference`, so that path is not exercised.

## Two instrument findings worth keeping

**A SCRIPTED PICKER INTERACTION IS SWALLOWED ON THE FIRST ATTEMPT AFTER
HYDRATION.** Measured on a real Chromium: `setInputFiles` fired a genuine
`change` that reached `document`, the input held 1 file afterwards -- and the
component's handler had not run (its own `input.value = ''` would have emptied
`files`). The DECK picker on the same page behaved identically. The second
attempt landed. This is `CLAUDE.md`'s "paint is not interactivity" with no marker
to wait on, so the step retries against its OWN effect and reports the attempt
count (**staged after 2 attempts**, both widths). A measurement taken on the
first attempt would have reported the AT-REST panel as the error state.

**A PYTHON `str.replace` THAT MATCHES NOTHING IS SILENT, AND SO IS THE
ASSERTION AFTER IT.** Two edits in this bundle appeared to apply and did not: a
reorder in `manifest.ts` whose target string did not match, and two SQL mutants
whose SQL quoting was wrong. Both times the follow-up assertion passed
VACUOUSLY -- `s.count("criterionIssues(asCriterion)") == 1` is true of the
ORIGINAL file too. The mutants read as "the check does not bite", which is the
tell `CLAUDE.md` names for a mutation suite that suddenly all passes. Every
scripted edit here now asserts `s.count(old) == 1` BEFORE writing, and the
mutation helper prints "mutation applied" or aborts.

## Mutation proof

Every file restored FROM A COPY and md5-verified, never with `git checkout --`.

| Mutant | Effect |
|---|---|
| `_classroom_check_html_manifest` returns immediately | **the migration itself refuses to apply** -- its own self-check raises `0195: the checker accepted a two-level criterion` and rolls back; the suite goes to 15 skipped |
| the `is_admin()` season gate removed | 2 tests fail (the non-admin refusal, and the restore that re-checks it) |
| the read policy becomes `using (true)` | 1 test fails (a stranger reads the document) |
| `validateHtmlManifest` returns the manifest regardless | 12+ tests fail across both files |
| block ids unique only within a module | 2 tests fail |
| the field correspondence checked one way only | 2 tests fail |
| a weekday dropped from the python list | the parity test fails |
| a British term dropped from the python list | the parity test fails |
| the manifest path stops calling `level_errors` | the parity test fails |

## What was left undone

**NO `/dev` HARNESS ROUTE SHIPPED, AND THAT IS AN OWNERSHIP BOUNDARY RATHER
THAN A SHRUG.** `CLAUDE.md` asks for a dev-guarded harness for interactive UI.
This lane's `Owns` list names no `/dev` path; the two candidate directories
belong to other lanes in flight (`src/routes/dev/composer-attach/**` is 0118's,
`src/routes/dev/html-assignment/fixtures/` is 0128's), and the contract says to
STOP and report rather than change it locally. The panel was measured through a
throwaway route which was DELETED before committing, so the numbers above are
real and the regression tool is missing. **The integration bundle should create
`src/routes/dev/html-import/` mounting `ContentComposer` with
`htmlAssignmentTransports={{ setHtmlAssignment: async () => ({ ok: true }) }}`
and `htmlAssignmentAdmin`, plus a route spec beside it** -- the panel renders
only when both are present, so the existing composer harnesses show nothing.

**THE STAGED DOCUMENT IS OR'd INTO `dirty` RATHER THAN ADDED TO
`ComposerDraft`.** `composerDraftSignature` builds its object key by key, so a
field added to that interface which it does not read would be silently ignored --
and `composer-staging.ts` is 0118's file. The document exists nowhere but the
browser's memory until the save writes it, so a guard that could not see it would
let somebody walk away from a whole uploaded assignment. **When the two are
folded together, this belongs in the signature as
`htmlAssignment: draft.htmlAssignment ? 1 : 0` beside `deck` and `spec`**, and
the clause in `ContentComposer` goes.

**NO `accept` ON THE PICKER, DELIBERATELY.** `tests/classroom-attachment-mime.test.ts`
sweeps for one and exempts the deck input BY ITS OWN TESTID, so a new picker
cannot inherit the exemption by accident. Joining that exemption means editing
another lane's test file; dropping `accept` costs one file-dialog convenience and
loses no safety, because `stagedHtmlIssue` refuses a non-HTML file the instant it
is picked, by extension AND by declared type. An `accept` filter is switchable
off in every OS dialog anyway, so a picker resting on one still needs the check --
and this one is the check.

**PRE-EXISTING RED, NOT THIS BUNDLE'S.** `tests/derived-numbers.test.ts` fails on
`origin/integration` already: the browser-verify README's measured region names
no measurement for **11 `classroom-*` route specs** added by prompt 0118 (commit
`c62593ae`), and the README's generated region was not regenerated with them.
Regenerating needs `npm run verify:browser` (about six minutes) and the file
belongs to 0118's `Owns`.

**NOT VERIFIED HERE:** the live Supabase project (this container cannot reach
it, so `0195` is unapplied and every claim about it comes from the real embedded
Postgres with the real chain), a signed-in session on a real classroom surface,
the sandbox origin end to end (0126 owns the serving route and the frame, and
neither exists yet), and `prefers-reduced-motion`.
