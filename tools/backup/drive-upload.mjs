#!/usr/bin/env node
// tools/backup/drive-upload.mjs
//
// Puts one dump in Google Drive and prunes the folder to the retention window.
// Called by `.github/workflows/backup.yml` and by nothing else.
//
// WHY DRIVE AND NOT SOMEWHERE ELSE is argued in `docs/BACKUP.md` and not
// repeated here. What belongs here is the mechanism.
//
// ---------------------------------------------------------------------------
// THE CREDENTIAL IS ITS OWN, AND THAT IS DELIBERATE. `CLAUDE.md` says a secret
// has exactly ONE reader, which is the single egress point for that service,
// and for Drive that reader is `src/lib/server/notebook-drive.ts`. This is not
// a second reader of THAT secret: it reads `BACKUP_GOOGLE_*`, which are
// separate repository secrets holding a separate refresh token. Mr. Pina may
// paste the same values he already has in Vercel and everything works -- but
// the NAMES are distinct, so revoking the backup's access never touches the
// notebook's, and a leak of one is not a leak of both.
//
// It is also why this file does not import the app's Drive helper: that module
// reads `$env/dynamic/private`, which only exists inside a SvelteKit server
// runtime, and reaching for it from a tool would mean either faking that module
// or moving the credential read out of the one place that owns it.
//
// ---------------------------------------------------------------------------
// THE UPLOAD IS RESUMABLE, NOT MULTIPART, AND THE REASON IS SIZE. The app's
// `uploadDriveFile` builds one multipart body in memory, which is right for a
// notebook photo and wrong for a database: Google documents multipart as the
// path for payloads under 5 MB, and `docs/BACKUP.md`'s own extrapolation puts a
// mature dump above that. A resumable session streams the file and is the
// documented path for anything large.
//
// ---------------------------------------------------------------------------
// RETENTION IS COMPUTED FROM THE FILENAMES AND NOTHING ELSE. There is no state
// file, no manifest and no label: the folder IS the record, and a person
// looking at it can check the rule by eye. `keepDecision` below is the whole
// rule, it is pure, and `--selftest` puts it to a fixture -- so the one part of
// this tool that can silently delete something is the one part that can be
// proven without a credential.

