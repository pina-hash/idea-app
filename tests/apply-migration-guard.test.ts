// tests/apply-migration-guard.test.ts
//
// The four positive controls for `tools/apply-migration.mjs` and
// `supabase/roles/idea_migrator.sql`, driven against a REAL Postgres with the
// REAL role file applied to it, unmodified except for the password placeholder
// a person replaces in the SQL editor.
//
//   1. A migration that tries `drop table` is REFUSED by the guard, and nothing
//      the file did before that survives.
//   2. A migration that raises in its own self-check is reported as a REFUSAL
//      rather than a crash, and nothing it did survives either.
//   3. A migration applied out of order is refused BEFORE it runs -- driven
//      through the real CLI, against a real database, with the real probes.
//   4. A successful apply is verified object by object, and breaking one object
//      afterwards makes that verification fail.
//
// THE PRODUCTION PATH IS UNEXERCISED AND THIS FILE CANNOT EXERCISE IT. No
// session holds a credential for the live project, this one asked for none, and
// the role file has never been pasted anywhere. What is proven here is that the
// SQL applies, that the guard fires, and that the tool reads what the guard
// says. Whether Supabase's `postgres` role can create an event trigger at all,
// and whether it holds ADMIN OPTION on itself so `grant postgres to
// idea_migrator` lands, are properties of that project. The file's own
// self-check raises on both, which is the whole reason it is one transaction.
//
// The embedded cluster's `postgres` IS a superuser and Supabase's is not. That
// difference cannot change what the guard refuses -- an event trigger fires for
// superusers too -- but it does mean the two `raise exception` rungs above are
// measured here only in the direction where they pass.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import pg from 'pg';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './db/harness';
import {
	applyInTransaction,
	claims,
	guardFingerprint,
	makeClient,
	EXIT
} from '../tools/apply-migration.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROLE_SQL = join(REPO_ROOT, 'supabase', 'roles', 'idea_migrator.sql');
const PLACEHOLDER = 'REPLACE_ME_WITH_A_REAL_PASSWORD';
const TEST_PASSWORD = 'migrator-test-password';

/** Everything above the reversal, which is commented out in the file. */
function roleSqlToPaste(): string {
	const text = readFileSync(ROLE_SQL, 'utf8');
	expect(text).toContain(PLACEHOLDER);
	return text.split(PLACEHOLDER).join(TEST_PASSWORD);
}

let db: TestDb;
let url: string;
/** Connected as `idea_migrator`, which is what a session would hold. */
let migrator: pg.Client;
/** Connected as the cluster owner, to seed and to break things on purpose. */
let owner: pg.Client;

beforeAll(async () => {
	// An EMPTY chain: this file is about the applier, not about any feature's
	// schema, and the stub alone is the smallest world the role file needs.
	db = await startTestDb([]);
	const cluster = inject('pgCluster');
	owner = new pg.Client({
		host: cluster.host,
		port: cluster.port,
		user: cluster.user,
		password: cluster.password,
		database: db.databaseName
	});
	await owner.connect();

	const notices: string[] = [];
	owner.on('notice', (n) => notices.push(n.message ?? ''));
	await owner.query(roleSqlToPaste());
	// The file talks to whoever pasted it. If it stops, that is a finding.
	expect(notices.join('\n')).toMatch(/role and guard installed/);

	url = `postgresql://idea_migrator:${TEST_PASSWORD}@${cluster.host}:${cluster.port}/${db.databaseName}?sslmode=disable`;
	migrator = new pg.Client({ connectionString: url });
	await migrator.connect();
}, 120_000);

afterAll(async () => {
	await migrator?.end().catch(() => {});
	await owner?.end().catch(() => {});
	await db?.stop();
});

/* ------------------------------------------------------------------------ */

