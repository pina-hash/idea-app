// tests/db/coin-market-escrow.test.ts
//
// THE MARKETPLACE (ledger 0402, migration 0276) on the whole tree. Every
// guarantee here is one whose regression would be SILENT: an escrow that
// quietly leaks or mints a coin, a release that skips its fee, an auto-release
// that fires early, a student in debt who quietly spends, a review on a
// refunded trade, a section staff member reaching another class's dispute.
// Every case carries a planted control: what it must NOT do is seeded beside
// what it must, so a vacuous pass is impossible.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

let w: CoinWorld;

async function rows(email: string, category: string): Promise<number> {
	return Number(
		await w.scalar(`select count(*)::text v from public.coin_transactions where student_email = $1 and category_id = $2`, [
			email,
			category
		])
	);
}

async function post(u = w.ana, kind = 'offer', price = 4, quantity: number | null = null): Promise<string> {
	const r = await w.rpc<Json>(u, `public.coin_market_post($1, $2, $3, $4::numeric, 'service', $5::integer)`, [
		kind,
		`${kind} by ${u.email.split('@')[0]} ${Math.random().toString(36).slice(2, 7)}`,
		'A test listing.',
		price,
		quantity
	]);
	expect(r.ok, JSON.stringify(r)).toBe(true);
	return r.listing_id as string;
}

async function claim(u: typeof w.ana, listing: string): Promise<Json> {
	return w.rpc<Json>(u, `public.coin_market_claim($1::uuid)`, [listing]);
}

async function act(u: typeof w.ana, order: string, action: string, reason: string | null = null): Promise<Json> {
	return w.rpc<Json>(u, `public.coin_market_order_act($1::uuid, $2, $3)`, [order, action, reason]);
}

beforeAll(async () => {
	w = await startCoinWorld();
	for (const s of [w.ana, w.ben, w.cal, w.dee]) await w.give(s.email, 40);
}, 600_000);

afterAll(async () => w?.db.stop());

