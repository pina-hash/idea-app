import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { bundlePathOk } from '$lib/bundle-path';
import {
	FOUNDRY_BUNDLE_BUCKET,
	FOUNDRY_COVER_BUCKET,
	FOUNDRY_UPLOAD_BUCKET,
	foundryDownloadFilename
} from '$lib/foundry/bundle-url';
import { servableFoundryType } from '$lib/foundry/preflight';
// THE SAME WRITER THE BROWSER PACKS AN UPLOAD WITH. One codec pair on both
// sides is what makes "the download re-uploads to the same app" a property of
// one implementation rather than of two agreeing.
import { buildZip } from '$lib/foundry/zip-write';
import { FIXTURE_VIEWER, fixtureApp, fixtureVersion, isFixtureApp } from './foundry-dev-fixture';

/**
 * THE REVIEW QUEUE'S SOURCE READS: what is ACTUALLY sitting in the bundle
 * bucket for one version.
 *
 * `foundry-bundles` IS PRIVATE AND CARRIES NO STORAGE POLICY AT ALL, which is
 * what makes `service_role` its only reader, its only writer and its only
 * deleter. (An earlier draft of this header said the bucket was public. It was
 * true for one lane and is not true now: the serving route reads it server
 * side with the service key precisely so a draft, a rejected build, a
 * superseded build and a hidden app's build are not one guessed pair of uuids
 * from the open internet.)
 *
 * SO THE SERVICE-ROLE CLIENT IS UNAVOIDABLE FOR EVERYTHING IN THIS FILE, and
 * this module is still the ONE Foundry reader of that key: the source viewer's
 * two reads, the serving route's read, the PREVIEW read, and the delete sweep
 * at the bottom.
 *
 * NONE OF THEM IS SELF-AUTHORIZING AND NONE PRETENDS TO BE. They take no token
 * and bypass RLS by construction, so each one's caller carries the check: the
 * source reads answer to `/api/foundry/source`, which is admin-gated and 404s
 * everyone else; the serving read re-checks every rule RLS would have enforced
 * in its own body; the preview read is handed a VIEWER its route resolved from
 * the caller's own validated session and refuses anyone who is neither that
 * version's author nor an admin; and the sweep only ever removes paths a
 * SECURITY DEFINER function already handed back to the caller who was allowed
 * to ask for them.
 *
 * THERE ARE TWO SERVING READS NOW AND THEY ARE DELIBERATELY NOT ONE.
 * `serveBundleFile` answers on the APPS ORIGIN and gates on the VERSION'S OWN
 * STATUS, because that host holds no session and no other question is available
 * to it. `previewBundleFile` answers on the PORTAL ORIGIN and gates on WHO IS
 * ASKING, which is the only place that question can be asked. A single function
 * with a flag would put one boolean between every draft in the table and the
 * open internet; see `previewBundleFile`'s own header for the full comparison.
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

/**
 * The service-role client, as a name. `ReturnType<typeof createClient>` is not
 * assignable to the generic default the helpers below would otherwise infer,
 * so the shape is stated once here rather than spelled at each call site.
 */
type AdminClient = NonNullable<ReturnType<typeof admin>>;

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


