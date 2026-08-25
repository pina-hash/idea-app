/**
 * WHERE A PUBLISHED BUNDLE LIVES, as one pure expression.
 *
 * There is no proxy any more, no token, and no second host. `foundry-bundles`
 * is a PUBLIC Supabase Storage bucket (0135) and `foundry-ingest` already
 * writes each file at `<app id>/<version id>/<path>` with the content type its
 * extension implies, so the object URL Supabase serves IS the frame src:
 *
 *   <supabase origin>/storage/v1/object/public/foundry-bundles/<app>/<version>/index.html
 *
 * WHAT STILL ISOLATES THE BUNDLE, now that no header of ours is on the
 * response. The frame keeps `sandbox="allow-scripts allow-modals
 * allow-pointer-lock"` and never `allow-same-origin`, so the document lands in
 * an OPAQUE ORIGIN: it is same-origin with nothing, it cannot read the parent,
 * and it holds no storage area. And the bytes come off the Supabase project
 * host rather than off `ideabosco.com`, so a subresource request a bundle
 * makes carries no cookie of the portal's -- there are none on that origin to
 * carry.
 *
 * WHAT NO LONGER HOLDS, said here rather than only in the migration: a DIRECT
 * navigation to one of these URLs is not framed and not sandboxed, because the
 * `Content-Security-Policy: sandbox` directive the proxy used to send is gone
 * with the proxy. Such a document runs as an ordinary page on the Supabase
 * project origin. Nothing of ours stores anything on that origin, and the anon
 * key it could reach from there is public by construction, but it is a real
 * difference from what the proxy guaranteed and it cannot be closed from here.
 *
 * THIS MODULE IS PURE AND READS NO ENVIRONMENT, exactly as the host rule it
 * replaces was, so the component, the harness and the tests all build a URL
 * with one copy of the rule. The caller supplies the origin.
 */

import { FOUNDRY_ENTRY_FILE } from './preflight.ts';

/** The public bucket ingest extracts into. One name, one place. */
export const FOUNDRY_BUNDLE_BUCKET = 'foundry-bundles';

/**
 * Supabase's own public-object path shape. Written out rather than built by
 * the client library because the value is going into an `iframe src`, not into
 * a request this code makes -- there is no client here to ask.
 */
const PUBLIC_OBJECT_PREFIX = '/storage/v1/object/public/';

/** Trailing slashes off, so joining cannot produce a doubled one. */
function trimOrigin(origin: string | null | undefined): string {
	return (origin ?? '').trim().replace(/\/+$/, '');
}

/**
 * The frame src for one version of one app, or `null` when it cannot be built.
 *
 * NULL IS THE MECHANISM, not an empty string. A deployment with no Supabase
 * origin configured, or a row with no published version, has nowhere to point
 * a frame -- and the stage renders no launch control at all rather than a
 * button that loads about:blank.
 */
export function foundryBundleUrl(
	supabaseOrigin: string | null | undefined,
	appId: string | null | undefined,
	versionId: string | null | undefined,
	entry: string = FOUNDRY_ENTRY_FILE
): string | null {
	const origin = trimOrigin(supabaseOrigin);
	const app = (appId ?? '').trim();
	const version = (versionId ?? '').trim();
	if (!origin || !app || !version) return null;
	// The ids are uuids and the entry is a path the preflight already judged,
	// so there is nothing to escape here -- but encoding each segment costs
	// nothing and means a future entry name cannot break the URL.
	const path = entry
		.split('/')
		.filter((s) => s.length > 0)
		.map((s) => encodeURIComponent(s))
		.join('/');
	if (!path) return null;
	return `${origin}${PUBLIC_OBJECT_PREFIX}${FOUNDRY_BUNDLE_BUCKET}/${encodeURIComponent(app)}/${encodeURIComponent(version)}/${path}`;
}
