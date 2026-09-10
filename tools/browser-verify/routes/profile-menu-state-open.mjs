/**
 * THE PROFILE PANEL, OPEN, AT BOTH WIDTHS (ledger 0117, report 23). The
 * `profile-menu.mjs` spec measures the CLOSED trigger's reach; this one
 * presses that trigger (the shipping path, not a mount-open) and measures the
 * panel a student customises their profile in. `?state=open` is only what
 * gives this spec a filename of its own -- the harness page ignores it and
 * the press below is what opens the panel.
 *
 * WHAT WAS THERE BEFORE THIS BUNDLE, measured on the same harness: Edit,
 * Upload image and Use Google photo were ~15px underlined words; the eight
 * presets were ~32px circles eight across with no visible name; Save/Cancel
 * and Dashboard/Sign out were ~30px. Every row below is a control at the
 * 44px floor now, and every preset carries its word.
 */
export default {
	path: '/dev/profile-menu?state=open',
	label: 'ProfileMenu panel open: every control at 44px, every preset named',
	prepare: [
		{
			click: '.pm-trigger',
			until: `() => !!document.querySelector('.pm-panel')`,
			label: 'open the panel from the trigger'
		},
		{
			click: '.pm-btn',
			until: `() => !!document.querySelector('.pm-name-edit input')`,
			label: 'Edit name opens the inline field and the panel stays open'
		},
		{
			evaluate: `() => { const p = document.querySelector('.pm-panel').getBoundingClientRect(); return 'panel ' + Math.round(p.width) + 'x' + Math.round(p.height) + ' at x=' + Math.round(p.left) + ' (viewport ' + innerWidth + '); right edge ' + Math.round(p.right) + '; off-edge ' + (p.left < 0 || p.right > innerWidth ? 'YES' : 'no'); }`,
			label: 'the panel against the viewport edge'
		}
	],
	presence: [
		{ selector: '.pm-panel', label: 'the panel (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-preset', label: 'eight preset controls', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: '.pm-preset .pm-preset-word', label: 'a word on every preset', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: '.pm-preset[aria-pressed="true"]', label: 'exactly one preset pressed', expectPresent: 1, maxPresent: 1 },
		{ selector: '.pm-name-edit input', label: 'the name field, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-theme', label: 'theme radios', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	orderResult: [
		{
			label: 'the panel sits inside the viewport at this width',
			evaluate: `() => { const p = document.querySelector('.pm-panel').getBoundingClientRect(); return [p.left >= 0 && p.right <= innerWidth + 0.5 ? 'inside the viewport' : 'off edge: ' + Math.round(p.left) + '..' + Math.round(p.right) + ' of ' + innerWidth]; }`,
			expected: ['inside the viewport']
		}
	],
	contrast: [
		{ selector: '.pm-role', label: 'role', min: 4.5 },
		{ selector: '.pm-email', label: 'email', min: 4.5 },
		{ selector: '.pm-label', label: 'section labels', min: 4.5 },
		{ selector: '.pm-preset-word', label: 'preset words', min: 4.5 },
		{ selector: '.pm-preset.selected .pm-preset-word', label: 'the selected preset word on its tint', min: 4.5 },
		{ selector: '.pm-btn', label: 'control words', min: 4.5 },
		{ selector: '.pm-field span', label: 'the name field label', min: 4.5 },
		{ selector: '.pm-link', label: 'the action links', min: 4.5 },
		{ selector: '.pm-theme-note', label: 'theme notes', min: 4.5 },
		{ selector: '.pm-panel', label: 'the panel edge on the header', min: 3 }
	],
	tapTargets: [
		{ selector: '.pm-btn', label: 'Save name, Cancel, Upload a picture, Use Google photo', min: 44 },
		{ selector: '.pm-name-edit input', label: 'the name field', min: 44 },
		{ selector: '.pm-preset', label: 'the eight presets', min: 44 },
		{ selector: '.pm-theme', label: 'the theme radios', min: 44 },
		{ selector: '.pm-link', label: 'Sign out (and Admin console for an admin)', min: 44 }
	]
};
