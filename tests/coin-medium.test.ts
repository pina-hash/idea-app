// tests/coin-medium.test.ts
//
// Migration 0096's two-balance model, against a real Postgres with the real
// migration files applied (see tests/db/harness.ts). DELIBERATELY NARROW, the
// notebook-security.test.ts convention: this is not a feature test suite, it
// is a suite for the guarantees that regress SILENTLY. Every one of these
// produces a WRONG NUMBER rather than an error -- a debt lockout reading the
// total instead of the medium blocks nothing visible, a payout that debits
// without crediting quietly destroys physical coins, and a bulk override that
// does not apply pays the right student the wrong way with nothing to notice.
//
// THE CHAIN IS APPLIED IN TWO HALVES, ON PURPOSE. Everything up to 0089 goes
// on first, real pre-0096 activity is logged through the REAL 0087 RPCs, and
// only THEN is 0096 applied over the top -- the 0085/0095 migration-over-real-
// data shape. That is the only way to assert what the backfill actually did to
// rows that already existed, which is the one thing that cannot be re-derived
// afterward.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/** Everything 0096 depends on, in order. */
const CHAIN_BEFORE = [
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
	'0089_coin_public_ledger.sql'
] as const;

let db: TestDb;
let owner: SeededUser; // the pinned admin, apina@boscotech.edu
let student: SeededUser;

/** Balances a pre-0096 row was logged for, captured before the migration ran. */
let preMigrationTotal: number;

const EMAIL = {
	legacy: 'legacy.student@boscotech.net',
	main: 'main.student@boscotech.net',
	debt: 'debt.student@boscotech.net',
	payout: 'payout.student@boscotech.net',
	partial: 'partial.student@boscotech.net',
	bulkA: 'bulk.a@boscotech.net',
	bulkB: 'bulk.b@boscotech.net',
	bulkC: 'bulk.c@boscotech.net'
};

async function rpc<T = Record<string, unknown>>(
	fn: string,
	call: string,
	params: unknown[] = [],
	as: string = owner.id
): Promise<T> {
	return db.asUser(as, async (q) => {
		const { rows } = await q<Record<string, T>>(`select ${call} as result`, params);
		return rows[0].result as T;
	});
}

interface Balances {
	balance: number;
	physical_balance: number;
	digital_balance: number;
}

/** The three numbers, read through the REAL admin lookup RPC. */
async function balances(email: string): Promise<Balances> {
	const r = await rpc<Balances>('coin_admin_lookup', 'public.coin_admin_lookup($1)', [email]);
	return {
		balance: r.balance,
		physical_balance: r.physical_balance,
		digital_balance: r.digital_balance
	};
}

/** The same three numbers, read through the coin_balances VIEW instead. */
async function viewBalances(email: string): Promise<Balances> {
	const { rows } = await db.sql<Balances>(
		`select balance, physical_balance, digital_balance
		 from public.coin_balances where student_email = $1`,
		[email]
	);
	return rows[0];
}

/**
 * Every argument-type list a function name currently has, sorted. Types only
 * (oidvectortypes), never parameter names -- what PostgREST has to resolve
 * against is the type list, and a name change is not an overload.
 */
async function signatures(name: string): Promise<string[]> {
	const { rows } = await db.sql<{ args: string }>(
		`select coalesce(oidvectortypes(p.proargtypes), '') as args
		 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public' and p.proname = $1`,
		[name]
	);
	return rows.map((r) => r.args).sort();
}

async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

