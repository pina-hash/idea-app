// tests/db/coin-voice-aliases.test.ts
//
// Ledger 0432's coin phrase migration, applied over a chain booted SHORT of it
// with a coin admin's own edit already in place (a category switched off),
// then applied again. Judged on the rows, never on a function's answer alone.
//
// The silent guarantees, each with its control:
//   - a seed never sets a price and never revives a category an admin
//     switched off;
//   - only a full coin admin teaches the tool a phrase; section staff log
//     through it and teach it nothing;
//   - nobody but coin staff reads or changes a phrase.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, enrollStudent, type SeededUser, type TestDb, startTestDb } from './harness';

type Json = Record<string, unknown>;
const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = ALL.find((f) => /_coin_voice_aliases\.sql$/.test(f))!;
const NUM = FILE.slice(0, 4);
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < NUM)];
const SQL = readFileSync(join(DIR, FILE), 'utf8');

let db: TestDb;
let owner: SeededUser, teacher: SeededUser, ana: SeededUser;

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
const n = async (sql: string, params: unknown[] = []) => Number((await db.sql<{ n: string }>(sql, params)).rows[0].n);

beforeAll(async () => {
	db = await startTestDb(PRE);
	owner = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	const block = await createClassroomSection(db, { as: owner, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 2', teacherEmail: teacher.email });
	await enrollStudent(db, { as: owner, sectionId: block, email: ana.email, displayName: 'Reyes, Ana' });
	await db.sql(`update public.classroom_sections set coin_economy_on = true where id = $1`, [block]);
	// A coin admin's own edit, before the file: the song request is switched off.
	await db.sql(`update public.coin_categories set active = false where id = 'song_request'`);
	await db.sql(SQL);
	await db.sql(SQL);
}, 600_000);
afterAll(async () => db?.stop());

describe(`${NUM} applies over the coin economy as it stands`, () => {
	test('three custom categories, variable, so a price always comes from him', async () => {
		const rows = (await db.sql<{ id: string; kind: string; pricing_model: string; amount: number | null }>(`select id, kind, pricing_model, amount from public.coin_categories where id like 'custom_%' order by id`)).rows;
		expect(rows).toEqual([
			{ id: 'custom_award', kind: 'award', pricing_model: 'variable', amount: null },
			{ id: 'custom_fine', kind: 'fine', pricing_model: 'variable', amount: null },
			{ id: 'custom_purchase', kind: 'purchase', pricing_model: 'variable', amount: null }
		]);
	});
	test('the everyday phrases are seeded with no amount, once, and none for a category he switched off', async () => {
		expect(await n(`select count(*) as n from public.coin_phrase_aliases where source = 'seed'`)).toBeGreaterThan(30);
		expect(await n(`select count(*) as n from public.coin_phrase_aliases where amount is not null`)).toBe(0);
		expect(await n(`select count(*) as n from public.coin_phrase_aliases where category_id = 'song_request'`)).toBe(0);
		expect((await db.sql(`select category_id from public.coin_phrase_aliases where phrase = 'phone'`)).rows[0].category_id).toBe('off_task_device_use');
		expect((await db.sql(`select active from public.coin_categories where id = 'song_request'`)).rows[0].active).toBe(false);
	});
	test('twelve saved requests for the new tools, once', async () => {
		expect(await n(`select count(*) as n from public.connector_evals where created_by = 'ledger 0432'`)).toBe(12);
	});
});

describe('the phrases', () => {
	test('a full coin admin logs and teaches: the number he gave becomes the phrase default', async () => {
		const r = await as<Json>(owner, `public.coin_voice_log($1, 'custom_award', 4, 'fixing the bandsaw guard', 'Fixing the bandsaw guard!')`, [ana.email]);
		expect(r).toMatchObject({ ok: true, amount: 4, phrase: { phrase: 'fixing the bandsaw guard', amount: 4, saved: true } });
		const again = await as<Json>(owner, `public.coin_voice_log($1, 'custom_award', 6, 'fixing the bandsaw guard', 'fixing the bandsaw guard')`, [ana.email]);
		expect(again).toMatchObject({ phrase: { amount: 6, previous_amount: 4, changed: true } });
		expect((await db.sql(`select amount::text, uses from public.coin_phrase_aliases where phrase = 'fixing the bandsaw guard'`)).rows[0]).toEqual({ amount: '6.00', uses: 2 });
	});
	test('a set price is never saved over: a flat category keeps its own amount', async () => {
		const r = await as<Json>(owner, `public.coin_voice_log($1, 'off_task_device_use', 9, 'phone out', 'phone')`, [ana.email]);
		expect(r).toMatchObject({ ok: true, amount: -2 });
		expect(await n(`select count(*) as n from public.coin_phrase_aliases where phrase = 'phone' and amount is not null`)).toBe(0);
	});
	test('section coin staff log through it and teach it nothing (control: the record lands)', async () => {
		const before = await n(`select count(*) as n from public.coin_phrase_aliases`);
		const r = await as<Json>(teacher, `public.coin_voice_log($1, 'custom_fine', 2, 'throwing scraps', 'throwing scraps')`, [ana.email]);
		expect(r).toMatchObject({ ok: true, amount: -2 });
		expect(await n(`select count(*) as n from public.coin_phrase_aliases`)).toBe(before);
		expect(await refusal(as(teacher, 'public.coin_alias_list()'))).toMatch(/full coin admin/);
	});
	test('a student reads nothing and logs nothing', async () => {
		expect(await refusal(as(ana, 'public.coin_voice_catalog()'))).toMatch(/coin staff/);
		expect(await refusal(as(ana, `public.coin_voice_log($1, 'custom_award', 50, 'me', 'me')`, [ana.email]))).toMatch(/coin staff/);
		expect(await refusal(db.asUser(ana.id, (q) => q(`select * from public.coin_phrase_aliases`)))).toMatch(/permission denied/);
	});
	test('coin settings: change a default, make it official, forget one', async () => {
		const id = (await db.sql<{ id: string }>(`select id from public.coin_phrase_aliases where phrase = 'fixing the bandsaw guard'`)).rows[0].id;
		expect(await as<Json>(owner, `public.coin_alias_set_amount($1::uuid, 5)`, [id])).toMatchObject({ ok: true, amount: 5, previous_amount: 6 });
		const p = await as<Json>(owner, `public.coin_alias_promote($1::uuid, 'Shop Repair')`, [id]);
		expect(p).toMatchObject({ ok: true, category_id: 'shop_repair', amount: 5 });
		expect((await db.sql(`select kind, pricing_model, amount from public.coin_categories where id = 'shop_repair'`)).rows[0]).toEqual({ kind: 'award', pricing_model: 'flat', amount: '5.00' });
		expect((await db.sql(`select category_id, amount from public.coin_phrase_aliases where id = $1`, [id])).rows[0]).toEqual({ category_id: 'shop_repair', amount: null });
		expect(await as<Json>(owner, `public.coin_alias_promote($1::uuid, 'Shop Repair')`, [id])).toMatchObject({ ok: false, reason: 'needs_whole_amount' });
		expect(await as<Json>(owner, `public.coin_alias_delete($1::uuid)`, [id])).toMatchObject({ ok: true, deleted: 1 });
		expect(await refusal(as(teacher, `public.coin_alias_delete($1::uuid)`, [id]))).toMatch(/full coin admin/);
	});
});
