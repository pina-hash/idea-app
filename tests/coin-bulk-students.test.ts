// tests/coin-bulk-students.test.ts
//
// Migration 0115: coin_bulk_log_students, and coin_bulk_log_section delegating
// to it. Against a real Postgres with the real migration files applied (see
// tests/db/harness.ts).
//
// DELIBERATELY NARROW, the notebook-security.test.ts convention. What is here
// is what regresses SILENTLY:
//
//   * THE DELEGATION ITSELF. A section run and a picked run over the same
//     students must be the same operation. If they drift -- a rule tightened on
//     one side, an ordering that stops matching, a key that stops being
//     returned -- both still "work", and the only symptom is that logging a
//     class two different ways gives two different answers. So the headline
//     assertion compares the two responses field for field rather than
//     spot-checking either.
//   * WHAT DELEGATION HAD TO PRESERVE. An empty roster returning {total: 0}
//     rather than raising is 0096's behaviour, and it is the one thing a new
//     function's input validation would most naturally have broken.
//   * DEDUPE. The ledger is keyed on the email, so logging "A@x" and "a@x" from
//     one selection would charge one student twice, with two perfectly ordinary
//     rows to show for it.
//   * A REFUSAL WRITING NOTHING. "1 refused" is only worth reading if the
//     refused student's balance is genuinely untouched.
//
// What is NOT here: the pricing rules, the debt lockout, the caps, the Eating
// Pass logic. 0115 reimplements none of them -- it calls coin_log_transaction,
// which owns them and which coin-medium.test.ts already covers. Re-asserting
// them here would only dilute what a red run means.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/** 0115 and everything it stands on, in order. */
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
	'0115_coin_bulk_log_students.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let owner: SeededUser; // the pinned admin, apina@boscotech.edu
let pupil: SeededUser; // an ordinary student, for the permission boundary

const SECTION = 'bulk-students-demo';
const EMPTY_SECTION = 'bulk-students-empty';

const EMAIL = {
	a: 'anna.bulk@boscotech.net',
	b: 'bruno.bulk@boscotech.net',
	c: 'cleo.bulk@boscotech.net',
	/** Taken negative on the DIGITAL balance, so a digital purchase is refused. */
	debt: 'dana.debt@boscotech.net',
	/** Never on any roster -- what a picked set can reach and a section cannot. */
	loose: 'loose.walkup@boscotech.net'
};

interface BulkResult {
	email: string;
	ok: boolean;
	reason?: string;
	medium?: string;
	amount?: number;
}
interface BulkResponse {
	ok: boolean;
	section_id?: string;
	category_id: string;
	medium: string;
	unmatched_overrides: string[];
	total: number;
	succeeded: number;
	refused: number;
	results: BulkResult[];
}

async function rpc<T = Record<string, unknown>>(
	call: string,
	params: unknown[] = [],
	as: string = owner.id
): Promise<T> {
	return db.asUser(as, async (q) => {
		const { rows } = await q<Record<string, T>>(`select ${call} as result`, params);
		return rows[0].result as T;
	});
}

function bulkStudents(
	emails: string[],
	categoryId: string,
	opts: { amount?: number | null; note?: string | null; medium?: string; overrides?: unknown } = {},
	as: string = owner.id
): Promise<BulkResponse> {
	return rpc<BulkResponse>(
		`public.coin_bulk_log_students($1::text[], $2, $3, $4, $5, $6::jsonb)`,
		[
			emails,
			categoryId,
			opts.amount ?? null,
			opts.note ?? null,
			opts.medium ?? 'physical',
			JSON.stringify(opts.overrides ?? {})
		],
		as
	);
}

function bulkSection(
	sectionId: string,
	categoryId: string,
	opts: { amount?: number | null; note?: string | null; medium?: string; overrides?: unknown } = {},
	as: string = owner.id
): Promise<BulkResponse> {
	return rpc<BulkResponse>(
		`public.coin_bulk_log_section($1, $2, $3, $4, $5, $6::jsonb)`,
		[
			sectionId,
			categoryId,
			opts.amount ?? null,
			opts.note ?? null,
			opts.medium ?? 'physical',
			JSON.stringify(opts.overrides ?? {})
		],
		as
	);
}

async function balances(email: string): Promise<{ physical: number; digital: number }> {
	const r = await rpc<{ physical_balance: number; digital_balance: number }>(
		'public.coin_admin_lookup($1)',
		[email]
	);
	return { physical: r.physical_balance, digital: r.digital_balance };
}

