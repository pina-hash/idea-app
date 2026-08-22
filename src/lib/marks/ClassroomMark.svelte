<!--
	Classroom homepage mark: the mortarboard over a class list, exactly the
	geometry this glyph shipped with inline in AppLauncher -- extracted so it can
	carry motion the way GAUNTLET, GREENLINE, VANGUARD and the Coin Ledger marks
	already do, not redrawn.

	THE MOTION QUOTES THE ROOM, WHICH IS A READING ROOM. /classroom is the one
	surface a student sits on for minutes at a time, and its whole visual
	argument is that the writing should be the loudest thing on screen. So the
	tassel sways, slowly and by four degrees, and nothing else moves: the calm
	register the room is tuned for rather than a second thing competing with the
	card's own title. Nothing is hidden at rest -- with the animation off this is
	the glyph as drawn.

	Strokes inherit currentColor, so the card accent drives the hue. Animation
	only runs under prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M16 5L3 11l13 6 13-6z" />
	<path d="M9 14.5V21c0 1.6 3.1 3 7 3s7-1.4 7-3v-6.5" />
	<!-- The tassel cord, hanging off the board's right corner. -->
	<path class="tassel" d="M29 11v7" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.tassel {
		/* The cord swings from where it MEETS THE BOARD, not from the middle of
		   its own bounding box, so the origin is stated in user units rather than
		   left to transform-box: fill-box. */
		transform-origin: 29px 11px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.tassel {
			animation: cm-sway 3.4s ease-in-out infinite alternate;
		}
	}
	@keyframes cm-sway {
		from {
			transform: rotate(-4deg);
		}
		to {
			transform: rotate(4deg);
		}
	}
</style>
