<script lang="ts">
	import './brand';
	import KeyArtScene from './KeyArtScene.svelte';
	import GreenlineWordmark from './GreenlineWordmark.svelte';

	/**
	 * The GREENLINE title screen: the key art as a live full-viewport scene with
	 * the wordmark + signature line + start action composed over it (the
	 * wordmark is an overlay, not part of the scaled scene, so it stays
	 * responsive and never crops). Presentation only: one callback out.
	 */
	const {
		onStart,
		trackName = 'Proving Ground 07'
	}: {
		onStart: () => void;
		trackName?: string;
	} = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.repeat) {
			e.preventDefault();
			onStart();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="glb tt-root">
	<KeyArtScene />

	<div class="tt-stack">
		<div class="tt-tilt">
			<h1 class="tt-mark">
				<GreenlineWordmark size="clamp(2.6rem, 9.4vw, 7.2rem)" />
				<span class="tt-sheen" aria-hidden="true"></span>
			</h1>
			<div class="tt-line" aria-hidden="true">
				<span class="tt-line-bloom"></span>
				<span class="tt-line-core"></span>
			</div>
		</div>
		<div class="tt-tagline">ENGINEERED TO COLLIDE.</div>
		<button class="tt-start" onclick={onStart}>
			<span class="tt-start-label">START</span>
			<span class="tt-start-hint">ENTER</span>
		</button>
	</div>

	<div class="tt-foot">
		<span>{trackName.toUpperCase()} · NIGHT SESSION</span>
		<span class="tt-foot-dim">COMBAT RACING · BETA</span>
	</div>
</div>

<style>
	.tt-root {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--glb-night);
	}
	.tt-stack {
		position: absolute;
		left: 0;
		right: 0;
		top: 58%;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		z-index: 20;
	}
	.tt-tilt {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		transform: rotate(-1.4deg);
	}
	.tt-mark {
		position: relative;
		margin: 0;
		font-size: inherit;
		font-weight: normal;
		line-height: 1;
		filter: drop-shadow(0 10px 34px rgba(0, 0, 0, 0.8));
	}
	/* One soft diagonal soft-light band raked across the wordmark. */
	.tt-sheen {
		position: absolute;
		top: -18%;
		bottom: -18%;
		left: -12%;
		width: 16%;
		transform: rotate(14deg) translateX(0);
		background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 244, 220, 0.3), rgba(255, 255, 255, 0));
		mix-blend-mode: soft-light;
		filter: blur(6px);
		pointer-events: none;
	}
	@media (prefers-reduced-motion: no-preference) {
		.tt-sheen {
			animation: tt-sheen-sweep 8.5s ease-in-out infinite;
		}
	}
	@keyframes tt-sheen-sweep {
		0%,
		62% {
			transform: rotate(14deg) translateX(-140%);
			opacity: 0;
		}
		70% {
			opacity: 1;
		}
		84%,
		100% {
			transform: rotate(14deg) translateX(820%);
			opacity: 0;
		}
	}
	/* The signature line, edge to edge like the key art. */
	.tt-line {
		position: relative;
		width: 104%;
		margin-top: clamp(0.5rem, 1.6vw, 1.1rem);
		height: 4px;
	}
	.tt-line-bloom {
		position: absolute;
		left: 0;
		right: 0;
		top: -6px;
		height: 16px;
		background: linear-gradient(
			90deg,
			rgba(42, 229, 126, 0),
			rgba(42, 229, 126, 0.4) 20%,
			rgba(42, 229, 126, 0.4) 80%,
			rgba(42, 229, 126, 0)
		);
		filter: blur(11px);
	}
	.tt-line-core {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 4px;
		background: linear-gradient(
			90deg,
			rgba(42, 229, 126, 0) 0%,
			#2ae57e 12%,
			#eafff3 50%,
			#2ae57e 86%,
			rgba(42, 229, 126, 0) 100%
		);
		box-shadow:
			0 0 18px rgba(42, 229, 126, 0.9),
			0 0 46px rgba(42, 229, 126, 0.45);
	}
	.tt-tagline {
		margin-top: clamp(0.9rem, 2.4vw, 1.6rem);
		font: italic 600 clamp(0.72rem, 1.5vw, 0.95rem) var(--glb-font-ui);
		letter-spacing: 0.42em;
		text-indent: 0.42em;
		color: var(--glb-steel);
		text-shadow: 0 1px 10px rgba(0, 0, 0, 0.9);
	}
	.tt-start {
		margin-top: clamp(1.4rem, 4vh, 2.6rem);
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 0.68rem 3.4rem 0.6rem;
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.85), rgba(9, 13, 17, 0.9));
		border: 1px solid var(--glb-line-strong);
		border-radius: 2px;
		cursor: pointer;
		color: var(--glb-chrome-mid);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.14),
			0 8px 26px rgba(0, 0, 0, 0.65);
		transition:
			border-color 160ms ease,
			color 160ms ease,
			box-shadow 160ms ease;
	}
	.tt-start-label {
		font: 700 1.05rem var(--glb-font-ui);
		letter-spacing: 0.52em;
		text-indent: 0.52em;
		line-height: 1;
	}
	.tt-start-hint {
		font: 500 0.58rem var(--glb-font-ui);
		letter-spacing: 0.4em;
		text-indent: 0.4em;
		color: var(--glb-ink-faint);
		line-height: 1;
	}
	.tt-start:hover,
	.tt-start:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: rgba(42, 229, 126, 0.75);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.18),
			0 0 0 1px rgba(42, 229, 126, 0.25),
			0 0 22px rgba(42, 229, 126, 0.28),
			0 8px 26px rgba(0, 0, 0, 0.65);
		outline: none;
	}
	.tt-start:active {
		transform: translateY(1px);
	}
	.tt-foot {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.8rem 1.2rem;
		font: 600 0.62rem var(--glb-font-ui);
		letter-spacing: 0.28em;
		color: var(--glb-ink-dim);
		z-index: 20;
		background: linear-gradient(180deg, rgba(2, 3, 3, 0), rgba(2, 3, 3, 0.72));
	}
	.tt-foot-dim {
		color: var(--glb-ink-faint);
	}
</style>
