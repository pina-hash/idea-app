<script lang="ts">
	/**
	 * Classroom mark: THE MORTARBOARD, drawn as a solid rather than a line
	 * (ledger 0297, package F1b, redesigned in place to the standard ledger 0296
	 * set with IdeaCadMark). The same cap the launcher always showed -- the board
	 * a rhombus from 3,11 to 29,11 with its front corner at 16,17, the skull cap
	 * below it, the tassel off the right corner -- given a lit board, two shaded
	 * faces on the cap, a highlight on the board's leading edges and a knot on
	 * the tassel, so it has the depth the other marks on the launcher have.
	 *
	 * THE MOTION QUOTES THE ROOM, WHICH IS A READING ROOM. /classroom is the one
	 * surface a student sits on for minutes at a time, and its whole visual
	 * argument is that the writing is the loudest thing on screen. So the
	 * tassel swings once, settles and hangs still, and nothing else moves: the
	 * calm register the room is tuned for rather than a second thing competing
	 * with the card's own title.
	 *
	 * NOTHING IS HIDDEN AT REST, the rule every mark in this directory follows:
	 * no opacity and no transform is declared outside a keyframe, so with the
	 * animation canceled a reduced-motion reader sees the finished cap with the
	 * tassel hanging straight, never a frame caught mid-swing. Animation only
	 * under prefers-reduced-motion: no-preference.
	 *
	 * `once` PLAYS HALF A CYCLE, which ends on the rest state exactly: the swing
	 * settles by 50% and the second half holds, so a host can play it one time
	 * on arrival and let it stop, with no second set of keyframes.
	 *
	 * PAINT IS currentColor BY DEFAULT, the card's own ink, with the faces as
	 * mixes of it. A host that owns tokens points the five `--crm-*` hooks at
	 * them instead; nothing here names a color.
	 */
	let { once = false }: { once?: boolean } = $props();
</script>

<svg class:once viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The skull cap under the board: its two visible faces, shaded, then its outline. -->
	<path class="cap-left" d="M9 14.2 16 17.5V24c-3.9 0-7-1.4-7-3Z" stroke="none" />
	<path class="cap-right" d="M23 14.2 16 17.5V24c3.9 0 7-1.4 7-3Z" stroke="none" />
	<path class="edge" d="M9 14.5V21c0 1.6 3.1 3 7 3s7-1.4 7-3v-6.5" />
	<!-- The board: lit, outlined, and its two leading edges highlighted. -->
	<path class="board" d="M16 5 3 11l13 6 13-6Z" stroke="none" />
	<path class="edge" d="M16 5 3 11l13 6 13-6Z" />
	<path class="hl" d="M3 11 16 17 29 11" stroke-width="0.8" />
	<!-- The tassel: a cord off the board's right corner and its knot. It swings
	     from where it meets the board. -->
	<g class="tassel">
		<path class="edge" d="M29 11v6.2" />
		<path class="knot" d="M29 16.6c1 0 1.7.8 1.7 1.8V20h-3.4v-1.6c0-1 .7-1.8 1.7-1.8Z" />
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
		stroke: var(--crm-edge, currentColor);
	}
	.hl {
		stroke: var(--crm-hl, currentColor);
	}
	.board {
		fill: var(--crm-top, color-mix(in srgb, currentColor 46%, transparent));
	}
	.cap-right {
		fill: var(--crm-right, color-mix(in srgb, currentColor 26%, transparent));
	}
	.cap-left {
		fill: var(--crm-left, color-mix(in srgb, currentColor 12%, transparent));
	}
	.knot {
		stroke: var(--crm-edge, currentColor);
		fill: var(--crm-top, color-mix(in srgb, currentColor 46%, transparent));
		stroke-width: 1.1;
	}
	/* The cord swings from where it MEETS THE BOARD, stated in user units rather
	   than left to transform-box: fill-box. */
	.tassel {
		transform-origin: 29px 11px;
	}

	@media (prefers-reduced-motion: no-preference) {
		.tassel {
			animation: cm-swing 4.2s ease-in-out infinite;
		}
		.once .tassel {
			animation-iteration-count: 0.5;
		}
	}

	/* A damped swing that settles by 40% and hangs still at the rest angle
	   from 40% to 100%, so half a cycle ends exactly where the base styles
	   already are and the loop never jumps. */
	@keyframes cm-swing {
		0% {
			transform: rotate(0deg);
		}
		10% {
			transform: rotate(-10deg);
		}
		22% {
			transform: rotate(7deg);
		}
		32% {
			transform: rotate(-3deg);
		}
		40%,
		100% {
			transform: rotate(0deg);
		}
	}
</style>
