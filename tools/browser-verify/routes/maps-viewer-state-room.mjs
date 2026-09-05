export default {
	path: '/dev/maps-viewer?state=room',
	label:
		'IDEA Maps viewer, one level down (the Machine Shop: a plan drawing beside the list that carries the tap floor for it)',
	/* THE POSITIVE CONTROL FOR THE DIRECTORY SPEC'S ZEROS, and the state that
	   measures the plan. It is also where the "drawing is the second way,
	   never the only way" rule is checked as geometry: every shape on the plan
	   is ALSO a row in the list, and it is the row that clears 44px. */
	presence: [
		{
			selector: '[data-testid="maps-viewer-plan"]',
			label: 'the plan drawing of the room',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-drawing"] svg',
			label: 'drawn as an SVG in inches, so both widths are the same drawing at two sizes',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-viewer-elevation"]',
			label: 'NO elevation: this is a room, not a unit',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-crumbs"] a',
			label: 'the crumbs above this level are links back',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-viewer-crumbs"] [aria-current="page"]',
			label: 'and the level you are on is not a link',
			expectPresent: 1,
			maxPresent: 1
		},
		{
			selector: '[data-marked]',
			label: 'NOTHING marked in gold: nobody was looking for anything',
			expectPresent: 0
		}
	],
	orderResult: [
		{
			label: 'EVERY SHAPE ON THE PLAN IS ALSO A ROW IN THE LIST',
			/* A scale drawing cannot carry a 44px target without lying about
			   the dimension it is drawn to, so the floor is met by the list --
			   which only works if the list is complete. A shape with no row
			   would be something reachable ONLY by hitting a few square pixels
			   on a phone. */
			evaluate: `() => {
				const shapes = [...document.querySelectorAll('[data-testid="maps-viewer-drawing"] a')]
					.map((a) => new URL(a.href, location.origin).searchParams.get('at'));
				const rows = new Set(
					[...document.querySelectorAll('[data-testid="maps-viewer-rows"] a')]
						.map((a) => new URL(a.href, location.origin).searchParams.get('at'))
				);
				const missing = shapes.filter((id) => id && !rows.has(id));
				return [
					shapes.length > 0 ? 'the plan drew ' + shapes.length + ' shape(s)' : 'THE PLAN DREW NOTHING',
					missing.length === 0 ? 'every one has a row' : missing.length + ' SHAPE(S) HAVE NO ROW',
					rows.size > shapes.length ? 'and the list also carries what the plan cannot draw' : 'list no wider than the plan'
				];
			}`,
			expected: [
				'the plan drew 1 shape(s)',
				'every one has a row',
				'and the list also carries what the plan cannot draw'
			]
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-viewer-crumbs"]',
			label: 'the whole chain, so somebody who landed here knows where here is',
			must: ['The map', 'IDEA Building', 'Machine Shop']
		},
		{
			selector: '[data-testid="maps-viewer-list"]',
			label: 'a container the plan cannot draw is named rather than omitted',
			must: ['Bench Cabinet', 'not drawn on the plan yet']
		},
		{
			selector: '[data-testid="maps-viewer-drawing"] figcaption',
			label: 'a dimensioned drawing says its dimension',
			must: ['in']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-head"] h1', label: 'the room name', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-head"] .mv-kind', label: 'the kind label under it', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-drawing"] figcaption', label: 'the plan dimension caption', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-list"] .mv-unplaced', label: 'the undrawn-container note', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-crumbs"] a', label: 'a crumb link', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row', label: 'every row in the list', min: 44 },
		{ selector: '#mv-q', label: 'the search box, still here one level down', min: 44 }
	],
	tapReach: [
		{
			selector: '[data-testid="maps-viewer-crumbs"] a',
			label: 'the crumb links, which sit inside a line of text and grow their reach in height only',
			min: 44
		}
	]
};
