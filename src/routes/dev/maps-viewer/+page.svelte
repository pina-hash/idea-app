<script lang="ts">
	import { page } from '$app/state';
	import type { MapsSearchRow } from '$lib/maps/transports';
	import '$lib/shell/split.css';
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

	let { data }: { data: { state: string | null; initialResults: MapsSearchRow[] } } = $props();
</script>

<svelte:head>
	<title>maps-viewer harness</title>
</svelte:head>

<!-- THE SAME APPLICATION FRAME THE ROUTE USES: a bar of chrome that measures
     itself (the state list) and a body that takes the rest, so the geometry
     the harness measures is the shipping geometry. A harness note ABOVE the
     frame would have handed the viewer a window minus a line nobody could
     predict; inside it, the body simply takes what is left. -->
<main class="harness cr-app">
	<p class="harness-note">
		Dev harness: the real MapsViewer over published-only fixture data, with an in-memory
		search transport. States:
		{#each Object.keys(STATES) as name, i (name)}{#if i > 0}, {/if}<a
				href={`/dev/maps-viewer?state=${name}`}>{name}</a
			>{/each}.
	</p>
	<div class="cr-app-body">
		{#key data.state}
			<MapsViewer data={fixture} {search} {transports} initialResults={data.initialResults} />
		{/key}
	</div>
</main>

<style>
	/* The route's own shell releases app.css's 880px reading `main` the same
	   way; the harness must too, or it measures a map pane the route does
	   not have. */
	.harness {
		min-height: 0;
		max-width: none;
		margin: 0;
		padding: 0;
	}
	.harness-note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--dim);
		padding: 0.4rem 1rem;
	}
</style>
