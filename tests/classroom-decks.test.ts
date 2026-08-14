// tests/classroom-decks.test.ts
//
// Presentation decks on classroom items (0101). DELIBERATELY NARROW, the
// classroom-security.test.ts / notebook-security.test.ts convention: this is
// not a feature suite, it is a suite for the things that regress SILENTLY.
//
// There are two of those here, and they fail silently in different ways.
//
//   1. ACCESS. A deck is thirty-odd files served one at a time by a proxy that
//      hands its authorization entirely to row-level security. A student
//      pulling another class's deck, or a draft one, looks exactly like a
//      working page to whoever is testing it.
//
//   2. THE HIDDEN STATE FILE. `.image-slots.state.json` carries every image's
//      author-set crop and pan. Skip it as a dotfile anywhere in the chain --
//      unpacker, manifest, proxy -- and the deck still renders, still shows
//      every image, and is simply WRONG: uncropped photos look plausible, not
//      broken, so nothing surfaces an error and the framing work is gone. Three
//      assertions here exist only to keep that file ordinary.
//
// Layers, all against a REAL Postgres with the REAL migrations applied
// unmodified (tests/db/harness.ts):
//
//   - the unpacker, driven with REAL zip bytes built byte-by-byte below (path
//     traversal, dotfiles, wrapper stripping, entry detection);
//   - RLS on classroom_decks / classroom_deck_files, by list AND by id;
//   - the write RPCs' own re-checks, including the stricter "manages EVERY
//     posted section" bar an edit takes;
//   - the path rule as a DATABASE constraint, asserted with RLS out of the way
//     entirely (as the connection owner) so nothing but the CHECK itself can be
//     what refuses;
//   - the serving proxy, driven as the REAL shipped route handler.
//
// MUTATION-CHECKED BOTH WAYS (manually, during this session -- not left as
// runnable code, the classroom-attachment-route.test.ts convention). Against
// this exact file: widening "classroom deck files follow their deck" to
// `using (true)` reddened every denial assertion in the RLS and proxy blocks
// (the out-of-section student, the foreign teacher and the draft case all began
// reading rows and bytes they must not) while every allowed path stayed green;
// narrowing it to `using (false)` reddened every allowed path (the enrolled
// student, the teacher of record and the admin all lost reads they must have)
// while the denials stayed green trivially. The migration was restored
// byte-identical afterwards and this file re-run fully green.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { DRIVE_ENDPOINTS } from '../src/lib/server/notebook-drive';
import {
	DECK_LIMITS,
	deckFileMime,
	deckUploadName,
	extractSlides,
	IMAGE_STATE_FILE,
	normalizeDeckPath,
	planDeck,
	planDeckFromZip,
	readDeckFile,
	THUMBNAIL_FILE
} from '../src/lib/server/classroom-decks';
import { memoryZipSource } from '../src/lib/server/deck-zip';
import { GET } from '../src/routes/api/classroom/deck/[deck_id]/[...path]/+server';
import { POST as INGEST } from '../src/routes/api/classroom/deck/+server';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql'
] as const;

let db: TestDb;
let drive: Server;

/** Bytes the mock Drive serves; asserted byte-for-byte on the way out. */
const FILE_BYTES = new Uint8Array([0x3c, 0x21, 0x64, 0x6f, 0x63, 9, 8, 7]);

let owner: SeededUser; // pinned admin apina@boscotech.edu
let teacherA: SeededUser; // teacher of record for sectionA (and sectionC)
let teacherB: SeededUser; // foreign -- no relation to any of this
let teacherC: SeededUser; // teacher of record for sectionC only
let studentA: SeededUser; // enrolled in sectionA
let studentB: SeededUser; // enrolled in sectionB only

let sectionA: string;
let sectionB: string;
let sectionC: string;

let pubItem: string; // published, posted to sectionA
let draftItem: string; // DRAFT, posted to sectionA
let sharedItem: string; // published, posted to sectionA AND sectionC

let pubDeck: string;
let draftDeck: string;

// ---------------------------------------------------------------------------
// A real zip, built by hand. Stored (method 0) entries only -- the reader
// supports them, and building one this way means these tests drive the SHIPPED
// parser over real archive bytes rather than a convenient object. CRC is left
// zero: nothing in the reader verifies it, and saying so beats implementing a
// checksum the code under test never looks at.
// ---------------------------------------------------------------------------

function makeZip(entries: { name: string; bytes: Uint8Array }[]): Uint8Array {
	const enc = new TextEncoder();
	const local: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = enc.encode(entry.name);
		const lh = new Uint8Array(30 + name.length + entry.bytes.length);
		const lv = new DataView(lh.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true); // version needed
		lv.setUint16(6, 0x0800, true); // flags: UTF-8 name
		lv.setUint16(8, 0, true); // method: stored
		lv.setUint32(14, 0, true); // crc32 (unverified, see above)
		lv.setUint32(18, entry.bytes.length, true);
		lv.setUint32(22, entry.bytes.length, true);
		lv.setUint16(26, name.length, true);
		lv.setUint16(28, 0, true); // extra len
		lh.set(name, 30);
		lh.set(entry.bytes, 30 + name.length);
		local.push(lh);

		const ch = new Uint8Array(46 + name.length);
		const cv = new DataView(ch.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, 0x0800, true);
		cv.setUint16(10, 0, true);
		cv.setUint32(16, 0, true);
		cv.setUint32(20, entry.bytes.length, true);
		cv.setUint32(24, entry.bytes.length, true);
		cv.setUint16(28, name.length, true);
		cv.setUint32(42, offset, true);
		ch.set(name, 46);
		central.push(ch);

		offset += lh.length;
	}

	const cdSize = central.reduce((n, c) => n + c.length, 0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, cdSize, true);
	ev.setUint32(16, offset, true);

	const total = offset + cdSize + 22;
	const out = new Uint8Array(total);
	let p = 0;
	for (const b of [...local, ...central, eocd]) {
		out.set(b, p);
		p += b.length;
	}
	return out;
}

const text = (s: string) => new TextEncoder().encode(s);