import { createReadStream, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';

/**
 * The three Google endpoints, as a PARAMETER with a real default rather than as
 * three bare constants. That is what `--selftest-transport` needs: this file
 * talks to a network nothing in this repository can reach, so the only way any
 * of it is exercised before Mr. Pina runs it for real is to point it at a
 * loopback server that answers the way Drive does. Reading them from the
 * environment was the alternative and is worse -- it would let anything that
 * can set an environment variable redirect a database dump.
 */
export const GOOGLE = {
	token: 'https://oauth2.googleapis.com/token',
	upload: 'https://www.googleapis.com/upload/drive/v3/files',
	files: 'https://www.googleapis.com/drive/v3/files'
};

/** Daily copies kept unconditionally, newest first. */
export const KEEP_DAILY = 30;
/** Calendar months for which the FIRST surviving copy is kept as well. */
export const KEEP_MONTHLY = 12;

/** `idea-app-2026-09-12.sql.gz` -> `2026-09-12`. Anything else -> null. */
export function dateOf(name) {
	const m = /^idea-app-(\d{4})-(\d{2})-(\d{2})\.sql\.gz$/.exec(name);
	return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * THE RETENTION RULE, IN ONE PLACE.
 *
 * Keep the newest `keepDaily` copies, and additionally the OLDEST surviving
 * copy in each of the newest `keepMonthly` calendar months. Delete the rest.
 * A file whose name this tool did not write is KEPT and reported -- deleting
 * something we cannot parse is how a person's own upload disappears.
 *
 * WHY BOTH WINDOWS. They answer the two loss modes separately, and neither
 * alone covers the other. A mistaken statement in the SQL editor is noticed in
 * hours or days, so what matters there is yesterday's copy and the day before
 * it: that is the daily window, and 30 is generous for it. A free project
 * PAUSED over a long break is the other one, and a Bosco Tech summer is about
 * ten weeks -- longer than any daily window worth paying for -- so the monthly
 * chain is what is still there in August. Twelve of them covers a full year,
 * which is the span over which "we lost the spring semester" is a sentence
 * anybody might have to say.
 *
 * WHY THE OLDEST IN THE MONTH AND NOT THE FIRST OF THE MONTH. A run that did
 * not happen on the 1st -- a failed night, a repository that was quiet, a
 * secret that had expired -- would otherwise leave that month with no monthly
 * copy at all, silently. Taking whatever survives earliest in the month means
 * the chain has a link for every month that has any copy at all.
 *
 * @param {string[]} names every filename in the folder
 * @param {{keepDaily?: number, keepMonthly?: number}} [opts]
 * @returns {{keep: string[], deleteNames: string[], unparsed: string[]}}
 */
export function keepDecision(names, opts = {}) {
	const keepDaily = opts.keepDaily ?? KEEP_DAILY;
	const keepMonthly = opts.keepMonthly ?? KEEP_MONTHLY;

	const unparsed = names.filter((n) => dateOf(n) === null).sort();
	const dated = names
		.filter((n) => dateOf(n) !== null)
		.sort((a, b) => (dateOf(a) < dateOf(b) ? 1 : dateOf(a) > dateOf(b) ? -1 : a < b ? 1 : -1));

	const keep = new Set(dated.slice(0, keepDaily));

	// Months newest-first; within a month, the OLDEST survivor is the keeper.
	const months = [];
	const byMonth = new Map();
	for (const n of dated) {
		const m = dateOf(n).slice(0, 7);
		if (!byMonth.has(m)) {
			byMonth.set(m, []);
			months.push(m);
		}
		byMonth.get(m).push(n);
	}
	for (const m of months.slice(0, keepMonthly)) {
		const inMonth = byMonth.get(m);
		keep.add(inMonth[inMonth.length - 1]);
	}

	return {
		keep: dated.filter((n) => keep.has(n)),
		deleteNames: dated.filter((n) => !keep.has(n)),
		unparsed
	};
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

function need(name) {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set. See docs/BACKUP.md, "Setting up the secrets".`);
	return v;
}

async function accessToken(api = GOOGLE) {
	const res = await fetch(api.token, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: need('BACKUP_GOOGLE_REFRESH_TOKEN'),
			client_id: need('BACKUP_GOOGLE_CLIENT_ID'),
			client_secret: need('BACKUP_GOOGLE_CLIENT_SECRET')
		})
	});
	const text = await res.text();
	if (!res.ok) {
		// The refresh token is the part of this that expires, is revoked, and
		// is invalidated by a password change, so its failure says what to do
		// rather than printing a status code at somebody at 7am.
		const hint = text.includes('invalid_grant')
			? '\nThe refresh token no longer works (revoked, expired, or the Google password changed).' +
				'\nMint a new one and update the BACKUP_GOOGLE_REFRESH_TOKEN secret: docs/BACKUP.md, "When the credential stops working".'
			: '';
		throw new Error(`Google token refresh failed (${res.status}): ${text.slice(0, 300)}${hint}`);
	}
	const body = JSON.parse(text);
	if (!body.access_token) throw new Error('Google token refresh returned no access token.');
	return body.access_token;
}

/** Resumable upload. Returns the new file's id. */
async function upload(token, path, folderId, api = GOOGLE) {
	const name = basename(path);
	const size = statSync(path).size;

	const start = await fetch(`${api.upload}?uploadType=resumable&supportsAllDrives=true&fields=id`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${token}`,
			'content-type': 'application/json; charset=UTF-8',
			'x-upload-content-type': 'application/gzip',
			'x-upload-content-length': String(size)
		},
		body: JSON.stringify({ name, parents: [folderId] })
	});
	if (!start.ok) {
		throw new Error(`Could not open a Drive upload session (${start.status}): ${(await start.text()).slice(0, 300)}`);
	}
	const session = start.headers.get('location');
	if (!session) throw new Error('Drive opened an upload session with no Location header.');

	// `Readable.toWeb` rather than handing `fetch` the Node stream directly:
	// the WHATWG body is the shape undici documents, and streaming is the whole
	// point of a resumable upload -- the app's own `uploadDriveFile` builds one
	// multipart body in memory, which is right for a notebook photo and wrong
	// for a database that `docs/BACKUP.md` projects into the tens of megabytes.
	const put = await fetch(session, {
		method: 'PUT',
		headers: { 'content-type': 'application/gzip', 'content-length': String(size) },
		body: Readable.toWeb(createReadStream(path)),
		duplex: 'half'
	});
	if (!put.ok) {
		throw new Error(`Drive upload failed (${put.status}): ${(await put.text()).slice(0, 300)}`);
	}
	const { id } = JSON.parse(await put.text());
	if (!id) throw new Error('Drive upload returned no file id.');
	return id;
}

