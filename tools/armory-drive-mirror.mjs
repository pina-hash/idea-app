#!/usr/bin/env node
// tools/armory-drive-mirror.mjs
//
// THE NIGHTLY READABLE MIRROR OF IDEA ARMORY TO A GOOGLE SHARED DRIVE (ledger
// 0404, decision 41 item 2). Run by `.github/workflows/armory-drive-mirror.yml`
// and by nothing else. What it decides is `tools/armory-drive-mirror-plan.mjs`;
// this file is the three network adapters and the command line.
//
//   node tools/armory-drive-mirror.mjs                 the real run
//   node tools/armory-drive-mirror.mjs --dry-run       read everything, write nothing, say what it would do
//   node tools/armory-drive-mirror.mjs --fixture tools/armory-drive-mirror.fixture.json [--dry-run]
//                                                      the same run over an in-memory store and Drive
//   --budget-minutes N                                 stop starting new copies after N minutes (default 300)
//
// ---------------------------------------------------------------------------
// THE CREDENTIALS ARE ITS OWN, AND EACH NAME HAS THIS FILE AS ITS ONE READER
// (CLAUDE.md, "ONE MODULE KNOWS EACH CREDENTIAL"). `ARMORY_MIRROR_*` are
// repository secrets. The values may be the same as the website's (the
// Supabase service role key, the Google OAuth client), but the NAMES are
// distinct, so revoking the mirror never touches the site and a leak of one is
// not a leak of both -- the shape `tools/backup/drive-upload.mjs` set.
//
//   * Supabase: the SERVICE ROLE key, because the job must read every project
//     and the Armory tables carry RLS with member-only read policies. It is
//     used for GET requests to four tables and four columns sets, nothing else:
//     armory_projects (id, name, pinned_release, archived_at), armory_files (id,
//     project_id, folder, name, current_version_id, deleted_at),
//     armory_versions (id, file_id, content_sha256, byte_length, author_email,
//     created_at) and armory_version_releases (version_id, saved_release). No
//     member list, no device, no lock, no feed. There is no write in this file.
//   * R2: a key Mr. Pina makes with "Object Read only" on the Armory bucket, so
//     the job CANNOT write to storage, whatever this file says.
//   * Google: an OAuth refresh token for the Bosco Tech account that is a
//     Content manager of the Shared Drive.
//
// UNSET SECRETS ARE "NOT SET UP", A GREEN RUN WITH A SUMMARY SAYING WHICH. The
// opposite of backup.yml's choice, on purpose: the mirror is a second copy of
// data that is already safe in R2 and Supabase, and a red run every night
// before anybody has set it up teaches people to ignore the colour.
//
// NOTHING SECRET IS EVER PRINTED. Error messages carry a status and a short
// body, never a URL (an R2 URL carries its signature in the query) and never a
// header.

import { createReadStream, createWriteStream, mkdtempSync, readFileSync, rmSync, statSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
	fakeDrive,
	fakeSource,
	missingSecrets,
	notSetUpMarkdown,
	runMirror,
	sha256Of,
	summaryMarkdown
} from './armory-drive-mirror-plan.mjs';
import { presignUrl } from '../src/lib/server/armory/sigv4.ts';
import { contentObjectKey } from '../src/lib/server/armory/object-key.ts';

