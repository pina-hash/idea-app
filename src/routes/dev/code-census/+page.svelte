<script lang="ts">
	import CodeCounter from '$lib/CodeCounter.svelte';
	import { census as realCensus } from 'virtual:site-code';
	import { countsAsCode, type CodeCensus } from '$lib/code-census';
	import { buildSiteVersions, FIELD, REC, type VersionEntry } from '$lib/site-versions';

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

	/**
	 * THE RECENT-UPDATES TRANSPORT, one per `?updates=` state. `real` is the
	 * same lazy import the home page makes, so the rows a spec reads are the
	 * build's own; `shallow` runs a two-commit log through the REAL builder
	 * with `complete: false`, so the absence of counts is the builder's answer
	 * and not a shape typed out here; `fail` rejects; `none` hands nothing.
	 */
	const SHALLOW_LOG = [
		`${REC}a1b2c3d${FIELD}Sep 28, 2026${FIELD}2026-09-28T10:00:00-07:00${FIELD}Tidy the home banner`,
		'src/routes/+page.svelte',
		`${REC}d4e5f6a${FIELD}Sep 27, 2026${FIELD}2026-09-27T10:00:00-07:00${FIELD}Count the code by layer`,
		'src/lib/code-census.ts'
	].join('\n');
	const SHALLOW_NUMSTAT = `${REC}a1b2c3d\n12\t3\tsrc/routes/+page.svelte\n\n${REC}d4e5f6a\n40\t0\tsrc/lib/code-census.ts\n`;

	const loadUpdates = $derived.by((): (() => Promise<VersionEntry[]>) | undefined => {
		switch (data.harness.updates) {
			case 'none':
				return undefined;
			case 'fail':
				return () => Promise.reject(new Error('harness: the update list is refused on purpose'));
			case 'shallow':
				return async () =>
					buildSiteVersions(SHALLOW_LOG, {
						complete: false,
						numstatRaw: SHALLOW_NUMSTAT,
						countsLine: countsAsCode
					}).entries;
			default:
				return async () => (await import('virtual:site-changelog')).entries;
		}
	});
</script>

<svelte:head><title>dev // code census</title></svelte:head>

<div class="harness-strip">
	census=<strong>{data.harness.empty ? 'EMPTY (nothing should render)' : 'real'}</strong>
	&middot; total=<strong>{census.total}</strong>
	&middot; files=<strong>{census.files}</strong>
	&middot; updates=<strong>{data.harness.updates}</strong>
	&middot; <a href="?">the real census</a>
	&middot; <a href="?census=empty">an incomplete one</a>
	&middot; <a href="?updates=shallow">a shallow build</a>
	&middot; <a href="?updates=fail">a failed load</a>
	&middot; <a href="?updates=none">no updates transport</a>
</div>

<main class="census-harness">
	<h1>Lines of code</h1>
	<p class="lead">
		The readout the home banner carries, with its panel open. Every number comes from
		<code>virtual:site-code</code>, which <code>vite.config.ts</code> builds from this
		repository's own tracked file list at build time. Nothing here is written by hand.
	</p>

	<div class="stage" data-testid="counter-stage">
		<CodeCounter {census} startOpen={true} {loadUpdates} />
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
