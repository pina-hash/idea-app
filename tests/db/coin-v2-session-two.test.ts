// tests/db/coin-v2-session-two.test.ts
//
// IDEA COIN V2, SESSION TWO (ledger 0386, migrations 0244 to 0251) on the
// whole tree.
//
// Each guarantee here is one whose regression would be SILENT: a section coin
// staff member quietly reaching another section, a split purchase quietly
// granting before it is paid, a held payout quietly spendable, a stipend
// quietly paid twice or unprorated, a cap quietly exceeded, a tournament
// quietly paid twice, an auditor quietly validating their own count, a
// dispute that quietly reverses nothing, debt relief quietly granted to a
// student with a fine, an edit that quietly does not net, a spool quietly
// ignored, and a retired table quietly still read. Every case carries a
// planted control: the thing it must NOT do is seeded beside the thing it
// must, so a vacuous pass is impossible.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { WITH_V2 } from './chain-coin-v2';

type Json = Record<string, unknown>;

let db: TestDb;
let owner: SeededUser;
let cosso: SeededUser;
let teacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cal: SeededUser;
let dee: SeededUser;
let s1: string;
let s2: string;

async function rpc<T = Json>(u: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
}
async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}
async function balance(email: string): Promise<number> {
	const { rows } = await db.sql<{ b: string }>(`select public._coin_balance($1)::text b`, [email]);
	return Number(rows[0].b);
}
async function rowCount(email: string, category: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*)::text n from public.coin_transactions where student_email = $1 and category_id = $2`,
		[email, category]
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
async function give(email: string, amount: number) {
	const r = await rpc<Json>(owner, `public.coin_log_transaction($1, 'balance_correction', $2::numeric, null, 'seed')`, [email, amount]);
	expect(r.ok).toBe(true);
}
/** A real object in coin-uploads, owned by the user, of a given size. */
async function upload(u: SeededUser, bytes = 500_000): Promise<string> {
	const path = `${u.id}/${randomUUID()}.png`;
	await db.sql(
		`insert into storage.objects (bucket_id, name, owner, metadata) values ('coin-uploads', $1, $2, jsonb_build_object('size', $3::bigint))`,
		[path, u.id, bytes]
	);
	return path;
}
function dayISO(offset: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + offset);
	return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
	db = await startTestDb(WITH_V2);
	owner = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	cosso = await createUser(db, 'wcosso@boscotech.edu', 'Mr Cosso');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	cal = await createUser(db, 'cal@boscotech.net', 'Cal Ng');
	dee = await createUser(db, 'dee@boscotech.net', 'Dee Park');
	await db.sql(`insert into public.app_admins (email) values ('wcosso@boscotech.edu') on conflict do nothing`);
	s1 = await createClassroomSection(db, { as: owner, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	s2 = await createClassroomSection(db, { as: owner, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: cosso.email });
	const longAgo = new Date(Date.now() - 90 * 86400000).toISOString();
	for (const s of [ana, ben, dee]) {
		await enrollStudent(db, { as: owner, sectionId: s1, email: s.email, displayName: s.email.split('@')[0] + ' (roster)', createdAt: longAgo });
	}
	await enrollStudent(db, { as: owner, sectionId: s2, email: cal.email, displayName: 'cal (roster)', createdAt: longAgo });
	await db.sql(`
		insert into public.coin_settings (key, value) values ('semesters', jsonb_build_array(jsonb_build_object(
			'key', 'test-term', 'start', to_char(current_date - 120, 'YYYY-MM-DD'), 'end', to_char(current_date + 120, 'YYYY-MM-DD'))))
		on conflict (key) do update set value = excluded.value`);
	await setting('no_pay_weeks', []);
	await setting('no_class_days', []);
	await setting('quarter_ends', []);
	await db.sql(`delete from public.coin_settings where key = 'no_pay_after'`);
	await setting('autopay_paused', true);
	await setting('student_actions_per_minute', 120);
}, 600_000);

afterAll(async () => db?.stop());

// ---------------------------------------------------------------------------
// 1. SCOPE (decision 68)
// ---------------------------------------------------------------------------

describe('section coin staff reach their own sections and nothing else', () => {
	test('Mr. Cosso (an admin, not full) fines his own student and is refused another section', async () => {
		const mine = await rpc<Json>(cosso, `public.coin_fine_log(array[$1], 'disruptive_behavior')`, [cal.email]);
		expect(mine.succeeded).toBe(1);
		const theirs = await rpc<Json>(cosso, `public.coin_fine_log(array[$1], 'disruptive_behavior')`, [ana.email]);
		expect(theirs.succeeded).toBe(0);
		expect(((theirs.results as Json[])[0]).reason).toBe('out_of_scope');
		expect(await refusal(rpc(cosso, `public.coin_log_transaction($1, 'disruptive_behavior')`, [ana.email]))).toMatch(/not in one of your classes/);
		expect(await refusal(rpc(cosso, `public.coin_fine_roster($1::uuid)`, [s1]))).toMatch(/not one of yours/);
		expect(await refusal(rpc(cosso, `public.coin_student_stats($1)`, [ana.email]))).toMatch(/not in one of your classes/);
		// Control: the owner reaches both.
		const both = await rpc<Json>(owner, `public.coin_fine_log(array[$1, $2], 'classroom_standards_violation')`, [ana.email, cal.email]);
		expect(both.succeeded).toBe(2);
	});

	test('a non-admin teacher of record is section staff too', async () => {
		const r = await rpc<Json>(teacher, `public.coin_fine_log(array[$1], 'classroom_standards_violation')`, [ben.email]);
		expect(r.succeeded).toBe(1);
		const sections = await rpc<Json[]>(teacher, `public.coin_fine_sections()`);
		expect(sections.map((s) => s.id)).toEqual([s1]);
	});

	test('section staff cannot open or edit the settings, edit an amount, or log a purchase', async () => {
		expect(await refusal(rpc(cosso, `public.coin_settings_get()`))).toMatch(/./);
		expect(await refusal(rpc(cosso, `public.coin_settings_set('autopay_paused', 'false'::jsonb)`))).toMatch(/./);
		expect(await refusal(rpc(cosso, `public.coin_log_transaction($1, 'balance_correction', 5, null, 'x')`, [cal.email]))).toMatch(/full coin admin/);
		const t = await db.sql<{ id: string }>(`select id from public.coin_transactions where student_email = $1 order by created_at desc limit 1`, [cal.email]);
		expect(await refusal(rpc(cosso, `public.coin_edit_amount($1::uuid, 1)`, [t.rows[0].id]))).toMatch(/full coin admin/);
		// Control: the owner can.
		const ok = await rpc<Json>(owner, `public.coin_settings_get()`);
		expect(ok).toHaveProperty('settings');
	});

	test('section staff cannot reverse an automatic row; a full admin can', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`select (public._coin_insert($1, 'weekly_wage', 1, null, 'wage', '{}'::jsonb, 'digital', null, 'system')).id`,
			[cal.email]
		);
		const r = await rpc<Json>(cosso, `public.coin_reverse_transaction($1::uuid)`, [rows[0].id]);
		expect(r).toMatchObject({ ok: false, reason: 'full_admin_only' });
		const o = await rpc<Json>(owner, `public.coin_reverse_transaction($1::uuid)`, [rows[0].id]);
		expect(o.ok).toBe(true);
	});

	test('a name added to coin_full_admins becomes full; the list is edited by full staff only', async () => {
		expect(await refusal(rpc(cosso, `public.coin_full_admin_set($1, true)`, [cosso.email]))).toMatch(/full coin admin/);
		const add = await rpc<Json>(owner, `public.coin_full_admin_set($1, true)`, [cosso.email]);
		expect(add.ok).toBe(true);
		expect((await rpc<Json>(cosso, `public.coin_staff_scope()`)).scope).toBe('full');
		await rpc(owner, `public.coin_full_admin_set($1, false)`, [cosso.email]);
		expect((await rpc<Json>(cosso, `public.coin_staff_scope()`)).scope).toBe('section');
		// Control: a student is no coin staff at all.
		expect((await rpc<Json>(ana, `public.coin_staff_scope()`)).scope).toBeNull();
	});

	test('the queue shows section staff only their own students', async () => {
		await rpc(cal, `public.coin_report_physical(4)`);
		await rpc(ana, `public.coin_report_physical(7)`);
		const q = await rpc<Json>(cosso, `public.coin_queue()`);
		const emails = (q.pending as Json[]).map((c) => c.email);
		expect(emails).toContain(cal.email);
		expect(emails).not.toContain(ana.email);
		const all = await rpc<Json>(owner, `public.coin_queue()`);
		expect((all.pending as Json[]).map((c) => c.email)).toEqual(expect.arrayContaining([cal.email, ana.email]));
		const anaCard = (all.pending as Json[]).find((c) => c.email === ana.email)!;
		expect((await rpc<Json>(cosso, `public.coin_queue_decide($1::uuid, true)`, [anaCard.id])).reason).toBe('not_found');
	});
});

// ---------------------------------------------------------------------------
// 2. SPLIT PAYMENT
// ---------------------------------------------------------------------------

describe('a split purchase grants nothing until its physical part is approved', () => {
	test('the digital part is charged at once and the Eating Pass is not active until approval', async () => {
		await rpc(owner, `public.coin_settings_set_category('eating_pass', null, 10, null, null, null, null, null, null)`);
		await give(ben.email, 10 - (await balance(ben.email)) + 5); // ben at 15
		const r = await rpc<Json>(ben, `public.coin_buy_split('eating_pass', 6)`);
		expect(r).toMatchObject({ ok: true, digital: 4, physical: 6 });
		expect(await balance(ben.email)).toBe(11);
		const pass = await db.sql<{ a: boolean }>(`select public.coin_eating_pass_active($1) a`, [ben.email]);
		expect(pass.rows[0].a).toBe(false);
		const d = await rpc<Json>(teacher, `public.coin_queue_decide($1::uuid, true)`, [r.request_id]);
		expect(d.ok).toBe(true);
		const after = await db.sql<{ a: boolean }>(`select public.coin_eating_pass_active($1) a`, [ben.email]);
		expect(after.rows[0].a).toBe(true);
		const phys = await db.sql<{ n: string }>(
			`select count(*)::text n from public.coin_transactions where student_email = $1 and category_id = 'eating_pass' and medium = 'physical' and amount = -6`,
			[ben.email]
		);
		expect(phys.rows[0].n).toBe('1');
		expect(await balance(ben.email)).toBe(11); // the physical part moves no balance
	});

	test('a deny refunds the digital part and grants nothing', async () => {
		const tier = async () => Number((await db.sql<{ t: string }>(`select coalesce((select tier from public.coin_wage_tiers where student_email = $1), 1)::text t`, [ana.email])).rows[0].t);
		await give(ana.email, 150);
		const before = await balance(ana.email);
		const t0 = await tier();
		const r = await rpc<Json>(ana, `public.coin_buy_split('pay_raise', 30)`);
		expect(r.ok).toBe(true);
		expect(await balance(ana.email)).toBe(before - 70);
		const d = await rpc<Json>(owner, `public.coin_queue_decide($1::uuid, false, null, 'Coins not handed over.')`, [r.request_id]);
		expect(d.ok).toBe(true);
		expect(await balance(ana.email)).toBe(before);
		expect(await tier()).toBe(t0);
		// Control: approving another split raises the tier.
		const r2 = await rpc<Json>(ana, `public.coin_buy_split('pay_raise', 30)`);
		await rpc(owner, `public.coin_queue_decide($1::uuid, true)`, [r2.request_id]);
		expect(await tier()).toBe(t0 + 1);
	});

	test('a student in debt cannot split; the same student out of debt can', async () => {
		const e = 'debt.split@boscotech.net';
		const u = await createUser(db, e, 'Debt Split');
		await enrollStudent(db, { as: owner, sectionId: s1, email: e, displayName: 'debt split' });
		await rpc(owner, `public.coin_log_transaction($1, 'disruptive_behavior')`, [e]);
		const r = await rpc<Json>(u, `public.coin_buy_split('three_d_printing', 1, 100)`);
		expect(r).toMatchObject({ ok: false, reason: 'in_debt' });
		await give(e, 13);
		const ok = await rpc<Json>(u, `public.coin_buy_split('three_d_printing', 1, 100)`);
		expect(ok.ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. PAYDAY
// ---------------------------------------------------------------------------

describe('coins out are held, then settled once', () => {
	test('a held request leaves what can be spent, and cancelling gives it back', async () => {
		const e = 'payday@boscotech.net';
		const u = await createUser(db, e, 'Pay Day');
		await enrollStudent(db, { as: owner, sectionId: s1, email: e, displayName: 'pay day' });
		await give(e, 12);
		const req = await rpc<Json>(u, `public.coin_request_payout(5)`);
		expect(req.ok).toBe(true);
		expect(await balance(e)).toBe(7);
		const buy = await rpc<Json>(u, `public.coin_buy_eating_pass()`); // price 10
		expect(buy).toMatchObject({ ok: false, reason: 'insufficient' });
		const cancel = await rpc<Json>(u, `public.coin_cancel_payout()`);
		expect(cancel.ok).toBe(true);
		expect(await balance(e)).toBe(12);
		// Control: with the hold gone the same purchase goes through.
		expect((await rpc<Json>(u, `public.coin_buy_eating_pass()`)).ok).toBe(true);
	});

	test('settling posts the two-row transfer once; a second Done finds it closed', async () => {
		const e = 'payday2@boscotech.net';
		const u = await createUser(db, e, 'Pay Day Two');
		await enrollStudent(db, { as: owner, sectionId: s1, email: e, displayName: 'pay day two' });
		await give(e, 8);
		const req = await rpc<Json>(u, `public.coin_request_payout(3)`);
		const list = await rpc<Json>(teacher, `public.coin_payday($1::uuid)`, [s1]);
		expect((list.requests as Json[]).map((r) => r.email)).toContain(e);
		const s = await rpc<Json>(teacher, `public.coin_payday_settle(array[$1::uuid])`, [req.request_id]);
		expect(s.settled).toBe(1);
		const again = await rpc<Json>(teacher, `public.coin_payday_settle(array[$1::uuid])`, [req.request_id]);
		expect(again.settled).toBe(0);
		expect(await rowCount(e, 'coin_payout')).toBe(1);
		expect(await rowCount(e, 'payout_physical_credit')).toBe(1);
		expect(await balance(e)).toBe(5);
		// Control: Mr. Cosso cannot settle a Block 1 request.
		const other = await rpc<Json>(u, `public.coin_request_payout(1)`);
		const c = await rpc<Json>(cosso, `public.coin_payday_settle(array[$1::uuid])`, [other.request_id]);
		expect(c.settled).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 4. ROLE EVIDENCE
// ---------------------------------------------------------------------------

describe('role days are judged from server-timed photos, and the stipend is prorated and paid once', () => {
	let holder: string;
	const monday = (() => {
		const d = new Date();
		const dow = (d.getUTCDay() + 6) % 7;
		d.setUTCDate(d.getUTCDate() - dow - 21);
		return d.toISOString().slice(0, 10);
	})();

	beforeAll(async () => {
		const app = await rpc<Json>(dee, `public.coin_role_self_apply('lab_tech')`);
		expect(app.ok).toBe(true);
		const rev = await rpc<Json>(owner, `public.coin_role_admin_review($1::uuid, 'approve')`, [app.application_id]);
		expect(rev.ok).toBe(true);
		holder = rev.holder_id as string;
		await db.sql(`update public.coin_role_holders set since = $2::date - 30 where id = $1`, [holder, monday]);
	});

	async function photo(day: string, time: string) {
		await db.sql(
			`insert into public.coin_role_evidence (holder_id, student_email, on_day, photo_path, taken_at)
			 values ($1, $2, $3::date, 'x/y.png', ($3::date + $4::time) at time zone 'America/Los_Angeles')`,
			[holder, dee.email, day, time]
		);
	}

	test('a gap shorter than the minimum fails the day; the minimum passes it', async () => {
		const d1 = monday;
		await photo(d1, '09:00');
		await photo(d1, '09:30');
		const fail = await db.sql<{ s: Json }>(`select public._coin_role_day_status($1, $2::date) s`, [holder, d1]);
		expect(fail.rows[0].s).toMatchObject({ valid: false, reason: 'gap_too_short' });
		const d2 = dayISO(-1000); // a day far away, used only for the control
		await db.sql(
			`insert into public.coin_role_evidence (holder_id, student_email, on_day, photo_path, taken_at) values
			 ($1, $2, $3::date, 'x/y.png', ($3::date + time '09:00') at time zone 'America/Los_Angeles'),
			 ($1, $2, $3::date, 'x/y.png', ($3::date + time '09:45') at time zone 'America/Los_Angeles')`,
			[holder, dee.email, d2]
		);
		const pass = await db.sql<{ s: Json }>(`select public._coin_role_day_status($1, $2::date) s`, [holder, d2]);
		expect(pass.rows[0].s).toMatchObject({ valid: true, status: 'passed' });
	});

	test('capture refuses outside the window and accepts inside it', async () => {
		await setting('role_window_start', '00:00');
		await setting('role_window_end', '00:00');
		const out = await rpc<Json>(dee, `public.coin_role_capture($1::uuid, $2)`, [holder, await upload(dee)]);
		expect(out).toMatchObject({ ok: false, reason: 'outside_window' });
		await setting('role_window_end', '23:59');
		const ok = await rpc<Json>(dee, `public.coin_role_capture($1::uuid, $2)`, [holder, await upload(dee)]);
		expect(ok.ok).toBe(true);
		await setting('role_window_start', '07:00');
		await setting('role_window_end', '16:00');
	});

	test('the stipend is 1 x 2 weeks x valid / required, paid once', async () => {
		// Days 2..5 of the first week pass; nine of the ten class days are
		// otherwise empty (day 1 failed above). 4 valid of 10 required.
		for (let i = 1; i <= 4; i++) {
			const d = new Date(monday + 'T12:00:00Z');
			d.setUTCDate(d.getUTCDate() + i);
			const day = d.toISOString().slice(0, 10);
			await photo(day, '08:00');
			await photo(day, '09:00');
		}
		await setting('role_stipend_anchor', monday);
		await setting('autopay_start', monday);
		await setting('highest_grade_anchor', dayISO(400));
		await setting('autopay_paused', false);
		await rpc(owner, `public.coin_autopay_run('admin')`);
		const { rows } = await db.sql<{ valid_days: number; required_days: number; amount: string }>(
			`select valid_days, required_days, amount::text from public.coin_role_stipends where holder_id = $1 and period_start = $2::date`,
			[holder, monday]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].required_days).toBe(10);
		expect(rows[0].valid_days).toBe(4);
		expect(Number(rows[0].amount)).toBe(0.8);
		await rpc(owner, `public.coin_autopay_run('admin')`);
		const paid = await db.sql<{ n: string }>(
			`select count(*)::text n from public.coin_transactions where student_email = $1 and category_id = 'weekly_role_stipend'`,
			[dee.email]
		);
		expect(paid.rows[0].n).toBe('1');
		// Control: an override accepting the failed day changes the verdict for that day.
		const set = await rpc<Json>(owner, `public.coin_role_day_set($1::uuid, $2::date, 'accepted')`, [holder, monday]);
		expect((set.status as Json).valid).toBe(true);
		await setting('autopay_paused', true);
	});
});

// ---------------------------------------------------------------------------
// 5. CAPS
// ---------------------------------------------------------------------------

describe('the background and donation limits hold', () => {
	test('one background every two weeks; a picture under the floor never reaches the queue', async () => {
		const small = await rpc<Json>(ben, `public.coin_submit_background($1, 1280, 720)`, [await upload(ben)]);
		expect(small).toMatchObject({ ok: false, reason: 'too_small' });
		const grainy = await rpc<Json>(ben, `public.coin_submit_background($1, 1920, 1080)`, [await upload(ben, 1000)]);
		expect(grainy).toMatchObject({ ok: false, reason: 'low_quality' });
		const ok = await rpc<Json>(ben, `public.coin_submit_background($1, 1920, 1080)`, [await upload(ben)]);
		expect(ok.ok).toBe(true);
		const again = await rpc<Json>(ben, `public.coin_submit_background($1, 3840, 2160)`, [await upload(ben, 2_000_000)]);
		expect(again).toMatchObject({ ok: false, reason: 'too_soon' });
		const n = await db.sql<{ n: string }>(`select count(*)::text n from public.coin_requests where student_email = $1 and kind = 'background'`, [ben.email]);
		expect(n.rows[0].n).toBe('1');
		// Approval pays 2 and makes it the current background.
		const before = await balance(ben.email);
		await rpc(owner, `public.coin_queue_decide($1::uuid, true)`, [ok.request_id]);
		expect(await balance(ben.email)).toBe(before + 2);
		const cur = await db.sql<{ b: Json }>(`select public._coin_current_background($1) b`, [ben.email]);
		expect(cur.rows[0].b).toMatchObject({ request_id: ok.request_id });
	});

	test('a donation over the cap pays up to the cap and says so', async () => {
		const { rows } = await db.sql<{ id: string }>(`select id from public.coin_donation_items where rate = 2 limit 1`);
		const big = await rpc<Json>(ana, `public.coin_submit_donation($1::uuid, 7, null, $2)`, [rows[0].id, await upload(ana)]);
		expect(big.ok).toBe(true);
		const before = await balance(ana.email);
		const d = await rpc<Json>(owner, `public.coin_queue_decide($1::uuid, true)`, [big.request_id]);
		expect(d.result).toMatchObject({ asked: 14, capped: true, paid: 10 });
		expect(await balance(ana.email)).toBe(before + 10);
		const second = await rpc<Json>(ana, `public.coin_submit_donation($1::uuid, 1, null, $2)`, [rows[0].id, await upload(ana)]);
		const d2 = await rpc<Json>(owner, `public.coin_queue_decide($1::uuid, true)`, [second.request_id]);
		expect(d2.result).toMatchObject({ paid: 0, capped: true });
		// Control: a different student under the cap is paid in full.
		const c = await rpc<Json>(ben, `public.coin_submit_donation($1::uuid, 2, null, $2)`, [rows[0].id, await upload(ben)]);
		const dc = await rpc<Json>(owner, `public.coin_queue_decide($1::uuid, true)`, [c.request_id]);
		expect(dc.result).toMatchObject({ paid: 4, capped: false });
	});
});

// ---------------------------------------------------------------------------
// 6. TOURNAMENT TRANSFER
// ---------------------------------------------------------------------------

describe('a tournament is settled once, and paid physically moves nothing', () => {
	async function tournament(name: string): Promise<string> {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.tournaments (name, status, created_by) values ($1, 'complete', $2) returning id`,
			[name, owner.id]
		);
		const t = rows[0].id;
		const e = await db.sql<{ id: string }>(
			`insert into public.tournament_entries (tournament_id, user_id, display_name) values ($1, $2, 'Team A') returning id`,
			[t, ana.id]
		);
		await db.sql(
			`insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name) values ($1, $2, $3, 'Ana'), ($1, $2, $4, 'Ben'), ($1, $2, null, 'Walk Up')`,
			[e.rows[0].id, t, ana.id, ben.id]
		);
		for (const uid of [ana.id, ben.id, null]) {
			await db.sql(
				`insert into public.tournament_reward_ledger (tournament_id, entry_id, user_id, amount, reason, awaiting_transfer) values ($1, $2, $3, 4, 'match win', true), ($1, $2, $3, 2, '1st place', true)`,
				[t, e.rows[0].id, uid]
			);
		}
		return t;
	}

	test('the list sums each event once per team, lists the walk-up, and Transfer pays once', async () => {
		const t = await tournament('Robot Cup');
		const list = await rpc<Json[]>(owner, `public.coin_tournament_transfers()`);
		const row = list.find((x) => x.id === t)!;
		const entry = (row.entries as Json[])[0];
		expect(Number(entry.earned)).toBe(6);
		expect((entry.members as Json[]).map((m) => m.has_account)).toEqual([true, true, false]);
		const anaBefore = await balance(ana.email);
		const r = await rpc<Json>(owner, `public.coin_tournament_settle($1::uuid, 'transferred', 'split', $2::jsonb)`, [
			t,
			JSON.stringify([{ user_id: ana.id, amount: 3 }, { user_id: ben.id, amount: 3 }])
		]);
		expect(r).toMatchObject({ ok: true, paid: 2 });
		expect(await balance(ana.email)).toBe(anaBefore + 3);
		const again = await rpc<Json>(owner, `public.coin_tournament_settle($1::uuid, 'transferred', 'split', $2::jsonb)`, [
			t,
			JSON.stringify([{ user_id: ana.id, amount: 3 }])
		]);
		expect(again).toMatchObject({ ok: false, reason: 'already_settled' });
		expect(await balance(ana.email)).toBe(anaBefore + 3);
		expect((await rpc<Json[]>(owner, `public.coin_tournament_transfers()`)).map((x) => x.id)).not.toContain(t);
		// Section staff may not transfer.
		expect(await refusal(rpc(cosso, `public.coin_tournament_transfers()`))).toMatch(/full coin admin/);
	});

	test('paid physically posts nothing and keeps the record', async () => {
		const t = await tournament('Paper Cup');
		const before = await db.sql<{ n: string }>(`select count(*)::text n from public.coin_transactions where category_id = 'competition_winnings'`);
		const r = await rpc<Json>(owner, `public.coin_tournament_settle($1::uuid, 'paid_physically', null, null)`, [t]);
		expect(r.ok).toBe(true);
		const after = await db.sql<{ n: string }>(`select count(*)::text n from public.coin_transactions where category_id = 'competition_winnings'`);
		expect(after.rows[0].n).toBe(before.rows[0].n);
		const pub = await db.asAnon((q) => q<{ r: Json }>(`select public.tournament_reward_settlement($1::uuid) r`, [t]));
		expect(pub.rows[0].r).toMatchObject({ outcome: 'paid_physically' });
	});

	test('a person who is not a participant cannot be paid', async () => {
		const t = await tournament('Rope Cup');
		const m = await refusal(rpc(owner, `public.coin_tournament_settle($1::uuid, 'transferred', 'duplicate', $2::jsonb)`, [
			t,
			JSON.stringify([{ user_id: cal.id, amount: 6 }])
		]));
		expect(m).toMatch(/participant/);
	});
});

