import { SETTLE_ENTRANCE } from './_shared.mjs';
import { LAUNCHER_CARDS, THEME_ROWS } from './_theme-shared.mjs';

/* The student's launcher: every card less the two only an admin is shown (the
   Coin Desk and the admin dashboard). Exact, for the reason LAUNCHER_CARDS is. */
const STUDENT_CARDS = LAUNCHER_CARDS - 2;
/**
 * THE HOME PAGE UNDER EACH SITE THEME (ledger 0297, package F1b), one spec per
 * theme from this factory, so the banner, the hero, every launcher card and
 * the class feed are measured under IDEA, Matrix and Space White in one run
 * and the three tables sit side by side.
 *
 * THE THEME IS REACHED THROUGH THE SHIPPING CONTROL, the profile menu's own
 * row, on the harness that fakes a session (`/dev/home-order` is one of
 * `THEME_BOOT_HARNESSES`), so a green run is one in which the application put
 * the attribute on <html>. The menu is opened and pressed through the
 * elements' own `click()` rather than a pointer: at 375px this harness's fixed
 * strip covers the banner's first row, which is the reason the teacher spec
 * beside this one opens its panel by script too. The strip does not exist on
 * `/`.
 *
 * WHAT IS GATED AND WHAT IS RECORDED. On a monitor every theme is gated at the
 * text floor: IDEA and Matrix are the looks this bundle must leave exactly as
 * they were, so a finding there is a finding. Under the projector-washout
 * model (PROJECTOR_MODEL in ../checks.mjs) only Space White is gated -- it is
 * the theme that exists for the projector -- and IDEA and Matrix record the
 * same rows at a floor of 0, the way the `themes*` specs do.
 *
 * THE EMBLEM'S WINDOW. Under Space White the masthead gives the emblem a dark
 * glass behind it (a `::before` on `.logo-mark .idea-logo`), and under the
 * other two it has none. A pseudo-element has no selector a presence row can
 * read, so an `orderResult` probe reads its computed `content` and background.
 */
/* A STUDENT with one class: the viewer the home page is for, and the only
   fixture whose banner carries the class chip (staff get none). The teacher
   and admin cards are measured by the unit test over their inks
   (tests/space-white-inks.test.ts) and by /dev/themes, which renders all
   thirteen. */
const HOME = '/dev/home-order?role=student&classes=1&rows=3';

const ROW = (id) => `.pm-theme:has([data-theme-swatch="${id}"])`;

/** Reach `theme` through the profile menu, then close it again. IDEA is the state a fresh browser already has. */
const reach = (theme) =>
	theme === 'idea'
		? [
				{
					waitFor: `() => document.documentElement.getAttribute('data-theme') === null && document.querySelector('.pm-trigger') !== null`,
					label: 'IDEA: no attribute on <html>, and the profile menu is mounted (the page carries a session)'
				}
			]
		: [
				/* Each press is a `waitFor` that presses until its own effect is
				   there, because PAINT IS NOT INTERACTIVITY: a `click()` landing
				   before hydration does nothing and says nothing, which is the
				   first thing this spec measured. The predicate answers true
				   BEFORE pressing, so a press that has landed is never repeated
				   into a toggle. */
				{
					waitFor: `() => { if (document.querySelectorAll('.pm-theme').length === ${THEME_ROWS}) return true; document.querySelector('.pm-trigger')?.click(); return false; }`,
					label: 'open the profile menu onto its theme rows'
				},
				{
					waitFor: `() => { if (document.documentElement.getAttribute('data-theme') === '${theme}' && localStorage.getItem('idea_site_theme') === '${theme}') return true; document.querySelector('${ROW(theme)}')?.click(); return false; }`,
					label: `press the ${theme} row: the attribute is ${theme} and it is stored`
				},
				{
					waitFor: `() => { if (!document.querySelector('.pm-panel')) return true; document.querySelector('.pm-trigger')?.click(); return false; }`,
					label: 'close the menu so the banner is measured as a visitor sees it'
				}
			];

/* The boot script as the server sent it, run against a fake document with
   `theme` stored -- the shape themes-state-space-white.mjs uses. */
const BOOT_PROBE = (theme) => `async () => {
	const html = await (await fetch(location.pathname + location.search)).text();
	const m = html.match(/<script>\\(function\\(\\)\\{try\\{var m=[\\s\\S]*?<\\/script>/);
	if (!m) return ['NO BOOT SCRIPT IN THE SERVED DOCUMENT'];
	const inHead = html.indexOf(m[0]) < html.indexOf('</head>');
	const src = m[0].replace(/^<script>/, '').replace(/<\\/script>$/, '');
	const out = { a: null };
	const doc = { documentElement: { setAttribute: (k, v) => { out.a = v; } }, querySelector: () => ({ setAttribute: () => {} }) };
	new Function('localStorage', 'document', src)({ getItem: () => '${theme}' }, doc);
	return [inHead ? 'boot script in <head>' : 'boot script OUTSIDE <head>', 'stored ${theme} paints ' + (out.a ?? 'nothing')];
}`;

/* The window's computed state, in words, for `orderResult`. */
const WINDOW_PROBE = `() => {
	const logo = document.querySelector('.legacy-index .logo-mark .idea-logo');
	if (!logo) return ['NO EMBLEM IN THE BANNER'];
	const b = getComputedStyle(logo, '::before');
	const has = b.content !== 'none' && b.content !== 'normal' && b.backgroundColor !== 'rgba(0, 0, 0, 0)';
	return [has ? 'emblem sits in a window' : 'emblem has no window'];
}`;

