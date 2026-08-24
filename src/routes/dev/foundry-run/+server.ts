import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { FOUNDRY_PROXY_PREFIX, normalizeHost } from '$lib/foundry/host';
import { mintFoundryToken } from '$lib/server/foundry-token';
import {
	FIXTURE_APP_C,
	FIXTURE_VERSION_C_LIVE,
	FIXTURE_VIEWER,
	setFixtureBundle
} from '$lib/server/foundry-dev-fixture';
import type { RequestHandler } from './$types';

/**
 * THE LAST STEP OF THE SUBMIT HARNESS: run what the preflight just produced.
 *
 * WHY IT HAS TO EXIST AT ALL. The submit harness does the whole pipeline in the
 * browser -- normalize the picked files, preflight the zip, collect the
 * rewritten HTML -- and then has nowhere to put the result. A bundle cannot be
 * rendered from the page that made it: the platform libraries live at
 * `/_platform/lib/*` on the APPS HOST, so a `srcdoc` frame (origin `null`,
 * base URL nothing) resolves them to nothing, and a frame on the main host is
 * exactly the same-origin execution the whole origin split exists to prevent.
 * The bytes have to be served from the bundle origin, which means the proxy,
 * which means somewhere for the proxy to read them from.
 *
 * SO IT IS A SOURCE OF BYTES, NOT A SECOND PROXY. It writes the file set into
 * the in-memory dev fixture and mints a REAL token over it. Everything after
 * that is the shipping path, untouched: the same `/r/{token}/` route, the same
 * signature verification, the same publication re-check, the same MIME
 * allowlist, the same CSP, the same storage shim, the same iframe sandbox. If
 * any of those refused the bundle, the frame would be empty and the drive would
 * have failed, which is what makes the drive worth running.
 *
 * WHAT IT DOES NOT MIRROR, said plainly: the real path stores these bytes in
 * `foundry-bundles` through `foundry-ingest` under a service-role client, and
 * indexes them in `student_app_files`. Neither happens here -- the local `.env`
 * is a placeholder project. What IS the same is that the bytes handed over are
 * the ones `scanHtml` produced, because the browser reads them out of the same
 * shared module the function does.
 *
 * DEV ONLY, 404 IN PRODUCTION, AND THAT GUARD IS THE WHOLE SECURITY STORY: it
 * is an unauthenticated write of arbitrary bytes into a bundle that anybody can
 * then be handed a token for. In production the route does not answer at all,
 * and `dev` is a build-time constant, so the body below is not reachable there.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	if (!dev) error(404, 'Not found');

	let body: { files?: unknown };
	try {
		body = await request.json();
	} catch {
		error(400, 'bad json');
	}

	const raw = Array.isArray(body.files) ? body.files : [];
	const files = raw
		.filter(
			(f): f is { path: string; text: string } =>
				!!f && typeof f === 'object' && typeof f.path === 'string' && typeof f.text === 'string'
		)
		.map((f) => ({ path: f.path, text: f.text }));

	if (files.length === 0) error(400, 'no files');

	const count = setFixtureBundle(files);

	const appsHost = normalizeHost(publicEnv.PUBLIC_FOUNDRY_APPS_HOST);
	const scheme = url.protocol === 'http:' ? 'http' : 'https';
	const token =
		mintFoundryToken(
			{
				appId: FIXTURE_APP_C,
				versionId: FIXTURE_VERSION_C_LIVE,
				viewerId: FIXTURE_VIEWER,
				nowSeconds: Math.floor(Date.now() / 1000)
			},
			true
		) ?? '';

	return json({
		ok: true,
		count,
		configured: Boolean(appsHost) && token !== '',
		// The trailing slash is not optional. `/r/<token>` has `/r/` as its base
		// URL, so every relative asset in the bundle would resolve outside it --
		// and the hook refuses the slashless form outright.
		src: appsHost ? `${scheme}://${appsHost}${FOUNDRY_PROXY_PREFIX}/${token}/` : ''
	});
};