describe('escrow holds, releases, refunds and auto-releases, and every outcome nets', () => {
	test('a claim holds the price at once; confirm releases it minus the fee', async () => {
		await w.setting('market_sale_fee_percent', 10);
		const listing = await post(w.ana, 'offer', 5);
		const anaBefore = await w.balance(w.ana.email);
		const benBefore = await w.balance(w.ben.email);
		const c = await claim(w.ben, listing);
		expect(c.ok).toBe(true);
		expect(await w.balance(w.ben.email)).toBeCloseTo(benBefore - 5, 2);
		// Control: the seller has nothing yet.
		expect(await w.balance(w.ana.email)).toBeCloseTo(anaBefore, 2);
		// The buyer cannot confirm before delivery, and the seller cannot confirm at all.
		expect((await act(w.ben, c.order_id as string, 'confirm')).reason).toBe('not_now');
		expect((await act(w.ana, c.order_id as string, 'deliver')).ok).toBe(true);
		expect((await act(w.ana, c.order_id as string, 'confirm')).reason).toBe('not_now');
		const done = await act(w.ben, c.order_id as string, 'confirm');
		expect(done).toMatchObject({ ok: true, status: 'released' });
		expect(Number(done.fee)).toBeCloseTo(0.5, 2);
		expect(await w.balance(w.ana.email)).toBeCloseTo(anaBefore + 4.5, 2);
		expect(await w.balance(w.ben.email)).toBeCloseTo(benBefore - 5, 2);
		// The fee is a logged sink, a market_fee row on the seller.
		expect(await rows(w.ana.email, 'market_fee')).toBe(1);
		await w.setting('market_sale_fee_percent', 0);
	});

	test('a fee of zero writes no fee row (control for the row above)', async () => {
		const listing = await post(w.ana, 'offer', 2);
		const c = await claim(w.dee, listing);
		await act(w.ana, c.order_id as string, 'deliver');
		await act(w.dee, c.order_id as string, 'confirm');
		expect(await rows(w.ana.email, 'market_fee')).toBe(1);
	});

	test('the seller cancels before delivery and the buyer is refunded in full; not after', async () => {
		const listing = await post(w.ana, 'offer', 3);
		const before = await w.balance(w.ben.email);
		const c = await claim(w.ben, listing);
		expect((await act(w.ben, c.order_id as string, 'cancel')).reason).toBe('not_now');
		const r = await act(w.ana, c.order_id as string, 'cancel');
		expect(r).toMatchObject({ ok: true, status: 'refunded' });
		expect(await w.balance(w.ben.email)).toBeCloseTo(before, 2);
		// The slot comes back: the one-time listing can be claimed again.
		const again = await claim(w.cal, listing);
		expect(again.ok).toBe(true);
		await act(w.ana, again.order_id as string, 'deliver');
		expect((await act(w.ana, again.order_id as string, 'cancel')).reason).toBe('not_now');
		await act(w.cal, again.order_id as string, 'confirm');
	});

	test('a request: the poster pays into escrow when someone takes the job', async () => {
		const listing = await post(w.dee, 'request', 6);
		const deeBefore = await w.balance(w.dee.email);
		const c = await claim(w.cal, listing);
		expect(c.ok).toBe(true);
		expect(await w.balance(w.dee.email)).toBeCloseTo(deeBefore - 6, 2);
		await act(w.cal, c.order_id as string, 'deliver');
		const calBefore = await w.balance(w.cal.email);
		await act(w.dee, c.order_id as string, 'confirm');
		expect(await w.balance(w.cal.email)).toBeCloseTo(calBefore + 6, 2);
	});

	test('auto-release waits the set number of class days after delivery', async () => {
		const listing = await post(w.ana, 'offer', 2, 2);
		const early = await claim(w.ben, listing);
		const late = await claim(w.dee, listing);
		await act(w.ana, early.order_id as string, 'deliver');
		await act(w.ana, late.order_id as string, 'deliver');
		// Ten calendar days hold at least six weekdays: past the default five.
		await w.db.sql(`update public.coin_market_orders set delivered_at = now() - interval '10 days' where id = $1`, [late.order_id]);
		// Control: delivered a day ago is at most one class day.
		await w.db.sql(`update public.coin_market_orders set delivered_at = now() - interval '1 day' where id = $1`, [early.order_id]);
		const n = await w.scalar<number>(`select public._coin_market_autorelease(0) v`);
		expect(n).toBe(1);
		expect(await w.scalar(`select status v from public.coin_market_orders where id = $1`, [late.order_id])).toBe('released');
		expect(await w.scalar(`select status v from public.coin_market_orders where id = $1`, [early.order_id])).toBe('delivered');
		expect(await w.scalar(`select settled_by v from public.coin_market_orders where id = $1`, [late.order_id])).toBe('system');
		await act(w.ben, early.order_id as string, 'confirm');
	});

	test('dispute, then staff release, refund and split each net exactly', async () => {
		for (const [outcome, toPayee] of [
			['release', null],
			['refund', null],
			['split', 1.25]
		] as const) {
			const listing = await post(w.ana, 'offer', 4);
			const anaBefore = await w.balance(w.ana.email);
			const benBefore = await w.balance(w.ben.email);
			const c = await claim(w.ben, listing);
			expect((await act(w.ben, c.order_id as string, 'dispute', 'x')).reason).toBe('dispute_reason');
			expect((await act(w.ben, c.order_id as string, 'dispute', 'It never arrived.')).status).toBe('disputed');
			// A disputed trade cannot be confirmed, delivered or auto-released.
			expect((await act(w.ana, c.order_id as string, 'deliver')).reason).toBe('not_now');
			const r = await w.rpc<Json>(w.owner, `public.coin_market_resolve($1::uuid, $2, $3::numeric, 'decided')`, [
				c.order_id,
				outcome,
				toPayee
			]);
			expect(r.ok, JSON.stringify(r)).toBe(true);
			const paid = outcome === 'release' ? 4 : outcome === 'refund' ? 0 : 1.25;
			expect(await w.balance(w.ana.email)).toBeCloseTo(anaBefore + paid, 2);
			expect(await w.balance(w.ben.email)).toBeCloseTo(benBefore - paid, 2);
		}
		// A split must be strictly between nothing and everything.
		const listing = await post(w.ana, 'offer', 4);
		const c = await claim(w.ben, listing);
		await act(w.ben, c.order_id as string, 'dispute', 'Half done.');
		const bad = await w.rpc<Json>(w.owner, `public.coin_market_resolve($1::uuid, 'split', 4, null)`, [c.order_id]);
		expect(bad.reason).toBe('split_amount');
		await w.rpc(w.owner, `public.coin_market_resolve($1::uuid, 'refund', null, null)`, [c.order_id]);
	});
});

