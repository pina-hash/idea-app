// tests/db/armory-v3-purge.test.ts
//
// DELETE FOREVER (IDEA Armory v0.3 item 3, migration 0233 part armory-core), on
// the whole chain, over data written before it through 0231's and 0232's RPCs.
//
// Every property here fails silently when it is wrong:
//   - STORED CONTENT IS SHARED. A file's bytes are keyed by their hash, so one
//     object can back files in several projects. A purge that queued every hash
//     of the files it deleted would hand the storage sweep another project's
//     live file. The fixture shares one hash between the purged folder and a
//     surviving project, chosen here (never derived from the function), and the
//     queue must hold exactly the others.
//   - HISTORY ELSEWHERE IS NEVER BROKEN. A side version in a surviving file may
//     name a purged version as its parent; the purge refuses (55006
//     referenced_elsewhere) and leaves every row where it was, rather than
//     failing on a raw foreign key half way.
//   - THE PROJECT IS GONE FROM EVERY TABLE, and the surviving project's counts
//     do not move.
//   - A REMOVED FOLDER'S LEFTOVER CHECKOUT (the remover's own, which a tombstone
//     never releases) does not block the purge; a checkout taken AFTER the
//     removal does.
//   - THE BREAK-LOCK / PURGE LOCK ORDER. Measured: the deployed break_lock
//     crossing a purge's order deadlocks; 0233's queues.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { PRE_0233, SQL_0233 } from './chain-0233';
import { armoryRpc, hash, makeAdmin, person, waitForLockWait } from './armory-v3-helpers';

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;

let admin: SeededUser;
let admin2: SeededUser;
let mentor: SeededUser;
let lead: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let outsider: SeededUser;

let A: string;
let B: string;
let C: string;
const dev: Record<string, string> = {};
const f: Record<string, string> = {};
let incidentOnA: string;

/** Every hash A's files name, by letter, chosen by this fixture. */
const A_ONLY = ['1', '2', '3', '6', '7', '8', '9', 'a', 'b', 'c', 'd'].map(hash);
/** Named by A/Old/Bracket AND by B/Live/Shared. Must never be queued while B lives. */
const SHARED = hash('5');

async function count(sql: string, params: unknown[] = []): Promise<number> {
	return (await db.sql<{ n: number }>(sql, params)).rows[0].n;
}

/** Rows of every Armory table that belong to one project, keyed by table. */
async function projectRows(P: string, fileIds: string[]): Promise<Record<string, number>> {
	const byFile = (t: string) => count(`select count(*)::int as n from public.${t} where file_id = any($1::uuid[])`, [fileIds]);
	return {
		projects: await count('select count(*)::int as n from public.armory_projects where id = $1', [P]),
		members: await count('select count(*)::int as n from public.armory_members where project_id = $1', [P]),
		files: await count('select count(*)::int as n from public.armory_files where project_id = $1', [P]),
		versions: await byFile('armory_versions'),
		side_versions: await byFile('armory_side_versions'),
		locks: await byFile('armory_locks'),
		tombstones: await byFile('armory_tombstones'),
		version_releases: await byFile('armory_version_releases'),
		allocations: await count('select count(*)::int as n from public.armory_part_number_allocations where project_id = $1', [P]),
		changes: await count('select count(*)::int as n from public.armory_change_feed where project_id = $1', [P])
	};
}

/** A purge's lock order (project FOR UPDATE, then a lock row deleted) against a take back begun while the project is held. */
async function purgeCrossesBreak(P: string, file: string, u: SeededUser, d: string): Promise<{ purge: string; take: string }> {
	return db.asServiceRole(async (t1) => {
		await t1('begin');
		await t1('select 1 from public.armory_projects where id = $1 for update', [P]);
		const take = db
			.asUser(u.id, (q) => q('select public.armory_break_lock($1, $2, $3) as ok', [file, d, randomUUID()]))
			.then(
				(r) => `ok=${r.rows[0].ok}`,
				(e) => `ERR ${(e as { code: string }).code}`
			);
		await waitForLockWait(db);
		let purge: string;
		try {
			const r = await t1('delete from public.armory_locks where file_id = $1', [file]);
			await t1('commit');
			purge = `deleted ${r.rowCount}`;
		} catch (e) {
			await t1('rollback');
			purge = `ERR ${(e as { code: string }).code}`;
		}
		return { purge, take: await take };
	});
}

