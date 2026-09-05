export default {
	path: '/dev/maps-viewer?state=thin-stack',
	label:
		'IDEA Maps elevation where the tap floor bites (ten 1.5in bins: proportion would draw them at 42px, and does not)',
	/* THE ONE STATE THE ELEVATION'S CENTRAL COMPROMISE CAN BE MEASURED IN.
	   Tool Chest A's slots are all comfortably above 44px, so its spec proves
	   the PROPORTION half and can say nothing about the floor. Ten 1.5in bins
	   share the 420px nominal stack at 42px each, which is under the floor --
	   so this is where "proportion survives everywhere it can and the floor
	   wins where it cannot" is either true or a sentence in a comment. */
	presence: [
		{
			selector: '[data-testid="maps-viewer-stack"] a',
			label: 'all ten bins, every one of them a link',
			expectPresent: 10,
			expectVisible: 10,
			maxPresent: 10
		}
	],
	orderResult: [
		{
			label: 'A STACK TOO FINE TO DRAW IN PROPORTION IS DRAWN AT THE FLOOR INSTEAD',
			evaluate: `() => {
				const slots = [...document.querySelectorAll('[data-testid="maps-viewer-stack"] a')];
				const heights = slots.map((a) => a.getBoundingClientRect().height);
				const min = Math.min(...heights);
				const max = Math.max(...heights);
				return [
					slots.length + ' bins',
					min >= 44 ? 'none under the floor' : 'UNDER THE FLOOR at ' + min.toFixed(1) + 'px',
					// Equal heights are the CORRECT answer here: ten equal bins in
					// proportion are ten equal rows, and the floor lifted all of
					// them together rather than picking winners.
					Math.round(max - min) <= 1 ? 'and all equal, as ten equal bins should be' : 'UNEVEN: ' + min.toFixed(1) + '-' + max.toFixed(1)
				];
			}`,
			expected: ['10 bins', 'none under the floor', 'and all equal, as ten equal bins should be']
		}
	],
	tapTargets: [
		{ selector: '[data-testid="maps-viewer-stack"] a', label: 'every one of the ten bins', min: 44 }
	]
};
