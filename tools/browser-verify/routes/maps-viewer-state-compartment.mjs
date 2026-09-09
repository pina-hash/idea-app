export default {
	path: '/dev/maps-viewer?state=compartment',
	label:
		'IDEA Maps viewer at a compartment (Drawer 1: no drawing of its own, so the map pane shows its chest with the drawer marked "you are here")',
	/* THE MAP PANE IS NEVER EMPTY WHILE THERE IS SOMETHING TO DRAW (prompt
	   0112). A drawer has no plan and no elevation, and before this bundle its
	   level drew nothing. It now shows the deepest drawing above it -- the
	   chest's front -- with itself picked out as the OPEN thing, in the
	   accent and with a word, which is a different state from the staged
	   route's gold "found here" and must read as one. This is also the
	   positive control for the unit spec, where the same chest is drawn as
	   itself and NOTHING is marked here. */
	presence: [
		{
			selector: '[data-testid="maps-viewer-elevation"]',
			label: 'the chest\'s front elevation, one level up from the drawer',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-stack"] [data-here]',
			label: 'exactly one slot marked as the open one',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-marked]',
			label: 'NOTHING marked in gold: nobody was looking for anything',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-crumbs"] a',
			label: 'four crumbs back: Map, the building, the room, the chest',
			expectPresent: 4,
			expectVisible: 4
		},
		{
			selector: '[data-testid="maps-viewer-rows"] > li',
			label: 'what is in the drawer, in the panel',
			expectPresent: 2,
			expectVisible: 2
		}
	],
	orderResult: [
		{
			label: 'THE OPEN SLOT IS THE LEVEL ITSELF: the marked slot is Drawer 1, and it is not painted like the found colour',
			/* Two claims: the "here" mark lands on the drawer the URL names,
			   and its border is green-dominant (the accent), never warm (the
			   gold that means "found"). Read off the painted colour by
			   compositing, since the value is a color-mix over a plate. */
			evaluate: `() => {
				const px = (c) => {
					const cv = document.createElement('canvas');
					cv.width = cv.height = 1;
					const ctx = cv.getContext('2d');
					ctx.fillStyle = '#000';
					ctx.fillRect(0, 0, 1, 1);
					ctx.fillStyle = c;
					ctx.fillRect(0, 0, 1, 1);
					const d = ctx.getImageData(0, 0, 1, 1).data;
					return [d[0], d[1], d[2]];
				};
				const here = document.querySelector('[data-testid="maps-viewer-stack"] [data-here]');
				if (!here) return ['NOTHING MARKED HERE'];
				const name = here.querySelector('.mv-slot-name').textContent.trim();
				const border = px(getComputedStyle(here).borderTopColor);
				const heading = document.querySelector('[data-testid="maps-viewer-head"] h1').textContent.trim();
				return [
					name === heading ? 'the marked slot is the level in the heading' : 'MARK ON THE WRONG SLOT: ' + name + ' vs ' + heading,
					border[1] > border[0] && border[1] > border[2] ? 'and it is drawn in the accent, not in gold' : 'HERE IS NOT GREEN: ' + border.join(',')
				];
			}`,
			expected: ['the marked slot is the level in the heading', 'and it is drawn in the accent, not in gold']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-viewer-stack"] [data-here]',
			label: 'the open drawer says so in words',
			must: ['Drawer 1', 'you are here']
		},
		{
			selector: '[data-testid="maps-viewer-crumbs"]',
			label: 'the whole chain above the drawer',
			must: ['Map', 'IDEA Building', 'Machine Shop', 'Tool Chest A', 'Drawer 1']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-stack"] [data-here] .mv-slot-here', label: 'the "you are here" word', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-stack"] [data-here] .mv-slot-name', label: 'the open slot\'s name on its heavier fill', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-head"] h1', label: 'the drawer name', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-viewer-stack"] a', label: 'every slot on the chest, the open one included', min: 44 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row', label: 'every row in the drawer', min: 44 }
	],
	tapReach: [
		{ selector: '[data-testid="maps-viewer-crumbs"] a', label: 'the four crumb links back up the chain', min: 44 }
	]
};
