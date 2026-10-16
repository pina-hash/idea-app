/**
 * AN ADMIN CHANGES A LIVE TOURNAMENT (ledger 0392, migration 0266, report
 * d1d40a60: "In the case that I accidentally start a tournament without
 * scoring enabled ... I need to be able to change that when the tournament is
 * in progress already").
 *
 * The harness's live event (3 matches decided, 1 started, 4 not started) with
 * the viewer a site admin. The steps do what he would: turn scoring off (the
 * fixture has it on), lengthen the default to best of 5, press Save. Nothing is
 * written: the confirm opens and says, in words, what changes AND what happens
 * to the matches already played. Apply then writes it.
 *
 * The negative control is the plain `status=live` spec beside this one, where
 * the same event shows the format as locked text with no controls.
 */
const PICK = (sel, value) =>
	`() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NO FIELD'; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; }`;

export default {
	path: '/dev/tournament-settings?status=live&admin=1',
	label: 'Tournament settings: a site admin changes a live event, with a confirm that names the effect',
	settleMs: 500,
	prepare: [
		{
			click: '[data-field="score_entry"]',
			until: `() => document.querySelector('[data-field="score_entry"]').checked === false`,
			attempts: 12,
			waitMs: 200
		},
		{
			evaluate: PICK('[data-field="best_of_default"]', '5'),
			until: `() => !!document.querySelector('[data-testid="settings-dirty"]')`,
			attempts: 12,
			waitMs: 200
		},
		{
			click: '[data-action="settings-submit"]',
			until: `() => !!document.querySelector('[data-testid="live-settings-confirm"]')`,
			attempts: 12,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '[data-testid="settings-live-note"]', label: 'the live-edit note above the controls', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-format-fields"]', label: 'the format controls (unlocked for an admin)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-format-lock"]', label: 'no whole-format lock', expectPresent: 0 },
		{ selector: '[data-testid="settings-quals-lock"]', label: 'qualifying alone stays locked, with its reason', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-field="quals_enabled"]:disabled', label: 'the qualifying toggle disabled', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="live-settings-confirm"]', label: 'the confirm, before anything is written', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-saved"]', label: 'nothing saved yet', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="live-settings-confirm"]',
			label: 'the confirm names the change and the effect on played matches and coins',
			must: [
				'Scoring turns OFF',
				'best of 3 to best of 5',
				'3 matches are already decided',
				'Nothing is re-decided',
				'4 matches that have not started take the new length',
				'4 matches already started or played keep',
				'No coins move'
			]
		},
		{ selector: '[data-testid="last-args"]', label: 'the only call so far is the preview', must: ['tournament_live_config_preview'], mustNot: ['tournament_live_config_apply', 'tournament_update'] }
	],
	tapTargets: [
		{ selector: '[data-action="live-settings-apply"]', label: 'Apply to the live event', min: 44 },
		{ selector: '[data-action="live-settings-cancel"]', label: 'Cancel', min: 44 }
	]
};
