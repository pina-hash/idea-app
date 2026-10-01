// tests/db/migration-0230-apply.test.ts
//
// 0230 AS A FILE: the properties that belong to the migration rather than to
// any one of its three features. What would fail SILENTLY:
//
//   1. THE PASTE TRAP. A dollar sign in a comment breaks the Supabase editor's
//      client-side statement splitter and nothing local reports it (it cost
//      0194 a whole apply cycle). Checked mechanically, against planted
//      controls.
//   2. THE APPLY TOOL'S OWN SCAN. tools/apply-migration.mjs refuses top-level
//      DML and destructive DDL, and migrate.yml does not pass the flag that
//      releases the DML half, so a seed written as a bare insert would fail the
//      production apply on the day it ships. The real scanner is run over the
//      real file.
//   3. THE ANON SURFACE DOES NOT GROW. The set of functions anon can execute
//      and the set of table privileges anon and authenticated hold are read off
//      the catalog BEFORE and AFTER the apply, over the whole schema, and must
//      differ by nothing at all.
//   4. THE SELF-CHECK BITES, AND A REFUSED APPLY LEAVES NOTHING BEHIND. A self-
//      check that passes on the chain is equally consistent with one that can
//      never refuse, so four mutants of the file's text are applied in memory
//      (nothing on disk is read back or written) and each must raise its own
//      0230 sentence, with the database still exactly the pre-0230 one after
//      each refusal.
//   5. THE UNDO NAMES EVERYTHING THE FILE CREATES, and a second paste changes
//      no catalog object.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type TestDb } from './harness';
import { PRE_0230, SQL_0230, catalogFingerprint, pasteTrap, refusal } from './chain-0230';

/** Written out here rather than read from the file: a test whose expected value comes from the file cannot fail. */
const NEW_TABLES = [
	'classroom_quick_posts',
	'classroom_quick_post_sections',
	'foundry_site_settings',
	'foundry_publisher_questions',
	'foundry_publisher_applications',
	'foundry_game_requests'
];
const NEW_FUNCTIONS = [
	'_classroom_quick_post_can_take_down(uuid, text)',
	'classroom_quick_posts(uuid)',
	'classroom_quick_post_create(uuid[], text, timestamptz)',
	'classroom_quick_post_take_down(uuid)',
	'_foundry_site_closed()',
	'foundry_set_site_open(boolean, text)',
	'foundry_publisher_status()',
	'foundry_publisher_apply(jsonb)',
	'foundry_publisher_applications(text)',
	'foundry_publisher_pending_count()',
	'foundry_publisher_decide(uuid, text, text)',
	'foundry_publisher_questions_admin()',
	'foundry_publisher_set_questions(jsonb)',
	'foundry_game_requests(boolean)',
	'foundry_game_request_post(text, text, text)',
	'foundry_game_request_close(uuid, text)',
	'foundry_game_request_set_hidden(uuid, boolean)',
	'app_feedback_admin_list(text, integer, text)',
	'app_feedback_set_horizon(uuid, text)'
];
/** Re-created at their existing signatures: in the undo as a re-paste, never as a drop. */
const RECREATED = ['foundry_section_access', 'foundry_play_start', 'app_feedback_submit', 'app_feedback_admin_list(text, integer)'];

let db: TestDb;
let anonFunctionsBefore: string[];
let tableGrantsBefore: string[];
let pre0230Fingerprint: string;

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
	db = await startTestDb(PRE_0230);
	anonFunctionsBefore = await anonFunctions(db);
	tableGrantsBefore = await tableGrants(db);
	pre0230Fingerprint = await catalogFingerprint(db);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the file', () => {
	test('it carries no paste trap, and the check finds one when one is planted', () => {
		expect(pasteTrap(SQL_0230)).toEqual([]);
		expect(pasteTrap('select 1; -- a $tag$ in a comment\n')).toHaveLength(1);
		expect(pasteTrap('select 1; -- a lone $ in a comment\n')).toHaveLength(1);
		expect(pasteTrap('create function f() as $x$ select 1;\n')).toHaveLength(1);
	});

	test('the apply tool would send it: no refusal and no top-level DML, against a planted insert', () => {
		const scan = scanFile(SQL_0230);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scan.statements).toBeGreaterThan(50);
		expect(scanFile('insert into public.foundry_site_settings (id) values (true);').findings).toHaveLength(1);
		expect(scanFile('drop table public.foundry_game_requests;').findings).toHaveLength(1);
	});

	test('the header undoes everything the file creates, and re-pastes rather than drops what it re-created', () => {
		const head = SQL_0230.slice(0, SQL_0230.indexOf('-- PART A. CLASSROOM QUICK POSTS.\n--\n-- ONE CANONICAL'));
		expect(head).toContain('WHAT UNDOES THIS FILE');
		for (const t of NEW_TABLES) expect(head, t).toContain(`drop table if exists public.${t};`);
		for (const f of NEW_FUNCTIONS) expect(head, f).toContain(`drop function if exists public.${f};`);
		expect(head).toContain('drop column if exists horizon;');
		for (const f of RECREATED) expect(head, f).not.toContain(`drop function if exists public.${f}`);
		expect(head).toContain('Re-paste 0173 section 1');
		expect(head).toContain('0139');
		expect(head).toContain('0170 section 5');
		expect(head).toContain('0170 section 6');
	});
});

