// tests/db/armory-v3-reports.test.ts
//
// THE WINDOWS APP'S FEEDBACK AND INCIDENTS (IDEA Armory v0.3 items 4 and 4b,
// migration 0233 part armory-reports), on the whole chain.
//
// What is held here, and why each is silent when wrong:
//   - ONLY A SITE ADMIN READS A ROW. A note or an incident carries a student's
//     address, device name and log lines. RLS is the boundary: the admin reads
//     every row, the submitter and every other student read none.
//   - THE SUBMIT FUNCTIONS TAKE NO IDENTITY PARAMETER, so a student can only
//     file as themselves; the address stored is the caller's own.
//   - THE LIMITS ARE THE CONTRACT THE APP CODES AGAINST: 22023 with a DETAIL
//     reason for bad input (too_large carries the limit and the size), PT429
//     with the limit and the window for a rate limit. Never 54000.
//   - AN INCIDENT LIVES 90 DAYS: deleted by the next submit, and hidden from
//     the console's list even before one arrives. The list NEVER carries the
//     report (up to 1 MiB a row); report_bytes is its positive control.
//   - AN INCIDENT NAMES ONLY ITS OWN REPORTER'S NOTE, enforced by a composite
//     key, so even a raw insert cannot route around the function.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { PRE_0233, SQL_0233, canExecute, overloads, tablePrivileges } from './chain-0233';
import { armoryRpc, makeAdmin, person, type Refusal } from './armory-v3-helpers';

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let admin: SeededUser;
let admin2: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let mixed: SeededUser;
let project: string;

const FEEDBACK = 'select public.armory_submit_app_feedback($1, $2, $3, $4, $5::jsonb) as id';
const INCIDENT = 'select public.armory_submit_app_incident($1, $2, $3, $4, $5, $6::jsonb, $7) as id';
const note = (u: SeededUser, body = 'It froze on save', extra: Partial<{ kind: string; version: string; device: string | null; context: unknown }> = {}) =>
	api.one<{ id: string }>(u, FEEDBACK, [extra.kind ?? 'bug', body, extra.version ?? '0.3.0', extra.device === undefined ? 'Lab PC 3' : extra.device, JSON.stringify(extra.context ?? { log: ['a', 'b'] })]);
const incident = (u: SeededUser, extra: Partial<{ kind: string; summary: string; project: string | null; report: unknown; feedback: string | null }> = {}) =>
	api.one<{ id: string }>(u, INCIDENT, [
		extra.kind ?? 'crash',
		extra.summary ?? 'The app closed',
		'0.3.0',
		'Lab PC 3',
		extra.project === undefined ? null : extra.project,
		JSON.stringify(extra.report ?? { stack: 'at Sync()' }),
		extra.feedback ?? null
	]);
const reason = (e: Refusal) => [e.code, JSON.parse(e.detail ?? '{}').reason];

