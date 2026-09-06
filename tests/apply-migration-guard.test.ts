// tests/apply-migration-guard.test.ts
//
// The positive controls for `tools/apply-migration.mjs` and
// `supabase/roles/idea_migrator.sql`, driven against a REAL Postgres with the
// REAL role file applied to it, unmodified except for the password placeholder
// a person replaces in the SQL editor.
//
// THE FILENAME IS HISTORICAL AND THE GUARD IS GONE. This file used to prove
// that an event-trigger guard in the database refused `drop table` from
// `idea_migrator`. That guard was written, measured, and cannot be installed:
// `create event trigger` requires superuser and Supabase's `postgres` is not
// one, measured as 42501 against a non-superuser holding CREATEROLE, CREATEDB
// and ownership of the database. See `supabase/roles/idea_migrator.sql`,
// section "WHY THERE IS NO GUARD".
//
// SO THE FIRST DESCRIBE BELOW ASSERTS THE EXPOSURE RATHER THAN THE CONTROL, and
// that is deliberate. A test suite that simply dropped its guard assertions
// would leave a reader with no way to tell "this was removed on purpose" from
// "somebody deleted a failing test". What `idea_migrator` can now do unopposed
// is written down here as passing assertions, so it is a recorded fact rather
// than an absence.
//
//   1. A migration that tries `drop table` is refused BY THE TOOL, before
//      anything is sent -- and the mutation beside it shows the same statement
//      landing when the scan is not consulted, which is what the guard used to
//      prevent.
//   2. A migration that raises in its own self-check is reported as a REFUSAL
//      rather than a crash, and nothing it did survives.
//   3. A migration applied out of order is refused BEFORE it runs -- driven
//      through the real CLI, against a real database, with the real probes.
//   4. A successful apply is verified object by object, and breaking one object
//      afterwards makes that verification fail.
//
// THE PRODUCTION PATH IS UNEXERCISED AND THIS FILE CANNOT EXERCISE IT. No
// session holds a credential for the live project, this one asked for none, and
// the role file has never been pasted successfully anywhere.
//
// AND THE EMBEDDED CLUSTER'S `postgres` IS A SUPERUSER, WHICH IS THE ONE WAY
// THIS FIXTURE IS UNLIKE PRODUCTION AND THE REASON THE ROLE FILE APPLIES HERE
// AT ALL. On a real Supabase project `grant postgres to idea_migrator` is
// expected to be refused on PostgreSQL 16+ (42501: the grantor needs ADMIN
// OPTION on `postgres`, which a non-superuser `postgres` can never hold,
// because a role cannot be granted to itself). Measured separately, outside
// this suite, on a fixture whose `postgres` was a non-superuser: the file
// raised with its own explanation and left no role behind, which is the
// behaviour it is written for. What this suite proves is the OTHER half -- that
// when the grant can land, the file produces the credential it describes.

import { readFileSync, readdirSync } from 'node:fs';
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
	head,
	ledgerPermission,
	LEDGER_DIR,
	makeClient,
	scanFile,
	splitStatements,
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

/**
 * A real ledger entry that permits a migration, and one that refuses. Both are
 * DISCOVERED rather than pinned: the ledger moves every bundle, and a number
 * written down here would be a second thing to edit when it does.
 */
