// tests/db/cert-0264-ops.test.ts
//
// 0264, OPERATIONS, on the whole tree with the five cert files applied. What
// would fail silently:
//
//   - the frc-app mirror snapshot drifting off its contract's exact keys, or
//     carrying a draft, or storing "expired" instead of deriving it;
//   - a job function (sweep, reminders, flush) answering a student, or the
//     flush's address-bearing read answering anyone but the service role;
//   - an expiry reminder sent twice, or sent for an award with no expiry;
//   - a dormant sweep touching anything but an idle ACTIVE attempt;
//   - telemetry or an export reaching past the caller's own certifications,
//     or the audit and error exports answering a certifier who is not an admin.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	CERT_FILES, WITH_CERT, certSql, pasteTrap, catalogFingerprint, procCount, tableSurface,
	rpcAs, rpcAnon, rpcService, seedPeople, samplePackage, publishSample, earnUpToAward, awardAttempt, VIDEO_KEY,
	type CertPeople, type Json, type SampleCert
} from './cert-chain';

const FILE = CERT_FILES[4];
const SQL = certSql(FILE);

const TABLES = ['cert_sync_log', 'cert_errors'];
/** Admin or service role. */
const JOB_FUNCTIONS = [
	'cert_mirror_snapshot()', 'cert_sync_log_write(jsonb)', 'cert_error_log(text, text, jsonb, text)', 'cert_sweep_dormant()',
	'cert_expiry_reminders()', 'cert_notifications_mark_sent(uuid[], text)'
];
/** Signed in only. */
const DESK_FUNCTIONS = ['cert_sync_log_list(integer)', 'cert_telemetry()', 'cert_export(text, timestamptz, timestamptz)'];
const SERVICE_ONLY = 'cert_notifications_unsent(integer)';
const PRIVATE_FUNCTIONS = ['_cert_ops_caller_ok()', '_cert_scope()'];

/** docs/IDEA_CERTIFICATIONS_SYNC.md, read character for character. */
const SNAPSHOT_KEYS = ['catalog', 'holders', 'source_revision'];
const CATALOG_KEYS = ['active', 'allows', 'category', 'code', 'definition', 'does_not_allow', 'level', 'name', 'prerequisites', 'renewal', 'sort_order'];
const HOLDER_KEYS = ['awarded_at', 'awarded_by_name', 'code', 'email', 'expires_at', 'holder_name', 'serial', 'status'];
const TELEMETRY_KEYS = [
	'active_by_certification', 'completion_days', 'exam_topics', 'most_missed_topics', 'pass_rates', 'pending', 'stalled',
	'time_per_part_hours', 'watch_sessions_30d', 'withdrawals_30d'
];
const EXPORT_KINDS = ['events', 'audit', 'sync', 'errors', 'attempts', 'awards', 'exams', 'watch', 'practice', 'notifications'];
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const WEEKDAY = /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/;

let db: TestDb;
let people: CertPeople;
let safe: SampleCert;
let year: SampleCert;
let millOnly: SeededUser;
let anaSerial: string;
let benSafeSerial: string;
let benYearSerial: string;
let benYearAwardId: string;
let bystanderAttempt: string;
/** The school-year expiry the settings carry, YYYY-MM-DD, twenty days out. */
let expiryDate: string;
let expiryWords: string;

const rpc = <T = Json>(user: SeededUser, call: string, params: unknown[] = []) => rpcAs<T>(db, user, call, params);
const svc = <T = Json>(call: string, params: unknown[] = []) => rpcService<T>(db, call, params);

async function count(sql: string, params: unknown[] = []): Promise<number> {
	return (await db.sql<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).rows[0].n;
}

