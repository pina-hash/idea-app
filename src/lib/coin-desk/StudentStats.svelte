<script lang="ts">
	import { coins, signedCoins } from '$lib/coin-format';
	import Disclosure from '$lib/Disclosure.svelte';
	import { num } from './v2';
	import {
		balanceChart,
		balanceSentence,
		EVENT_KIND_WORDS,
		shortDay,
		weekBars,
		weeksSentence,
		type StudentStats
	} from './student-view';

	/**
	 * ONE STUDENT'S TELEMETRY (coin_student_stats, 0249): the balance over time,
	 * what they earned and spent each week, totals by category, and every fine,
	 * award and purchase.
	 *
	 * THE CHARTS ARE PLAIN INLINE SVG, drawn from `student-view.ts`'s geometry,
	 * with no chart library. Each is a `figure` whose SVG is `aria-hidden` and
	 * whose caption is a sentence saying what it shows; the numbers themselves
	 * sit in a table behind "Show the numbers", so nothing on the chart is only
	 * a picture. Colour is never the only signal: the bars are labelled in the
	 * legend in words, earned and spent are also left and right of each pair.
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

	const chart = $derived(balanceChart(stats.series));
	const bars = $derived(weekBars(stats.weeks));
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
			{#if num(stats.balance) < 0}<span class="cdx-chip warn">In debt</span>{/if}
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
			<span class="chart-sentence">{balanceSentence(stats.series)}</span>
		</figcaption>
		{#if chart.points.length}
			<svg
				viewBox="0 0 {chart.width} {chart.height}"
				preserveAspectRatio="none"
				aria-hidden="true"
				class="svg"
			>
				{#if chart.zeroY !== null}
					<line class="zero" x1="0" x2={chart.width} y1={chart.zeroY} y2={chart.zeroY} />
				{/if}
				<path class="line" d={chart.path} />
				{#each chart.points as p (p.day)}
					<circle class="dot" class:below={p.balance < 0} cx={p.x} cy={p.y} r="2.5" />
				{/each}
			</svg>
			<p class="axis"><span>{shortDay(chart.points[0].day)}</span><span>{shortDay(chart.points[chart.points.length - 1].day)}</span></p>
			<Disclosure label="Show the numbers" collapseWhen={true} testId="cd-balance-table">
				<table class="nums">
					<thead><tr><th scope="col">Day</th><th scope="col">Balance at the end of the day</th></tr></thead>
					<tbody>
						{#each stats.series as p (p.day)}
							<tr><td>{shortDay(p.day)}</td><td>{coins(num(p.balance))}</td></tr>
						{/each}
					</tbody>
				</table>
			</Disclosure>
		{/if}
	</figure>

	<figure class="chart" data-testid="cd-weeks-chart">
		<figcaption>
			<span class="chart-title">Earned and spent each week</span>
			<span class="chart-sentence">{weeksSentence(stats.weeks)}</span>
		</figcaption>
		{#if bars.bars.length}
			<p class="legend">
				<span class="key earned" aria-hidden="true"></span> Earned (left)
				<span class="key spent" aria-hidden="true"></span> Spent (right)
			</p>
			<svg viewBox="0 0 600 140" preserveAspectRatio="none" aria-hidden="true" class="svg">
				<line class="zero" x1="0" x2="600" y1="132" y2="132" />
				{#each bars.bars as b (b.week_start)}
					<rect class="bar earned" x={b.x} y={b.earnedY} width={b.barWidth} height={b.earnedH} />
					<rect class="bar spent" x={b.x + b.barWidth} y={b.spentY} width={b.barWidth} height={b.spentH} />
				{/each}
			</svg>
			<Disclosure label="Show the numbers" collapseWhen={true} testId="cd-weeks-table">
				<table class="nums">
					<thead>
						<tr><th scope="col">Week of</th><th scope="col">Earned</th><th scope="col">Spent</th></tr>
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
							<span class="cdx-chip" class:warn={e.kind === 'fine'} class:ok={e.kind === 'award'}>
								{EVENT_KIND_WORDS[e.kind] ?? e.kind}
							</span>
							<span class="event-name">{e.name}</span>
							<span class="event-amount" class:neg={num(e.amount) < 0}>{signedCoins(num(e.amount))}</span>
							{#if e.edited}<span class="cdx-chip warn">Edited</span>{/if}
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
		height: 9rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
	}
	.zero {
		stroke: var(--boundary, var(--line));
		stroke-width: 1;
		stroke-dasharray: 4 3;
		vector-effect: non-scaling-stroke;
	}
	.line {
		fill: none;
		stroke: var(--green);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
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
	.axis {
		display: flex;
		justify-content: space-between;
		margin: 0.15rem 0 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2, var(--dim));
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
		font-size: 0.68rem;
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
		font-size: 0.68rem;
		color: var(--text-2, var(--dim));
	}
</style>
