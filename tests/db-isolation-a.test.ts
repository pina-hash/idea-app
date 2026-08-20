// tests/db-isolation-a.test.ts
//
// HALF ONE OF THE ISOLATION PROOF. See tests/db-isolation-b.test.ts.
//
// Every DB file now shares one Postgres cluster instead of booting its own, so
// "files cannot see each other's rows" stopped being free and became a claim.
// This file deliberately leaves state behind -- a marker table, a row in a real
// feature table, and a role-visible object -- and its partner fails if any of
// it is visible over there. An isolation scheme nobody has proven can leak is a
// scheme nobody has tested.
//
// It deliberately does NOT drop what it made, and deliberately does NOT stop
// its database in an afterAll, so the leak has the best chance it will ever get.

import { describe, expect, it, beforeAll } from 'vitest';
import { createUser, startTestDb, type TestDb } from './db/harness';

import { LEAK_TABLE, LEAK_EMAIL, LEAK_SEQUENCE } from './db/isolation-markers';

let db: TestDb;

beforeAll(async () => {
	db = await startTestDb();
}, 180_000);

// NOTE: no afterAll. The database is left running on the shared cluster on
// purpose; the whole point is to give the next file something to find.

describe('isolation fixture A: leaves state behind on purpose', () => {
	it('creates a marker table that must not exist anywhere else', async () => {
		await db.sql(`create table public.${LEAK_TABLE} (note text)`);
		await db.sql(`insert into public.${LEAK_TABLE} (note) values ('left behind by file A')`);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.${LEAK_TABLE}`
		);
		expect(rows[0].n).toBe('1');
	});

	it('writes a real profile row through the real trigger', async () => {
		const user = await createUser(db, LEAK_EMAIL, 'Isolation Leak');
		const { rows } = await db.sql<{ email: string }>(
			'select email from public.profiles where id = $1',
			[user.id]
		);
		expect(rows[0].email).toBe(LEAK_EMAIL);
	});

	it('leaves a sequence value advanced, which a shared catalog would carry', async () => {
		await db.sql(`create sequence public.${LEAK_SEQUENCE} start 41`);
		const { rows } = await db.sql<{ v: string }>(
			`select nextval('public.${LEAK_SEQUENCE}')::text as v`
		);
		expect(rows[0].v).toBe('41');
	});
});
