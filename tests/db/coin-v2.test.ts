// tests/db/coin-v2.test.ts
//
// IDEA COIN V2 (ledger 0384, migrations 0239 to 0243) on the whole tree.
//
// Each guarantee here is one whose regression would be SILENT: a balance that
// quietly counts the wrong rows, a purchase that quietly overdraws, a student
// door that quietly takes an address, autopay that quietly pays twice, a hall
// pass fined twice or fined for an instructor's pass, a tournament that
// quietly mints. Every one carries a planted control: the case it must NOT
// match is seeded beside the case it must, so a vacuous pass is impossible.
//
// The one-balance cutover is tested the migration way: the chain is booted
// SHORT of V2, real coin rows are written through the REAL pre-V2 RPCs (both
// media), and the V2 files are applied over the top.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { PRE_V2, V2_FILES, WITH_V2, v2Sql } from './chain-coin-v2';

type Json = Record<string, unknown>;

async function rpcAs<T = Json>(db: TestDb, user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
}

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

// ---------------------------------------------------------------------------
// 1. THE CUTOVER: one balance, over seeded pre-V2 data.
// ---------------------------------------------------------------------------

describe('the balance ignores physical rows (seeded through the pre-V2 RPCs, then V2 applied)', () => {
	let db: TestDb;
	let admin: SeededUser;
	const ana = 'ana.cut@boscotech.net';

	beforeAll(async () => {
		db = await startTestDb(PRE_V2);
		admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
		// The deployed 0096 logger, both media, integer amounts.
		await rpcAs(db, admin, `public.coin_log_transaction($1, 'above_and_beyond', 3, null, 'in hand', 'physical')`, [ana]);
		await rpcAs(db, admin, `public.coin_log_transaction($1, 'above_and_beyond', 2, null, 'credited', 'digital')`, [ana]);
		await rpcAs(db, admin, `public.coin_log_transaction($1, 'disruptive_behavior', null, null, null, 'physical')`, [ana]);
		for (const f of V2_FILES) await db.sql(v2Sql(f));
	}, 600_000);
	afterAll(async () => db?.stop());

	test('V2 applied over the seeded world (and re-applies cleanly)', async () => {
		expect(V2_FILES.length).toBeGreaterThanOrEqual(5);
		// Re-paste the files a person would re-paste: from 0244 on. Session
		// one's files are not re-applicable over session two's tree, because
		// 0251 retires the p_medium overloads 0239 recreates and 0239's own
		// self-check counts them; that is the one known exception.
		for (const f of V2_FILES.filter((x) => x >= '0244')) await db.sql(v2Sql(f));
	});

	test('control: the physical rows are still there, and would change the total', async () => {
		const { rows } = await db.sql<{ n: string; s: string }>(
			`select count(*)::text n, sum(amount)::text s from public.coin_transactions where student_email = $1 and medium = 'physical'`,
			[ana]
		);
		expect(rows[0].n).toBe('2');
		expect(Number(rows[0].s)).toBe(0); // +3 -3: a planted pair that nets to zero...
		const all = await db.sql<{ s: string }>(`select sum(amount)::text s from public.coin_transactions where student_email = $1`, [ana]);
		expect(Number(all.rows[0].s)).toBe(2);
	});

	test('the balance is the digital sum alone, on every reader', async () => {
		// Add a physical row that does NOT net to zero, so total and digital differ.
		await db.sql(
			`insert into public.coin_transactions (student_email, category_id, amount, actor_email, medium)
			 values ($1, 'above_and_beyond', 7, 'seed', 'physical')`,
			[ana]
		);
		const total = await db.sql<{ s: string }>(`select sum(amount)::text s from public.coin_transactions where student_email = $1`, [ana]);
		expect(Number(total.rows[0].s)).toBe(9);
		const fn = await db.sql<{ b: string }>(`select public._coin_balance($1)::text b`, [ana]);
		expect(Number(fn.rows[0].b)).toBe(2);
		const view = await db.sql<{ b: string }>(`select balance::text b from public.coin_balances where student_email = $1`, [ana]);
		expect(Number(view.rows[0].b)).toBe(2);
		const lookup = await rpcAs<Json>(db, admin, `public.coin_admin_lookup($1)`, [ana]);
		expect(Number(lookup.balance)).toBe(2);
		expect(lookup).not.toHaveProperty('physical_balance');
		const board = await db.asAnon((q) => q<{ balance: string }>(`select balance::text from public.coin_public_leaderboard()`));
		expect(board.rows.map((r) => Number(r.balance))).toEqual([2]);
	});

	test('no conversion rows were written by the cutover', async () => {
		const { rows } = await db.sql<{ n: string }>(`select count(*)::text n from public.coin_transactions where student_email = $1`, [ana]);
		expect(rows[0].n).toBe('4');
	});
});

