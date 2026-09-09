---
title: "The rubric level descriptions that did save, into a field the grading console does not show (`claude/rubric-descriptors-save-bug-4zg5hv`, no migration)"
date: 2026-09-09
branches: [claude/rubric-descriptors-save-bug-4zg5hv]
migrations: []
subsystems: ["Classroom", "Browser harness", "Testing"]
---

Prompt 0106. One component changed, one dev route added, one mount test added, two browser
route specs added. No migration, no database change, no SQL read or written.

**THE ONE LINE FOR MR. COSSO.** His edits saved. Every one of them is in the database and
on the assignment page a student reads. What he was looking at is the grading console,
which shows a separate one-line summary of each level rather than the full description, and
the rubric editor had no field for that line, so it kept saying the old thing. The editor
now has the field, seeded with what is stored, and warns on any level where the summary is
still the old one over a description that has changed.

## The base

Started on `claude/rubric-descriptors-save-bug-4zg5hv` at `ec017b9d`, which was
`origin/main` and `origin/integration` alike at session start. `git fetch --unshallow`
succeeded (the checkout was shallow). Git already carried
`Claude <noreply@anthropic.com>`, so no identity was set. The ledger entry
(`docs/prompt-ledger/entries/0106-rubric-level-descriptors-do-not-save.md`) went first, as
`3701a802`, pushed alone.

## The report, and what the tree said about it

> "on the unit 1 final report/presentation, the grading criteria updated fine when I edited
> them, but the point-value-level descriptions would not save the updates I made."

Filed 2026-09-08 18:39 UTC from `/classroom/<section>/item/<item>/grade`, build `24855e7`.

**THE SAVE WAS NEVER BROKEN, AND THE REPOSITORY ITSELF PROVES IT.** `materials/` is the
export the classroom GitHub export writes on every item save, and `24855e7f` -- the exact
build the report names -- IS the export commit of his own save, timestamped 2026-09-08
10:44:35 -0700, 55 minutes before the report. `git diff 558fff78 24855e7f --
materials/idea209h/unit-1-final-engineering-report-presentation-and-defense/rubric.json`
shows his new criterion text AND his new descriptors, stored, on every criterion he
touched. What did not move in that commit is every level's `short`.

**AND `short` IS THE LINE THE GRADING CONSOLE SHOWS.** `levelShort` resolves three sources
in order: the stored level's own `short`, then the matching SPEC level's, then the full
descriptor. `GradingConsole` renders that resolved line on the level button and hides the
descriptor behind a hover tip. So the visible text under each point value went on saying
"All sourced" while the description beneath it had become "Every component given a solid
logical selection basis". The criterion text is rendered straight from the row (`{c.criterion}`),
which is why THAT half updated. **The asymmetry in the report is the asymmetry between a
field rendered directly and a field rendered through a resolver whose first rung nothing
in the product could edit.**

The spec is the second half of why nothing self-corrected: he edited the RUBRIC, so
`classroom_assignment_specs` still holds the sourcing wording, and rung two of `levelShort`
carries the identical stale sentence. Both rungs agreed with each other and disagreed with
what he wrote.

## The audit, answered against the tree rather than the claims

**A1 -- the descriptor's path from textarea to database.** Both claims confirmed:
`RubricBuilder.svelte` binds `level.descriptor` inside `{#each row.levels ?? [] as level, li (li)}`,
and the save path maps `descriptor: l.descriptor?.trim() ?? ''`. **The `?? []` fallback
cannot produce a new array the binding writes into, twice over.** `startEdit` normalizes
every cloned row to `levels: r.levels ?? []` before `rows` is assigned, so by the time the
template runs the property is always an array and the fallback never fires; and even if it
did, the array it produces is EMPTY, so no binding is created at all. A fresh `[]` has no
item for `bind:value` to attach to.

**A2 -- `structuredClone($state.snapshot(from))` and the row replacements.** The result IS
deeply reactive: `rows` is `$state`, and Svelte 5 wraps an assigned value in a deep proxy,
so `bind:value` writes are ordinary reactive mutations `save()` reads back.
`rows[index] = { ...rows[index], levels: [...] }` in `addLevel`, `removeLevel` and `syncMax`
DOES replace the object a live binding points at -- and harmlessly, because the outer each
is keyed on `row.id`, which the replacement preserves, so Svelte updates the block's item
source to the new object and the inner each re-reads `levels` off it.

**Measured rather than reasoned, on the shipping component in `tests/dom/`:** seven drive
orders -- descriptor only, points then descriptor, descriptor then points, descriptor then
add level, descriptor then remove level, all three descriptors, label then descriptor --
and in every one the DOM and the `setRubric` payload agreed. So the suspected shape is real
Svelte behaviour and is not this defect.

