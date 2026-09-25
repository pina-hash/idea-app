import { IGNORE_FIXTURE_PHOTO, OPEN } from './_quick-note.mjs';

/**
 * A QUICK NOTE UNDER AN ASSIGNMENT IS TITLED BY THE ASSIGNMENT, ON EVERY PAGE
 * UNDER IT (ledger 0298 review). The grading console sits under the item page,
 * where the trail's LAST crumb is the page's own name, "Grading"; reading the
 * last crumb made "Grading" the note's title everywhere it is listed. The
 * title now comes from the trail's ITEM crumb. The line under the box is where
 * the filing is stated before anything is written, so it is what is read.
 */
export default {
	path: '/dev/quick-note/s-1/item/i-1/grade',
	label: 'Quick note on the grading page: filed under the assignment title, never the page name',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"quicknote-menu-item\\"]")', timeoutMs: 20000 },
		{ evaluate: OPEN }
	],
	textContains: [
		{
			selector: '[data-testid="qn-where"]',
			label: 'the filing line names the class and the assignment, not the page',
			must: ['ENG1H', 'Truss bridge analysis'],
			mustNot: ['Grading']
		}
	]
};
