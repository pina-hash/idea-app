/**
 * THE PROJECTOR FOLLOWS ANOTHER WINDOW'S THEME (bug 145c0352): "When I change
 * light theme projector view theme should change with. When the projector view
 * is live." The projector is a second window with no theme control of its own
 * and is never reloaded by a deploy, so it has to HEAR the control view's
 * choice: ThemeRoot listens for the `storage` event a write in any other window
 * of the origin fires.
 *
 * `?session=1` fakes a signed-in teacher (ThemeRoot's session gate), and the
 * writes come from A SECOND DOCUMENT: a same-origin `about:blank` iframe this
 * spec creates, whose `localStorage` is this origin's store and whose writes
 * therefore fire a REAL `storage` event in the projector's window (the writing
 * window never receives its own). Nothing is dispatched by hand. The two-page
 * drive with the real switch is `../_theme-follow.mjs`.
 *
 * THE STEPS, recorded on `window.__follow`:
 *   0. at load: no theme stored, no attribute;
 *   1. the other document stores Matrix: the wall turns Matrix;
 *   2. it writes an UNRELATED key (the projector's own frame slot): nothing
 *      moves (the negative control);
 *   3. it stores Space White: the wall turns Space White, and the browser's
 *      own chrome colour follows;
 *   4. it removes the key (how turning the theme off is stored): the
 *      attribute comes off;
 *   5. it stores Space White again, and the wall is measured there, washed.
 *
 * The other direction, the session gate, is
 * `classroom-projector-demo-clock-follow-signedout`.
 */
import { EIGHT_H, PROJECTOR_READY } from './_classroom-live.mjs';

const write = (n, op) => `async () => {
	let f = document.getElementById('bv-other-window');
	if (!f) {
		f = document.createElement('iframe');
		f.id = 'bv-other-window';
		f.style.cssText = 'position:absolute;width:0;height:0;border:0';
		document.body.appendChild(f);
	}
	const store = f.contentWindow.localStorage;
	${op}
	const attr = () => document.documentElement.getAttribute('data-theme') || 'none';
	const before = attr();
	const t0 = performance.now();
	await new Promise((r) => setTimeout(r, 600));
	const rec = { attr: attr(), color: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '', ms: Math.round(performance.now() - t0), before };
	(window.__follow = window.__follow || [])[${n}] = rec;
	return JSON.stringify(rec);
}`;

export default {
	path: '/dev/classroom-projector?demo=clock&session=1',
	label: "Class projector: follows another window's theme change, live (bug 145c0352)",
	prepare: [
		PROJECTOR_READY,
		// Hydrated, not just painted: the listener is attached by then (the
		// harness sets this from an effect). Waited for twice around a pause,
		// because a cold dev server reloads the page once while it optimizes.
		{ waitFor: `() => document.body.getAttribute('data-projector-hydrated') === 'true'`, timeoutMs: 30000 },
		{ evaluate: `() => new Promise((r) => setTimeout(() => r('settled'), 1500))` },
		{ waitFor: `() => document.body.getAttribute('data-projector-hydrated') === 'true'`, timeoutMs: 30000 },
		{
			evaluate: `() => {
				const rec = { attr: document.documentElement.getAttribute('data-theme') || 'none', stored: localStorage.getItem('idea_site_theme') };
				window.__follow = [rec];
				return JSON.stringify(rec);
			}`
		},
		{ evaluate: write(1, `store.setItem('idea_site_theme', 'matrix');`) },
		{ evaluate: write(2, `store.setItem('idea_live_projector:harness-teacher:s-live:bv', String(Date.now()));`) },
		{ evaluate: write(3, `store.setItem('idea_site_theme', 'space-white');`) },
		{ evaluate: write(4, `store.removeItem('idea_site_theme');`) },
		{ evaluate: write(5, `store.setItem('idea_site_theme', 'space-white');`) },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }
	],
	orderResult: [
		{
			label: 'at load nothing is stored and no theme is on',
			evaluate: `() => { const r = (window.__follow || [])[0]; return r ? ['attr ' + r.attr, 'stored ' + r.stored] : ['not recorded']; }`,
			expected: ['attr none', 'stored null']
		},
		{
			label: "another window stores Matrix, then writes an unrelated key, then Space White, then removes it: the wall follows each theme step and ignores the other key",
			evaluate: `() => (window.__follow || []).slice(1).map((r, i) => (i + 1) + ' ' + (r ? r.attr : 'not recorded'))`,
			expected: ['1 matrix', '2 matrix', '3 space-white', '4 none', '5 space-white']
		},
		{
			label: "the browser's own chrome colour follows Space White",
			evaluate: `() => { const r = (window.__follow || [])[3]; return [r ? 'theme-color ' + r.color : 'not recorded']; }`,
			expected: ['theme-color #E8ECEB']
		},
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] }
	],
	presence: [{ selector: 'html[data-theme="space-white"]', label: 'Space White, followed from the other window', expectPresent: 1, maxPresent: 1 }],
	contrast: [
		{ selector: '.lp-class', label: 'class name (washed)', min: 4.5, projector: true },
		{ selector: '.lp-clock', label: 'clock (washed)', min: 4.5, projector: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
