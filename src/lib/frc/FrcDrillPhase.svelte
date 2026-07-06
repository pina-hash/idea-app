<script lang="ts">
	import type { MdmUnit } from '$lib/frc/mdm-content';

	/**
	 * Drill phase: active-retrieval practice (write from memory, then check),
	 * isolated in its own component so an interactive scored drill can replace
	 * it later without touching the surrounding phase machinery in UnitPage.
	 * Entirely client-side and per-mount, never persisted; resets whenever
	 * `unit` changes reference (a real navigation to a different unit, since
	 * MDM_UNITS is a stable module-level array).
	 *
	 * Once every question has been checked, a readiness summary reads the
	 * self-marks: a clear majority of "I had it" unlocks the Quiz phase outright
	 * (`onContinue`); otherwise it recommends a Brief review (`onReviewBrief`,
	 * does not advance) while still letting the student continue anyway
	 * (`onContinue`) if they choose to.
	 */
	let {
		unit,
		onContinue,
		onReviewBrief
	}: {
		unit: MdmUnit;
		onContinue: () => void;
		onReviewBrief: () => void;
	} = $props();

	type Mark = 'had-it' | 'review' | null;
	let attempts = $state<string[]>([]);
	let checked = $state<boolean[]>([]);
	let marks = $state<Mark[]>([]);

	$effect(() => {
		const count = unit.drill.length;
		attempts = Array(count).fill('');
		checked = Array(count).fill(false);
		marks = Array(count).fill(null) as Mark[];
	});

	const total = $derived(unit.drill.length);
	const checkedCount = $derived(checked.filter(Boolean).length);
	const allChecked = $derived(total > 0 && checkedCount === total);
	const hadItCount = $derived(marks.filter((m) => m === 'had-it').length);
	// "Most" = a clear majority self-marked "I had it". A unit with no drill
	// questions has nothing to be unready for.
	const ready = $derived(total === 0 || hadItCount / total > 0.5);
</script>

