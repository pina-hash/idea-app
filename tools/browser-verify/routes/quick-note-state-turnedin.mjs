import { IGNORE_FIXTURE_PHOTO, OPEN, TYPE } from './_quick-note.mjs';

/**
 * A QUICK NOTE NEVER AUTOSAVES INTO A DRAFT THAT HAS BEEN TURNED IN (ledger
 * 0298 review).
 *
 * The quick note keeps writing into the same draft until Save, and that draft
 * is also an entry in the notebook's own list, with a Turn in button. This
 * spec types a note ("Before"), waits for its draft, opens that entry from the
 * list and turns it in with its real Turn in button, then types more
 * (" After") into the quick note, which is still open.
 *
 * WHAT MUST HOLD: the turned-in entry still holds exactly what was turned in,
 * the new words go into a NEW private draft (which carries the whole note), no
 * edit was ever sent to the turned-in entry's note, and the panel says why.
 * Before the fix the autosave edited the turned-in entry: the words typed
 * afterwards became its current content, in a record the teacher can read.
 */
export default {
	path: '/dev/quick-note?state=turnedin',
	label: 'Quick note: writing after its draft was turned in goes to a new draft, never into the turned-in entry',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"quicknote-menu-item\\"]")', timeoutMs: 20000 },
		{ evaluate: OPEN },
		{ evaluate: TYPE('Before') },
		{
			waitFor: '() => /new-1 draft: Before$/.test((document.querySelector("[data-store-id=\\"new-1\\"]")?.textContent ?? "").trim())',
			timeoutMs: 15000
		},
		/* Close the panel, open the entry from the list (the pane beside it, or in
		   place on a phone), turn it in with its own button, and reopen the Note
		   panel, which still holds the note and the draft it was writing into. */
		{
			evaluate: `async () => {
				const wait = (ms) => new Promise((r) => setTimeout(r, ms));
				document.querySelector('[data-testid="qn-close"]').click();
				await wait(200);
				for (let i = 0; i < 20 && !document.querySelector('[data-testid="entry-turn-in"]'); i++) {
					const row = document.querySelector('[data-entry-id="new-1"]');
					const opener = row && (row.querySelector('[data-testid="entry-open"]') || row.querySelector('[data-testid="entry-disclosure"]'));
					if (opener && i % 5 === 0) opener.click();
					await wait(200);
				}
				const turnIn = document.querySelector('[data-testid="entry-turn-in"]');
				if (!turnIn) throw new Error('no Turn in button appeared for the quick note draft');
				turnIn.click();
				for (let i = 0; i < 30; i++) {
					if (document.querySelector('[data-store-id="new-1"]')?.dataset.submitted === 'yes') return "turned in with its own button";
					await wait(200);
				}
				throw new Error('the draft was never turned in');
			}`
		},
		{ evaluate: OPEN },
		{
			evaluate: `async () => {
				const input = document.querySelector('[data-testid="qn-panel"] [data-testid="note-editor-input"]');
				input.focus();
				const sel = window.getSelection();
				sel.selectAllChildren(input);
				sel.collapseToEnd();
				document.execCommand('insertText', false, ' After');
				return 'typed after the turn-in';
			}`
		},
		{
			waitFor: '() => /new-2 draft: Before After$/.test((document.querySelector("[data-store-id=\\"new-2\\"]")?.textContent ?? "").trim())',
			timeoutMs: 15000
		}
	],
	presence: [{ selector: '[data-testid="qn-notice"]', label: 'the sentence saying the note moved to a new draft', expectPresent: 1, expectVisible: 1 }],
	contrast: [{ selector: '[data-testid="qn-notice"]', label: 'the moved-note sentence', min: 4.5 }],
	orderResult: [
		{
			label: 'the turned-in entry is untouched, the words went to a new draft, and no edit reached the turned-in note',
			evaluate: `() => {
				const one = (document.querySelector('[data-store-id="new-1"]')?.textContent ?? '').trim();
				const two = (document.querySelector('[data-store-id="new-2"]')?.textContent ?? '').trim();
				const log = [...document.querySelectorAll('[data-testid="qn-log"] li')].map((li) => li.textContent.trim());
				const notice = document.querySelector('[data-testid="qn-notice"]')?.textContent ?? '';
				return [
					/^new-1 turned-in: Before$/.test(one) ? 'the turned-in entry holds what was turned in' : 'TURNED-IN ENTRY: ' + one,
					/^new-2 draft: Before After$/.test(two) ? 'a new private draft holds the whole note' : 'NEW DRAFT: ' + two,
					log.some((l) => l.includes('note_id="new-1-note"')) ? 'AN EDIT REACHED THE TURNED-IN NOTE' : 'no edit reached the turned-in note',
					/turned in or moved/.test(notice) ? 'the panel says why' : 'NOTICE: ' + notice
				];
			}`,
			expected: [
				'the turned-in entry holds what was turned in',
				'a new private draft holds the whole note',
				'no edit reached the turned-in note',
				'the panel says why'
			]
		}
	]
};