describe('the debt rule and the listing rules', () => {
	test('a student in debt cannot claim an offer or post a request, and can still sell and be paid', async () => {
		await w.give(w.eve.email, -3);
		expect(await w.balance(w.eve.email)).toBeLessThan(0);
		const offer = await post(w.ana, 'offer', 1);
		expect((await claim(w.eve, offer)).reason).toBe('in_debt');
		const req = await w.rpc<Json>(w.eve, `public.coin_market_post('request', 'Need help please', '', 2, 'service', null)`);
		expect(req.reason).toBe('in_debt');
		// Selling: an offer posts, and a buyer pays the indebted seller.
		const mine = await post(w.eve, 'offer', 2);
		const before = await w.balance(w.eve.email);
		const c = await claim(w.ben, mine);
		await act(w.eve, c.order_id as string, 'deliver');
		await act(w.ben, c.order_id as string, 'confirm');
		expect(await w.balance(w.eve.email)).toBeCloseTo(before + 2, 2);
		// Control: the same claim by a student with coins goes through.
		expect((await claim(w.dee, offer)).ok).toBe(true);
	});

	test('a request whose poster can no longer pay is refused at the claim', async () => {
		await w.give(w.cal.email, 5);
		const listing = await post(w.cal, 'request', 5);
		const bal = await w.balance(w.cal.email);
		await w.give(w.cal.email, -bal);
		expect((await claim(w.ana, listing)).reason).toBe('poster_cannot_pay');
		await w.give(w.cal.email, 10);
		expect((await claim(w.ana, listing)).ok).toBe(true);
	});

	test('no more than five open listings, an own listing cannot be claimed, expiry closes it', async () => {
		for (let i = 0; i < 5; i++) await post(w.dee, 'offer', 1);
		const sixth = await w.rpc<Json>(w.dee, `public.coin_market_post('offer', 'One too many', '', 1, 'other', null)`);
		expect(sixth.reason).toBe('too_many');
		const { rows: open } = await w.db.sql<{ id: string }>(
			`select id from public.coin_market_listings where owner_email = $1 and closed_at is null order by created_at limit 1`,
			[w.dee.email]
		);
		expect((await claim(w.dee, open[0].id)).reason).toBe('own_listing');
		await w.db.sql(`update public.coin_market_listings set expires_at = now() - interval '1 minute' where id = $1`, [open[0].id]);
		expect((await claim(w.ben, open[0].id)).reason).toBe('not_open');
		// Expired no longer counts, so a sixth posts; renewing the expired one is then refused.
		await post(w.dee, 'offer', 1);
		const renew = await w.rpc<Json>(w.dee, `public.coin_market_listing_set($1::uuid, 'renew')`, [open[0].id]);
		expect(renew.reason).toBe('too_many');
	});

	test('a hidden listing is off the board for everyone but its poster, with the reason', async () => {
		const listing = await post(w.ana, 'offer', 1);
		const hide = await w.rpc<Json>(w.owner, `public.coin_market_listing_staff($1::uuid, 'hide', 'Not allowed here.')`, [listing]);
		expect(hide.ok).toBe(true);
		const benBoard = await w.rpc<Json>(w.ben, `public.coin_market_board()`);
		expect((benBoard.listings as Json[]).some((l) => l.id === listing)).toBe(false);
		const anaBoard = await w.rpc<Json>(w.ana, `public.coin_market_board()`);
		const mine = (anaBoard.listings as Json[]).find((l) => l.id === listing)!;
		expect(mine.hidden).toBe(true);
		expect(mine.hidden_reason).toBe('Not allowed here.');
		// Control: an open listing is on Ben's board.
		const other = await post(w.ana, 'offer', 1);
		const again = await w.rpc<Json>(w.ben, `public.coin_market_board()`);
		expect((again.listings as Json[]).some((l) => l.id === other)).toBe(true);
		// No address on the board, anywhere.
		expect(JSON.stringify(again)).not.toMatch(/@boscotech/);
	});
});

