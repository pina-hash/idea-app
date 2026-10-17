/**
 * TYPING IN THE CLASS SEARCH AS A STUDENT (ledger 0396, part 7, polish round
 * 1), at 375 and 1440. At 1440 the student's row is one line ending in the
 * Videos key, and that key, taken away by a word and given back as the word
 * was deleted, used to land on a line of its own under the row and stay there
 * after Escape (measured: the first unit 52px lower than at rest, 292.8 against
 * 240.8). It comes back to its own line now, the field never moves, and Escape
 * and Clear give back the row at rest (`TYPING`).
 */
import { IGNORE, READY, STUDENT, TYPING, TYPING_EXPECTED } from './_class-toolbar.mjs';

export default {
	path: `${STUDENT}&state=typing`,
	aliasOf: STUDENT,
	label: 'Typing in the class search moves nothing under the caret (student)',
	ignoreConsole: IGNORE,
	prepare: [READY],
	orderResult: [{ label: 'the field holds still while the word is typed and deleted, the count under the keys', evaluate: TYPING, expected: TYPING_EXPECTED }]
};
