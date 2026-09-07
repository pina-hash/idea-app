<script lang="ts">
	import MapsEditorShell from '$lib/maps/MapsEditorShell.svelte';
	import GrantAdmin from '$lib/maps/GrantAdmin.svelte';
	import type { MapsSelection } from '$lib/maps/maps';
	import { FIX, mapsEditFixture, memoryMapsTransports } from '../maps-edit/fixture';
	import { memoryGrantTransports } from '../maps-grants/fixture';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One living fixture for the page's life: edits made while driving the
	// harness survive a state switch, the way a real backend's rows would.
	const fixture = mapsEditFixture();
	const transports = memoryMapsTransports(fixture);
	const grantTransports = memoryGrantTransports();

	const SELECTIONS: Record<string, MapsSelection> = {
		root: { kind: 'node', id: FIX.building },
		room: { kind: 'node', id: FIX.machineShop },
		place: { kind: 'node', id: FIX.workbench },
		unit: { kind: 'node', id: FIX.toolChest },
		compartment: { kind: 'node', id: FIX.drawer1 },
		pending: { kind: 'node', id: FIX.millRoom },
		'new-root': { kind: 'new-node', parentId: null, presetKind: 'building' },
		'new-room': { kind: 'new-node', parentId: FIX.building, presetKind: 'room' },
		type: { kind: 'type', id: FIX.caliperType }
	};
	const initialSelection = $derived(data.state ? (SELECTIONS[data.state] ?? null) : null);
</script>

<svelte:head>
	<title>maps-editor harness</title>
</svelte:head>

{#snippet editors()}
	<GrantAdmin nodes={fixture.nodes} transports={grantTransports} />
{/snippet}

<!-- The harness note sits INSIDE the shell's own flow rather than above it: the
     shell is the viewport above 1024px, and a paragraph above it would push the
     workspace below the fold on the one page whose geometry is being measured.
     The states are reachable from the URL and listed in +page.ts. -->
<div class="harness" data-harness-state={data.state ?? 'overview'}>
	{#key data.state}
		<MapsEditorShell initial={fixture} {transports} {initialSelection} {editors} />
	{/key}
</div>

<style>
	.harness {
		min-width: 0;
	}
</style>
