/**
 * THE CLASSROOM SETTINGS PANEL, as a teacher: open it from the header, choose
 * Compact and "A class opens on: Drafts", and read where each one went.
 *
 * DENSITY FOLLOWS THE DEVICE and lands in this browser's own slot and on the
 * classroom root as `data-density`; THE VIEW A CLASS OPENS ON FOLLOWS THE
 * ACCOUNT and lands in the profile row's `classroom` namespace through the
 * shipping read-then-merge writer -- beside `homepage`, which must survive the
 * write untouched. The class page takes the new default in front of the
 * teacher (the Drafts chip pressed) without a reload.
 *
 * Every group has a Reset, and a group still at its default says "Default"
 * instead of offering one.
 */
import { MANAGER, READY } from './_classroom-palette.mjs';
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';

const SETTINGS_OPEN = '() => !!document.querySelector(\'dialog[data-testid="classroom-settings"]\')';

export default {
	path: `${MANAGER}&state=settings`,
	aliasOf: MANAGER,
	label: 'Classroom settings (teacher): density and the view a class opens on',
	prepare: [
		OPEN_SHELL_MENU,
		READY,
		{ click: '[data-testid="settings-trigger"]', until: SETTINGS_OPEN },
		{
			click: '[data-testid="settings-option-display-compact"]',
			until: '() => document.querySelector(".cr-root")?.getAttribute("data-density") === "compact"'
		},
		{
			click: '[data-testid="settings-option-classView-drafts"]',
			until: '() => document.querySelector(\'[data-testid="stream-status-drafts"]\')?.getAttribute("aria-pressed") === "true"'
		},
		{ waitFor: '() => window.__paletteProbe().rowWrites >= 1', timeoutMs: 5000 }
	],
	orderResult: [
		{
			label: 'density on the device, the class view on the account, homepage untouched',
			evaluate:
				'() => { const p = window.__paletteProbe(); return [p.density, JSON.stringify(p.local), JSON.stringify(p.row)]; }',
			expected: [
				'compact',
				'{"display":{"density":"compact"}}',
				'{"homepage":{"pinned":["gauntlet"]},"classroom":{"classView":{"opensOn":"drafts"}}}'
			]
		}
	],
	presence: [
		{ selector: 'dialog[data-testid="classroom-settings"]', label: 'the panel, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-reset-display"]', label: 'Reset for density', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-reset-classView"]', label: 'Reset for the class view', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-default-search"]', label: 'an untouched group says Default instead of offering a Reset', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-reset-search"]', label: 'no Reset where there is nothing to reset', expectPresent: 0 }
	],
	textContains: [
		{ selector: 'dialog[data-testid="classroom-settings"]', label: 'each group says where it lives', must: ['This device', 'Your account', 'Density', 'A class opens on'] }
	],
	contrast: [
		{ selector: '[data-testid="classroom-settings"] .cs-home', label: 'where a group lives', min: 4.5 },
		{ selector: '[data-testid="classroom-settings"] .cs-option', label: 'a choice', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="classroom-settings"] .cs-option', label: 'choices' },
		{ selector: '[data-testid^="settings-reset-"]', label: 'Reset' },
		{ selector: '[data-testid="settings-close"]', label: 'Close' }
	]
};
