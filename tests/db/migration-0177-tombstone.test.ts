// tests/db/migration-0177-tombstone.test.ts
//
// 0177 is a TOMBSTONE: it occupies a reserved number that was never used, and
// it must change NOTHING. Verified against REAL embedded Postgres with the REAL
// migration files applied unmodified.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. There is no surface to look at -- that IS the claim -- so every way
// this file could be wrong is invisible by construction:
//
//   * A TOMBSTONE THAT CHANGES SOMETHING is the failure that matters, and
//     nothing on any screen would report it. So the catalog is measured BEFORE
//     the file and AFTER it, over the objects a stray statement in a migration
//     could plausibly move -- relations, functions, policies and the grants on
//     them -- and the two readings are compared as wholes rather than counted.
//     A count would pass a file that dropped one function and added another.
//   * A TOMBSTONE THAT IS NOT RE-APPLIABLE fails exactly when somebody
//     re-pastes it, which is ordinary here: there is no migration runner, and a
//     first attempt that failed partway gets retried by hand. It is applied
//     THREE times and the third reading must still equal the first.
//   * THE HOLE ITSELF. The contiguity claim is what the file exists for, and it
//     is a property of the directory rather than of any database -- so it is
//     read off the real directory listing, which is also the sort
//     `tools/idea-status.py` and every hand-pasted apply follow.
//
// THE POSITIVE CONTROL IS NOT IMPLIED. A snapshot comparison between two
// readings of an unchanged database passes for a snapshot that measures
// nothing, so the same comparison is put to a database that DID change -- one
// harmless function created by this file -- and must report a difference.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './harness';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const TOMBSTONE = '0177_reserved_number_tombstone.sql';

/**
 * A SHORT chain, deliberately. The claim is "this file changes nothing", which
 * is independent of what is underneath it -- and a long chain would make a
 * failure here read as somebody else's migration moving. Profiles plus the
 * admin tier gives the snapshot real relations, real SECURITY DEFINER
 * functions, real policies and real grants to be wrong about.
 */
const CHAIN = ['0001_profiles.sql', '0003_profile_section.sql', '0020_profiles_identity.sql', '0067_admin_tier.sql'];

/**
 * WHAT A STRAY STATEMENT IN A MIGRATION COULD MOVE, read as text rather than
 * as counts. Relations and their columns, every function with its argument
 * types and its ACL, every policy with its expressions, and the table grants.
 * Compared as whole sorted strings, so an object swapped for another one of the
 * same kind cannot cancel out.
 */
const SNAPSHOT_SQL = `
	select string_agg(line, E'\\n' order by line) as snap from (
		select 'rel ' || c.relkind::text || ' ' || n.nspname || '.' || c.relname
			|| ' rls=' || c.relrowsecurity::text as line
			from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname in ('public', 'auth', 'storage') and c.relkind in ('r','v','m','p','S')
		union all
		select 'col ' || n.nspname || '.' || c.relname || '.' || a.attname
			|| ' ' || format_type(a.atttypid, a.atttypmod) || ' nn=' || a.attnotnull::text
			from pg_attribute a
			join pg_class c on c.oid = a.attrelid
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname in ('public', 'auth', 'storage') and a.attnum > 0 and not a.attisdropped
		union all
		select 'fn ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
			|| ' sd=' || p.prosecdef::text || ' acl=' || coalesce(array_to_string(p.proacl, ','), '<default>')
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname in ('public', 'auth', 'storage')
		union all
		select 'pol ' || pol.schemaname || '.' || pol.tablename || '.' || pol.policyname
			|| ' ' || pol.cmd || ' roles=' || pol.roles::text
			|| ' using=' || coalesce(pol.qual, '-') || ' check=' || coalesce(pol.with_check, '-')
			from pg_policies pol where pol.schemaname in ('public', 'auth', 'storage')
		union all
		select 'grant ' || table_schema || '.' || table_name || ' ' || grantee || ' ' || privilege_type
			from information_schema.role_table_grants
			where table_schema in ('public', 'auth', 'storage')
		union all
		select 'con ' || n.nspname || '.' || t.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid)
			from pg_constraint con
			join pg_class t on t.oid = con.conrelid
			join pg_namespace n on n.oid = t.relnamespace
			where n.nspname in ('public', 'auth', 'storage')
	) s
`;

