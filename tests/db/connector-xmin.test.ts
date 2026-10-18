// tests/db/connector-xmin.test.ts
//
// THE ROWS-WRITTEN READ, PROVEN RATHER THAN ASSUMED (ledger 0400). 0270's
// `_connector_rows_written` keeps a log-table row when its xmin is at or above
// the id the call started with AND pg_xact_status says that xmin is still in
// progress. This file holds three properties of that against real Postgres:
//
//   1. a row written in a SUBTRANSACTION (an exception block) is reported; the
//      naive "xmin = the top-level transaction id" provably misses it, which is
//      the positive control that the subtransaction case is real;
//   2. a row another transaction committed is never reported;
//   3. on a commit, the reported rows are exactly the rows a before/after diff
//      of every log table finds (an instrument that shares nothing with 0270).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectorWorld, logDiff, logSnapshot, type ConnectorWorld } from './connector-fixture';

let w: ConnectorWorld;

beforeAll(async () => {
	w = await connectorWorld();
	// A test-only registry row: coin_fine_log logs through a per-student
	// exception block, so its writes land in subtransactions.
	await w.backend.syncRegistry([{ function_name: 'coin_fine_log', tool: 'test', level: 'undo' }]);
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

async function asAdmin<T>(fn: (q: (t: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) => Promise<T>) {
	return w.db.asUser(w.admin.id, async (q) => {
		await q(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: w.admin.id, role: 'authenticated', email: w.admin.email })]);
		return fn(q as never);
	});
}

describe('which rows a connector write reports', () => {
	it('a subtransaction write is invisible to "xmin = top xid" and visible to the in-progress test', async () => {
		const client = await w.pool.connect();
		try {
			await client.query('begin');
			const top = (await client.query(`select pg_current_xact_id()::text::bigint as x`)).rows[0].x;
			await client.query('savepoint s1');
			await client.query(
				`insert into public.coin_transactions (student_email, category_id, amount, note, actor_email, medium)
				 values ($1, 'balance_correction', 1, 'subtxn probe', 'probe@boscotech.edu', 'digital')`,
				[w.students.mateo]
			);
			await client.query('release savepoint s1');
			const naive = await client.query(
				`select count(*)::int as n from public.coin_transactions where note = 'subtxn probe' and xmin::text::bigint = ($1::bigint % 4294967296)`,
				[top]
			);
			const exact = await client.query(
				`select count(*)::int as n from public.coin_transactions t
				  where note = 'subtxn probe'
				    and pg_xact_status(((pg_snapshot_xmax(pg_current_snapshot())::text::bigint / 4294967296) * 4294967296 + t.xmin::text::bigint)::text::xid8) = 'in progress'`
			);
			expect(naive.rows[0].n).toBe(0);
			expect(exact.rows[0].n).toBe(1);
			await client.query('rollback');
		} finally {
			client.release();
		}
	});

	it('reports the rows a fine written through a per-student exception block wrote, and no committed neighbour', async () => {
		// A neighbour, committed by another transaction just before.
		await w.db.sql(
			`insert into public.coin_transactions (student_email, category_id, amount, note, actor_email, medium)
			 values ($1, 'balance_correction', 2, 'committed neighbour', 'probe@boscotech.edu', 'digital')`,
			[w.students.leo]
		);
		const before = await logSnapshot((t, p) => w.db.sql(t, p) as never);
		const res = await asAdmin((q) =>
			q(`select public.connector_call('test', 'coin_fine_log', $1::jsonb, 'id:xmin-fine', 'commit') as r`, [
				JSON.stringify({ p_emails: [w.students.mateo, w.students.danielR], p_category_id: 'disruptive_behavior', p_note: 'xmin test' })
			])
		);
		const out = res.rows[0].r as { rows: Array<{ table: string; row: Record<string, unknown> }>; result: { succeeded: number } };
		expect(out.result.succeeded).toBe(2);
		const reported = out.rows.filter((r) => r.table === 'coin_transactions');
		expect(reported.map((r) => r.row.student_email).sort()).toEqual([w.students.danielR, w.students.mateo].sort());
		expect(out.rows.some((r) => r.row.note === 'committed neighbour')).toBe(false);

		// The independent instrument: a before/after diff of every log table.
		const after = await logSnapshot((t, p) => w.db.sql(t, p) as never);
		const diff = logDiff(before, after);
		const counted = [...diff.entries()].map(([t, rows]) => [t, rows.length] as const).sort();
		const fromCall = Object.entries(
			out.rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.table]: (acc[r.table] ?? 0) + 1 }), {})
		).sort();
		expect(fromCall).toEqual(counted);
		expect(counted.length).toBeGreaterThan(0);
	});

	// THE SKIP FILTER IS A SUPERSET, AND ONLY THE SUPERSET DIRECTION MATTERS.
	// Measured here: the per-backend pending counters can still hold a previous
	// transaction's insert (they flush lazily), so "zero before" is not a
	// property of Postgres 17. What 0270 relies on is the other direction: a
	// table this transaction wrote is never read as zero, so it is never skipped.
	it('a table this transaction wrote is never skipped by the transaction statistics', async () => {
		const client = await w.pool.connect();
		try {
			await client.query('begin');
			const oid = (await client.query(`select 'public.coin_transactions'::regclass::oid as o`)).rows[0].o;
			const zero = await client.query(`select pg_stat_get_xact_tuples_inserted($1) as n`, [oid]);
			await client.query(
				`insert into public.coin_transactions (student_email, category_id, amount, note, actor_email, medium)
				 values ($1, 'balance_correction', 1, 'stat probe', 'probe@boscotech.edu', 'digital')`,
				[w.students.mateo]
			);
			const one = await client.query(`select pg_stat_get_xact_tuples_inserted($1) as n`, [oid]);
			expect(Number(one.rows[0].n)).toBeGreaterThanOrEqual(1);
			expect(Number(one.rows[0].n)).toBe(Number(zero.rows[0].n) + 1);
			await client.query('rollback');
		} finally {
			client.release();
		}
	});
});
