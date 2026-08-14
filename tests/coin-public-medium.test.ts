// tests/coin-public-medium.test.ts
//
// Migration 0103's DISPLAY-LAYER reads, against a real Postgres with the real
// migration files applied (see tests/db/harness.ts).
//
// DELIBERATELY NARROW, the coin-public-ledger / coin-medium convention. There
// is exactly one guarantee here worth a test, and it is the one that fails
// SILENTLY:
//
//   A PAYOUT MOVED COINS BETWEEN TWO MEDIA THE SAME STUDENT ALREADY HELD, SO
//   IT IS NEITHER INCOME NOR SPENDING.
//
// 0089 defined `awarded` as every positive row and `spent` as every negative
// non-fine row, which was exactly right when every row was a real event. Since
// 0096 a payout writes one of each, so a student who withdrew 40i¢ reads as
// having earned 40 more and spent 40 more than they did — and the Ledger's
// "Lifetime Earned" headline is computed from those very columns. Nothing
// errors, nothing looks broken, and the page's own `awarded - fines - spent`
// STILL LANDS ON THE RIGHT TOTAL, because the inflation cancels. That last
// part is why this needs a test rather than an eyeball: the arithmetic a
// reader would use to check it agrees with the wrong numbers.
//
// The rest is what the page needs in order to show one withdrawal instead of
// two rows, and the 0089 boundary those additions must not breach.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/** 0103's own chain: 0089's, plus everything 0096 needs, plus 0096 and 0103. */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0070_coin_economy.sql',
	'0072_coin_my_eating_pass_status.sql',
	'0073_coin_sections.sql',
	'0074_coin_roles.sql',
	'0076_coin_role_quiz_and_expiration.sql',
	'0077_coin_contracts.sql',
	'0079_coin_bulk_payout.sql',
	'0080_coin_category_admin.sql',
	'0081_coin_debt_payment.sql',
	'0084_coin_legacy_import.sql',
	'0087_coin_weekly_wage_tier.sql',
	'0089_coin_public_ledger.sql',
	'0096_coin_medium.sql',
	'0103_coin_public_medium_display.sql'
] as const;

let db: TestDb;
let owner: SeededUser;
let mover: SeededUser; // withdraws coins
let plain: SeededUser; // never withdraws — the control

const SECTION = 'eng1h-sophomore';

interface BoardRow {
	student_id: string;
	name: string;
	awarded: number;
	fines: number;
	spent: number;
	paid_out: number;
	balance: number;
	physical_balance: number;
	digital_balance: number;
}