describe('the role file installs what its header says it installs', () => {
	it('creates the role with none of the attributes it names as refused', async () => {
		const r = await owner.query(
			`select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolcanlogin
			 from pg_roles where rolname = 'idea_migrator'`
		);
		expect(r.rows[0]).toEqual({
			rolsuper: false,
			rolcreaterole: false,
			rolcreatedb: false,
			rolbypassrls: false,
			rolreplication: false,
			rolcanlogin: true
		});
	});

	it('installs two ENABLED event triggers and a guard function nobody but postgres can reach', async () => {
		const t = await owner.query(
			`select evtname, evtevent, evtenabled from pg_event_trigger
			 where evtname like 'idea_applier_guard%' order by evtname`
		);
		expect(t.rows).toEqual([
			{ evtname: 'idea_applier_guard_drop', evtevent: 'sql_drop', evtenabled: 'O' },
			{ evtname: 'idea_applier_guard_start', evtevent: 'ddl_command_start', evtenabled: 'O' }
		]);
		expect(await guardFingerprint(owner)).toMatch(/^[0-9a-f]{32}$/);
	});

	it('re-applies over itself, because a second paste is ordinary', async () => {
		await expect(owner.query(roleSqlToPaste())).resolves.toBeTruthy();
	});

	it('carries its own reversal, and the reversal names every object it made', () => {
		const text = readFileSync(ROLE_SQL, 'utf8');
		const reversal = text.slice(text.lastIndexOf('\n', text.indexOf('THE REVERSAL')) + 1);
		for (const object of [
			'idea_applier_guard_start',
			'idea_applier_guard_drop',
			'idea_guard',
			'idea_migrator'
		]) {
			expect(reversal).toContain(object);
		}
		// It is commented out, so a careless whole-file paste cannot undo itself.
		expect(reversal).toMatch(/^-- drop event trigger if exists idea_applier_guard_start;$/m);
	});

	it('has no real password in it', () => {
		expect(readFileSync(ROLE_SQL, 'utf8')).toContain(PLACEHOLDER);
	});
});

describe('the guard fires for idea_migrator and only for idea_migrator', () => {
	it('refuses drop table, drop schema and a dropped column from the scoped role', async () => {
		await owner.query('create table public.guard_probe (id int primary key, doomed text)');
		for (const sql of [
			'drop table public.guard_probe',
			'drop schema idea_guard cascade',
			'alter table public.guard_probe drop column doomed'
		]) {
			await expect(migrator.query(sql)).rejects.toMatchObject({ code: '42501' });
		}
		// Still standing, column and all.
		const r = await owner.query(
			`select count(*)::int as n from information_schema.columns
			 where table_schema = 'public' and table_name = 'guard_probe'`
		);
		expect(r.rows[0].n).toBe(2);
	});

	it('does NOT refuse the same statements from another session_user -- the positive control', async () => {
		// Without this the assertions above would pass just as well against a
		// guard that refused everything for everyone, which would be a database
		// nobody could use.
		await owner.query('create table public.owner_probe (id int, doomed text)');
		await expect(owner.query('alter table public.owner_probe drop column doomed')).resolves.toBeTruthy();
		await expect(owner.query('drop table public.owner_probe')).resolves.toBeTruthy();
	});

	it('holds through SET ROLE, because it keys on session_user', async () => {
		await migrator.query('set role postgres');
		try {
			const ids = await migrator.query('select current_user as cu, session_user as su');
			expect(ids.rows[0]).toEqual({ cu: 'postgres', su: 'idea_migrator' });
			await expect(migrator.query('drop table public.guard_probe')).rejects.toMatchObject({
				code: '42501'
			});
		} finally {
			await migrator.query('reset role');
		}
	});

	it('lets through every statement shape the last twenty migrations actually issue', async () => {
		const sql = `
			create table public.allowed_probe (id int primary key, v text);
			alter table public.allowed_probe add column if not exists c2 text;
			alter table public.allowed_probe enable row level security;
			create unique index allowed_probe_v on public.allowed_probe (v);
			create policy ap on public.allowed_probe for select using (true);
			drop policy ap on public.allowed_probe;
			create or replace function public.allowed_fn() returns int language sql as $$ select 1 $$;
			revoke all on function public.allowed_fn() from public, anon, authenticated, service_role;
			grant execute on function public.allowed_fn() to authenticated;
			comment on table public.allowed_probe is 'ok';
			create function public.allowed_trg() returns trigger language plpgsql as $$ begin return new; end $$;
			create trigger ap_tg before insert on public.allowed_probe for each row execute function public.allowed_trg();
			drop trigger ap_tg on public.allowed_probe;
			drop index public.allowed_probe_v;
			create view public.allowed_view as select 1 as one;
			drop view public.allowed_view;
			do $$ begin execute 'select count(*) from public.allowed_probe'; end $$;`;
		await expect(migrator.query(sql)).resolves.toBeTruthy();
	});
});