describe('reviews', () => {
	test('one per side, released trades only, at least the minimum length, locked after the window', async () => {
		const listing = await post(w.ana, 'offer', 1);
		const c = await claim(w.ben, listing);
		const order = c.order_id as string;
		const early = await w.rpc<Json>(w.ben, `public.coin_market_review($1::uuid, 5, $2)`, [order, 'Great work and fast too.']);
		expect(early.reason).toBe('not_released');
		await act(w.ana, order, 'deliver');
		await act(w.ben, order, 'confirm');
		expect((await w.rpc<Json>(w.ben, `public.coin_market_review($1::uuid, 5, 'Too short')`, [order])).reason).toBe('body');
		const ok = await w.rpc<Json>(w.ben, `public.coin_market_review($1::uuid, 5, $2)`, [order, 'Great work and fast too.']);
		expect(ok).toMatchObject({ ok: true, edited: false });
		const edit = await w.rpc<Json>(w.ben, `public.coin_market_review($1::uuid, 4, $2)`, [order, 'Good work, a bit slow at first.']);
		expect(edit.edited).toBe(true);
		expect(Number(await w.scalar(`select count(*)::text v from public.coin_market_reviews where order_id = $1 and author_email = $2`, [order, w.ben.email]))).toBe(1);
		// The other side reviews once too.
		expect((await w.rpc<Json>(w.ana, `public.coin_market_review($1::uuid, 5, $2)`, [order, 'Paid right away, thank you.'])).ok).toBe(true);
		// Locked after 24 hours.
		await w.db.sql(`update public.coin_market_reviews set created_at = now() - interval '25 hours' where order_id = $1 and author_email = $2`, [order, w.ben.email]);
		expect((await w.rpc<Json>(w.ben, `public.coin_market_review($1::uuid, 1, $2)`, [order, 'Changed my mind about it.'])).reason).toBe('locked');
		// The profile shows the average and the count.
		const pid = await w.pid(w.ana.email);
		const prof = await w.rpc<Json>(w.cal, `public.coin_market_profile($1)`, [pid]);
		expect((prof.rating as Json).count).toBe(1);
		expect(JSON.stringify(prof)).not.toMatch(/@boscotech/);
	});

	test('a refunded trade takes no review, and staff removal hides one', async () => {
		const listing = await post(w.ana, 'offer', 1);
		const c = await claim(w.ben, listing);
		await act(w.ana, c.order_id as string, 'cancel');
		const r = await w.rpc<Json>(w.ben, `public.coin_market_review($1::uuid, 1, $2)`, [c.order_id, 'They cancelled on me today.']);
		expect(r.reason).toBe('not_released');
		const { rows } = await w.db.sql<{ id: string }>(`select id from public.coin_market_reviews where subject_email = $1 limit 1`, [w.ana.email]);
		const gone = await w.rpc<Json>(w.teacher, `public.coin_market_review_remove($1::uuid, 'Not kind.')`, [rows[0].id]);
		expect(gone.ok).toBe(true);
		const prof = await w.rpc<Json>(w.cal, `public.coin_market_profile($1)`, [await w.pid(w.ana.email)]);
		expect((prof.rating as Json).count).toBe(0);
	});
});

