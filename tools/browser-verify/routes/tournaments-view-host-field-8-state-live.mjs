export default {
	path: '/dev/tournaments?view=host&field=8&state=live',
	label: 'Host console match control, mid-match, in the room (8 entries)',
	/* THE TEACHER'S PHONE BETWEEN TWO MATCHES (prompt 0077). The REAL
	   HostMatchControl the route mounts, alone in the room, with one match in
	   progress and the next one waiting on its Start. Every control here is a
	   thing a thumb hits beside a table of students, so every one is on the
	   44px floor: measured 28.6px (winner pick) and about 20px (forfeit,
	   correct, ping) before this bundle. */
	settleMs: 700,
	presence: [
		{ selector: '[data-match-state="live"] .result-form', label: 'result form open on the live match', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-match-state="next"] .btn.start', label: 'one Start on the next match', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hmc .tnm-live', label: 'the one emerald element: the live label', expectPresent: 1, maxPresent: 1 },
		/* No push sender behind the harness: the ping control is absent
		   because the transport is (an omitted transport removes its
		   control). Beside a positive control so the absence is readable. */
		{ selector: '.hmc .mini.gold', label: 'forfeit toggles (positive control for the row below)', expectPresent: 2 },
		{ selector: '.hmc button[title^="Send this player"]', label: 'ping controls with no onping transport', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.hmc .mc-sub', label: 'section labels (cyan)', min: 4.5 },
		{ selector: '.hmc .mc-label', label: 'match labels', min: 4.5 },
		{ selector: '.hmc .mc-vs', label: 'pairing names', min: 4.5 },
		{ selector: '.hmc .pick', label: 'winner picks', min: 4.5 },
		{ selector: '.hmc .btn.start', label: 'Start control', min: 4.5 },
		{ selector: '.hmc .mini.gold', label: 'forfeit toggle (gold)', min: 4.5 },
		{ selector: '.hmc .bo', label: 'best-of line (gold)', min: 4.5 },
		{ selector: '.hmc .note', label: 'waiting note', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.hmc .pick', label: 'winner picks', min: 44 },
		{ selector: '.hmc .btn', label: 'Submit / Start controls', min: 44 },
		{ selector: '.hmc .mini', label: 'forfeit / correct minis', min: 44 }
	],
	domOrder: [
		{ before: '[data-match-state="live"]', after: '[data-match-state="next"]', label: 'the live match precedes the next one' },
		{ before: '[data-match-state="next"]', after: '[data-match-state="ready"]', label: 'the next match precedes the rest of the ready list' }
	]
};
