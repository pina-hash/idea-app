/**
 * AN ADMIN CORRECTS A FILED REPORT (report d362bfb3, 0233), driven end to end
 * on the REAL console in `/dev/feedback?view=console` against the harness's
 * in-memory edit transport.
 *
 * WHAT IS DRIVEN, in order: Edit on an unedited report, a changed message,
 * Save; then Edit on a second report, left open so the form's own controls can
 * be measured; then the first report's As sent panel opened. WHAT IS READ: the
 * corrected words on the card with the Edited word and the "Edited by" line,
 * the reporter's own words one press away under As sent, the note above the
 * list, and every control's tap target and ink.
 *
 * Its pair, `feedback-view-console-edit-unavailable`, is the same page with no
 * edit transport: 0 Edit keys there, against the count measured here.
 */
const EDITED_WORDS = 'The plate switch is too small to hit on a phone.';

export default {
	path: '/dev/feedback?view=console&edit=drive',
	aliasOf: '/dev/feedback?view=console',
	label: 'Feedback console: an admin edits a report, the card says Edited, the original is under As sent',
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
				ta.value = ${JSON.stringify(EDITED_WORDS)};
				ta.dispatchEvent(new Event('input', { bubbles: true }));
				return document.querySelector('[data-testid="fbe-save"]').getAttribute('aria-disabled');
			}`,
			until: `() => document.querySelector('[data-testid="fbe-save"]')?.getAttribute('aria-disabled') === 'false'`,
			attempts: 8
		},
		{
			click: '[data-testid="fbe-save"]',
			until: '() => !!document.querySelector(\'[data-testid="fbc-edit-note"]\') && !document.querySelector(\'[data-testid="fbc-edit-form"]\')',
			attempts: 8,
			waitMs: 400
		},
		{
			click: '[data-testid="fbc-edit-seed-anon-bare"]',
			until: '() => !!document.querySelector(\'[data-testid="fbc-edit-form"]\')',
			attempts: 8,
			waitMs: 300
		},
		{
			evaluate: `() => {
				const card = document.querySelector('[data-testid="fbc-select-seed-signed"]').closest('article');
				const t = card.querySelector('[data-testid="fbc-as-sent-toggle"]');
				if (t.getAttribute('aria-expanded') !== 'true') t.click();
				return t.getAttribute('aria-expanded');
			}`,
			until: `() => document.querySelector('[data-testid="fbc-select-seed-signed"]')?.closest('article')?.querySelector('[data-testid="fbc-as-sent-toggle"]')?.getAttribute('aria-expanded') === 'true'`,
			attempts: 8
		}
	],
	presence: [
		{ selector: '[data-testid="fbc-edit-form"]', label: 'one edit form, open on the second report', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fbc-edited-chip"]', label: 'the Edited word, on the harness\'s edited report and the one just saved', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="fbc-edited-line"]', label: 'who edited it and when', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="fbc-edit-note"]', label: 'the sentence above the list saying the edit landed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.site-plate .fb-page', label: 'the console, under the site plate', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="feedback-sources"] a.on[aria-current="page"]', label: 'the Site key lit in the source strip', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="fbc-edit-note"]', label: 'the note says the reporter\'s words are kept', must: ['Saved your edit', 'As sent'] }
	],
	orderResult: [
		{
			label: 'the saved card reads the correction, names it, and keeps the original one press away',
			evaluate: `() => {
				const card = document.querySelector('[data-testid="fbc-select-seed-signed"]').closest('article');
				const msg = card.querySelector('.fb-message')?.textContent?.trim() ?? '';
				const line = card.querySelector('[data-testid="fbc-edited-line"]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
				const sent = card.querySelector('.fb-as-sent-list')?.textContent ?? '';
				const region = card.querySelector('[data-testid="fbc-as-sent"] .disc-body[data-open="true"]');
				const shown = region ? region.getBoundingClientRect().height > 0 : false;
				return [
					msg === ${JSON.stringify(EDITED_WORDS)} ? 'the card shows the corrected words' : 'THE CARD SHOWS: ' + msg,
					/^Edited by harness-admin@boscotech\\.edu/.test(line) ? 'the line names the editor' : 'LINE: ' + line,
					sent.includes('The notebook plate switch is hard to hit on a phone.') ? 'As sent holds the reporter\\'s own words' : 'AS SENT: ' + sent.slice(0, 80),
					shown ? 'As sent is open and drawn' : 'AS SENT IS NOT DRAWN'
				];
			}`,
			expected: [
				'the card shows the corrected words',
				'the line names the editor',
				"As sent holds the reporter's own words",
				'As sent is open and drawn'
			]
		},
		{
			label: 'an Edit key on every other report on screen, none on the one whose form is open',
			evaluate: `() => {
				const rows = document.querySelectorAll('article.fb-row').length;
				const keys = document.querySelectorAll('button.fb-edit').length;
				const formCard = document.querySelector('[data-testid="fbc-edit-form"]').closest('article');
				return [rows + ' rows on screen', keys + ' Edit keys', formCard.querySelector('button.fb-edit') ? 'THE OPEN ROW STILL OFFERS EDIT' : 'the open row offers no second Edit'];
			}`,
			expected: ['7 rows on screen', '6 Edit keys', 'the open row offers no second Edit']
		}
	],
	contrast: [
		{ selector: '[data-testid="fbc-edited-chip"]', label: 'the Edited word', min: 4.5 },
		{ selector: '[data-testid="fbc-edited-line"]', label: 'who edited it and when', min: 4.5 },
		{ selector: '.fb-as-sent-list dd', label: 'the reporter\'s own words under As sent', min: 4.5 },
		{ selector: '.fbe-label', label: 'the edit form\'s field labels', min: 4.5 },
		{ selector: '.fbe-lead', label: 'the edit form\'s lead sentence', min: 4.5 },
		{ selector: '[data-testid="fbc-edit-note"]', label: 'the saved note', min: 4.5 }
	],
	tapTargets: [
		{ selector: 'button.fb-edit', label: 'each report\'s Edit key', min: 44 },
		{ selector: '[data-testid="fbe-save"]', label: 'Save edit', min: 44 },
		{ selector: '[data-testid="fbe-cancel"]', label: 'Cancel', min: 44 },
		{ selector: '[data-testid="fbe-kind"]', label: 'the kind picker', min: 44 },
		{ selector: '[data-testid="fbc-as-sent-toggle"]', label: 'the As sent trigger', min: 44 },
		{ selector: '[data-testid="feedback-sources"] a', label: 'the source strip keys', min: 44 }
	]
};
