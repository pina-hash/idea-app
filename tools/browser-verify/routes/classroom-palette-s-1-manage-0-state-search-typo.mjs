/**
 * THE CLASS SEARCH, with a typo, as a student (report 19).
 *
 * "photso" is an adjacent transposition of "photos": one typo, which the
 * search forgives (Damerau at k = 1, the gallery's own helper). It finds
 * "Bridge photos" inside Unit 2 and nothing else. The search runs over the
 * LOADED items, never the page, so a folded unit's items are found too.
 *
 * The sister state is "zeppelin", which matches nothing and must say so in
 * words with a way out, rather than rendering an empty page.
 */
import { READY, STREAM_ROWS, STUDENT, typeInto } from './_classroom-palette.mjs';

export default {
	path: `${STUDENT}&state=search-typo`,
	aliasOf: STUDENT,
	label: 'Class search (student): one typo still finds the item',
	prepare: [
		READY,
		typeInto('stream-search', 'photso', '() => !!document.querySelector(\'[data-testid="stream-find-result"]\')')
	],
	orderResult: [
		{ label: 'the one item one typo away, in its unit', evaluate: STREAM_ROWS, expected: ['u-2:item:i-turned-in'] }
	],
	textContains: [
		{ selector: '[data-testid="stream-find-result"]', label: 'a count of what is shown', must: ['1 of 14 shown'] }
	],
	presence: [
		{ selector: '[data-testid="stream-clear"]', label: 'a Clear control while narrowing', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="unit-group"]', label: 'exactly the one unit holding the match', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	]
};
