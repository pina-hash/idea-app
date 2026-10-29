// tests/db/coin-deposits-0322.test.ts
//
// LEDGER 0455 PART 2, the coin migration: Deposit, Weekly Pay, desk donations,
// relabeling past records, and what the two public reads say. Applied over a
// chain booted SHORT of the file, with records seeded through the REAL
// pre-migration RPCs, then applied again (a re-paste).
//
// The silent guarantees, each with its control:
//   - the widened setting gate answers every stored setting exactly as the
//     deployed one did (the corpus is put to the deployed gate first);
//   - a public read shows a note only for a Custom record; every other row
//     reads exactly as before, and a private transfer stays off it;
//   - a deposit under the minimum writes nothing; a relabel that fails on one
//     record changes none, and no relabel moves a balance.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, enrollStudent, type SeededUser, type TestDb, startTestDb } from './harness';

type Json = Record<string, unknown>;
const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILES = ALL.filter((f) => f.endsWith('_coin_deposits_and_record_labels.sql'));
if (FILES.length !== 1) throw new Error(`expected one deposits migration, found ${FILES.length}`);
const FILE = FILES[0];
const NUM = FILE.slice(0, 4);
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE)];
const SQL = readFileSync(join(DIR, FILE), 'utf8');

let db: TestDb;
let owner: SeededUser, teacher: SeededUser, ana: SeededUser, ben: SeededUser, cal: SeededUser;
let block: string;

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
const balance = async (email: string) => Number((await db.sql<{ b: string }>(`select public._coin_balance($1)::text as b`, [email])).rows[0].b);
const rowsOf = async (email: string) =>
	(await db.sql<{ id: string; category_id: string; amount: string; note: string | null }>(
		`select id, category_id, amount::text, note from public.coin_transactions where student_email = $1 order by created_at, id`,
		[email]
	)).rows;
type PublicRow = { name: string; amount: string; type: string; reason: string; category_id: string };
const publicRows = async () =>
	(await db.asAnon(async (q) => (await q<PublicRow>(`select name, amount::text, type, reason, category_id from public.coin_public_transactions(1000) order by category_id, amount, reason`)).rows));
const studentHistory = async (email: string) => {
	const id = (await db.sql<{ id: string }>(`select public_id as id from public._coin_public_roster() where student_email = $1`, [email])).rows[0].id;
	const r = await db.asAnon(async (q) => (await q<{ r: Json }>(`select public.coin_public_student($1) as r`, [id])).rows[0].r);
	return (r.history as Array<{ type: string; reason: string; category_id: string }>) ?? [];
};

let settingsBefore: Array<{ key: string; value: unknown; ok: boolean }> = [];
let publicBefore: PublicRow[] = [];
let customId = '';
let correctionDepositId = '';
let fineId = '';

const PLANTED: Array<[string, string]> = [
	['stock_floor', '0.001'],
	['banner_style', '"neon"'],
	['donation_cap_coins', '-1'],
	['market_listing_days', '2.5'],
	['no_such_setting', '1']
];

