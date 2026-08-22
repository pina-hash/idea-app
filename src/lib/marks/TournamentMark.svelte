<!--
	Tournaments homepage mark: the double-elimination bracket -- two pairs
	converging through a spine into a final node -- exactly the geometry this
	glyph shipped with inline in AppLauncher, extracted so it can carry motion.

	THE MOTION QUOTES THE ROOM'S ONE LIVE THING: a bracket resolving. The upper
	pair lights, then the lower pair, then the final node rings, in the order a
	real bracket advances, and the cycle restarts. It is a brightness walk over
	strokes that are ALL DRAWN AT REST -- the base state is the full bracket at
	its resting opacity, so with the animation off nothing is missing and no
	stroke is hidden waiting for a frame that never comes.

	RESTRAINT IS THE ROOM'S RULE (tournaments-theme.css: at most one dominant
	emerald element per screen), and this mark is the card's one. It inherits
	currentColor, which the card resolves to --tnm-accent; the gold on this card
	is the top-edge strip and nothing else. Animation only runs under
	prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path class="pair upper" d="M4 6h6M4 12h6M10 6v6M10 9h4" />
	<path class="pair lower" d="M4 20h6M4 26h6M10 20v6M10 23h4" />
	<path class="spine" d="M14 9v14M14 16h5" />
	<circle class="final" cx="24" cy="16" r="4" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.final {
		transform-origin: 24px 16px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.pair.upper {
			animation: tm-advance 4.2s ease-in-out infinite;
		}
		.pair.lower {
			animation: tm-advance 4.2s ease-in-out infinite 0.5s;
		}
		.spine {
			animation: tm-advance 4.2s ease-in-out infinite 1s;
		}
		.final {
			animation: tm-ring 4.2s ease-in-out infinite 1.5s;
		}
	}
	/* Base opacity is 1 at both ends: the walk DIPS and returns rather than
	   fading something in from nothing. */
	@keyframes tm-advance {
		0%,
		34%,
		100% {
			opacity: 1;
		}
		12% {
			opacity: 0.45;
		}
	}
	@keyframes tm-ring {
		0%,
		30%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		12% {
			transform: scale(1.12);
			opacity: 0.55;
		}
	}
</style>
