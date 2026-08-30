import { dev, version as buildId } from '$app/environment';
import { error } from '@sveltejs/kit';
import { deploy } from 'virtual:site-versions';
import { legacyReportPanelScript } from '$lib/server/legacy-report-panel';
import ledgerHtml from '$lib/legacy/coins/index.html?raw';
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
	 * THE REPORT CONTROL, INJECTED THE SAME WAY THE REAL ROUTE INJECTS IT.
	 *
	 * A harness must mirror the whole mechanism it stands in for. Without this
	 * the harness would serve the shipping markup with the one thing this
	 * bundle ADDED to it missing -- so a passing drive would prove nothing
	 * about the control, and nothing on screen would say so. Same module, same
	 * options, only the endpoint differs: `/dev/coins/api/feedback` is an
	 * in-memory sink answering the identical `{ok}` / `{ok:false, reason}`
	 * contract, so the panel's send, its refusal wording and its retry branch
	 * are all exercised with no session and no Supabase.
	 *
	 * ONLY THE SIGNED-IN ENDPOINT IS OVERRIDABLE, AND THAT IS DELIBERATE.
	 * `legacyReportPanelScript` takes the ANONYMOUS endpoint from the shared
	 * constant and offers no parameter for it, so no caller -- harness
	 * included -- can point a signed-out report somewhere other than
	 * `/api/feedback`. The cost is small and worth naming: a signed-OUT drive
	 * here posts to the real anonymous route, which with no service-role key
	 * answers a structured `not_configured` refusal, so what that path
	 * exercises is the REFUSAL branch. Drive `?signedIn=1` for the success
	 * branch.
	 */
	const html = ledgerHtml.replace(/\/api\/coin\//g, '/dev/coins/api/').replace(
		'</body>',
		`${legacyReportPanelScript({
			signedIn,
			signedInEndpoint: '/dev/coins/api/feedback',
			app: 'coins',
			route: '/coins',
			deploy,
			buildId
		})}\n</body>`
	);

	setHeaders({ 'cache-control': 'no-store' });
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
