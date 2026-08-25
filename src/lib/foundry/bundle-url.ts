/**
 * WHERE A PUBLISHED BUNDLE LIVES, as one pure expression.
 *
 * There is no token any more, no second host, no signature and no expiry. The
 * `foundry-serve` Edge Function serves a bundle's bytes from the Supabase
 * project's own domain, and its URL is built from the two ids and nothing
 * else:
 *
 *   <supabase origin>/functions/v1/foundry-serve/<app id>/<version id>/
 *
 * SO THE FRAME SRC IS A PLAIN, STABLE URL. It does not expire, so re-launching
 * costs no round trip; it carries no secret, so it can be logged, screenshotted
 * and pasted into a bug report; and there is no mint to be unavailable. What it
 * is NOT is a licence: `foundry-serve` re-checks on every single request that
 * the version belongs to the app, that the app is not hidden, and that the
 * version is published or submitted. A withdrawal takes effect on the next
 * request rather than in thirty minutes.
 *
 * THE TRAILING SLASH IS LOAD-BEARING. `.../<version>` has `.../<app>/` as its
 * base URL, so every relative asset in every bundle would resolve one level too
 * high. This only ever produces the slash form; the function redirects the
 * other one rather than trusting that nothing generates it.
 *
 * WHY NOT THE STORAGE OBJECT URL, which is the obvious answer and was the
 * plan: Supabase Storage's renderer rewrites every `text/html` response to
 * `text/plain`, on the public, authenticated and signed-URL paths alike, with
 * no configuration for it. A framed bundle would render its own source as
 * text. Measured against a real object rather than reasoned about, and the
 * reason `foundry-bundles` is still a private bucket with no policy at all.
 *
 * WHAT ISOLATES THE BUNDLE. The frame keeps `sandbox="allow-scripts
 * allow-modals allow-pointer-lock"` and never `allow-same-origin`, so the
 * document lands in an OPAQUE ORIGIN -- same-origin with nothing, unable to
 * read the parent, and holding no storage area. `foundry-serve` sends the same
 * flags as a CSP `sandbox` directive so a direct navigation lands in the same
 * place. And the bytes come off the Supabase project host rather than off
 * `ideabosco.com`, so a subresource request a bundle makes carries no cookie of
 * the portal's -- there are none on that origin to carry.
 *
 * THIS MODULE IS PURE AND READS NO ENVIRONMENT, exactly as the host rule it
 * replaces was, so the component, the harness and the tests all build a URL
 * with one copy of the rule. The caller supplies the origin.
 */

/** The bucket `foundry-ingest` extracts into and `foundry-serve` reads. */
export const FOUNDRY_BUNDLE_BUCKET = 'foundry-bundles';

/** The Edge Function that serves a bundle, and the path it is mounted at. */
export const FOUNDRY_SERVE_FUNCTION = 'foundry-serve';
const FUNCTION_PREFIX = `/functions/v1/${FOUNDRY_SERVE_FUNCTION}/`;

/** Trailing slashes off, so joining cannot produce a doubled one. */
function trimOrigin(origin: string | null | undefined): string {
	return (origin ?? '').trim().replace(/\/+$/, '');
}

/**
 * The frame src for one version of one app, or `null` when it cannot be built.
 *
 * NULL IS THE MECHANISM, not an empty string. A deployment with no Supabase
 * origin configured, or a row with no version to point at, has nowhere to send
 * a frame -- and `AppStage` renders no launch control at all rather than a
 * button that opens `about:blank`.
 *
 * `path` is for a caller that wants one named file rather than the entry, which
 * today is only a test. The default is the bundle ROOT, slash included, which
 * is what the function resolves to the entry file.
 */
export function foundryBundleUrl(
	supabaseOrigin: string | null | undefined,
	appId: string | null | undefined,
	versionId: string | null | undefined,
	path = ''
): string | null {
	const origin = trimOrigin(supabaseOrigin);
	const app = (appId ?? '').trim();
	const version = (versionId ?? '').trim();
	if (!origin || !app || !version) return null;

	// The ids are uuids and a path has already been judged by the preflight, so
	// there is nothing here that needs escaping -- but encoding each segment
	// costs nothing and means a future filename cannot break the URL.
	const tail = path
		.split('/')
		.filter((s) => s.length > 0)
		.map((s) => encodeURIComponent(s))
		.join('/');

	return `${origin}${FUNCTION_PREFIX}${encodeURIComponent(app)}/${encodeURIComponent(version)}/${tail}`;
}
