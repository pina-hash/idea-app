// tests/coin-public-adjustments.test.ts
//
// Migration 0107's ADJUSTMENT BUCKET, against a real Postgres with the real
// migration files applied (see tests/db/harness.ts).
//
// THE GUARANTEE THIS FILE EXISTS FOR IS AN EXPLOIT, NOT A COSMETIC NUMBER.
//
// 0089 bucketed every positive row into `awarded`, so a REFUND counted as an
// earning -- and the Ledger's "Lifetime Earned" headline is `awarded - fines`,
// which the board's DEFAULT SORT ranks by. Buy something, take the refund back,
// climb the board. Repeatably, and with nothing to notice: the pair nets to
// zero in the balance, so every number a reader would reconcile with still
// agreed. The mirror case is the same bug with the sign flipped -- a negative
// adjustment fell into `spent`, so a clawback read as a purchase.
//
// THE FIXTURE IS THE REAL ARCHIVED DATA, the coin-legacy-reimport convention
// and for the same reason. docs/coin-economy/archive/2026-08-11-*.csv is the
// verbatim final state of the retired Sheets ledger; it is imported through the
// REAL 0100 RPC, and then the three real refunds from that migration's own
// remediation runbook are logged through the REAL coin_admin_adjust_balance.
// So the rows these buckets are computed over have the shapes production's
// actually have -- legacy awards, held awards, payout transfers and live
// adjustments -- rather than shapes invented to make the assertions come out.
//
// The three students below are the ones production was measured on, and they
// were chosen to separate the two exclusions from each other:
//
//   Delgadillo  a refund AND a withdrawal   -- both exclusions must compose
//   Veneziano   a refund AND a withdrawal   -- the larger refund
//   Chavarria   a withdrawal and NO refund  -- THE CONTROL. He proves 0103's
//               transfer exclusion still holds and that these assertions are
//               not just "the adjustments column is always zero".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/** 0100's chain (the import + the medium dimension) plus the two display passes. */
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
	'0103_coin_public_medium_display.sql',
	'0107_coin_public_adjustment_bucket.sql'
] as const;

// ---------------------------------------------------------------------------
// The archive, parsed. (The parser and the snapshot shape are
// coin-legacy-reimport's, kept identical so both suites feed the RPC the same
// thing the retired wizard's parser produced.)
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
	return rows
		.slice(1)
		.map((cells) => Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()])));
}

const SUMMARY_CSV = toRecords(parseCsv(readFileSync(ARCHIVE + '2026-08-11-summary.csv', 'utf8')));
const TXNS_CSV = toRecords(parseCsv(readFileSync(ARCHIVE + '2026-08-11-transactions.csv', 'utf8')));

