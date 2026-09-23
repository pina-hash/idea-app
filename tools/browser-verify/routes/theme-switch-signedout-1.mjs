/**
 * THE SWITCH'S ABSENCE, SIGNED OUT (ledger 0297). No session, no theme
 * applies (`themeAttrFor` refuses every theme signed out), so a control whose
 * only effect would be invisible is not offered -- the same gate the profile
 * menu has always had. Asserted as an absence WITH positive controls beside
 * it: the classroom room and its class switcher did render, so a zero on the
 * switch row is the gate and not an empty page.
 */
export default {
	path: '/dev/theme-switch?signedout=1',
	label: 'Classroom masthead signed out: no theme switch, no profile menu, no theme',
	presence: [
		{ selector: '.cr-root', label: 'the classroom room rendered (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-strip"]', label: 'the class row rendered (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="theme-switch"]', label: 'the theme switch (must be absent)', expectPresent: 0, maxPresent: 0 },
		{ selector: '.pm-root', label: 'the profile menu (absent signed out)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-theme]', label: 'nothing is themed', expectPresent: 0, maxPresent: 0 }
	]
};