/* ------------------------------------------------------------------------ */
/* CONTROL 1 and CONTROL 2.                                                  */
/* ------------------------------------------------------------------------ */

describe('control 1: a migration that tries drop table is refused, and nothing lands', () => {
	it('rolls the whole file back, including what ran before the drop', async () => {
		await owner.query('create table public.c1_victim (id int)');
		const notices: string[] = [];
		const client = new pg.Client({ connectionString: url });
		client.on('notice', (n) => notices.push(n.message ?? ''));
		await client.connect();
		try {
			const result = await applyInTransaction(
				client,
				`create table public.c1_new (id int);
				 do $$ begin raise notice 'c1: the table was created'; end $$;
				 drop table public.c1_victim;`,
				false,
				notices.map((m) => ({ severity: 'NOTICE', message: m }))
			);
			expect(result.ok).toBe(false);
			expect(result.ok === false && result.code).toBe('42501');
			expect(result.ok === false && result.refusal).toBe(true);
			expect(result.ok === false && result.message).toMatch(/idea_migrator may not run DROP TABLE/);
		} finally {
			await client.end();
		}
		const after = await owner.query(
			`select to_regclass('public.c1_new') as made, to_regclass('public.c1_victim') as victim`
		);
		expect(after.rows[0]).toEqual({ made: null, victim: 'c1_victim' });
		// The notice from before the refusal still reached the caller, which is
		// the whole reason notices are collected on the connection rather than
		// read off a result.
		expect(notices.join('\n')).toContain('c1: the table was created');
	});
});

describe('control 2: a self-check that raises is a refusal, not a crash', () => {
	it('reports P0001 with the sentence the migration itself wrote, and nothing it did survives', async () => {
		const client = new pg.Client({ connectionString: url });
		const notices: { severity: string; message: string }[] = [];
		client.on('notice', (n) => notices.push({ severity: n.severity ?? 'NOTICE', message: n.message ?? '' }));
		await client.connect();
		try {
			const result = await applyInTransaction(
				client,
				`create table public.c2_new (id int);
				 do $$
				 begin
					raise notice '9999: created the table.';
					raise exception '9999: expected 7 hall pass functions, found 3. Check 0143/0144 applied first.';
				 end $$;`,
				false,
				notices
			);
			expect(result.ok).toBe(false);
			expect(result.ok === false && result.code).toBe('P0001');
			expect(result.ok === false && result.refusal).toBe(true);
			expect(result.ok === false && result.message).toBe(
				'9999: expected 7 hall pass functions, found 3. Check 0143/0144 applied first.'
			);
		} finally {
			await client.end();
		}
		expect((await owner.query(`select to_regclass('public.c2_new') as t`)).rows[0].t).toBeNull();
		expect(notices.map((n) => n.message)).toContain('9999: created the table.');
	});

	it('calls a genuine failure a failure, which is a different outcome', async () => {
		const client = new pg.Client({ connectionString: url });
		await client.connect();
		try {
			const result = await applyInTransaction(client, 'select * from public.no_such_table;', false, []);
			expect(result.ok).toBe(false);
			// 42P01 undefined_table: not a considered refusal, so not reported as one.
			expect(result.ok === false && result.refusal).toBe(false);
		} finally {
			await client.end();
		}
	});
});

