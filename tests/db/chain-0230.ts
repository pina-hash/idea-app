// tests/db/chain-0230.ts
//
// What the five 0230 suites share, and nothing they assert.
//
// THE CHAIN IS THE WHOLE TREE SHORT OF 0230, READ OFF DISK. 0230 is one file
// with three parts that lean on the classroom (0082, 0083, 0138), the Foundry
// (0130 through 0221) and the feedback box (0053, 0126, 0127, 0170, 0188), and
// its self-check runs over all of them, so a suite cannot apply it on a short
// chain of its own feature: the file applies whole or not at all. The whole
// chain in file order is also exactly the database production holds before the
// apply, which is the "seeded PRE-migration data" this repo's migration rule
// asks for. It is the mechanism grant-surface.test.ts and the anon EXECUTE
// sweep already use, with the same fixture completion first (auth.jwt() and an
// empty realtime publication, which only the full chain reaches).
//
// 0137 sits in its numeric place here, not last. That is correct for a
// full-chain boot: 0137 is a sweep over what came before it, and every file
// after it, 0230 included, revokes for itself by name (0166's shape).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestDb } from './harness';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

/** Passed relative to the migrations directory, the shape startTestDb resolves. */
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

const FILES_0230 = ALL.filter((f) => f.startsWith('0230_'));
if (FILES_0230.length !== 1) {
	throw new Error(`expected exactly one 0230 migration, found ${FILES_0230.length}`);
}

/** The file under test. */
export const MIGRATION_0230 = FILES_0230[0];

/** Its text, read once when a suite loads, so a mutation run reads the mutant. */
export const SQL_0230 = readFileSync(join(MIGRATIONS_DIR, MIGRATION_0230), 'utf8');

/** Every migration before 0230, in file order, behind the fixture completion. */
export const PRE_0230: readonly string[] = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < '0230')];

/** How many migration files PRE_0230 applies, so a suite can say it was not short. */
export const PRE_0230_COUNT = PRE_0230.length - 1;

/**
 * THE PASTE TRAP, checked mechanically. The Supabase editor splits statements
 * on the client, and a dollar-quote tag inside a comment breaks that splitter.
 * So: no dollar sign of any kind in a comment, and every tag on a code line
 * balanced. Same instrument as tests/db/classroom-team-edits.test.ts, which
 * carries the planted controls; each 0230 suite plants its own too.
 */
export function pasteTrap(sql: string): string[] {
	const found: string[] = [];
	const tags = new Map<string, number>();
	sql.split('\n').forEach((line, i) => {
		const at = line.indexOf('--');
		const code = at === -1 ? line : line.slice(0, at);
		const comment = at === -1 ? '' : line.slice(at);
		if (comment.includes('$')) found.push(`line ${i + 1}: a dollar sign in a comment`);
		for (const tag of code.match(/\$[A-Za-z_]*\$/g) ?? []) tags.set(tag, (tags.get(tag) ?? 0) + 1);
	});
	for (const [tag, n] of tags) if (n % 2 !== 0) found.push(`${tag} appears ${n} time(s)`);
	return found;
}

/** Every key, at any depth, of a JSON value. */
export function keysDeep(value: unknown, out: Set<string> = new Set()): Set<string> {
	if (Array.isArray(value)) {
		for (const v of value) keysDeep(v, out);
	} else if (value && typeof value === 'object') {
		for (const [k, v] of Object.entries(value)) {
			out.add(k);
			keysDeep(v, out);
		}
	}
	return out;
}

/**
 * WHAT A RE-PASTE COULD MOVE, read as text. Every function in public with its
 * argument types, ACL, defaults count and a digest of its body; every relation
 * with its ACL and its RLS flag; every policy; every constraint. Compared as a
 * whole sorted string, so one object swapped for another cannot cancel out.
 */
export async function catalogFingerprint(db: TestDb): Promise<string> {
	const { rows } = await db.sql<{ line: string }>(`
		select 'fn ' || p.oid::regprocedure::text || ' acl=' || coalesce(p.proacl::text, '-')
			|| ' defaults=' || p.pronargdefaults || ' src=' || md5(p.prosrc) as line
		from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
		union all
		select 'rel ' || c.relname || ' kind=' || c.relkind::text || ' rls=' || c.relrowsecurity
			|| ' acl=' || coalesce(c.relacl::text, '-')
		from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public'
		union all
		select 'pol ' || p.tablename || '.' || p.policyname || ' ' || coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
		from pg_catalog.pg_policies p where p.schemaname = 'public'
		union all
		select 'con ' || c.conrelid::regclass::text || '.' || c.conname || ' ' || pg_catalog.pg_get_constraintdef(c.oid)
		from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid = c.connamespace
		where n.nspname = 'public'
		union all
		select 'col ' || a.attrelid::regclass::text || '.' || a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod)
			|| ' notnull=' || a.attnotnull || ' default=' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-')
		from pg_catalog.pg_attribute a
		join pg_catalog.pg_class c on c.oid = a.attrelid
		join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
		where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
		order by 1
	`);
	return rows.map((r) => r.line).join('\n');
}

/** One function's EXECUTE grant for one role, read off the catalog by signature. */
export async function canExecute(db: TestDb, role: string, signature: string): Promise<boolean> {
	const { rows } = await db.sql<{ ok: boolean }>(
		`select has_function_privilege($1, $2, 'execute') as ok`,
		[role, `public.${signature}`]
	);
	return rows[0].ok;
}

/** How many functions in public carry this name. */
export async function overloads(db: TestDb, name: string): Promise<number> {
	const { rows } = await db.sql<{ n: number }>(
		`select count(*)::int as n from pg_catalog.pg_proc p
		 join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public' and p.proname = $1`,
		[name]
	);
	return rows[0].n;
}

/** Every table privilege a role holds on a public table, of the seven. */
export async function tablePrivileges(db: TestDb, role: string, table: string): Promise<string[]> {
	const privs = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
	const held: string[] = [];
	for (const p of privs) {
		const { rows } = await db.sql<{ ok: boolean }>(`select has_table_privilege($1, $2, $3) as ok`, [
			role,
			`public.${table}`,
			p
		]);
		if (rows[0].ok) held.push(p);
	}
	return held;
}

/** The text of a thrown error, or null when the call did not throw. */
export async function refusal(fn: () => Promise<unknown>): Promise<string | null> {
	try {
		await fn();
		return null;
	} catch (error) {
		return (error as Error).message;
	}
}