/** A deterministic email per legacy name; the real mapping is not in this repo. */
function emailFor(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug}@boscotech.net`;
}

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

const ALL_NAMES = [
	...new Set([...RAW.summary.map((s) => s.name), ...RAW.transactions.map((t) => t.name)])
];

/** The External seven, exactly as 0100's runbook seeds them. */
const EXTERNAL_OVERRIDES = Object.fromEntries(
	SUMMARY_CSV.filter((s) => s.Section === 'External').map((s) => [s.Name, { Award: 'digital' }])
);

/**
 * The three legacy eating-pass refunds, verbatim from 0100's remediation
 * runbook (step 4): digital balance corrections, logged live AFTER the import,
 * carrying no batch tag. These are the rows that were inflating Lifetime
 * Earned in production.
 */
const REFUNDS = [
	{ name: 'Delgadillo, Seth', amount: 40 },
	{ name: 'Jette-Kouri, Abraham', amount: 50 },
	{ name: 'Veneziano, Ezio', amount: 50 }
] as const;

const REFUND_NOTE = 'Legacy eating pass refund - refund-only policy (v3 item 9)';

let db: TestDb;
let owner: SeededUser;

interface BoardRow {
	student_id: string;
	name: string;
	awarded: number;
	fines: number;
	spent: number;
	adjustments: number;
	paid_out: number;
	balance: number;
	physical_balance: number;
	digital_balance: number;
}

let BOARD: Record<string, BoardRow> = {};

async function readBoard(): Promise<Record<string, BoardRow>> {
	const { rows } = await db.asAnon((q) =>
		q<BoardRow>(`select * from public.coin_public_leaderboard()`)
	);
	const byName: Record<string, BoardRow> = {};
	for (const r of rows) byName[r.name] = r;
	return byName;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');

	// The import READS the mapping rather than being handed one.
	for (const name of ALL_NAMES) {
		await db.sql(
			`insert into public.coin_import_mappings (legacy_name, email, status)
			 values ($1, $2, 'hand')
			 on conflict (legacy_name) do update set email = excluded.email`,
			[name, emailFor(name)]
		);
	}

	await db.asUser(owner.id, async (q) => {
		const { rows } = await q<{ r: { ok: boolean; batch_id: string } }>(
			`select public.coin_admin_create_import_batch($1::jsonb) as r`,
			[JSON.stringify(RAW)]
		);
		expect(rows[0].r.ok).toBe(true);

		const imported = await q<{ r: { ok: boolean } }>(
			`select public.coin_admin_reimport_legacy($1, $2::jsonb) as r`,
			[rows[0].r.batch_id, JSON.stringify(EXTERNAL_OVERRIDES)]
		);
		expect(imported.rows[0].r.ok).toBe(true);

		// Step 4 of the runbook, through the real RPC: digital, live, untagged.
		for (const r of REFUNDS) {
			await q(`select public.coin_admin_adjust_balance($1, $2, $3, 'digital')`, [
				emailFor(r.name),
				r.amount,
				REFUND_NOTE
			]);
		}
	});

	BOARD = await readBoard();
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------

describe('the fixture is the real archive with the real refunds on top', () => {
	test('71 students imported and exactly three refunds logged', async () => {
		expect(RAW.summary).toHaveLength(71);
		expect(RAW.transactions).toHaveLength(216);
		// 60, not 71: `_coin_public_roster` lists students who actually have
		// ledger rows (or a coin-section roster row), and 11 of the archive's 71
		// genuinely have no transactions at all. Pinned so a future drop in
		// coverage is a failure rather than a quietly smaller board.
		expect(Object.keys(BOARD).length).toBe(60);

		// Kept honest: if these were not really adjustment-kind rows, every
		// assertion below would be measuring the absence of something that was
		// never there.
		const { rows } = await db.sql<{ n: number; kinds: string }>(
			`select count(*)::int as n, string_agg(distinct cat.kind, ',') as kinds
			   from public.coin_transactions t
			   join public.coin_categories cat on cat.id = t.category_id
			  where t.note = $1`,
			[REFUND_NOTE]
		);
		expect(rows[0].n).toBe(3);
		expect(rows[0].kinds).toBe('adjustment');
	});
});

describe('an adjustment is neither earned nor spent', () => {
	// Every figure the board reports for each student, against the production
	// numbers these three were measured on. Six each, so a bucket that gained
	// what another lost cannot pass.
	const EXPECTED = [
		{
			// A refund AND a withdrawal: both exclusions compose on this row.
			// Awarded 111 is the number production displayed as 151.
			name: 'Delgadillo, Seth',
			awarded: 111,
			fines: 0,
			spent: 44,
			adjustments: 40,
			balance: 107,
			lifetimeEarned: 111
		},
		{
			// Production displayed 107 for Lifetime Earned here: 57 + the 50
			// refund. It is 57.
			name: 'Veneziano, Ezio',
			awarded: 57,
			fines: 0,
			spent: 62,
			adjustments: 50,
			balance: 45,
			lifetimeEarned: 57
		},
		{
			// THE CONTROL. A withdrawal, no adjustment: unchanged by 0107, which
			// is what proves 0103's exclusion is still doing its own job.
			name: 'Chavarria, Ray',
			awarded: 27,
			fines: 13,
			spent: 12,
			adjustments: 0,
			balance: 2,
			lifetimeEarned: 14
		}
	] as const;

	for (const e of EXPECTED) {
		test(`${e.name}: all six figures`, () => {
			const r = BOARD[e.name];
			expect(r, `no board row for ${e.name}`).toBeTruthy();
			expect(r.awarded).toBe(e.awarded);
			expect(r.fines).toBe(e.fines);
			expect(r.spent).toBe(e.spent);
			expect(r.adjustments).toBe(e.adjustments);
			expect(r.balance).toBe(e.balance);
			// Lifetime Earned is not a column: it is what the page computes and
			// what the default sort ranks by, so it is asserted as the page
			// computes it.
			expect(r.awarded - r.fines).toBe(e.lifetimeEarned);
		});
	}

	test('the identity the page reconciles with holds for all 71', () => {
		// balance = awarded - fines - spent + adjustments.
		// Before 0107 this held too -- with `awarded` and `spent` carrying the
		// adjustments between them -- which is exactly why the inflation was
		// invisible to anyone checking the arithmetic.
		for (const r of Object.values(BOARD)) {
			expect(r.awarded - r.fines - r.spent + r.adjustments, r.name).toBe(r.balance);
			expect(r.physical_balance + r.digital_balance, r.name).toBe(r.balance);
		}
	});

	test('exactly the three refunded students carry a nonzero adjustments figure', () => {
		const nonzero = Object.values(BOARD)
			.filter((r) => r.adjustments !== 0)
			.map((r) => `${r.name}:${r.adjustments}`)
			.sort();
		// The page renders the figure only when it is nonzero, so this is also
		// the exact set of students who will see an Adjustments stat.
		expect(nonzero).toEqual([
			'Delgadillo, Seth:40',
			'Jette-Kouri, Abraham:50',
			'Veneziano, Ezio:50'
		]);
	});

	test('a NEGATIVE adjustment lands in adjustments, not in spent', async () => {
		// The mirror case, and the one no production row exercises yet: `spent`
		// was "any negative that is not a fine", so a clawback used to read as a
		// purchase and quietly deflate the balance the page computed.
		const email = emailFor('Chavarria, Ray');
		const before = BOARD['Chavarria, Ray'];

		await db.asUser(owner.id, (q) =>
			q(`select public.coin_admin_adjust_balance($1, -9, 'logged in error, taken back', 'digital')`, [
				email
			])
		);
		const after = (await readBoard())['Chavarria, Ray'];

		expect(after.adjustments).toBe(-9);
		expect(after.spent).toBe(before.spent); // NOT swept into spending
		expect(after.awarded).toBe(before.awarded);
		expect(after.fines).toBe(before.fines);
		expect(after.balance).toBe(before.balance - 9);
		// Lifetime Earned is untouched by a correction in either direction.
		expect(after.awarded - after.fines).toBe(14);
		expect(after.awarded - after.fines - after.spent + after.adjustments).toBe(after.balance);

		await db.asUser(owner.id, (q) =>
			q(`select public.coin_admin_adjust_balance($1, 9, 'undo', 'digital')`, [email])
		);
		BOARD = await readBoard();
	});
});

describe('the two exclusions compose, and neither replaces the other', () => {
	test("a withdrawal's physical credit is adjustment-kind and stays OUT of adjustments", async () => {
		// This is the trap 0107 had to avoid. A live payout writes its physical
		// half under `payout_physical_credit`, whose kind is `adjustment` -- so a
		// bucket keyed on kind alone would have re-inflated exactly the figure
		// 0103 deflated, in a new column.
		const email = emailFor('Delgadillo, Seth');
		const before = BOARD['Delgadillo, Seth'];
		expect(before.digital_balance).toBeGreaterThanOrEqual(15);

		await db.asUser(owner.id, (q) =>
			q(`select public.coin_payout_student($1, 'withdrawal on top of a refund', 15)`, [email])
		);
		const after = (await readBoard())['Delgadillo, Seth'];

		// Every bucket is untouched: the coins changed form, they were not
		// earned, spent, or corrected.
		expect(after.awarded).toBe(before.awarded);
		expect(after.fines).toBe(before.fines);
		expect(after.spent).toBe(before.spent);
		expect(after.adjustments).toBe(before.adjustments); // the whole point
		expect(after.balance).toBe(before.balance);
		// The withdrawal itself is still reported, and the media moved.
		expect(after.paid_out).toBe(before.paid_out + 15);
		expect(after.digital_balance).toBe(before.digital_balance - 15);
		expect(after.physical_balance).toBe(before.physical_balance + 15);
		expect(after.awarded - after.fines - after.spent + after.adjustments).toBe(after.balance);

		// And the pair really was written, so the assertions above are about
		// something that happened.
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.coin_transactions
			  where student_email = $1 and category_id = 'payout_physical_credit'`,
			[email]
		);
		expect(rows[0].n).toBeGreaterThan(0);
	});

	test('legacy Wealth Declarations DO still count toward Lifetime Earned', async () => {
		// A deliberate decision, not an oversight: a declaration is a
		// `legacy_award` row recording coins earned before this system existed.
		// Only kind `adjustment` moved. Delgadillo's 111 includes 80i¢ of them,
		// so if declarations were ever swept out with the refunds his headline
		// would read 31.
		const { rows } = await db.sql<{ total: number; kind: string }>(
			`select coalesce(sum(t.amount), 0)::int as total, max(cat.kind) as kind
			   from public.coin_transactions t
			   join public.coin_categories cat on cat.id = t.category_id
			  where t.student_email = $1 and t.note ilike '%Legacy Wealth Declaration%'`,
			[emailFor('Delgadillo, Seth')]
		);
		expect(rows[0].total).toBe(80);
		expect(rows[0].kind).toBe('award');
		expect(BOARD['Delgadillo, Seth'].awarded).toBe(111);
	});
});

describe('the 0089 boundary is untouched', () => {
	test('no address in the widened board', async () => {
		const text = await db.asAnon(async (q) => {
			const { rows } = await q(`select * from public.coin_public_leaderboard()`);
			return JSON.stringify(rows);
		});
		expect(text).toContain('Delgadillo, Seth');
		expect(text).toContain('adjustments');
		expect(text).not.toMatch(/@boscotech/i);
		expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
	});

	test('anon may still execute it, and still cannot read the table', async () => {
		const { rows } = await db.sql<{ fn: boolean; tbl: boolean }>(
			`select has_function_privilege('anon', 'public.coin_public_leaderboard()', 'execute') as fn,
			        has_table_privilege('anon', 'public.coin_transactions', 'select') as tbl`
		);
		expect(rows[0].fn).toBe(true);
		expect(rows[0].tbl).toBe(false);
	});

	test('the widened board left exactly one signature behind', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'coin_public_leaderboard'`
		);
		// Adding an output column is a return-type change, so the old function is
		// dropped first; a survivor would be an overload PostgREST could not
		// resolve.
		expect(rows[0].n).toBe(1);
	});
});