/* ------------------------------------------------------------------------ */
/* CONTROL 3.                                                                */
/* ------------------------------------------------------------------------ */

describe('control 3: a migration applied out of order is refused before it runs', () => {
	it('exits `refused` and leaves the database untouched, through the real CLI', async () => {
		// This database has NO migration applied to it, so every probeable file
		// below the target comes back NOT APPLIED and the target is not the
		// lowest unapplied one. `--since 151` is deploy-probe's own floor.
		const before = await owner.query(
			`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relkind = 'r'`
		);
		const run = spawnSync(
			process.execPath,
			['tools/apply-migration.mjs', '0180', '--since', '151', '--ref', 'origin/integration'],
			{
				cwd: REPO_ROOT,
				encoding: 'utf8',
				env: { ...process.env, IDEA_MIGRATION_URL: url },
				timeout: 120_000
			}
		);
		expect(run.status).toBe(EXIT.refused);
		expect(run.stdout).toMatch(/REFUSING to apply 0180_notebook_grid_avatar\.sql/);
		expect(run.stdout).toMatch(/NOT APPLIED|CANNOT SAY/);
		// It got as far as connecting, so the refusal is the ordering rule and
		// not a failure to reach the database.
		expect(run.stdout).toMatch(/session_user idea_migrator/);
		// And it says nothing that could carry the password.
		expect(run.stdout + run.stderr).not.toContain(TEST_PASSWORD);

		const after = await owner.query(
			`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relkind = 'r'`
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
	}, 180_000);

	it('refuses a file it will not send before it looks at the ordering at all', async () => {
		// 0162 creates an extension. The scan runs before the connection, so
		// this refusal must arrive with NO connection string set at all.
		const env = { ...process.env };
		delete env.IDEA_MIGRATION_URL;
		const run = spawnSync(process.execPath, ['tools/apply-migration.mjs', '0162'], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			env,
			timeout: 60_000
		});
		expect(run.status).toBe(EXIT.refused);
		expect(run.stdout).toMatch(/REFUSE {2}line 117: create extension/);
		expect(run.stdout).toMatch(/Nothing was sent\./);
	}, 60_000);
});

/* ------------------------------------------------------------------------ */
/* CONTROL 4.                                                                */
/* ------------------------------------------------------------------------ */

