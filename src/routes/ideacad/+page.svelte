<script lang="ts">
	import IdeaCadApp from '$lib/ideacad/app/IdeaCadApp.svelte';
	let { data } = $props();
</script>

<svelte:head><title>IdeaCAD</title><meta name="description" content="Full-screen browser CAD workspace." /></svelte:head>
<IdeaCadApp supabase={data.supabase} userId={data.userId} documents={data.documents} sources={data.sources} initialLayout={data.initialLayout} directDocuments={data.directDocuments} directError={data.directError}/>