beforeAll(async () => {
	db = await startTestDb(CHAIN_BEFORE);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	student = await createUser(db, EMAIL.main, 'Main Student');
	await createUser(db, EMAIL.legacy, 'Legacy Student');

	// ---- Real pre-0096 activity, through the REAL 0087 five-argument RPC.
	// This is what the backfill has to reinterpret, and it has to be logged
	// the way the app logged it, not raw-inserted.
	await rpc('coin_log_transaction', 'public.coin_log_transaction($1, $2, $3, $4, $5)', [
		EMAIL.legacy,
		'above_and_beyond',
		3,
		null,
		'pre-0096 award'
	]);
	await rpc('coin_log_transaction', 'public.coin_log_transaction($1, $2, $3, $4, $5)', [
		EMAIL.legacy,
		'disruptive_behavior',
		null,
		null,
		'pre-0096 fine'
	]);
	const { rows: pre } = await db.sql<{ total: number }>(
		`select coalesce(sum(amount), 0)::integer as total
		 from public.coin_transactions where student_email = $1`,
		[EMAIL.legacy]
	);
	preMigrationTotal = pre[0].total;

	// ---- Now the migration under test, over that real data.
	const { readFileSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { fileURLToPath } = await import('node:url');
	const repoRoot = fileURLToPath(new URL('..', import.meta.url));
	await db.sql(
		readFileSync(join(repoRoot, 'supabase', 'migrations', '0096_coin_medium.sql'), 'utf8')
	);

	// ---- Sections + roster for the bulk tests.
	await rpc('coin_admin_upsert_section', 'public.coin_admin_upsert_section($1, $2, null, true, null)', [
		'bulk-section',
		'Bulk Section'
	]);
	for (const email of [EMAIL.bulkA, EMAIL.bulkB, EMAIL.bulkC]) {
		await rpc('coin_admin_set_student_section', 'public.coin_admin_set_student_section($1, $2)', [
			email,
			'bulk-section'
		]);
	}
}, 240_000);

afterAll(async () => {
	await db.stop();
});

// ===========================================================================
describe('the backfill', () => {
	test('every pre-0096 row is digital, and the totals it produced are unchanged', async () => {
		const { rows } = await db.sql<{ medium: string; n: number }>(
			`select medium, count(*)::integer as n from public.coin_transactions
			 where student_email = $1 group by medium`,
			[EMAIL.legacy]
		);
		expect(rows).toEqual([{ medium: 'digital', n: 2 }]);

		// The number the single balance used to mean is now the digital one,
		// and the total still reads what it read before the migration.
		const b = await balances(EMAIL.legacy);
		expect(b.digital_balance).toBe(preMigrationTotal);
		expect(b.balance).toBe(preMigrationTotal);
		expect(b.physical_balance).toBe(0);
	});

	test('the column carries a not-null constraint and only admits the two media', async () => {
		const err = await captureError(() =>
			db.sql(
				`insert into public.coin_transactions
					(student_email, category_id, amount, actor_email, medium)
				 values ($1, 'above_and_beyond', 1, 'a@b.c', 'cash')`,
				[EMAIL.main]
			)
		);
		expect(err.code).toBe('23514'); // check_violation
	});
});

// ===========================================================================
describe('per-medium derivation', () => {
	test('the three numbers agree between the lookup RPC and the view', async () => {
		await rpc('coin_log_transaction', 'public.coin_log_transaction($1, $2, $3, $4, $5, $6)', [
			EMAIL.main,
			'above_and_beyond',
			3,
			null,
			'physical award',
			'physical'
		]);
		await rpc('coin_log_transaction', 'public.coin_log_transaction($1, $2, $3, $4, $5, $6)', [
			EMAIL.main,
			'above_and_beyond',
			2,
			null,
			'digital award',
			'digital'
		]);
		await rpc('coin_log_transaction', 'public.coin_log_transaction($1, $2, $3, $4, $5, $6)', [
			EMAIL.main,
			'disruptive_behavior',
			null,
			null,
			'digital fine',
			'digital'
		]);

		const expected = { balance: 2, physical_balance: 3, digital_balance: -1 };
		expect(await balances(EMAIL.main)).toEqual(expected);
		expect(await viewBalances(EMAIL.main)).toEqual(expected);
		// The whole point: total is the sum of the two, and the two are not it.
		expect(expected.physical_balance + expected.digital_balance).toBe(expected.balance);
	});
});

// ===========================================================================
describe('medium defaulting and explicit selection', () => {
	const email = 'defaults.student@boscotech.net';

	test('the generic logger defaults to physical and honours an explicit digital', async () => {
		const a = await rpc<{ medium: string }>(
			'coin_log_transaction',
			'public.coin_log_transaction($1, $2, $3, $4, $5)',
			[email, 'above_and_beyond', 3, null, 'defaulted']
		);
		expect(a.medium).toBe('physical');

		const b = await rpc<{ medium: string }>(
			'coin_log_transaction',
			'public.coin_log_transaction($1, $2, $3, $4, $5, $6)',
			[email, 'above_and_beyond', 2, null, 'explicit', 'digital']
		);
		expect(b.medium).toBe('digital');

		expect(await balances(email)).toEqual({
			balance: 5,
			physical_balance: 3,
			digital_balance: 2
		});
	});

	test('each of the five formula RPCs defaults to physical and takes an explicit medium', async () => {
		const target = 'formula.student@boscotech.net';
		// Fund both media so the purchase-kind formulas are not debt-blocked.
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			target,
			500,
			'seed physical',
			'physical'
		]);
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			target,
			500,
			'seed digital',
			'digital'
		]);

		const calls: [string, string, unknown[], unknown[]][] = [
			// name, call template (n args), default-args, explicit-args
			[
				'coin_log_perfect_score',
				'public.coin_log_perfect_score',
				[target, 75, 'default'],
				[target, 75, 'explicit', 'digital']
			],
			[
				'coin_log_pay_raise',
				'public.coin_log_pay_raise',
				[target, 'default'],
				[target, 'explicit', 'digital']
			],
			[
				'coin_log_property_damage_careless',
				'public.coin_log_property_damage_careless',
				[target, 1.0, 'default'],
				[target, 1.0, 'explicit', 'digital']
			],
			[
				'coin_log_three_d_printing',
				'public.coin_log_three_d_printing',
				[target, 25, 2, false, 'default'],
				[target, 25, 2, false, 'explicit', 'digital']
			],
			[
				'coin_log_extra_credit',
				'public.coin_log_extra_credit',
				[target, 2, 'unit_labs', 'default'],
				[target, 2, 'unit_labs', 'explicit', 'digital']
			]
		];

		for (const [, call, defaultArgs, explicitArgs] of calls) {
			const ph = (n: number) => Array.from({ length: n }, (_, i) => `$${i + 1}`).join(', ');
			const d = await rpc<{ ok: boolean; medium: string }>(
				call,
				`${call}(${ph(defaultArgs.length)})`,
				defaultArgs
			);
			expect(d.ok, `${call} default`).toBe(true);
			expect(d.medium, `${call} default medium`).toBe('physical');

			const e = await rpc<{ ok: boolean; medium: string }>(
				call,
				`${call}(${ph(explicitArgs.length)})`,
				explicitArgs
			);
			expect(e.ok, `${call} explicit`).toBe(true);
			expect(e.medium, `${call} explicit medium`).toBe('digital');
		}

		// Every one of those ten rows landed on the medium it reported.
		const { rows } = await db.sql<{ medium: string; n: number }>(
			`select medium, count(*)::integer as n from public.coin_transactions
			 where student_email = $1 and category_id <> 'balance_correction'
			 group by medium order by medium`,
			[target]
		);
		expect(rows).toEqual([
			{ medium: 'digital', n: 5 },
			{ medium: 'physical', n: 5 }
		]);
	});

	test('an unknown medium is rejected outright, never silently coerced', async () => {
		const err = await captureError(() =>
			rpc('coin_log_transaction', 'public.coin_log_transaction($1, $2, $3, $4, $5, $6)', [
				'bad.medium@boscotech.net',
				'above_and_beyond',
				1,
				null,
				'n',
				'cash'
			])
		);
		expect(err.message).toMatch(/physical.*digital/i);
	});
});

