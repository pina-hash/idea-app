// tests/db/armory-proposed.test.ts
//
// THE ARMORY SCHEMA (MIGRATION 0231), PROVEN ON THE WHOLE CHAIN.
//
// supabase/migrations/0231_armory.sql is applied through the loader
// (tests/db/armory-proposed.ts) on top of every other committed migration. What is
// held here, and why each is a silent regression rather than a visible one:
//
//   - NO MIGRATION OUTSIDE THE ARMORY SERIES (0231 to 0235) NAMES armory_,
//     so the series is the one place the schema lives.
//   - NO NAME COLLIDES. The file uses `create ... if not exists`, so a
//     collision with an existing object would apply cleanly and leave the OLD
//     object in place; only a catalog read before the apply can see that.
//   - THE GRANTS REACH ONLY armory_ OBJECTS. Every non-armory function,
//     relation, policy and constraint fingerprints identically before and
//     after, and a table revoked from authenticated elsewhere (0204's
//     student_app_plays) stays unreadable.
//   - IDENTITY COMES ONLY FROM current_user_email(). A caller-set setting
//     changes nothing; an empty identity is refused.
//   - THE LOCK RACE and THE STALE-PARENT COMMIT behave as idea-armory's own
//     server tests say (LockTests / SameParentCommitRace).
//   - THE CONNECT CODES belong to service_role alone.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { catalogFingerprint, pasteTrap } from './chain-0230';
import {
	ALL_MIGRATIONS,
	ARMORY_MIGRATIONS,
	MIGRATIONS_DIR,
	PRE_ARMORY,
	PROPOSED_ENTRY,
	PROPOSED_NAME,
	PROPOSED_SQL,
	V3_NAME
} from './armory-proposed';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const key = (h: string) => `blobs/sha256/${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`;

let db: TestDb;
let before: string;
let collisions: string[];
let admin: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let outsider: SeededUser;
let project: string;
let fileId: string;
let anaDevice: string;
let benDevice: string;

async function rpc<T = unknown>(user: SeededUser, sql: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q(sql, params);
		return rows[0] as T;
	});
}

