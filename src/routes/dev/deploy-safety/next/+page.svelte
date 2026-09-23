<script lang="ts">
	/**
	 * The TARGET of the harness's in-app links: an ordinary page to arrive at,
	 * with links onward so a spec can press "the next click" after a held one.
	 * Whether it was reached by an in-app navigation or by a full page load is
	 * the layout's `documents` count, not anything on this page.
	 */
</script>

<svelte:head><title>Deploy safety: arrived</title></svelte:head>

<main class="harness">
	<h1 data-testid="arrived">Arrived</h1>
	<nav class="ds-links" aria-label="In-app links">
		<a class="btn secondary tap-44" href="/dev/deploy-safety" data-testid="link-back">
			Back to the assignment
		</a>
		<a class="btn secondary tap-44" href="/dev/deploy-safety/editors" data-testid="link-editors">
			The editors
		</a>
	</nav>
</main>

<style>
	.harness {
		max-width: 60rem;
		margin: 0 auto;
		padding: var(--space-4) var(--space-3) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	h1 {
		margin: 0;
		font-size: 1.3rem;
	}
	.ds-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
