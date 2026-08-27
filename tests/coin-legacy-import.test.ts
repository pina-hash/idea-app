// tests/coin-legacy-import.test.ts
//
// Migration 0084's legacy Sheets import, against a real Postgres with the
// real migrations applied (see tests/db/harness.ts). DELIBERATELY NARROW,
// the coin-contracts.test.ts convention: these are the guarantees that would
// regress SILENTLY -- an import that signed a type wrong, stamped today's
// semester on 2026-05 history, let an old eating-pass purchase read as an
// active pass, or paid a completed contract a second time would all look
// like a perfectly successful migration until someone audited a balance.
//
//   1. Sign mapping per type (Award / "Award - Held" credit; Fine /
//      "Fine - Owed" / Purchase / Payout debit).
//   2. semester_key derived from the HISTORICAL date, not now().
//   3. The legacy categories refuse coin_log_transaction while the raw
//      import inserts them anyway.
//   4. An imported old eating-pass purchase leaves coin_eating_pass_active()
//      FALSE, and a live-system pass purchase after import still works.
//   5. The debt lockout is a live-only rule: the import succeeds for a
//      student whose history nets negative.
//   6. Contracts land in their terminal states with claims and NO payout
//      transactions created.
//   7. Reconciliation returns 0 diff on the fixture -- batch-scoped, so live
//      activity logged between import and verify never reads as a mismatch.
//   8. Idempotency: a batch cannot commit twice, and no batch can commit
//      while another committed batch exists un-rolled-back.
//   9. Rollback removes exactly the batch's rows and nothing else, and a
//      clean re-import succeeds afterwards.
//  10. The permission boundary (student refused by every RPC, admin-only
//      reads, no anon EXECUTE).

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, MIGRATIONS, type SeededUser, type TestDb } from './db/harness';

let db: TestDb;

let owner: SeededUser; // pinned admin: apina@boscotech.edu
let student: SeededUser;

const MARIA = 'maria.alvarez@boscotech.net';
const BEN = 'ben.okafor@boscotech.net';
const JO = 'jo.cruz@example.com'; // the External row: any valid email
const SAM = 'sam.delgado@boscotech.net';

/**
 * A small synthetic snapshot exercising every transaction type (Held / Owed
 * variants included), an 'External'-section row, an old eating-pass
 * purchase, all three contract statuses, and a multi-contractor split.
 * Every summary row's columns sum exactly from its transactions, mirroring
 * the verified property of the real sheet.
 */
