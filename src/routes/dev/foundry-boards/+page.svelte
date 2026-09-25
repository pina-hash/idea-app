<script lang="ts">
	/**
	 * THE ONE SORT CONTROL AND THE SEARCH BOX, ON THE REAL COMPONENT.
	 *
	 * It mounts `FoundryGallery` itself -- not a copy of its markup -- with no
	 * transports at all, so there is no launch control, no play recording and no
	 * detail pane to open. What is under test here is the arrangement of the
	 * list pane: the sort control and what it says beside itself, the order and
	 * the figures of the one list under each option, and what the search box
	 * does to all of it. (The ranked sections this harness was built for are
	 * gone since decision 39; the route keeps its name.)
	 *
	 * `onSelect` IS REQUIRED BY THE COMPONENT, so it is supplied and RECORDED
	 * rather than stubbed silently, and a drive that clicks a card can read the
	 * slug back off the page.
	 */
	import '$lib/foundry/forge.css';
	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';

	let { data } = $props();

	let picked = $state('(nothing picked yet)');
</script>

<svelte:head><title>dev: Foundry sort and search</title></svelte:head>

<div class="fg-root harness">
	<div class="wrap">
		<h1>Foundry: one sort control and search</h1>
		<p class="note">
			Nine published apps{data.unplayed ? ', none of them played yet' : ''}. Every order has a
			different winner, so a bug that ranked every option on one field would be visible rather
			than plausible. Search cases live in the
			fixture: "Cookie Clicker" finds Cookie Press on a shared word, "maze" finds Frog Frenzy
			through its description, "cookei" finds Cookie Press at one edit, "Reyes" finds three apps
			by author, and "xylophone" finds nothing.
		</p>
		<p class="note" data-testid="harness-picked">Last card selected: {picked}</p>
		<div class="stage">
			<FoundryGallery
				apps={data.apps}
				playCounts={data.playCounts}
				onSelect={(slug) => (picked = slug ?? '(cleared)')}
			/>
		</div>
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
		gap: var(--space-4, 1rem);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.4rem;
	}

	.note {
		margin: 0;
		max-width: 60ch;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.6;
		color: var(--text-2, var(--dim));
	}

	/*
	   A BOUNDED BOX, because `FoundryGallery` passes `scroll="fill"` to
	   `ClassSplit` and that knob means "the caller gives the split a bounded box
	   and the panes take its height". Left unbounded the pane would have no
	   height to fill and the mosaic would collapse -- which would be a harness
	   defect reading as a component one.
	*/
	.stage {
		height: 78vh;
		min-height: 30rem;
	}
</style>
