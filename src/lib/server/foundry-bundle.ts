import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { bundlePathOk } from '$lib/bundle-path';
import { fixtureVersion } from './foundry-dev-fixture';

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
		.from('foundry-bundles')
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
