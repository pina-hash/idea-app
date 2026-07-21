<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { DAY1_SLIDES } from './day1-slides';
	import FspLiveFeed, { type FspQuestion } from './FspLiveFeed.svelte';

	/**
	 * FspDeck — the FSP Day 1 presentation, a native SvelteKit rebuild of the
	 * Claude Design deck "IDEA FSP Deck.dc.html". Slides 1-12 are the design's
	 * own markup (recolored to the pinned IDEA green #00FF41 on near-black, with
	 * the Claude Design custom elements swapped for native equivalents) rendered
	 * from $lib/fsp/day1-slides.ts; slide 13 ("Live Questions") is native so it
	 * embeds the real Supabase Realtime feed (FspLiveFeed) rather than a mock.
	 *
	 * The stage is a fixed 1440x1080 (4:3) canvas scaled to fit any viewport and
	 * letterboxed on black. Keyboard: arrows / space / PageUp-Down / Home-End /
	 * digits navigate; F toggles full screen; R resets to slide 1. The same
	 * component backs the real route and the /dev/fsp-day1 harness.
	 */

	let {
		supabase = null,
		session = undefined,
		liveSample = null,
		startAt = 0
	}: {
		supabase?: SupabaseClient | null;
		/** Session to filter the live feed on. Undefined = resolve active one. */
		session?: string | null | undefined;
		/** Sample questions for slide 13 when there is no Supabase (harness). */
		liveSample?: FspQuestion[] | null;
		startAt?: number;
	} = $props();

	const STAGE_W = 1440;
	const STAGE_H = 1080;
	const LIVE_INDEX = DAY1_SLIDES.length; // slide 13, the native one
	const total = DAY1_SLIDES.length + 1;

	let current = $state(Math.min(Math.max(startAt, 0), total - 1));
	let rootEl: HTMLElement;
	let vpW = $state(0);
	let vpH = $state(0);
	let isFullscreen = $state(false);
	let hudVisible = $state(true);
	let hudTimer: ReturnType<typeof setTimeout> | null = null;

	const scale = $derived(Math.min(vpW / STAGE_W, vpH / STAGE_H) || 0);
	const activeLabel = $derived(
		current === LIVE_INDEX ? 'Live Questions' : (DAY1_SLIDES[current]?.label ?? '')
	);

	function go(to: number) {
		current = Math.min(Math.max(to, 0), total - 1);
	}
	function next() {
		go(current + 1);
	}
	function prev() {
		go(current - 1);
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) rootEl?.requestFullscreen?.().catch(() => {});
		else document.exitFullscreen?.().catch(() => {});
	}
	function onFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	function pokeHud() {
		hudVisible = true;
		if (hudTimer) clearTimeout(hudTimer);
		hudTimer = setTimeout(() => (hudVisible = false), 2600);
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
		let handled = true;
		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowDown':
			case 'PageDown':
			case ' ':
			case 'Spacebar':
				next();
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
			case 'PageUp':
				prev();
				break;
			case 'Home':
				go(0);
				break;
			case 'End':
				go(total - 1);
				break;
			case 'f':
			case 'F':
				toggleFullscreen();
				break;
			case 'r':
			case 'R':
				go(0);
				break;
			default:
				if (/^[1-9]$/.test(e.key)) go(Number(e.key) - 1);
				else handled = false;
		}
		if (handled) {
			e.preventDefault();
			pokeHud();
		}
	}

	onMount(() => {
		document.addEventListener('fullscreenchange', onFullscreenChange);
		pokeHud();
	});
	onDestroy(() => {
		if (typeof document !== 'undefined')
			document.removeEventListener('fullscreenchange', onFullscreenChange);
		if (hudTimer) clearTimeout(hudTimer);
	});
</script>

<svelte:window onkeydown={onKey} />

<div
	class="deck"
	bind:this={rootEl}
	bind:clientWidth={vpW}
	bind:clientHeight={vpH}
	onpointermove={pokeHud}
	role="application"
	aria-label="FSP Day 1 presentation"
