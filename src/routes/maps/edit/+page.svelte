<script lang="ts">
	/**
	 * The route shell for the admin maps editor: chrome above, the real
	 * MapsEditor below, transports built over the caller's own browser client
	 * -- the writes go through 0161's `is_admin()` RLS policies, which is this
	 * feature's stated write path, and `maps_publish` is the one RPC.
	 */
	import { untrack } from 'svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import MapsEditor from '$lib/maps/MapsEditor.svelte';
	import { mapsTransports } from '$lib/maps/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The browser client is stable for the life of the page; capturing it once
	// is deliberate.
	const transports = untrack(() => mapsTransports(data.supabase));
</script>

<svelte:head>
	<title>Maps Editor // IDEA</title>
</svelte:head>

<div class="maps-edit-shell">
	<div class="app-header">
		<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
		<div class="header-right">
			<a class="btn secondary" href="/dashboard">Dashboard</a>
			<a class="btn secondary" href="/">&lsaquo; Home</a>
			<ProfileMenu />
		</div>
	</div>

	<main class="maps-edit-page">
		<section class="hero">
			<div class="eyebrow">IDEA // Maps</div>
			<h1>Maps editor</h1>
		</section>

		<MapsEditor initial={data.maps} {transports} />

		<footer class="page-footer">
			<VersionBadge app="maps" />
		</footer>
	</main>
</div>

<style>
	.maps-edit-page {
		max-width: 90rem;
		margin: 0 auto;
		padding: 0 1rem 2rem;
	}
	.hero {
		padding: 1rem 0 0.8rem;
	}
	.hero h1 {
		margin: 0.1rem 0 0;
	}
	.page-footer {
		margin-top: 2rem;
	}
</style>
