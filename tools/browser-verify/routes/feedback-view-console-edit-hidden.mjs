/**
 * AN OPEN EDIT THAT A FILTER HIDES STAYS ON SCREEN WITH ITS WORDS (0233,
 * report d362bfb3), driven on the REAL console in
 * `/dev/feedback?view=console`.
 *
 * WHAT IS DRIVEN, in order: Edit on a New report, a changed message, then the
 * Seen status tab, which takes that report off the list. Before the fix the
 * card left with the form in it and the typing was gone; now the card sits
 * under "Being edited" above the list, the form reopened on what was typed.
 *
 * WHAT IS READ: the section and its sentence, the typing still in the box,
 * Save still live, the card's own status keys unlit and saying why in words
 * (`fbc-edit-hold`), every control's tap target and every sentence's ink.
 * The dom half (the card's keys refusing, a bulk move, a save from the
 * section, the Edit keys freed by a discard) is
 * `tests/dom/feedback-edit-mount.test.ts`.
 */
const TYPED = 'The plate switch is hard to hit on a phone, corrected.';

export default {
	path: '/dev/feedback?view=console&edit=hidden',
	aliasOf: '/dev/feedback?view=console',
	label: 'Feedback console: an open edit the filters hide stays on screen under Being edited, with the typing kept',
	prepare: [
		{
			click: '[data-testid="fbc-edit-seed-signed"]',
			until: '() => !!document.querySelector(\'[data-testid="fbc-edit-form"] [data-testid="fbe-message"]\')',
			attempts: 10,
			waitMs: 300
		},
		{
			evaluate: `() => {
				const ta = document.querySelector('[data-testid="fbc-edit-form"] [data-testid="fbe-message"]');
				ta.value = ${JSON.stringify(TYPED)};
				ta.dispatchEvent(new Event('input', { bubbles: true }));
				return document.querySelector('[data-testid="fbe-save"]').getAttribute('aria-disabled');
			}`,
			until: `() => document.querySelector('[data-testid="fbe-save"]')?.getAttribute('aria-disabled') === 'false'`,
			attempts: 8
		},
		{
			evaluate: `() => {
				const tab = [...document.querySelectorAll('.filters[aria-label="Status filter"] button')]
					.find((b) => b.textContent.trim().startsWith('Seen ('));
				if (tab) tab.click();
				return tab ? tab.textContent.trim() : 'NO SEEN TAB';
			}`,
			until: '() => !!document.querySelector(\'[data-testid="fbc-editing-hidden"] [data-testid="fbc-edit-form"]\')',
			attempts: 8
		}
	],
	presence: [
		{ selector: '[data-testid="fbc-editing-hidden"]', label: 'the Being edited section, above the list', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fbc-editing-hidden"] [data-testid="fbc-edit-form"]', label: 'the form, reopened inside it', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fbc-edit-form"]', label: 'exactly one form on the page', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fbc-edit-hold"]', label: 'why the card\'s keys are unlit, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="fbc-editing-hidden"]', label: 'the section says why the report is here', must: ['Being edited', 'These filters hide this report'] },
		{ selector: '[data-testid="fbc-edit-hold"]', label: 'the card says how to move it', must: ['Save or discard the edit'] }
	],
	orderResult: [
		{
			label: 'the typing survived the filter, Save is live, the card\'s keys are unlit, and the list does not carry it twice',
			evaluate: `() => {
				const section = document.querySelector('[data-testid="fbc-editing-hidden"]');
				const ta = section.querySelector('[data-testid="fbe-message"]');
				const save = section.querySelector('[data-testid="fbe-save"]');
				const keys = [...section.querySelectorAll('.fb-actions button')].filter((b) => b.getAttribute('aria-disabled') === 'true');
				const inList = [...document.querySelectorAll('[data-testid="fbc-select-seed-signed"]')].length;
				return [
					ta && ta.value === ${JSON.stringify(TYPED)} ? 'the typing is still in the box' : 'THE TYPING IS GONE: ' + (ta ? ta.value : 'no box'),
					save && save.getAttribute('aria-disabled') === 'false' ? 'Save is live' : 'SAVE IS UNLIT',
					keys.length >= 4 ? 'the card\\'s move keys are unlit' : 'ONLY ' + keys.length + ' KEYS UNLIT',
					inList === 1 ? 'the report appears once' : 'THE REPORT APPEARS ' + inList + ' TIMES'
				];
			}`,
			expected: ['the typing is still in the box', 'Save is live', "the card's move keys are unlit", 'the report appears once']
		}
	],
	contrast: [
		{ selector: '#fbc-editing-title', label: 'the Being edited heading', min: 4.5 },
		{ selector: '[data-testid="fbc-editing-hidden"] .fbc-editing-note', label: 'the section\'s sentence', min: 4.5 },
		{ selector: '[data-testid="fbc-edit-hold"]', label: 'why the keys are unlit', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="fbc-editing-hidden"] .fb-actions button', label: 'the card\'s keys, unlit but still a target', min: 44 },
		{ selector: '[data-testid="fbe-save"]', label: 'Save edit', min: 44 },
		{ selector: '[data-testid="fbe-cancel"]', label: 'Discard edit', min: 44 }
	]
};
