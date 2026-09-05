export default {
	path: '/dev/item-images-empty',
	aliasOf: '/dev/item-images',
	label: 'The item body picture picker with nothing to offer (0041)',
	/* AN ALIAS RATHER THAN MORE ROWS ON THE PARENT SPEC, and it is forced. Each
	   RichTextEditor instance closes its own popover on a pointerdown outside
	   its wrapper, so opening the empty case's form would close the picker's --
	   two popovers cannot be measured in one pass. Same page, second visit,
	   different control opened. */
	prepare: [
		{
			click: '[data-editor-case="empty"] .rt-toolbar button[aria-expanded]:not([aria-pressed])',
			until: '() => !!document.querySelector(\'[data-editor-case="empty"] .image-pop\')',
			waitMs: 150
		}
	],
	presence: [
		{ selector: '[data-editor-case="empty"] .image-pop', label: 'the image form, opened on an item with no pictures', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		/* THE WHOLE CLAIM. An empty picker with no sentence is a control that
		   reads as broken, so the empty case shows a sentence and NO rows -- and
		   the ceiling on the rows is what says the list is genuinely empty
		   rather than merely scrolled. */
		{ selector: '[data-editor-case="empty"] .image-empty', label: 'the sentence that says why there is nothing here', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-editor-case="empty"] .image-choice', label: 'pictures offered on an item that has none', expectPresent: 0 },
		/* AND NOT A TEXT BOX. Falling back to free text here would put the exact
		   defect 0041 removed back on the one surface that had the information
		   to prevent it: a key typed by hand, on an item with no files at all. */
		{ selector: '[data-editor-case="empty"] input[aria-label="Picture file"]', label: 'no free-text file field on the empty picker', expectPresent: 0 },
		/* The description field and the refusal are unchanged by there being
		   nothing to pick: 0030's contract does not depend on 0041's control. */
		{ selector: '[data-editor-case="empty"] .image-pop .link-input', label: 'the description field, still here', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-editor-case="empty"] .link-go[aria-disabled="true"]', label: 'Add, refusing and able to say so', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-editor-case="empty"] .image-empty',
			label: 'it says what is missing AND how to leave the state, not just that the list is empty',
			must: ['No pictures on this item yet', 'Add one under Files below']
		}
	],
	contrast: [
		{ selector: '[data-editor-case="empty"] .image-empty', label: 'the empty-case sentence', min: 4.5 }
	],
	tapTargets: []
};
