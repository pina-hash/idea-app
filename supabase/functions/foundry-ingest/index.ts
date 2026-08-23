/**
 * FOUNDRY INGEST: takes a zip a student has already uploaded, preflights it,
 * and on a pass extracts it into files the bundle proxy can serve.
 *
 * WHERE THIS SITS. The client calls `foundry_create_version` and gets a draft
 * version id; it uploads the zip to `foundry-uploads` under its OWN prefix,
 * which is the only thing that bucket's policies permit; then it invokes this
 * with the version id. On a pass the version stays DRAFT with its manifest
 * populated. PREFLIGHT PASSING IS NOT SUBMISSION -- the student reads the
 * result and submits separately, through `foundry_submit_version`.
 *
 * TWO CLIENTS, FOR TWO DIFFERENT JOBS.
 *
 *   userClient   built from the caller's own JWT, and used for exactly one
 *                thing: establishing WHO is calling. Nothing is read through
 *                it, because a read through it answers "may this caller see
 *                the row", and the question here is "does this caller OWN it"
 *                -- `foundry_can_read_version` legitimately returns other
 *                people's published versions, so a successful read proves
 *                nothing about ownership.
 *
 *   admin        service_role. The only writer `foundry-bundles` has, by
 *                design: 0130 gives that bucket NO policy of any kind, so RLS
 *                denies every authenticated and anon request and only a
 *                role that bypasses RLS reaches it. Ownership is re-checked
 *                against the row this client reads, in this file, because
 *                service_role has no policies to do it for us.
 *
 * NO IDENTITY COMES OFF THE REQUEST BODY. The body carries a version id and
 * nothing else that matters; the user id is whatever the JWT says it is.
 *
 * A REFUSAL A STUDENT MUST READ IS A 200 WITH `ok: false`, not an HTTP error.
 * The preflight considered the upload and answered; that is a result, and a
 * client that treats it as a transport failure would retry it five times. Only
 * a genuinely broken call (no JWT, bad JSON, missing configuration) gets a
 * status in the 400s.
 *
 * "NOT FOUND" AND "NOT YOURS" ANSWER IDENTICALLY, so a version id cannot be
 * probed by watching which one comes back.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

import {
	FOUNDRY_ENTRY_FILE,
	FOUNDRY_LIMITS,
	extensionOf,
	foundryMime,
	isTextExtension,
	largeAssetWarning,
	planStructure,
	scanCss,
	scanHtml,
	scanJs,
	uncompressedCapMessage,
	unreadableZipMessage,
	versionIsIngestable,
	type FoundryIssue
} from '../../../src/lib/foundry/preflight.ts';
import {
	ByteBudget,
	ZipBudgetError,
	ZipReadError,
	inflateEntry,
	readCentralDirectory
} from '../../../src/lib/foundry/zip.ts';
import { readHtml } from './html.ts';

const BUNDLE_BUCKET = 'foundry-bundles';
const UPLOAD_BUCKET = 'foundry-uploads';

const CORS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...CORS, 'Content-Type': 'application/json' }
	});
}

/** The one shape every refusal a student reads comes back in. */
function refused(reason: string, failures: FoundryIssue[], extra: Record<string, unknown> = {}) {
	return json({ ok: false, reason, failures, ...extra });
}

interface VersionRow {
	id: string;
	app_id: string;
	status: string;
	zip_path: string;
	ordinal: number;
}

interface AppRow {
	id: string;
	owner: string;
	hidden_at: string | null;
}

/**
 * Everything under one prefix, walked because Storage lists one level at a
 * time. Returns full object names.
 */
