<script lang="ts">
	import { page } from '$app/state';
	import MapsViewer from '$lib/maps/viewer/MapsViewer.svelte';
	import { mapsViewerFixture, memoryMapsViewerTransports, VFIX } from './fixture';

	// One living fixture and one transport for the page's life, so the search
	// log the harness accumulates is the same object across navigations.
	const fixture = mapsViewerFixture();
	const transports = memoryMapsViewerTransports(fixture);

	/**
	 * A named state is a POSITION, expressed the way the viewer expresses one:
	 * a query string. The harness rewrites `?state=` into the real parameters
	 * so the component sees exactly what a shared link would give it, and the
	 * browser pass can drive `?state=stage-room` without knowing the fixture's
	 * uuids.
	 */
	const STATES: Record<string, string> = {
		directory: '',
		room: `at=${VFIX.machineShop}`,
		unit: `at=${VFIX.toolChest}`,
		compartment: `at=${VFIX.drawer1}`,
		'thin-stack': `at=${VFIX.partsCabinet}`,
		item: `at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`,
		search: 'q=caliper',
		'stage-start': `to=item:${VFIX.shopCaliper}&q=caliper`,
		'stage-room': `at=${VFIX.building}&to=item:${VFIX.shopCaliper}&q=caliper`,
		'stage-unit': `at=${VFIX.machineShop}&to=item:${VFIX.shopCaliper}&q=caliper`,
		'stage-elevation': `at=${VFIX.toolChest}&to=item:${VFIX.shopCaliper}&q=caliper`,
		'stage-end': `at=${VFIX.drawer1}&item=${VFIX.shopCaliper}&to=item:${VFIX.shopCaliper}&q=caliper`
	};

	/**
	 * The URL the component is given. When `?state=` names one, the harness's
	 * own parameters win; otherwise the real query string is passed straight
	 * through, so a person can navigate out of a state by clicking.
	 */
	const search = $derived.by(() => {
		const named = data.state ? STATES[data.state] : undefined;
		if (named === undefined) {
			const passthrough = new URLSearchParams(page.url.searchParams);
			passthrough.delete('state');
			return passthrough;
		}
		return new URLSearchParams(named);
	});

	let { data }: { data: { state: string | null } } = $props();
</script>

<svelte:head>
	<title>maps-viewer harness</title>
</svelte:head>

<main class="harness">
	<p class="harness-note">
		Dev harness: the real MapsViewer over published-only fixture data, with an in-memory
		search transport. States:
		{#each Object.keys(STATES) as name, i (name)}{#if i > 0}, {/if}<a
				href={`/dev/maps-viewer?state=${name}`}>{name}</a
			>{/each}.
	</p>
	{#key data.state}
		<MapsViewer data={fixture} {search} {transports} />
	{/key}
</main>

<style>
	.harness {
		padding: 0 1rem 2rem;
		max-width: 90rem;
		margin: 0 auto;
	}
	.harness-note {
		font-size: 0.8rem;
		color: var(--dim);
		padding: 0.6rem 0;
	}
</style>
