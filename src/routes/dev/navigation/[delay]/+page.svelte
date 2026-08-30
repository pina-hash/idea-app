<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>dev // navigation target</title></svelte:head>

<section class="target" data-testid="nav-target">
	<h1>Navigation target</h1>
	<p class="note">
		This page's load slept {data.delay}ms (measured {data.tookMs}ms) before resolving.
	</p>
	<p><a href="/dev/navigation">Back to the harness</a></p>
</section>

<style>
	.target {
		padding: 2rem 1rem;
		max-width: 60ch;
		margin: 0 auto;
		color: var(--text-1);
	}
	.note {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
</style>
