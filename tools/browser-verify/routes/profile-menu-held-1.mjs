/**
 * A STUDENT WHOSE PICTURE A SITE ADMIN TURNED OFF OPENS THEIR PICKER (ledger
 * 0392, migration 0267). `?held=1` makes the harness's stub answer
 * `profile_avatar_my_hold` with held: true. The picker's controls are replaced
 * by the one sentence saying why, because every save from them would be
 * refused by the database's lock. The negative control is
 * `profile-menu-state-open.mjs`, the same press with no hold, where the
 * picker is there and the sentence is not (asserted there).
 */
export default {
	path: '/dev/profile-menu?held=1',
	label: 'Profile panel: a picture a site admin turned off shows why, not a picker',
	prepare: [
		{ click: '.pm-trigger', until: `() => !!document.querySelector('.pm-panel')`, label: 'open the panel' },
		{
			click: '[data-testid="pm-picture-toggle"]',
			until: `() => document.querySelector('[data-testid="pm-picture-toggle"]').getAttribute('aria-expanded') === 'true' && !!document.querySelector('[data-testid="pm-picture-held"]')`,
			label: 'open Change picture'
		}
	],
	presence: [
		{ selector: '[data-testid="pm-picture-held"]', label: 'the sentence saying why', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="pm-picker"]', label: 'no picker to be refused', expectPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="pm-picture-held"]', label: 'it says who and what to do', must: ['turned off by a site admin', 'Ask a teacher'] }],
	contrast: [{ selector: '[data-testid="pm-picture-held"]', label: 'the sentence', min: 4.5 }],
	tapTargets: []
};
