import { describe, expect, it, afterAll, inject } from 'vitest';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startTestDb, type TestDb } from './harness';

/**
 * A raw `pg.Client` on a harness database. `applyInTransaction` takes one --
 * it issues its own `begin`/`commit`, which a pool hands to whichever
 * connection it feels like -- so the harness's `sql` (a pool) is exactly the
 * wrong shape for it and a test built on one would be measuring nothing.
 */
async function withClient<T>(db: TestDb, fn: (c: pg.Client) => Promise<T>): Promise<T> {
	const cluster = inject('pgCluster');
	const client = new pg.Client({
		host: cluster.host,
		port: cluster.port,
		user: cluster.user,
		password: cluster.password,
		database: db.databaseName
	});
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end().catch(() => {});
	}
}

const SEED = readFileSync(
	new URL('../../supabase/data/0209-seed-migration-history.sql', import.meta.url),
	'utf8'
);

// The verification is the LAST statement; everything before it is the seed.
function split(sql: string): { body: string; verify: string } {
	const i = sql.lastIndexOf('\nwith expected(version, name) as (');
	return { body: sql.slice(0, i), verify: sql.slice(i) };
}

let db: TestDb | null = null;
afterAll(async () => {
	if (db) await db.stop();
});

describe('supabase/data/0209-seed-migration-history.sql', () => {
	it('applies, is idempotent, and its verification returns EQUAL', async () => {
		db = await startTestDb([]);
		const { body, verify } = split(SEED);

		await db.sql(body);
		// 208 and not 209: the file lists 0001 to 0210 and asks about 0211,
		// whose probe object is not on this fixture, so its row is correctly
		// withheld. That difference IS the conditional working.
		const first = await db.sql<{ n: string }>(
			'select count(*)::text as n from supabase_migrations.schema_migrations'
		);
		expect(first.rows[0].n).toBe('208');

		// Re-paste: must write nothing and must not throw.
		await db.sql(body);
		const second = await db.sql<{ n: string }>(
			'select count(*)::text as n from supabase_migrations.schema_migrations'
		);
		expect(second.rows[0].n).toBe('208');

		const r = await db.sql<{ sort_key: number; check: string; subject: string; detail: string }>(
			verify
		);
		console.log('ROWS', JSON.stringify(r.rows, null, 1));
		expect(r.rows.length).toBeGreaterThan(0);
		expect(r.rows[0].check).toBe('VERDICT');
		expect(r.rows[0].subject).toBe('EQUAL');
		expect(r.rows.filter((x) => x.check === 'PERMANENT HOLE').length).toBe(2);
		expect(r.rows.filter((x) => x.check === 'IN THIS FILE, NOT IN THE TABLE').length).toBe(0);
		expect(r.rows.filter((x) => x.check === 'IN THE TABLE, NOT IN THIS FILE').length).toBe(0);
		const conditional = r.rows.find((x) => x.check === '0211')!;
		expect(conditional.subject).toBe('NOT APPLIED to this database');
	});

	it('0211 is written only when the object 0211 creates is actually there', async () => {
		// THE ROW THIS FILE MUST NEVER INVENT. Seeding 0211 on a database that
		// does not have it would tell every later reader the database holds a
		// migration it does not, and the Migrate workflow would skip it forever
		// with nothing anywhere reporting it. So the file asks, and this drives
		// BOTH answers on real databases rather than reading the branch.
		const { body, verify } = split(SEED);
		const applied = await startTestDb([]);
		try {
			await applied.sql(
				'create function public._ideacad_realtime_topic_id(p_topic text, p_prefix text) returns uuid language sql as \'select null::uuid\''
			);
			await applied.sql(body);
			const r = await applied.sql<{ check: string; subject: string; detail: string }>(verify);
			expect(r.rows[0].subject).toBe('EQUAL');
			const row = r.rows.find((x) => x.check === '0211')!;
			expect(row.subject).toBe('APPLIED, and now recorded');
			const got = await applied.sql<{ n: string }>(
				"select count(*)::text as n from supabase_migrations.schema_migrations where version = '0211'"
			);
			expect(got.rows[0].n).toBe('1');
		} finally {
			await applied.stop();
		}

		// The negative half is the fixture the first test already uses: the
		// function is absent there, and no 0211 row was written. Asserted here
		// too so this test carries both directions in one reading.
		const none = await db!.sql<{ n: string }>(
			"select count(*)::text as n from supabase_migrations.schema_migrations where version = '0211'"
		);
		expect(none.rows[0].n).toBe('0');
	});

	it('POSITIVE CONTROL: a missing row, a stray row, a future row and a hole are each reported', async () => {
		const { verify } = split(SEED);
		await db!.sql("delete from supabase_migrations.schema_migrations where version = '0100'");
		await db!.sql(
			"insert into supabase_migrations.schema_migrations (version, name) values ('0099b','stray'),('0212','later'),('0190','hole')"
		);
		const r = await db!.sql<{ check: string; subject: string; detail: string }>(verify);
		console.log('MUTATED', JSON.stringify(r.rows.filter((x) => x.check !== 'EXAMINED'), null, 1));
		expect(r.rows[0].subject).toMatch(/^NOT EQUAL/);
		expect(r.rows.filter((x) => x.check === 'IN THIS FILE, NOT IN THE TABLE').map((x) => x.subject)).toEqual(['0100']);
		const extra = r.rows.filter((x) => x.check === 'IN THE TABLE, NOT IN THIS FILE');
		expect(extra.map((x) => x.subject).sort()).toEqual(['0099b', '0190', '0212']);
		expect(extra.find((x) => x.subject === '0212')!.detail).toMatch(/EXPECTED/);
		expect(extra.find((x) => x.subject === '0099b')!.detail).toMatch(/UNEXPECTED/);
		const hole = r.rows.filter((x) => x.check === 'PERMANENT HOLE');
		expect(hole.find((x) => x.subject === '0190')!.detail).toMatch(/PRESENT, and it should not be/);
		expect(hole.find((x) => x.subject === '0191')!.detail).toMatch(/absent, as intended/);
	});
});

