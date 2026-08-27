// tests/coin-legacy-reimport.test.ts
//
// Migration 0100's corrected legacy import, against a real Postgres with the
// real migration files applied (see tests/db/harness.ts).
//
// THE FIXTURE IS THE REAL ARCHIVED DATA, and that is the entire point of this
// file. docs/coin-economy/archive/2026-08-11-summary.csv and
// -transactions.csv are the verbatim final state of the retired Google Sheets
// ledger, committed to this repo. They are parsed here into exactly the
// snapshot shape coin_import_batches.raw holds, imported through the REAL RPC,
// and then every student's resulting PHYSICAL and DIGITAL balance is compared
// against THE SHEET'S OWN TWO BALANCE COLUMNS:
//
//     digital  = the sheet's `Bank Balance`
//     physical = the sheet's `Coin Balance` - its `Bank Balance`
//
// Those columns are independent of the import: the old system computed them,
// and nothing in this repo produces them. That independence is the whole
// reason this test exists. 0084's own verification compared the import's sum
// against `Awarded - Fines - Spent - Paid Out` -- which is a restatement of
// the import's own sign rule -- so it reported a universal 0 diff while the
// import was digitizing ~474i¢ of physical coins and destroying 19i¢ that had
// only changed form. A check derived from the thing it checks cannot fail.
//
// Nothing else in this suite reads the CSVs' arithmetic either: the expected
// numbers below are always the two balance columns, never a sum this code
// computed from the transaction log.
//
// The rest is the usual narrow set -- the guarantees that regress SILENTLY:
// the payout transfer's two linked rows, legacy history never satisfying a
// live rule, the override map being genuinely the only thing that decides the
// External students' medium, and idempotency + rollback of the new batch.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/** 0100 needs 0084 (the import schema) and 0096 (the medium dimension). */
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
	'0100_coin_legacy_reimport.sql',
	'0137_anon_execute_sweep.sql'
] as const;

// ---------------------------------------------------------------------------
// The archive, parsed.
// ---------------------------------------------------------------------------

const ARCHIVE = fileURLToPath(new URL('../docs/coin-economy/archive/', import.meta.url));

/** RFC4180-ish: quoted fields, doubled quotes, blank lines dropped. */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += ch;
			continue;
		}
		if (ch === '"') {
			quoted = true;
			continue;
		}
		if (ch === ',') {
			row.push(field);
			field = '';
			continue;
		}
		if (ch === '\r') continue;
		if (ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			continue;
		}
		field += ch;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function toRecords(rows: string[][]): Record<string, string>[] {
	const head = rows[0].map((h) => h.trim());
	return rows.slice(1).map((cells) =>
		Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]))
	);
}

const SUMMARY_CSV = toRecords(parseCsv(readFileSync(ARCHIVE + '2026-08-11-summary.csv', 'utf8')));
const TXNS_CSV = toRecords(parseCsv(readFileSync(ARCHIVE + '2026-08-11-transactions.csv', 'utf8')));

/**
 * A deterministic email per legacy name. The REAL mapping lives in the live
 * project's coin_import_mappings and is not in this repo; what matters here is
 * that each of the 71 names resolves to its own address, which is the only
 * property the import depends on.
 */
