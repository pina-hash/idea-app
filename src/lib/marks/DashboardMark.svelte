<!--
	Admin Dashboard homepage mark: the gauge -- dial, needle and hub -- exactly
	the geometry this glyph shipped with inline in AppLauncher, extracted so it
	can carry motion.

	THE MOTION IS THE ONE THING A GAUGE DOES: the needle sweeps the dial and
	settles, which is also what the surface behind it is (roles, pathways and
	the content review queues, i.e. a set of readings someone checks). The sweep
	is asymmetric on purpose -- it moves out quickly and eases back -- so it
	reads as a needle taking a reading rather than a wiper.

	Strokes inherit currentColor. Animation only runs under
	prefers-reduced-motion: no-preference; at rest the needle sits exactly where
	the static glyph drew it.
-->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M5 24a11 11 0 1122 0z" />
	<path class="needle" d="M16 24l5.5-7" />
	<circle cx="16" cy="24" r="1.6" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.needle {
		/* The hub, in user units: a needle that pivots about the middle of its
		   own bounding box swings off the dial entirely. */
		transform-origin: 16px 24px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.needle {
			animation: dm-sweep 4.4s ease-in-out infinite;
		}
	}
	@keyframes dm-sweep {
		0%,
		100% {
			transform: rotate(0deg);
		}
		18% {
			transform: rotate(-38deg);
		}
		46% {
			transform: rotate(30deg);
		}
		72% {
			transform: rotate(-8deg);
		}
	}
</style>
