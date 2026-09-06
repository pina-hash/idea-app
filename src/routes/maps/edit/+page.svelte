<script lang="ts">
	/**
	 * The route for the maps editor: the load's payload and the transports,
	 * handed to `MapsEditorShell`, which is the whole screen -- chrome bar and
	 * workspace -- and is what the `/dev/maps-editor` harness mounts too. The
	 * transports are built over the caller's own browser client: the writes go
	 * through 0161's `is_admin()` RLS policies, which is this feature's stated
	 * write path, and `maps_publish` is the one RPC.
	 */
	import { untrack } from 'svelte';
	import MapsEditorShell from '$lib/maps/MapsEditorShell.svelte';
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
	   admin -- so for everybody else it is not on the page at all, and the
	   workspace renders no Editors tab. */
	const grantTransports = untrack(() =>
		data.mapsScope?.admin === false ? null : mapsGrantTransports(data.supabase)
	);
</script>

<svelte:head>
	<title>Maps Editor // IDEA</title>
</svelte:head>

{#snippet editors()}
	{#if grantTransports}
		<GrantAdmin nodes={data.maps.nodes} transports={grantTransports} />
	{/if}
{/snippet}

<MapsEditorShell
	initial={data.maps}
	{transports}
	{scope}
	editors={grantTransports ? editors : null}
/>
