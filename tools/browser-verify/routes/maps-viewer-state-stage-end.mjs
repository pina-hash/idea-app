export default {
	path: '/dev/maps-viewer?state=stage-end',
	label:
		'IDEA Maps staged route, arrived (the item card at the end of the walk, with the whole chain still above it)',
	/* THE END OF THE ROUTE, which is where the breadcrumb earns its keep: a
	   person who took "Skip to it" from a search result lands HERE with no
	   idea what building they are in, and the crumb trail is the only thing on
	   screen that answers that. It is also the positive control for the
	   mid-walk spec's Next/Skip presence -- neither may still be offered once
	   there is nowhere left to go. */
	presence: [
		{
			selector: '[data-testid="maps-viewer-card"]',
			label: 'the item card',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-next"]',
			label: 'NO Next control: there is nowhere left to go',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-skip"]',
			label: 'NO Skip control either, for the same reason',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-trail"]',
			label: 'the trail is still there, saying which step this was',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-viewer-crumbs"] li',
			label: 'the full chain plus the item itself: map, building, room, unit, drawer, thing',
			expectPresent: 6,
			expectVisible: 6
		},
		{
			selector: '[data-testid="maps-viewer-plan"]',
			label: 'NO plan behind the card: a drawer is drawn on its chest, not on a plan',
			expectPresent: 0
		},
		{
			/* PROMPT 0112: the map pane is never empty while there is something
			   to draw. The card sits beside the chest's front with Drawer 1
			   picked out as the open thing. */
			selector: '[data-testid="maps-viewer-stack"]',
			label: 'the chest\'s front elevation, behind the card',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-viewer-stack"] [data-here]',
			label: 'exactly one compartment marked as the open one',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-card-way"]',
			label: 'NO "Show me the way" on a card the route arrived at: the trail above IS the way',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-card-copy"]',
			label: 'the copy-link control: the address is the position',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-viewer-crumbs"]',
			label: 'where you are, all of it, without going back',
			must: ['IDEA Building', 'Machine Shop', 'Tool Chest A', 'Drawer 1', 'Dial Caliper']
		},
		{
			selector: '[data-testid="maps-viewer-card"]',
			label: 'the vocabulary is SHOWN, so the next person learns the words this map knows',
			must: ['vernier caliper', 'Mitutoyo', 'MIT-505-0099', 'measuring']
		},
		{
			selector: '[data-testid="maps-viewer-trail"]',
			label: 'and the walk says it is over',
			must: ['You are there.']
		},
		{
			selector: '[data-testid="maps-viewer-stack"] [data-here]',
			label: 'the open drawer says so in words, not only in weight',
			must: ['you are here']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-card"] h2', label: 'the item name, in the mark colour', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-card"] dt', label: 'the fact labels', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-card"] dd', label: 'the fact values', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-card"] .mv-chip', label: 'an alias or tag chip', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-card"] .mv-card-where a', label: 'the link back to the container', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-card-copy"]', label: 'Copy link', min: 44 },
		{ selector: '[data-testid="maps-viewer-stack"] a', label: 'every compartment on the chest behind the card', min: 44 }
	],
	tapReach: [
		{
			selector: '[data-testid="maps-viewer-crumbs"] a',
			label: 'every crumb link back up the chain',
			min: 44
		}
	]
};
