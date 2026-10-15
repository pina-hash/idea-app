// tests/db/cert-migrations-apply.test.ts
//
// THE FIVE CERTIFICATION FILES AS FILES (0260 to 0264), modeled on
// migration-0230-apply: the properties that belong to a migration rather than
// to any feature in it. What would fail SILENTLY:
//
//   1. THE PASTE TRAP. A dollar sign in a comment breaks the Supabase editor's
//      statement splitter and nothing local reports it. Checked against planted
//      controls.
//   2. THE APPLY TOOL'S OWN SCAN. tools/apply-migration.mjs refuses top-level
//      DML and destructive DDL; a seed written as a bare insert fails the
//      production apply on the day it ships. The real scanner runs over each
//      real file, with a planted insert and a planted drop as controls.
//   3. THE FIRST OBJECT IS A NEW cert_ TABLE, which is what tools/idea-status.py
//      derives the deploy probe from.
//   4. THE UNDO NAMES EVERYTHING. Every table and every function a file adds to
//      the catalog appears in its header as a drop.
//   5. THE ANON SURFACE GROWS BY EXACTLY cert_verify(text), and the table
//      privileges anon and authenticated hold do not move at all, read off the
//      whole schema before and after.
//   6. EVERY SELF-CHECK BITES, AND A REFUSED APPLY LEAVES NOTHING BEHIND: one
//      mutant per file applied in memory must raise that file's own sentence
//      with the catalog unchanged.
//   7. A SECOND PASTE OF ALL FIVE CHANGES NO CATALOG OBJECT.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type TestDb } from './harness';
import { CERT_FILES, PRE_CERT, certSql, catalogFingerprint, pasteTrap, refusal } from './cert-chain';

/** Written out rather than read from the files: the first object each file creates. */
const FIRST_TABLE: Record<string, string> = {
	'0260': 'cert_settings',
	'0261': 'cert_attempts',
	'0262': 'cert_sittings',
	'0263': 'cert_awards',
	'0264': 'cert_sync_log'
};

/** One permissive mutant per file: the gate it opens, and the sentence the self-check must answer with. */
const MUTANTS: Record<string, [string, string, string, RegExp][]> = {
	'0260': [[
		'an anon grant left on a client function',
		'revoke all on function public.cert_catalog() from public, anon, authenticated, service_role;',
		'revoke all on function public.cert_catalog() from public, authenticated, service_role;',
		/0260 self-check refused: .*cert_catalog\(\) is executable by anon/
	]],
	'0261': [[
		'an anon grant left on the student start',
		'revoke all on function public.cert_start(text) from public, anon, authenticated, service_role;',
		'revoke all on function public.cert_start(text) from public, authenticated, service_role;',
		/0261 self-check refused: .*cert_start\(text\) is executable by anon/
	]],
	'0262': [[
		'an anon grant left on the sitting post',
		'revoke all on function public.cert_sitting_post(jsonb) from public, anon, authenticated, service_role;',
		'revoke all on function public.cert_sitting_post(jsonb) from public, authenticated, service_role;',
		/0262 self-check refused: .*cert_sitting_post\(jsonb\) is executable by anon/
	]],
	'0263': [
		[
			'an anon grant left on the award commit',
			'revoke all on function public.cert_award_commit(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;',
			'revoke all on function public.cert_award_commit(uuid, text, text, text, jsonb) from public, authenticated, service_role;',
			/0263 self-check refused: .*cert_award_commit\(uuid, text, text, text, jsonb\) is executable by anon/
		],
		[
			'row level security left off the awards table',
			'alter table public.cert_awards enable row level security;',
			'alter table public.cert_awards disable row level security;',
			/0263 self-check refused: .*cert_awards has no row level security/
		]
	],
	'0264': [[
		'an anon grant left on the dormant sweep',
		'revoke all on function public.cert_sweep_dormant() from public, anon, authenticated, service_role;',
		'revoke all on function public.cert_sweep_dormant() from public, authenticated, service_role;',
		/0264 self-check refused: .*cert_sweep_dormant\(\) is executable by anon/
	]]
};