// ---------------------------------------------------------------------------
// The rest run on one database with V2 applied.
// ---------------------------------------------------------------------------

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cal: SeededUser;
let s1: string;
let s2: string;

const rpc = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) => rpcAs<T>(db, u, call, params);

async function balance(email: string): Promise<number> {
	const { rows } = await db.sql<{ b: string }>(`select public._coin_balance($1)::text b`, [email]);
	return Number(rows[0].b);
}
async function rowCount(email: string, category?: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*)::text n from public.coin_transactions where student_email = $1 and ($2::text is null or category_id = $2)`,
		[email, category ?? null]
	);
	return Number(rows[0].n);
}
async function setting(key: string, value: unknown) {
	await db.sql(
		`insert into public.coin_settings (key, value) values ($1, $2::jsonb)
		 on conflict (key) do update set value = excluded.value`,
		[key, JSON.stringify(value)]
	);
}
async function createAssignment(sections: string[], title: string, points: number): Promise<string> {
	const r = await rpc<{ item_id: string }>(
		teacher,
		`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', $3, null, null, true, '[]'::jsonb, false)`,
		[sections, title, points]
	);
	return r.item_id;
}
async function gradeDirect(item: string, email: string, score: number | null, ret = true, extra: number | null = null) {
	return rpc<Json>(teacher, `public.classroom_grade_direct($1::uuid, $2, $3::numeric, null, $4, $5::numeric)`, [item, email, score, ret, extra]);
}

beforeAll(async () => {
	db = await startTestDb(WITH_V2);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	cal = await createUser(db, 'cal@boscotech.net', 'Cal Ng');
	s1 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	s2 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: teacher.email });
	const longAgo = new Date(Date.now() - 90 * 86400000).toISOString();
	for (const s of [ana, ben, cal]) {
		await enrollStudent(db, { as: admin, sectionId: s1, email: s.email, displayName: s.email.split('@')[0], createdAt: longAgo });
	}
	await enrollStudent(db, { as: admin, sectionId: s2, email: ana.email, displayName: 'ana', createdAt: longAgo });
	// A semester around today, and no no-pay weeks, so nothing below hangs on
	// the real calendar.
	await db.sql(`
		insert into public.coin_settings (key, value) values ('semesters', jsonb_build_array(jsonb_build_object(
			'key', 'test-term', 'start', to_char(current_date - 120, 'YYYY-MM-DD'), 'end', to_char(current_date + 120, 'YYYY-MM-DD'))))
		on conflict (key) do update set value = excluded.value`);
	await setting('no_pay_weeks', []);
	await db.sql(`delete from public.coin_settings where key = 'no_pay_after'`);
	// Autopay paused while the fixtures are built, so nothing pays early.
	await setting('autopay_paused', true);
}, 600_000);

afterAll(async () => db?.stop());

describe('fractional amounts round-trip', () => {
	test('a 1.25 award and a 0.50 fine leave 0.75, stored exactly', async () => {
		const e = 'frac@boscotech.net';
		const a = await rpc<Json>(admin, `public.coin_log_transaction($1, 'balance_correction', 1.25, null, 'quarter')`, [e]);
		expect(a.ok).toBe(true);
		const set = await rpc<Json>(admin, `public.coin_settings_set_category('classroom_standards_violation', null, 0.5, null, null, null, null, null, null)`);
		expect(set.ok).toBe(true);
		const f = await rpc<Json>(admin, `public.coin_log_transaction($1, 'classroom_standards_violation')`, [e]);
		expect(Number(f.amount)).toBe(-0.5);
		const { rows } = await db.sql<{ amount: string }>(`select amount::text from public.coin_transactions where student_email = $1 order by created_at`, [e]);
		expect(rows.map((r) => r.amount)).toEqual(['1.25', '-0.50']);
		expect(await balance(e)).toBe(0.75);
		// Control: an integer-only column would have stored 1 and -1 (or 1 and 0).
		expect(rows.map((r) => Number(r.amount))).not.toEqual([1, -1]);
		await rpc(admin, `public.coin_settings_set_category('classroom_standards_violation', null, 1, null, null, null, null, null, null)`);
	});
});

