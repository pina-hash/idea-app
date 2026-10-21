<script lang="ts">
	import { candlesOf, price, shortDay, type StockDay } from './stocks';

	/**
	 * A STOCK'S DAYS AS CANDLES, WITH VOLUME BARS UNDER THEM, as plain SVG. Each
	 * candle is one day since the launch: the body runs from the day's open to its
	 * close, the wick from its low to its high. A rising day is a filled green
	 * body, a falling day an outlined amber one, so colour is never the only
	 * signal, and the summary line says the same in words. Volume is the coins
	 * traded in that stock that day. Nothing here is computed: every number is the
	 * database's.
	 */
	let { days, label, height = 220 }: { days: StockDay[]; label: string; height?: number } = $props();

	const W = 600;
	const VOL_H = 44;
	const GAP = 6;
	const candles = $derived(candlesOf(days));
	const plotH = $derived(height - VOL_H - GAP);
	const lo = $derived(candles.length ? Math.min(...candles.map((c) => c.low)) : 0);
	const hi = $derived(candles.length ? Math.max(...candles.map((c) => c.high)) : 0);
	const span = $derived(hi - lo || Math.max(hi * 0.1, 1));
	const maxVol = $derived(Math.max(1, ...candles.map((c) => c.volume)));
	const slot = $derived(candles.length ? W / candles.length : W);
	const bodyW = $derived(Math.max(3, Math.min(22, slot * 0.6)));
	const y = (v: number) => 4 + (1 - (v - lo) / span) * (plotH - 8);
	const last = $derived(candles[candles.length - 1] ?? null);
	const summary = $derived(
		last
			? `${label}: ${candles.length} day${candles.length === 1 ? '' : 's'} since the launch. Latest day opened ${price(last.open)}, high ${price(last.high)}, low ${price(last.low)}, closed ${price(last.close)}, ${last.up ? 'up' : 'down'}. ${last.volume > 0 ? `${last.volume} coins traded.` : 'No trades.'}`
			: `${label}: no days yet.`
	);
</script>

<figure class="sk-chart sk-candles" data-testid="sk-candles">
	{#if candles.length}
		<svg viewBox="0 0 {W} {height}" role="img" aria-label={summary} style="height:{height}px" preserveAspectRatio="none">
			{#each [0, 0.5, 1] as g (g)}
				<line class="sk-grid" x1="0" x2={W} y1={4 + g * (plotH - 8)} y2={4 + g * (plotH - 8)} vector-effect="non-scaling-stroke" />
			{/each}
			{#each candles as c, i (c.day)}
				{@const cx = slot * i + slot / 2}
				{@const top = y(Math.max(c.open, c.close))}
				{@const bottom = y(Math.min(c.open, c.close))}
				<g class="sk-candle" class:up={c.up} class:down={!c.up} data-testid="sk-candle">
					<line class="sk-wick" x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} vector-effect="non-scaling-stroke" />
					<rect class="sk-body" x={cx - bodyW / 2} y={top} width={bodyW} height={Math.max(2, bottom - top)} vector-effect="non-scaling-stroke" />
					<rect
						class="sk-vol"
						x={cx - bodyW / 2}
						y={height - (c.volume / maxVol) * VOL_H}
						width={bodyW}
						height={Math.max(c.volume > 0 ? 2 : 0, (c.volume / maxVol) * VOL_H)}
					/>
				</g>
			{/each}
		</svg>
		<figcaption class="sk-axis">
			<span>Low {price(lo)}</span>
			<span>{shortDay(candles[0].day)} to {shortDay(candles[candles.length - 1].day)}</span>
			<span>High {price(hi)}</span>
		</figcaption>
		<p class="mk-note">Bars underneath are coins traded each day{maxVol > 1 ? `, up to ${maxVol}` : ''}.</p>
	{:else}
		<p class="mk-empty">No days yet. The first one is today.</p>
	{/if}
</figure>
