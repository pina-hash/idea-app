import { IGNORE_FIXTURE_PHOTO, OPEN, TYPE } from './_quick-note.mjs';

/**
 * A TAB CLOSED MID-NOTE LEAVES A BACKUP OF WHAT WAS ON SCREEN (ledger 0298
 * review). The browser's slot is written 400ms after typing stops; a tab
 * closed or hidden inside that window used to leave the slot one burst behind
 * the write the close sent, and the next load restored the older words and
 * autosaved them back over the newer ones. The quick note now writes the slot
 * at once on pagehide.
 *
 * Built the same way as the remount spec: " Bravo" sits long enough for the
 * slot to hold it, " Charlie" is typed, and pagehide fires 50ms later. The
 * prepare step prints the slot before and after, so the stale state is shown
 * to have arisen.
 */
const KEY = 'notebook_draft_mirror:dev-quick-note-user:quick';
const SLOT_TEXT = `(() => { try { const s = JSON.parse(localStorage.getItem('${KEY}') || 'null'); return s ? (JSON.stringify(s.doc).match(/"text":"([^"]*)"/g) || []).map((t) => t.slice(8, -1)).join('') : null; } catch { return 'unreadable'; } })()`;

export default {
	path: '/dev/quick-note?state=pagehide',
	label: 'Quick note: a pagehide writes the backup of what is on screen at once',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"quicknote-menu-item\\"]")', timeoutMs: 20000 },
		{ evaluate: OPEN },
		{ evaluate: TYPE('Alpha') },
		{
			waitFor: '() => /new-1 draft: Alpha$/.test((document.querySelector("[data-store-id=\\"new-1\\"]")?.textContent ?? "").trim())',
			timeoutMs: 15000
		},
		{
			evaluate: `async () => {
				const input = document.querySelector('[data-testid="qn-panel"] [data-testid="note-editor-input"]');
				input.focus();
				const sel = window.getSelection();
				sel.selectAllChildren(input);
				sel.collapseToEnd();
				document.execCommand('insertText', false, ' Bravo');
				await new Promise((r) => setTimeout(r, 520));
				const before = ${SLOT_TEXT};
				document.execCommand('insertText', false, ' Charlie');
				await new Promise((r) => setTimeout(r, 50));
				window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
				const after = ${SLOT_TEXT};
				window.__qnPagehide = [before, after];
				return 'slot before ' + JSON.stringify(before) + ', right after pagehide ' + JSON.stringify(after);
			}`
		}
	],
	orderResult: [
		{
			label: 'the slot was one burst behind, and pagehide brought it to what is on screen',
			evaluate: `() => {
				const [before, after] = window.__qnPagehide || [];
				return [
					before === 'Alpha Bravo' ? 'the slot held the older words' : 'SLOT BEFORE ' + JSON.stringify(before),
					after === 'Alpha Bravo Charlie' ? 'pagehide wrote what is on screen' : 'SLOT AFTER ' + JSON.stringify(after)
				];
			}`,
			expected: ['the slot held the older words', 'pagehide wrote what is on screen']
		}
	]
};
