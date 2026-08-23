import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import {
	FOUNDRY_TOKEN_TTL_SECONDS,
	foundryTokensConfigured,
	mintFoundryToken
} from '$lib/server/foundry-token';
import { FOUNDRY_PROXY_PREFIX, isFoundryAppsHost, normalizeHost } from '$lib/foundry/host';
import type { RequestHandler } from './$types';

/**
 * THE MINT. Main host only, session required.
 *
 * This is where "may this person open this app" is decided, because this is
 * the only host where there is a session to decide it with. The token the
 * route returns IS that decision, and the proxy on the apps host does not
 * re-derive it -- it re-checks the row (see `$lib/server/foundry-bundle`) but
 * it cannot re-check the caller, who by then is a request with no cookies.
 *
 * IT ANSWERS ITS OWN 401, so it is deliberately NOT in `authedPrefixes` -- a
 * route group's guard does not run for endpoints, and a redirect would be a
 * strange answer to a fetch.
 *
 * WHAT IT REFUSES, and all of it with the same 404:
 *
 *   - an app the caller cannot read. The read runs as the CALLER, under RLS,
 *     with no identity filter of its own: `_foundry_app_in_population` (0130)
 *     is the boundary, and an empty result is 404 rather than 403 because RLS
 *     returning nothing is indistinguishable from the row not existing.
 *   - an app with nothing published. An owner can legitimately SEE their own
 *     unpublished app through that policy, so this is checked here explicitly
 *     rather than left to the read.
 *   - a hidden app. The same applies in the other direction: the policy passes
 *     `true, true` for its two widening flags, which are gated on `is_admin()`
 *     INSIDE the predicate, so an admin's plain select DOES return hidden rows.
 *     Hiding is a staff act that takes an app off the site, and it takes it off
 *     for staff too.
 *   - a version that is not the app's `published_version_id`. There is no
 *     preview of an unpublished version in this lane, and a caller may not
 *     name one.
 *
 * NOTHING ABOUT THE SECRET REACHES A RESPONSE. An unconfigured deployment
 * answers a structured `not_configured` -- the feedback route's shape, for the
 * feedback route's reason: a missing environment variable does not fix itself
 * in eight seconds of backoff, so it must not look retryable.
 */

type Body = { appId?: unknown; versionId?: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ request, url, locals: { supabase, claims } }) => {
	// The mint does not exist on the bundle host. The hook already 404s every
	// non-proxy path there; this is the same both-ends argument the proxy route
	// makes about its own host check.
	if (isFoundryAppsHost(url.host, publicEnv.PUBLIC_FOUNDRY_APPS_HOST)) {
		return new Response(null, { status: 404 });
	}

	if (!claims) {
		return json({ ok: false, reason: 'signed_out' }, { status: 401 });
	}
	if (!foundryTokensConfigured(dev)) {
		return json({ ok: false, reason: 'not_configured' }, { status: 503 });
	}

	const appsHost = normalizeHost(publicEnv.PUBLIC_FOUNDRY_APPS_HOST);
	if (!appsHost) {
		return json({ ok: false, reason: 'not_configured' }, { status: 503 });
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}

	const appId = typeof body.appId === 'string' ? body.appId : '';
	if (!UUID_RE.test(appId)) {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}

	const { data, error } = await supabase
		.from('student_apps')
		.select('id, slug, title, published_version_id, hidden_at')
		.eq('id', appId)
		.maybeSingle();

	if (error || !data) {
		return json({ ok: false, reason: 'not_found' }, { status: 404 });
	}

	const app = data as {
		id: string;
		slug: string;
		title: string;
		published_version_id: string | null;
		hidden_at: string | null;
	};

	if (app.hidden_at || !app.published_version_id) {
		return json({ ok: false, reason: 'not_found' }, { status: 404 });
	}

	// A caller MAY name the version, and naming the wrong one is a refusal
	// rather than a silent substitution: a gallery that has cached a version id
	// across a republish should be told, not quietly handed different bytes.
	if (typeof body.versionId === 'string' && body.versionId !== app.published_version_id) {
		return json({ ok: false, reason: 'not_found' }, { status: 404 });
	}

	const token = mintFoundryToken(
		{ appId: app.id, versionId: app.published_version_id, viewerId: claims.sub },
		dev
	);
	if (!token) {
		return json({ ok: false, reason: 'not_configured' }, { status: 503 });
	}

	/**
	 * The full absolute URL, built here rather than by the caller. The scheme
	 * follows the mint's own -- so a local `http://127.0.0.1:5173` apps host
	 * works without a special case, and production is https because production
	 * is https.
	 */
	const scheme = url.protocol === 'http:' ? 'http' : 'https';
	return json({
		ok: true,
		token,
		src: `${scheme}://${appsHost}${FOUNDRY_PROXY_PREFIX}/${token}/`,
		appId: app.id,
		versionId: app.published_version_id,
		title: app.title,
		slug: app.slug,
		expiresInSeconds: FOUNDRY_TOKEN_TTL_SECONDS
	});
};
