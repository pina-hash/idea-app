<!--
	VANGUARD homepage mark: the delta interceptor climbing through starfall,
	with a flickering thruster. Strokes inherit currentColor; the thrust reads
	the gold token. Animation only under prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- Starfall: field lines streaming past the climbing ship -->
	<g class="stars" stroke-width="1" opacity="0.45">
		<path class="star s1" d="M7 6v4" />
		<path class="star s2" d="M33 10v3" />
		<path class="star s3" d="M10 24v3" />
		<path class="star s4" d="M31 26v4" />
	</g>
	<!-- Ship -->
	<g class="ship">
		<path d="M20 4l10 22-10-5-10 5z" />
		<path d="M20 4v17" opacity="0.7" />
		<path d="M15.5 19.5L13 26.5m11.5-7l2.5 7" opacity="0.5" />
		<circle cx="20" cy="14" r="1.7" opacity="0.65" />
	</g>
	<!-- Thruster -->
	<g class="thrust" stroke="var(--gold, #c8ff00)">
		<path d="M17.5 29l-1.4 4.2M20 30v5M22.5 29l1.4 4.2" />
	</g>
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	@media (prefers-reduced-motion: no-preference) {
		.ship {
			animation: vm-bob 3.2s ease-in-out infinite;
		}
		.thrust {
			transform-origin: 20px 29px;
			animation: vm-thrust 0.5s ease-in-out infinite alternate;
		}
		.star {
			animation: vm-fall 1.8s linear infinite;
		}
		.star.s2 {
			animation-delay: 0.5s;
		}
		.star.s3 {
			animation-delay: 0.9s;
		}
		.star.s4 {
			animation-delay: 1.3s;
		}
	}
	@keyframes vm-bob {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-1.2px);
		}
	}
	@keyframes vm-thrust {
		from {
			opacity: 0.35;
			transform: scaleY(0.75);
		}
		to {
			opacity: 0.95;
			transform: scaleY(1.1);
		}
	}
	@keyframes vm-fall {
		0% {
			transform: translateY(-5px);
			opacity: 0;
		}
		30% {
			opacity: 0.7;
		}
		100% {
			transform: translateY(9px);
			opacity: 0;
		}
	}
</style>
