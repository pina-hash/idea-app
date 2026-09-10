/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE STUDENT'S MUSIC DIALOG, OPEN ON LOAD (`?open=song-queue`). The same
 * card `/dev/song-queue` has always measured, inside the native dialog: the
 * link field, the note, the Request control, the approved list with no name
 * on it, and the student's own requests. The backdrop press closes it, which
 * is the third close path (Escape is the hall pass spec's, Close is a real
 * click here) -- and it is `pointerdown` on the dialog element itself, so a
 * press that lands on the panel does nothing.
 */
const IN_DIALOG = '.ctool-dialog[open]';

export default {
	path: '/dev/classroom-tools?open=song-queue',
	label: "Class tools: the student's music dialog open, the form at 44px, a backdrop press closes it",
	presence: [
		{ selector: IN_DIALOG, label: 'exactly one open dialog', expectPresent: 1, maxPresent: 1 },
		{ selector: `${IN_DIALOG} [data-testid="song-queue"][data-scope="student"]`, label: "the student's card, inside the dialog", expectPresent: 1, maxPresent: 1 },
		{ selector: `${IN_DIALOG} [data-testid="song-queue-url"]`, label: 'the link field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${IN_DIALOG} [data-testid="song-queue-send"]`, label: 'the Request control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${IN_DIALOG} [data-testid="song-queue-approved"] li`, label: 'the approved list (one row, a classmate\'s, with no name)', expectPresent: 1, maxPresent: 1 },
		/* NO MANAGER ELEMENT IN A STUDENT'S DIALOG, and no name anywhere in
		   the card: `.sq-who` is the manager-only name span. */
		{ selector: `${IN_DIALOG} [data-testid="song-queue-pending"], ${IN_DIALOG} [data-testid="song-queue-approve"], ${IN_DIALOG} .sq-who`, label: "manager-only elements in the student's dialog (none)", expectPresent: 0 },
		{ selector: '[data-projection="student"] [data-testid="song-queue-tool"][aria-expanded="true"]', label: 'the trigger that opened it reads expanded', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: `${IN_DIALOG} .sq-note`, label: 'the sentence saying what asking costs', min: 4.5 },
		{ selector: `${IN_DIALOG} .sq-label`, label: 'the field labels', min: 4.5 },
		{ selector: `${IN_DIALOG} [data-testid="song-queue-count"]`, label: 'the waiting count', min: 4.5 },
		{ selector: `${IN_DIALOG} .ctool-title`, label: 'the dialog title', min: 4.5 }
	],
	tapTargets: [
		{ selector: `${IN_DIALOG} [data-testid="song-queue-url"], ${IN_DIALOG} [data-testid="song-queue-note"]`, label: 'the two fields (44px)', min: 44 },
		{ selector: `${IN_DIALOG} [data-testid="song-queue-send"]`, label: 'Request (44px)', min: 44 },
		{ selector: `${IN_DIALOG} [data-testid="song-queue-tool-close"]`, label: 'Close (44px)', min: 44 }
	],
	textContains: [
		{ selector: `${IN_DIALOG} [data-testid="song-queue-approved"]`, label: "a classmate's approved song carries no name", must: ['open.example.org'], mustNot: ['Ben', 'Okonkwo', 'Ana'] }
	],
	orderResult: [
		{
			evaluate: `() => [document.activeElement?.getAttribute('data-testid') ?? 'none']`,
			expected: ['song-queue-url'],
			label: 'focus landed on the link field'
		},
		{
			/* A PRESS ON THE PANEL DOES NOTHING; A PRESS ON THE BACKDROP CLOSES.
			   Both dispatched as pointerdown, the first at the panel and the
			   second at the dialog element itself (which is what a backdrop
			   press targets). Destructive, therefore last. */
			evaluate: `() => {
				const dlg = document.querySelector('.ctool-dialog[open]');
				const panel = dlg.querySelector('.ctool-panel');
				panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
				const afterPanel = document.querySelectorAll('.ctool-dialog[open]').length;
				dlg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
				return new Promise((res) => setTimeout(() => res([
					afterPanel,
					document.querySelectorAll('.ctool-dialog').length,
					document.activeElement?.getAttribute('data-testid') ?? 'none'
				]), 80));
			}`,
			expected: [1, 0, 'song-queue-tool'],
			label: 'a panel press keeps it open, a backdrop press closes it and returns focus'
		}
	]
};
