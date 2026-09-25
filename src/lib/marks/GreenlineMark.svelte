<script lang="ts">
	/**
	 * GREENLINE mark: A RACER ON THE TRACK, SEEN FROM THE CHASE CAMERA, which is
	 * the game's own view (3D combat racing, the player's machine ahead of the
	 * camera). Redrawn in place (ledger 0298, decision 40 item 3): it used to be
	 * a rounded rectangle with a dot lapping it, which read as a loading ring
	 * rather than a race, and it was the one mark here that painted a literal
	 * colour -- a near-white that measured 1.05:1 on Space White's light card,
	 * so the launcher needed a theme rule just to make the icon visible.
	 *
	 * THE DRAWING. The road runs from the bottom edge toward the horizon; the
	 * machine sits low on it, seen from behind and above: a lit deck and
	 * cockpit, the tail panel with two thruster ports, a fin either side, and a
	 * rear wing across the whole width -- nearest the camera, so it crosses the
	 * body, which is what makes the silhouette read as a racer and not as a
	 * second triangle beside the road's. The RACING LINE runs from the cockpit
	 * up the road to the horizon: the "green line" the game is named for, the
	 * thread a player drives.
	 *
	 * THE MOTION IS A LAUNCH. The machine rises onto its hover height, the
	 * thrusters flare, and the racing line draws itself up the road to the
	 * horizon; then it holds. Looping (the /dev/marks harness only) it
	 * settles back and the line withdraws, so the loop never jumps.
	 *
	 * NOTHING IS HIDDEN AT REST, the rule every mark in this directory follows:
	 * no opacity and no transform is declared outside a keyframe, and the racing
	 * line's dash is fully drawn at rest (offset 0), so a reduced-motion reader
	 * sees the whole scene. Animation only under
	 * prefers-reduced-motion: no-preference.
	 *
	 * `once` PLAYS HALF A CYCLE, which ends on the rest state exactly: every
	 * keyframe set here holds its rest value from before 50% to 84%.
	 *
	 * PAINT IS currentColor, the card's own ink, with the faces as mixes of it
	 * (the IdeaCAD standard: 46% lit, 26% and 12% shaded); a host that owns
	 * tokens points the five `--glm-*` hooks at them instead. No literal colour,
	 * so the card's Space White ink reaches every stroke with no theme rule.
	 */
	let { once = false }: { once?: boolean } = $props();
</script>

<svg class:once viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The road: its surface, faint, and its two edges running to the horizon. -->
	<path class="left" d="M1 31 12.5 8h7L31 31Z" stroke="none" />
	<path class="edge road" d="M1 31 12.5 8M31 31 19.5 8" stroke-width="1.2" stroke-opacity=".7" />
	<!-- The racing line: from the cockpit up the road to the horizon. It stops
	     at the machine rather than running under it, because the faces are
	     translucent and a line behind them would show through. -->
	<path class="line" d="M16.1 13.6c.1-2.1 1.9-3.4 2-5.6" pathLength="1" stroke-dasharray="1 1" stroke-width="1.3" />
	<!-- The machine from the chase camera: the side fins, the tail panel, the
	     deck and cockpit, the rear wing across it (nearest the camera) and the
	     two thrusters. -->
	<g class="craft">
		<path class="left" d="M7 21.4 3.5 24.8h4.9ZM25 21.4l3.5 3.4h-4.9Z" stroke="none" />
		<path class="right" d="M7 21.4h18l-1.4 4H8.4Z" stroke="none" />
		<path class="top" d="M11 16.8h10l4 4.6H7ZM13.2 16.8l1.2-2.2h3.2l1.2 2.2Z" stroke="none" />
		<path class="edge" d="M11 16.8h10l4 4.6H7ZM13.2 16.8l1.2-2.2h3.2l1.2 2.2M7 21.4l1.4 4h15.2l1.4-4M7 21.4 3.5 24.8h4.9M25 21.4l3.5 3.4h-4.9" stroke-width="1.2" />
		<path class="hl" d="M5.5 19.2h21M5.5 17.8v2.8M26.5 17.8v2.8" stroke-width="1.3" />
		<path class="hl thrust" d="M10.8 23.5h2.8M18.4 23.5h2.8" stroke-width="1.6" />
	</g>
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
		overflow: visible;
	}
	.edge {
		stroke: var(--glm-edge, currentColor);
	}
	.hl,
	.line {
		stroke: var(--glm-hl, currentColor);
	}
	.top {
		fill: var(--glm-top, color-mix(in srgb, currentColor 46%, transparent));
	}
	.right {
		fill: var(--glm-right, color-mix(in srgb, currentColor 26%, transparent));
	}
	.left {
		fill: var(--glm-left, color-mix(in srgb, currentColor 12%, transparent));
	}

	@media (prefers-reduced-motion: no-preference) {
		.craft {
			animation: gl-hover 4.2s infinite;
		}
		.thrust {
			animation: gl-thrust 4.2s infinite;
		}
		.line {
			animation: gl-line 4.2s infinite;
		}
		.once .craft,
		.once .thrust,
		.once .line {
			animation-iteration-count: 0.5;
		}
	}

	/* Every set holds its rest value from before 50% to 84%, so half a cycle
	   ends where the base styles already are; the second half undoes the first
	   so the loop never jumps. */
	@keyframes gl-hover {
		0%,
		6% {
			transform: translateY(4px);
			animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1);
		}
		32%,
		84% {
			transform: translateY(0);
		}
		94%,
		100% {
			transform: translateY(4px);
		}
	}
	@keyframes gl-thrust {
		0%,
		14% {
			opacity: 0.3;
		}
		26% {
			opacity: 1;
		}
		32% {
			opacity: 0.6;
		}
		40%,
		84% {
			opacity: 1;
		}
		94%,
		100% {
			opacity: 0.3;
		}
	}
	@keyframes gl-line {
		0%,
		22% {
			stroke-dashoffset: 1;
			animation-timing-function: cubic-bezier(0.3, 0.6, 0.3, 1);
		}
		44%,
		84% {
			stroke-dashoffset: 0;
		}
		94%,
		100% {
			stroke-dashoffset: 1;
		}
	}
</style>