// ---------------------------------------------------------------------------
// 7. AUDITOR, 8. DISPUTE
// ---------------------------------------------------------------------------

describe('a Student Auditor validates a classmate and never themselves', () => {
	test('own report refused; a classmate validated, named, and shown publicly', async () => {
		await rpc(owner, `public.coin_auditor_set($1, true)`, [dee.email]);
		const own = await rpc<Json>(dee, `public.coin_report_physical(9)`);
		expect((await rpc<Json>(dee, `public.coin_auditor_validate($1::uuid, true)`, [own.request_id])).reason).toBe('own_report');
		const q = await rpc<Json>(dee, `public.coin_auditor_queue()`);
		const card = (q.pending as Json[]).find((c) => Number(c.count) === 7)!; // ana's, from the scope test
		expect(card).toBeTruthy();
		const v = await rpc<Json>(dee, `public.coin_auditor_validate($1::uuid, true)`, [card.id]);
		expect(v.ok).toBe(true);
		expect((v.result as Json).validated_by_name).toBe('dee (roster)');
		const pub = await db.asAnon((q2) => q2<{ coins: string }>(`select coins::text from public.coin_public_reported_coins()`));
		expect(pub.rows.map((r) => Number(r.coins))).toContain(7);
		// Control: a revoked auditor is refused.
		await rpc(owner, `public.coin_auditor_set($1, false)`, [dee.email]);
		expect(await refusal(rpc(dee, `public.coin_auditor_validate($1::uuid, true)`, [own.request_id]))).toMatch(/Student Auditor/);
	});
});

