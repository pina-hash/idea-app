// 0286: the IDEA Coin economy works for a signed-in student or visitor who is not in a class (report 18451adf).
// Seeded PRE-migration: the chain short of the file, an enrolled student made through the real RPCs, then the file over the top.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FILE = readdirSync(DIR).find((f) => f.startsWith('0286_coin_members_without_a_class'))!;
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f < '0286').sort()];
const FAKE = '00000000-0000-4000-8000-000000000000';

let db: TestDb;
let admin: SeededUser, teacher: SeededUser, enrolled: SeededUser, other: SeededUser, loose: SeededUser, visitor: SeededUser;
let section: string;

const call = <T,>(u: SeededUser, sql: string, args: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(sql, args)).rows[0].r);
const page = (u: SeededUser) => call<{ in_economy: boolean }>(u, 'select public.coin_my_page() as r');
const board = (u: SeededUser) => call<{ in_economy: boolean }>(u, 'select public.coin_stocks_board() as r');

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	teacher = await createUser(db, 'tee.one@boscotech.edu', 'Tee One');
	enrolled = await createUser(db, 'sam@boscotech.net', 'Sam Student');
	other = await createUser(db, 'ola@boscotech.net', 'Ola Other');
	loose = await createUser(db, 'loose@boscotech.net', 'Lou Loose');
	visitor = await createUser(db, 'someone@gmail.com', 'Vic Visitor');
	section = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	await enrollStudent(db, { as: teacher, sectionId: section, email: enrolled.email, displayName: 'Sam Student' });
	await enrollStudent(db, { as: teacher, sectionId: section, email: other.email, displayName: 'Ola Other' });
}, 120_000);
afterAll(async () => { await db?.stop(); });

describe('coin members without a class', () => {
	test('BEFORE the file, only the enrolled student is in the economy', async () => {
		expect((await page(enrolled)).in_economy).toBe(true);
		for (const u of [loose, visitor, teacher, admin]) expect((await page(u)).in_economy, u.email).toBe(false);
	});

	test('AFTER the file, a student and a visitor with no class are in; staff are not; the enrolled are unchanged', async () => {
		await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
		for (const u of [enrolled, loose, visitor]) {
			expect((await page(u)).in_economy, u.email).toBe(true);
			expect((await board(u)).in_economy, u.email).toBe(true);
		}
		for (const u of [teacher, admin]) expect((await page(u)).in_economy, u.email).toBe(false);
	});

	test('a class-only action still refuses a member, after the gate lets them through (present: not_your_class; absent: not_in_economy)', async () => {
		const buy = (u: SeededUser) => call<{ ok: boolean; reason: string }>(u, 'select public.coin_buy_hall_pass_minutes($1::uuid, 1) as r', [FAKE]);
		expect((await buy(loose)).reason).toBe('not_your_class');
		expect((await buy(visitor)).reason).toBe('not_your_class');
		expect((await buy(teacher)).reason).toBe('not_in_economy');
	});

	test('nobody else sees a member: an enrolled student\'s send-to directory lists the other enrolled student and no member', async () => {
		const names = (u: SeededUser) =>
			call<{ name: string }[]>(u, 'select public.coin_transfer_directory() as r').then((d) => d.map((x) => x.name).sort());
		// The positive control: the enrolled classmate is there. The absences: both members.
		expect(await names(enrolled)).toEqual(['Ola Other']);
		expect(await names(other)).toEqual(['Sam Student']);
		// A member sees the enrolled students and not another member.
		expect(await names(loose)).toEqual(['Ola Other', 'Sam Student']);
	});

	test('a member cannot apply for a class job, an enrolled student still can (negative and positive)', async () => {
		const apply = (u: SeededUser) => call<{ ok: boolean; reason?: string }>(u, 'select public.coin_role_self_apply($1, $2::jsonb) as r', ['shop_steward', '[]']);
		expect(await apply(loose)).toEqual({ ok: false, reason: 'no_section' });
		expect(await apply(visitor)).toEqual({ ok: false, reason: 'no_section' });
		expect((await apply(enrolled)).ok).toBe(true);
		expect(Number((await db.sql<{ n: number }>("select count(*)::int as n from public.coin_role_applications where student_email in ($1, $2)", [loose.email, visitor.email])).rows[0].n)).toBe(0);
	});

	test('the file applies a second time without harm', async () => {
		await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
		expect((await page(loose)).in_economy).toBe(true);
	});
});