describe('control 4: the post-apply verification is object by object', () => {
	const fixture = `
		create table public.c4_thing (id uuid primary key, label text);
		alter table public.c4_thing add column if not exists note text;
		create index c4_thing_label on public.c4_thing (label);
		create or replace function public.c4_fn() returns int language sql as $$ select 1 $$;
		alter table public.c4_thing enable row level security;
		create policy c4_read on public.c4_thing for select using (true);
		do $$ begin raise notice 'c4: applied.'; end $$;`;

	/** Ask the catalog the tool's own questions, the way the tool does. */
	async function probe(client: pg.Client) {
		const want = claims(fixture);
		const q = 'select ' + want.map((c, i) => `(${c.sql}) as o${i}`).join(', ');
		const r = await client.query(q);
		return want.map((c, i) => ({
			kind: c.kind,
			name: c.name,
			present: r.rows[0][`o${i}`] === true
		}));
	}

	it('finds every object the file names, and the guard unchanged', async () => {
		const client = new pg.Client({ connectionString: url });
		await client.connect();
		try {
			const before = await guardFingerprint(client);
			const result = await applyInTransaction(client, fixture, false, []);
			expect(result.ok).toBe(true);
			const objects = await probe(client);
			expect(objects.map((o) => `${o.kind} ${o.name}`)).toEqual([
				'table public.c4_thing',
				'column public.c4_thing.note',
				'index public.c4_thing_label',
				'function public.c4_fn',
				'policy public.c4_thing:c4_read'
			]);
			expect(objects.every((o) => o.present)).toBe(true);
			expect(await guardFingerprint(client)).toBe(before);
		} finally {
			await client.end();
		}
	});

	it('reports MISSING when one of those objects is broken afterwards', async () => {
		// The mutation is the point: without it, "every object present" could be
		// a probe that answers true for anything.
		await owner.query('drop index public.c4_thing_label');
		const objects = await probe(owner);
		expect(objects.filter((o) => !o.present).map((o) => o.name)).toEqual(['public.c4_thing_label']);
		expect(objects.filter((o) => o.present)).toHaveLength(4);
		// Restored, so nothing after this file depends on the mutation.
		await owner.query('create index c4_thing_label on public.c4_thing (label)');
		expect((await probe(owner)).every((o) => o.present)).toBe(true);
	});

	it('notices when a file moves the guard out from under it', async () => {
		const client = new pg.Client({ connectionString: url });
		await client.connect();
		try {
			const before = await guardFingerprint(client);
			// This is the one-statement defeat the role file's header names. It
			// succeeds -- that is the honest finding -- and the fingerprint is
			// what makes it VISIBLE rather than silent.
			await client.query(
				`create or replace function idea_guard.applier_guard() returns event_trigger
				 language plpgsql as $g$ begin end $g$`
			);
			const after = await guardFingerprint(client);
			expect(after).not.toBe(before);
			await expect(client.query('create table public.defeated (id int)')).resolves.toBeTruthy();
			await expect(client.query('drop table public.defeated')).resolves.toBeTruthy();
		} finally {
			// Put the real guard back, byte for byte, from the file itself.
			await owner.query(roleSqlToPaste());
			await client.end();
		}
		expect(await guardFingerprint(owner)).toMatch(/^[0-9a-f]{32}$/);
		await expect(migrator.query('drop table public.c4_thing')).rejects.toMatchObject({
			code: '42501'
		});
	});
});

/* ------------------------------------------------------------------------ */
/* The proxy tunnel.                                                         */
/* ------------------------------------------------------------------------ */

describe('makeClient tunnels through an HTTP CONNECT proxy', () => {
	it('connects to a database it could not otherwise reach, and refuses a proxy that says no', async () => {
		const cluster = inject('pgCluster');
		let allow = true;
		const proxy = net.createServer((client) => {
			client.once('data', (chunk) => {
				const line = chunk.toString('latin1').split('\r\n')[0];
				expect(line).toMatch(new RegExp(`^CONNECT [^ ]+:${cluster.port} HTTP/1\\.1$`));
				if (!allow) {
					client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
					return;
				}
				const upstream = net.connect(cluster.port, cluster.host, () => {
					client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
					client.pipe(upstream).pipe(client);
				});
				upstream.on('error', () => client.destroy());
			});
			client.on('error', () => {});
		});
		await new Promise<void>((ok) => proxy.listen(0, '127.0.0.1', ok));
		const address = proxy.address();
		if (address === null || typeof address === 'string') throw new Error('no proxy port');
		const proxyUrl = `http://127.0.0.1:${address.port}`;

		try {
			const made = await makeClient(url, { proxy: proxyUrl, noProxy: '' });
			expect(made.tunnelled).toBe(true);
			await made.client.connect();
			const r = await made.client.query('select session_user as su');
			expect(r.rows[0].su).toBe('idea_migrator');
			await made.client.end();

			// A proxy that refuses must look like a proxy refusing, never like a
			// database that is down.
			allow = false;
			await expect(makeClient(url, { proxy: proxyUrl, noProxy: '' })).rejects.toThrow(
				/proxy refused CONNECT/
			);

			// And with the host in NO_PROXY it goes direct -- the same code path
			// a laptop takes.
			const direct = await makeClient(url, { proxy: proxyUrl, noProxy: '127.0.0.1' });
			expect(direct.tunnelled).toBe(false);
			await direct.client.connect();
			await direct.client.end();
		} finally {
			await new Promise<void>((ok) => proxy.close(() => ok()));
		}
	}, 60_000);
});
