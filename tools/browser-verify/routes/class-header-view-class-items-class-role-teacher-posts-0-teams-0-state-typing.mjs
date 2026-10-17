/**
 * TYPING IN THE CLASS SEARCH (ledger 0396, part 7, review round 4 and polish
 * round 1), at 375 and 1440, as a teacher. The field never moves or changes
 * width while somebody types a word and deletes it again, the count of what
 * is shown is a line of its own under the keys, the Videos key the word took
 * away comes back to its own line, and Escape and Clear give the row back as
 * it was (`TYPING`). The student, the no-draft teacher and the videos-first
 * layouts have specs of their own beside this one.
 */
import { IGNORE, READY, TEACHER, TYPING, TYPING_EXPECTED } from './_class-toolbar.mjs';

export default {
	path: `${TEACHER}&state=typing`,
	aliasOf: TEACHER,
	label: 'Typing in the class search moves nothing under the caret',
	ignoreConsole: IGNORE,
	prepare: [READY],
	orderResult: [{ label: 'the field holds still while the word is typed and deleted, the count under the keys', evaluate: TYPING, expected: TYPING_EXPECTED }]
};
