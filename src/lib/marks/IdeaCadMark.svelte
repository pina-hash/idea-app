<script lang="ts">
	/**
	 * IdeaCAD mark: a SKETCH PULLED INTO A SOLID, which is the whole program in
	 * one gesture. It is the same isometric cube the launcher drew inline before
	 * (the top at 16,4 / 27,10 / 16,16 / 5,10 and the walls down to 28), kept as
	 * the logo and given a lit top face, shaded sides, a highlight on the
	 * leading edges and the sketch profile it was extruded from, drawn dashed
	 * underneath the way a CAD view shows a hidden line.
	 *
	 * THE MOTION IS AN EXTRUDE. The top face starts flat on the profile (at
	 * that moment its outline IS the sketch), rises twelve units while the three
	 * walls grow out of the floor, the faces shade in, the cube holds, and then
	 * it retracts into the sketch again, so the loop never jumps and never goes
	 * blank. The walls scale about their own bottom ends and the top translates
	 * by the same eased amount, so every corner stays on its wall the whole way.
	 *
	 * NOTHING IS HIDDEN AT REST, the rule every mark in this directory follows:
	 * no opacity and no transform is declared outside a keyframe, so with the
	 * animation cancelled a reduced-motion reader sees the finished, shaded cube
	 * and never a frame caught mid-extrude. Animation only under
	 * prefers-reduced-motion: no-preference.
	 *
	 * `once` PLAYS HALF A CYCLE, which ends on the rest state exactly: the
	 * keyframes put the finished cube at 50%, so the IdeaCAD front door can
	 * extrude its logo one time on arrival and settle, with no second set of
	 * keyframes to drift away from this one.
	 *
	 * PAINT IS currentColor BY DEFAULT, the card's own ink, with the faces as
	 * mixes of it. A host that owns tokens (the IdeaCAD front door) points the
	 * five `--icm-*` hooks at them instead; nothing here names a color.
	 */
	let { once = false }: { once?: boolean } = $props();
</script>

<svg class:once viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The sketch profile: the hidden back edges, dashed. Its front edges are the cube's own floor line below. -->
	<path class="profile" d="M5 22 16 16 27 22" stroke-width="1" stroke-dasharray="1.6 1.9" stroke-opacity=".55" />
	<!-- The two visible walls, shaded, and the three wall edges that grow. -->
	<g class="shade">
		<path class="left" d="M5 10v12l11 6V16Z" stroke="none" />
		<path class="right" d="M27 10v12l-11 6V16Z" stroke="none" />
	</g>
	<path class="wall side" d="M5 10v12M27 10v12" />
	<path class="wall front" d="M16 16v12" />
	<path class="hl front" d="M16 16v12" stroke-width="0.8" />
	<!-- The floor: the profile's front edges, which are also the cube's bottom. -->
	<path class="floor" d="M5 22 16 28 27 22" />
	<!-- The top face, lit, with the leading-edge highlight. It rides the extrude. -->
	<g class="top">
		<path class="lit shade" d="M16 4 27 10 16 16 5 10Z" stroke="none" />
		<path class="edge" d="M16 4 27 10 16 16 5 10Z" />
		<path class="hl" d="M5 10 16 16 27 10" stroke-width="0.8" />
	</g>
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
		overflow: visible;
	}
	.profile,
	.wall,
	.floor,
	.edge {
		stroke: var(--icm-edge, currentColor);
	}
	.hl {
		stroke: var(--icm-hl, currentColor);
	}
	.lit {
		fill: var(--icm-top, color-mix(in srgb, currentColor 46%, transparent));
	}
	.right {
		fill: var(--icm-right, color-mix(in srgb, currentColor 26%, transparent));
	}
	.left {
		fill: var(--icm-left, color-mix(in srgb, currentColor 12%, transparent));
	}
	/* The walls grow from where they meet the floor, stated in user units: the
	   side edges stand on y 22, the front edge on y 28. */
	.wall.side {
		transform-origin: 0 22px;
	}
	.wall.front,
	.hl.front {
		transform-origin: 16px 28px;
	}

	@media (prefers-reduced-motion: no-preference) {
		.top {
			animation: im-rise 4.4s infinite;
		}
		.wall,
		.hl.front {
			animation: im-grow 4.4s infinite;
		}
		.shade {
			animation: im-shade 4.4s infinite;
		}
		.once .top,
		.once .wall,
		.once .hl.front,
		.once .shade {
			animation-iteration-count: 0.5;
		}
	}

	/* The rest state (the finished cube) sits at 50% and holds to 84%, so half
	   a cycle ends exactly where the base styles already are. The rise eases
	   out, the retract eases in, and the two keyframe sets below share both
	   curves so a corner never leaves its wall. */
	@keyframes im-rise {
		0%,
		8% {
			transform: translateY(12px);
			animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1);
		}
		36%,
		84% {
			transform: translateY(0);
		}
		90% {
			transform: translateY(0);
			animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.4);
		}
		100% {
			transform: translateY(12px);
		}
	}
	@keyframes im-grow {
		0%,
		8% {
			transform: scaleY(0);
			animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1);
		}
		36%,
		84% {
			transform: scaleY(1);
		}
		90% {
			transform: scaleY(1);
			animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.4);
		}
		100% {
			transform: scaleY(0);
		}
	}
	@keyframes im-shade {
		0%,
		30% {
			opacity: 0;
		}
		50%,
		84% {
			opacity: 1;
		}
		90%,
		100% {
			opacity: 0;
		}
	}
</style>