function ledgerIdWhere(permitted: boolean): string {
	const names = readdirSync(LEDGER_DIR)
		.filter((f) => /^\d{4}-.*\.md$/.test(f))
		.sort();
	const hit = names.find(
		(f) => ledgerPermission(readFileSync(join(LEDGER_DIR, f), 'utf8')).permitted === permitted
	);
	if (!hit) throw new Error(`no ledger entry with permitted=${permitted}; the corpus changed shape`);
	return hit.slice(0, 4);
}
const permittingLedgerId = () => ledgerIdWhere(true);
const refusingLedgerId = () => ledgerIdWhere(false);

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
	// The file talks to whoever pasted it. If it stops, that is a finding -- and
	// what it must say now is that there is NO guard, every time, so nobody
	// pastes this believing otherwise.
	expect(notices.join('\n')).toMatch(/THERE IS NO GUARD IN THE DATABASE/);
	expect(notices.join('\n')).toMatch(/the ONLY control is tools\/apply-migration\.mjs/);

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

	it('installs NO event trigger and NO guard function, because it cannot', async () => {
		// The ABSENCE is the assertion. `create event trigger` needs superuser;
		// this cluster's `postgres` HAS superuser, so if the file still tried, it
		// would succeed here and this would redden -- which makes this a real
		// check on the file's contents rather than a restatement of the platform.
		const t = await owner.query(
			`select count(*)::int as n from pg_event_trigger where evtname like 'idea_applier_guard%'`
		);
		expect(t.rows[0].n).toBe(0);
		const sc = await owner.query(
			`select count(*)::int as n from pg_namespace where nspname = 'idea_guard'`
		);
		expect(sc.rows[0].n).toBe(0);
		expect(await guardFingerprint(owner)).toBeNull();
		// And the file must not have left the machinery behind. Asked through the
		// tool's OWN splitter rather than a regex over the text, because the file
		// legitimately says "CREATE EVENT TRIGGER needs superuser" inside a
		// `raise notice` and inside its header, and a text sweep cannot tell that
		// from a statement. The question is whether any TOP-LEVEL STATEMENT is
		// one, which is exactly what `splitStatements` + `head` answer.
		const heads = splitStatements(readFileSync(ROLE_SQL, 'utf8')).map((st) => head(st.text));
		expect(heads.filter((h) => /^create event trigger\b/.test(h))).toEqual([]);
		expect(heads.filter((h) => /^create schema\b.*idea_guard/.test(h))).toEqual([]);
		expect(heads.filter((h) => /returns event_trigger\b/.test(h))).toEqual([]);
		// The positive control on that sweep: it DOES see the statements the file
		// really does carry, so an empty result above is the file and not the
		// parser coming back blank.
		expect(heads.filter((h) => /^alter role idea_migrator\b/.test(h))).toHaveLength(1);
		expect(heads.filter((h) => /^grant postgres to idea_migrator\b/.test(h))).toHaveLength(0);
		expect(heads.some((h) => h.startsWith('do $$'))).toBe(true);
	});

	it('re-applies over itself, because a second paste is ordinary', async () => {
		await expect(owner.query(roleSqlToPaste())).resolves.toBeTruthy();
	});

	it('carries its own reversal, and the reversal names every object it made', () => {
		const text = readFileSync(ROLE_SQL, 'utf8');
		const reversal = text.slice(text.lastIndexOf('\n', text.indexOf('THE REVERSAL')) + 1);
		for (const object of ['revoke postgres from idea_migrator', 'idea_migrator']) {
			expect(reversal).toContain(object);
		}
		// It is commented out, so a careless whole-file paste cannot undo itself.
		expect(reversal).toMatch(/^-- drop role if exists idea_migrator;$/m);
	});

	it('has no real password in it', () => {
		expect(readFileSync(ROLE_SQL, 'utf8')).toContain(PLACEHOLDER);
	});

	it('states in its own header what does not protect the reader', () => {
		// The header IS the deliverable of this bundle. A file that quietly
		// dropped the guard and said nothing is the failure being prevented.
		const text = readFileSync(ROLE_SQL, 'utf8');
		expect(text).toContain('WHAT DOES NOT PROTECT YOU');
		expect(text).toMatch(/NOTHING IN THE DATABASE REFUSES ANYTHING FROM THIS ROLE/);
		expect(text).toMatch(/bypassable by anyone holding this password/);
	});
});