const FIXTURE_RAW = {
	source: { note: 'synthetic test fixture' },
	summary: [
		// Net -7: awarded 50 - fines 12 - spent 45 - paid 0. The debt case AND
		// the eating-pass purchaser.
		{ row: 2, name: 'Alvarez, Maria', section: 'IDEA-113', wage: 1, awarded: 50, fines: 12, spent: 45, coin_balance: 0, paid_out: 0, bank_balance: 0, debt: 7 },
		// Net 160 -- rich enough to buy the NEW 150i¢ pass after import.
		{ row: 3, name: 'Okafor, Ben', section: 'IDEA-208-1', wage: 1, awarded: 200, fines: 10, spent: 20, coin_balance: 0, paid_out: 10, bank_balance: 0, debt: 0 },
		// External section: relaxed domain.
		{ row: 4, name: 'Cruz, Jo', section: 'External', wage: 1, awarded: 15, fines: 5, spent: 0, coin_balance: 0, paid_out: 0, bank_balance: 0, debt: 0 },
		// Zero activity (the real sheet has 11 such rows).
		{ row: 5, name: 'Delgado, Sam', section: 'IDEA-113', wage: 1, awarded: 0, fines: 0, spent: 0, coin_balance: 0, paid_out: 0, bank_balance: 0, debt: 0 }
	],
	transactions: [
		{ row: 2, date: '2026-05-05 12:00', name: 'Alvarez, Maria', amount: 30, type: 'Award', reason: 'Weekly Wage' },
		{ row: 3, date: '2026-05-06 09:15', name: 'Alvarez, Maria', amount: 20, type: 'Award - Held', reason: 'Legacy Wealth Declaration' },
		{ row: 4, date: '2026-05-07 10:00', name: 'Alvarez, Maria', amount: 7, type: 'Fine', reason: 'Unprofessional Conduct' },
		{ row: 5, date: '2026-05-08 11:30', name: 'Alvarez, Maria', amount: 5, type: 'Fine - Owed', reason: 'Late fine, still owed' },
		{ row: 6, date: '2026-05-18 22:37', name: 'Alvarez, Maria', amount: 40, type: 'Purchase', reason: 'Basic Classroom Eating Pass' },
		{ row: 7, date: '2026-05-19 13:00', name: 'Alvarez, Maria', amount: 5, type: 'Purchase', reason: 'Song Request' },
		{ row: 8, date: '2026-05-05 12:01', name: 'Okafor, Ben', amount: 150, type: 'Award', reason: 'Competition Winnings' },
		{ row: 9, date: '2026-05-06 12:02', name: 'Okafor, Ben', amount: 50, type: 'Award - Held', reason: 'Held award' },
		{ row: 10, date: '2026-05-07 12:03', name: 'Okafor, Ben', amount: 10, type: 'Fine', reason: 'Shop Not Cleaned Up' },
		{ row: 11, date: '2026-05-08 12:04', name: 'Okafor, Ben', amount: 20, type: 'Purchase', reason: '3D Printing' },
		{ row: 12, date: '2026-05-09 12:05', name: 'Okafor, Ben', amount: 10, type: 'Payout', reason: 'Physical coin payout' },
		{ row: 13, date: '2026-05-10 12:06', name: 'Cruz, Jo', amount: 15, type: 'Award', reason: 'Above and Beyond' },
		{ row: 14, date: '2026-05-11 12:07', name: 'Cruz, Jo', amount: 5, type: 'Fine', reason: 'Disruptive Behavior' }
	],
	contracts: [
		{ row: 2, name: 'Paint the parts shelf', base_payout: 10, rate_label: '', quantity: 1, total_payout: 10, status: 'Open', contractors: [] as string[], split: '', notes: 'Prime and paint.', date_added: '2026-05-20', date_completed: '' },
		{ row: 3, name: 'Fix Go-Cart', base_payout: 30, rate_label: '', quantity: 1, total_payout: 30, status: 'In Progress', contractors: ['Alvarez, Maria', 'Okafor, Ben'], split: '', notes: '', date_added: '2026-05-21', date_completed: '' },
		{ row: 4, name: 'Label 24x Safety Glasses', base_payout: 4, rate_label: '', quantity: 1, total_payout: 4, status: 'Completed', contractors: ['Okafor, Ben', 'Cruz, Jo'], split: '2,2', notes: '', date_added: '2026-05-20', date_completed: '2026-05-26' }
	],
	contract_history: [] as unknown[]
};

const MAPPINGS = [
	{ legacy_name: 'Alvarez, Maria', email: MARIA, status: 'pattern' },
	{ legacy_name: 'Okafor, Ben', email: BEN, status: 'profile' },
	{ legacy_name: 'Cruz, Jo', email: JO, status: 'external' },
	{ legacy_name: 'Delgado, Sam', email: SAM, status: 'hand' }
];

let batchId: string;

/** Fails loudly if the statement SUCCEEDS; otherwise hands back the error. */
async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

// jsonb parameters are always passed as JSON strings: node-postgres formats a
// JS array parameter as a Postgres ARRAY literal ({...}), which is not jsonb.
async function rpc(userId: string, call: string, params: unknown[]): Promise<Record<string, unknown>> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ r: Record<string, unknown> }>(`select ${call} as r`, params);
		return rows[0].r;
	});
}

async function createBatch(raw: unknown = FIXTURE_RAW): Promise<string> {
	const r = await rpc(owner.id, 'public.coin_admin_create_import_batch($1::jsonb)', [JSON.stringify(raw)]);
	expect(r.ok).toBe(true);
	return r.batch_id as string;
}

async function commit(id: string, mappings: unknown = MAPPINGS): Promise<Record<string, unknown>> {
	return rpc(owner.id, 'public.coin_admin_import_legacy($1, $2::jsonb)', [id, JSON.stringify(mappings)]);
}

async function balanceOf(email: string): Promise<number> {
	const { rows } = await db.sql<{ b: number | null }>(
		'select coalesce(sum(amount), 0)::int as b from public.coin_transactions where student_email = $1',
		[email]
	);
	return rows[0].b ?? 0;
}

