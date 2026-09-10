/* NO `order` EXPORT, deliberately -- see routes.mjs: that field belongs to the
   original 25 files only, and anything added since sorts after them by
   filename. */

/**
 * THE TWO CLASS TOOLS AT REST, AND THE LIVE NOTICE MOVING THEIR CHIPS.
 *
 * `/dev/classroom-tools` mounts the REAL `HallPass` and `SongQueue` in `tool`
 * mode -- a 44px trigger carrying a glyph, a word and a status chip, with the
 * card folded into a native dialog behind it -- in the student projection and
 * the manager projection, inside the same `.cr-root` room and `.class-tools`
 * row the section layout renders. At rest the dialogs are ABSENT (mounted only
 * while open), so a class page pays nothing for two cards nobody has opened.
 *
 * THE CLAIM NO STATIC PAGE CAN SETTLE IS THE LIVE ONE. The four mounts share
 * one in-memory live bus; the page's own controls write to the fixture and
 * announce a topic, the way a fifth browser would, and NOTHING tells any
 * mount to refresh. So the prepare steps are the mechanism under test: a
 * click on "A classmate takes the pass" is waited on UNTIL the student's
 * hall-pass chip reads "Taken" -- a predicate the page cannot satisfy at rest,
 * and one that only a notice reaching the component, debouncing, and re-asking
 * its transport can produce (the poll is 45s and this run is not). The load
 * counters then say it was ONE re-ask per subscribed mount, not a poll and not
 * a storm.
 *
 * WHAT A STUDENT SEES IS ASSERTED IN BOTH DIRECTIONS: the student's chip
 * must read "Taken" and must NOT carry the classmate's name, while the
 * manager's chip on the same page, from the same notice, must.
 */
const CHIP = (projection, tool) =>
	`[data-projection="${projection}"] [data-testid="${tool}-tool-chip"]`;

const TEXT = (selector) =>
	`document.querySelector('${selector}')?.textContent.trim()`;