let db: TestDb;
let anonFunctionsBefore: string[];
let tableGrantsBefore: string[];

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
async function publicFunctions(target: TestDb): Promise<string[]> {
	const { rows } = await target.sql<{ sig: string }>(
		`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
	);
	return rows.map((r) => r.sig);
}
async function publicTables(target: TestDb): Promise<string[]> {
	const { rows } = await target.sql<{ t: string }>(
		`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`
	);
	return rows.map((r) => r.t);
}
async function exists(target: TestDb, rel: string): Promise<boolean> {
	return (await target.sql(`select to_regclass($1) is not null as e`, [`public.${rel}`])).rows[0].e;
}
/** The catalog's spelling of a signature folded to the file's: no spaces, timestamptz, no schema. */
function fold(sig: string): string {
	return sig.replace(/timestamp with time zone/g, 'timestamptz').replace(/public\./g, '').replace(/\s+/g, '');
}
/** The first create statement of a file, comments stripped. */
function firstCreate(sql: string): string {
	const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
	const m = code.match(/create\s+(?:table if not exists|or replace function|function|table)\s+public\.(\w+)/);
	return m ? m[1] : '';
}

beforeAll(async () => {
	db = await startTestDb(PRE_CERT);
	anonFunctionsBefore = await anonFunctions(db);
	tableGrantsBefore = await tableGrants(db);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the files', () => {
	test('there are five, numbered 0260 to 0264, and the checks here find a planted trap, a planted insert and a planted drop', () => {
		expect(CERT_FILES.map((f) => f.slice(0, 4))).toEqual(['0260', '0261', '0262', '0263', '0264']);
		expect(pasteTrap('select 1; -- a $tag$ in a comment\n')).toHaveLength(1);
		expect(pasteTrap('select 1; -- a lone $ in a comment\n')).toHaveLength(1);
		expect(scanFile('insert into public.cert_settings (id) values (true);').findings).toHaveLength(1);
		expect(scanFile('update public.cert_settings set dormancy_days = 1;').findings).toHaveLength(1);
		expect(scanFile('drop table public.cert_awards;').findings).toHaveLength(1);
	});

	test.each(CERT_FILES.map((f) => [f] as [string]))('%s carries no paste trap, no top-level DML, no destructive DDL, and opens with its new cert_ table', (file) => {
		const sql = certSql(file);
		expect(pasteTrap(sql)).toEqual([]);
		const scan = scanFile(sql);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scan.statements).toBeGreaterThan(20);
		expect(firstCreate(sql)).toBe(FIRST_TABLE[file.slice(0, 4)]);
		expect(sql).toContain('UNDO');
		expect(sql).toContain('DEPLOY ORDER: none');
		expect(sql).not.toMatch(/—/);
		expect(sql).not.toMatch(/\b(colour|behaviour|authorisation|licence)\b/i);
	});
});

// ===========================================================================
describe('each file in order: the self-check bites, a refused apply leaves nothing behind, the apply lands and the undo names everything', () => {
	for (const file of CERT_FILES) {
		const number = file.slice(0, 4);
		describe(file, () => {
			let before: string;
			let functionsBefore: string[];
			let tablesBefore: string[];
			const sql = certSql(file);

			beforeAll(async () => {
				before = await catalogFingerprint(db);
				functionsBefore = await publicFunctions(db);
				tablesBefore = await publicTables(db);
			});

			test.each(MUTANTS[number])('%s', async (_name, from, to, sentence) => {
				expect(sql.split(from).length - 1, 'the mutation site must occur exactly once').toBe(1);
				const message = await refusal(() => db.sql(sql.replace(from, to)));
				expect(message).toMatch(sentence);
				expect(await exists(db, FIRST_TABLE[number])).toBe(false);
				expect(await catalogFingerprint(db)).toBe(before);
			});

			test('the apply lands and moves the fingerprint, and every new table and function is in the undo', async () => {
				await db.sql(sql);
				expect(await exists(db, FIRST_TABLE[number])).toBe(true);
				expect(await catalogFingerprint(db)).not.toBe(before);
				const newTables = (await publicTables(db)).filter((t) => !tablesBefore.includes(t));
				const newFunctions = (await publicFunctions(db)).filter((f) => !functionsBefore.includes(f));
				expect(newTables.length).toBeGreaterThan(0);
				expect(newFunctions.length).toBeGreaterThan(0);
				expect(newTables.every((t) => t.startsWith('cert_'))).toBe(true);
				expect(newFunctions.every((f) => /^_?cert_/.test(f))).toBe(true);
				const undo = fold(sql.slice(0, sql.indexOf('-- ===== PART A BEGIN =====')));
				for (const t of newTables) expect(undo, t).toContain(`droptableifexists${t};`);
				for (const f of newFunctions) expect(undo, f).toContain(`dropfunctionifexists${fold(f)};`);
			});
		});
	}
});

// ===========================================================================
describe('after all five', () => {
	test('anon can execute exactly what it could before plus cert_verify(text), over the whole schema', async () => {
		expect(anonFunctionsBefore.length).toBeGreaterThan(5);
		expect(anonFunctionsBefore).not.toContain('cert_verify(text)');
		expect(await anonFunctions(db)).toEqual([...anonFunctionsBefore, 'cert_verify(text)'].sort());
	});

	test('anon and authenticated hold exactly the table privileges they held before, over the whole schema', async () => {
		expect(tableGrantsBefore).toContain('authenticated app_feedback insert');
		expect(await tableGrants(db)).toEqual(tableGrantsBefore);
	});

	test('the instrument sees a grant when there is one (positive control), and the grant is taken back', async () => {
		await db.sql(`grant execute on function public.cert_catalog() to anon`);
		expect(await anonFunctions(db)).toContain('cert_catalog()');
		await db.sql(`revoke execute on function public.cert_catalog() from anon`);
		expect(await anonFunctions(db)).toEqual([...anonFunctionsBefore, 'cert_verify(text)'].sort());
	});

	test('a second paste of all five changes no catalog object, and the fingerprint does see a change (control)', async () => {
		const once = await catalogFingerprint(db);
		for (const file of CERT_FILES) await db.sql(certSql(file));
		expect(await catalogFingerprint(db)).toBe(once);
		await db.sql(`create function public.zz_fingerprint_probe() returns int language sql as 'select 1'`);
		expect(await catalogFingerprint(db)).not.toBe(once);
		await db.sql(`drop function public.zz_fingerprint_probe()`);
		expect(await catalogFingerprint(db)).toBe(once);
	});

	test('every cert_ table has row level security on and no policy, and every cert_ function is security definer with an empty search_path', async () => {
		const { rows: tables } = await db.sql<{ t: string; rls: boolean; policies: number }>(
			`select c.relname as t, c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
			 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cert\\_%' order by 1`
		);
		expect(tables.length).toBeGreaterThan(20);
		expect(tables.filter((t) => !t.rls || t.policies > 0)).toEqual([]);
		const { rows: fns } = await db.sql<{ sig: string; definer: boolean; path: string[] | null; lang: string }>(
			`select p.oid::regprocedure::text as sig, p.prosecdef as definer, p.proconfig as path, l.lanname as lang
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
			 where n.nspname = 'public' and p.proname like '%cert\\_%' order by 1`
		);
		expect(fns.length).toBeGreaterThan(80);
		// Every function pins search_path to ''; the pure immutable helpers need no definer, every other one is one.
		expect(fns.filter((f) => !(f.path ?? []).includes('search_path=""')).map((f) => f.sig)).toEqual([]);
		const notDefiner = fns.filter((f) => !f.definer).map((f) => f.sig);
		for (const sig of notDefiner) {
			const { rows } = await db.sql<{ v: string }>(`select p.provolatile as v from pg_proc p where p.oid = $1::regprocedure`, [`public.${sig}`]);
			expect(rows[0].v, `${sig} is neither security definer nor an immutable pure helper`).toBe('i');
		}
	});
});
