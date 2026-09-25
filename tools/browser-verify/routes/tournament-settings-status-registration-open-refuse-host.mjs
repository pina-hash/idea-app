/**
 * A REFUSAL RENDERS IN PLACE, VERBATIM (ledger 0298, R02). The stand-in
 * refuses with `_tournament_require_host`'s own text, the one a host whose
 * co-host removed them would meet. It must appear INSIDE the Settings card,
 * word for word, and the edit must still be on screen afterwards (a failed
 * write keeps what did not land).
 */
const TYPE = (sel, text) =>
	`() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NO FIELD'; el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`;

export default {
	path: '/dev/tournament-settings?status=registration_open&refuse=host',
	label: 'Tournament settings, a refusal: in the card, verbatim, the edit kept',
	settleMs: 500,
	prepare: [
		{
			evaluate: TYPE('[data-testid="tournament-settings"] [data-field="description"]', 'Now three-on-three.'),
			until: `() => !!document.querySelector('[data-testid="settings-dirty"]')`,
			attempts: 12,
			waitMs: 200
		},
		{
			click: '[data-action="settings-submit"]',
			until: `() => !!document.querySelector('[data-testid="settings-error"]')`,
			attempts: 12,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '[data-testid="host-settings"] [data-testid="settings-error"]', label: 'the refusal, inside the Settings card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-saved"]', label: 'nothing claims it saved', expectPresent: 0 },
		{ selector: '[data-testid="settings-dirty"]', label: 'the edit is still unsaved and still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="settings-error"]', label: 'the RPC text, word for word', must: ['Only a tournament host or a site admin can do that.'] }
	],
	orderResult: [
		{
			label: 'the refused call carried only the description',
			evaluate: `() => { const c = JSON.parse(document.querySelector('[data-testid="last-args"]').textContent).args; return [String(c.p_name), c.p_description, String(c.p_config), document.querySelector('[data-field="description"]').value]; }`,
			expected: ['null', 'Now three-on-three.', 'null', 'Now three-on-three.']
		}
	],
	contrast: [
		{ selector: '[data-testid="settings-error"]', label: 'the refusal', min: 4.5 },
		{ selector: '[data-testid="settings-dirty"]', label: 'the unsaved note', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="tournament-settings"] .btn', label: 'Save and Discard', min: 44 }
	]
};
