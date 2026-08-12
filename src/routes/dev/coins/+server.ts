import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import ledgerHtml from '../../../../static/coins/index.html?raw';
import type { RequestHandler } from './$types';

/**
 * Dev harness for the IDEA Coin Ledger's new data layer. 404 in production,
 * no auth, no Supabase, no Google.
 *
 * It serves the REAL `static/coins/index.html` -- byte-for-byte the file that
 * ships, pulled in with a Vite raw import (the legacy-loader convention) --
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

	const html = ledgerHtml.replace(/\/api\/coin\//g, '/dev/coins/api/');

	setHeaders({ 'cache-control': 'no-store' });
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
