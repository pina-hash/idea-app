export default {
	path: '/dev/item-images-text',
	aliasOf: '/dev/item-images',
	label: 'The item body image control with NO picker, for the callers 0041 does not own',
	/* SpecProseField and CheckInGuidance mount the same editor and cannot say
	   which pictures exist -- one is a spec's prose field authored before the
	   item exists, the other a check-in's guidance, which has no attachment list
	   at all. Neither is 0041's to change, so both keep the free-text field, and
	   ABSENCE is the mechanism: no `images` prop, no picker.

	   Measured rather than reasoned about, because losing this branch is
	   silent -- the button stays, the popover opens, and it says there is
	   nothing to place on a surface that never had a list to be empty. */
	prepare: [
		{
			click: '[data-editor-case="text"] .rt-toolbar button[aria-expanded]:not([aria-pressed])',
			until: '() => !!document.querySelector(\'[data-editor-case="text"] .image-pop\')',
			waitMs: 150
		}
	],
	presence: [
		{ selector: '[data-editor-case="text"] .image-pop', label: 'the image form on a caller that passes no list', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		/* THE PAIR THAT SAYS "UNCHANGED": the free-text field is here, and the
		   picker is not. Either alone would pass on a half-migrated control. */
		{ selector: '[data-editor-case="text"] input[aria-label="Picture file"]', label: 'the free-text file field, still here for these callers', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-editor-case="text"] .image-pick', label: 'no picker where the caller cannot say what exists', expectPresent: 0 },
		{ selector: '[data-editor-case="text"] .image-empty', label: 'and no empty-case sentence either, which would be a lie here', expectPresent: 0 },
		{ selector: '[data-editor-case="text"] .image-pop .link-input', label: 'its two fields: the file and the description', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '[data-editor-case="text"] .link-go[aria-disabled="true"]', label: 'Add, refusing until both are given', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-editor-case="text"] .image-hint',
			label: '0030’s description contract survives the picker landing beside it',
			must: ['description is required', 'screen reader']
		}
	],
	contrast: [],
	tapTargets: []
};
