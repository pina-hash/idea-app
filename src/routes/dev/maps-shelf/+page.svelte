<script lang="ts">
	import ShelfEntry from '$lib/maps/ShelfEntry.svelte';
	import { FIX, shelfHarness } from './fixture';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One living harness for the page's life: entries made while driving it
	// survive, the way a real backend's rows would.
	const harness = shelfHarness();

	// A DETERMINISTIC UUID, so a route spec can assert the exact storage key a
	// capture produces. The real page uses crypto.randomUUID().
	let n = 0;
	const newUuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

	const containerId = $derived(data.state === 'no-container' ? null : FIX.drawer1);
	const photos = $derived(data.state === 'no-photos' ? null : harness.photos.transports);

	$effect(() => {
		if (data.state === 'fail-photo') harness.photos.failOnce();
	});
</script>

<svelte:head>
	<title>maps-shelf harness</title>
</svelte:head>

<main class="harness">
	<p class="harness-note">
		Dev harness: the real ShelfEntry over fixture data, in-memory transports. States:
		<a href="/dev/maps-shelf">drawer</a>, <a href="/dev/maps-shelf?state=no-container">no-container</a>,
		<a href="/dev/maps-shelf?state=no-photos">no-photos</a>,
		<a href="/dev/maps-shelf?state=fail-photo">fail-photo</a>.
	</p>
	{#key data.state}
		<ShelfEntry
			data={harness.data}
			transports={harness.transports}
			{photos}
			initialContainerId={containerId}
			viewerId="harness-viewer"
			supabaseUrl=""
			{newUuid}
			onchanged={async () => {}}
		/>
	{/key}
</main>

<style>
	.harness {
		padding: 0 1rem 3rem;
		max-width: 44rem;
		margin: 0 auto;
	}
	.harness-note {
		font-size: 0.8rem;
		color: var(--dim);
		padding: 0.6rem 0;
	}
	.harness-note a {
		color: var(--cyan);
	}
</style>