/* -------------------------------------------------------------------------
 * THE PREVIEW READ: a version its AUTHOR may run before anybody has approved
 * it.
 *
 * WHY THIS IS A SECOND READER AND NOT A PARAMETER ON `serveBundleFile`.
 * `serveBundleFile` answers on the APPS ORIGIN, where there is no session and
 * cannot be one -- that absence is the whole of what the origin split buys.
 * Its gate is therefore the VERSION'S OWN STATUS, and it has to be: there is
 * nothing on that host that could tell whether the person asking wrote the
 * thing they are asking for. Widening it to admit a draft would mean admitting
 * EVERY draft to EVERYONE, because on that host "everyone" is the only
 * audience it can express. So preview is a different question asked in a
 * different place, and mixing the two into one function with a flag would mean
 * the flag was the only thing standing between a draft and the open internet.
 *
 * WHAT THIS PERMITS THAT `serveBundleFile` DOES NOT, EXACTLY, AND WHY EACH IS
 * SAFE:
 *
 *   ANY STATUS, INCLUDING `draft` AND `rejected`. This is the point. A student
 *     cannot currently run their own app before handing it in, so the first
 *     time anyone finds out whether it works is after review -- which wastes a
 *     review cycle on a build the author could have fixed in a minute. What
 *     makes it safe is not the status but the VIEWER: the only people who
 *     reach these bytes are the person who wrote them and an admin.
 *
 *   A HIDDEN APP, BUT FOR AN ADMIN ONLY. This is the one clause that is a
 *     JUDGEMENT rather than a consequence, so it is written where it can be
 *     changed in one place. Hiding is admin-only and narrows what the OWNER may
 *     do to an app: 0130 already refuses their edit of a hidden one, and 0136
 *     refuses their delete of it, both on the grounds that a shelved app is
 *     under discussion with staff. A new owner capability that ignored the flag
 *     would cut against that, so the owner is refused here too and reads the
 *     sentence the surface already gives them ("talk to your instructor"). An
 *     ADMIN is permitted, for the reason the review load asks for hidden apps
 *     at all: a decision about a shelved app that cannot run the shelved app is
 *     a decision made blind.
 *
 * WHAT IT DOES NOT PERMIT, AND WITH THE ABOVE THESE ARE THE WHOLE OF THE GATE:
 *
 *   A DELETED APP. There is no row, so `previewViewerMayRun` is handed null and
 *     refuses. Deletion is real deletion (0136) and there is nothing to serve.
 *
 *   A VERSION THAT IS NOT THIS APP'S. The URL carries both ids and a caller can
 *     write anything into either; the version's own `app_id` is what decides.
 *     Without this, a student could name THEIR app and SOMEBODY ELSE'S version
 *     and pass the ownership check on the app row they do own.
 *
 *   ANYONE WHO IS NEITHER THE AUTHOR NOR AN ADMIN. Including a signed-in
 *     student looking at another student's draft, which is the case the whole
 *     gate exists for.
 *
 * IT IS THE SAME BODYLESS 404 AS EVERYTHING ELSE. A draft somebody may not see
 * and a version that does not exist are indistinguishable from outside, so the
 * URL cannot be used to ask whether a given student has work in progress.
 *
 * THE SERVICE-ROLE CLIENT IS STILL NOT SELF-AUTHORIZING. It reads the rows
 * bypassing RLS, exactly as the other three readers in this file do, and the
 * decision is made here from what it read against a viewer the ROUTE resolved
 * from the caller's own validated session. Nothing in this function trusts a
 * value that came off the URL except as the thing being looked up.
 * ---------------------------------------------------------------------- */

/**
 * WHO IS ASKING, resolved by the route from the caller's own cookie session --
 * never from anything in the URL.
 *
 * `isAdmin` is `$lib/server/admin`'s answer, which is `is_admin()` run as the
 * CALLER through their own client. It is passed in rather than asked for here
 * because this module holds the service-role key: a function with that key
 * that also decided who was an admin would be one edit away from deciding it
 * from a parameter.
 */
export type FoundryPreviewViewer = { id: string; isAdmin: boolean };

