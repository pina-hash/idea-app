import { IGNORE_PHOTO_PROXY, OPEN_FILING, TYPE_IN_COMPOSER, WAIT_AUTOPICK, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * ONCE THE COMPOSER HAS MADE A DRAFT, "Filed to ..." SAYS WHERE THE DRAFT IS,
 * AND THE PICKS CANNOT PRETEND TO MOVE IT (ledger 0298 review).
 *
 * The log invites writing first and filing later -- the picks are behind
 * "Change" -- and writing first autosaves a draft to the auto-picked check-in
 * within a second. From that moment every save only ADDS to that draft (the
 * saveTarget guarantee), so a pick changed afterwards used to move the line on
 * screen and nothing on the server: the line said one check-in, Turn in turned
 * in another. Now the line reads the draft's own filing and the panel is
 * locked, with one sentence saying so.
 *
 * AND BARE TEMPLATE HEADINGS DO NOT MAKE THAT DRAFT. Pressing a template and
 * then "Change" is the natural order here, so the first prepare steps press
 * one, wait well past the 800ms autosave debounce, and REFUSE to go on if a
 * note was created or New entry appeared; only the typed words that follow
 * create the draft the rest of this spec measures.
 *
 * BOTH DIRECTIONS. The positive control that the picks are live before a
 * draft exists is `notebook.mjs`, which presses "Something else" with a real
 * click on this same fixture; here, after the draft, every pick and the folder
 * picker carry `disabled` (the contract, not a synthetic dispatch), the lock
 * sentence is on screen, and the words on the line name the check-in the
 * create was SENT with, read off the harness's own transport log.
 */
const WORDS = 'Measured the chain slack at both ends';

export default {
	path: '/dev/notebook?state=log-filed-lock',
	label: 'Notebook log composer: bare template headings make no draft; after the first autosave, "Filed to" names the draft\'s own check-in and the picks are locked',
	prepare: [
		WAIT_AUTOPICK,
		WAIT_EDITOR,
		{
			click: '[data-testid="nb-template-test-result"]',
			until: '() => /What I tested/.test(document.querySelector(\'[data-testid="nb-compose"] [data-testid="note-editor-input"]\')?.textContent ?? "")'
		},
		{
			evaluate: `async () => {
				await new Promise((r) => setTimeout(r, 2500));
				const log = document.querySelector('[data-testid="dev-log"]')?.textContent ?? '';
				if (/POST \\/api\\/notebook\\/note/.test(log)) throw new Error('bare template headings created a draft');
				if (document.querySelector('[data-testid="nb-new-entry"]')) throw new Error('New entry appeared with no draft written');
				return 'no draft out of bare headings after 2.5s';
			}`
		},
		{ evaluate: TYPE_IN_COMPOSER(WORDS) },
		{
			waitFor: '() => /POST \\/api\\/notebook\\/note .*autosave=true/.test(document.querySelector(\'[data-testid="dev-log"]\')?.textContent ?? "") && !!document.querySelector(\'[data-testid="nb-new-entry"]\')',
			timeoutMs: 15_000
		},
		OPEN_FILING
	],
	presence: [
		{ selector: '[data-testid="nb-filing-locked"]', label: 'the lock sentence, once a draft exists', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-filing"] .pick:not(:disabled)', label: 'a check-in pick that still takes a press (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-filing"] .pick:disabled', label: 'the check-in picks, shown and locked', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="new-entry-folder"]:disabled', label: 'the folder picker, locked', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nb-filing-manage-folders"]:not(:disabled)', label: 'Manage folders, still available (it moves nothing)', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [{ selector: '[data-testid="nb-filing-locked"]', label: 'the lock sentence', min: 4.5 }],
	orderResult: [
		{
			label: 'the line and the pressed pick both name the check-in the draft was created against',
			evaluate: `() => {
				const log = document.querySelector('[data-testid="dev-log"]')?.textContent ?? '';
				const create = log.split('\\n').find((l) => l.startsWith('POST /api/notebook/note')) ?? '';
				const sent = (create.match(/session_id="([^"]+)"/) ?? [])[1] ?? null;
				const pressed = [...document.querySelectorAll('[data-testid="nb-filing"] .pick[aria-pressed="true"] .pick-label')].map((el) => el.textContent.trim());
				const where = document.querySelector('[data-testid="nb-filed-to"]')?.textContent.trim() ?? '';
				return [
					sent ? 'the create was sent with a check-in' : 'CREATE ' + create,
					pressed.length === 1 && where.startsWith(pressed[0]) ? 'the line names the pressed pick' : 'PRESSED ' + JSON.stringify(pressed) + ' LINE ' + where
				];
			}`,
			expected: ['the create was sent with a check-in', 'the line names the pressed pick']
		}
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