beforeAll(async () => {
	// 0084 tags coin_contracts (0077), which references coin_sections (0073);
	// everything else it touches is in the notebook chain already (0070's
	// ledger + 0067's admin tier).
	db = await startTestDb([
		...MIGRATIONS,
		'0073_coin_sections.sql',
		'0077_coin_contracts.sql',
		'0084_coin_legacy_import.sql',
		'0137_anon_execute_sweep.sql'
	]);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	student = await createUser(db, 'some.student@boscotech.net', 'Some Student');

	batchId = await createBatch();
}, 180_000);

afterAll(async () => {
	await db.stop();
});

describe('legacy categories', () => {
	test('seeded retired: loggable = false, active = false, kind-matched', async () => {
		const { rows } = await db.sql<{ id: string; kind: string; loggable: boolean; active: boolean; pricing_model: string }>(
			`select id, kind, loggable, active, pricing_model from public.coin_categories
			 where id like 'legacy_%' order by id`
		);
		expect(rows).toEqual([
			{ id: 'legacy_award', kind: 'award', loggable: false, active: false, pricing_model: 'variable' },
			{ id: 'legacy_fine', kind: 'fine', loggable: false, active: false, pricing_model: 'variable' },
			{ id: 'legacy_payout', kind: 'purchase', loggable: false, active: false, pricing_model: 'variable' },
			{ id: 'legacy_purchase', kind: 'purchase', loggable: false, active: false, pricing_model: 'variable' }
		]);
	});

	test('coin_log_transaction refuses them even for an admin', async () => {
		const err = await captureError(() =>
			rpc(owner.id, 'public.coin_log_transaction($1, $2, $3, null, $4)', [
				MARIA,
				'legacy_award',
				5,
				'should never land'
			])
		);
		expect(err.message).toMatch(/cannot be logged directly/i);
	});
});

