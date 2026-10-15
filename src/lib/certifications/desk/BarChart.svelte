<script lang="ts">
	/**
	 * A plain-SVG horizontal bar chart (no chart library, the prompt's rule):
	 * one row per bar, the label on the left in the data's own words, the
	 * figure printed at the bar's end so the length is never the only signal,
	 * and a second bar under the first where a row carries two values. The
	 * classes are `cert.css`'s `.cert-chart` set, so every theme paints it.
	 * `barLayout` is the arithmetic and is testable without a browser.
	 */
	import { barLayout, type ChartBar } from './desk';

	let { bars, unit, title }: { bars: ChartBar[]; unit: string; title: string } = $props();

	const layout = $derived(barLayout(bars));
	const rowH = 26;
	const barH = $derived(bars.some((b) => b.second != null) ? 9 : 14);
</script>

<svg
	class="cert-chart"
	viewBox="0 0 {layout.width} {layout.height}"
	role="img"
	aria-label="{title}: {bars.map((b) => `${b.label} ${b.value} ${unit}${b.second != null ? `, ${b.second}` : ''}`).join('; ')}"
	data-bars={bars.length}
>
	<line class="axis" x1={layout.labelWidth} y1="0" x2={layout.labelWidth} y2={layout.height} />
	{#each layout.rows as row (row.label)}
		<g class="row" transform="translate(0 {row.y})" data-label={row.label}>
			<text x={layout.labelWidth - 6} y={rowH / 2 + 4} text-anchor="end">{row.label}</text>
			<rect class="bar {row.tone === 'warn' ? 'is-warn' : ''}" x={layout.labelWidth + 1} y={row.second == null ? (rowH - barH) / 2 : 3} width={row.w1} height={barH} rx="1" />
			<text x={layout.labelWidth + 1 + row.w1 + 5} y={row.second == null ? rowH / 2 + 4 : 3 + barH - 1}>{row.value}</text>
			{#if row.second != null}
				<rect class="bar {row.tone === 'warn' ? 'is-warn' : 'is-bad'}" x={layout.labelWidth + 1} y={rowH - 3 - barH} width={row.w2} height={barH} rx="1" />
				<text x={layout.labelWidth + 1 + row.w2 + 5} y={rowH - 4}>{row.second}</text>
			{/if}
		</g>
	{/each}
</svg>
