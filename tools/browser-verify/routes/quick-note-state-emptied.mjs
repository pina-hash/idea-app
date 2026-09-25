import { IGNORE_FIXTURE_PHOTO, OPEN, TYPE } from './_quick-note.mjs';

/**
 * SAVE WITH THE BOX EMPTIED NEVER SAYS "SAVED" (ledger 0298 review). A note
 * cannot be stored empty, so once a quick note's draft exists, clearing the
 * box and pressing Save changes nothing on the server. It used to report
 * "Saved to your notebook Inbox" all the same, which tells a student who
 * cleared the box that the note is gone. It now says the draft still holds
 * what was last saved, and the stored draft is read to show that is true.
 */
export default {
	path: '/dev/quick-note?state=emptied',
	label: 'Quick note: Save with the box emptied says the draft is unchanged instead of claiming a save',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"quicknote-menu-item\\"]")', timeoutMs: 20000 },
		{ evaluate: OPEN },
		{ evaluate: TYPE('Keep me') },
		{
			waitFor: '() => /new-1 draft: Keep me$/.test((document.querySelector("[data-store-id=\\"new-1\\"]")?.textContent ?? "").trim())',
			timeoutMs: 15000
		},
		{
			evaluate: `async () => {
				const input = document.querySelector('[data-testid="qn-panel"] [data-testid="note-editor-input"]');
				input.focus();
				document.execCommand('selectAll');
				document.execCommand('delete');
				await new Promise((r) => setTimeout(r, 200));
				return 'box now reads ' + JSON.stringify(input.textContent);
			}`
		},
		{
			click: '[data-testid="qn-save"]',
			until: '() => !!document.querySelector("[data-testid=\\"qn-error\\"]")',
			attempts: 8,
			waitMs: 250
		},
		{ evaluate: '() => new Promise((r) => setTimeout(() => r("waited past an autosave"), 1500))' }
	],
	presence: [
		{ selector: '[data-testid="qn-error"]', label: 'the sentence saying the draft is unchanged', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="qn-done"]', label: 'no saved confirmation (the error above is the positive control)', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="qn-error"]', label: 'it says the box is empty and the draft still holds the note', must: ['empty', 'still holds'], mustNot: ['Saved to'] }
	],
	contrast: [{ selector: '[data-testid="qn-error"]', label: 'the empty-box sentence', min: 4.5 }],
	orderResult: [
		{
			label: 'the stored draft still holds what was saved',
			evaluate: `() => [(document.querySelector('[data-store-id="new-1"]')?.textContent ?? '').trim()]`,
			expected: ['new-1 draft: Keep me']
		}
	]
};