function emailFor(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug}@boscotech.net`;
}

/** The snapshot in exactly the shape the wizard's parser produced. */
const RAW = {
	source: { note: 'docs/coin-economy/archive/2026-08-11-*.csv, verbatim' },
	summary: SUMMARY_CSV.map((s, i) => ({
		row: i + 2,
		name: s.Name,
		section: s.Section,
		wage: Number(s.Wage),
		awarded: Number(s.Awarded),
		fines: Number(s.Fines),
		spent: Number(s.Spent),
		coin_balance: Number(s['Coin Balance']),
		paid_out: Number(s['Paid Out']),
		bank_balance: Number(s['Bank Balance']),
		debt: Number(s.Debt)
	})),
	transactions: TXNS_CSV.map((t, i) => ({
		row: i + 2,
		date: t['Date / Time'],
		name: t.Name,
		amount: Number(t.Amount),
		type: t.Type,
		reason: t.Reason
	})),
	contracts: [] as unknown[],
	contract_history: [] as unknown[]
};

/** Every name that appears anywhere, mapped. */
const ALL_NAMES = [
	...new Set([...RAW.summary.map((s) => s.name), ...RAW.transactions.map((t) => t.name)])
];

/** The External seven, exactly as the migration's runbook seeds them. */
const EXTERNAL_NAMES = SUMMARY_CSV.filter((s) => s.Section === 'External').map((s) => s.Name);
const EXTERNAL_OVERRIDES = Object.fromEntries(
	EXTERNAL_NAMES.map((n) => [n, { Award: 'digital' }])
);

/** The sheet's own expectation for one student. Never derived from the log. */
function sheetBalances(name: string): { physical: number; digital: number; total: number } {
	const s = SUMMARY_CSV.find((r) => r.Name === name);
	if (!s) throw new Error(`No summary row for ${name}`);
	const total = Math.round(Number(s['Coin Balance']));
	const digital = Math.round(Number(s['Bank Balance']));
	return { total, digital, physical: total - digital };
}

let db: TestDb;
let owner: SeededUser; // the pinned admin, apina@boscotech.edu
let student: SeededUser;
let batchId: string;

async function rpc<T = Record<string, unknown>>(
	call: string,
	params: unknown[] = [],
	as: string = owner.id
): Promise<T> {
	return db.asUser(as, async (q) => {
		const { rows } = await q<{ r: T }>(`select ${call} as r`, params);
		return rows[0].r;
	});
}

async function reimport(overrides: unknown = EXTERNAL_OVERRIDES): Promise<Record<string, unknown>> {
	return rpc('public.coin_admin_reimport_legacy($1, $2::jsonb)', [
		batchId,
		JSON.stringify(overrides)
	]);
}

async function rollback(): Promise<Record<string, unknown>> {
	return rpc('public.coin_admin_rollback_import($1)', [batchId]);
}

interface Balances {
	physical: number;
	digital: number;
	total: number;
}

/** Live balances straight off the ledger, per medium. */
async function balancesFor(email: string): Promise<Balances> {
	const { rows } = await db.sql<{ physical: string; digital: string; total: string }>(
		`select
			coalesce(sum(amount) filter (where medium = 'physical'), 0)::int as physical,
			coalesce(sum(amount) filter (where medium = 'digital'), 0)::int as digital,
			coalesce(sum(amount), 0)::int as total
		 from public.coin_transactions where student_email = $1`,
		[email]
	);
	return {
		physical: Number(rows[0].physical),
		digital: Number(rows[0].digital),
		total: Number(rows[0].total)
	};
}

/** Every student's three numbers in one round trip, keyed by email. */
async function allBalances(): Promise<Map<string, Balances>> {
	const { rows } = await db.sql<{
		student_email: string;
		physical: string;
		digital: string;
		total: string;
	}>(
		`select student_email,
			coalesce(sum(amount) filter (where medium = 'physical'), 0)::int as physical,
			coalesce(sum(amount) filter (where medium = 'digital'), 0)::int as digital,
			coalesce(sum(amount), 0)::int as total
		 from public.coin_transactions group by student_email`
	);
	return new Map(
		rows.map((r) => [
			r.student_email,
			{ physical: Number(r.physical), digital: Number(r.digital), total: Number(r.total) }
		])
	);
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
	db = await startTestDb(CHAIN);
	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	student = await createUser(db, 'some.student@boscotech.net', 'Some Student');

	// The mapping lives in coin_import_mappings, which rollback never touches
	// and which the re-import READS rather than being handed (nothing needs
	// re-mapping). Seeded as the owner: there is no client write path.
	for (const name of ALL_NAMES) {
		await db.sql(
			`insert into public.coin_import_mappings (legacy_name, email, status)
			 values ($1, $2, 'hand')
			 on conflict (legacy_name) do update set email = excluded.email`,
			[name, emailFor(name)]
		);
	}

	const created = await rpc<{ ok: boolean; batch_id: string }>(
		'public.coin_admin_create_import_batch($1::jsonb)',
		[JSON.stringify(RAW)]
	);
	expect(created.ok).toBe(true);
	batchId = created.batch_id;
}, 240_000);

afterAll(async () => {
	await db.stop();
});

// ---------------------------------------------------------------------------

describe('the archive parsed as the fixture', () => {
	test('is the real 71 students and 216 transactions', () => {
		expect(RAW.summary).toHaveLength(71);
		expect(RAW.transactions).toHaveLength(216);
		expect(new Set(RAW.transactions.map((t) => t.type))).toEqual(
			new Set(['Award', 'Award - Held', 'Fine', 'Fine - Owed', 'Purchase', 'Payout'])
		);
		expect(EXTERNAL_NAMES).toHaveLength(7);
	});

	test('the sheet agrees with itself: Coin Balance = Awarded - Fines - Spent', () => {
		// The premise the corrected mapping rests on -- a Payout moves coins
		// between the two balances rather than spending them, so it is NOT
		// subtracted here. 0084's expectation subtracted it, which is the bug.
		const off = SUMMARY_CSV.filter(
			(s) =>
				Math.round(Number(s['Coin Balance'])) !==
				Math.round(Number(s.Awarded)) - Math.round(Number(s.Fines)) - Math.round(Number(s.Spent))
		);
		expect(off.map((s) => s.Name)).toEqual([]);

		// And the old formula genuinely disagrees, for exactly the students who
		// ever withdrew: 19i¢ that the first import destroyed.
		const understated = SUMMARY_CSV.filter((s) => Number(s['Paid Out']) !== 0);
		expect(understated.map((s) => s.Name).sort()).toEqual(
			['Chavarria, Ray', 'Cini, Justin', 'Delgadillo, Seth', 'Veneziano, Ezio'].sort()
		);
		const lost = understated.reduce((n, s) => n + Number(s['Paid Out']), 0);
		expect(lost).toBe(19);
	});
});

describe('THE DECISIVE CHECK: the imported balances are the sheet own two balances', () => {
	test('the import runs', async () => {
		const r = await reimport();
		expect(r.ok).toBe(true);
		expect(r.students).toBe(71);
		expect(r.source_rows).toBe(216);
		// 216 source rows, but each of the 4 payouts writes a linked PAIR.
		expect(r.payout_transfers).toBe(4);
		expect(r.transactions).toBe(220);
	});

	test('all 71 students: physical AND digital match the sheet exactly', async () => {
		const live = await allBalances();
		const mismatches: string[] = [];
		for (const s of SUMMARY_CSV) {
			const want = sheetBalances(s.Name);
			const got = live.get(emailFor(s.Name)) ?? { physical: 0, digital: 0, total: 0 };
			if (got.physical !== want.physical || got.digital !== want.digital) {
				mismatches.push(
					`${s.Name} [${s.Section}] got P${got.physical}/D${got.digital} want P${want.physical}/D${want.digital}`
				);
			}
		}
		expect(mismatches).toEqual([]);

		// KEPT HONEST. An empty comparison over an empty ledger would also
		// report zero mismatches, so pin what was actually compared: every one
		// of the 71 summary rows, of which 60 carry real history (11 students
		// have no transactions at all -- a genuine state in the real sheet, and
		// zero on both media is still an assertion about them).
		expect(SUMMARY_CSV).toHaveLength(71);
		expect(live.size).toBe(60);
		const withHistory = SUMMARY_CSV.filter((s) => live.has(emailFor(s.Name)));
		expect(withHistory).toHaveLength(60);
		// ...and of those, the ones this test could get WRONG: a student whose
		// two media are not both zero.
		const nonTrivial = SUMMARY_CSV.filter((s) => {
			const w = sheetBalances(s.Name);
			return w.physical !== 0 || w.digital !== 0;
		});
		expect(nonTrivial.length).toBeGreaterThanOrEqual(50);
	});

	test('the totals: 474i¢ physical and 172i¢ digital across the school', async () => {
		const live = await allBalances();
		let physical = 0;
		let digital = 0;
		for (const s of SUMMARY_CSV) {
			// 11 of the 71 have no history at all; absent means zero.
			const got = live.get(emailFor(s.Name)) ?? { physical: 0, digital: 0, total: 0 };
			physical += got.physical;
			digital += got.digital;
		}
		// Both sides read off the sheet's own columns, not from the log.
		const wantDigital = SUMMARY_CSV.reduce((n, s) => n + Math.round(Number(s['Bank Balance'])), 0);
		const wantTotal = SUMMARY_CSV.reduce((n, s) => n + Math.round(Number(s['Coin Balance'])), 0);
		expect(digital).toBe(wantDigital);
		expect(physical).toBe(wantTotal - wantDigital);
		expect(physical).toBe(474); // what the first import digitized
		expect(digital).toBe(172);
	});

	test('the corrected reconciliation agrees, per medium, and reports no column drift', async () => {
		const r = await rpc<{
			ok: boolean;
			all_zero: boolean;
			totals: Record<string, number>;
		}>('public.coin_admin_import_reconcile($1)', [batchId]);
		expect(r.ok).toBe(true);
		expect(r.all_zero).toBe(true);
		expect(r.totals.mismatches).toBe(0);
		expect(r.totals.summary_column_mismatches).toBe(0);
		expect(r.totals.students).toBe(71);
		expect(r.totals.expected_physical_sum).toBe(474);
		expect(r.totals.expected_digital_sum).toBe(172);
		expect(r.totals.actual_physical_sum).toBe(474);
		expect(r.totals.actual_digital_sum).toBe(172);
	});

	test('history is preserved: real dates, semester keys off those dates, reasons kept', async () => {
		const { rows } = await db.sql<{
			created_at: Date;
			semester_key: string;
			note: string;
			legacy_type: string;
			category_id: string;
		}>(
			`select created_at, semester_key, note, meta ->> 'legacy_type' as legacy_type, category_id
			 from public.coin_transactions
			 where student_email = $1 and meta ->> 'legacy_reason' = 'Basic Classroom Eating Pass'`,
			[emailFor('Delgadillo, Seth')]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].semester_key).toBe('2026-spring'); // NOT today's key
		expect(rows[0].created_at.toISOString()).toBe('2026-05-19T05:37:00.000Z'); // 22:37 LA
		expect(rows[0].note).toBe('Basic Classroom Eating Pass');
		expect(rows[0].legacy_type).toBe('Purchase');
		expect(rows[0].category_id).toBe('legacy_purchase');
	});

	test('every imported row names a medium and one of the four legacy categories', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::int as n from public.coin_transactions
			 where meta ->> 'import_batch' = $1
			   and (medium is null or category_id not like 'legacy\\_%')`,
			[batchId]
		);
		expect(Number(rows[0].n)).toBe(0);
	});
});