describe('commit validation', () => {
	test('refuses an incomplete mapping, naming the unmapped names', async () => {
		const r = await commit(batchId, MAPPINGS.slice(0, 3)); // Sam missing
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('unmapped_name');
		expect(r.names).toContain('Delgado, Sam');
	});

	test('refuses two names mapped to one email', async () => {
		const dupes = MAPPINGS.map((m) =>
			m.legacy_name === 'Cruz, Jo' ? { ...m, email: MARIA } : m
		);
		const r = await commit(batchId, dupes);
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('duplicate_email');
		expect(r.email).toBe(MARIA);
	});

	test('nothing landed while refused', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.coin_transactions where category_id like 'legacy_%'`
		);
		expect(rows[0].n).toBe(0);
	});
});

describe('the import itself', () => {
	test('commits with the full mapping', async () => {
		const r = await commit(batchId);
		expect(r.ok).toBe(true);
		expect(r.students).toBe(4);
		expect(r.transactions).toBe(13);
		expect(r.contracts).toBe(3);
		expect(r.claims).toBe(4);
		const results = r.results as { email: string; ok: boolean; transactions: number; amount: number }[];
		expect(results).toHaveLength(4);
		expect(results.find((x) => x.email === SAM)).toEqual({
			email: SAM,
			name: 'Delgado, Sam',
			ok: true,
			transactions: 0,
			amount: 0
		});
	});

	test('signs per type: awards credit, everything else debits', async () => {
		const { rows } = await db.sql<{ category_id: string; amount: number; legacy_type: string }>(
			`select category_id, amount, meta ->> 'legacy_type' as legacy_type
			 from public.coin_transactions
			 where student_email = $1 and meta ->> 'import_batch' = $2
			 order by created_at`,
			[MARIA, batchId]
		);
		expect(rows).toEqual([
			{ category_id: 'legacy_award', amount: 30, legacy_type: 'Award' },
			{ category_id: 'legacy_award', amount: 20, legacy_type: 'Award - Held' },
			{ category_id: 'legacy_fine', amount: -7, legacy_type: 'Fine' },
			{ category_id: 'legacy_fine', amount: -5, legacy_type: 'Fine - Owed' },
			{ category_id: 'legacy_purchase', amount: -40, legacy_type: 'Purchase' },
			{ category_id: 'legacy_purchase', amount: -5, legacy_type: 'Purchase' }
		]);

		const ben = await db.sql<{ amount: number }>(
			`select amount from public.coin_transactions
			 where student_email = $1 and category_id = 'legacy_payout'`,
			[BEN]
		);
		expect(ben.rows).toEqual([{ amount: -10 }]);
	});

	test('semester_key comes from the historical date, not today', async () => {
		const { rows } = await db.sql<{ semester_key: string; match: boolean }>(
			`select semester_key,
				created_at = ('2026-05-05 12:00'::timestamp at time zone 'America/Los_Angeles') as match
			 from public.coin_transactions
			 where student_email = $1 and amount = 30 and meta ->> 'import_batch' = $2`,
			[MARIA, batchId]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].semester_key).toBe('2026-spring');
		expect(rows[0].match).toBe(true);

		// Today (2026-08+) is a different semester, so the column DEFAULT would
		// have stamped every row wrongly -- the thing this asserts against.
		const now = await db.sql<{ k: string }>('select public.coin_semester_key() as k');
		expect(now.rows[0].k).not.toBe('2026-spring');
	});

	test('balances land at Awarded - Fines - Spent - Paid Out, negatives included', async () => {
		expect(await balanceOf(MARIA)).toBe(-7);
		expect(await balanceOf(BEN)).toBe(160);
		expect(await balanceOf(JO)).toBe(10);
		expect(await balanceOf(SAM)).toBe(0);
	});

	test('the coin_students directory carries the sheet names verbatim', async () => {
		const { rows } = await db.sql<{ student_email: string; display_name: string; legacy_section: string; source: string }>(
			'select student_email, display_name, legacy_section, source from public.coin_students order by student_email'
		);
		expect(rows).toEqual([
			{ student_email: BEN, display_name: 'Okafor, Ben', legacy_section: 'IDEA-208-1', source: `legacy-import:${batchId}` },
			{ student_email: JO, display_name: 'Cruz, Jo', legacy_section: 'External', source: `legacy-import:${batchId}` },
			{ student_email: MARIA, display_name: 'Alvarez, Maria', legacy_section: 'IDEA-113', source: `legacy-import:${batchId}` },
			{ student_email: SAM, display_name: 'Delgado, Sam', legacy_section: 'IDEA-113', source: `legacy-import:${batchId}` }
		]);
	});
});

describe('no live rule reads legacy history as its own', () => {
	test('an imported eating-pass purchase does NOT read as an active pass', async () => {
		const { rows } = await db.sql<{ active: boolean }>(
			'select public.coin_eating_pass_active($1) as active',
			[MARIA]
		);
		expect(rows[0].active).toBe(false);
	});

	test('a live-system pass purchase after import still works', async () => {
		const r = await rpc(owner.id, 'public.coin_log_transaction($1, $2, null, null, null)', [
			BEN,
			'eating_pass'
		]);
		expect(r.ok).toBe(true);
		expect(r.amount).toBe(-150);
		const { rows } = await db.sql<{ active: boolean }>(
			'select public.coin_eating_pass_active($1) as active',
			[BEN]
		);
		expect(rows[0].active).toBe(true);
	});

	test('the debt lockout stayed a live-only rule: import succeeded net-negative, live purchases refuse', async () => {
		// The import for Maria (net -7) already succeeded above; the LIVE rule
		// still sees the legacy debt, which is correct -- she owes.
		const r = await rpc(owner.id, 'public.coin_log_transaction($1, $2, null, null, null)', [
			MARIA,
			'song_request'
		]);
		expect(r).toMatchObject({ ok: false, reason: 'debt', balance: -7 });
	});
});

describe('contracts', () => {
	test('land in their terminal states with claims', async () => {
		const { rows } = await db.sql<{
			title: string;
			payout_amount: number;
			max_contractors: number;
			completed: boolean;
			cancelled: boolean;
			claims: string[] | null;
			created_ok: boolean;
			completed_ok: boolean | null;
		}>(
			`select c.title, c.payout_amount, c.max_contractors,
				c.completed_at is not null as completed,
				c.cancelled_at is not null as cancelled,
				(select array_agg(k.student_email order by k.student_email)
					from public.coin_contract_claims k where k.contract_id = c.id) as claims,
				c.created_at = ('2026-05-21'::timestamp at time zone 'America/Los_Angeles')
					or c.created_at = ('2026-05-20'::timestamp at time zone 'America/Los_Angeles') as created_ok,
				c.completed_at = ('2026-05-26'::timestamp at time zone 'America/Los_Angeles') as completed_ok
			 from public.coin_contracts c
			 where c.import_batch = $1
			 order by c.title`,
			[batchId]
		);
		expect(rows).toEqual([
			{
				title: 'Fix Go-Cart',
				payout_amount: 30,
				max_contractors: 2,
				completed: false,
				cancelled: false,
				claims: [BEN, MARIA].sort(),
				created_ok: true,
				completed_ok: null
			},
			{
				title: 'Label 24x Safety Glasses',
				payout_amount: 4,
				max_contractors: 2,
				completed: true,
				cancelled: false,
				claims: [BEN, JO].sort(),
				created_ok: true,
				completed_ok: true
			},
			{
				title: 'Paint the parts shelf',
				payout_amount: 10,
				max_contractors: 1,
				completed: false,
				cancelled: false,
				claims: null,
				created_ok: true,
				completed_ok: null
			}
		]);
	});

	test('NO payout transactions were created for the completed contract', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.coin_transactions where category_id = 'contract_completion'`
		);
		expect(rows[0].n).toBe(0);
	});
});

