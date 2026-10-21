// tests/db/armory-newer-release.test.ts
//
// MIGRATION 0293: a SolidWorks file saved in a newer release than its project
// uses is recorded, never refused (ledger 0423, Mr. Pina 2026-10-21: "Never
// block"). The chain is every migration before 0293, read off disk behind the
// fixture completion (the database production holds before the apply); the
// project, member, device, files and lock are written through the REAL
// 0231 to 0236 RPCs; the deployed refusal is measured first, then 0293 goes on
// top and the same calls run again.
//
// What a wrong answer here would look like, and why each is silent:
//   - THE NEWER RELEASE IS STILL REFUSED. The 0.4.0 app's newer files wait on
//     their computers forever; nothing on screen says the server is the cause.
//   - THE UNKNOWN-RELEASE REFUSAL GOES WITH IT. An 'enforce' project starts
//     taking SolidWorks files whose year nobody could read.
//   - A CLIENT ROLE CAN CALL THE CHECK. It is an internal helper of two definer
//     functions; a direct call would answer for files the caller cannot see.

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { canExecute, catalogFingerprint, pasteTrap } from './chain-0230';
import { armoryRpc, hash, key, person } from './armory-v3-helpers';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';
const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();
const FILES_0293 = ALL.filter((f) => f.startsWith('0293_'));
if (FILES_0293.length !== 1) throw new Error(`expected exactly one 0293 migration, found ${FILES_0293.length}`);
const PRE_0293 = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < '0293')];
/** Read once when the suite loads, so a mutation run reads the mutant. */
const SQL_0293 = readFileSync(join(MIGRATIONS_DIR, FILES_0293[0]), 'utf8');

/** The refusal texts, written out: a test whose expected value comes from the function cannot fail. */
const NEWER_REFUSED = 'SolidWorks 2026 cannot upload to a vault pinned to 2025. Keep this private draft or save to 2025.';
const UNKNOWN_REFUSED = 'The saved SolidWorks release is unknown; keep the local draft until it can be read.';

const COMMIT = 'select * from public.armory_commit_version_with_release($1, $2, $3, $4, $5, $6, $7, $8::smallint)';
const SIDE = `select public.armory_save_side_version_with_release($1, $2, $3, $4, $5, 'conflict', $6, $7, $8::smallint) as id`;

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;
let admin: SeededUser;
let ana: SeededUser;
let project: string;
let dev: string;
let part: string;
let text: string;
let refusedBefore: { code: string; message: string };
let sideRefusedBefore: { code: string; message: string };

const commit = (file: string, parent: string | null, h: string, release: number | null) =>
	api.one<{ version_id: string; advanced: boolean }>(ana, COMMIT, [file, parent, key(h), h, 100, dev, randomUUID(), release]);
const releaseOf = async (version: string) =>
	(
		await db.sql<{ saved_release: number | null; release_checked: boolean; side: boolean }>(
			'select saved_release, release_checked, side from public.armory_version_releases where version_id = $1',
			[version]
		)
	).rows[0];

