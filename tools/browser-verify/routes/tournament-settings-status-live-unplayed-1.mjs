/**
 * A DRAWN BRACKET WITH NOTHING PLAYED (ledger 0455, migration 0317, report
 * 544604c9: he changed best of 1 to best of 3 on Oct 27, then wanted a longer
 * final, and had to rebuild the tournament twice). The match lengths stay
 * editable for any host until the first match starts: two live selects (best
 * of, grand final), against zero on `tournament-settings-status-live.mjs`.
 * Qualifying, scoring and team size hold, with ONE sentence saying why. The
 * prepare step picks best of 5 and a best of 7 final and saves; the call the
 * form built carries exactly those lengths and the stored qualifying, scoring
 * and team size.
 */
const PICK = (sel, value) =>
	`() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NO FIELD'; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return 'picked: ' + el.value; }`;

export default {
	path: '/dev/tournament-settings?status=live&unplayed=1',
	label: 'Tournament settings, live with nothing played: the match lengths still change',
	settleMs: 500,
	prepare: [
		{
			evaluate: PICK('[data-testid="tournament-settings"] [data-field="best_of_default"]', '5'),
			until: `() => !!document.querySelector('[data-testid="settings-dirty"]')`,
			attempts: 12,
			waitMs: 200
		},
		{
			evaluate: PICK('[data-testid="tournament-settings"] [data-field="grand_final"]', '7'),
			until: `() => document.querySelector('[data-field="grand_final"]').value === '7'`,
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
		{ selector: '.tnm-root[data-testid="harness-room"]', label: 'the tournaments room mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="tournament-settings"][data-format-locked="false"]', label: 'the form reports the format open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-field="best_of_default"]:not(:disabled), [data-field="grand_final"]:not(:disabled)', label: 'the two length selects are live', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-field="team_size"]:disabled', label: 'team size holds', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="settings-format-fields"] input[type="checkbox"]:disabled', label: 'qualifying and scoring hold', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="settings-score-lock"]', label: 'the reason, said once', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-quals-lock"], [data-testid="settings-team-lock"], [data-testid="settings-format-lock"]', label: 'no repeat of the same sentence', expectPresent: 0 },
		{ selector: '[data-testid="settings-saved"]', label: 'the new lengths saved and say so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-error"]', label: 'no refusal', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'the call carried the new lengths and the held settings unchanged',
			evaluate: `() => { const c = JSON.parse(document.querySelector('[data-testid="last-args"]').textContent); const f = c.args.p_config; return [c.rpc, f.best_of_default, f.best_of.grand_final, f.quals_enabled, f.score_entry, f.team_size]; }`,
			expected: ['tournament_update', 5, 7, false, true, 2]
		}
	],
	textContains: [
		{ selector: '[data-testid="settings-score-lock"]', label: 'the reason names what can still change', must: ['only the match lengths can change until the first match starts'], mustNot: ['—', '–'] }
	],
	tapTargets: [
		{ selector: '[data-testid="settings-format-fields"] select', label: 'format selects', min: 44 },
		{ selector: '[data-testid="tournament-settings"] .btn', label: 'Save', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="settings-score-lock"]', label: 'the lock sentence', min: 4.5 },
		{ selector: '[data-testid="settings-saved"]', label: 'the saved acknowledgement', min: 4.5 }
	]
};
