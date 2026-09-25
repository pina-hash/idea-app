/**
 * TOURNAMENT SETTINGS, FORMAT EDITABLE (ledger 0298, R02): the REAL
 * TournamentSettingsForm in the host console's Settings card, before the
 * bracket exists. Every format control is on screen and live, no lock
 * sentence and no read-only summary; this is the positive control for
 * `tournament-settings-status-live.mjs`, which asserts the same selectors
 * ABSENT. At rest nothing has changed, so Save is aria-disabled (it still
 * takes the press and says so) and there is no Discard.
 */
export default {
	path: '/dev/tournament-settings?status=draft',
	label: 'Tournament settings, draft: name, description and every format control editable',
	settleMs: 500,
	presence: [
		{ selector: '.tnm-root[data-testid="harness-room"]', label: 'the tournaments room mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="host-settings"] [data-testid="tournament-settings"][data-mode="edit"][data-format-locked="false"]', label: 'the form, in edit mode, format unlocked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tournament-settings"] [data-field="name"]:not(:disabled)', label: 'the name field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tournament-settings"] [data-field="description"]:not(:disabled)', label: 'the description field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-format-fields"] select:not(:disabled)', label: 'three format selects, all live (best of, registrants, grand final)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="settings-format-fields"] input[type="checkbox"]:not(:disabled)', label: 'two format toggles, both live (qualifying, scores)', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="settings-format-summary"]', label: 'no read-only summary while the format can change', expectPresent: 0 },
		{ selector: '[data-testid="settings-format-lock"], [data-testid="settings-quals-lock"], [data-testid="settings-score-lock"]', label: 'no lock sentence of any kind', expectPresent: 0 },
		{ selector: '[data-action="settings-submit"][aria-disabled="true"]', label: 'Save at rest: nothing changed, aria-disabled (never disabled)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-action="settings-submit"]:disabled', label: 'Save is not natively disabled at rest', expectPresent: 0 },
		{ selector: '[data-action="settings-discard"], [data-testid="settings-dirty"]', label: 'no Discard and no unsaved note at rest', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="host-settings"] h2', label: 'the card title', must: ['Settings'] },
		{ selector: '[data-testid="tournament-settings"] .ts-group', label: 'the format group label', must: ['Format'] },
		{ selector: '[data-testid="settings-format-fields"]', label: 'every format label, in the words the new page uses', must: ['Qualifying pools before the bracket', 'Record per-game scores', 'Best of (default, per match)', 'Registrants per entry', 'Grand final'], mustNot: ['—', '–'] },
		{ selector: '[data-action="settings-submit"]', label: 'the save word', must: ['Save settings'] }
	],
	tapTargets: [
		{ selector: '[data-testid="tournament-settings"] input[type="text"], [data-testid="tournament-settings"] textarea, [data-testid="tournament-settings"] select', label: 'every field', min: 44 },
		{ selector: '[data-testid="tournament-settings"] .ts-toggle', label: 'the two toggles, measured at the label', min: 44 },
		{ selector: '[data-testid="tournament-settings"] .btn', label: 'Save', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="tournament-settings"] .ts-row > span', label: 'field labels (mono, dim)', min: 4.5 },
		{ selector: '[data-testid="tournament-settings"] .ts-toggle > span', label: 'toggle labels', min: 4.5 },
		{ selector: '[data-testid="tournament-settings"] .ts-group', label: 'the Format group label', min: 4.5 },
		{ selector: '[data-testid="tournament-settings"] select', label: 'select text', min: 4.5 },
		{ selector: '[data-testid="tournament-settings"] [data-field="name"]', label: 'the name as typed', min: 4.5 }
	]
};
