// tests/db-isolation-b.test.ts
//
// HALF TWO OF THE ISOLATION PROOF. Partner to tests/db-isolation-a.test.ts.
//
// A ran before this file, on the SAME shared cluster, and deliberately left a
// table, a profile row and a sequence behind without dropping its database.
// This file must not be able to see any of it.
//
// THE POSITIVE CONTROL IS WHAT MAKES THIS WORTH ANYTHING. Three "cannot see
// it" assertions pass just as happily against a database that was never
// written to, against a file that happened to run first, and against a harness
// that quietly failed to connect. So before asserting absence, this file proves
// from the cluster's own catalog that A's database IS still there with A's rows
// still in it: the leak is real and present, and the only reason it is not
// visible here is the isolation boundary.
//
// To confirm it still bites: make startTestDb hand back a pool pointed at a
// fixed database name instead of a fresh one, and this file goes red.

import { describe, expect, it, beforeAll, afterAll, inject } from 'vitest';
import pg from 'pg';
import { startTestDb, type TestDb } from './db/harness';
import { LEAK_TABLE, LEAK_EMAIL, LEAK_SEQUENCE } from './db/isolation-markers';

let db: TestDb;
/** Every other idea_test_* database on the cluster. A's is in here. */
let neighbourDatabases: string[] = [];
/** Neighbours that actually carry A's marker table. */
let neighboursHoldingTheLeak = 0;

function adminClient(database: string): pg.Client {
	const cluster = inject('pgCluster');
	return new pg.Client({
		host: cluster.host,
		port: cluster.port,
		user: cluster.user,
		password: cluster.password,
		database
	});
}

beforeAll(async () => {
	db = await startTestDb();

	const cluster = inject('pgCluster');
	const admin = adminClient(cluster.maintenanceDatabase);
	await admin.connect();
	try {
		const { rows } = await admin.query<{ datname: string }>(
			`select datname from pg_database where datname like 'idea_test_%' order by datname`
		);
		neighbourDatabases = rows
			.map((r) => r.datname)
			.filter((name) => name !== db.databaseName);
	} finally {
		await admin.end().catch(() => {});
	}

	// Read A's leak directly, on the same cluster, so the absence assertions
	// below are known to be running against a cluster that really does hold it.
	for (const name of neighbourDatabases) {
		const client = adminClient(name);
		await client.connect();
		try {
			const { rows } = await client.query<{ n: string }>(
				`select count(*)::text as n from information_schema.tables where table_schema = 'public' and table_name = $1`,
				[LEAK_TABLE]
			);
			if (rows[0].n !== '0') neighboursHoldingTheLeak += 1;
		} finally {
			await client.end().catch(() => {});
		}
	}
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('isolation fixture B: the shared cluster does not leak between files', () => {
	it('POSITIVE CONTROL: A left a database behind on this cluster, with its leak in it', () => {
		expect(neighbourDatabases.length).toBeGreaterThan(0);
		expect(neighboursHoldingTheLeak).toBeGreaterThan(0);
	});

	it('POSITIVE CONTROL: this file has its own migrated database, not an empty one', async () => {
		// Without this, all three absence assertions below would also pass
		// against a database with no schema in it whatsoever.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from information_schema.tables where table_schema = 'public' and table_name = 'profiles'`
		);
		expect(rows[0].n).toBe('1');
	});

	it('cannot see the marker TABLE A created', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from information_schema.tables where table_schema = 'public' and table_name = $1`,
			[LEAK_TABLE]
		);
		expect(rows[0].n).toBe('0');
	});

	it('cannot see the profile ROW A wrote through the real trigger', async () => {
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.profiles where email = $1',
			[LEAK_EMAIL]
		);
		expect(rows[0].n).toBe('0');
	});

	it('cannot see the SEQUENCE A advanced', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from information_schema.sequences where sequence_schema = 'public' and sequence_name = $1`,
			[LEAK_SEQUENCE]
		);
		expect(rows[0].n).toBe('0');
	});

	it('its own database is genuinely separate: writing the same names here is fine', async () => {
		// The strongest form of the claim. If these two shared a catalog, this
		// would collide with what A already created rather than succeed.
		await db.sql(`create table public.${LEAK_TABLE} (note text)`);
		await db.sql(`create sequence public.${LEAK_SEQUENCE} start 1`);
		const { rows } = await db.sql<{ v: string }>(
			`select nextval('public.${LEAK_SEQUENCE}')::text as v`
		);
		expect(rows[0].v).toBe('1');
	});
});
