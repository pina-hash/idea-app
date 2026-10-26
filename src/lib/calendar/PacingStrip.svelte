<script lang="ts">
	/**
	 * THE DAY-BY-DAY PLAN ABOVE A WORKSHEET (ledger 0439, SPEC 17): each step on
	 * its school day with this student's state, and the post's due date, in
	 * parent chrome so every assignment with pacing gets it whether or not its
	 * document draws the plan itself. The step the student is on is open; the
	 * rest sit behind one disclosure on a phone.
	 */
	import type { HxSchedule } from '$lib/classroom/html-assignment/bridge';
	import { PACING_STATE_WORDS } from './item-schedule';
	import { dayWords } from './model';

	let { schedule }: { schedule: HxSchedule } = $props();
	const year = $derived(schedule.today.slice(0, 4));
	const current = $derived(
		schedule.pacing.find((s) => s.state === 'today') ??
			schedule.pacing.find((s) => s.state === 'behind') ??
			schedule.pacing.find((s) => s.state === 'next') ??
			null
	);
	const behindSteps = $derived(schedule.pacing.filter((s) => s.state === 'behind'));
	const behind = $derived(behindSteps.length);
	/** The step shown, then up to two steps still owed from earlier days. */
	const lines = $derived([...(current ? [current] : []), ...behindSteps.filter((s) => s !== current).slice(0, 2)]);
	const done = $derived(schedule.pacing.filter((s) => s.state === 'done').length);
</script>

{#if schedule.pacing.length}
	<section class="pace card" aria-labelledby="pace-title" data-testid="pacing-strip">
		<span class="pace-stripe" aria-hidden="true"></span>
		<div class="pace-head">
			<h2 class="section-label" id="pace-title">Day-by-day plan</h2>
			<p class="pace-sum">
				{done} of {schedule.pacing.length} done{behind ? ` · ${behind} behind` : ''}{schedule.due.day ? ` · due ${dayWords(schedule.due.day, year)}` : ''}
			</p>
		</div>
		{#each lines as line (line.id)}
			<p class="pace-now" data-state={line.state}>
				<span class="pace-word">{PACING_STATE_WORDS[line.state]}</span>
				<span>{line.title}</span>
				<span class="pace-day">by {dayWords(line.day, year)}</span>
			</p>
		{/each}
		<details class="pace-all">
			<summary>All {schedule.pacing.length} steps</summary>
			<ol class="pace-steps">
				{#each schedule.pacing as s (s.id)}
					<li class="pace-step" data-state={s.state}>
						<span class="pace-day">{dayWords(s.day, year)}</span>
						<span class="pace-title">{s.title}</span>
						<span class="pace-word">{PACING_STATE_WORDS[s.state]}</span>
					</li>
				{/each}
			</ol>
		</details>
	</section>
{/if}

<style>
	.pace {
		position: relative;
		display: grid;
		gap: 0.45rem;
	}
	/* The pacing layer's identity colour, the calendar's own stripe. */
	.pace-stripe {
		position: absolute;
		left: 0;
		top: 0.9rem;
		bottom: 0.9rem;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--teal);
	}
	.pace-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.25rem 0.75rem;
	}
	.pace-head .section-label {
		margin: 0;
	}
	.pace-sum {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--cyan);
	}
	.pace-head .section-label {
		margin-top: 0;
	}
	.pace-now {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.6rem;
		align-items: baseline;
		font-size: 1.05rem;
	}
	.pace-word {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--teal);
	}
	[data-state='behind'] .pace-word {
		color: var(--amber);
	}
	[data-state='done'] .pace-word {
		color: var(--green);
	}
	.pace-day {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--dim);
	}
	.pace-all summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.pace-steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.pace-step {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) auto;
		gap: 0.6rem;
		align-items: baseline;
		min-height: 2rem;
	}
	.pace-step[data-state='done'] .pace-title {
		color: var(--dim);
	}
</style>
