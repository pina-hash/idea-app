// tests/db/armory-v2.test.ts
//
// MIGRATION 0232 (IDEA ARMORY v2, ledger 0366), ON THE WHOLE CHAIN, OVER DATA
// WRITTEN BEFORE IT. The chain is everything short of 0231, then 0231, then a
// project, members, devices, files, versions and a removed file written
// through 0231's own RPCs, and only then 0232 on top: what production holds on
// the day it applies.
//
// The contract (C1 to C7) is shared with the Windows agent's lane, so each
// clause is held here by its happy path, every refusal it names, a replayed
// operation id, and the grant. What a wrong answer here would look like is
// silent: a revived file with a new id loses its history without an error, a
// folder rename that ignores someone else's checkout moves their open file
// out from under them, and an anon grant is invisible until somebody probes.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { catalogFingerprint, pasteTrap } from './chain-0230';
import { V2_SQL, WITH_ARMORY } from './armory-proposed';

const hash = (c: string) => c.repeat(64);
const key = (h: string) => `blobs/sha256/${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`;

let db: TestDb;
let preV2: string;
let admin: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let lead: SeededUser;
let outsider: SeededUser;
let project: string;
let anaDevice: string;
let anaSecond: string;
let benDevice: string;
let leadDevice: string;
let plate: string;
let removed: string;
let removedFirstVersion: string;

async function one<T = Record<string, unknown>>(user: SeededUser, sql: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => (await q(sql, params)).rows[0] as T);
}

async function fails(user: SeededUser, sql: string, params: unknown[] = []): Promise<{ code: string; message: string; detail?: string }> {
	try {
		await one(user, sql, params);
	} catch (e) {
		return e as { code: string; message: string; detail?: string };
	}
	throw new Error(`expected a refusal from: ${sql}`);
}

async function changes(kind: string): Promise<Array<{ payload: Record<string, unknown>; entity_id: string }>> {
	const { rows } = await db.sql<{ payload: Record<string, unknown>; entity_id: string }>(
		'select payload, entity_id from public.armory_change_feed where project_id = $1 and kind = $2 order by cursor',
		[project, kind]
	);
	return rows;
}

const createFile = (u: SeededUser, device: string, folder: string, name: string, op = randomUUID()) =>
	one<{ id: string }>(u, 'select public.armory_create_file($1, $2, $3, $4, $5) as id', [project, folder, name, device, op]);
const lock = (u: SeededUser, file: string, device: string) =>
	one<{ ok: boolean }>(u, 'select public.armory_acquire_lock($1, $2, $3) as ok', [file, device, randomUUID()]);
const release = (u: SeededUser, file: string, device: string) =>
	one<{ ok: boolean }>(u, 'select public.armory_release_lock($1, $2, $3) as ok', [file, device, randomUUID()]);
const commit = (u: SeededUser, file: string, parent: string | null, h: string, device: string) =>
	one<{ version_id: string; advanced: boolean }>(u, 'select * from public.armory_commit_version($1, $2, $3, $4, 100, $5, $6)', [
		file,
		parent,
		key(h),
		h,
		device,
		randomUUID()
	]);
const filesOf = async (): Promise<Array<{ id: string; folder: string; name: string; deleted: boolean }>> =>
	(await one<{ f: Array<{ id: string; folder: string; name: string; deleted: boolean }> }>(admin, 'select public.armory_project_files($1) as f', [project])).f;