// ===========================================================================
describe('physical_coin_submission is never a deposit', () => {
	test('it lands physical regardless of what the caller passes', async () => {
		const email = 'submit.student@boscotech.net';
		const forced = await rpc<{ medium: string }>(
			'coin_log_transaction',
			'public.coin_log_transaction($1, $2, $3, $4, $5, $6)',
			[email, 'physical_coin_submission', 12, null, 'found in a drawer', 'digital']
		);
		// The caller asked for digital. It is physical.
		expect(forced.medium).toBe('physical');
		expect(await balances(email)).toEqual({
			balance: 12,
			physical_balance: 12,
			digital_balance: 0
		});
	});

	test('the physical half of a payout can never be hand-logged', async () => {
		const err = await captureError(() =>
			rpc('coin_log_transaction', 'public.coin_log_transaction($1, $2, $3, $4, $5, $6)', [
				'mint.student@boscotech.net',
				'payout_physical_credit',
				50,
				null,
				'minting coins from nothing',
				'physical'
			])
		);
		expect(err.message).toMatch(/cannot be logged directly/i);
	});
});

// ===========================================================================
describe('payout is a transfer', () => {
	test('a full payout moves both balances by the same amount and leaves the total alone', async () => {
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			EMAIL.payout,
			40,
			'seed digital',
			'digital'
		]);
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			EMAIL.payout,
			10,
			'seed physical',
			'physical'
		]);
		const before = await balances(EMAIL.payout);
		expect(before).toEqual({ balance: 50, physical_balance: 10, digital_balance: 40 });

		const r = await rpc<{ ok: boolean; amount: number; transfer_id: string; partial: boolean }>(
			'coin_payout_student',
			'public.coin_payout_student($1, $2)',
			[EMAIL.payout, 'full payout']
		);
		expect(r.ok).toBe(true);
		expect(r.amount).toBe(40);
		expect(r.partial).toBe(false);

		const after = await balances(EMAIL.payout);
		expect(after).toEqual({ balance: 50, physical_balance: 50, digital_balance: 0 });
		// The decisive property: the total did not move. The coins changed form.
		expect(after.balance).toBe(before.balance);
		expect(after.physical_balance - before.physical_balance).toBe(40);
		expect(before.digital_balance - after.digital_balance).toBe(40);
	});

	test('it is TWO linked rows sharing a transfer id, not one special-cased row', async () => {
		const { rows } = await db.sql<{
			category_id: string;
			amount: number;
			medium: string;
			transfer_id: string;
		}>(
			`select category_id, amount, medium, transfer_id from public.coin_transactions
			 where student_email = $1 and transfer_id is not null order by amount`,
			[EMAIL.payout]
		);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ category_id: 'coin_payout', amount: -40, medium: 'digital' });
		expect(rows[1]).toMatchObject({
			category_id: 'payout_physical_credit',
			amount: 40,
			medium: 'physical'
		});
		expect(rows[0].transfer_id).toBe(rows[1].transfer_id);
	});

	test('a partial payout takes only what it was asked for', async () => {
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			EMAIL.partial,
			100,
			'seed digital',
			'digital'
		]);
		const r = await rpc<{ ok: boolean; amount: number; partial: boolean }>(
			'coin_payout_student',
			'public.coin_payout_student($1, $2, $3)',
			[EMAIL.partial, 'partial payout', 30]
		);
		expect(r).toMatchObject({ ok: true, amount: 30, partial: true });
		expect(await balances(EMAIL.partial)).toEqual({
			balance: 100,
			physical_balance: 30,
			digital_balance: 70
		});
	});

	test('it refuses more than the digital balance, and refuses a physical-only student', async () => {
		const over = await rpc<{ ok: boolean; reason: string }>(
			'coin_payout_student',
			'public.coin_payout_student($1, $2, $3)',
			[EMAIL.partial, 'too much', 1000]
		);
		expect(over).toMatchObject({ ok: false, reason: 'amount_exceeds_digital' });

		// A student holding only physical coins has nothing to pay out: those
		// coins are already in their hand. This is the ONE-WAY rule in action.
		const physOnly = 'physonly.student@boscotech.net';
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			physOnly,
			75,
			'seed physical',
			'physical'
		]);
		const none = await rpc<{ ok: boolean; reason: string }>(
			'coin_payout_student',
			'public.coin_payout_student($1, $2)',
			[physOnly, 'nothing to pay']
		);
		expect(none).toMatchObject({ ok: false, reason: 'no_balance' });
		expect(await balances(physOnly)).toEqual({
			balance: 75,
			physical_balance: 75,
			digital_balance: 0
		});
	});

	test('the bulk payout roster is positive DIGITAL balances, not positive totals', async () => {
		const r = await rpc<{ results: { email: string; ok: boolean }[] }>(
			'coin_bulk_payout',
			'public.coin_bulk_payout($1)',
			['bulk payout run']
		);
		const paid = r.results.filter((x) => x.ok).map((x) => x.email);
		// The physical-only student holds 75i¢ in TOTAL and must not appear.
		expect(paid).not.toContain('physonly.student@boscotech.net');
		expect(paid).toContain(EMAIL.partial);
		expect(await balances(EMAIL.partial)).toEqual({
			balance: 100,
			physical_balance: 100,
			digital_balance: 0
		});
	});
});

