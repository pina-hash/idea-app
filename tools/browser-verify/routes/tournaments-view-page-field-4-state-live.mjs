export default {
	path: '/dev/tournaments?view=page&field=4&state=live',
	label: 'The event page composition in the room, 4 entries, one match live',
	/* The public page's pieces in the room the layout chain gives every
	   tournament page: the scoreboard masthead with the LIVE chip and the
	   event rail, the bracket at 4 entries, a card with body copy, dim copy
	   and a bare link. Every word is measured against the plate it sits on. */
	settleMs: 700,
	presence: [
		{ selector: '.tnm-shell .hero .tnm-status.live', label: 'LIVE chip in the masthead (the one emerald element)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="event-rail"] .cell.live', label: 'one live cell on the rail', expectPresent: 1, maxPresent: 1 },
		{ selector: '.bracket-scroll .match.live', label: 'one live node in the bracket', expectPresent: 1, maxPresent: 1 },
		{ selector: '.bracket-scroll .match', label: 'bracket nodes', expectPresent: 1 }
	],
	contrast: [
		{ selector: '.hero .eyebrow', label: 'eyebrow', min: 4.5 },
		{ selector: '.hero h1', label: 'tournament name', min: 4.5 },
		{ selector: '.hero .tnm-status.live', label: 'LIVE chip', min: 4.5 },
		{ selector: '[data-testid="event-rail"] .count', label: 'rail count', min: 4.5 },
		{ selector: '[data-testid="event-rail"] .clock', label: 'rail clock', min: 4.5 },
		{ selector: '.tnm-shell .card h2', label: 'card heading', min: 4.5 },
		{ selector: '.tnm-shell .card > p', label: 'card body copy', min: 4.5 },
		{ selector: '.tnm-shell .card a', label: 'bare link', min: 4.5 },
		{ selector: '.bracket-scroll .round-label', label: 'bracket round label', min: 4.5 },
		{ selector: '.bracket-scroll .match-head', label: 'bracket node head', min: 4.5 },
		{ selector: '.bracket-scroll .live-chip', label: 'bracket LIVE chip (crimson)', min: 4.5 },
		{ selector: '.bracket-scroll .section-title', label: 'bracket section title', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.bracket-scroll a.match', label: 'bracket node links', min: 44 }
	],
	motion: [
		{ selector: '[data-testid="event-rail"] .cell.live', label: 'rail live cell pulse', expect: 'gated' }
	]
};