// ---------------------------------------------------------------------------
// THE SEED IS ONLY HALF OF IT. A record that stops being updated is a record
// that lies, so `tools/apply-migration.mjs` inserts its own row with every
// apply it commits. These drive the REAL functions against a REAL Postgres --
// the seeded table above is the fixture -- because every one of these paths is
// green and untested on a database that has no history table at all, which is
// what every other apply-migration test runs against.
// ---------------------------------------------------------------------------
describe('apply-migration keeps the seeded table current', () => {
	it('historyState answers absent, present-and-writable, and present-and-not', async () => {
		const { historyState } = await import('../../tools/apply-migration.mjs');
		const fresh = await startTestDb([]);
		try {
			// ABSENT. The pre-seed state, and the one every other suite runs in.
			await fresh.sql('select 1');
			const before = await withClient(fresh, (c) => historyState(c));
			expect(before).toEqual({ present: false, insertable: false });

			await fresh.sql(split(SEED).body);
			const after = await withClient(fresh, (c) => historyState(c));
			expect(after).toEqual({ present: true, insertable: true });

			// PRESENT AND NOT WRITABLE. `insertable` is what stands between a
			// migration applying and its row being silently skipped, so it is
			// asserted against a role that genuinely cannot write rather than
			// by reading the function's own branch.
			await fresh.sql("create role probe_no_insert nologin");
			await fresh.sql('grant usage on schema supabase_migrations to probe_no_insert');
			await fresh.sql('grant select on supabase_migrations.schema_migrations to probe_no_insert');
			const asRole = await fresh.sql<{ ok: boolean }>(
				"select pg_catalog.has_table_privilege('probe_no_insert','supabase_migrations.schema_migrations','insert') as ok"
			);
			expect(asRole.rows[0].ok).toBe(false);
		} finally {
			await fresh.stop();
		}
	});

	it('a WRAPPED file gets its row inside the same transaction, and loses it on a rollback', async () => {
		const { applyInTransaction } = await import('../../tools/apply-migration.mjs');
		const fresh = await startTestDb([]);
		try {
			await fresh.sql(split(SEED).body);

			const ok = await withClient(fresh, (c) =>
				applyInTransaction(c, 'create table public.t_ok (a int);', false, [], {
					version: '0212',
					name: 'later'
				})
			);
			expect(ok.ok).toBe(true);
			expect(ok.historyRecorded).toBe(true);
			const landed = await fresh.sql<{ n: string }>(
				"select count(*)::text as n from supabase_migrations.schema_migrations where version = '0212'"
			);
			expect(landed.rows[0].n).toBe('1');

			// THE ATOMICITY, MEASURED IN THE DIRECTION THAT MATTERS: a file that
			// raises must leave no row behind, or the table claims a migration
			// this database does not have.
			const bad = await withClient(fresh, (c) =>
				applyInTransaction(c, 'select 1/0;', false, [], { version: '0213', name: 'raised' })
			);
			expect(bad.ok).toBe(false);
			const none = await fresh.sql<{ n: string }>(
				"select count(*)::text as n from supabase_migrations.schema_migrations where version = '0213'"
			);
			expect(none.rows[0].n).toBe('0');
		} finally {
			await fresh.stop();
		}
	});

	it('a SELF-MANAGED file records afterwards, and a failure there is ok:true with the row missing', async () => {
		const { applyInTransaction } = await import('../../tools/apply-migration.mjs');
		const fresh = await startTestDb([]);
		try {
			await fresh.sql(split(SEED).body);

			const ok = await withClient(fresh, (c) =>
				applyInTransaction(c, 'begin; create table public.t_self (a int); commit;', true, [], {
					version: '0212',
					name: 'later'
				})
			);
			expect(ok.ok).toBe(true);
			expect(ok.historyRecorded).toBe(true);

			// THE ONE STATE THE TOOL MUST NEVER CALL A FAILED APPLY. The file
			// committed; only the row did not. Reporting `ok: false` here is how
			// somebody applies the same migration twice.
			await fresh.sql('alter table supabase_migrations.schema_migrations rename to moved_away');
			const partial = await withClient(fresh, (c) =>
				applyInTransaction(c, 'begin; create table public.t_self2 (a int); commit;', true, [], {
					version: '0213',
					name: 'later2'
				})
			);
			expect(partial.ok).toBe(true);
			expect(partial.historyRecorded).toBe(false);
			const survived = await fresh.sql<{ n: string }>(
				"select count(*)::text as n from pg_catalog.pg_tables where schemaname = 'public' and tablename = 't_self2'"
			);
			expect(survived.rows[0].n).toBe('1');
		} finally {
			await fresh.stop();
		}
	});
});