beforeAll(async () => {
	db = await startTestDb(PRE_0233);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	admin2 = await person(db, 'tech@boscotech.edu', 'Tess Tech');
	await makeAdmin(db, admin2.email);
	ana = await person(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben@boscotech.net', 'Ben Ortiz', 'Benny');
	mixed = await createUser(db, 'Mixed.Case@BoscoTech.net', 'Max Case');
	project = await api.project(admin, 'Robot 2026');
	await db.sql(SQL_0233);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the grants', () => {
	test('both tables: RLS on, one admin read policy, select alone to authenticated, nothing to anon', async () => {
		for (const t of ['armory_app_feedback', 'armory_app_incidents']) {
			expect(await tablePrivileges(db, 'anon', t)).toEqual([]);
			expect(await tablePrivileges(db, 'authenticated', t)).toEqual(['select']);
			const { rows } = await db.sql<{ policyname: string; qual: string }>(`select policyname, qual from pg_policies where tablename = $1`, [t]);
			expect(rows).toHaveLength(1);
			expect(rows[0].qual).toMatch(/is_admin\(\)/);
		}
		await expect(db.asUser(ana.id, (q) => q(`insert into public.armory_app_feedback (email, app_version, kind, body) values ($1, '1', 'bug', 'x')`, [ana.email]))).rejects.toThrow(/permission denied/);
		await expect(db.asUser(admin.id, (q) => q(`update public.armory_app_incidents set status = 'seen'`))).rejects.toThrow(/permission denied/);
	});
	test('six functions, one overload each, authenticated only; the submit functions take no identity', async () => {
		const sigs = [
			'armory_submit_app_feedback(text, text, text, text, jsonb)',
			'armory_submit_app_incident(text, text, text, text, uuid, jsonb, uuid)',
			'armory_app_feedback_admin_list(integer)',
			'armory_app_incidents_admin_list(integer)',
			'armory_app_feedback_set_status(uuid, text)',
			'armory_app_incident_set_status(uuid, text)'
		];
		for (const s of sigs) {
			expect(await overloads(db, s.split('(')[0]), s).toBe(1);
			expect(await canExecute(db, 'anon', s), s).toBe(false);
			expect(await canExecute(db, 'authenticated', s), s).toBe(true);
		}
		const { rows } = await db.sql<{ proname: string; args: string[] }>(
			`select proname, proargnames as args from pg_proc where proname in ('armory_submit_app_feedback', 'armory_submit_app_incident') order by proname`
		);
		expect(rows).toEqual([
			{ proname: 'armory_submit_app_feedback', args: ['p_kind', 'p_body', 'p_app_version', 'p_device_name', 'p_context'] },
			{ proname: 'armory_submit_app_incident', args: ['p_kind', 'p_summary', 'p_app_version', 'p_device_name', 'p_project', 'p_report', 'p_feedback'] }
		]);
		await expect(db.asAnon((q) => q(FEEDBACK, ['bug', 'x', '1', null, '{}']))).rejects.toThrow(/permission denied/);
	});
});

// ===========================================================================
describe('a feedback note from the Windows app', () => {
	test("it is filed as the caller, trimmed, and the caller's own address lowercased", async () => {
		const id = (await note(mixed, '\n\t  The tree did not refresh  \n', { kind: ' IDEA ', device: `  ${'D'.repeat(150)}  ` })).id;
		const { rows } = await db.sql('select email, kind, body, device_name, app_version, status, context from public.armory_app_feedback where id = $1', [id]);
		expect(rows[0]).toEqual({
			email: 'mixed.case@boscotech.net', kind: 'idea', body: 'The tree did not refresh', device_name: 'D'.repeat(120),
			app_version: '0.3.0', status: 'new', context: { log: ['a', 'b'] }
		});
	});
	test('a null context is an empty object; a null device is no device', async () => {
		const id = (await api.one<{ id: string }>(ana, FEEDBACK, ['other', 'Hello', '0.3.0', null, null])).id;
		expect((await db.sql('select context, device_name from public.armory_app_feedback where id = $1', [id])).rows[0]).toEqual({ context: {}, device_name: null });
	});
	test('every refusal is 22023 with its reason', async () => {
		const bad = (params: unknown[]) => api.fails(ana, FEEDBACK, params);
		expect(reason(await bad(['praise', 'x', '1', null, '{}']))).toEqual(['22023', 'kind']);
		expect(reason(await bad(['bug', ' \n\t ', '1', null, '{}']))).toEqual(['22023', 'empty']);
		expect(reason(await bad(['bug', 'x'.repeat(8001), '1', null, '{}']))).toEqual(['22023', 'too_long']);
		expect(reason(await bad(['bug', 'x', '  ', null, '{}']))).toEqual(['22023', 'empty']);
		expect(reason(await bad(['bug', 'x', 'v'.repeat(65), null, '{}']))).toEqual(['22023', 'too_long']);
		expect(reason(await bad(['bug', 'x', '1', null, '[1, 2]']))).toEqual(['22023', 'not_object']);
		const big = await bad(['bug', 'x', '1', null, JSON.stringify({ log: 'y'.repeat(1_100_000) })]);
		expect(big.code).toBe('22023');
		const detail = JSON.parse(big.detail!);
		expect(detail).toMatchObject({ reason: 'too_large', field: 'context', limit: 1048576 });
		expect(detail.size).toBeGreaterThan(1048576);
		expect(await api.one<{ ok: boolean }>(ana, 'select public.armory_submit_app_feedback($1, $2, $3, null, null) is not null as ok', ['bug', 'x'.repeat(8000), '1'])).toEqual({ ok: true });
	});
	test('twenty an hour per account: the 21st is PT429 with the limit and the window; another account is untouched', async () => {
		const u = await person(db, 'busy@boscotech.net', 'Bea Busy');
		for (let i = 0; i < 20; i += 1) await note(u, `note ${i}`);
		const e = await api.fails(u, FEEDBACK, ['bug', 'one more', '0.3.0', null, '{}']);
		expect(e.code).toBe('PT429');
		const d = JSON.parse(e.detail!);
		expect(d).toMatchObject({ reason: 'rate_limited', limit: 20, window_seconds: 3600 });
		expect(d.retry_after_seconds).toBeGreaterThan(0);
		expect(d.retry_after_seconds).toBeLessThanOrEqual(3600);
		expect((await note(ben, 'mine still lands')).id).toMatch(/^[0-9a-f-]{36}$/);
		// An hour later the window is clear again.
		await db.sql(`update public.armory_app_feedback set created_at = now() - interval '61 minutes' where email = $1`, [u.email]);
		expect((await note(u, 'after the hour')).id).toMatch(/^[0-9a-f-]{36}$/);
	});
});

// ===========================================================================
describe('only a site admin reads a note', () => {
	test('the admin reads every row; the submitter and another student read none', async () => {
		const owner = (await db.sql<{ n: number }>('select count(*)::int as n from public.armory_app_feedback')).rows[0].n;
		expect(owner).toBeGreaterThan(20);
		const n = async (u: SeededUser) => (await api.one<{ n: number }>(u, 'select count(*)::int as n from public.armory_app_feedback')).n;
		expect(await n(admin)).toBe(owner);
		expect(await n(admin2)).toBe(owner);
		expect(await n(ana)).toBe(0);
		expect(await n(ben)).toBe(0);
	});
	test("the console's list: newest first, the shown name, a limit, and no one else's door", async () => {
		const list = (await api.one<{ l: Array<Record<string, unknown>> }>(admin2, 'select public.armory_app_feedback_admin_list(5) as l')).l;
		expect(list).toHaveLength(5);
		const times = list.map((r) => Date.parse(r.created_at as string));
		expect([...times].sort((a, b) => b - a)).toEqual(times);
		expect(Object.keys(list[0]).sort()).toEqual(
			['app_version', 'body', 'context', 'created_at', 'device_name', 'email', 'id', 'kind', 'reviewed_at', 'reviewed_by', 'status', 'submitter_name'].sort()
		);
		const all = (await api.one<{ l: Array<{ email: string; submitter_name: string | null }> }>(admin2, 'select public.armory_app_feedback_admin_list(1000) as l')).l;
		expect(all.find((r) => r.email === ben.email)!.submitter_name).toBe('Benny');
		expect(all.find((r) => r.email === ana.email)!.submitter_name).toBe('Ana Reyes');
		const e = await api.fails(ana, 'select public.armory_app_feedback_admin_list(10)');
		expect([e.code, e.message]).toEqual(['42501', 'Only a site admin can read Armory feedback.']);
	});
	test('status moves: admin only, stamped, never a delete', async () => {
		const id = (await note(ana, 'triage me')).id;
		const r = (await api.one<{ r: unknown }>(admin2, `select public.armory_app_feedback_set_status($1, 'Spam') as r`, [id])).r;
		expect(r).toEqual({ ok: true, id, status: 'spam' });
		const row = (await db.sql('select status, reviewed_by, reviewed_at is not null as stamped from public.armory_app_feedback where id = $1', [id])).rows[0];
		expect(row).toEqual({ status: 'spam', reviewed_by: admin2.email, stamped: true });
		expect((await api.fails(ana, `select public.armory_app_feedback_set_status($1, 'seen')`, [id])).code).toBe('42501');
		expect((await api.fails(admin2, `select public.armory_app_feedback_set_status($1, 'deleted')`, [id])).code).toBe('22023');
		expect((await api.fails(admin2, `select public.armory_app_feedback_set_status($1, 'seen')`, [randomUUID()])).code).toBe('P0002');
	});
});

// ===========================================================================
describe('an incident from the Windows app', () => {
	test('it is filed as the caller with its report; a project label is kept when the project exists, dropped when not', async () => {
		const id = (await incident(ana, { kind: 'repairedCheckout', project })).id;
		const ghost = (await incident(ana, { kind: 'slow-pass_2', project: randomUUID() })).id;
		const { rows } = await db.sql<{ id: string; email: string; kind: string; project_id: string | null; report: unknown }>(
			'select id, email, kind, project_id, report from public.armory_app_incidents where id = any($1::uuid[]) order by created_at, id', [[id, ghost]]
		);
		expect(rows.find((r) => r.id === id)).toMatchObject({ email: ana.email, kind: 'repairedCheckout', project_id: project, report: { stack: 'at Sync()' } });
		expect(rows.find((r) => r.id === ghost)).toMatchObject({ kind: 'slow-pass_2', project_id: null });
	});
	test('every refusal is 22023 with its reason', async () => {
		const bad = (params: unknown[]) => api.fails(ana, INCIDENT, params);
		expect(reason(await bad(['not a word', 's', '1', null, null, '{}', null]))).toEqual(['22023', 'kind']);
		expect(reason(await bad(['1crash', 's', '1', null, null, '{}', null]))).toEqual(['22023', 'kind']);
		expect(reason(await bad(['crash', '   ', '1', null, null, '{}', null]))).toEqual(['22023', 'empty']);
		expect(reason(await bad(['crash', 's'.repeat(501), '1', null, null, '{}', null]))).toEqual(['22023', 'too_long']);
		expect(reason(await bad(['crash', 's', '', null, null, '{}', null]))).toEqual(['22023', 'empty']);
		expect(reason(await bad(['crash', 's', '1', null, null, '"text"', null]))).toEqual(['22023', 'not_object']);
	});
	test('a report of exactly 1 MiB is accepted and one byte more is refused with the limit and the size', async () => {
		const sizeOf = async (n: number) => (await db.sql<{ s: number }>(`select pg_column_size(jsonb_build_object('log', repeat('x', $1::int))) as s`, [n])).rows[0].s;
		const base = 1_048_576 - 64;
		const n = base + (1_048_576 - (await sizeOf(base)));
		expect(await sizeOf(n)).toBe(1_048_576);
		const u = await person(db, 'big@boscotech.net', 'Bo Big');
		expect((await incident(u, { report: { log: 'x'.repeat(n) } })).id).toMatch(/^[0-9a-f-]{36}$/);
		const e = await api.fails(u, INCIDENT, ['crash', 's', '1', null, null, JSON.stringify({ log: 'x'.repeat(n + 1) }), null]);
		expect(e.code).toBe('22023');
		expect(JSON.parse(e.detail!)).toEqual({ reason: 'too_large', field: 'report', limit: 1048576, size: 1048577 });
	});
	test("an incident may name only its reporter's own note; the composite key holds even with RLS out of the way", async () => {
		const mine = (await note(ana, 'see the incident')).id;
		const theirs = (await note(ben, 'mine')).id;
		const ok = (await incident(ana, { feedback: mine })).id;
		expect((await db.sql('select feedback_id from public.armory_app_incidents where id = $1', [ok])).rows[0].feedback_id).toBe(mine);
		const e1 = await api.fails(ana, INCIDENT, ['crash', 's', '1', null, null, '{}', theirs]);
		const e2 = await api.fails(ana, INCIDENT, ['crash', 's', '1', null, null, '{}', randomUUID()]);
		expect(reason(e1)).toEqual(['22023', 'feedback_not_found']);
		expect([e2.code, e2.message, e2.detail]).toEqual([e1.code, e1.message, e1.detail]); // not found and not yours answer identically
		await expect(
			db.sql(`insert into public.armory_app_incidents (email, app_version, kind, summary, feedback_id) values ($1, '1', 'crash', 's', $2)`, [ana.email, theirs])
		).rejects.toMatchObject({ code: '23503' });
	});
	test('thirty an hour per account, then PT429 with limit 30', async () => {
		const u = await person(db, 'crashy@boscotech.net', 'Cris Crashy');
		for (let i = 0; i < 30; i += 1) await incident(u, { summary: `crash ${i}` });
		const e = await api.fails(u, INCIDENT, ['crash', 'one more', '1', null, null, '{}', null]);
		expect(e.code).toBe('PT429');
		expect(JSON.parse(e.detail!)).toMatchObject({ reason: 'rate_limited', limit: 30, window_seconds: 3600 });
	});
	test('an incident lives 90 days: hidden from the list at once, deleted by the next submit; 89 days stays', async () => {
		const old = (await incident(ben, { summary: 'ninety-one days old' })).id;
		const kept = (await incident(ben, { summary: 'eighty-nine days old' })).id;
		await db.sql(`update public.armory_app_incidents set created_at = now() - interval '91 days' where id = $1`, [old]);
		await db.sql(`update public.armory_app_incidents set created_at = now() - interval '89 days' where id = $1`, [kept]);
		const ids = async () => ((await api.one<{ l: Array<{ id: string }> }>(admin2, 'select public.armory_app_incidents_admin_list(1000) as l')).l).map((r) => r.id);
		expect(await ids()).not.toContain(old);
		expect(await ids()).toContain(kept);
		expect((await db.sql('select 1 from public.armory_app_incidents where id = $1', [old])).rows).toHaveLength(1);
		await incident(ana, { summary: 'any submit prunes' });
		expect((await db.sql('select 1 from public.armory_app_incidents where id = $1', [old])).rows).toHaveLength(0);
		expect((await db.sql('select 1 from public.armory_app_incidents where id = $1', [kept])).rows).toHaveLength(1);
	});
});

// ===========================================================================
describe('only a site admin reads an incident', () => {
	test('the admin reads every row and the full report by id; students read none', async () => {
		const owner = (await db.sql<{ n: number }>('select count(*)::int as n from public.armory_app_incidents')).rows[0].n;
		expect(owner).toBeGreaterThan(30);
		const n = async (u: SeededUser) => (await api.one<{ n: number }>(u, 'select count(*)::int as n from public.armory_app_incidents')).n;
		expect(await n(admin2)).toBe(owner);
		expect(await n(ana)).toBe(0);
		expect(await n(ben)).toBe(0);
		const one = (await db.sql<{ id: string }>(`select id from public.armory_app_incidents where kind = 'repairedCheckout'`)).rows[0].id;
		const read = await api.rows<{ id: string; report: unknown }>(admin2, 'select id, report from public.armory_app_incidents where id = any($1::uuid[])', [[one]]);
		expect(read).toEqual([{ id: one, report: { stack: 'at Sync()' } }]);
	});
	test("the console's list never carries the report; it carries its size, the project's name and the linked note", async () => {
		const list = (await api.one<{ l: Array<Record<string, unknown>> }>(admin2, 'select public.armory_app_incidents_admin_list(1000) as l')).l;
		expect(list.length).toBeGreaterThan(30);
		expect(list.every((r) => !('report' in r))).toBe(true);
		expect(list.every((r) => typeof r.report_bytes === 'number' && (r.report_bytes as number) > 0)).toBe(true);
		expect(Object.keys(list[0]).sort()).toEqual(
			['app_version', 'created_at', 'device_name', 'email', 'feedback_body', 'feedback_id', 'id', 'kind', 'project_id', 'project_name',
				'report_bytes', 'reviewed_at', 'reviewed_by', 'status', 'submitter_name', 'summary'].sort()
		);
		expect(list.find((r) => r.kind === 'repairedCheckout')).toMatchObject({ project_name: 'Robot 2026', submitter_name: 'Ana Reyes' });
		expect(list.find((r) => r.feedback_id !== null)).toMatchObject({ feedback_body: 'see the incident' });
		const big = list.find((r) => r.email === 'big@boscotech.net')!;
		expect(big.report_bytes).toBe(1_048_576); // the size sent, not the compressed size stored
		const e = await api.fails(ben, 'select public.armory_app_incidents_admin_list(10)');
		expect([e.code, e.message]).toEqual(['42501', 'Only a site admin can read Armory incidents.']);
	});
	test('status moves: admin only, stamped', async () => {
		const id = (await incident(ana, { summary: 'triage' })).id;
		expect((await api.one<{ r: unknown }>(admin2, `select public.armory_app_incident_set_status($1, 'resolved') as r`, [id])).r).toEqual({ ok: true, id, status: 'resolved' });
		expect((await db.sql('select reviewed_by from public.armory_app_incidents where id = $1', [id])).rows[0].reviewed_by).toBe(admin2.email);
		expect((await api.fails(ana, `select public.armory_app_incident_set_status($1, 'seen')`, [id])).code).toBe('42501');
		expect((await api.fails(admin2, `select public.armory_app_incident_set_status($1, 'gone')`, [id])).code).toBe('22023');
	});
});
