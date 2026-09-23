<script lang="ts">
	import { ICONS } from '$lib/shell/commands';
	import { summaryWords, type TodoSummary } from '$lib/classroom/todo';

	/**
	 * THE DOOR TO A STUDENT'S TO-DO, WITH WHAT IT HOLDS (ledger 0297): the words
	 * "2 missing", "3 due this week" and "1 returned", read off `todoSummary` over
	 * the rows the to-do page itself lists, so the numbers on the door and the
	 * list behind it cannot disagree. Zero is no news and prints nothing; a
	 * student with nothing owed reads "Nothing due this week".
	 *
	 * ONE LINE AND ONE LINK. It sits on the site home above the apps, where the
	 * full feed cannot (apps first for a student is Mr. Pina's decision, report
	 * 21), so what is owed is on the first screen at 1366x768 and on a phone
	 * without moving anything he placed.
	 *
	 * Its colours read the classroom register (`--surface-1`, `--text-1`,
	 * `--boundary`), which is declared at `:root`, so it renders the same inside
	 * the home page's wrapper as in the classroom's room.
	 */
	let { href, summary }: { href: string; summary: TodoSummary } = $props();
	const words = $derived(summaryWords(summary));
	const quiet = $derived(!words.missing && !words.dueThisWeek && !words.feedback);
</script>

<a class="td-door" {href} data-testid="todo-strip">
	<svg class="td-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.checklist} /></svg>
	<span class="td-word">Your to-do</span>
	<span class="td-counts">
		{#if words.missing}
			<span class="td-owed td-missing" data-testid="todo-strip-missing">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.missing} /></svg>
				{words.missing}
			</span>
		{/if}
		{#if words.dueThisWeek}
			<span class="td-owed" data-testid="todo-strip-due">{words.dueThisWeek}</span>
		{/if}
		{#if words.feedback}
			<span class="td-owed td-returned">{words.feedback}</span>
		{/if}
		{#if quiet}
			<span class="td-quiet">Nothing due this week</span>
		{/if}
	</span>
	<span class="td-all">See all <span aria-hidden="true">&rsaquo;</span></span>
</a>

<style>
	.td-door {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem 0.7rem;
		min-height: 44px;
		box-sizing: border-box;
		padding: 0.45rem 0.9rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
		color: var(--text-1);
		font-family: var(--font-display);
		text-decoration: none;
	}
	.td-door:hover {
		border-color: var(--gold);
	}
	.td-door:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.td-mark {
		flex: none;
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--text-2);
	}
	.td-word {
		font-weight: 700;
		font-size: 1rem;
		letter-spacing: 0.02em;
	}
	.td-counts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		min-width: 0;
	}
	.td-owed {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.14rem 0.55rem;
		border: 1px solid var(--cyan);
		border-radius: 999px;
		color: var(--cyan);
		white-space: nowrap;
	}
	.td-owed svg {
		width: 11px;
		height: 11px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.td-missing {
		color: var(--amber);
		border-color: var(--amber);
		background: color-mix(in srgb, var(--amber) 14%, transparent);
		font-weight: 700;
	}
	.td-returned {
		color: var(--green);
		border-color: var(--green);
	}
	.td-quiet {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.td-all {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--gold);
		white-space: nowrap;
	}
</style>
