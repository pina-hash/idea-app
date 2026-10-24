// tests/db/feedback-bulk-spam-rewards.test.ts
//
// Ledger 0432's feedback migration (bulk status, one incident whole, the
// report box against spam, the fine prompt, the reward). The chain is booted
// SHORT of the file; reports, Armory notes and incidents are seeded through
// the real pre-migration write paths (a signed-in report is the student's own
// insert); then the file is applied over the top, twice.
//
// The silent guarantees, each with its control:
//   - a bulk change touches exactly the rows named, and its undo puts back
//     what each row had;
//   - the guard keeps every report it does not refuse, marks only junk, and
//     refuses only a burst, with a planted real report as the control;
//   - a fine lands on the one account the reports came from and never on two,
//     and pays nothing for reports that are not open spam;
//   - a reward is paid once, 1 to 10, and never to an anonymous report.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createUser, type SeededUser, type TestDb, startTestDb } from './harness';

type Json = Record<string, unknown>;
const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = ALL.find((f) => /_feedback_bulk_spam_rewards\.sql$/.test(f))!;
const NUM = FILE.slice(0, 4);
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < NUM)];
const SQL = readFileSync(join(DIR, FILE), 'utf8');

let db: TestDb;
let admin: SeededUser, ana: SeededUser, leo: SeededUser, carla: SeededUser, dev: SeededUser;
let anaReports: string[] = [];
let leoReports: string[] = [];
let note: string, incident: string, otherIncident: string;
let statusesBefore: { id: string; status: string }[];

const as = <T = Json>(u: SeededUser, call: string, params: unknown[] = [], claims?: Record<string, unknown>) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r, claims);
async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}
async function report(u: SeededUser, message: string, meta: Json = {}, claims?: Record<string, unknown>): Promise<{ id: string; status: string; meta: Json }> {
	return db.asUser(
		u.id,
		async (q) =>
			(await q<{ id: string; status: string; meta: Json }>(
				`insert into public.app_feedback (user_id, app, kind, message, meta) values ($1, 'portal', 'bug', $2, $3::jsonb) returning id, status, meta`,
				[u.id, message, JSON.stringify(meta)]
			)).rows[0],
		claims
	);
}
const n = async (sql: string, params: unknown[] = []) => Number((await db.sql<{ n: string }>(sql, params)).rows[0].n);
const statusOf = async (id: string) => (await db.sql<{ status: string }>(`select status from public.app_feedback where id = $1`, [id])).rows[0].status;
const ageAll = (minutes: number) => db.sql(`update public.app_feedback set created_at = now() - make_interval(mins => $1)`, [minutes]);

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	leo = await createUser(db, 'leo@boscotech.net', 'Leo Park');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Diaz');
	dev = await createUser(db, 'dev@boscotech.net', 'Dev Shah');
	// Before the file: ordinary reports through the student's own insert.
	for (const m of ['hi', 'hi', 'The hall pass timer froze', 'a']) anaReports.push((await report(ana, m, { device: { key: 'lab-pc-7', label: 'Windows' } })).id);
	for (const m of ['hi', 'Market prices look wrong']) leoReports.push((await report(leo, m, { device: { key: 'lab-pc-7', label: 'Windows' } })).id);
	note = (await db.sql<{ id: string }>(`insert into public.armory_app_feedback (email, app_version, kind, body, context) values ('ana@boscotech.net', '0.3.3', 'bug', 'It froze.', '{}'::jsonb) returning id`)).rows[0].id;
	incident = (await db.sql<{ id: string }>(`insert into public.armory_app_incidents (email, app_version, kind, summary, report, report_bytes) values ('ana@boscotech.net', '0.3.3', 'slowPass', 'Slow.', '{"events":[{"t":1,"phase":"scan"}],"log":["line one"]}'::jsonb, 60) returning id`)).rows[0].id;
	otherIncident = (await db.sql<{ id: string }>(`insert into public.armory_app_incidents (email, app_version, kind, summary, report, report_bytes) values ('leo@boscotech.net', '0.3.3', 'crash', 'Crash.', '{}'::jsonb, 2) returning id`)).rows[0].id;
	statusesBefore = (await db.sql<{ id: string; status: string }>(`select id, status from public.app_feedback order by id`)).rows;
	await ageAll(30);

	await db.sql(SQL);
	await db.sql(SQL);
}, 600_000);

