<script lang="ts">
	/**
	 * IDEA Market mark (the `market` card, ledger 0414): A MARKET STALL. A
	 * striped awning over a counter, with a price tag hanging under the awning,
	 * which is what the market is: things put up for a price, by staff and by
	 * students.
	 *
	 * THE DRAWING follows the IdeaCAD construction the redrawn marks share:
	 * faces mixed from currentColor at three tiers (the awning's stripes
	 * alternate the top and right tiers, the counter front is the left tier),
	 * an outline in the edge tier, and a highlight on the awning's leading
	 * edge and the counter top.
	 *
	 * THE MOTION IS OPENING THE STALL. The awning rolls down from the roof line
	 * and the tag swings in on its string a beat later, settles, and holds.
	 * Looping (the /dev/marks harness only) the awning rolls back up and the tag
	 * swings out, so the loop never jumps.
	 *
	 * NOTHING IS HIDDEN AT REST, the rule every mark in this directory follows:
	 * no opacity and no transform is declared outside a keyframe, so a
	 * reduced-motion reader sees the open stall with its tag.
	 * Animation only under prefers-reduced-motion: no-preference.
	 *
	 * `once` PLAYS HALF A CYCLE, which ends on the rest state exactly: every
	 * keyframe set here holds its rest value from before 50% to 84%.
	 *
	 * PAINT IS currentColor, the card's own ink, with the faces as mixes of it;
	 * a host that owns tokens points the five `--mkm-*` hooks at them instead.
	 */
	let { once = false }: { once?: boolean } = $props();
</script>

<svg class:once viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The counter: its front face, the outline, the posts up to the awning. -->
	<path class="left" d="M3 20h26v7H3Z" stroke="none" />
	<path class="edge" d="M3 20h26v7H3ZM5 14v6M27 14v6" />
	<path class="hl" d="M3 20h26" stroke-width="0.8" />
	<!-- The awning: four stripes in two tiers, the outline, the scalloped hem. -->
	<g class="awning">
		<path class="top" d="M5 6h5.5L9.5 12H3ZM16 6h5.5l1 6H16Z" stroke="none" />
		<path class="right" d="M10.5 6H16v6H9.5ZM21.5 6H27l2 6h-6.5Z" stroke="none" />
		<path class="edge" d="M5 6h22l2 6H3ZM10.5 6l-1 6M16 6v6M21.5 6l1 6" />
		<path class="edge" d="M3 12a3.25 2 0 0 0 6.5 0a3.25 2 0 0 0 6.5 0a3.25 2 0 0 0 6.5 0a3.25 2 0 0 0 6.5 0" stroke-width="1.2" />
		<path class="hl" d="M3 12h26" stroke-width="0.8" />
	</g>
	<!-- The price tag on its string, hanging under the awning. -->
	<g class="tag">
		<path class="edge" d="M20 14v1.6" stroke-width="0.9" />
		<path class="top" d="M17.8 15.6h4.4v2.4L20 19.6 17.8 18Z" stroke="none" />
		<path class="edge" d="M17.8 15.6h4.4v2.4L20 19.6 17.8 18Z" stroke-width="1.1" />
		<circle class="hole" cx="20" cy="16.9" r="0.55" stroke="none" />
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
		stroke: var(--mkm-edge, currentColor);
	}
	.hl {
		stroke: var(--mkm-hl, currentColor);
	}
	.hole {
		fill: var(--mkm-hl, currentColor);
	}
	.top {
		fill: var(--mkm-top, color-mix(in srgb, currentColor 46%, transparent));
	}
	.right {
		fill: var(--mkm-right, color-mix(in srgb, currentColor 26%, transparent));
	}
	.left {
		fill: var(--mkm-left, color-mix(in srgb, currentColor 12%, transparent));
	}
	.awning {
		transform-origin: 16px 6px;
	}
	.tag {
		transform-origin: 20px 14px;
	}

	@media (prefers-reduced-motion: no-preference) {
		.awning {
			animation: mk-roll 4.4s infinite;
		}
		.tag {
			animation: mk-swing 4.4s infinite;
		}
		.once .awning,
		.once .tag {
			animation-iteration-count: 0.5;
		}
	}

	/* The awning rolls down from the roof line, then the tag swings in and
	   settles; both hold from before 50% to 84%, so half a cycle ends where
	   the base styles already are. */
	@keyframes mk-roll {
		0%,
		6% {
			transform: scaleY(0.35);
			animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1);
		}
		24%,
		84% {
			transform: scaleY(1);
		}
		94%,
		100% {
			transform: scaleY(0.35);
		}
	}
	@keyframes mk-swing {
		0%,
		18% {
			transform: rotate(-28deg);
			animation-timing-function: cubic-bezier(0.3, 0.6, 0.3, 1);
		}
		30% {
			transform: rotate(10deg);
		}
		38% {
			transform: rotate(-4deg);
		}
		44%,
		84% {
			transform: rotate(0deg);
		}
		94%,
		100% {
			transform: rotate(-28deg);
		}
	}
</style>