async function listPrefix(admin: SupabaseClient, prefix: string): Promise<string[]> {
	const out: string[] = [];
	const queue: string[] = [prefix];
	// A bundle is at most 500 files, so this terminates well inside any sane
	// bound; the counter is only here so a malformed listing cannot spin.
	for (let guard = 0; queue.length > 0 && guard < 2000; guard++) {
		const dir = queue.shift() as string;
		let offset = 0;
		for (;;) {
			const { data, error } = await admin.storage
				.from(BUNDLE_BUCKET)
				.list(dir, { limit: 100, offset });
			if (error || !data || data.length === 0) break;
			for (const entry of data) {
				const full = `${dir}/${entry.name}`;
				// Storage reports a prefix as a row with no id.
				if (entry.id === null) queue.push(full);
				else out.push(full);
			}
			if (data.length < 100) break;
			offset += data.length;
		}
	}
	return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
	if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

	const url = Deno.env.get('SUPABASE_URL');
	const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
	// A missing variable degrades to a clear refusal rather than a retryable
	// failure: it does not fix itself in eight seconds of backoff.
	if (!url || !serviceKey || !anonKey) {
		return json({ ok: false, reason: 'not_configured' }, 500);
	}

	const authHeader = req.headers.get('Authorization') ?? '';
	if (!authHeader.toLowerCase().startsWith('bearer ')) {
		return json({ ok: false, reason: 'not_signed_in' }, 401);
	}

	let body: { version_id?: unknown };
	try {
		body = await req.json();
	} catch {
		return json({ ok: false, reason: 'bad_request' }, 400);
	}
	const versionId = typeof body.version_id === 'string' ? body.version_id.trim() : '';
	if (versionId === '') return json({ ok: false, reason: 'bad_request' }, 400);

	// Identity, and nothing else, comes from this client.
	const userClient = createClient(url, anonKey, {
		global: { headers: { Authorization: authHeader } },
		auth: { persistSession: false }
	});
	const { data: userData, error: userErr } = await userClient.auth.getUser();
	const uid = userData?.user?.id;
	if (userErr || !uid) return json({ ok: false, reason: 'not_signed_in' }, 401);

	const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

	const { data: version, error: versionErr } = await admin
		.from('student_app_versions')
		.select('id, app_id, status, zip_path, ordinal')
		.eq('id', versionId)
		.maybeSingle<VersionRow>();
	if (versionErr) return json({ ok: false, reason: 'lookup_failed' }, 500);
	if (!version) return json({ ok: false, reason: 'not_found' }, 404);

	const { data: app, error: appErr } = await admin
		.from('student_apps')
		.select('id, owner, hidden_at')
		.eq('id', version.app_id)
		.maybeSingle<AppRow>();
	if (appErr) return json({ ok: false, reason: 'lookup_failed' }, 500);
	// Same answer as a missing version, deliberately.
	if (!app || app.owner !== uid) return json({ ok: false, reason: 'not_found' }, 404);

	if (app.hidden_at !== null) {
		return refused('app_hidden', [
			{
				file: null,
				line: null,
				message: 'This app has been hidden by staff, so nothing new can be uploaded to it. Talk to your teacher.'
			}
		]);
	}
	if (!versionIsIngestable(version.status)) {
		return refused('not_draft', [
			{
				file: null,
				line: null,
				message: `This upload has already been ${version.status}, so it cannot be replaced. Start a new version and upload your fixed zip to that.`
			}
		]);
	}

	/*
	 * THE ZIP PATH IS RE-PINNED TO THE OWNER HERE.
	 *
	 * `foundry_create_version` validates `p_zip_path` as a legal path but does
	 * NOT require it to sit under the caller's own prefix, and this function
	 * reads that bucket with service_role, which bypasses the storage policy
	 * that would otherwise have been the only thing enforcing it. So a student
	 * could name another student's upload prefix at create time and have this
	 * function extract somebody else's zip into their own app. Checking it here
	 * closes that, and it is checked against the APP OWNER rather than the
	 * caller because those are the same person by this point and the owner is
	 * the one the prefix belongs to.
	 */
	if (!version.zip_path.startsWith(`${app.owner}/`)) {
		return json({ ok: false, reason: 'not_found' }, 404);
	}

	// ---------------------------------------------------------------- read
	const download = await admin.storage.from(UPLOAD_BUCKET).download(version.zip_path);
	if (download.error || !download.data) {
		return refused('no_upload', [
			{
				file: null,
				line: null,
				message: 'The uploaded file could not be found. Upload your zip again and then run the check.'
			}
		]);
	}
	const bytes = new Uint8Array(await download.data.arrayBuffer());

	const stamp = new Date().toISOString();
	const failManifest = (failures: FoundryIssue[], warnings: FoundryIssue[], notes: string[]) => ({
		ok: false,
		checkedAt: stamp,
		entry: null,
		zipBytes: bytes.byteLength,
		fileCount: 0,
		totalBytes: 0,
		strippedWrapper: null,
		failures,
		warnings,
		notes
	});

	const recordManifest = async (manifest: Record<string, unknown>) => {
		await admin
			.from('student_app_versions')
			.update({
				manifest,
				byte_size: typeof manifest.totalBytes === 'number' ? manifest.totalBytes : 0,
				file_count: typeof manifest.fileCount === 'number' ? manifest.fileCount : 0
			})
			.eq('id', version.id);
	};

	if (bytes.byteLength === 0) {
		const m = failManifest(
			[{ file: null, line: null, message: unreadableZipMessage() }],
			[],
			[]
		);
		await recordManifest(m);
		return refused('preflight_failed', m.failures, { warnings: [], notes: [] });
	}

	const records = readCentralDirectory(bytes);
	if (records === null) {
		const m = failManifest(
			[{ file: null, line: null, message: unreadableZipMessage() }],
			[],
			[]
		);
		await recordManifest(m);
		return refused('preflight_failed', m.failures, { warnings: [], notes: [] });
	}

	// ------------------------------------------------------------ structure
	const plan = planStructure(
		records.map((r) => ({
			name: r.name,
			directory: r.directory,
			irregular: r.irregular,
			declaredSize: r.uncompressedSize
		})),
		bytes.byteLength
	);

	const failures: FoundryIssue[] = [...plan.failures];
	const warnings: FoundryIssue[] = [];

	if (failures.length > 0) {
		const m = failManifest(failures, warnings, plan.notes);
		await recordManifest(m);
		return refused('preflight_failed', failures, { warnings, notes: plan.notes });
	}

	// -------------------------------------------------------------- inflate
	//
	// EVERYTHING IS INFLATED BEFORE ANYTHING IS WRITTEN. That is what makes a
	// hard fail leave the bucket untouched, and it is what lets the budget
	// abort the run partway with nothing to undo. The ceiling is 25 MB, so
	// holding the bundle in memory costs less than the bookkeeping of a
	// half-written extraction would.
	const budget = new ByteBudget(FOUNDRY_LIMITS.maxTotalBytes);
	const decoder = new TextDecoder('utf-8');
	const built: { path: string; bytes: Uint8Array; contentType: string }[] = [];

	for (const file of plan.files) {
		const record = records[file.index];
		if (!record) continue;
		let content: Uint8Array;
		try {
			content = await inflateEntry(bytes, record, file.path, budget);
		} catch (err) {
			if (err instanceof ZipBudgetError) {
				const m = failManifest(
					[{ file: err.path, line: null, message: uncompressedCapMessage(err.path) }],
					warnings,
					plan.notes
				);
				await recordManifest(m);
				return refused('preflight_failed', m.failures, { warnings, notes: plan.notes });
			}
			const message =
				err instanceof ZipReadError
					? `${file.path} could not be unpacked from the zip. Re-make the zip and upload it again.`
					: `${file.path} could not be read from the zip. Re-make the zip and upload it again.`;
			const m = failManifest([{ file: file.path, line: null, message }], warnings, plan.notes);
			await recordManifest(m);
			return refused('preflight_failed', m.failures, { warnings, notes: plan.notes });
		}

		if (content.byteLength > FOUNDRY_LIMITS.warnAssetBytes) {
			warnings.push(largeAssetWarning(file.path, content.byteLength));
		}

		const ext = extensionOf(file.path);
		if (isTextExtension(ext) && ext !== 'json' && ext !== 'txt') {
			const text = decoder.decode(content);
			if (ext === 'html') {
				const r = scanHtml(file.path, text, readHtml);
				if (r.parseFailed) {
					// Loud in the log, because every HTML rule is off while this is
					// true, and said out loud to the student too: "we checked it and
					// found nothing" and "we could not check it" are different
					// answers, and only one of them is worth acting on.
					console.error(`foundry-ingest: HTML parser failed on ${file.path}: ${r.parseError}`);
					warnings.push({
						file: file.path,
						line: null,
						message: `${file.path} could not be checked automatically, so the checks for blocked links and page title were skipped for it. Your app was still saved. If it does not work when you open it, check that every link and image in this file points at a file inside your app folder.`
					});
				}
				failures.push(...r.failures);
				warnings.push(...r.warnings);
			} else if (ext === 'css') {
				failures.push(...scanCss(file.path, text).failures);
			} else if (ext === 'js') {
				const r = scanJs(file.path, text);
				failures.push(...r.failures);
				warnings.push(...r.warnings);
			}
		}

		built.push({ path: file.path, bytes: content, contentType: foundryMime(file.path) });
	}

	if (failures.length > 0) {
		const m = failManifest(failures, warnings, plan.notes);
		await recordManifest(m);
		return refused('preflight_failed', failures, { warnings, notes: plan.notes });
	}

	// --------------------------------------------------------------- write
	//
	// IDEMPOTENT, AND THE PURGE HAPPENS HERE rather than at the top. A run that
	// is going to refuse leaves the previous extraction exactly as it was --
	// "refused, nothing written" means nothing DELETED either. Only a run that
	// has already passed every check clears the old file set, so a student who
	// fixes a zip and re-runs ends with exactly one.
	const prefix = `${app.id}/${version.id}`;
	const existing = await listPrefix(admin, prefix);
	if (existing.length > 0) {
		const { error } = await admin.storage.from(BUNDLE_BUCKET).remove(existing);
		if (error) return json({ ok: false, reason: 'cleanup_failed' }, 500);
	}
	const { error: rowsErr } = await admin
		.from('student_app_files')
		.delete()
		.eq('version_id', version.id);
	if (rowsErr) return json({ ok: false, reason: 'cleanup_failed' }, 500);

	let totalBytes = 0;
	for (const file of built) {
		const { error } = await admin.storage
			.from(BUNDLE_BUCKET)
			.upload(`${prefix}/${file.path}`, file.bytes as unknown as ArrayBuffer, {
				contentType: file.contentType,
				upsert: true
			});
		if (error) return json({ ok: false, reason: 'write_failed', detail: error.message }, 500);
		totalBytes += file.bytes.byteLength;
	}

	const { error: insertErr } = await admin.from('student_app_files').insert(
		built.map((f) => ({
			version_id: version.id,
			path: f.path,
			content_type: f.contentType,
			byte_size: f.bytes.byteLength
		}))
	);
	if (insertErr) return json({ ok: false, reason: 'index_failed', detail: insertErr.message }, 500);

	const manifest = {
		ok: true,
		checkedAt: stamp,
		entry: FOUNDRY_ENTRY_FILE,
		zipBytes: bytes.byteLength,
		fileCount: built.length,
		totalBytes,
		strippedWrapper: plan.strippedWrapper,
		droppedOsNoise: plan.droppedOsNoise,
		files: built.map((f) => ({
			path: f.path,
			size: f.bytes.byteLength,
			contentType: f.contentType
		})),
		warnings,
		notes: plan.notes,
		failures: [] as FoundryIssue[]
	};
	await recordManifest(manifest);

	return json({
		ok: true,
		versionId: version.id,
		entry: FOUNDRY_ENTRY_FILE,
		fileCount: built.length,
		totalBytes,
		strippedWrapper: plan.strippedWrapper,
		warnings,
		notes: plan.notes,
		// Still a draft. Submitting is a separate, deliberate act.
		status: 'draft'
	});
});
