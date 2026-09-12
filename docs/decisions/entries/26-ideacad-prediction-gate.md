# 26 How much of IdeaCAD should the prediction gate lock?

- Raised: 2026-09-11  By: ledger 0145
- Status: closed 2026-09-12 (prompt 0178, `claude/wizardly-dirac-i1ix59`).
  ANSWERED with an option this entry did not offer, and the recorded defect below
  is WITHDRAWN as deliberate.
- Decision: **LOCK NOTHING, AND KEEP THE PREDICTION.** Mr. Pina decided on
  2026-09-12 that the physics is always visible: rotational inertia and radius of
  gyration render from the first frame, in the Rules rail and in every compare
  column, with no prediction required and nothing hidden.

  **His reasoning, in his terms:** IDEA100 is a rotation class, there is no time
  to teach the mathematics behind rotational inertia, and visible numbers help
  students build maximally competitive designs.

  **What he kept is the prediction itself.** `ideacad_set_prediction` stays, the
  stored rationale stays, and students still say which concept they think spins
  longest and why. That is the pedagogy. What goes is only the LOCK on the
  numbers -- which makes this option C plus the prompt, a fourth answer the table
  below did not contain: C is written there as "deletes the feature", and it
  deletes the feature only if the question goes with the gate.
- Why it was blocked on him: it is a pedagogy call about what a student should
  have to commit to before the software tells them the answer, and only he owns
  that.
- What it unblocked: nothing was waiting on the decision. It cost the reversal
  described under "What was actually built" below.
- Context: `src/lib/ideacad/BladeEditor.svelte`; `src/lib/ideacad/blade/evaluate.ts`;
  `docs/prompt-ledger/entries/0145-ideacad-blade-editor.md`;
  `docs/prompt-ledger/entries/0178-*`.

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
- **WHAT THIS ENTRY RECORDED AS A MEASURED DEFECT IS NOT ONE, and the correction
  is Mr. Pina's own (2026-09-12).** It read: "`slice(0, 4)` drops the FIFTH rule,
  so **`engagement` is never rendered**. The default this entry records says
  engagement stays visible; it is not visible. That is a one-character fix." The
  measurement was right and the verdict was wrong. **He is not enforcing
  engagement this rotation**, so dropping it from the rail is deliberate: a rail
  printing PASS/FAIL on engagement would quote a limit nobody is holding students
  to, which is worse than not printing it. `evaluate` still returns the rule, so
  nothing is lost and widening the slice is one line on the day he enforces it.
  **That is a decision, not a one-character fix**, and the comment beside the
  slice in `BladeEditor.svelte` now says so, because the next reader measuring
  five rules against four rows would otherwise "fix" it back.

## What each option costs

| | Migration? | Applied production state? | Cost |
|---|---|---|---|
| **A. Lock comparative physics only** (shipped) | no | no | A student can iterate to a legal part before predicting, which is what makes the prediction about PHYSICS rather than about whether they read the rulebook. **RECOMMENDED.** Costs nothing: it is the current behaviour. |
| **B. Also lock rule compliance** | no | no | Client-only change in `BladeEditor.svelte`. A student then designs blind: they cannot tell a 6-inch part from a 9-inch one until after committing to a prediction, so the prediction measures rule recall and the first iteration is wasted on legality. |
| **C. Lock nothing** | no | no | Deletes the feature. The editor computes inertia continuously, so an ungated readout means the software answers "which spins longest" before the student has thought about it. **CHOSEN, with the question kept** -- see the Decision above. The cost written here is real and he accepted it: the software does answer first, and what the student still owes is their own prediction and the reason for it. |

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

## What was actually built (prompt 0178, 2026-09-12)

The gate mechanism is removed from `src/lib/ideacad/BladeEditor.svelte`: the
`revealed` flag, the `canReveal` predicate, the Reveal physics control and the
`{#if revealed}` around the compare columns' `<dl>`. Rotational inertia and
radius of gyration were added to the Rules rail so "always visible" is true of
the surface a student sees on mount and not only of a sheet they open. The
prediction form became a **Record prediction** control writing the same RPC, and
a recorded prediction still replaces the form rather than asking again.

**THIS REVERSED WORK FROM TWO BUNDLES, AND THAT IS DECIDED RATHER THAN LOST.**
Ledger 0160 fixed a gate that unlocked on the first keystroke into the rationale
field; ledger 0171 fixed the same gate opening on the press rather than on the
write, and a prediction already recorded failing to unlock it. Both were correct
against their prompts, and both prompts predated his answer. Every assertion
either bundle left behind was INVERTED rather than deleted -- in
`tests/dom/ideacad-editor-mount.test.ts`, `tests/dom/ideacad-ui-mount.test.ts`,
`tools/browser-verify/routes/ideacad-role-student-state-compare.mjs` and the
page-side probe the last of those calls -- so the removal reads as a decision on
the record instead of as the leak 0160 found coming back.
`docs/prompt-ledger/entries/0178-*` and this bundle's `docs/history/` entry carry
the list.
