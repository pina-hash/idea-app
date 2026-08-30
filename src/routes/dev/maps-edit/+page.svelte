<script lang="ts">
	import MapsEditor from '$lib/maps/MapsEditor.svelte';
	import type { MapsSelection } from '$lib/maps/maps';
	import { FIX, mapsEditFixture, memoryMapsTransports } from './fixture';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One living fixture for the page's life: edits made while driving the
	// harness survive a state switch, the way a real backend's rows would.
	const fixture = mapsEditFixture();
	const transports = memoryMapsTransports(fixture);

	const SELECTIONS: Record<string, MapsSelection> = {
		'node-pending': { kind: 'node', id: FIX.millRoom },
		compartment: { kind: 'node', id: FIX.drawer1 },
		unit: { kind: 'node', id: FIX.toolChest },
		place: { kind: 'node', id: FIX.workbench },
		'type-pending': { kind: 'type', id: FIX.hexKeyType },
		'new-root': { kind: 'new-node', parentId: null, presetKind: null }
	};
	const initialSelection = $derived(data.state ? (SELECTIONS[data.state] ?? null) : null);
</script>

<svelte:head>
	<title>maps-edit harness</title>
</svelte:head>

<main class="harness">
	<p class="harness-note">
		Dev harness: the real MapsEditor over fixture data, in-memory transports.
		States: <a href="/dev/maps-edit">none</a>, <a href="/dev/maps-edit?state=node-pending">node-pending</a>,
		<a href="/dev/maps-edit?state=compartment">compartment</a>, <a href="/dev/maps-edit?state=unit">unit</a>, <a href="/dev/maps-edit?state=place">place</a>,
		<a href="/dev/maps-edit?state=type-pending">type-pending</a>, <a href="/dev/maps-edit?state=new-root">new-root</a>.
	</p>
	{#key data.state}
		<MapsEditor initial={fixture} {transports} {initialSelection} />
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
	.harness-note a {
		color: var(--cyan);
	}
</style>