/** A real Claude Design export's shape, minus the weight. */
const DECK_HTML = `<!doctype html><html><body>
	<section class="fsp-slide" data-label="Holding" data-speaker-notes="do not read this aloud">a</section>
	<section class="fsp-slide" data-label="What is FRC" data-speaker-notes="secret">b</section>
	<section class="fsp-slide" data-label="A &amp; B > C">c</section>
</body></html>`;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function exportZip(root = 'IDEA FSP Deck/'): Uint8Array {
	return makeZip([
		{ name: `${root}index.html`, bytes: text(DECK_HTML) },
		{ name: `${root}deck-stage.js`, bytes: text('// stage') },
		{ name: `${root}image-slot.js`, bytes: text('// slots') },
		{ name: `${root}_ds/idea/styles.css`, bytes: text('body{}') },
		{ name: `${root}uploads/robot.gif`, bytes: text('GIF89a...') },
		{ name: `${root}${IMAGE_STATE_FILE}`, bytes: text('{"hero":{"u":"data:,x","s":2.4,"x":-12,"y":7}}') },
		{ name: `${root}${THUMBNAIL_FILE}`, bytes: PNG },
		{ name: `${root}IDEA FSP Deck (standalone).html`, bytes: text('<html>huge</html>') },
		{ name: `${root}IDEA FSP Deck.dc.html`, bytes: text('<html>template</html>') }
	]);
}

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function captureError(run: () => Promise<unknown>): Promise<{ message: string }> {
	try {
		await run();
	} catch (error) {
		return { message: (error as Error).message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

function createItem(
	userId: string,
	sectionIds: string[],
	title: string,
	published = true
): Promise<{ item_id: string }> {
	return rpc(
		userId,
		"public.classroom_create_item('material', $1::uuid[], $2, '', null, null, null, $3, '[]'::jsonb, false)",
		[sectionIds, title, published]
	);
}

/** Installs a deck through the REAL RPC, with a real-shaped manifest. */
function replaceDeck(
	userId: string,
	itemId: string,
	opts: { folder?: string; files?: { path: string; drive_file_id: string; mime_type: string }[] } = {}
): Promise<Record<string, unknown>> {
	const files = opts.files ?? [
		{ path: 'index.html', drive_file_id: `drive-${randomUUID()}`, mime_type: 'text/html; charset=utf-8' },
		{ path: '_ds/idea/styles.css', drive_file_id: `drive-${randomUUID()}`, mime_type: 'text/css' },
		{ path: IMAGE_STATE_FILE, drive_file_id: `drive-${randomUUID()}`, mime_type: 'application/json' }
	];
	return rpc(
		userId,
		'public.classroom_replace_deck($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)',
		[
			itemId,
			'Day 1',
			'index.html',
			opts.folder ?? `folder-${randomUUID()}`,
			JSON.stringify(files),
			null,
			true,
			JSON.stringify([{ index: 0, label: 'Holding' }])
		]
	);
}

/**
 * The mock Drive's state. `staged` is what a browser's direct upload would have
 * left in the deck uploads folder; the ingest route reads its metadata, then its
 * bytes by range, then deletes it.
 */
interface StagedFile {
	name: string;
	parents: string[];
	bytes: Uint8Array;
	/** Overrides what the metadata reports, for the size-cap case. */
	reportedSize?: number;
}
const staged = new Map<string, StagedFile>();
const driveDeleted: string[] = [];
const driveUploaded: string[] = [];
let driveSeq = 0;

function stageZip(fileId: string, name: string, parents: string[], bytes: Uint8Array): string {
	staged.set(fileId, { name, parents, bytes });
	return fileId;
}

/**
 * Folder ids are DERIVED FROM THE FOLDER'S NAME rather than being one stub id
 * for everything, so "the file is in the deck uploads folder" is a real check
 * here: the decks folder and the uploads folder come back different, which is
 * what lets the parent assertion below fail if the route stopped making it.
 */
function folderIdFor(name: string): string {
	return `folder::${name}`;
}

beforeAll(async () => {
	drive = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		const json = (body: unknown, status = 200) => {
			res.writeHead(status, { 'content-type': 'application/json' });
			res.end(JSON.stringify(body));
		};

		if (url.pathname === '/token') {
			return json({ access_token: 'test-access-token', expires_in: 3600 });
		}
		// One file's bytes go up (multipart); the id is all the caller reads.
		if (url.pathname === '/upload') {
			const id = `uploaded-${++driveSeq}`;
			driveUploaded.push(id);
			req.resume();
			req.on('end', () => json({ id }));
			return;
		}
		// find-or-create a named folder
		if (url.pathname === '/files' && req.method === 'GET') {
			const name = /name = '([^']*)'/.exec(url.searchParams.get('q') ?? '')?.[1] ?? 'unknown';
			return json({ files: [{ id: folderIdFor(name) }] });
		}
		if (url.pathname === '/files' && req.method === 'POST') {
			req.resume();
			req.on('end', () => json({ id: `created-folder-${++driveSeq}` }));
			return;
		}
		if (url.pathname.startsWith('/files/')) {
			const id = decodeURIComponent(url.pathname.slice('/files/'.length));
			if (req.method === 'DELETE') {
				driveDeleted.push(id);
				res.writeHead(204);
				res.end();
				return;
			}
			const file = staged.get(id);
			if (url.searchParams.get('alt') === 'media') {
				if (file) {
					// The ranged read the unpacker uses. Answered as 206 with only
					// the requested slice, exactly as Drive answers it.
					const range = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '');
					const start = range ? Number(range[1]) : 0;
					const end = range ? Math.min(Number(range[2]), file.bytes.length - 1) : file.bytes.length - 1;
					const slice = file.bytes.subarray(start, end + 1);
					res.writeHead(range ? 206 : 200, {
						'content-type': 'application/zip',
						'content-length': String(slice.length)
					});
					res.end(Buffer.from(slice));
					return;
				}
				// Drive routinely reports a .js or a .json as text/plain; the route
				// is expected to prefer the type recorded at ingest.
				res.writeHead(200, {
					'content-type': 'text/plain',
					'content-length': String(FILE_BYTES.length)
				});
				res.end(Buffer.from(FILE_BYTES));
				return;
			}
			if (url.searchParams.get('fields')?.includes('parents')) {
				if (!file) return json({ error: 'not found' }, 404);
				return json({
					id,
					name: file.name,
					mimeType: 'application/zip',
					size: String(file.reportedSize ?? file.bytes.length),
					parents: file.parents
				});
			}
			// The proxy's plain download.
			res.writeHead(200, {
				'content-type': 'text/plain',
				'content-length': String(FILE_BYTES.length)
			});
			res.end(Buffer.from(FILE_BYTES));
			return;
		}
		res.writeHead(404);
		res.end();
	});
	await new Promise<void>((resolve) => drive.listen(0, '127.0.0.1', resolve));
	const { port } = drive.address() as AddressInfo;
	DRIVE_ENDPOINTS.token = `http://127.0.0.1:${port}/token`;
	DRIVE_ENDPOINTS.files = `http://127.0.0.1:${port}/files`;
	DRIVE_ENDPOINTS.upload = `http://127.0.0.1:${port}/upload`;
	process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client';
	process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
	process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'test-refresh';

	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacherA = await createUser(db, 'teach.a@boscotech.edu', 'Teacher A');
	teacherB = await createUser(db, 'teach.b@boscotech.edu', 'Teacher B');
	teacherC = await createUser(db, 'teach.c@boscotech.edu', 'Teacher C');
	studentA = await createUser(db, 'stud.a@boscotech.net', 'Student A');
	studentB = await createUser(db, 'stud.b@boscotech.net', 'Student B');

	const course = await rpc<{ course_id: string }>(owner.id, 'public.classroom_upsert_course($1, $2)', [
		'DECK1',
		'Deck Course'
	]);
	const mkSection = async (label: string, teacher: string) =>
		(
			await rpc<{ section_id: string }>(
				owner.id,
				'public.classroom_upsert_section($1::uuid, $2, null, $3)',
				[course.course_id, label, teacher]
			)
		).section_id;

	sectionA = await mkSection('A', teacherA.email);
	sectionB = await mkSection('B', teacherB.email);
	sectionC = await mkSection('C', teacherC.email);

	await rpc(owner.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
		sectionA,
		studentA.email,
		'Student A'
	]);
	await rpc(owner.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
		sectionB,
		studentB.email,
		'Student B'
	]);

	pubItem = (await createItem(teacherA.id, [sectionA], 'Published deck item')).item_id;
	draftItem = (await createItem(teacherA.id, [sectionA], 'Draft deck item', false)).item_id;
	sharedItem = (await createItem(owner.id, [sectionA, sectionC], 'Shared deck item')).item_id;

	pubDeck = String((await replaceDeck(teacherA.id, pubItem)).deck_id);
	draftDeck = String((await replaceDeck(teacherA.id, draftItem)).deck_id);
});

