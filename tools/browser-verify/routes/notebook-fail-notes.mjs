import { IGNORE_PHOTO_PROXY, TYPE_IN_COMPOSER, WAIT_AUTOPICK, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * THE LOG'S COMPOSER KEEPS ITS DRAFT MIRROR AND ITS SAVE STATE (ledger 0298,
 * R32). Every note write fails here (`?fail=notes`), so what is typed exists
 * only in the box and in the mirror (`notebook_draft_mirror:u-self:new`). The
 * one save state must say it is retrying rather than "Saved"; the page is
 * then thrown away and loaded again -- the state a discarded tab leaves -- and
 * the composer must put the words back and say so.
 *
 * Read in the order it happened: what the indicator said and the kept slot are
 * read by the prepare step before the reload (it prints both), and the
 * restore sentence and the words in the box after it.
 */
const WORDS = 'Chain tension checked at 3 mm slack';
const KEY = 'notebook_draft_mirror:u-self:new';

export default {
	path: '/dev/notebook?fail=notes',
	label: 'Notebook log composer: a write that never landed says so, and comes back from the mirror after a reload',
	prepare: [
		WAIT_AUTOPICK,
		WAIT_EDITOR,
		{ evaluate: TYPE_IN_COMPOSER(WORDS) },
		{
			waitFor: `() => /Retrying|Not saved/.test(document.querySelector('[data-testid="nb-compose"] .save-ind')?.textContent ?? '') && (localStorage.getItem('${KEY}') ?? '').includes(${JSON.stringify(WORDS)})`,
			timeoutMs: 20_000
		},
		{
			evaluate: `() => { window.__nbBeforeReload = true; const kept = (localStorage.getItem('${KEY}') ?? '').includes(${JSON.stringify(WORDS)}); const said = (document.querySelector('[data-testid="nb-compose"] .save-ind')?.textContent ?? '').replace(/\\s+/g, ' ').trim(); setTimeout(() => location.reload(), 50); return 'reloading; the indicator said: ' + said + '; mirror slot holds the words: ' + kept; }`
		},
		{
			waitFor: '() => !window.__nbBeforeReload && !!document.querySelector(\'[data-testid="nb-mirror-restored"]\') && !!document.querySelector(\'[data-testid="nb-compose"] [data-testid="note-editor-input"]\')',
			timeoutMs: 20_000
		}
	],
	presence: [
		{ selector: '[data-testid="nb-mirror-restored"]', label: 'the restore sentence, in the composer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-compose"] .save-ind.saved', label: 'a Saved report for a write that never landed (must be absent)', expectPresent: 0 }
	],
	contrast: [{ selector: '[data-testid="nb-mirror-restored"]', label: 'the restore sentence', min: 4.5 }],
	orderResult: [
		{
			label: 'the words came back into the box after the reload',
			evaluate: `() => {
				const input = document.querySelector('[data-testid="nb-compose"] [data-testid="note-editor-input"]');
				return [(input?.textContent ?? '').includes(${JSON.stringify(WORDS)}) ? 'the words are back in the box' : 'BOX: ' + (input?.textContent ?? 'none')];
			}`,
			expected: ['the words are back in the box']
		}
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
