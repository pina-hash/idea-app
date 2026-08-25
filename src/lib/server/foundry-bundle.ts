import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { bundlePathOk } from '$lib/bundle-path';
import { FOUNDRY_ENTRY_FILE } from '$lib/foundry/preflight';
import { fixtureApp, fixtureVersion, isFixtureApp } from './foundry-dev-fixture';
import type { FoundryTokenKind } from './foundry-token';

/**
 * RESOLVING ONE FILE OF ONE BUNDLE: the rows, then the bytes.
 *
 * THE SERVICE-ROLE CLIENT IS UNAVOIDABLE HERE, and this module is its ONE
 * reader for Foundry -- the fourth module in the codebase to hold that key.
 * The reason is the origin split itself: the apps host is a different site, so
 * the viewer's cookies are never sent to it and there is no session to read a
 * row under. `foundry-bundles` additionally carries NO storage policy of any
 * kind (0130), which is the mechanism rather than an omission: RLS denies
 * every `authenticated` and `anon` request there by default and only
 * `service_role` reaches it.
 *
 * SO THE TOKEN IS NOT THE ONLY CHECK. A service-role read bypasses RLS
 * entirely, which means every rule RLS would have enforced has to be enforced
 * HERE, explicitly, on every request:
 *
 *   1. the version named by the token belongs to the app named by the token;
 *   2. that version is still the app's `published_version_id`;
 *   3. the app is not hidden.
 *
 * (2) is the one that is easy to leave out and expensive to leave out. A token
 * is good for thirty minutes; a version can be replaced or an app taken down
 * inside that window, and without this re-read the withdrawn bundle keeps
 * serving until the token expires. It is also what makes "a token for an app
 * whose published version has moved" a refusal rather than a stale hit.
 *
 * A REVIEW TOKEN LIFTS (2) AND ONLY (2), and the licence arrives in the signed
 * bytes rather than as a parameter this module trusts a caller for -- see
 * `FOUNDRY_TOKEN_KIND_BYTES` in `./foundry-token`. The review queue has to RUN
 * the build it is deciding about, and a submitted version is by definition not
 * the published one; without this the only way to see a submission running
 * would be to approve it first, which is the decision the queue exists to make.
 * (1) and (3) still hold: a review token still cannot cross to another app's
 * files, and a hidden app is off the site for staff too (0130's own rule, and
 * the mint says the same thing).
 *
 * IT IS ALSO THE ONE READER OF THE BUNDLE BUCKET FOR THE SOURCE VIEWER.
 * `listBundleFiles` and `readBundleFileText` are here rather than in the review
 * route for the credential rule: `SUPABASE_SERVICE_ROLE_KEY` has one reader per
 * service and this module is Foundry's. They re-check the same way, and they
 * are called only from an admin-gated route.
 *
 * THE FILE LIST IS THE ALLOWLIST, which is what makes path traversal a
 * non-event. A served path must have a ROW in `student_app_files` for that
 * exact version and that exact string; there is no directory to walk, no
 * prefix to escape from, and nothing is ever resolved against a filesystem.
 * `../` has nothing to traverse to because nothing is traversed. The path
 * predicate is still applied first, as a third independent refusal, for the
 * same reason the deck proxy keeps its: it means this route does not depend on
 * the ingest function and the CHECK constraint both having been right.
 *
 * IN DEV, WITH NO REAL PROJECT, the rows and bytes come from
 * `./foundry-dev-fixture` instead -- and nothing else about this function
 * changes. Same three checks, same allowlist, same entry resolution. The
 * branch is gated on `dev` AND on the app id being one of the fixture's two,
 * so it cannot fire in production and cannot shadow a real app.
 */

export type FoundryBundleFile = {
	contentType: string;
	body: ReadableStream<Uint8Array> | Uint8Array;
	/** Known for a fixture read; null for a stream whose length Storage did not report. */
	byteLength: number | null;
};

export type FoundryBundleRefusal =
	| 'not_configured'
	| 'bad_path'
	| 'no_such_version'
	| 'not_published'
	| 'hidden'
	| 'no_such_file'
	| 'storage_failed';

export type FoundryBundleResult =
	| { ok: true; file: FoundryBundleFile }
	| { ok: false; reason: FoundryBundleRefusal };

