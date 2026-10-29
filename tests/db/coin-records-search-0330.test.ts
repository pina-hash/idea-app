// tests/db/coin-records-search-0330.test.ts
//
// LEDGER 0471 PART 2: the coin record search a full coin admin runs from a
// chat to find the records `coin_transactions_relabel` corrects. Applied over
// a chain booted SHORT of the file, with the records seeded the way production
// holds them (the weekly pay of 2026-10-19 logged under Contract Completion,
// written as the historical rows were, plus records logged through the REAL
// RPCs and one reversed through the real reversal), then applied again.
//
// The silent guarantees, each with its control:
//   - only a full coin admin reads it: every other admin, a class's teacher of
//     record (coin staff for their class), a student and anon are refused,
//     with the owner reading the same filter as the positive control
//     (mutation proved on the gate);
//   - it writes nothing: every coin table and the relabel log are unchanged;
//   - a school day is a school day: a record at 11:30 pm Pacific is on its
//     day, and one at 11:30 pm the day before is not.
//
// The migration is found by its name and read off disk when the suite
// starts, so a renumbering at landing and a mutation run both read the file.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, enrollStudent, type SeededUser, type TestDb, startTestDb } from './harness';

type Json = Record<string, any>;
const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILES = ALL.filter((f) => f.endsWith('_coin_records_search.sql'));
if (FILES.length !== 1) throw new Error(`expected one coin records search migration, found ${FILES.length}`);
const FILE = FILES[0];
const NUM = FILE.slice(0, 4);
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE)];
const SQL = () => readFileSync(join(DIR, FILE), 'utf8');

let db: TestDb;
let owner: SeededUser, otherAdmin: SeededUser, teacher: SeededUser, ana: SeededUser, ben: SeededUser, cal: SeededUser;
const weekly: string[] = [];
let reversedId = '';
let lateId = '';
let earlyId = '';
let customId = '';

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
const search = (u: SeededUser, args: { category?: string | null; from?: string | null; to?: string | null; note?: string | null; limit?: number | null; offset?: number | null } = {}) =>
	as<Json>(u, `public.coin_records_search($1, $2::date, $3::date, $4, $5, $6)`, [
		args.category ?? null, args.from ?? null, args.to ?? null, args.note ?? null, args.limit ?? null, args.offset ?? null
	]);
const counts = async () =>
	(await db.sql<{ t: number; r: number; c: number }>(`select (select count(*)::int from public.coin_transactions) as t,
		(select count(*)::int from public.coin_relabel_log) as r,
		(select count(*)::int from public.coin_transactions where category_id = 'weekly_pay') as c`)).rows[0];
const REFUSED = 'Only a full coin admin can search coin records.';

