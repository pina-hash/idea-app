/**
 * THE CLASSROOM'S ONE-TAP THEME SWITCH (ledger 0297, package F1a), in the REAL
 * `ClassroomShell` masthead beside the real profile menu, on a page carrying a
 * session -- the only classroom harness that does, and so the only place the
 * masthead has ever been measured with its profile menu in it.
 *
 * THE ROUND TRIP IS THE PREPARE, THROUGH THE SWITCH ITSELF: on, off, on. Each
 * press is judged by what the document did -- the attribute, `aria-pressed`,
 * the stored key and the theme-color -- so a switch that stopped working fails
 * above the numbers it would otherwise invalidate. Off leaves no attribute
 * and no stored key, the same "turning it off is complete" claim the profile
 * menu's rows make.
 *
 * THEN IT MEASURES THE LIGHT ROOM AS A STUDENT SEES IT, on a monitor and on
 * the wall (the projector model in ../checks.mjs): the switch's own word, the
 * class switcher, the trail, and a card of the register's tiers and status
 * chips. Run `--width 1280` for the projector profile.
 */
export default {
	path: '/dev/theme-switch',
	label: 'Classroom masthead: the one-tap Space White switch, on, off and on again',
	prepare: [
		{
			click: '[data-testid="theme-switch"]',
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white' && document.querySelector('[data-testid="theme-switch"]').getAttribute('aria-pressed') === 'true' && localStorage.getItem('idea_site_theme') === 'space-white' && document.querySelector('meta[name="theme-color"]').content === '#E8ECEB'`,
			label: 'press: Space White on, pressed, stored, theme-color light'
		},
		{
			click: '[data-testid="theme-switch"]',
			until: `() => document.documentElement.getAttribute('data-theme') === null && document.querySelector('[data-testid="theme-switch"]').getAttribute('aria-pressed') === 'false' && localStorage.getItem('idea_site_theme') === null && document.querySelector('meta[name="theme-color"]').content === '#0A0C0D'`,
			label: 'press again: back to the default, nothing left behind'
		},
		{
			click: '[data-testid="theme-switch"]',
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`,
			label: 'press once more: on, and measured in this state'
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the classroom room (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.pm-root', label: 'the profile menu, beside it', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="theme-switch"]', label: 'the switch, in the masthead', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.cr-header [data-testid="theme-switch"]', label: 'and it is inside the classroom header', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="theme-switch"][aria-pressed="true"]', label: 'pressed', expectPresent: 1, maxPresent: 1 },
		{ selector: 'html[data-theme="space-white"]', label: 'the theme is on <html>', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '[data-testid="theme-switch"] .ts-word', label: 'the switch word', min: 4.5 },
		{ selector: '.sw-trigger .sw-name', label: 'class switcher name', min: 4.5 },
		{ selector: '.sw-trigger .sw-code', label: 'class switcher course code (gold ink)', min: 4.5 },
		{ selector: '[data-testid="crumbs"] a, [data-testid="crumbs"] [aria-current]', label: 'trail', min: 4.5 },
		{ selector: '.ts-copy', label: 'card body copy', min: 4.5 },
		{ selector: '.ts-eyebrow, .ts-meta', label: 'card micro-label and meta', min: 4.5 },
		{ selector: '.ts-chip', label: 'status chips on their fills', min: 4.5 },
		{ selector: '.ts-copy, .sw-trigger .sw-name', label: 'body copy on the wall', min: 4.5, projector: true },
		{ selector: '.ts-eyebrow, .ts-meta, .ts-chip, [data-testid="theme-switch"] .ts-word', label: 'muted copy and status on the wall', min: 3, projector: true }
	],
	tapTargets: [{ selector: '[data-testid="theme-switch"]', label: 'the switch', min: 44 }]
};
