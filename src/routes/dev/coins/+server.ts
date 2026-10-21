import { SITE_THEME_KEY } from '$lib/theme';
import { dev, version as buildId } from '$app/environment';
import { error } from '@sveltejs/kit';
import { deploy } from 'virtual:site-versions';
import { injectFeedbackLaunch } from '$lib/server/feedback-launch';
import ledgerHtml from '$lib/legacy/coins/index.html?raw';
import { injectLedgerTheme } from '$lib/server/coin-public';
import { injectLedgerLogo } from '$lib/server/ledger-logo';
import { injectCoinBar } from '$lib/server/coin-bar';
import type { RequestHandler } from './$types';

/**
 * Dev harness for the IDEA Coin Ledger's new data layer. 404 in production,
 * no auth, no Supabase, no Google.
 *
 * It serves the REAL `src/lib/legacy/coins/index.html` -- byte-for-byte the
 * file that ships, pulled in with a Vite raw import (the legacy-loader
 * convention) --
 * with ONE substitution: `/api/coin/` becomes `/dev/coins/api/`, pointing the
 * page's own fetches at the fixture endpoints beside this file. Nothing else
 * about the page is touched, so every tab, sort, filter, drawer, claim and
 * role application is exercised by the shipping markup and the shipping
 * script against the shipping response shapes.
 *
 * Query params (forwarded to the harness's /me): `?signedIn=1` renders the
 * signed-in student view (claim controls, real role modal), `?signedIn=0`
 * the signed-out one.
 */
export const GET: RequestHandler = async ({ url, cookies, setHeaders }) => {
	if (!dev) error(404, 'Not found');

	// The toggles ride COOKIES, not the substituted URLs. The page appends its
	// own `?_=` cache-buster to every call, so a query string baked into the
	// endpoint would end up as `...?signedIn=1?_=123` -- which happens to
	// work, and is exactly the kind of thing that stops working the moment
	// somebody reads the parameter more carefully.
	cookies.set('dev_coins_signed_in', url.searchParams.get('signedIn') === '1' ? '1' : '0', {
		path: '/dev/coins'
	});
	cookies.set('dev_coins_student', url.searchParams.get('student') === '0' ? '0' : '1', {
		path: '/dev/coins'
	});

	const signedIn = url.searchParams.get('signedIn') === '1';

	/*
	 * THE FEEDBACK BUTTON AND WINDOW, INJECTED THE SAME WAY THE REAL ROUTE
	 * INJECTS THEM (ledger 0396).
	 *
	 * A harness must mirror the whole mechanism it stands in for, so this is the
	 * real `injectFeedbackLaunch` with the real route's options. The one thing it
	 * adds is the window's harness sink: `sink=memory` makes `/feedback/embed`
	 * (in dev, and only in dev) file a report into an in-memory list on THIS
	 * page, `window.__ideaFeedbackSink`, the row built by the real
	 * `submitFeedback`, so a spec can read exactly what would have been sent.
	 * `?signedIn=1` asks the window for its signed-in arrangement; the window,
	 * not this page, decides what that means, exactly as on the real route.
	 */
	/*
	 * THE THEME, THE SAME WAY THE REAL ROUTE DECIDES IT (`injectLedgerTheme`,
	 * keyed on `?signedIn=1` here as the report control is), plus ONE harness
	 * override: `?theme=space-white|matrix` pins the attribute so a palette can
	 * be measured whatever the scope decides for `/coins`. The override is the
	 * harness's alone; the real route has no such parameter. It also stores the
	 * choice the way the site's own switch does, so the feedback window, which
	 * reads the stored theme like every page of the site (and, signed in, may
	 * apply it), opens in the theme the Ledger is pinned to.
	 */
	const forced = url.searchParams.get('theme');
	const pin =
		forced === 'space-white' || forced === 'matrix'
			? `<script>document.documentElement.setAttribute('data-theme', ${JSON.stringify(forced)});try{localStorage.setItem(${JSON.stringify(SITE_THEME_KEY)}, ${JSON.stringify(forced)});}catch(e){}</script>`
			: '';
	const html = injectFeedbackLaunch(
		injectCoinBar(injectLedgerLogo(injectLedgerTheme(ledgerHtml, signedIn)), url.searchParams.get('desk') === '1')
			.replace('</title>', `</title>\n${pin}`)
			.replace(/\/api\/coin\//g, '/dev/coins/api/'),
		{
			route: '/coins',
			room: 'ledger',
			deploy,
			buildId,
			tabSelector: '.tab-btn.active',
			embedQuery: { sink: 'memory', ...(signedIn ? { signedIn: '1' } : {}) }
		}
	);

	setHeaders({ 'cache-control': 'no-store' });
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