afterAll(async () => {
	await db?.stop();
	await new Promise<void>((resolve) => drive?.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// 1. The unpacker. Real zip bytes; no database.
// ---------------------------------------------------------------------------

describe('unpacking a deck export', () => {
	it('KEEPS the hidden .image-slots.state.json', async () => {
		const zip = exportZip();
		const res = await planDeckFromZip(zip);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		// The whole point. A dotfile filter anywhere in the chain would drop this
		// and every image in the deck would silently render uncropped.
		expect(res.plan.files.map((f) => f.path)).toContain(IMAGE_STATE_FILE);
		expect(res.plan.hasStateFile).toBe(true);
		expect(res.plan.warnings.join(' ')).not.toContain(IMAGE_STATE_FILE);

		// And its bytes are the real ones, not an empty placeholder. Read the way
		// the ingest route reads them -- one file at a time, out of the archive --
		// so the dotfile survives the LAZY path as well as the plan.
		const state = res.plan.files.find((f) => f.path === IMAGE_STATE_FILE)!;
		const read = await readDeckFile(memoryZipSource(zip), state);
		expect(new TextDecoder().decode(read.bytes)).toContain('"s":2.4');
	});

	it('warns loudly when the state file is missing, and still ingests', async () => {
		const zip = makeZip([
			{ name: 'index.html', bytes: text(DECK_HTML) },
			{ name: 'deck-stage.js', bytes: text('// stage') }
		]);
		const res = await planDeckFromZip(zip);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.plan.hasStateFile).toBe(false);
		expect(res.plan.warnings.some((w) => w.includes(IMAGE_STATE_FILE))).toBe(true);
	});

	it('strips the wrapper folder so the entry sits at the deck root', async () => {
		const res = await planDeckFromZip(exportZip('My Deck v3/'));
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.plan.entryPath).toBe('index.html');
		expect(res.plan.files.map((f) => f.path)).toContain('_ds/idea/styles.css');
	});

	it('skips the standalone and template renderings', async () => {
		const res = await planDeckFromZip(exportZip());
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const paths = res.plan.files.map((f) => f.path);
		expect(paths).not.toContain('IDEA FSP Deck (standalone).html');
		expect(paths).not.toContain('IDEA FSP Deck.dc.html');
		expect(res.plan.entryPath).toBe('index.html');
	});

	it('refuses a traversing entry rather than storing it', async () => {
		for (const bad of ['../evil.html', 'a/../../evil.html', '/etc/passwd', 'C:/windows/x.html']) {
			const res = await planDeckFromZip(
				makeZip([
					{ name: 'index.html', bytes: text(DECK_HTML) },
					{ name: bad, bytes: text('x') }
				])
			);
			expect(res.ok, bad).toBe(false);
		}
	});

	/**
	 * The plan describes the whole deck; holding every file's bytes in it is
	 * what the ranged read exists to avoid, and a "convenience" field carrying
	 * them would quietly restore the memory ceiling the raised limits removed.
	 */
	it('plans from the index alone -- no file bytes in the plan', async () => {
		const res = await planDeckFromZip(exportZip());
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		for (const file of res.plan.files) {
			expect(file).not.toHaveProperty('bytes');
			expect(file.size).toBe(file.entry.uncompressedSize);
		}
		expect(res.plan.totalBytes).toBe(res.plan.files.reduce((n, f) => n + f.size, 0));
	});

	it('refuses an archive past the size cap before reading it', async () => {
		const zip = exportZip();
		const huge = { size: DECK_LIMITS.maxZipBytes + 1, read: async () => new Uint8Array(0) };
		const res = await planDeck(huge);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain('capped at');
		// ...and the same archive one byte under the cap is read normally.
		expect((await planDeck(memoryZipSource(zip))).ok).toBe(true);
	});

	it('treats a backslash as a separator, then still refuses traversal through it', () => {
		expect(normalizeDeckPath('_ds\\idea\\styles.css')).toBe('_ds/idea/styles.css');
		expect(normalizeDeckPath('..\\..\\evil.html')).toBeNull();
		expect(normalizeDeckPath('./index.html')).toBe('index.html');
		// A leading dot on a NAME is not a "." segment, and must survive.
		expect(normalizeDeckPath(IMAGE_STATE_FILE)).toBe(IMAGE_STATE_FILE);
		expect(normalizeDeckPath(THUMBNAIL_FILE)).toBe(THUMBNAIL_FILE);
	});

	it('asks which page to open when the zip is ambiguous, and honours the answer', async () => {
		const zip = makeZip([
			{ name: 'index.html', bytes: text(DECK_HTML) },
			{ name: 'notes.html', bytes: text('<html></html>') }
		]);
		const res = await planDeckFromZip(zip);
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.candidates).toEqual(expect.arrayContaining(['index.html', 'notes.html']));

		const chosen = await planDeckFromZip(zip, 'notes.html');
		expect(chosen.ok).toBe(true);
		if (chosen.ok) expect(chosen.plan.entryPath).toBe('notes.html');
	});

	it('reads slide labels and never speaker notes', () => {
		const slides = extractSlides(DECK_HTML);
		expect(slides.map((s) => s.label)).toEqual(['Holding', 'What is FRC', 'A & B > C']);
		expect(JSON.stringify(slides)).not.toContain('secret');
		expect(JSON.stringify(slides)).not.toContain('do not read this aloud');
	});

	it('types the two extension-less/hidden files correctly', () => {
		// .thumbnail has no extension at all: without the sniff it would serve as
		// octet-stream and the item card would offer a download, not a preview.
		expect(deckFileMime(THUMBNAIL_FILE, PNG)).toBe('image/png');
		// ".image-slots.state.json" DOES have an extension -- the leading dot is
		// part of the name, not a separator.
		expect(deckFileMime(IMAGE_STATE_FILE, text('{}'))).toContain('application/json');
	});
});