let preCross: { purge: string; take: string };

beforeAll(async () => {
	db = await startTestDb(PRE_0233);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	admin2 = await person(db, 'tech@boscotech.edu', 'Tess Tech');
	await makeAdmin(db, admin2.email);
	mentor = await person(db, 'mentor@boscotech.edu', 'Mo Mentor');
	lead = await person(db, 'lead@boscotech.net', 'Lea Diaz');
	ana = await person(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben@boscotech.net', 'Ben Ortiz');
	outsider = await person(db, 'zed@boscotech.net', 'Zed');

	A = await api.project(admin, 'Robot 2026');
	B = await api.project(admin, 'Offseason');
	C = await api.project(admin, 'Cross');
	await api.member(admin, A, mentor.email, 'mentor');
	await api.member(admin, A, lead.email, 'cad_lead');
	for (const P of [A, B]) {
		await api.member(admin, P, ana.email, 'student');
		await api.member(admin, P, ben.email, 'student');
	}
	await api.member(admin, C, ana.email, 'student');
	dev.ana = await api.device(ana, 'Lab PC 3');
	dev.ben = await api.device(ben, 'Ben laptop');
	dev.lead = await api.device(lead, 'Lead PC');
	dev.mentor = await api.device(mentor, 'Mentor laptop');

	/** A file with one version (locked, committed, released). */
	const saved = async (P: string, folder: string, name: string, h: string): Promise<{ id: string; v: string }> => {
		const id = await api.createFile(ana, P, dev.ana, folder, name);
		expect(await api.lock(ana, id, dev.ana)).toBe(true);
		const v = (await api.commit(ana, id, null, h, dev.ana)).version_id;
		expect(await api.release(ana, id, dev.ana)).toBe(true);
		return { id, v };
	};
	/** A file with one version, removed through the tombstone, KEEPING the remover's checkout (the agent's way). */
	const removed = async (P: string, folder: string, name: string, h: string): Promise<{ id: string; v: string }> => {
		const id = await api.createFile(ana, P, dev.ana, folder, name);
		expect(await api.lock(ana, id, dev.ana)).toBe(true);
		const v = (await api.commit(ana, id, null, h, dev.ana)).version_id;
		expect(await api.tombstone(ana, id, v, dev.ana)).toBe(true);
		return { id, v };
	};

	// PROJECT A, through 0231's and 0232's RPCs.
	f.plate = await api.createFile(ana, A, dev.ana, 'Drive', 'Plate.SLDPRT');
	expect(await api.lock(ana, f.plate, dev.ana)).toBe(true);
	const p1 = (
		await api.one<{ version_id: string }>(ana, 'select version_id from public.armory_commit_version_with_release($1, null, $2, $3, 100, $4, $5, 2025::smallint)', [
			f.plate, 'k', hash('1'), dev.ana, randomUUID()
		])
	).version_id;
	await api.commit(ana, f.plate, p1, hash('2'), dev.ana);
	await api.commit(ana, f.plate, p1, hash('3'), dev.ana); // stale parent: a side version
	expect(await api.release(ana, f.plate, dev.ana)).toBe(true);
	f.bracket = (await removed(A, 'Old', 'Bracket.SLDPRT', SHARED)).id; // remover's checkout left on it
	f.gusset = (await saved(A, 'Old', 'Gusset.SLDPRT', hash('6'))).id;
	f.deep = (await saved(A, 'Old/Sub', 'Deep.SLDPRT', hash('7'))).id;
	expect((await api.one<{ n: number }>(ana, `select public.armory_delete_folder($1, 'Old', $2, $3) as n`, [A, dev.ana, randomUUID()])).n).toBe(2);
	f.spacer = (await removed(A, 'Old2', 'Spacer.SLDPRT', hash('8'))).id;
	f.washer = (await removed(A, 'old', 'Washer.SLDPRT', hash('9'))).id;
	f.gear = (await saved(A, 'Live', 'Gear.SLDPRT', hash('b'))).id;
	const pin = await removed(A, 'Locked', 'Pin.SLDPRT', hash('c'));
	f.pin = pin.id;
	expect(await api.release(ana, f.pin, dev.ana)).toBe(true);
	expect(await api.lock(ben, f.pin, dev.ben)).toBe(true); // checked out AFTER it was removed
	const src = await removed(A, 'Ref', 'Src.SLDPRT', hash('a'));
	f.src = src.id;
	f.taker = await api.createFile(ana, A, dev.ana, 'Drive', 'Taker.SLDPRT');
	await api.side(ana, f.taker, src.v, hash('d'), dev.ana); // a live file's history names Ref/Src's version
	await api.one(ana, 'select * from public.armory_allocate_part_number($1, 2, null, $2)', [A, randomUUID()]);
	f.knob1 = await api.createFile(ana, A, dev.ana, 'BL', 'Knob1.SLDPRT');
	f.knob2 = await api.createFile(ana, A, dev.ana, 'BL', 'Knob2.SLDPRT');
	expect(await api.lock(ana, f.knob1, dev.ana)).toBe(true);
	expect(await api.lock(ana, f.knob2, dev.ana)).toBe(true);

	// PROJECT B shares one stored file with A/Old/Bracket.
	f.shared = (await saved(B, 'Live', 'Shared.SLDPRT', SHARED)).id;
	f.bOwn = (await saved(B, 'Live', 'Own.SLDPRT', hash('e'))).id;
	// PROJECT C: its only version is named, as a parent, by a side version in B.
	const cross = await saved(C, 'Ref', 'Origin.SLDPRT', hash('f'));
	f.cross = cross.id;
	await api.side(ana, f.bOwn, cross.v, hash('0'), dev.ana);

	// AGAINST THE DEPLOYED break_lock: a purge's lock order crossing a take back.
	preCross = await purgeCrossesBreak(A, f.knob1, lead, dev.lead);

	await db.sql(SQL_0233);
	// An incident labelled with project A, filed after the apply.
	incidentOnA = (
		await api.one<{ id: string }>(ana, `select public.armory_submit_app_incident('crash', 'It closed', '0.3.0', 'Lab PC 3', $1, '{}'::jsonb, null) as id`, [A])
	).id;
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the take back against a purge, project row first', () => {
	test('measured on the deployed break_lock: the two deadlock', () => {
		expect([preCross.purge, preCross.take].filter((o) => o === 'ERR 40P01')).toHaveLength(1);
	});
	test('after 0233 the take back waits for the purge and then finds nothing held', async () => {
		expect(await purgeCrossesBreak(A, f.knob2, lead, dev.lead)).toEqual({ purge: 'deleted 1', take: 'ok=false' });
	});
});

// ===========================================================================
describe('the preview names the real cost before the confirm', () => {
	test('a removed folder: three files, the leftover checkout released, two stored files freed (the shared one is not)', async () => {
		const p = (await api.one<{ p: Record<string, unknown> }>(mentor, `select public.armory_purge_preview($1, 'Old') as p`, [A])).p;
		expect(p).toMatchObject({
			name: 'Robot 2026', folder: 'Old', files: 3, live_files: 0, versions: 3, side_versions: 0,
			checkouts: 1, blocking_checkouts: 0, referenced_elsewhere: 0, blobs: 2, bytes: 200, can_purge: true
		});
	});
	test('a folder with a live file, one checked out after removal, one named elsewhere: each says why it cannot go', async () => {
		const pv = async (folder: string) => (await api.one<{ p: Record<string, unknown> }>(admin2, 'select public.armory_purge_preview($1, $2) as p', [A, folder])).p;
		expect(await pv('Live')).toMatchObject({ live_files: 1, live_names: ['Live/Gear.SLDPRT'], can_purge: false });
		expect(await pv('Locked')).toMatchObject({ blocking_checkouts: 1, blocking_names: ['Locked/Pin.SLDPRT'], can_purge: false });
		expect(await pv('Ref')).toMatchObject({ referenced_elsewhere: 1, can_purge: false });
	});
	test('a whole project: admin only, and not purgeable until archived', async () => {
		expect((await api.fails(mentor, 'select public.armory_purge_preview($1)', [A])).code).toBe('42501');
		expect((await api.fails(ana, `select public.armory_purge_preview($1, 'Old')`, [A])).code).toBe('42501');
		const p = (await api.one<{ p: Record<string, unknown> }>(admin2, 'select public.armory_purge_preview($1) as p', [A])).p;
		expect(p).toMatchObject({ archived: false, can_purge: false, folder: null });
		expect((await api.fails(admin2, 'select public.armory_purge_preview($1)', [randomUUID()])).code).toBe('P0002');
	});
});

// ===========================================================================
describe('Delete forever: a removed folder', () => {
	test('a student and a CAD lead are refused 42501; a bad folder 22023', async () => {
		for (const u of [ana, lead, outsider]) {
			expect((await api.fails(u, `select public.armory_purge_folder($1, 'Old', $2)`, [A, randomUUID()])).code).toBe('42501');
		}
		expect((await api.fails(mentor, `select public.armory_purge_folder($1, '', $2)`, [A, randomUUID()])).code).toBe('22023');
	});
	test('a live file refuses it, naming the file', async () => {
		const e = await api.fails(mentor, `select public.armory_purge_folder($1, 'Live', $2)`, [A, randomUUID()]);
		expect([e.code, JSON.parse(e.detail!)]).toEqual(['55006', { reason: 'live', names: ['Live/Gear.SLDPRT'], total: 1 }]);
	});
	test('a checkout taken after the removal refuses it', async () => {
		const e = await api.fails(admin2, `select public.armory_purge_folder($1, 'Locked', $2)`, [A, randomUUID()]);
		expect([e.code, JSON.parse(e.detail!)]).toEqual(['55006', { reason: 'checked_out', names: ['Locked/Pin.SLDPRT'], total: 1 }]);
	});
	test('a version another file names refuses it, and every row stays where it was', async () => {
		const before = await projectRows(A, [f.src, f.taker]);
		const e = await api.fails(mentor, `select public.armory_purge_folder($1, 'Ref', $2)`, [A, randomUUID()]);
		expect([e.code, JSON.parse(e.detail!)]).toEqual(['55006', { reason: 'referenced_elsewhere', names: ['Drive/Taker.SLDPRT'], total: 1 }]);
		expect(await projectRows(A, [f.src, f.taker])).toEqual(before);
		expect(await count('select count(*)::int as n from public.armory_files where purging_at is not null')).toBe(0);
	});
	test('an empty folder deletes nothing and writes no change', async () => {
		const r = (await api.one<{ r: Record<string, unknown> }>(mentor, `select public.armory_purge_folder($1, 'Nowhere', $2) as r`, [A, randomUUID()])).r;
		expect(r).toEqual({ folder: 'Nowhere', files: 0, versions: 0, side_versions: 0, checkouts_released: 0, blobs_queued: 0, bytes_queued: 0 });
		expect(await count(`select count(*)::int as n from public.armory_change_feed where kind = 'folder_purged'`)).toBe(0);
	});
	test("a mentor deletes 'Old' forever: its three files, the leftover checkout, and only the stored files nothing else names", async () => {
		const op = randomUUID();
		const created = await count(`select count(*)::int as n from public.armory_change_feed where entity_id = any($1::uuid[])`, [[f.bracket, f.gusset, f.deep]]);
		expect(created).toBeGreaterThan(0);
		const r = (await api.one<{ r: Record<string, unknown> }>(mentor, `select public.armory_purge_folder($1, 'Old', $2) as r`, [A, op])).r;
		expect(r).toEqual({ folder: 'Old', files: 3, versions: 3, side_versions: 0, checkouts_released: 1, blobs_queued: 2, bytes_queued: 200 });
		expect(await projectRows(A, [f.bracket, f.gusset, f.deep])).toMatchObject({ versions: 0, side_versions: 0, locks: 0, tombstones: 0 });
		expect(await count('select count(*)::int as n from public.armory_files where id = any($1::uuid[])', [[f.bracket, f.gusset, f.deep]])).toBe(0);
		// Siblings: a longer name and a different case are other folders.
		expect(await count('select count(*)::int as n from public.armory_files where id = any($1::uuid[])', [[f.spacer, f.washer]])).toBe(2);
		const queued = (await db.sql<{ content_sha256: string; reason: string }>('select content_sha256, reason from public.armory_orphaned_blobs order by 1')).rows;
		expect(queued).toEqual([hash('6'), hash('7')].sort().map((h) => ({ content_sha256: h, reason: 'folder_purged' })));
		expect(queued.map((q) => q.content_sha256)).not.toContain(SHARED);
		// One change, naming the files; the files' earlier history rows stay.
		const purged = (await db.sql<{ payload: Record<string, unknown> }>(`select payload from public.armory_change_feed where kind = 'folder_purged'`)).rows;
		expect(purged).toHaveLength(1);
		expect(purged[0].payload).toMatchObject({ folder: 'Old', files: 3, by: mentor.email });
		expect((purged[0].payload.file_ids as string[]).sort()).toEqual([f.bracket, f.gusset, f.deep].sort());
		expect(await count(`select count(*)::int as n from public.armory_change_feed where entity_id = any($1::uuid[])`, [[f.bracket, f.gusset, f.deep]])).toBe(created);
		// A replay answers the first time and does nothing more.
		expect((await api.one<{ r: unknown }>(mentor, `select public.armory_purge_folder($1, 'Old', $2) as r`, [A, op])).r).toEqual(r);
		expect(await count(`select count(*)::int as n from public.armory_change_feed where kind = 'folder_purged'`)).toBe(1);
	});
	test('a purged file answers like a file that never existed', async () => {
		const e = await api.fails(ana, 'select public.armory_acquire_lock($1, $2, $3)', [f.gusset, dev.ana, randomUUID()]);
		expect([e.code, e.message]).toEqual(['P0001', 'not a project member']);
		expect((await api.fails(ana, 'select public.armory_file_history($1)', [f.gusset])).code).toBe('42501');
	});
});

// ===========================================================================
describe('Delete forever: an archived project', () => {
	let bBefore: Record<string, number>;
	let aFiles: string[];
	let result: Record<string, unknown>;
	const op = randomUUID();
	beforeAll(async () => {
		bBefore = await projectRows(B, [f.shared, f.bOwn]);
		aFiles = (await db.sql<{ id: string }>('select id from public.armory_files where project_id = $1', [A])).rows.map((r) => r.id);
	});
	test('the refusals, in order: not an admin, not archived, the name not typed exactly, no such project', async () => {
		for (const u of [ana, mentor, lead]) {
			expect((await api.fails(u, `select public.armory_purge_project($1, 'Robot 2026', $2)`, [A, randomUUID()])).code).toBe('42501');
		}
		const na = await api.fails(admin2, `select public.armory_purge_project($1, 'Robot 2026', $2)`, [A, randomUUID()]);
		expect([na.code, JSON.parse(na.detail!)]).toEqual(['55000', { reason: 'not_archived' }]);
		expect((await api.one<{ ok: boolean }>(admin2, 'select public.armory_set_project_archived($1, true, $2) as ok', [A, randomUUID()])).ok).toBe(true);
		for (const typed of ['robot 2026', 'Robot 2026 ', 'Robot', '']) {
			const nm = await api.fails(admin2, 'select public.armory_purge_project($1, $2, $3)', [A, typed, randomUUID()]);
			expect([nm.code, JSON.parse(nm.detail!)]).toEqual(['22023', { reason: 'name_mismatch' }]);
		}
		expect((await api.fails(admin2, `select public.armory_purge_project($1, 'Robot 2026', $2)`, [randomUUID(), randomUUID()])).code).toBe('P0002');
		expect(await count('select count(*)::int as n from public.armory_files where project_id = $1', [A])).toBe(aFiles.length);
	});
	test('a site admin in no project deletes it: every row gone, live checkouts released, the result counted', async () => {
		result = (await api.one<{ r: Record<string, unknown> }>(admin2, `select public.armory_purge_project($1, 'Robot 2026', $2) as r`, [A, op])).r;
		expect(result).toMatchObject({ name: 'Robot 2026', files: aFiles.length, checkouts_released: 4 }); // the leftovers on Old2, old and Ref, and Ben's on Locked
		expect(result.versions).toBe(7);
		expect(result.side_versions).toBe(2);
		const left = await projectRows(A, aFiles);
		expect(Object.values(left).every((n) => n === 0)).toBe(true);
		expect(Object.keys(left)).toHaveLength(10);
		expect(await projectRows(B, [f.shared, f.bOwn])).toEqual(bBefore);
	});
	test('the queue holds exactly the hashes A alone named, and never the one B still names', async () => {
		const queued = (await db.sql<{ content_sha256: string }>('select content_sha256 from public.armory_orphaned_blobs order by 1')).rows.map((r) => r.content_sha256);
		expect(queued).toEqual([...A_ONLY].sort());
		expect(queued).not.toContain(SHARED);
		expect(result.blobs_queued).toBe(A_ONLY.length - 2); // 6 and 7 were queued by the folder purge
	});
	test('a receipt answers for the project; a uuid that never was answers null; no feed row survives', async () => {
		const at = (await api.one<{ t: string | null }>(ana, 'select public.armory_project_purged($1) as t', [A])).t;
		expect(at).not.toBeNull();
		expect((await api.one<{ t: string | null }>(outsider, 'select public.armory_project_purged($1) as t', [randomUUID()])).t).toBeNull();
		expect((await api.one<{ t: string | null }>(ana, 'select public.armory_project_purged($1) as t', [B])).t).toBeNull();
		const receipt = (await db.sql<{ name: string; purged_by: string }>('select name, purged_by from public.armory_purged_projects')).rows;
		expect(receipt).toEqual([{ name: 'Robot 2026', purged_by: admin2.email }]);
		// The former member reads it the way an app finds out: the project is gone from both lists.
		expect(((await api.one<{ p: Array<{ id: string }> }>(ana, 'select public.armory_my_projects() as p')).p).map((p) => p.id)).not.toContain(A);
		expect((await api.fails(ana, 'select count(*) from public.armory_list_changes($1, 0)', [A])).code).toBe('P0001');
	});
	test('a replay answers the first time and does nothing more', async () => {
		const again = (await api.one<{ r: unknown }>(admin2, `select public.armory_purge_project($1, 'Robot 2026', $2) as r`, [A, op])).r;
		expect(again).toEqual(result);
		expect(await count('select count(*)::int as n from public.armory_purged_projects')).toBe(1);
	});
	test('an incident labelled with the project survives it, with no project', async () => {
		const { rows } = await db.sql<{ project_id: string | null; summary: string }>('select project_id, summary from public.armory_app_incidents where id = $1', [incidentOnA]);
		expect(rows).toEqual([{ project_id: null, summary: 'It closed' }]);
	});
	test("a project whose version another project's history names is refused, with nothing deleted", async () => {
		expect((await api.one<{ ok: boolean }>(admin2, 'select public.armory_set_project_archived($1, true, $2) as ok', [C, randomUUID()])).ok).toBe(true);
		const e = await api.fails(admin2, `select public.armory_purge_project($1, 'Cross', $2)`, [C, randomUUID()]);
		expect([e.code, JSON.parse(e.detail!)]).toEqual(['55006', { reason: 'referenced_elsewhere', names: ['Live/Own.SLDPRT'], total: 1 }]);
		expect(await count('select count(*)::int as n from public.armory_files where project_id = $1', [C])).toBe(1);
		expect(await count('select count(*)::int as n from public.armory_purged_projects where project_id = $1', [C])).toBe(0);
	});
	test("afterwards the history of a surviving project is as immutable as it was", async () => {
		await expect(db.sql('update public.armory_versions set byte_length = 1 where file_id = $1', [f.bOwn])).rejects.toMatchObject({ code: '55000' });
		await expect(db.sql('delete from public.armory_side_versions where file_id = $1', [f.bOwn])).rejects.toMatchObject({ code: '55000' });
		expect(await count('select count(*)::int as n from public.armory_files where purging_at is not null')).toBe(0);
	});
});

// ===========================================================================
describe('the storage sweep queue', () => {
	test('a site admin only', async () => {
		for (const sql of ['select public.armory_orphans_count()', 'select public.armory_orphans_pending()', `select public.armory_orphans_swept('{}'::text[])`]) {
			expect((await api.fails(mentor, sql)).code).toBe('42501');
			expect((await api.fails(ana, sql)).code).toBe('42501');
		}
	});
	test('a hash a version names again is kept, never listed; a sweep marks only what it confirmed', async () => {
		expect((await api.one<{ n: number }>(admin2, 'select public.armory_orphans_count() as n')).n).toBe(A_ONLY.length);
		// B commits content that A alone used to name: it must not be removed now.
		expect(await api.lock(ana, f.shared, dev.ana)).toBe(true);
		const cur = (await db.sql<{ v: string }>('select current_version_id as v from public.armory_files where id = $1', [f.shared])).rows[0].v;
		await api.commit(ana, f.shared, cur, hash('1'), dev.ana);
		expect((await api.one<{ n: number }>(admin2, 'select public.armory_orphans_count() as n')).n).toBe(A_ONLY.length - 1);
		const pending = (await api.one<{ h: string[] }>(admin2, 'select public.armory_orphans_pending(100) as h')).h;
		expect([...pending].sort()).toEqual(A_ONLY.filter((h) => h !== hash('1')).sort());
		expect((await db.sql<{ kept: boolean }>('select kept_at is not null as kept from public.armory_orphaned_blobs where content_sha256 = $1', [hash('1')])).rows[0].kept).toBe(true);
		// Between the listing and the sweep, B names another one: the sweep marks the rest and keeps that one.
		await api.commit(ana, f.shared, null, hash('2'), dev.ana); // a side version (stale parent) still names the content
		const swept = (await api.one<{ n: number }>(admin2, 'select public.armory_orphans_swept($1::text[]) as n', [pending])).n;
		expect(swept).toBe(pending.length - 1);
		expect((await api.one<{ n: number }>(admin2, 'select public.armory_orphans_count() as n')).n).toBe(0);
		expect((await api.one<{ h: string[] }>(admin2, 'select public.armory_orphans_pending() as h')).h).toEqual([]);
		const rows = (await db.sql<{ content_sha256: string; swept: boolean; kept: boolean }>(
			'select content_sha256, swept_at is not null as swept, kept_at is not null as kept from public.armory_orphaned_blobs order by 1'
		)).rows;
		expect(rows.filter((r) => r.kept).map((r) => r.content_sha256).sort()).toEqual([hash('1'), hash('2')].sort());
		expect(rows.filter((r) => r.swept)).toHaveLength(A_ONLY.length - 2);
	});
});
