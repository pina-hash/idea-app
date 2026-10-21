// tests/db/coin-market-cards-0294.test.ts
//
// 0294 (ledger 0425, connector gap 8020d662): every IDEA Market card can be
// featured or unfeatured, the want-ads (the tissue box cards), the shop tiles,
// the contracts and the background card included, and staff list every card
// with its id. The chain is booted SHORT of 0294, an official card and a
// contract are made through the real RPCs (the want list's two tissue boxes
// are 0245's own seed), then 0294 is applied over the top.
//
// The silent guarantees, each with its control:
//   - a student lists nothing and switches nothing; the full coin admin does;
//   - a section coin staff member sees the shared cards but cannot switch
//     them (they show in every class);
//   - "feature only these" leaves exactly those featured, and an unknown card
//     refuses the whole call with nothing written.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, type SeededUser, type TestDb, startTestDb } from './harness';
import { FIXED_CARD_KEYS } from '../../src/lib/coin-market/official';

type Json = Record<string, unknown>;
interface Card {
	card: string;
	kind: string;
	title: string;
	featured: boolean;
	can_set: boolean;
}
const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = ALL.find((f) => f.startsWith('0294_'))!;
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < '0294')];

let db: TestDb;
let admin: SeededUser, teacher: SeededUser, ana: SeededUser;
let official: string, contract: string, done: string, tissue: string[];

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
const switched = async () => Number((await db.sql<{ n: string }>(`select count(*) as n from public.coin_market_card_features`)).rows[0].n);
const featuredCards = async () => (await as<Card[]>(admin, 'public.coin_market_cards_admin()')).filter((c) => c.featured).map((c) => c.card).sort();

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 2', teacherEmail: teacher.email });
	await as(admin, `public.coin_market_official_save(null, 'Supply drive', 'Bring pencils', null, 2, null, 30)`);
	official = (await db.sql<{ id: string }>(`select id from public.coin_market_listings where title = 'Supply drive'`)).rows[0].id;
	expect((await as<Json>(admin, `public.coin_market_listing_staff($1::uuid, 'feature')`, [official])).ok).toBe(true);
	contract = (await as<{ id: string }>(admin, `public.coin_contract_post('Sweep IDEA Shop', 'Sweep it.', 'flat', 2, null, 1, null, false)`)).id;
	done = (await as<{ id: string }>(admin, `public.coin_contract_post('Old job', 'Done already.', 'flat', 1, null, 1, null, false)`)).id;
	await db.sql(`update public.coin_contracts set completed_at = now() where id = $1`, [done]);
	tissue = (await db.sql<{ id: string }>(`select id from public.coin_donation_items where active and name ilike '%tissue%' order by sort_order`)).rows.map((r) => r.id);
	expect(tissue).toHaveLength(2);

	await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

describe('0294 applies', () => {
	test('re-applies cleanly', async () => {
		await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
	});
	test('the fixed card keys in the file are the market page\'s own', () => {
		const sql = readFileSync(join(DIR, FILE), 'utf8');
		const check = sql.match(/card in \(([^)]*)\)/)![1];
		expect(check.split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual([...FIXED_CARD_KEYS]);
	});
});

describe('every card, listed', () => {
	test('the full coin admin sees the official card, both want-ads, the open contract, four shop tiles and the background, each with its default', async () => {
		const cards = await as<Card[]>(admin, 'public.coin_market_cards_admin()');
		const by = new Map(cards.map((c) => [c.card, c]));
		expect(by.get(`official:${official}`)?.featured).toBe(true);
		for (const id of tissue) expect(by.get(`donation:${id}`)).toMatchObject({ kind: 'donation', featured: false, can_set: true });
		expect(by.get(`contract:${contract}`)).toMatchObject({ kind: 'contract', featured: true });
		expect(by.has(`contract:${done}`)).toBe(false);
		for (const k of FIXED_CARD_KEYS) expect(by.get(k)?.featured).toBe(false);
		expect(cards).toHaveLength(1 + 2 + 1 + FIXED_CARD_KEYS.length);
	});
	test('a student lists nothing; nothing is switched yet, so the page reads no switches', async () => {
		expect(await refusal(as(ana, 'public.coin_market_cards_admin()'))).toMatch(/coin staff/);
		expect(await as<Json>(ana, 'public.coin_market_card_features()')).toEqual({});
	});
	test('a section coin staff member sees the shared cards marked as not theirs to switch', async () => {
		const cards = await as<Card[]>(teacher, 'public.coin_market_cards_admin()');
		const want = cards.find((c) => c.card === `donation:${tissue[0]}`)!;
		expect(want.can_set).toBe(false);
		expect(cards.some((c) => c.card === `official:${official}`)).toBe(false); // an every-class card is outside a section's scope
	});
});

