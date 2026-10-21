<script lang="ts">
	import { chartGeometry, price, shortDay, type StockPoint } from './stocks';

	/**
	 * A price history as plain SVG (no chart library is installed, and none is
	 * wanted): every price change since the launch, oldest left. The line is
	 * green on a rise and amber on a fall, and the words beside it say the
	 * same, so colour is never the only signal.
	 */
	let {
		series,
		label,
		height = 120,
		axis = true
	}: { series: StockPoint[]; label: string; height?: number; axis?: boolean } = $props();

	const W = 600;
	const geo = $derived(chartGeometry(series, W, height));
	// The axis says the real low and high; the drawing pads a flat line.
	const low = $derived(series.length ? Math.min(...series.map((p) => p.close)) : 0);
	const high = $derived(series.length ? Math.max(...series.map((p) => p.close)) : 0);
	const up = $derived(series.length > 1 ? series[series.length - 1].close >= series[0].close : true);
	const summary = $derived(
		series.length
			? `${label}: ${series.length} prices since ${shortDay(series[0].at)}, from ${price(series[0].close)} to ${price(series[series.length - 1].close)}, ${up ? 'up' : 'down'} overall.`
			: `${label}: no prices yet.`
	);
</script>

<figure class="sk-chart" class:down={!up} data-testid="sk-chart">
	{#if geo}
		<svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" role="img" aria-label={summary} style="height:{height}px">
			<path class="sk-area" d={geo.area} />
			<path class="sk-line" d={geo.line} vector-effect="non-scaling-stroke" />
		</svg>
		{#if axis}
			<figcaption class="sk-axis">
				<span>Low {price(low)}</span>
				<span>Since {shortDay(series[0].at)}</span>
				<span>High {price(high)}</span>
			</figcaption>
		{/if}
	{:else}
		<p class="mk-empty">No prices yet. The first one comes with the next update.</p>
	{/if}
</figure>
