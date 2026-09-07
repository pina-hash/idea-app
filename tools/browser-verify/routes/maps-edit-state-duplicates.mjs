/* NO `order` EXPORT, deliberately -- see routes.mjs: that field belongs to the
   original 25 files only, and anything added since sorts after them by
   filename. */

/**
 * PROMPT 0098 IN A REAL BROWSER: THE SURPLUS ROOMS, SEEN AND REMOVED ONE AT A
 * TIME.
 *
 * One press of "Create draft" once wrote about thirty identical rooms into the
 * live map. The fix is in NodeDetail's `doSave` and is proven by
 * `tests/dom/maps-node-create-once.test.ts`; THIS measures the surface that
 * takes the rows back out: that the Places tab carries the way in, that the
 * kept copy has no control, that the copy holding a unit is listed separately
 * with its reason and never offered a control, that removal is a second press
 * rather than a first, and that every control clears the 44px floor at 375
 * and 1440 (1920 is measured by hand in the history entry -- WIDTHS is the
 * harness's own list).
 *
 * WHY A BROWSER AND NOT ONLY THE DOM MOUNT. `tests/dom/maps-duplicates-mount.test.ts`
 * pins the structure and the press; happy-dom has no layout engine, so a box
 * or a tap target measured there reads zero and passes vacuously. Here the arm
 * and the confirm are real clicks on a real hydrated page and the targets are
 * real boxes.
 *
 * PAINT IS NOT INTERACTIVITY. `waitForApp` returns on DOM stability, which the
 * server-rendered markup satisfies before a handler is attached, so the first
 * click is retried against its OWN effect rather than after a fixed wait.
 */
export default {
	path: '/dev/maps-edit?state=duplicates',
	label: '0098: the surplus rooms group, the blocked copy is separated, and removal takes two presses',
	prepare: [
		{
			click: '[data-testid="maps-dup-copy"][data-removable="true"] [data-testid="maps-dup-arm"]',
			until: `() => !!document.querySelector('[data-testid="maps-dup-confirm"]')`,
			attempts: 12,
			waitMs: 250
		},
		{
			click: '[data-testid="maps-dup-do-remove"]',
			until: `() => !!document.querySelector('[data-testid="maps-dup-note"]')`,
			attempts: 12,
			waitMs: 250
		}
	],
	orderResult: [
		{
			evaluate: `() => {
				const q = (s) => document.querySelector(s);
				const qa = (s) => document.querySelectorAll(s);
				const note = q('[data-testid="maps-dup-note"]');
				const reason = q('[data-testid="maps-dup-reason"]');
				const entry = q('[data-testid="maps-dup-entry"]');
				return [
					'removed ' + (note ? note.getAttribute('data-removed') : 'absent'),
					'groups ' + qa('[data-testid="maps-dup-group"]').length,
					'blocked ' + qa('[data-testid="maps-dup-copy"][data-removable="false"]').length,
					'arms ' + qa('[data-testid="maps-dup-arm"]').length,
					'reason=' + (reason && /holds 1 container/.test(reason.textContent) ? 'named' : 'missing'),
					'entry=' + (entry ? entry.textContent.replace(/\\s+/g, ' ').trim() : 'absent')
				];
			}`,
			expected: [
				/* One removal landed. The group still stands with one arm left
				   (two safe copies minus one), the blocked copy still there,
				   still explained, never offered a control; the Places-tab
				   entry re-counts on the reload. */
				'removed 1',
				'groups 1',
				'blocked 1',
				'arms 1',
				'reason=named',
				'entry=2 surplus copies of 1 container'
			],
			label:
				'one copy removed by two presses; the blocked copy survives, is marked, and is never offered a control'
		}
	],
	presence: [
		{
			selector: '[data-testid="maps-dup-entry"]',
			label: 'the way in, on the Places tab',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-dup-blocked"]',
			label: 'the not-removable block, shown separately',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-dup-keep"]',
			label: 'the sentence naming the copy being kept',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			/* THE ABSENCE, WITH ITS CONTROL BESIDE IT: the arms above are the
			   positive half, so a zero here cannot be a page that failed to
			   render. */
			selector: '[data-testid="maps-duplicates"] input[type="checkbox"]',
			label: 'bulk selection (there is none, deliberately)',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-dup-summary"]',
			label: 'the summary line says one at a time',
			must: ['one at a time']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-dup-summary"]', label: 'the summary line', min: 4.5 },
		{ selector: '[data-testid="maps-dup-reason"]', label: 'the not-removable reason', min: 4.5 },
		{ selector: '[data-testid="maps-dup-keep"]', label: 'the kept-copy sentence', min: 4.5 },
		{ selector: '[data-testid="maps-dup-note"]', label: 'the removal note', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-dup-entry"]', label: 'the Places-tab entry', min: 44 },
		{ selector: '[data-testid="maps-dup-arm"]', label: 'Remove (arm)', min: 44 },
		{ selector: '[data-testid="maps-duplicates"] .dup-open-btn', label: 'Open it (blocked copy)', min: 44 },
		{ selector: '[data-testid="maps-duplicates"] .dup-open', label: 'Open it (kept copy, inline)', min: 44 }
	]
};
