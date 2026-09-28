export default {
	path: '/dev/maps-viewer',
	label:
		'IDEA Maps public viewer (the directory: the top of the descent, and the surface a student lands on)',
	/* BOTH WIDTHS ARE FIRST-CLASS ON THIS SURFACE AND 375 IS THE REAL ONE.
	   The use it exists for is a student standing at a toolbox holding a
	   phone; 1440 is somebody at a desk planning. Neither is the mobile
	   version of the other, so every measurement below is taken at both and
	   the tap floor is asserted on the CONTROLS rather than on the drawing --
	   a plan shape is a scale drawing (a 30in chest in a 400in room is 30/400
	   of the pane) and inflating one to reach 44px would make the drawing lie
	   about the dimension it exists to show. The floor is met by the LIST,
	   which carries every shape on the plan as a full-width row, and that is
	   what the `mv-row` tap-target row below measures.

	   HYDRATION IS PROVEN, NOT WAITED FOR. `waitForApp` returns on DOM
	   stability, which server-rendered markup satisfies before a single
	   handler is attached; this surface is server-rendered by design (the
	   whole no-JavaScript path is the point), so a press before hydration
	   would report a working page as broken. The probe types into the real
	   search box and retries until the LIVE results section appears -- which
	   only an effect can produce -- and reports the attempt count. */
	prepare: [
		{
			/* THE NUMBERS BEHIND THE LAYOUT CLAIM, printed rather than thresholded:
			   the panel's and the map pane's width against the window, and the
			   drawing's rendered scale. Read them off the report. */
			evaluate: `() => {
				const r = (s) => document.querySelector(s)?.getBoundingClientRect();
				const panel = r('[data-testid="maps-viewer-panel"]');
				const map = r('[data-testid="maps-viewer-map"]');
				const svg = r('[data-testid="maps-viewer-drawing"] svg');
				const canvas = document.querySelector('.mv-plan-canvas');
				return 'window ' + window.innerWidth + 'x' + window.innerHeight
					+ ', panel ' + Math.round(panel?.width ?? 0) + 'px'
					+ ', map pane ' + Math.round(map?.width ?? 0) + 'x' + Math.round(map?.height ?? 0)
					+ ' (' + Math.round(100 * (map?.width ?? 0) / window.innerWidth) + '% of the window)'
					+ ', drawing ' + Math.round(svg?.width ?? 0) + 'x' + Math.round(svg?.height ?? 0)
					+ ', zoom ' + (canvas?.dataset.zoom ?? 'n/a')
					+ ', document ' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight;
			}`,
			label: 'the geometry: panel, map pane and drawing against the window'
		},
		{
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				const type = (v) => {
					const box = q('#mv-q');
					setter.call(box, v);
					box.dispatchEvent(new Event('input', { bubbles: true }));
				};
				const started = Date.now();
				/* RE-TYPED EVERY ATTEMPT, AND THE WAIT IS LONGER THAN THE
				   DEBOUNCE. Both halves cost a wrong reading here. Typing ONCE
				   at t=0 lands before hydration, so no handler ever sees it and
				   the poll runs out on a page that became interactive a beat
				   later. Re-typing every 100ms is worse: the search input
				   CLEARS ITS OWN DEBOUNCE on each keystroke, which is what a
				   debounce is, so a 220ms timer reset every 100ms never fires
				   at all -- 60 attempts, 6 seconds, "NEVER BECAME INTERACTIVE"
				   on a page whose very next check typed into the same box and
				   got results back. A probe that keeps interrupting the thing
				   it is waiting for measures itself. */
				for (let attempt = 1; attempt <= 30; attempt += 1) {
					type('caliper');
					await new Promise((r) => setTimeout(r, 350));
					if (q('[data-testid="maps-viewer-result"]')) {
						type('');
						await new Promise((r) => setTimeout(r, 350));
						return 'interactive after ' + attempt + ' attempt(s), ' + (Date.now() - started) + 'ms';
					}
				}
				return 'NEVER BECAME INTERACTIVE in 30 attempts, ' + (Date.now() - started) + 'ms';
			}`,
			label: 'the page is answering, not merely painted (retries until its own search effect fires)'
		},
		{
			/* REPORT R05, THE NUMBERS: a 15 x 15 grid across the building's
			   frame, each point classified by the link `elementFromPoint`
			   answers. The verdicts are in the orderResult row of the same
			   name; this prints how much of the building is clickable. */
			evaluate: `async () => {
				const svg = document.querySelector('[data-testid="maps-viewer-drawing"] svg');
				const link = document.querySelector('[data-testid="maps-viewer-frame-link"]');
				if (!svg || !link) return 'NO FRAME LINK on the directory plan';
				svg.scrollIntoView({ block: 'center', behavior: 'instant' });
				await new Promise((r) => setTimeout(r, 150));
				const rect = link.querySelector('rect').getBoundingClientRect();
				let frame = 0, room = 0, other = 0, off = 0;
				const N = 16;
				for (let i = 1; i < N; i += 1) {
					for (let j = 1; j < N; j += 1) {
						const x = rect.left + (rect.width * i) / N;
						const y = rect.top + (rect.height * j) / N;
						if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { off += 1; continue; }
						const a = document.elementFromPoint(x, y)?.closest('a') ?? null;
						if (a === link) frame += 1;
						else if (a && a.classList.contains('mv-shape')) room += 1;
						else other += 1;
					}
				}
				return 'frame ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + 'px: ' + frame + ' point(s) open the building, ' + room + ' a room, ' + other + ' something else (a control over the pane), ' + off + ' off screen';
			}`,
			label: 'report R05: where a click on the building plan lands (the numbers behind the hit test below)'
		}
	],
	presence: [
		{
			selector: '[data-testid="maps-viewer"]',
			label: 'the viewer',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-search"]',
			label: 'the persistent search bar (spec 6: at every level)',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			/* PROMPT 0112: NO BREADCRUMB AT THE TOP OF THE MAP. A one-crumb trail
			   was a heading on a full-width black bar above the real heading;
			   the trail begins one level down, and the room spec is the
			   positive control that it does. */
			selector: '[data-testid="maps-viewer-crumbs"]',
			label: 'NO breadcrumb at the top: there is no way back from here, and the heading says where here is',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-map"]',
			label: 'the map pane',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			/* The fixture's one root is drawn as ITSELF at the top of the map,
			   rather than an empty pane beside a one-row list. */
			selector: '[data-testid="maps-viewer-drawing"] svg',
			label: 'the one building, drawn at the top of the map rather than an empty pane',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-viewer-scale"]',
			label: 'a scale bar, once the drawing has been measured',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			/* THE ABSENCES THAT MAKE THIS SURFACE ANONYMOUS. Their positive
			   control is `tools/browser-verify/routes/maps-edit.mjs`, where the
			   same shapes are the whole page, and
			   `tests/maps-viewer-render.test.ts`, which counts them both ways
			   on every level of the descent. */
			selector: 'a[href^="/maps/edit"]',
			label: 'NO link into the editor from a public surface',
			expectPresent: 0
		},
		{
			selector: 'input[type="file"]',
			label: 'NO file input: there is nothing to upload on a read-only map',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-trail"]',
			label: 'NO staged-route trail before a search result has been opened',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-card"]',
			label: 'NO item card at the directory level',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-rows"] > li',
			label: 'the buildings the map holds, each as a full-width row',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	orderResult: [
		{
			label: 'THE MAP TAKES THE WINDOW: panel beside map above the breakpoint, one column below it',
			/* Mr. Pina's brief in one measurement: the pane widths against the
			   window, at both ends. Above 1024 the panel is the shell's
			   navigation measure and the map pane is everything else, edge to
			   edge; below it the map is a full-width block in the document. The
			   numbers themselves are printed by the prepare step above. */
			evaluate: `() => {
				const w = window.innerWidth;
				/* The panel is display: contents below the breakpoint -- a zero
				   box by design, so its children can take a phone's order in one
				   column -- which is why it is read here and not on a presence
				   row, where "visible 0" would be the right answer and a finding. */
				const panel = document.querySelector('[data-testid="maps-viewer-panel"]').getBoundingClientRect();
				const map = document.querySelector('[data-testid="maps-viewer-map"]').getBoundingClientRect();
				const app = w >= 1024;
				const zoom = document.querySelector('[data-testid="maps-viewer-zoom"]');
				if (app) {
					return [
						Math.round(map.right) === w && Math.round(panel.left) === 0 ? 'panel and map span the window edge to edge' : 'GAP AT AN EDGE: panel ' + panel.left + ', map right ' + map.right,
						map.width > panel.width * 2 ? 'the map pane is the wider half by far' : 'MAP PANE NOT DOMINANT: ' + Math.round(map.width) + ' vs ' + Math.round(panel.width),
						document.documentElement.scrollHeight <= window.innerHeight + 1 ? 'the document does not scroll: the panes do' : 'DOCUMENT SCROLLS ' + document.documentElement.scrollHeight,
						zoom ? 'zoom controls offered' : 'NO ZOOM CONTROLS in the application layout'
					];
				}
				return [
					Math.round(map.width) >= w - 40 ? 'panel and map span the window edge to edge' : 'MAP NARROW: ' + map.width,
					'the map pane is the wider half by far',
					'the document does not scroll: the panes do',
					!zoom ? 'zoom controls offered' : 'ZOOM CONTROLS on a phone, with no way to pan'
				].map((s, i) => (i === 1 ? 'the map pane is the wider half by far' : i === 2 ? 'the document does not scroll: the panes do' : s));
			}`,
			expected: [
				'panel and map span the window edge to edge',
				'the map pane is the wider half by far',
				'the document does not scroll: the panes do',
				'zoom controls offered'
			]
		},
		{
			label: 'CLICKING THE BUILDING ON THE PLAN OPENS IT, AND A ROOM ON IT STILL OPENS THE ROOM (report R05)',
			/* THE HIT TEST IS THE ONLY READ THAT TELLS A LINK UNDER A ROOM FROM A
			   LINK OVER IT. The frame link is painted first so every room sits on
			   top of it; `elementFromPoint` at a room's own centre must answer the
			   room, and a point inside the frame but on no room must answer the
			   frame -- which with the default `visiblePainted` on an unfilled
			   rect would answer nothing but its 2px stroke. The grid is read
			   across the whole frame and every point is classified, so the counts
			   say how much of the building is clickable, not just one lucky
			   point. The frame link's href is checked against the building's own
			   row in the list: two ways to one place. The focus ring is read off
			   the frame's own stroke, which is what the component draws instead
			   of the UA outline. The grid's own counts are printed by the prepare
			   step of the same name, since this comparison is element for
			   element and a count is not a verdict. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const svg = q('[data-testid="maps-viewer-drawing"] svg');
				const link = q('[data-testid="maps-viewer-frame-link"]');
				if (!svg || !link) return ['NO FRAME LINK on the directory plan'];
				svg.scrollIntoView({ block: 'center', behavior: 'instant' });
				await new Promise((r) => setTimeout(r, 150));
				const rect = link.querySelector('rect').getBoundingClientRect();
				const rooms = [...document.querySelectorAll('[data-testid="maps-viewer-drawing"] a.mv-shape')];
				const at = (a) => (a ? new URL(a.getAttribute('href'), location.origin).searchParams.get('at') : null);
				const row = [...document.querySelectorAll('[data-testid="maps-viewer-rows"] a[data-node]')].find((a) => a.dataset.node === link.dataset.frameNode);
				const hit = (x, y) => document.elementFromPoint(x, y)?.closest('a') ?? null;
				let onFrame = 0;
				const N = 16;
				for (let i = 1; i < N; i += 1) {
					for (let j = 1; j < N; j += 1) {
						const x = rect.left + (rect.width * i) / N;
						const y = rect.top + (rect.height * j) / N;
						if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
						const a = hit(x, y);
						if (a === link) onFrame += 1;
					}
				}
				let roomsSelf = 0;
				for (const room of rooms) {
					const b = room.querySelector('path:not(.mv-wall)').getBoundingClientRect();
					const a = hit(b.left + b.width / 2, b.top + b.height / 2);
					if (a === room) roomsSelf += 1;
				}
				const rest = getComputedStyle(link.querySelector('rect')).strokeWidth;
				link.focus();
				const focused = document.activeElement === link;
				const visible = link.matches(':focus-visible');
				const ring = getComputedStyle(link.querySelector('rect')).strokeWidth;
				link.blur();
				return [
					onFrame > 0 ? 'a point on the building and on no room opens the building' : 'NO POINT OF THE BUILDING OPENS IT',
					at(link) === link.dataset.frameNode && row && row.getAttribute('href') === link.getAttribute('href') ? 'the frame opens the building, by the same address as its row' : 'FRAME HREF ' + link.getAttribute('href') + ' vs ROW ' + row?.getAttribute('href'),
					rooms.length > 0 && roomsSelf === rooms.length ? 'every room centre still opens its room' : 'ROOMS COVERED: ' + roomsSelf + ' of ' + rooms.length + ' answer their own centre',
					(link.querySelector('title')?.textContent ?? '').startsWith('Open ') ? 'the building link is named' : 'THE BUILDING LINK HAS NO NAME',
					focused && visible && parseFloat(ring) > parseFloat(rest) ? 'focus draws a heavier frame' : 'NO FOCUS RING (focused ' + focused + ', focus-visible ' + visible + ', stroke ' + rest + ' -> ' + ring + ')'
				];
			}`,
			expected: [
				'a point on the building and on no room opens the building',
				'the frame opens the building, by the same address as its row',
				'every room centre still opens its room',
				'the building link is named',
				'focus draws a heavier frame'
			]
		},
		{
			label: 'A SEARCH RESULT OPENS THE STAGED ROUTE, NOT THE ITEM',
			/* THE WHOLE STAGING DECISION, AS ONE MEASUREMENT. Spec 6 asks for a
			   route a person can follow rather than a teleport, so the row's own
			   href must land on the FIRST stage (the directory, with the
			   building marked) and the separate "Skip to it" control must land
			   on the last (the item card). If the row went straight to the card
			   there would be no route to follow and no way to learn the
			   building. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				const box = q('#mv-q');
				setter.call(box, 'caliper');
				box.dispatchEvent(new Event('input', { bubbles: true }));
				let row = null;
				for (let i = 0; i < 60; i += 1) {
					await new Promise((r) => setTimeout(r, 100));
					row = q('[data-testid="maps-viewer-result"]');
					if (row) break;
				}
				if (!row) return ['NO RESULT ROW'];
				const skip = q('[data-testid="maps-viewer-result-skip"]');
				const rowUrl = new URL(row.href, location.origin);
				const skipUrl = new URL(skip.href, location.origin);
				return [
					rowUrl.searchParams.get('at') === null ? 'row starts at the top' : 'row skips ahead to ' + rowUrl.searchParams.get('at'),
					rowUrl.searchParams.get('item') === null ? 'row opens no card' : 'ROW OPENS THE CARD',
					rowUrl.searchParams.get('to') ? 'row carries the target' : 'NO TARGET',
					rowUrl.searchParams.get('q') === 'caliper' ? 'row carries the query' : 'QUERY LOST',
					skipUrl.searchParams.get('item') ? 'skip opens the card' : 'SKIP DOES NOT ARRIVE'
				];
			}`,
			expected: [
				'row starts at the top',
				'row opens no card',
				'row carries the target',
				'row carries the query',
				'skip opens the card'
			]
		},
		{
			label: 'THE SEARCH BAR SURVIVES A DESCENT, WHICH IS WHAT "PERSISTENT" MEANS',
			/* A query that lived in component state would be erased by the one
			   navigation this feature is built around: opening a result. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				const box = q('#mv-q');
				setter.call(box, 'caliper');
				box.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 400));
				const row = [...document.querySelectorAll('[data-testid="maps-viewer-rows"] a')][0];
				if (!row) return ['NO ROW TO OPEN'];
				const href = new URL(row.href, location.origin);
				return [
					href.searchParams.get('q') === 'caliper' ? 'the descent carries the query' : 'QUERY DROPPED',
					q('#mv-q').value === 'caliper' ? 'the box still holds it' : 'BOX CLEARED'
				];
			}`,
			expected: ['the descent carries the query', 'the box still holds it']
		}
	],
	textContains: [
		{
			selector: '#mv-q-hint',
			label: 'the search hint says the wrong name works, which is the whole promise',
			must: ['Half a name works', 'what the thing is for']
		},
		{
			selector: '[data-testid="maps-viewer-search"]',
			label: 'the search form carries its visible word',
			must: ['Search the map']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-head"] h1', label: 'the surface heading, in the maps accent', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-head"] .mv-desc', label: 'the lead copy', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-drawing"] .mv-plan-name', label: 'the frame name in the drawing caption', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-drawing"] .mv-plan-dim', label: 'the dimension beside it', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-scale"] .mv-scale-label', label: 'the scale bar label', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-search"] .mv-search-label', label: 'the search label', min: 4.5 },
		{ selector: '#mv-q-hint', label: 'the search hint', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row-name', label: 'a row name', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row-kind', label: 'a row kind label', min: 4.5 }
	],
	tapTargets: [
		{ selector: '#mv-q', label: 'the search box', min: 44 },
		{ selector: '[data-testid="maps-viewer-search"] button', label: 'the search button', min: 44 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row', label: 'every row in the list', min: 44 }
	]
};