export const GOOGLE = {
	token: 'https://oauth2.googleapis.com/token',
	upload: 'https://www.googleapis.com/upload/drive/v3/files',
	files: 'https://www.googleapis.com/drive/v3/files'
};
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PAGE = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = async (res) => (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// The store: Supabase rows over HTTPS, and R2 bytes by a signed GET.
// ---------------------------------------------------------------------------

export function supabaseSource(env, fetcher = fetch) {
	const base = env.ARMORY_MIRROR_SUPABASE_URL.trim().replace(/\/+$/, '');
	const key = env.ARMORY_MIRROR_SUPABASE_SERVICE_ROLE_KEY.trim();
	const r2 = {
		account: env.ARMORY_MIRROR_R2_ACCOUNT_ID.trim(),
		access: env.ARMORY_MIRROR_R2_ACCESS_KEY_ID.trim(),
		secret: env.ARMORY_MIRROR_R2_SECRET_ACCESS_KEY.trim(),
		bucket: env.ARMORY_MIRROR_R2_BUCKET.trim()
	};

	/** Every row, 1000 at a time, ordered on the table's key so a page never repeats or skips one. */
	async function rows(table, select, order, filters = '') {
		const out = [];
		for (let offset = 0; ; offset += PAGE) {
			const url = `${base}/rest/v1/${table}?select=${select}${filters}&order=${order}.asc&limit=${PAGE}&offset=${offset}`;
			const res = await fetcher(url, { headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' } });
			if (!res.ok) throw new Error(`reading ${table} failed (${res.status}): ${await short(res)}`);
			const page = await res.json();
			out.push(...page);
			if (page.length < PAGE) return out;
		}
	}

	return {
		projects: () => rows('armory_projects', 'id,name,pinned_release,archived_at', 'id'),
		files: () => rows('armory_files', 'id,project_id,folder,name,current_version_id,deleted_at', 'id', '&deleted_at=is.null&current_version_id=not.is.null'),
		versions: () => rows('armory_versions', 'id,file_id,content_sha256,byte_length,author_email,created_at', 'id'),
		releases: () => rows('armory_version_releases', 'version_id,saved_release', 'version_id', '&side=is.false'),
		/** The stored bytes, to a temporary file, hashed on the way past. */
		async fetchObject(sha256) {
			const url = presignUrl({
				accessKey: r2.access,
				secretKey: r2.secret,
				region: 'auto',
				url: `https://${r2.account}.r2.cloudflarestorage.com/${encodeURIComponent(r2.bucket)}/${contentObjectKey(sha256)}`,
				method: 'GET',
				now: new Date(Math.floor(Date.now() / 1000) * 1000),
				lifetimeSeconds: 15 * 60
			});
			const res = await fetcher(url);
			if (res.status === 404) throw new Error('the stored file is missing from file storage');
			if (!res.ok || !res.body) throw new Error(`file storage answered ${res.status}`);
			const dir = mkdtempSync(join(tmpdir(), 'armory-mirror-'));
			const path = join(dir, 'blob');
			const hash = createHash('sha256');
			let bytes = 0;
			const tap = new Transform({
				transform(chunk, _enc, done) {
					hash.update(chunk);
					bytes += chunk.length;
					done(null, chunk);
				}
			});
			try {
				await pipeline(Readable.fromWeb(res.body), tap, createWriteStream(path));
			} catch (e) {
				rmSync(dir, { recursive: true, force: true });
				throw e;
			}
			return { sha256: hash.digest('hex'), bytes, path, cleanup: async () => rmSync(dir, { recursive: true, force: true }) };
		}
	};
}

// ---------------------------------------------------------------------------
// Google Drive.
// ---------------------------------------------------------------------------

export function googleDrive(env, api = GOOGLE, fetcher = fetch) {
	const rootId = env.ARMORY_MIRROR_DRIVE_FOLDER_ID.trim();
	let token = null;

	async function refresh() {
		const res = await fetcher(api.token, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: env.ARMORY_MIRROR_GOOGLE_REFRESH_TOKEN.trim(),
				client_id: env.ARMORY_MIRROR_GOOGLE_CLIENT_ID.trim(),
				client_secret: env.ARMORY_MIRROR_GOOGLE_CLIENT_SECRET.trim()
			})
		});
		const text = await res.text();
		if (!res.ok) {
			const hint = text.includes('invalid_grant')
				? ' The refresh token no longer works (revoked, expired, or the Google password changed): mint a new one at ideabosco.com/admin/drive-connect and update ARMORY_MIRROR_GOOGLE_REFRESH_TOKEN.'
				: '';
			throw new Error(`Google sign-in failed (${res.status}).${hint}`);
		}
		token = JSON.parse(text).access_token;
		if (!token) throw new Error('Google sign-in returned no access token.');
	}

	/** One request, signed in, retried on 429, 5xx and one expired token. */
	async function call(method, url, { json, body, headers = {} } = {}) {
		if (!token) await refresh();
		for (let attempt = 0; ; attempt++) {
			const res = await fetcher(url, {
				method,
				headers: { authorization: `Bearer ${token}`, ...(json ? { 'content-type': 'application/json; charset=UTF-8' } : {}), ...headers },
				body: json ? JSON.stringify(json) : body,
				...(body && typeof body !== 'string' && !(body instanceof Uint8Array) ? { duplex: 'half' } : {})
			});
			if (res.status === 401 && attempt === 0) {
				await refresh();
				continue;
			}
			if ((res.status === 429 || res.status >= 500) && attempt < 4 && (!body || typeof body === 'string' || body instanceof Uint8Array)) {
				await sleep(1000 * 4 ** attempt);
				continue;
			}
			return res;
		}
	}
	async function ok(res, what) {
		if (!res.ok) throw new Error(`Drive ${what} failed (${res.status}): ${await short(res)}`);
		return res;
	}

	/** A resumable upload of bytes (a buffer, or a file on disk). */
	async function resumable(method, url, metadata, blob, contentType = 'application/octet-stream') {
		const size = blob.buffer ? blob.buffer.length : statSync(blob.path).size;
		const start = await ok(
			await call(method, url, {
				json: metadata,
				headers: { 'x-upload-content-type': contentType, 'x-upload-content-length': String(size) }
			}),
			'upload start'
		);
		const session = start.headers.get('location');
		if (!session) throw new Error('Drive opened an upload with no session address.');
		const put = await fetcher(session, {
			method: 'PUT',
			headers: { 'content-type': contentType, 'content-length': String(size) },
			body: blob.buffer ?? Readable.toWeb(createReadStream(blob.path)),
			...(blob.buffer ? {} : { duplex: 'half' })
		});
		await ok(put, 'upload');
		return (await put.json()).id;
	}

	const common = 'supportsAllDrives=true';
	return {
		async list() {
			const folders = [];
			const files = [];
			const texts = [];
			const queue = [rootId];
			const seen = new Set();
			while (queue.length) {
				const parent = queue.shift();
				if (seen.has(parent)) continue;
				seen.add(parent);
				let pageToken = '';
				do {
					const q = encodeURIComponent(`'${parent}' in parents and trashed = false`);
					const url =
						`${api.files}?q=${q}&fields=nextPageToken,files(id,name,mimeType,appProperties)&pageSize=1000` +
						`&${common}&includeItemsFromAllDrives=true` +
						(pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
					const body = await (await ok(await call('GET', url), 'list')).json();
					for (const f of body.files ?? []) {
						const props = f.appProperties ?? {};
						if (f.mimeType === FOLDER_MIME) {
							folders.push({ id: f.id, name: f.name, parentId: parent, projectId: props.armory_project_id ?? null });
							queue.push(f.id);
						} else if (props.armory_file_id) {
							files.push({ id: f.id, name: f.name, parentId: parent, fileId: props.armory_file_id, sha256: props.armory_sha256 ?? null });
						} else if (parent === rootId && props.armory_manifest) {
							texts.push({ id: f.id, name: f.name });
						}
					}
					pageToken = body.nextPageToken ?? '';
				} while (pageToken);
			}
			return { rootId, folders, files, texts };
		},
		async createFolder({ name, parentId, projectId }) {
			const res = await ok(
				await call('POST', `${api.files}?${common}&fields=id`, {
					json: { name, mimeType: FOLDER_MIME, parents: [parentId], appProperties: projectId ? { armory_project_id: projectId } : {} }
				}),
				'folder create'
			);
			return (await res.json()).id;
		},
		async renameFolder({ id, name }) {
			await ok(await call('PATCH', `${api.files}/${encodeURIComponent(id)}?${common}`, { json: { name } }), 'rename');
		},
		async upload({ name, parentId, props, blob }) {
			return resumable('POST', `${api.upload}?uploadType=resumable&${common}&fields=id`, { name, parents: [parentId], appProperties: props }, blob);
		},
		async updateContent({ id, props, blob }) {
			await resumable('PATCH', `${api.upload}/${encodeURIComponent(id)}?uploadType=resumable&${common}&fields=id`, { appProperties: props }, blob);
		},
		async move({ id, fromParentId, toParentId, name, props }) {
			const parents = fromParentId === toParentId ? '' : `&addParents=${encodeURIComponent(toParentId)}&removeParents=${encodeURIComponent(fromParentId)}`;
			await ok(await call('PATCH', `${api.files}/${encodeURIComponent(id)}?${common}${parents}`, { json: { name, appProperties: props } }), 'move');
		},
		async writeText({ name, mime, text, existingId }) {
			const blob = { buffer: Buffer.from(text, 'utf8') };
			if (existingId) {
				await resumable('PATCH', `${api.upload}/${encodeURIComponent(existingId)}?uploadType=resumable&${common}&fields=id`, {}, blob, mime);
			} else {
				await resumable(
					'POST',
					`${api.upload}?uploadType=resumable&${common}&fields=id`,
					{ name, parents: [rootId], mimeType: mime, appProperties: { armory_manifest: name } },
					blob,
					mime
				);
			}
		}
	};
}

// ---------------------------------------------------------------------------
// The fixture: the whole run over memory, from a JSON file.
// ---------------------------------------------------------------------------

/**
 * A fixture's versions carry `content` rather than a hash; the hash is taken
 * here, so a fixture cannot name bytes that do not hash to their name unless
 * it says so (`content_sha256` beside `content`, which the run then refuses).
 */
export function loadFixture(data) {
	const objects = {};
	const versions = data.versions.map((v) => {
		const sha = v.content_sha256 ?? sha256Of(Buffer.from(v.content));
		if (!(sha in objects)) objects[sha] = v.stored ?? v.content;
		return { ...v, content_sha256: sha, byte_length: v.byte_length ?? Buffer.byteLength(v.content) };
	});
	const source = fakeSource({ projects: data.projects, files: data.files, versions, releases: data.releases ?? [], objects });
	const drive = fakeDrive(data.drive ?? {});
	return { source, drive, versions };
}

function args(argv) {
	const out = { dryRun: false, fixture: null, budgetMinutes: 300 };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--dry-run') out.dryRun = true;
		else if (argv[i] === '--fixture') out.fixture = argv[++i];
		else if (argv[i] === '--budget-minutes') out.budgetMinutes = Number(argv[++i]);
		else throw new Error(`unknown argument ${argv[i]}`);
	}
	return out;
}

