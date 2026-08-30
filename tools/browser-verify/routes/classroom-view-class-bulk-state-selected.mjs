export default {
	path: '/dev/classroom?view=class-bulk&state=selected',
	label: 'Class stream: a group select-all, then a bulk publish that partly fails',
	aliasOf: '/dev/classroom?view=class-bulk',
	/*
		THE SELECTED STATE, AND THE ONE THING ABOUT IT NOBODY WOULD NOTICE
		BREAKING. `runBulk` leaves the REFUSED ids selected and clears the rest,
		deliberately -- a partial failure that cleared everything would leave the
		person with a sentence about "1 of 29" and nothing on screen saying which
		one, on a pane whose next action may be Delete.

		The fixture makes that a real refusal rather than a flag: the crowded row
		is co-posted to a Period 9 this teacher does not manage, so
		`setPublished` answers the same sentence the RPC does. The steps are
		Unit 1's select-all (22 of 29), then the pane's (29), then Publish.
	*/
	prepare: [
		{
			click: '[data-testid="group-select-ub-1"]',
			until: '() => document.querySelector("[data-testid=\'bulk-count\']")?.textContent.trim() === "22 selected"'
		},
		{
			click: '[data-testid="bulk-select-all"]',
			until: '() => document.querySelector("[data-testid=\'bulk-count\']")?.textContent.trim() === "29 selected"'
		},
		{
			click: '[data-testid="bulk-publish"]',
			until: '() => !!document.querySelector(".feedback.error")'
		}
	],
	presence: [
		{ selector: '[data-testid="bulk-publish"]', label: 'bulk publish', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-unit-select"]', label: 'bulk file-into-unit', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-delete"]', label: 'bulk delete', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-clear"]', label: 'clear selection', expectPresent: 1, expectVisible: 1 },
		/* The resting sentence gives way to the count: one slot, two states. */
		{ selector: '[data-testid="bulk-hint"]', label: 'resting sentence (replaced by the count)', expectPresent: 0 },
		{ selector: '.feedback.error', label: 'the refusal, in the pane the person is working in', expectPresent: 1, expectVisible: 1 }
	],
	tapTargets: [
		{ selector: '[data-testid="bulk-publish"]', label: 'bulk publish', min: 44 },
		{ selector: '[data-testid="bulk-delete"]', label: 'bulk delete', min: 44 },
		{ selector: '[data-testid="bulk-unit-select"]', label: 'bulk file-into-unit', min: 44 },
		{ selector: '[data-testid="bulk-clear"]', label: 'clear selection', min: 44 }
	],
	contrast: [{ selector: '.feedback.error', label: 'the refusal sentence', min: 4.5 }],
	orderResult: [
		{
			/* THE ASSERTION THIS ROUTE EXISTS FOR: exactly the refused row is
			   still ticked, and it is named -- a count alone would pass on a
			   selection that kept the wrong one. */
			evaluate: `() => [...document.querySelectorAll('[data-testid^="row-select-"]')]
				.filter((c) => c.checked)
				.map((c) => c.dataset.testid.replace('row-select-', ''))`,
			expected: ['ib-crowded'],
			label: 'a partial bulk failure leaves the FAILURES selected, and only them'
		},
		{
			evaluate: `() => [document.querySelector('[data-testid="bulk-count"]')?.textContent.trim() ?? 'no count']`,
			expected: ['1 selected'],
			label: 'the count follows the surviving selection'
		}
	]
};