>
	<div class="stage" style="width:{STAGE_W}px;height:{STAGE_H}px;transform:translate(-50%,-50%) scale({scale})">
		{#each DAY1_SLIDES as slide, i (slide.label)}
			<div class="slide-holder" class:active={current === i} aria-hidden={current !== i}>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html slide.html}
			</div>
		{/each}

		<!-- Slide 13 · Live Questions (native — embeds the real feed) -->
		<div class="slide-holder" class:active={current === LIVE_INDEX} aria-hidden={current !== LIVE_INDEX}>
			<section
				class="fsp-slide"
				data-label="Live Questions"
				style="background:var(--bg0);color:var(--white);font-family:'Rajdhani',sans-serif;overflow:hidden"
			>
				<div
					data-texture=""
					style="position:absolute;inset:0;pointer-events:none;opacity:calc(var(--tex,1)*1);background-image:linear-gradient(rgba(0,255,65,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,65,0.04) 1px,transparent 1px);background-size:48px 48px;animation:fsp-gridpan 26s linear infinite"
				></div>
				<div
					data-texture=""
					style="position:absolute;inset:0;pointer-events:none;opacity:calc(var(--tex,1)*1);background:radial-gradient(ellipse 80% 50% at 50% -10%,rgba(0,255,65,0.07),transparent 60%);animation:fsp-glowdrift 13s ease-in-out infinite"
				></div>

				<div style="position:absolute;top:80px;left:90px;right:90px;display:flex;align-items:center;justify-content:space-between">
					<h1 style="margin:0;font-size:76px;font-weight:700;line-height:1;color:var(--green);text-shadow:var(--glow-green)">Your Questions.</h1>
					<span style="display:inline-flex;align-items:center;gap:14px;padding:10px 22px;border:1px solid rgba(255,90,90,0.5);border-radius:2px">
						<span style="width:12px;height:12px;border-radius:50%;background:var(--crimson);animation:fsp-pulse 1.6s ease-in-out infinite"></span>
						<span style="font-family:'Share Tech Mono',monospace;font-size:26px;letter-spacing:0.2em;color:var(--crimson)">LIVE</span>
					</span>
				</div>

				<div style="position:absolute;top:230px;left:90px;right:90px;bottom:100px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:4px;background:rgba(16,22,16,0.85);overflow:hidden">
					<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--line);background:var(--bg2)">
						<span style="font-family:'Share Tech Mono',monospace;font-size:24px;letter-spacing:0.14em;color:var(--cyan)">IDEA-APP // LIVE FEED</span>
						<span style="font-family:'Share Tech Mono',monospace;font-size:24px;letter-spacing:0.12em;color:var(--dim)">ANONYMOUS SUBMISSIONS · 1 COIN EACH</span>
					</div>
					<div
						style="flex:1;min-height:0;position:relative;background-image:linear-gradient(rgba(0,255,65,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,65,0.04) 1px,transparent 1px);background-size:24px 24px"
					>
						<FspLiveFeed variant="slide" {supabase} sampleQuestions={liveSample} />
					</div>
				</div>

				<div style="position:absolute;left:90px;right:90px;bottom:38px;display:flex;align-items:center;justify-content:space-between;font-family:'Share Tech Mono',monospace;font-size:24px;letter-spacing:0.12em;color:var(--dim)">
					<span>IDEA // FSP · SUMMER 2026</span>
					<span class="idea-wordmark" style="font-size:47px;line-height:0.8">IDEA</span>
					<span>DWG 013 / 013 · REV A</span>
				</div>
			</section>
		</div>
	</div>

	<!-- Presenter HUD -->
	<div class="hud" class:show={hudVisible}>
		<button class="hbtn" onclick={prev} disabled={current === 0} aria-label="Previous slide">‹</button>
		<span class="hcount">{current + 1} / {total}</span>
		<button class="hbtn" onclick={next} disabled={current === total - 1} aria-label="Next slide">›</button>
		<span class="hlabel">{activeLabel}</span>
		<button class="hbtn wide" onclick={toggleFullscreen} aria-label="Toggle full screen">
			{isFullscreen ? '⤢ exit' : '⤢ full'}
		</button>
	</div>
</div>