describe('a disputed automatic fine is reversed on approval', () => {
	test('approval posts the reversal; a manual fine is not disputable', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`select (public._coin_insert($1, 'long_bathroom_break', -2, null, 'Long hall pass', '{}'::jsonb, 'digital', null, 'system')).id`,
			[ben.email]
		);
		const before = await balance(ben.email);
		const d = await rpc<Json>(ben, `public.coin_dispute_fine($1::uuid, 'The pass did not close.')`, [rows[0].id]);
		expect(d.ok).toBe(true);
		const dup = await rpc<Json>(ben, `public.coin_dispute_fine($1::uuid, 'again')`, [rows[0].id]);
		expect(dup.reason).toBe('already_disputed');
		await rpc(teacher, `public.coin_queue_decide($1::uuid, true)`, [d.request_id]);
		expect(await balance(ben.email)).toBe(before + 2);
		const rev = await db.sql<{ r: boolean }>(`select public._coin_is_reversed($1) r`, [rows[0].id]);
		expect(rev.rows[0].r).toBe(true);
		// Control: a fine a person logged cannot be disputed here.
		const manual = await rpc<Json>(owner, `public.coin_log_transaction($1, 'classroom_standards_violation')`, [ben.email]);
		expect((await rpc<Json>(ben, `public.coin_dispute_fine($1::uuid, 'no')`, [manual.transaction_id])).reason).toBe('not_disputable');
	});
});

