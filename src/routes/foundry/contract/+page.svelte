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
	<!-- The contract is a reference INSIDE the publish flow (the shell marks
	     the Publish tab active here), so it carries its own way back rather
	     than being a place someone has to know the URL of. -->
	<nav class="fdy-crumb" aria-label="Back">
		<a class="btn tap-44" href="/foundry/submit">Back to publishing</a>
	</nav>
	<FoundryContract contract={data.contract} />
</div>

<style>
	.fdy-page {
		padding: var(--space-4, 1rem) var(--cr-gutter, 1rem);
	}

	.fdy-crumb {
		margin-bottom: var(--space-3, 0.75rem);
	}
</style>
