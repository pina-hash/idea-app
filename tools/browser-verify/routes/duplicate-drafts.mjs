/* NO `order` EXPORT, deliberately -- see routes.mjs: that field belongs to the
   original 25 files only, and anything added since sorts after them by
   filename. */

/**
 * 0074 IN A REAL BROWSER: WHAT AN INSTRUCTOR SEES, AND WHAT PRESSING REMOVE
 * ACTUALLY DOES.
 *
 * The count of surplus drafts in production is unknowable from here (0073
 * proved the egress proxy carries no bytes to 5432), so what this measures is
 * the SURFACE that will carry the count to whoever opens it: that the groups
 * render, that a copy carrying student work is separated and marked and
 * offered nothing, that the removal is a second press rather than a first, and
 * that both controls clear the 44px floor at 375 and 1440.
 *
 * WHY A BROWSER AND NOT ONLY THE NODE TESTS. `tests/classroom-duplicate-drafts.test.ts`
 * pins the structure by server render, which is where structure belongs, and
 * it cannot press anything: a server render has no handlers, and happy-dom has
 * no layout engine, so a box or a tap target measured there reads zero and
 * passes vacuously. Here the arm and the confirm are real clicks on a real
 * hydrated page.
 *
 * THE ORACLE IS IN THIS FILE. `/dev/duplicate-drafts` reports raw counts only
 * (`data-dd-readout`); every judgement below is made here.
 *
 * PAINT IS NOT INTERACTIVITY. `waitForApp` returns on DOM stability, which the
 * server-rendered markup satisfies before a single handler is attached, so the
 * first click is retried against its OWN effect -- the confirm block appearing
 * -- rather than after a fixed wait, and the runner prints the attempt count.
 *
 * WHAT THIS DOES NOT PROVE, and must not be read as proving: that the SERVER
 * refuses a blocked row. The harness transport is a stand-in. The refusal is
 * measured against real Postgres, through the shipped route handler, in
 * `tests/db/duplicate-drafts-remove-guard.test.ts`.
 */
export default {
	path: '/dev/duplicate-drafts',
	label: '0074: duplicate drafts group, the blocked copy is separated, and removal takes two presses',
	prepare: [
		/* ARM THE FIRST SAFE COPY, retried against its own effect. The
		   predicate is the thing actually wanted -- the confirm block exists --
		   so a click that landed on un-hydrated markup is retried rather than
		   counted as a refusal. */
		{
			click: '[data-dd-copy][data-removable="true"] [data-dd-arm]',
			until: `() => !!document.querySelector('[data-dd-confirm]')`,
			attempts: 12,
			waitMs: 250
		},
		/* CONFIRM IT. Two presses, which is the contract: arm, then confirm. */
		{
			click: '[data-dd-do-remove]',
			until: `() => /removed 1:/.test(document.querySelector('[data-dd-readout]').textContent)`,
			attempts: 12,
			waitMs: 250
		}
	],
	orderResult: [
		{
			evaluate: `() => {
				const read = document.querySelector('[data-dd-readout]');
				const groups = document.querySelectorAll('[data-dd-group]').length;
				const blocked = document.querySelectorAll('[data-dd-copy][data-removable="false"]').length;
				const arms = document.querySelectorAll('[data-dd-arm]').length;
				const reason = document.querySelector('[data-dd-reason]');
				const note = document.querySelector('[data-dd-note]');
				const m = (read ? read.textContent : '').match(/removed (\\d+):/);
				return [
					'removed ' + (m ? m[1] : 'absent'),
					'groups ' + groups,
					'blocked ' + blocked,
					'arms ' + arms,
					'reason=' + (reason && /student has work/i.test(reason.textContent) ? 'named' : 'missing'),
					'note=' + (note ? 'shown' : 'absent')
				];
			}`,
			expected: [
				/* One removal landed. Two groups still stand (the Bridge group
				   loses one of three, the Truss group keeps its blocked copy).
				   ONE blocked row, still there, still explained. Three arm
				   controls remain: 2 of the Bridge group's 3 and 1 of Truss's
				   2 -- the blocked one never had one. */
				'removed 1',
				'groups 2',
				'blocked 1',
				'arms 3',
				'reason=named',
				'note=shown'
			],
			label:
				'one copy removed by two presses; the blocked copy survives, is marked, and is never offered a control'
		}
	],
	presence: [
		{
			selector: '[data-dd-group]',
			label: 'the duplicate groups',
			expectPresent: 2
		},
		{
			selector: '[data-dd-blocked]',
			label: 'the not-removable block, shown separately',
			expectPresent: 1
		},
		{
			selector: '[data-dd-keep]',
			label: 'the sentence naming the copy being kept',
			expectPresent: 2
		},
		{
			/* THE ABSENCE, WITH ITS CONTROL BESIDE IT. No bulk anything: the
			   arm controls above are the positive half, so a zero here cannot
			   be a page that failed to render. */
			selector: 'input[type="checkbox"]',
			label: 'bulk selection (there is none, deliberately)',
			expectPresent: 0
		}
	],
	contrast: [
		{ selector: '[data-dd-summary]', label: 'the summary line', min: 4.5 },
		{ selector: '[data-dd-reason]', label: 'the not-removable reason', min: 4.5 },
		{ selector: '[data-dd-keep]', label: 'the kept-copy sentence', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-dd-arm]', label: 'Remove this copy' },
		{ selector: '[data-dd-reset]', label: 'Reset the fixture' }
	]
};
