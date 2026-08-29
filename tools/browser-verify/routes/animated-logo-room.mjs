/**
 * The emblem in `.cr-root`, the room `/reference/[itemId]` puts it in.
 *
 * A SEPARATE SPEC BECAUSE IT IS A SEPARATE ROUTE, and that split is forced by
 * `classroom.css`'s `body:has(.cr-root)` rules, which repaint the canvas for the
 * whole document -- see the route's own header for the measured before/after.
 * `/dev/animated-logo` keeps the portal plate; this one is the room.
 */
export default {
	path: '/dev/animated-logo-room',
	label: 'Animated emblem in the classroom room',
	presence: [
		/* If the stylesheet import were dropped, `.cr-root` would still be in the
		   markup and every reading here would quietly describe the portal plate
		   again. `.app-header` gets its background FROM the room, so its computed
		   background is what says the room is really mounted -- which the
		   contrast row below reads as its ground. */
		{ selector: '.cr-root .app-header.ref-header', label: 'the room header slot', expectPresent: 1 },
		{ selector: '.cr-root .idea-logo', label: 'emblem roots in the room', expectPresent: 3 },
		{ selector: '.cr-root .idea-logo img.gear', label: 'emblem gear layers', expectPresent: 3 }
	],
	contrast: [
		{ selector: '.cr-root .room-page h1', label: 'heading on the room plate', min: 4.5 },
		{ selector: '.cr-root .note', label: 'note copy on the room plate', min: 4.5 },
		{ selector: '.cr-root section.card h2', label: 'card heading on the card surface', min: 4.5 }
	],
	motion: [
		/* The same gate `/dev/animated-logo` asserts, asserted where the emblem
		   actually ships. CLAUDE.md states this one on its own: "Its spin is
		   gated behind `prefers-reduced-motion: no-preference`." The static
		   fallback (`spin={false}`) is inside the same subtree on purpose -- it
		   is an element the gate must leave alone, and a sweep that only ever saw
		   spinning gears would not notice the day `spin` stopped being read. */
		{ selector: '.cr-root', label: 'the emblem gear in .cr-root', expect: 'gated' }
	]
};
