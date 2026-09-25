/**
 * AN EDIT SENDS THE WHOLE CONFIG (ledger 0298, R02). `tournament_update`
 * replaces the stored config wholesale, so the form builds it FROM the stored
 * one. This stored config carries two per-round overrides the form has no
 * control for (winners:1 and losers:2); the prepare step changes the default
 * best-of and saves, and the call must carry both overrides, the grand final,
 * the team size and qualifying exactly as stored. A form that sent only its
 * own fields would save perfectly and quietly change how two rounds play.
 */
export default {
	path: '/dev/tournament-settings?status=draft&overrides=1',
	label: 'Tournament settings, draft with per-round overrides: a format save keeps what the form does not show',
	settleMs: 500,
	prepare: [
		{
			evaluate: `() => { const el = document.querySelector('[data-field="best_of_default"]'); if (!el) return 'NO SELECT'; el.value = '7'; el.dispatchEvent(new Event('change', { bubbles: true })); return 'chose ' + el.value; }`,
			until: `() => !!document.querySelector('[data-testid="settings-dirty"]')`,
			attempts: 12,
			waitMs: 200
		},
		{
			click: '[data-action="settings-submit"]',
			until: `() => !!document.querySelector('[data-testid="settings-saved"]')`,
			attempts: 12,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '[data-testid="settings-hidden-overrides"]', label: 'the form says what it keeps but does not show', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-saved"]', label: 'the save landed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-dirty"], [data-action="settings-discard"]', label: 'clean again after the save', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'the whole config went, overrides included',
			evaluate: `() => { const c = JSON.parse(document.querySelector('[data-testid="last-args"]').textContent).args.p_config; return [String(c.best_of_default), JSON.stringify(c.best_of), String(c.team_size), String(c.quals_enabled), String(c.score_entry)]; }`,
			expected: ['7', '{"winners:1":1,"losers:2":3,"grand_final":5}', '2', 'false', 'true']
		}
	],
	textContains: [
		{ selector: '[data-testid="settings-hidden-overrides"]', label: 'names the kept rounds', must: ['losers:2', 'winners:1', 'saving keeps them'] }
	],
	contrast: [
		{ selector: '[data-testid="settings-hidden-overrides"]', label: 'the kept-rounds note', min: 4.5 }
	]
};