describe('reconciliation', () => {
	test('0 diff for every student, batch-scoped past live activity', async () => {
		// Ben bought a live pass (-150, untagged) between import and verify;
		// the batch-scoped actual must still equal the sheet expectation.
		const r = await rpc(owner.id, 'public.coin_admin_import_reconcile($1)', [batchId]);
		expect(r.ok).toBe(true);
		expect(r.all_zero).toBe(true);
		const rows = r.rows as { email: string; expected: number; actual: number; diff: number; live_balance: number }[];
		expect(rows).toHaveLength(4);
		const ben = rows.find((x) => x.email === BEN)!;
		expect(ben).toMatchObject({ expected: 160, actual: 160, diff: 0, live_balance: 10 });
		const maria = rows.find((x) => x.email === MARIA)!;
		expect(maria).toMatchObject({ expected: -7, actual: -7, diff: 0 });
		const sam = rows.find((x) => x.email === SAM)!;
		expect(sam).toMatchObject({ expected: 0, actual: 0, diff: 0 });
		const totals = r.totals as Record<string, number>;
		expect(totals.mismatches).toBe(0);
		expect(totals.batch_transactions).toBe(13);
		expect(totals.batch_contracts).toBe(3);
	});
});

describe('idempotency', () => {
	test('the same batch cannot commit twice', async () => {
		const r = await commit(batchId);
		expect(r).toMatchObject({ ok: false, reason: 'batch_already_committed' });
	});

	test('no other batch can commit while one is committed', async () => {
		const second = await createBatch();
		const r = await commit(second);
		expect(r).toMatchObject({ ok: false, reason: 'another_batch_committed', batch_id: batchId });
	});
});