afterAll(async () => db?.stop());

describe(`${NUM} applies over reports already stored`, () => {
	test('every stored report keeps its status (the guard judges only new reports)', async () => {
		const after = (await db.sql<{ id: string; status: string }>(`select id, status from public.app_feedback order by id`)).rows;
		expect(after).toEqual(statusesBefore);
		expect(after.every((r) => r.status === 'new')).toBe(true);
	});
});

describe('bulk status', () => {
	test('changes exactly the rows named, counts a missing id, and its undo restores each', async () => {
		const ghost = randomUUID();
		const r = await as<Json>(admin, `public.app_feedback_set_status_many($1::uuid[], 'spam')`, [[anaReports[0], anaReports[1], leoReports[0], ghost]]);
		expect(r).toMatchObject({ ok: true, total: 4, changed: 3, missing: 1, status: 'spam' });
		expect(Object.keys(r.previous as Json).sort()).toEqual([anaReports[0], anaReports[1], leoReports[0]].sort());
		// Control, both directions: the named rows moved; every other row did not.
		for (const id of [anaReports[0], anaReports[1], leoReports[0]]) expect(await statusOf(id)).toBe('spam');
		for (const id of [anaReports[2], anaReports[3], leoReports[1]]) expect(await statusOf(id)).toBe('new');
		await as(admin, `public.app_feedback_set_status_many($1::uuid[], 'seen')`, [[anaReports[2]]]);
		const undo = await as<Json>(admin, `public.app_feedback_restore_statuses($1::jsonb)`, [JSON.stringify({ [anaReports[2]]: 'new' })]);
		expect(undo).toMatchObject({ ok: true, changed: 1 });
		expect(await statusOf(anaReports[2])).toBe('new');
	});
	test('a student can move nothing', async () => {
		expect(await refusal(as(ana, `public.app_feedback_set_status_many($1::uuid[], 'resolved')`, [[anaReports[2]]]))).toMatch(/site admin/);
		expect(await statusOf(anaReports[2])).toBe('new');
		expect(await refusal(as(ana, `public.armory_app_incidents_set_status_many($1::uuid[], 'resolved')`, [[incident]]))).toMatch(/site admin/);
	});
	test('Armory notes and incidents move in one call, and back', async () => {
		const r = await as<Json>(admin, `public.armory_app_incidents_set_status_many($1::uuid[], 'resolved')`, [[incident]]);
		expect(r).toMatchObject({ ok: true, changed: 1, previous: { [incident]: 'new' } });
		expect((await db.sql(`select status from public.armory_app_incidents where id = $1`, [otherIncident])).rows[0].status).toBe('new');
		await as(admin, `public.armory_app_incidents_restore_statuses($1::jsonb)`, [JSON.stringify(r.previous)]);
		expect((await db.sql(`select status from public.armory_app_incidents where id = $1`, [incident])).rows[0].status).toBe('new');
		expect(await as<Json>(admin, `public.armory_app_feedback_set_status_many($1::uuid[], 'seen')`, [[note]])).toMatchObject({ changed: 1 });
	});
	test('one incident reads whole for an admin, and for nobody else', async () => {
		const r = await as<Json>(admin, `public.armory_app_incident_report($1::uuid)`, [incident]);
		expect(r).toMatchObject({ ok: true, kind: 'slowPass', report: { events: [{ t: 1, phase: 'scan' }], log: ['line one'] } });
		expect(await refusal(as(ana, `public.armory_app_incident_report($1::uuid)`, [incident]))).toMatch(/site admin/);
		expect(await as<Json>(admin, `public.armory_app_incident_report($1::uuid)`, [randomUUID()])).toMatchObject({ ok: false, reason: 'not_found' });
	});
});

