<script lang="ts">
	/**
	 * THE PUBLISHER PAGE, ON THE REAL COMPONENT, in its three states at once.
	 *
	 * It mounts `FoundryAuthorPage` itself rather than a copy of its markup, so
	 * the name ladder, the null rendering and the avatar fallback under test are
	 * the shipping ones.
	 */
	import '$lib/foundry/forge.css';
	import FoundryAuthorPage from '$lib/foundry/FoundryAuthorPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>dev: Foundry publisher page</title></svelte:head>

<div class="fg-root harness">
	<div class="wrap">
		<h1>Foundry: a publisher's page</h1>
		<p class="note">
			Three cards: everything present, everything optional missing, and no name at all. The
			second is the one to read closely. A missing pathway, class or picture has to render as
			nothing rather than as an empty chip or a stranded separator, and there is no email
			anywhere in this payload because the function behind it has no column for one.
		</p>
		{#each data.cases as c (c.key)}
			<section class="case" data-case={c.key}>
				<h2>{c.key}</h2>
				<FoundryAuthorPage card={c.card} apps={c.apps} playCounts={data.playCounts} />
			</section>
		{/each}
	</div>
</div>

<style>
	.harness {
		min-height: 100vh;
		padding: var(--space-5, 1.25rem) 0;
	}

	.wrap {
		width: min(100% - 2rem, 92rem);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.25rem);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.4rem;
	}

	.note {
		margin: 0;
		max-width: 62ch;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.6;
		color: var(--text-2, var(--dim));
	}

	.case {
		padding: var(--space-4, 1rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 8px);
		background: var(--surface-1, var(--bg1));
	}

	.case h2 {
		margin: 0 0 var(--space-3, 0.75rem);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
</style>
