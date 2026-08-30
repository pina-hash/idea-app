<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import ShelfEntry from '$lib/maps/ShelfEntry.svelte';
	import { mapsPhotoTransports, mapsTransports } from '$lib/maps/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* The route owns the load and the transports; the component owns the
	   arrangement -- the same split the editor page makes, so the dev harness
	   can mount the identical component with in-memory ones. The browser client
	   is stable for the life of the page, so capturing it once is deliberate. */
	const transports = untrack(() => mapsTransports(data.supabase));
	const photos = untrack(() => mapsPhotoTransports(data.supabase as never));
</script>

<svelte:head>
	<title>Shelf entry - IDEA Maps</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="shelf-page">
	<nav class="back">
		<a href="/maps/edit">&larr; The whole map</a>
		<ProfileMenu />
	</nav>
	<ShelfEntry
		data={data.maps}
		{transports}
		{photos}
		initialContainerId={data.containerId}
		viewerId={data.claims?.sub ?? null}
		supabaseUrl={PUBLIC_SUPABASE_URL}
		onchanged={async () => {
			await invalidateAll();
		}}
	/>
</main>

<style>
	.shelf-page {
		/* A PHONE HELD IN ONE HAND IS THE PRIMARY WIDTH, so the page is a single
		   measure with real side padding and no split -- the master-detail shell
		   the editor uses is desktop chrome and would be a tree to walk on the
		   one surface whose whole point is not walking one. */
		max-width: 44rem;
		margin: 0 auto;
		padding: 0.8rem 1rem 3rem;
		min-width: 0;
	}
	.back {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-bottom: 0.6rem;
	}
	.back a {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		color: var(--cyan);
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
</style>