function admin() {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) return null;
	return createClient(PUBLIC_SUPABASE_URL, key, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

/* -------------------------------------------------------------------------
 * TEMPORARY PROBES. REMOVE THEM IN THE LANE THAT FIXES THE CAUSE.
 *
 * Everything past the route's first statement was unmeasured: the token, the
 * row lookups and the storage read all fold into one bodyless 404, which is
 * correct for a caller and useless for a diagnosis. These lines name which of
 * them refused, on the deployment that is actually running.
 *
 * THE CREDENTIAL IS REPORTED AS A SHAPE AND THE VARIABLE NAME IS REPORTED
 * BESIDE IT. Presence and length only; the value is never logged, never
 * returned and never put in a message. The NAME matters because Supabase now
 * markets `SUPABASE_SECRET_KEYS` in place of the legacy service-role key, so
 * "which variable does this client read" is a real question with a real wrong
 * answer, and reading it out of the code is what has been wrong four times.
 * ---------------------------------------------------------------------- */

const SERVICE_ROLE_ENV_NAME = 'SUPABASE_SERVICE_ROLE_KEY';

function probe(detail: string) {
	console.log(`[foundry-probe] bundle ${detail}`);
}

/** A compact, value-free rendering of whatever the client handed back. */
function describeError(e: unknown): string {
	if (!e) return 'none';
	const o = e as Record<string, unknown>;
	const parts = ['message', 'code', 'status', 'statusCode', 'name', 'details', 'hint']
		.map((k) => (o[k] === undefined || o[k] === null ? null : `${k}=${String(o[k])}`))
		.filter(Boolean);
	const text = parts.length ? parts.join(' ') : String(e);
	return JSON.stringify(text.slice(0, 400));
}

/**
 * THE SERVICE-ROLE CLIENT'S FIRST REAL CALL, MADE AN EXPLICIT MEASUREMENT.
 *
 * A plain authenticated read against `foundry-bundles` with the key exactly as
 * configured. It answers the question the whole lane turns on -- does this
 * credential still authenticate against this project -- rather than leaving it
 * to be inferred from a download that could fail for six other reasons. A
 * rotated or replaced key fails HERE, with the platform's own words.
 *
 * It lists one object at the bucket root and reads no bytes.
 */
async function probeServiceRoleRead(client: NonNullable<ReturnType<typeof admin>>) {
	const key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
	probe(
		`credential env=${SERVICE_ROLE_ENV_NAME} set=${key.length > 0 ? 'yes' : 'no'}` +
			` len=${key.length} url.host=${(() => {
				try {
					return new URL(PUBLIC_SUPABASE_URL).host;
				} catch {
					return '<unparseable>';
				}
			})()}`
	);
	const { data, error } = await client.storage.from('foundry-bundles').list('', { limit: 1 });
	probe(
		`credential-read bucket=foundry-bundles ok=${error ? 'no' : 'yes'}` +
			` entries=${data ? data.length : -1} error=${describeError(error)}`
	);
}

export function foundryBundleSourceConfigured(): boolean {
	if (dev) return true;
	return Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * AN EMPTY PATH IS THE ENTRY FILE, and so is a bare prefix.
 *
 * `/r/<token>` and `/r/<token>/` both mean "open this app". The entry is taken
 * from the version's own manifest, which the ingest function stamps, and falls
 * back to the contract's `index.html` -- a manifest written before the field
 * existed, or one that lost it, must not make a bundle unopenable.
 */
function entryFor(manifest: unknown): string {
	const entry =
		manifest && typeof manifest === 'object'
			? (manifest as Record<string, unknown>).entry
			: undefined;
	if (typeof entry === 'string' && bundlePathOk(entry)) return entry;
	return FOUNDRY_ENTRY_FILE;
}

export async function resolveBundleFile(
	appId: string,
	versionId: string,
	requestedPath: string,
	/**
	 * What the TOKEN licensed, never what the caller would like. `published`
	 * is the default so a caller that has not thought about it gets the strict
	 * rule rather than the widened one.
	 */
	kind: FoundryTokenKind = 'published'
): Promise<FoundryBundleResult> {
	if (dev && isFixtureApp(appId)) {
		return resolveFromFixture(appId, versionId, requestedPath, kind);
	}

	const client = admin();
	if (!client) {
		// TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
		probe(`not_configured env=${SERVICE_ROLE_ENV_NAME} set=no`);
		return { ok: false, reason: 'not_configured' };
	}

	// TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
	await probeServiceRoleRead(client);

	// One row, carrying both halves of the publication rule: the version's own
	// app, and that app's currently published version and hidden stamp. The
	// embed rides the `student_app_versions.app_id` foreign key, which 0130
	// declares, so it is a real relationship rather than an assertion.
	const { data: version, error: versionError } = await client
		.from('student_app_versions')
		.select('id, app_id, manifest, student_apps!inner(id, published_version_id, hidden_at)')
		.eq('id', versionId)
		.maybeSingle();

	// TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
	probe(
		`version-lookup app=${appId} version=${versionId} kind=${kind}` +
			` row=${version ? 'found' : 'empty'} error=${describeError(versionError)}`
	);

	if (versionError || !version) return { ok: false, reason: 'no_such_version' };

	const row = version as unknown as {
		app_id: string;
		manifest: unknown;
		student_apps: { published_version_id: string | null; hidden_at: string | null };
	};

	// TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
	probe(
		`version-row app.matches=${row.app_id === appId ? 'yes' : 'no'}` +
			` hidden=${row.student_apps.hidden_at ? 'yes' : 'no'}` +
			` published.matches=${row.student_apps.published_version_id === versionId ? 'yes' : 'no'}` +
			` published.set=${row.student_apps.published_version_id ? 'yes' : 'no'}`
	);

	if (row.app_id !== appId) return { ok: false, reason: 'no_such_version' };
	if (row.student_apps.hidden_at) return { ok: false, reason: 'hidden' };
	if (kind !== 'review' && row.student_apps.published_version_id !== versionId) {
		return { ok: false, reason: 'not_published' };
	}

	const path = requestedPath || entryFor(row.manifest);

	// TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
	// JSON-quoted, with its length beside it: a trailing space, a stray slash or
	// a percent-decode that did not happen are all invisible unquoted, and any
	// of them makes the `.eq('path', ...)` match nothing while the row is
	// plainly there.
	probe(
		`path requested=${JSON.stringify(requestedPath)} resolved=${JSON.stringify(path)}` +
			` len=${path.length} fromManifest=${requestedPath ? 'no' : 'yes'}` +
			` ok=${bundlePathOk(path) ? 'yes' : 'no'}`
	);

	if (!bundlePathOk(path)) return { ok: false, reason: 'bad_path' };

	const { data: fileRow, error: fileError } = await client
		.from('student_app_files')
		.select('path, content_type, byte_size')
		.eq('version_id', versionId)
		.eq('path', path)
		.maybeSingle();

	// TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
	probe(
		`file-lookup version=${versionId} path=${JSON.stringify(path)}` +
			` row=${fileRow ? 'found' : 'empty'} error=${describeError(fileError)}`
	);

	if (fileError || !fileRow) return { ok: false, reason: 'no_such_file' };

	const stored = fileRow as { content_type: string; byte_size: number | null };

	const objectKey = `${appId}/${versionId}/${path}`;
	const { data: blob, error: downloadError } = await client.storage
		.from('foundry-bundles')
		.download(objectKey);

	// TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
	probe(
		`storage-read key=${JSON.stringify(objectKey)} ok=${downloadError || !blob ? 'no' : 'yes'}` +
			` bytes=${blob ? blob.size : -1} error=${describeError(downloadError)}`
	);

	if (downloadError || !blob) return { ok: false, reason: 'storage_failed' };

	return {
		ok: true,
		file: {
			contentType: stored.content_type,
			body: blob.stream() as unknown as ReadableStream<Uint8Array>,
			byteLength: typeof stored.byte_size === 'number' ? stored.byte_size : null
		}
	};
}

/** The same three checks, against the in-memory fixture. Dev only. */
function resolveFromFixture(
	appId: string,
	versionId: string,
	requestedPath: string,
	kind: FoundryTokenKind = 'published'
): FoundryBundleResult {
	const version = fixtureVersion(versionId);
	if (!version || version.appId !== appId) return { ok: false, reason: 'no_such_version' };

	const app = fixtureApp(appId);
	if (!app) return { ok: false, reason: 'no_such_version' };
	if (app.hiddenAt) return { ok: false, reason: 'hidden' };
	if (kind !== 'review' && app.publishedVersionId !== versionId) {
		return { ok: false, reason: 'not_published' };
	}

	const path = requestedPath || version.entry;
	if (!bundlePathOk(path)) return { ok: false, reason: 'bad_path' };

	const file = version.files.get(path);
	if (!file) return { ok: false, reason: 'no_such_file' };

	return {
		ok: true,
		file: { contentType: file.contentType, body: file.bytes, byteLength: file.bytes.byteLength }
	};
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
 *
 * THEY LIVE HERE FOR THE CREDENTIAL RULE, not for convenience. `foundry-bundles`
 * has no storage policy, so `service_role` is the only role that reaches it,
 * and this module is that key's one Foundry reader. A second reader in a route
 * would be a second egress point for the same secret.
 *
 * THEY ARE NOT SELF-AUTHORIZING AND DO NOT PRETEND TO BE. Neither takes a
 * token; both bypass RLS by construction. The caller is `/api/foundry/source`,
 * which is admin-gated and answers 404 to everyone else -- the same shape the
 * rest of the site uses for a surface whose existence is not public.
 * ---------------------------------------------------------------------- */

export type FoundryBundleEntry = { path: string; contentType: string; byteSize: number };

/**
 * Every file the proxy would serve for one version, in path order.
 *
 * The rows, not the bucket: `student_app_files` IS the allowlist the proxy
 * resolves against, so a tree built from it shows exactly the set of paths
 * that can be reached, and an object sitting in the bucket with no row is
 * unreachable and correctly absent.
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
