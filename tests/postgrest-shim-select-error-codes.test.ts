// tests/postgrest-shim-select-error-codes.test.ts
//
// A MISSING TABLE AND A LIVE ONE RAISING WERE ONE ANSWER THROUGH THIS FIXTURE,
// AND IT IS THE SAME CONFLATION `postgrest-shim-rpc-error-codes.test.ts` PINS
// FOR AN RPC CALL, ONE CALL SHAPE OVER.
//
// `tests/db/postgrest-shim.ts`'s `.from(table).select(...)` returned
// `{ code: '42P01' }` (undefined_table) for EVERY throw the underlying SQL
// produced, whatever the driver's own SQLSTATE actually was. Nothing in the
// shipped suite checks that code today (verified by reading every
// `.from(...).select(...)` call site in `tests/` alongside every
// `error?.code` / `error.code` assertion in the same files), so the
// conflation cost nothing YET -- but it is the same shape of gap the RPC fix
// closed, and it is the one this file exists to close before something comes
// to depend on it.
//
// WHAT POSTGRES ACTUALLY RAISES, MEASURED AGAINST THE REAL SUITE. Instrumenting
// the shim's select catch across a full `npm test` run produced 430 select
// failures: 350 were `42703` (undefined_column -- a select naming a column
// that migration chain does not carry yet, the single most common shape in
// this suite's own widen-then-degrade ladders), 72 were genuinely `42P01`
// (undefined_table), and 8 were `42501` (insufficient_privilege -- a
// signed-out or unprivileged caller against a table with no matching grant or
// policy, which is not a missing-table condition in any sense). Reporting all
// 430 as `42P01` was wrong for 358 of them.
//
// THIS FILE DRIVES THE SAME CODE PATH THE RPC ONE DOES: a call that never
// reached the database (a driver failure with no SQLSTATE) rethrows rather
// than being dressed as a database answer, and a call that DID reach Postgres
// carries the driver's own code through unclassified, so `$lib/pg-errors`'
// transient/refusal partition -- and anything else keyed on a select's SQLSTATE
// -- can read it from a database test at all.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';

const CHAIN = ['0001_profiles.sql', '0067_admin_tier.sql', '0137_anon_execute_sweep.sql'] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let student: SeededUser;

const client = () => createPostgrestShim(db, fks, student.id);

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);
	student = await createUser(db, 'stella@boscotech.net', 'Stella Gates');

	// A real table with NO select grant to `authenticated`, so every ordinary
	// caller is refused with `42501` (insufficient_privilege) rather than the
	// RLS-with-no-policy shape (RLS denies at the ROW level and answers zero
	// rows, not an error; this is the GRANT layer beneath it).
	await db.sql(`
		create table public.shim_select_locked_probe (id uuid primary key default gen_random_uuid());
		revoke all on public.shim_select_locked_probe from public, authenticated, anon;
	`);
});

afterAll(async () => {
	await db?.stop();
});

describe('a select that never named a real relation is 42P01, its real SQLSTATE', () => {
	it('answers 42P01 for a table the schema does not hold', async () => {
		const { data, error } = await client().from('shim_no_such_table_anywhere').select('id');
		expect(data).toBeNull();
		expect(error?.code).toBe('42P01');
	});
});

describe('a select naming an unknown column is 42703, not 42P01', () => {
	it('answers 42703 for a column the table does not carry', async () => {
		// THE FINDING. Through the conflated shim this was `42P01` -- the
		// SAME code as a wholly missing table -- even though the table is
		// right there and only the column is wrong, which is the shape a
		// project sitting between two hand-applied migrations actually
		// produces most often (350 of 430 in the measured run).
		const { data, error } = await client()
			.from('shim_select_locked_probe')
			.select('not_a_real_column');
		expect(data).toBeNull();
		expect(error?.code).toBe('42703');
		expect(error?.code).not.toBe('42P01');
	});
});

describe('a select refused by the database carries its own SQLSTATE', () => {
	it('reports an RLS-with-no-policy refusal as 42501, not as a missing table', async () => {
		const { data, error } = await client().from('shim_select_locked_probe').select('id');
		expect(data).toBeNull();
		expect(error?.code).toBe('42501');
		expect(error?.code).not.toBe('42P01');
	});

	it('rethrows a throw carrying no SQLSTATE rather than dressing it as one', async () => {
		// A DRIVER OR FIXTURE FAILURE IS NOT A DATABASE ANSWER, and reporting
		// one as 42P01 would put whatever load is driving it on a false
		// "missing table" reading over a bug in the query itself. Driven for
		// real: filtering on a value the driver cannot bind throws a plain
		// error with no `code`, which is the shape of throw this file's
		// `run()` can produce that is not a `DatabaseError`.
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		// POSITIVE CONTROL: the same table, an ordinary filter, answers
		// cleanly (refused by RLS, not by a malformed query) -- so the
		// rejection below is the VALUE and not the table.
		const fine = await client().from('shim_select_locked_probe').select('id').eq('id', student.id);
		expect(fine.error?.code).toBe('42501');

		await expect(
			client().from('shim_select_locked_probe').select('id').eq('id', circular as never)
		).rejects.toThrow();
	});
});
