<script lang="ts">
	/**
	 * Race timer for a Speedrun run, anchored to the SERVER-stamped start.
	 *
	 * `serverStartMs` is the run's server `started_at` in epoch ms (null until the
	 * SolidWorks Start macro fires and the browser learns of it over Realtime).
	 * `clockOffsetMs` is the browser-to-server clock offset (Date.now() - serverNow),
	 * measured once at reveal. Displayed elapsed is (Date.now() - offset) - start, so
	 * the readout tracks the same clock the server scores with, independent of the
	 * student's machine clock.
	 *
	 * Performance: a SINGLE requestAnimationFrame loop writes the formatted mm:ss.cc
	 * straight to bound DOM nodes via textContent, never through reactive `$state`,
	 * so a running clock does not re-render the rest of the page.
	 *
	 * Before the macro fires (`running` but no `serverStartMs`) the clock sits at
	 * 00:00.00 in a STANDBY treatment; the instant the start arrives it goes live
	 * (redline REC when `ranked`). `ranked={false}` is the calmer UNRANKED variant.
	 */
	let {
		serverStartMs,
		clockOffsetMs = 0,
		running,
		ranked = true,
		compact = false
	}: {
		serverStartMs: number | null;
		clockOffsetMs?: number;
		running: boolean;
		ranked?: boolean;
		compact?: boolean;
	} = $props();

	let clockEl: HTMLDivElement | null = $state(null);
	let mainEl: HTMLSpanElement | null = $state(null);
	let ccEl: HTMLSpanElement | null = $state(null);

	const live = $derived(running && serverStartMs != null);

	let raf = 0;
	let lastMain = '';
	let lastCc = '';
	let lastSec = -1;

	function parts(ms: number) {
		if (ms < 0 || !Number.isFinite(ms)) ms = 0;
		const totalCs = Math.floor(ms / 10); // centiseconds
		const cs = totalCs % 100;
		const totalSec = Math.floor(totalCs / 100);
		const s = totalSec % 60;
		const m = Math.floor(totalSec / 60);
		return {
			main: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
			cc: String(cs).padStart(2, '0'),
			sec: totalSec
		};
	}

	// Retrigger the one-shot horizontal kick by clearing + re-adding the class after
	// a forced reflow. Touches only the clock element.
	function kick() {
		if (!clockEl || !ranked) return;
		clockEl.classList.remove('kick');
		void clockEl.offsetWidth;
		clockEl.classList.add('kick');
	}

	function paint() {
		const elapsed = Date.now() - clockOffsetMs - (serverStartMs ?? Date.now());
		const { main, cc, sec } = parts(elapsed);
		if (main !== lastMain && mainEl) {
			mainEl.textContent = main;
			lastMain = main;
		}
		if (cc !== lastCc && ccEl) {
			ccEl.textContent = cc;
			lastCc = cc;
		}
		if (sec !== lastSec) {
			const first = lastSec < 0;
			lastSec = sec;
			if (!first) kick();
		}
	}

	function reset() {
		lastMain = '';
		lastCc = '';
		lastSec = -1;
		if (mainEl) mainEl.textContent = '00:00';
		if (ccEl) ccEl.textContent = '00';
	}

	$effect(() => {
		// Track live + serverStartMs: run the loop only once the server start is known.
		if (live) {
			reset();
			cancelAnimationFrame(raf);
			const loop = () => {
				paint();
				raf = requestAnimationFrame(loop);
			};
			loop();
			return () => cancelAnimationFrame(raf);
		}
		cancelAnimationFrame(raf);
		reset();
	});
</script>

<div
	class="sr-clock"
	class:ranked
	class:unranked={!ranked}
	class:compact
	class:standby={running && !live}
	bind:this={clockEl}