// ---------------------------------------------------------------------------
// 2. RLS.
// ---------------------------------------------------------------------------

async function readDecks(userId: string): Promise<string[]> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ id: string }>('select id from public.classroom_decks');
		return rows.map((r) => r.id);
	});
}

async function readFiles(userId: string, deckId: string): Promise<string[]> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ path: string }>(
			'select path from public.classroom_deck_files where deck_id = $1',
			[deckId]
		);
		return rows.map((r) => r.path);
	});
}

describe('who can read a deck', () => {
	it('an enrolled student reads the published deck and its files', async () => {
		expect(await readDecks(studentA.id)).toContain(pubDeck);
		expect(await readFiles(studentA.id, pubDeck)).toEqual(
			expect.arrayContaining(['index.html', IMAGE_STATE_FILE])
		);
	});

	it('a student in another class reads neither, by list OR by id', async () => {
		expect(await readDecks(studentB.id)).not.toContain(pubDeck);
		expect(await readFiles(studentB.id, pubDeck)).toEqual([]);

		const byId = await db.asUser(studentB.id, async (q) => {
			const { rows } = await q('select id from public.classroom_decks where id = $1', [pubDeck]);
			return rows;
		});
		expect(byId).toEqual([]);
	});

	it('a DRAFT item hides its deck from the enrolled student but not the teacher', async () => {
		expect(await readDecks(studentA.id)).not.toContain(draftDeck);
		expect(await readFiles(studentA.id, draftDeck)).toEqual([]);
		expect(await readDecks(teacherA.id)).toContain(draftDeck);
	});

	it('a foreign teacher reads nothing; the teacher of record and an admin do', async () => {
		expect(await readDecks(teacherB.id)).not.toContain(pubDeck);
		expect(await readFiles(teacherB.id, pubDeck)).toEqual([]);
		expect(await readDecks(teacherA.id)).toContain(pubDeck);
		expect(await readDecks(owner.id)).toContain(pubDeck);
	});

	it('grants no write path to a student, a teacher OR an admin', async () => {
		for (const user of [studentA, teacherA, owner]) {
			for (const stmt of [
				`insert into public.classroom_decks (item_id, title, entry_path, drive_folder_id, uploaded_by)
				 values ('${pubItem}', 'x', 'index.html', 'f', 'x@y.z')`,
				`update public.classroom_decks set title = 'hacked' where id = '${pubDeck}'`,
				`delete from public.classroom_decks where id = '${pubDeck}'`,
				`insert into public.classroom_deck_files (deck_id, path, drive_file_id, mime_type)
				 values ('${pubDeck}', 'x.html', 'd', 'text/html')`,
				`update public.classroom_deck_files set path = 'y.html' where deck_id = '${pubDeck}'`,
				`delete from public.classroom_deck_files where deck_id = '${pubDeck}'`
			]) {
				const err = await captureError(() => db.asUser(user.id, (q) => q(stmt)));
				expect(err.message, `${user.email}: ${stmt}`).toMatch(/permission denied/i);
			}
		}
	});

	it('grants anon nothing at all', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select
				has_table_privilege('anon', 'public.classroom_decks', 'select') as decks,
				has_table_privilege('anon', 'public.classroom_deck_files', 'select') as files,
				has_function_privilege('anon', 'public.classroom_replace_deck(uuid, text, text, text, jsonb, text, boolean, jsonb)', 'execute') as replace_fn,
				has_function_privilege('anon', 'public.classroom_delete_deck(uuid)', 'execute') as delete_fn,
				has_function_privilege('anon', 'public.classroom_can_read_deck(uuid)', 'execute') as read_fn`
		);
		expect(rows[0]).toEqual({
			decks: false,
			files: false,
			replace_fn: false,
			delete_fn: false,
			read_fn: false
		} as never);
	});
});

// ---------------------------------------------------------------------------
// 3. Who can WRITE one.
// ---------------------------------------------------------------------------

describe('who can attach, replace or remove a deck', () => {
	it('refuses a student and a foreign teacher', async () => {
		for (const user of [studentA, teacherB]) {
			const err = await captureError(() => replaceDeck(user.id, pubItem));
			expect(err.message, user.email).toMatch(/teacher of record/i);
		}
		const del = await captureError(() =>
			rpc(studentA.id, 'public.classroom_delete_deck($1::uuid)', [pubItem])
		);
		expect(del.message).toMatch(/teacher of record/i);
	});

	it('takes the stricter EVERY-posted-section bar, not ANY', async () => {
		// teacherA manages sectionA but NOT sectionC, and sharedItem is in both.
		// They can READ that item; they may not rewrite what sectionC sees.
		const err = await captureError(() => replaceDeck(teacherA.id, sharedItem));
		expect(err.message).toMatch(/every class/i);

		// The admin manages every section, so the same call succeeds for them.
		const res = await replaceDeck(owner.id, sharedItem);
		expect(res.ok).toBe(true);
	});

	it('refuses a manifest whose entry file is not in it', async () => {
		const err = await captureError(() =>
			rpc(
				teacherA.id,
				'public.classroom_replace_deck($1::uuid, $2, $3, $4, $5::jsonb, null, false, $6::jsonb)',
				[
					pubItem,
					'Bad',
					'missing.html',
					'folder-x',
					JSON.stringify([{ path: 'index.html', drive_file_id: 'd1', mime_type: 'text/html' }]),
					'[]'
				]
			)
		);
		expect(err.message).toMatch(/not one of the deck's files/i);
	});
});

// ---------------------------------------------------------------------------
// 4. The path rule, as a DATABASE constraint.
// ---------------------------------------------------------------------------

describe('path safety in the database', () => {
	const BAD = [
		'../secrets.env',
		'a/../../b.html',
		'/etc/passwd',
		'https://evil.example/x',
		'C:/windows/win.ini',
		'a//b.html',
		'./x.html',
		'trailing/',
		' leading-space.html'
	];

	it('the CHECK constraint refuses every escaping path WITH RLS OUT OF THE WAY', async () => {
		// Run as the connection OWNER: RLS and the table grants do not apply, so
		// nothing but the constraint itself can be what refuses. If this passed
		// only because of a policy, the assertion would be worthless.
		for (const path of BAD) {
			const err = await captureError(() =>
				db.sql(
					`insert into public.classroom_deck_files (deck_id, path, drive_file_id, mime_type)
					 values ($1, $2, 'd', 'text/html')`,
					[pubDeck, path]
				)
			);
			expect(err.message, path).toMatch(/violates check constraint/i);
		}
	});

	it('keeps every legitimate hidden and nested path', async () => {
		for (const path of [IMAGE_STATE_FILE, THUMBNAIL_FILE, '_ds/idea-x/tokens/a.css', 'uploads/a.gif']) {
			const { rows } = await db.sql<{ ok: boolean }>(
				'select public._classroom_deck_path_ok($1) as ok',
				[path]
			);
			expect(rows[0].ok, path).toBe(true);
		}
	});

	it('the write RPC refuses one too, so a caller past PostgREST gets nothing', async () => {
		const err = await captureError(() =>
			rpc(
				teacherA.id,
				'public.classroom_replace_deck($1::uuid, $2, $3, $4, $5::jsonb, null, false, $6::jsonb)',
				[
					pubItem,
					'Bad',
					'index.html',
					'folder-y',
					JSON.stringify([
						{ path: 'index.html', drive_file_id: 'd1', mime_type: 'text/html' },
						{ path: '../escape.js', drive_file_id: 'd2', mime_type: 'text/javascript' }
					]),
					'[]'
				]
			)
		);
		expect(err.message).toMatch(/not a legal deck path/i);
	});
});

// ---------------------------------------------------------------------------
// 5. Replacement and Drive cleanup.
// ---------------------------------------------------------------------------

describe('replacing and removing a deck', () => {
	it('replaces cleanly and reports exactly the old tree as orphaned', async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Replace me')).item_id;
		const oldFiles = [
			{ path: 'index.html', drive_file_id: 'old-1', mime_type: 'text/html' },
			{ path: 'a.js', drive_file_id: 'old-2', mime_type: 'text/javascript' }
		];
		const first = await replaceDeck(teacherA.id, item, { folder: 'old-folder', files: oldFiles });
		expect(first.replaced).toBe(false);

		const second = await replaceDeck(teacherA.id, item, {
			folder: 'new-folder',
			files: [
				{ path: 'index.html', drive_file_id: 'new-1', mime_type: 'text/html' },
				{ path: 'b.js', drive_file_id: 'new-2', mime_type: 'text/javascript' }
			]
		});
		expect(second.replaced).toBe(true);
		expect(second.orphaned_drive_file_ids).toEqual(expect.arrayContaining(['old-1', 'old-2']));
		expect(second.orphaned_folder_id).toBe('old-folder');

		// Exactly ONE deck survives, and it is the new one.
		const files = await readFiles(teacherA.id, String(second.deck_id));
		expect(files.sort()).toEqual(['b.js', 'index.html']);
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_decks where item_id = $1',
			[item]
		);
		expect(rows[0].n).toBe('1');
	});

	it('never reports a file a SECOND deck still references as orphaned', async () => {
		// classroom_duplicate_item carries a deck by reference (no re-upload), so
		// "the old deck is gone" and "its files are unreferenced" are different
		// questions. Sweeping on the first would delete a live deck's bytes.
		const item = (await createItem(teacherA.id, [sectionA], 'Shared bytes')).item_id;
		await replaceDeck(teacherA.id, item, {
			folder: 'shared-folder',
			files: [{ path: 'index.html', drive_file_id: 'shared-1', mime_type: 'text/html' }]
		});
		await rpc(teacherA.id, 'public.classroom_duplicate_item($1::uuid, null)', [item]);

		const replaced = await replaceDeck(teacherA.id, item, {
			folder: 'brand-new-folder',
			files: [{ path: 'index.html', drive_file_id: 'fresh-1', mime_type: 'text/html' }]
		});
		expect(replaced.replaced).toBe(true);
		expect(replaced.orphaned_drive_file_ids).toEqual([]);
		expect(replaced.orphaned_folder_id).toBeNull();
	});

	it('deleting the ITEM reports the whole deck tree and its folder', async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Delete me')).item_id;
		await replaceDeck(teacherA.id, item, {
			folder: 'doomed-folder',
			files: [
				{ path: 'index.html', drive_file_id: 'doomed-1', mime_type: 'text/html' },
				{ path: 'c.css', drive_file_id: 'doomed-2', mime_type: 'text/css' }
			]
		});
		const res = await rpc<{
			orphaned_drive_file_ids: string[];
			orphaned_deck_folder_ids: string[];
		}>(teacherA.id, 'public.classroom_delete_item($1::uuid)', [item]);

		expect(res.orphaned_drive_file_ids).toEqual(expect.arrayContaining(['doomed-1', 'doomed-2']));
		expect(res.orphaned_deck_folder_ids).toEqual(['doomed-folder']);
	});

	it('removes a deck on request and reports its tree', async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Remove me')).item_id;
		await replaceDeck(teacherA.id, item, {
			folder: 'gone-folder',
			files: [{ path: 'index.html', drive_file_id: 'gone-1', mime_type: 'text/html' }]
		});
		const res = await rpc<{ orphaned_drive_file_ids: string[]; orphaned_folder_id: string }>(
			teacherA.id,
			'public.classroom_delete_deck($1::uuid)',
			[item]
		);
		expect(res.orphaned_drive_file_ids).toEqual(['gone-1']);
		expect(res.orphaned_folder_id).toBe('gone-folder');
		expect(await readDecks(teacherA.id)).not.toContain(item);
	});
});

// ---------------------------------------------------------------------------
// 6. The serving proxy, driven as the REAL shipped handler.
//
// The shim is PINNED to the route's query -- table, columns and both filter
// columns are asserted -- so editing the route's read fails this file loudly
// instead of quietly proving something else.
// ---------------------------------------------------------------------------

function supabaseFor(userId: string) {
	return {
		from(table: string) {
			expect(table).toBe('classroom_deck_files');
			return {
				select(columns: string) {
					expect(columns).toContain('drive_file_id');
					expect(columns).toContain('mime_type');
					const filters: Record<string, string> = {};
					const chain = {
						eq(column: string, value: string) {
							expect(['deck_id', 'path']).toContain(column);
							filters[column] = value;
							return chain;
						},
						async maybeSingle() {
							expect(Object.keys(filters).sort()).toEqual(['deck_id', 'path']);
							return db.asUser(userId, async (q) => {
								const { rows } = await q<{ drive_file_id: string; mime_type: string }>(
									`select drive_file_id, mime_type from public.classroom_deck_files
									 where deck_id = $1 and path = $2`,
									[filters.deck_id, filters.path]
								);
								return { data: rows[0] ?? null, error: null };
							});
						}
					};
					return chain;
				}
			};
		}
	};
}

function callGet(deckId: string, path: string, userId: string | null): Promise<Response> {
	return (GET as unknown as (event: unknown) => Promise<Response>)({
		params: { deck_id: deckId, path },
		url: new URL(`http://localhost/api/classroom/deck/${deckId}/${path}`),
		locals: {
			supabase: userId ? supabaseFor(userId) : null,
			claims: userId ? { sub: userId, role: 'authenticated' } : null
		}
	});
}

