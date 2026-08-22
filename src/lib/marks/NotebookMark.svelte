<!--
	My Notebook homepage mark: the bound notebook with a camera lens on its
	cover, exactly the geometry this glyph shipped with inline in AppLauncher --
	extracted so it can carry motion, not redrawn.

	THE MOTION QUOTES WHAT THE ROOM ACTUALLY DOES, which is photograph paper.
	The lens racks focus: a small, slow breath in and out, with the ring dimming
	slightly at the far end of the travel the way a lens does as it passes
	through. That is the one gesture the notebook is about -- a page in front of
	a camera -- and it is deliberately the only thing moving, because the room's
	own surfaces are quiet paper plates.

	Strokes inherit currentColor, so the card accent drives the hue. Animation
	only runs under prefers-reduced-motion: no-preference; nothing is hidden at
	rest.
-->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M8 5h16a2 2 0 012 2v18a2 2 0 01-2 2H8z" /><path d="M8 5a2 2 0 00-2 2v18a2 2 0 002 2" />
	<path d="M6 11h4M6 16h4M6 21h4" />
	<circle class="lens" cx="17" cy="16" r="4" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.lens {
		/* Scale rather than an animated `r`: the transform is the property every
		   browser here composites, and the origin is the lens centre in user
		   units so it breathes about its own axis. */
		transform-origin: 17px 16px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.lens {
			animation: nm-focus 3.8s ease-in-out infinite;
		}
	}
	@keyframes nm-focus {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		45% {
			transform: scale(0.86);
			opacity: 0.6;
		}
		70% {
			transform: scale(1.04);
			opacity: 0.9;
		}
	}
</style>
