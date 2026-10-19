// tests/db/connector-permissions.test.ts
//
// THE CONNECTOR CAN NEVER EXCEED WHAT THE ACCOUNT CAN DO (docs/connector/
// DESIGN.md section 5). For EVERY write entry in the registry:
//
//   - as a student, as a teacher who is not an admin, and signed out, the call
//     through connector_call raises exactly the refusal the direct call raises,
//     compared text for text (and where a direct call would succeed, the
//     connector refuses and writes nothing);
//   - as the admin, the direct call and the connector call write identical rows
//     in every connector_log_tables table apart from ids and timestamps. The
//     connector's audit row is the only extra, and it is not a log table.
//
// Each case runs inside a transaction that is rolled back, so the direct call
// and the connector call start from the same database. The rows are judged by
// a before/after diff of every log table read as the connection owner, an
// instrument that shares nothing with 0270's own rows-written read.
//
// A write entry with no SAMPLE below fails the suite: a new write the registry
// gains is a write this file has to be told how to call. A GENERIC-proof entry
// (every generated one, ledger 0416) gets placeholder arguments of the right
// types from connector-samples.ts and is held to the first half only: nobody
// but an admin gets anything through it, and nothing is written.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { connectorWorld, logDiff, logSnapshot, normalizeRow, type ConnectorWorld } from './connector-fixture';
import { connectorSamples, isGeneric, OWNER_ONLY, type Args, type Samples } from './connector-samples';
import { registryRows, schemaOf } from '../../src/lib/server/connector/registry';

let w: ConnectorWorld;
let S: Samples;
const ADMIN_REFUSAL = 'The IDEA Website connector is for site admins.';

/** The direct call, built from the generated schema: the instrument the connector is compared against. */
function directSql(fn: string, args: Args): string {
	const overloads = schemaOf(fn);
	const keys = Object.keys(args);
	const o = overloads.find((ov) => keys.every((k) => ov.args.some((a) => a.name === k)) && ov.args.filter((a) => !a.has_default).every((a) => keys.includes(a.name)));
	if (!o) throw new Error(`no overload of ${fn} for ${keys.join(',')}`);
	const parts = o.args
		.filter((a) => keys.includes(a.name))
		.map((a) => {
			if (a.type === 'jsonb' || a.type === 'json') return `${a.name} => nullif($1::jsonb -> '${a.name}', 'null'::jsonb)::${a.type}`;
			if (a.type.endsWith('[]')) return `${a.name} => (case when jsonb_typeof($1::jsonb -> '${a.name}') = 'array' then array(select jsonb_array_elements_text($1::jsonb -> '${a.name}')) end)::${a.type}`;
			return `${a.name} => ($1::jsonb ->> '${a.name}')::${a.type}`;
		});
	return `select to_jsonb(public.${fn}(${parts.join(', ')})) as r where $1::jsonb is not null`;
}

type Who = { kind: 'user'; id: string; email: string } | { kind: 'anon' };

/** Runs `sql` as `who` inside a transaction that is rolled back; answers the error text or null, and the log-table diff. */
async function attempt(who: Who, sql: string, params: unknown[]): Promise<{ error: string | null; diff: Map<string, string[]> }> {
	const client: pg.PoolClient = await w.pool.connect();
	try {
		await client.query('begin');
		const q = (t: string, p?: unknown[]) => client.query(t, p) as unknown as Promise<{ rows: Record<string, unknown>[] }>;
		const before = await logSnapshot(q);
		if (who.kind === 'user') {
			await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.id, role: 'authenticated', email: who.email })]);
			await client.query('set local role authenticated');
		} else {
			await client.query(`select set_config('request.jwt.claims', '', true)`);
			await client.query('set local role anon');
		}
		// One seed for every call, so a function that draws at random (a seed
		// shuffle) draws the same order through the connector as directly.
		await client.query('select setseed(0.42)');
		let error: string | null = null;
		await client.query('savepoint call');
		try {
			await client.query(sql, params);
		} catch (e) {
			error = (e as Error).message;
			await client.query('rollback to savepoint call');
		}
		await client.query('reset role');
		const after = await logSnapshot(q);
		return { error, diff: logDiff(before, after) };
	} finally {
		await client.query('rollback').catch(() => {});
		client.release();
	}
}

