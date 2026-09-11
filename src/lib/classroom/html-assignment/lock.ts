/**
 * WHAT "CLOSED" MEANS, WRITTEN DOWN ONCE.
 *
 * An instructor closes an assignment at the end of a unit so no more work lands
 * after it has been graded (Mr. Pina, 2026-09-10). The mechanism is the state
 * `classroom_submissions` has carried since 0086: `submitted` is the one value
 * `classroom_save_response` and `classroom_add_submission_file` refuse on, so
 * closing IS setting it, and `0198_classroom_close_assignment.sql` is the only
 * thing that lets an instructor do so.
 *
 * THE DISCRIMINATOR IS `submitted_at`, AND IT IS AN EXISTING COLUMN RATHER THAN
 * A NEW ONE. Two different events put a row in `submitted`:
 *
 *   - a STUDENT turning their own work in, through
 *     `classroom_submit_assignment`, which stamps `submitted_at` in the same
 *     statement and always has;
 *   - an INSTRUCTOR closing the assignment, through 0198, which deliberately
 *     leaves `submitted_at` NULL.
 *
 * So `state = 'submitted' and submitted_at is null` is the instructor's close
 * and nothing else. Measured before it was relied on: across the whole applied
 * chain, `classroom_submit_assignment` is the ONLY function that writes
 * `state = 'submitted'`, and it writes `submitted_at` beside it every time --
 * which makes the pair impossible for any row stored before 0198, and makes
 * 0198's own guard on `classroom_unsubmit_assignment` inert over every one of
 * them. 0198 counts that at apply time rather than asserting it here.
 *
 * WHY IT MATTERS RATHER THAN BEING A DETAIL. Without the discriminator a
 * student can undo an instructor's close in one call:
 * `classroom_unsubmit_assignment` refuses only a row that has already been
 * graded, so a close placed on ungraded work -- which is most of what an
 * end-of-unit close is for -- comes straight back off. Measured; the numbers
 * are in this bundle's history entry.
 *
 * THE TWO SENTENCES BELOW ARE THE WHOLE OF WHAT A PERSON READS. A student who
 * finds their work frozen with no explanation reports it as a bug, so the
 * frame says which of the two happened -- and it matters which, because the
 * advice differs: a student who turned work in can take it back, and a student
 * whose teacher closed the assignment cannot and should not be told to try.
 */
import type { SubmissionRow } from '$lib/classroom/assignment-spec';

/**
 * The three answers to "may this student still type into this worksheet", and
 * a union rather than two booleans so every renderer is exhaustive over it.
 *
 * `turned-in` cannot arise on a PORTED assignment -- finishing the work is the
 * hand-in and there is no turn-in control anywhere on that surface -- but the
 * predicate is not told which engine it is looking at, deliberately: it reads
 * the row, and the row is the same row on both. A ported item that somehow
 * carried a stamped `submitted_at` is a state worth rendering honestly rather
 * than one worth asserting away.
 */
export type AssignmentLockState = 'open' | 'closed' | 'turned-in';

/** The shape this reads, which is the part of `SubmissionRow` that decides. */
export type LockReadableSubmission = Pick<SubmissionRow, 'state' | 'submitted_at'>;

/**
 * THE ONE PREDICATE. Null -- a student with no submission row at all -- is
 * `open`, which is what it has always meant: `classroom_save_response` reads no
 * state for such a student and accepts the write.
 *
 * A `returned` row is `open` and that is 0086's own definition of the word
 * (graded and released, editable again), not a decision taken here. It is the
 * half of this bundle that needed no code: grading writes `returned` on release
 * and `draft` otherwise, never `submitted`, so a grade has never locked anybody
 * out and 0198 must not make it start.
 */
export function assignmentLockState(
	submission: LockReadableSubmission | null | undefined
): AssignmentLockState {
	if (!submission || submission.state !== 'submitted') return 'open';
	return submission.submitted_at ? 'turned-in' : 'closed';
}

/** Whether a write should be offered at all. Absence is still the mechanism --
    a surface acts on this by withholding the transports, not by passing a flag
    a child then has to remember to honour. */
export function assignmentAcceptsWork(
	submission: LockReadableSubmission | null | undefined
): boolean {
	return assignmentLockState(submission) === 'open';
}

/**
 * WHAT THE STUDENT READS, and it names no table, no state value and no RPC.
 *
 * `closed` says who did it and that it is not their doing, because the first
 * thing a person assumes about work that has stopped saving is that they broke
 * it. It offers no action: there is no student-side way back from a close, and
 * a sentence suggesting one produces a student clicking a control that is not
 * there.
 *
 * `turned-in` keeps the advice the engine has always given, because on a
 * spec-backed assignment it is still true.
 */
export const ASSIGNMENT_LOCK_NOTICE: Record<Exclude<AssignmentLockState, 'open'>, string> = {
	closed:
		'Your teacher has closed this assignment, so it is read only now. Everything you saved is still here.',
	'turned-in': 'This is turned in, so edits are locked. Unsubmit it to keep working.'
} as const;

/** The notice for a row, or null when there is nothing to say. */
export function assignmentLockNotice(
	submission: LockReadableSubmission | null | undefined
): string | null {
	const state = assignmentLockState(submission);
	return state === 'open' ? null : ASSIGNMENT_LOCK_NOTICE[state];
}

/**
 * WHAT THE INSTRUCTOR READS ON THE ROSTER, in one word each.
 *
 * `Closed` and `Submitted` are different facts about a class and a console that
 * printed one word for both would tell a teacher a student handed something in
 * when what actually happened is that the teacher closed the assignment on
 * them. The chip is a word beside its tone, never a tone alone.
 */
export const ASSIGNMENT_LOCK_CHIP: Record<Exclude<AssignmentLockState, 'open'>, string> = {
	closed: 'Closed',
	'turned-in': 'Submitted'
} as const;

/**
 * THE SENTENCE THE CLOSE CONTROL CARRIES, AND IT STATES THE ORDER RATHER THAN
 * THE MECHANISM.
 *
 * Returning a grade writes `returned`, which re-opens that student -- that is
 * Mr. Pina's own decision of 2026-09-10 and the thing that keeps a grade from
 * locking anybody out of their own work. It also means closing and then
 * grading, in that order, hands the work back. A teacher cannot be expected to
 * infer that from two features, so the control says it.
 */
export const ASSIGNMENT_CLOSE_ORDER_NOTE =
	'Grade first, then close. Returning a grade re-opens that student so they can keep working.';