beforeAll(async () => {
	db = await startTestDb(PRE);
	owner = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	cal = await createUser(db, 'cal@boscotech.net', 'Cal Lee');
	block = await createClassroomSection(db, { as: owner, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	const other = await createClassroomSection(db, { as: owner, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Block 3', teacherEmail: owner.email });
	await enrollStudent(db, { as: owner, sectionId: block, email: ana.email, displayName: 'Reyes, Ana' });
	await enrollStudent(db, { as: owner, sectionId: block, email: ben.email, displayName: 'Ortiz, Ben' });
	await enrollStudent(db, { as: owner, sectionId: other, email: cal.email, displayName: 'Lee, Cal' });
	await db.sql(`update public.classroom_sections set coin_economy_on = true`);

	// Seeded through the deployed RPCs, as production holds them today.
	customId = String((await as<Json>(owner, `public.coin_log_transaction($1, 'custom_award', 22, null, $2)`, [ana.email, 'IDEA-Blade Rotation 2 tournament: 1st place, 12 wins'])).transaction_id);
	correctionDepositId = String((await as<Json>(owner, `public.coin_admin_adjust_balance($1, 4, $2)`, [ben.email, 'Physical to digital coin deposit'])).transaction_id);
	fineId = String((await as<Json>(owner, `public.coin_log_transaction($1, 'off_task_device_use', null, null, $2)`, [ben.email, 'phone out in class'])).transaction_id);
	await as(owner, `public.coin_log_transaction($1, 'custom_fine', 3, null, '')`, [cal.email]).catch(() => null);
	// A private transfer's row, written as the connection owner: it must never be public.
	await db.sql(`select public._coin_insert($1, 'custom_award', 7, null, 'secret gift', '{"private_transfer": "true"}'::jsonb, 'digital')`, [cal.email]);

	settingsBefore = (await db.sql<{ key: string; value: unknown; ok: boolean }>(`select key, value, public._coin_setting_ok(key, value) as ok from public.coin_settings order by key`)).rows;
	for (const [k, v] of PLANTED) settingsBefore.push({ key: k, value: JSON.parse(v), ok: (await db.sql<{ ok: boolean }>(`select public._coin_setting_ok($1, $2::jsonb) as ok`, [k, v])).rows[0].ok });
	publicBefore = await publicRows();

	await db.sql(SQL);
	// An admin's own edits between two applies: a re-paste never undoes them.
	await db.sql(`update public.coin_categories set amount = 6 where id = 'weekly_pay'`);
	await db.sql(`update public.coin_categories set loggable = false where id = 'donation'`);
	await db.sql(SQL);
}, 600_000);
afterAll(async () => db?.stop());

describe(`${NUM} applies through the real apply tool`, () => {
	test('the scanner finds nothing to refuse, and a planted top-level insert is found (control)', async () => {
		const { scanFile } = await import('../../tools/apply-migration.mjs');
		expect(scanFile(SQL).findings).toEqual([]);
		expect(scanFile(`insert into public.coin_settings (key, value) values ('x', '1');`).findings).toHaveLength(1);
	});
});

describe(`${NUM}: the setting gate widens and answers every stored setting as before`, () => {
	test('the stored corpus and the planted refusals answer exactly as the deployed gate did', async () => {
		expect(settingsBefore.length).toBeGreaterThan(20);
		expect(settingsBefore.filter((s) => !s.ok).length).toBeGreaterThanOrEqual(PLANTED.length);
		for (const s of settingsBefore) {
			const now = (await db.sql<{ ok: boolean }>(`select public._coin_setting_ok($1, $2::jsonb) as ok`, [s.key, JSON.stringify(s.value)])).rows[0].ok;
			expect(now, s.key).toBe(s.ok);
		}
	});
	test('deposit_minimum is a whole number from 1 to 1000, default 5', async () => {
		const ok = async (v: string) => (await db.sql<{ ok: boolean }>(`select public._coin_setting_ok('deposit_minimum', $1::jsonb) as ok`, [v])).rows[0].ok;
		expect(await ok('5')).toBe(true);
		expect(await ok('1000')).toBe(true);
		expect(await ok('0')).toBe(false);
		expect(await ok('2.5')).toBe(false);
		expect(await ok('"5"')).toBe(false);
		expect((await db.sql<{ v: unknown }>(`select value as v from public.coin_settings where key = 'deposit_minimum'`)).rows[0].v).toBe(5);
	});
});

describe(`${NUM}: the categories`, () => {
	test('Deposit is priced formula, Weekly Pay flat, Donation loggable, and a re-paste keeps an admin edit', async () => {
		const rows = (await db.sql<{ id: string; kind: string; pricing_model: string; amount: string | null; loggable: boolean }>(
			`select id, kind, pricing_model, amount::text, loggable from public.coin_categories where id in ('coin_deposit', 'weekly_pay', 'donation') order by id`
		)).rows;
		expect(rows).toEqual([
			{ id: 'coin_deposit', kind: 'award', pricing_model: 'formula', amount: null, loggable: true },
			// Both edited between the two applies; the second apply left them.
			{ id: 'donation', kind: 'award', pricing_model: 'variable', amount: null, loggable: false },
			{ id: 'weekly_pay', kind: 'award', pricing_model: 'flat', amount: '6.00', loggable: true }
		]);
	});
	test('the general logger refuses a deposit, so the minimum cannot be gone around', async () => {
		expect(await refusal(as(owner, `public.coin_log_transaction($1, 'coin_deposit', 1, null, 'x')`, [ana.email]))).toMatch(/dedicated logging function/);
	});
});

describe(`${NUM}: a deposit`, () => {
	test('at the minimum it adds to the digital balance and says physical to digital', async () => {
		const before = await balance(ana.email);
		const r = await as<Json>(owner, `public.coin_log_deposit($1, 5)`, [ana.email]);
		expect(r).toMatchObject({ ok: true, amount: 5, category_id: 'coin_deposit' });
		expect(await balance(ana.email)).toBe(before + 5);
		expect((await rowsOf(ana.email)).at(-1)).toMatchObject({ category_id: 'coin_deposit', amount: '5.00', note: 'Physical to digital' });
		const r2 = await as<Json>(owner, `public.coin_log_deposit($1, 6, 'jar on the desk')`, [ana.email]);
		expect(r2.ok).toBe(true);
		expect((await rowsOf(ana.email)).at(-1)?.note).toBe('Physical to digital: jar on the desk');
	});
	test('under the minimum it refuses in words and writes nothing; the setting moves the line', async () => {
		const n = (await rowsOf(ana.email)).length;
		const r = await as<Json>(owner, `public.coin_log_deposit($1, 4)`, [ana.email]);
		expect(r).toMatchObject({ ok: false, reason: 'below_minimum', minimum: 5 });
		expect(r.message).toBe('A deposit is at least 5 coins. Nothing was recorded.');
		expect((await as<Json>(owner, `public.coin_log_deposit($1, 2.5)`, [ana.email])).reason).toBe('deposit_amount');
		expect((await rowsOf(ana.email)).length).toBe(n);
		expect((await as<Json>(owner, `public.coin_settings_set('deposit_minimum', '2'::jsonb)`)).ok).toBe(true);
		expect((await as<Json>(owner, `public.coin_log_deposit($1, 4)`, [ana.email])).ok).toBe(true);
		expect((await rowsOf(ana.email)).length).toBe(n + 1);
		await as(owner, `public.coin_settings_set('deposit_minimum', '5'::jsonb)`);
	});
	test("a class's teacher deposits for their own student only; a student and a visitor cannot", async () => {
		expect((await as<Json>(teacher, `public.coin_log_deposit($1, 5)`, [ben.email])).ok).toBe(true);
		expect(await refusal(as(teacher, `public.coin_log_deposit($1, 5)`, [cal.email]))).toMatch(/not in one of your classes/);
		expect(await refusal(as(ana, `public.coin_log_deposit($1, 5)`, [ana.email]))).toMatch(/Only coin staff/);
		expect(await refusal(db.asAnon((q) => q(`select public.coin_log_deposit('ana@boscotech.net', 5)`)))).toMatch(/permission denied/);
	});
});

describe(`${NUM}: the public reads`, () => {
	test('a Custom record gives its note as its reason; every other row reads exactly as before', async () => {
		const after = await publicRows();
		const deposits = after.filter((r) => r.category_id === 'coin_deposit');
		expect(deposits.length).toBeGreaterThan(0);
		expect(deposits.every((r) => r.type === 'Deposit' && r.reason === 'Deposit')).toBe(true);
		const custom = after.filter((r) => r.category_id === 'custom_award');
		expect(custom).toEqual([{ name: 'Reyes, Ana', amount: '22.00', type: 'Award', reason: 'IDEA-Blade Rotation 2 tournament: 1st place, 12 wins', category_id: 'custom_award' }]);
		const before = publicBefore.find((r) => r.category_id === 'custom_award');
		expect(before?.reason).toBe('Custom Award');
		// Everything that is neither a deposit nor a custom record: identical, notes kept off.
		const plain = (rows: PublicRow[]) => rows.filter((r) => !['coin_deposit', 'custom_award', 'custom_fine', 'custom_purchase'].includes(r.category_id));
		expect(plain(after)).toEqual(plain(publicBefore));
		expect(plain(after).some((r) => r.category_id === 'balance_correction' && r.reason === 'Balance Correction / Refund')).toBe(true);
		expect(after.some((r) => r.reason.includes('phone out') || r.reason.includes('Physical to digital coin deposit'))).toBe(false);
	});
	test('a private transfer stays off both public reads (present in the table, absent from the board)', async () => {
		expect((await db.sql(`select 1 from public.coin_transactions where note = 'secret gift'`)).rows.length).toBe(1);
		expect((await publicRows()).some((r) => r.reason === 'secret gift' || r.amount === '7.00')).toBe(false);
		expect((await studentHistory(cal.email)).some((h) => h.reason === 'secret gift')).toBe(false);
	});
	test("a student's public page says Deposit and the custom reason too", async () => {
		const h = await studentHistory(ana.email);
		expect(h.some((x) => x.type === 'Deposit')).toBe(true);
		expect(h.some((x) => x.reason === 'IDEA-Blade Rotation 2 tournament: 1st place, 12 wins')).toBe(true);
	});
});

describe(`${NUM}: correcting what past records say`, () => {
	test('only a full coin admin relabels, and nobody signed out', async () => {
		const change = JSON.stringify([{ id: customId, note: 'x' }]);
		expect(await refusal(as(teacher, `public.coin_transactions_relabel($1::jsonb)`, [change]))).toMatch(/full coin admin/);
		expect(await refusal(db.asAnon((q) => q(`select public.coin_transactions_relabel($1::jsonb)`, [change])))).toMatch(/permission denied/);
		expect((await rowsOf(ana.email)).find((r) => r.id === customId)?.note).toBe('IDEA-Blade Rotation 2 tournament: 1st place, 12 wins');
	});
	test('one bad record refuses the whole call and changes nothing', async () => {
		const before = await rowsOf(ben.email);
		const change = JSON.stringify([
			{ id: correctionDepositId, category: 'coin_deposit', note: 'Physical to digital' },
			{ id: fineId, category: 'custom_award' }
		]);
		expect(await refusal(as(owner, `public.coin_transactions_relabel($1::jsonb)`, [change]))).toMatch(/cannot become a award/);
		expect(await rowsOf(ben.email)).toEqual(before);
	});
	test('a deposit logged as a balance correction becomes a Deposit; amounts and balances do not move', async () => {
		const bBen = await balance(ben.email);
		const bAna = await balance(ana.email);
		const r = await as<Json>(owner, `public.coin_transactions_relabel($1::jsonb)`, [
			JSON.stringify([
				{ id: correctionDepositId, category: 'coin_deposit', note: 'Physical to digital' },
				{ id: customId, category: 'competition_winnings', note: 'IDEA-Blade Rotation 2 tournament: 1st place, 12 wins' }
			])
		]);
		expect(r).toMatchObject({ ok: true, changed: 2 });
		expect(await balance(ben.email)).toBe(bBen);
		expect(await balance(ana.email)).toBe(bAna);
		expect((await rowsOf(ben.email)).find((x) => x.id === correctionDepositId)).toMatchObject({ category_id: 'coin_deposit', amount: '4.00', note: 'Physical to digital' });
		expect((await db.sql(`select 1 from public.coin_relabel_log where transaction_id = $1 and old_category_id = 'balance_correction' and old_note = 'Physical to digital coin deposit'`, [correctionDepositId])).rows.length).toBe(1);
		// A second identical call changes nothing.
		expect((await as<Json>(owner, `public.coin_transactions_relabel($1::jsonb)`, [JSON.stringify([{ id: correctionDepositId, category: 'coin_deposit', note: 'Physical to digital' }])])).changed).toBe(0);
	});
	test('a charge never becomes a credit, a payout is never relabeled, and the log is not readable by a client', async () => {
		expect(await refusal(as(owner, `public.coin_transactions_relabel($1::jsonb)`, [JSON.stringify([{ id: fineId, category: 'coin_deposit' }])]))).toMatch(/cannot become/);
		expect(await refusal(as(owner, `public.coin_transactions_relabel($1::jsonb)`, [JSON.stringify([{ id: fineId, note: 'phone out' }])]))).toBeNull();
		expect(await refusal(db.asUser(owner.id, (q) => q(`select * from public.coin_relabel_log`)))).toMatch(/permission denied/);
	});
});