// ===========================================================================
describe('the debt lockout is per medium', () => {
	test('a negative digital balance blocks a digital purchase and not a physical one', async () => {
		// Digital driven negative; physical left healthy.
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			EMAIL.debt,
			-20,
			'digital debt',
			'digital'
		]);
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			EMAIL.debt,
			60,
			'physical coins in hand',
			'physical'
		]);
		expect(await balances(EMAIL.debt)).toEqual({
			balance: 40,
			physical_balance: 60,
			digital_balance: -20
		});

		const blocked = await rpc<{ ok: boolean; reason: string; medium: string }>(
			'coin_log_transaction',
			'public.coin_log_transaction($1, $2, $3, $4, $5, $6)',
			[EMAIL.debt, 'song_request', null, null, null, 'digital']
		);
		expect(blocked).toMatchObject({ ok: false, reason: 'debt', medium: 'digital' });

		// The same purchase, spending the medium that is NOT in debt, goes
		// through. Under the old total-balance rule this was unreachable.
		const allowed = await rpc<{ ok: boolean; medium: string }>(
			'coin_log_transaction',
			'public.coin_log_transaction($1, $2, $3, $4, $5, $6)',
			[EMAIL.debt, 'song_request', null, null, null, 'physical']
		);
		expect(allowed).toMatchObject({ ok: true, medium: 'physical' });
	});

	test('a negative TOTAL does not block a purchase on a healthy medium', async () => {
		const email = 'mixed.debt@boscotech.net';
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			email,
			-100,
			'deep digital debt',
			'digital'
		]);
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			email,
			10,
			'a few coins in hand',
			'physical'
		]);
		const b = await balances(email);
		expect(b.balance).toBeLessThan(0); // the TOTAL is negative
		expect(b.physical_balance).toBeGreaterThan(0);

		const r = await rpc<{ ok: boolean }>(
			'coin_log_transaction',
			'public.coin_log_transaction($1, $2, $3, $4, $5, $6)',
			[email, 'song_request', null, null, null, 'physical']
		);
		expect(r.ok).toBe(true);
	});

	test('the formula RPCs apply the same per-medium rule', async () => {
		const email = 'formula.debt@boscotech.net';
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			email,
			-5,
			'digital debt',
			'digital'
		]);
		await rpc('x', 'public.coin_admin_adjust_balance($1, $2, $3, $4)', [
			email,
			200,
			'physical funds',
			'physical'
		]);

		const blocked = await rpc<{ ok: boolean; reason: string }>(
			'coin_log_three_d_printing',
			'public.coin_log_three_d_printing($1, $2, $3, $4, $5, $6)',
			[email, 50, 2, false, null, 'digital']
		);
		expect(blocked).toMatchObject({ ok: false, reason: 'debt' });

		const allowed = await rpc<{ ok: boolean }>(
			'coin_log_three_d_printing',
			'public.coin_log_three_d_printing($1, $2, $3, $4, $5, $6)',
			[email, 50, 2, false, null, 'physical']
		);
		expect(allowed.ok).toBe(true);
	});
});