function normalized(diff: Map<string, string[]>): Record<string, string[]> {
	return Object.fromEntries([...diff.entries()].map(([t, rows]) => [t, rows.map(normalizeRow).sort()]).sort());
}

const CONNECTOR_SQL = `select public.connector_call('permission-test', $2, $1::jsonb, $3, 'commit') as r`;

beforeAll(async () => {
	w = await connectorWorld();
	S = connectorSamples(w);
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

const WRITES = registryRows().filter((r) => r.level !== 'read');

describe('the connector reaches exactly what the account reaches', () => {
	it('names a sample for every write entry in the registry', () => {
		expect(WRITES.length).toBeGreaterThanOrEqual(150);
		expect(WRITES.map((r) => r.function_name).filter((f) => !S.samples[f])).toEqual([]);
		// And no sample for an entry the registry no longer has.
		const names = new Set(WRITES.map((r) => r.function_name));
		expect(Object.keys(S.samples).filter((f) => !names.has(f))).toEqual([]);
	});

	for (const entry of WRITES) {
		it(`${entry.function_name}: refusals match text for text, and the admin's rows match the direct call's`, async () => {
			const sample = S.samples[entry.function_name];
			expect(sample, `a sample for ${entry.function_name}`).toBeDefined();
			const args = await sample();
			const direct = directSql(entry.function_name, args);
			let key = 0;
			const nextKey = () => `id:perm:${entry.function_name}:${(key += 1)}:${Math.random()}`;

			const ownerOnly = OWNER_ONLY.has(entry.function_name);
			const owner = ownerOnly ? await S.owner() : null;
			const others: Array<[string, Who]> = [
				['student', { kind: 'user', id: w.student.id, email: w.student.email }],
				['teacher', { kind: 'user', id: w.teacher.id, email: w.teacher.email }],
				['signed out', { kind: 'anon' }],
				// An owner-only function: the admin who is not the owner is one more caller it refuses.
				...(ownerOnly ? ([['admin, not the owner', { kind: 'user', id: w.admin.id, email: w.admin.email }]] as Array<[string, Who]>) : [])
			];
			let refusedCases = 0;
			for (const [label, who] of others) {
				const d = await attempt(who, direct, [JSON.stringify(args)]);
				const c = await attempt(who, CONNECTOR_SQL, [JSON.stringify(args), entry.function_name, nextKey()]);
				if (d.error !== null) {
					expect(c.error, `${label}: the connector's refusal`).toBe(d.error);
					refusedCases += 1;
				} else {
					expect(c.error, `${label}: a direct call that worked`).toBe(ADMIN_REFUSAL);
				}
				expect(normalized(c.diff), `${label}: nothing written through the connector`).toEqual({});
			}
			// Whether a caller who is not an admin gets a raised refusal or a
			// structured {ok: false}, the connector refuses and writes nothing
			// (checked above); the count is reported, not required.
			expect(refusedCases).toBeGreaterThanOrEqual(0);
			// A generic-proof entry (ledger 0416) was called with placeholder
			// arguments: the half above is its proof; what the admin's real call
			// writes has no sample to say.
			if (isGeneric(entry.function_name)) return;

			const adminWho: Who = owner
				? { kind: 'user', id: owner.id, email: owner.email }
				: { kind: 'user', id: w.admin.id, email: w.admin.email };
			const d = await attempt(adminWho, direct, [JSON.stringify(args)]);
			const c = await attempt(adminWho, CONNECTOR_SQL, [JSON.stringify(args), entry.function_name, nextKey()]);
			expect(d.error, 'the admin direct call').toBeNull();
			expect(c.error, 'the admin connector call').toBeNull();
			const direct_rows = normalized(d.diff);
			expect(Object.keys(direct_rows).length, 'the direct call wrote to at least one log table').toBeGreaterThan(0);
			expect(normalized(c.diff)).toEqual(direct_rows);
		});
	}
});
