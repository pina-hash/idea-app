<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import FspStudentPreview from '$lib/fsp/FspStudentPreview.svelte';

	/**
	 * Dev harness for /fsp/day2. No auth, no Supabase. Shows the hosted deck in
	 * the iframe with the real toolbar (Present + Student View), matching the
	 * real page (an archive viewer; presentations run live from Claude Design
	 * externally, Q&A happens on /fsp/live in its own window). See
	 * /dev/fsp-day1 for the same harness on Day 1.
	 */

	const SLIDES_SRC = '/fsp/day2/index.html';

	let studentOpen = $state(false);
	let isFullscreen = $state(false);
	let iframeEl: HTMLIFrameElement | undefined = $state();

	// The deck shows a thumbnail rail by default; its <deck-stage> `no-rail`
	// attribute hides it and refits the current slide to fill (present layout).
	function setDeckRailHidden(hidden: boolean) {
		try {
			const stage = iframeEl?.contentDocument?.querySelector('deck-stage');
			if (!stage) return;
			if (hidden) stage.setAttribute('no-rail', '');
			else stage.removeAttribute('no-rail');
		} catch {
			/* not ready — ignore */
		}
	}
	function presentDeck() {
		setDeckRailHidden(true);
		iframeEl?.requestFullscreen?.().catch(() => {});
	}
	function onFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
		setDeckRailHidden(isFullscreen);
	}

	onMount(() => {
		document.addEventListener('fullscreenchange', onFullscreenChange);
	});
	onDestroy(() => {
		if (typeof document !== 'undefined')
			document.removeEventListener('fullscreenchange', onFullscreenChange);
	});
</script>

<svelte:head>
	<title>dev · fsp-day2</title>
</svelte:head>

<div class="harness-bar">
	<strong>Day 2 deck harness (archive viewer)</strong>
	<span>no auth / Supabase</span>
</div>

<div class="deck-root">
	<iframe
		bind:this={iframeEl}
		class="deck"
		src={SLIDES_SRC}
		title="FSP Day 2 presentation"
		allow="fullscreen"
	></iframe>

	{#if !isFullscreen}
		<div class="toolbar">
			<button class="tb" onclick={presentDeck} title="Fullscreen the deck">
				<span class="ico" aria-hidden="true">⛶</span> Present
			</button>
			<button class="tb" onclick={() => (studentOpen = true)} title="Preview the student phone view">
				<span class="ico" aria-hidden="true">▢</span> Student View
			</button>
		</div>
	{/if}

	<FspStudentPreview bind:open={studentOpen} />
</div>

<style>
	.harness-bar {
		position: fixed;
		top: 10px;
		left: 10px;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 8px 12px;
		border-radius: 10px;
		background: rgba(8, 12, 8, 0.92);
		border: 1px solid rgba(0, 255, 65, 0.35);
		color: #e8ffe8;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
	}
	.harness-bar strong {
		color: #00ff41;
	}
	.harness-bar span {
		color: #4a7a52;
	}

	.deck-root {
		position: fixed;
		inset: 0;
		background: #0a0a0a;
		overflow: hidden;
		z-index: 1;
	}
	.deck {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
	.toolbar {
		position: fixed;
		left: 50%;
		bottom: 20px;
		transform: translateX(-50%);
		z-index: 20;
		display: flex;
		gap: 0.4rem;
		padding: 0.4rem;
		border-radius: 12px;
		background: rgba(10, 12, 10, 0.82);
		border: 1px solid rgba(0, 255, 65, 0.28);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(6px);
	}
	.toolbar .tb {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.85rem;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		color: #b7d4bb;
		cursor: pointer;
	}
	.toolbar .tb:hover {
		background: rgba(0, 255, 65, 0.12);
		border-color: rgba(0, 255, 65, 0.3);
		color: #00ff41;
	}
	.toolbar .ico {
		font-size: 0.9rem;
		line-height: 1;
	}
</style>
