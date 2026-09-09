---
title: "`levelShort` rung two pairs on the descriptor rather than the points, closing the tail of the 2026-09-08 rubric report; the across-sections grading load's work read joins its first wave (`claude/rubric-descriptor-save-bug-rtbqud`, no migration)"
date: 2026-09-09
branches: [claude/rubric-descriptor-save-bug-rtbqud, claude/rubric-descriptors-save-bug-4zg5hv]
migrations: []
subsystems: ["Classroom", "Grading"]
---

Two unrelated tails, both left deliberately by earlier bundles that could not
reach the file. This branch resumes from 0106's
(`claude/rubric-descriptors-save-bug-4zg5hv`, sha `1fcbe84a`) rather than from
`main`, because the test it has to move exists only there. `origin/main`
(54bf64f2) was already an ancestor of that tip, so the merge this bundle owes
`main` was a no-op and is recorded as one.

### ONE. What rung two was actually asserting, and why points were the wrong key

`levelShort` resolves a level's one-line form in three rungs: the stored
level's own `short`, then the matching SPEC level, then the full descriptor.
0106 fixed the write half of the reported defect -- `RubricBuilder` had no input
for `short`, so an instructor edited `descriptor`, saved it correctly, and read
an unchanged sentence on the grading console. What 0106 could not reach was the
READ, and it said so in its own test rather than in prose:

```
// RESIDUAL, AND NOT THIS LANE'S TO CLOSE: with the stored short gone,
// `levelShort` rung two hands back the SPEC's short, which is the same
// stale sentence. ... Asserted as it BEHAVES, so the day it is fixed this
// line reddens and names itself.
expect(levelShort(top, 'm1-c2', SPEC)).toBe('All sourced');
expect(levelShort(top, 'm1-c2', null)).toBe(NEW_DESCRIPTOR);
```

It reddened, and it named itself. What replaced it:

```
expect(levelShort(top, 'm1-c2', SPEC)).toBe(NEW_DESCRIPTOR);
expect(levelShort(top, 'm1-c2', SPEC)).not.toBe('All sourced');
expect(levelShort(top, 'm1-c2', null)).toBe(NEW_DESCRIPTOR);
```

The third line is unchanged and is now the weakest of the three: the point is
that the answer no longer depends on whether a spec happens to be attached.

**THE DECISION IS ABOUT WHAT PAIRS TWO LEVELS.** Rung two matched by criterion
id and then by `Number(l.points) === Number(level.points)`. Points are a
WEIGHT. They say nothing at all about whether the two levels still describe the
same standard, which is the only question that licenses handing back a sentence
kept somewhere else. It pairs on the DESCRIPTOR now, within the criterion,
requiring a unique non-empty match.

The argument is that a `short` is a summary OF a descriptor. Pairing the
summary to the text it summarises is the only pairing that cannot hand back a
summary of something else -- every other key (points, position, label) can
survive the sentence being rewritten, which is exactly the failure. Three
consequences, and the third is the one worth stating:

* An untouched rubric generated from the spec still resolves through the rung,
  because `rubricFromSpec` copies each descriptor verbatim. That is the case
  the rung exists for and it is unaffected.
* A level whose POINTS moved but whose wording did not now resolves, which the
  old rule got wrong: the standard did not move, only its weight.
* A level with NO descriptor at all has nothing to pair on and takes rung
  three, which is empty; the console renders points and label and no line
  (`{#if short}` in `GradingConsole.svelte`). **This is deliberate and it is
  the reason no carve-out was made for it.** Clearing a descriptor is an edit
  like any other, so a rule that let a descriptor-less level reach the spec's
  short would have left exactly one path on which an instructor edits a
  description and reads an unchanged sentence -- narrower than the reported
  one, and the same defect. The constraint was that no such path survive.

**WHY THE RUNG WAS NOT DELETED, which was the other option on the table.** The
editor writes `short` directly since 0106, so the rung is no longer the only
way a one-liner can be on screen. But there is NO BACKFILL and there never has
been: every rubric generated before 0106 taught `rubricFromSpec` to carry the
field is stored without it. Deleting rung two would have taken all of them from
a one-line grading control to a wall of descriptor text overnight, on the exact
surface 0106 had just repaired, with nothing anywhere reporting it. What
changed instead is the rung's LICENCE: it may answer only where nothing has
been edited, which is the only condition under which a copy of a sentence kept
somewhere else is safe to show.

The cost, stated because it is real: a one-word typo fix in a descriptor now
drops that level to its full descriptor until somebody types a short line. That
is the safe direction to be wrong in -- rung three is long, never stale -- and
the editor 0106 shipped is where the short line gets typed.

### The positive control, and the fixture that was wrong the first time

Two assertions that a rewritten descriptor no longer reaches the spec would
both pass if rung two had simply stopped answering. So the third test carries a
control: an untouched level with its short cleared, which must still resolve
through the spec.

The first draft of that control was hand-typed from `STORED` and FAILED --
correctly. `STORED`'s descriptors in that fixture are deliberately not the
spec's (the fixture is the reported situation, in which the instructor had
already been editing), so a hand-built "untouched" level was nothing of the
sort. It is now built by the real producer: `rubricFromSpec(SPEC)`, with
`short` dropped, which is precisely what a pre-0106 stored rubric is. This is
`CLAUDE.md`'s "a fixture must be something its real producer can emit" arriving
as a red test rather than as a review comment.

### The assertion outside this lane's ownership, changed on purpose

`tests/classroom-grading-console.test.ts` is not in 0113's owned set, and one
assertion in it necessarily reddens under the fix:

```
// Paired on POINTS inside the criterion, so a reordered or trimmed
// builder rubric still lines up.
expect(levelShort({ points: 0, label: 'x' }, 'm1-views', SPEC)).toBe('Nothing drawn');
```

