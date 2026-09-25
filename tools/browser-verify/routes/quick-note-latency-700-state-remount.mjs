import { IGNORE_FIXTURE_PHOTO, OPEN, TYPE } from './_quick-note.mjs';

/**
 * A QUICK NOTE UNMOUNTED MID-WRITE KEEPS ITS NEWEST WORDS (ledger 0298 review).
 *
 * The real control lives in two headers, the home page's and the classroom
 * shell's, so moving between them unmounts one quick note and mounts another in
 * the same tab. This spec does exactly that with the harness's Remount header
 * control, with every note write held 700ms (`?latency=700`) so the unmount's
 * own write is in flight while the next quick note mounts.
 *
 * THE STATE IT BUILDS ON PURPOSE: the note's draft exists ("Alpha"), " Bravo"
 * is typed and sits long enough for the 400ms mirror to hold it but not the
 * 800ms autosave, then " Charlie" is typed and the header is remounted at once.
 * So the browser's slot holds "Alpha Bravo" (older) while the unmount sends
 * "Alpha Bravo Charlie" (newer). The prepare step prints the slot it saw, which
 * is the proof the stale state arose rather than a pass by luck.
 *
 * The unmount happens with the editor FOCUSED, which is the other half: a
 * focused editor removed from the page used to throw `state_unsafe_mutation`
 * from NoteEditor inside Svelte's own block update, and this run's console is
 * where that shows.
 *
 * WHAT MUST HOLD: the stored draft ends as the NEWEST words, there is still one
 * quick-note draft (no second copy of the same note), and the slot is empty
 * once the server holds everything. Before the fix the next mount restored the
 * older slot at once and its autosave wrote "Alpha Bravo" over "Alpha Bravo
 * Charlie" -- the last words typed, lost, with the box agreeing with the loss.
 */
const KEY = 'notebook_draft_mirror:dev-quick-note-user:quick';

export default {
	path: '/dev/quick-note?latency=700&state=remount',
	label: 'Quick note: remounting the header while its last write is in flight keeps the newest words, in one draft',
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
				let slot = null;
				try { slot = JSON.parse(localStorage.getItem('${KEY}') || 'null'); } catch {}
				const slotText = slot ? JSON.stringify(slot.doc).match(/"text":"([^"]*)"/g)?.map((t) => t.slice(8, -1)).join('') : null;
				document.execCommand('insertText', false, ' Charlie');
				await new Promise((r) => setTimeout(r, 60));
				document.querySelector('[data-testid="qnh-remount"]').click();
				window.__qnSlotBefore = slotText;
				return 'slot before remount: ' + JSON.stringify(slotText) + ', entry ' + (slot && slot.entryId);
			}`
		},
		{ evaluate: '() => new Promise((r) => setTimeout(() => r("waited for every held write to land"), 4000))' },
		/* The remounted header still answers a press: its panel opens. Removing a
		   FOCUSED editor used to throw state_unsafe_mutation inside Svelte's block
		   update, the trap whose symptom is controls that stop responding. */
		{ evaluate: OPEN }
	],
	orderResult: [
		{
			label: 'the stale slot really arose, and the stored draft ends as the newest words in one draft, with the slot cleared',
			evaluate: `() => {
				const quick = [...document.querySelectorAll('[data-testid="qnh-store"] li')].filter((li) => /^new-/.test(li.dataset.storeId));
				const text = (document.querySelector('[data-store-id="new-1"]')?.textContent ?? '').trim();
				return [
					window.__qnSlotBefore === 'Alpha Bravo' ? 'the slot held the older words at the remount' : 'SLOT WAS ' + JSON.stringify(window.__qnSlotBefore),
					/draft: Alpha Bravo Charlie$/.test(text) ? 'the draft holds the newest words' : 'DRAFT: ' + text,
					quick.length === 1 ? 'one quick-note draft' : quick.length + ' QUICK-NOTE DRAFTS',
					localStorage.getItem('${KEY}') === null ? 'the slot is empty' : 'SLOT LEFT: ' + localStorage.getItem('${KEY}')
				];
			}`,
			expected: [
				'the slot held the older words at the remount',
				'the draft holds the newest words',
				'one quick-note draft',
				'the slot is empty'
			]
		}
	]
};
