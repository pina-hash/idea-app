---
title: "Prompt 0138: the HTML-assignment write gate, widened in the one function that writes an answer (`claude/html-assignment-ledger-0138-9third`, migration 0197)"
date: 2026-09-10
branches: [claude/html-assignment-ledger-0138-9third]
migrations: ["0197"]
subsystems: ["Classroom", "HTML assignments", "Migrations", "Browser harness"]
---

Ledger 0134 shipped the whole ported-HTML-assignment subsystem and stopped short
of `main` with one thing unresolved: a student could open a ported worksheet and
could not save a word of it. This bundle is migration `0197`, which widens the
one function that writes an answer so it resolves a block against the stored
MANIFEST when the item is a ported document, and against the spec otherwise.

## The premise this corrects, and it was the prompt's own

The instruction 0134 worked under said answers land through the existing
`classroom_save_response` UNCHANGED, and that needing a migration would mean the
design had drifted. That was justified from a note saying answers key on
`(item_id, student_email, block_id)` with a foreign key to `classroom_items` and
never to the spec -- **true of the TABLE, false of the WRITE FUNCTION.** 0134
measured the real gate and this bundle confirmed all five claims independently
against `0086_classroom_assignment_engine.sql` and the applied catalog before
writing a line:

1. `classroom_save_response` selects from `classroom_assignment_specs` and
   raises `This assignment has no interactive spec.` when there is none.
2. It then resolves `p_block_id` INSIDE that spec, so a manifest's ids are
   unfindable even with a spec row present.
3. Its type gate is `v_type not in ('textField', 'table', 'checklist')`.
4. Manifest block types are `text`, `longText`, `checkbox`, `radio`, `image`,
   `table`. The overlap is one word, `table`.
5. `classroom_add_submission_file` carries the identical gate at its own spec
   lookup, so a block-bound photograph cannot land either -- and it is the
   EIGHT-argument form that holds the body, with 0086's seven-argument arity
   kept alive by 0133 as a thin wrapper that delegates to it.

It is also the only function in the schema that writes `classroom_responses`,
which is why the repair had to be a widening rather than an addition.

## What 0197 is

One branch in each of the two functions, at unchanged signatures, plus two
private helpers so the rule is written once:

- `_classroom_html_manifest(item)` answers the stored manifest when
  `classroom_items.assignment_schema_version` is 3, null when it is not, and
  RAISES for a stamped item with no document row.
- `_classroom_html_block(manifest, block_id)` resolves an id across the header
  AND every module's blocks, with every container type-guarded before it is
  walked.

**The discriminator is the item's own column, and that was the load-bearing
choice.** `htmlAssignmentMount` in `src/lib/classroom/html-assignment/mount.ts`
reads `assignment_schema_version` and nothing else to decide which surface a
reader gets; two spellings of "is this a ported document" is how a student gets
a worksheet while the write path disagrees with it. 0195 writes that column only
inside `classroom_set_html_assignment`, in the same statement as the document
row, which is why its own verification query pins `version_row_disagreements` at
0.

**The helper RAISES rather than returning null for a stamped item with no
document row**, and that is what lets it be a single-value function. Null has to
mean exactly one thing -- take the spec arm -- and folding the broken case into
it would send a ported item's answer down the spec path, where it earns a
sentence about a spec, shown to a student working inside a document, describing
a state neither they nor their teacher can act on. `mount.ts` calls that state
`unavailable` and refuses to fold it into either engine for the same reason.

**The manifest arm accepts all six block types**, and not out of generosity: the
frame bridge accepts an `idea:change` by FIELD and never by type, so all six can
legitimately produce a change message, and a gate narrower than the manifest's
own vocabulary would refuse an answer the document is allowed to send with no
surface able to say which types were safe.

**It has no approval gate and refuses `@declaration`.** The v1 spec format
carries `approvalGate` and `declarations`; `_classroom_check_html_manifest`
validates neither, so honouring one would let an unchecked field decide whether
a student may write. `@declaration` on a ported item raises the spec path's own
sentence, which is already the exact wording a spec with no declaration gives.

## The two shapes it deliberately is not

**Not a second write function.** `IDEA_CLASSROOM_REBUILD_PLAN.md` decision 12
refused a second SCORING path beside `classroom_grade_submission` and the FACTS
export that reads it. The same reasoning binds one step earlier: a private RPC
for "an HTML answer" is a second definition of what an answer IS, and every
reader downstream would be reading rows two functions disagree about.

**Not a companion `classroom_assignment_specs` row generated from the
manifest.** It is the cheap-looking fix and it is worse: 0134's Surface A found
that a converted item keeping an old spec row renders the SUPERSEDED one, which
is why the frame arm sits ahead of every spec arm in `mount.ts`. Writing a
shadow spec manufactures that bug on purpose, in a table two other RPCs already
write, for an item that has no spec.

## An item carrying both, which is the one behaviour that CHANGES

An item holding a manifest AND a spec is a legal database state, and 0197 makes
the MANIFEST decide. That is the same order every rendering surface already
takes, and it is asserted rather than left to be discovered: on such an item a
block only the SPEC carries is refused as unknown, and the positive control is
the same id on an item with the same spec and no manifest, where it saves. The
migration's report block COUNTS such items at apply time, because a working copy
cannot know whether production holds any (expected: none; nothing in the app
posts both).

## The proof that a spec-backed assignment is untouched

