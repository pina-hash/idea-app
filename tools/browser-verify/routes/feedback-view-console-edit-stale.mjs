/**
 * AN EDIT REFUSED AS STALE: another admin saved first. `?edit=stale` makes the
 * harness's in-memory transport answer every save the way `app_feedback_edit`
 * answers a form opened on an older revision, so the refusal path is driven on
 * the REAL form: the database's reason in FEEDBACK_EDIT_REFUSALS' words beside
 * the form, the form still open with the typing in it, nothing marked Edited,
 * and the refusal answered ONCE (a considered refusal is never retried).
 */
export default {
	path: '/dev/feedback?view=console&edit=stale',
	label: 'Feedback console: an edit refused as stale says so beside the form and keeps the typing',
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
				ta.value = 'Somebody else already corrected this one.';
				ta.dispatchEvent(new Event('input', { bubbles: true }));
				return document.querySelector('[data-testid="fbe-save"]').getAttribute('aria-disabled');
			}`,
			until: `() => document.querySelector('[data-testid="fbe-save"]')?.getAttribute('aria-disabled') === 'false'`,
			attempts: 8
		},
		{
			click: '[data-testid="fbe-save"]',
			until: '() => !!document.querySelector(\'[data-testid="fbe-refusal"]\')',
			attempts: 4,
			waitMs: 600
		}
	],
	presence: [
		{ selector: '[data-testid="fbe-refusal"]', label: 'the refusal, beside the form', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fbc-edit-form"]', label: 'the form, still open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fbc-edit-note"]', label: 'no "saved" note', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="fbe-refusal"]', label: 'the refusal names what happened and what to do', must: ['Another admin changed this report', 'Reload'] }
	],
	orderResult: [
		{
			label: 'the typing is kept, the card is not marked Edited, and the refusal was sent once',
			evaluate: `() => {
				const card = document.querySelector('[data-testid="fbc-select-seed-signed"]').closest('article');
				const ta = card.querySelector('[data-testid="fbe-message"]');
				const calls = Number(document.querySelector('[data-testid="edit-calls"]').textContent.trim());
				return [
					ta && ta.value === 'Somebody else already corrected this one.' ? 'the typing is still in the box' : 'THE TYPING IS GONE',
					card.querySelector('[data-testid="fbc-edited-chip"]') ? 'MARKED EDITED' : 'not marked Edited',
					calls + ' write(s)'
				];
			}`,
			expected: ['the typing is still in the box', 'not marked Edited', '1 write(s)']
		}
	],
	contrast: [{ selector: '[data-testid="fbe-refusal"]', label: 'the refusal', min: 4.5 }]
};
