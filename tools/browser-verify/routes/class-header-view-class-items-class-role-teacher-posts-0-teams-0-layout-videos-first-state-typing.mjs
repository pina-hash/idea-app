/**
 * TYPING IN THE CLASS SEARCH WITH THE VIDEOS KEY FIRST, AS A TEACHER (ledger
 * 0396, part 7, polish round 1), at 375 and 1440. In this person's layout the
 * Videos key sits before the search on the field's line, so the keystroke that
 * left no video showing took it away and slid the focused field left under the
 * caret (measured: 146px at 1440 and at 375), and the keystroke that brought
 * it back put it on a line of its own above the field. The field keeps the
 * key's room while it is gone, and the key comes back into that room
 * (`TYPING`).
 */
import { IGNORE, READY, TEACHER, TYPING, TYPING_EXPECTED } from './_class-toolbar.mjs';

export default {
	path: `${TEACHER}&layout=videos-first&state=typing`,
	aliasOf: `${TEACHER}&layout=videos-first`,
	label: 'Typing in the class search moves nothing under the caret (teacher, Videos first)',
	ignoreConsole: IGNORE,
	prepare: [READY],
	orderResult: [{ label: 'the field holds still while the word is typed and deleted, the count under the keys', evaluate: TYPING, expected: TYPING_EXPECTED }]
};
