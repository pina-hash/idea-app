<script lang="ts">
	/**
	 * My Notebook mark: THE BOUND NOTEBOOK WITH A CAMERA LENS ON ITS COVER,
	 * drawn as a solid rather than a line (ledger 0297, package F1b, redesigned
	 * in place to the standard ledger 0296 set with IdeaCadMark). The same
	 * notebook the launcher always showed -- the cover from 8,5 to 26,27, the
	 * spine curling off its left edge, three binding rings, the lens at 17,16 --
	 * given a shaded cover, a darker spine, a lit lens glass with a glint on it
	 * and a thin barrel ring around the glass, so it has the depth the other
	 * marks on the launcher have.
	 *
	 * THE MOTION QUOTES WHAT THE ROOM ACTUALLY DOES, which is photograph paper.
	 * The lens racks focus once: it pulls in, overshoots a touch, settles, and
	 * holds. That is the one gesture the notebook is about -- a page in front
	 * of a camera -- and it is deliberately the only thing moving, because the
	 * room's own surfaces are quiet paper plates.
	 *
	 * NOTHING IS HIDDEN AT REST, the rule every mark in this directory follows:
	 * no opacity and no transform is declared outside a keyframe, so with the
	 * animation cancelled a reduced-motion reader sees the finished lens at its
	 * own size, never a frame caught mid-focus. Animation only under
	 * prefers-reduced-motion: no-preference.
	 *
	 * `once` PLAYS HALF A CYCLE, which ends on the rest state exactly: the focus
	 * settles by 40% and the rest of the cycle holds, so a host can play it one
	 * time on arrival and let it stop, with no second set of keyframes.
	 *
	 * PAINT IS currentColor BY DEFAULT, the card's own ink, with the faces as
	 * mixes of it. A host that owns tokens points the five `--nbm-*` hooks at
	 * them instead; nothing here names a color. `--nbm-top` paints the lit
	 * glass, `--nbm-right` the spine and `--nbm-left` the cover, the same three
	 * tiers the other marks use.
	 */
	let { once = false }: { once?: boolean } = $props();
</script>

<svg class:once viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The cover and the spine, shaded, then their outlines and the rings. -->
	<path class="cover" d="M8 5h16a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H8Z" stroke="none" />
	<path class="spine" d="M8 5a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2Z" stroke="none" />
	<path class="edge" d="M8 5h16a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H8z" />
	<path class="edge" d="M8 5a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2" />
	<path class="edge" d="M6 11h4M6 16h4M6 21h4" />
	<!-- The lens: a thin barrel ring, then the glass, its rim and its glint. The
	     group racks focus about the lens center. -->
	<g class="lens">
		<circle class="barrel" cx="17" cy="16" r="5.6" stroke-width="0.8" stroke-opacity=".55" />
		<circle class="glass" cx="17" cy="16" r="4" stroke="none" />
		<circle class="edge" cx="17" cy="16" r="4" />
		<path class="hl" d="M14.6 15.2a2.6 2.6 0 0 1 1.7-1.7" stroke-width="0.8" />
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
		stroke: var(--nbm-edge, currentColor);
	}
	.barrel {
		stroke: var(--nbm-edge, currentColor);
	}
	.hl {
		stroke: var(--nbm-hl, currentColor);
	}
	.glass {
		fill: var(--nbm-top, color-mix(in srgb, currentColor 46%, transparent));
	}
	.spine {
		fill: var(--nbm-right, color-mix(in srgb, currentColor 26%, transparent));
	}
	.cover {
		fill: var(--nbm-left, color-mix(in srgb, currentColor 12%, transparent));
	}
	/* Scale rather than an animated `r`: the transform is the property every
	   browser here composites, and the origin is the lens center in user units
	   so it breathes about its own axis. */
	.lens {
		transform-origin: 17px 16px;
	}

	@media (prefers-reduced-motion: no-preference) {
		.lens {
			animation: nm-focus 4s ease-in-out infinite;
		}
		.once .lens {
			animation-iteration-count: 0.5;
		}
	}

	/* The rack settles by 40% and holds at the rest size from 40% to 100%, so
	   half a cycle ends exactly where the base styles already are and the loop
	   never jumps. */
	@keyframes nm-focus {
		0% {
			transform: scale(1);
		}
		14% {
			transform: scale(0.86);
		}
		28% {
			transform: scale(1.05);
		}
		40%,
		100% {
			transform: scale(1);
		}
	}
</style>
