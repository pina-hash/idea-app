// tests/db/migration-0233-apply.test.ts
//
// 0233 AS A FILE: the properties that belong to the migration rather than to
// any one of its six parts. Each part's own suite applies the whole file and
// asserts its own objects; what none of them can see, and what would fail
// SILENTLY, is this:
//
//   1. THE PASTE TRAP. A dollar sign in a comment breaks the Supabase editor's
//      client-side statement splitter, and the file is assembled from six
//      branches' parts, so one stray comment anywhere breaks the whole paste.
//   2. THE APPLY TOOL'S OWN SCAN, over the WHOLE file. migrate.yml applies it
//      with tools/apply-migration.mjs, which refuses top-level DML and
//      destructive DDL. One part's own suite scanned only its part.
//   3. THE ASSEMBLY. Every part is there exactly once, in the contract's order,
//      and the first object the file creates is a table no earlier migration
//      made, because the deploy probe derives 0233's applied-state check from
//      the first object.
//   4. THE ANON SURFACE DOES NOT GROW, over the whole schema, and the client
//      table privileges grow by exactly the two Armory report tables a site
//      admin reads directly.
//   5. A SECOND PASTE CHANGES NO CATALOG OBJECT.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type TestDb } from './harness';
import { PRE_0233, PRE_0233_COUNT, SQL_0233, catalogFingerprint, part0233, pasteTrap } from './chain-0233';

/** Written out here rather than read from the file: a test whose expected value comes from the file cannot fail. */
const PART_ORDER = ['armory-reports', 'armory-core', 'feedback-edits', 'student-overview', 'quick-posts', 'foundry-major'];
const NEW_TABLES = [
	'armory_app_feedback',
	'armory_app_incidents',
	'armory_purged_projects',
	'armory_orphaned_blobs',
	'app_feedback_edits',
	'classroom_quick_post_files'
];
/** The only client table privileges 0233 adds: a site admin reads the two report tables directly (RLS is_admin()). */
const NEW_TABLE_GRANTS = ['authenticated armory_app_feedback select', 'authenticated armory_app_incidents select'];

let db: TestDb;
let anonFunctionsBefore: string[];
let tableGrantsBefore: string[];
let pre0233Fingerprint: string;

async function anonFunctions(target: TestDb): Promise<string[]> {
	const { rows } = await target.sql<{ sig: string }>(
		`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`
	);
	return rows.map((r) => r.sig);
}
async function tableGrants(target: TestDb): Promise<string[]> {
	const { rows } = await target.sql<{ g: string }>(
		`select r.role || ' ' || c.relname || ' ' || p.priv as g
		 from pg_class c join pg_namespace n on n.oid = c.relnamespace
		 cross join (values ('anon'), ('authenticated')) r(role)
		 cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p(priv)
		 where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
		   and has_table_privilege(r.role, c.oid, p.priv)
		 order by 1`
	);
	return rows.map((r) => r.g);
}
async function exists(target: TestDb, rel: string): Promise<boolean> {
	return (await target.sql(`select to_regclass($1) is not null as e`, [`public.${rel}`])).rows[0].e;
}

beforeAll(async () => {
	db = await startTestDb(PRE_0233);
	anonFunctionsBefore = await anonFunctions(db);
	tableGrantsBefore = await tableGrants(db);
	pre0233Fingerprint = await catalogFingerprint(db);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the file', () => {
	test('the chain under it is the whole tree short of 0233', () => {
		expect(PRE_0233_COUNT).toBeGreaterThan(220);
		expect(PRE_0233[PRE_0233.length - 1]).toMatch(/^0232_/);
	});

	test('it carries no paste trap, and the check finds one when one is planted', () => {
		expect(pasteTrap(SQL_0233)).toEqual([]);
		expect(pasteTrap('select 1; -- a $tag$ in a comment\n')).toHaveLength(1);
		expect(pasteTrap('select 1; -- a lone $ in a comment\n')).toHaveLength(1);
	});

	test('the apply tool would send it whole: no refusal and no top-level DML, against a planted insert', () => {
		const scan = scanFile(SQL_0233);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scan.statements).toBeGreaterThan(100);
		expect(scanFile('insert into public.armory_app_feedback (email) values (\'x\');').findings).toHaveLength(1);
		expect(scanFile('drop table public.app_feedback_edits;').findings).toHaveLength(1);
	});

	test('every part is there exactly once, in the contract order', () => {
		const at = PART_ORDER.map((k) => {
			expect(part0233(k), k).not.toBeNull();
			expect(SQL_0233.split(`-- ===== PART ${k} BEGIN =====`).length - 1, k).toBe(1);
			expect(SQL_0233.split(`-- ===== PART ${k} END =====`).length - 1, k).toBe(1);
			return SQL_0233.indexOf(`-- ===== PART ${k} BEGIN =====`);
		});
		expect([...at].sort((a, b) => a - b)).toEqual(at);
		expect(SQL_0233.split('-- ===== PART ').length - 1).toBe(PART_ORDER.length * 2);
	});

	test('the first object it creates is the armory_app_feedback table, which no earlier migration made', () => {
		const code = SQL_0233.split('\n')
			.filter((l) => !l.trimStart().startsWith('--'))
			.join('\n');
		const first = code.match(/create\s+(?:table|function|or replace function|index|unique index|type|view)\s+(?:if not exists\s+)?([\w.]+)/i);
		expect(first?.[1]).toBe('public.armory_app_feedback');
	});
});

// ===========================================================================
describe('the apply', () => {
	beforeAll(async () => {
		for (const t of NEW_TABLES) expect(await exists(db, t), t).toBe(false);
		await db.sql(SQL_0233);
	});

	test('it lands, and the fingerprint moved (the positive control for every comparison below)', async () => {
		for (const t of NEW_TABLES) expect(await exists(db, t), t).toBe(true);
		expect(await catalogFingerprint(db)).not.toBe(pre0233Fingerprint);
	});

	test('anon can execute exactly the functions it could before, over the whole schema', async () => {
		expect(anonFunctionsBefore.length).toBeGreaterThan(5);
		expect(await anonFunctions(db)).toEqual(anonFunctionsBefore);
	});

	test('the client table privileges grow by exactly the two report tables an admin reads directly', async () => {
		const after = await tableGrants(db);
		expect(after.filter((g) => !tableGrantsBefore.includes(g))).toEqual(NEW_TABLE_GRANTS);
		expect(tableGrantsBefore.filter((g) => !after.includes(g))).toEqual([]);
	});

	test('the instrument sees an anon grant when there is one (positive control)', async () => {
		await db.sql(`grant execute on function public.armory_team_status(uuid) to anon`);
		expect(await anonFunctions(db)).toContain('armory_team_status(uuid)');
		await db.sql(`revoke execute on function public.armory_team_status(uuid) from anon`);
		expect(await anonFunctions(db)).toEqual(anonFunctionsBefore);
	});

	test('a second paste changes no catalog object, and the fingerprint does see a change (control)', async () => {
		const once = await catalogFingerprint(db);
		await db.sql(SQL_0233);
		expect(await catalogFingerprint(db)).toBe(once);
		await db.sql(`create function public.zz_fingerprint_probe() returns int language sql as 'select 1'`);
		expect(await catalogFingerprint(db)).not.toBe(once);
		await db.sql(`drop function public.zz_fingerprint_probe()`);
		expect(await catalogFingerprint(db)).toBe(once);
	});
});
