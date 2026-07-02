<script lang="ts">
	import { onMount } from 'svelte';
	import '$lib/gauntlet/viewport/viewport.css';
	import ViewportBackground from '$lib/gauntlet/viewport/ViewportBackground.svelte';
	import StlViewer from '$lib/gauntlet/StlViewer.svelte';
	import PartThumb from '$lib/gauntlet/PartThumb.svelte';

	/**
	 * Manual verification harness for the GAUNTLET beauty layer (dev-only
	 * route). Mounts the volumetric ViewportBackground exactly as the layout
	 * does (.gt-root + vignette + .gt-content), the lifted StlViewer, and the
	 * PartThumb pipeline, all fed by a sample STL generated in the browser from
	 * the shared hero-part geometry (no Supabase, no Storage). Two thumbs share
	 * one model path to prove in-flight dedupe; a third has no model to prove
	 * the placeholder; the cache button clears IndexedDB to re-exercise a cold
	 * render (watch the [part-thumbs] console lines for hit vs rendering).
	 */

	let sampleUrl = $state<string | null>(null);
	let genError = $state('');

	onMount(() => {
		let objectUrl: string | null = null;
		(async () => {
			try {
				const THREE = await import('three');
				const { mergeGeometries } = await import(
					'three/examples/jsm/utils/BufferGeometryUtils.js'
				);
				const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
				const { heroPartGeometries } = await import('$lib/gauntlet/viewport/hero-parts');

				// A ~60mm stepped flange, exported as binary STL like a real level.
				const geos = heroPartGeometries(THREE, mergeGeometries);
				const geo = geos[1].scale(30, 30, 30);
				const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
				const data = new STLExporter().parse(mesh, { binary: true }) as DataView;
				objectUrl = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' }));
				sampleUrl = objectUrl;
				geos.forEach((g, i) => i !== 1 && g.dispose());
			} catch (e) {
				genError = e instanceof Error ? e.message : 'Could not generate the sample STL.';
			}
		})();
		return () => {
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	});

	const resolveSample = async () => sampleUrl;

	const clearThumbCache = () => {
		indexedDB.deleteDatabase('gauntlet-part-thumbs');
		location.reload();
	};
</script>

<svelte:head>
	<title>GAUNTLET visuals harness (dev)</title>
</svelte:head>

<div class="gt-root">
	<ViewportBackground />
	<div class="gt-vignette" aria-hidden="true"></div>
	<div class="gt-content">
		<main class="gauntlet">
			<h1>GAUNTLET visuals harness</h1>
			<p class="dim">
				Dev-only. Behind this page: the volumetric CAD-space background (hero part cycling with
				fades, fog depth falloff, drifting particulate, mouse parallax, soft focus). Reduced motion
				renders one static frame.
			</p>

			<section class="card">
				<h2>3D preview (StlViewer)</h2>
				{#if sampleUrl}
					<StlViewer url={sampleUrl} height={320} label="sample flange (generated)" />
				{:else if genError}
					<p class="warn">{genError}</p>
				{:else}
					<p class="dim">Generating sample STL...</p>
				{/if}
			</section>

			<section class="card">
				<h2>Level thumbnails (PartThumb)</h2>
				{#if sampleUrl}
					<div class="thumb-row">
						<div class="thumb-case">
							<PartThumb modelPath="dev/sample-flange.stl" resolveUrl={resolveSample} />
							<span class="dim">model</span>
						</div>
						<div class="thumb-case">
							<PartThumb modelPath="dev/sample-flange.stl" resolveUrl={resolveSample} />
							<span class="dim">same model (dedupe/cache)</span>
						</div>
						<div class="thumb-case">
							<PartThumb modelPath={null} resolveUrl={resolveSample} />
							<span class="dim">no model (placeholder)</span>
						</div>
					</div>
					<button class="btn secondary" type="button" onclick={clearThumbCache}>
						Clear thumbnail cache and reload
					</button>
				{:else}
					<p class="dim">Waiting for the sample STL...</p>
				{/if}
			</section>
		</main>
	</div>
</div>

<style>
	main.gauntlet {
		max-width: 900px;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 4rem;
		display: grid;
		gap: 1.25rem;
	}
	.thumb-row {
		display: flex;
		gap: 1.25rem;
		flex-wrap: wrap;
		margin: 0.75rem 0 1rem;
	}
	.thumb-case {
		display: grid;
		gap: 0.35rem;
		justify-items: center;
		font-size: 0.75rem;
	}
</style>
