import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { bundlePathOk } from '$lib/bundle-path';
import { FOUNDRY_BUNDLE_BUCKET } from '$lib/foundry/bundle-url';
import { servableFoundryType } from '$lib/foundry/preflight';
import { fixtureApp, fixtureVersion, isFixtureApp } from './foundry-dev-fixture';

/**
 * THE REVIEW QUEUE'S SOURCE READS: what is ACTUALLY sitting in the bundle
 * bucket for one version.
 *
 * WHAT USED TO BE HERE AND IS NOT ANY MORE. This module also resolved one file
 * of one bundle for a token-authenticated proxy, and re-checked, on every
 * request, three things RLS would otherwise have enforced: that the version
 * belonged to the app, that it was still the app's `published_version_id`, and
 * that the app was not hidden. There is no proxy now -- `foundry-bundles` is
 * public (0135) and a frame points straight at the object URL -- so those
 * three checks are not enforced anywhere and the bucket's contents are
 * readable by anyone who knows both uuids. That is stated in 0135's header and
 * is deliberate; it is repeated here so nobody reads this file's remaining
 * caution as the whole story.
 *
 * THE SERVICE-ROLE CLIENT IS STILL UNAVOIDABLE FOR THESE TWO FUNCTIONS, and
 * this module is still the ONE Foundry reader of that key. A public bucket is
 * readable by uuid; it is not LISTABLE by a client, and `student_app_files` is
 * granted to nobody, so enumerating a version's files -- which is what a
 * reviewer needs before they can read anything -- takes the service role.
 *
 * THEY ARE NOT SELF-AUTHORIZING AND DO NOT PRETEND TO BE. Neither takes a
 * token; both bypass RLS by construction. The caller is `/api/foundry/source`,
 * which is admin-gated and answers 404 to everyone else -- the same shape the
 * rest of the site uses for a surface whose existence is not public.
 *
 * THE FILE LIST IS THE ROWS, NOT THE BUCKET. `student_app_files` is what the
 * ingest function wrote, so a tree built from it is the set of paths a bundle
 * actually contains, and an object left in the bucket with no row is correctly
 * absent from it.
 *
 * IN DEV, WITH NO REAL PROJECT, the rows and bytes come from
 * `./foundry-dev-fixture` instead, so the source viewer can be driven against
 * the placeholder Supabase project the local `.env` points at.
 */

/** Why a source read could not answer. Every one of these is a 404 upstream. */
export type FoundryBundleRefusal =
	| 'not_configured'
	| 'bad_path'
	| 'no_such_file'
	| 'storage_failed';