/**
 * THE PREVIEW GATE, AS A PURE PREDICATE OVER THE ROWS.
 *
 * It is separated from the IO so it can be asserted directly, in every
 * combination, against a table of rows -- a gate reachable only through a
 * Supabase client is a gate whose refusals are tested by hoping.
 *
 * IT FAILS CLOSED ON EVERY MISSING INPUT. A null app (deleted, or never
 * existed), a null version, a null viewer and an EMPTY viewer id all refuse
 * before anything else is considered. The empty id matters: `locals.claims.sub`
 * is a string, and a caller with no session must not be able to match an
 * `owner` column that is somehow also empty.
 *
 * THE APP/VERSION PAIRING IS CHECKED HERE, not left to the caller. Both ids
 * come off the URL, so a version that belongs to another app has to be refused
 * by the same predicate that decides ownership, or the ownership check is
 * running against the wrong row.
 *
 * THE ADMIN BRANCH COMES BEFORE THE HIDDEN ONE, which is the whole of the
 * hidden rule: an admin previews a shelved app (they are the person who shelved
 * it, and a decision about a build that cannot run the build is made blind),
 * and the owner does not (0130 refuses their edit of one and 0136 their delete
 * of one, for the same reason). A NULL OWNER NEVER MATCHES, so a row whose
 * owner column is somehow empty is not previewable by a viewer whose id is
 * somehow empty -- both halves of that are already refused above, and this is
 * the third refusal of the same thing.
 */
export function previewViewerMayRun(
	app: { id: string; owner: string | null; hidden_at: string | null } | null,
	version: { app_id: string } | null,
	viewer: FoundryPreviewViewer | null
): boolean {
	if (!app || !version || !viewer) return false;
	if (!viewer.id) return false;
	if (version.app_id !== app.id) return false;
	if (viewer.isAdmin) return true;
	if (app.hidden_at !== null) return false;
	return app.owner !== null && app.owner === viewer.id;
}

/**
 * One file of one version, if and only if this viewer may preview it.
 *
 * THE FILE LIST IS STILL THE ALLOWLIST and `bundlePathOk` still runs first, as
 * an independent second refusal -- those two properties are not about who is
 * asking and do not relax for a preview.
 *
 * IN DEV, WITH NO REAL PROJECT, the rows and bytes come from
 * `./foundry-dev-fixture`, whose apps carry no owner column at all -- so this
 * branch STATES one: `FIXTURE_VIEWER` is treated as the author of every fixture
 * app. That is a fact about the fixture, written here rather than there, and it
 * is what lets the author/not-author/admin split be driven against the real
 * handler. It changes nothing about the gate: the same predicate decides, with
 * the same three refusals.
 */