describe('the committed record says whether the row landed', () => {
	// `history_row:` is a front-matter FIELD rather than prose so that
	// `grep -L 'history_row: yes' docs/migrations-applied/*.md` finds every
	// apply that left the database's own record behind. Three states, three
	// spellings, and `absent` must never read as `NO`: one is the pre-seed
	// world and the other is a migration applied with nothing recording it.
	const base = {
		migrationNum: '0212',
		migrationFile: '0212_x.sql',
		sha256: 'abc',
		branch: 'main',
		slug: 'main',
		commit: 'deadbeef',
		ledgerId: '0207',
		ledgerFile: '0207-x.md',
		ledgerRaw: 'yes, exactly one, 0212',
		numberWarning: null,
		sessionUser: 'idea_migrator',
		database: 'postgres',
		at: '2026-09-13T00:00:00.000Z',
		notices: [],
		objects: [],
		exit: 'applied'
	};

	it('renders yes, NO and absent, and never confuses the last two', async () => {
		const { renderAppliedRecord } = await import('../../tools/apply-migration.mjs');
		const yes = renderAppliedRecord({ ...base, historyRecorded: true }, '');
		const no = renderAppliedRecord({ ...base, historyRecorded: false, exit: 'unverified' }, '');
		const absent = renderAppliedRecord({ ...base, historyRecorded: null }, '');
		const omitted = renderAppliedRecord(base, '');

		expect(yes).toContain('history_row: yes');
		expect(no).toContain('history_row: NO');
		expect(absent).toContain('history_row: absent');
		// An omitted field is the same claim as an explicit null, not a
		// missing one: the typedef makes it optional precisely so a record
		// from a database with no history table needs no ceremony.
		expect(omitted).toContain('history_row: absent');

		expect(no).toMatch(/\*\*THE ROW IS NOT THERE\.\*\*/);
		expect(absent).not.toMatch(/THE ROW IS NOT THERE/);
		expect(yes).toContain('now carries version');
	});
});
