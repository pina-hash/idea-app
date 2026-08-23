<script lang="ts">
	/**
	 * The route loads the generated text and mounts the component; the dev
	 * harness mounts the same component with the same text. Nothing about the
	 * page lives here.
	 */
	import FoundryContract from '$lib/foundry/FoundryContract.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Build contract // IDEA Foundry</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="fdy-page">
	<FoundryContract contract={data.contract} />
</div>

<style>
	.fdy-page {
		padding: var(--space-4, 1rem) var(--cr-gutter, 1rem);
	}
</style>
