/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE STALLED CHANNEL, WITH EVERY DIALOG SHUT. `?live=stalled` makes the
 * harness's bus report `stalled` to all four mounts, which is the one status
 * the in-memory bus never produces on its own and the one that earns a
 * sentence: "Live updates paused, still checking every N seconds."
 *
 * WHY THIS STATE HAS A SPEC OF ITS OWN. In tool mode the card lives inside the
 * dialog and the dialog is mounted only while open, so a sentence that lived
 * only in the card was on screen exactly never while a student was reading the
 * chip. The sentence now also sits BENEATH THE TRIGGER, in the `.ctool` column,
 * and this spec measures it there: present and visible on all four tools with
 * zero dialogs open, legible on the page plate, below its own trigger rather
 * than beside it, and inside the row (no horizontal overflow at either width).
 * The card's own copy is correctly ABSENT here -- there is no card -- and
 * present again only once a dialog opens, which the DOM test asserts.
 *
 * The at-rest spec is the negative control: the same selectors count 0 there
 * because that bus is `live`.
 */
const SENTENCE = '[data-testid="hall-pass-tool-live"], [data-testid="song-queue-tool-live"]';

export default {
	path: '/dev/classroom-tools?live=stalled',
	label: 'Class tools: a stalled channel shows one quiet sentence beneath every trigger, dialogs shut',
	presence: [
		{ selector: '[data-testid="hall-pass-tool-root"][data-live="stalled"], [data-testid="song-queue-tool-root"][data-live="stalled"]', label: 'every tool root reports stalled', expectPresent: 4, maxPresent: 4 },
		{ selector: SENTENCE, label: 'the paused sentence beneath each trigger (four tools)', expectPresent: 4, maxPresent: 4, expectVisible: 4, maxVisible: 4 },
		/* NO DIALOG, SO NO CARD AND NO CARD COPY OF THE SENTENCE: the trigger-side
		   copy is the whole of what is on screen. */
		{ selector: '.ctool-dialog', label: 'dialogs (none: all shut)', expectPresent: 0 },
		{ selector: '[data-testid="hall-pass-live"], [data-testid="song-queue-live"]', label: "the card's own copy (none: no card is mounted)", expectPresent: 0 },
		{ selector: '.ctool-trigger[aria-expanded="false"]', label: 'the four triggers, shut', expectPresent: 4, maxPresent: 4, expectVisible: 4, maxVisible: 4 }
	],
	contrast: [
		{ selector: SENTENCE, label: 'the paused sentence on the page plate', min: 4.5 },
		{ selector: '.ctool-trigger .ctool-word', label: 'the word on the triggers, unchanged by the sentence', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="hall-pass-tool"], [data-testid="song-queue-tool"]', label: 'the four triggers still 44px with a sentence beneath', min: 44 }
	],
	textContains: [
		{ selector: '[data-projection="student"] [data-testid="hall-pass-tool-live"]', label: 'the hall pass names its own poll', must: ['Live updates paused', 'every 45 seconds'], mustNot: ['90'] },
		{ selector: '[data-projection="student"] [data-testid="song-queue-tool-live"]', label: 'the music tool names its own poll', must: ['Live updates paused', 'every 90 seconds'], mustNot: ['45'] }
	],
	orderResult: [
		{
			/* BENEATH, NOT BESIDE: `.ctool` is a column, so the sentence's top is
			   at or below its trigger's bottom, and its box stays inside the
			   tool root's width. Measured for all four, as a FLAT list (a nested
			   array is compared element-wise as strings by the harness, which
			   reports a matching pair as a miss): per tool, "below" then
			   "inside", in document order. */
			evaluate: `() => Array.from(document.querySelectorAll('.ctool')).flatMap((root) => {
				const t = root.querySelector('.ctool-trigger').getBoundingClientRect();
				const p = root.querySelector('.ctool-live').getBoundingClientRect();
				const r = root.getBoundingClientRect();
				return [p.top >= t.bottom - 0.5, p.left >= r.left - 0.5 && p.right <= r.right + 0.5];
			})`,
			expected: [true, true, true, true, true, true, true, true],
			label: 'the sentence sits below its trigger and inside the tool root, on all four'
		}
	]
};
