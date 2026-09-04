export default {
	path: '/dev/grading-bulk?state=single',
	label: 'Grading at scale: the bulk transport WITHHELD, which is the per-section console',
	/*
		ABSENCE IS THE MECHANISM, ASSERTED AS ABSENCE.

		Handing the console no bulk transport does not disable the batch: none of
		its markup exists. There are no checkboxes to leave unticked, no presets to
		grey out, no section chips and no cross-section read. That is what makes
		"the per-section console cannot grade in bulk" structural rather than a
		flag somebody has to remember to leave off -- and the base spec, where all
		of it is present in the same numbers, is this spec's positive control.

		THE ONE THING THAT APPEARS HERE AND NOT THERE is the link across. A path
		nobody can find is a path that was not built, so the single-class console
		carries it unconditionally.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 4' }
	],
	presence: [
		{ selector: '[data-testid="roster-pick"]', label: 'tick boxes', expectPresent: 0 },
		{ selector: '[data-testid="pick-presets"]', label: 'the named selections', expectPresent: 0 },
		{ selector: '[data-testid="roster-group"]', label: 'per-class groups', expectPresent: 0 },
		{ selector: '[data-testid="roster-section"]', label: 'the class chip', expectPresent: 0 },
		{ selector: '[data-testid="batch-bar"]', label: 'the batch bar', expectPresent: 0 },
		{ selector: '[data-testid="export-section"]', label: 'the export class picker (one class here)', expectPresent: 0 },
		/* THE POSITIVE CONTROLS: the console itself is fully present, so the zeros
		   above mean "withheld" rather than "the page did not render". */
		{ selector: '.roster-list .roster-row', label: 'the roster is here, one class of it', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="cross-class-link"]', label: 'the way across to the cross-class console', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="cross-class-link"]',
			label: 'it says what it does in words',
			must: ['across every class']
		}
	],
	tapTargets: [
		/* 44, not the 24px floor: it is a standalone navigation control, not a
		   link inside a sentence, and it is the ONLY route to the cross-class
		   console. It measured 18px as a bare inline link. */
		{ selector: '[data-testid="cross-class-link"]', label: 'the link across', min: 44 }
	]
};