function admin() {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) return null;
	return createClient(PUBLIC_SUPABASE_URL, key, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

export function foundryBundleSourceConfigured(): boolean {
	if (dev) return true;
	return Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

/* -------------------------------------------------------------------------
 * THE SOURCE VIEWER'S READS.
 *
 * The review queue shows the bytes that are ACTUALLY IN `foundry-bundles`,
 * not a re-render of what the student uploaded and not the zip they sent. The
 * difference is the whole point: the student handed over an archive, the
 * ingest function decided what came out of it (a wrapper directory stripped,
 * OS noise dropped, ignored extensions removed), and what a viewer will run is
 * the result. A reviewer looking at the upload is reviewing something nobody
 * will ever execute.
 * ---------------------------------------------------------------------- */

export type FoundryBundleEntry = { path: string; contentType: string; byteSize: number };

/**
 * Every file stored for one version, in path order.
 *
 * The rows, not the bucket: `student_app_files` is what ingest wrote, so a
 * tree built from it is exactly the set of paths the bundle contains, and an
 * object left in the bucket with no row is correctly absent from it.
 */
export async function listBundleFiles(versionId: string): Promise<FoundryBundleEntry[] | null> {
	if (dev) {
		const version = fixtureVersion(versionId);
		if (version) {
			return [...version.files.entries()]
				.map(([path, f]) => ({
					path,
					contentType: f.contentType,
					byteSize: f.bytes.byteLength
				}))
				.sort((a, b) => a.path.localeCompare(b.path));
		}
	}

	const client = admin();
	if (!client) return null;

	const { data, error } = await client
		.from('student_app_files')
		.select('path, content_type, byte_size')
		.eq('version_id', versionId)
		.order('path');

	if (error || !data) return null;
	return (data as { path: string; content_type: string; byte_size: number | null }[]).map((r) => ({
		path: r.path,
		contentType: r.content_type,
		byteSize: r.byte_size ?? 0
	}));
}

/** The largest file the source viewer will read into a response. */
export const FOUNDRY_SOURCE_MAX_BYTES = 512 * 1024;

export type FoundrySourceResult =
	| { ok: true; path: string; contentType: string; byteSize: number; text: string }
	| { ok: false; reason: FoundryBundleRefusal | 'too_large' | 'not_text' };

/**
 * One file's bytes, decoded as text.
 *
 * REFUSES A BINARY TYPE RATHER THAN MOJIBAKE. A PNG decoded as UTF-8 is a
 * screenful of replacement characters that looks like a corrupted upload; the
 * viewer says "this is an image, N bytes" instead, which is the true answer.
 *
 * REFUSES A FILE OVER THE CAP RATHER THAN TRUNCATING IT. A reviewer reading a
 * silently truncated file would be deciding about bytes they were not shown.
 * The cap is per FILE and is far under the 25 MB bundle cap; a source file
 * over half a megabyte is minified or generated, which the reviewer needs to
 * know rather than scroll.
 */
export async function readBundleFileText(
	appId: string,
	versionId: string,
	path: string
): Promise<FoundrySourceResult> {
	if (!bundlePathOk(path)) return { ok: false, reason: 'bad_path' };

	const files = await listBundleFiles(versionId);
	if (!files) return { ok: false, reason: 'not_configured' };
	const row = files.find((f) => f.path === path);
	if (!row) return { ok: false, reason: 'no_such_file' };

	if (!isTextContentType(row.contentType)) return { ok: false, reason: 'not_text' };
	if (row.byteSize > FOUNDRY_SOURCE_MAX_BYTES) return { ok: false, reason: 'too_large' };

	if (dev) {
		const version = fixtureVersion(versionId);
		const file = version?.files.get(path);
		if (version && file) {
			return {
				ok: true,
				path,
				contentType: row.contentType,
				byteSize: row.byteSize,
				text: new TextDecoder().decode(file.bytes)
			};
		}
	}

	const client = admin();
	if (!client) return { ok: false, reason: 'not_configured' };

	const { data: blob, error } = await client.storage
		.from(FOUNDRY_BUNDLE_BUCKET)
		.download(`${appId}/${versionId}/${path}`);
	if (error || !blob) return { ok: false, reason: 'storage_failed' };

	return {
		ok: true,
		path,
		contentType: row.contentType,
		byteSize: row.byteSize,
		text: await blob.text()
	};
}

/**
 * Which stored types the viewer will decode.
 *
 * Keyed on the STORED type, which the ingest function wrote from its own fixed
 * table -- never sniffed from the bytes, and never inferred from the extension
 * a second time here.
 */
const TEXTUAL = new Set([
	'text/html',
	'text/css',
	'text/javascript',
	'application/json',
	'text/plain',
	'image/svg+xml'
]);

export function isTextContentType(stored: string | null | undefined): boolean {
	const base = (stored ?? '').split(';')[0].trim().toLowerCase();
	return TEXTUAL.has(base);
}

/* -------------------------------------------------------------------------
 * THE SERVING READ.
 *
 * `/b/<app>/<version>/<path>` reaches this for every byte of every bundle. It
 * uses the same service-role client the source viewer does, for the same
 * reason: `foundry-bundles` carries NO storage policy at all, so RLS denies
 * every `anon` and `authenticated` request by default and the service role is
 * its only reader. Keeping the bucket shut is what stops a draft, a rejected
 * build, a superseded build or a hidden app's build from sitting one guessed
 * pair of uuids from the open internet.
 *
 * WHICH MEANS EVERY RULE RLS WOULD HAVE ENFORCED IS RE-CHECKED HERE, ON EVERY
 * REQUEST, EXPLICITLY. A service-role read bypasses RLS by construction, so
 * the three checks below are not defence in depth -- they are the only copy:
 *
 *   1. the version named in the URL belongs to the app named in the URL;
 *   2. the app is not hidden;
 *   3. the version is the app's `published_version_id`, or it is SUBMITTED and
 *      therefore in front of a reviewer right now.
 *
 * (3) IS THE PUBLICATION GATE, AND IT IS NOT A SESSION CHECK. That is forced
 * rather than chosen. These bytes are served on the APPS ORIGIN, and the
 * portal's cookies are host-only on the main host -- `@supabase/ssr` sets no
 * `Domain` and `hooks.server.ts` adds none -- so there is no session on this
 * host to read. There cannot be one without either `Domain`-scoping the
 * session cookie onto the apps host, which hands every student bundle the
 * credentials the second origin exists to withhold, or putting a signed token
 * back on every request, which is the machinery five lanes were spent
 * removing. So the licence comes from the VERSION'S OWN STATUS, exactly as it
 * did from the Edge Function this replaces.
 *
 * WHAT THAT COSTS: a student who knows their own version uuid can hand somebody
 * a link to a build that is submitted but not yet approved. WHAT IT BUYS: a
 * draft, a rejected version, a rolled-back one and a hidden app all stop
 * serving in the same statement that changes them, which no expiring token
 * could do.
 *
 * THE FILE LIST IS THE ALLOWLIST. A served path must have a ROW in
 * `student_app_files` for that exact version and that exact string, so there is
 * no directory to walk, no prefix to escape from, and nothing is ever resolved
 * against a filesystem. `bundlePathOk` runs first anyway, as an independent
 * second refusal.
 * ---------------------------------------------------------------------- */

export type FoundryServeResult = { ok: true; bytes: Uint8Array; contentType: string } | { ok: false };

/** Every refusal is the same bodyless 404 upstream, so this carries no reason. */
const REFUSED: FoundryServeResult = { ok: false };

/**
 * One file of one bundle, if and only if that bundle may currently be served.
 *
 * IN DEV, WITH NO REAL PROJECT, the rows and bytes come from
 * `./foundry-dev-fixture` instead -- the same route, the same gate, the same
 * headers, the same shim injection, only a different source of bytes. The
 * local `.env` names a placeholder Supabase project, so without this none of
 * the serving path could be run locally at all and every claim about it would
 * be a claim about code that had never executed.
 */
export async function serveBundleFile(
	appId: string,
	versionId: string,
	path: string
): Promise<FoundryServeResult> {
	if (!bundlePathOk(path)) return REFUSED;

	if (dev && isFixtureApp(appId)) {
		const version = fixtureVersion(versionId);
		const app = fixtureApp(appId);
		if (!version || !app || version.appId !== appId) return REFUSED;
		if (app.hiddenAt !== null) return REFUSED;
		if (app.publishedVersionId !== versionId) return REFUSED;
		const file = version.files.get(path);
		if (!file) return REFUSED;
		return { ok: true, bytes: file.bytes, contentType: file.contentType };
	}

	const client = admin();
	if (!client) return REFUSED;

	const { data: version, error: versionErr } = await client
		.from('student_app_versions')
		.select('id, app_id, status')
		.eq('id', versionId)
		.maybeSingle<{ id: string; app_id: string; status: string }>();
	if (versionErr || !version || version.app_id !== appId) return REFUSED;

	const { data: app, error: appErr } = await client
		.from('student_apps')
		.select('id, published_version_id, hidden_at')
		.eq('id', appId)
		.maybeSingle<{ id: string; published_version_id: string | null; hidden_at: string | null }>();
	if (appErr || !app || app.hidden_at !== null) return REFUSED;

	const live = app.published_version_id === version.id || version.status === 'submitted';
	if (!live) return REFUSED;

	const { data: row, error: rowErr } = await client
		.from('student_app_files')
		.select('path, content_type')
		.eq('version_id', versionId)
		.eq('path', path)
		.maybeSingle<{ path: string; content_type: string | null }>();
	if (rowErr || !row) return REFUSED;

	const { data: blob, error: dlErr } = await client.storage
		.from(FOUNDRY_BUNDLE_BUCKET)
		.download(`${appId}/${versionId}/${path}`);
	if (dlErr || !blob) return REFUSED;

	return {
		ok: true,
		bytes: new Uint8Array(await blob.arrayBuffer()),
		contentType: servableFoundryType(row.content_type)
	};
}