async function txnCount(email: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*)::text as n from public.coin_transactions where student_email = $1`,
		[email]
	);
	return Number(rows[0].n);
}

/**
 * Every argument-type list a function name currently has. Types only, never
 * parameter names -- what PostgREST resolves against is the type list, and a
 * surviving second arity is the trap 0058/0068/0096 documents.
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

async function captureError(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return (error as { message?: string }).message ?? String(error);
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	pupil = await createUser(db, EMAIL.a, 'Anna Bulk');
	await createUser(db, EMAIL.b, 'Bruno Bulk');

	await rpc('public.coin_admin_upsert_section($1, $2, $3, $4, $5)', [
		SECTION,
		'Bulk Students Demo',
		null,
		null,
		true
	]);
	await rpc('public.coin_admin_upsert_section($1, $2, $3, $4, $5)', [
		EMPTY_SECTION,
		'Nobody On It',
		null,
		null,
		true
	]);
	await rpc('public.coin_admin_assign_section_students($1, $2::text[])', [
		SECTION,
		[EMAIL.a, EMAIL.b, EMAIL.c, EMAIL.debt]
	]);

	// Dana into DIGITAL debt, so a digital purchase is refused for her and
	// nobody else -- the partial-refusal case, produced by the real rule rather
	// than by a stubbed one.
	await rpc('public.coin_log_transaction($1, $2, $3, $4, $5, $6)', [
		EMAIL.debt,
		'disruptive_behavior',
		null,
		null,
		'seed: into digital debt',
		'digital'
	]);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// The delegation
// ---------------------------------------------------------------------------

describe('coin_bulk_log_section delegates to coin_bulk_log_students', () => {
	/**
	 * THE HEADLINE. Two runs over the same four students -- one addressed as a
	 * section, one as a picked list -- must agree on everything except the one
	 * key only a section has. Field for field, because "both returned something
	 * sensible" is exactly what a drifted pair would also do.
	 */
	test('the same students, addressed both ways, produce the same answer', async () => {
		const viaSection = await bulkSection(SECTION, 'weekly_wage');
		const viaPicked = await bulkStudents(
			// Deliberately in a different order from the roster, to prove the
			// sort is what makes the two comparable rather than luck.
			[EMAIL.debt, EMAIL.b, EMAIL.a, EMAIL.c],
			'weekly_wage'
		);

		expect(viaSection.section_id).toBe(SECTION);
		expect(viaPicked.section_id).toBeUndefined();

		// THE THREE FIELDS THAT LEGITIMATELY DIFFER, and why. The runs are
		// sequential against one ledger, so the second one's resulting balances
		// are the first one's plus a wage, and every insert has its own id.
		// Asserting those equal would be asserting that logging twice changes
		// nothing, which is the opposite of what this should hold. Everything
		// that describes the OPERATION -- who was in it, in what order, on which
		// medium, with what outcome, and the totals over them -- is compared
		// whole.
		const shape = (r: BulkResponse) => ({
			...r,
			section_id: undefined,
			results: r.results.map((row) => {
				const {
					transaction_id: _id,
					balance: _b,
					physical_balance: _p,
					digital_balance: _d,
					...rest
				} = row as BulkResult & Record<string, unknown>;
				return rest;
			})
		});
		expect(shape(viaSection)).toEqual(shape(viaPicked));

		// And it really did log: four students, one row each, both times.
		expect(viaSection.total).toBe(4);
		expect(viaSection.succeeded).toBe(4);
		expect(viaSection.results.map((r) => r.email)).toEqual([
			EMAIL.a,
			EMAIL.b,
			EMAIL.c,
			EMAIL.debt
		]);
	});

	test('the section wrapper still returns every key it did before', async () => {
		const res = await bulkSection(SECTION, 'weekly_wage');
		expect(Object.keys(res).sort()).toEqual(
			[
				'category_id',
				'medium',
				'ok',
				'refused',
				'results',
				'section_id',
				'succeeded',
				'total',
				'unmatched_overrides'
			].sort()
		);
	});

	/**
	 * PRESERVED, NOT INVENTED. 0096's section logger returns {total: 0} for an
	 * empty roster rather than raising, and the delegate therefore does not
	 * raise on an empty array either -- an input validation that felt natural
	 * on the new function would have been a behaviour change to the old one.
	 */
	test('an empty roster still reports zero rather than raising', async () => {
		const res = await bulkSection(EMPTY_SECTION, 'weekly_wage');
		expect(res.total).toBe(0);
		expect(res.succeeded).toBe(0);
		expect(res.results).toEqual([]);
	});

	test('an empty picked list does the same', async () => {
		const res = await bulkStudents([], 'weekly_wage');
		expect(res.total).toBe(0);
		expect(res.results).toEqual([]);
	});

	test('the section checks itself first, before the medium or the category', async () => {
		// A call wrong in three ways at once still reports the section, which is
		// the order 0096 had and the order the wrapper has to keep.
		const msg = await captureError(() =>
			bulkSection('no-such-section', 'not-a-category', { medium: 'gold' })
		);
		expect(msg).toMatch(/Unknown coin section/);
	});

	test('exactly one signature survives for each', async () => {
		expect(await signatures('coin_bulk_log_section')).toEqual([
			'text, text, integer, text, text, jsonb'
		]);
		expect(await signatures('coin_bulk_log_students')).toEqual([
			'text[], text, integer, text, text, jsonb'
		]);
	});
});

// ---------------------------------------------------------------------------
// The picked set itself
// ---------------------------------------------------------------------------

describe('a hand-picked set of students', () => {
	/**
	 * A balance is keyed on the email, so two spellings of one address are one
	 * student. Logging both would charge them twice and leave two entirely
	 * ordinary-looking rows behind.
	 */
	test('normalizes, dedupes and sorts the emails it is given', async () => {
		const before = await txnCount(EMAIL.a);
		const res = await bulkStudents(
			[`  ${EMAIL.a.toUpperCase()}  `, EMAIL.b, EMAIL.a, '', EMAIL.a],
			'weekly_wage'
		);
		expect(res.total).toBe(2);
		expect(res.results.map((r) => r.email)).toEqual([EMAIL.a, EMAIL.b]);
		expect(await txnCount(EMAIL.a)).toBe(before + 1);
	});

	test('reaches a student who is on no roster at all', async () => {
		// The doctrine the whole tool rests on: a balance can exist for an email
		// that has never signed in and is in nobody's section.
		const res = await bulkStudents([EMAIL.loose], 'weekly_wage');
		expect(res.succeeded).toBe(1);
		expect((await balances(EMAIL.loose)).physical).toBeGreaterThan(0);
	});

	/**
	 * One student's refusal must not touch the others, and -- the half that is
	 * easy to get wrong -- must not touch that student either.
	 */
	test('a refusal is reported by name and writes nothing for them', async () => {
		const debtBefore = await balances(EMAIL.debt);
		const debtRowsBefore = await txnCount(EMAIL.debt);
		const annaBefore = await balances(EMAIL.a);

		const res = await bulkStudents([EMAIL.a, EMAIL.debt], 'song_request', {
			medium: 'digital'
		});

		expect(res.total).toBe(2);
		expect(res.succeeded).toBe(1);
		expect(res.refused).toBe(1);

		const refusedRow = res.results.find((r) => !r.ok);
		expect(refusedRow?.email).toBe(EMAIL.debt);
		expect(refusedRow?.reason).toBe('debt');

		// Nothing written for the refused student...
		expect(await balances(EMAIL.debt)).toEqual(debtBefore);
		expect(await txnCount(EMAIL.debt)).toBe(debtRowsBefore);
		// ...and the other student was logged regardless.
		expect((await balances(EMAIL.a)).digital).toBeLessThan(annaBefore.digital);
	});

	/**
	 * THE OTHER HALF OF "one student never blocks the rest", and it is a
	 * different code path from the refusal above. A structured
	 * {ok:false, reason:...} is coin_log_transaction ANSWERING; this is
	 * coin_log_transaction RAISING, which without the per-student exception
	 * handler would abort the whole batch -- so a single typo'd address in a
	 * selection of six would log nobody, and the caller would get an error
	 * naming the typo rather than any per-student outcome.
	 */
	test('an exception for one student is caught and the rest still log', async () => {
		const before = await txnCount(EMAIL.a);
		const res = await bulkStudents([EMAIL.a, 'not-an-email'], 'weekly_wage');

		expect(res.total).toBe(2);
		expect(res.succeeded).toBe(1);
		expect(res.refused).toBe(1);

		const bad = res.results.find((r) => r.email === 'not-an-email');
		expect(bad?.ok).toBe(false);
		expect(bad?.reason).toBe('error');
		expect((bad as { message?: string }).message).toMatch(/valid student email/);

		// The good one landed anyway.
		expect(res.results.find((r) => r.email === EMAIL.a)?.ok).toBe(true);
		expect(await txnCount(EMAIL.a)).toBe(before + 1);
	});

	test('carries per-student medium overrides, and reports the ones that matched nobody', async () => {
		const res = await bulkStudents([EMAIL.a, EMAIL.b], 'weekly_wage', {
			medium: 'physical',
			overrides: { [EMAIL.b]: 'digital', 'ghost@boscotech.net': 'digital' }
		});
		expect(res.medium).toBe('physical');
		expect(res.results.find((r) => r.email === EMAIL.a)?.medium).toBe('physical');
		expect(res.results.find((r) => r.email === EMAIL.b)?.medium).toBe('digital');
		expect(res.unmatched_overrides).toEqual(['ghost@boscotech.net']);
	});

	test('a bad override value fails the whole run rather than guessing', async () => {
		const msg = await captureError(() =>
			bulkStudents([EMAIL.a], 'weekly_wage', { overrides: { [EMAIL.a]: 'crypto' } })
		);
		expect(msg).toMatch(/must be "physical" or "digital"/);
	});
});

// ---------------------------------------------------------------------------
// Scope, unchanged from 0073/0096
// ---------------------------------------------------------------------------

describe('scope', () => {
	test('refuses Extra Credit by name', async () => {
		const msg = await captureError(() => bulkStudents([EMAIL.a], 'extra_credit', { amount: 2 }));
		expect(msg).toMatch(/Extra Credit needs a per-student point count/);
	});

	test('refuses a per_unit or formula category', async () => {
		const msg = await captureError(() =>
			bulkStudents([EMAIL.a], 'perfect_score_graded_work', { amount: 3 })
		);
		expect(msg).toMatch(/needs per-student input/);
	});

	test('refuses a retired category', async () => {
		await rpc('public.coin_admin_set_category_active($1, $2)', ['song_request', false]);
		const msg = await captureError(() => bulkStudents([EMAIL.a], 'song_request'));
		expect(msg).toMatch(/cannot be logged directly/);
		await rpc('public.coin_admin_set_category_active($1, $2)', ['song_request', true]);
	});

	/**
	 * Validated ONCE, before the loop. The amount and note are the same for
	 * every student, so a config mistake that fell through to the loop would
	 * come back as the identical refusal N times over instead of one clear
	 * error -- and, worse, would have logged nothing while reporting a
	 * per-student outcome for everybody.
	 */
	test('validates the shape up front and writes nothing when it is wrong', async () => {
		const before = await txnCount(EMAIL.a);
		const msg = await captureError(() =>
			bulkStudents([EMAIL.a, EMAIL.b], 'above_and_beyond', { amount: 99 })
		);
		expect(msg).toMatch(/needs an amount between/);
		expect(await txnCount(EMAIL.a)).toBe(before);
	});

	test('a variable category still needs its note', async () => {
		const msg = await captureError(() =>
			bulkStudents([EMAIL.a], 'contract_completion', { amount: 5 })
		);
		expect(msg).toMatch(/needs a note/);
	});
});

// ---------------------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------------------

describe('permissions, and the append-only ledger', () => {
	test('a student cannot call it, for themselves or anyone else', async () => {
		const msg = await captureError(() =>
			bulkStudents([EMAIL.a], 'weekly_wage', {}, pupil.id)
		);
		expect(msg).toMatch(/Only site admins/);
	});

	test('anon holds no execute grant on either function', async () => {
		const { rows } = await db.sql<{ students: boolean; section: boolean }>(
			`select
			   has_function_privilege('anon', 'public.coin_bulk_log_students(text[], text, integer, text, text, jsonb)', 'execute') as students,
			   has_function_privilege('anon', 'public.coin_bulk_log_section(text, text, integer, text, text, jsonb)', 'execute') as section`
		);
		expect(rows[0].students).toBe(false);
		expect(rows[0].section).toBe(false);
	});

	/**
	 * 0115 adds no write path of its own: it can only INSERT, through
	 * coin_log_transaction. If a grant ever appeared here, the ledger would
	 * stop being append-only and nothing in the app would look different.
	 */
	test('no client write grant on coin_transactions, for a student or an admin', async () => {
		for (const [role, priv] of [
			['authenticated', 'INSERT'],
			['authenticated', 'UPDATE'],
			['authenticated', 'DELETE'],
			['anon', 'INSERT'],
			['anon', 'UPDATE'],
			['anon', 'DELETE']
		] as const) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_table_privilege($1, 'public.coin_transactions', $2) as ok`,
				[role, priv]
			);
			expect(rows[0].ok, `${role} must not hold ${priv}`).toBe(false);
		}
	});
});