beforeAll(async () => {
	db = await startTestDb(WITH_ARMORY);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr. Pina');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	lead = await createUser(db, 'lead@boscotech.net', 'Lea Diaz');
	outsider = await createUser(db, 'zed@boscotech.net', 'Zed');
	await db.sql(`update public.profiles set display_name = 'Benny' where email = $1`, [ben.email]);

	// PRE-0232 DATA, through 0231's RPCs.
	project = (await one<{ id: string }>(admin, `select public.armory_create_project('Robot 2026', 2026::smallint, $1) as id`, [randomUUID()])).id;
	for (const [who, role] of [
		[ana.email, 'student'],
		[ben.email, 'student'],
		[lead.email, 'cad_lead']
	]) {
		await one(admin, 'select public.armory_add_member($1, $2, $3::public.armory_member_role, $4)', [project, who, role, randomUUID()]);
	}
	anaDevice = (await one<{ id: string }>(ana, `select public.armory_register_device('Lab PC 3', $1) as id`, [randomUUID()])).id;
	anaSecond = (await one<{ id: string }>(ana, `select public.armory_register_device('Ana laptop', $1) as id`, [randomUUID()])).id;
	benDevice = (await one<{ id: string }>(ben, `select public.armory_register_device('Ben laptop', $1) as id`, [randomUUID()])).id;
	leadDevice = (await one<{ id: string }>(lead, `select public.armory_register_device('Lead PC', $1) as id`, [randomUUID()])).id;

	plate = (await createFile(ana, anaDevice, 'Drivetrain', 'Plate.SLDPRT')).id;
	await createFile(ana, anaDevice, 'Drivetrain/Gearbox', 'Shaft.SLDPRT');
	await createFile(ana, anaDevice, 'Drivetrain', 'Spacer.SLDPRT');
	await createFile(ana, anaDevice, 'Intake', 'Roller.SLDPRT');
	await createFile(ana, anaDevice, 'Elevator', 'Carriage.SLDPRT');
	await createFile(ana, anaDevice, 'Climber', 'Hook.SLDPRT');

	// A file saved once and then removed: the revival case.
	removed = (await createFile(ana, anaDevice, 'Old', 'Bracket.SLDPRT')).id;
	expect((await lock(ana, removed, anaDevice)).ok).toBe(true);
	removedFirstVersion = (await commit(ana, removed, null, hash('1'), anaDevice)).version_id;
	expect((await one<{ ok: boolean }>(ana, 'select public.armory_tombstone($1, $2, $3, $4) as ok', [removed, removedFirstVersion, anaDevice, randomUUID()])).ok).toBe(true);

	preV2 = await catalogFingerprint(db);
	await db.sql(V2_SQL);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('0232 applies the way the apply tool and the SQL editor need', () => {
	test('the apply tool would send it: no refusals, no top-level DML', () => {
		const scan = scanFile(V2_SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		// Positive control: a top-level insert in the same scanner is a finding.
		expect(scanFile(`insert into public.armory_projects(name) values ('x');`).findings.length).toBeGreaterThan(0);
	});
	test('the paste trap is clean', () => {
		expect(pasteTrap(V2_SQL)).toEqual([]);
		expect(pasteTrap('select 1; -- costs $5\n')).toHaveLength(1);
	});
	test('re-applying is a no-op on the catalog', async () => {
		const once = await catalogFingerprint(db);
		await db.sql(V2_SQL);
		expect(await catalogFingerprint(db)).toBe(once);
	});
	test('nothing outside armory_ moved', async () => {
		const strip = (s: string) => s.split('\n').filter((l) => !/armory_/.test(l)).join('\n');
		const after = await catalogFingerprint(db);
		expect(strip(after)).toBe(strip(preV2));
		expect(after).not.toBe(preV2); // positive control: 0232 did change armory_ objects
	});
	test('the data written before it is intact', async () => {
		const { rows } = await db.sql<{ season: number; archived_at: string | null }>('select season, archived_at from public.armory_projects where id = $1', [project]);
		expect(rows[0]).toEqual({ season: 2026, archived_at: null });
		expect((await filesOf()).length).toBe(7);
	});
});

describe('the grants', () => {
	test('anon executes no armory function; the new helpers are closed to authenticated', async () => {
		const { rows } = await db.sql<{ anon: number; helpers: number; rpcs: number }>(`
			select
				(select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname like 'armory\\_%' and has_function_privilege('anon', p.oid, 'execute')) as anon,
				(select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname in ('armory_live_name_taken', 'armory_folder_files', 'armory_refuse_checked_out')
				   and has_function_privilege('authenticated', p.oid, 'execute')) as helpers,
				(select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname in ('armory_rename_project', 'armory_set_project_archived', 'armory_rename_folder',
				   'armory_delete_folder', 'armory_project_checkouts') and has_function_privilege('authenticated', p.oid, 'execute')) as rpcs`);
		expect(rows[0]).toEqual({ anon: 0, helpers: 0, rpcs: 5 });
		await expect(db.asAnon((q) => q('select public.armory_project_checkouts($1)', [project]))).rejects.toThrow(/permission denied/);
		await expect(
			db.asUser(ana.id, (q) => q(`select * from public.armory_folder_files($1, 'Drivetrain')`, [project]))
		).rejects.toThrow(/permission denied/);
	});
	test('exactly one overload of every function 0232 writes', async () => {
		const { rows } = await db.sql<{ proname: string; n: number }>(`
			select p.proname, count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname in ('armory_create_project', 'armory_allocate_part_number', 'armory_my_projects',
				'armory_create_file', 'armory_rename_project', 'armory_set_project_archived', 'armory_rename_folder',
				'armory_delete_folder', 'armory_project_checkouts', 'armory_live_name_taken', 'armory_folder_files', 'armory_refuse_checked_out')
			group by p.proname`);
		expect(rows).toHaveLength(12);
		expect(rows.every((r) => r.n === 1)).toBe(true);
	});
});

describe('C1: a project needs no season', () => {
	let seasonless: string;
	test('create accepts a null season with the same signature', async () => {
		seasonless = (await one<{ id: string }>(admin, `select public.armory_create_project('Offseason Lab', null::smallint, $1) as id`, [randomUUID()])).id;
		const mine = (await one<{ p: Array<{ id: string; season: number | null; archived: boolean }> }>(admin, 'select public.armory_my_projects() as p')).p;
		const row = mine.find((p) => p.id === seasonless)!;
		expect(row.season).toBeNull();
		expect(row.archived).toBe(false);
		const created = (await db.sql<{ payload: Record<string, unknown> }>(`select payload from public.armory_change_feed where project_id = $1 and kind = 'project_created'`, [seasonless])).rows;
		expect(created[0].payload.season).toBeNull();
	});
	test('a season that is given is still a year from 2000 to 2100', async () => {
		const e = await fails(admin, `select public.armory_create_project('Old', 1999::smallint, $1)`, [randomUUID()]);
		expect(e.code).toBe('22023');
	});
	test('a student still cannot create one', async () => {
		expect((await fails(ana, `select public.armory_create_project('Mine', null::smallint, $1)`, [randomUUID()])).code).toBe('42501');
	});
	test('part numbers on a seasonless project use the current year in Los Angeles', async () => {
		const { rows } = await db.sql<{ y: number }>(`select extract(year from (now() at time zone 'America/Los_Angeles'))::int as y`);
		const yy = String(rows[0].y % 100).padStart(2, '0');
		const r = await one<{ part_number: string; subsystem_full: boolean }>(admin, 'select * from public.armory_allocate_part_number($1, 3, null, $2)', [seasonless, randomUUID()]);
		expect(r).toEqual({ part_number: `5669-${yy}-0300`, subsystem_full: false });
		// The seasoned project still numbers by its own season.
		const s = await one<{ part_number: string }>(ana, 'select * from public.armory_allocate_part_number($1, 3, null, $2)', [project, randomUUID()]);
		expect(s.part_number).toBe('5669-26-0300');
	});
});

describe('C2: rename a project', () => {
	test('a mentor renames it; one change says from and to', async () => {
		const r = await one<{ ok: boolean }>(admin, `select public.armory_rename_project($1, 'Robot 2027', $2) as ok`, [project, randomUUID()]);
		expect(r.ok).toBe(true);
		const c = await changes('project_renamed');
		expect(c).toHaveLength(1);
		expect(c[0].payload).toMatchObject({ from: 'Robot 2026', to: 'Robot 2027', by: admin.email });
	});
	test('a replayed operation answers once and writes once', async () => {
		const op = randomUUID();
		const a = await one<{ ok: boolean }>(admin, `select public.armory_rename_project($1, 'Robot 2028', $2) as ok`, [project, op]);
		const b = await one<{ ok: boolean }>(admin, `select public.armory_rename_project($1, 'Robot 2028', $2) as ok`, [project, op]);
		expect([a.ok, b.ok]).toEqual([true, true]);
		expect(await changes('project_renamed')).toHaveLength(2);
	});
	test('the same name is no change; a case-only rename is allowed', async () => {
		expect((await one<{ ok: boolean }>(admin, `select public.armory_rename_project($1, 'Robot 2028', $2) as ok`, [project, randomUUID()])).ok).toBe(false);
		expect((await one<{ ok: boolean }>(admin, `select public.armory_rename_project($1, 'ROBOT 2028', $2) as ok`, [project, randomUUID()])).ok).toBe(true);
		expect((await one<{ ok: boolean }>(admin, `select public.armory_rename_project($1, 'Robot 2026', $2) as ok`, [project, randomUUID()])).ok).toBe(true);
	});
	test('every refusal: not a mentor, a taken name, a bad name', async () => {
		expect((await fails(ana, `select public.armory_rename_project($1, 'Ana robot', $2)`, [project, randomUUID()])).code).toBe('42501');
		expect((await fails(lead, `select public.armory_rename_project($1, 'Lead robot', $2)`, [project, randomUUID()])).code).toBe('42501');
		expect((await fails(outsider, `select public.armory_rename_project($1, 'Zed robot', $2)`, [project, randomUUID()])).code).toBe('42501');
		const taken = await fails(admin, `select public.armory_rename_project($1, 'offseason lab', $2)`, [project, randomUUID()]);
		expect(taken.code).toBe('23505');
		expect(JSON.parse(taken.detail!)).toEqual({ existing_name: 'Offseason Lab' });
		expect((await fails(admin, `select public.armory_rename_project($1, 'Bad:name', $2)`, [project, randomUUID()])).code).toBe('22023');
		const { rows } = await db.sql<{ name: string }>('select name from public.armory_projects where id = $1', [project]);
		expect(rows[0].name).toBe('Robot 2026');
	});
});

describe('C3: archive and restore', () => {
	test('a mentor archives; my_projects says so; nothing is deleted', async () => {
		expect((await one<{ ok: boolean }>(admin, 'select public.armory_set_project_archived($1, true, $2) as ok', [project, randomUUID()])).ok).toBe(true);
		const mine = (await one<{ p: Array<{ id: string; archived: boolean; archived_at: string | null }> }>(ana, 'select public.armory_my_projects() as p')).p;
		expect(mine.find((p) => p.id === project)).toMatchObject({ archived: true });
		expect(mine.find((p) => p.id === project)!.archived_at).not.toBeNull();
		expect((await filesOf()).length).toBe(7);
		expect(await changes('project_archived')).toHaveLength(1);
	});
	test('archiving twice is no change; a replay answers the first time', async () => {
		const op = randomUUID();
		expect((await one<{ ok: boolean }>(admin, 'select public.armory_set_project_archived($1, true, $2) as ok', [project, op])).ok).toBe(false);
		expect((await one<{ ok: boolean }>(admin, 'select public.armory_set_project_archived($1, true, $2) as ok', [project, op])).ok).toBe(false);
		expect(await changes('project_archived')).toHaveLength(1);
	});
	test('refusals: a student, a lead, an outsider, a null', async () => {
		for (const u of [ana, lead, outsider]) {
			expect((await fails(u, 'select public.armory_set_project_archived($1, false, $2)', [project, randomUUID()])).code).toBe('42501');
		}
		expect((await fails(admin, 'select public.armory_set_project_archived($1, null, $2)', [project, randomUUID()])).code).toBe('22023');
	});
	test('a mentor restores it', async () => {
		expect((await one<{ ok: boolean }>(admin, 'select public.armory_set_project_archived($1, false, $2) as ok', [project, randomUUID()])).ok).toBe(true);
		const mine = (await one<{ p: Array<{ id: string; archived: boolean; archived_at: string | null }> }>(ana, 'select public.armory_my_projects() as p')).p;
		expect(mine.find((p) => p.id === project)).toMatchObject({ archived: false, archived_at: null });
		expect(await changes('project_restored')).toHaveLength(1);
	});
});

describe('C4: a name held only by a removed file revives it', () => {
	test('the same file id comes back, in the requested folder, with its history', async () => {
		const op = randomUUID();
		const back = await createFile(ben, benDevice, 'Brackets', 'bracket.sldprt', op);
		expect(back.id).toBe(removed);
		const { rows } = await db.sql<{ folder: string; name: string; deleted_at: string | null; current_version_id: string }>(
			'select folder, name, deleted_at, current_version_id from public.armory_files where id = $1',
			[removed]
		);
		expect(rows[0]).toEqual({ folder: 'Brackets', name: 'bracket.sldprt', deleted_at: null, current_version_id: removedFirstVersion });
		expect((await db.sql('select 1 from public.armory_tombstones where file_id = $1', [removed])).rows).toHaveLength(0);
		// The checkout Ana left on the removed file is released, so Ben can check it out.
		expect((await db.sql('select 1 from public.armory_locks where file_id = $1', [removed])).rows).toHaveLength(0);
		const c = await changes('file_revived');
		expect(c).toHaveLength(1);
		expect(c[0].entity_id).toBe(removed);
		expect(c[0].payload).toMatchObject({ folder: 'Brackets', old_folder: 'Old', released_checkout_of: ana.email, by: ben.email });
		// A replay returns the same id and writes nothing more.
		expect((await createFile(ben, benDevice, 'Brackets', 'bracket.sldprt', op)).id).toBe(removed);
		expect(await changes('file_revived')).toHaveLength(1);
	});
	test('versions before and after the removal live on one file id', async () => {
		expect((await lock(ben, removed, benDevice)).ok).toBe(true);
		const after = await commit(ben, removed, removedFirstVersion, hash('2'), benDevice);
		expect(after.advanced).toBe(true);
		const h = (await one<{ h: Array<{ id: string; kind: string; parent: string | null }> }>(ben, 'select public.armory_file_history($1) as h', [removed])).h;
		const versions = h.filter((x) => x.kind === 'version');
		expect(versions.map((v) => v.id).sort()).toEqual([removedFirstVersion, after.version_id].sort());
		expect(versions.find((v) => v.id === after.version_id)!.parent).toBe(removedFirstVersion);
		await release(ben, removed, benDevice);
	});
	test('a live clash still raises 23505 with the existing folder in DETAIL', async () => {
		const e = await fails(ben, 'select public.armory_create_file($1, $2, $3, $4, $5)', [project, 'Anywhere', 'PLATE.sldprt', benDevice, randomUUID()]);
		expect(e.code).toBe('23505');
		expect(JSON.parse(e.detail!)).toMatchObject({ existing_folder: 'Drivetrain', existing_name: 'Plate.SLDPRT', file_id: plate });
	});
	test('a new name still creates a new file', async () => {
		const fresh = await createFile(ben, benDevice, 'Brackets', 'Gusset.SLDPRT');
		expect(fresh.id).not.toBe(removed);
		expect((await changes('file_created')).some((c) => c.entity_id === fresh.id)).toBe(true);
	});
});

describe('C5: rename a folder', () => {
	test("someone else's checkout refuses it with 55006, naming the file", async () => {
		expect((await lock(ben, plate, benDevice)).ok).toBe(true);
		const e = await fails(ana, `select public.armory_rename_folder($1, 'Drivetrain', 'Drive', $2, $3)`, [project, anaDevice, randomUUID()]);
		expect(e.code).toBe('55006');
		expect(JSON.parse(e.detail!)).toEqual({ reason: 'checked_out', names: ['Plate.SLDPRT'], total: 1 });
		expect(e.message).toContain('Plate.SLDPRT');
		await release(ben, plate, benDevice);
	});
	test('the caller on ANOTHER computer counts as someone else', async () => {
		expect((await lock(ana, plate, anaSecond)).ok).toBe(true);
		expect((await fails(ana, `select public.armory_rename_folder($1, 'Drivetrain', 'Drive', $2, $3)`, [project, anaDevice, randomUUID()])).code).toBe('55006');
		await release(ana, plate, anaSecond);
	});
	test('a target that already holds files refuses it, case ignored', async () => {
		const e = await fails(ana, `select public.armory_rename_folder($1, 'Drivetrain/Gearbox', 'intake', $2, $3)`, [project, anaDevice, randomUUID()]);
		expect(e.code).toBe('55006');
		expect(JSON.parse(e.detail!)).toEqual({ reason: 'target_exists', names: ['Roller.SLDPRT'], total: 1 });
	});
	test('bad paths are refused', async () => {
		for (const [from, to] of [
			['', 'X'],
			['Drivetrain', ''],
			['Drivetrain', 'Drivetrain'],
			['Drivetrain', 'Drivetrain/Inner'],
			['Drivetrain', 'Bad:folder']
		]) {
			expect((await fails(ana, 'select public.armory_rename_folder($1, $2, $3, $4, $5)', [project, from, to, anaDevice, randomUUID()])).code).toBe('22023');
		}
		expect((await fails(outsider, `select public.armory_rename_folder($1, 'Drivetrain', 'X', $2, $3)`, [project, anaDevice, randomUUID()])).message).toMatch(/not registered|not a project member/);
	});
	test('the folder and everything under it moves, with the caller holding a file in it; one change', async () => {
		expect((await lock(ana, plate, anaDevice)).ok).toBe(true);
		const op = randomUUID();
		const moved = await one<{ n: number }>(ana, `select public.armory_rename_folder($1, 'Drivetrain', 'Drive Base', $2, $3) as n`, [project, anaDevice, op]);
		expect(moved.n).toBe(3);
		const folders = Object.fromEntries((await filesOf()).filter((f) => !f.deleted).map((f) => [f.name, f.folder]));
		expect(folders['Plate.SLDPRT']).toBe('Drive Base');
		expect(folders['Spacer.SLDPRT']).toBe('Drive Base');
		expect(folders['Shaft.SLDPRT']).toBe('Drive Base/Gearbox');
		expect(folders['Roller.SLDPRT']).toBe('Intake');
		const c = await changes('folder_renamed');
		expect(c).toHaveLength(1);
		expect(c[0].payload).toMatchObject({ from: 'Drivetrain', to: 'Drive Base', files: 3 });
		// Replay: same answer, nothing more.
		expect((await one<{ n: number }>(ana, `select public.armory_rename_folder($1, 'Drivetrain', 'Drive Base', $2, $3) as n`, [project, anaDevice, op])).n).toBe(3);
		expect(await changes('folder_renamed')).toHaveLength(1);
		await release(ana, plate, anaDevice);
	});
	test('an empty folder moves nothing and writes no change', async () => {
		expect((await one<{ n: number }>(ana, `select public.armory_rename_folder($1, 'Nowhere', 'Somewhere', $2, $3) as n`, [project, anaDevice, randomUUID()])).n).toBe(0);
		expect(await changes('folder_renamed')).toHaveLength(1);
	});
});

describe('C6: delete a folder', () => {
	test("someone else's checkout refuses it", async () => {
		const hook = (await filesOf()).find((f) => f.name === 'Hook.SLDPRT')!.id;
		expect((await lock(lead, hook, leadDevice)).ok).toBe(true);
		const e = await fails(ben, `select public.armory_delete_folder($1, 'Climber', $2, $3)`, [project, benDevice, randomUUID()]);
		expect(e.code).toBe('55006');
		expect(JSON.parse(e.detail!)).toEqual({ reason: 'checked_out', names: ['Hook.SLDPRT'], total: 1 });
		await release(lead, hook, leadDevice);
	});
	test('it tombstones every live file under it; one change; history kept', async () => {
		const op = randomUUID();
		const n = await one<{ n: number }>(ben, `select public.armory_delete_folder($1, 'Climber', $2, $3) as n`, [project, benDevice, op]);
		expect(n.n).toBe(1);
		const hook = (await filesOf()).find((f) => f.name === 'Hook.SLDPRT')!;
		expect(hook.deleted).toBe(true);
		const h = (await one<{ h: Array<{ kind: string }> }>(ben, 'select public.armory_file_history($1) as h', [hook.id])).h;
		expect(h.map((x) => x.kind)).toEqual(['tombstone']);
		expect((await changes('folder_deleted'))[0].payload).toMatchObject({ folder: 'Climber', files: 1, by: ben.email });
		expect((await one<{ n: number }>(ben, `select public.armory_delete_folder($1, 'Climber', $2, $3) as n`, [project, benDevice, op])).n).toBe(1);
		expect(await changes('folder_deleted')).toHaveLength(1);
		// And the name can come back.
		expect((await createFile(ben, benDevice, 'Climber', 'Hook.SLDPRT')).id).toBe(hook.id);
	});
	test('a bad folder is refused', async () => {
		expect((await fails(ben, `select public.armory_delete_folder($1, '', $2, $3)`, [project, benDevice, randomUUID()])).code).toBe('22023');
	});
});

describe('C7: the checkout list', () => {
	test('members see every live checkout with a name and a computer', async () => {
		const roller = (await filesOf()).find((f) => f.name === 'Roller.SLDPRT')!.id;
		expect((await lock(ben, roller, benDevice)).ok).toBe(true);
		expect((await lock(lead, plate, leadDevice)).ok).toBe(true);
		const list = (await one<{ c: Array<Record<string, unknown>> }>(ana, 'select public.armory_project_checkouts($1) as c', [project])).c;
		expect(list.map((x) => x.name)).toEqual(['Roller.SLDPRT', 'Plate.SLDPRT']);
		expect(list[0]).toMatchObject({ file_id: roller, folder: 'Intake', holder_email: ben.email, holder_name: 'Benny', device_name: 'Ben laptop' });
		expect(list[1]).toMatchObject({ holder_email: lead.email, holder_name: 'Lea Diaz', device_name: 'Lead PC' });
		expect(typeof list[0].since).toBe('string');
		expect(Object.keys(list[0]).sort()).toEqual(['device_name', 'file_id', 'folder', 'holder_email', 'holder_name', 'name', 'since']);
	});
	test('a taken-back checkout leaves the list (C8 is unchanged)', async () => {
		expect((await one<{ ok: boolean }>(lead, 'select public.armory_break_lock($1, $2, $3) as ok', [(await filesOf()).find((f) => f.name === 'Roller.SLDPRT')!.id, leadDevice, randomUUID()])).ok).toBe(true);
		const list = (await one<{ c: Array<{ name: string }> }>(ana, 'select public.armory_project_checkouts($1) as c', [project])).c;
		expect(list.map((x) => x.name)).toEqual(['Plate.SLDPRT']);
	});
	test('a non-member is refused 42501', async () => {
		expect((await fails(outsider, 'select public.armory_project_checkouts($1)', [project])).code).toBe('42501');
	});
});