export async function previewBundleFile(
	appId: string,
	versionId: string,
	path: string,
	viewer: FoundryPreviewViewer | null
): Promise<FoundryServeResult> {
	if (!bundlePathOk(path)) return REFUSED;
	if (!viewer || !viewer.id) return REFUSED;

	if (dev && isFixtureApp(appId)) {
		const app = fixtureApp(appId);
		const version = fixtureVersion(versionId);
		if (!app || !version) return REFUSED;
		if (
			!previewViewerMayRun(
				{ id: app.id, owner: FIXTURE_VIEWER, hidden_at: app.hiddenAt },
				{ app_id: version.appId },
				viewer
			)
		)
			return REFUSED;
		const file = version.files.get(path);
		if (!file) return REFUSED;
		return { ok: true, bytes: file.bytes, contentType: file.contentType };
	}

	const client = admin();
	if (!client) return REFUSED;

	const { data: version, error: versionErr } = await client
		.from('student_app_versions')
		.select('id, app_id')
		.eq('id', versionId)
		.maybeSingle<{ id: string; app_id: string }>();
	if (versionErr || !version) return REFUSED;

	const { data: app, error: appErr } = await client
		.from('student_apps')
		.select('id, owner, hidden_at')
		.eq('id', appId)
		.maybeSingle<{ id: string; owner: string | null; hidden_at: string | null }>();
	if (appErr || !app) return REFUSED;

	if (!previewViewerMayRun(app, version, viewer)) return REFUSED;

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

/* -------------------------------------------------------------------------
 * THE DOWNLOAD: a whole version, as a zip, for the person who wrote it.
 *
 * WHAT IS IN THE ARCHIVE IS WHAT RUNS. It is rebuilt from `student_app_files`
 * and the bytes in `foundry-bundles`, never from the raw upload in
 * `foundry-uploads` -- and the raw upload does exist for every version
 * (`zip_path` is `not null`, and the browser packs a folder or a single HTML
 * file into a zip before anything is sent), so this is a choice and not a
 * limitation. The reasons are in `bundle-url.ts` beside the URL builder: the
 * upload contains files nothing serves and a layout nothing runs, and it does
 * not round-trip, because it is the INPUT to ingest rather than a fixed point
 * of it. The same argument the source viewer already makes for a reviewer
 * applies to an author.
 *
 * THE GATE IS `previewViewerMayRun` AND IT IS NOT A SECOND COPY OF ANYTHING.
 * Downloading a build and running a build are the same question about the same
 * three rows -- is this the author, or an admin, and is this version really
 * this app's -- so they are one predicate. A student may take any version of an
 * app they own; an admin may take any version of any app; NOBODY else may take
 * anything, which is deliberate and not an oversight: peer download is a
 * different question about student work and nobody has asked it.
 *
 * EVERY REFUSAL IS THE SAME EMPTY ANSWER, so a wrong id, another student's app,
 * a version belonging to a different app and a bundle that never unpacked are
 * indistinguishable from outside and the URL cannot be used to ask whether a
 * given student has work in progress.
 *
 * IT BUFFERS, AND THAT IS MEASURED RATHER THAN ASSUMED. `buildZip` compresses
 * every entry into memory and concatenates one output array, so the resident
 * set is the whole bundle plus the whole archive rather than one entry at a
 * time. Measured against the caps' worst case -- 1500 files, 75 MB unpacked,
 * fully incompressible, which is the largest bundle `FOUNDRY_LIMITS` permits to
 * exist -- peak RSS was 268 MB and the build took 3.5 s, against a Vercel Node
 * function's 1024 MB. Half-compressible, which is what a real bundle of source
 * plus PNG and woff2 assets looks like, it was 224 MB and 2.4 s. So the
 * existing caps are the ceiling and no new one is added here: every version in
 * the table is already under them by construction, and a download limit lower
 * than the upload limit would refuse an app that legitimately exists.
 *
 * WHAT WOULD ACTUALLY BITE FIRST IS DURATION, NOT MEMORY: 1500 files is 1500
 * Storage round trips, which is why they are issued in bounded parallel below
 * rather than one after another. If a future cap raises either byte figure, the
 * answer is a streaming writer (one entry inflated, compressed and emitted at a
 * time, as the deck reader's `ZipSource` does), not a bigger function.
 * ---------------------------------------------------------------------- */

export type FoundryDownloadResult =
	| { ok: true; bytes: Uint8Array; filename: string }
	| { ok: false };

const DOWNLOAD_REFUSED: FoundryDownloadResult = { ok: false };

/**
 * How many bundle objects are fetched at once.
 *
 * SEQUENTIAL WOULD BE THE DURATION CEILING. At 1500 files a serial loop pays
 * 1500 round-trip latencies end to end, which is where a serverless function
 * runs out of time long before it runs out of memory. Eight is deliberately
 * modest: the point is to stop latency being multiplied by the file count, not
 * to open as many sockets as the runtime will allow, and the memory argument
 * above assumes the whole bundle is resident anyway.
 */
const DOWNLOAD_CONCURRENCY = 8;

/**
 * Fetch every path, in bounded parallel, preserving the input order.
 *
 * A SINGLE FAILURE FAILS THE WHOLE ARCHIVE, which is the only honest answer: a
 * zip missing one file is a zip that opens, looks complete and does not run,
 * and the student would have no way to tell. There is no partial download.
 */
async function fetchBundleBytes(
	client: AdminClient,
	appId: string,
	versionId: string,
	paths: readonly string[]
): Promise<Uint8Array[] | null> {
	const out: (Uint8Array | null)[] = new Array(paths.length).fill(null);
	let next = 0;
	let failed = false;

	const worker = async () => {
		for (;;) {
			if (failed) return;
			const i = next++;
			if (i >= paths.length) return;
			const path = paths[i]!;
			const { data: blob, error } = await client.storage
				.from(FOUNDRY_BUNDLE_BUCKET)
				.download(`${appId}/${versionId}/${path}`);
			if (error || !blob) {
				failed = true;
				return;
			}
			out[i] = new Uint8Array(await blob.arrayBuffer());
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, paths.length) }, worker)
	);

	if (failed) return null;
	if (out.some((b) => b === null)) return null;
	return out as Uint8Array[];
}

