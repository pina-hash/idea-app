import { SETTLE_ENTRANCE } from './_shared.mjs';
/**
 * THE HOME PAGE SIGNED OUT (ledger 0297, package F1b): the full hero, and no
 * theme however one is stored.
 *
 * WHY THIS SPEC EXISTS. The hero used to be one block for every viewer. A
 * signed-in visitor now gets the COMPACT hero -- the title and the three stats
 * on one row, no eyebrow and no subtitle -- so their classes sit above the fold
 * at 1366x768 (they were at y 835, the hero alone 540px tall; measured 400 and
 * 104 after). The subtitle's words are REPORT 13's (Mr. Pina, 2026-09-11) and
 * address a visitor who has not signed in, so they moved here with the
 * audience they were written for; `tour-mode-picker.mjs`, which drives a
 * signed-in page, used to pin them and now pins their absence.
 *
 * AND THE SCOPE HALF. A site theme applies only to a signed-in viewer on an
 * in-scope route (`themeAttrFor` in src/lib/theme.ts). The store is seeded
 * with Space White before the page boots, and the attribute must still be
 * absent: the home page is in scope for a session, never for the anonymous
 * landing page.
 */
export default {
	path: '/dev/home-order?signedout=1',
	label: 'Home page signed out: the full hero with its subtitle, and no site theme',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150, label: 'settle the entrance' },
		{
			evaluate: `() => { localStorage.setItem('idea_site_theme', 'space-white'); return 'stored space-white; attribute now ' + document.documentElement.getAttribute('data-theme'); }`,
			label: 'store Space White, as a signed-in visit on this browser would have left it'
		}
	],
	presence: [
		{ selector: 'html[data-theme]', label: 'no theme attribute on the anonymous landing page', expectPresent: 0, maxPresent: 0 },
		{ selector: '.legacy-index .hero:not(.compact)', label: 'the full hero', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.legacy-index .hero-eyebrow', label: 'hero eyebrow', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.legacy-index .hero-sub', label: 'hero subtitle', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.legacy-index .signin', label: 'sign-in control', expectPresent: 1, expectVisible: 1 }
	],
	/* REPORT 13: the subtitle addresses the whole school and names what needs
	   no account. Pinned on the load-bearing phrases rather than the sentence,
	   so a wording pass stays free. */
	textContains: [
		{ selector: '.legacy-index .hero-sub', text: 'whole school', label: 'subtitle addresses the whole school' },
		{ selector: '.legacy-index .hero-sub', text: 'open to anyone', label: 'subtitle names what needs no account' }
	],
	contrast: [
		{ selector: '.legacy-index .hero-sub', label: 'hero subtitle on the page plate', min: 4.5 },
		{ selector: '.legacy-index .hero-eyebrow', label: 'hero eyebrow', min: 4.5 },
		{ selector: '.legacy-index .hero h1', label: 'hero title', min: 4.5 },
		{ selector: '.legacy-index .hero-stat .label', label: 'hero stat labels', min: 4.5 }
	],
	/* A FINDING THIS SPEC REPORTS AND THIS BUNDLE DID NOT CAUSE: the banner's
	   sign-in control measures 23.6px tall at both widths, under the 44px a
	   student-facing control owes and a hair under the 24px floor. Its padding
	   and type are the banner's layout, which is package F2's; this bundle
	   changed only its colors. Left gated at 44 so the number stays in every
	   run until the banner is re-laid. */
	tapTargets: [{ selector: '.legacy-index .signin', label: 'sign-in control (pre-existing 23.6px, banner layout is F2)', min: 44 }],
	/* THE BEFORE-PAINT HALF. ThemeRoot has already run by the time the store
	   is seeded above, so the presence row alone could pass on a theme that
	   would paint on the NEXT load. This reads the served document itself:
	   signed out, the server writes no boot script, so nothing can paint a
	   theme before the body whatever the store holds. */
	orderResult: [
		{
			label: 'the served document carries no theme boot script for an anonymous visitor',
			evaluate: `async () => { const html = await (await fetch(location.pathname + location.search)).text(); return [/<script>\\(function\\(\\)\\{try\\{var m=/.test(html) ? 'BOOT SCRIPT SERVED' : 'no boot script served']; }`,
			expected: ['no boot script served']
		}
	]
};
