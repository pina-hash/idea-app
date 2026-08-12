<script lang="ts">
	import {
		rubricTotal,
		type RubricCriterion
	} from '$lib/classroom/assignment-spec';

	/**
	 * The rubric as a promise: ordered criteria, points, and any leveled
	 * descriptors. Students see this on the assignment BEFORE submitting (the
	 * whole point of publishing a rubric); with `scores` it doubles as the
	 * returned-grade breakdown, so the promise and the result are one rendering
	 * that cannot drift.
	 */
	let {
		criteria,
		scores = null,
		title = 'How this will be graded'
	}: {
		criteria: RubricCriterion[];
		scores?: Record<string, number> | null;
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
		<div class="criterion">
			<div class="criterion-line">
				<span class="criterion-text">{c.criterion}</span>
				<span class="criterion-points" class:scored={scores != null}>
					{#if scores != null}
						{scores[c.id] ?? '—'} / {c.points}
					{:else}
						{c.points} pts
					{/if}
				</span>
			</div>
			{#if c.levels?.length}
				<ul class="levels">
					{#each c.levels as level, li (li)}
						<li>
							<span class="level-label">{level.label}{level.points != null ? ` (${level.points})` : ''}</span>
							{#if level.description}<span class="level-desc"> — {level.description}</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/each}
</div>

<style>
	.rubric {
		border: 1px solid var(--line);
		border-radius: 6px;
		overflow: hidden;
	}
	.rubric-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.45rem 0.7rem;
		background: var(--bg2);
		border-bottom: 1px solid var(--line);
	}
	.rubric-title {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.rubric-total {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--gold);
		white-space: nowrap;
	}
	.criterion {
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--line);
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
		white-space: nowrap;
	}
	.criterion-points.scored {
		color: var(--green);
	}
	.levels {
		margin: 0.3rem 0 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.levels li {
		font-size: 0.76rem;
		color: var(--dim);
	}
	.level-label {
		color: var(--white);
	}
	.level-desc {
		color: var(--dim);
	}
</style>
