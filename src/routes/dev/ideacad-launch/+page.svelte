<!--
  THE LAUNCH PAGE HARNESS: the REAL `LaunchPage` over an in-memory api seeded
  with own documents in folders, a shared one, a linked assignment one, an
  archived one and a trashed one. No auth, no Supabase; 404 in production
  (`+page.ts`). Opening a document records the id here rather than mounting
  the workspace, which has its own harness at `/dev/ideacad-solid`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import LaunchPage from '$lib/ideacad/solid/launch/LaunchPage.svelte';
	import { createMemoryLaunchApi } from '$lib/ideacad/solid/launch/memory';
	import { FIXTURE_DOCUMENTS, FIXTURE_FOLDERS, FIXTURE_TRASH } from '$lib/ideacad/solid/launch/fixture';
	const api = createMemoryLaunchApi({ documents: FIXTURE_DOCUMENTS, folders: FIXTURE_FOLDERS, trash: FIXTURE_TRASH });
	let opened = $state('');
	onMount(() => { (window as unknown as { ideaCadLaunch: unknown }).ideaCadLaunch = { api, opened: () => opened }; });
</script>
<svelte:head><title>IdeaCAD launch page · Development</title></svelte:head>
<main>
	{#if opened}<p class="opened" role="status" data-testid="opened">Opened {opened}</p>{/if}
	<LaunchPage {api} rows={api.state.documents} folders={api.state.folders} onopen={(id) => (opened = id)} />
</main>
<style>
	main { max-width: none; margin: 0; padding: 0; min-height: 100vh; background: #0e1114; }
	.opened { margin: 0; padding: 0.5rem 0.75rem; font: 14px/1.3 'Share Tech Mono', monospace; color: #e6e9ec; background: #123222; }
</style>