describe('GET /api/classroom/deck/[deck_id]/[...path]', () => {
	it('serves a deck file to an enrolled student', async () => {
		const res = await callGet(pubDeck, 'index.html', studentA.id);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('cache-control')).toContain('private');
		expect(res.headers.get('cache-control')).not.toContain('public');
		// HTML is what a browser executes, so it is the response that carries the
		// egress-narrowing policy.
		expect(res.headers.get('content-security-policy')).toContain("connect-src 'self'");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE_BYTES);
	});

	it('serves the HIDDEN state file as ordinary JSON', async () => {
		// image-slot.js fetches this by name at runtime; a route that treated a
		// leading dot as special would leave every image uncropped.
		const res = await callGet(pubDeck, IMAGE_STATE_FILE, studentA.id);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/json');
	});

	it('prefers the type recorded at ingest over the one Drive reports', async () => {
		// The mock Drive answers text/plain for everything, which is what Drive
		// really does for .js and .json. A stylesheet served as text/plain is a
		// deck that does not render.
		const res = await callGet(pubDeck, '_ds/idea/styles.css', studentA.id);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/css');
	});

	it('refuses a student who is not in a posted section -- 404, never 403', async () => {
		const res = await callGet(pubDeck, 'index.html', studentB.id);
		expect(res.status).toBe(404);
		expect(res.status).not.toBe(403);
	});

	it('refuses a DRAFT item deck to its own enrolled student', async () => {
		const res = await callGet(draftDeck, 'index.html', studentA.id);
		expect(res.status).toBe(404);
	});

	it('refuses a foreign teacher, and serves the teacher of record and an admin', async () => {
		expect((await callGet(pubDeck, 'index.html', teacherB.id)).status).toBe(404);
		expect((await callGet(pubDeck, 'index.html', teacherA.id)).status).toBe(200);
		expect((await callGet(pubDeck, 'index.html', owner.id)).status).toBe(200);
	});

	it('refuses anonymously', async () => {
		const res = await callGet(pubDeck, 'index.html', null);
		expect(res.status).toBe(401);
	});

	it('refuses a traversing path without touching the database', async () => {
		// The client that would throw if used is the assertion: a traversing path
		// must be refused by the route's own rule, not merely miss the lookup.
		const exploding = {
			from() {
				throw new Error('the route must not query for a traversing path');
			}
		};
		for (const path of ['../../etc/passwd', 'a/../../b', '/etc/passwd', 'x/..']) {
			const res = await (GET as unknown as (event: unknown) => Promise<Response>)({
				params: { deck_id: pubDeck, path },
				url: new URL('http://localhost/x'),
				locals: { supabase: exploding, claims: { sub: studentA.id, role: 'authenticated' } }
			});
			expect(res.status, path).toBe(404);
		}
	});

	it('answers a real path and an imaginary one identically for a stranger', async () => {
		const real = await callGet(pubDeck, 'index.html', studentB.id);
		const fake = await callGet(pubDeck, 'no-such-file.html', studentB.id);
		expect(real.status).toBe(fake.status);
		expect(await real.text()).toBe(await fake.text());
	});
});

