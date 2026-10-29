<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import './coin-page.css';
	import Disclosure from '$lib/Disclosure.svelte';
	import { coinNumber, coins, signedCoins } from '$lib/coin-format';
	import { coinWhen } from '$lib/coin-balance';
	import { saveText } from '$lib/feedback/download';
	import { balanceSeriesWords, coinDay, weeksWords, type CoinStats } from './extras';
	import { balanceLine, COIN_CHART_BOX as BOX, weekBars } from './charts';
	import { coinExportName, coinRowsCsv, parseExportRows } from './export';

	/**
	 * A STUDENT'S OWN NUMBERS (2.14, 0249's coin_my_stats): the balance over
	 * time, the weekly earned and spent, the totals by category, and every
	 * fine, award and purchase. Each chart is plain inline SVG with a sentence
	 * and a table beside it, so nothing is read off a picture alone. Spent bars
	 * fall below the zero line and are hatched, so direction and texture say
	 * which is which before colour does.
	 *
	 * The export is the student's own rows (coin_export, scope student, their
	 * own address); an omitted `exportRows` removes both downloads.
	 */
	let {
		stats,
		now,
		exportRows = null
	}: {
		stats: CoinStats;
		now: number;
		exportRows?: (() => Promise<{ ok: true; data: unknown } | { ok: false; words: string }>) | null;
	} = $props();

	const line = $derived(balanceLine(stats.series));
	const bars = $derived(weekBars(stats.weeks));
	const lastPoint = $derived(line ? line.points[line.points.length - 1] : null);

	let busy = $state<'' | 'csv' | 'json'>('');
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	async function download(kind: 'csv' | 'json') {
		if (!exportRows || busy) return;
		busy = kind;
		try {
			const r = await exportRows();
			if (!r.ok) {
				outcome = { ok: false, text: r.words };
				return;
			}
			const rows = parseExportRows(r.data);
			const name = coinExportName(now);
			if (kind === 'csv') saveText(`${name}.csv`, coinRowsCsv(rows), 'text/csv');
			else saveText(`${name}.json`, JSON.stringify(r.data, null, 2), 'application/json');
			outcome = { ok: true, text: `Downloaded ${rows.length} row${rows.length === 1 ? '' : 's'} as ${kind.toUpperCase()}.` };
		} catch {
			outcome = { ok: false, text: 'Your rows could not be read. Try again in a minute.' };
		} finally {
			busy = '';
		}
	}

	const kindWord = (k: string) => (k === 'fine' ? 'Fine' : k === 'award' ? 'Award' : k === 'purchase' ? 'Purchase' : k ? k[0].toUpperCase() + k.slice(1) : '');
</script>

