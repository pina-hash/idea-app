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
			selector: '[data-testid="maps-viewer-crumbs"]',
			label: 'the containment chain, visible from the very top',
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
			selector: '[data-testid="maps-viewer-search"]',
			label: 'the search bar says the wrong name works, which is the whole promise',
			must: ['Half a name works', 'what the thing is for']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-head"] h1', label: 'the surface heading, in the maps accent', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-head"] .mv-desc', label: 'the lead copy', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-crumbs"] [aria-current]', label: 'the crumb you are standing on', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-search"] .mv-search-label', label: 'the search label', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-search"] .mv-search-hint', label: 'the search hint', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row-name', label: 'a row name', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row-kind', label: 'a row kind label', min: 4.5 }
	],
	tapTargets: [
		{ selector: '#mv-q', label: 'the search box', min: 44 },
		{ selector: '[data-testid="maps-viewer-search"] button', label: 'the search button', min: 44 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row', label: 'every row in the list', min: 44 }
	]
};