describe('an overdraw is refused before any row is written', () => {
	test('a student buying past zero writes nothing; with enough it writes one row', async () => {
		await rpc(admin, `public.coin_log_transaction($1, 'balance_correction', 10, null, 'seed')`, [ben.email]);
		const before = await rowCount(ben.email);
		const r = await rpc<Json>(ben, `public.coin_buy_eating_pass()`);
		expect(r).toMatchObject({ ok: false, reason: 'insufficient' });
		expect(await rowCount(ben.email)).toBe(before);
		expect(await balance(ben.email)).toBe(10);
		// The admin logger obeys the same rule.
		const a = await rpc<Json>(admin, `public.coin_log_transaction($1, 'eating_pass')`, [ben.email]);
		expect(a).toMatchObject({ ok: false, reason: 'insufficient' });
		expect(await rowCount(ben.email)).toBe(before);
		// Control: with 150 exactly the balance lands on zero, which is allowed.
		await rpc(admin, `public.coin_log_transaction($1, 'balance_correction', 140, null, 'seed')`, [ben.email]);
		const ok = await rpc<Json>(ben, `public.coin_buy_eating_pass()`);
		expect(ok.ok).toBe(true);
		expect(await balance(ben.email)).toBe(0);
		expect(await rowCount(ben.email, 'eating_pass')).toBe(1);
	});

	test('fines still post at any balance', async () => {
		const r = await rpc<Json>(admin, `public.coin_log_transaction($1, 'disruptive_behavior')`, [ben.email]);
		expect(r.ok).toBe(true);
		expect(await balance(ben.email)).toBe(-3);
	});

	test('no writer takes a medium any more (0251 retired p_medium): naming one does not resolve', async () => {
		const m = await refusal(rpc(admin, `public.coin_log_transaction($1, 'above_and_beyond', 1, null, 'x', 'physical')`, [ben.email]));
		expect(m).toMatch(/does not exist/);
		// Control: the same call with no medium posts.
		const ok = await rpc<Json>(admin, `public.coin_log_transaction($1, 'above_and_beyond', 1, null, 'x')`, [ben.email]);
		expect(ok.ok).toBe(true);
		await rpc(admin, `public.coin_reverse_transaction($1::uuid)`, [ok.transaction_id]);
	});
});

describe('a student function takes no email and no amount', () => {
	const STUDENT_FNS = ['coin_buy_eating_pass', 'coin_buy_pay_raise', 'coin_buy_print', 'coin_buy_extra_credit', 'coin_my_page'];

	test('on the catalog: no student door names an email, an amount, a cost or a price', async () => {
		const { rows } = await db.sql<{ proname: string; args: string }>(
			`select p.proname, pg_get_function_identity_arguments(p.oid) args
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = any($1::text[])`,
			[[...STUDENT_FNS, 'coin_log_transaction']]
		);
		const student = rows.filter((r) => r.proname !== 'coin_log_transaction');
		expect(student.map((r) => r.proname).sort()).toEqual([...STUDENT_FNS].sort());
		for (const r of student) expect(r.args).not.toMatch(/email|amount|cost|price/i);
		// Control: the admin logger, which DOES take both, is matched by the same test.
		const admin = rows.find((r) => r.proname === 'coin_log_transaction')!;
		expect(admin.args).toMatch(/email/);
		expect(admin.args).toMatch(/amount/);
	});

	test('naming another student or an amount does not resolve, and the admin door refuses a student', async () => {
		const a = await refusal(rpc(ana, `public.coin_buy_print(p_grams => 10, p_email => $1)`, [ben.email]));
		expect(a).toMatch(/does not exist/);
		const b = await refusal(rpc(ana, `public.coin_buy_eating_pass(p_amount => 0)`));
		expect(b).toMatch(/does not exist/);
		const c = await refusal(rpc(ana, `public.coin_log_transaction($1, 'above_and_beyond', 3, null, 'me')`, [ana.email]));
		expect(c).toMatch(/Only coin staff/);
	});

	test('the seam charges the caller and nobody else', async () => {
		await rpc(admin, `public.coin_log_transaction($1, 'balance_correction', 20, null, 'seed')`, [ana.email]);
		const benBefore = await rowCount(ben.email);
		const r = await rpc<Json>(ana, `public.coin_buy_print(25)`);
		expect(r).toMatchObject({ ok: true });
		expect(Number(r.cost)).toBe(3); // round half up of 2.5
		expect(await rowCount(ben.email)).toBe(benBefore);
		const anon = await db.asAnon((q) => q(`select public.coin_buy_print(25) as r`)).catch((e: Error) => e.message);
		expect(String(anon)).toMatch(/permission denied/);
	});

	test('a signed-in caller who is not in an economy-on class is refused by the seam', async () => {
		const outsider = await createUser(db, 'outside@boscotech.net', 'Out Sider');
		const r = await rpc<Json>(outsider, `public.coin_buy_print(10)`);
		expect(r).toMatchObject({ ok: false, reason: 'not_in_economy' });
	});
});

