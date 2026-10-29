<script lang="ts">
	import { toggleLog } from '../../toggle-log';

	/**
	 * WHERE THE HOME FEED HARNESS'S CLASS LINK LANDS (ledger 0396, part 3), when
	 * the harness is opened with `?base=dev`. The real feed points the link at
	 * `/classroom/<id>`, which a signed-out harness cannot open (the prefix
	 * guard sends it to `/`, which is indistinguishable from a link that went
	 * nowhere). This page answers instead, so a spec can prove the click went in
	 * and went to THIS class, and it prints the harness's fold record, so the
	 * same spec can prove the click did not fold the card on its way out.
	 */
	let { data } = $props();
	const folds = toggleLog.slice();
</script>

<svelte:head><title>Home feed harness, class landing</title></svelte:head>

<main class="hf-landing" data-testid="feed-landing" data-section={data.sectionId}>
	<h1>Opened class <code>{data.sectionId}</code></h1>
	<p data-testid="feed-landing-folds" data-count={folds.length}>
		Folds made on the feed before the link was followed: {folds.length}
	</p>
	{#if folds.length}
		<ol>
			{#each folds as line, i (line + i)}<li>{line}</li>{/each}
		</ol>
	{/if}
	<p data-harness-chrome><a href="/dev/home-feed?base=dev">Back to the feed harness</a></p>
</main>

<style>
	.hf-landing {
		max-width: 40rem;
		margin: 3rem auto;
		padding: 0 1rem;
		font-family: var(--font-mono);
		color: var(--text-1);
	}
	.hf-landing h1 {
		font-size: 1.1rem;
	}
	.hf-landing p,
	.hf-landing li {
		font-size: 0.85rem;
		color: var(--text-2);
	}
</style>
