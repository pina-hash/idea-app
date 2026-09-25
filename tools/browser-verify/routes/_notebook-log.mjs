/**
 * Shared by the notebook route specs since the student's first screen became
 * their own log (ledger 0298, R32): one box at the top of the feed that files
 * itself, with every filing choice behind "Filed to ..., Change". A leading
 * underscore keeps the loader from reading this as a route.
 */

/* The composer files to the check-in nearest today on its own, a beat after
   the first paint (the measured bracket is in notebook.mjs). The check-in
   buttons are in the DOM, hidden behind "Filed to", from the first frame, so
   this is a DOM signal and needs nothing opened. */
export const WAIT_AUTOPICK = {
	waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
	timeoutMs: 15_000
};

/* The editor is a separate download; the box has nothing to type into until
   it lands. */
export const WAIT_EDITOR = {
	waitFor: '() => !!document.querySelector(\'[data-testid="nb-compose"] [data-testid="note-editor-input"]\')',
	timeoutMs: 20_000
};

/* "Filed to ..., Change", pressed with a real click, so the check-in picks,
   the title, the class and the folder are on screen to be measured. */
export const OPEN_FILING = {
	click: '[data-testid="nb-filing-toggle"]',
	until: '() => document.querySelector("[data-testid=\'nb-filing-toggle\']").getAttribute("aria-expanded") === "true"'
};

/* The words the composer and the head carry now, on whatever ground they sit. */
export const COMPOSER_CONTRAST = [
	{ selector: '[data-testid="nb-filed-to"]', label: 'where the next save goes (--text-1)', min: 4.5 },
	{ selector: '[data-testid="nb-filing-toggle"] .disc-label', label: '"Filed to" (the trigger word)', min: 4.5 },
	{ selector: '[data-testid="nb-filing-toggle"] .disc-action', label: '"Change" (the trigger action)', min: 4.5 },
	{ selector: '.ci-state', label: 'check-in state words, head and composer (tone inks)', min: 4.5 },
	{ selector: '[data-testid="nb-templates"] .template', label: 'template buttons (--text-2)', min: 4.5 }
];

/* Types into the composer's own editor the way a keyboard does (`insertText`
   on the focused contenteditable), retrying until the editor holds the words. */
export const TYPE_IN_COMPOSER = (text) => `async () => {
	for (let attempt = 1; attempt <= 12; attempt++) {
		const input = document.querySelector('[data-testid="nb-compose"] [data-testid="note-editor-input"]');
		if (input) {
			input.focus();
			document.execCommand('insertText', false, ${JSON.stringify(text)});
			await new Promise((r) => setTimeout(r, 150));
			if ((input.textContent || '').includes(${JSON.stringify(text)})) return 'typed on attempt ' + attempt;
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error('the composer editor never took the text');
}`;

/* The fixture photos have no bytes behind the real proxy, so their thumbnails 401. */
export const IGNORE_PHOTO_PROXY = ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/'];
