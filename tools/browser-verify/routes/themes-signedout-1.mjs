/**
 * THE SESSION GATE, MEASURED IN THE DIRECTION THAT MATTERS.
 *
 * The theme's control lives in `ProfileMenu`, which renders NOTHING when
 * signed out. So a theme that survived sign-out would be a theme the next
 * person at a shared school workstation cannot turn off, on a public page that
 * offers them no control at all -- and `/`, `/maps`, `/assignments/*` and the
 * tournament section are all genuinely public, so this is a real case and not
 * a corner. `ThemeRoot` therefore writes the attribute only when there is a
 * session.
 *
 * `?signedout=1` DROPS `claims` FROM THE HARNESS LOAD, which is the same
 * absence a public page has. The gate lives in `ThemeRoot`, mounted once in
 * the root layout, so it is the identical code path a real `/maps` visit
 * takes -- and `/maps` itself was measured this way by hand (attribute null,
 * --bg0 back at #121a12, zero ProfileMenu roots) and reported in the history
 * entry.
 *
 * THE PREPARE STEP IS THE POSITIVE CONTROL, and without it this spec would be
 * asserting nothing: a page that never had the preference set would answer "no
 * theme" whatever the gate did. It PUTS THE STORED PREFERENCE IN PLACE FIRST,
 * reloads so the module reads it at init exactly as it would for a returning
 * visitor, and only then asks. A `data-theme` of null after that is the gate
 * refusing, not the absence of anything to refuse.
 *
 * The final step reads the stored key back: the preference is KEPT, not
 * cleared. Signing in restores the theme; a visitor never loses a choice they
 * made, they simply do not get it applied where they could not undo it.
 */
export default {
	path: '/dev/themes?signedout=1',
	label: 'Site theme: a signed-out visitor gets the base palette, preference intact',
	prepare: [
		{
			evaluate: `() => { localStorage.setItem('idea_site_theme','matrix'); return localStorage.getItem('idea_site_theme'); }`,
			label: 'store the Matrix preference for this browser'
		},
		{
			evaluate: `() => { location.reload(); return 'reloading'; }`,
			label: 'reload so the module reads it at init'
		},
		{
			waitFor: `() => !!document.querySelector('.harness') && localStorage.getItem('idea_site_theme') === 'matrix'`,
			label: 'page back with the preference still stored'
		},
		{
			evaluate: `() => 'data-theme=' + JSON.stringify(document.documentElement.getAttribute('data-theme')) +
				' bg0=' + getComputedStyle(document.documentElement).getPropertyValue('--bg0').trim() +
				' stored=' + JSON.stringify(localStorage.getItem('idea_site_theme'))`,
			label: 'the gate, the ground it left in place, and the kept preference'
		}
	],
	presence: [
		/* THE REFUSAL, ASSERTED AS AN ABSENCE WITH A POSITIVE CONTROL BESIDE IT.
		   `html:not([data-theme])` matching 1 is the gate holding; `[data-theme]`
		   matching 0 is the same fact from the other side, and the pair is what
		   stops a selector typo reading as a pass. */
		{ selector: 'html:not([data-theme])', label: 'document carries NO theme', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-theme]', label: 'nothing anywhere is themed', expectPresent: 0, maxPresent: 0 },
		/* And the reason the gate exists: there is no control on this page. */
		{ selector: '.pm-root', label: 'ProfileMenu (signed out)', expectPresent: 0, maxPresent: 0 },
		/* The gate holds the rain off with the tokens: the canvas is mounted
		   keyed on the same applied attribute, so a signed-out visitor with
		   the preference stored gets neither. */
		{ selector: '.bg-fx canvas', label: 'rain canvas (signed out, preference stored)', expectPresent: 0, maxPresent: 0 }
	],
	motion: [{ selector: '.bg-fx', label: 'background layer stays unthemed', expect: 'never' }]
};