**A3 -- the live `classroom_set_rubric`.** It is `0110_classroom_content_revisions.sql`
line 537, not `0086`'s or `0095`'s. It delegates to `_classroom_normalize_rubric` (0095),
which stores `'levels', v_crit->'levels'` VERBATIM. `_classroom_check_levels` reads
`descriptor` and only `descriptor`: there is no `description` fallback anywhere in the
chain. Nothing can silently refuse a descriptor -- an over-long one raises with a message,
an empty one only sets `incomplete`. **The SQL is not the defect and does not need one.**

**A4 -- was he editing the rubric or the spec, and does the console read the copy he
edited.** He edited the RUBRIC (the export diff is on `rubric.json`; `assignment.json` did
not move). The console DOES read that copy. **So A4 is the answer, in a sharper form than
the prompt's own wording: the save worked and the console shows the right row through the
wrong field.** The fix is therefore the editing surface, not the write path.

**A5 -- did any test assert a descriptor round trip.** **No.** `tests/classroom-leveled-rubrics.test.ts`
exercises the SQL. `tests/classroom-grading-console.test.ts` reads `RubricBuilder.svelte` as
TEXT and asserts the payload expression contains `short: l.short.trim()` -- which proves the
field is not DROPPED and says nothing about whether it can be EDITED. Nothing in the suite
mounted the builder at all. That is why this shipped, and it is what `tests/dom/rubric-descriptor-round-trip-mount.test.ts`
now closes.

## What changed

**`RubricBuilder.svelte` gained the field the console reads.** A `short` input per level,
between the label and the description, seeded from the store, with an `aria-label` naming
where it shows. The save payload expression is UNCHANGED -- `...(l.short?.trim() ? { short:
l.short.trim() } : {})` already carried whatever the field held, and leaving it byte-identical
keeps `tests/classroom-grading-console.test.ts`'s two source sweeps green without editing a
file this lane does not own. Clearing the field is a real answer: the key is then absent and
the console falls through.

**And the level SAYS SO when the pair disagrees.** `startEdit` snapshots each level's short
line and description into `seeded`; `shortIsStale(row, li)` is true when the short is still
the seeded one and the description is not, and renders one amber sentence under that level
naming both ways out. **It is dropped for a whole criterion the moment its ladder changes**
(`forgetSeed` on `addLevel`/`removeLevel`), because the entries are matched by position and
a note pinned to the wrong level is worse than no note.

`IDEA_RUBRIC_STANDARDS` 1.2 is what settles this shape rather than taste: "the short must
name the same countable thing the descriptor does", short carries the SELECTION and
descriptor carries the AUTHORITY. A surface that lets one of that pair be edited and not the
other cannot keep that invariant.

**The baseline's own key is `shortLine`, not `short`, deliberately.**
`tests/classroom-grading-console.test.ts` counts the field's own object key in this file as
the number of WRITE PATHS for it, which is one; a read-side baseline must not read as a
second emitter. The count is still 1.

## What is NOT fixed, and is not this lane's to fix

**A cleared short line falls back to the SPEC's copy of the stale sentence, not to the
description.** `levelShort`'s rung two pairs a spec level to a stored one by criterion id
and points and returns the spec's `short`, with no check that the two still describe the
same standard. On Mr. Cosso's item that hands back "All sourced" again. The correct fix is
to pin rung two to the spec's own descriptor -- if the stored descriptor has diverged from
the spec's, the spec's short is a summary of a different standard and must not stand in for
it. That lives in `levelShort`, in `src/lib/classroom/assignment-spec.ts`, which prompt 0106
does not own, so it was **reported and not touched**. It is asserted AS IT BEHAVES in
`tests/dom/rubric-descriptor-round-trip-mount.test.ts`, so the day somebody fixes it the
line reddens and names itself rather than going quiet.

In practice the residual is narrow: every rubric saved through the builder from now on
carries an explicit short line or an explicitly cleared one, and only the deliberate clear
reaches rung two.

**Two things noticed and left alone, per the prompt's scope rule.**
`/dev/grading-incomplete` and `/dev/grading-change` mount `.cr-root` without importing
`$lib/classroom/classroom.css`, which `tools/browser-verify/routes/README.md` names as the
worse-than-nothing case (a room in the markup painting nothing). Not this lane's files; the
new harness imports it and carries a presence row asserting the room mounted.
`src/lib/classroom/` still contains three comments naming `classroom_set_spec`, an object
that does not exist -- already recorded in `CLAUDE.md`, and not touched here.

## Verification

