<script lang="ts">
	/**
	 * `/maps` -- the public viewer. The route owns the load and the transports;
	 * `MapsViewer` is the whole screen and the dev harness mounts the identical
	 * component with an in-memory transport.
	 *
	 * THE SEARCH TRANSPORT IS BUILT OVER `page.data.supabase`, the same browser
	 * client every other surface uses. It carries the anon key and no session
	 * for a signed-out visitor, which is exactly what `maps_search` is granted
	 * to (0162 grants it to `anon` deliberately). Nothing on this page asks who
	 * the caller is.
	 *
	 * THE MASTHEAD IS THE PAGE'S OWN, NOT A `maps/+layout.svelte`, AND THAT IS
	 * DELIBERATE. A layout at `src/routes/maps/` would also wrap
	 * `/maps/edit` and `/maps/edit/shelf`, which render their own header --
	 * so the viewer would silently put a second masthead on top of the editor,
	 * a surface this lane does not own and must not change. `ProfileMenu`
	 * renders NOTHING when signed out (its own rule), so the same header is
	 * correct for an anonymous visitor and for an admin who wandered in.
	 */
	import { page } from '$app/state';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import MapsViewer from '$lib/maps/viewer/MapsViewer.svelte';
	import MapsEditEntry from '$lib/maps/MapsEditEntry.svelte';
	import {
		loadMapsScope,
		mapsViewerTransports,
		type MapsPublicClient,
		type MapsWriteClient
	} from '$lib/maps/transports';
	import { MAPS_ADMIN_SCOPE, type MapsEditorScope } from '$lib/maps/grants';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const transports = $derived(
		page.data.supabase
			? mapsViewerTransports(page.data.supabase as unknown as MapsPublicClient)
			: null
	);

	/* THE WAY INTO THE EDITOR (prompt 0093). A site admin's scope is known on
	   the server -- the root layout puts `isAdmin` on page data -- so the
	   control is in the first render for them. A signed-in NON-admin may hold
	   an editor grant (0172), which only `maps_my_editor_grants` can say: it
	   is asked once after hydration, through the same browser client the
	   search uses, and the control appears when the answer is yes. A signed-out
	   visitor asks nothing and sees nothing: the existence of an editor lane is
	   not something the public map advertises. This resolves ONLY whether the
	   control is offered; the route under `/maps/edit` keeps its own 404. */
	const isAdmin = $derived(Boolean(page.data.isAdmin));
	let probedScope = $state<MapsEditorScope | null>(null);
	const entryScope = $derived<MapsEditorScope | null>(isAdmin ? MAPS_ADMIN_SCOPE : probedScope);
	onMount(() => {
		if (isAdmin || !page.data.claims || !page.data.supabase) return;
		let live = true;
		loadMapsScope(page.data.supabase as unknown as MapsWriteClient, false).then((scope) => {
			if (live) probedScope = scope;
		});
		return () => {
			live = false;
		};
	});
</script>

<svelte:head>
	<title>IDEA Maps</title>
	<meta
		name="description"
		content="Find where anything in the IDEA shop lives: buildings, rooms, toolboxes, drawers and what is in them."
	/>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<MapsEditEntry scope={entryScope} />
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

{#if data.mapsError}
	<p class="mv-load-error" role="status">
		The map could not be loaded. Try again in a moment.
	</p>
{/if}

<MapsViewer
	data={data.maps}
	search={page.url.searchParams}
	supabaseUrl={PUBLIC_SUPABASE_URL}
	{transports}
	initialResults={data.mapsSearchResults}
/>

<footer class="mv-footer">
	<VersionBadge app="maps" />
</footer>

<style>
	.mv-footer {
		max-width: 78rem;
		margin: 0 auto;
		padding: 0 var(--space-4) var(--space-6);
	}
	.mv-load-error {
		max-width: 78rem;
		margin: var(--space-4) auto 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--crimson);
		border-radius: var(--radius-card);
		color: var(--crimson);
		font-family: var(--font-display);
	}
</style>