/**
 * One whole version as a zip, if and only if this viewer may have it.
 *
 * `bundlePathOk` RUNS OVER EVERY STORED PATH, as an independent second refusal,
 * exactly as it does on the serving reads. These paths come from rows ingest
 * wrote rather than from a URL, so nothing here is caller-controlled -- but a
 * path that could not be SERVED must not be able to leave in an archive either,
 * and checking is one predicate.
 *
 * A VERSION WITH NO FILES IS REFUSED rather than answered with an empty zip. An
 * upload whose ingest never finished has nothing in it, and a 0-file archive is
 * a download that looks like it worked. `foundryDownloadable` mirrors that
 * clause on the surface so the control is not offered for one.
 *
 * IN DEV, WITH NO REAL PROJECT, the rows and bytes come from
 * `./foundry-dev-fixture`, whose apps carry no owner column -- so this branch
 * STATES one, `FIXTURE_VIEWER`, exactly as `previewBundleFile` does and for the
 * same reason: it is what lets the author / not-author / admin split be driven
 * through the real handler. Fixture versions carry no ordinal either, so the
 * filename falls back to the slug alone.
 */
export async function downloadBundleZip(
	appId: string,
	versionId: string,
	viewer: FoundryPreviewViewer | null
): Promise<FoundryDownloadResult> {
	if (!viewer || !viewer.id) return DOWNLOAD_REFUSED;

	if (dev && isFixtureApp(appId)) {
		const app = fixtureApp(appId);
		const version = fixtureVersion(versionId);
		if (!app || !version) return DOWNLOAD_REFUSED;
		if (
			!previewViewerMayRun(
				{ id: app.id, owner: FIXTURE_VIEWER, hidden_at: app.hiddenAt },
				{ app_id: version.appId },
				viewer
			)
		)
			return DOWNLOAD_REFUSED;

		const entries = [...version.files.entries()]
			.filter(([path]) => bundlePathOk(path))
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([path, f]) => ({ path, bytes: f.bytes }));
		if (entries.length === 0) return DOWNLOAD_REFUSED;

		return {
			ok: true,
			bytes: await buildZip(entries),
			filename: foundryDownloadFilename(app.slug, null)
		};
	}

	const client = admin();
	if (!client) return DOWNLOAD_REFUSED;

	const { data: version, error: versionErr } = await client
		.from('student_app_versions')
		.select('id, app_id, ordinal')
		.eq('id', versionId)
		.maybeSingle<{ id: string; app_id: string; ordinal: number | null }>();
	if (versionErr || !version) return DOWNLOAD_REFUSED;

	const { data: app, error: appErr } = await client
		.from('student_apps')
		.select('id, owner, hidden_at, slug')
		.eq('id', appId)
		.maybeSingle<{ id: string; owner: string | null; hidden_at: string | null; slug: string | null }>();
	if (appErr || !app) return DOWNLOAD_REFUSED;

	if (!previewViewerMayRun(app, version, viewer)) return DOWNLOAD_REFUSED;

	const { data: rows, error: rowsErr } = await client
		.from('student_app_files')
		.select('path')
		.eq('version_id', versionId)
		.order('path');
	if (rowsErr || !rows) return DOWNLOAD_REFUSED;

	const paths = (rows as { path: string }[])
		.map((r) => r.path)
		.filter((p) => bundlePathOk(p));
	if (paths.length === 0) return DOWNLOAD_REFUSED;

	const bytes = await fetchBundleBytes(client, appId, versionId, paths);
	if (!bytes) return DOWNLOAD_REFUSED;

	return {
		ok: true,
		bytes: await buildZip(paths.map((path, i) => ({ path, bytes: bytes[i]! }))),
		filename: foundryDownloadFilename(app.slug, version.ordinal)
	};
}


