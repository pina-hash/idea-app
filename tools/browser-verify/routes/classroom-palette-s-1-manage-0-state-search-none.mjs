/**
 * THE CLASS SEARCH MATCHING NOTHING, as a student: it says so in words, with
 * the Clear control beside the sentence, instead of an empty page that reads
 * as a class that lost its work. No unit card renders at all.
 */
import { READY, STUDENT, typeInto } from './_classroom-palette.mjs';

export default {
	path: `${STUDENT}&state=search-none`,
	aliasOf: STUDENT,
	label: 'Class search (student): nothing matches',
	prepare: [
		READY,
		typeInto('stream-search', 'zeppelin', '() => !!document.querySelector(\'[data-testid="stream-find-none"]\')')
	],
	presence: [
		{ selector: '[data-testid="stream-find-none"]', label: 'the no-match sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="unit-group"]', label: 'no unit card with nothing in it', expectPresent: 0 },
		/* Positive control for the absence above: the bar itself is still here. */
		{ selector: '[data-testid="stream-find"]', label: 'the search bar stays', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="stream-find-none"]', label: 'the sentence and its way out', must: ['No items match', 'Clear'] },
		{ selector: '[data-testid="stream-find-result"]', label: 'the count says zero', must: ['0 of 14 shown'] }
	],
	contrast: [{ selector: '[data-testid="stream-find-none"] .note', label: 'no-match sentence', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="stream-find-none"] .find-clear', label: 'Clear beside the sentence' }]
};