beforeAll(async () => {
	db = await startTestDb(PRE_0293);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	// THROUGH THE DEPLOYED RPCs, as the Windows app and the website make them.
	project = await api.project(admin, 'Blade Team Demo');
	await api.member(admin, project, ana.email, 'student');
	dev = await api.device(ana, 'IDEA-06');
	part = await api.createFile(ana, project, dev, 'Blades', 'Blade.SLDPRT');
	text = await api.createFile(ana, project, dev, 'Blades', 'notes.txt');
	expect(await api.lock(ana, part, dev)).toBe(true);
	expect(await api.lock(ana, text, dev)).toBe(true);
	expect((await db.sql<{ p: number }>('select pinned_release as p from public.armory_projects where id = $1', [project])).rows[0].p).toBe(2025);

	// The deployed gate refuses a 2026 save, on both write paths.
	refusedBefore = await api.fails(ana, COMMIT, [part, null, key(hash('a')), hash('a'), 100, dev, randomUUID(), 2026]);
	sideRefusedBefore = await api.fails(ana, SIDE, [part, null, key(hash('b')), hash('b'), 50, dev, randomUUID(), 2026]);

	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL_0293);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

describe('0293 as a file', () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		const scan = scanFile(SQL_0293);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scanFile("insert into public.armory_projects (name) values ('x');").findings).toHaveLength(1);
		expect(pasteTrap(SQL_0293)).toEqual([]);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
	});

	test('the first object it creates is new in this file, so the deploy probe can see it applied', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table|policy|index)\s+([\w.]+)/i.exec(SQL_0293);
		expect(first?.[1]).toBe('public._armory_release_is_newer');
		const earlier = ALL.filter((x) => x < '0293').map((x) => readFileSync(join(MIGRATIONS_DIR, x), 'utf8'));
		expect(earlier.some((t) => t.includes('_armory_release_is_newer'))).toBe(false);
		// Positive control: the same scan finds a name an earlier file does carry.
		expect(earlier.some((t) => t.includes('armory_check_release'))).toBe(true);
	});

	test('a second paste changes no catalog object, and the first changed something', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL_0293);
		expect(await catalogFingerprint(db)).toEqual(after);
	});
});

describe('the deployed refusal, measured before the apply', () => {
	test('a 2026 save was refused with 22023 on both write paths', () => {
		expect(refusedBefore).toMatchObject({ code: '22023', message: NEWER_REFUSED });
		expect(sideRefusedBefore).toMatchObject({ code: '22023', message: NEWER_REFUSED });
	});
});

describe('after 0293', () => {
	test('a 2026 save is committed and its release recorded as checked', async () => {
		const v = await commit(part, null, hash('c'), 2026);
		expect(v.advanced).toBe(true);
		expect(await releaseOf(v.version_id)).toEqual({ saved_release: 2026, release_checked: true, side: false });
	});

	test('a 2026 kept copy is saved and its release recorded', async () => {
		const id = (await api.one<{ id: string }>(ana, SIDE, [part, null, key(hash('d')), hash('d'), 50, dev, randomUUID(), 2026])).id;
		expect(await releaseOf(id)).toEqual({ saved_release: 2026, release_checked: true, side: true });
	});

	test('an unknown release is still refused in an enforce project, and taken in a warn one', async () => {
		const current = (await db.sql<{ id: string }>('select current_version_id as id from public.armory_files where id = $1', [part])).rows[0].id;
		const warn = await commit(part, current, hash('e'), null);
		expect(warn.advanced).toBe(true);
		expect(await releaseOf(warn.version_id)).toMatchObject({ saved_release: null, release_checked: false });
		await db.sql(`update public.armory_projects set release_gate = 'enforce' where id = $1`, [project]);
		const refused = await api.fails(ana, COMMIT, [part, warn.version_id, key(hash('f')), hash('f'), 100, dev, randomUUID(), null]);
		expect(refused).toMatchObject({ code: '22023', message: UNKNOWN_REFUSED });
		// And a newer release still goes through in enforce.
		const newer = await commit(part, warn.version_id, hash('9'), 2027);
		expect(newer.advanced).toBe(true);
		expect(await releaseOf(newer.version_id)).toMatchObject({ saved_release: 2027, release_checked: true });
	});

	test('a file that is not SolidWorks records no release, whatever it is sent', async () => {
		const v = await commit(text, null, hash('7'), 2030);
		expect(v.advanced).toBe(true);
		expect(await releaseOf(v.version_id)).toBeUndefined();
	});

	test('no client role can call the check or the helper; authenticated still calls the commit', async () => {
		for (const sig of ['armory_check_release(uuid, smallint)', '_armory_release_is_newer(smallint, smallint)']) {
			expect(await canExecute(db, 'authenticated', sig), sig).toBe(false);
			expect(await canExecute(db, 'anon', sig), sig).toBe(false);
		}
		// Positive control: the same probe answers true where authenticated does hold it.
		expect(await canExecute(db, 'authenticated', 'armory_commit_version_with_release(uuid, uuid, text, text, bigint, uuid, uuid, smallint)')).toBe(true);
	});
});