describe('switching one card', () => {
	test('a student is refused and nothing is written; a section teacher is refused a shared card', async () => {
		expect(await refusal(as(ana, `public.coin_market_card_set_featured($1, true)`, [`donation:${tissue[0]}`]))).toMatch(/coin staff/);
		const t = await as<Json>(teacher, `public.coin_market_card_set_featured($1, true)`, [`donation:${tissue[0]}`]);
		expect(t).toMatchObject({ ok: false, reason: 'full_admin_only' });
		expect(await switched()).toBe(0);
	});
	test('the admin features a want-ad and unfeatures the shop tile and the contract; each answers what it was', async () => {
		expect(await as<Json>(admin, `public.coin_market_card_set_featured($1, true)`, [`DONATION:${tissue[0]}`])).toMatchObject({ ok: true, featured: true, was: false });
		expect(await as<Json>(admin, `public.coin_market_card_set_featured($1, false)`, [`contract:${contract}`])).toMatchObject({ ok: true, was: true });
		expect(await as<Json>(admin, `public.coin_market_card_set_featured('shop:print', true)`)).toMatchObject({ ok: true, was: false });
		expect(await as<Json>(ana, 'public.coin_market_card_features()')).toEqual({
			[`donation:${tissue[0]}`]: true,
			[`contract:${contract}`]: false,
			'shop:print': true
		});
	});
	test('a finished contract, an unknown key and a want-ad nobody has are not found', async () => {
		for (const card of [`contract:${done}`, 'shop:free_lunch', `donation:${official}`]) {
			expect(await as<Json>(admin, `public.coin_market_card_set_featured($1, true)`, [card])).toMatchObject({ ok: false, reason: 'not_found' });
		}
	});
	test('an official card switches through its listing', async () => {
		expect(await as<Json>(admin, `public.coin_market_card_set_featured($1, false)`, [`official:${official}`])).toMatchObject({ ok: true, was: true });
		expect((await db.sql<{ f: boolean }>(`select featured_at is not null as f from public.coin_market_listings where id = $1`, [official])).rows[0].f).toBe(false);
		await as(admin, `public.coin_market_card_set_featured($1, true)`, [`official:${official}`]);
	});
});

describe('feature only these', () => {
	test('an unknown card refuses the whole call and writes nothing', async () => {
		const before = await featuredCards();
		expect(await as<Json>(admin, `public.coin_market_cards_feature_only($1::text[])`, [[`donation:${tissue[1]}`, 'shop:nope']])).toMatchObject({ ok: false, reason: 'not_found', card: 'shop:nope' });
		expect(await featuredCards()).toEqual(before);
	});
	test('the tissue boxes are featured and every other card is not, the official card included', async () => {
		const r = await as<Json>(admin, `public.coin_market_cards_feature_only($1::text[])`, [tissue.map((id) => `donation:${id}`)]);
		expect(r).toMatchObject({ ok: true, featured: 1 });
		// The official card and shop:print were on; the contract was already off.
		expect(r.unfeatured).toBe(2);
		expect(await featuredCards()).toEqual(tissue.map((id) => `donation:${id}`).sort());
		const again = await as<Json>(admin, `public.coin_market_cards_feature_only($1::text[])`, [tissue.map((id) => `donation:${id}`)]);
		expect(again).toMatchObject({ ok: true, featured: 0, unfeatured: 0 });
	});
	test('only a full coin admin may: a section teacher and a student are refused', async () => {
		expect(await refusal(as(teacher, `public.coin_market_cards_feature_only($1::text[])`, [[]]))).toMatch(/full coin admin/);
		expect(await refusal(as(ana, `public.coin_market_cards_feature_only($1::text[])`, [[]]))).toMatch(/full coin admin/);
		expect((await featuredCards()).length).toBe(2);
	});
	test('an empty list unfeatures every card', async () => {
		expect(await as<Json>(admin, `public.coin_market_cards_feature_only($1::text[])`, [[]])).toMatchObject({ ok: true, featured: 0, unfeatured: 2 });
		expect(await featuredCards()).toEqual([]);
	});
});