beforeAll(async () => {
	expect(FILE).toMatch(/^0264_/);
	db = await startTestDb(WITH_CERT);
	people = await seedPeople(db);
	safe = await publishSample(db, people, 'SAFE-1');
	year = await publishSample(db, people, 'YEAR-1', { overrides: { renewal: 'school_year', sort_order: 30, prerequisites: ['SAFE-1'] } });
	millOnly = await createUser(db, 'millonly@boscotech.edu', 'Mill Only');
	const mill = await publishSample(db, people, 'MILL-1', { overrides: { category: 'Machining', sort_order: 20 }, grant: false });
	await rpc(people.admin, 'public.cert_authority_grant($1::uuid, $2, null)', [mill.id, millOnly.email]);
	const retired = await publishSample(db, people, 'RET-1', { overrides: { sort_order: 40 } });
	const ret = await rpc(people.admin, 'public.cert_admin_retire($1::uuid)', [retired.id]);
	expect(ret.ok, JSON.stringify(ret)).toBe(true);
	const draft = await rpc(people.admin, 'public.cert_admin_save(null, $1::jsonb, $2)', [JSON.stringify(samplePackage('DRAFT-1', { sort_order: 50 })), 'draft']);
	expect(draft.ok, JSON.stringify(draft)).toBe(true);
	expiryDate = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
	expiryWords = new Date(`${expiryDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
	const set = await rpc(people.admin, 'public.cert_settings_set($1::jsonb)', [JSON.stringify({ school_year_expiry: expiryDate })]);
	expect(set.ok, JSON.stringify(set)).toBe(true);
	// Ana earns SAFE-1; Ben earns SAFE-1 and then YEAR-1 (which requires it).
	anaSerial = ((await awardAttempt(db, people, (await earnUpToAward(db, people, people.ana, safe)).attemptId, 'ana-safe')).award as Json).serial as string;
	benSafeSerial = ((await awardAttempt(db, people, (await earnUpToAward(db, people, people.ben, safe)).attemptId, 'ben-safe')).award as Json).serial as string;
	const benYear = (await awardAttempt(db, people, (await earnUpToAward(db, people, people.ben, year)).attemptId, 'ben-year')).award as Json;
	benYearSerial = benYear.serial as string;
	benYearAwardId = benYear.id as string;
	// The bystander starts SAFE-1 and goes quiet.
	const started = await rpc(people.bystander, `public.cert_start('SAFE-1')`);
	expect(started.ok, JSON.stringify(started)).toBe(true);
	bystanderAttempt = (started.attempt as Json).id as string;
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the file', () => {
	test('no paste trap; the apply tool sends it; the first object is the cert_sync_log table; undo names everything', () => {
		expect(pasteTrap(SQL)).toEqual([]);
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.statements).toBeGreaterThan(30);
		expect(SQL.indexOf('create table if not exists public.cert_sync_log')).toBeLessThan(SQL.indexOf('create table if not exists public.cert_errors'));
		expect(SQL.indexOf('create table if not exists public.cert_sync_log')).toBeLessThan(SQL.indexOf('create or replace function'));
		for (const t of TABLES) expect(SQL).toContain(`drop table if exists public.${t};`);
		for (const f of [...JOB_FUNCTIONS, ...DESK_FUNCTIONS, SERVICE_ONLY, ...PRIVATE_FUNCTIONS]) {
			expect(SQL, f).toContain(`drop function if exists public.${f};`);
		}
		expect(SQL).not.toMatch(/—/);
	});

	test('one row per function; grants exactly per contract row; RLS on both tables with no client privilege; re-apply changes nothing', async () => {
		for (const f of [...JOB_FUNCTIONS, ...DESK_FUNCTIONS, SERVICE_ONLY, ...PRIVATE_FUNCTIONS]) {
			expect(await procCount(db, f.replace(/\(.*$/, '')), f).toBe(1);
		}
		for (const t of TABLES) {
			expect(await tableSurface(db, t), t).toEqual({ rls: true, grants: [] });
			const { rows } = await db.sql<{ anon: boolean; auth: boolean }>(
				`select has_sequence_privilege('anon', $1, 'usage,select,update') as anon, has_sequence_privilege('authenticated', $1, 'usage,select,update') as auth`,
				[`public.${t}_id_seq`]
			);
			expect(rows[0], t).toEqual({ anon: false, auth: false });
		}
		expect(await count(`pg_policies where schemaname = 'public' and tablename = any($1::text[])`, [TABLES])).toBe(0);
		const grants = async (f: string) => (await db.sql<{ anon: boolean; auth: boolean; svc: boolean }>(
			`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth,
			        has_function_privilege('service_role', $1, 'execute') as svc`,
			[`public.${f}`]
		)).rows[0];
		for (const f of JOB_FUNCTIONS) expect(await grants(f), f).toEqual({ anon: false, auth: true, svc: true });
		for (const f of DESK_FUNCTIONS) expect(await grants(f), f).toEqual({ anon: false, auth: true, svc: false });
		expect(await grants(SERVICE_ONLY)).toEqual({ anon: false, auth: false, svc: true });
		for (const f of PRIVATE_FUNCTIONS) expect(await grants(f), f).toEqual({ anon: false, auth: false, svc: false });
		// anon is refused everything here by permission, not by a refusal object.
		for (const call of [
			'public.cert_mirror_snapshot()', `public.cert_sync_log_write('{"trigger":"manual","ok":true}'::jsonb)`, 'public.cert_sync_log_list(10)',
			`public.cert_error_log('x', 'y', '{}'::jsonb, null)`, 'public.cert_sweep_dormant()', 'public.cert_expiry_reminders()',
			'public.cert_notifications_unsent(10)', `public.cert_notifications_mark_sent('{}'::uuid[], 'email')`, 'public.cert_telemetry()',
			`public.cert_export('events', null, null)`
		]) {
			await expect(rpcAnon(db, call), call).rejects.toThrow(/permission denied/);
		}
		for (const t of TABLES) {
			await expect(db.asUser(people.admin.id, async (q) => q(`select * from public.${t}`)), t).rejects.toThrow(/permission denied/);
		}
		const before = await catalogFingerprint(db);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toEqual(before);
	});
});

// ===========================================================================
describe('the mirror snapshot', () => {
	test('exactly the contract’s keys, built the same for an admin and for the service role; drafts never; retired carries active false; renewal in words', async () => {
		const asAdmin = await rpc(people.admin, 'public.cert_mirror_snapshot()');
		const asService = await svc('public.cert_mirror_snapshot()');
		expect(asService).toEqual(asAdmin);
		expect(Object.keys(asAdmin).sort()).toEqual(SNAPSHOT_KEYS);
		expect(asAdmin.source_revision).toMatch(/^idea-certs-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
		const catalog = asAdmin.catalog as Json[];
		expect(catalog.map((c) => c.code)).toEqual(['MILL-1', 'SAFE-1', 'YEAR-1', 'RET-1']);
		for (const c of catalog) expect(Object.keys(c).sort(), c.code as string).toEqual(CATALOG_KEYS);
		expect(catalog.find((c) => c.code === 'SAFE-1')).toEqual({
			code: 'SAFE-1', name: 'Sample SAFE-1', level: 1, category: 'Safety', definition: 'Knows the rules.', allows: 'Working in the shop.',
			does_not_allow: 'Powered machines.', prerequisites: [], renewal: null, active: true, sort_order: 10
		});
		expect(catalog.find((c) => c.code === 'YEAR-1')).toMatchObject({ prerequisites: ['SAFE-1'], renewal: `Expires on ${expiryWords} each school year`, active: true, sort_order: 30 });
		expect(catalog.find((c) => c.code === 'RET-1')).toMatchObject({ active: false, sort_order: 40 });
		expect(catalog.find((c) => c.code === 'MILL-1')).toMatchObject({ category: 'Machining', active: true });
		expect(JSON.stringify(catalog)).not.toContain('DRAFT-1');
		const holders = asAdmin.holders as Json[];
		expect(holders).toHaveLength(3);
		for (const h of holders) {
			expect(Object.keys(h).sort(), h.serial as string).toEqual(HOLDER_KEYS);
			expect(h.awarded_at).toMatch(INSTANT);
			expect(h.status).toBe('active');
		}
		// Three awards inside one second tie on awarded_at and fall to the serial, so the set is what is pinned.
		expect(holders.map((h) => h.serial).sort()).toEqual([anaSerial, benSafeSerial, benYearSerial].sort());
		expect(holders.find((h) => h.serial === anaSerial)).toMatchObject({ email: people.ana.email, holder_name: 'Ana Reyes', code: 'SAFE-1', awarded_by_name: 'Cee Certifier', expires_at: null });
		expect(holders.find((h) => h.serial === benYearSerial)!.expires_at).toMatch(INSTANT);
		expect(JSON.stringify(asAdmin)).not.toMatch(WEEKDAY);
		// Not an admin: a certifier, a student and a stranger each read not found.
		expect(await rpc(people.certifier, 'public.cert_mirror_snapshot()')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(millOnly, 'public.cert_mirror_snapshot()')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, 'public.cert_mirror_snapshot()')).toMatchObject({ ok: false, reason: 'not_found' });
		// With no school-year date set, the renewal is said without one.
		await rpc(people.admin, `public.cert_settings_set('{"school_year_expiry": null}'::jsonb)`);
		const unset = await svc('public.cert_mirror_snapshot()');
		expect((unset.catalog as Json[]).find((c) => c.code === 'YEAR-1')!.renewal).toBe('Expires each school year');
		await rpc(people.admin, 'public.cert_settings_set($1::jsonb)', [JSON.stringify({ school_year_expiry: expiryDate })]);
	});
});

// ===========================================================================
describe('the sync log and the error log', () => {
	test('a sync row is written by the service role or an admin, validated, logged as an event, listed to any certifier newest first', async () => {
		const first = await svc('public.cert_sync_log_write($1::jsonb)', [JSON.stringify({ trigger: 'daily', ok: true, http_status: 200, catalog_count: 4, holder_count: 3, source_revision: 'idea-certs-x', duration_ms: 120, remote_log_id: 7 })]);
		expect(first).toMatchObject({ ok: true });
		expect(typeof first.id).toBe('number');
		const second = await rpc(people.admin, 'public.cert_sync_log_write($1::jsonb)', [JSON.stringify({ trigger: 'manual', ok: false, http_status: 503, error: ' upstream down ', duration_ms: 'slow' })]);
		expect(second.ok).toBe(true);
		await expect(svc(`public.cert_sync_log_write('{"trigger": "weekly", "ok": true}'::jsonb)`)).rejects.toThrow(/trigger/);
		await expect(svc(`public.cert_sync_log_write('{"trigger": "daily"}'::jsonb)`)).rejects.toThrow(/ok/);
		await expect(svc(`public.cert_sync_log_write('[]'::jsonb)`)).rejects.toThrow(/object/);
		expect(await rpc(people.certifier, `public.cert_sync_log_write('{"trigger": "manual", "ok": true}'::jsonb)`)).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, `public.cert_sync_log_write('{"trigger": "manual", "ok": true}'::jsonb)`)).toMatchObject({ ok: false, reason: 'not_found' });
		const listed = await rpc<Json[]>(people.certifier, 'public.cert_sync_log_list(50)');
		expect(listed).toHaveLength(2);
		expect(listed[0]).toMatchObject({ id: second.id, trigger: 'manual', ok: false, http_status: 503, error: 'upstream down', duration_ms: null, catalog_count: null });
		expect(listed[1]).toMatchObject({ id: first.id, trigger: 'daily', ok: true, http_status: 200, catalog_count: 4, holder_count: 3, source_revision: 'idea-certs-x', duration_ms: 120, remote_log_id: 7, error: null });
		expect(await rpc<Json[]>(millOnly, 'public.cert_sync_log_list(1)')).toHaveLength(1);
		expect(await rpc(people.bystander, 'public.cert_sync_log_list(50)')).toMatchObject({ ok: false, reason: 'not_found' });
		await expect(svc('public.cert_sync_log_list(50)')).rejects.toThrow(/permission denied/);
		const { rows } = await db.sql<Json>(`select actor_email, reason, payload from public.cert_events where kind = 'sync.sent' order by id`);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ actor_email: null, reason: null, payload: { trigger: 'daily', ok: true, http_status: 200 } });
		expect(rows[1]).toMatchObject({ actor_email: people.admin.email, reason: 'upstream down' });
	});

	test('an error row is written by anyone signed in or the service role, never by anon, with where and message required and the detail kept only as an object', async () => {
		const a = await svc(`public.cert_error_log('award.commit', 'Signing failed', '{"status": 500}'::jsonb, 'corr-1')`);
		expect(a.ok).toBe(true);
		const b = await rpc(people.ana, `public.cert_error_log(' exam.open ', $1, '"not an object"'::jsonb, '')`, ['x'.repeat(5000)]);
		expect(b.ok).toBe(true);
		await expect(svc(`public.cert_error_log('', 'y', null, null)`)).rejects.toThrow(/where and message/);
		await expect(rpc(people.admin, `public.cert_error_log('x', '  ', null, null)`)).rejects.toThrow(/where and message/);
		const { rows } = await db.sql<Json>(`select where_, message, detail, correlation_id from public.cert_errors order by id`);
		expect(rows[0]).toEqual({ where_: 'award.commit', message: 'Signing failed', detail: { status: 500 }, correlation_id: 'corr-1' });
		expect(rows[1]).toMatchObject({ where_: 'exam.open', detail: {}, correlation_id: null });
		expect((rows[1].message as string).length).toBe(4000);
		const { rows: events } = await db.sql<Json>(`select actor_email, reason, payload ->> 'where' as w from public.cert_events where kind = 'error' order by id`);
		expect(events[0]).toEqual({ actor_email: null, reason: 'Signing failed', w: 'award.commit' });
		expect(events[1]).toMatchObject({ actor_email: people.ana.email, w: 'exam.open' });
	});
});

// ===========================================================================
describe('the jobs', () => {
	test('the dormant sweep marks only idle active attempts, once, and says how many; a certifier cannot run it', async () => {
		expect(await rpc(people.certifier, 'public.cert_sweep_dormant()')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.bystander, 'public.cert_sweep_dormant()')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await svc('public.cert_sweep_dormant()')).toEqual({ ok: true, marked: 0, dormancy_days: 60 });
		await db.sql(`update public.cert_attempts set last_activity_at = now() - interval '61 days' where id = $1`, [bystanderAttempt]);
		// A COMPLETE attempt that is just as old is never touched.
		await db.sql(`update public.cert_attempts set last_activity_at = now() - interval '61 days' where email = $1`, [people.ana.email]);
		expect(await svc('public.cert_sweep_dormant()')).toEqual({ ok: true, marked: 1, dormancy_days: 60 });
		expect(await rpc(people.admin, 'public.cert_sweep_dormant()')).toEqual({ ok: true, marked: 0, dormancy_days: 60 });
		const { rows } = await db.sql<Json>(`select state, dormant_at is not null as stamped from public.cert_attempts where id = $1`, [bystanderAttempt]);
		expect(rows[0]).toEqual({ state: 'dormant', stamped: true });
		expect((await db.sql<Json>(`select state from public.cert_attempts where email = $1`, [people.ana.email])).rows[0].state).toBe('complete');
		const { rows: events } = await db.sql<Json>(`select actor_email, subject_email, payload ->> 'dormancy_days' as days from public.cert_events where kind = 'attempt.dormant'`);
		expect(events).toEqual([{ actor_email: 'system', subject_email: people.bystander.email, days: '60' }]);
		// The student's own view says so, and any activity brings it back (0261's _cert_touch).
		const me = await rpc(people.bystander, 'public.cert_me()');
		expect((me.attempts as Json[])[0].state).toBe('dormant');
		await rpc(people.bystander, `public.cert_watch_report($1::uuid, $2, 10, '[[0, 10]]'::jsonb, 1, 0, 10)`, [safe.id, VIDEO_KEY]);
		expect((await db.sql<Json>(`select state from public.cert_attempts where id = $1`, [bystanderAttempt])).rows[0].state).toBe('active');
		// The settings decide the window: at 1 day the fresh activity is not idle, at 0 it is.
		await rpc(people.admin, `public.cert_settings_set('{"dormancy_days": 1}'::jsonb)`);
		expect(await svc('public.cert_sweep_dormant()')).toEqual({ ok: true, marked: 0, dormancy_days: 1 });
		await rpc(people.admin, `public.cert_settings_set('{"dormancy_days": 60}'::jsonb)`);
	});

	test('an expiry reminder goes once per award inside thirty days, never for an award with no expiry, and names the date in words', async () => {
		expect(await rpc(people.certifier, 'public.cert_expiry_reminders()')).toMatchObject({ ok: false, reason: 'not_found' });
		const first = await svc('public.cert_expiry_reminders()');
		expect(first).toMatchObject({ ok: true, count: 1 });
		const note = (first.notify as Json[])[0];
		expect(note).toMatchObject({ email: people.ben.email, kind: 'expiring', href: '/certifications/YEAR-1' });
		expect(note.body).toContain(`expires on ${expiryWords}.`);
		expect(note.body).not.toMatch(WEEKDAY);
		expect((note.payload as Json).serial).toBe(benYearSerial);
		expect(await svc('public.cert_expiry_reminders()')).toEqual({ ok: true, count: 0, notify: [] });
		expect(await rpc(people.admin, 'public.cert_expiry_reminders()')).toEqual({ ok: true, count: 0, notify: [] });
		expect(await count(`public.cert_events where kind = 'award.expiring'`)).toBe(1);
		expect(await count(`public.cert_notifications where kind = 'expiring'`)).toBe(1);
		// A suspended award is not reminded; an active one far out is not either.
		const anaAwardId = (await db.sql<{ id: string }>(`select id from public.cert_awards where serial = $1`, [anaSerial])).rows[0].id;
		await db.sql(`update public.cert_awards set expires_at = now() + interval '20 days' where id = $1`, [anaAwardId]);
		expect((await rpc(people.admin, `public.cert_award_action($1::uuid, 'suspend', 'Testing')`, [anaAwardId])).ok).toBe(true);
		expect(await svc('public.cert_expiry_reminders()')).toMatchObject({ count: 0 });
		expect((await rpc(people.admin, `public.cert_award_action($1::uuid, 'reinstate', 'Testing done')`, [anaAwardId])).ok).toBe(true);
		await db.sql(`update public.cert_awards set expires_at = now() + interval '45 days' where serial = $1`, [anaSerial]);
		expect(await svc('public.cert_expiry_reminders()')).toMatchObject({ count: 0 });
		await db.sql(`update public.cert_awards set expires_at = null where serial = $1`, [anaSerial]);
	});

	test('the flush reads unsent notifications older than ten minutes as the service role only, and marking sent is per channel', async () => {
		await expect(rpc(people.admin, 'public.cert_notifications_unsent(100)')).rejects.toThrow(/permission denied/);
		expect(await svc('public.cert_notifications_unsent(100)')).toEqual([]);
		const anaRows = await count(`public.cert_notifications where email = $1`, [people.ana.email]);
		expect(anaRows).toBeGreaterThan(2);
		await db.sql(`update public.cert_notifications set created_at = created_at - interval '11 minutes' where email = $1`, [people.ana.email]);
		const unsent = await svc<Json[]>('public.cert_notifications_unsent(100)');
		expect(unsent).toHaveLength(anaRows);
		for (const n of unsent) {
			expect(Object.keys(n).sort()).toEqual(['body', 'created_at', 'email', 'href', 'id', 'kind', 'payload', 'title', 'user_id']);
			expect(n.email).toBe(people.ana.email);
			expect(n.user_id).toBe(people.ana.id);
		}
		expect(await svc<Json[]>('public.cert_notifications_unsent(2)')).toHaveLength(2);
		const ids = unsent.map((n) => n.id as string);
		await expect(svc(`public.cert_notifications_mark_sent($1::uuid[], 'sms')`, [ids])).rejects.toThrow(/email or push/);
		// A student (or any bystander) cannot stamp; a certifier can, because the route they just ran emails from their own client (positive control on an empty set so the counts below hold).
		expect(await rpc(people.bystander, `public.cert_notifications_mark_sent($1::uuid[], 'email')`, [ids])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, `public.cert_notifications_mark_sent($1::uuid[], 'email')`, [ids])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.certifier, `public.cert_notifications_mark_sent('{}'::uuid[], 'email')`)).toEqual({ ok: true, marked: 0 });
		expect(await svc(`public.cert_notifications_mark_sent($1::uuid[], 'email')`, [ids.slice(0, 2)])).toEqual({ ok: true, marked: 2 });
		expect(await svc<Json[]>('public.cert_notifications_unsent(100)')).toHaveLength(anaRows - 2);
		expect(await rpc(people.admin, `public.cert_notifications_mark_sent($1::uuid[], 'email')`, [ids])).toEqual({ ok: true, marked: anaRows - 2 });
		expect(await svc<Json[]>('public.cert_notifications_unsent(100)')).toEqual([]);
		expect(await svc(`public.cert_notifications_mark_sent($1::uuid[], 'push')`, [ids])).toEqual({ ok: true, marked: anaRows });
		expect(await svc(`public.cert_notifications_mark_sent($1::uuid[], 'push')`, [ids])).toEqual({ ok: true, marked: 0 });
		expect(await svc(`public.cert_notifications_mark_sent(null, 'email')`)).toEqual({ ok: true, marked: 0 });
		expect(await count(`public.cert_notifications where email = $1 and emailed_at is not null and pushed_at is not null`, [people.ana.email])).toBe(anaRows);
	});
});

// ===========================================================================
describe('telemetry and exports', () => {
	test('telemetry carries every contract key, scoped to the caller’s certifications; a student reads not found', async () => {
		expect(await rpc(people.bystander, 'public.cert_telemetry()')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, 'public.cert_telemetry()')).toMatchObject({ ok: false, reason: 'not_found' });
		await expect(svc('public.cert_telemetry()')).rejects.toThrow(/permission denied/);
		const admin = await rpc(people.admin, 'public.cert_telemetry()');
		expect(Object.keys(admin).sort()).toEqual(TELEMETRY_KEYS);
		const active = admin.active_by_certification as Json[];
		expect(active.map((c) => c.code)).toEqual(['MILL-1', 'SAFE-1', 'YEAR-1', 'RET-1']);
		expect(active.find((c) => c.code === 'SAFE-1')).toEqual({ code: 'SAFE-1', name: 'Sample SAFE-1', active: 1, dormant: 0 });
		expect(admin.pass_rates).toEqual([
			{ code: 'SAFE-1', part: 'guided', passed: 2, failed: 0 }, { code: 'SAFE-1', part: 'exam', passed: 2, failed: 0 },
			{ code: 'SAFE-1', part: 'autonomous', passed: 2, failed: 0 }, { code: 'SAFE-1', part: 'checkout', passed: 2, failed: 0 },
			{ code: 'YEAR-1', part: 'guided', passed: 1, failed: 0 }, { code: 'YEAR-1', part: 'exam', passed: 1, failed: 0 },
			{ code: 'YEAR-1', part: 'autonomous', passed: 1, failed: 0 }, { code: 'YEAR-1', part: 'checkout', passed: 1, failed: 0 }
		]);
		expect(admin.completion_days).toEqual([{ code: 'SAFE-1', average: 0, count: 2 }, { code: 'YEAR-1', average: 0, count: 1 }]);
		expect(admin.pending).toEqual([{ kind: 'review', count: 0, oldest_wait_seconds: 0 }, { kind: 'request', count: 0, oldest_wait_seconds: 0 }]);
		expect((admin.exam_topics as Json[]).map((t) => `${t.code}:${t.topic}`).sort()).toEqual(['SAFE-1:ppe', 'SAFE-1:stops', 'YEAR-1:ppe', 'YEAR-1:stops']);
		expect((admin.exam_topics as Json[]).every((t) => t.correct === t.total)).toBe(true);
		expect(admin.most_missed_topics).toEqual([]);
		expect(admin.stalled).toEqual([]);
		expect(admin.withdrawals_30d).toBe(0);
		expect(admin.watch_sessions_30d).toBe(4);
		expect((admin.time_per_part_hours as Json[]).map((t) => `${t.code}:${t.part}`)).toEqual([
			'SAFE-1:training', 'SAFE-1:guided', 'SAFE-1:exam', 'SAFE-1:autonomous', 'SAFE-1:checkout',
			'YEAR-1:training', 'YEAR-1:guided', 'YEAR-1:exam', 'YEAR-1:autonomous', 'YEAR-1:checkout'
		]);
		expect(JSON.stringify(admin)).not.toContain('@');
		// The certifier holds SAFE-1, YEAR-1 and RET-1; the MILL-1 certifier sees MILL-1 and nothing that happened.
		const certifier = await rpc(people.certifier, 'public.cert_telemetry()');
		expect((certifier.active_by_certification as Json[]).map((c) => c.code)).toEqual(['SAFE-1', 'YEAR-1', 'RET-1']);
		expect(certifier.pass_rates).toEqual(admin.pass_rates);
		const mill = await rpc(millOnly, 'public.cert_telemetry()');
		expect((mill.active_by_certification as Json[]).map((c) => c.code)).toEqual(['MILL-1']);
		expect(mill).toMatchObject({ pass_rates: [], completion_days: [], exam_topics: [], stalled: [], withdrawals_30d: 0, watch_sessions_30d: 0 });
		// A stalled attempt appears with its idle days and the student's shown name.
		await db.sql(`update public.cert_attempts set last_activity_at = now() - interval '9 days' where id = $1`, [bystanderAttempt]);
		const stalled = (await rpc(people.certifier, 'public.cert_telemetry()')).stalled as Json[];
		expect(stalled).toEqual([{ attempt_id: bystanderAttempt, student_name: 'By Stander', code: 'SAFE-1', days_idle: 9 }]);
	});

	test('an export is one kind in one time range, scoped to the caller; audit and errors are an admin’s; an unknown kind raises', async () => {
		await expect(rpc(people.admin, `public.cert_export('everything', null, null)`)).rejects.toThrow(/unknown kind/);
		expect(await rpc(people.bystander, `public.cert_export('events', null, null)`)).toMatchObject({ ok: false, reason: 'not_found' });
		for (const kind of ['audit', 'errors']) {
			expect(await rpc(people.certifier, 'public.cert_export($1, null, null)', [kind]), kind).toMatchObject({ ok: false, reason: 'not_found' });
			const out = await rpc(people.admin, 'public.cert_export($1, null, null)', [kind]);
			expect(out, kind).toMatchObject({ ok: true, kind, from: null, to: null, truncated: false });
			expect(out.count, kind).toBeGreaterThan(0);
			expect((out.rows as Json[]).length).toBe(out.count);
		}
		for (const kind of EXPORT_KINDS) {
			const out = await rpc(people.admin, 'public.cert_export($1, null, null)', [kind]);
			expect(Object.keys(out).sort(), kind).toEqual(['count', 'from', 'kind', 'ok', 'rows', 'to', 'truncated']);
			expect(out.count, kind).toBe((out.rows as Json[]).length);
		}
		// Audit is the subset of events with a reason or an award, authority, catalog or settings action.
		const events = (await rpc(people.admin, `public.cert_export('events', null, null)`)).rows as Json[];
		const audit = (await rpc(people.admin, `public.cert_export('audit', null, null)`)).rows as Json[];
		expect(audit.length).toBeLessThan(events.length);
		expect(audit.every((r) => r.reason !== null || /^(award|authority|catalog|settings)\./.test(r.kind as string))).toBe(true);
		expect(events.length).toBe(await count('public.cert_events'));
		expect((await rpc(people.admin, `public.cert_export('errors', null, null)`)).count).toBe(await count('public.cert_errors'));
		// Scope: the certifier's events all name a certification they hold; the admin's include the sync rows that name none.
		expect(events.some((r) => r.certification_id === null)).toBe(true);
		const certEvents = (await rpc(people.certifier, `public.cert_export('events', null, null)`)).rows as Json[];
		expect(certEvents.length).toBeGreaterThan(0);
		expect(certEvents.every((r) => r.certification_id !== null)).toBe(true);
		expect(certEvents.length).toBeLessThan(events.length);
		expect((await rpc(people.admin, `public.cert_export('awards', null, null)`)).count).toBe(3);
		expect((await rpc(people.certifier, `public.cert_export('awards', null, null)`)).count).toBe(3);
		expect((await rpc(millOnly, `public.cert_export('awards', null, null)`)).count).toBe(0);
		const awards = (await rpc(people.certifier, `public.cert_export('awards', null, null)`)).rows as Json[];
		expect(awards.map((a) => a.serial).sort()).toEqual([anaSerial, benSafeSerial, benYearSerial].sort());
		expect(awards.find((a) => a.serial === anaSerial)).toMatchObject({ code: 'SAFE-1', email: people.ana.email, stored_status: 'active', status: 'valid' });
		expect((await rpc(people.certifier, `public.cert_export('attempts', null, null)`)).count).toBe(4);
		expect(((await rpc(people.certifier, `public.cert_export('attempts', null, null)`)).rows as Json[])[0]).toMatchObject({ code: 'SAFE-1', training: 'done', guided: 'done', exam: 'done', autonomous: 'done', checkout: 'done', state: 'complete' });
		expect((await rpc(people.certifier, `public.cert_export('exams', null, null)`)).count).toBe(3);
		expect(((await rpc(people.certifier, `public.cert_export('exams', null, null)`)).rows as Json[])[0]).toMatchObject({ passed: true, correct: 2, total: 2, flags_count: 0, missed_topics: null });
		expect((await rpc(people.certifier, `public.cert_export('watch', null, null)`)).count).toBe(4);
		expect((await rpc(people.certifier, `public.cert_export('practice', null, null)`)).count).toBe(0);
		expect((await rpc(people.certifier, `public.cert_export('sync', null, null)`)).count).toBe(2);
		// Notifications: the admin reads every row; a certifier reads their own and the ones that name a certification they hold.
		const allNotes = await rpc(people.admin, `public.cert_export('notifications', null, null)`);
		expect(allNotes.count).toBe(await count('public.cert_notifications'));
		const certNotes = (await rpc(people.certifier, `public.cert_export('notifications', null, null)`)).rows as Json[];
		expect(certNotes.length).toBeGreaterThan(0);
		expect(certNotes.length).toBeLessThanOrEqual(allNotes.count as number);
		const millNotes = (await rpc(millOnly, `public.cert_export('notifications', null, null)`)).rows as Json[];
		expect(millNotes.every((n) => n.email === millOnly.email)).toBe(true);
		// The time range: nothing happened an hour from now, and nothing before the first row.
		const future = await rpc(people.admin, `public.cert_export('events', now() + interval '1 hour', null)`);
		expect(future).toMatchObject({ count: 0, rows: [] });
		expect(typeof future.from).toBe('string');
		expect((await rpc(people.admin, `public.cert_export('awards', null, now() - interval '1 day')`)).count).toBe(0);
	});
});

// ===========================================================================
describe('derived status in the mirror', () => {
	test('an award past its expiry mirrors as expired and a revoked one as revoked, with nothing stored for either', async () => {
		await db.sql(`update public.cert_awards set expires_at = now() - interval '1 day' where id = $1`, [benYearAwardId]);
		const benSafeId = (await db.sql<{ id: string }>(`select id from public.cert_awards where serial = $1`, [benSafeSerial])).rows[0].id;
		expect((await rpc(people.admin, `public.cert_award_action($1::uuid, 'revoke', 'Testing')`, [benSafeId])).ok).toBe(true);
		const holders = (await svc('public.cert_mirror_snapshot()')).holders as Json[];
		const status = Object.fromEntries(holders.map((h) => [h.serial as string, h.status]));
		expect(status).toEqual({ [anaSerial]: 'active', [benSafeSerial]: 'revoked', [benYearSerial]: 'expired' });
		expect((await db.sql<{ s: string }>(`select status as s from public.cert_awards where id = $1`, [benYearAwardId])).rows[0].s).toBe('active');
	});
});
