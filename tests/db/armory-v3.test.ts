// tests/db/armory-v3.test.ts
//
// MIGRATION 0233, PART armory-core (IDEA ARMORY v0.3), ON THE WHOLE CHAIN,
// OVER DATA WRITTEN BEFORE IT. The chain is every migration short of 0233 (the
// production-shaped database), then projects, members, devices, files,
// versions, checkouts and a removed file written through 0231's and 0232's own
// RPCs, then 0233 on top. The purge has its own suite (armory-v3-purge) and so
// do the Windows app's reports (armory-v3-reports).
//
// What a wrong answer here would look like, and why each is silent:
//   - THE DEADLOCK. A folder rename crossing a check out ends one of them with
//     40P01, which an app retries and a person never sees. Measured both ways:
//     the deployed bodies deadlock, the 0233 bodies queue.
//   - A 0.2.x APP READS THE SAME ANSWERS. Fourteen functions are re-created;
//     a paraphrase changes a refusal text or a SQLSTATE an app branches on. A
//     corpus of calls is put to the DEPLOYED bodies and again to the 0233
//     bodies, and compared case for case (the 0197 pattern).
//   - A SITE ADMIN NOW READS EVERY PROJECT, and only reads it: the ten
//     policies and four read functions admit armory_can_view; my_projects (what
//     a computer syncs) stays membership-only; an outsider still reads nothing.
//   - THE IMMUTABILITY TRIGGER still refuses every UPDATE, every DELETE of an
//     unmarked file, and every DELETE by service_role even with the marker.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { PRE_0233, SQL_0233, catalogFingerprint, overloads, part0233, pasteTrap, tablePrivileges } from './chain-0233';
import { armoryRpc, hash, makeAdmin, person, waitForLockWait } from './armory-v3-helpers';

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;

let admin: SeededUser; // the owner: a site admin, and mentor of every project they create
let admin2: SeededUser; // a site admin who is in NO project
let mentor: SeededUser; // a teacher, mentor of A, not an admin
let lead: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let outsider: SeededUser;
let guest: SeededUser;
let kai: SeededUser;

let A: string;
let corpusPre: string;
let corpusPost: string;
const dev: Record<string, string> = {};
let plate: string;
let roller: string;
let race1: string;
let race2: string;
let race3: string;
let trig: string;
let trigVersion: string;
let bracket: string;

type Outcome = { ok: true; value: unknown } | { ok: false; code: string; message: string; detail?: unknown };

