export default {
	path: '/dev/maps-editor',
	label: 'Maps workspace (nothing selected: the OVERVIEW draws the whole map beside the tree)',
	/* THE REAL MapsEditorShell -- the identical component /maps/edit mounts,
	   chrome bar and workspace -- over the /dev/maps-edit fixture. Nothing is
	   selected, so the detail pane holds the OVERVIEW: the one root container
	   (IDEA Building) drawn read-only with its two placed rooms inside it, and
	   the draft room that has no outline NAMED rather than skipped. Before
	   prompt 0093 this state was a tree beside nothing.

	   Every absence row here has its positive control in
	   maps-editor-state-room.mjs, where the same selector matches. */
	presence: [
		{
			selector: '[data-testid="maps-editor-shell"] .mp-bar',
			label: 'the one-row chrome bar (no hero above the work)',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-node-tree"] .tree-row',
			label: 'tree rows: the whole 8-node fixture',
			expectPresent: 8,
			expectVisible: 8,
			maxPresent: 8
		},
		{
			selector: '[data-testid="maps-editors-tab"]',
			label: 'the Editors tab, because the route handed in the grant console',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-overview"]',
			label: 'the overview in the detail pane while nothing is selected',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-overview-root"]',
			label: 'one root card: the fixture has one root (IDEA Building)',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-overview"] [data-testid="maps-plan-frame"]',
			label: "the building's own outline drawn as the frame (a root has no parent frame)",
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-overview"] [data-testid="maps-plan-child"]',
			label: 'its two PLACED rooms drawn inside it (Machine Shop, Mill Room)',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-overview"] [data-testid="maps-plan-grandchild"]',
			label: "the rooms' own placed units drawn faintly inside them (Tool Chest A, Workbench B)",
			expectPresent: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-plan-unplaced"]',
			label: 'the draft room with no outline is NAMED, not hidden',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-node-detail"]',
			label: 'NO node detail while nothing is selected',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-plan-shape"]',
			label: 'NO editable shape on a read-only overview sheet',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-plan-tools"], [data-testid="maps-plan-nudge"]',
			label: 'NO placement controls on the overview (it is read-only)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-editor-shell"] canvas',
			label: 'NO <canvas> element anywhere: every shape is a real button, every dimension SVG',
			expectPresent: 0
		}
	],
	orderResult: [
		{
			label: 'THE LAYOUT IS THREE REGIONS ABOVE 1024px AND ONE COLUMN BELOW, WITH NO HORIZONTAL SCROLL',
			/* The one claim the widths alone cannot settle: that the stage is the
			   region that takes the room, and the two side panels are BOUNDED.
			   Returns one normalised verdict so the same probe measures both
			   widths; the real pixel figures are printed in the report by the
			   session's own width sweep. */
			evaluate: `() => {
				const q = (s) => document.querySelector(s);
				const nav = q('.cr-nav'), detail = q('.cr-detail');
				if (!nav || !detail) return ['no panes'];
				const n = nav.getBoundingClientRect(), d = detail.getBoundingClientRect();
				const noScroll = document.documentElement.scrollWidth <= window.innerWidth;
				if (window.innerWidth < 1024) {
					const stacked = Math.round(n.width) === window.innerWidth && d.top >= n.bottom - 1;
					return [stacked && noScroll ? 'layout ok' : 'narrow: nav ' + Math.round(n.width) + 'px, detail top ' + Math.round(d.top) + ' vs nav bottom ' + Math.round(n.bottom) + (noScroll ? '' : ', horizontal scroll')];
				}
				const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
				const treeBounded = n.width >= 16 * rem - 1 && n.width <= 20 * rem + 1;
				const stageWidest = d.width > n.width;
				return [treeBounded && stageWidest && noScroll ? 'layout ok' : 'wide: nav ' + Math.round(n.width) + 'px, detail ' + Math.round(d.width) + 'px' + (noScroll ? '' : ', horizontal scroll')];
			}`,
			expected: ['layout ok']
		},
		{
			label: 'CLICKING A DRAWN ROOM OPENS IT: the sheet is a way into the tree',
			/* Retried against its own effect rather than waited on with a timer:
			   SSR markup satisfies DOM stability before hydration attaches a
			   handler, so an early click is a no-op a fixed delay would report
			   as failure. The attempt count is returned. */
			evaluate: `async () => {
				const rooms = Array.from(document.querySelectorAll('[data-testid="maps-overview"] [data-testid="maps-plan-child"]'));
				const target = rooms.find((b) => (b.getAttribute('aria-label') || '').startsWith('Machine Shop'));
				if (!target) return ['no Machine Shop shape'];
				for (let i = 1; i <= 20; i += 1) {
					target.click();
					await new Promise((r) => setTimeout(r, 150));
					const h2 = document.querySelector('[data-testid="maps-node-inspector"] h2');
					if (h2 && /Machine Shop/.test(h2.textContent || '')) {
						const current = document.querySelector('[data-testid="maps-node-tree"] .tree-row[aria-current="true"] .row-name');
						return ['opened Machine Shop', current && /Machine Shop/.test(current.textContent || '') ? 'tree followed' : 'tree did not follow', 'attempts ' + (i <= 20 ? 'ok' : i)];
					}
				}
				return ['never opened'];
			}`,
			expected: ['opened Machine Shop', 'tree followed', 'attempts ok']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-overview"] .hint',
			label: 'the overview says how to begin, in words',
			must: ['click a shape', 'side by side']
		},
		{
			selector: '[data-testid="maps-plan-unplaced"]',
			label: 'the unplaced draft is named and told what it needs',
			must: ['Prototype Lab', 'type its numbers']
		},
		{
			selector: '[data-testid="maps-overview"] [data-testid="maps-plan-frame-size"]',
			label: "the frame's own dimensions, on the sheet",
			must: ['1200″', '800″']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-node-tree"] .row-name', label: 'tree row name', min: 4.5 },
		{ selector: '[data-testid="maps-node-tree"] .row-kind', label: 'tree row kind word', min: 4.5 },
		{ selector: '[data-testid="maps-editor"] .section-tabs .tab', label: 'section tab label', min: 4.5 },
		{ selector: '[data-testid="maps-overview"] h2', label: 'overview heading', min: 4.5 },
		{ selector: '[data-testid="maps-overview"] .overview-head .hint', label: 'overview hint copy', min: 4.5 },
		{ selector: '[data-testid="maps-overview"] .root-name', label: 'root card name', min: 4.5 },
		{ selector: '[data-testid="maps-overview"] .root-count', label: 'root card count', min: 4.5 },
		{ selector: '[data-testid="maps-plan-frame-size"]', label: 'frame size (metadata hue on the plate)', min: 4.5 },
		{ selector: '[data-testid="maps-plan-child"] .drawn-name', label: 'a drawn room name over its own fill', min: 4.5 },
		{ selector: '[data-testid="maps-plan-child"] .drawn-size', label: 'a drawn room size over its own fill', min: 4.5 },
		{ selector: '[data-testid="maps-plan-unplaced"]', label: 'the unplaced sentence', min: 4.5 },
		{ selector: '.mp-bar .eyebrow', label: 'the bar eyebrow', min: 4.5 },
		{ selector: '.mp-bar h1', label: 'the bar title', min: 4.5 },
		{ selector: '.mp-bar .mp-links .btn', label: 'the bar links', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-node-tree"] .tree-row', label: 'tree row button', min: 44 },
		{ selector: '[data-testid="maps-editor"] .section-tabs .tab', label: 'section tab', min: 44 },
		{ selector: '[data-testid="maps-add-root"] .btn', label: 'root add control', min: 44 },
		{ selector: '[data-testid="maps-overview"] .root-open', label: 'root card open control', min: 44 },
		{ selector: '.mp-bar .mp-links .btn', label: 'bar links', min: 44 },
		{ selector: '[data-testid="maps-plan-unplaced"] .link-btn', label: 'the named unplaced room (inline, 24px floor)', min: 24 }
		/* The drawn ROOMS are deliberately not here. They are scale drawings of
		   a 400in room in a 1200in building; inflating them to 44px would make
		   the plan lie about the dimension it exists to show. The tree row and
		   the root card's open control are the 44px ways to the same nodes. */
	]
};