async function listFolder(token, folderId, api = GOOGLE) {
	const out = [];
	let pageToken = '';
	do {
		const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
		const url =
			`${api.files}?q=${q}&fields=nextPageToken,files(id,name,size)&pageSize=200` +
			'&supportsAllDrives=true&includeItemsFromAllDrives=true' +
			(pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
		const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
		if (!res.ok) throw new Error(`Drive list failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
		const body = JSON.parse(await res.text());
		out.push(...(body.files ?? []));
		pageToken = body.nextPageToken ?? '';
	} while (pageToken);
	return out;
}

async function remove(token, id, api = GOOGLE) {
	const res = await fetch(`${api.files}/${encodeURIComponent(id)}?supportsAllDrives=true`, {
		method: 'DELETE',
		headers: { authorization: `Bearer ${token}` }
	});
	if (!res.ok && res.status !== 404) {
		throw new Error(`Drive delete failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
	}
}

// ---------------------------------------------------------------------------

function selftest() {
	const fails = [];
	const eq = (what, got, want) => {
		const a = JSON.stringify(got);
		const b = JSON.stringify(want);
		if (a !== b) fails.push(`${what}\n  got  ${a}\n  want ${b}`);
		else console.log(`  ok  ${what}`);
	};
	const day = (y, m, d) => `idea-app-${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}.sql.gz`;

	eq('a name this tool did not write is unparsed', dateOf('notes.txt'), null);
	eq('a name it did write parses', dateOf(day(2026, 9, 12)), '2026-09-12');
	eq('a near miss does not parse', dateOf('idea-app-2026-9-12.sql.gz'), null);

	// Under the daily window nothing is ever deleted.
	const few = [day(2026, 9, 10), day(2026, 9, 11), day(2026, 9, 12)];
	eq('fewer copies than the window deletes nothing', keepDecision(few).deleteNames, []);

	// A year of dailies: 30 recent + one per month for 12 months.
	const year = [];
	for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) year.push(day(2026, m, d));
	const r = keepDecision(year);
	eq('a year of dailies keeps 30 + 11 more', r.keep.length, 41);
	eq('and deletes the rest', r.deleteNames.length, year.length - 41);
	eq('the newest survives', r.keep.includes(day(2026, 12, 28)), true);
	eq('the oldest month keeps its earliest copy', r.keep.includes(day(2026, 1, 1)), true);
	eq('and not its second', r.keep.includes(day(2026, 1, 2)), false);
	eq('every kept name is a real name', r.keep.every((n) => dateOf(n) !== null), true);
	eq('keep and delete partition the input', r.keep.length + r.deleteNames.length, year.length);

	// A month whose run never landed on the 1st still keeps a link in the chain.
	const gappy = [day(2026, 3, 17), day(2026, 3, 18), ...year.slice(-40)];
	eq('a month with no 1st still keeps its earliest', keepDecision(gappy).keep.includes(day(2026, 3, 17)), true);

	// Beyond the monthly window a whole month goes.
	const deep = [];
	for (let m = 1; m <= 12; m++) deep.push(day(2025, m, 1));
	for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) deep.push(day(2026, m, d));
	eq('a month older than the monthly window is dropped whole', keepDecision(deep).deleteNames.includes(day(2025, 1, 1)), true);

	// A foreign file is never a delete candidate.
	const mixed = [...year, 'README.txt', 'idea-app-notes.sql.gz'];
	const rm = keepDecision(mixed);
	eq('foreign names are reported, not deleted', rm.unparsed, ['README.txt', 'idea-app-notes.sql.gz']);
	eq('and never appear in the delete list', rm.deleteNames.some((n) => dateOf(n) === null), false);

	// NEGATIVE CONTROL. Every assertion above is an equality over this file's
	// own output, so they would all hold for a rule that kept everything.
	eq('CONTROL: the rule does delete something', keepDecision(year).deleteNames.length > 0, true);
	eq('CONTROL: a narrower window deletes more', keepDecision(year, { keepDaily: 5, keepMonthly: 2 }).deleteNames.length >
		keepDecision(year).deleteNames.length, true);

	if (fails.length) {
		console.error('\nSELFTEST FAILED\n' + fails.join('\n'));
		process.exit(1);
	}
	console.log('\nselftest ok');
}