**`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`, over 20 files.** The documented
baseline exactly. Re-derived rather than trusted: `npx svelte-kit sync && npx svelte-check`
with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported first (a fresh cloud
checkout has no `.env`; without them the run reports the documented 13 phantom errors).
The fresh-`npm ci` rolldown/tsconfig failure is real in this container too and `npx
svelte-kit sync` is what clears it, exactly as `CLAUDE.md` says.

**The new test fails on the shipped code and passes on the fix, measured both ways.** With
`RubricBuilder.svelte` restored from `HEAD`: **4 of 4 failed**, the first assertion reading
`expected [] to have a length of 3` -- there was no short-line input to find. With the fix
back: **4 of 4 passed.** The file was restored from a `cp` copy, never
`git checkout --`, and md5-checked identical (`75d7b9d4...`) before re-running.

**The browser pass, on the new routes.** `npm run verify:browser -- --route grading-rubric
--verbose`: **4 route/width runs, 56 measurements, 0 outside threshold**, 375px and 1440px.
Selected values: the grader's level line 6.84:1 on its own button ground, the stale-short
warning 6.06:1, the editor rule copy 7.27:1, the student's description 7.27:1, 0px
horizontal overflow at both widths, builder chips 96.6x24 and editor controls 110.4x24
against the 24px instructor-console floor, and the `order-result` row reporting "stored
short" for all ten levels at rest.

**The checks were proven to bite on this surface**, not merely to pass:
`--break low-contrast` 10 outside, `--break invisible` 20, `--break tiny-taps` 4,
`--break overflow` 4 (1461px at 375, 396px at 1440). `--break blank-text` reports 0 and
correctly so: that preset empties `.gt-tm p, footer p`, which this route does not have.

**And the whole scenario was driven end to end in a real Chromium** (141.0.7390.37 at
`/opt/pw-browsers`), against the real dev server, on `/dev/grading-rubric`:

| step | measured |
| --- | --- |
| console level lines before | `All sourced`, `One source missing`, `Four or more unsourced` |
| editor opened | 10 short-line inputs, 10 description inputs, seeded from the store |
| description rewritten, short left alone | exactly 1 stale flag, on Level 1 of that criterion |
| short line rewritten too | 0 stale flags |
| saved | `setRubric i-unit1-final 3 criteria` |
| student view, that level | `Every component given a solid logical selection basis` |
| console level lines after | `Selection basis given` in place of `All sourced`, the other nine unchanged |

**What was NOT verified.** Nothing was run against the live Supabase project: no migration
was written, no RPC was called, and every SQL claim here is read off the committed migration
files. No signed-in production surface was opened. The `materials/` diff is evidence about
what the app exported, not a read of the live table. `prefers-reduced-motion: reduce` is not
exercised by the harness (it reports `no-preference`), and web fonts do not load there, so
every text measurement is in the fallback stack.

## The suite, and the full pass the README obliged

**`npm test` in full, on the merged tree: 328 files, 6529 tests, 0 failures.** The run
BEFORE the counts regions were regenerated came back **327 files and 6527 tests passing
with 2 failures**, both in `tests/derived-numbers.test.ts` and both naming the two new
route specs as unmeasured. After the regeneration below that file is 18 of 18 green and
the suite is clean. `origin/main` (`54bf64f2`, prompt 0105's blade export fix and its
ledger flip) merged into this branch with NO conflict -- it touches legacy HTML and docs
and shares no file with this lane, so the README counts block needed no hunk-by-hunk
resolution this time. `svelte-check` re-run after the merge: still 0 errors, 37 warnings.
`node tools/claude-md-check.mjs` and `npm run history:verify` both clean.

**That pair is why this bundle ran a full browser pass rather than only its own routes.**
Adding a route spec puts a file in the tree the README's `counts:measured` region has never
measured, and two of that file's cases assert the real README covers the real spec list
whenever the block claims zero findings. Both regions were regenerated:

- **static**, `npm run verify:counts`: 142 -> 144 specs, 66 -> 67 routes, 94 -> 95 `/dev`
  pages, 284 -> 288 route/width runs.
- **measured**, `npm run verify:browser -- --json` then `npm run verify:readme -- --from`:
  **288 route/width runs, 4396 measurements, 2 outside threshold, 694.2s**, on `3c7f7c7`.
  **The 2 are pre-existing and are not this bundle's**: `/dev/notebook` `tap-reach` on the
  notebook toolbar at both widths, which the row's own label records as under the floor on
  width by decision 12, with the owner. The previous measured region carried the same 2.
- `--selftest` on this tree: **70 controls (36 negative, 34 positive), 0 instrument
  failures**, which is the figure the regenerated region quotes.

The README's counts block was resolved region by region rather than whole-file, as the
prompt required.
