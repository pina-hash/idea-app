<script lang="ts">
	/**
	 * THE CHOOSER, DEV ONLY, MOUNTING THE REAL COMPONENT.
	 *
	 * No transport runs before a document is chosen, so this inert client lets
	 * the route mount `IdeaCadApp` itself rather than maintaining a visual copy
	 * of it -- the harness rule: mount the component under test, never a
	 * hand-rolled replica of its markup.
	 *
	 * THE FIXTURE IS CHOSEN TO REACH EVERY BRANCH, which is what makes the
	 * browser pass worth running: eight documents (past
	 * `IDEACAD_CHOOSER_CONTROLS_AT`, so the search, the filters and the sort are
	 * all drawn), a mix of owned and other people's, one archived, one with no
	 * readable profile, one with a long title, and the manager's archive control
	 * on exactly the rows a manager would have it on.
	 */
	import type { SupabaseClient } from '@supabase/supabase-js';
	import IdeaCadApp from '$lib/ideacad/app/IdeaCadApp.svelte';
	import { bladeWorkspace } from '$lib/ideacad/blade/workspace';
	import { ideaCadProfileSketch, type IdeaCadDocumentSummary } from '$lib/ideacad/app/types';

	const supabase = {} as SupabaseClient;

	/* THE TREE IS THE REAL DEFAULT, read through the workspace rather than typed
	   out here: a fixture the producer cannot emit proves nothing about the
	   thumbnail, and a hand-written station list is exactly that. */
	const tree = bladeWorkspace.defaultContext.config.defaultFeatures as unknown;
	const profile = ideaCadProfileSketch(tree);

	const hour = 3_600_000;
	const at = (ago: number) => new Date(Date.now() - ago).toISOString();

	const documents: IdeaCadDocumentSummary[] = [
		{ id: 'p1', itemId: 'i1', title: 'Competition blade study', updatedAt: at(4 * 60_000), ownerEmail: 'you@boscotech.net', isOwn: true, archivedAt: null, conceptCount: 3, profile, canArchive: false },
		{ id: 'p2', itemId: 'i1', title: 'Competition blade study', updatedAt: at(3 * hour), ownerEmail: 'reyes.ana@boscotech.net', isOwn: false, archivedAt: null, conceptCount: 2, profile, canArchive: true },
		{ id: 'p3', itemId: 'i1', title: 'Competition blade study', updatedAt: at(26 * hour), ownerEmail: 'okafor.dayo@boscotech.net', isOwn: false, archivedAt: at(2 * hour), conceptCount: 5, profile, canArchive: true },
		{ id: 'p4', itemId: 'i1', title: 'Competition blade study', updatedAt: at(3 * 24 * hour), ownerEmail: 'tran.minh@boscotech.net', isOwn: false, archivedAt: null, conceptCount: 1, profile: null, canArchive: true },
		{ id: 'p5', itemId: 'i2', title: 'Weight distribution test', updatedAt: at(30 * 60_000), ownerEmail: 'you@boscotech.net', isOwn: true, archivedAt: null, conceptCount: 4, profile, canArchive: false },
		{ id: 'p6', itemId: 'i2', title: 'Weight distribution test', updatedAt: at(9 * 24 * hour), ownerEmail: 'silva.marcos@boscotech.net', isOwn: false, archivedAt: null, conceptCount: 0, profile: null, canArchive: false },
		{ id: 'p7', itemId: 'i4', title: 'Second semester impeller and hub assembly review, revision C', updatedAt: at(2 * 24 * hour), ownerEmail: 'you@boscotech.net', isOwn: true, archivedAt: null, conceptCount: 6, profile, canArchive: false },
		{ id: 'p8', itemId: 'i4', title: 'Second semester impeller and hub assembly review, revision C', updatedAt: at(52 * 24 * hour), ownerEmail: 'nguyen.kim@boscotech.net', isOwn: false, archivedAt: null, conceptCount: 2, profile, canArchive: true }
	];
</script>

<svelte:head><title>IdeaCAD chooser preview</title></svelte:head>
<IdeaCadApp
	{supabase}
	userId="preview-user"
	{documents}
	sources={[
		{ itemId: 'i3', title: 'Blade design workspace' },
		{ itemId: 'i5', title: 'Hub and mount practice' }
	]}
	initialLayout={{ left: 260, right: 240, leftOpen: true, rightOpen: true }}
/>