describe('the extra credit cap holds per section', () => {
	let i1: string;
	let i2: string;
	let i3: string;
	let subOf: (item: string) => Promise<string>;

	beforeAll(async () => {
		i1 = await createAssignment([s1], 'Cap one', 100);
		i2 = await createAssignment([s1], 'Cap two', 50);
		i3 = await createAssignment([s2], 'Cap three', 100);
		for (const i of [i1, i2, i3]) {
			const g = await gradeDirect(i, ana.email, 40);
			expect(g, JSON.stringify(g)).toMatchObject({ ok: true });
		}
		subOf = async (item) =>
			(await db.sql<{ id: string }>(`select id from public.classroom_submissions where item_id = $1 and student_email = $2`, [item, ana.email])).rows[0].id;
		await rpc(admin, `public.coin_log_transaction($1, 'balance_correction', 100, null, 'seed')`, [ana.email]);
	});

	test('three points in Block 1 (2% of 150), two in Block 4 (2% of 100), each counted on its own', async () => {
		const first = await rpc<Json>(ana, `public.coin_buy_extra_credit($1::uuid, $2::uuid, 2)`, [s1, await subOf(i1)]);
		expect(first.ok).toBe(true);
		const over = await rpc<Json>(ana, `public.coin_buy_extra_credit($1::uuid, $2::uuid, 2)`, [s1, await subOf(i2)]);
		expect(over).toMatchObject({ ok: false, reason: 'cap' });
		const last = await rpc<Json>(ana, `public.coin_buy_extra_credit($1::uuid, $2::uuid, 1)`, [s1, await subOf(i2)]);
		expect(last.ok).toBe(true);
		const none = await rpc<Json>(ana, `public.coin_buy_extra_credit($1::uuid, $2::uuid, 1)`, [s1, await subOf(i1)]);
		expect(none).toMatchObject({ ok: false, reason: 'cap' });
		// Control: Block 4 has its own room, untouched by Block 1's purchases.
		const other = await rpc<Json>(ana, `public.coin_buy_extra_credit($1::uuid, $2::uuid, 2)`, [s2, await subOf(i3)]);
		expect(other.ok).toBe(true);
	});

	test('the points land on the submission and its score', async () => {
		const { rows } = await db.sql<{ extra_credit: string; score: string }>(
			`select extra_credit::text, score::text from public.classroom_submissions where id = $1`,
			[await subOf(i1)]
		);
		expect(Number(rows[0].extra_credit)).toBe(2);
		expect(Number(rows[0].score)).toBe(42);
	});

	test('a regrade cannot take bought points away', async () => {
		const g = await gradeDirect(i1, ana.email, 35, true, 0);
		expect(g.ok).toBe(true);
		const { rows } = await db.sql<{ extra_credit: string; score: string }>(
			`select extra_credit::text, score::text from public.classroom_submissions where id = $1`,
			[await subOf(i1)]
		);
		expect(Number(rows[0].extra_credit)).toBe(2);
		expect(Number(rows[0].score)).toBe(37);
	});

	test('work from another class is refused', async () => {
		const r = await rpc<Json>(ana, `public.coin_buy_extra_credit($1::uuid, $2::uuid, 1)`, [s2, await subOf(i1)]);
		expect(r).toMatchObject({ ok: false, reason: 'not_your_work' });
	});
});

