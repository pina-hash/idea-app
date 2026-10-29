<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { coins, signedCoins } from '$lib/coin-format';
	import Disclosure from '$lib/Disclosure.svelte';
	import { balanceLine, COIN_CHART_BOX as BOX, weekBars } from '$lib/coin-balance/charts';
	import { parseMyStats } from '$lib/coin-balance/extras';
	import { num } from './v2';
	import {
		balanceSentence,
		EVENT_KIND_WORDS,
		shortDay,
		weeksSentence,
		type StudentStats
	} from './student-view';

	/**
	 * ONE STUDENT'S TELEMETRY (coin_student_stats, 0249): the balance over time,
	 * what they earned and spent each week, totals by category, and every fine,
	 * award and purchase.
	 *
	 * THE CHARTS ARE PLAIN INLINE SVG, drawn from the student page's own
	 * geometry (`$lib/coin-balance/charts.ts`, over `parseMyStats`'s lists), so
	 * a teacher and the student read one student's numbers drawn one way. Each
	 * is a `figure` whose SVG is `aria-hidden` and whose caption is a sentence saying what it shows; the numbers themselves
	 * sit in a table behind "Show the numbers", so nothing on the chart is only
	 * a picture. Colour is never the only signal: earned rises above the zero
	 * line and spent falls below it, and the legend says so in words.
	 *
	 * `backgroundUrl` is the approved desktop background's signed link, read by
	 * the caller (it holds the storage client); null draws the facts without a
	 * picture.
	 */
	let {
		stats,
		backgroundUrl = null
	}: {
		stats: StudentStats;
		backgroundUrl?: string | null;
	} = $props();

	/** The four lists, read by the student page's own parser. */
	const lists = $derived(parseMyStats(stats));
	const series = $derived(lists?.series ?? []);
	const line = $derived(balanceLine(series));
	const bars = $derived(weekBars(lists?.weeks ?? []));
	const fines = $derived(stats.categories.filter((c) => c.kind === 'fine'));
	const others = $derived(stats.categories.filter((c) => c.kind !== 'fine'));

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}
</script>