/**
 * WHICH VERSION AN APP'S DIRECT PAGE (`/a/<app>/`) IS CURRENTLY SHOWING.
 *
 * IT IS A LOOKUP, NOT A DECISION, and the distinction is the whole reason it
 * is three lines rather than thirty. It reads one column and returns it; it
 * does NOT ask whether the app is hidden, whether the version exists or
 * whether that version may be served. Every one of those questions is
 * `serveBundleFile`'s, which the direct route calls straight afterwards with
 * whatever this returns -- so the publication gate has exactly one copy and a
 * hidden app's published id is answered with the same bodyless 404 as an
 * unknown one, from the same three checks, rather than from a second
 * `hidden_at is null` written here.
 *
 * NULL IS A NORMAL ANSWER: an app whose first build is still in review, one
 * whose build was rejected, one that was rolled back to nothing, and an app id
 * that does not exist all produce it, and all of them are the same 404.
 *
 * IT NEVER RETURNS A SUBMITTED VERSION, which is what makes `/a/` strictly
 * narrower than `/b/`. `/b/` serves a submitted build because the REVIEW QUEUE
 * has to run the thing it is deciding about; a direct, shareable, public page
 * for an app has no such need, and an unapproved build is not what an app's
 * own address should be pointing at.
 */
export async function publishedVersionOf(appId: string): Promise<string | null> {
	if (dev && isFixtureApp(appId)) {
		return fixtureApp(appId)?.publishedVersionId ?? null;
	}

	const client = admin();
	if (!client) return null;

	const { data, error } = await client
		.from('student_apps')
		.select('published_version_id')
		.eq('id', appId)
		.maybeSingle<{ published_version_id: string | null }>();
	if (error || !data) return null;
	return data.published_version_id;
}


/* -------------------------------------------------------------------------
 * THE DELETE SWEEP: removing the objects a delete RPC just orphaned.
 *
 * WHY THIS IS HERE AND NOT ANYWHERE ELSE. `foundry-bundles` carries NO storage
 * policy at all, so RLS denies every `anon` and `authenticated` request to it
 * by default and `service_role` is its only reader AND its only deleter. A
 * browser client therefore cannot remove a single bundle byte, whoever is
 * signed in. `foundry-uploads` and `foundry-covers` DO have own-folder delete
 * policies, so an owner could remove their own zip and cover from the
 * browser -- but an ADMIN deleting a student's app could not, because those
 * policies are pinned to `auth.uid()`. One sweep with one role is the honest
 * shape; two half-paths keyed on who is asking is two things to keep right.
 *
 * THIS MODULE IS STILL THE ONE FOUNDRY READER OF THE SERVICE KEY. The sweep is
 * a third function in it, not a second module and not a second client.
 *
 * IT IS NOT AN AUTHORIZATION BOUNDARY AND MUST NEVER BECOME ONE. Every path it
 * touches comes from a plan the DATABASE returned, from a SECURITY DEFINER
 * function that checked `auth.uid()` and `is_admin()` in its own body against
 * the caller's own session. This function asks no question about who is
 * calling, because by the time it runs the rows are already gone and the only
 * question left is which bytes to remove. A caller that hands it a plan it did
 * not get from the RPC is the bug, and there is exactly one such caller.
 *
 * THE BUNDLE SIDE LISTS THE PREFIX RATHER THAN READING THE ROWS, and it has to:
 * the rows are deleted, and the plan carries version IDS rather than a file
 * list precisely so an app with fifty versions does not return twenty-five
 * thousand strings. Listing is also STRICTLY MORE COMPLETE than the rows would
 * have been -- an ingest that failed between uploading an object and writing
 * its row leaves an object no row ever named, and a row-driven sweep would
 * walk straight past it and call the job done.
 *
 * WHAT IT REPORTS IS RE-LISTED, NOT PARSED. After removing, it looks again and
 * reports whatever is still there. See `removeAndVerify` for why that is worth
 * the extra round trip: the rows that named these objects are already gone, so
 * a wrong answer here is unrecoverable from anywhere.
 *
 * NOTHING HERE THROWS. A sweep that fails reports what it could not remove;
 * the app is already deleted and an exception at this point would turn a
 * completed delete into an error message.
 * ---------------------------------------------------------------------- */

