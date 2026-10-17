/**
 * TYPING IN THE CLASS SEARCH WITH THE VIDEOS KEY FIRST, AS A STUDENT (ledger
 * 0396, part 7, polish round 1), at 375 and 1440: the student's half of the
 * videos-first case, where the field slid 146px left at 960 and 375 when the
 * word took the key away. The field keeps the key's room and the key comes
 * back into it (`TYPING`).
 */
import { IGNORE, READY, STUDENT, TYPING, TYPING_EXPECTED } from './_class-toolbar.mjs';

export default {
	path: `${STUDENT}&layout=videos-first&state=typing`,
	aliasOf: `${STUDENT}&layout=videos-first`,
	label: 'Typing in the class search moves nothing under the caret (student, Videos first)',
	ignoreConsole: IGNORE,
	prepare: [READY],
	orderResult: [{ label: 'the field holds still while the word is typed and deleted, the count under the keys', evaluate: TYPING, expected: TYPING_EXPECTED }]
};