>
	<span class="reticle tl" aria-hidden="true"></span>
	<span class="reticle tr" aria-hidden="true"></span>
	<span class="reticle bl" aria-hidden="true"></span>
	<span class="reticle br" aria-hidden="true"></span>

	<div class="sr-readout" aria-hidden="true">
		<div class="sr-layer sr-ghost">
			<span class="sr-main">88:88</span><span class="sr-sep">.</span><span class="sr-cc">88</span>
		</div>
		<div class="sr-layer sr-live">
			<span class="sr-main" bind:this={mainEl}>00:00</span><span class="sr-sep">.</span><span
				class="sr-cc"
				bind:this={ccEl}>00</span
			>
		</div>
	</div>

	{#if ranked}
		{#if live}
			<div class="sr-rec"><span class="sr-dot"></span>REC . RANKED</div>
		{:else}
			<div class="sr-rec standby-label"><span class="sr-dot static"></span>STANDBY</div>
		{/if}
	{:else}
		<div class="sr-rec label-only">UNRANKED</div>
	{/if}
</div>

<style>
	.sr-clock {
		position: relative;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.85rem 1.4rem 0.7rem;
		background: var(--bg2);
		border-radius: 4px;
		min-width: 216px;
	}
	.reticle {
		position: absolute;
		width: 12px;
		height: 12px;
		border: 2px solid var(--line-strong);
	}
	.reticle.tl {
		top: 0;
		left: 0;
		border-right: none;
		border-bottom: none;
	}
	.reticle.tr {
		top: 0;
		right: 0;
		border-left: none;
		border-bottom: none;
	}
	.reticle.bl {
		bottom: 0;
		left: 0;
		border-right: none;
		border-top: none;
	}
	.reticle.br {
		bottom: 0;
		right: 0;
		border-left: none;
		border-top: none;
	}
	.sr-clock.ranked .reticle {
		border-color: rgba(255, 90, 43, 0.55);
	}
	.sr-clock.ranked.standby .reticle {
		border-color: rgba(255, 90, 43, 0.28);
	}

	.sr-readout {
		position: relative;
		display: inline-grid;
		line-height: 1;
	}
	.sr-layer {
		grid-area: 1 / 1;
		display: inline-flex;
		align-items: baseline;
		font-family: 'Orbitron', sans-serif;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
	}
	.sr-main {
		font-size: 2.5rem;
		font-weight: 700;
	}
	.sr-sep,
	.sr-cc {
		font-weight: 500;
		font-size: 1.38rem; /* ~55% of the main size */
	}
	.sr-sep {
		margin: 0 0.03em;
	}
	.sr-clock.compact .sr-main {
		font-size: 1.6rem;
	}
	.sr-clock.compact .sr-sep,
	.sr-clock.compact .sr-cc {
		font-size: 0.9rem;
	}

	/* Unlit segment ghost sits behind the live digits. */
	.sr-ghost {
		z-index: 0;
		color: #3a1414;
	}
	.sr-live {
		z-index: 1;
	}
	.sr-clock.ranked .sr-live .sr-main {
		color: #ff5a2b;
		text-shadow: 0 0 14px rgba(255, 60, 20, 0.55);
	}
	.sr-clock.ranked .sr-live .sr-sep,
	.sr-clock.ranked .sr-live .sr-cc {
		color: #ffb020;
	}
	.sr-clock.unranked .sr-ghost {
		color: #17251b;
	}
	.sr-clock.unranked .sr-live .sr-main {
		color: var(--ice);
	}
	.sr-clock.unranked .sr-live .sr-sep,
	.sr-clock.unranked .sr-live .sr-cc {
		color: var(--dim);
	}
	/* Standby: armed but not started; dim the digits, drop the glow. */
	.sr-clock.standby .sr-live .sr-main {
		color: #7a3320;
		text-shadow: none;
	}
	.sr-clock.standby .sr-live .sr-sep,
	.sr-clock.standby .sr-live .sr-cc {
		color: #6a4a1a;
	}

	.sr-rec {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: #ff5a2b;
	}
	.sr-rec.label-only {
		color: var(--dim);
	}
	.sr-rec.standby-label {
		color: #9a5a3a;
	}
	.sr-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #ff2b2b;
		box-shadow: 0 0 8px rgba(255, 40, 20, 0.85);
		animation: sr-blink 1.1s steps(1, end) infinite;
	}
	.sr-dot.static {
		background: #7a3320;
		box-shadow: none;
		animation: none;
	}

	/* One-shot horizontal kick on each whole-second change (ranked only). `kick` is
	   toggled via JS classList, so mark it :global or Svelte prunes the rule. */
	.sr-clock:global(.kick) .sr-readout {
		animation: sr-kick 160ms ease-out;
	}
	@keyframes sr-kick {
		0% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(3px);
		}
		100% {
			transform: translateX(0);
		}
	}
	@keyframes sr-blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0.15;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sr-clock:global(.kick) .sr-readout {
			animation: none;
		}
		.sr-dot {
			animation: none;
		}
	}
</style>
