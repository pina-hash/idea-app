<!--
  THE HISTORY SLIDER HARNESS: the REAL `HistorySlider` at the bottom of a
  workspace-shaped frame, over the motor bracket's build steps. The stage above
  it stands in for the viewport: it shows which features step k has built, so
  a step change is visible in a screenshot. Every `onstep` is recorded, with the
  time it arrived and whether it asked to animate, for the browser spec to
  read (`window.ideaCadHistory`). No auth, no Supabase, no kernel; 404 in
  production (`+page.ts`).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import '$lib/ideacad/ideacad.css';
	import HistorySlider from '$lib/ideacad/solid/tree/HistorySlider.svelte';
	import { BRACKET } from '$lib/ideacad/solid/tree/memory.svelte';
	const labels = BRACKET.map((f) => f.name);
	let step = $state(labels.length);
	const calls: { step: number; playing: boolean; animate: boolean; at: number }[] = [];
	onMount(() => { (window as unknown as { ideaCadHistory: unknown }).ideaCadHistory = { calls, get step() { return step; } }; });
</script>
<svelte:head><title>IdeaCAD history slider · Development</title></svelte:head>
<main class="ic-root">
	<section class="stage" aria-label="Built features" data-testid="history-stage">
		<h1>Step {step} of {labels.length}</h1>
		<ol>{#each labels as name, i (i)}<li class:built={i < step} class:newest={i === step - 1}>{name}</li>{/each}</ol>
	</section>
	<footer><HistorySlider steps={labels.length} {step} {labels} onstep={(s, how) => { step = s; calls.push({ step: s, ...how, at: performance.now() }); }} /></footer>
</main>
<style>
	:global(html), :global(body) { margin: 0; height: 100%; }
	main { position: fixed; inset: 0; z-index: 50; display: grid; grid-template-rows: minmax(0, 1fr) auto; max-width: none; margin: 0; padding: 0; }
	.stage { min-height: 0; overflow: auto; padding: 16px; font: 15px/1.3 Rajdhani, sans-serif; color: var(--text-1); }
	h1 { margin: 0 0 10px; font: 18px 'Share Tech Mono', monospace; }
	ol { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
	li { padding: 6px 10px; border: 1px dashed var(--boundary); border-radius: 4px; color: var(--text-2); }
	li.built { border-style: solid; color: var(--text-1); background: var(--surface-2); }
	li.newest { border-color: var(--green); color: var(--green); }
	footer { min-width: 0; }
</style>