beforeAll(async () => {
	db = await startTestDb(PRE_ARMORY);
	const { rows } = await db.sql<{ name: string }>(`
		select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname like 'armory%'
		union all select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname like 'armory%'
		union all select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
		where n.nspname = 'public' and t.typname like 'armory%'
		union all select polname from pg_policy where polname like 'armory%'`);
	collisions = rows.map((r) => r.name);
	before = await catalogFingerprint(db);
	await db.sql(PROPOSED_SQL);

	admin = await createUser(db, 'apina@boscotech.edu', 'Mr. Pina');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben');
	outsider = await createUser(db, 'zed@boscotech.net', 'Zed');

	project = (await rpc<{ id: string }>(admin, `select public.armory_create_project('Robot 2026', 2026::smallint, $1) as id`, [randomUUID()])).id;
	for (const [who, role] of [[ana.email, 'student'], [ben.email, 'student']]) {
		await rpc(admin, `select public.armory_add_member($1, $2, $3::public.armory_member_role, $4)`, [project, who, role, randomUUID()]);
	}
	anaDevice = (await rpc<{ id: string }>(ana, `select public.armory_register_device('Lab PC 3', $1) as id`, [randomUUID()])).id;
	benDevice = (await rpc<{ id: string }>(ben, `select public.armory_register_device('Ben laptop', $1) as id`, [randomUUID()])).id;
	fileId = (await rpc<{ id: string }>(ana, `select public.armory_create_file($1, 'Drivetrain', 'Plate.SLDPRT', $2, $3) as id`, [project, anaDevice, randomUUID()])).id;
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('the Armory schema is the Armory series (0231 to 0236) and nothing else names it', () => {
	test('0231_armory.sql exists in supabase/migrations', () => {
		expect(PROPOSED_NAME).toBe('0231_armory.sql');
		expect(PROPOSED_ENTRY).toBe('0231_armory.sql');
		expect(ALL_MIGRATIONS).toContain('0231_armory.sql');
	});
	test('no migration but the Armory series names armory_ in its filename or body', () => {
		expect(ARMORY_MIGRATIONS).toEqual(['0231_armory.sql', '0232_armory_v2.sql', V3_NAME, '0234_armory_break_locks.sql', '0235_armory_app_feedback_v2.sql', '0236_armory_v033.sql']);
		expect(ALL_MIGRATIONS).toContain('0234_armory_break_locks.sql');
		expect(V3_NAME).toMatch(/^0233_/);
		const others = ALL_MIGRATIONS.filter((f) => !ARMORY_MIGRATIONS.includes(f));
		const named = others.filter((f) => /armory/i.test(f));
		const mentioning = others.filter((f) => /armory_/i.test(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')));
		expect(named).toEqual([]);
		expect(mentioning).toEqual([]);
		// Positive control: the same scan does see 0231's names.
		expect(/armory_/.test(PROPOSED_SQL)).toBe(true);
	});
});

describe('the file applies the way the apply tool and the SQL editor need', () => {
	test('no name it creates exists on the whole chain before it', () => {
		expect(collisions).toEqual([]);
	});
	test('the apply tool would send it: no refusals, no top-level DML', () => {
		const scan = scanFile(PROPOSED_SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		// Positive control: the scanner refuses the line this file deliberately dropped.
		expect(scanFile('create extension if not exists pgcrypto;').findings).toHaveLength(1);
	});
	test('the paste trap is clean', () => {
		expect(pasteTrap(PROPOSED_SQL)).toEqual([]);
		expect(pasteTrap('select 1; -- costs $5\n')).toHaveLength(1);
	});
	test('re-applying is a no-op on the catalog', async () => {
		const once = await catalogFingerprint(db);
		await db.sql(PROPOSED_SQL);
		expect(await catalogFingerprint(db)).toBe(once);
	});
});

describe('the grants reach only armory_ objects', () => {
	test('every non-armory object fingerprints identically before and after', async () => {
		const after = await catalogFingerprint(db);
		// 9b re-creates ONE existing object, the short-link guard, to reserve
		// `armory`; it is set aside here and asserted on its own below.
		const strip = (s: string) =>
			s.split('\n').filter((l) => !/armory_/.test(l) && !/_app_short_link_reserved\(text\)/.test(l)).join('\n');
		expect(strip(after)).toBe(strip(before));
		const guard = (s: string) => s.split('\n').filter((l) => /_app_short_link_reserved\(text\)/.test(l));
		expect(guard(before)).toHaveLength(1);
		expect(guard(after)).toHaveLength(1);
		expect(guard(after)[0].replace(/src=\w+/, '')).toBe(guard(before)[0].replace(/src=\w+/, '')); // same ACL, only the body moved
		// Positive control: the armory lines really are new.
		expect(after.split('\n').filter((l) => /armory_/.test(l)).length).toBeGreaterThan(50);
	});
	test('an unrelated table revoked from authenticated stays unreadable', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_table_privilege('authenticated', 'public.student_app_plays', 'select') as ok`
		);
		expect(rows[0].ok).toBe(false);
		await expect(db.asUser(ana.id, (q) => q('select count(*) from public.student_app_plays'))).rejects.toThrow(/permission denied/);
		// Positive control on the same connection shape: an armory table IS readable.
		const seen = await db.asUser(ana.id, (q) => q('select count(*)::int as n from public.armory_files'));
		expect(seen.rows[0].n).toBe(1);
	});
	test('anon executes no armory function and reads no armory table', async () => {
		const { rows } = await db.sql<{ fns: number; rels: number; total: number }>(`
			select
				(select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname like 'armory\\_%' and has_function_privilege('anon', p.oid, 'execute')) as fns,
				(select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
				 where n.nspname = 'public' and c.relname like 'armory\\_%' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')) as rels,
				(select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname like 'armory\\_%') as total`);
		expect(rows[0]).toEqual({ fns: 0, rels: 0, total: 35 });
		await expect(db.asAnon((q) => q('select public.armory_my_projects()'))).rejects.toThrow(/permission denied/);
	});
	test('the internal helpers are closed to authenticated; the RPCs are open', async () => {
		await expect(
			db.asUser(outsider.id, (q) => q(`select public.armory_add_change($1, 'forged', $1, '{}')`, [project]))
		).rejects.toThrow(/permission denied/);
		await expect(
			db.asUser(outsider.id, (q) => q(`select public.armory_remember($1, 'x', '{}')`, [randomUUID()]))
		).rejects.toThrow(/permission denied/);
		const mine = await rpc<{ p: unknown[] }>(outsider, 'select public.armory_my_projects() as p');
		expect(mine.p).toEqual([]);
	});
	test('a non-member reads none of the project rows; a member reads them', async () => {
		const count = (u: SeededUser) =>
			db.asUser(u.id, async (q) => (await q('select count(*)::int as n from public.armory_projects')).rows[0].n);
		expect(await count(outsider)).toBe(0);
		expect(await count(ana)).toBe(1);
	});
});

describe('identity comes only from current_user_email()', () => {
	test('a registered device belongs to the signed-in caller', async () => {
		const { rows } = await db.sql<{ owner_email: string }>('select owner_email from public.armory_devices where id = $1', [anaDevice]);
		expect(rows[0].owner_email).toBe(ana.email);
	});
	test('a caller-set armory.test_email changes nothing', async () => {
		await expect(
			db.asUser(randomUUID(), async (q) => {
				await q(`select set_config('armory.test_email', $1, false)`, [ana.email]);
				return q(`select public.armory_register_device('forged', $1)`, [randomUUID()]);
			})
		).rejects.toThrow(/current user email is unavailable/);
		const mine = await db.asUser(ben.id, async (q) => {
			await q(`select set_config('armory.test_email', $1, false)`, [admin.email]);
			return (await q('select public.armory_current_email() as e')).rows[0].e;
		});
		expect(mine).toBe(ben.email);
	});
	test('only an admin creates a project, and the student is refused 42501', async () => {
		await expect(
			rpc(ana, `select public.armory_create_project('Mine', 2026::smallint, $1)`, [randomUUID()])
		).rejects.toMatchObject({ code: '42501' });
	});
});

describe('the lock race and the stale-parent commit', () => {
	test('two people take one lock at once: exactly one gets it', async () => {
		const take = (u: SeededUser, device: string) =>
			db.asUser(u.id, async (q) =>
				(await q('select public.armory_acquire_lock($1, $2, $3) as ok', [fileId, device, randomUUID()])).rows[0].ok as boolean
			);
		const answers = await Promise.all([take(ana, anaDevice), take(ben, benDevice)]);
		expect(answers.filter(Boolean)).toHaveLength(1);
		const { rows } = await db.sql<{ holder_email: string }>('select holder_email from public.armory_locks where file_id = $1', [fileId]);
		expect([ana.email, ben.email]).toContain(rows[0].holder_email);
		// Whoever lost, make Ana the holder for the commits below.
		if (rows[0].holder_email !== ana.email) {
			await rpc(ben, 'select public.armory_release_lock($1, $2, $3)', [fileId, benDevice, randomUUID()]);
			expect((await rpc<{ ok: boolean }>(ana, 'select public.armory_acquire_lock($1, $2, $3) as ok', [fileId, anaDevice, randomUUID()])).ok).toBe(true);
		}
	});
	test('two commits on one parent: one advances, the other is kept as a side version', async () => {
		const first = await rpc<{ version_id: string; advanced: boolean }>(
			ana, 'select * from public.armory_commit_version($1, null, $2, $3, 10, $4, $5)', [fileId, key(HASH_A), HASH_A, anaDevice, randomUUID()]
		);
		expect(first.advanced).toBe(true);
		const commit = (h: string) =>
			rpc<{ version_id: string; advanced: boolean }>(
				ana, 'select * from public.armory_commit_version($1, $2, $3, $4, 20, $5, $6)', [fileId, first.version_id, key(h), h, anaDevice, randomUUID()]
			);
		const results = await Promise.all([commit(HASH_B), commit(HASH_C)]);
		expect(results.filter((r) => r.advanced)).toHaveLength(1);
		const { rows } = await db.sql<{ reason: string }>('select reason from public.armory_side_versions where file_id = $1', [fileId]);
		expect(rows.map((r) => r.reason)).toEqual(['stale parent']);
	});
	test('a commit without the lock is kept as a side version, never advanced', async () => {
		const r = await rpc<{ advanced: boolean }>(
			ben, 'select * from public.armory_commit_version($1, null, $2, $3, 5, $4, $5)', [fileId, key(HASH_C), HASH_C, benDevice, randomUUID()]
		);
		expect(r.advanced).toBe(false);
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.armory_side_versions where file_id = $1 and reason = 'caller does not hold lock'`, [fileId]
		);
		expect(rows[0].n).toBe(1);
	});
	test('a replayed operation id returns the first answer and writes once', async () => {
		const op = randomUUID();
		const a = await rpc<{ id: string }>(ana, `select public.armory_register_device('Replay PC', $1) as id`, [op]);
		const b = await rpc<{ id: string }>(ana, `select public.armory_register_device('Replay PC', $1) as id`, [op]);
		expect(b.id).toBe(a.id);
	});
});

describe('the connect codes are the server role alone', () => {
	test('authenticated and anon are refused; service_role inserts, reads and consumes', async () => {
		await expect(db.asUser(ana.id, (q) => q('select * from public.armory_connect_codes'))).rejects.toThrow(/permission denied/);
		await expect(db.asAnon((q) => q('select * from public.armory_connect_codes'))).rejects.toThrow(/permission denied/);
		const hash = 'd'.repeat(64);
		await db.asServiceRole((q) =>
			q(
				`insert into public.armory_connect_codes (code_hash, user_id, email, challenge, state, device_name, expires_at)
				 values ($1, $2, $3, $4, 'state_1', 'Lab PC 3', now() + interval '2 minutes')`,
				[hash, ana.id, ana.email, 'A'.repeat(43)]
			)
		);
		const consumed = await db.asServiceRole((q) =>
			q('update public.armory_connect_codes set used = true where code_hash = $1 and not used returning email', [hash])
		);
		expect(consumed.rows).toEqual([{ email: ana.email }]);
		const again = await db.asServiceRole((q) =>
			q('update public.armory_connect_codes set used = true where code_hash = $1 and not used returning email', [hash])
		);
		expect(again.rows).toEqual([]);
		await expect(db.asServiceRole((q) => q('delete from public.armory_connect_codes'))).rejects.toThrow(/permission denied/);
	});
	test('a malformed code row is refused by the table itself', async () => {
		await expect(
			db.asServiceRole((q) =>
				q(
					`insert into public.armory_connect_codes (code_hash, user_id, email, challenge, state, device_name, expires_at)
					 values ('not-a-hash', $1, $2, $3, 's', 'd', now())`,
					[ana.id, ana.email, 'A'.repeat(43)]
				)
			)
		).rejects.toThrow(/check constraint/);
	});
});

describe('the /armory route is reserved as a short-link slug', () => {
	test('armory is reserved and the open-lab control is not', async () => {
		const { rows } = await db.sql<{ a: boolean; o: boolean }>(
			`select public._app_short_link_reserved('armory') as a, public._app_short_link_reserved('open-lab') as o`
		);
		expect(rows[0]).toEqual({ a: true, o: false });
	});
});

describe('realtime', () => {
	test('armory_change_feed joins supabase_realtime', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'armory_change_feed'`
		);
		expect(rows[0].n).toBe(1);
	});
});
