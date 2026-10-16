/**
 * The same live-event change as `tournament-settings-status-live-admin-1.mjs`,
 * carried through: Apply writes it, the confirm goes away, the acknowledgement
 * says how many upcoming matches changed, and the form now holds the new
 * format with nothing left unsaved.
 */
import base from './tournament-settings-status-live-admin-1.mjs';

export default {
	path: '/dev/tournament-settings?status=live&admin=1&state=applied',
	aliasOf: '/dev/tournament-settings?status=live&admin=1',
	label: 'Tournament settings: the live change applied',
	settleMs: 500,
	prepare: [
		...base.prepare,
		{
			click: '[data-action="live-settings-apply"]',
			until: `() => !document.querySelector('[data-testid="live-settings-confirm"]') && !!document.querySelector('[data-testid="settings-saved"]')`,
			attempts: 12,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '[data-testid="live-settings-confirm"]', label: 'the confirm closed', expectPresent: 0 },
		{ selector: '[data-testid="settings-dirty"]', label: 'nothing left unsaved', expectPresent: 0 },
		{ selector: '[data-field="score_entry"]:not(:checked)', label: 'scoring now off', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="settings-saved"]', label: 'the acknowledgement counts the upcoming matches', must: ['Live settings changed', '4 upcoming matches were updated'] },
		{ selector: '[data-testid="last-args"]', label: 'the apply sent the config the preview was made against', must: ['tournament_live_config_apply', 'p_expected_config'] }
	]
};