// ===========================================================================
describe('the self-check bites, and a refused apply leaves nothing behind', () => {
	const MUTANTS: [string, string, string, RegExp][] = [
		[
			'an anon grant left on a new function',
			'revoke all on function public.classroom_quick_posts(uuid) from public, anon, authenticated;',
			'revoke all on function public.classroom_quick_posts(uuid) from public, authenticated;',
			/0230: anon can execute public\.classroom_quick_posts\(uuid\)/
		],
		[
			'a policy on a new table',
			'alter table public.foundry_game_requests enable row level security;',
			'alter table public.foundry_game_requests enable row level security;\ncreate policy "open board" on public.foundry_game_requests for select using (true);',
			/0230: table public\.foundry_game_requests carries 1 policy/
		],
		[
			'a default on the wide console read',
			'create function public.app_feedback_admin_list(p_app text, p_limit integer, p_horizon text)',
			"create function public.app_feedback_admin_list(p_app text, p_limit integer, p_horizon text default null)",
			/0230: the wide app_feedback_admin_list declares a default/
		],
		[
			'a client table grant on a new table',
			'revoke all on table public.foundry_publisher_questions from public, anon, authenticated, service_role;',
			'revoke all on table public.foundry_publisher_questions from public, anon, service_role;',
			/0230: a client role still holds select on public\.foundry_publisher_questions/
		]
	];

	test.each(MUTANTS)('%s', async (_name, from, to, sentence) => {
		expect(SQL_0230.split(from).length - 1, 'the mutation site must occur exactly once').toBe(1);
		const mutant = SQL_0230.replace(from, to);
		const message = await refusal(() => db.sql(mutant));
		expect(message).toMatch(sentence);
		// THE ROLLBACK WAS TOTAL: the database is still the pre-0230 one.
		for (const t of NEW_TABLES) expect(await exists(db, t), t).toBe(false);
		expect(await catalogFingerprint(db)).toBe(pre0230Fingerprint);
	});
});

// ===========================================================================
describe('the apply', () => {
	beforeAll(async () => {
		await db.sql(SQL_0230);
	});

	test('it lands, and the fingerprint moved (the positive control for every comparison below)', async () => {
		for (const t of NEW_TABLES) expect(await exists(db, t), t).toBe(true);
		expect(await catalogFingerprint(db)).not.toBe(pre0230Fingerprint);
	});

	test('anon can execute exactly the functions it could before, over the whole schema', async () => {
		expect(anonFunctionsBefore.length).toBeGreaterThan(5);
		expect(await anonFunctions(db)).toEqual(anonFunctionsBefore);
	});

	test('anon and authenticated hold exactly the table privileges they held before, over the whole schema', async () => {
		expect(tableGrantsBefore).toContain('authenticated app_feedback insert');
		expect(await tableGrants(db)).toEqual(tableGrantsBefore);
	});

	test('the instrument sees a grant when there is one (positive control), and the grant is taken back', async () => {
		await db.sql(`grant execute on function public.foundry_publisher_status() to anon`);
		expect(await anonFunctions(db)).toContain('foundry_publisher_status()');
		await db.sql(`revoke execute on function public.foundry_publisher_status() from anon`);
		expect(await anonFunctions(db)).toEqual(anonFunctionsBefore);
	});

	test('a second paste changes no catalog object, and the fingerprint does see a change (control)', async () => {
		const once = await catalogFingerprint(db);
		await db.sql(SQL_0230);
		expect(await catalogFingerprint(db)).toBe(once);
		await db.sql(`create function public.zz_fingerprint_probe() returns int language sql as 'select 1'`);
		expect(await catalogFingerprint(db)).not.toBe(once);
		await db.sql(`drop function public.zz_fingerprint_probe()`);
		expect(await catalogFingerprint(db)).toBe(once);
	});
});