<section class="card cpx-card cpx-panel" aria-labelledby="cpx-h-stats" data-testid="coin-stats">
	<h2 id="cpx-h-stats">Your numbers</h2>
	<p class="cpx-lead">Your balance over time, what you earned and spent each week, and every fine, award and purchase.</p>

	<h3>Balance over time</h3>
	<p class="cpx-text" data-testid="stats-balance-words">{balanceSeriesWords(stats.series)}</p>
	{#if line}
		<svg
			class="cpx-chart"
			viewBox="0 0 {BOX.width} {BOX.height}"
			role="img"
			aria-label="Balance over time. {balanceSeriesWords(stats.series)}"
			data-testid="stats-balance-chart"
		>
			{#each line.yTicks as t (t.value)}
				<line x1={BOX.left} x2={BOX.width - BOX.right} y1={t.y} y2={t.y} class="g" />
				<text x={BOX.left - 6} y={t.y + 4} text-anchor="end" class="ax">{coinNumber(t.value)}</text>
			{/each}
			<line x1={BOX.left} x2={BOX.width - BOX.right} y1={line.zeroY} y2={line.zeroY} class="zero" />
			<path d={line.path} class="ln" />
			{#each line.points as p (p.day)}
				<circle cx={p.x} cy={p.y} r="9" class="hit"><title>{coinDay(p.day)}: {coins(p.balance)}</title></circle>
			{/each}
			{#if lastPoint}<circle cx={lastPoint.x} cy={lastPoint.y} r="4" class="pt" />{/if}
			{#each line.xLabels as l (l.day + l.anchor)}
				<text x={l.x} y={BOX.height - 8} text-anchor={l.anchor} class="ax">{coinDay(l.day)}</text>
			{/each}
		</svg>
		<Disclosure label="The balance, day by day" collapseWhen={true} testId="stats-balance-table">
			<div class="cpx-table-wrap">
				<table class="cpx-table">
					<thead><tr><th scope="col">Day</th><th scope="col" class="num">Balance</th></tr></thead>
					<tbody>
						{#each [...stats.series].reverse() as p (p.day)}
							<tr><td>{coinDay(p.day)}</td><td class="num">{coins(p.balance)}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Disclosure>
	{/if}

	<h3>Each week</h3>
	<p class="cpx-text" data-testid="stats-weeks-words">{weeksWords(stats.weeks)}</p>
	{#if bars}
		<ul class="cpx-legend" aria-hidden="true">
			<li><span class="cpx-swatch earned"></span>Earned, above the line</li>
			<li><span class="cpx-swatch spent"></span>Spent or lost, below the line</li>
		</ul>
		<svg
			class="cpx-chart"
			viewBox="0 0 {BOX.width} {BOX.height}"
			role="img"
			aria-label="Earned and spent each week. {weeksWords(stats.weeks)}"
			data-testid="stats-weeks-chart"
		>
			<defs>
				<pattern id="cpx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
					<rect width="6" height="6" class="hatch-bg" />
					<line x1="0" y1="0" x2="0" y2="6" class="hatch" />
				</pattern>
			</defs>
			{#each bars.yTicks as t (t.value)}
				<line x1={BOX.left} x2={BOX.width - BOX.right} y1={t.y} y2={t.y} class="g" />
				<text x={BOX.left - 6} y={t.y + 4} text-anchor="end" class="ax">{coinNumber(t.value)}</text>
			{/each}
			{#each bars.bars as b (b.week_start)}
				<g>
					<title>Week of {coinDay(b.week_start)}: earned {coins(b.earned)}, spent {coins(b.spent)}</title>
					{#if b.earnedH > 0}<rect x={b.x} y={b.earnedY} width={b.width} height={b.earnedH} rx="2" class="earned" />{/if}
					{#if b.spentH > 0}<rect x={b.x} y={b.spentY} width={b.width} height={b.spentH} rx="2" class="spent" />{/if}
					<rect x={b.x - 4} y={BOX.top} width={b.width + 8} height={BOX.height - BOX.top - BOX.bottom} class="hit" />
				</g>
			{/each}
			<line x1={BOX.left} x2={BOX.width - BOX.right} y1={bars.zeroY} y2={bars.zeroY} class="zero" />
			<text x={bars.bars[0].x} y={BOX.height - 8} text-anchor="start" class="ax">{coinDay(bars.bars[0].week_start)}</text>
			{#if bars.bars.length > 1}
				<text x={bars.bars[bars.bars.length - 1].x + bars.bars[bars.bars.length - 1].width} y={BOX.height - 8} text-anchor="end" class="ax"
					>{coinDay(bars.bars[bars.bars.length - 1].week_start)}</text
				>
			{/if}
		</svg>
		<Disclosure label="Each week, as a table" collapseWhen={true} testId="stats-weeks-table">
			<div class="cpx-table-wrap">
				<table class="cpx-table">
					<thead>
						<tr><th scope="col">Week of</th><th scope="col" class="num">Earned</th><th scope="col" class="num">Spent or lost</th></tr>
					</thead>
					<tbody>
						{#each [...stats.weeks].reverse() as w (w.week_start)}
							<tr><td>{coinDay(w.week_start)}</td><td class="num">{coins(w.earned)}</td><td class="num">{coins(w.spent)}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Disclosure>
	{/if}

	<h3>By category</h3>
	{#if stats.categories.length}
		<div class="cpx-table-wrap">
			<table class="cpx-table" data-testid="stats-categories">
				<thead>
					<tr><th scope="col">Reason</th><th scope="col">Kind</th><th scope="col" class="num">Times</th><th scope="col" class="num">Total</th></tr>
				</thead>
				<tbody>
					{#each stats.categories as c (c.category_id)}
						<tr><td>{c.name}</td><td>{kindWord(c.kind)}</td><td class="num">{c.count}</td><td class="num">{signedCoins(c.total)}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="cpx-note">Nothing yet.</p>
	{/if}

	<Disclosure label="Every fine, award and purchase" collapseWhen={true} testId="stats-events">
		{#snippet meta()}<span class="cpx-meta">{stats.events.length}</span>{/snippet}
		{#if stats.events.length}
			<ul class="cpx-list">
				{#each stats.events as e (e.id)}
					<li data-testid="stats-event">
						<div class="cpx-line">
							<span class="cpx-name">{e.name}</span>
							<span class="cpx-meta">{signedCoins(e.amount)}</span>
						</div>
						<div class="cpx-row">
							<StatusChip tone="neutral" label={kindWord(e.kind)} />
							{#if e.edited}<StatusChip tone="neutral" label="Edited" />{/if}
							<span class="cpx-meta">{coinWhen(e.at)}</span>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="cpx-note">None yet.</p>
		{/if}
	</Disclosure>

	{#if exportRows}
		<h3>Download your rows</h3>
		<p class="cpx-note">Every coin row of yours, exactly as stored, to open in a spreadsheet or keep.</p>
		<div class="cpx-row">
			<button
				type="button"
				class="btn cpx-key"
				aria-disabled={busy ? 'true' : undefined}
				data-testid="stats-export-csv"
				onclick={() => download('csv')}>{busy === 'csv' ? 'Preparing...' : 'Download CSV'}</button
			>
			<button
				type="button"
				class="btn secondary cpx-key"
				aria-disabled={busy ? 'true' : undefined}
				data-testid="stats-export-json"
				onclick={() => download('json')}>{busy === 'json' ? 'Preparing...' : 'Download JSON'}</button
			>
		</div>
		<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="stats-export-outcome">
			{outcome?.text ?? ''}
		</p>
	{/if}
</section>

<style>
	.g {
		stroke: var(--hairline);
		stroke-width: 1;
	}
	.zero {
		stroke: var(--boundary);
		stroke-width: 1.5;
	}
	.ax {
		fill: var(--text-2);
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.ln {
		fill: none;
		stroke: var(--green);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.pt {
		fill: var(--green);
		stroke: var(--bg1);
		stroke-width: 2;
	}
	.hit {
		fill: transparent;
	}
	.earned {
		fill: var(--green);
	}
	.spent {
		fill: url(#cpx-hatch);
		stroke: var(--amber);
		stroke-width: 1.5;
	}
	.hatch-bg {
		fill: transparent;
	}
	.hatch {
		stroke: var(--amber);
		stroke-width: 3;
	}
</style>
