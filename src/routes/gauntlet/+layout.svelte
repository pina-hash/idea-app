<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import '$lib/gauntlet/viewport/viewport.css';
	import ViewportBackground from '$lib/gauntlet/viewport/ViewportBackground.svelte';
	import CursorLayer from '$lib/gauntlet/viewport/CursorLayer.svelte';
	import FeatureTreeNav from '$lib/gauntlet/viewport/FeatureTreeNav.svelte';
	import GauntletFoot from '$lib/gauntlet/GauntletFoot.svelte';
	import { entranceSweep } from '$lib/gauntlet/viewport/motion';

	/**
	 * GAUNTLET section layout: mounts the VIEWPORT design system's ambient
	 * pieces once, so every current and future /gauntlet page inherits them.
	 * Visual layer only: no data loading, no auth, no route logic here (the
	 * signed-in guard stays in hooks.server.ts).
	 * System reference: docs/GAUNTLET-DESIGN.md.
	 */

	let { children } = $props();

	/*
	 * THE FEEDBACK BUTTON IS THE SITE'S, IN THE SITE'S PLACE (ledger 0396, Mr.
	 * Pina: GAUNTLET "is not an exception"). It used to be relocated into the
	 * footer below, which put it at the bottom of every scroll -- present but
	 * hidden -- and laid out unlike everywhere else. The root layout's
	 * `SiteFeedback` now draws it on every /gauntlet page, floating at the bottom
	 * right like the home page's, opening the same window. It wears GAUNTLET's
	 * colours through the room hooks `SiteFeedback` declares on
	 * `body:has(.gt-root)`, tokens only: the VIEWPORT's own stylesheet is not
	 * touched.
	 */

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
	<div class="gt-vignette" aria-hidden="true"></div>
	<CursorLayer />
	<FeatureTreeNav />
	<div class="gt-content">
		{@render children()}
		<!-- The trademark disclaimer and the build stamp, clear of the
		     feedback button's corner; the shell harness mounts the same foot. -->
		<GauntletFoot />
	</div>
</div>
