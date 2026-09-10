/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE STUDENT'S HALL PASS DIALOG, OPEN ON LOAD. `?open=hall-pass` presses the
 * real trigger once the page mounts, so the dialog under measurement is the
 * one a finger opens. This is the POSITIVE CONTROL for the at-rest spec's two
 * absence rows (no dialog, no card): here both count exactly 1, with the same
 * `data-testid`s the plain card has always carried.
 *
 * WHAT IS MEASURED IN A MODAL: only what is inside it. Everything behind the
 * backdrop is inert and a centre hit-test on a trigger lands on the backdrop,
 * which is correct and not a finding -- so the tap rows here name the Close
 * control and the card's own control, and the contrast rows name text in the
 * panel.
 */
const IN_DIALOG = '.ctool-dialog[open]';

export default {
	path: '/dev/classroom-tools?open=hall-pass',
	label: "Class tools: the student's hall pass dialog open, same card, Close 44px, focus inside, Escape closes",
	presence: [
		{ selector: IN_DIALOG, label: 'exactly one open dialog', expectPresent: 1, maxPresent: 1 },
		{ selector: `${IN_DIALOG}[aria-label]`, label: 'the dialog carries an aria-label', expectPresent: 1, maxPresent: 1 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass"][data-scope="student"]`, label: "the student's card, inside the dialog", expectPresent: 1, maxPresent: 1 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-status"]`, label: 'the status line', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-open"]`, label: "the student's Sign out control", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-tool-close"]`, label: 'the Close control at the top', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE STUDENT'S DIALOG HOLDS NO MANAGER ELEMENT. The presence half is
		   the `scope=manager` spec, where both count 1. */
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-override"], ${IN_DIALOG} [data-testid="hall-pass-history"]`, label: "manager-only elements in the student's dialog (none)", expectPresent: 0 },
		{ selector: '[data-projection="student"] [data-testid="hall-pass-tool"][aria-expanded="true"]', label: 'the trigger that opened it reads expanded', expectPresent: 1, maxPresent: 1 },
		{ selector: '.ctool-trigger[aria-expanded="true"]', label: 'and it is the only expanded trigger', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-status"]`, label: 'status line in the dialog', min: 4.5 },
		{ selector: `${IN_DIALOG} .ctool-title`, label: 'the dialog title', min: 4.5 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-tool-close"]`, label: 'the Close control', min: 4.5 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-usage"]`, label: 'the usage line', min: 4.5 }
	],
	tapTargets: [
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-tool-close"]`, label: 'Close (44px)', min: 44 },
		{ selector: `${IN_DIALOG} [data-testid="hall-pass-open"]`, label: 'Sign out (44px)', min: 44 }
	],
	orderResult: [
		{
			/* FOCUS IS INSIDE THE DIALOG, ON THE CARD'S OWN CONTROL. */
			evaluate: `() => {
				const a = document.activeElement;
				return [!!a?.closest('.ctool-dialog[open]'), a?.getAttribute('data-testid') ?? 'none'];
			}`,
			expected: [true, 'hall-pass-open'],
			label: 'focus landed inside the dialog, on Sign out'
		},
		{
			/* THE DIALOG TAKES NO ROOM IN THE ROW: the trigger's box is the same
			   with the dialog open as the at-rest spec measures, so opening
			   one shifts nothing on the page. Read as the tools row height vs
			   the trigger height -- a dialog that had rendered in flow would
			   have grown the row. */
			evaluate: `() => {
				const row = document.querySelector('[data-projection="student"] .class-tools').getBoundingClientRect();
				const trig = document.querySelector('[data-projection="student"] [data-testid="hall-pass-tool"]').getBoundingClientRect();
				const dlg = document.querySelector('.ctool-dialog[open]');
				return [getComputedStyle(dlg).position, row.height <= trig.height * 2 + 24];
			}`,
			expected: ['fixed', true],
			label: 'the dialog is out of flow and the row did not grow to hold it'
		},
		{
			/* ESCAPE CLOSES IT AND FOCUS RETURNS TO THE TRIGGER. Destructive on
			   purpose and therefore LAST: everything above measured the open
			   dialog. */
			evaluate: `() => {
				const dlg = document.querySelector('.ctool-dialog[open]');
				dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				return new Promise((res) => setTimeout(() => res([
					document.querySelectorAll('.ctool-dialog').length,
					document.activeElement?.getAttribute('data-testid') ?? 'none',
					document.querySelector('[data-projection="student"] [data-testid="hall-pass-tool"]').getAttribute('aria-expanded')
				]), 80));
			}`,
			expected: [0, 'hall-pass-tool', 'false'],
			label: 'Escape unmounts the dialog and hands focus back to the trigger'
		}
	]
};
