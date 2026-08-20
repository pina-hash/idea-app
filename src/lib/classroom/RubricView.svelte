<script lang="ts">
	import {
		criterionIncomplete,
		criterionMax,
		isOverrideScore,
		levelIndexForScore,
		rubricTotal,
		type RubricCriterion
	} from '$lib/classroom/assignment-spec';

	/**
	 * The rubric as a promise: ordered criteria, each with its LEVELS -- points,
	 * label and the descriptor that says what that level looks like. Students see
	 * the whole thing BEFORE submitting (the point of publishing a rubric); with
	 * `scores` it doubles as the returned-grade breakdown, marking the level they
	 * were given and the comment when there is one, so the promise and the result
	 * are one rendering that cannot drift.
	 *
	 * Which level a score landed on is DERIVED from the number (levelIndexForScore
	 * -- the same rule the grading RPC uses), never a stored index, so an edited
	 * rubric can never mark a level that no longer exists.
	 */
	let {
		criteria,
		scores = null,
		comments = null,
		title = 'How this will be graded'
	}: {
		criteria: RubricCriterion[];
		scores?: Record<string, number> | null;
		comments?: Record<string, string> | null;
		title?: string;
	} = $props();

	const total = $derived(rubricTotal(criteria));
	const scored = $derived(
		scores ? criteria.reduce((sum, c) => sum + (Number(scores?.[c.id]) || 0), 0) : null
	);
</script>

<div class="rubric">
	<div class="rubric-head">
		<span class="rubric-title">{title}</span>
		<span class="rubric-total">
			{#if scored != null}{scored} / {total} pts{:else}{total} pts{/if}
		</span>
	</div>
	{#each criteria as c (c.id)}
		{@const max = criterionMax(c)}
		{@const score = scores ? scores[c.id] : null}
		{@const chosen = scores ? levelIndexForScore(c, score) : -1}
		{@const override = scores != null && isOverrideScore(c, score)}
		{@const note = comments?.[c.id]}
		<div class="criterion">
			<div class="criterion-line">
				<span class="criterion-text">{c.criterion}</span>
				<span class="criterion-points" class:scored={scores != null} class:override>
					{#if scores != null}
						{score ?? '—'} / {max}
					{:else}
						{max} pts
					{/if}
				</span>
			</div>
			{#if c.levels?.length}
				<ul class="levels">
					{#each c.levels as level, li (li)}
						<li class="level" class:chosen={li === chosen}>
							<span class="level-head">
								{#if li === chosen}<span class="tick" aria-hidden="true">✓</span>{/if}
								<span class="level-points">{level.points}</span>
								<span class="level-label">{level.label}</span>
								{#if li === chosen}<span class="sr-only">(the level you received)</span>{/if}
							</span>
							{#if level.descriptor}<span class="level-desc">{level.descriptor}</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if override}
				<p class="override-line">
					Scored between levels at {score} / {max}.
				</p>
			{/if}
			{#if note}
				<p class="crit-note"><span class="note-label">Comment</span> {note}</p>
			{/if}
			{#if criterionIncomplete(c)}
				<p class="unfinished-line">This criterion’s levels are still being written.</p>
			{/if}
		</div>
	{/each}
</div>

<style>
	.rubric {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		overflow: hidden;
	}
	.rubric-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.45rem 0.7rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--hairline);
	}
	.rubric-title {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.rubric-total {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--gold);
		white-space: nowrap;
	}
	.criterion {
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--hairline);
	}
	.criterion:last-child {
		border-bottom: none;
	}
	.criterion-line {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
	}
	.criterion-text {
		font-size: 0.88rem;
	}
	.criterion-points {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.criterion-points.scored {
		color: var(--text-1);
	}
	.criterion-points.override {
		color: var(--amber);
	}
	.levels {
		margin: 0.35rem 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.level {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		border-left: 2px solid var(--hairline);
		padding: 0.2rem 0 0.2rem 0.5rem;
	}
	.level.chosen {
		border-left-color: var(--green);
		background: var(--surface-2);
		border-radius: 0 4px 4px 0;
	}
	.level-head {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
	}
	.tick {
		color: var(--green);
		font-size: 0.75rem;
	}
	.level-points {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--gold);
		min-width: 1.6rem;
	}
	.level-label {
		font-size: 0.8rem;
		color: var(--text-1);
	}
	.level-desc {
		font-size: 0.76rem;
		color: var(--text-2);
	}
	.override-line,
	.crit-note,
	.unfinished-line {
		margin: 0.35rem 0 0;
		font-size: 0.78rem;
	}
	.override-line,
	.unfinished-line {
		color: var(--amber);
	}
	.crit-note {
		color: var(--text-1);
	}
	.note-label {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
		margin-right: 0.3rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
