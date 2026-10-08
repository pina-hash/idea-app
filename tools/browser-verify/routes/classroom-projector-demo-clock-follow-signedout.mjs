/**
 * THE SESSION GATE HOLDS WHEN THE THEME ARRIVES FROM ANOTHER WINDOW (bug
 * 145c0352, the other direction). The projector with NO session (this harness
 * without `?session=1`; the harness ignores `follow`, which only gives this
 * spec a path of its own) hears the same write from a second document that
 * `classroom-projector-demo-clock-session-1` hears, and paints nothing: the
 * theme is applied only where its own control is reachable, and following a
 * change is not a way around that. The session-1 spec is this one's positive
 * control (the identical write turns its wall Space White).
 */
import { PROJECTOR_READY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=clock&follow=signedout',
	label: 'Class projector, signed out: another window\'s theme is not painted (bug 145c0352)',
	prepare: [
		PROJECTOR_READY,
		// Hydrated, not just painted: the listener is attached by then (the
		// harness sets this from an effect). Waited for twice around a pause,
		// because a cold dev server reloads the page once while it optimizes.
		{ waitFor: `() => document.body.getAttribute('data-projector-hydrated') === 'true'`, timeoutMs: 30000 },
		{ evaluate: `() => new Promise((r) => setTimeout(() => r('settled'), 1500))` },
		{ waitFor: `() => document.body.getAttribute('data-projector-hydrated') === 'true'`, timeoutMs: 30000 },
		{
			evaluate: `async () => {
				const f = document.createElement('iframe');
				f.style.cssText = 'position:absolute;width:0;height:0;border:0';
				document.body.appendChild(f);
				f.contentWindow.localStorage.setItem('idea_site_theme', 'space-white');
				await new Promise((r) => setTimeout(r, 1500));
				window.__signedOut = [document.documentElement.getAttribute('data-theme') || 'none', localStorage.getItem('idea_site_theme')];
				return window.__signedOut.join(' / ');
			}`
		}
	],
	orderResult: [
		{
			label: 'Space White was stored by the other window, and the signed-out wall still shows no theme',
			evaluate: `() => window.__signedOut ? ['attr ' + window.__signedOut[0], 'stored ' + window.__signedOut[1]] : ['not recorded']`,
			expected: ['attr none', 'stored space-white']
		}
	],
	presence: [{ selector: 'html[data-theme]', label: 'no theme attribute', expectPresent: 0 }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
