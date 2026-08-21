<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { version as buildId } from '$app/environment';
	import { deploy } from 'virtual:site-versions';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { feedbackWriter } from '$lib/feedback/feedback';
	import { describeBuild } from '$lib/feedback/context';
	import '$lib/gauntlet/viewport/viewport.css';
	import ViewportBackground from '$lib/gauntlet/viewport/ViewportBackground.svelte';
	import CursorLayer from '$lib/gauntlet/viewport/CursorLayer.svelte';
	import FeatureTreeNav from '$lib/gauntlet/viewport/FeatureTreeNav.svelte';
	import TrademarkFooter from '$lib/gauntlet/viewport/TrademarkFooter.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { entranceSweep } from '$lib/gauntlet/viewport/motion';

	/**
	 * GAUNTLET section layout: mounts the VIEWPORT design system's ambient
	 * pieces once, so every current and future /gauntlet page inherits them.
	 * Visual layer only: no data loading, no auth, no route logic here (the
	 * signed-in guard stays in hooks.server.ts).
	 * System reference: docs/GAUNTLET-DESIGN.md.
	 */

	let { children } = $props();

	/**
	 * THE GAUNTLET EXCLUSION, RELOCATED. /gauntlet is excluded from the shell's
	 * floating control by category: the VIEWPORT owns its own chrome, and a
	 * portal-styled pill floating over a timed run is both off-brand and in the
	 * way. It reappears HERE, in the footer this layout already renders on every
	 * gauntlet page, so the relocation has exactly the same coverage the
	 * exclusion does -- a new mode added under /gauntlet inherits both.
	 *
	 * Not the FeatureManager rail: that is hidden by default and display:none
	 * below 1440px, so the only affordance on a phone would be no affordance.
	 */
	const build = describeBuild(deploy, buildId);
	const submit = $derived(
		page.data.supabase ? feedbackWriter(page.data.supabase, page.data.claims?.sub) : null
	);

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
		<TrademarkFooter />
		<p class="gt-version"><VersionBadge app="gauntlet" /></p>
		<p class="gt-feedback">
			<SiteFeedback
				place="relocated"
				routeId={page.route.id}
				pathname={page.url.pathname}
				role={page.data.userProfile?.role ?? null}
				{build}
				{submit}
			/>
		</p>
	</div>
</div>

<style>
	.gt-version {
		text-align: center;
		padding: 0 1.5rem 0.6rem;
		margin: 0;
	}
	.gt-feedback {
		display: flex;
		justify-content: center;
		padding: 0 1.5rem 1.5rem;
		margin: 0;
	}
</style>