<div class="stats" data-testid="cd-student-stats">
	<div class="stat-row">
		<div class="stat">
			<span class="stat-label">Balance now</span>
			<span class="cdx-balance stat-value" class:negative={num(stats.balance) < 0} data-testid="cd-stats-balance">
				{coins(num(stats.balance))}
			</span>
			{#if num(stats.balance) < 0}<StatusChip tone="warn" label="In debt" />{/if}
		</div>
		<div class="stat">
			<span class="stat-label">Desktop background</span>
			{#if stats.background}
				<span class="stat-text">
					Approved {stats.background.approved_at ? shortDay(stats.background.approved_at) : ''}
					{#if stats.background.width && stats.background.height}
						({stats.background.width} by {stats.background.height})
					{/if}
				</span>
				{#if backgroundUrl}
					<img class="bg-thumb" src={backgroundUrl} alt="The approved desktop background" loading="lazy" />
				{/if}
			{:else}
				<span class="stat-text">None approved yet</span>
			{/if}
		</div>
	</div>

	<figure class="chart" data-testid="cd-balance-chart">
		<figcaption>
			<span class="chart-title">Balance over time</span>
			<span class="chart-sentence">{balanceSentence(series)}</span>
		</figcaption>
		{#if line}
			<svg viewBox="0 0 {BOX.width} {BOX.height}" aria-hidden="true" class="svg">
				{#each line.yTicks as t (t.value)}
					<line class="grid" x1={BOX.left} x2={BOX.width - BOX.right} y1={t.y} y2={t.y} />
					<text class="ax" x={BOX.left - 6} y={t.y + 4} text-anchor="end">{t.value}</text>
				{/each}
				<line class="zero" x1={BOX.left} x2={BOX.width - BOX.right} y1={line.zeroY} y2={line.zeroY} />
				<path class="line" d={line.path} />
				{#each line.points as p (p.day)}
					<circle class="dot" class:below={p.balance < 0} cx={p.x} cy={p.y} r="3" />
				{/each}
				{#each line.xLabels as l (l.day)}
					<text class="ax" x={l.x} y={BOX.height - 8} text-anchor={l.anchor}>{shortDay(l.day)}</text>
				{/each}
			</svg>
			<Disclosure label="Show the numbers" collapseWhen={true} testId="cd-balance-table">
				<table class="nums">
					<thead><tr><th scope="col">Day</th><th scope="col">Balance at the end of the day</th></tr></thead>
					<tbody>
						{#each series as p (p.day)}
							<tr><td>{shortDay(p.day)}</td><td>{coins(p.balance)}</td></tr>
						{/each}
					</tbody>
				</table>
			</Disclosure>
		{/if}
	</figure>

	<figure class="chart" data-testid="cd-weeks-chart">
		<figcaption>
			<span class="chart-title">Earned and spent each week</span>
			<span class="chart-sentence">{weeksSentence(lists?.weeks ?? [])}</span>
		</figcaption>
		{#if bars}
			<p class="legend">
				<span class="key earned" aria-hidden="true"></span> Earned, above the line
				<span class="key spent" aria-hidden="true"></span> Spent or lost, below it
			</p>
			<svg viewBox="0 0 {BOX.width} {BOX.height}" aria-hidden="true" class="svg">
				{#each bars.yTicks as t (t.value)}
					<line class="grid" x1={BOX.left} x2={BOX.width - BOX.right} y1={t.y} y2={t.y} />
					<text class="ax" x={BOX.left - 6} y={t.y + 4} text-anchor="end">{t.value}</text>
				{/each}
				<line class="zero" x1={BOX.left} x2={BOX.width - BOX.right} y1={bars.zeroY} y2={bars.zeroY} />
				{#each bars.bars as b (b.week_start)}
					<rect class="bar earned" x={b.x} y={b.earnedY} width={b.width} height={b.earnedH} />
					<rect class="bar spent" x={b.x} y={b.spentY} width={b.width} height={b.spentH} />
				{/each}
			</svg>
			<Disclosure label="Show the numbers" collapseWhen={true} testId="cd-weeks-table">
				<table class="nums">
					<thead>
						<tr><th scope="col">Week of</th><th scope="col">Earned</th><th scope="col">Spent or lost</th></tr>
					</thead>
					<tbody>
						{#each bars.bars as b (b.week_start)}
							<tr><td>{shortDay(b.week_start)}</td><td>{coins(b.earned)}</td><td>{coins(b.spent)}</td></tr>
						{/each}
					</tbody>
				</table>
			</Disclosure>
		{/if}
	</figure>

	<div class="by-category" data-testid="cd-stats-categories">
		<h4>Totals by category</h4>
		{#if stats.categories.length}
			<table class="nums cats">
				<thead>
					<tr><th scope="col">Category</th><th scope="col">Kind</th><th scope="col">Times</th><th scope="col">Total</th></tr>
				</thead>
				<tbody>
					{#each [...fines, ...others] as c (c.category_id)}
						<tr>
							<td>{c.name}</td>
							<td>{EVENT_KIND_WORDS[c.kind] ?? (c.kind === 'adjustment' ? 'Adjustment' : c.kind)}</td>
							<td>{c.count}</td>
							<td class:neg={num(c.total) < 0}>{signedCoins(num(c.total))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="cdx-note">Nothing logged yet.</p>
		{/if}
	</div>

	<div class="events">
		<Disclosure
			label="Every fine, award and purchase ({stats.events.length})"
			collapseWhen={true}
			testId="cd-stats-events"
		>
			{#if stats.events.length}
				<ul class="event-list">
					{#each stats.events as e (e.id)}
						<li>
							<StatusChip tone={e.kind === 'award' ? 'ok' : e.kind === 'fine' ? 'warn' : 'neutral'} label={EVENT_KIND_WORDS[e.kind] ?? e.kind} />
							<span class="event-name">{e.name}</span>
							<span class="event-amount" class:neg={num(e.amount) < 0}>{signedCoins(num(e.amount))}</span>
							{#if e.edited}<StatusChip tone="warn" label="Edited" />{/if}
							<span class="event-when">{when(e.at)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="cdx-note">None yet.</p>
			{/if}
		</Disclosure>
	</div>
</div>

<style>
	.stats {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		min-width: 0;
	}
	.stat-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem 2rem;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.stat-label,
	.chart-title,
	h4 {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
		margin: 0;
		font-weight: 400;
	}
	.stat-value {
		font-size: 1.5rem;
	}
	.stat-text {
		color: var(--white);
	}
	.bg-thumb {
		width: 12rem;
		max-width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: contain;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--bg0);
	}
	.chart {
		margin: 0;
		min-width: 0;
	}
	figcaption {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-bottom: 0.35rem;
	}
	.chart-sentence {
		color: var(--white);
		font-size: 0.92rem;
	}
	.svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 16rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.ax {
		fill: var(--text-2, var(--dim));
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.zero {
		stroke: var(--boundary, var(--line));
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.line {
		fill: none;
		stroke: var(--green);
		stroke-width: 2;
	}
	.dot {
		fill: var(--green);
	}
	.dot.below {
		fill: var(--amber);
	}
	.bar.earned {
		fill: var(--green);
	}
	.bar.spent {
		fill: var(--amber);
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin: 0 0 0.3rem;
		font-size: 0.85rem;
		color: var(--white);
	}
	.key {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 2px;
	}
	.key.earned {
		background: var(--green);
	}
	.key.spent {
		background: var(--amber);
		margin-left: 0.8rem;
	}
	.nums {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}
	.nums th,
	.nums td {
		text-align: left;
		padding: 0.3rem 0.4rem;
		border-bottom: 1px solid var(--line);
		color: var(--white);
	}
	.nums th {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		font-weight: 400;
		letter-spacing: 0.05em;
		color: var(--text-2, var(--dim));
	}
	.cats td:last-child,
	.cats th:last-child {
		text-align: right;
		font-family: var(--font-mono);
	}
	.neg {
		color: var(--amber) !important;
	}
	.event-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.event-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--line);
	}
	.event-name {
		color: var(--white);
		flex: 1 1 10rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.event-amount {
		font-family: var(--font-mono);
		color: var(--green);
	}
	.event-when {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2, var(--dim));
	}
</style>