/** The answer a call gives, with every uuid replaced, so two projects can be compared. */
async function attempt(u: SeededUser, sql: string, params: unknown[], pick: (row: Record<string, unknown>) => unknown): Promise<Outcome> {
	try {
		const row = await api.one(u, sql, params);
		return { ok: true, value: scrub(pick(row)) };
	} catch (e) {
		const err = e as { code: string; message: string; detail?: string };
		return { ok: false, code: err.code, message: err.message, detail: err.detail ? scrub(JSON.parse(err.detail)) : undefined };
	}
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
function scrub(v: unknown): unknown {
	if (typeof v === 'string') return v.replace(UUID, '<uuid>');
	if (Array.isArray(v)) return v.map(scrub);
	if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
	return v;
}

/**
 * About forty calls a 0.2.x Windows app makes, in one fixed order, against one
 * project. Every answer is recorded: a value, or a SQLSTATE with its message and
 * DETAIL. Run once against the deployed bodies and once against 0233's.
 */
async function corpus(P: string): Promise<Record<string, Outcome>> {
	const out: Record<string, Outcome> = {};
	const call = async (name: string, u: SeededUser, sql: string, params: unknown[], pick = (r: Record<string, unknown>) => Object.values(r)[0]) => {
		out[name] = await attempt(u, sql, params, pick);
		return out[name];
	};
	const created = await call('create', ana, 'select public.armory_create_file($1, $2, $3, $4, $5) as id', [P, 'Gear', 'Plate.SLDPRT', dev.ana, randomUUID()]);
	const file = (await api.one<{ id: string }>(ana, 'select id from public.armory_files where project_id = $1 and name = $2', [P, 'Plate.SLDPRT'])).id;
	expect(created.ok).toBe(true);
	await call('create taken', ben, 'select public.armory_create_file($1, $2, $3, $4, $5) as id', [P, 'Other', 'plate.sldprt', dev.ben, randomUUID()]);
	await call('create outsider', outsider, 'select public.armory_create_file($1, $2, $3, $4, $5) as id', [P, 'X', 'Y.SLDPRT', dev.outsider, randomUUID()]);
	await call('create foreign device', ana, 'select public.armory_create_file($1, $2, $3, $4, $5) as id', [P, 'X', 'Y.SLDPRT', dev.ben, randomUUID()]);
	await call('create bad folder', ana, 'select public.armory_create_file($1, $2, $3, $4, $5) as id', [P, 'Bad:folder', 'Y.SLDPRT', dev.ana, randomUUID()]);
	await call('lock', ana, 'select public.armory_acquire_lock($1, $2, $3) as ok', [file, dev.ana, randomUUID()]);
	await call('lock held', ben, 'select public.armory_acquire_lock($1, $2, $3) as ok', [file, dev.ben, randomUUID()]);
	await call('lock outsider', outsider, 'select public.armory_acquire_lock($1, $2, $3) as ok', [file, dev.outsider, randomUUID()]);
	await call('lock foreign device', ana, 'select public.armory_acquire_lock($1, $2, $3) as ok', [file, dev.ben, randomUUID()]);
	await call('lock no file', ana, 'select public.armory_acquire_lock($1, $2, $3) as ok', [randomUUID(), dev.ana, randomUUID()]);
	await call('release not holder', ben, 'select public.armory_release_lock($1, $2, $3) as ok', [file, dev.ben, randomUUID()]);
	await call('commit', ana, 'select advanced from public.armory_commit_version($1, null, $2, $3, 10, $4, $5)', [file, 'k1', hash('1'), dev.ana, randomUUID()]);
	const v1 = (await api.one<{ id: string }>(ana, 'select current_version_id as id from public.armory_files where id = $1', [file])).id;
	await call('commit stale', ana, 'select advanced from public.armory_commit_version($1, null, $2, $3, 10, $4, $5)', [file, 'k2', hash('2'), dev.ana, randomUUID()]);
	await call('commit no lock', ben, 'select advanced from public.armory_commit_version($1, $2, $3, $4, 10, $5, $6)', [file, v1, 'k3', hash('3'), dev.ben, randomUUID()]);
	await call('commit no file', ana, 'select advanced from public.armory_commit_version($1, null, $2, $3, 10, $4, $5)', [randomUUID(), 'k', hash('4'), dev.ana, randomUUID()]);
	await call('side outsider', outsider, `select public.armory_save_side_version($1, $2, 'k', $3, 5, 'r', $4, $5) as id`, [file, v1, hash('5'), dev.outsider, randomUUID()]);
	await call('side member', ben, `select public.armory_save_side_version($1, $2, 'k', $3, 5, 'r', $4, $5) is not null as ok`, [file, v1, hash('6'), dev.ben, randomUUID()]);
	await call('break student', ben, 'select public.armory_break_lock($1, $2, $3) as ok', [file, dev.ben, randomUUID()]);
	await call('break outsider', outsider, 'select public.armory_break_lock($1, $2, $3) as ok', [file, dev.outsider, randomUUID()]);
	await call('break foreign device', lead, 'select public.armory_break_lock($1, $2, $3) as ok', [file, dev.ben, randomUUID()]);
	await call('break lead', lead, 'select public.armory_break_lock($1, $2, $3) as ok', [file, dev.lead, randomUUID()]);
	await call('break nothing held', lead, 'select public.armory_break_lock($1, $2, $3) as ok', [file, dev.lead, randomUUID()]);
	await call('tombstone no lock', ana, 'select public.armory_tombstone($1, $2, $3, $4) as ok', [file, v1, dev.ana, randomUUID()]);
	await call('move outsider', outsider, 'select public.armory_move_file($1, $2, $3, $4, $5) as ok', [file, 'Z', 'Plate.SLDPRT', dev.outsider, randomUUID()]);
	await call('move no lock', ana, 'select public.armory_move_file($1, $2, $3, $4, $5) as ok', [file, 'Z', 'Plate.SLDPRT', dev.ana, randomUUID()]);
	await call('relock after break', ana, 'select public.armory_acquire_lock($1, $2, $3) as ok', [file, dev.ana, randomUUID()]);
	await call('move bad name', ana, 'select public.armory_move_file($1, $2, $3, $4, $5) as ok', [file, 'Z', 'Bad?.SLDPRT', dev.ana, randomUUID()]);
	await call('move', ana, 'select public.armory_move_file($1, $2, $3, $4, $5) as ok', [file, 'Gear2', 'Plate.SLDPRT', dev.ana, randomUUID()]);
	await call('tombstone', ana, 'select public.armory_tombstone($1, $2, $3, $4) as ok', [file, v1, dev.ana, randomUUID()]);
	await call('revive', ben, 'select public.armory_create_file($1, $2, $3, $4, $5) = $6 as same', [P, 'Back', 'PLATE.sldprt', dev.ben, randomUUID(), file]);
	await call('release after revive', ana, 'select public.armory_release_lock($1, $2, $3) as ok', [file, dev.ana, randomUUID()]);
	await call('changes outsider', outsider, 'select count(*) from public.armory_list_changes($1, 0)', [P]);
	await call('files outsider', outsider, 'select public.armory_project_files($1) as f', [P]);
	await call('history outsider', outsider, 'select public.armory_file_history($1) as h', [file]);
	await call('checkouts outsider', outsider, 'select public.armory_project_checkouts($1) as c', [P]);
	await call('archive student', ana, 'select public.armory_set_project_archived($1, true, $2) as ok', [P, randomUUID()]);
	await call('archive lead', lead, 'select public.armory_set_project_archived($1, true, $2) as ok', [P, randomUUID()]);
	await call('archive null', admin, 'select public.armory_set_project_archived($1, null, $2) as ok', [P, randomUUID()]);
	await call('part number outsider', outsider, 'select part_number from public.armory_allocate_part_number($1, 3, null, $2)', [P, randomUUID()]);
	// What a member reads back: the feed's kinds and payload keys in order, the file
	// list's keys, and the checkout list. The keys 0233 ADDS are set aside here and
	// asserted on their own.
	out['feed'] = await attempt(ana, `select jsonb_agg(jsonb_build_object('kind', kind, 'keys', (select jsonb_agg(k order by k) from jsonb_object_keys(payload) k)) order by cursor) as f from public.armory_list_changes($1, 0)`, [P], (r) => r.f);
	out['files'] = await attempt(ana, 'select public.armory_project_files($1) as f', [P], (r) =>
		(r.f as Array<Record<string, unknown>>).map((x) => ({ ...x, side_versions: undefined, created_at: undefined, current: x.current ? Object.keys(x.current as object).sort() : null, lock: x.lock ? Object.keys(x.lock as object).sort() : null }))
	);
	out['history'] = await attempt(ana, 'select public.armory_file_history($1) as h', [file], (r) => (r.h as Array<Record<string, unknown>>).map((x) => ({ kind: x.kind, reason: x.reason })));
	out['mine'] = await attempt(ana, 'select public.armory_my_projects() as p', [], (r) =>
		(r.p as Array<Record<string, unknown>>).filter((x) => x.id === P).map((x) => Object.keys(x).filter((k) => k !== 'can_take_back').sort())
	);
	return out;
}

/** A folder operation's lock order (0232: project FOR UPDATE, then the folder's files FOR UPDATE) against a check out begun while the project row is held. */
async function folderCrossesCheckout(P: string, folder: string, file: string, u: SeededUser, d: string): Promise<{ folder: string; checkout: string }> {
	return db.asServiceRole(async (t1) => {
		await t1('begin');
		await t1('select 1 from public.armory_projects where id = $1 for update', [P]);
		const checkout = db
			.asUser(u.id, (q) => q('select public.armory_acquire_lock($1, $2, $3) as ok', [file, d, randomUUID()]))
			.then(
				(r) => `ok=${r.rows[0].ok}`,
				(e) => `ERR ${(e as { code: string }).code}`
			);
		await waitForLockWait(db);
		let folderResult: string;
		try {
			const r = await t1('select id from public.armory_folder_files($1, $2)', [P, folder]);
			await t1('commit');
			folderResult = `locked ${r.rows.length}`;
		} catch (e) {
			await t1('rollback');
			folderResult = `ERR ${(e as { code: string }).code}`;
		}
		return { folder: folderResult, checkout: await checkout };
	});
}

let preDeadlock: { folder: string; checkout: string };
let preCorpus: Record<string, Outcome>;
let preNullDeviceBreak: Outcome;

beforeAll(async () => {
	db = await startTestDb(PRE_0233);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	admin2 = await person(db, 'tech@boscotech.edu', 'Tess Tech');
	await makeAdmin(db, admin2.email);
	mentor = await person(db, 'mentor@boscotech.edu', 'Mo Mentor');
	lead = await person(db, 'lead@boscotech.net', 'Lea Diaz');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben@boscotech.net', 'Ben Ortiz', 'Benny');
	outsider = await person(db, 'zed@boscotech.net', 'Zed Ziegler');
	guest = await person(db, 'gus@gmail.com', 'Gus Reyes');
	kai = await person(db, 'kai@boscotech.net', 'Kaimana Fullname', 'Kai');
	await db.sql(`update public.profiles set avatar = 'preset:fox', avatar_url = 'https://example.test/kai.png', pathway = 'IDEA' where id = $1`, [kai.id]);
	await db.sql(`update public.profiles set avatar_url = 'https://example.test/ana.png', pathway = 'CSEE' where id = $1`, [ana.id]);

	// PRE-0233 DATA, through 0231's and 0232's RPCs.
	A = await api.project(admin, 'Robot 2026');
	await api.member(admin, A, mentor.email, 'mentor');
	await api.member(admin, A, lead.email, 'cad_lead');
	await api.member(admin, A, ana.email, 'student');
	await api.member(admin, A, ben.email, 'student');
	await api.member(admin, A, 'ghost@boscotech.net', 'student');
	corpusPre = await api.project(admin, 'Corpus Pre');
	corpusPost = await api.project(admin, 'Corpus Post');
	for (const p of [corpusPre, corpusPost]) {
		await api.member(admin, p, lead.email, 'cad_lead');
		await api.member(admin, p, ana.email, 'student');
		await api.member(admin, p, ben.email, 'student');
	}
	dev.admin = await api.device(admin, 'Pina desk');
	dev.mentor = await api.device(mentor, 'Mentor laptop');
	dev.lead = await api.device(lead, 'Lead PC');
	dev.ana = await api.device(ana, 'Lab PC 3');
	dev.ben = await api.device(ben, 'Ben laptop');
	dev.outsider = await api.device(outsider, 'Zed PC');
	// A device registered long ago and never heard from again: not on the team page.
	dev.anaOld = await api.device(ana, 'Old laptop');
	await db.sql(`update public.armory_devices set registered_at = now() - interval '200 days' where id = $1`, [dev.anaOld]);

	plate = await api.createFile(ana, A, dev.ana, 'Drivetrain', 'Plate.SLDPRT');
	expect(await api.lock(ana, plate, dev.ana)).toBe(true);
	await api.commit(ana, plate, null, hash('a'), dev.ana);
	await api.side(ana, plate, null, hash('b'), dev.ana);
	expect(await api.release(ana, plate, dev.ana)).toBe(true);
	await api.createFile(ana, A, dev.ana, 'Drivetrain', 'Spacer.SLDPRT');
	roller = await api.createFile(ana, A, dev.ana, 'Intake', 'Roller.SLDPRT');
	expect(await api.lock(ben, roller, dev.ben)).toBe(true);
	race1 = await api.createFile(ana, A, dev.ana, 'Race1', 'A1.SLDPRT');
	await api.createFile(ana, A, dev.ana, 'Race1', 'B1.SLDPRT');
	race2 = await api.createFile(ana, A, dev.ana, 'Race2', 'A2.SLDPRT');
	await api.createFile(ana, A, dev.ana, 'Race2', 'B2.SLDPRT');
	race3 = await api.createFile(ana, A, dev.ana, 'Race3', 'A3.SLDPRT');
	await api.createFile(ana, A, dev.ana, 'Race3', 'B3.SLDPRT');
	// A SolidWorks commit through the release gate, so armory_version_releases holds a row.
	trig = await api.createFile(ana, A, dev.ana, 'Trig', 'Trig.SLDPRT');
	expect(await api.lock(ana, trig, dev.ana)).toBe(true);
	trigVersion = (
		await api.one<{ version_id: string }>(ana, 'select version_id from public.armory_commit_version_with_release($1, null, $2, $3, 10, $4, $5, 2025::smallint)', [
			trig,
			'k',
			hash('c'),
			dev.ana,
			randomUUID()
		])
	).version_id;
	expect(await api.release(ana, trig, dev.ana)).toBe(true);
	// A removed file, through the tombstone, still carrying its remover's checkout.
	bracket = await api.createFile(ana, A, dev.ana, 'Old', 'Bracket.SLDPRT');
	expect(await api.lock(ana, bracket, dev.ana)).toBe(true);
	const bv = (await api.commit(ana, bracket, null, hash('d'), dev.ana)).version_id;
	expect(await api.tombstone(ana, bracket, bv, dev.ana)).toBe(true);
	await api.one(ana, 'select * from public.armory_allocate_part_number($1, 4, null, $2)', [A, randomUUID()]);

	// AGAINST THE DEPLOYED BODIES: the deadlock, measured, and the corpus, recorded.
	preDeadlock = await folderCrossesCheckout(A, 'Race1', race1, ben, dev.ben);
	if (preDeadlock.checkout === 'ok=true') expect(await api.release(ben, race1, dev.ben)).toBe(true);
	preCorpus = await corpus(corpusPre);
	preNullDeviceBreak = await attempt(lead, 'select public.armory_break_lock($1, null, $2) as ok', [plate, randomUUID()], (r) => r.ok);

	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL_0233);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

const CORE = (): string => {
	const p = part0233('armory-core');
	if (p === null) throw new Error('0233 has no armory-core part');
	return p;
};
const REPORTS = (): string => {
	const p = part0233('armory-reports');
	if (p === null) throw new Error('0233 has no armory-reports part');
	return p;
};

// ===========================================================================
describe('0233 as a file, for the parts this suite owns', () => {
	test('the apply tool would send both parts: no refusal and no top-level DML, against a planted insert', () => {
		for (const part of [REPORTS(), CORE()]) {
			const scan = scanFile(part);
			expect(scan.findings).toEqual([]);
			expect(scan.selfManagedTransaction).toBe(false);
		}
		expect(scanFile(CORE()).statements).toBeGreaterThan(60);
		expect(scanFile(`${CORE()}\ninsert into public.armory_orphaned_blobs (content_sha256, reason, queued_by) values ('x', 'y', 'z');`).findings).toHaveLength(1);
	});
	test('no paste trap in either part, and the check finds a planted one', () => {
		expect(pasteTrap(REPORTS())).toEqual([]);
		expect(pasteTrap(CORE())).toEqual([]);
		expect(pasteTrap(`${CORE()}\nselect 1; -- costs $5\n`)).toHaveLength(1);
	});
	test("the whole file's first probeable object is the new armory_app_feedback table", () => {
		// idea-status derives 0233's applied-state probe from the first create (or
		// added column or constraint) in the comment-stripped file; an object that
		// already exists there would read APPLIED before the apply.
		const clean = SQL_0233.replace(/--[^\n]*/g, '');
		const first = /\b(create\s+(or\s+replace\s+)?(unique\s+)?(function|procedure|view|materialized\s+view|table|trigger|policy|index|type|schema|extension)\s+(if\s+not\s+exists\s+)?[\w."]+|alter\s+table\s+[\w."]+\s+add\s+(column|constraint))/i.exec(clean);
		expect(first?.[0]).toBe('create table if not exists public.armory_app_feedback');
	});
	test('no function body names information_schema, and no comment carries a function header', () => {
		for (const part of [REPORTS(), CORE()]) {
			expect(part).not.toMatch(/information_schema/);
			const comments = part.split('\n').map((l) => (l.includes('--') ? l.slice(l.indexOf('--')) : '')).join('\n');
			expect(comments).not.toMatch(/create\s+(or\s+replace\s+)?(function|table|index|policy|view|trigger|type)\s+[\w.]+/i);
		}
	});
	test('re-applying both parts is a no-op on every Armory object', async () => {
		const armory = (s: string) => s.split('\n').filter((l) => /armory/.test(l)).join('\n');
		const once = await catalogFingerprint(db);
		await db.sql(REPORTS());
		await db.sql(CORE());
		expect(armory(await catalogFingerprint(db))).toBe(armory(once));
		expect(armory(once)).not.toBe(armory(preFingerprint)); // positive control: 0233 did move Armory objects
	});
	test('the data written before it is intact', async () => {
		const { rows } = await db.sql<{ n: number }>('select count(*)::int as n from public.armory_files where project_id = $1', [A]);
		expect(rows[0].n).toBe(11);
		const locks = await db.sql<{ holder_email: string }>('select holder_email from public.armory_locks where file_id = $1 and broken_at is null', [roller]);
		expect(locks.rows).toEqual([{ holder_email: ben.email }]);
	});
});

// ===========================================================================
describe('the grants, read off the catalog', () => {
	const CLIENT = [
		'armory_can_view', 'armory_acquire_lock', 'armory_release_lock', 'armory_break_lock', 'armory_save_side_version',
		'armory_commit_version', 'armory_tombstone', 'armory_move_file', 'armory_create_file', 'armory_set_project_archived',
		'armory_my_projects', 'armory_project_files', 'armory_file_history', 'armory_list_changes', 'armory_project_checkouts',
		'armory_project_summaries', 'armory_team_status', 'armory_people_search', 'armory_heartbeat', 'armory_lock_files',
		'armory_release_locks', 'armory_purge_preview', 'armory_purge_project', 'armory_purge_folder', 'armory_project_purged',
		'armory_orphans_count', 'armory_orphans_pending', 'armory_orphans_swept'
	];
	const PRIVATE = ['_armory_person_of', '_armory_person', '_armory_hash_referenced', '_armory_unreferenced_hashes',
		'_armory_referenced_elsewhere', '_armory_purge_files', 'armory_refuse_version_mutation'];
	test('one overload each; anon executes none; authenticated executes the client set and none of the private set', async () => {
		const fn = async (name: string) => {
			const { rows } = await db.sql<{ anon: boolean; auth: boolean }>(
				`select has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
				 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			return rows;
		};
		for (const name of [...CLIENT, ...PRIVATE]) expect(await overloads(db, name), name).toBe(1);
		const client = await Promise.all(CLIENT.map(fn));
		const priv = await Promise.all(PRIVATE.map(fn));
		expect(client.filter((r) => r[0].auth).length).toBe(CLIENT.length);
		expect(client.filter((r) => r[0].anon).length).toBe(0);
		expect(priv.filter((r) => r[0].auth).length).toBe(0);
		expect(priv.filter((r) => r[0].anon).length).toBe(0);
		await expect(db.asUser(outsider.id, (q) => q(`select public._armory_person($1)`, [ana.email]))).rejects.toThrow(/permission denied/);
		await expect(db.asAnon((q) => q('select public.armory_team_status($1)', [A]))).rejects.toThrow(/permission denied/);
	});
	test('the two queue tables are closed to every client role and carry no policy', async () => {
		for (const t of ['armory_purged_projects', 'armory_orphaned_blobs']) {
			expect(await tablePrivileges(db, 'anon', t)).toEqual([]);
			expect(await tablePrivileges(db, 'authenticated', t)).toEqual([]);
			const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from pg_policies where tablename = $1`, [t]);
			expect(rows[0].n).toBe(0);
		}
		await expect(db.asUser(admin.id, (q) => q('select * from public.armory_orphaned_blobs'))).rejects.toThrow(/permission denied/);
		// Positive control on the same connection shape: an Armory table the admin may read.
		expect((await db.asUser(admin.id, (q) => q('select count(*)::int as n from public.armory_projects'))).rows[0].n).toBe(3);
	});
});

// ===========================================================================
describe('item 6: the project row first', () => {
	test('measured on the DEPLOYED bodies: a folder operation crossing a check out deadlocks', () => {
		const outcomes = [preDeadlock.folder, preDeadlock.checkout];
		expect(outcomes.filter((o) => o === 'ERR 40P01')).toHaveLength(1);
	});
	test('after 0233 the same interleaving queues: the folder operation commits, then the check out lands', async () => {
		const r = await folderCrossesCheckout(A, 'Race2', race2, ben, dev.ben);
		expect(r).toEqual({ folder: 'locked 2', checkout: 'ok=true' });
		const { rows } = await db.sql('select 1 from public.armory_locks where file_id = $1 and holder_email = $2 and broken_at is null', [race2, ben.email]);
		expect(rows).toHaveLength(1);
		expect(await api.release(ben, race2, dev.ben)).toBe(true);
	});
	test('and in the other order: a check out holding the project row makes the folder operation wait, not die', async () => {
		const r = await db.asUser(ben.id, async (q) => {
			await q('begin');
			const got = await q('select public.armory_acquire_lock($1, $2, $3) as ok', [race3, dev.ben, randomUUID()]);
			const folderOp = db.asServiceRole(async (t1) => {
				await t1('begin');
				await t1('select 1 from public.armory_projects where id = $1 for update', [A]);
				const files = await t1('select id from public.armory_folder_files($1, $2)', [A, 'Race3']);
				await t1('commit');
				return files.rows.length;
			});
			await waitForLockWait(db);
			await q('commit');
			return { checkout: got.rows[0].ok as boolean, folder: await folderOp };
		});
		expect(r).toEqual({ checkout: true, folder: 2 });
		expect(await api.release(ben, race3, dev.ben)).toBe(true);
	});
	test('every per-file writer takes the project row FOR KEY SHARE before anything else, read off the bodies', async () => {
		const { rows } = await db.sql<{ proname: string; src: string }>(
			`select p.proname, p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in ('armory_acquire_lock', 'armory_release_lock', 'armory_break_lock',
			 'armory_save_side_version', 'armory_commit_version', 'armory_tombstone', 'armory_move_file', 'armory_create_file')`
		);
		expect(rows).toHaveLength(8);
		for (const r of rows) {
			const share = r.src.indexOf('for key share');
			expect(share, r.proname).toBeGreaterThan(0);
			for (const later of ['insert into public.armory_locks', 'for update', 'delete from public.armory_locks', 'insert into public.armory_side_versions']) {
				const at = r.src.indexOf(later);
				if (at !== -1) expect(at, `${r.proname}: ${later}`).toBeGreaterThan(share);
			}
		}
	});
});

// ===========================================================================
describe('a 0.2.x app reads the same answers', () => {
	let post: Record<string, Outcome>;
	beforeAll(async () => {
		post = await corpus(corpusPost);
	}, 120_000);
	test('the corpus covers what it says it does', () => {
		expect(Object.keys(preCorpus).length).toBeGreaterThanOrEqual(40);
		const refusals = Object.values(preCorpus).filter((o) => !o.ok);
		expect(new Set(refusals.map((o) => (o as { code: string }).code))).toEqual(new Set(['P0001', '42501', '22023', '23505']));
	});
	test('every call answers identically, refusal text, SQLSTATE and DETAIL included', () => {
		expect(post).toEqual(preCorpus);
	});
	test('the keys 0233 adds are additive: can_take_back on my_projects, side_versions on a file', async () => {
		const mine = (await api.one<{ p: Array<Record<string, unknown>> }>(ana, 'select public.armory_my_projects() as p')).p;
		expect(mine.every((p) => p.can_take_back === false)).toBe(true);
		const files = (await api.one<{ f: Array<{ name: string; side_versions: number }> }>(ana, 'select public.armory_project_files($1) as f', [A])).f;
		expect(files.find((f) => f.name === 'Plate.SLDPRT')!.side_versions).toBe(1);
		expect(files.find((f) => f.name === 'Spacer.SLDPRT')!.side_versions).toBe(0);
	});
	test('the one deliberate change: a take back with a null device reaches the role check instead of the device check', async () => {
		expect(preNullDeviceBreak).toMatchObject({ ok: false, code: 'P0001', message: 'device is not registered to caller' });
		expect(await attempt(lead, 'select public.armory_break_lock($1, null, $2) as ok', [plate, randomUUID()], (r) => r.ok)).toEqual({ ok: true, value: false });
	});
});

// ===========================================================================
describe('item 1 and the read widening: a site admin reads, an outsider does not', () => {
	const TABLES: Array<[string, string]> = [
		['armory_projects', 'id = $1'],
		['armory_members', 'project_id = $1'],
		['armory_files', 'project_id = $1'],
		['armory_versions', 'file_id in (select id from public.armory_files where project_id = $1)'],
		['armory_side_versions', 'file_id in (select id from public.armory_files where project_id = $1)'],
		['armory_locks', 'file_id in (select id from public.armory_files where project_id = $1)'],
		['armory_tombstones', 'file_id in (select id from public.armory_files where project_id = $1)'],
		['armory_part_number_allocations', 'project_id = $1'],
		['armory_change_feed', 'project_id = $1'],
		['armory_version_releases', 'file_id in (select id from public.armory_files where project_id = $1)']
	];
	test('the change feed is still in the realtime publication, behind its one policy', async () => {
		const pub = await db.sql<{ n: number }>(`select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'armory_change_feed'`);
		expect(pub.rows[0].n).toBe(1);
		const pol = await db.sql<{ policyname: string }>(`select policyname from pg_policies where tablename = 'armory_change_feed'`);
		expect(pol.rows.map((r) => r.policyname)).toEqual(['armory_changes_read']);
	});
	test('per table: a member and the non-member admin read the owner count, the outsider reads zero', async () => {
		let compared = 0;
		for (const [t, where] of TABLES) {
			const sql = `select count(*)::int as n from public.${t} where ${where}`;
			const owner = (await db.sql<{ n: number }>(sql, [A])).rows[0].n;
			expect(owner, t).toBeGreaterThan(0);
			const as = async (u: SeededUser) => (await api.one<{ n: number }>(u, sql, [A])).n;
			expect(await as(ana), t).toBe(owner);
			expect(await as(admin2), t).toBe(owner);
			expect(await as(outsider), t).toBe(0);
			compared += 1;
		}
		expect(compared).toBe(10);
	});
	test('the four read functions admit the non-member admin, and each keeps its own refusal for an outsider', async () => {
		expect(((await api.one<{ f: unknown[] }>(admin2, 'select public.armory_project_files($1) as f', [A])).f).length).toBe(11);
		expect(((await api.one<{ h: unknown[] }>(admin2, 'select public.armory_file_history($1) as h', [plate])).h).length).toBe(2);
		expect((await api.one<{ n: number }>(admin2, 'select count(*)::int as n from public.armory_list_changes($1, 0)', [A])).n).toBeGreaterThan(5);
		expect(((await api.one<{ c: unknown[] }>(admin2, 'select public.armory_project_checkouts($1) as c', [A])).c).length).toBeGreaterThan(0);
		const refused = async (sql: string, p: unknown) => {
			const e = await api.fails(outsider, sql, [p]);
			return [e.code, e.message];
		};
		expect(await refused('select public.armory_project_files($1)', A)).toEqual(['42501', 'not a project member']);
		expect(await refused('select public.armory_file_history($1)', plate)).toEqual(['42501', 'not a project member']);
		expect(await refused('select count(*) from public.armory_list_changes($1, 0)', A)).toEqual(['P0001', 'not a project member']);
		expect(await refused('select public.armory_project_checkouts($1)', A)).toEqual(['42501', 'not a project member']);
	});
	test('my_projects stays membership-only: the non-member admin lists nothing, so their computer syncs nothing', async () => {
		expect((await api.one<{ p: unknown[] }>(admin2, 'select public.armory_my_projects() as p')).p).toEqual([]);
		expect(((await api.one<{ p: unknown[] }>(admin, 'select public.armory_my_projects() as p')).p).length).toBe(3);
	});
	test('holder_name is unchanged: the chosen display name, else the full name', async () => {
		expect(await api.lock(lead, plate, dev.lead)).toBe(true);
		const list = (await api.one<{ c: Array<Record<string, unknown>> }>(ana, 'select public.armory_project_checkouts($1) as c', [A])).c;
		expect(list.find((c) => c.file_id === roller)).toMatchObject({ holder_email: ben.email, holder_name: 'Benny', device_name: 'Ben laptop' });
		expect(list.find((c) => c.file_id === plate)).toMatchObject({ holder_email: lead.email, holder_name: 'Lea Diaz', device_name: 'Lead PC' });
		expect(Object.keys(list[0]).sort()).toEqual(['device_name', 'file_id', 'folder', 'holder_email', 'holder_name', 'name', 'since']);
	});
});

// ===========================================================================
describe('item 2: Force check in', () => {
	test('a site admin in no project, with no computer, takes a file back; the feed says who', async () => {
		const op = randomUUID();
		expect((await api.one<{ ok: boolean }>(admin2, 'select public.armory_break_lock($1, null, $2) as ok', [plate, op])).ok).toBe(true);
		const { rows } = await db.sql<{ broken_by: string; broken_holder_email: string }>('select broken_by, broken_holder_email from public.armory_locks where file_id = $1', [plate]);
		expect(rows[0]).toEqual({ broken_by: admin2.email, broken_holder_email: lead.email });
		const feed = await db.sql<{ payload: Record<string, unknown> }>(`select payload from public.armory_change_feed where project_id = $1 and kind = 'lock_broken' and entity_id = $2 order by cursor desc limit 1`, [A, plate]);
		expect(feed.rows[0].payload).toMatchObject({ by: admin2.email, former_holder: lead.email });
		// A replay answers the first time and writes nothing more.
		const before = (await db.sql<{ n: number }>(`select count(*)::int as n from public.armory_change_feed where kind = 'lock_broken'`)).rows[0].n;
		expect((await api.one<{ ok: boolean }>(admin2, 'select public.armory_break_lock($1, null, $2) as ok', [plate, op])).ok).toBe(true);
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.armory_change_feed where kind = 'lock_broken'`)).rows[0].n).toBe(before);
	});
	test('a mentor from the website (no device) and a CAD lead from their computer both may', async () => {
		expect(await api.lock(ana, plate, dev.ana)).toBe(true);
		expect((await api.one<{ ok: boolean }>(mentor, 'select public.armory_break_lock($1, null, $2) as ok', [plate, randomUUID()])).ok).toBe(true);
		expect(await api.lock(ana, plate, dev.ana)).toBe(true);
		expect((await api.one<{ ok: boolean }>(lead, 'select public.armory_break_lock($1, $2, $3) as ok', [plate, dev.lead, randomUUID()])).ok).toBe(true);
	});
	test("a student and an outsider are refused with 0231's text; a device that is not yours still is", async () => {
		expect(await api.lock(ana, plate, dev.ana)).toBe(true);
		for (const u of [ben, outsider]) {
			const e = await api.fails(u, 'select public.armory_break_lock($1, null, $2)', [plate, randomUUID()]);
			expect([e.code, e.message]).toEqual(['P0001', 'only a mentor or cad_lead may break a lock']);
		}
		const e = await api.fails(admin2, 'select public.armory_break_lock($1, $2, $3)', [plate, dev.ben, randomUUID()]);
		expect([e.code, e.message]).toEqual(['P0001', 'device is not registered to caller']);
		const { rows } = await db.sql('select 1 from public.armory_locks where file_id = $1 and holder_email = $2 and broken_at is null', [plate, ana.email]);
		expect(rows).toHaveLength(1);
		expect(await api.release(ana, plate, dev.ana)).toBe(true);
	});
	test('can_take_back is true for a mentor, a CAD lead and an admin member, false for a student', async () => {
		const flag = async (u: SeededUser) =>
			(await api.one<{ p: Array<{ id: string; can_take_back: boolean }> }>(u, 'select public.armory_my_projects() as p')).p.find((p) => p.id === A)!.can_take_back;
		expect(await flag(mentor)).toBe(true);
		expect(await flag(lead)).toBe(true);
		expect(await flag(admin)).toBe(true);
		expect(await flag(ana)).toBe(false);
		expect(await flag(ben)).toBe(false);
	});
	test('a site admin archives and restores a project they are not in; a student still may not', async () => {
		expect((await api.one<{ ok: boolean }>(admin2, 'select public.armory_set_project_archived($1, true, $2) as ok', [corpusPost, randomUUID()])).ok).toBe(true);
		expect((await api.one<{ ok: boolean }>(admin2, 'select public.armory_set_project_archived($1, false, $2) as ok', [corpusPost, randomUUID()])).ok).toBe(true);
		const e = await api.fails(ben, 'select public.armory_set_project_archived($1, true, $2)', [A, randomUUID()]);
		expect([e.code, e.message]).toEqual(['42501', 'only a mentor may archive or restore the project']);
		expect((await api.fails(admin2, 'select public.armory_set_project_archived($1, true, $2)', [randomUUID(), randomUUID()])).code).toBe('P0002');
	});
});

// ===========================================================================
describe('the immutability trigger keeps every door but the purge shut', () => {
	test("an UPDATE, as the owner, still raises 55000", async () => {
		await expect(db.sql(`update public.armory_versions set byte_length = 1 where id = $1`, [trigVersion])).rejects.toMatchObject({ code: '55000' });
	});
	test('a DELETE of an unmarked file\'s version, as the owner, still raises 55000', async () => {
		await expect(db.sql(`delete from public.armory_versions where id = $1`, [trigVersion])).rejects.toMatchObject({ code: '55000' });
	});
	test('service_role, which holds DELETE and can set the marker, is still refused', async () => {
		const privs = await tablePrivileges(db, 'service_role', 'armory_versions');
		expect(privs).toContain('delete');
		await db.asServiceRole((q) => q('update public.armory_files set purging_at = now(), current_version_id = null where id = $1', [trig]));
		await expect(db.asServiceRole((q) => q('delete from public.armory_version_releases where file_id = $1', [trig]))).rejects.toMatchObject({ code: '55000' });
		await expect(db.asServiceRole((q) => q('delete from public.armory_versions where file_id = $1', [trig]))).rejects.toMatchObject({ code: '55000' });
		const { rows } = await db.sql<{ n: number }>('select count(*)::int as n from public.armory_versions where file_id = $1', [trig]);
		expect(rows[0].n).toBe(1);
		// Nor can it reach the definer helper the purge goes through, which runs as the owner.
		await expect(
			db.asServiceRole((q) => q(`select public._armory_purge_files($1, array[$2]::uuid[], 'project_purged')`, [A, trig]), admin.id)
		).rejects.toThrow(/permission denied/);
		expect(await db.sql<{ ok: boolean }>(`select has_function_privilege('service_role', 'public.armory_purge_project(uuid, text, uuid)', 'execute') as ok`).then((r) => r.rows[0].ok)).toBe(true);
	});
	test('positive control: the owner, with the marker set, gets through (the half the purge uses)', async () => {
		await db.sql('delete from public.armory_version_releases where file_id = $1', [trig]);
		await db.sql('delete from public.armory_versions where file_id = $1', [trig]);
		const { rows } = await db.sql<{ n: number }>('select count(*)::int as n from public.armory_versions where file_id = $1', [trig]);
		expect(rows[0].n).toBe(0);
		await db.sql('update public.armory_files set purging_at = null where id = $1', [trig]);
	});
});

// ===========================================================================
describe('item 5: heartbeat and team status', () => {
	test("the caller's own computer is stamped; a call within 20 seconds that changes nothing writes nothing", async () => {
		await api.one(ana, `select public.armory_heartbeat($1, '0.3.0', 'idle')`, [dev.ana]);
		const first = (await db.sql<{ last_seen: Date; app_version: string; state: string }>('select last_seen, app_version, state from public.armory_devices where id = $1', [dev.ana])).rows[0];
		expect(first).toMatchObject({ app_version: '0.3.0', state: 'idle' });
		expect(first.last_seen).not.toBeNull();
		await api.one(ana, `select public.armory_heartbeat($1, '0.3.0', 'idle')`, [dev.ana]);
		const again = (await db.sql<{ last_seen: Date }>('select last_seen from public.armory_devices where id = $1', [dev.ana])).rows[0];
		expect(again.last_seen.getTime()).toBe(first.last_seen.getTime());
		await api.one(ana, `select public.armory_heartbeat($1, '0.3.0', 'syncing')`, [dev.ana]);
		expect((await db.sql<{ state: string }>('select state from public.armory_devices where id = $1', [dev.ana])).rows[0].state).toBe('syncing');
	});
	test('refusals: another person\'s computer, a malformed state, an overlong version', async () => {
		expect((await api.fails(ben, `select public.armory_heartbeat($1, '0.3.0', 'idle')`, [dev.ana])).message).toBe('device is not registered to caller');
		const bad = await api.fails(ana, `select public.armory_heartbeat($1, '0.3.0', 'not a word')`, [dev.ana]);
		expect([bad.code, JSON.parse(bad.detail!).reason]).toEqual(['22023', 'state']);
		expect((await api.fails(ana, `select public.armory_heartbeat($1, $2, 'idle')`, [dev.ana, 'v'.repeat(41)])).code).toBe('22023');
	});
	test('a member sees every member: name, role, computers heard from, and live checkouts', async () => {
		const team = (await api.one<{ t: Array<Record<string, unknown>> }>(ana, 'select public.armory_team_status($1) as t', [A])).t;
		expect(team.map((m) => m.email).sort()).toEqual([admin.email, ana.email, ben.email, 'ghost@boscotech.net', lead.email, mentor.email].sort());
		const benRow = team.find((m) => m.email === ben.email)!;
		expect(benRow).toMatchObject({ role: 'student', name: 'Benny', has_account: true });
		expect((benRow.checkouts as Array<Record<string, unknown>>).map((c) => c.path)).toEqual(['Intake/Roller.SLDPRT']);
		const anaRow = team.find((m) => m.email === ana.email)!;
		expect(anaRow).toMatchObject({ name: 'Ana Reyes', avatar: null, avatar_url: 'https://example.test/ana.png', pathway: 'CSEE', devices_total: 2 });
		const anaDevices = anaRow.devices as Array<Record<string, unknown>>;
		expect(anaDevices.map((d) => d.name)).toEqual(['Lab PC 3']); // the 200-day-old laptop is not listed
		expect(anaDevices[0]).toMatchObject({ app_version: '0.3.0', state: 'syncing' });
		expect(Object.keys(anaDevices[0]).sort()).toEqual(['app_version', 'id', 'last_seen', 'name', 'registered_at', 'state']);
		const ghost = team.find((m) => m.email === 'ghost@boscotech.net')!;
		expect(ghost).toEqual({ email: 'ghost@boscotech.net', role: 'student', has_account: false, devices_total: 0, devices: [], checkouts: [] });
	});
	test('the outsider is refused 42501; the non-member admin is not', async () => {
		expect((await api.fails(outsider, 'select public.armory_team_status($1)', [A])).code).toBe('42501');
		expect(((await api.one<{ t: unknown[] }>(admin2, 'select public.armory_team_status($1) as t', [A])).t).length).toBe(6);
	});
});

// ===========================================================================
describe('people search', () => {
	const search = async (u: SeededUser, q: string, limit = 12) =>
		(await api.one<{ r: Array<Record<string, unknown>> }>(u, 'select public.armory_people_search($1, $2, $3) as r', [A, q, limit])).r;
	test('a mentor finds school accounts by shown name and by address, with their role in the project', async () => {
		const reyes = await search(mentor, 'reyes');
		expect(reyes.map((r) => r.email)).toEqual([ana.email]); // Gus Reyes is a visitor account and is never listed
		expect(reyes[0]).toEqual({ email: ana.email, name: 'Ana Reyes', avatar: null, avatar_url: 'https://example.test/ana.png', pathway: 'CSEE', member_role: 'student' });
		expect((await search(mentor, 'ana.reyes')).map((r) => r.email)).toEqual([ana.email]);
		expect((await search(mentor, 'zed')).map((r) => r.member_role)).toEqual([null]);
	});
	test('a chosen identity replaces the account one: never matched by the replaced full name, no Google photo behind an avatar', async () => {
		expect(await search(mentor, 'Fullname')).toEqual([]);
		const k = await search(mentor, 'kai');
		expect(k).toEqual([{ email: kai.email, name: 'Kai', avatar: 'preset:fox', avatar_url: null, pathway: 'IDEA', member_role: null }]);
		expect((await search(mentor, 'benny')).map((r) => r.email)).toEqual([ben.email]);
		expect(await search(mentor, 'ortiz')).toEqual([]);
	});
	test('fewer than two characters answers nothing; the limit is honoured and capped at 25; the domain and a typed % match nothing', async () => {
		expect(await search(mentor, ' a ')).toEqual([]);
		expect((await search(mentor, 'en')).map((r) => r.email).sort()).toEqual([ben.email, mentor.email].sort());
		expect(await search(mentor, 'en', 1)).toHaveLength(1);
		for (let i = 0; i < 30; i += 1) await person(db, `crowd${i}@boscotech.net`, `Crowd Member ${i}`);
		expect(await search(mentor, 'crowd', 1000)).toHaveLength(25);
		expect(await search(mentor, 'crowd')).toHaveLength(12);
		expect(await search(mentor, '@boscotech', 25)).toEqual([]);
		expect(await search(mentor, '%%')).toEqual([]);
	});
	test('a site admin may search any project; a CAD lead, a student and an outsider are refused 42501', async () => {
		expect((await search(admin2, 'lea')).map((r) => r.email)).toEqual([lead.email]);
		for (const u of [lead, ana, outsider]) {
			expect((await api.fails(u, 'select public.armory_people_search($1, $2)', [A, 'reyes'])).code).toBe('42501');
		}
	});
});

// ===========================================================================
describe('project summaries', () => {
	test('a member gets their projects with counts; a non-member admin gets every project with role null', async () => {
		const mine = (await api.one<{ s: Array<Record<string, unknown>> }>(ana, 'select public.armory_project_summaries() as s')).s;
		expect(mine.map((p) => p.name)).toEqual(['Corpus Post', 'Corpus Pre', 'Robot 2026']);
		const robot = mine.find((p) => p.id === A)!;
		expect(robot).toMatchObject({ role: 'student', files: 10, removed: 1, members: 6, archived: false });
		expect(robot.checked_out).toBe(1); // Ben's Roller; Ana's leftover on the removed Bracket is not a live checkout
		expect(robot.mine).toBe(0);
		expect(robot.stored).toBeGreaterThan(0);
		expect(typeof robot.last_change_at).toBe('string');
		const all = (await api.one<{ s: Array<Record<string, unknown>> }>(admin2, 'select public.armory_project_summaries() as s')).s;
		expect(all.map((p) => p.role)).toEqual([null, null, null]);
		const one = (await api.one<{ s: Array<{ id: string }> }>(admin2, 'select public.armory_project_summaries($1) as s', [A])).s;
		expect(one.map((p) => p.id)).toEqual([A]);
		expect((await api.one<{ s: unknown[] }>(outsider, 'select public.armory_project_summaries() as s')).s).toEqual([]);
	});
});

// ===========================================================================
describe('item 6b: batches', () => {
	let b1: string;
	let b2: string;
	let b3: string;
	beforeAll(async () => {
		b1 = await api.createFile(ana, A, dev.ana, 'Batch', 'One.SLDPRT');
		b2 = await api.createFile(ana, A, dev.ana, 'Batch', 'Two.SLDPRT');
		b3 = await api.createFile(ana, A, dev.ana, 'Batch', 'Three.SLDPRT');
	});
	test('three files in any order: one per file, sorted by id; a replay answers the first time', async () => {
		const op = randomUUID();
		const ids = [b3, b1, b2, b1];
		const r = (await api.one<{ r: { total: number; succeeded: number; refused: number; results: Array<{ file_id: string; ok: boolean; acquired: boolean }> } }>(
			ana, 'select public.armory_lock_files($1::uuid[], $2, $3) as r', [ids, dev.ana, op])).r;
		expect([r.total, r.succeeded, r.refused]).toEqual([3, 3, 0]);
		expect(r.results.map((x) => x.file_id)).toEqual([b1, b2, b3].sort());
		expect(r.results.every((x) => x.ok && x.acquired)).toBe(true);
		const again = (await api.one<{ r: unknown }>(ana, 'select public.armory_lock_files($1::uuid[], $2, $3) as r', [ids, dev.ana, op])).r;
		expect(again).toEqual(r);
	});
	test('a file someone else holds answers acquired false; a file the caller cannot reach is a refusal that stops nothing', async () => {
		const elsewhere = await api.createFile(ana, corpusPre, dev.ana, 'Batch', 'Elsewhere.SLDPRT');
		const r = (await api.one<{ r: { total: number; succeeded: number; refused: number; results: Array<Record<string, unknown>> } }>(
			outsider, 'select public.armory_lock_files($1::uuid[], $2, $3) as r', [[b1, elsewhere], dev.outsider, randomUUID()])).r;
		expect([r.total, r.succeeded, r.refused]).toEqual([2, 0, 2]);
		expect(r.results.every((x) => x.code === 'P0001' && x.message === 'not a project member')).toBe(true);
		const mixed = (await api.one<{ r: { succeeded: number; refused: number; results: Array<Record<string, unknown>> } }>(
			ben, 'select public.armory_lock_files($1::uuid[], $2, $3) as r', [[b1, elsewhere, randomUUID()], dev.ben, randomUUID()])).r;
		expect(mixed.succeeded).toBe(2);
		expect(mixed.refused).toBe(1);
		expect(mixed.results.find((x) => x.file_id === b1)).toMatchObject({ ok: true, acquired: false });
		expect(mixed.results.find((x) => x.file_id === elsewhere)).toMatchObject({ ok: true, acquired: true });
	});
	test('release mirrors it; empty and oversized batches are refused 22023', async () => {
		const r = (await api.one<{ r: { total: number; succeeded: number; results: Array<{ released: boolean }> } }>(
			ana, 'select public.armory_release_locks($1::uuid[], $2, $3) as r', [[b1, b2, b3], dev.ana, randomUUID()])).r;
		expect([r.total, r.succeeded]).toEqual([3, 3]);
		expect(r.results.map((x) => x.released)).toEqual([true, true, true]);
		expect((await api.fails(ana, 'select public.armory_lock_files($1::uuid[], $2, $3)', [[], dev.ana, randomUUID()])).code).toBe('22023');
		const many = Array.from({ length: 501 }, () => randomUUID());
		const e = await api.fails(ana, 'select public.armory_release_locks($1::uuid[], $2, $3)', [many, dev.ana, randomUUID()]);
		expect([e.code, JSON.parse(e.detail!)]).toEqual(['22023', { reason: 'count', total: 501, limit: 500 }]);
		expect((await api.fails(ana, 'select public.armory_lock_files($1::uuid[], $2, $3)', [[b1], dev.ben, randomUUID()])).message).toBe('device is not registered to caller');
	});
});
