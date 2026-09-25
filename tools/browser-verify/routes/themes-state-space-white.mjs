/**
 * SPACE WHITE, ON (ledger 0297, package F1a). The same board, the same role
 * board, the same launcher and the same browser as the IDEA and Matrix specs,
 * reached through the SHIPPING control -- the profile menu's own Space White
 * row -- so a green run is a run in which the application turned it on.
 *
 * FIVE CLAIMS, EACH A NUMBER:
 *
 *  1. LEGIBLE ON A MONITOR. Every text role on every ground it lands on at
 *     4.5:1 or better, the load-bearing boundary and the focus ring at 3:1 or
 *     better, every status ink as TEXT at 4.5:1 on seven grounds and on its
 *     own fill. --text-3, which the IDEA palette keeps decorative, is real
 *     copy here and is held to 4.5 as well.
 *
 *  2. LEGIBLE ON THE WALL. The projector-washout model, stated in full at
 *     `PROJECTOR_MODEL` in ../checks.mjs: a 300:1 projector with ambient light
 *     at 10% of white added to every pixel, L' = L(1 - 1/300) + 1/300 + 0.10,
 *     ratio L'hi / L'lo with no flare term (the ambient term IS the flare).
 *     Body copy (--white, --text-1, --text-2) keeps 4.5 washed; muted copy
 *     and status inks keep 3.0 washed; a load-bearing line keeps 2.0 washed,
 *     tighter than the 1.5 the brief allowed; and a panel stays separable from
 *     its page at a ground step of 1.1 washed. The IDEA and Matrix specs
 *     record the same rows at a floor of 0 so the three tables sit side by
 *     side in one run.
 *
 *  3. THE ATTRIBUTE IS THERE BEFORE THE FIRST PAINT. The served document's
 *     own <head> is fetched and its boot script -- the one `themeBootScript`
 *     builds -- is run against a stored `space-white`: it must paint
 *     `space-white` and set the theme-color. ThemeRoot writes the same value
 *     after hydration, so a check after load could not tell the two apart;
 *     this reads the script the browser runs before the body exists.
 *
 *  4. TURNING IT OFF IS COMPLETE. The round trip through the menu leaves no
 *     attribute, no stored key and the default theme-color behind, then puts
 *     it back.
 *
 *  5. NO GLOW, NO RAIN. No canvas under `.bg-fx`, no CSS animation on it.
 *
 * Widths: 375 and 1440 by default; run `--width 1280` for the projector
 * profile (1280 wide; the harness height is its own 900).
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';
import {
	boardContrast,
	BOARD_CELLS,
	LAUNCHER_CARDS,
	ROLE_CELLS,
	STEP_CELLS,
	THEME_ROWS,
	launcherRows,
	washoutRows
} from './_theme-shared.mjs';

const ROW = (id) => `.pm-theme:has([data-theme-swatch="${id}"])`;

/* The boot script as the server sent it, run against a fake document with
   `space-white` stored. Returns three facts as an array (orderResult's
   contract). The regex is the script's own opening, so a renamed wrapper
   reads "NO BOOT SCRIPT" rather than passing. */
const BOOT_PROBE = `async () => {
	const html = await (await fetch(location.pathname + location.search)).text();
	const m = html.match(/<script>\\(function\\(\\)\\{try\\{var m=[\\s\\S]*?<\\/script>/);
	if (!m) return ['NO BOOT SCRIPT IN THE SERVED DOCUMENT'];
	const inHead = html.indexOf(m[0]) < html.indexOf('</head>');
	const src = m[0].replace(/^<script>/, '').replace(/<\\/script>$/, '');
	const out = { a: null, c: null };
	const doc = {
		documentElement: { setAttribute: (k, v) => { out.a = v; } },
		querySelector: () => ({ setAttribute: (k, v) => { out.c = v; } })
	};
	new Function('localStorage', 'document', src)({ getItem: () => 'space-white' }, doc);
	return [inHead ? 'boot script in <head>' : 'boot script OUTSIDE <head>', 'stored space-white paints ' + out.a, 'theme-color ' + out.c];
}`;

