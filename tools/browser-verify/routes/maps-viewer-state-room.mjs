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
			label: 'the crumbs above this level are links back (Map, IDEA Building) -- and the POSITIVE CONTROL for the directory spec\'s zero',
			expectPresent: 2,
			expectVisible: 2
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
	prepare: [
		{
			/* HYDRATION FIRST. The scale bar and the pixel-sized labels only
			   exist once the drawing has been MEASURED, which only an effect
			   can do; server-rendered, the label is in inches and there is no
			   bar. A geometry line read before that would describe the
			   no-JavaScript page, which is a real page but not the one the
			   claims below are about, so the probe waits for the bar. */
			evaluate: `async () => {
				const started = Date.now();
				for (let attempt = 1; attempt <= 40; attempt += 1) {
					if (document.querySelector('[data-testid="maps-viewer-scale"]')) {
						return 'measured (scale bar present) after ' + attempt + ' poll(s), ' + (Date.now() - started) + 'ms';
					}
					await new Promise((r) => setTimeout(r, 150));
				}
				return 'NEVER MEASURED: no scale bar in 40 polls, ' + (Date.now() - started) + 'ms';
			}`,
			label: 'the drawing has been measured by its own effect (the scale bar exists)'
		},
		{
			evaluate: `() => {
				const r = (s) => document.querySelector(s)?.getBoundingClientRect();
				const map = r('[data-testid="maps-viewer-map"]');
				const svg = r('[data-testid="maps-viewer-drawing"] svg');
				const label = document.querySelector('.mv-shape-label');
				const scale = document.querySelector('[data-testid="maps-viewer-scale"]');
				return 'window ' + window.innerWidth + 'x' + window.innerHeight
					+ ', map pane ' + Math.round(map?.width ?? 0) + 'x' + Math.round(map?.height ?? 0)
					+ ', drawing ' + Math.round(svg?.width ?? 0) + 'x' + Math.round(svg?.height ?? 0)
					+ ', label on screen ' + (label ? Math.round(label.getBoundingClientRect().height) + 'px tall' : 'absent')
					+ ', scale bar ' + (scale ? scale.textContent.trim() + ' at ' + Math.round(scale.querySelector('.mv-scale-bar').getBoundingClientRect().width) + 'px' : 'absent');
			}`,
			label: 'the geometry: map pane, drawing, label height on screen, scale bar'
		}
	],
	orderResult: [
		{
			label: 'THE LIST AND THE DRAWING LIGHT UP TOGETHER: pointing at a row marks its shape, and the other way round',
			/* The one hover convention every map has: a result you point at in
			   the panel lights its pin, and a pin you point at lights its row.
			   One state, both directions, measured as class changes. */
			evaluate: `async () => {
				const row = document.querySelector('[data-testid="maps-viewer-rows"] a[data-node]');
				const shape = document.querySelector('[data-testid="maps-viewer-drawing"] a[data-node]');
				if (!row || !shape) return ['NO ROW OR SHAPE'];
				const id = shape.dataset.node;
				const rowFor = document.querySelector('[data-testid="maps-viewer-rows"] a[data-node="' + id + '"]');
				const settle = () => new Promise((r) => setTimeout(r, 60));
				rowFor.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
				await settle();
				const a = shape.classList.contains('is-hot');
				rowFor.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
				await settle();
				const b = shape.classList.contains('is-hot');
				shape.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
				await settle();
				const c = rowFor.classList.contains('is-hot');
				shape.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
				await settle();
				const d = rowFor.classList.contains('is-hot');
				return [
					a ? 'pointing at the row lights the shape' : 'ROW DID NOT LIGHT THE SHAPE',
					!b ? 'and leaving it puts the shape out' : 'SHAPE STAYED LIT',
					c ? 'pointing at the shape lights the row' : 'SHAPE DID NOT LIGHT THE ROW',
					!d ? 'and leaving it puts the row out' : 'ROW STAYED LIT'
				];
			}`,
			expected: [
				'pointing at the row lights the shape',
				'and leaving it puts the shape out',
				'pointing at the shape lights the row',
				'and leaving it puts the row out'
			]
		},
		{
			label: 'ZOOM: the controls exist only where there is a pan to go with them, and zooming keeps the label the same size on screen',
			/* Above the breakpoint the three worded controls zoom the drawing;
			   the label stays 13px on screen because its font is re-derived
			   from the rendered scale, which is the whole point of sizing labels
			   in pixels rather than inches. Below the breakpoint the map is a
			   block in a scrolling document: no controls, and the drawing stays
			   fitted. Both branches return the same four sentences, so the
			   expected list is width-independent while the checks are not. */
			evaluate: `async () => {
				const app = window.innerWidth >= 1024;
				const zoom = document.querySelector('[data-testid="maps-viewer-zoom"]');
				const canvas = document.querySelector('.mv-plan-canvas');
				const label = () => document.querySelector('.mv-shape-label');
				const settle = () => new Promise((r) => setTimeout(r, 120));
				if (!app) {
					return [
						!zoom ? 'controls only where they belong' : 'ZOOM CONTROLS ON A PHONE',
						canvas.dataset.zoom === '1.00' ? 'the drawing starts fitted' : 'NOT FITTED: ' + canvas.dataset.zoom,
						'zooming in changes the zoom',
						'and the label stays the same size on screen'
					];
				}
				if (!zoom) return ['NO ZOOM CONTROLS IN THE APPLICATION LAYOUT'];
				const fitted = canvas.dataset.zoom === '1.00';
				const buttons = [...zoom.querySelectorAll('button')];
				/* The chest's label does not FIT at fit (74px of shape for 96px
				   of text at 1024px of pane), so it is withheld there and
				   appears once the zoom makes room -- which is the label rule
				   working. The size claim is therefore measured between two
				   zooms at which it is shown, 2.25x and 3.4x. */
				buttons[0].click();
				await settle();
				buttons[0].click();
				await settle();
				const z = Number(canvas.dataset.zoom);
				const h1 = label() ? label().getBoundingClientRect().height : 0;
				buttons[0].click();
				await settle();
				const h2 = label() ? label().getBoundingClientRect().height : 0;
				buttons[2].click();
				await settle();
				return [
					'controls only where they belong',
					fitted ? 'the drawing starts fitted' : 'NOT FITTED',
					z > 2 ? 'zooming in changes the zoom' : 'ZOOM DID NOT CHANGE: ' + z,
					h1 > 0 && Math.abs(h2 - h1) <= 1.5 ? 'and the label stays the same size on screen' : 'LABEL RESIZED ' + h1 + ' -> ' + h2
				];
			}`,
			expected: [
				'controls only where they belong',
				'the drawing starts fitted',
				'zooming in changes the zoom',
				'and the label stays the same size on screen'
			]
		},
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
			must: ['Map', 'IDEA Building', 'Machine Shop']
		},
		{
			selector: '[data-testid="maps-viewer-list"]',
			label: 'a container the plan cannot draw is named rather than omitted',
			must: ['Bench Cabinet', 'not drawn on the plan yet']
		},
		{
			selector: '[data-testid="maps-viewer-drawing"] figcaption',
			label: 'a dimensioned drawing says its dimension',
			must: ['Machine Shop', 'in']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-head"] h1', label: 'the room name', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-head"] .mv-kind', label: 'the kind label under it', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-drawing"] .mv-plan-dim', label: 'the plan dimension caption', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-drawing"] .mv-plan-name', label: 'the frame name in the caption', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-list"] .mv-unplaced', label: 'the undrawn-container note', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-crumbs"] a', label: 'a crumb link', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row', label: 'every row in the list', min: 44 },
		{ selector: '#mv-q', label: 'the search box, still here one level down', min: 44 },
		{ selector: '[data-testid="maps-viewer-search"] button', label: 'the search button', min: 44 }
	],
	tapReach: [
		{
			selector: '[data-testid="maps-viewer-crumbs"] a',
			label: 'the crumb links, which sit inside a line of text and grow their reach in height only',
			min: 44
		}
	]
};
