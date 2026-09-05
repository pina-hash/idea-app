<!--
	IDEA Maps homepage mark: a STORAGE UNIT SEEN FACE ON, standing on the floor
	of a room, with one compartment marked.

	IT IS DELIBERATELY NOT A LOCATION PIN, and the reason is the data model
	rather than taste. IDEA Maps holds a CONTAINMENT CHAIN, not coordinates
	(the spec's section 2 locks that: "An item points at its container; geometry
	belongs to containers"). A pin claims a point on the earth and says nothing
	about what a thing is inside of, which is the only question this app
	answers. A pin is also the single most-drawn glyph on the web, so it would
	have told a reader "map" and nothing about WHICH map.

	WHAT IS DRAWN IS THE VIEW THE APP IS ACTUALLY ABOUT. Every storage unit
	carries an AUTHORED FRONT ELEVATION of its compartments (spec section 2,
	"Verticality"), and that elevation is the level a search lands you on: the
	descent runs directory, room plan, unit elevation, compartment, item card.
	So the glyph is that elevation -- a two-by-three unit face -- with the found
	compartment filled. The card's own sub reads "down to the drawer it lives
	in", and this is that sentence drawn.

	THE FLOOR LINE AND THE FEET ARE WHAT KEEP IT FROM READING AS A WINDOW.
	Without them a subdivided rounded rectangle at 32px is a pane, a grid or a
	spreadsheet; standing it on a floor makes it furniture in a room, which is
	what a map of this building contains.

	THE MOTION QUOTES THE STAGED ROUTE, which is the one live thing the viewer
	does: a search result does not jump to the answer, it walks the chain and
	marks each level on the way down. So the unit lights, then the shelf lines
	light, then the found compartment rings and settles -- the same
	dip-and-return walk TournamentMark uses for a bracket advancing, for the
	same reason (an ordered resolution with a final node).

	NOTHING IS HIDDEN AT REST, the rule every mark in this directory follows:
	every keyframe starts AND ends at full opacity and no transform, so with the
	animation cancelled a reduced-motion reader sees the whole glyph -- unit,
	shelves, floor and the marked compartment.

	NO PAUSE OBSERVER, WHICH IS THE MAJORITY IDIOM HERE AND NOT AN OVERSIGHT.
	Ten of the eleven marks that predate this one are pure CSS; FoundryMark is
	the single exception, and it carries an IntersectionObserver because it
	scales down the shell's MoltenSeam contract. This is four opacity walks and
	one small scale, so it buys a script block and an onMount for nothing.

	Monochrome currentColor throughout, with no literal anywhere: the card
	resolves it to --acc-ink, which for this card defaults to the jade
	--acc-primary AppLauncher declares for [data-app='maps'].
-->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The unit: a storage cabinet, face on. -->
	<rect class="unit" x="6" y="4" width="20" height="21" rx="1.5" />
	<!-- The shelves and the divider: six compartments, which is what an
	     authored front elevation is a grid of. -->
	<path class="shelves" d="M6 11h20M6 18h20M16 4v21" />
	<!-- The found compartment. FILLED rather than outlined: an outline inside a
	     cell this size puts two 1.5 strokes within a couple of user units of
	     each other and turns to mud at the launcher's icon size. -->
	<rect class="found" x="17.7" y="12.6" width="6.6" height="3.8" rx="1" fill="currentColor" stroke="none" />
	<!-- Feet and the floor: the unit stands in a room. -->
	<path class="floor" d="M9 25v3M23 25v3M4 28h24" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.found {
		/* Scale about the compartment's own centre, so the ring reads as that
		   drawer being marked rather than the whole face shifting. */
		transform-origin: 21px 14.5px;
	}

	@media (prefers-reduced-motion: no-preference) {
		.unit {
			animation: mm-descend 4.6s ease-in-out infinite;
		}
		.shelves {
			animation: mm-descend 4.6s ease-in-out infinite 0.45s;
		}
		.found {
			animation: mm-mark 4.6s ease-in-out infinite 0.9s;
		}
	}

	/* Base opacity is 1 at both ends: the walk DIPS and returns rather than
	   fading a stroke in from nothing. The event occupies the first third of
	   the cycle and the rest is stillness, which keeps this quieter than the
	   game cards it sits beside. */
	@keyframes mm-descend {
		0%,
		30%,
		100% {
			opacity: 1;
		}
		12% {
			opacity: 0.45;
		}
	}

	/* The found compartment is the last beat and the only thing that moves:
	   one small swell as the marker lands, then back to rest. */
	@keyframes mm-mark {
		0%,
		28%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		12% {
			transform: scale(1.14);
			opacity: 0.55;
		}
	}
</style>
