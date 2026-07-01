<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import '$lib/gauntlet/viewport/viewport.css';
	import ViewportBackground from '$lib/gauntlet/viewport/ViewportBackground.svelte';
	import CursorLayer from '$lib/gauntlet/viewport/CursorLayer.svelte';
	import FeatureTreeNav from '$lib/gauntlet/viewport/FeatureTreeNav.svelte';
	import TrademarkFooter from '$lib/gauntlet/viewport/TrademarkFooter.svelte';
	import { entranceSweep } from '$lib/gauntlet/viewport/motion';

	/**
	 * GAUNTLET section layout: mounts the VIEWPORT design system's ambient
	 * pieces once, so every current and future /gauntlet page inherits them.
	 * Visual layer only: no data loading, no auth, no route logic here (the
	 * signed-in guard stays in hooks.server.ts).
	 * System reference: docs/GAUNTLET-DESIGN.md.
	 */

	let { children } = $props();

	// Staggered entrance for every page's top-level blocks, re-run per
	// navigation so future pages get the choreography with zero wiring.
	afterNavigate(async () => {
		await tick();
		const main = document.querySelector<HTMLElement>('.gt-root main.gauntlet');
		if (main) entranceSweep(main);
	});
</script>

<div class="gt-root">
	<ViewportBackground />
	<CursorLayer />
	<FeatureTreeNav />
	<div class="gt-content">
		{@render children()}
		<TrademarkFooter />
	</div>
</div>
