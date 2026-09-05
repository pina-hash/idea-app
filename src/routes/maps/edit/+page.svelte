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
	import GrantAdmin from '$lib/maps/GrantAdmin.svelte';
	import { mapsGrantTransports, mapsTransportsFor } from '$lib/maps/transports';
	import { MAPS_ADMIN_SCOPE } from '$lib/maps/grants';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const scope = $derived(data.mapsScope ?? MAPS_ADMIN_SCOPE);

	/* PUBLISHING IS REMOVED BY OMITTING THE TRANSPORT, never by a flag: 0172
	   keeps `maps_publish` admin-only in its own body, so a granted editor is
	   handed a transports object with no `publish` and every publish control
	   in the tree has nothing to call. Read-only-as-to-publishing is then
	   structural (CLAUDE.md: "an omitted optional transport REMOVES the
	   control it drives") rather than a discipline six components have to
	   remember. The browser client is stable for the life of the page, so the
	   captures are deliberate and untrack says so. */
	const transports = untrack(() => mapsTransportsFor(data.supabase, data.mapsScope ?? MAPS_ADMIN_SCOPE));
	/* The grant console is a THIRD injected object, handed in only for an
	   admin -- so for everybody else it is not on the page at all. */
	const grantTransports = untrack(() =>
		data.mapsScope?.admin === false ? null : mapsGrantTransports(data.supabase)
	);
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

		<MapsEditor initial={data.maps} {transports} {scope} />

		{#if grantTransports}
			<section class="grants">
				<GrantAdmin nodes={data.maps.nodes} transports={grantTransports} />
			</section>
		{/if}

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
	.grants {
		margin-top: 2rem;
	}
	.page-footer {
		margin-top: 2rem;
	}
</style>