describe('the payout transfer', () => {
	test('lands as two linked rows -- digital out, physical in -- leaving the total unchanged', async () => {
		const { rows } = await db.sql<{
			transfer_id: string;
			student_email: string;
			net: string;
			rows_in_pair: string;
			digital: string;
			physical: string;
		}>(
			`select transfer_id, min(student_email) as student_email,
				sum(amount)::int as net, count(*)::int as rows_in_pair,
				sum(amount) filter (where medium = 'digital')::int as digital,
				sum(amount) filter (where medium = 'physical')::int as physical
			 from public.coin_transactions
			 where meta ->> 'import_batch' = $1 and transfer_id is not null
			 group by transfer_id`,
			[batchId]
		);
		// The four real withdrawals: Delgadillo 4, Chavarria 12, Cini 1, Veneziano 2.
		expect(rows).toHaveLength(4);
		for (const r of rows) {
			expect(Number(r.rows_in_pair)).toBe(2);
			expect(Number(r.net)).toBe(0); // the coins changed form, they did not leave
			expect(Number(r.digital)).toBeLessThan(0);
			expect(Number(r.physical)).toBeGreaterThan(0);
			expect(Number(r.physical)).toBe(-Number(r.digital));
		}
		expect(rows.map((r) => Number(r.physical)).sort((a, b) => a - b)).toEqual([1, 2, 4, 12]);
	});

	test('carries 0096 own transfer meta, so it reads like a live payout', async () => {
		const { rows } = await db.sql<{ side: string; amount: number; medium: string }>(
			`select meta ->> 'transfer_side' as side, amount, medium
			 from public.coin_transactions
			 where meta ->> 'import_batch' = $1 and transfer_id is not null
			   and student_email = $2
			 order by medium`,
			[batchId, emailFor('Chavarria, Ray')]
		);
		expect(rows).toEqual([
			{ side: 'digital_debit', amount: -12, medium: 'digital' },
			{ side: 'physical_credit', amount: 12, medium: 'physical' }
		]);
	});

	test('a bank-funded purchase nets out: digital down, physical unchanged by the pair', async () => {
		// Chavarria: the Purchase debits physical, the transfer credits it back.
		// Physical moves only by his awards and fines; digital carries the cost.
		const got = await balancesFor(emailFor('Chavarria, Ray'));
		expect(got).toEqual(sheetBalances('Chavarria, Ray'));
		expect(got.digital).toBe(0);
	});
});

