import { env } from '$env/dynamic/public';
import { foundryNotFound, foundryOnServingHost } from '$lib/server/foundry-bundle-response';
import { foundryCoverCsp } from '$lib/foundry/html-cover';
import type { RequestHandler } from './$types';

/**
 * ONE GAME'S HTML COVER, ON THE APPS ORIGIN (ledger 0422, feedback 1cc58a6e).
 *
 *   GET <apps origin>/c/<app id>?v=<revision>
 *
 * It answers only where bundles answer (`foundryOnServingHost`: the apps
 * origin in production, which holds no session), so an admin's HTML never runs
 * on the host that holds the session cookies. The document comes from
 * `foundry_cover_html`, read through this request's own client, which on the
 * apps origin is anonymous: the function answers only for an app the gallery
 * shows and nothing while the Foundry is off. Every other case is the one
 * bodyless 404 the bundle routes send.
 *
 * The page is served under `sandbox allow-scripts` and a policy with no
 * network at all (`foundryCoverCsp`), so the cover is an opaque origin that
 * can animate and react to the pointer, and can read no cookie, store
 * nothing, reach no page and send nothing anywhere.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!foundryOnServingHost(url.origin)) return foundryNotFound();
	const id = params.appId ?? '';
	if (!UUID_RE.test(id)) return foundryNotFound();
	let html: string | null = null;
	try {
		const { data, error } = await locals.supabase.rpc('foundry_cover_html', { p_app: id });
		html = !error && typeof data === 'string' && data ? data : null;
	} catch {
		html = null;
	}
	if (!html) return foundryNotFound();
	return new Response(html, {
		status: 200,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'content-security-policy': foundryCoverCsp(env.PUBLIC_FOUNDRY_APPS_ORIGIN, env.PUBLIC_FOUNDRY_PORTAL_ORIGIN),
			'x-content-type-options': 'nosniff',
			'referrer-policy': 'no-referrer',
			'cross-origin-resource-policy': 'cross-origin',
			// The revision is in the address, so a short shared cache is safe and
			// a replaced cover is a new address. Never per viewer: nothing varies.
			'cache-control': 'public, max-age=300'
		}
	});
};
