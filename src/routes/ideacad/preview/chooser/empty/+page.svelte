<script lang="ts">
	/**
	 * THE EMPTY CHOOSER, DEV ONLY, mounting the same real component.
	 *
	 * It is a SEPARATE ROUTE rather than a toggle on the populated one because
	 * the empty state is a different arrangement -- the starters become the
	 * primary action in place of a "Recent documents" section -- and a route
	 * that has to be driven into the state under test is one the browser pass
	 * can silently measure in the wrong state.
	 */
	import type { SupabaseClient } from '@supabase/supabase-js';
	import IdeaCadApp from '$lib/ideacad/app/IdeaCadApp.svelte';

	const supabase = {} as SupabaseClient;
</script>

<svelte:head><title>IdeaCAD chooser preview, empty</title></svelte:head>
<IdeaCadApp
	{supabase}
	userId="preview-user"
	documents={[]}
	sources={[
		{ itemId: 'i3', title: 'Blade design workspace' },
		{ itemId: 'i5', title: 'Hub and mount practice' }
	]}
	initialLayout={{ left: 260, right: 240, leftOpen: true, rightOpen: true }}
/>