describe('legacy rows never satisfy a live rule', () => {
	const DELGADILLO = emailFor('Delgadillo, Seth');
	const KOOYENGA = emailFor('Kooyenga, Lucas');

	test('an imported eating-pass purchase leaves no active pass, and one can still be bought', async () => {
		const { rows } = await db.sql<{ active: boolean }>(
			'select public.coin_eating_pass_active($1) as active',
			[DELGADILLO]
		);
		expect(rows[0].active).toBe(false);

		const r = await rpc<{ ok: boolean; reason?: string }>(
			'public.coin_log_transaction($1, $2, null, null, $3, $4)',
			[DELGADILLO, 'eating_pass', 'live pass after import', 'physical']
		);
		expect(r.ok).toBe(true); // never `pass_already_active`
	});

	test('a calendar cap counts live rows only, never the 216 legacy ones', async () => {
		const first = await rpc<{ ok: boolean }>(
			'public.coin_log_transaction($1, $2, null, null, $3, $4)',
			[DELGADILLO, 'quality_desktop_background', 'first this month', 'physical']
		);
		expect(first.ok).toBe(true);
		const second = await rpc<{ ok: boolean; reason?: string }>(
			'public.coin_log_transaction($1, $2, null, null, $3, $4)',
			[DELGADILLO, 'quality_desktop_background', 'same month again', 'physical']
		);
		expect(second.ok).toBe(false);
		expect(second.reason).toBe('cap_reached');
	});

	test('the per-medium debt lockout reads the BALANCE legacy rows built, not a legacy category', async () => {
		// Kooyenga is the case the two balances exist for: the sheet has him at
		// Coin -12 / Bank 1, i.e. physical -13 and digital +1. His physical
		// balance is in debt and his digital one is not, and a purchase must
		// see exactly that.
		expect(await balancesFor(KOOYENGA)).toEqual({ physical: -13, digital: 1, total: -12 });

		const physical = await rpc<{ ok: boolean; reason?: string; medium?: string }>(
			'public.coin_log_transaction($1, $2, null, null, $3, $4)',
			[KOOYENGA, 'song_request', 'blocked', 'physical']
		);
		expect(physical.ok).toBe(false);
		expect(physical.reason).toBe('debt');
		expect(physical.medium).toBe('physical');

		const digital = await rpc<{ ok: boolean }>(
			'public.coin_log_transaction($1, $2, null, null, $3, $4)',
			[KOOYENGA, 'song_request', 'allowed', 'digital']
		);
		expect(digital.ok).toBe(true);
	});

	test('the legacy categories still cannot be logged directly', async () => {
		const err = await captureError(() =>
			rpc('public.coin_log_transaction($1, $2, $3, null, $4, $5)', [
				DELGADILLO,
				'legacy_award',
				5,
				'should never land',
				'physical'
			])
		);
		expect(err.message).toMatch(/cannot be logged directly/i);
	});
});

