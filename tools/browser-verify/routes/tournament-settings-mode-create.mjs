/**
 * THE NEW-TOURNAMENT FORM, NOW THE SHARED ONE (ledger 0298, R02). The same
 * seven fields `/tournaments/new` always had, in the same order, and no
 * edit-only furniture (no Format group label, no Discard, no aria-disabled
 * Save). The prepare steps press Create with no name (the page's own refusal,
 * unchanged), then name it and press again; the call the form built is the
 * literal the page always sent, keys in the same order.
 */
const TYPE = (sel, text) =>
	`() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NO FIELD'; el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`;

export default {
	path: '/dev/tournament-settings?mode=create',
	label: 'New tournament form: the shared form in create mode, sending the old literal',
	settleMs: 500,
	prepare: [
		{
			click: '[data-action="settings-submit"]',
			until: `() => (document.querySelector('[data-testid="settings-error"]')?.textContent ?? '').includes('Give the tournament a name.')`,
			attempts: 12,
			waitMs: 200
		},
		{
			evaluate: TYPE('[data-testid="tournament-settings"] [data-field="name"]', 'Lunch League'),
			until: `() => document.querySelector('[data-testid="tournament-settings"] [data-field="name"]').value === 'Lunch League'`,
			attempts: 12,
			waitMs: 200
		},
		{
			click: '[data-action="settings-submit"]',
			until: `() => /tournament_create/.test(document.querySelector('[data-testid="last-args"]').textContent)`,
			attempts: 12,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '.tnm-root[data-testid="harness-room"]', label: 'the tournaments room mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="tournament-settings"][data-mode="create"]', label: 'the form, in create mode', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tournament-settings"] select:not(:disabled)', label: 'three selects', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="tournament-settings"] input[type="checkbox"]:not(:disabled)', label: 'two toggles', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="tournament-settings"] [data-field="name"], [data-testid="tournament-settings"] [data-field="description"]', label: 'name and description', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="tournament-settings"] .ts-group', label: 'no Format group label in create mode', expectPresent: 0 },
		{ selector: '[data-action="settings-discard"], [data-testid="settings-dirty"], [data-testid="settings-saved"]', label: 'no edit-only furniture', expectPresent: 0 },
		{ selector: '[data-action="settings-submit"][aria-disabled]', label: 'Create is never aria-disabled', expectPresent: 0 },
		{ selector: '[data-testid="settings-error"]', label: 'the no-name refusal cleared on the named press', expectPresent: 0 },
		{ selector: '[data-testid="harness-created"]', label: 'the create call went', expectPresent: 1, maxPresent: 1 }
	],
	domOrder: [
		{ before: '[data-field="name"]', after: '[data-field="description"]', label: 'name, then description' },
		{ before: '[data-field="description"]', after: '[data-field="quals_enabled"]', label: 'description, then qualifying' },
		{ before: '[data-field="score_entry"]', after: '[data-field="best_of_default"]', label: 'scores, then best of' },
		{ before: '[data-field="best_of_default"]', after: '[data-field="team_size"]', label: 'best of, then registrants' },
		{ before: '[data-field="team_size"]', after: '[data-field="grand_final"]', label: 'registrants, then grand final (the old page order)' }
	],
	orderResult: [
		{
			label: 'the create call is the old page literal',
			evaluate: `() => { const c = JSON.parse(document.querySelector('[data-testid="last-args"]').textContent); return [c.rpc, c.args.p_name, c.args.p_description, JSON.stringify(c.args.p_config)]; }`,
			expected: ['tournament_create', 'Lunch League', '', '{"quals_enabled":false,"score_entry":false,"best_of_default":1,"best_of":{},"team_size":1}']
		}
	],
	textContains: [
		{ selector: '[data-action="settings-submit"]', label: 'the create word', must: ['Create tournament'] }
	],
	tapTargets: [
		{ selector: '[data-testid="tournament-settings"] input[type="text"], [data-testid="tournament-settings"] textarea, [data-testid="tournament-settings"] select', label: 'every field', min: 44 },
		{ selector: '[data-testid="tournament-settings"] .ts-toggle', label: 'the two toggles, at the label', min: 44 },
		{ selector: '[data-testid="tournament-settings"] .btn', label: 'Create', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="tournament-settings"] .ts-row > span', label: 'field labels (mono, dim)', min: 4.5 },
		{ selector: '[data-testid="tournament-settings"] .ts-toggle > span', label: 'toggle labels', min: 4.5 }
	]
};
