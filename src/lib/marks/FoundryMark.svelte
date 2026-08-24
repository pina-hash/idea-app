<!--
	IDEA Foundry homepage mark: a browser window whose contents are being POURED
	INTO IT -- a crucible above a frame, three drops falling, and the frame's
	own content lighting up as each one lands.

	WHY THIS GLYPH. Foundry is students casting a working thing out of raw
	material and then putting it behind glass: the crucible is the build, the
	window is the sandbox it ends up running in, and the drops are the versions
	that go in one at a time. It reads as "make" and "publish" together, which is
	what the surface is, and it is not another gauge, grid or bracket -- the
	launcher already has those.

	THE MOTION IS A POUR ON A LOOP, ~4.4s: a drop leaves the crucible, falls,
	and the line it lands on brightens as it arrives. The three drops are the
	same animation at three offsets, so there is one keyframe pair rather than
	three hand-tuned ones.

	NOTHING IS HIDDEN AT REST, which is the rule every mark in this directory
	follows: with the animation cancelled every element sits at full opacity and
	no transform, so a reduced-motion reader sees the whole glyph -- a crucible,
	a window, three drops mid-fall and three lines of content. The walk DIPS and
	returns rather than fading anything in from nothing.

	It inherits currentColor, which the card resolves to --acc-ink. Animation
	only under prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The crucible: a spouted vessel, tipped. -->
	<path class="crucible" d="M9 4h9l-1.6 4.2a2 2 0 0 1-1.9 1.3h-2a2 2 0 0 1-1.9-1.3Z" />
	<!-- The three drops, on the pour line down into the frame. -->
	<circle class="drop d1" cx="14" cy="12.6" r="0.9" />
	<circle class="drop d2" cx="14" cy="12.6" r="0.9" />
	<circle class="drop d3" cx="14" cy="12.6" r="0.9" />
	<!-- The sandbox: a browser frame with its own title bar. -->
	<rect class="frame" x="5" y="16" width="22" height="12" rx="2" />
	<path class="frame-bar" d="M5 19.5h22" />
	<!-- What lands in it. Each line brightens as its drop arrives. -->
	<path class="line l1" d="M8.5 22.8h9" />
	<path class="line l2" d="M8.5 25.4h13" />
	<path class="line l3" d="M20.5 22.8h3" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	@media (prefers-reduced-motion: no-preference) {
		.drop {
			animation: fd-pour 4.4s ease-in infinite;
		}
		.d2 {
			animation-delay: 1.1s;
		}
		.d3 {
			animation-delay: 2.2s;
		}
		/* Each line lights as its own drop lands: the drop's fall ends at 34% of
		   a 4.4s cycle, so the landing offsets are the drop delays plus that. */
		.l1 {
			animation: fd-land 4.4s ease-out infinite 1.4s;
		}
		.l2 {
			animation: fd-land 4.4s ease-out infinite 2.5s;
		}
		.l3 {
			animation: fd-land 4.4s ease-out infinite 3.6s;
		}
		.crucible {
			animation: fd-tip 4.4s ease-in-out infinite;
		}
	}

	/*
	   The drop starts and ENDS at its resting position and full opacity, so a
	   cancelled animation leaves three drops sitting on the pour line rather
	   than three invisible ones. It is only mid-cycle that they fall.
	*/
	@keyframes fd-pour {
		0% {
			transform: translateY(0);
			opacity: 1;
		}
		30% {
			transform: translateY(2.6px);
			opacity: 1;
		}
		34% {
			transform: translateY(3px);
			opacity: 0;
		}
		35%,
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes fd-land {
		0%,
		18%,
		100% {
			opacity: 1;
		}
		6% {
			opacity: 0.4;
		}
	}

	/* A tip of two degrees, around the crucible's own lip. Small on purpose:
	   the pour is the motion, the vessel only acknowledges it. */
	@keyframes fd-tip {
		0%,
		40%,
		100% {
			transform: rotate(0deg);
		}
		15% {
			transform: rotate(-2.5deg);
		}
	}

	.crucible {
		transform-origin: 18px 4px;
	}
</style>