// ===========================================================================
describe('bulk logging with a run medium and per-student overrides', () => {
	test('one physical run with a single student flipped to digital', async () => {
		const r = await rpc<{
			medium: string;
			total: number;
			succeeded: number;
			unmatched_overrides: string[];
			results: { email: string; medium: string; ok: boolean }[];
		}>('coin_bulk_log_section', 'public.coin_bulk_log_section($1, $2, $3, $4, $5, $6::jsonb)', [
			'bulk-section',
			'weekly_wage',
			null,
			'weekly wage run',
			'physical',
			JSON.stringify({ [EMAIL.bulkB]: 'digital' })
		]);

		expect(r.medium).toBe('physical');
		expect(r.total).toBe(3);
		expect(r.succeeded).toBe(3);
		expect(r.unmatched_overrides).toEqual([]);

		const byEmail = Object.fromEntries(r.results.map((x) => [x.email, x.medium]));
		expect(byEmail[EMAIL.bulkA]).toBe('physical');
		expect(byEmail[EMAIL.bulkB]).toBe('digital');
		expect(byEmail[EMAIL.bulkC]).toBe('physical');

		// And the rows actually landed that way -- the results array is a
		// report, the ledger is the fact.
		expect(await balances(EMAIL.bulkA)).toEqual({
			balance: 1,
			physical_balance: 1,
			digital_balance: 0
		});
		expect(await balances(EMAIL.bulkB)).toEqual({
			balance: 1,
			physical_balance: 0,
			digital_balance: 1
		});
	});

	test('an override for someone not on the roster is reported, never silently dropped', async () => {
		const r = await rpc<{ unmatched_overrides: string[] }>(
			'coin_bulk_log_section',
			'public.coin_bulk_log_section($1, $2, $3, $4, $5, $6::jsonb)',
			[
				'bulk-section',
				'weekly_wage',
				null,
				'typo run',
				'physical',
				JSON.stringify({ 'typo.student@boscotech.net': 'digital' })
			]
		);
		expect(r.unmatched_overrides).toEqual(['typo.student@boscotech.net']);
	});

	test('an override with a bad value fails the whole run rather than guessing', async () => {
		const err = await captureError(() =>
			rpc('coin_bulk_log_section', 'public.coin_bulk_log_section($1, $2, $3, $4, $5, $6::jsonb)', [
				'bulk-section',
				'weekly_wage',
				null,
				'bad run',
				'physical',
				JSON.stringify({ [EMAIL.bulkA]: 'cash' })
			])
		);
		expect(err.message).toMatch(/physical.*digital/i);
	});

	test('the role stipend takes the same run medium and overrides', async () => {
		await rpc('x', 'public.coin_admin_upsert_section($1, $2, null, true, null)', [
			'role-section',
			'Role Section'
		]);
		for (const email of [EMAIL.bulkA, EMAIL.bulkB]) {
			await rpc('x', 'public.coin_admin_set_student_section($1, $2)', [email, 'role-section']);
			const applied = await rpc<{ ok: boolean; application_id: string }>(
				'coin_role_apply',
				'public.coin_role_apply($1, $2, $3::jsonb)',
				// safety_officer's ratio is FIXED at 2 per section; shop_steward's
				// is per-students (floor(3 x size / 25)), which is 0 for a
				// two-student section and would refuse both approvals.
				[email, 'safety_officer', '[]']
			);
			expect(applied.ok).toBe(true);
			await rpc('x', 'public.coin_role_admin_review($1, $2, $3, $4)', [
				applied.application_id,
				'approve',
				null,
				null
			]);
		}

		const r = await rpc<{
			medium: string;
			total: number;
			results: { email: string; medium: string }[];
		}>(
			'coin_bulk_log_role_stipend',
			'public.coin_bulk_log_role_stipend($1, $2, $3, $4, $5::jsonb)',
			[null, 'role-section', 'stipend run', 'digital', JSON.stringify({ [EMAIL.bulkA]: 'physical' })]
		);
		expect(r.medium).toBe('digital');
		expect(r.total).toBe(2);
		const byEmail = Object.fromEntries(r.results.map((x) => [x.email, x.medium]));
		expect(byEmail[EMAIL.bulkA]).toBe('physical');
		expect(byEmail[EMAIL.bulkB]).toBe('digital');
	});
});

