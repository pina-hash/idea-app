/**
 * THE PROFILE MENU IN THE CLASSROOM'S APPLICATION FRAME, ONE SPEC PER THEME
 * (ledger 0298, report R18). `classroom-profile-menu.mjs` is the IDEA theme and
 * `classroom-profile-menu-state-space-white.mjs` is Space White; both are this
 * function, so the two themes are measured by one list of claims rather than
 * two copies that drift.
 *
 * WHAT R18 WAS, IN THIS FRAME. Above 1024px `.cr-app` is `100dvh` with
 * `overflow: hidden`, and the panel was an absolutely positioned box with no
 * max-height: taller than the window, its lower half -- Theme and Sign out --
 * was clipped by the frame and reachable by no scroll at all. The rows below
 * assert the fix from the component's side: the panel ends inside the window,
 * and with nothing expanded Theme and Sign out are on screen and take a press
 * WITHOUT any scroll (hit-tested at their own centres, which is the only read
 * that tells a covered control from a clickable one).
 *
 * The runner's window is 900px tall; the 375x667 reading the brief asks for is
 * a phone-height window this runner does not open, and is reported from a
 * scratch measurement in the ledger's history entry rather than asserted here.
 */
import { THEME_ROWS } from './_theme-shared.mjs';

export const classroomProfileMenuSpec = (theme) => ({
	path: theme === 'space-white' ? '/dev/classroom-profile-menu?state=space-white' : '/dev/classroom-profile-menu',
	label: `ProfileMenu in the classroom frame (${theme === 'space-white' ? 'Space White' : 'IDEA'}): fits, Theme and Sign out on screen`,
	prepare: [
		{
			waitFor:
				theme === 'space-white'
					? `() => document.documentElement.getAttribute('data-theme') === 'space-white' && !!document.querySelector('.pm-trigger')`
					: `() => !document.documentElement.getAttribute('data-theme') && !!document.querySelector('.pm-trigger')`,
			label: theme === 'space-white' ? 'Space White is applied and the menu is mounted' : 'the default theme, and the menu is mounted'
		},
		{
			click: '.pm-trigger',
			until: `() => !!document.querySelector('.pm-panel')`,
			label: 'open the panel from the trigger'
		},
		{
			evaluate: `() => { const el = document.querySelector('.pm-panel'); const p = el.getBoundingClientRect(); return 'panel ' + Math.round(p.width) + 'x' + Math.round(p.height) + ' at ' + Math.round(p.left) + ',' + Math.round(p.top) + ', bottom ' + Math.round(p.bottom) + ' of ' + innerHeight + '; scrollHeight ' + el.scrollHeight + ' clientHeight ' + el.clientHeight + '; max-height ' + getComputedStyle(el).maxHeight + '; document ' + document.documentElement.scrollHeight + ' tall'; }`,
			label: 'the panel against the window'
		}
	],
	presence: [
		{ selector: '.cr-root.cr-app', label: 'the application frame (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-panel', label: 'the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-select', label: 'the pathway, one labelled select', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-pathway', label: 'no pathway tiles', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="pm-picture-toggle"][aria-expanded="false"]', label: 'Change picture, closed on arrival', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="pm-identity-toggle"][aria-expanded="false"]', label: 'Identity, closed on arrival', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-theme', label: 'theme radios', expectPresent: THEME_ROWS, maxPresent: THEME_ROWS, expectVisible: THEME_ROWS },
		{ selector: '.pm-signout', label: 'Sign out', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'the panel ends inside the window',
			evaluate: `() => { const p = document.querySelector('.pm-panel').getBoundingClientRect(); return [p.bottom <= innerHeight + 0.5 ? 'ends inside the window' : 'RUNS PAST: bottom ' + Math.round(p.bottom) + ' of ' + innerHeight, p.left >= 0 && p.right <= innerWidth + 0.5 ? 'inside at both sides' : 'OFF EDGE ' + Math.round(p.left) + '..' + Math.round(p.right)]; }`,
			expected: ['ends inside the window', 'inside at both sides']
		},
		{
			/* WITHOUT SCROLLING: the panel's own scroll is at 0 and every theme
			   row and Sign out is inside both the panel's visible box and the
			   window, and takes the press at its centre. */
			label: 'every theme row and Sign out take a press with no scroll',
			evaluate: `() => { const el = document.querySelector('.pm-panel'); const hitOk = (n) => { const r = n.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === n || n.contains(h)); }; const rows = [...document.querySelectorAll('.pm-theme')]; const out = rows.filter(hitOk).length; return [el.scrollTop === 0 ? 'panel unscrolled' : 'PANEL SCROLLED ' + el.scrollTop, out + ' of ' + rows.length + ' theme rows hit', hitOk(document.querySelector('.pm-signout')) ? 'Sign out hit' : 'SIGN OUT COVERED OR OFF SCREEN']; }`,
			expected: ['panel unscrolled', `${THEME_ROWS} of ${THEME_ROWS} theme rows hit`, 'Sign out hit']
		},
		{
			/* THE ORDER IS WHAT KEEPS THE ROW ABOVE TRUE ON A SHORTER PANEL.
			   This frame has room for everything, so the hit test passes in any
			   order; on the home page at 375x667 the floating Report control
			   lifts the floor and the panel is clamped 31px short (measured,
			   0220 columns present), and it is then the LAST row that goes under
			   the footer. Theme sits above Identity so that row is Identity, an
			   optional visit, and never a theme radio. Change picture stays above
			   the theme so its tiles open in view under their own row. */
			label: 'Change picture, then Theme, then Identity',
			evaluate: `() => { const pic = document.querySelector('[data-testid="pm-picture-toggle"]'); const theme = document.querySelector('.pm-themes'); const idt = document.querySelector('[data-testid="pm-identity-toggle"]'); if (!pic || !theme || !idt) return ['MISSING: picture=' + !!pic + ' theme=' + !!theme + ' identity=' + !!idt]; const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); return [before(pic, theme) ? 'picture before theme' : 'THEME BEFORE PICTURE', before(theme, idt) ? 'theme before identity' : 'IDENTITY BEFORE THEME']; }`,
			expected: ['picture before theme', 'theme before identity']
		},
		{
			/* THE NAME IS NOT TINTED BY PATHWAY (decision 40, report R19). The
			   harness seeds IDEA, whose raw identity is the #00FF41 that
			   measured 1.29:1 on Space White's panel before this fix.
			   Compared against --text-1 resolved in the panel, so a retune of
			   the token cannot redden it and any tint does. */
			label: 'the display name reads --text-1',
			evaluate: `() => { const el = document.querySelector('.pm-name'); const probe = document.createElement('span'); probe.style.color = 'var(--text-1)'; document.querySelector('.pm-panel').appendChild(probe); const want = getComputedStyle(probe).color; probe.remove(); const got = el ? getComputedStyle(el).color : 'NO NAME'; return [got === want ? 'name is --text-1' : 'TINTED ' + got + ' (text-1 is ' + want + ')']; }`,
			expected: ['name is --text-1']
		},
		{
			/* THE FIXTURE REPRODUCES THE CLIP, which is the positive control for
			   every row above: above 1024px the document must be exactly the
			   window (the frame's `overflow: hidden` is what made R18's lower
			   half unreachable), and below 1024px the classroom is an ordinary
			   document by design, so there is nothing to hold. The document's
			   height is printed by the last prepare step either way. */
			label: 'above 1024px the frame is the window, as in a console route',
			evaluate: `() => [innerWidth < 1024 || document.documentElement.scrollHeight <= innerHeight + 1 ? 'fixture holds' : 'DOCUMENT SCROLLS ' + document.documentElement.scrollHeight + ' > ' + innerHeight]`,
			expected: ['fixture holds']
		}
	],
	contrast: [
		{ selector: '.pm-name', label: 'the display name', min: 4.5 },
		{ selector: '.pm-role', label: 'role', min: 4.5 },
		{ selector: '.pm-email', label: 'address', min: 4.5 },
		{ selector: '.pm-label', label: 'section labels', min: 4.5 },
		{ selector: '.pm-select', label: 'the pathway select value', min: 4.5 },
		{ selector: '.pm-note', label: 'the pathway sentence', min: 4.5 },
		{ selector: '.pm-pic-now', label: 'the current picture, named', min: 4.5 },
		{ selector: '.pm-theme-name', label: 'theme names', min: 4.5 },
		{ selector: '.pm-theme-note', label: 'theme notes', min: 4.5 },
		{ selector: '.pm-link', label: 'Sign out', min: 4.5 },
		{ selector: '.pm-panel', label: 'the panel edge', min: 3 },
		/* UNDER THE PROJECTOR MODEL too, because Space White exists for the
		   projector: the name at the body-text floor and the sentence at the
		   muted floor (PROJECTOR_MODEL in checks.mjs). */
		{ selector: '.pm-name', label: 'the display name, projected', min: 4.5, projector: true },
		{ selector: '.pm-note', label: 'the pathway sentence, projected', min: 3, projector: true }
	],
	tapTargets: [
		{ selector: '.pm-edit', label: 'Edit name', min: 44 },
		{ selector: '.pm-select', label: 'the pathway select', min: 44 },
		{ selector: '[data-testid="pm-picture-toggle"]', label: 'Change picture', min: 44 },
		{ selector: '[data-testid="pm-identity-toggle"]', label: 'Identity', min: 44 },
		{ selector: '.pm-theme', label: 'the theme radios', min: 44 },
		{ selector: '.pm-link', label: 'Sign out', min: 44 }
	]
});