// ---------------------------------------------------------------------------
// 9. CLEAN-QUARTER HALVING
// ---------------------------------------------------------------------------

describe('clean-quarter halving runs once a quarter and skips anyone with a fine', () => {
	test('a clean student in debt gets half off, once; a student with a fine gets nothing', async () => {
		const clean = 'clean.q@boscotech.net';
		const fined = 'fined.q@boscotech.net';
		await enrollStudent(db, { as: owner, sectionId: s1, email: clean, displayName: 'clean' });
		await enrollStudent(db, { as: owner, sectionId: s1, email: fined, displayName: 'fined' });
		await rpc(owner, `public.coin_log_transaction($1, 'balance_correction', -10, null, 'debt')`, [clean]);
		await rpc(owner, `public.coin_log_transaction($1, 'balance_correction', -7, null, 'debt')`, [fined]);
		await rpc(owner, `public.coin_log_transaction($1, 'disruptive_behavior')`, [fined]);
		await db.sql(
			`update public.coin_transactions set created_at = now() - interval '20 days' where student_email in ($1, $2)`,
			[clean, fined]
		);
		await setting('debt_relief_fines_since', dayISO(-60));
		await setting('quarter_ends', [dayISO(-10)]);
		await setting('highest_grade_anchor', dayISO(400));
		await setting('autopay_start', dayISO(400));
		await setting('autopay_paused', false);
		await rpc(owner, `public.coin_autopay_run('admin')`);
		await rpc(owner, `public.coin_autopay_run('admin')`);
		await setting('autopay_paused', true);
		expect(await balance(clean)).toBe(-5);
		expect(await rowCount(clean, 'debt_relief')).toBe(1);
		expect(await rowCount(fined, 'debt_relief')).toBe(0);
		expect(await balance(fined)).toBe(-10);
	});
});