function report(markdown) {
	process.stdout.write(markdown);
	if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

async function main() {
	const opts = args(process.argv.slice(2));
	const budgetMs = Number.isFinite(opts.budgetMinutes) && opts.budgetMinutes > 0 ? opts.budgetMinutes * 60_000 : Infinity;
	if (opts.fixture) {
		const { source, drive } = loadFixture(JSON.parse(readFileSync(opts.fixture, 'utf8')));
		const r = await runMirror({ source, drive, dryRun: opts.dryRun, budgetMs, log: (l) => console.log(`  ${l}`) });
		report(summaryMarkdown(r) + `\n(fixture ${opts.fixture}: an in-memory store and Drive; nothing left this machine)\n`);
		return r.failed > 0 ? 1 : 0;
	}
	const missing = missingSecrets(process.env);
	if (missing.length) {
		report(notSetUpMarkdown(missing));
		return 0;
	}
	const r = await runMirror({
		source: supabaseSource(process.env),
		drive: googleDrive(process.env),
		dryRun: opts.dryRun,
		budgetMs,
		log: (l) => console.log(`  ${l}`)
	});
	report(summaryMarkdown(r));
	return r.failed > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	main().then(
		(code) => process.exit(code),
		(e) => {
			report(`## Armory Shared Drive mirror: the run stopped\n\n${e instanceof Error ? e.message : String(e)}\n\nNothing already in the Shared Drive was removed. Tonight's run starts again from what is there.\n`);
			process.exit(1);
		}
	);
}
