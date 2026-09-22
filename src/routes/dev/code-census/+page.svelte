<script lang="ts">
	import CodeCounter from '$lib/CodeCounter.svelte';
	import { census as realCensus } from 'virtual:site-code';
	import type { CodeCensus } from '$lib/code-census';

	/**
	 * THE REAL COMPONENT AND THE REAL CENSUS. `CodeCounter` here is the module
	 * the home banner mounts and the numbers are the ones `vite.config.ts`
	 * derived from this tree at dev-server start, so what a spec measures is
	 * what ships.
	 *
	 * The counter is mounted in a stage with room rather than in a sticky
	 * banner: its panel is `use:anchored`, which writes `position: fixed` and
	 * flips above the trigger when it will not fit below, so it needs a page to
	 * open into. Where the chip SITS is the home harness's question.
	 */

	let { data } = $props();

	/**
	 * THE ZEROED CENSUS, built by hand rather than by calling the builder with
	 * an empty file list -- the shape a spec is asserting about is the one the
	 * component receives, and this is the only place in the tree that has to
	 * name it.
	 */
	const EMPTY: CodeCensus = {
		files: 0,
		blank: 0,
		comment: 0,
		code: 0,
		total: 0,
		languages: [],
		layers: [],
		areas: [],
		excluded: [],
		complete: false
	};

	const census = $derived(data.harness.empty ? EMPTY : realCensus);
</script>

<svelte:head><title>dev // code census</title></svelte:head>

<div class="harness-strip">
	census=<strong>{data.harness.empty ? 'EMPTY (nothing should render)' : 'real'}</strong>
	&middot; total=<strong>{census.total}</strong>
	&middot; files=<strong>{census.files}</strong>
	&middot; <a href="?">the real census</a>
	&middot; <a href="?census=empty">an incomplete one</a>
</div>

<main class="census-harness">
	<h1>Lines of code</h1>
	<p class="lead">
		The readout the home banner carries, with its panel open. Every number comes from
		<code>virtual:site-code</code>, which <code>vite.config.ts</code> builds from this
		repository's own tracked file list at build time. Nothing here is written by hand.
	</p>

	<div class="stage" data-testid="counter-stage">
		<CodeCounter {census} startOpen={true} />
	</div>
</main>

<style>
	.harness-strip {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		background: #000;
		color: var(--dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 0.3rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}
	.harness-strip strong {
		color: var(--cyan);
	}
	.harness-strip a {
		color: var(--gold);
	}

	.census-harness {
		max-width: 60rem;
		margin: 0 auto;
		padding: 4.5rem 1rem 40rem;
	}
	h1 {
		font-family: var(--font-title, 'Orbitron', sans-serif);
		font-size: 1.2rem;
		color: var(--green);
	}
	.lead {
		color: var(--text-2);
		max-width: 46rem;
	}
	.lead code {
		font-family: var(--font-mono);
		color: var(--cyan);
	}
	/* The panel is `position: fixed` once `anchored` places it, so the stage
	   only has to hold the chip and give the page height to open into. */
	.stage {
		position: relative;
		margin-top: 1.5rem;
	}
</style>