// ---------------------------------------------------------------------------
// 10. NUMBER EDIT, 11. SPOOL
// ---------------------------------------------------------------------------

describe('editing a past amount nets to the new value, and undo restores the original', () => {
	test('3 edited to 5 then undone', async () => {
		const e = 'edit@boscotech.net';
		await enrollStudent(db, { as: owner, sectionId: s1, email: e, displayName: 'edit' });
		const a = await rpc<Json>(owner, `public.coin_log_transaction($1, 'above_and_beyond', 3, null, 'x')`, [e]);
		const edit = await rpc<Json>(owner, `public.coin_edit_amount($1::uuid, 5)`, [a.transaction_id]);
		expect(edit.ok).toBe(true);
		expect(await balance(e)).toBe(5);
		const eff = await db.sql<{ v: string }>(`select public._coin_effective_amount($1)::text v`, [a.transaction_id]);
		expect(Number(eff.rows[0].v)).toBe(5);
		const feed = await db.asAnon((q) => q<{ amount: string; category_id: string }>(
			`select amount::text, category_id from public.coin_public_transactions() where name = 'edit'`));
		expect(feed.rows.map((r) => [r.category_id, Number(r.amount)])).toEqual([['above_and_beyond', 5]]);
		const undo = await rpc<Json>(owner, `public.coin_edit_undo($1::uuid)`, [a.transaction_id]);
		expect(undo.ok).toBe(true);
		expect(await balance(e)).toBe(3);
		const eff2 = await db.sql<{ v: string }>(`select public._coin_effective_amount($1)::text v`, [a.transaction_id]);
		expect(Number(eff2.rows[0].v)).toBe(3);
		// The original row never changed.
		const raw = await db.sql<{ amount: string }>(`select amount::text from public.coin_transactions where id = $1`, [a.transaction_id]);
		expect(Number(raw.rows[0].amount)).toBe(3);
	});
});