describe('the report box against spam', () => {
	test('junk is kept and marked spam; a real report stays new (control)', async () => {
		const junk = await report(carla, 'hi');
		expect(junk.status).toBe('spam');
		expect(junk.meta.auto_spam).toBe('greeting_or_test');
		expect((await report(carla, 'a')).meta.auto_spam).toBe('too_short');
		const real = await report(carla, 'The Shop Fix save button does nothing when I press it');
		expect(real.status).toBe('new');
		expect(real.meta.auto_spam).toBeUndefined();
	});
	test('the same words twice in a day is a repeat', async () => {
		await ageAll(30);
		const again = await report(carla, 'The Shop Fix save button does nothing when I press it!');
		expect(again).toMatchObject({ status: 'spam', meta: { auto_spam: 'repeat' } });
	});
	test('a fifth report inside two minutes is refused in words; nothing is dropped', async () => {
		await ageAll(30);
		const before = await n(`select count(*) as n from public.app_feedback where user_id = $1`, [dev.id]);
		for (const m of ['One thing broke', 'Second thing broke', 'Third thing broke', 'Fourth thing broke']) expect((await report(dev, m)).status).toBe('new');
		expect(await refusal(report(dev, 'Fifth thing broke'))).toBe('feedback_slow_down');
		expect(await n(`select count(*) as n from public.app_feedback where user_id = $1`, [dev.id])).toBe(before + 4);
		// The window passes and the next report lands.
		await ageAll(5);
		expect((await report(dev, 'Fifth thing broke')).status).toBe('new');
	});
	test('an admin is never shaped or judged', async () => {
		for (let i = 0; i < 6; i++) expect((await report(admin, 'hi')).status).toBe('new');
	});
	test('the server stamps the evidence; what the client sent under that key is replaced', async () => {
		await db.sql(`create table if not exists auth.sessions (id uuid primary key, user_id uuid, created_at timestamptz, user_agent text)`);
		const session = randomUUID();
		await db.sql(`insert into auth.sessions (id, user_id, created_at, user_agent) values ($1, $2, now() - interval '9 hours', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130')`, [session, leo.id]);
		await ageAll(30);
		const r = await report(leo, 'The coin page chart is blank on my laptop', { evidence: { session_started: '1999-01-01' } }, { session_id: session });
		const ev = r.meta.evidence as Json;
		expect(ev.session_id).toBe(session);
		expect(String(ev.session_started)).not.toContain('1999');
		expect(String(ev.user_agent)).toContain('Windows');
		expect(typeof ev.seconds_since_previous).toBe('number');
	});
});

describe('the fine prompt', () => {
	test('lists open spam from students with the device evidence, and nothing from staff', async () => {
		const r = await as<Json>(admin, 'public.app_feedback_spam_review(14)');
		const rows = r.reports as Json[];
		const ids = rows.map((x) => x.id);
		expect(ids).toEqual(expect.arrayContaining([anaReports[0], anaReports[1], leoReports[0]]));
		expect(rows.every((x) => x.user_id !== admin.id)).toBe(true);
		expect((r.device_accounts as Json)['lab-pc-7']).toBe(2);
		expect(await refusal(as(ana, 'public.app_feedback_spam_review(14)'))).toMatch(/site admin/);
	});
	test('one tap fines one account, as a system fine the student can dispute', async () => {
		const ledger = await n(`select count(*) as n from public.coin_transactions`);
		const r = await as<Json>(admin, `public.app_feedback_spam_fine($1::uuid[], 5, null)`, [[anaReports[0], anaReports[1]]]);
		expect(r).toMatchObject({ ok: true, amount: 5, reports: 2 });
		const t = (await db.sql<{ student_email: string; amount: string; category_id: string; actor_email: string }>(`select student_email, amount::text, category_id, actor_email from public.coin_transactions where id = $1`, [r.transaction_id])).rows[0];
		expect(t).toEqual({ student_email: 'ana@boscotech.net', amount: '-5.00', category_id: 'feedback_spam', actor_email: 'system' });
		expect(await n(`select count(*) as n from public.coin_transactions`)).toBe(ledger + 1);
		const dispute = await as<Json>(ana, `public.coin_dispute_fine($1::uuid, 'Someone used my account on the lab computer.')`, [r.transaction_id]);
		expect(dispute.ok).toBe(true);
	});
	test('the same reports cannot be fined twice, and two accounts are never fined as one', async () => {
		const ledger = await n(`select count(*) as n from public.coin_transactions`);
		expect(await as<Json>(admin, `public.app_feedback_spam_fine($1::uuid[], 1, null)`, [[anaReports[0]]])).toMatchObject({ ok: false, reason: 'not_open_spam' });
		await as(admin, `public.app_feedback_set_status_many($1::uuid[], 'spam')`, [[anaReports[3]]]);
		expect(await as<Json>(admin, `public.app_feedback_spam_fine($1::uuid[], 1, null)`, [[anaReports[3], leoReports[0]]])).toMatchObject({ ok: false, reason: 'more_than_one_account' });
		expect(await as<Json>(admin, `public.app_feedback_spam_fine($1::uuid[], 1, null)`, [[anaReports[2]]])).toMatchObject({ ok: false, reason: 'not_open_spam' });
		expect(await as<Json>(admin, `public.app_feedback_spam_fine($1::uuid[], 0, null)`, [[anaReports[3]]])).toMatchObject({ ok: false, reason: 'amount' });
		expect(await n(`select count(*) as n from public.coin_transactions`)).toBe(ledger);
		expect(await refusal(as(ana, `public.app_feedback_spam_fine($1::uuid[], 1, null)`, [[leoReports[0]]]))).toMatch(/coin admin/);
	});
	test('dismiss records no fine and takes the reports off the prompt', async () => {
		const ledger = await n(`select count(*) as n from public.coin_transactions`);
		expect(await as<Json>(admin, `public.app_feedback_spam_dismiss($1::uuid[])`, [[leoReports[0]]])).toMatchObject({ ok: true, dismissed: 1 });
		expect(await n(`select count(*) as n from public.coin_transactions`)).toBe(ledger);
		const ids = ((await as<Json>(admin, 'public.app_feedback_spam_review(14)')).reports as Json[]).map((x) => x.id);
		expect(ids).not.toContain(leoReports[0]);
		expect(ids).toContain(anaReports[3]);
	});
});

