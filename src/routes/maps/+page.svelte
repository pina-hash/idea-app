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
	 * THE PAGE IS AN APPLICATION FRAME, `.cr-app` + `.cr-app-body`, the shape
	 * split.css provides for a room that IS the viewport (prompt 0112): above
	 * the breakpoint the map takes the window, below it the document scrolls
	 * as every phone page does. The portal chrome -- logo, the way into the
	 * editor, Home, the account menu -- is handed to the viewer as a snippet
	 * and rendered at the top of ITS panel, the way a map puts its own mark
	 * inside the search panel rather than on a bar above the whole map. A
	 * `maps/+layout.svelte` would also wrap `/maps/edit`, which renders its
	 * own header, so the chrome stays here. `ProfileMenu` renders NOTHING when
	 * signed out (its own rule), so the same row is correct for an anonymous
	 * visitor and for an admin who wandered in.
	 */
	import { page } from '$app/state';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import '$lib/shell/split.css';
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

{#snippet chrome()}
	<a class="logo-mark mv-logo" href="/" aria-label="IDEA home"><AnimatedLogo width={88} /></a>
	<div class="mv-chrome-right">
		<MapsEditEntry scope={entryScope} />
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
{/snippet}

{#snippet footer()}
	<VersionBadge app="maps" />
{/snippet}

<main class="mv-shell cr-app" data-testid="maps-viewer-shell">
	<div class="cr-app-body">
		<MapsViewer
			data={data.maps}
			search={page.url.searchParams}
			supabaseUrl={PUBLIC_SUPABASE_URL}
			{transports}
			initialResults={data.mapsSearchResults}
			notice={data.mapsError ? 'The map could not be loaded. Try again in a moment.' : null}
			{chrome}
			{footer}
		/>
	</div>
</main>

<style>
	/* `main` in app.css is a reading column: 880px, centred, padded. This
	   main is the application frame, and it takes the window. */
	.mv-shell {
		min-height: 0;
		max-width: none;
		margin: 0;
		padding: 0;
	}
	.mv-logo {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.mv-chrome-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