describe('a spool credit is drawn before coins', () => {
	test('300 g from a 1000 g spool costs nothing; 800 g more costs only the 100 g past it', async () => {
		const e = 'spool@boscotech.net';
		const u = await createUser(db, e, 'Spool');
		await enrollStudent(db, { as: owner, sectionId: s1, email: e, displayName: 'spool' });
		await give(e, 50);
		expect((await rpc<Json>(owner, `public.coin_record_spool($1)`, [e])).grams_left).toBe(1000);
		const a = await rpc<Json>(u, `public.coin_buy_print(300)`);
		expect(a).toMatchObject({ ok: true, cost: 0, grams_left: 700 });
		const b = await rpc<Json>(u, `public.coin_buy_print(800)`);
		expect(b).toMatchObject({ ok: true, cost: 10, grams_left: 0 });
		expect(await balance(e)).toBe(40);
		// Control: with no spool the same 800 g would have cost 80.
		const p = await db.sql<{ v: string }>(`select public._coin_print_price(800)::text v`);
		expect(Number(p.rows[0].v)).toBe(80);
	});
});

// ---------------------------------------------------------------------------
// 12. THE OLD MODEL IS GONE
// ---------------------------------------------------------------------------

describe('nothing reads the retired coin model, and the Ledger names come from IDEA Classroom', () => {
	test('no function or view references a retired table or a dropped function', async () => {
		const RETIRED = /\m(coin_sections|coin_section_students|coin_students|coin_import_mappings|coin_import_batches|_coin_normalize_media|_coin_digital_only|coin_payout_student|coin_bulk_payout|coin_admin_list_sections|coin_bulk_log_section|coin_public_sections)\M/.source;
		const fns = await db.sql<{ f: string }>(
			`select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.prosrc ~ $1`,
			[RETIRED]
		);
		expect(fns.rows.map((r) => r.f)).toEqual([]);
		const views = await db.sql<{ v: string }>(`select viewname v from pg_views where schemaname = 'public' and definition ~ $1`, [RETIRED]);
		expect(views.rows).toEqual([]);
		// Positive control: the same query finds a planted reader.
		await db.sql(`create function public.zz_planted() returns bigint language sql as $$ select count(*) from public.coin_students $$`);
		const planted = await db.sql<{ f: string }>(
			`select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ~ $1`,
			[RETIRED]
		);
		expect(planted.rows.map((r) => r.f)).toEqual(['zz_planted']);
		await db.sql(`drop function public.zz_planted()`);
		const dropped = await db.sql<{ n: string }>(`select count(*)::text n from pg_proc where proname in ('coin_admin_list_sections', 'coin_bulk_payout', 'coin_admin_import_legacy', '_coin_normalize_media')`);
		expect(dropped.rows[0].n).toBe('0');
	});

	test('the retired tables are readable by no client role', async () => {
		const m = await refusal(db.asUser(owner.id, (q) => q(`select count(*) from public.coin_sections`)));
		expect(m).toMatch(/permission denied/);
		const r = await db.sql<{ n: string }>(`select count(*)::text n from public.coin_v2_retired where kind = 'table' and drop_statement like 'drop table%'`);
		expect(r.rows[0].n).toBe('5');
	});

	test('a Ledger name and class come from the class roster, not the legacy directory', async () => {
		await db.sql(`insert into public.coin_students (student_email, display_name, legacy_section) values ($1, 'Reyes, Legacy', 'IDEA-113') on conflict (student_email) do update set display_name = excluded.display_name`, [ana.email]);
		const board = await db.asAnon((q) => q<{ name: string; section: string }>(`select name, section from public.coin_public_leaderboard()`));
		const names = board.rows.map((r) => r.name);
		expect(names).toContain('ana (roster)');
		expect(names).not.toContain('Reyes, Legacy');
		const row = board.rows.find((r) => r.name === 'ana (roster)')!;
		expect(row.section).toBe('IDEA100 Block 1');
		// Control: the legacy row is really there to be read.
		const legacy = await db.sql<{ n: string }>(`select count(*)::text n from public.coin_students where student_email = $1`, [ana.email]);
		expect(legacy.rows[0].n).toBe('1');
	});
});