async function board(): Promise<Record<string, BoardRow>> {
	const { rows } = await db.asAnon((q) =>
		q<BoardRow>(`select * from public.coin_public_leaderboard()`)
	);
	const byName: Record<string, BoardRow> = {};
	for (const r of rows) byName[r.name] = r;
	return byName;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	mover = await createUser(db, 'ada.lovelace@boscotech.net', 'Ada Lovelace');
	plain = await createUser(db, 'grace.hopper@boscotech.net', 'Grace Hopper');

	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			SECTION,
			'Engineering I Honors — Sophomore',
			'#00FF41',
			null,
			true
		]);
		await q(`select public.coin_admin_assign_section_students($1, $2::text[])`, [
			SECTION,
			[mover.email, plain.email]
		]);

		// Ada: 100i¢ digital in, a 3i¢ physical fine, 20i¢ physical in, a 3i¢
		// physical purchase, and then a 40i¢ WITHDRAWAL — one real event
		// stored as two rows.
		await q(`select public.coin_admin_adjust_balance($1, 100, 'opening balance', 'digital')`, [
			mover.email
		]);
		await q(`select public.coin_log_transaction($1, 'disruptive_behavior', null, null, null, 'physical')`, [
			mover.email
		]);
		await q(`select public.coin_admin_adjust_balance($1, 20, 'physical opening', 'physical')`, [
			mover.email
		]);
		await q(`select public.coin_log_transaction($1, 'song_request', null, null, null, 'physical')`, [
			mover.email
		]);
		await q(`select public.coin_payout_student($1, 'test withdrawal', 40)`, [mover.email]);

		// Grace withdraws nothing at all: the control that keeps the exclusion
		// from being indistinguishable from "these columns are always zero".
		await q(`select public.coin_admin_adjust_balance($1, 50, 'opening balance', 'digital')`, [
			plain.email
		]);
		await q(`select public.coin_log_transaction($1, 'song_request', null, null, null, 'digital')`, [
			plain.email
		]);
	});
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('a transfer is neither earned nor spent', () => {
	test('the withdrawal really did write two linked rows', async () => {
		const { rows } = await db.sql<{ n: number; ids: number }>(
			`select count(*)::int as n, count(distinct transfer_id)::int as ids
			   from public.coin_transactions
			  where student_email = $1 and transfer_id is not null`,
			[mover.email]
		);
		// Two halves, one id. If this ever reads 1, everything below is
		// asserting the absence of something that was never there.
		expect(rows[0].n).toBe(2);
		expect(rows[0].ids).toBe(1);
	});

	test('awarded and spent both exclude it, and the total does not move', async () => {
		const b = await board();
		const ada = b['Ada Lovelace'];

		// Positives that are real income: 100 opening + 20 physical opening.
		// The transfer's +40 physical credit is NOT among them.
		expect(ada.awarded).toBe(120);
		// Negative non-fine rows that are real spending: the 3i¢ song
		// request. The transfer's -40 digital debit is NOT among them.
		expect(ada.spent).toBe(3);
		expect(ada.fines).toBe(3); // disruptive_behavior

		// The balance is the sum of everything, transfer included — and it is
		// unchanged by the withdrawal, because the two halves cancel.
		expect(ada.balance).toBe(114);
		expect(ada.physical_balance + ada.digital_balance).toBe(ada.balance);

		// THE PAGE'S OWN ARITHMETIC. It computes this identity client-side, and
		// it held BEFORE this migration too — with both components 40 too big.
		// That is the whole reason the inflation was invisible.
		expect(ada.awarded - ada.fines - ada.spent).toBe(ada.balance);
	});

	test('the withdrawal IS counted as paid out', async () => {
		const b = await board();
		// "How much has left the digital balance as coins in hand" is a real
		// question, and this is its answer. Excluding a transfer from awarded
		// and spent must not quietly erase the withdrawal itself.
		expect(b['Ada Lovelace'].paid_out).toBe(40);
		expect(b['Grace Hopper'].paid_out).toBe(0);
	});

	test('a student who never withdrew is unaffected', async () => {
		const b = await board();
		const grace = b['Grace Hopper'];
		expect(grace.awarded).toBe(50);
		expect(grace.spent).toBe(3);
		expect(grace.balance).toBe(47);
		expect(grace.awarded - grace.fines - grace.spent).toBe(grace.balance);
	});

	test('the media are the two halves of the total, and physical can be negative', async () => {
		const b = await board();
		const ada = b['Ada Lovelace'];
		// 20 opening - 3 fine - 3 song request + 40 credited by the payout.
		expect(ada.physical_balance).toBe(54);
		// 100 opening - 40 debited by the payout.
		expect(ada.digital_balance).toBe(60);

		// A physical balance really can go under zero, and the board reports it
		// rather than clamping — the drawer renders it in the negative colour.
		await db.asUser(owner.id, (q) =>
			q(`select public.coin_admin_adjust_balance($1, -70, 'fined past what she held', 'physical')`, [
				mover.email
			])
		);
		const after = (await board())['Ada Lovelace'];
		expect(after.physical_balance).toBe(-16);
		expect(after.physical_balance + after.digital_balance).toBe(after.balance);
		await db.asUser(owner.id, (q) =>
			q(`select public.coin_admin_adjust_balance($1, 70, 'undo', 'physical')`, [mover.email])
		);
	});
});