Leaving it red was not an option -- a standing failure blocks Integrate and
hides every real one behind it -- so it was GENERALIZED rather than deleted,
per `CLAUDE.md`'s rule for an assertion a legitimate change breaks. What it was
defending (a reordered or trimmed builder rubric still lines up) is preserved
and strengthened; the level it used was a shape neither producer can emit.

```
expect(levelShort({ points: 2, label: 'x', descriptor: 'No views drawn, or not attempted.' }, 'm1-views', SPEC)).toBe('Nothing drawn');
expect(levelShort({ points: 0, label: 'Absent', descriptor: 'Nothing handed in at all.' }, 'm1-views', SPEC)).toBe('Nothing handed in at all.');
expect(levelShort({ points: 0, label: 'x' }, 'm1-views', SPEC)).toBe('');
```

The first of those fails on the pre-fix code (points 2 matched no spec level),
so the file now carries a test of the new rule where the old one was. The third
keeps the descriptor-less level as a stated BOUNDARY rather than as a case
anybody meets.

### TWO. One serialized round trip on the grading surface

`loadGradingAcrossSections` awaited its roster RPC and the item's postings
together, and then awaited `loadItemWork` on the next line -- which itself fans
out into four more reads. Independence was confirmed by reading the function
rather than by trusting the finding: `loadItemWork(supabase, itemId)` takes the
item id and nothing else, and neither the roster, the postings nor the
intersection between them is in scope for it. So the second wave was waiting on
a first wave it never reads. Six reads in one wave now.

Two behaviours change on failure paths and neither is a regression: the work
read is now issued even when the roster or the postings read fails, and a throw
from inside it would surface instead of the roster's structured refusal. It
cannot throw -- `selectSubmissions` and `selectSubmissionFiles` are ladders that
resolve `{data, error}` rather than rejecting -- and the wasted read on a
failure path is bounded by RLS exactly as it is on the success path.

**IT NEEDED A TEST BECAUSE IT IS INVISIBLE IN EVERY OTHER INSTRUMENT.** The
payload is byte-identical either way, nothing errors, no count moves, and the
only symptom is that a console takes longer to appear on a school connection.
Hoisting the `const` back out of the array later would restore the defect with
nothing to notice.

`tests/classroom-grading-across-sections-parallel.test.ts` drives the REAL
exported transport against a recording client that GATES the roster RPC: the
roster cannot resolve until the test releases it, so "was the work read issued"
has one answer and no clock is involved. The issue point recorded is `then`,
because a PostgREST builder sends nothing until it is awaited. The postings
read is the positive control -- it was always in the first wave, so its
presence proves the log is recording rather than that nothing ran.

### Measured

* **`svelte-check`: 0 errors, 37 warnings**, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`. Unchanged from the
  branch this resumed from. Run with `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_ANON_KEY` exported to placeholders before `svelte-kit sync`,
  per `CLAUDE.md`'s phantom-error rule.
* **Full suite: 329 files, 6530 tests, all passing**, against 0106's 328 / 6529.
  The single added file is the parallel-load test; the two edited test files
  gained assertions inside existing cases rather than new cases, which is why
  the test count moves by exactly one.
* **Both changes fail on the pre-fix code, proven by reverting each and
  re-running.** Reverting rung two alone reddens
  `clearing the short line falls the console back to the description` and
  `falls back to the SPEC for a row stored before the field existed`, two files,
  two projects. Reverting the `loadItemWork` move alone reddens
  `sends the work reads while the roster RPC is still open` with
  `expected [ Array(2) ] to include 'classroom_submissions'` -- the array being
  the roster RPC and the postings read, which is the serialized first wave
  exactly. Both source files were restored from a scratch COPY (never
  `git checkout --`, per `CLAUDE.md`) and md5-checked identical afterwards, and
  the suite re-run green.

### Not verified

* **No browser pass was run.** `npm run verify:browser` covers
  `/dev/grading-rubric` and `/dev/grading-rubric?state=edited`, and neither
  spec asserts a rung-two outcome -- the resting spec pins all ten levels to
  `stored short` (rung one) and the edited spec pins the stale flag, so nothing
  in either would move. The harness was not run to confirm that reading of it.
* **Nothing was run against the live Supabase project.** No migration, no RPC,
  no signed-in session. The parallel-load test's client is a recorder, not a
  database; what it proves is ordering, and it deliberately proves nothing
  about what PostgREST would answer.
* **No student-facing change, checked rather than assumed.** `RubricView.svelte`
  -- the student's own view -- contains no reference to `short` or `levelShort`
  and renders descriptors; `grading-export.ts`'s only non-harness consumer is
  `GradingConsole.svelte`. So `classroom-updates.json` gets no entry: the
  standing directive asks for one when a change moves what a class SEES, and
  this moves what an instructor grades on.

### Left standing, and not this lane's to touch

Two sentences in `src/routes/dev/grading-rubric/**` (0106's files, and outside
0113's ownership) now describe behaviour that no longer exists, both saying the
residual is open:

* `src/routes/dev/grading-rubric/+page.ts`, the header: "clear a short line here
  and the console falls back to the SPEC's copy of it, not to the description."
* `src/routes/dev/grading-rubric/+page.svelte`, the on-screen lede: "a level
  whose short line is cleared falls to the SPEC's copy of the old line, not to
  the description, which is the residual prompt 0106 could not close."

The harness itself still works and its oracle stays correct -- it derives the
rung from the RESULT rather than duplicating the resolution -- so what is stale
is the copy, not the instrument. A harness whose own page tells a reader the
opposite of what it now demonstrates is worth one line from whoever owns those
files next.