`tests/db/html-assignment-spec-path-unchanged.test.ts` follows CLAUDE.md's own
rule for a widened gate rather than arguing from the diff. One database, one
seeded class, and a corpus of **26 spec-path calls** covering every branch both
functions have -- the three types that take a typed response and the one that
does not, an instructions block with no id, an unknown id, the size cap, a null
value, a declaration present and absent, a gated module before and after
approval, a non-enrolled caller, an unpublished item, the submitted lock, both
`classroom_add_submission_file` arities, and the ORDER of the two earliest
refusals (an item with no spec raises about the spec BEFORE the value-size
check, which is precisely the pair the engine discriminator could have
reordered). The corpus runs against the chain through 0195, the mutable state is
reset, 0197 is applied to that same database, and the identical corpus runs
again. **26 cases compared, 0 differences, refusal text included.**

**Two ported calls are the positive control**, because a corpus that matched
case for case is also what a migration that failed to apply produces. Both are
refused before and accepted after; if the apply silently did nothing, they match
and the file goes red. UUIDs minted by a call are folded to `<uuid>` before
comparison -- nothing else is normalized, so a changed message, reason, `ok` or
field still differs.

## The walk, and which instrument proved which leg

| Leg | Instrument |
| --- | --- |
| import a document, store it, generate its rubric | real embedded Postgres, real migration chain, `tests/db/html-assignment-round-trip.test.ts` + `html-assignment-manifest.test.ts` + `html-assignment-rubric-db.test.ts` |
| save an answer, reload, get it back, ALL SIX block types | real embedded Postgres, `tests/db/html-assignment-round-trip.test.ts` |
| an image lands | real embedded Postgres, same file |
| the document renders and the bridge carries | the real `/hx/` route in real Chromium 141.0.7390.37, `npm run verify:browser` |
| a spec-backed item is untouched | real embedded Postgres, `tests/db/html-assignment-spec-path-unchanged.test.ts` |

The round trip writes eight answers plus a header block through the real RPC as
the real student role, adds a photograph, reads every value back through the
read path under RLS and puts it through the parent's own restore functions:
`studentName`, `setup`, `reading`, `toolChoice`, `errorSource`, `fix`,
`checkedOff`, `finish` and `passes` all came back, with the image as a URL and
never bytes. The manifest fixture grew a seventh module carrying a `radio` and a
`table` for exactly this: five of the six types had never been put to the write
path at all.

The browser leg is two route specs. `html-assignment.mjs` (the hostile document)
reports 5 probes refused, 0 reached, origin OPAQUE, CSP ENFORCED, and the bridge
completing a full round trip. `html-assignment-doc-worksheet.mjs` is NEW and is
the happy path: `/hx/worksheet` served by the real route into the real frame,
`ready=3`, a height the document measured and the parent applied, `sandbox` still
`allow-scripts` alone, origin still opaque, and a well-formed message naming the
worksheet's own field accepted while three forgeries are dropped. It
deliberately asserts no SAVE: nothing on that dev page holds a Supabase client,
and a browser row claiming a save would be claiming coverage of a function the
page cannot call.

## Mutation proof

Five mutants, each restored from a `cp` copy and md5-verified
(`574d116ee49373f986b4485cea6c8006` before and after every one). `git checkout --`
was not used anywhere: it restores from HEAD and would have discarded this
session's uncommitted work.

| Mutation | What reddened |
| --- | --- |
| manifest-arm type gate opened (`if false`) | the round trip's hand-written-manifest type assertion, alone |
| `_classroom_html_manifest` always null | the migration's OWN self-check refused to apply: "a stamped item with NO document row did not raise" |
| manifest arm removed from `classroom_save_response` only | 8 assertions across both files, including the spec-path file's positive control |
| spec-arm type gate opened to admit `imageZone` | the spec-path corpus, with 1 difference and the before/after printed |
| header dropped from `_classroom_html_block`'s walk | the migration's own self-check: "did not resolve the HEADER block" |

## The paste trap, checked two ways

A `$tag$` inside a `--` comment balances in Postgres and breaks the Supabase
editor's client-side splitter, which cost a full apply cycle on 0194. Grepped
two ways over `0197`: the comment portion of every line (`awk` on the text after
`--`) contains **zero** dollar-quote tokens, and all 14 tokens in the file are
on code lines in 7 balanced pairs. The verification query at the foot is
entirely inside `--` comments and contains no `$` at all.

## What was NOT verified

- **0197 IS NOT APPLIED.** This container cannot reach the production database:
  the agent proxy accepts a CONNECT to 5432 and carries no bytes. Every database
  claim here is against embedded Postgres with the real migration files applied
  unmodified, and none against the live project.
- No Docker daemon and no Supabase CLI in this container, so no PostgREST, no
  auth and no storage stack, and no signed-in surface was driven.
- The CLIENT answer path is still not wired: no route supplies an answers
  controller, so a schema-3 item still renders read-only. That is now a client
  fact rather than a database one, and it is deliberately outside this bundle's
  paths.
- The image restore path inside a document is still open, for the reason
  `answers.ts` already records: a restored picture's URL is a same-origin proxy
  URL and the served CSP is `img-src data: blob:`, so it must be rendered in
  parent chrome rather than by widening the policy.
- No production deploy, so no footer sha read back.

## What moved outside this bundle's own paths, and why

`tests/db/html-assignment-write-gate.test.ts` is DELETED. 0134 wrote it as a
probe to be deleted rather than inverted once the gate moved. `CLAUDE.md`'s
HTML-assignment rule named it and said the gate was shut, so that paragraph was
rewritten in place; `tools/claude-md-check.mjs` then reported the now-missing
path, so the file joins `ABSENT_BY_DESIGN` with its reason and
`tests/claude-md.test.ts`'s pinned length moves 13 -> 14. That pin exists so an
entry cannot be added silently, and this is it being added out loud.
