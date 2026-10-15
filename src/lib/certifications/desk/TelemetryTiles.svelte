<script lang="ts">
	/**
	 * The live tiles: a figure and its word, each a recessed stat panel, two to
	 * a line on a phone and six across at 1440 (`.dk-tiles`). Every number is
	 * the function's own, never derived here.
	 */
	import type { DeskJson, TelemetryJson } from '$lib/certifications/types';
	import { telemetryTiles } from './desk';

	let { desk, telemetry }: { desk: DeskJson | null; telemetry: TelemetryJson | null } = $props();
	const tiles = $derived(telemetryTiles(desk, telemetry));
</script>

<section id="tiles" aria-labelledby="cert-tiles-h" data-testid="cert-desk-tiles">
	<h2 class="cert-section-h" id="cert-tiles-h">Right now</h2>
	<div class="dk-tiles">
		{#each tiles as tile (tile.id)}
			<div class="dk-tile cert-readout-tile" data-testid="cert-tile" data-tile={tile.id}>
				<span class="dk-tile-figure" data-testid="cert-tile-figure">{tile.value}</span>
				<span class="dk-tile-word">{tile.word}</span>
			</div>
		{/each}
	</div>
</section>