beforeAll(async () => {
	db = await startTestDb(PRE);
	owner = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	otherAdmin = await createUser(db, 'second.admin@boscotech.edu', 'Second Admin');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	cal = await createUser(db, 'cal@boscotech.net', 'Cal Lee');
	await db.asUser(owner.id, (q) => q(`select public.admin_grant($1, null)`, [otherAdmin.email]));
	const block = await createClassroomSection(db, { as: owner, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	await enrollStudent(db, { as: owner, sectionId: block, email: ana.email, displayName: 'Reyes, Ana' });
	await enrollStudent(db, { as: owner, sectionId: block, email: ben.email, displayName: 'Ortiz, Ben' });
	await enrollStudent(db, { as: owner, sectionId: block, email: cal.email, displayName: 'Lee, Cal' });
	await db.sql(`update public.classroom_sections set coin_economy_on = true`);

	// The weekly pay of Oct 19, logged under Contract Completion as the
	// historical rows were (the category is retired, so a staff logger would
	// refuse it today), stamped at midday Pacific on 2026-10-19.
	for (const [email, amount] of [[ana.email, 4], [ben.email, 4], [cal.email, 6], [ana.email, 2]] as const) {
		const id = (await db.sql<{ id: string }>(
			`select (public._coin_insert($1, 'contract_completion', $2, null, $3, '{}'::jsonb, 'digital', null, 'apina@boscotech.edu')).id as id`,
			[email, amount, `Weekly pay, week of Oct 19 (${amount})`]
		)).rows[0].id;
		weekly.push(String(id));
	}
	await db.sql(`update public.coin_transactions set created_at = '2026-10-19 19:00:00+00'::timestamptz + (random() * interval '1 hour') where id = any($1::uuid[])`, [weekly]);
	// One more on the same day, reversed through the real reversal.
	reversedId = String((await db.sql<{ id: string }>(
		`select (public._coin_insert($1, 'contract_completion', 4, null, 'Weekly pay, week of Oct 19 (dup)', '{}'::jsonb, 'digital', null, 'apina@boscotech.edu')).id as id`, [ben.email])).rows[0].id);
	await db.sql(`update public.coin_transactions set created_at = '2026-10-19 20:30:00+00' where id = $1`, [reversedId]);
	await as(owner, `public.coin_reverse_transaction($1::uuid, $2)`, [reversedId, 'Logged twice']);
	// The day's edges in school time: 11:30 pm Pacific on Oct 19 is Oct 19
	// (06:30 UTC on Oct 20), 11:30 pm Pacific on Oct 18 is not.
	lateId = String((await db.sql<{ id: string }>(
		`select (public._coin_insert($1, 'contract_completion', 3, null, 'Weekly pay, week of Oct 19 (late)', '{}'::jsonb, 'digital', null, 'apina@boscotech.edu')).id as id`, [cal.email])).rows[0].id);
	await db.sql(`update public.coin_transactions set created_at = '2026-10-20 06:30:00+00' where id = $1`, [lateId]);
	earlyId = String((await db.sql<{ id: string }>(
		`select (public._coin_insert($1, 'contract_completion', 3, null, 'Weekly pay, week of Oct 12', '{}'::jsonb, 'digital', null, 'apina@boscotech.edu')).id as id`, [cal.email])).rows[0].id);
	await db.sql(`update public.coin_transactions set created_at = '2026-10-19 06:30:00+00' where id = $1`, [earlyId]);
	// Ordinary records today, through the real logger.
	customId = String((await as<Json>(owner, `public.coin_log_transaction($1, 'custom_award', 5, null, $2)`, [ana.email, 'Weekly pay helper, cleaned the shop'])).transaction_id);
	await as(owner, `public.coin_log_transaction($1, 'off_task_device_use', null, null, $2)`, [ben.email, 'phone out in class']);

	await db.sql(SQL());
	await db.sql(SQL());
}, 600_000);
afterAll(async () => db?.stop());

describe(`${NUM} applies`, () => {
	test('through the real apply tool: the scanner finds nothing, and a planted top-level insert is found (control)', async () => {
		const { scanFile } = await import('../../tools/apply-migration.mjs');
		expect(scanFile(SQL()).findings).toEqual([]);
		expect(scanFile(`insert into public.coin_settings (key, value) values ('x', '1');`).findings).toHaveLength(1);
	});
	test('one form, open to signed-in callers and closed to anon', async () => {
		const acl = (await db.sql<{ anon: boolean; authed: boolean; n: number }>(`
			select bool_or(has_function_privilege('anon', p.oid, 'execute')) as anon,
				bool_and(has_function_privilege('authenticated', p.oid, 'execute')) as authed, count(*)::int as n
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = 'coin_records_search'`)).rows[0];
		expect(acl).toEqual({ anon: false, authed: true, n: 1 });
		expect(await refusal(db.asAnon((q) => q(`select public.coin_records_search('contract_completion', null, null, null, null, null)`)))).toContain('permission denied');
	});
});

describe('only a full coin admin reads it', () => {
	test('the owner reads the Oct 19 weekly pay; every other admin, a teacher of record and a student are refused', async () => {
		const mine = await search(owner, { category: 'contract_completion', from: '2026-10-19', to: '2026-10-19' });
		expect(mine.ok).toBe(true);
		expect(mine.total).toBe(6);
		for (const u of [otherAdmin, teacher, ana]) {
			expect(await refusal(search(u, { category: 'contract_completion', from: '2026-10-19', to: '2026-10-19' }))).toBe(REFUSED);
			expect(await refusal(search(u))).toBe(REFUSED);
		}
		// The teacher of record IS coin staff for these students, so the refusal is the tier, not scope.
		expect((await as<Json>(teacher, `public.coin_staff_scope()`)).scope).toBe('section');
	});
});

describe('the filters', () => {
	test('category by short name or by name, a school day in school time, newest first, ids that are the records', async () => {
		const byId = await search(owner, { category: 'contract_completion', from: '2026-10-19', to: '2026-10-19' });
		const byName = await search(owner, { category: 'Contract Completion', from: '2026-10-19', to: '2026-10-19' });
		expect(byName.records).toEqual(byId.records);
		expect(byId.category).toBe('contract_completion');
		const ids = byId.records.map((r: Json) => r.id);
		expect(ids).toContain(lateId);
		expect(ids).not.toContain(earlyId);
		expect(new Set(ids)).toEqual(new Set([...weekly, reversedId, lateId]));
		const ats = byId.records.map((r: Json) => Date.parse(r.at));
		expect([...ats].sort((a, b) => b - a)).toEqual(ats);
		for (const r of byId.records) expect(r.day).toBe('2026-10-19');
		const one = byId.records.find((r: Json) => r.id === weekly[2]);
		expect(one).toMatchObject({ email: cal.email, name: 'Lee, Cal', amount: 6, category_id: 'contract_completion', category: 'Contract Completion', note: 'Weekly pay, week of Oct 19 (6)', reversed: false });
		expect(byId.records.find((r: Json) => r.id === reversedId).reversed).toBe(true);
		expect(byId.records.filter((r: Json) => r.reversed)).toHaveLength(1);
	});
	test('words anywhere in the note, any case, across categories', async () => {
		const notes = await search(owner, { note: 'WEEKLY PAY' });
		const ids = notes.records.map((r: Json) => r.id);
		expect(ids).toContain(customId);
		expect(ids).toContain(earlyId);
		expect(notes.total).toBe(8);
		const exact = await search(owner, { note: 'week of Oct 19', category: 'contract_completion' });
		expect(exact.total).toBe(6);
		expect(exact.records.map((r: Json) => r.id)).not.toContain(earlyId);
		// A % or _ typed is a character, never a wildcard.
		expect((await search(owner, { note: '%' })).total).toBe(0);
	});
	test('pages: a limit, an offset and next_offset, until the last page', async () => {
		const all = await search(owner, { category: 'contract_completion' });
		expect(all.total).toBe(7);
		const p1 = await search(owner, { category: 'contract_completion', limit: 3 });
		const p2 = await search(owner, { category: 'contract_completion', limit: 3, offset: p1.next_offset });
		const p3 = await search(owner, { category: 'contract_completion', limit: 3, offset: p2.next_offset });
		expect([p1.next_offset, p2.next_offset, p3.next_offset]).toEqual([3, 6, null]);
		expect([...p1.records, ...p2.records, ...p3.records].map((r: Json) => r.id)).toEqual(all.records.map((r: Json) => r.id));
		expect((await search(owner, { limit: 5000 })).limit).toBe(500);
	});
	test('an unknown category and backwards days are said in words, with nothing listed', async () => {
		expect(await search(owner, { category: 'no_such_thing' })).toMatchObject({ ok: false, reason: 'category' });
		expect(await search(owner, { from: '2026-10-20', to: '2026-10-19' })).toMatchObject({ ok: false, reason: 'dates' });
	});
});

describe('it reads only', () => {
	test('every search leaves the records and the relabel log as they were; the ids it found are what the relabel takes', async () => {
		const before = await counts();
		await search(owner, { category: 'contract_completion', from: '2026-10-19', to: '2026-10-19' });
		await search(owner, { note: 'weekly' });
		await refusal(search(teacher));
		expect(await counts()).toEqual(before);
		// The chain end to end on this test database (never production): the
		// ids found, less the reversed one, relabel to Weekly Pay.
		const found = (await search(owner, { category: 'contract_completion', from: '2026-10-19', to: '2026-10-19', note: 'Weekly pay, week of Oct 19' })).records
			.filter((r: Json) => !r.reversed).map((r: Json) => ({ id: r.id, category: 'weekly_pay' }));
		expect(found).toHaveLength(5);
		const out = await as<Json>(owner, `public.coin_transactions_relabel($1::jsonb)`, [JSON.stringify(found)]);
		expect(out).toMatchObject({ ok: true, changed: 5 });
		expect((await counts()).c).toBe(before.c + 5);
		expect((await search(owner, { category: 'weekly_pay', from: '2026-10-19', to: '2026-10-19' })).total).toBe(5);
	});
});