// ===========================================================================
describe('the signature trap', () => {
	// Adding a defaulted trailing parameter with `create or replace` alone
	// would leave the OLD arity callable beside the new one, and PostgREST
	// cannot resolve two overloads that differ only by a defaulted trailing
	// argument -- so a surviving old arity does not merely go stale, it breaks
	// every call. Each of these asserts the function has exactly ONE signature
	// and that it is the new one.
	const expected: Record<string, string> = {
		coin_log_transaction: 'text, text, integer, numeric, text, text',
		coin_log_perfect_score: 'text, integer, text, text',
		coin_log_pay_raise: 'text, text, text',
		coin_log_property_damage_careless: 'text, numeric, text, text',
		coin_log_three_d_printing: 'text, numeric, numeric, boolean, text, text',
		coin_log_extra_credit: 'text, integer, text, text, text',
		coin_admin_adjust_balance: 'text, integer, text, text',
		coin_bulk_log_section: 'text, text, integer, text, text, jsonb',
		coin_bulk_log_role_stipend: 'text, text, text, text, jsonb',
		coin_payout_student: 'text, text, integer',
		_coin_insert: 'text, text, integer, numeric, text, jsonb, text, uuid'
	};

	for (const [name, args] of Object.entries(expected)) {
		test(`${name} has exactly one signature, the new one`, async () => {
			expect(await signatures(name)).toEqual([args]);
		});
	}

	test('the public leaderboard and transaction feeds were replaced, not duplicated', async () => {
		expect(await signatures('coin_public_leaderboard')).toEqual(['']);
		expect(await signatures('coin_public_transactions')).toEqual(['integer']);
	});
});