/* Every ground a card title can sit on, read off the page: the ink of each
   card's title against its card at rest. Printed, not asserted; the contrast
   rows below are the verdict. */
const CARD_INKS = `() => [...document.querySelectorAll('.launcher .app-card[data-app]')].map((c) => c.dataset.app + ' ' + getComputedStyle(c.querySelector('.app-title')).color).join('; ')`;

export const homeThemeSpec = (theme) => {
	const gateWall = theme === 'space-white';
	const wall = (min) => (gateWall ? min : 0);
	const note = gateWall ? '' : ' [recorded, not gated]';
	return {
		path: `${HOME}&theme=${theme}`,
		aliasOf: HOME,
		label: `Home page under the ${theme} theme: banner, hero, launcher cards and class feed, on a monitor and on the wall`,
		prepare: [
			{ evaluate: SETTLE_ENTRANCE, waitMs: 150, label: 'settle the entrance' },
			...reach(theme),
			{ evaluate: CARD_INKS, label: 'what every card title computes' }
		],
		presence: [
			theme === 'idea'
				? { selector: 'html[data-theme]', label: 'no theme attribute on <html>', expectPresent: 0, maxPresent: 0 }
				: { selector: `html[data-theme="${theme}"]`, label: `the ${theme} attribute is on <html>`, expectPresent: 1, maxPresent: 1 },
			{ selector: '.legacy-index header', label: 'the banner', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
			{ selector: '.legacy-index .hero.compact', label: 'the compact hero (a signed-in viewer)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
			{ selector: '.legacy-index .hero-sub', label: 'the hero subtitle (signed-out only)', expectPresent: 0, maxPresent: 0 },
			{ selector: '.launcher .app-card', label: 'launcher cards', expectPresent: STUDENT_CARDS, maxPresent: STUDENT_CARDS, expectVisible: 1 },
			{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'class feed rows', expectPresent: 1, expectVisible: 1 }
		],
		contrast: [
			{ selector: '.legacy-index .class-chip', label: 'banner: class chip', min: 4.5 },
			{ selector: '.legacy-index .auth-link', label: 'banner: tour link', min: 4.5 },
			{ selector: '.legacy-index .hero h1', label: 'hero title', min: 4.5 },
			{ selector: '.legacy-index .hero-stat .label', label: 'hero stat labels', min: 4.5 },
			{ selector: '.legacy-index .hero-stat .value', label: 'hero stat values', min: 4.5 },
			{ selector: '.launcher .launcher-title', label: 'launcher heading', min: 4.5 },
			{ selector: '.launcher .bar-btn', label: 'launcher bar buttons', min: 4.5 },
			{ selector: '.launcher .app-card .app-title', label: 'every card title on its card', min: 4.5 },
			{ selector: '.launcher .app-card .app-cta', label: 'every card call to action', min: 4.5 },
			{ selector: '.legacy-index .year-label', label: 'Your Classes heading', min: 4.5 },
			{ selector: '[data-tour="classes"] .course-id', label: 'feed: course code', min: 4.5 },
			{ selector: '[data-tour="classes"] .assignment-name', label: 'feed: row title', min: 4.5 },
			/* The attention chip is an amber word on its own amber tint, and on
			   the IDEA plate it measures 4.23 on the class header -- a reading
			   this bundle found, did not cause, and may not move (IDEA renders
			   exactly as before). Gated where the ground is this bundle's. */
			{ selector: '[data-tour="classes"] .feed-flag', label: `feed: due and status flags${gateWall ? '' : ' [recorded: the IDEA plate reads 4.23 on the class header, pre-existing]'}`, min: gateWall ? 4.5 : 0 },
			{ selector: '.legacy-index .changelog-toggle', label: 'Portal Updates toggle', min: 4.5 },
			{ selector: '.legacy-index footer .footer-sub, .legacy-index footer .footer-archive', label: 'footer copy', min: 4.5 },
			{ selector: '.legacy-index .hero h1, [data-tour="classes"] .assignment-name', label: `on the wall: title and row copy (4.5 washed)${note}`, min: wall(4.5), projector: true },
			{
				selector: '.legacy-index .class-chip, .legacy-index .hero-stat .label, .legacy-index .hero-stat .value, .launcher .app-card .app-title, .launcher .app-card .app-cta, [data-tour="classes"] .course-id, [data-tour="classes"] .feed-flag',
				label: `on the wall: accent and muted copy (3.0 washed)${note}`,
				min: wall(3),
				projector: true
			}
		],
		tapTargets: [{ selector: '.launcher .app-card', label: 'launcher cards', min: 44 }],
		orderResult: [
			{
				/* The home page is in scope for a session, and the served head
				   says so before the body exists: its boot script, run against
				   the stored choice, paints the same attribute ThemeRoot writes
				   after hydration. */
				label: `the served <head> paints a stored ${theme} before the body`,
				evaluate: BOOT_PROBE(theme),
				expected: theme === 'idea' ? ['boot script in <head>', 'stored idea paints nothing'] : ['boot script in <head>', `stored ${theme} paints ${theme}`]
			},
			{
				label: theme === 'space-white' ? 'the emblem sits in its window on the light banner' : 'the emblem has no window on a dark banner',
				evaluate: WINDOW_PROBE,
				expected: [theme === 'space-white' ? 'emblem sits in a window' : 'emblem has no window']
			}
		]
	};
};