// ---------------------------------------------------------------------------
// 7. The DIRECT-TO-DRIVE upload path (0102).
//
// A deck zip no longer passes through our own server -- it could not, at 23.5 MB
// against a ~4.5 MB platform cap -- so what has to hold is no longer "did the
// multipart body arrive" but "is this file id one this caller was actually
// authorized to have produced". That is answered in two independent places, and
// both are asserted here:
//
//   the SLOT   an authorization row, spendable once, that carries the item;
//   the FILE   its Drive NAME and PARENT, set by the server when it opened the
//              session and unchangeable by a resumable PUT.
//
// Neither is sufficient alone, which is why widening either is a real leak: the
// slot alone would let a teacher point ingestion at any file in the shared
// drive, and the name alone would let anyone who guessed a slot id ingest
// someone else's upload.
// ---------------------------------------------------------------------------

/**
 * A supabase stand-in that forwards `.rpc()` to the real function in NAMED
 * notation, as the caller's own session -- so a route naming a parameter the
 * shipped function does not have fails here rather than passing. jsonb
 * arguments are serialized because that is what PostgREST puts on the wire;
 * handing node-postgres a JS array would make an array literal, not jsonb.
 */
function ingestSupabase(userId: string) {
	return {
		async rpc(name: string, args: Record<string, unknown>) {
			const entries = Object.entries(args ?? {});
			const call = `public.${name}(${entries
				.map(([key], i) => `${key} => $${i + 1}`)
				.join(', ')})`;
			try {
				return await db.asUser(userId, async (q) => {
					const { rows } = await q<{ result: unknown }>(
						`select ${call} as result`,
						entries.map(([, v]) =>
							v !== null && typeof v === 'object' ? JSON.stringify(v) : v
						)
					);
					return { data: rows[0]?.result ?? null, error: null };
				});
			} catch (error) {
				return { data: null, error: { message: (error as Error).message } };
			}
		}
	};
}

