import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import {
	FOUNDRY_TOKEN_TTL_SECONDS,
	foundryTokensConfigured,
	mintFoundryToken
} from '$lib/server/foundry-token';
import { isAdmin } from '$lib/server/admin';
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
 *   - a version that is not the app's `published_version_id`, UNLESS the
 *     caller asked for a REVIEW token and is an admin (see below).
 *
 * THE REVIEW BRANCH, AND WHY IT IS HERE RATHER THAN IN A SECOND ROUTE. The
 * review queue has to RUN the build it is deciding about, and a submitted
 * version is by definition not the published one -- so without this the only
 * way to see a submission running would be to approve it first, which is the
 * decision the queue exists to make. What it costs is one branch, and the
 * branch is narrow:
 *
 *   - `is_admin()` IS THE CHECK, asked of the DATABASE rather than inferred
 *     from a role. `role === 'teacher'` is not an admin check (0067) and the
 *     domain hands that role to every member of staff.
 *   - the version must BELONG to the app, re-read here rather than trusted
 *     from the body, so a review token can never be minted across two apps.
 *   - the app must still not be hidden, exactly as for a published read.
 *   - the licence rides in the SIGNED BYTES (`kind: 'review'`), so a published
 *     token cannot be edited into a review one, and `resolveBundleFile` lifts
 *     the publication re-check for that kind and for nothing else.
 *
 * A NON-ADMIN ASKING FOR A REVIEW TOKEN GETS THE SAME 404 as every other
 * refusal here. It does not answer 403, because that would confirm both that
 * the app exists and that a review lane exists to be refused from.
 *
 * NOTHING ABOUT THE SECRET REACHES A RESPONSE. An unconfigured deployment
 * answers a structured `not_configured` -- the feedback route's shape, for the
 * feedback route's reason: a missing environment variable does not fix itself
 * in eight seconds of backoff, so it must not look retryable.
 */

type Body = { appId?: unknown; versionId?: unknown; purpose?: unknown };

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

	const wantsReview = body.purpose === 'review';

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

	// Hidden is a refusal for BOTH kinds. Hiding takes an app off the site, and
	// it takes it off for staff too (0130); a reviewer who needs to look at a
	// hidden app un-hides it first, deliberately.
	if (app.hidden_at) {
		return json({ ok: false, reason: 'not_found' }, { status: 404 });
	}

	let versionId: string;

	if (wantsReview) {
		if (!(await isAdmin(supabase, claims.sub))) {
			return json({ ok: false, reason: 'not_found' }, { status: 404 });
		}
		if (typeof body.versionId !== 'string' || !UUID_RE.test(body.versionId)) {
			return json({ ok: false, reason: 'bad_request' }, { status: 400 });
		}
		// THE VERSION'S OWNERSHIP IS RE-READ, never taken from the body. Without
		// this a review token could be minted naming app A and a version of app
		// B, and `resolveBundleFile`'s app/version check would then be the only
		// thing between a reviewer and another app's files.
		const { data: version, error: versionErr } = await supabase
			.from('student_app_versions')
			.select('id, app_id')
			.eq('id', body.versionId)
			.maybeSingle();
		const row = version as { id: string; app_id: string } | null;
		if (versionErr || !row || row.app_id !== app.id) {
			return json({ ok: false, reason: 'not_found' }, { status: 404 });
		}
		versionId = row.id;
	} else {
		if (!app.published_version_id) {
			return json({ ok: false, reason: 'not_found' }, { status: 404 });
		}
		// A caller MAY name the version, and naming the wrong one is a refusal
		// rather than a silent substitution: a gallery that has cached a version
		// id across a republish should be told, not quietly handed different bytes.
		if (typeof body.versionId === 'string' && body.versionId !== app.published_version_id) {
			return json({ ok: false, reason: 'not_found' }, { status: 404 });
		}
		versionId = app.published_version_id;
	}

	const token = mintFoundryToken(
		{
			appId: app.id,
			versionId,
			viewerId: claims.sub,
			kind: wantsReview ? 'review' : 'published'
		},
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
		versionId,
		title: app.title,
		slug: app.slug,
		expiresInSeconds: FOUNDRY_TOKEN_TTL_SECONDS
	});
};