describe('0177 is a tombstone', () => {
	let db: TestDb;
	const text = readFileSync(join(MIGRATIONS_DIR, TOMBSTONE), 'utf8');
	let before = '';
	const after: string[] = [];

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		before = (await db.sql<{ snap: string }>(SNAPSHOT_SQL)).rows[0].snap;
		// APPLIED THREE TIMES, reading the catalog after each. Re-pasting is
		// ordinary here and a file that only works once fails exactly then.
		for (let i = 0; i < 3; i += 1) {
			await db.sql(text);
			after.push((await db.sql<{ snap: string }>(SNAPSHOT_SQL)).rows[0].snap);
		}
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('applies, and re-applies, without changing one catalog object', () => {
		// NOT VACUOUS, AND NOT BY A ROW COUNT. A floor is a number somebody
		// picks and then lowers when it fails; what "the snapshot measured
		// something" actually means is that EVERY arm of the union produced
		// rows, because an arm that silently returned none would make this file
		// blind to that whole class of object while still comparing equal.
		// Each is asserted by its own prefix, so a failure names which arm.
		for (const kind of ['rel ', 'col ', 'fn ', 'pol ', 'grant ', 'con ']) {
			expect(
				before.split('\n').filter((l) => l.startsWith(kind)).length,
				`the snapshot's \`${kind.trim()}\` arm read nothing`
			).toBeGreaterThan(0);
		}
		// And the objects the chain is known to create are in it by name, so a
		// snapshot reading some OTHER database cannot pass either.
		expect(before).toContain('public.profiles');
		expect(before).toContain('public.app_admins');
		expect(before).toContain('public.is_admin()');

		expect(after).toHaveLength(3);
		expect(after[0], 'the first apply changed the catalog').toBe(before);
		expect(after[1], 'the second apply changed the catalog').toBe(before);
		expect(after[2], 'the third apply changed the catalog').toBe(before);
	});

	it('POSITIVE CONTROL: the same comparison reports a database that DID change', async () => {
		// The snapshot above is only worth its three assertions if it can tell
		// the difference. One harmless function, created and then dropped.
		await db.sql(`create function public._tombstone_control() returns int language sql as $$ select 1 $$`);
		const moved = (await db.sql<{ snap: string }>(SNAPSHOT_SQL)).rows[0].snap;
		expect(moved, 'the snapshot cannot see a function being created').not.toBe(before);
		expect(moved).toContain('_tombstone_control');

		await db.sql(`drop function public._tombstone_control()`);
		const restored = (await db.sql<{ snap: string }>(SNAPSHOT_SQL)).rows[0].snap;
		expect(restored, 'the snapshot did not come back to where it started').toBe(before);
	});

	it('contains no DDL, no DML and no grant -- the tombstone claim as text', () => {
		// The catalog comparison above is the real assertion; this is the
		// cheaper one beside it, and it is what a reader checks first. Comments
		// are stripped so the file's own prose about `create`, `drop` and
		// `grant` is not read as code.
		const code = text
			.split('\n')
			.filter((l) => !l.trimStart().startsWith('--'))
			.join('\n')
			.toLowerCase();
		for (const verb of [
			'create ', 'drop ', 'alter ', 'grant ', 'revoke ',
			'insert ', 'update ', 'delete ', 'truncate ', 'comment on'
		]) {
			expect(code, `0177 contains \`${verb.trim()}\``).not.toContain(verb);
		}
		// And it does say something, so an empty file cannot pass the sweep.
		expect(code).toContain('raise notice');
		expect(code).toContain('0177: tombstone');
	});

	it('the migration series is contiguous, with 0177 in it', () => {
		// THE PROPERTY THE FILE EXISTS FOR, read off the real directory in the
		// sort the apply path itself follows: `tools/idea-status.py` sorts
		// filenames, and a person pasting them works down that same order.
		const nums = readdirSync(MIGRATIONS_DIR)
			.filter((f) => f.endsWith('.sql'))
			.map((f) => Number(f.slice(0, 4)))
			.sort((a, b) => a - b);

		expect(nums.length, 'no migrations were read').toBeGreaterThan(100);
		expect(new Set(nums).size, 'two migrations share a number').toBe(nums.length);
		expect(nums[0]).toBe(1);

		const gaps: number[] = [];
		for (let n = nums[0]; n <= nums[nums.length - 1]; n += 1) {
			if (!nums.includes(n)) gaps.push(n);
		}
		expect(gaps, 'the migration series has a hole in it').toEqual([]);
		expect(nums).toContain(177);

		// NOT VACUOUS: the same walk over a series with 0177 removed must
		// report exactly the hole this file was written to fill.
		const without = nums.filter((n) => n !== 177);
		const holes: number[] = [];
		for (let n = without[0]; n <= without[without.length - 1]; n += 1) {
			if (!without.includes(n)) holes.push(n);
		}
		expect(holes, 'the contiguity walk cannot see a hole').toEqual([177]);
	});
});
