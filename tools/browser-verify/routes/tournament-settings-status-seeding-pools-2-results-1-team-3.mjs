/**
 * TOURNAMENT SETTINGS IN SEEDING, POOLS DRAWN, ONE QUALIFYING RESULT IN, A
 * TEAM OF THREE REGISTERED (ledger 0298, R02: TRIAGE's suspect edge).
 *
 * `tournament_update` still accepts `quals_enabled: false` here, and the
 * bracket generator would then ignore the pools while they stay in the tables
 * and on every entry page. So the form locks the qualifying toggle once pools
 * exist, and the score-entry toggle once a result is in (scores break ties in
 * the pool standings), each with its reason under it. Everything else in the
 * format stays live: three selects enabled is the positive control. The team
 * size may not go under the largest roster, which the RPC refuses naming the
 * number: sizes 1 and 2 are offered disabled, with a sentence saying why.
 */
export default {
	path: '/dev/tournament-settings?status=seeding&pools=2&results=1&team=3',
	label: 'Tournament settings, seeding with pools and a result: qualifying and scores locked with reasons',
	settleMs: 500,
	presence: [
		{ selector: '[data-testid="tournament-settings"][data-format-locked="false"]', label: 'the format as a whole is still editable', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-field="quals_enabled"]:disabled', label: 'qualifying toggle locked', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-field="score_entry"]:disabled', label: 'score-entry toggle locked', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="settings-quals-lock"]', label: 'the qualifying reason', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-score-lock"]', label: 'the score-entry reason', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-format-fields"] select:not(:disabled)', label: 'the three selects stay live', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		/* An <option> in a closed <select> has no box, so these two rows count
		   presence only (expectVisible 0): measured zero-box at both widths. */
		{ selector: '[data-field="team_size"] option:disabled', label: 'team sizes under the largest roster (1, 2) offered disabled', expectPresent: 2, maxPresent: 2, expectVisible: 0 },
		{ selector: '[data-field="team_size"] option:not(:disabled)', label: 'team sizes 3 to 6 still offered', expectPresent: 4, maxPresent: 4, expectVisible: 0 },
		{ selector: '[data-testid="settings-team-floor"]', label: 'the team-size floor, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-format-lock"], [data-testid="settings-format-summary"]', label: 'no whole-format lock before the bracket', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="settings-quals-lock"]', label: 'why qualifying is locked', must: ['Qualifying pools have already been drawn', 'leave the pools, and any results in them, behind'], mustNot: ['—', '–'] },
		{ selector: '[data-testid="settings-score-lock"]', label: 'why score entry is locked', must: ['Qualifying results are already recorded', 'Scores break ties in the pool standings'], mustNot: ['—', '–'] },
		{ selector: '[data-testid="settings-team-floor"]', label: 'the floor names the number', must: ['An entry already has 3 registrants, so the size cannot go below 3.'] }
	],
	tapTargets: [
		{ selector: '[data-testid="tournament-settings"] .ts-toggle', label: 'both toggles, locked or not, measured at the label', min: 44 },
		{ selector: '[data-testid="tournament-settings"] select', label: 'the selects', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="settings-quals-lock"]', label: 'the qualifying reason', min: 4.5 },
		{ selector: '[data-testid="settings-score-lock"]', label: 'the score-entry reason', min: 4.5 },
		{ selector: '[data-testid="settings-team-floor"]', label: 'the team floor sentence', min: 4.5 },
		{ selector: '[data-testid="tournament-settings"] .ts-toggle > span', label: 'a locked toggle keeps its words at full ink', min: 4.5 }
	]
};