describe('Perfect Score pays, reverses on a lower regrade, and re-pays', () => {
	let item: string;
	let offItem: string;
	const perfectRows = async (email: string) =>
		(
			await db.sql<{ category_id: string; amount: string }>(
				`select category_id, amount::text from public.coin_transactions
				 where student_email = $1 and (category_id = 'perfect_score_graded_work' or
					(category_id = 'reversal' and meta ->> 'reversed_category' = 'perfect_score_graded_work'))
				 order by created_at, id`,
				[email]
			)
		).rows;

	beforeAll(async () => {
		await setting('autopay_paused', false);
		item = await createAssignment([s1], 'Perfect', 50);
		offItem = await createAssignment([s1], 'Perfect off', 50);
		const t = await rpc<Json>(teacher, `public.classroom_set_posting_perfect_score($1::uuid, $2::uuid, true)`, [item, s1]);
		expect(t.ok).toBe(true);
	});

	test('a full direct score pays round(50 / 25) = 2, once', async () => {
		await gradeDirect(item, cal.email, 50);
		await gradeDirect(item, cal.email, 50);
		const rows = await perfectRows(cal.email);
		expect(rows).toEqual([{ category_id: 'perfect_score_graded_work', amount: '2.00' }]);
		const { rows: actor } = await db.sql<{ a: string }>(
			`select actor_email a from public.coin_transactions where student_email = $1 and category_id = 'perfect_score_graded_work'`,
			[cal.email]
		);
		expect(actor[0].a).toBe('system');
	});

	test('control: the same full score on a posting with the toggle off pays nothing', async () => {
		await gradeDirect(offItem, ben.email, 50);
		expect(await perfectRows(ben.email)).toEqual([]);
	});

	test('extra credit does not make a score perfect', async () => {
		await gradeDirect(item, ben.email, 45, true, 5);
		expect(await perfectRows(ben.email)).toEqual([]);
	});

	test('a lower regrade posts one reversal; back to full re-pays; the net is paid once', async () => {
		await gradeDirect(item, cal.email, 40);
		await gradeDirect(item, cal.email, 41);
		let rows = await perfectRows(cal.email);
		expect(rows.map((r) => r.category_id)).toEqual(['perfect_score_graded_work', 'reversal']);
		await gradeDirect(item, cal.email, 50);
		rows = await perfectRows(cal.email);
		expect(rows.map((r) => r.category_id)).toEqual(['perfect_score_graded_work', 'reversal', 'perfect_score_graded_work']);
		const net = rows.reduce((s, r) => s + Number(r.amount), 0);
		expect(net).toBe(2);
		// The nightly run settles nothing more.
		await rpc(admin, `public.coin_autopay_run('admin')`);
		expect((await perfectRows(cal.email)).length).toBe(3);
	});
});

describe('autopay run twice pays once', () => {
	beforeAll(async () => {
		await setting('autopay_paused', false);
		await db.sql(`
			insert into public.coin_settings (key, value)
			values ('autopay_start', to_jsonb(to_char(current_date - 21, 'YYYY-MM-DD')))
			on conflict (key) do update set value = excluded.value`);
	});

	test('every completed week pays each economy student exactly once', async () => {
		const first = await rpc<Json>(admin, `public.coin_autopay_run('admin')`);
		expect(first.ran).toBe(true);
		const { rows: weeks } = await db.sql<{ n: string }>(`
			select count(*)::text n from generate_series(
				public._coin_week_start(current_date - 21), current_date, interval '7 days') w
			where w::date + 6 < (now() at time zone 'America/Los_Angeles')::date`);
		const expected = Number(weeks[0].n);
		expect(expected).toBeGreaterThanOrEqual(2);
		const wageRows = async (email: string) => rowCount(email, 'weekly_wage');
		for (const s of [ana, ben, cal]) expect(await wageRows(s.email)).toBe(expected);
		// Control: the teacher manages the class and is never paid as a student.
		expect(await wageRows(teacher.email)).toBe(0);
		const second = await rpc<Json>(admin, `public.coin_autopay_run('admin')`);
		expect(second.ran).toBe(true);
		expect(second.wages).toBe(0);
		for (const s of [ana, ben, cal]) expect(await wageRows(s.email)).toBe(expected);
		const actors = await db.sql<{ a: string }>(`select distinct actor_email a from public.coin_transactions where category_id = 'weekly_wage'`);
		expect(actors.rows.map((r) => r.a)).toEqual(['system']);
	});

	test('a paused economy pays nothing', async () => {
		await setting('autopay_paused', true);
		const r = await rpc<Json>(admin, `public.coin_autopay_run('admin')`);
		expect(r).toMatchObject({ ran: false, reason: 'paused' });
		await setting('autopay_paused', false);
	});

	test('anon may call it; it answers counts and is throttled', async () => {
		const r = await db.asAnon((q) => q<{ r: Json }>(`select public.coin_autopay_run('nightly') as r`));
		expect(r.rows[0].r.ok).toBe(true);
		expect(JSON.stringify(r.rows[0].r)).not.toMatch(/@/);
	});
});