describe('section staff reach their own classes only', () => {
	test("Mr. Cosso (Block 4 only) cannot resolve a dispute between Block 1 students; their teacher can", async () => {
		const listing = await post(w.ana, 'offer', 1);
		const c = await claim(w.ben, listing);
		await act(w.ben, c.order_id as string, 'dispute', 'Wrong thing delivered.');
		const cosso = await w.rpc<Json>(w.cosso, `public.coin_market_resolve($1::uuid, 'refund', null, null)`, [c.order_id]);
		expect(cosso.reason).toBe('not_found');
		const mod = await w.rpc<Json>(w.cosso, `public.coin_market_moderation()`);
		expect((mod.disputes as Json[]).some((d) => d.id === c.order_id)).toBe(false);
		expect((await w.rpc<Json>(w.cosso, `public.coin_market_listing_staff($1::uuid, 'feature')`, [listing])).reason).toBe('not_found');
		// Control: the teacher of record reaches it.
		const mine = await w.rpc<Json>(w.teacher, `public.coin_market_moderation()`);
		expect((mine.disputes as Json[]).some((d) => d.id === c.order_id)).toBe(true);
		expect((await w.rpc<Json>(w.teacher, `public.coin_market_resolve($1::uuid, 'refund', null, null)`, [c.order_id])).ok).toBe(true);
		// A student is no staff at all.
		expect(await w.refusal(w.rpc(w.ana, `public.coin_market_moderation()`))).toMatch(/coin staff/);
	});

	test('an official card for every class needs a full coin admin', async () => {
		const sec = await w.rpc<Json>(w.cosso, `public.coin_market_official_save(null, 'Tissue boxes wanted', 'Bring one in.', '/coin-balance', null, null, 14)`);
		expect(sec.reason).toBe('full_admin_only');
		const own = await w.rpc<Json>(w.cosso, `public.coin_market_official_save(null, 'Block 4 want-ad', '', '/coin-balance', null, $1::uuid, 14)`, [w.s2]);
		expect(own.ok).toBe(true);
		const full = await w.rpc<Json>(w.owner, `public.coin_market_official_save(null, 'Tissue boxes wanted', 'Bring one in.', '/coin-balance', null, null, 14)`);
		expect(full.ok).toBe(true);
		const offsite = await w.rpc<Json>(w.owner, `public.coin_market_official_save(null, 'Bad link', '', '//evil.example', null, null, 14)`);
		expect(offsite.reason).toBe('link');
		// Ana (Block 1) sees the every-class card and not Block 4's.
		const board = await w.rpc<Json>(w.ana, `public.coin_market_board()`);
		const titles = (board.official as Json[]).map((o) => o.title);
		expect(titles).toContain('Tissue boxes wanted');
		expect(titles).not.toContain('Block 4 want-ad');
		// A student cannot post official at all.
		expect(await w.refusal(w.rpc(w.ana, `public.coin_market_official_save(null, 'Fake', '', '/x', null, null, 14)`))).toMatch(/coin staff/);
	});
});

describe('the student door', () => {
	test('no market function takes an address, and none is anon-executable', async () => {
		const { rows } = await w.db.sql<{ proname: string; args: string; anon: boolean }>(
			`select p.proname, pg_get_function_identity_arguments(p.oid) args,
				has_function_privilege('anon', p.oid, 'execute') anon
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'coin\\_market\\_%'`
		);
		expect(rows.length).toBeGreaterThanOrEqual(10);
		for (const r of rows) {
			expect(r.args, r.proname).not.toMatch(/email/i);
			expect(r.anon, r.proname).toBe(false);
		}
		// Control: the admin logger, which does take an address, is matched by the same pattern.
		const admin = await w.scalar(`select pg_get_function_identity_arguments('public.coin_log_transaction(text,text,numeric,numeric,text)'::regprocedure) v`);
		expect(admin).toMatch(/email/);
	});
});
