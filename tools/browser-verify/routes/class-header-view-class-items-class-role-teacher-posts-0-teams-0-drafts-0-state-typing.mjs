/**
 * TYPING IN THE CLASS SEARCH AS A TEACHER WITH NO DRAFT (ledger 0396, part 7,
 * polish rounds 1 and 2), at 375 and 1440. On a phone the row at rest is
 * [search kinds] [Videos Select all]. Polish round 1 re-planned the keys after
 * the field while a word hid every video, which gave [search] [kinds Select
 * all]: the kind filter left the field's line on the keystroke that took the
 * Videos key away and came back on the one that returned it. Every key keeps
 * its place now, so the row reads [search kinds] [Select all] while the word
 * is in the box, the field and the kind filter still (`typingProbe`).
 */
import { IGNORE, READY, TEACHER, TYPING_EXPECTED, typingProbe } from './_class-toolbar.mjs';

/** The same claims, and one more: while the word is in the box, the kind filter is still beside the field. */
const TYPING_EXPECTED_KINDS_BESIDE = [
	...TYPING_EXPECTED.slice(0, 7),
	'with the word in the box, the kind filter is still beside the field=true',
	...TYPING_EXPECTED.slice(7)
];

export default {
	path: `${TEACHER}&drafts=0&state=typing`,
	aliasOf: `${TEACHER}&drafts=0`,
	label: 'Typing in the class search moves nothing under the caret (teacher, no draft)',
	ignoreConsole: IGNORE,
	prepare: [READY],
	orderResult: [
		{
			label: 'the field and every key hold still while the word is typed and deleted, the count under the keys, the kind filter beside the field',
			evaluate: typingProbe(true),
			expected: TYPING_EXPECTED_KINDS_BESIDE
		}
	]
};