// ===========================================================================
describe('the public Ledger reads', () => {
	test('the leaderboard serves the total as balance and carries both media', async () => {
		const { rows } = await db.sql<{
			balance: number;
			physical_balance: number;
			digital_balance: number;
			awarded: number;
			fines: number;
			spent: number;
		}>(`select * from public.coin_public_leaderboard()`);
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) {
			expect(r.physical_balance + r.digital_balance).toBe(r.balance);
			// The identity the Ledger page's own arithmetic depends on, still
			// true with payout transfer rows in the ledger.
			expect(r.awarded - r.fines - r.spent).toBe(r.balance);
		}
	});

	test('no public read carries an email, medium or not', async () => {
		const serialized = await db.asAnon(async (q) => {
			const board = await q(`select * from public.coin_public_leaderboard()`);
			const txns = await q(`select * from public.coin_public_transactions(500)`);
			const ids = board.rows.map((r) => (r as { student_id: string }).student_id);
			const drawers = [];
			for (const id of ids) {
				const d = await q(`select public.coin_public_student($1) as r`, [id]);
				drawers.push(d.rows[0]);
			}
			return JSON.stringify({ board: board.rows, txns: txns.rows, drawers });
		});
		expect(serialized).not.toContain('@');
		expect(serialized).toContain('digital');
	});

	test('the drawer serves the total plus both media, and still no strike count', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`select public_id as id from public._coin_public_roster() limit 50`
		);
		const target = rows.find((r) => r.id);
		const drawer = await rpc<Record<string, unknown>>(
			'coin_public_student',
			'public.coin_public_student($1)',
			[target!.id]
		);
		expect(drawer.ok).toBe(true);
		expect(typeof drawer.physical_balance).toBe('number');
		expect(typeof drawer.digital_balance).toBe('number');
		expect(
			(drawer.physical_balance as number) + (drawer.digital_balance as number)
		).toBe(drawer.balance);
		expect(JSON.stringify(drawer)).not.toContain('strike');
	});
});

// ===========================================================================
describe('the write boundary is unchanged', () => {
	test('a student still cannot write coin_transactions directly, medium column and all', async () => {
		const err = await captureError(() =>
			db.asUser(student.id, (q) =>
				q(
					`insert into public.coin_transactions
						(student_email, category_id, amount, actor_email, medium)
					 values ($1, 'above_and_beyond', 999, $1, 'physical')`,
					[EMAIL.main]
				)
			)
		);
		expect(err.code).toBe('42501');

		const upd = await captureError(() =>
			db.asUser(student.id, (q) =>
				q(`update public.coin_transactions set medium = 'physical' where student_email = $1`, [
					EMAIL.main
				])
			)
		);
		expect(upd.code).toBe('42501');
	});

	test('a student cannot call any of the re-signed write RPCs', async () => {
		const err = await captureError(() =>
			rpc(
				'coin_log_transaction',
				'public.coin_log_transaction($1, $2, $3, $4, $5, $6)',
				[EMAIL.main, 'above_and_beyond', 3, null, 'nope', 'physical'],
				student.id
			)
		);
		expect(err.message).toMatch(/only site admins/i);

		const payout = await captureError(() =>
			rpc('coin_payout_student', 'public.coin_payout_student($1, $2)', [EMAIL.main, 'nope'], student.id)
		);
		expect(payout.message).toMatch(/only site admins/i);
	});

	test('anon holds no EXECUTE grant on any coin write RPC', async () => {
		const names = [
			'coin_log_transaction(text, text, integer, numeric, text, text)',
			'coin_payout_student(text, text, integer)',
			'coin_bulk_payout(text)',
			'coin_bulk_log_section(text, text, integer, text, text, jsonb)',
			'coin_bulk_log_role_stipend(text, text, text, text, jsonb)',
			'coin_admin_adjust_balance(text, integer, text, text)',
			'coin_admin_lookup(text)'
		];
		for (const sig of names) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'EXECUTE') as ok`,
				[`public.${sig}`]
			);
			expect(rows[0].ok, sig).toBe(false);
		}
	});

	test('_coin_balance is internal: no grant to anon or authenticated', async () => {
		for (const role of ['anon', 'authenticated']) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege($1, 'public._coin_balance(text, text)', 'EXECUTE') as ok`,
				[role]
			);
			expect(rows[0].ok, role).toBe(false);
		}
	});
});
