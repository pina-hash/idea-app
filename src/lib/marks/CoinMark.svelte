<!--
	IDEA Coin Ledger homepage mark: the recognizable IDEA Coin (an "i¢" struck on
	a rimmed coin) with a specular glint sweeping across its face and a gentle
	bob, matching the VANGUARD/GAUNTLET marks. Strokes inherit currentColor; the
	glint reads the gold token. Animation only under prefers-reduced-motion:
	no-preference.
-->
<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<g class="coin">
		<circle cx="20" cy="20" r="13" />
		<circle cx="20" cy="20" r="10.4" opacity="0.45" />
		<text
			class="mark"
			x="20"
			y="20.5"
			text-anchor="middle"
			dominant-baseline="central"
			fill="currentColor"
			stroke="none">i&#162;</text
		>
	</g>
	<!-- specular glint sweeping the coin face -->
	<line class="glint" x1="13.5" y1="26.5" x2="26.5" y2="13.5" stroke="var(--gold, #c8ff00)" stroke-width="2" opacity="0" />
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
		transform-origin: 20px 20px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.coin {
			animation: coin-bob 3.4s ease-in-out infinite;
		}
		.glint {
			animation: coin-glint 3.8s ease-in-out infinite;
		}
	}
	@keyframes coin-bob {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-1px);
		}
	}
	@keyframes coin-glint {
		0% {
			opacity: 0;
			transform: translate(-6px, 6px);
		}
		42% {
			opacity: 0.85;
		}
		58% {
			opacity: 0.85;
		}
		100% {
			opacity: 0;
			transform: translate(6px, -6px);
		}
	}
</style>