/**
 * THE HALF THAT TALKS TO A NETWORK, PUT TO A LOOPBACK SERVER THAT ANSWERS THE
 * WAY DRIVE DOES.
 *
 * No container in this repository can reach Google, so without this the token
 * refresh, the resumable upload and the prune would ship never having been
 * executed at all -- and the first time anybody found out would be the morning
 * Mr. Pina needed a backup. This does not prove Drive accepts these requests.
 * It proves the requests are FORMED, that the two-step resumable handshake is
 * followed, that the file's bytes arrive intact and complete, that paging is
 * followed to the end, and that the prune deletes exactly the ids the retention
 * rule chose and no others.
 *
 * The server asserts what it receives rather than answering blindly: a stub
 * more permissive than the real thing certifies a bug rather than finding one.
 */
async function transportSelftest() {
	const fails = [];
	const ok = (what, cond, detail = '') => {
		if (cond) console.log(`  ok  ${what}`);
		else fails.push(`${what}${detail ? `\n      ${detail}` : ''}`);
	};

	const dir = mkdtempSync(join(tmpdir(), 'drive-transport-'));
	const file = join(dir, 'idea-app-2026-09-12.sql.gz');
	// Big enough that the stream is genuinely chunked rather than one write.
	const payload = Buffer.alloc(3 * 1024 * 1024);
	for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff;
	writeFileSync(file, payload);

	// The folder as Drive would report it: enough copies that the retention
	// rule has to delete some, split across two pages so paging is exercised.
	const folder = [];
	for (let m = 1; m <= 12; m++)
		for (let d = 1; d <= 28; d++)
			folder.push({ id: `id-${m}-${d}`, name: `idea-app-2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}.sql.gz`, size: '1000' });
	folder.push({ id: 'id-foreign', name: 'a note from Mr Pina.txt', size: '10' });

	const seen = { token: 0, sessions: 0, puts: 0, lists: 0, bodies: [], deleted: [], auth: new Set(), pages: 0 };

	const read = (req) =>
		new Promise((resolve) => {
			const chunks = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => resolve(Buffer.concat(chunks)));
		});

	const server = createServer(async (req, res) => {
		const url = new URL(req.url, 'http://127.0.0.1');
		if (req.headers.authorization) seen.auth.add(req.headers.authorization);

		if (url.pathname === '/token') {
			seen.token++;
			const body = new URLSearchParams((await read(req)).toString());
			if (body.get('grant_type') !== 'refresh_token' || !body.get('refresh_token') || !body.get('client_id')) {
				res.writeHead(400).end('{"error":"malformed refresh"}');
				return;
			}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }));
			return;
		}

		if (url.pathname === '/upload' && req.method === 'POST') {
			seen.sessions++;
			seen.startQuery = url.searchParams.get('uploadType');
			seen.declaredLength = req.headers['x-upload-content-length'];
			seen.metadata = JSON.parse((await read(req)).toString());
			res.writeHead(200, { location: `http://127.0.0.1:${port}/session/xyz` });
			res.end('');
			return;
		}

		if (url.pathname === '/session/xyz' && req.method === 'PUT') {
			seen.puts++;
			seen.bodies.push(await read(req));
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ id: 'new-file-id' }));
			return;
		}

		if (url.pathname === '/files' && req.method === 'GET') {
			seen.lists++;
			seen.q = url.searchParams.get('q');
			// Two pages, so a reader that stops after the first is caught.
			const page = url.searchParams.get('pageToken') === 'page2';
			seen.pages++;
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(
				JSON.stringify(
					page
						? { files: folder.slice(200) }
						: { files: folder.slice(0, 200), nextPageToken: 'page2' }
				)
			);
			return;
		}

		if (url.pathname.startsWith('/files/') && req.method === 'DELETE') {
			seen.deleted.push(decodeURIComponent(url.pathname.slice('/files/'.length)));
			res.writeHead(204).end('');
			return;
		}

		res.writeHead(404).end('');
	});

	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const port = server.address().port;
	const api = {
		token: `http://127.0.0.1:${port}/token`,
		upload: `http://127.0.0.1:${port}/upload`,
		files: `http://127.0.0.1:${port}/files`
	};

	process.env.BACKUP_GOOGLE_CLIENT_ID = 'test-client';
	process.env.BACKUP_GOOGLE_CLIENT_SECRET = 'test-secret';
	process.env.BACKUP_GOOGLE_REFRESH_TOKEN = 'test-refresh';
	process.env.BACKUP_DRIVE_FOLDER_ID = 'test-folder';
	process.argv = [process.argv[0], process.argv[1], file];

	try {
		await main(api);
	} catch (err) {
		fails.push(`main() threw: ${err?.message ?? err}`);
	} finally {
		await new Promise((r) => server.close(r));
	}

	ok('the refresh token is exchanged exactly once', seen.token === 1, `saw ${seen.token}`);
	ok('every later call carries the minted bearer token',
		seen.auth.size === 1 && [...seen.auth][0] === 'Bearer test-access-token', [...seen.auth].join(' | '));
	ok('a resumable session is opened', seen.sessions === 1 && seen.startQuery === 'resumable');
	ok('the session declares the real byte length', seen.declaredLength === String(payload.length), String(seen.declaredLength));
	ok('the metadata names the file and its parent folder',
		seen.metadata?.name === 'idea-app-2026-09-12.sql.gz' && seen.metadata?.parents?.[0] === 'test-folder',
		JSON.stringify(seen.metadata));
	ok('the bytes are PUT to the session URL, once', seen.puts === 1);
	ok('and they arrive complete and unaltered',
		seen.bodies.length === 1 && seen.bodies[0].length === payload.length && seen.bodies[0].equals(payload),
		`got ${seen.bodies[0]?.length ?? 0} of ${payload.length}`);
	ok('the listing query is scoped to the folder and skips the trash',
		seen.q === "'test-folder' in parents and trashed = false", String(seen.q));
	ok('paging is followed to the end', seen.pages === 2, `${seen.pages} page(s)`);

	const expected = keepDecision(folder.map((f) => f.name)).deleteNames;
	const expectedIds = folder.filter((f) => expected.includes(f.name)).map((f) => f.id).sort();
	ok('exactly the copies the retention rule chose are deleted',
		JSON.stringify([...seen.deleted].sort()) === JSON.stringify(expectedIds),
		`deleted ${seen.deleted.length}, expected ${expectedIds.length}`);
	ok('and the file this tool did not write is untouched', !seen.deleted.includes('id-foreign'));

	// NEGATIVE CONTROL. Everything above is an assertion about a server this
	// function also wrote, so it would all hold for a run that deleted nothing
	// and for a comparison reading the wrong thing.
	ok('CONTROL: the run did delete something', seen.deleted.length > 0);
	ok('CONTROL: it did not delete the whole folder', seen.deleted.length < folder.length);

	rmSync(dir, { recursive: true, force: true });
	if (fails.length) {
		console.error('\nTRANSPORT SELFTEST FAILED\n  ' + fails.join('\n  '));
		process.exit(1);
	}
	console.log('\ntransport selftest ok');
}