describe('rollback', () => {
	test('removes exactly the batch rows; untagged follow-ups survive', async () => {
		// An untagged follow-up: the eating-pass refund the VERIFY step logs.
		const refund = await rpc(owner.id, 'public.coin_admin_adjust_balance($1, $2, $3)', [
			MARIA,
			40,
			'Legacy eating pass refund - refund-only policy (v3 item 9)'
		]);
		expect(refund.ok).toBe(true);

		const r = await rpc(owner.id, 'public.coin_admin_rollback_import($1)', [batchId]);
		expect(r).toMatchObject({
			ok: true,
			transactions_deleted: 13,
			contracts_deleted: 3,
			claims_deleted: 4,
			students_deleted: 4
		});

		const legacy = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.coin_transactions where meta ->> 'import_batch' = $1`,
			[batchId]
		);
		expect(legacy.rows[0].n).toBe(0);
		const contracts = await db.sql<{ n: number }>(
			'select count(*)::int as n from public.coin_contracts where import_batch = $1',
			[batchId]
		);
		expect(contracts.rows[0].n).toBe(0);
		const students = await db.sql<{ n: number }>('select count(*)::int as n from public.coin_students');
		expect(students.rows[0].n).toBe(0);

		// The refund correction and Ben's live pass purchase both survive.
		expect(await balanceOf(MARIA)).toBe(40);
		expect(await balanceOf(BEN)).toBe(-150);

		const batch = await db.sql<{ committed_at: string | null; report: unknown }>(
			'select committed_at, report from public.coin_import_batches where id = $1',
			[batchId]
		);
		expect(batch.rows[0].committed_at).toBeNull();
		expect(batch.rows[0].report).toBeNull();
	});

	test('rollback of an uncommitted batch is a structured refusal', async () => {
		const r = await rpc(owner.id, 'public.coin_admin_rollback_import($1)', [batchId]);
		expect(r).toMatchObject({ ok: false, reason: 'not_committed' });
	});

	test('a clean re-import succeeds afterwards and still reconciles to zero', async () => {
		const r = await commit(batchId);
		expect(r.ok).toBe(true);
		// Legacy history is back UNDER the live follow-ups: full balances shift,
		// batch-scoped reconciliation still reads exactly the sheet.
		expect(await balanceOf(MARIA)).toBe(33); // 40 refund + (-7) legacy
		expect(await balanceOf(BEN)).toBe(10); // -150 live pass + 160 legacy
		const rec = await rpc(owner.id, 'public.coin_admin_import_reconcile($1)', [batchId]);
		expect(rec.all_zero).toBe(true);
		const students = await db.sql<{ n: number }>('select count(*)::int as n from public.coin_students');
		expect(students.rows[0].n).toBe(4);
	});
});

describe('mapping drafts', () => {
	test('upserts the whole array in one call, idempotently', async () => {
		const first = await rpc(owner.id, 'public.coin_admin_save_import_mappings($1::jsonb)', [
			JSON.stringify(MAPPINGS)
		]);
		expect(first).toMatchObject({ ok: true, saved: 4 });

		const changed = MAPPINGS.map((m) =>
			m.legacy_name === 'Delgado, Sam' ? { ...m, email: 'samuel.delgado@boscotech.net' } : m
		);
		const second = await rpc(owner.id, 'public.coin_admin_save_import_mappings($1::jsonb)', [
			JSON.stringify(changed)
		]);
		expect(second).toMatchObject({ ok: true, saved: 4 });

		const count = await db.sql<{ n: number }>(
			'select count(*)::int as n from public.coin_import_mappings'
		);
		expect(count.rows[0].n).toBe(4);
		const { rows } = await db.sql<{ email: string }>(
			`select email from public.coin_import_mappings where legacy_name = 'Delgado, Sam'`
		);
		expect(rows[0].email).toBe('samuel.delgado@boscotech.net');
	});
});

describe('permission boundary', () => {
	test('a student is refused by every import RPC', async () => {
		for (const call of [
			['public.coin_admin_create_import_batch($1::jsonb)', [JSON.stringify(FIXTURE_RAW)]],
			['public.coin_admin_import_legacy($1, $2::jsonb)', [batchId, JSON.stringify(MAPPINGS)]],
			['public.coin_admin_rollback_import($1)', [batchId]],
			['public.coin_admin_import_reconcile($1)', [batchId]],
			['public.coin_admin_save_import_mappings($1::jsonb)', [JSON.stringify(MAPPINGS)]]
		] as const) {
			const err = await captureError(() => rpc(student.id, call[0], [...call[1]]));
			expect(err.message).toMatch(/only site admins/i);
		}
	});

	test('the three tables are admin-read-only and never client-writable', async () => {
		const reads = await db.asUser(student.id, async (q) => {
			const students = await q('select * from public.coin_students');
			const batches = await q('select * from public.coin_import_batches');
			const mappings = await q('select * from public.coin_import_mappings');
			return [students.rows.length, batches.rows.length, mappings.rows.length];
		});
		expect(reads).toEqual([0, 0, 0]);

		const asOwner = await db.asUser(owner.id, (q) =>
			q('select count(*)::int as n from public.coin_students')
		);
		expect((asOwner.rows[0] as { n: number }).n).toBe(4);

		for (const stmt of [
			`insert into public.coin_students (student_email, display_name) values ('x@boscotech.net', 'X')`,
			`insert into public.coin_import_batches (raw) values ('{}'::jsonb)`,
			`insert into public.coin_import_mappings (legacy_name) values ('X, Y')`,
			`delete from public.coin_students`,
			`update public.coin_import_batches set committed_at = null`
		]) {
			const asStudent = await captureError(() => db.asUser(student.id, (q) => q(stmt)));
			expect(asStudent.code).toBe('42501');
			const asAdmin = await captureError(() => db.asUser(owner.id, (q) => q(stmt)));
			expect(asAdmin.code).toBe('42501');
		}
	});

	test('anon holds no EXECUTE on any import function', async () => {
		const { rows } = await db.sql<{ fn: string; ok: boolean }>(
			`select p.oid::regprocedure::text as fn,
				has_function_privilege('anon', p.oid, 'execute') as ok
			 from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and (
				p.proname like 'coin_admin_import%'
				or p.proname in ('coin_admin_create_import_batch', 'coin_admin_save_import_mappings', 'coin_admin_rollback_import')
			 )`
		);
		expect(rows.length).toBeGreaterThanOrEqual(5);
		for (const row of rows) {
			expect(row.ok).toBe(false);
		}
	});
});