export default {
	path: '/dev/classroom-tools',
	label: 'Class tools: two 44px triggers with live chips, no dialog at rest, the notice moves the chips',
	prepare: [
		/* A CLASSMATE TAKES THE PASS. The predicate is the student's chip
		   reading "Taken", which is false at rest and true only once the
		   notice has re-asked the transport. The 250ms debounce sits inside
		   the default click gap. */
		{
			click: '[data-testid="announce-hall-pass"]',
			until: `() => ${TEXT(CHIP('student', 'hall-pass'))} === 'Taken'`
		},
		/* THE TEACHER APPROVES SAM'S SONG. Same shape: the student's music chip
		   moves from "1 waiting" to "Approved" with nobody pressing the tool. */
		{
			click: '[data-testid="announce-song-queue"]',
			until: `() => ${TEXT(CHIP('student', 'song-queue'))} === 'Approved'`
		}
	],
	presence: [
		/* THE ROOM. A `.cr-root` with no stylesheet is a class that paints
		   nothing; the harness imports classroom.css and this row says the
		   wrapper actually mounted. */
		{ selector: '.cr-root', label: 'the classroom room', expectPresent: 1, maxPresent: 1 },
		{ selector: '.class-tools[data-testid="class-tools"]', label: "the tools row, one per projection, wearing the layout's testid", expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="hall-pass-tool"]', label: 'hall pass triggers (student + manager)', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '[data-testid="song-queue-tool"]', label: 'music triggers (student + manager)', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		/* EVERY TRIGGER CARRIES A VISIBLE WORD, not only a glyph. */
		{ selector: '.ctool-trigger .ctool-word', label: 'the word on every trigger', expectPresent: 4, maxPresent: 4, expectVisible: 4, maxVisible: 4 },
		{ selector: '.ctool-trigger[aria-haspopup="dialog"][aria-expanded="false"]', label: 'every trigger announces a dialog and is shut', expectPresent: 4, maxPresent: 4 },
		/* NO DIALOG AND NO CARD AT REST. The dialog is mounted only while open,
		   so this is a structural absence -- and the positive control for it is
		   the `?open=` spec beside this one, where both count 1. */
		{ selector: '.ctool-dialog', label: 'dialogs at rest (none: mounted only while open)', expectPresent: 0 },
		{ selector: '[data-testid="hall-pass"], [data-testid="song-queue"]', label: 'cards at rest (none: the card lives inside the dialog)', expectPresent: 0 },
		/* THE LIVE STATUS IS READABLE OFF THE ROOT. The memory bus answers
		   `live` at once; a real channel reaches it within a round trip. */
		{ selector: '[data-testid="hall-pass-tool-root"][data-live="live"], [data-testid="song-queue-tool-root"][data-live="live"]', label: 'every tool root reports the bus status', expectPresent: 4, maxPresent: 4 },
		/* AND THE STALLED SENTENCE IS NOT ON A LIVE PAGE, in either of its two
		   places (beneath the trigger, and inside the card). Its presence half
		   is the DOM test, which hands a component a bus that reports `stalled`. */
		{ selector: '[data-testid="hall-pass-tool-live"], [data-testid="song-queue-tool-live"], [data-testid="hall-pass-live"], [data-testid="song-queue-live"]', label: 'the paused sentence (absent: the bus is live)', expectPresent: 0 }
	],
	contrast: [
		/* THE CHIPS, AFTER THE NOTICES: teal on the trigger's own plate. Worst
		   of all matches, per projection so a room does not fold into one
		   number. */
		{ selector: CHIP('student', 'hall-pass'), label: "student's hall pass chip (Taken)", min: 4.5 },
		{ selector: CHIP('manager', 'hall-pass'), label: "manager's hall pass chip (1 out · name)", min: 4.5 },
		{ selector: CHIP('student', 'song-queue'), label: "student's music chip (Approved)", min: 4.5 },
		{ selector: CHIP('manager', 'song-queue'), label: "manager's music chip (Queue empty)", min: 4.5 },
		{ selector: '.ctool-trigger .ctool-word', label: 'the word on the triggers', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="hall-pass-tool"], [data-testid="song-queue-tool"]', label: 'the four triggers (phone-first, 44px)', min: 44 },
		{ selector: '[data-testid="announce-hall-pass"], [data-testid="announce-song-queue"]', label: "the harness's own announce controls", min: 44 }
	],
	textContains: [
		/* BOTH DIRECTIONS OF THE DISCLOSURE, ON ONE PAGE FROM ONE NOTICE. */
		{ selector: CHIP('student', 'hall-pass'), label: "the student's chip says taken and names nobody", must: ['Taken'], mustNot: ['Ana', 'Reyes', 'out'] },
		{ selector: CHIP('manager', 'hall-pass'), label: "the manager's chip names who is out", must: ['1 out', 'Ana Reyes'] },
		{ selector: CHIP('student', 'song-queue'), label: "the student's music chip reads Approved", must: ['Approved'], mustNot: ['waiting'] },
		{ selector: CHIP('manager', 'song-queue'), label: "the manager's music chip reads Queue empty", must: ['Queue empty'] }
	],
	orderResult: [
		{
			/* ONE RE-ASK PER SUBSCRIBED MOUNT PER NOTICE, read off the harness's
			   own load counters: two notices, four mounts, each mount listening
			   for its own topic only -- so every counter is exactly 1. A 0 is a
			   notice that never reached the component; a 2 is either the other
			   topic leaking through or the debounce not folding. */
			evaluate: `() => ['student-hall', 'manager-hall', 'student-song', 'manager-song']
				.map((k) => document.querySelector('[data-testid="loads-' + k + '"]').textContent.trim())`,
			expected: ['student-hall loads 1', 'manager-hall loads 1', 'student-song loads 1', 'manager-song loads 1'],
			label: 'each notice re-asked exactly the mounts listening for its topic, once'
		},
		{
			/* THE PAGE'S OWN ANNOUNCES, AND NOTHING FROM THE TOOLS: no tool was
			   pressed, so no tool announced. */
			evaluate: `() => [document.querySelector('[data-testid="announced"]').textContent.trim()]`,
			expected: ['announced 2: hall-pass, song-queue'],
			label: 'two announces went over the bus, both from the page'
		}
	]
};