async function main(api = GOOGLE) {
	const args = process.argv.slice(2);
	if (args.includes('--selftest')) return selftest();
	if (args.includes('--selftest-transport')) return transportSelftest();

	const dry = args.includes('--dry-run');
	const path = args.find((a) => !a.startsWith('--'));
	if (!path) {
		console.error('usage: drive-upload.mjs <file.sql.gz> [--dry-run] | --selftest');
		process.exit(2);
	}

	const folderId = need('BACKUP_DRIVE_FOLDER_ID');
	const token = await accessToken(api);

	const size = statSync(path).size;
	console.log(`uploading ${basename(path)} (${size} bytes)`);
	if (dry) console.log('  --dry-run: not uploading');
	else console.log(`  drive file id ${await upload(token, path, folderId, api)}`);

	const files = await listFolder(token, folderId, api);
	const decision = keepDecision(files.map((f) => f.name));
	const total = files.reduce((n, f) => n + Number(f.size ?? 0), 0);
	console.log(
		`folder now holds ${files.length} files, ${total} bytes; ` +
			`keeping ${decision.keep.length}, deleting ${decision.deleteNames.length}` +
			(decision.unparsed.length ? `, leaving ${decision.unparsed.length} it did not write alone` : '')
	);
	for (const name of decision.unparsed) console.log(`  left alone (not ours): ${name}`);
	for (const name of decision.deleteNames) {
		const f = files.find((x) => x.name === name);
		console.log(`  ${dry ? 'would delete' : 'deleting'} ${name}`);
		if (!dry) await remove(token, f.id, api);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error(String(err?.message ?? err));
		process.exit(1);
	});
}
