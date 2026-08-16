<script lang="ts">
	import { COIN_SYMBOL } from '$lib/coin-format';
</script>

<!--
	IDEA Coin Ledger homepage mark: the recognizable IDEA Coin (an "i¢" struck on
	a rimmed coin) doing a slow face-on flip about its vertical axis, matching
	the VANGUARD/GAUNTLET marks. Strokes inherit currentColor. The flip is a
	single horizontal-scale transform on the whole coin group (rings and glyph
	together, never a second element layered on top), eased so it lingers face-on
	and snaps through the thin edge; the outer ring dims slightly at the thinnest
	point so the edge reads as an edge. Animation only runs under
	prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<g class="coin">
		<circle class="ring" cx="20" cy="20" r="13" />
		<circle cx="20" cy="20" r="10.4" opacity="0.45" />
		<text
			class="mark"
			x="20"
			y="20.5"
			text-anchor="middle"
			dominant-baseline="central"
			fill="currentColor"
			stroke="none">{COIN_SYMBOL}</text
		>
	</g>
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.mark {
		font-family: 'Share Tech Mono', monospace;
		font-weight: 700;
		font-size: 13px;
	}
	.coin {
		transform-box: fill-box;
		transform-origin: center;
	}
	@media (prefers-reduced-motion: no-preference) {
		.coin {
			animation: coin-flip 4.6s cubic-bezier(0.6, 0, 0.4, 1) infinite;
		}
		.ring {
			animation: coin-edge-shade 4.6s cubic-bezier(0.6, 0, 0.4, 1) infinite;
		}
	}
	@keyframes coin-flip {
		0%,
		92%,
		100% {
			transform: scaleX(1);
		}
		4% {
			transform: scaleX(0.05);
		}
		8% {
			transform: scaleX(1);
		}
	}
	@keyframes coin-edge-shade {
		0%,
		92%,
		100% {
			opacity: 1;
		}
		4% {
			opacity: 0.5;
		}
		8% {
			opacity: 1;
		}
	}
</style>