export default {
	path: '/dev/themes?state=space-white',
	label: 'Site theme ON (Space White): every role on every ground, on a monitor and on the wall',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, label: 'settle the launcher entrance' },
		{
			click: '.pm-trigger',
			until: `() => document.querySelectorAll('.pm-theme').length === ${THEME_ROWS}`,
			label: 'open the profile menu onto the theme control'
		},
		{
			click: ROW('idea'),
			until: `() => document.documentElement.getAttribute('data-theme') === null && localStorage.getItem('idea_site_theme') === null && document.querySelector('meta[name="theme-color"]').content === '#0A0C0D'`,
			label: 'turn it OFF from the IDEA row: no attribute, no stored key, the default theme-color'
		},
		{
			click: ROW('space-white'),
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white' && localStorage.getItem('idea_site_theme') === 'space-white' && document.querySelector('meta[name="theme-color"]').content === '#E8ECEB'`,
			label: 'turn it back ON from the Space White row'
		},
		{
			evaluate: `() => { const cs = getComputedStyle(document.documentElement); return 'data-theme=' + document.documentElement.getAttribute('data-theme') + ' --surface-1=' + cs.getPropertyValue('--surface-1').trim() + ' --text-1=' + cs.getPropertyValue('--text-1').trim() + ' --green=' + cs.getPropertyValue('--green').trim() + ' --glow-green=' + cs.getPropertyValue('--glow-green').trim(); }`,
			label: 'what the document computes under the theme'
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'the theme attribute is on <html>', expectPresent: 1, maxPresent: 1 },
		{ selector: '.board [data-role]', label: 'chrome-board cells', expectPresent: BOARD_CELLS, maxPresent: BOARD_CELLS },
		{ selector: '.sboard [data-srole]', label: 'role-board cells', expectPresent: ROLE_CELLS, maxPresent: ROLE_CELLS },
		{ selector: '.sboard [data-sstep]', label: 'ground-step cells', expectPresent: STEP_CELLS, maxPresent: STEP_CELLS },
		{ selector: '.launcher .app-card', label: 'launcher cards', expectPresent: LAUNCHER_CARDS, maxPresent: LAUNCHER_CARDS },
		{ selector: '.pm-theme', label: 'theme radios (menu open)', expectPresent: THEME_ROWS, maxPresent: THEME_ROWS, expectVisible: THEME_ROWS },
		{ selector: '.pm-theme[aria-checked="true"]', label: 'exactly one radio checked', expectPresent: 1, maxPresent: 1 },
		{ selector: `${ROW('space-white')}[aria-checked="true"]`, label: 'and it is the Space White row', expectPresent: 1, maxPresent: 1 },
		/* No rain on a light theme: the canvas is keyed on `matrix` alone. */
		{ selector: '.bg-fx canvas', label: 'rain canvas (must be absent)', expectPresent: 0, maxPresent: 0 }
	],
	contrast: [
		...boardContrast('space-white'),
		{ selector: '.board [data-role="--text-3"]', label: 'space-white: text-3 is real copy here and clears 4.5', min: 4.5 },
		{ selector: '.sboard [data-srole][data-min="4.5"]', label: 'space-white: status, accent and signal inks as text (4.5:1)', min: 4.5 },
		{ selector: '.sboard [data-srole][data-min="3"]', label: 'space-white: focus ring (3:1, non-text)', min: 3 },
		...washoutRows('space-white', { gate: true }),
		...launcherRows({ gateWall: true }),
		{ selector: '.harness h1', label: 'page heading', min: 4.5 },
		{ selector: '.harness .note', label: 'note copy', min: 4.5 },
		{ selector: '.pm-theme-name', label: 'theme option name', min: 4.5 },
		{ selector: '.pm-theme-note', label: 'theme option note', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.pm-theme', label: 'theme radios', min: 44 },
		{ selector: '.switch .sw', label: 'theme switch buttons', min: 44 }
	],
	orderResult: [
		{
			label: 'the served <head> carries the boot script and it paints Space White before the body',
			evaluate: BOOT_PROBE,
			expected: ['boot script in <head>', 'stored space-white paints space-white', 'theme-color #E8ECEB']
		}
	],
	motion: [{ selector: '.bg-fx', label: 'the shell layer carries no CSS animation', expect: 'never' }]
};
