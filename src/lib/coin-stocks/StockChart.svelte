<script lang="ts">
	import { chartGeometry, price, type StockPoint } from './stocks';

	/**
	 * A price history as plain SVG (no chart library is installed, and none is
	 * wanted). The line is green on a rise and amber on a fall, and the words
	 * beside it say the same, so colour is never the only signal. A carried
	 * day (no data, the previous price kept) is a short tick under the line.
	 */
	let {
		series,
		label,
		height = 120,
		axis = true
	}: { series: StockPoint[]; label: string; height?: number; axis?: boolean } = $props();

	const W = 600;
	const geo = $derived(chartGeometry(series, W, height));
	const up = $derived(series.length > 1 ? series[series.length - 1].close >= series[0].close : true);
	const summary = $derived(
		series.length
			? `${label}: ${series.length} closes from ${price(series[0].close)} to ${price(series[series.length - 1].close)}, ${up ? 'up' : 'down'} overall.`
			: `${label}: no closes yet.`
	);
</script>

<figure class="sk-chart" class:down={!up} data-testid="sk-chart">
	{#if geo}
		<svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" role="img" aria-label={summary} style="height:{height}px">
			<path class="sk-area" d={geo.area} />
			<path class="sk-line" d={geo.line} vector-effect="non-scaling-stroke" />
			{#each geo.points.filter((p) => p.carried) as p (p.day)}
				<line class="sk-carried" x1={p.x} x2={p.x} y1={height - 2} y2={height - 10} vector-effect="non-scaling-stroke" />
			{/each}
		</svg>
		{#if axis}
			<figcaption class="sk-axis">
				<span>Low {price(geo.min)}</span>
				<span>High {price(geo.max)}</span>
			</figcaption>
		{/if}
	{:else}
		<p class="mk-empty">No closes yet. The first one comes after the next class day.</p>
	{/if}
</figure>
