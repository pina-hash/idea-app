export default {
	path: '/dev/maps-edit?state=node-pending',
	label: 'Maps editor harness (Mill Room open: a PENDING edit, visibly distinct from published)',
	/* The state the draft-and-publish model exists for: a published node with a
	   staged edit the public cannot see. Distinctness is words + glyph + hue:
	   the strip above the form, the chip, and the amber-edged publish panel. */
	presence: [
		{
			selector: '[data-testid="maps-node-detail"]',
			label: 'node detail pane open',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-pending-strip"]',
			label: 'the pending strip above the form',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-node-detail"] .publish-panel[data-publish-state="pending"]',
			label: 'publish panel in its pending state',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-geometry-fields"]',
			label: 'typed-inches geometry fields on a room',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-node-detail"] canvas',
			label: 'NO canvas anywhere -- drawing is bundle B',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-pending-strip"]',
			label: 'the pending strip says the public still sees the old version',
			must: ['staged pending edit', 'previously published version']
		},
		{
			selector: '[data-testid="maps-node-detail"] .publish-panel[data-publish-state="pending"]',
			label: 'the panel offers publish and discard in words',
			must: ['Publish pending edit', 'Discard pending edit']
		},
		{
			selector: '[data-testid="maps-geometry-fields"] .hint',
			label: 'the geometry section says accuracy comes from typed inches',
			must: ['inches']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-pending-strip"]', label: 'pending strip copy', min: 4.5 },
		{
			selector: '[data-testid="maps-node-detail"] .publish-panel .status-row p',
			label: 'publish panel sentence',
			min: 4.5
		},
		{ selector: '[data-testid="maps-node-detail"] label', label: 'field labels', min: 4.5 },
		{
			selector: '[data-testid="maps-node-detail"] .publish-panel .btn',
			label: 'publish/discard controls',
			min: 4.5
		},
		{
			/* The load-bearing edge that marks the pending state (amber on bg2). */
			selector: '[data-testid="maps-node-detail"] .publish-panel[data-publish-state="pending"]',
			label: 'pending panel edge (boundary bar)',
			min: 3
		}
	],
	tapTargets: [
		{
			selector: '[data-testid="maps-node-detail"] .actions .btn',
			label: 'save controls',
			min: 44
		},
		{
			selector: '[data-testid="maps-node-detail"] .publish-panel .btn',
			label: 'publish/discard controls',
			min: 44
		},
		{
			selector: '[data-testid="maps-geometry-fields"] input',
			label: 'typed-inch inputs',
			min: 44
		}
	]
};