function callIngest(userId: string | null, body: Record<string, unknown>): Promise<Response> {
	return (INGEST as unknown as (event: unknown) => Promise<Response>)({
		request: new Request('http://localhost/api/classroom/deck', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: {
			supabase: userId ? ingestSupabase(userId) : null,
			claims: userId ? { sub: userId, role: 'authenticated' } : null
		}
	});
}

/** Opens a real slot through the real RPC. */
async function openSlot(userId: string, itemId: string): Promise<string> {
	const res = await rpc<{ upload_id: string }>(
		userId,
		'public.classroom_deck_upload_start($1::uuid)',
		[itemId]
	);
	return res.upload_id;
}

const UPLOADS_FOLDER = folderIdFor('IDEA Classroom deck uploads');

describe('authorizing one direct-to-Drive upload', () => {
	it('refuses a student and a foreign teacher, and allows the teacher of record', async () => {
		expect((await captureError(() => openSlot(studentA.id, pubItem))).message).toContain(
			'teacher of record'
		);
		expect((await captureError(() => openSlot(teacherB.id, pubItem))).message).toContain(
			'teacher of record'
		);
		expect(await openSlot(teacherA.id, pubItem)).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('takes the stricter EVERY-posted-section bar, not ANY', async () => {
		// teacherC is teacher of record for sectionC only; sharedItem is posted to
		// sectionA AND sectionC, so a deck there changes what A sees too.
		expect((await captureError(() => openSlot(teacherC.id, sharedItem))).message).toContain(
			'teacher of record'
		);
		expect(await openSlot(owner.id, sharedItem)).toBeTruthy();
	});

	it('refuses an item that does not exist', async () => {
		expect((await captureError(() => openSlot(teacherA.id, randomUUID()))).message).toContain(
			'does not exist'
		);
	});

	it('grants no write path to the table for a student, a teacher OR an admin', async () => {
		for (const user of [studentA, teacherA, owner]) {
			for (const sql of [
				`insert into public.classroom_deck_uploads (item_id, created_by) values ('${pubItem}', 'x')`,
				`update public.classroom_deck_uploads set claimed_at = now()`,
				`delete from public.classroom_deck_uploads`
			]) {
				const err = await captureError(() => db.asUser(user.id, (q) => q(sql)));
				expect(err.message, `${user.email}: ${sql}`).toContain('permission denied');
			}
		}
	});

	it('shows a slot to its own maker and to nobody else', async () => {
		const id = await openSlot(teacherA.id, pubItem);
		const mine = await db.asUser(
			teacherA.id,
			async (q) => (await q('select id from public.classroom_deck_uploads where id = $1', [id])).rows
		);
		expect(mine).toHaveLength(1);
		for (const other of [teacherB, owner, studentA]) {
			const theirs = await db.asUser(
				other.id,
				async (q) =>
					(await q('select id from public.classroom_deck_uploads where id = $1', [id])).rows
			);
			expect(theirs, other.email).toHaveLength(0);
		}
	});

	it('grants anon nothing at all', async () => {
		const { rows } = await db.sql<{ fn: string; ok: boolean }>(
			`select p.proname as fn,
			        has_function_privilege('anon', p.oid, 'EXECUTE') as ok
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'classroom_deck_upload%'`
		);
		expect(rows.length).toBeGreaterThanOrEqual(3);
		for (const row of rows) expect(row.ok, row.fn).toBe(false);
		const table = await db.sql<{ ok: boolean }>(
			"select has_table_privilege('anon', 'public.classroom_deck_uploads', 'SELECT') as ok"
		);
		expect(table.rows[0].ok).toBe(false);
	});
});

describe('spending an upload slot', () => {
	it('claims once, reports the item from the ROW, and refuses a second claim', async () => {
		const id = await openSlot(teacherA.id, pubItem);
		const first = await rpc<{ ok: boolean; item_id: string }>(
			teacherA.id,
			'public.classroom_deck_upload_claim($1::uuid, $2)',
			[id, 'file-once']
		);
		expect(first.ok).toBe(true);
		expect(first.item_id).toBe(pubItem);

		const second = await rpc<{ ok: boolean; reason: string }>(
			teacherA.id,
			'public.classroom_deck_upload_claim($1::uuid, $2)',
			[id, 'file-once-again']
		);
		expect(second.ok).toBe(false);
		expect(second.reason).toBe('already_used');
	});

	it("reads as not_found for somebody else's slot, and for one that never existed", async () => {
		const id = await openSlot(teacherA.id, pubItem);
		for (const user of [teacherB, owner, studentA]) {
			const res = await rpc<{ ok: boolean; reason: string }>(
				user.id,
				'public.classroom_deck_upload_claim($1::uuid, $2)',
				[id, `file-${user.email}`]
			);
			expect(res.ok, user.email).toBe(false);
			expect(res.reason, user.email).toBe('not_found');
		}
		const missing = await rpc<{ reason: string }>(
			teacherA.id,
			'public.classroom_deck_upload_claim($1::uuid, $2)',
			[randomUUID(), 'file-missing']
		);
		expect(missing.reason).toBe('not_found');
		// The slot survived every one of those attempts.
		const mine = await rpc<{ ok: boolean }>(
			teacherA.id,
			'public.classroom_deck_upload_claim($1::uuid, $2)',
			[id, 'file-mine']
		);
		expect(mine.ok).toBe(true);
	});

	it('refuses an expired slot', async () => {
		const id = await openSlot(teacherA.id, pubItem);
		await db.sql(
			"update public.classroom_deck_uploads set expires_at = now() - interval '1 minute' where id = $1",
			[id]
		);
		const res = await rpc<{ ok: boolean; reason: string }>(
			teacherA.id,
			'public.classroom_deck_upload_claim($1::uuid, $2)',
			[id, 'file-late']
		);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('expired');
	});

	it('cancels an unspent slot, and a cancel after the claim changes nothing', async () => {
		const cancelled = await openSlot(teacherA.id, pubItem);
		const cancelRes = await rpc<{ cancelled: boolean }>(
			teacherA.id,
			'public.classroom_deck_upload_cancel($1::uuid)',
			[cancelled]
		);
		expect(cancelRes.cancelled).toBe(true);
		const res = await rpc<{ reason: string }>(
			teacherA.id,
			'public.classroom_deck_upload_claim($1::uuid, $2)',
			[cancelled, 'file-cancelled']
		);
		expect(res.reason).toBe('cancelled');

		const spent = await openSlot(teacherA.id, pubItem);
		await rpc(teacherA.id, 'public.classroom_deck_upload_claim($1::uuid, $2)', [spent, 'file-spent']);
		const after = await rpc<{ cancelled: boolean }>(
			teacherA.id,
			'public.classroom_deck_upload_cancel($1::uuid)',
			[spent]
		);
		expect(after.cancelled).toBe(false);
	});

	it('lets one Drive file back at most one claim', async () => {
		const a = await openSlot(teacherA.id, pubItem);
		const b = await openSlot(teacherA.id, pubItem);
		await rpc(teacherA.id, 'public.classroom_deck_upload_claim($1::uuid, $2)', [a, 'file-shared']);
		const err = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_deck_upload_claim($1::uuid, $2)', [b, 'file-shared'])
		);
		expect(err.message).toContain('classroom_deck_uploads_file_idx');
	});
});

describe('POST /api/classroom/deck (ingest from Drive)', () => {
	it('ingests a real staged zip, keeps the hidden state file, and sweeps the zip', async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Ingest me')).item_id;
		const uploadId = await openSlot(teacherA.id, item);
		const fileId = stageZip(
			`staged-${uploadId}`,
			deckUploadName(uploadId),
			[UPLOADS_FOLDER],
			exportZip()
		);

		const res = await callIngest(teacherA.id, { upload_id: uploadId, drive_file_id: fileId });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: boolean;
			file_count: number;
			has_state_file: boolean;
			entry_path: string;
		};
		expect(body.ok).toBe(true);
		expect(body.entry_path).toBe('index.html');
		// The regression this whole feature has to survive: an image rendering
		// uncropped looks plausible, not broken.
		expect(body.has_state_file).toBe(true);

		const paths = await db.asUser(teacherA.id, async (q) =>
			(
				await q<{ path: string }>(
					`select f.path from public.classroom_deck_files f
					 join public.classroom_decks d on d.id = f.deck_id where d.item_id = $1`,
					[item]
				)
			).rows.map((r) => r.path)
		);
		expect(paths).toContain(IMAGE_STATE_FILE);
		expect(paths).toContain('_ds/idea/styles.css');
		expect(paths).not.toContain('IDEA FSP Deck (standalone).html');

		// The staged archive is transient and is cleaned up on the way out.
		expect(driveDeleted).toContain(fileId);
	});

	it('REFUSES a file id that upload did not produce, and does not delete it', async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Foreign file')).item_id;

		// Right folder, wrong name -- i.e. some other file in the staging folder.
		const wrongName = stageZip('someone-elses-file', 'not-mine.zip', [UPLOADS_FOLDER], exportZip());
		const slotA = await openSlot(teacherA.id, item);
		const res1 = await callIngest(teacherA.id, { upload_id: slotA, drive_file_id: wrongName });
		expect(res1.status).toBe(400);
		expect(((await res1.json()) as { error: string }).error).toContain('not produced by this upload');

		// Right name, wrong folder -- a file anywhere else in the shared drive.
		const slotB = await openSlot(teacherA.id, item);
		const wrongParent = stageZip(
			'elsewhere-in-the-drive',
			deckUploadName(slotB),
			[folderIdFor('IDEA Classroom decks')],
			exportZip()
		);
		const res2 = await callIngest(teacherA.id, { upload_id: slotB, drive_file_id: wrongParent });
		expect(res2.status).toBe(400);

		// Neither was touched: a forged id must never become a way to destroy an
		// arbitrary file in the shared drive.
		expect(driveDeleted).not.toContain(wrongName);
		expect(driveDeleted).not.toContain(wrongParent);
		// And nothing was stored against the item.
		const decks = await db.asUser(
			teacherA.id,
			async (q) =>
				(await q('select id from public.classroom_decks where item_id = $1', [item])).rows
		);
		expect(decks).toHaveLength(0);
	});

	it("refuses another teacher's slot, and refuses a student outright", async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Not yours')).item_id;
		const uploadId = await openSlot(teacherA.id, item);
		const fileId = stageZip(
			`staged-borrowed-${uploadId}`,
			deckUploadName(uploadId),
			[UPLOADS_FOLDER],
			exportZip()
		);

		for (const user of [teacherB, studentA]) {
			const res = await callIngest(user.id, { upload_id: uploadId, drive_file_id: fileId });
			expect(res.status, user.email).toBe(400);
			expect(((await res.json()) as { reason: string }).reason, user.email).toBe('not_found');
		}
		// Untouched, so the real owner can still use it.
		const mine = await callIngest(teacherA.id, { upload_id: uploadId, drive_file_id: fileId });
		expect(mine.status).toBe(200);
	});

	it('still refuses a traversing zip on the new path, and stores nothing', async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Traversal')).item_id;
		const uploadId = await openSlot(teacherA.id, item);
		const fileId = stageZip(
			`staged-evil-${uploadId}`,
			deckUploadName(uploadId),
			[UPLOADS_FOLDER],
			makeZip([
				{ name: 'index.html', bytes: text(DECK_HTML) },
				{ name: '../escaped.html', bytes: text('<html>nope</html>') }
			])
		);
		const res = await callIngest(teacherA.id, { upload_id: uploadId, drive_file_id: fileId });
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toContain('not a safe path');

		const decks = await db.asUser(
			teacherA.id,
			async (q) =>
				(await q('select id from public.classroom_decks where item_id = $1', [item])).rows
		);
		expect(decks).toHaveLength(0);
		// Ours, and spent: cleaned up even though the ingest failed.
		expect(driveDeleted).toContain(fileId);
	});

	it('hands the entry-page question back when the zip is ambiguous', async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Ambiguous')).item_id;
		const uploadId = await openSlot(teacherA.id, item);
		const fileId = stageZip(
			`staged-ambig-${uploadId}`,
			deckUploadName(uploadId),
			[UPLOADS_FOLDER],
			makeZip([
				{ name: 'index.html', bytes: text(DECK_HTML) },
				{ name: 'handout.html', bytes: text('<html></html>') }
			])
		);
		const res = await callIngest(teacherA.id, { upload_id: uploadId, drive_file_id: fileId });
		expect(res.status).toBe(400);
		expect(((await res.json()) as { candidates: string[] }).candidates).toEqual(
			expect.arrayContaining(['index.html', 'handout.html'])
		);
	});

	it('refuses a staged file past the size cap before reading a byte of it', async () => {
		const item = (await createItem(teacherA.id, [sectionA], 'Too big')).item_id;
		const uploadId = await openSlot(teacherA.id, item);
		const fileId = `staged-huge-${uploadId}`;
		// Only its REPORTED size matters: the route refuses on the metadata.
		staged.set(fileId, {
			name: deckUploadName(uploadId),
			parents: [UPLOADS_FOLDER],
			bytes: new Uint8Array(0),
			reportedSize: DECK_LIMITS.maxZipBytes + 1
		});
		const res = await callIngest(teacherA.id, { upload_id: uploadId, drive_file_id: fileId });
		expect(res.status).toBe(413);
		staged.delete(fileId);
	});

	it('refuses anonymously, and refuses a malformed id without reaching Drive', async () => {
		const anon = await callIngest(null, { upload_id: randomUUID(), drive_file_id: 'abcdefgh' });
		expect(anon.status).toBe(401);
		const badSlot = await callIngest(teacherA.id, {
			upload_id: 'not-a-uuid',
			drive_file_id: 'abcdefgh'
		});
		expect(badSlot.status).toBe(400);
		const badFile = await callIngest(teacherA.id, {
			upload_id: randomUUID(),
			drive_file_id: '../../etc/passwd'
		});
		expect(badFile.status).toBe(400);
	});
});
