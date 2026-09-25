/**
 * THE QUALIFYING LOCK ARRIVING MID-EDIT (ledger 0298, R02 review). Qualifying
 * is on and no pools exist, so the toggle is free; this host unticks it (an
 * unsaved edit). A co-host then draws pools, and the refetch brings the lock.
 *
 * What must hold: the toggle goes back to TICKED as well as disabled, with
 * the reason under it, and nothing reads as unsaved. Before the fix it stayed
 * disabled and UNTICKED -- a locked control showing "off" while the save
 * would have sent "on", which is the stored value the lock keeps.
 */
export default {
	path: '/dev/tournament-settings?status=seeding&quals=1&cohost=1',
	label: 'Tournament settings: pools drawn mid-edit put the qualifying toggle back on its stored value',
	settleMs: 500,
	prepare: [
		{
			click: '[data-testid="tournament-settings"] [data-field="quals_enabled"]',
			until: `() => { const el = document.querySelector('[data-field="quals_enabled"]'); return !!el && !el.checked && !!document.querySelector('[data-testid="settings-dirty"]'); }`,
			attempts: 12,
			waitMs: 200
		},
		{
			click: '[data-action="harness-cohost-pools"]',
			until: `() => { const el = document.querySelector('[data-field="quals_enabled"]'); return !!el && el.disabled && el.checked; }`,
			attempts: 12,
			waitMs: 200
		}
	],
	presence: [
		{ selector: '[data-testid="tournament-settings"] [data-field="quals_enabled"]:disabled:checked', label: 'the locked toggle shows the stored value, on', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-quals-lock"]', label: 'the reason, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-dirty"]', label: 'nothing reads as unsaved', expectPresent: 0 },
		/* Positive control: the lock took only qualifying; score entry is free. */
		{ selector: '[data-testid="tournament-settings"] [data-field="score_entry"]:not(:disabled)', label: 'score entry still free', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="settings-quals-lock"]', label: 'why qualifying is locked', must: ['Qualifying pools have already been drawn'] }
	],
	tapTargets: [
		{ selector: '[data-action^="harness-cohost"]', label: 'the harness controls', min: 44 }
	]
};
