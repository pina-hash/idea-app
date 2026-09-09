/**
 * THE ADMIN ROSTER PANEL AS THE OWNER SEES IT: the grant form and a Remove
 * control per non-owner row, every one on the 44px floor, and the two-step
 * confirm reached through a real press. `portal-admin.mjs` is the negative
 * control (no form, no Remove, for a non-owner).
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/portal-admin?owner=1',
	label: 'Admin console as the owner: grant form, remove controls, two-step confirm',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		{
			click: '.ar-row:not(.owner) .ar-btn',
			until: `() => !!document.querySelector('.ar-btn.danger')`,
			label: 'Remove arms a confirm that names the address'
		},
		{
			evaluate: `() => document.querySelector('.ar-btn.danger').textContent.trim()`,
			label: 'the confirm control, in its own words'
		}
	],
	presence: [
		{ selector: '[data-testid="admin-grant-form"]', label: 'the grant form (owner only)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.ar-row', label: 'admin rows', expectPresent: 3, maxPresent: 3 },
		{ selector: '.ar-row.owner', label: 'the pinned owner row', expectPresent: 1, maxPresent: 1 },
		{ selector: '.ar-btn.danger', label: 'the armed confirm', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.ar-btn', label: 'roster buttons', min: 4.5 },
		{ selector: '.ar-field span', label: 'grant form labels', min: 4.5 },
		{ selector: '.owner-tag', label: 'owner tag', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.ar-btn', label: 'roster buttons, confirm included', min: 44 },
		{ selector: '.ar-field input', label: 'grant form inputs', min: 44 },
		{ selector: '[data-testid="admin-grant-form"] .btn', label: 'Grant admin', min: 44 }
	]
};
