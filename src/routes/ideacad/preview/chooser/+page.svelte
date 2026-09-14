<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import IdeaCadApp from '$lib/ideacad/app/IdeaCadApp.svelte';

	/* No transport runs before a document is chosen. This inert client lets the
	 * dev-only route mount the real chooser rather than maintaining a visual copy. */
	const supabase = {} as SupabaseClient;
</script>

<svelte:head><title>IdeaCAD chooser preview</title></svelte:head>
<IdeaCadApp
	{supabase}
	userId="preview-user"
	documents={[
		{ id: 'preview-1', itemId: 'blade-1', title: 'Competition blade study', updatedAt: '2026-09-14T12:00:00Z' },
		{ id: 'preview-2', itemId: 'blade-2', title: 'Weight distribution test', updatedAt: '2026-09-12T12:00:00Z' }
	]}
	sources={[{ itemId: 'blade-3', title: 'Blade design workspace' }]}
	initialLayout={{ left: 260, right: 240, leftOpen: true, rightOpen: true }}
/>