/**
 * What `foundry_delete_app` / `foundry_delete_version` hand back, as the
 * server reads it. The database names the paths; this module names the
 * buckets.
 */
export type FoundryDeletePlan = {
	/** Bundle objects live at `<appId>/<versionId>/<path>`. */
	appId: string;
	/** Every version whose bundle prefix is to be swept. */
	versionIds: string[];
	/** Whole paths in `foundry-uploads`. */
	zipPaths: string[];
	/** A whole path in `foundry-covers`, or null when another app still names it. */
	coverPath: string | null;
};

export type FoundrySweepResult = {
	bundles: number;
	uploads: number;
	covers: number;
	/**
	 * NULL means every object the plan named is gone. A sentence means some
	 * are not, and `orphaned` says which -- the rows are already deleted, so
	 * this list is the only remaining record of them.
	 */
	problem: string | null;
	/** `<bucket>/<path>` for everything that survived, for a log line. */
	orphaned: string[];
};

/** Storage refuses an unbounded `remove()`; this is well inside every limit. */
const REMOVE_BATCH = 100;

/** One directory of a bucket, one page at a time, as full object names. */
async function listDir(
	client: AdminClient,
	bucket: string,
	dir: string
): Promise<{ names: string[]; prefixes: string[] }> {
	const names: string[] = [];
	const prefixes: string[] = [];
	let offset = 0;
	for (;;) {
		const { data, error } = await client.storage.from(bucket).list(dir, { limit: 100, offset });
		if (error || !data || data.length === 0) break;
		for (const entry of data) {
			const full = dir ? `${dir}/${entry.name}` : entry.name;
			// Storage reports a PREFIX as a row with no id.
			if (entry.id === null) prefixes.push(full);
			else names.push(full);
		}
		if (data.length < 100) break;
		offset += data.length;
	}
	return { names, prefixes };
}

/**
 * Everything under one prefix of a bucket, walked because Storage lists one
 * level at a time. Returns full object names.
 *
 * A bundle is at most 500 files (the preflight's own cap), so this terminates
 * far inside the guard; the counter only exists so a malformed listing cannot
 * spin.
 */
async function listPrefix(client: AdminClient, bucket: string, prefix: string): Promise<string[]> {
	const out: string[] = [];
	const queue: string[] = [prefix];
	for (let guard = 0; queue.length > 0 && guard < 2000; guard += 1) {
		const dir = queue.shift() as string;
		const page = await listDir(client, bucket, dir);
		out.push(...page.names);
		queue.push(...page.prefixes);
	}
	return out;
}

/**
 * Remove a set of exact keys, then RE-LIST to find out what actually went.
 *
 * WHY THE SECOND LOOK, when `remove()` already answers with the objects it
 * deleted. Because that answer is a shape rather than a measurement: it is a
 * `FileObject[]` whose `name` this code would have to match back against the
 * key it sent, and a mismatch in that spelling (a basename where a full key
 * was expected, say) would silently turn every delete into either a false
 * "nothing was removed" or, far worse in the other direction, a claimed clean
 * sweep. The rows that named these objects are already gone when this runs, so
 * a wrong answer here is not recoverable from anywhere.
 *
 * Listing the container again asks the question directly: what is still there.
 * It costs one extra round trip per bucket group and it makes "the objects are
 * gone" a thing this function MEASURED rather than parsed.
 *
 * A KEY THAT WAS NEVER THERE COUNTS AS GONE, which is correct: an ingest that
 * failed before uploading, or a re-run of a sweep that already succeeded, both
 * produce exactly that and neither is an orphan.
 */