describe('the reward', () => {
	test('pays the reporter what he sets, 1 to 10, once, and marks the report resolved', async () => {
		expect(await as<Json>(admin, `public.app_feedback_reward($1::uuid, 11)`, [leoReports[1]])).toMatchObject({ ok: false, reason: 'amount' });
		expect(await as<Json>(admin, `public.app_feedback_reward($1::uuid, 0)`, [leoReports[1]])).toMatchObject({ ok: false, reason: 'amount' });
		const r = await as<Json>(admin, `public.app_feedback_reward($1::uuid, 3)`, [leoReports[1]]);
		expect(r).toMatchObject({ ok: true, amount: 3 });
		const t = (await db.sql<{ student_email: string; amount: string; category_id: string }>(`select student_email, amount::text, category_id from public.coin_transactions where id = $1`, [r.transaction_id])).rows[0];
		expect(t).toEqual({ student_email: 'leo@boscotech.net', amount: '3.00', category_id: 'feedback_reward' });
		expect(await statusOf(leoReports[1])).toBe('resolved');
		expect(await as<Json>(admin, `public.app_feedback_reward($1::uuid, 3)`, [leoReports[1]])).toMatchObject({ ok: false, reason: 'already_rewarded' });
		expect((await as<Json[]>(admin, 'public.app_feedback_rewards_list()')).map((x) => x.report_id)).toEqual([leoReports[1]]);
	});
	test('never to staff, never without an admin', async () => {
		const mine = (await report(admin, 'An idea for the console')).id;
		expect(await as<Json>(admin, `public.app_feedback_reward($1::uuid, 2)`, [mine])).toMatchObject({ ok: false, reason: 'not_a_student' });
		expect(await refusal(as(leo, `public.app_feedback_reward($1::uuid, 10)`, [anaReports[2]]))).toMatch(/coin admin/);
	});
});

describe('grants', () => {
	test('no new function is open to anon, and the helpers are open to no client', async () => {
		const open = (await db.sql<{ f: string }>(`
			select p.oid::regprocedure::text as f from pg_proc p
			where p.pronamespace = 'public'::regnamespace
			  and (p.proname like 'app_feedback%' or p.proname like 'armory_app_%' or p.proname like '_feedback_%' or p.proname = '_app_feedback_spam_guard')
			  and has_function_privilege('anon', p.oid, 'execute')`)).rows.map((r) => r.f);
		expect(open.filter((f) => /many|restore|incident_report|spam|reward|_feedback_|guard/.test(f))).toEqual([]);
	});
});