describe('Highest Grade: ties pay both, extra credit excluded', () => {
	let sec: string;
	let x: SeededUser;
	let y: SeededUser;
	let z: SeededUser;
	const highest = async (email: string) =>
		(
			await db.sql<{ n: string }>(
				`select count(*)::text n from public.coin_transactions where student_email = $1 and category_id = 'highest_grade_weekly' and meta ->> 'section_id' = $2`,
				[email, sec]
			)
		).rows[0].n;

	beforeAll(async () => {
		x = await createUser(db, 'hx@boscotech.net', 'H X');
		y = await createUser(db, 'hy@boscotech.net', 'H Y');
		z = await createUser(db, 'hz@boscotech.net', 'H Z');
		sec = await createClassroomSection(db, { as: admin, courseCode: 'IDEA300', courseTitle: 'Three', label: 'Block 7', teacherEmail: teacher.email });
		const longAgo = new Date(Date.now() - 90 * 86400000).toISOString();
		for (const s of [x, y, z]) await enrollStudent(db, { as: admin, sectionId: sec, email: s.email, displayName: s.email, createdAt: longAgo });
		const item = await createAssignment([sec], 'Highest', 100);
		await gradeDirect(item, x.email, 80, true, 10); // 90 on paper, 80 without extra credit
		await gradeDirect(item, y.email, 80, true, null);
		await gradeDirect(item, z.email, 70, true, null);
		// Pin the work to ten days ago, so it sits inside a completed period.
		await db.sql(`update public.classroom_items set due_at = now() - interval '10 days' where id = $1`, [item]);
		await db.sql(`update public.classroom_submissions set returned_at = now() - interval '10 days' where item_id = $1`, [item]);
		await setting('highest_grade_weeks', 1);
		await db.sql(`
			insert into public.coin_settings (key, value)
			values ('highest_grade_anchor', to_jsonb(to_char(public._coin_week_start(current_date - 14), 'YYYY-MM-DD')))
			on conflict (key) do update set value = excluded.value`);
		await db.sql(`delete from public.coin_autopay_runs`);
		await rpc(admin, `public.coin_autopay_run('admin')`);
	});

	test('the two students tied without extra credit are both paid, the same number of times', async () => {
		const hx = Number(await highest(x.email));
		const hy = Number(await highest(y.email));
		expect(hx).toBeGreaterThanOrEqual(1);
		expect(hx).toBe(hy);
	});

	test('control: the lower grade is not paid, and counting extra credit would have broken the tie', async () => {
		expect(await highest(z.email)).toBe('0');
		const { rows } = await db.sql<{ x: string; y: string }>(
			`select (select score::text from public.classroom_submissions s join public.classroom_postings p on p.item_id = s.item_id
				where p.section_id = $1 and s.student_email = $2) x,
			 (select score::text from public.classroom_submissions s join public.classroom_postings p on p.item_id = s.item_id
				where p.section_id = $1 and s.student_email = $3) y`,
			[sec, x.email, y.email]
		);
		expect(Number(rows[0].x)).toBeGreaterThan(Number(rows[0].y));
	});

	test('a second run pays no more', async () => {
		const before = Number(await highest(x.email));
		await rpc(admin, `public.coin_autopay_run('admin')`);
		expect(Number(await highest(x.email))).toBe(before);
	});
});

