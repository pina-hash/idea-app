/**
 * A REFUSAL, THEN DISCARD (ledger 0298, R02 review). The stand-in refuses a
 * team-size change with `tournament_update`'s own text. The host then presses
 * Discard changes: the stored values come back on screen, and the refusal --
 * which described the draft that was just thrown away -- goes with it rather
 * than sitting beside values it is no longer about. The refusal is checked
 * verbatim BEFORE the discard (a prepare step's `until`), so its absence
 * afterwards is not the refusal simply never having appeared.
 */
export default {
	path: '/dev/tournament-settings?status=registration_open&refuse=team',
	label: 'Tournament settings, a refusal then Discard: the stored values return and the refusal goes',
	settleMs: 500,
	prepare: [
		{
			evaluate: `() => { const el = document.querySelector('[data-testid="tournament-settings"] [data-field="team_size"]'); if (!el) return 'NO FIELD'; el.value = '1'; el.dispatchEvent(new Event('change', { bubbles: true })); return 'picked: ' + el.value; }`,
			until: `() => !!document.querySelector('[data-testid="settings-dirty"]')`,
			attempts: 12,
			waitMs: 200
		},
		{
			click: '[data-action="settings-submit"]',
			until: `() => (document.querySelector('[data-testid="settings-error"]')?.textContent ?? '').includes('team_size cannot be lower than the largest entry (3 registrants).')`,
			attempts: 12,
			waitMs: 300
		},
		{
			click: '[data-action="settings-discard"]',
			until: `() => !document.querySelector('[data-testid="settings-dirty"]')`,
			attempts: 12,
			waitMs: 200
		}
	],
	presence: [
		{ selector: '[data-testid="settings-error"]', label: 'the refusal went with the discarded draft', expectPresent: 0 },
		{ selector: '[data-testid="settings-dirty"]', label: 'nothing unsaved after Discard', expectPresent: 0 },
		{ selector: '[data-testid="settings-saved"]', label: 'nothing claims it saved', expectPresent: 0 },
		/* Positive control in the same state: the form is still there and live. */
		{ selector: '[data-testid="tournament-settings"] [data-field="team_size"]:not(:disabled)', label: 'the team-size field is still live', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'the refused call carried the new size; the field is back on the stored one',
			evaluate: `() => { const c = JSON.parse(document.querySelector('[data-testid="last-args"]').textContent).args; return [String(c.p_config && c.p_config.team_size), document.querySelector('[data-field="team_size"]').value]; }`,
			expected: ['1', '2']
		}
	]
};
