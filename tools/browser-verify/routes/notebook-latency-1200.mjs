import { IGNORE_PHOTO_PROXY, TYPE_IN_COMPOSER, WAIT_AUTOPICK, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * WORDS TYPED WHILE AN AUTOSAVE IS IN FLIGHT ARE WRITTEN TOO, AND "Saved" IS
 * NEVER SHOWN OVER WORDS THE SERVER DOES NOT HOLD (ledger 0298 review).
 *
 * Every note write in the harness waits 1200ms here (`?latency=1200`), which
 * is a slow school connection, not an exotic one. The composer's autosave
 * effect used to call `markDirty` only when "is anything due" flipped from
 * false to true -- and it stays true through continuous typing -- so the
 * first write went out, the student kept typing while it was in flight, the
 * write landed and nothing ever marked the machine dirty again. Measured
 * before the fix: one create, one edit, then a whole further paragraph never
 * written while the indicator read "Saved". A create in flight had a second
 * hole of its own: it advanced the baseline to the words on screen when the
 * answer came back, marking everything typed during the round trip as
 * acknowledged without sending it.
 *
 * READ OFF THE HARNESS'S OWN STORE, never the indicator alone: each note
 * write logs the tail of what it left the store holding (`-> holds`), so the
 * last one has to end with the last words typed -- which were typed DURING
 * the previous write -- and no draft-mirror slot may remain for this viewer
 * (a slot exists exactly while there is writing the server has not
 * acknowledged).
 */
const LAST = 'Typed while it was saving.';
const DURING_CREATE = 'More during the create.';

/* Settles on Saved for a full second running, then asks the harness store
   what the last write left it holding. */
const SETTLED_HOLDING = (words) => `async () => {
	let steady = 0;
	for (let i = 0; i < 150 && steady < 10; i++) {
		await new Promise((r) => setTimeout(r, 100));
		steady = document.querySelector('[data-testid="nb-compose"] .save-ind.saved') ? steady + 1 : 0;
	}
	if (steady < 10) throw new Error('the save state never settled on Saved');
	const log = (document.querySelector('[data-testid="dev-log"]')?.textContent ?? '').split('\\n');
	const held = log.filter((l) => l.includes('-> holds')).pop() ?? '';
	if (!held.includes(${JSON.stringify(words)})) throw new Error('Saved, but the store holds: ' + held.trim());
	return 'settled on Saved, and the store holds the last words typed';
}`;

export default {
	path: '/dev/notebook?latency=1200',
	label: 'Notebook composer on a slow connection: words typed during an autosave are written too, and Saved means saved',
	prepare: [
		WAIT_AUTOPICK,
		WAIT_EDITOR,
		/* THE CREATE: words typed while the draft is being made. */
		{
			evaluate: `async () => {
				const input = document.querySelector('[data-testid="nb-compose"] [data-testid="note-editor-input"]');
				input.focus();
				document.execCommand('insertText', false, 'First words of the entry.');
				await new Promise((r) => setTimeout(r, 1000));
				document.execCommand('insertText', false, ' ${DURING_CREATE}');
				return 'typed during the create';
			}`
		},
		{ evaluate: SETTLED_HOLDING(DURING_CREATE) },
		/* THE EDIT: the same, one write later. */
		{
			evaluate: `async () => {
				const input = document.querySelector('[data-testid="nb-compose"] [data-testid="note-editor-input"]');
				input.focus();
				document.execCommand('insertText', false, ' Then the second sentence.');
				// Past the 800ms debounce, so that write is on the wire (1200ms)...
				await new Promise((r) => setTimeout(r, 1000));
				const during = document.querySelector('[data-testid="nb-compose"] .save-ind')?.className ?? '';
				// ...and these words arrive while it is.
				document.execCommand('insertText', false, ' ${LAST}');
				return 'typed during the flight; the indicator then read: ' + (/writing/.test(during) ? 'writing' : during);
			}`
		},
		{ evaluate: SETTLED_HOLDING(LAST) }
	],
	presence: [
		{ selector: '[data-testid="nb-compose"] .save-ind.saved', label: 'the one save state, settled on Saved', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'the store holds the words typed during the write, and no unsent writing is left in the mirror',
			evaluate: `() => {
				const log = (document.querySelector('[data-testid="dev-log"]')?.textContent ?? '').split('\\n');
				const held = log.filter((l) => l.includes('-> holds')).pop() ?? '';
				const writes = log.filter((l) => /POST \\/api\\/notebook\\/(note|add-note|edit-note)/.test(l)).length;
				const slots = Object.keys(localStorage).filter((k) => k.startsWith('notebook_draft_mirror:u-self:'));
				return [
					held.includes(${JSON.stringify(LAST)}) ? 'the last write holds the words typed during the one before it' : 'LAST WRITE HOLDS ' + held.trim(),
					writes >= 3 ? 'a create and at least two edits went out' : 'ONLY ' + writes + ' WRITE(S)',
					slots.length === 0 ? 'no unsent writing left in the mirror' : 'MIRROR STILL HOLDS ' + JSON.stringify(slots)
				];
			}`,
			expected: [
				'the last write holds the words typed during the one before it',
				'a create and at least two edits went out',
				'no unsent writing left in the mirror'
			]
		}
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
