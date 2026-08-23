import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { bundlePathOk } from '$lib/bundle-path';
import { FOUNDRY_ENTRY_FILE } from '$lib/foundry/preflight';
import { fixtureApp, fixtureVersion, isFixtureApp } from './foundry-dev-fixture';

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
	requestedPath: string
): Promise<FoundryBundleResult> {
	if (dev && isFixtureApp(appId)) {
		return resolveFromFixture(appId, versionId, requestedPath);
	}

	const client = admin();
	if (!client) return { ok: false, reason: 'not_configured' };

	// One row, carrying both halves of the publication rule: the version's own
	// app, and that app's currently published version and hidden stamp. The
	// embed rides the `student_app_versions.app_id` foreign key, which 0130
	// declares, so it is a real relationship rather than an assertion.
	const { data: version, error: versionError } = await client
		.from('student_app_versions')
		.select('id, app_id, manifest, student_apps!inner(id, published_version_id, hidden_at)')
		.eq('id', versionId)
		.maybeSingle();

	if (versionError || !version) return { ok: false, reason: 'no_such_version' };

	const row = version as unknown as {
		app_id: string;
		manifest: unknown;
		student_apps: { published_version_id: string | null; hidden_at: string | null };
	};

	if (row.app_id !== appId) return { ok: false, reason: 'no_such_version' };
	if (row.student_apps.hidden_at) return { ok: false, reason: 'hidden' };
	if (row.student_apps.published_version_id !== versionId) {
		return { ok: false, reason: 'not_published' };
	}

	const path = requestedPath || entryFor(row.manifest);
	if (!bundlePathOk(path)) return { ok: false, reason: 'bad_path' };

	const { data: fileRow, error: fileError } = await client
		.from('student_app_files')
		.select('path, content_type, byte_size')
		.eq('version_id', versionId)
		.eq('path', path)
		.maybeSingle();

	if (fileError || !fileRow) return { ok: false, reason: 'no_such_file' };

	const stored = fileRow as { content_type: string; byte_size: number | null };

	const { data: blob, error: downloadError } = await client.storage
		.from('foundry-bundles')
		.download(`${appId}/${versionId}/${path}`);

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
	requestedPath: string
): FoundryBundleResult {
	const version = fixtureVersion(versionId);
	if (!version || version.appId !== appId) return { ok: false, reason: 'no_such_version' };

	const app = fixtureApp(appId);
	if (!app) return { ok: false, reason: 'no_such_version' };
	if (app.hiddenAt) return { ok: false, reason: 'hidden' };
	if (app.publishedVersionId !== versionId) return { ok: false, reason: 'not_published' };

	const path = requestedPath || version.entry;
	if (!bundlePathOk(path)) return { ok: false, reason: 'bad_path' };

	const file = version.files.get(path);
	if (!file) return { ok: false, reason: 'no_such_file' };

	return {
		ok: true,
		file: { contentType: file.contentType, body: file.bytes, byteLength: file.bytes.byteLength }
	};
}
