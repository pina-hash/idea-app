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
	<!-- The contract has its OWN top-level tab in the shell, and this comment
	     used to say the shell marked the Publish tab active here. `locateFoundry`
	     resolves /foundry/contract to `contract`; only /foundry/starter still
	     resolves to `submit`. It got the tab because a student who has already
	     published once has no other link to it, and it is the one document
	     everyone needs before building anything.

	     The crumb below is kept anyway: the contract is still READ from inside
	     the publish flow, and a way back to where you came from is not the same
	     affordance as a tab that is always there. -->
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
