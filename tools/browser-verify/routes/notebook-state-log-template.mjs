import { IGNORE_PHOTO_PROXY, TYPE_IN_COMPOSER, WAIT_AUTOPICK, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * THE LOG'S COMPOSER, DRIVEN (ledger 0298, R32): a press with nothing to send
 * says why, a template puts its headings in the box with the cursor under the
 * first one, what is typed saves itself as a draft through the notebook's own
 * note path, and the check-in chip changes its word to say so.
 *
 * READ IN THE ORDER IT HAPPENED. The refusal is a prepare step that waits for
 * the sentence to appear, so "a press says why" is measured at the moment of
 * the press; the presence row at the end says it has GONE once there was
 * something to save, which is the other direction of the same rule.
 *
 * The write is read off the harness's own transport log (`dev-log`), never off
 * the DOM: what proves an autosave landed is what the write path recorded.
 */
const WORDS = 'Loaded the bracket to 5 kg';

export default {
	path: '/dev/notebook?state=log-template',
	label: 'Notebook log composer: a refusal on an empty press, a template, and an autosaved draft',
	prepare: [
		WAIT_AUTOPICK,
		WAIT_EDITOR,
		{
			click: '[data-testid="nb-turn-in"]',
			until: '() => /photo or some writing/.test(document.querySelector(\'[data-testid="nb-compose-refusal"]\')?.textContent ?? "")'
		},
		{
			click: '[data-testid="nb-template-test-result"]',
			until: '() => /What I tested/.test(document.querySelector(\'[data-testid="nb-compose"] [data-testid="note-editor-input"]\')?.textContent ?? "")'
		},
		{ evaluate: TYPE_IN_COMPOSER(WORDS) },
		{
			waitFor: '() => /POST \\/api\\/notebook\\/note .*autosave=true/.test(document.querySelector(\'[data-testid="dev-log"]\')?.textContent ?? "") && !!document.querySelector(\'[data-testid="nb-compose"] .save-ind.saved\')',
			timeoutMs: 15_000
		}
	],
	presence: [
		{ selector: '[data-testid="nb-compose-refusal"]', label: 'the refusal, gone once there is something to save', expectPresent: 0 },
		{ selector: '[data-testid="nb-compose"] .save-ind.saved', label: 'the one save state says Saved, with its time', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-new-entry"]', label: 'New entry, once this composer holds a draft', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-turn-in"][aria-disabled="false"]', label: 'Turn in, ready', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nb-filed-state"][data-tone="attention"]', label: 'the filed check-in, still owed (a draft is not turned in)', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '[data-testid="nb-compose"] .note-input strong', label: 'template headings in the box', min: 4.5 },
		{ selector: '[data-testid="nb-compose"] .save-ind', label: 'the save indicator in the composer', min: 4.5 },
		{ selector: '.ci-state', label: 'check-in state words after the save', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="nb-new-entry"]', label: 'New entry', min: 44 }],
	orderResult: [
		{
			label: 'the template put its headings in and the cursor under the first; the draft went to the check-in; both chips say Draft',
			evaluate: `() => {
				const input = document.querySelector('[data-testid="nb-compose"] [data-testid="note-editor-input"]');
				const blocks = [...input.children].map((el) => el.textContent.trim());
				const log = document.querySelector('[data-testid="dev-log"]')?.textContent ?? '';
				const create = log.split('\\n').find((l) => l.startsWith('POST /api/notebook/note')) ?? '';
				const words = [...document.querySelectorAll('.ci-state')].map((el) => el.textContent.trim());
				return [
					blocks[0] === 'What I tested' && blocks[1] === ${JSON.stringify(WORDS)} ? 'heading, then the words typed under it' : 'BLOCKS ' + JSON.stringify(blocks.slice(0, 3)),
					blocks.includes('How I tested it') && blocks.includes('What happened') && blocks.includes('What I will change') ? 'every heading of the template' : 'MISSING HEADINGS',
					/session_id="ses-4"/.test(create) && /autosave=true/.test(create) ? 'autosaved as a draft against the check-in' : 'CREATE ' + create,
					words.length === 2 && words.every((w) => w === 'Draft, not turned in') ? 'both chips say Draft, not turned in' : 'CHIPS ' + JSON.stringify(words)
				];
			}`,
			expected: [
				'heading, then the words typed under it',
				'every heading of the template',
				'autosaved as a draft against the check-in',
				'both chips say Draft, not turned in'
			]
		}
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
