<script lang="ts">
	import BladeEditor from '$lib/ideacad/BladeEditor.svelte';
</script>

<svelte:head><title>IdeaCAD layout preview</title></svelte:head>
<main><BladeEditor standalone /></main>

<style>
	:global(html), :global(body), main { width: 100%; height: 100%; overflow: hidden; }
	:global(body) { margin: 0; }
</style>
