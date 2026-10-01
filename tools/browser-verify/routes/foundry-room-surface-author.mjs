/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * A PUBLISHER'S PAGE IS A DOCUMENT AND SCROLLS (ledger 0360, found while
 * grounding report 647d1201).
 *
 * `locateFoundry` answers `gallery` for `/foundry/author/<id>` so the right tab
 * is lit, and the layout used to decide app mode from that answer -- so this
 * ordinary page of cards was put in a 100dvh box with `overflow: hidden`, and
 * at desktop widths its lower cards were clipped with no way to reach them.
 * `foundryIsApplication` answers the second question by exact path.
 *
 * WHAT FAILS WITHOUT THE FIX: the absence row and the reach row. With app mode
 * decided off the tab again, `.cr-app` is on the room and the last card is
 * below a bottom edge nothing scrolls past.
 */
export default {
	path: '/dev/foundry-room?surface=author',
	label: 'Foundry room: a publisher page scrolls to its last card',
	presence: [
		{ selector: '.fg-root[data-room-surface="author"]', label: 'the room, on the author surface', expectPresent: 1, maxPresent: 1 },
		{ selector: '.fg-root.cr-app', label: 'no application box around a document', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="foundry-author-apps"] > li', label: 'every app card', expectPresent: 16, maxPresent: 16 }
	],
	orderResult: [
		{
			/* READ AS A PERSON SCROLLS: the DOCUMENT must be the thing that
			   scrolls, and its height must reach the last card. A programmatic
			   scrollIntoView would also move an `overflow: hidden` box, which is
			   why this reads the room's overflow instead of trusting a scroll. */
			label: 'the last card can be scrolled into the window',
			evaluate: `() => { const room = document.querySelector('.fg-root'); const cards = document.querySelectorAll('[data-testid="foundry-author-apps"] > li'); const last = cards[cards.length - 1]; if (!room || !last) return ['MISSING']; const clipped = getComputedStyle(room).overflowY === 'hidden'; const bottom = last.getBoundingClientRect().bottom + scrollY; const reach = document.scrollingElement.scrollHeight; return [!clipped && bottom <= reach + 1 ? 'last card reachable' : (clipped ? 'room clips its content' : 'last card ' + bottom.toFixed(0) + ' past ' + reach)]; }`,
			expected: ['last card reachable']
		}
	]
};