describe('the page can tell one withdrawal from two events', () => {
	test('both halves are typed Payout and share the transfer id', async () => {
		const { rows } = await db.asAnon((q) =>
			q<{ amount: number; type: string; medium: string; transfer_id: string | null }>(
				`select amount, type, medium, transfer_id
				   from public.coin_public_transactions(5000)
				  where transfer_id is not null order by amount`
			)
		);
		expect(rows.length).toBe(2);
		// WITHOUT the type branch, the physical credit's own category
		// (payout_physical_credit, kind `adjustment`) would type it as an
		// Adjustment — indistinguishable from a real balance correction.
		expect(rows.map((r) => r.type)).toEqual(['Payout', 'Payout']);
		expect(rows[0].transfer_id).toBe(rows[1].transfer_id);
		expect(rows[0].transfer_id).toMatch(/^[0-9a-f-]{36}$/);
		// A debit from one medium and an equal credit into the other.
		expect(rows[0]).toMatchObject({ amount: -40, medium: 'digital' });
		expect(rows[1]).toMatchObject({ amount: 40, medium: 'physical' });
	});

	test('an ordinary row carries a medium and NO transfer id', async () => {
		const { rows } = await db.asAnon((q) =>
			q<{ amount: number; type: string; medium: string; transfer_id: string | null }>(
				`select amount, type, medium, transfer_id
				   from public.coin_public_transactions(5000)
				  where reason = 'Balance Correction / Refund' and amount = 100`
			)
		);
		expect(rows.length).toBe(1);
		// The STORED SIGN, positive, on an adjustment — the row the old page
		// rendered as a red -100.
		expect(rows[0]).toMatchObject({ amount: 100, type: 'Adjustment', medium: 'digital' });
		expect(rows[0].transfer_id).toBeNull();
	});

	test("the drawer's history carries both fields too", async () => {
		const id = (await board())['Ada Lovelace'].student_id;
		const detail = await db.asAnon(async (q) => {
			const { rows } = await q<{ d: Record<string, unknown> }>(
				`select public.coin_public_student($1) as d`,
				[id]
			);
			return rows[0].d;
		});
		expect(detail.balance).toBe(114);
		expect(detail.physical_balance).toBe(54);
		expect(detail.digital_balance).toBe(60);

		const history = detail.history as { amount: number; type: string; medium: string; transfer_id: string | null }[];
		const pair = history.filter((h) => h.transfer_id !== null);
		expect(pair.length).toBe(2);
		expect(pair[0].transfer_id).toBe(pair[1].transfer_id);
		expect(pair.map((h) => h.type)).toEqual(['Payout', 'Payout']);
		expect(pair.map((h) => h.amount).sort((a, b) => a - b)).toEqual([-40, 40]);
		expect(history.every((h) => h.medium === 'physical' || h.medium === 'digital')).toBe(true);
	});
});

describe('the 0089 boundary is untouched', () => {
	test('no address in any of the three widened reads', async () => {
		const id = (await board())['Ada Lovelace'].student_id;
		const text = await db.asAnon(async (q) => {
			const payloads = {
				leaderboard: (await q(`select * from public.coin_public_leaderboard()`)).rows,
				transactions: (await q(`select * from public.coin_public_transactions(5000)`)).rows,
				student: (await q(`select public.coin_public_student($1) as d`, [id])).rows
			};
			return JSON.stringify(payloads);
		});
		// Not vacuous: the rows are there and the names are in them.
		expect(text).toContain('Ada Lovelace');
		expect(text).toContain('transfer_id');
		expect(text).not.toMatch(/@boscotech/i);
		expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
	});

	test('anon may still execute exactly these reads and nothing new', async () => {
		for (const sig of [
			'coin_public_leaderboard()',
			'coin_public_transactions(integer)',
			'coin_public_student(text)'
		]) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', 'public.${sig}', 'execute') as ok`
			);
			expect(rows[0].ok, sig).toBe(true);
		}
		// The email-keyed table these read is still unreachable directly.
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_table_privilege('anon', 'public.coin_transactions', 'select') as ok`
		);
		expect(rows[0].ok).toBe(false);
	});

	test('the widened feed left exactly one signature behind', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'coin_public_transactions'`
		);
		// Adding an output column is a return-type change, so the old function
		// is dropped first — a survivor would be a second overload PostgREST
		// could not resolve.
		expect(rows[0].n).toBe(1);
	});
});
