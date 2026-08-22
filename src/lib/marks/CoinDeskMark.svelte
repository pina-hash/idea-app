<script lang="ts">
	import { COIN_SYMBOL } from '$lib/coin-format';
</script>

<!--
	Coin Desk homepage mark: the IDEA Coin with an award "+", exactly the
	geometry this glyph shipped with inline in AppLauncher, extracted so it can
	carry motion.

	THE MOTION QUOTES WHAT THE DESK DOES, which is post a transaction: the "+"
	strikes -- a short scale-and-brighten, the way a stamp lands -- and the coin
	takes the smallest nudge from it a beat later. It reads as one entry being
	logged, then a pause, which is the actual rhythm of the tool; a continuous
	sweep would read as something streaming, and nothing on the desk streams.

	This is the ADMIN sibling of CoinMark (the student-facing Ledger card),
	whose coin flips face-on. The two share the struck i¢ and do different
	things with it on purpose: one is a currency, one is an act of awarding it.

	The symbol comes from COIN_SYMBOL, never a literal (tests/coin-symbol.test.ts).
	Strokes inherit currentColor. Animation only runs under
	prefers-reduced-motion: no-preference; nothing is hidden at rest.
-->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<g class="coin">
		<circle cx="13" cy="17" r="9.5" />
		<text x="13" y="17.5" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" style="font:700 9px 'Share Tech Mono', monospace">{COIN_SYMBOL}</text>
	</g>
	<path class="award" d="M25 8v6m3-3h-6" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.award {
		transform-origin: 25px 11px;
	}
	.coin {
		transform-origin: 13px 17px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.award {
			animation: cd-strike 4s cubic-bezier(0.4, 0, 0.3, 1) infinite;
		}
		.coin {
			animation: cd-take 4s cubic-bezier(0.4, 0, 0.3, 1) infinite;
		}
	}
	@keyframes cd-strike {
		0%,
		40%,
		100% {
			transform: scale(1);
			opacity: 0.85;
		}
		8% {
			transform: scale(1.28);
			opacity: 1;
		}
		20% {
			transform: scale(1);
			opacity: 1;
		}
	}
	@keyframes cd-take {
		0%,
		12%,
		40%,
		100% {
			transform: translateY(0);
		}
		22% {
			transform: translateY(-0.7px);
		}
	}
</style>
