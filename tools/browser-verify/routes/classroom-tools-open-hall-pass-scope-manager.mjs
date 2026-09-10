/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE INSTRUCTOR'S HALL PASS DIALOG, OPEN ON LOAD (`?open=hall-pass&scope=
 * manager`). The presence half of the student spec's absence rows: the
 * override row and the history are HERE, on the same card markup, because the
 * payload is a manager's. And item TEN: the "Send a student out" `<select>` is
 * the shared `cr-select` -- the redrawn native select in classroom.css -- so
 * its computed `appearance` is `none`, it clears 44px, and its label stays a
 * visible `<label for>` rather than a placeholder option.
 */
const IN_DIALOG = '.ctool-dialog[open]';
const SELECT = `${IN_DIALOG} [data-testid="hall-pass-override-select"]`;

export default {
	path: '/dev/classroom-tools?open=hall-pass&scope=manager',
	label: "Class tools: the instructor's hall pass dialog, the cr-select override picker with its label",
	presence: [
		{ selector: IN_DIALOG, label: 'exactly one open dialog', expectPresent: 1, maxPresent: 1 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass"][data-scope="manager"]`, label: "the manager's card, inside the dialog", expectPresent: 1, maxPresent: 1 },
		/* THE MANAGER-ONLY ELEMENTS, PRESENT: the positive control for the
		   student spec's absence row. */
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-override"]`, label: 'the override row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-history"]`, label: 'the history disclosure', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${SELECT}.cr-select`, label: 'the picker carries cr-select', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${IN_DIALOG} label.hp-override-label[for]`, label: 'its label is a visible <label for>', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* NOBODY IS OUT, so there is no Sign back in and no student Sign out. */
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-open"], ${IN_DIALOG} [data-testid="hall-pass-close"]`, label: 'no open/close control (nobody out, manager cannot open)', expectPresent: 0 }
	],
	contrast: [
		{ selector: SELECT, label: 'the picker text on its own plate', min: 4.5 },
		{ selector: `${IN_DIALOG} .hp-override-label`, label: 'the picker label', min: 4.5 },
		{ selector: `${IN_DIALOG} .hp-override-note`, label: 'the limit sentence under the picker', min: 4.5 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-status"]`, label: 'the status line', min: 4.5 }
	],
	tapTargets: [
		{ selector: SELECT, label: 'the cr-select picker (44px)', min: 44 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-override-go"]`, label: 'Send out (44px)', min: 44 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-tool-close"]`, label: 'Close (44px)', min: 44 }
	],
	orderResult: [
		{
			/* THE SELECT IS THE REDRAWN ONE: computed `appearance: none` is what
			   says the room's stylesheet reached it, and the label's `for`
			   resolves to the picker's own id. */
			evaluate: `() => {
				const s = document.querySelector('.ctool-dialog[open] [data-testid="hall-pass-override-select"]');
				const l = document.querySelector('.ctool-dialog[open] label.hp-override-label');
				return [getComputedStyle(s).appearance, l.getAttribute('for') === s.id, l.textContent.trim()];
			}`,
			expected: ['none', true, 'Send a student out'],
			label: 'cr-select is redrawn (appearance none) and its visible label points at it'
		},
		{
			/* FOCUS: the card's first control for a manager with nobody out is
			   the picker itself. */
			evaluate: `() => [document.activeElement?.getAttribute('data-testid') ?? 'none']`,
			expected: ['hall-pass-override-select'],
			label: 'focus landed on the picker'
		}
	]
};
