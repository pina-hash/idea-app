<script lang="ts">
	import RubricView from '$lib/classroom/RubricView.svelte';
	import {
		rubricTotal,
		type RubricCriterion,
		type SubmissionRow
	} from '$lib/classroom/assignment-spec';

	/**
	 * A RETURNED GRADE, ON EVERY ENGINE, IN ONE CARD (ledger 0297, package ITEM).
	 *
	 * This was the inline card at the top of `AssignmentEngine`, which only a v1
	 * (spec) assignment mounts -- so a ported HTML worksheet (v3) and an IdeaCAD
	 * assignment (v4) never showed a student their returned score, their rubric
	 * breakdown or their teacher's comment, although the item page's own load
	 * carries all three for every assignment (`loadStudentEngineData`). The only
	 * trace was a "Returned" chip on the class row. It is one component now,
	 * mounted by the engine for v1 and by `ItemDetail`'s v3 and v4 branches in
	 * PARENT CHROME beside the frame (a returned grade is the parent's to show,
	 * never the sandboxed document's), so the three engines cannot drift into
	 * three different returned cards.
	 *
	 * THE TEACHER'S COMMENT COMES BEFORE THE BREAKDOWN, and that order is the
	 * point rather than a preference. The breakdown is every criterion with every
	 * level spelled out; measured at 375 it was 1235px tall and put the comment
	 * 1065px below the grade it explains. The comment is the one sentence written
	 * for this student, so it sits directly under the score and the table
	 * follows it. `tests/classroom-returned-grade.test.ts` pins the order.
	 *
	 * THE SCORE IS THE STORED ONE, never re-added: `score` already includes any
	 * extra credit (0171), and the breakdown's own total is RubricView's.
	 */
	let {
		submission,
		rubric = null,
		points = null,
		note = null
	}: {
		submission: SubmissionRow;
		/** The STORED rubric (`classroom_rubrics`), never a spec-derived copy. */
		rubric?: RubricCriterion[] | null;
		/** The item's own points, for the "out of" when there is no rubric. */
		points?: number | null;
		/**
		 * What the student can do next, when there is something. The v1 engine
		 * says a resubmission reaches the teacher; a ported worksheet and a blade
		 * have no Submit of their own, so they pass nothing rather than a
		 * sentence about a control that is not there.
		 */
		note?: string | null;
	} = $props();

	const outOf = $derived(rubric?.length ? rubricTotal(rubric) : (points ?? 0));
</script>

<section class="card grade-card" data-testid="returned-grade">
	<h3 class="grade-head" data-testid="returned-grade-head">
		Returned{submission.score != null ? `: ${submission.score} / ${outOf} pts` : ''}
	</h3>
	{#if submission.teacher_comment}
		<!-- The text sits in its OWN element, flush against its tags: the comment
		     keeps the teacher's line breaks (`pre-wrap`), and a template's own
		     indentation inside that element would print as a leading space. -->
		<p class="grade-comment" data-testid="returned-grade-comment">
			<span class="comment-label">Teacher comment</span>
			<span class="comment-text">{submission.teacher_comment}</span>
		</p>
	{/if}
	{#if rubric?.length}
		<div data-testid="returned-grade-breakdown">
			<RubricView
				criteria={rubric}
				scores={submission.rubric_scores ?? {}}
				comments={submission.criterion_comments ?? null}
				title="Rubric breakdown"
			/>
		</div>
	{/if}
	{#if note}<p class="grade-note">{note}</p>{/if}
</section>

<style>
	.grade-card {
		border-color: var(--line-strong);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.grade-head {
		margin: 0;
		color: var(--green);
		font-size: 1rem;
	}
	.grade-comment {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.comment-text {
		display: block;
		white-space: pre-wrap;
	}
	.comment-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
		margin-bottom: 0.15rem;
	}
	.grade-note {
		color: var(--text-2);
		font-size: 0.82rem;
		margin: 0;
	}
</style>
