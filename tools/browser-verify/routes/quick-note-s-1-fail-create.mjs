import { IGNORE_FIXTURE_PHOTO, OPEN, TYPE } from './_quick-note.mjs';

/**
 * A QUICK NOTE THE SERVER NEVER GOT SURVIVES A RELOAD (ledger 0298). Every note
 * create is refused here (`?fail=create`), so the writing exists only in the
 * box and in the draft mirror (`notebook_draft_mirror:<viewer>:quick`). The page
 * is then thrown away and loaded again -- the state a crashed or discarded tab
 * leaves -- and the quick note must put the words back and try to save them.
 *
 * Read in the order it happened: the mirror slot existed before the reload
 * (the prepare step prints it), the restore sentence is in the reopened panel,
 * the words are back in the editor, and the restored note tried its own save.
 */
const TEXT = 'Deck deflection 4 mm at 2 kg';
const KEY = 'notebook_draft_mirror:dev-quick-note-user:quick';

export default {
	path: '/dev/quick-note/s-1?fail=create',
	label: 'Quick note: writing the server never got is put back after a reload, and tries to save itself',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"quicknote-menu-item\\"]")', timeoutMs: 20000 },
		{ evaluate: OPEN },
		{ evaluate: TYPE(TEXT) },
		{
			waitFor: `() => /POST \\/api\\/notebook\\/note /.test(document.querySelector('[data-testid="qn-log"]').textContent) && !!localStorage.getItem('${KEY}')`,
			timeoutMs: 15000
		},
		{
			evaluate: `() => { window.__qnBeforeReload = true; const kept = !!localStorage.getItem('${KEY}'); setTimeout(() => location.reload(), 50); return 'reloading; mirror slot kept: ' + kept; }`
		},
		{
			waitFor: '() => !window.__qnBeforeReload && !!document.querySelector("[data-testid=\\"quicknote-menu-item\\"]")',
			timeoutMs: 20000
		},
		{ evaluate: OPEN },
		{
			waitFor: '() => /POST \\/api\\/notebook\\/note /.test(document.querySelector("[data-testid=\\"qn-log\\"]").textContent)',
			timeoutMs: 15000
		}
	],
	presence: [{ selector: '[data-testid="qn-notice"]', label: 'the restore sentence, in the reopened panel', expectPresent: 1, expectVisible: 1 }],
	contrast: [{ selector: '[data-testid="qn-notice"]', label: 'the restore sentence', min: 4.5 }],
	orderResult: [
		{
			label: 'the words came back and the restored note tried its own save',
			evaluate: `() => {
				const notice = document.querySelector('[data-testid="qn-notice"]')?.textContent ?? '';
				const input = document.querySelector('[data-testid="qn-panel"] [data-testid="note-editor-input"]');
				const log = [...document.querySelectorAll('[data-testid="qn-log"] li')].map((li) => li.textContent.trim());
				return [
					/put back/.test(notice) ? 'says it was put back' : 'NO RESTORE SENTENCE',
					(input?.textContent ?? '').includes(${JSON.stringify(TEXT)}) ? 'the words are back in the box' : 'BOX: ' + (input?.textContent ?? 'none'),
					log.some((l) => l.startsWith('POST /api/notebook/note section_id="s-1"')) ? 'the restored note tried to save itself' : 'NO SAVE ATTEMPT'
				];
			}`,
			expected: ['says it was put back', 'the words are back in the box', 'the restored note tried to save itself']
		}
	]
};