describe('NOTHING IN THE DATABASE REFUSES ANYTHING FROM THIS ROLE', () => {
	// These assertions are the opposite of what this file used to hold, and they
	// are the honest record of what the missing event triggers cost. Each one
	// SUCCEEDS. If one of them ever starts failing, something grew a control and
	// the role file's header is out of date -- which is a finding either way.

	it('lets the scoped role drop a table, which the guard used to refuse', async () => {
		await owner.query('create table public.exposure_a (id int primary key, doomed text)');
		await expect(migrator.query('drop table public.exposure_a')).resolves.toBeTruthy();
		const r = await owner.query(`select to_regclass('public.exposure_a') as t`);
		expect(r.rows[0].t).toBeNull();
	});

	it('lets it drop a column, truncate, delete and update, unopposed', async () => {
		await owner.query('create table public.exposure_b (id int primary key, doomed text)');
		await owner.query("insert into public.exposure_b values (1, 'x'), (2, 'y')");
		await expect(migrator.query('update public.exposure_b set doomed = null')).resolves.toBeTruthy();
		await expect(migrator.query('delete from public.exposure_b where id = 1')).resolves.toBeTruthy();
		await expect(migrator.query('truncate public.exposure_b')).resolves.toBeTruthy();
		await expect(
			migrator.query('alter table public.exposure_b drop column doomed')
		).resolves.toBeTruthy();
		const cols = await owner.query(
			`select count(*)::int as n from information_schema.columns
			 where table_schema = 'public' and table_name = 'exposure_b'`
		);
		expect(cols.rows[0].n).toBe(1);
		await owner.query('drop table public.exposure_b');
	});

	it('CAN mint a second credential through SET ROLE, which the old header denied', async () => {
		// THIS ASSERTION IS A CORRECTION. Both the previous role file and decision
		// 15 said NOCREATEROLE meant "it cannot mint a second credential", on the
		// grounds that role ATTRIBUTES are not inherited through membership. The
		// inheritance half is true and the conclusion is not: `SET ROLE postgres`
		// does not inherit anything, it CHANGES current_user, and the attribute
		// check for `create role` reads current_user. Measured separately against
		// a fixture whose `postgres` was a NON-superuser holding CREATEROLE -- the
		// real Supabase shape -- with the same result, so this is not an artefact
		// of this cluster's superuser `postgres`.
		//
		// The DIRECT path is still refused, which is the half NOCREATEROLE buys.
		await expect(migrator.query("create role sneaky login password 'x'")).rejects.toMatchObject({
			code: '42501'
		});
		// The SET ROLE path is not.
		await migrator.query('set role postgres');
		try {
			const ids = await migrator.query('select current_user as cu, session_user as su');
			expect(ids.rows[0]).toEqual({ cu: 'postgres', su: 'idea_migrator' });
			await expect(migrator.query("create role sneaky2 login password 'x'")).resolves.toBeTruthy();
		} finally {
			await migrator.query('reset role');
		}
		const made = await owner.query(
			`select rolcanlogin from pg_roles where rolname = 'sneaky2'`
		);
		expect(made.rows[0]).toEqual({ rolcanlogin: true });
		await owner.query('drop role sneaky2');
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

describe('control 1: a migration that tries drop table is refused BY THE TOOL', () => {
	// THIS CONTROL MOVED, AND THE MOVE IS THE POINT OF PROMPT 0065. It used to
	// send the file and let the database's event trigger refuse it mid-flight.
	// There is no event trigger, so the refusal has to happen BEFORE the file is
	// sent, in `scanFile`, or it does not happen at all. The second test is the
	// mutation that proves that: the identical statement, sent without consulting
	// the scan, lands.
	const file = `create table public.c1_new (id int);
		 do $$ begin raise notice 'c1: the table was created'; end $$;
		 drop table public.c1_victim;`;

	it('refuses the file before opening a connection at all', () => {
		const refusals = scanFile(file).findings.filter((f) => f.kind === 'refuse');
		expect(refusals.map((f) => f.what)).toEqual(['drop table']);
		// The line reported is the statement's own, not the file's first.
		expect(refusals[0].line).toBe(3);
	});

	it('MUTATION: sent anyway, the drop lands, because nothing in the database refuses it', async () => {
		await owner.query('create table public.c1_victim (id int)');
		const notices: string[] = [];
		const client = new pg.Client({ connectionString: url });
		client.on('notice', (n) => notices.push(n.message ?? ''));
		await client.connect();
		try {
			// `applyInTransaction` is the sending half and does NOT re-run the
			// scan -- `main()` is what refuses. So this is exactly what a `psql`
			// prompt holding the password would do, which is the exposure the
			// role file's header names in words.
			const result = await applyInTransaction(
				client,
				file,
				false,
				notices.map((m) => ({ severity: 'NOTICE', message: m }))
			);
			expect(result.ok).toBe(true);
		} finally {
			await client.end();
		}
		const after = await owner.query(
			`select to_regclass('public.c1_new') as made, to_regclass('public.c1_victim') as victim`
		);
		expect(after.rows[0].made).toBe('c1_new');
		expect(after.rows[0].victim).toBeNull();
		expect(notices.join('\n')).toContain('c1: the table was created');
		await owner.query('drop table public.c1_new');
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
		// `--ledger` names a bundle that WAS permitted a migration, because since
		// prompt 0066 the ledger gate runs before the ordering rule and this test
		// is about the ordering rule. The entry is discovered rather than pinned:
		// a hard-coded number here would be a second place to edit whenever the
		// ledger moves. The next test is the control for the gate itself.
		const permittingLedger = permittingLedgerId();
		const run = spawnSync(
			process.execPath,
			[
				'tools/apply-migration.mjs',
				'0180',
				'--since',
				'151',
				'--ref',
				'origin/integration',
				'--ledger',
				permittingLedger
			],
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

	it('refuses at the LEDGER GATE before it opens a connection, when the bundle was permitted nothing', async () => {
		// The control for the change above. Same file, same everything, except
		// the ledger entry named is one that says "Migration permitted: no" --
		// and the refusal now arrives without a session_user line, because no
		// connection was opened at all.
		const refusingLedger = refusingLedgerId();
		const run = spawnSync(
			process.execPath,
			[
				'tools/apply-migration.mjs',
				'0180',
				'--since',
				'151',
				'--ref',
				'origin/integration',
				'--ledger',
				refusingLedger
			],
			{ cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, IDEA_MIGRATION_URL: url }, timeout: 60_000 }
		);
		expect(run.status).toBe(EXIT.refused);
		expect(run.stdout).toMatch(/Migration permitted: no/);
		expect(run.stdout).toMatch(/no connection was opened/);
		expect(run.stdout).not.toMatch(/session_user/);
		expect(run.stdout + run.stderr).not.toContain(TEST_PASSWORD);
	}, 60_000);

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

	it('reports the guard as absent on both sides, which is now the unchanging answer', async () => {
		// The fingerprint check is kept because it costs one query and it is the
		// only thing that would notice an event trigger appearing. Its answer is
		// null before and null after, and `guardMoved` is therefore false, so a
		// clean apply still exits `applied` rather than `unverified`.
		const client = new pg.Client({ connectionString: url });
		await client.connect();
		try {
			const before = await guardFingerprint(client);
			expect(before).toBeNull();
			const result = await applyInTransaction(
				client,
				'create table public.c4_after (id int);',
				false,
				[]
			);
			expect(result.ok).toBe(true);
			const after = await guardFingerprint(client);
			expect(after).toBeNull();
			expect(after).toBe(before);
		} finally {
			await client.end();
		}
		// POSITIVE CONTROL on the fingerprint itself: it is null because there is
		// no such function, not because the query always answers null. Create one
		// by hand -- which only works here because this cluster's postgres is a
		// superuser -- and the fingerprint appears.
		await owner.query('create schema if not exists idea_guard');
		await owner.query(
			`create or replace function idea_guard.applier_guard() returns event_trigger
			 language plpgsql as $g$ begin end $g$`
		);
		expect(await guardFingerprint(owner)).toMatch(/^[0-9a-f]{32}$/);
		await owner.query('drop schema idea_guard cascade');
		expect(await guardFingerprint(owner)).toBeNull();
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