<style>
	/* Palette: pinned IDEA green #00FF41 on near-black #0a0a0a. Scoped to the deck
	   so the recolored {@html} slides AND the embedded feed adopt these tokens. */
	.deck {
		--bg0: #0a0a0a;
		--bg1: #101610;
		--bg2: #0c110c;
		--plate: #14201a;
		--green: #00ff41;
		--gold: #c8ff00;
		--cyan: #00f0ff;
		--white: #e8ffe8;
		--dim: #4a7a52;
		--crimson: #ff5a5a;
		--line: rgba(0, 255, 65, 0.15);
		--line-strong: rgba(0, 255, 65, 0.35);
		--glow-green: 0 0 14px rgba(0, 255, 65, 0.45);
		--glow-gold: 0 0 14px rgba(200, 255, 0, 0.4);
		--bevel-raised: inset 0 1px 0 rgba(0, 255, 65, 0.08), 0 2px 10px rgba(0, 0, 0, 0.55);
		--tex: 1;

		position: fixed;
		inset: 0;
		z-index: 50;
		background: #000;
		overflow: hidden;
		color: var(--white);
		font-family: 'Rajdhani', system-ui, sans-serif;
		cursor: default;
	}

	.stage {
		position: absolute;
		top: 50%;
		left: 50%;
		transform-origin: center center;
		background: var(--bg0);
	}

	.slide-holder {
		position: absolute;
		inset: 0;
		opacity: 0;
		visibility: hidden;
		transition: opacity 0.28s ease;
	}
	.slide-holder.active {
		opacity: 1;
		visibility: visible;
	}
	/* Only the visible slide animates — keeps the presenter machine (and the
	   headless renderer) from running 13 slides of ambient motion at once. */
	.slide-holder:not(.active) :global(*) {
		animation-play-state: paused !important;
	}

	/* Each design section fills the stage. */
	.deck :global(.fsp-slide) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	/* ---- Wordmark (replaces the Claude Design AnimatedLogo) ---- */
	.deck :global(.idea-wordmark) {
		display: inline-block;
		font-family: 'Orbitron', 'Rajdhani', sans-serif;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--green);
		text-shadow:
			0 0 18px rgba(0, 255, 65, 0.5),
			0 0 42px rgba(0, 255, 65, 0.22);
	}

	/* ---- image-slot placeholder ---- */
	.deck :global(.slot) {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 16px;
		color: rgba(232, 255, 232, 0.5);
		font: 600 18px/1.4 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.deck :global(.slot span) {
		max-width: 82%;
	}
	.deck :global(.slot-round) {
		border-radius: 50%;
	}
	.deck :global(.qr) {
		border-radius: 2px;
	}

	/* ---- CAD-viewport image frame (carried from the design .fsp-img) ---- */
	.deck :global(.fsp-img) {
		position: relative;
		overflow: hidden;
		background-color: #0d120d;
		background-image:
			radial-gradient(ellipse 70% 60% at 50% 42%, rgba(0, 255, 65, 0.08), transparent 70%),
			linear-gradient(rgba(0, 255, 65, 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgba(0, 255, 65, 0.06) 1px, transparent 1px);
		background-size:
			auto,
			24px 24px,
			24px 24px;
	}
	.deck :global(.fsp-img)::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		mix-blend-mode: soft-light;
		background: linear-gradient(150deg, rgba(0, 255, 65, 0.2), rgba(10, 10, 10, 0.04) 46%, rgba(0, 240, 255, 0.16));
	}
	.deck :global(.fsp-img)::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		box-shadow:
			inset 0 0 0 1px rgba(0, 255, 65, 0.12),
			inset 0 0 26px rgba(0, 0, 0, 0.28);
		background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.06) 0 1px, transparent 1px 4px),
			linear-gradient(to top, rgba(10, 10, 10, 0.28), transparent 24%);
	}
	.deck :global(.fsp-img-round),
	.deck :global(.fsp-img-round)::before,
	.deck :global(.fsp-img-round)::after {
		border-radius: 50%;
	}

	/* ---- Entrance choreography (replays each time a slide becomes active) ---- */
	.deck :global(.ds-in-rise),
	.deck :global(.ds-in-zoom) {
		opacity: 0;
	}
	.slide-holder.active :global(.ds-in-rise) {
		animation: deck-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
	}
	.slide-holder.active :global(.ds-in-zoom) {
		animation: deck-zoom 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
	}
	.deck :global(.ds-d1) {
		animation-delay: 0.06s;
	}
	.deck :global(.ds-d2) {
		animation-delay: 0.16s;
	}
	.deck :global(.ds-d3) {
		animation-delay: 0.3s;
	}
	@keyframes deck-rise {
		from {
			opacity: 0;
			transform: translateY(26px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@keyframes deck-zoom {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/* Whole-slide machining slide-in + single mint sweep, on becoming active. */
	.slide-holder.active :global(.fsp-slide) {
		animation: fsp-slide-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
	}
	.slide-holder.active :global(.fsp-slide)::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 52%;
		pointer-events: none;
		z-index: 50;
		background: linear-gradient(
			to bottom,
			transparent 0%,
			rgba(0, 255, 65, 0.05) 52%,
			rgba(0, 255, 65, 0.24) 84%,
			rgba(120, 255, 150, 0.4) 100%
		);
		mix-blend-mode: screen;
		animation: fsp-sweep-in 1.15s cubic-bezier(0.33, 0, 0.2, 1) both;
	}

	/* ---- Keyframes carried from the design ---- */
	@keyframes fsp-slide-in {
		0% {
			opacity: 0;
			transform: translateY(30px) scale(0.988);
			filter: blur(14px);
			clip-path: inset(0 0 40% 0);
		}
		55% {
			opacity: 1;
		}
		100% {
			opacity: 1;
			transform: none;
			filter: blur(0);
			clip-path: inset(0 0 0 0);
		}
	}
	@keyframes fsp-sweep-in {
		0% {
			opacity: 0;
			transform: translateY(-22%);
		}
		16% {
			opacity: 0.85;
		}
		55% {
			opacity: 0.5;
		}
		80% {
			opacity: 0.18;
		}
		100% {
			opacity: 0;
			transform: translateY(128%);
		}
	}
	@keyframes fsp-gridpan {
		from {
			background-position: 0 0;
		}
		to {
			background-position: 48px 48px;
		}
	}
	@keyframes fsp-scan {
		from {
			background-position-y: 0;
		}
		to {
			background-position-y: 140px;
		}
	}
	@keyframes fsp-rise {
		0% {
			transform: translateY(0);
			opacity: 0;
		}
		8% {
			opacity: 0.7;
		}
		85% {
			opacity: 0.35;
		}
		100% {
			transform: translateY(-1120px);
			opacity: 0;
		}
	}
	@keyframes fsp-blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0.1;
		}
	}
	@keyframes fsp-flow {
		from {
			background-position-x: 0;
		}
		to {
			background-position-x: -48px;
		}
	}
	@keyframes fsp-flow-v {
		from {
			background-position-y: 0;
		}
		to {
			background-position-y: 24px;
		}
	}
	@keyframes fsp-pulse {
		0%,
		100% {
			box-shadow: 0 0 5px rgba(255, 90, 90, 0.9);
			opacity: 1;
		}
		50% {
			box-shadow: 0 0 18px rgba(255, 90, 90, 1);
			opacity: 0.6;
		}
	}
	@keyframes fsp-glowdrift {
		0%,
		100% {
			opacity: 0.55;
			transform: translateX(-3%) scale(1);
		}
		50% {
			opacity: 1;
			transform: translateX(3%) scale(1.05);
		}
	}
	@keyframes fsp-breathe {
		0%,
		100% {
			text-shadow:
				0 0 6px rgba(0, 255, 65, 0.45),
				0 0 18px rgba(0, 255, 65, 0.2);
		}
		50% {
			text-shadow:
				0 0 10px rgba(0, 255, 65, 0.6),
				0 0 32px rgba(0, 255, 65, 0.3);
		}
	}

	/* ---- Presenter HUD ---- */
	.hud {
		position: fixed;
		left: 50%;
		bottom: 22px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 9px 16px;
		border-radius: 999px;
		background: rgba(8, 12, 8, 0.82);
		border: 1px solid var(--line-strong);
		backdrop-filter: blur(6px);
		font-family: 'Share Tech Mono', monospace;
		color: var(--white);
		opacity: 0;
		transition: opacity 0.4s ease;
		pointer-events: none;
		z-index: 60;
	}
	.hud.show {
		opacity: 1;
		pointer-events: auto;
	}
	.hbtn {
		font-family: inherit;
		font-size: 1.1rem;
		line-height: 1;
		min-width: 34px;
		padding: 6px 10px;
		border-radius: 8px;
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--green);
		cursor: pointer;
	}
	.hbtn.wide {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.hbtn:hover:not(:disabled) {
		background: rgba(0, 255, 65, 0.14);
	}
	.hbtn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.hcount {
		font-size: 0.95rem;
		color: var(--cyan);
		min-width: 66px;
		text-align: center;
	}
	.hlabel {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.deck :global([data-texture]),
		.deck :global(.idea-wordmark),
		.slide-holder.active :global(.fsp-slide),
		.slide-holder.active :global(.fsp-slide)::after,
		.slide-holder.active :global(.ds-in-rise),
		.slide-holder.active :global(.ds-in-zoom) {
			animation: none !important;
		}
		.slide-holder :global(.ds-in-rise),
		.slide-holder :global(.ds-in-zoom) {
			opacity: 1;
		}
	}
</style>
