<script lang="ts">
	/**
	 * IDEA Armory mark: A VAULT WITH A PART CARD GOING INTO IT.
	 *
	 * THE DRAWING is the IdeaCAD construction every redrawn mark shares: an
	 * isometric block with a lit top face, two shaded walls and a highlight on
	 * the leading edges. The block is the vault, which is what Armory is on
	 * every computer (C:\IDEA\Armory) and on the server. A door with a handle
	 * on the left wall says it is a place things are kept; a slot in the top
	 * face holds a part card standing up in it, which is a file being checked
	 * in; a lamp on the right wall is the saved state.
	 *
	 * THE MOTION IS CHECKING IN. The card drops from above into its place in
	 * the slot, and the lamp comes on as it lands; then it holds. Looping (the
	 * /dev/marks harness only) the card lifts back out and the lamp dims, so
	 * the loop never jumps.
	 *
	 * NOTHING IS HIDDEN AT REST, the rule every mark in this directory follows:
	 * no opacity and no transform is declared outside a keyframe, so a
	 * reduced-motion reader sees the card in its slot and the lamp on.
	 * Animation only under prefers-reduced-motion: no-preference.
	 *
	 * `once` PLAYS HALF A CYCLE, which ends on the rest state exactly: every
	 * keyframe set here holds its rest value from before 50% to 84%.
	 *
	 * PAINT IS currentColor, the card's own ink, with the faces as mixes of it;
	 * a host that owns tokens points the five `--arm-*` hooks at them instead.
	 * Nothing is animated to a colour (CLAUDE.md, the Chrome 154 keyframe
	 * crash): the keyframes move a transform and an opacity only.
	 */
	let { once = false }: { once?: boolean } = $props();
</script>

<svg class:once viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The vault: two shaded walls, the lit top, then the outline. -->
	<path class="left" d="M4 12v10l12 6V18Z" stroke="none" />
	<path class="right" d="M28 12v10l-12 6V18Z" stroke="none" />
	<path class="top" d="M16 6 28 12 16 18 4 12Z" stroke="none" />
	<path class="edge" d="M16 6 28 12 16 18 4 12ZM4 12v10l12 6 12-6V12M16 18v10" />
	<path class="hl" d="M4 12 16 18 28 12" stroke-width="0.8" />
	<!-- The door on the left wall, and its handle. -->
	<path class="edge" d="M6.5 15.6v5.3l7 3.5v-5.3Z" stroke-width="0.9" stroke-opacity=".7" />
	<path class="hl" d="M11.6 20.6v1.6" stroke-width="1.2" />
	<!-- The slot in the top face. -->
	<path class="edge" d="M12 10.5 19.5 14.25" stroke-width="1.1" />
	<!-- The part card, standing in the slot. -->
	<g class="card">
		<path class="face" d="M12.6 10.8 19 14V8.6l-6.4-3.2Z" stroke="none" />
		<path class="edge" d="M12.6 10.8 19 14V8.6l-6.4-3.2Z" stroke-width="1.1" />
		<path class="hl" d="M14.2 8 17.4 9.6M14.2 9.9 16.4 11" stroke-width="0.8" />
	</g>
	<!-- The lamp on the right wall: saved. -->
	<circle class="lamp" cx="23.6" cy="18.6" r="1.1" stroke="none" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
		overflow: visible;
	}
	.edge {
		stroke: var(--arm-edge, currentColor);
	}
	.hl {
		stroke: var(--arm-hl, currentColor);
	}
	.lamp {
		fill: var(--arm-hl, currentColor);
	}
	.top,
	.face {
		fill: var(--arm-top, color-mix(in srgb, currentColor 46%, transparent));
	}
	.right {
		fill: var(--arm-right, color-mix(in srgb, currentColor 26%, transparent));
	}
	.left {
		fill: var(--arm-left, color-mix(in srgb, currentColor 12%, transparent));
	}

	@media (prefers-reduced-motion: no-preference) {
		.card {
			animation: arm-drop 4.4s infinite;
		}
		.lamp {
			animation: arm-lamp 4.4s infinite;
		}
		.once .card,
		.once .lamp {
			animation-iteration-count: 0.5;
		}
	}

	/* The card falls from above into its slot and holds from before 50% to
	   84%, so half a cycle ends where the base styles already are. */
	@keyframes arm-drop {
		0%,
		8% {
			transform: translate(0, -5px);
			animation-timing-function: cubic-bezier(0.3, 0, 0.6, 1);
		}
		30% {
			transform: translate(0, 0.6px);
		}
		36%,
		84% {
			transform: translate(0, 0);
		}
		94%,
		100% {
			transform: translate(0, -5px);
		}
	}
	@keyframes arm-lamp {
		0%,
		32% {
			opacity: 0.3;
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
</style>
