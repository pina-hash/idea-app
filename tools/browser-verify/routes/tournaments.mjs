export default {
	path: '/dev/tournaments',
	label: 'Tournaments harness (every component, the sim at 6 entries)',
	/* The full harness: BracketView, the host's match control in the room,
	   the event rail, the detail bodies, the forfeit form, the projector
	   stage in a 16:9 frame. The room's text roles are measured on the
	   `?view=page` alias and the host controls on `?view=host`; this spec
	   covers the components the harness mounts OUTSIDE the room, so a token
	   read through a fallback (`var(--dim, #7a8a7a)`) is measured on the
	   portal plate it also ships on. */
	settleMs: 900,
	presence: [
		{ selector: '.hmc[data-testid="host-match-control"]', label: 'host match control mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="event-rail"] .cell', label: 'event rail cells (6-entry field: 12 contested at the start)', expectPresent: 12, maxPresent: 12 },
		{ selector: '.tv-frame .tv', label: 'projector stage in its frame', expectPresent: 1, maxPresent: 1 },
		{ selector: '.bracket-scroll .match', label: 'bracket nodes (6 entries: 14 rows)', expectPresent: 14, maxPresent: 14 }
	],
	contrast: [
		{ selector: '.bracket-scroll .round-label', label: 'bracket round label', min: 4.5 },
		{ selector: '.bracket-scroll .match-head', label: 'bracket node head', min: 4.5 },
		{ selector: '.bracket-scroll .section-title', label: 'bracket section title', min: 4.5 },
		{ selector: '.ff .ff-tag', label: 'forfeit form tag (gold)', min: 4.5 },
		{ selector: '.ff .ff-note', label: 'forfeit form note', min: 4.5 },
		{ selector: '.ff .chip', label: 'forfeit preset chips', min: 4.5 },
		{ selector: '[data-testid="event-rail"] .count', label: 'event rail count', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.ff .pick', label: 'forfeit side picks', min: 44 },
		{ selector: '.ff .chip', label: 'forfeit preset chips', min: 44 },
		{ selector: '.ff .go', label: 'forfeit award control', min: 44 },
		{ selector: '.ff .reason', label: 'forfeit reason input', min: 44 }
	],
	/* NO `motion` ROW HERE, AND THE REASON IS THE INSTRUMENT. The projector's
	   LIVE pulse animates a `::before` pseudo-element, which
	   `Element.getAnimations()` (the sweep's discovery mechanism) does not
	   return without `subtree`, so a row here reads "0 animated" about a
	   pulse that is running. The rail's live cell animates the ELEMENT and is
	   measured on the `?view=page` specs instead. */
};
