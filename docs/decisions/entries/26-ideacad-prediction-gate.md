# 26 How much of IdeaCAD should the prediction gate lock?

- Raised: 2026-09-11  By: ledger 0145
- Status: open
- Decision: blank.
- Default this assistant would pick: **lock comparative physics only** -- diameter, height,
  hex extension, mass and engagement stay visible, because a student needs them to create a
  legal concept at all. This is already what ships; the decision is whether to RATIFY it or
  widen the gate.
- Why it is blocked on him: it is a pedagogy call about what a student should have to
  commit to before the software tells them the answer, and only he owns that.
- What it unblocks: nothing is waiting; the shipped behaviour is the default. One measured
  defect below is a separate fix.
- Context: `src/lib/ideacad/BladeEditor.svelte`; `src/lib/ideacad/blade/evaluate.ts`;
  `docs/prompt-ledger/entries/0145-ideacad-blade-editor.md`.

## The question, in one sentence

Before a student writes a prediction, should the editor hide only the COMPARATIVE PHYSICS
(rotational inertia and radius of gyration), or also the RULE COMPLIANCE readouts that tell
them whether the part is even legal?

## What is true in the tree today (measured 2026-09-11)

- **`evaluate` returns five rules, in this order** (`blade/evaluate.ts` **line 8**):
  `diameter`, `height`, `hex-extension`, `mass`, `engagement`, each with a value, a limit
  string and a `pass` boolean. It also returns `comHeightIn`, `inertiaGcm2` and
  `radiusOfGyrationCm`.
- **The Rules rail is UNGATED.** `BladeEditor.svelte` **line 13** renders
  `result.rules.slice(0, 4)` with PASS/FAIL, plus centre of mass, in the right-hand
  `aside class="readouts"` -- outside the `{#if compare}` block entirely. A student sees
  compliance from the first frame.
- **Only two numbers are behind the gate.** **Line 16**: the compare section asks "Which of
  your concepts spins longest? Pick one and say why", the Reveal physics button is
  `disabled={!predicted || !prediction}`, and what it reveals is exactly
  `result.inertiaGcm2` and `result.radiusOfGyrationCm`.
- **So the default is already implemented**, and the shipped gate is the narrow one.
- **MEASURED DEFECT, reported and not fixed here:** `slice(0, 4)` drops the FIFTH rule, so
  **`engagement` is never rendered**. The default this entry records says engagement stays
  visible; it is not visible. That is a one-character fix in a file ledger 0160 owns
  (`src/lib/ideacad/**`), and this bundle owns no file under `src/`.

## What each option costs

| | Migration? | Applied production state? | Cost |
|---|---|---|---|
| **A. Lock comparative physics only** (shipped) | no | no | A student can iterate to a legal part before predicting, which is what makes the prediction about PHYSICS rather than about whether they read the rulebook. **RECOMMENDED.** Costs nothing: it is the current behaviour. |
| **B. Also lock rule compliance** | no | no | Client-only change in `BladeEditor.svelte`. A student then designs blind: they cannot tell a 6-inch part from a 9-inch one until after committing to a prediction, so the prediction measures rule recall and the first iteration is wasted on legality. |
| **C. Lock nothing** | no | no | Deletes the feature. The editor computes inertia continuously, so an ungated readout means the software answers "which spins longest" before the student has thought about it. |

**None of the three needs a migration and none touches applied production state.** The
gate is entirely client-side: `ideacad_set_prediction` (`0201` line 32) records the
prediction but gates no read, and `ideacad_open_document` returns the prediction row to its
owner and their teacher regardless.

## Why A

The rule readouts are the CONSTRAINTS and the physics is the ANSWER. Hiding the constraints
does not make a student think harder about inertia; it makes them guess at dimensions, and
the first thing they learn is that the tool was withholding something they needed. Hiding
the answer is the whole pedagogy: commit to which concept spins longest, say why, then look.

What would change my mind is Mr. Pina saying the rulebook itself is the thing students
should be internalising this module, in which case B is coherent -- but it is then a
different exercise, and the prediction prompt ("Which of your concepts spins longest?")
would have to change with it.

## If nobody decides

A ships, which is the recommended answer, so nothing is lost by silence -- **except the
`slice(0, 4)` defect above**, which silently contradicts the very default this entry
records and will not fix itself.
