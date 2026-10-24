// tests/db/coin-contracts-retired.test.ts
//
// the retirement file (ledger 0432, feedback 00463d19, gap 3f52bae9): contracts are retired.
// The chain is booted SHORT of the retirement file and contracts are made through the real
// pre-migration RPCs: an open job nobody took, the IDEA Coin Launcher job
// assigned to a student, a job a student claimed and marked done (a card
// waiting in the queue, which approval would PAY), and a job already done.
// Then the retirement file is applied over the top, twice.
//
// The silent guarantees, each with its control:
//   - nobody is paid: the coin ledger holds exactly the rows it held before,
//     and the waiting card is cancelled rather than approved;
//   - the already-done job keeps its own completion time (not rewritten);
//   - no client can post, claim, finish or pay a contract afterwards, while
//     the reads a coin page makes still answer;
//   - a staff account calling a student action is told it is a staff account
//     (the gap's "not_in_economy" reproduced first), and a student is not.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createUser, type SeededUser, type TestDb, startTestDb } from './harness';

type Json = Record<string, unknown>;
const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = ALL.find((f) => /_coin_contracts_retired\.sql$/.test(f))!;
const NUM = FILE.slice(0, 4);
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < NUM)];

let db: TestDb;
let admin: SeededUser, ana: SeededUser, leo: SeededUser;
let open: string, launcher: string, claimed: string, done: string;
let doneAt: string;
let ledgerBefore: number;
let gapReason: unknown;

const as = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}
const count = async (sql: string, params: unknown[] = []) => Number((await db.sql<{ n: string }>(sql, params)).rows[0].n);
const contract = async (id: string) =>
	(await db.sql<{ completed_at: string | null; cancelled_at: string | null; cancel_reason: string | null }>(
		`select completed_at::text, cancelled_at::text, cancel_reason from public.coin_contracts where id = $1`,
		[id]
	)).rows[0];

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	leo = await createUser(db, 'leo@boscotech.net', 'Leo Park');
	const post = async (title: string) =>
		(await as<{ id: string }>(admin, `public.coin_contract_post($1, 'Do it.', 'flat', 4, null, 2, null, false)`, [title])).id;
	open = await post('Fix the printer');
	launcher = await post('IDEA Coin Launcher');
	claimed = await post('Sweep IDEA Shop');
	done = await post('Old job');
	expect((await as<Json>(admin, `public.coin_admin_assign_contract($1::uuid, $2)`, [launcher, leo.email])).ok).toBe(true);
	expect((await as<Json>(ana, `public.coin_contract_self_claim($1::uuid)`, [claimed])).ok).toBe(true);
	expect((await as<Json>(ana, `public.coin_contract_mark_done($1::uuid)`, [claimed])).ok).toBe(true);
	await db.sql(`update public.coin_contracts set completed_at = '2026-10-01T12:00:00Z' where id = $1`, [done]);
	doneAt = (await contract(done)).completed_at!;
	// THE GAP, reproduced: the student's own "done" action run as staff.
	gapReason = (await as<Json>(admin, `public.coin_contract_mark_done($1::uuid)`, [launcher])).reason;
	ledgerBefore = await count(`select count(*) as n from public.coin_transactions`);
	expect(await count(`select count(*) as n from public.coin_requests where kind = 'contract' and status = 'pending'`)).toBe(1);

	await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

describe(`${NUM} closes every contract and pays nobody`, () => {
	test('the gap reproduced before the file: staff got "not_in_economy"', () => {
		expect(gapReason).toBe('not_in_economy');
	});
	test('re-applies cleanly and writes nothing the second time', async () => {
		const before = await db.sql(`select id, completed_at, cancelled_at from public.coin_contracts order by id`);
		await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
		const after = await db.sql(`select id, completed_at, cancelled_at from public.coin_contracts order by id`);
		expect(after.rows).toEqual(before.rows);
	});
	test('no contract is open; the Coin Launcher is done, the rest cancelled', async () => {
		expect(await count(`select count(*) as n from public.coin_contracts where completed_at is null and cancelled_at is null`)).toBe(0);
		const l = await contract(launcher);
		expect(l.completed_at).not.toBeNull();
		expect(l.cancelled_at).toBeNull();
		for (const id of [open, claimed]) {
			const c = await contract(id);
			expect(c.cancelled_at).not.toBeNull();
			expect(c.completed_at).toBeNull();
			expect(c.cancel_reason).toMatch(/IDEA Market/);
		}
	});
	test('an already finished contract keeps its own completion time', async () => {
		expect((await contract(done)).completed_at).toBe(doneAt);
		expect((await contract(done)).cancelled_at).toBeNull();
	});
	test('nobody is paid: the ledger is unchanged and the waiting card is cancelled', async () => {
		expect(await count(`select count(*) as n from public.coin_transactions`)).toBe(ledgerBefore);
		expect(await count(`select count(*) as n from public.coin_requests where kind = 'contract' and status = 'pending'`)).toBe(0);
		expect(await count(`select count(*) as n from public.coin_requests where kind = 'contract' and status = 'cancelled'`)).toBe(1);
		expect(await count(`select count(*) as n from public.coin_transactions where category_id = 'contract_completion'`)).toBe(0);
	});
	test('claims stay as the record', async () => {
		expect(await count(`select count(*) as n from public.coin_contract_claims`)).toBe(2);
	});
});

describe(`${NUM} closes the way in`, () => {
	test('posting, claiming, finishing and paying are closed to every client', async () => {
		for (const [u, call, params] of [
			[admin, `public.coin_contract_post('New', 'x', 'flat', 2, null, 1, null, false)`, []],
			[ana, `public.coin_contract_self_claim($1::uuid)`, [open]],
			[ana, `public.coin_contract_mark_done($1::uuid)`, [claimed]],
			[admin, `public.coin_admin_assign_contract($1::uuid, $2)`, [open, ana.email]],
			[admin, `public.coin_admin_restore_contract($1::uuid)`, [open]]
		] as [SeededUser, string, unknown[]][]) {
			expect(await refusal(as(u, call, params))).toMatch(/permission denied/);
		}
		const granted = await count(
			`select count(*) as n from pg_proc p where p.pronamespace = 'public'::regnamespace
			 and p.proname like any (array['coin_contract_%', 'coin_admin_%contract'])
			 and p.proname not in ('coin_contracts_admin')
			 and has_function_privilege('authenticated', p.oid, 'execute')`
		);
		expect(granted).toBe(0);
	});
	test('the reads a coin page makes still answer (control)', async () => {
		const mine = await as<unknown[]>(ana, 'public.coin_my_contracts()');
		expect(Array.isArray(mine)).toBe(true);
		expect(Array.isArray(await as<unknown[]>(admin, 'public.coin_contracts_admin()'))).toBe(true);
	});
});

describe(`${NUM} the student seam names a staff caller`, () => {
	test('a staff account is told it is a staff account', async () => {
		expect((await as<Json>(admin, 'public.coin_buy_pay_raise()')).reason).toBe('staff_account');
	});
	test('a student passes the seam (control: refused for money, not for who they are)', async () => {
		const r = await as<Json>(ana, 'public.coin_buy_pay_raise()');
		expect(r.reason).not.toBe('staff_account');
		expect(r.reason).not.toBe('not_in_economy');
	});
});