describe('the override map is the only thing deciding the External medium', () => {
	test('it reports what it actually moved, inert entries included', async () => {
		const { rows } = await db.sql<{ report: { overrides_applied: Array<Record<string, unknown>> } }>(
			'select report from public.coin_import_batches where id = $1',
			[batchId]
		);
		const applied = rows[0].report.overrides_applied;
		expect(applied).toHaveLength(7);
		const byName = new Map(applied.map((a) => [a.name as string, a.rows as number]));
		// 7 Award rows across five students...
		expect(byName.get('colin')).toBe(2);
		expect(byName.get('lance yip')).toBe(2);
		expect(byName.get('bushman, henry')).toBe(1);
		expect(byName.get('garcia, mathias')).toBe(1);
		expect(byName.get('azad arteaga')).toBe(1);
		// ...and two that move nothing, on purpose.
		expect(byName.get('araiza basica, alexander')).toBe(0);
		expect(byName.get('becker, grant')).toBe(0);
		expect([...byName.values()].reduce((a, b) => a + b, 0)).toBe(7);
	});

	test('a second call is refused: the batch is committed', async () => {
		const r = await reimport();
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('batch_already_committed');
	});

	test('rollback removes exactly the batch, and 0084 own rollback is what does it', async () => {
		const r = await rollback();
		expect(r.ok).toBe(true);
		expect(r.transactions_deleted).toBe(220);
		expect(r.students_deleted).toBe(71);

		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::int as n from public.coin_transactions where meta ->> 'import_batch' = $1`,
			[batchId]
		);
		expect(Number(rows[0].n)).toBe(0);

		// The untagged live rows from the previous describe survive, which is
		// the documented boundary: rollback is scoped to the batch's own tags.
		const survivors = await balancesFor(emailFor('Delgadillo, Seth'));
		expect(survivors.total).toBe(-150 + 3); // the pass and the desktop award
	});

	test('WITHOUT overrides the External awards land physical -- five students, and only those', async () => {
		const r = await reimport({});
		expect(r.ok).toBe(true);
		expect(r.overrides_applied).toEqual([]);

		const wrong: string[] = [];
		for (const s of SUMMARY_CSV) {
			const want = sheetBalances(s.Name);
			// Compare against the batch's own rows: the live rows logged above
			// belong to a couple of students and are not part of this question.
			const { rows } = await db.sql<{ physical: string; digital: string }>(
				`select
					coalesce(sum(amount) filter (where medium = 'physical'), 0)::int as physical,
					coalesce(sum(amount) filter (where medium = 'digital'), 0)::int as digital
				 from public.coin_transactions
				 where student_email = $1 and meta ->> 'import_batch' = $2`,
				[emailFor(s.Name), batchId]
			);
			if (Number(rows[0].physical) !== want.physical || Number(rows[0].digital) !== want.digital) {
				wrong.push(s.Name);
			}
		}
		expect(wrong.sort()).toEqual(
			['Azad Arteaga', 'Bushman, Henry', 'Colin', 'Garcia, Mathias', 'Lance Yip'].sort()
		);

		// Grant Becker is NOT among them: his one row is a Fine - Owed, which
		// the base mapping already puts on physical. That is why the map is
		// keyed per student AND per type -- a blanket "External is digital"
		// rule would have broken him.
		expect(await balancesFor(emailFor('Becker, Grant'))).toEqual({
			physical: -5,
			digital: 0,
			total: -5
		});
	});

	test('and the override map moves any student, not just the seven', async () => {
		await rollback();
		// A plain IDEA-113 student whose awards are physical by default.
		const r = await reimport({ 'Romo, Julian': { Award: 'digital' } });
		expect(r.ok).toBe(true);

		const sheet = sheetBalances('Romo, Julian');
		expect(sheet).toEqual({ physical: 12, digital: 8, total: 20 });
		const got = await balancesFor(emailFor('Romo, Julian'));
		// Everything he had on physical is now digital: the map moved it, and
		// nothing in the function body knows his name.
		expect(got).toEqual({ physical: 0, digital: 20, total: 20 });

		await rollback();
	});
});

describe('override validation', () => {
	test('a name the snapshot has never heard of is refused, not silently ignored', async () => {
		const r = await reimport({ 'Nobody, Real': { Award: 'digital' } });
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('unknown_override_name');
		expect(r.names).toEqual(['nobody, real']);
	});

	test('a bad medium and an unknown type both raise', async () => {
		const bad = await captureError(() => reimport({ Colin: { Award: 'bank' } }));
		expect(bad.message).toMatch(/must be "physical" or "digital"/i);
		const unknown = await captureError(() => reimport({ Colin: { Bonus: 'digital' } }));
		expect(unknown.message).toMatch(/Unknown legacy transaction type/i);
	});

	test('a Payout override is refused: both its sides are fixed by the transfer', async () => {
		const err = await captureError(() => reimport({ 'Chavarria, Ray': { Payout: 'physical' } }));
		expect(err.message).toMatch(/cannot take a medium override/i);
	});

	test('nothing landed through any of those refusals', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::int as n from public.coin_transactions where meta ->> 'import_batch' = $1`,
			[batchId]
		);
		expect(Number(rows[0].n)).toBe(0);
		const { rows: batch } = await db.sql<{ committed_at: Date | null }>(
			'select committed_at from public.coin_import_batches where id = $1',
			[batchId]
		);
		expect(batch[0].committed_at).toBeNull();
	});
});

describe('the permission boundary', () => {
	test('a student cannot re-import, and anon holds no grant', async () => {
		const err = await captureError(() =>
			rpc('public.coin_admin_reimport_legacy($1, $2::jsonb)', [batchId, '{}'], student.id)
		);
		expect(err.message).toMatch(/Only site admins/i);

		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon',
				'public.coin_admin_reimport_legacy(uuid, jsonb)', 'execute') as ok`
		);
		expect(rows[0].ok).toBe(false);
	});
});