<p class="drill-progress">{checkedCount} of {total} checked</p>
<ol class="drill">
	{#each unit.drill as d, i (d)}
		{@const answer = unit.drillAnswers[i]}
		{@const attempted = !!attempts[i]?.trim()}
		<li class="drill-item">
			<span class="drill-q">{d}</span>
			<div class="drill-attempt">
				<label class="drill-label" for="drill-{unit.id}-{i}">Write your answer from memory.</label>
				<textarea
					id="drill-{unit.id}-{i}"
					class="drill-input"
					rows="2"
					placeholder="Type what you remember, then check it."
					value={attempts[i] ?? ''}
					oninput={(e) => (attempts[i] = e.currentTarget.value)}
				></textarea>
				{#if !checked[i]}
					<button
						type="button"
						class="drill-check"
						disabled={!attempted}
						onclick={() => (checked[i] = true)}
					>
						Check answer
					</button>
				{/if}
			</div>
			{#if checked[i]}
				{#if answer}
					<div class="drill-model">
						<span class="drill-model-label">Model answer</span>
						<p class="drill-model-text">{answer}</p>
						<div class="drill-mark">
							<button
								type="button"
								class="mark-btn had-it"
								class:active={marks[i] === 'had-it'}
								aria-pressed={marks[i] === 'had-it'}
								onclick={() => (marks[i] = 'had-it')}
							>
								I had it
							</button>
							<button
								type="button"
								class="mark-btn review"
								class:active={marks[i] === 'review'}
								aria-pressed={marks[i] === 'review'}
								onclick={() => (marks[i] = 'review')}
							>
								Review this
							</button>
						</div>
					</div>
				{:else}
					<div class="drill-model">
						<span class="drill-missing">Model answer not yet added</span>
					</div>
				{/if}
			{/if}
		</li>
	{/each}
</ol>

{#if allChecked}
	<div class="frc-card drill-summary">
		{#if ready}
			<p class="summary-lead">
				<strong>Nice work.</strong> You marked most of these "I had it" &mdash; you're ready for the
				quiz.
			</p>
			<div class="summary-actions">
				<button class="summary-btn primary" type="button" onclick={onContinue}>
					Continue to quiz &rsaquo;
				</button>
			</div>
		{:else}
			<p class="summary-lead">
				<strong>A few of these still need another look.</strong> Consider reviewing the Brief before
				the quiz.
			</p>
			<div class="summary-actions">
				<button class="summary-btn" type="button" onclick={onReviewBrief}>
					&lsaquo; Review the Brief
				</button>
				<button class="summary-btn primary" type="button" onclick={onContinue}>
					Continue to quiz anyway &rsaquo;
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Progress line: "N of M checked", the only cross-question state on the page. */
	.drill-progress {
		margin: -0.3rem 0 0.9rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.drill {
		margin: 0;
		padding-left: 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.drill-item {
		color: #333133;
		line-height: 1.55;
		padding-left: 0.3rem;
	}
	.drill-item::marker {
		font-weight: 700;
		font-style: italic;
		color: var(--frc-blue, #0066b3);
	}
	.drill-q {
		display: block;
		margin-bottom: 0.5rem;
	}
	/* Active-retrieval attempt box: the student must type something here
	   before the model answer can be checked. */
	.drill-attempt {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.drill-label {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.drill-input {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 6px;
		background: var(--frc-surface, #fafbfd);
		color: var(--frc-ink, #231f20);
		font-family: inherit;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.drill-input:focus-visible {
		outline: none;
		border-color: var(--frc-blue, #0066b3);
	}
	.drill-check {
		align-self: flex-start;
		font-family: inherit;
		font-weight: 700;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
		background: var(--frc-blue, #0066b3);
		border: 1px solid var(--frc-blue, #0066b3);
		border-radius: 6px;
		padding: 0.4rem 0.85rem;
		cursor: pointer;
	}
	.drill-check:hover:not(:disabled) {
		background: var(--frc-blue-deep, #004f8a);
	}
	/* Disabled until an attempt is typed: the model answer cannot be seen
	   before the student has tried, on purpose. */
	.drill-check:disabled {
		background: none;
		color: var(--frc-gray, #9a989a);
		border-color: var(--frc-line, #dde1e8);
		cursor: not-allowed;
	}
	/* Model-answer panel: distinct FRC-themed callout directly below the
	   student's own attempt, so the two sit side by side for comparison. */
	.drill-model {
		margin-top: 0.6rem;
		padding: 0.75rem 0.9rem;
		border-left: 4px solid var(--frc-blue, #0066b3);
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
		border-radius: 0 8px 8px 0;
	}
	.drill-model-label {
		display: block;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--frc-blue, #0066b3);
		margin-bottom: 0.3rem;
	}
	.drill-model-text {
		margin: 0 0 0.6rem;
		color: var(--frc-ink, #231f20);
		font-size: 0.9rem;
		line-height: 1.55;
	}
	.drill-mark {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.mark-btn {
		font-family: inherit;
		font-weight: 700;
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background: var(--frc-surface, #fafbfd);
		border-radius: 999px;
		padding: 0.32rem 0.75rem;
		cursor: pointer;
	}
	.mark-btn.had-it {
		color: var(--frc-blue, #0066b3);
		border: 1px solid var(--frc-blue-line, rgba(0, 102, 179, 0.35));
	}
	.mark-btn.had-it:hover,
	.mark-btn.had-it.active {
		color: #fff;
		background: var(--frc-blue, #0066b3);
	}
	.mark-btn.review {
		color: var(--frc-red, #ed1c24);
		border: 1px solid rgba(237, 28, 36, 0.4);
	}
	.mark-btn.review:hover,
	.mark-btn.review.active {
		color: #fff;
		background: var(--frc-red, #ed1c24);
	}
	/* Visibly incomplete, not silently broken: a question with no authored
	   answer key shows this once checked, instead of a fabricated answer. */
	.drill-missing {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-style: italic;
		color: var(--frc-gray, #9a989a);
	}
	/* Readiness summary: appears once every question has been checked. */
	.drill-summary {
		margin-top: 1.3rem;
		padding: 1rem 1.1rem;
		border-left: 4px solid var(--frc-blue, #0066b3);
	}
	.summary-lead {
		margin: 0 0 0.8rem;
		color: #333133;
		line-height: 1.6;
	}
	.summary-lead strong {
		color: var(--frc-ink, #231f20);
	}
	.summary-actions {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.summary-btn {
		display: inline-block;
		font-family: inherit;
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.02em;
		color: var(--frc-blue, #0066b3);
		background: var(--frc-surface, #fafbfd);
		border: 1px solid var(--frc-blue, #0066b3);
		border-radius: 6px;
		padding: 0.5rem 0.9rem;
		cursor: pointer;
	}
	.summary-btn:hover {
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
	}
	.summary-btn.primary {
		color: #fff;
		background: var(--frc-blue, #0066b3);
	}
	.summary-btn.primary:hover {
		background: var(--frc-blue-deep, #004f8a);
	}
</style>