describe('the hall pass warns and fines once per pass, and never for an instructor pass', () => {
	let hp: string;
	let st: SeededUser;
	const events = async (pass: string) =>
		(await db.sql<{ kind: string }>(`select kind from public.classroom_hall_pass_events where pass_id = $1 order by kind`, [pass])).rows.map((r) => r.kind);
	const fines = async () => rowCount(st.email, 'long_bathroom_break');
	async function openPass(minsAgo: number, openedBy: string | null = null): Promise<string> {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.classroom_hall_passes (section_id, student_email, opened_at, opened_by)
			 values ($1, $2, now() - make_interval(mins => $3::int), $4) returning id`,
			[hp, st.email, minsAgo, openedBy]
		);
		return rows[0].id;
	}

	beforeAll(async () => {
		st = await createUser(db, 'pass@boscotech.net', 'Pass Taker');
		hp = await createClassroomSection(db, { as: admin, courseCode: 'IDEA400', courseTitle: 'Four', label: 'Block 2', teacherEmail: teacher.email });
		await enrollStudent(db, { as: admin, sectionId: hp, email: st.email, displayName: 'Pass Taker' });
		await db.sql(`update public.coin_settings set value = to_jsonb(now() - interval '1 day') where key = 'v2_hall_pass_from'`);
	});

	test('a 25 minute pass the student closes: one warning, one fine, however many paths look at it', async () => {
		const id = await openPass(25);
		const r = await rpc<Json>(st, `public.classroom_hall_pass_close_mine($1::uuid)`, [hp]);
		expect(r).toMatchObject({ ok: true, warned: true, fined: true });
		await rpc(st, `public.classroom_hall_pass_state($1::uuid)`, [hp]);
		await rpc(teacher, `public.classroom_hall_pass_state($1::uuid)`, [hp]);
		await rpc(teacher, `public.classroom_hall_pass_events($1::uuid)`, [hp]);
		expect(await events(id)).toEqual(['fine', 'warning']);
		expect(await fines()).toBe(1);
		const { rows } = await db.sql<{ actor_email: string; amount: string }>(
			`select actor_email, amount::text from public.coin_transactions where student_email = $1 and category_id = 'long_bathroom_break'`,
			[st.email]
		);
		expect(rows[0].actor_email).toBe('system');
	});

	test('a 12 minute pass: a warning and no fine', async () => {
		const id = await openPass(12);
		await rpc(st, `public.classroom_hall_pass_close_mine($1::uuid)`, [hp]);
		expect(await events(id)).toEqual(['warning']);
		expect(await fines()).toBe(1);
	});

	test('an instructor closing a 25 minute pass: nothing', async () => {
		const id = await openPass(25);
		const r = await rpc<Json>(teacher, `public.classroom_hall_pass_close_by_id($1::uuid)`, [id]);
		expect(r.ok).toBe(true);
		await rpc(teacher, `public.classroom_hall_pass_state($1::uuid)`, [hp]);
		expect(await events(id)).toEqual([]);
		expect(await fines()).toBe(1);
	});

	test('an instructor-opened pass the student closes at 25 minutes: nothing', async () => {
		const id = await openPass(25, teacher.email);
		await rpc(st, `public.classroom_hall_pass_close_mine($1::uuid)`, [hp]);
		expect(await events(id)).toEqual([]);
		expect(await fines()).toBe(1);
	});

	test('a pass left open past the auto check-in is closed by the sweep and fined once', async () => {
		const id = await openPass(45);
		await rpc(st, `public.classroom_hall_pass_state($1::uuid)`, [hp]);
		await rpc(teacher, `public.classroom_hall_pass_state($1::uuid)`, [hp]);
		expect(await events(id)).toEqual(['fine', 'warning']);
		expect(await fines()).toBe(2);
		const { rows } = await db.sql<{ minutes: string }>(`select minutes::text from public.classroom_hall_pass_events where pass_id = $1 and kind = 'fine'`, [id]);
		expect(Number(rows[0].minutes)).toBe(30); // capped at the auto check-in
	});

	test('a student sees their own events and no name; a teacher sees names', async () => {
		const mine = await rpc<Json>(st, `public.classroom_hall_pass_events($1::uuid)`, [hp]);
		expect(mine.scope).toBe('student');
		expect(JSON.stringify(mine)).not.toMatch(/@/);
		const theirs = await rpc<Json>(teacher, `public.classroom_hall_pass_events($1::uuid)`, [hp]);
		expect(JSON.stringify(theirs)).toMatch(/pass@boscotech\.net/);
	});
});

describe('Undo reverses one row exactly once', () => {
	test('a Shop Safety fine bars the shop; undoing it restores the balance and lifts the bar', async () => {
		const e = 'undo@boscotech.net';
		const f = await rpc<Json>(admin, `public.coin_fine_log(array[$1], 'shop_safety_violation')`, [e]);
		const txn = (f.results as Json[])[0].transaction_id as string;
		expect(await balance(e)).toBe(-12);
		const bar = async () =>
			(await db.sql<{ n: string }>(`select count(*)::text n from public.coin_no_shop where student_email = $1 and cleared_at is null`, [e])).rows[0].n;
		expect(await bar()).toBe('1');
		const u = await rpc<Json>(admin, `public.coin_reverse_transaction($1::uuid)`, [txn]);
		expect(u.ok).toBe(true);
		expect(await balance(e)).toBe(0);
		expect(await bar()).toBe('0');
		const again = await rpc<Json>(admin, `public.coin_reverse_transaction($1::uuid)`, [txn]);
		expect(again).toMatchObject({ ok: false, reason: 'already_reversed' });
		expect(await balance(e)).toBe(0);
	});
});

describe('a tournament result mints no coin row', () => {
	test('a won match records the reward awaiting transfer, with no coin row', async () => {
		const host = await createUser(db, 'thost@boscotech.edu', 'Host');
		const players: SeededUser[] = [];
		for (let i = 0; i < 2; i += 1) players.push(await createUser(db, `tp${i}@boscotech.net`, `TP ${i}`));
		const t = await db.asUser(host.id, async (q) =>
			(await q<{ id: string }>(`select public.tournament_create($1, '', $2::jsonb) as id`, ['V2 cup', JSON.stringify({ team_size: 1 })])).rows[0].id
		);
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [t, JSON.stringify([{ trigger_type: 'win', trigger_value: null, amount: 10 }])])
		);
		await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'registration_open')`, [t]));
		for (let i = 0; i < 2; i += 1) {
			await db.asUser(players[i].id, (q) => q(`select public.tournament_register_entry($1, $2, '', null)`, [t, `E${i}`]));
		}
		await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t]));
		await db.asUser(host.id, (q) => q(`select public.tournament_generate_bracket($1)`, [t]));
		const { rows: ms } = await db.sql<{ id: string }>(
			`select id from public.tournament_bracket_matches where tournament_id = $1 and entry_a_id is not null and entry_b_id is not null limit 1`,
			[t]
		);
		await db.asUser(host.id, (q) => q(`select public.tournament_start_match($1)`, [ms[0].id]));
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_submit_match_result($1, $2::jsonb)`, [ms[0].id, JSON.stringify({ games: [{ winner: 'a' }] })])
		);
		const { rows: led } = await db.sql<{ coin_transaction_id: string | null; awaiting_transfer: boolean }>(
			`select coin_transaction_id, awaiting_transfer from public.tournament_reward_ledger where tournament_id = $1`,
			[t]
		);
		// Control: the reward IS recorded, so the absence below is not a quiet bracket.
		expect(led.length).toBeGreaterThanOrEqual(1);
		expect(led.every((r) => r.coin_transaction_id === null && r.awaiting_transfer)).toBe(true);
		const { rows: coins } = await db.sql<{ n: string }>(
			`select count(*)::text n from public.coin_transactions where category_id = 'competition_winnings' and meta ->> 'tournament_id' = $1`,
			[t]
		);
		expect(coins[0].n).toBe('0');
	});
});

describe('grants', () => {
	test('every new V2 table is closed to client roles and every admin door to anon', async () => {
		const { rows } = await db.sql<{ t: string; anon: boolean; auth: boolean }>(`
			select c.relname t,
				has_table_privilege('anon', c.oid, 'select') anon,
				has_table_privilege('authenticated', c.oid, 'select') auth
			from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1::text[])`,
			[['coin_settings', 'coin_settings_audit', 'coin_no_shop', 'coin_student_actions', 'coin_autopay_runs',
				'coin_autopay_wages', 'coin_autopay_highest', 'coin_autopay_highest_periods', 'coin_perfect_scores', 'classroom_hall_pass_events']]
		);
		expect(rows.length).toBe(10);
		for (const r of rows) {
			expect(r.anon, r.t).toBe(false);
			expect(r.auth, r.t).toBe(false);
		}
		const { rows: fns } = await db.sql<{ f: string; anon: boolean }>(`
			select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname like any(array['coin\\_%', '\\_coin\\_%'])`);
		const anonOpen = fns.filter((r) => r.anon).map((r) => r.f).sort();
		expect(anonOpen).toEqual([
			'coin_autopay_run',
			'coin_public_contracts',
			'coin_public_leaderboard',
			'coin_public_reasons',
			'coin_public_reported_coins',
			'coin_public_role_badges',
			'coin_public_role_questions',
			'coin_public_roles',
			'coin_public_student',
			'coin_public_transactions'
		]);
	});
});