async function removeAndVerify(
	client: AdminClient,
	bucket: string,
	keys: string[]
): Promise<{ removed: number; left: string[] }> {
	if (keys.length === 0) return { removed: 0, left: [] };

	for (let i = 0; i < keys.length; i += REMOVE_BATCH) {
		// The refusal is not read here: what matters is the state afterwards,
		// and a partial batch failure shows up in the re-list either way.
		await client.storage.from(bucket).remove(keys.slice(i, i + REMOVE_BATCH));
	}

	// One listing per distinct directory, rather than one per key.
	const dirs = new Set(keys.map((k) => k.slice(0, k.lastIndexOf('/')).replace(/^\/+/, '')));
	const survivors = new Set<string>();
	for (const dir of dirs) {
		const page = await listDir(client, bucket, dir);
		for (const name of page.names) survivors.add(name);
	}

	const left = keys.filter((k) => survivors.has(k));
	return { removed: keys.length - left.length, left: left.map((k) => `${bucket}/${k}`) };
}

/**
 * Remove every object a delete plan names.
 *
 * CALLED AFTER THE ROWS ARE ALREADY GONE, which is the whole ordering argument
 * (0136's header has it in full): rows first means a failure here leaves an
 * ORPHANED OBJECT, which nothing serves and nothing lists; objects first would
 * mean a failure leaves a LIVE APP POINTING AT BYTES THAT NO LONGER EXIST,
 * which the student finds for us.
 */
export async function sweepFoundryObjects(plan: FoundryDeletePlan): Promise<FoundrySweepResult> {
	const empty: FoundrySweepResult = {
		bundles: 0,
		uploads: 0,
		covers: 0,
		problem: null,
		orphaned: []
	};

	const client = admin();
	if (!client) {
		return {
			...empty,
			problem: 'Bundle storage is not configured on this deployment, so no files were removed.',
			orphaned: [
				...plan.versionIds.map((v) => `${FOUNDRY_BUNDLE_BUCKET}/${plan.appId}/${v}/*`),
				...plan.zipPaths.map((z) => `${FOUNDRY_UPLOAD_BUCKET}/${z}`),
				...(plan.coverPath ? [`${FOUNDRY_COVER_BUCKET}/${plan.coverPath}`] : [])
			]
		};
	}

	const orphaned: string[] = [];

	let bundles = 0;
	for (const versionId of plan.versionIds) {
		// THE PREFIX, NOT THE ROWS. The rows are already deleted, and listing is
		// strictly more complete than they were: an ingest that failed between
		// uploading an object and writing its row leaves an object no row ever
		// named, and a row-driven sweep would walk past it and call it done.
		const keys = await listPrefix(client, FOUNDRY_BUNDLE_BUCKET, `${plan.appId}/${versionId}`);
		const r = await removeAndVerify(client, FOUNDRY_BUNDLE_BUCKET, keys);
		bundles += r.removed;
		orphaned.push(...r.left);
	}

	const zips = await removeAndVerify(client, FOUNDRY_UPLOAD_BUCKET, plan.zipPaths);
	orphaned.push(...zips.left);

	const covers = plan.coverPath
		? await removeAndVerify(client, FOUNDRY_COVER_BUCKET, [plan.coverPath])
		: { removed: 0, left: [] as string[] };
	orphaned.push(...covers.left);

	return {
		bundles,
		uploads: zips.removed,
		covers: covers.removed,
		problem:
			orphaned.length === 0
				? null
				: `${orphaned.length} stored ${orphaned.length === 1 ? 'file' : 'files'} could not be removed.`,
		orphaned
	};
}
