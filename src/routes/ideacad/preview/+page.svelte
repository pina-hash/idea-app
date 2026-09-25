<script lang="ts">
	import BladeEditor from '$lib/ideacad/BladeEditor.svelte';
</script>

<svelte:head><title>IdeaCAD layout preview</title></svelte:head>
<main><BladeEditor standalone /></main>

<style>
	/* Fixed to the window rather than locking html and body, which a
	   client-side navigation would carry onto every later page (ledger 0298). */
	main { position: fixed; inset: 0; overflow: hidden; }
</style>
