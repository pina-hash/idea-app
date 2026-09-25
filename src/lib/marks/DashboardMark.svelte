<script lang="ts">
	/**
	 * Admin mark (the `dashboard` card, the one admin console since ledger 0117):
	 * A CONTROL DESK. Redrawn in place (ledger 0298, decision 40 item 3) from a
	 * line gauge that was the thinnest glyph on the launcher -- three strokes
	 * and a hub, with none of the depth the other marks have.
	 *
	 * THE DRAWING is the IdeaCAD construction: an isometric slab with a lit top
	 * face, two shaded walls and a highlight on the leading edges. On the top
	 * face sit three fader slots, each with its knob at a different setting,
	 * and a status lamp on the front wall. What the console is for -- the admin
	 * roster, the review queues, the short links, the coin tools -- is a set of
	 * settings someone owns, so the glyph is the desk they are set from.
	 *
	 * THE MOTION IS SETTING IT. The three knobs slide along their slots to their
	 * settings one after another, and the lamp comes on when the last one lands;
	 * then it holds. Looping (the /dev/marks harness only) the knobs return and
	 * the lamp dims, so the loop never jumps.
	 *
	 * The slots run along the face's own axis: a point on the top face is
	 * A + s(B - A) + t(D - A) with A 16,6 / B 29,13 / D 3,13, the slots sit at
	 * s = 0.28, 0.5 and 0.72 from t = 0.15 to 0.85, and a knob's travel is a
	 * change of t, which is a translate along (-13, 7) per unit.
	 *
	 * NOTHING IS HIDDEN AT REST, the rule every mark in this directory follows:
	 * no opacity and no transform is declared outside a keyframe, so a
	 * reduced-motion reader sees the knobs at their settings and the lamp on.
	 * Animation only under prefers-reduced-motion: no-preference.
	 *
	 * `once` PLAYS HALF A CYCLE, which ends on the rest state exactly: every
	 * keyframe set here holds its rest value from before 50% to 84%.
	 *
	 * PAINT IS currentColor, the card's own ink, with the faces as mixes of it;
	 * a host that owns tokens points the five `--dbm-*` hooks at them instead.
	 */
	let { once = false }: { once?: boolean } = $props();
</script>

<svg class:once viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The slab: two shaded walls, the lit top, then the outline. -->
	<path class="left" d="M3 13v6l13 7v-6Z" stroke="none" />
	<path class="right" d="M29 13v6l-13 7v-6Z" stroke="none" />
	<path class="top" d="M16 6 29 13 16 20 3 13Z" stroke="none" />
	<path class="edge" d="M16 6 29 13 16 20 3 13ZM3 13v6l13 7 13-7v-6M16 20v6" />
	<path class="hl" d="M3 13 16 20 29 13" stroke-width="0.8" />
	<!-- Three fader slots on the top face. -->
	<path class="edge slot" d="M17.7 9 8.6 13.9M20.55 10.55 11.45 15.45M23.4 12.1 14.3 17" stroke-width="0.9" stroke-opacity=".6" />
	<!-- The knobs, at their settings. -->
	<path class="hl knob k1" d="M13.9 9.8 16.3 11" stroke-width="2.2" />
	<path class="hl knob k2" d="M12.5 13.6 14.8 14.9" stroke-width="2.2" />
	<path class="hl knob k3" d="M18.3 13.6 20.7 14.8" stroke-width="2.2" />
	<!-- The status lamp on the front wall. -->
	<circle class="lamp" cx="23.8" cy="18.9" r="1" stroke="none" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
		overflow: visible;
	}
	.edge {
		stroke: var(--dbm-edge, currentColor);
	}
	.hl {
		stroke: var(--dbm-hl, currentColor);
	}
	.lamp {
		fill: var(--dbm-hl, currentColor);
	}
	.top {
		fill: var(--dbm-top, color-mix(in srgb, currentColor 46%, transparent));
	}
	.right {
		fill: var(--dbm-right, color-mix(in srgb, currentColor 26%, transparent));
	}
	.left {
		fill: var(--dbm-left, color-mix(in srgb, currentColor 12%, transparent));
	}

	@media (prefers-reduced-motion: no-preference) {
		.k1 {
			animation: dm-k1 4.4s infinite;
		}
		.k2 {
			animation: dm-k2 4.4s infinite;
		}
		.k3 {
			animation: dm-k3 4.4s infinite;
		}
		.lamp {
			animation: dm-lamp 4.4s infinite;
		}
		.once .knob,
		.once .lamp {
			animation-iteration-count: 0.5;
		}
	}

	/* Each knob starts elsewhere on its slot and eases to its setting, the
	   three staggered; all of them hold from before 50% to 84%, so half a cycle
	   ends where the base styles already are. */
	@keyframes dm-k1 {
		0%,
		6% {
			transform: translate(-4.8px, 2.6px);
			animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1);
		}
		26%,
		84% {
			transform: translate(0, 0);
		}
		94%,
		100% {
			transform: translate(-4.8px, 2.6px);
		}
	}
	@keyframes dm-k2 {
		0%,
		14% {
			transform: translate(5.2px, -2.8px);
			animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1);
		}
		34%,
		84% {
			transform: translate(0, 0);
		}
		94%,
		100% {
			transform: translate(5.2px, -2.8px);
		}
	}
	@keyframes dm-k3 {
		0%,
		22% {
			transform: translate(-4.6px, 2.4px);
			animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1);
		}
		42%,
		84% {
			transform: translate(0, 0);
		}
		94%,
		100% {
			transform: translate(-4.6px, 2.4px);
		}
	}
	@keyframes dm-lamp {
		0%,
		40% {
			opacity: 0.25;
		}
		46%,
		84% {
			opacity: 1;
		}
		94%,
		100% {
			opacity: 0.25;
		}
	}
</style>
