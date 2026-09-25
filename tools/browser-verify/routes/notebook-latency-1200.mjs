/**
 * WORDS TYPED WHILE AN AUTOSAVE IS IN FLIGHT ARE WRITTEN TOO, AND "Saved" IS
 * NEVER SHOWN OVER WORDS THE SERVER DOES NOT HOLD (ledger 0298).
 *
 * Every note write in the harness waits 1200ms here (`?latency=1200`), which
 * is a slow school connection, not an exotic one. Two holes, both in
 * `NotebookView.svelte`, both found by the ledger 0298 notebook review:
 *
 *   1. The autosave effect read only the boolean `autosaveDue`, which stays
 *      true through continuous typing, so `SaveState.markDirty` ran once: the
 *      first write went out, the student kept typing while it travelled, it
 *      landed, and nothing marked the machine dirty again -- a paragraph sat
 *      unsaved while the indicator read "Saved".
 *   2. The autosave's CREATE advanced the baseline to the words ON SCREEN when
 *      its answer came back, so everything typed during the round trip was
 *      counted as acknowledged without ever being sent.
 *
 * THE TYPING WAITS ON THE WRITE ITSELF, NEVER ON A CONSTANT. Each "during"
 * step types, polls until the indicator reads `writing` (the write is on the
 * wire), and only then types again -- and throws if it could not, because
 * words typed BEFORE the write left would be carried by it and the check would
 * pass on the broken code for the wrong reason.
 *
 * READ OFF THE HARNESS'S OWN STORE, never the indicator alone: each note write
 * logs the tail of what it left the store holding (`-> holds`), so the last
 * one has to end with the last words typed, and no draft-mirror slot may
 * remain for this viewer (a slot exists exactly while there is writing the
 * server has not acknowledged).
 */
const DURING_CREATE = 'More during the create.';
const LAST = 'Typed while it was saving.';

/* The composer files to the check-in nearest today on its own, a beat after
   the first paint (the bracket is measured in notebook.mjs). Waited for so the
   filing cannot move under the typing. */
const WAIT_AUTOPICK = {
	waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
	timeoutMs: 15_000
};

/* The editor is a separate download; the box has nothing to type into until
   it lands. */
const WAIT_EDITOR = {
	waitFor: '() => !!document.querySelector(\'[data-testid="nb-compose"] [data-testid="note-editor-input"]\')',
	timeoutMs: 20_000
};

/* Types `first`, waits until that write is on the wire, then types `during`
   while it still is. */
const TYPE_DURING_WRITE = (first, during) => `async () => {
	const input = document.querySelector('[data-testid="nb-compose"] [data-testid="note-editor-input"]');
	const ind = () => document.querySelector('[data-testid="nb-compose"] .save-ind')?.className ?? '(no indicator)';
	input.focus();
	document.execCommand('insertText', false, ${JSON.stringify(first)});
	if (!(input.textContent || '').includes(${JSON.stringify(first.trim())})) throw new Error('the editor did not take the first words');
	const t0 = performance.now();
	while (!/\\bwriting\\b/.test(ind())) {
		if (performance.now() - t0 > 5000) throw new Error('no write went out within 5s; the indicator read ' + ind());
		await new Promise((r) => setTimeout(r, 25));
	}
	const departed = Math.round(performance.now() - t0);
	await new Promise((r) => setTimeout(r, 150));
	if (!/\\bwriting\\b/.test(ind())) throw new Error('the write landed before the second words could be typed; the indicator read ' + ind());
	input.focus();
	document.execCommand('insertText', false, ${JSON.stringify(' ' + during)});
	if (!(input.textContent || '').includes(${JSON.stringify(during)})) throw new Error('the editor did not take the words typed during the write');
	return 'write departed ' + departed + 'ms after the first words; typed during it (indicator: ' + ind().replace('save-ind ', '') + ')';
}`;

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
		{ evaluate: TYPE_DURING_WRITE('First words of the entry.', DURING_CREATE) },
		{ evaluate: SETTLED_HOLDING(DURING_CREATE) },
		/* THE EDIT: the same, one write later. */
		{ evaluate: TYPE_DURING_WRITE(' Then the second sentence.', LAST) },
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
				const writes = log.filter((l) => /POST \\/api\\/notebook\\/(note|add-note|edit-note) /.test(l)).length;
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
	/* The fixture photos have no bytes behind the real proxy, so their
	   thumbnails 401 (notebook.mjs ignores the same line). */
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
