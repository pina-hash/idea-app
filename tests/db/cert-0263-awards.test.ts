// tests/db/cert-0263-awards.test.ts
//
// 0263, AWARDS AND NOTIFICATIONS, on the whole tree with the five cert files
// applied. What would fail silently:
//
//   - an award recorded with a payload whose values the record does not
//     reproduce (the server signs what the database must re-derive);
//   - a certifier awarding their OWN attempt, or an attempt with a part
//     still open, or one already awarded under another serial;
//   - a serial outside the IDEA-XXXX shape, or one already in use;
//   - cert_verify answering an address, a reason, or anything to a serial
//     that is not there; or refusing anon, who is the whole point of it;
//   - the holders board carrying an address;
//   - a suspend, reinstate, revoke or correction landing with no reason, or
//     with no history row, or a holder reading the reasons;
//   - expired being STORED rather than read off expires_at;
//   - a notification reaching anyone but its addressee, or another person
//     marking it read.

import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	CERT_FILES, WITH_CERT, certSql, pasteTrap, catalogFingerprint, procCount, tableSurface,
	rpcAs, rpcAnon, seedPeople, publishSample, earnUpToAward, awardAttempt, signedPayload, serialFor,
	type CertPeople, type Json, type SampleCert
} from './cert-chain';

const FILE = CERT_FILES[3];
const SQL = certSql(FILE);

const TABLES = ['cert_awards', 'cert_award_history', 'cert_notifications'];
const CLIENT_FUNCTIONS = [
	'cert_award_prepare(uuid)', 'cert_award_commit(uuid, text, text, text, jsonb)', 'cert_award_action(uuid, text, text)',
	'cert_award_correct(uuid, text, text, text, text, jsonb, text)', 'cert_award_get(uuid)', 'cert_awards_list(uuid)',
	'cert_certificate(text)', 'cert_holders()', 'cert_notifications_mine(integer)', 'cert_notifications_mark_read(uuid[])',
	'cert_notifications_unread()'
];
const PUBLIC_FUNCTION = 'cert_verify(text)';
const PRIVATE_FUNCTIONS = [
	'_cert_award_status(public.cert_awards)', '_cert_signed_payload(text, text, integer, text, text, timestamptz, text)',
	'_cert_notify(text, text, text, text, text, jsonb)', '_cert_normalize_serial(text)',
	'_cert_award_json(public.cert_awards, boolean, boolean)', '_cert_award_prepare_checks(uuid)'
];
const SERIAL_SHAPE = /^IDEA(-[0-9A-HJKMNP-TV-Z]{4}){4}$/;
/** What cert_verify hands a stranger, and nothing else. */
const VERIFY_KEYS = [
	'awarded_at', 'awarded_by_name', 'category', 'code', 'expires_at', 'found', 'holder_name', 'key_id', 'level', 'name',
	'signature', 'signed_payload', 'status'
];

let db: TestDb;
let people: CertPeople;
let safe: SampleCert;
let year: SampleCert;
let millOnly: SeededUser;
let anaAttempt: string;
let benAttempt: string;
let benYearAttempt: string;
let anaSerial: string;
let anaAwardId: string;
let benSerial: string;
let benAwardId: string;
let benYearSerial: string;
let benYearAwardId: string;

const rpc = <T = Json>(user: SeededUser, call: string, params: unknown[] = []) => rpcAs<T>(db, user, call, params);
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

async function awardRow(id: string): Promise<Json> {
	const { rows } = await db.sql<Json>(`select status, email, holder_name, expires_at, signed_payload from public.cert_awards where id = $1`, [id]);
	return rows[0];
}

async function history(id: string): Promise<Json[]> {
	const { rows } = await db.sql<Json>(`select action, reason, before, after, actor_email from public.cert_award_history where award_id = $1 order by id`, [id]);
	return rows;
}

beforeAll(async () => {
	expect(FILE).toMatch(/^0263_/);
	db = await startTestDb(WITH_CERT);
	people = await seedPeople(db);
	safe = await publishSample(db, people, 'SAFE-1');
	year = await publishSample(db, people, 'YEAR-1', { overrides: { renewal: 'school_year', sort_order: 30 } });
	millOnly = await createUser(db, 'millonly@boscotech.edu', 'Mill Only');
	const mill = await publishSample(db, people, 'MILL-1', { overrides: { category: 'Machining', sort_order: 20 }, grant: false });
	await rpc(people.admin, 'public.cert_authority_grant($1::uuid, $2, null)', [mill.id, millOnly.email]);
	anaAttempt = (await earnUpToAward(db, people, people.ana, safe)).attemptId;
	benAttempt = (await earnUpToAward(db, people, people.ben, safe)).attemptId;
	benYearAttempt = (await earnUpToAward(db, people, people.ben, year)).attemptId;
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the file', () => {
	test('no paste trap; the apply tool sends it; the first object is the cert_awards table; undo names everything', () => {
		expect(pasteTrap(SQL)).toEqual([]);
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.statements).toBeGreaterThan(50);
		expect(SQL).toMatch(/create table if not exists public\.cert_awards/);
		expect(SQL.indexOf('create table if not exists public.cert_awards')).toBeLessThan(SQL.indexOf('create table if not exists public.cert_award_history'));
		for (const t of TABLES) expect(SQL).toContain(`drop table if exists public.${t};`);
		for (const f of [...CLIENT_FUNCTIONS, PUBLIC_FUNCTION, ...PRIVATE_FUNCTIONS]) {
			expect(SQL, f).toContain(`drop function if exists public.${f};`);
		}
		expect(SQL).toContain(`grant execute on function public.cert_verify(text) to anon, authenticated;`);
		expect(SQL).not.toMatch(/—/);
	});

	test('one row per function, RLS on every table with no client privilege, anon refused, cert_verify open, re-apply changes nothing', async () => {
		for (const f of [...CLIENT_FUNCTIONS, PUBLIC_FUNCTION, ...PRIVATE_FUNCTIONS]) {
			expect(await procCount(db, f.replace(/\(.*$/, '')), f).toBe(1);
		}
		for (const t of TABLES) expect(await tableSurface(db, t), t).toEqual({ rls: true, grants: [] });
		const { rows: seq } = await db.sql<{ anon: boolean; auth: boolean }>(
			`select has_sequence_privilege('anon', 'public.cert_award_history_id_seq', 'usage,select,update') as anon,
			        has_sequence_privilege('authenticated', 'public.cert_award_history_id_seq', 'usage,select,update') as auth`
		);
		expect(seq[0]).toEqual({ anon: false, auth: false });
		const { rows: policies } = await db.sql<{ n: number }>(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = any($1::text[])`, [TABLES]);
		expect(policies[0].n).toBe(0);
		for (const f of CLIENT_FUNCTIONS) {
			const { rows } = await db.sql<{ anon: boolean; auth: boolean; svc: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth,
				        has_function_privilege('service_role', $1, 'execute') as svc`,
				[`public.${f}`]
			);
			expect(rows[0], f).toEqual({ anon: false, auth: true, svc: false });
		}
		const { rows: pub } = await db.sql<{ anon: boolean; auth: boolean }>(
			`select has_function_privilege('anon', 'public.cert_verify(text)', 'execute') as anon, has_function_privilege('authenticated', 'public.cert_verify(text)', 'execute') as auth`
		);
		expect(pub[0]).toEqual({ anon: true, auth: true });
		for (const f of PRIVATE_FUNCTIONS) {
			const { rows } = await db.sql<{ anon: boolean; auth: boolean; svc: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth,
				        has_function_privilege('service_role', $1, 'execute') as svc`,
				[`public.${f}`]
			);
			expect(rows[0], f).toEqual({ anon: false, auth: false, svc: false });
		}
		// anon: refused on every client function (permission), served by cert_verify.
		for (const call of [
			`public.cert_award_prepare('00000000-0000-0000-0000-000000000000'::uuid)`,
			`public.cert_award_commit('00000000-0000-0000-0000-000000000000'::uuid, 'x', 'x', 'x', '{}'::jsonb)`,
			`public.cert_award_action('00000000-0000-0000-0000-000000000000'::uuid, 'suspend', 'x')`,
			`public.cert_award_correct('00000000-0000-0000-0000-000000000000'::uuid, 'x', 'x@y', 'x', 'x', '{}'::jsonb, 'x')`,
			`public.cert_award_get('00000000-0000-0000-0000-000000000000'::uuid)`,
			`public.cert_awards_list(null)`,
			`public.cert_certificate('x')`,
			`public.cert_holders()`,
			`public.cert_notifications_mine(10)`,
			`public.cert_notifications_mark_read('{}'::uuid[])`,
			`public.cert_notifications_unread()`
		]) {
			await expect(rpcAnon(db, call), call).rejects.toThrow(/permission denied/);
		}
		expect(await rpcAnon(db, `public.cert_verify('nothing')`)).toEqual({ found: false });
		// A direct table read is refused for a signed-in client too.
		for (const t of TABLES) {
			await expect(db.asUser(people.admin.id, async (q) => q(`select * from public.${t}`)), t).rejects.toThrow(/permission denied/);
		}
		const before = await catalogFingerprint(db);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toEqual(before);
	});
});

// ===========================================================================
describe('prepare: every requirement, re-checked', () => {
	test('not found for a stranger, an unknown id and a certifier of another certification; self for your own; incomplete with the open part named', async () => {
		expect(await rpc(people.bystander, 'public.cert_award_prepare($1::uuid)', [anaAttempt])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, 'public.cert_award_prepare($1::uuid)', [anaAttempt])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(millOnly, 'public.cert_award_prepare($1::uuid)', [anaAttempt])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.certifier, `public.cert_award_prepare('00000000-0000-0000-0000-000000000000'::uuid)`)).toMatchObject({ ok: false, reason: 'not_found' });
		// The certifier's own attempt: self for them, incomplete (guided project first) for the admin.
		const own = await rpc(people.certifier, `public.cert_start('SAFE-1')`);
		expect(own.ok, JSON.stringify(own)).toBe(true);
		const ownId = (own.attempt as Json).id as string;
		expect(await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [ownId])).toMatchObject({ ok: false, reason: 'self' });
		expect(await rpc(people.admin, 'public.cert_award_prepare($1::uuid)', [ownId])).toMatchObject({ ok: false, reason: 'incomplete', next_part: 'training' });
		expect((await rpc(people.admin, 'public.cert_award_prepare($1::uuid)', [ownId])).message).toContain('training');
		// A withdrawn attempt is not active.
		const bys = await rpc(people.bystander, `public.cert_start('SAFE-1')`);
		const bysId = (bys.attempt as Json).id as string;
		expect((await rpc(people.bystander, 'public.cert_withdraw($1::uuid)', [bysId])).ok).toBe(true);
		expect(await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [bysId])).toMatchObject({ ok: false, reason: 'not_active' });
	});

	test('a student with no name, a certifier with no name, and a school-year certification with no expiry date are each refused in words', async () => {
		await db.sql(`update public.profiles set full_name = null where id = $1`, [people.ana.id]);
		expect(await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [anaAttempt])).toMatchObject({ ok: false, reason: 'no_name' });
		await db.sql(`update public.profiles set full_name = 'Ana Reyes' where id = $1`, [people.ana.id]);
		await db.sql(`update public.profiles set full_name = null where id = $1`, [people.certifier.id]);
		expect(await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [anaAttempt])).toMatchObject({ ok: false, reason: 'no_certifier_name' });
		await db.sql(`update public.profiles set full_name = 'Cee Certifier' where id = $1`, [people.certifier.id]);
		// renewal school_year with no date set in the engine settings.
		const settings = await rpc(people.admin, 'public.cert_settings()');
		expect(settings.school_year_expiry).toBeNull();
		expect(await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [benYearAttempt])).toMatchObject({ ok: false, reason: 'expiry_unset' });
		const set = await rpc(people.admin, `public.cert_settings_set('{"school_year_expiry": "2027-06-30"}'::jsonb)`);
		expect(set.ok, JSON.stringify(set)).toBe(true);
		const ready = await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [benYearAttempt]);
		expect(ready.ok).toBe(true);
		expect((ready.record as Json).expires_at).toMatch(/^2027-06-30T/);
	});

	test('the record names the student by display name when set, full name otherwise, and the certifier the same way', async () => {
		await db.sql(`update public.profiles set display_name = 'Ana R.' where id = $1`, [people.ana.id]);
		const shown = await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [anaAttempt]);
		expect(shown.ok).toBe(true);
		expect((shown.record as Json).student).toEqual({ email: people.ana.email, name: 'Ana R.' });
		await db.sql(`update public.profiles set display_name = null where id = $1`, [people.ana.id]);
		const record = (await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [anaAttempt])).record as Json;
		expect(record.student).toEqual({ email: people.ana.email, name: 'Ana Reyes' });
		expect(record.certifier).toEqual({ email: people.certifier.email, name: 'Cee Certifier' });
		expect(record.certification).toMatchObject({ id: safe.id, code: 'SAFE-1', level: 1, category: 'Safety' });
		expect(record.expires_at).toBeNull();
		expect(typeof record.awarded_at).toBe('string');
		// The SAME checks answer for the admin, who holds every certification.
		expect((await rpc(people.admin, 'public.cert_award_prepare($1::uuid)', [anaAttempt])).ok).toBe(true);
	});
});

// ===========================================================================
describe('commit: the serial, the signature, the payload and what one press records', () => {
	test('the serial shape, an unsigned press, a stale payload and a payload the record does not reproduce are each refused, and nothing is written', async () => {
		const prepared = await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [anaAttempt]);
		const record = prepared.record as Json;
		const serial = serialFor('ana-safe');
		expect(serial).toMatch(SERIAL_SHAPE);
		const payload = signedPayload(record, serial);
		const commit = (s: string | null, sig: string, key: string, p: Json, who: SeededUser = people.certifier) =>
			rpc(who, 'public.cert_award_commit($1::uuid, $2, $3, $4, $5::jsonb)', [anaAttempt, s, sig, key, JSON.stringify(p)]);
		expect(await commit('IDEA-7K3Q-M9XD-2HTR-W4PU', 'sig', 'k1', payload)).toMatchObject({ ok: false, reason: 'serial' });
		expect(await commit('idea-7k3q-m9xd-2htr-w4pb', 'sig', 'k1', payload)).toMatchObject({ ok: false, reason: 'serial' });
		expect(await commit(null, 'sig', 'k1', payload)).toMatchObject({ ok: false, reason: 'serial' });
		expect(await commit(serial, '  ', 'k1', payload)).toMatchObject({ ok: false, reason: 'unsigned' });
		expect(await commit(serial, 'sig', '', payload)).toMatchObject({ ok: false, reason: 'unsigned' });
		const old = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
		expect(await commit(serial, 'sig', 'k1', { ...payload, awarded_at: old })).toMatchObject({ ok: false, reason: 'stale' });
		expect(await commit(serial, 'sig', 'k1', { ...payload, awarded_at: 'not a time' })).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		expect(await commit(serial, 'sig', 'k1', { ...payload, awarded_at: null })).toMatchObject({ ok: false, reason: 'stale' });
		expect(await commit(serial, 'sig', 'k1', { ...payload, holder_name: 'Someone Else' })).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		expect(await commit(serial, 'sig', 'k1', { ...payload, email_sha256: sha256('other@boscotech.net') })).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		expect(await commit(serial, 'sig', 'k1', { ...payload, serial: serialFor('other') })).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		expect(await commit(serial, 'sig', 'k1', { ...payload, level: 2 })).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		expect(await commit(serial, 'sig', 'k1', { ...payload, v: 2 })).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		// Not a certifier of this certification: not found, before any of the above.
		expect(await commit(serial, 'sig', 'k1', payload, millOnly)).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await commit(serial, 'sig', 'k1', payload, people.ana)).toMatchObject({ ok: false, reason: 'not_found' });
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_awards`);
		expect(rows[0].n).toBe(0);
		expect((await db.sql<{ state: string }>(`select state from public.cert_attempts where id = $1`, [anaAttempt])).rows[0].state).toBe('active');
	});

	test('a matching payload records the award, its history, the attempt complete, two events and the holder notification, in one press; a second press says awarded', async () => {
		const prepared = await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [anaAttempt]);
		anaSerial = serialFor('ana-safe');
		const payload = signedPayload(prepared.record as Json, anaSerial);
		// Key order is the client's business; the database compares values.
		const reordered = Object.fromEntries(Object.entries(payload).reverse());
		const committed = await rpc(people.certifier, 'public.cert_award_commit($1::uuid, $2, $3, $4, $5::jsonb)', [
			anaAttempt, anaSerial, 'c2lnbmF0dXJl', ' key-2026 ', JSON.stringify(reordered)
		]);
		expect(committed.ok, JSON.stringify(committed)).toBe(true);
		expect(committed.sync).toBe(true);
		const award = committed.award as Json;
		anaAwardId = award.id as string;
		expect(award).toMatchObject({
			serial: anaSerial, attempt_id: anaAttempt, certification_id: safe.id, revision_id: safe.revisionId,
			email: people.ana.email, holder_name: 'Ana Reyes', code: 'SAFE-1', name: 'Sample SAFE-1', level: 1, category: 'Safety',
			awarded_by_email: people.certifier.email, awarded_by_name: 'Cee Certifier', expires_at: null, status: 'valid',
			signature: 'c2lnbmF0dXJl', key_id: 'key-2026'
		});
		expect(award.signed_payload).toEqual(payload);
		expect((award.signed_payload as Json).email_sha256).toBe(sha256(people.ana.email));
		expect(award).not.toHaveProperty('history');
		expect(committed.notify).toHaveLength(1);
		const note = (committed.notify as Json[])[0];
		expect(note).toMatchObject({ email: people.ana.email, kind: 'awarded', href: `/certifications/certificate/${anaSerial}` });
		expect((note.payload as Json).verify_url).toBe(`https://ideabosco.com/certifications/verify?serial=${anaSerial}`);
		expect(note.body).toContain(`https://ideabosco.com/certifications/verify?serial=${anaSerial}`);
		expect(note.body).not.toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
		expect(await history(anaAwardId)).toMatchObject([{ action: 'awarded', actor_email: people.certifier.email, before: null }]);
		const { rows: attempt } = await db.sql<Json>(`select state, finished_at from public.cert_attempts where id = $1`, [anaAttempt]);
		expect(attempt[0].state).toBe('complete');
		expect(attempt[0].finished_at).not.toBeNull();
		const { rows: events } = await db.sql<{ kind: string }>(`select kind from public.cert_events where attempt_id = $1 and kind in ('award.granted', 'attempt.complete') order by kind`, [anaAttempt]);
		expect(events.map((e) => e.kind)).toEqual(['attempt.complete', 'award.granted']);
		const { rows: notes } = await db.sql<Json>(`select email, user_id, kind from public.cert_notifications where kind = 'awarded'`);
		expect(notes).toEqual([{ email: people.ana.email, user_id: people.ana.id, kind: 'awarded' }]);
		// A second press, with a fresh serial and payload, is told the serial it already has.
		const again = await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [anaAttempt]);
		expect(again).toMatchObject({ ok: false, reason: 'awarded', serial: anaSerial });
		expect(await rpc(people.certifier, 'public.cert_award_commit($1::uuid, $2, $3, $4, $5::jsonb)', [anaAttempt, serialFor('again'), 'sig', 'k', JSON.stringify(payload)]))
			.toMatchObject({ ok: false, reason: 'awarded', serial: anaSerial });
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_awards`)).rows[0].n).toBe(1);
	});

	test('a serial already in use is refused for another student; a fresh one lands; a school-year award carries its expiry', async () => {
		const prepared = await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [benAttempt]);
		expect(prepared.ok).toBe(true);
		const taken = await rpc(people.certifier, 'public.cert_award_commit($1::uuid, $2, $3, $4, $5::jsonb)', [
			benAttempt, anaSerial, 'sig', 'k', JSON.stringify(signedPayload(prepared.record as Json, anaSerial))
		]);
		expect(taken).toMatchObject({ ok: false, reason: 'serial_taken' });
		const ben = await awardAttempt(db, people, benAttempt, 'ben-safe');
		benSerial = (ben.award as Json).serial as string;
		benAwardId = (ben.award as Json).id as string;
		expect(benSerial).not.toBe(anaSerial);
		const benYear = await awardAttempt(db, people, benYearAttempt, 'ben-year');
		benYearSerial = (benYear.award as Json).serial as string;
		benYearAwardId = (benYear.award as Json).id as string;
		expect((benYear.award as Json).expires_at).toMatch(/^2027-06-30T/);
		expect((benYear.award as Json).status).toBe('valid');
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_awards`)).rows[0].n).toBe(3);
	});
});

// ===========================================================================
describe('the public verify read', () => {
	test('anon finds a serial in any spelling, learns the certificate and never an address or a reason, and a serial that is not there is simply not found', async () => {
		const found = await rpcAnon(db, 'public.cert_verify($1)', [anaSerial]);
		expect(Object.keys(found).sort()).toEqual(VERIFY_KEYS);
		expect(found).toMatchObject({ found: true, holder_name: 'Ana Reyes', code: 'SAFE-1', name: 'Sample SAFE-1', level: 1, status: 'valid', awarded_by_name: 'Cee Certifier', expires_at: null });
		const text = JSON.stringify(found);
		expect(text).not.toContain('@');
		expect(text).not.toMatch(/"reason"|"email"|"attempt_id"|"id"/);
		// Every spelling normalizeSerial accepts.
		const body = anaSerial.replace(/^IDEA-/, '').replace(/-/g, '');
		for (const spelling of [anaSerial.toLowerCase(), body, ` ${body.slice(0, 8)} ${body.slice(8)} `, `idea ${body}`, body.replace(/0/g, 'O').replace(/1/g, 'I')]) {
			expect((await rpcAnon(db, 'public.cert_verify($1)', [spelling])).found, spelling).toBe(true);
		}
		for (const missing of ['', 'nothing', 'IDEA-7K3Q-M9XD-2HTR-W4P', 'IDEA-7K3Q-M9XD-2HTR-W4PU', serialFor('nobody'), null]) {
			expect(await rpcAnon(db, 'public.cert_verify($1)', [missing]), String(missing)).toEqual({ found: false });
		}
		// Signed in answers the same.
		expect(await rpc(people.bystander, 'public.cert_verify($1)', [anaSerial])).toEqual(found);
	});

	test('expired is read off expires_at, never stored: the verify page, the record and the holders board agree the moment the date passes', async () => {
		expect((await rpcAnon(db, 'public.cert_verify($1)', [benYearSerial])).status).toBe('valid');
		await db.sql(`update public.cert_awards set expires_at = now() - interval '1 day' where id = $1`, [benYearAwardId]);
		expect((await awardRow(benYearAwardId)).status).toBe('active');
		expect((await rpcAnon(db, 'public.cert_verify($1)', [benYearSerial])).status).toBe('expired');
		expect((await rpc(people.ben, 'public.cert_award_get($1::uuid)', [benYearAwardId])).status).toBe('expired');
		const holders = await rpc(people.ana, 'public.cert_holders()');
		const yearRow = (holders.by_certification as Json[]).find((c) => c.code === 'YEAR-1') as Json;
		expect((yearRow.holders as Json[])[0]).toMatchObject({ name: 'Ben Ortiz', status: 'expired' });
	});
});

// ===========================================================================
describe('suspend, reinstate, revoke and correct', () => {
	test('an admin acts with a reason; a certifier, a bad action, no reason and a wrong state are each refused; the holder reads actions and dates, never reasons', async () => {
		const action = (who: SeededUser, id: string, what: string, why: string | null) =>
			rpc(who, 'public.cert_award_action($1::uuid, $2, $3)', [id, what, why]);
		expect(await action(people.certifier, anaAwardId, 'suspend', 'Unsafe')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await action(people.ana, anaAwardId, 'suspend', 'Unsafe')).toMatchObject({ ok: false, reason: 'not_found' });
		await expect(action(people.admin, anaAwardId, 'delete', 'x')).rejects.toThrow(/suspend, reinstate or revoke/);
		expect(await action(people.admin, '00000000-0000-0000-0000-000000000000', 'suspend', 'x')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await action(people.admin, anaAwardId, 'suspend', '  ')).toMatchObject({ ok: false, reason: 'reason_required' });
		expect(await action(people.admin, anaAwardId, 'suspend', null)).toMatchObject({ ok: false, reason: 'reason_required' });
		expect(await action(people.admin, anaAwardId, 'reinstate', 'x')).toMatchObject({ ok: false, reason: 'state' });
		const suspended = await action(people.admin, anaAwardId, 'suspend', 'Used the saw without glasses on 2026-10-14.');
		expect(suspended.ok).toBe(true);
		expect(suspended.sync).toBe(true);
		expect((suspended.award as Json).status).toBe('suspended');
		expect((suspended.notify as Json[])[0]).toMatchObject({ email: people.ana.email, kind: 'suspended', href: '/certifications/me' });
		expect((suspended.notify as Json[])[0].body).toContain('Used the saw without glasses');
		expect((await rpcAnon(db, 'public.cert_verify($1)', [anaSerial])).status).toBe('suspended');
		expect(await action(people.admin, anaAwardId, 'suspend', 'again')).toMatchObject({ ok: false, reason: 'state' });
		// The holder's view: the history is there, with no reason and no before or after.
		const mine = await rpc(people.ana, 'public.cert_award_get($1::uuid)', [anaAwardId]);
		expect(mine.status).toBe('suspended');
		expect((mine.history as Json[]).map((h) => h.action)).toEqual(['awarded', 'suspended']);
		expect((mine.history as Json[]).every((h) => h.reason === null && h.before === null && h.after === null)).toBe(true);
		expect((mine.history as Json[])[1].actor_name).toBe('Ad Min');
		// The certifier's and the admin's view carry the reasons.
		const staff = await rpc(people.certifier, 'public.cert_award_get($1::uuid)', [anaAwardId]);
		expect((staff.history as Json[])[1]).toMatchObject({ action: 'suspended', reason: 'Used the saw without glasses on 2026-10-14.', before: { status: 'active' }, after: { status: 'suspended' } });
		expect(((await rpc(people.admin, 'public.cert_award_get($1::uuid)', [anaAwardId])).history as Json[])[1].reason).toContain('glasses');
		expect(await rpc(people.bystander, 'public.cert_award_get($1::uuid)', [anaAwardId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(millOnly, 'public.cert_award_get($1::uuid)', [anaAwardId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ben, 'public.cert_award_get($1::uuid)', [anaAwardId])).toMatchObject({ ok: false, reason: 'not_found' });
		const reinstated = await action(people.admin, anaAwardId, 'reinstate', 'Retrained.');
		expect((reinstated.award as Json).status).toBe('valid');
		expect((reinstated.notify as Json[])[0].kind).toBe('reinstated');
		expect(await history(anaAwardId)).toMatchObject([
			{ action: 'awarded' }, { action: 'suspended', reason: 'Used the saw without glasses on 2026-10-14.' }, { action: 'reinstated', reason: 'Retrained.', before: { status: 'suspended' }, after: { status: 'active' } }
		]);
		// Revoked is final.
		const revoked = await action(people.admin, benAwardId, 'revoke', 'Forged the checkout.');
		expect((revoked.award as Json).status).toBe('revoked');
		expect((revoked.notify as Json[])[0].kind).toBe('revoked');
		expect(await action(people.admin, benAwardId, 'revoke', 'again')).toMatchObject({ ok: false, reason: 'state' });
		expect(await action(people.admin, benAwardId, 'reinstate', 'please')).toMatchObject({ ok: false, reason: 'state' });
		expect((await rpcAnon(db, 'public.cert_verify($1)', [benSerial])).status).toBe('revoked');
		const { rows } = await db.sql<{ kind: string; reason: string }>(`select kind, reason from public.cert_events where kind like 'award.%' and attempt_id = $1 order by id`, [benAttempt]);
		expect(rows).toEqual([{ kind: 'award.granted', reason: null }, { kind: 'award.revoked', reason: 'Forged the checkout.' }]);
	});

	test('a correction re-signs the same serial with the corrected name or address and keeps the old values in the history', async () => {
		const correct = (who: SeededUser, name: string | null, email: string | null, sig: string, key: string, signed: Json, why: string | null) =>
			rpc(who, 'public.cert_award_correct($1::uuid, $2, $3, $4, $5, $6::jsonb, $7)', [benYearAwardId, name, email, sig, key, JSON.stringify(signed), why]);
		const before = await awardRow(benYearAwardId);
		const good = {
			...(before.signed_payload as Json),
			holder_name: 'Ben O. Ortiz',
			email_sha256: sha256('ben.ortiz@boscotech.net')
		};
		expect(await correct(people.certifier, 'Ben O. Ortiz', 'ben.ortiz@boscotech.net', 'sig2', 'k2', good, 'Legal name')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await correct(people.admin, 'Ben O. Ortiz', 'ben.ortiz@boscotech.net', 'sig2', 'k2', good, ' ')).toMatchObject({ ok: false, reason: 'reason_required' });
		expect(await correct(people.admin, '', 'ben.ortiz@boscotech.net', 'sig2', 'k2', good, 'Legal name')).toMatchObject({ ok: false, reason: 'invalid' });
		expect(await correct(people.admin, 'Ben O. Ortiz', 'not an address', 'sig2', 'k2', good, 'Legal name')).toMatchObject({ ok: false, reason: 'invalid' });
		expect(await correct(people.admin, 'Ben O. Ortiz', 'ben.ortiz@boscotech.net', '', 'k2', good, 'Legal name')).toMatchObject({ ok: false, reason: 'unsigned' });
		expect(await correct(people.admin, 'Ben O. Ortiz', 'ben.ortiz@boscotech.net', 'sig2', 'k2', { ...good, holder_name: 'Ben Ortiz' }, 'Legal name')).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		expect(await correct(people.admin, 'Ben O. Ortiz', 'ben.ortiz@boscotech.net', 'sig2', 'k2', { ...good, serial: serialFor('x') }, 'Legal name')).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		expect(await awardRow(benYearAwardId)).toMatchObject({ holder_name: 'Ben Ortiz', email: people.ben.email });
		const corrected = await correct(people.admin, '  Ben O. Ortiz ', ' Ben.Ortiz@BoscoTech.net ', 'sig2', 'k2', good, 'Legal name on file');
		expect(corrected.ok, JSON.stringify(corrected)).toBe(true);
		expect(corrected.notify).toEqual([]);
		expect(corrected.award).toMatchObject({ serial: benYearSerial, holder_name: 'Ben O. Ortiz', email: 'ben.ortiz@boscotech.net', signature: 'sig2', key_id: 'k2' });
		expect((corrected.award as Json).signed_payload).toEqual(good);
		const h = await history(benYearAwardId);
		expect(h.map((x) => x.action)).toEqual(['awarded', 'corrected']);
		expect(h[1].before).toMatchObject({ holder_name: 'Ben Ortiz', email: people.ben.email, signature: 'c2lnbmF0dXJl' });
		expect(h[1].after).toMatchObject({ holder_name: 'Ben O. Ortiz', email: 'ben.ortiz@boscotech.net' });
		expect(h[1].reason).toBe('Legal name on file');
		const verify = await rpcAnon(db, 'public.cert_verify($1)', [benYearSerial]);
		expect(verify).toMatchObject({ holder_name: 'Ben O. Ortiz', signature: 'sig2', key_id: 'k2' });
		expect(JSON.stringify(verify)).not.toContain('@');
		// The record now belongs to the corrected address: the old one no longer reads it.
		expect(await rpc(people.ben, 'public.cert_award_get($1::uuid)', [benYearAwardId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect((await rpc(people.certifier, 'public.cert_award_get($1::uuid)', [benYearAwardId])).email).toBe('ben.ortiz@boscotech.net');
	});
});

// ===========================================================================
describe('the certificate, the list and the holders board', () => {
	test('the printed certificate is the holder’s, a certifier’s of that certification or an admin’s, in any spelling of the serial', async () => {
		const own = await rpc(people.ana, 'public.cert_certificate($1)', [anaSerial.toLowerCase()]);
		expect(own).toMatchObject({
			serial: anaSerial, holder_name: 'Ana Reyes', code: 'SAFE-1', name: 'Sample SAFE-1', level: 1, category: 'Safety',
			awarded_by_name: 'Cee Certifier', status: 'valid', definition: 'Knows the rules.', verify_url_path: `/certifications/verify?serial=${anaSerial}`,
			signature: 'c2lnbmF0dXJl', key_id: 'key-2026', expires_at: null
		});
		expect((own.signed_payload as Json).serial).toBe(anaSerial);
		expect((await rpc(people.certifier, 'public.cert_certificate($1)', [anaSerial])).serial).toBe(anaSerial);
		expect((await rpc(people.admin, 'public.cert_certificate($1)', [anaSerial])).serial).toBe(anaSerial);
		expect(await rpc(people.ben, 'public.cert_certificate($1)', [anaSerial])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.bystander, 'public.cert_certificate($1)', [anaSerial])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(millOnly, 'public.cert_certificate($1)', [anaSerial])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, 'public.cert_certificate($1)', ['garbage'])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, 'public.cert_certificate($1)', [serialFor('nobody')])).toMatchObject({ ok: false, reason: 'not_found' });
	});

	test('the awards list is a certifier’s, scoped to their authority, filtered by certification; the admin sees every award', async () => {
		const all = await rpc<Json[]>(people.admin, 'public.cert_awards_list(null)');
		expect(all.map((a) => a.serial).sort()).toEqual([anaSerial, benSerial, benYearSerial].sort());
		expect(all.every((a) => !('history' in a))).toBe(true);
		const scoped = await rpc<Json[]>(people.certifier, 'public.cert_awards_list(null)');
		expect(scoped.map((a) => a.serial).sort()).toEqual([anaSerial, benSerial, benYearSerial].sort());
		expect((await rpc<Json[]>(people.certifier, 'public.cert_awards_list($1::uuid)', [safe.id])).map((a) => a.serial).sort()).toEqual([anaSerial, benSerial].sort());
		expect(await rpc<Json[]>(people.certifier, 'public.cert_awards_list($1::uuid)', [year.id])).toHaveLength(1);
		expect(await rpc<Json[]>(millOnly, 'public.cert_awards_list(null)')).toEqual([]);
		expect(await rpc(people.ana, 'public.cert_awards_list(null)')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.bystander, 'public.cert_awards_list(null)')).toMatchObject({ ok: false, reason: 'not_found' });
	});

	test('the holders board names holders by certification and by person, hashes the address and never prints it', async () => {
		const board = await rpc(people.bystander, 'public.cert_holders()');
		const text = JSON.stringify(board);
		expect(text).not.toContain('@');
		expect(text).not.toMatch(/"email"|"serial"|"attempt_id"/);
		const byCert = board.by_certification as Json[];
		expect(byCert.map((c) => c.code)).toEqual(['SAFE-1', 'YEAR-1']);
		const safeRow = byCert[0];
		expect(safeRow).toMatchObject({ code: 'SAFE-1', name: 'Sample SAFE-1', level: 1, category: 'Safety' });
		expect(safeRow.holders).toEqual([
			{ name: 'Ana Reyes', awarded_at: expect.any(String), status: 'valid' },
			{ name: 'Ben Ortiz', awarded_at: expect.any(String), status: 'revoked' }
		]);
		const byPerson = board.by_person as Json[];
		expect(byPerson.map((p) => p.name)).toEqual(['Ana Reyes', 'Ben O. Ortiz', 'Ben Ortiz']);
		const ana = byPerson[0];
		expect(ana.email_hash).toBe(sha256(people.ana.email));
		expect(ana.certifications).toEqual([{ code: 'SAFE-1', level: 1, awarded_at: expect.any(String), status: 'valid' }]);
		expect((byPerson[1].certifications as Json[])[0]).toMatchObject({ code: 'YEAR-1', status: 'expired' });
		expect(byPerson[2].email_hash).toBe(sha256(people.ben.email));
		// MILL-1 has no holder and is not listed.
		expect(byCert.some((c) => c.code === 'MILL-1')).toBe(false);
	});
});

// ===========================================================================
describe('notifications', () => {
	test('a person reads their own rows newest first, marks only their own read, and the badge counts what is unread', async () => {
		// Every row the flow wrote her (part checks, the review, the seat, the exam) plus the three award rows, newest first.
		const mine = await rpc<Json[]>(people.ana, 'public.cert_notifications_mine(50)');
		const total = (await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_notifications where email = $1`, [people.ana.email])).rows[0].n;
		expect(total).toBeGreaterThan(3);
		expect(mine).toHaveLength(total);
		expect(mine.slice(0, 3).map((n) => n.kind)).toEqual(['reinstated', 'suspended', 'awarded']);
		expect(mine.every((n) => n.read_at === null)).toBe(true);
		for (const n of mine) expect(Object.keys(n).sort()).toEqual(['body', 'created_at', 'href', 'id', 'kind', 'payload', 'read_at', 'title']);
		expect(JSON.stringify(mine)).not.toMatch(/"accept"|"explain"|"answer"/);
		expect(await rpc<number>(people.ana, 'public.cert_notifications_unread()')).toBe(total);
		expect(await rpc<Json[]>(people.ana, 'public.cert_notifications_mine(1)')).toHaveLength(1);
		expect(await rpc<Json[]>(people.ana, 'public.cert_notifications_mine(null)')).toHaveLength(total);
		expect(await rpc<Json[]>(people.ana, 'public.cert_notifications_mine(0)')).toHaveLength(1);
		const ids = mine.map((n) => n.id as string);
		// Somebody else holding the ids marks nothing.
		expect(await rpc(people.ben, 'public.cert_notifications_mark_read($1::uuid[])', [ids])).toMatchObject({ ok: true, marked: 0 });
		expect(await rpc(people.admin, 'public.cert_notifications_mark_read($1::uuid[])', [ids])).toMatchObject({ ok: true, marked: 0 });
		expect(await rpc<number>(people.ana, 'public.cert_notifications_unread()')).toBe(total);
		expect(await rpc(people.ana, 'public.cert_notifications_mark_read($1::uuid[])', [ids.slice(0, 2)])).toEqual({ ok: true, marked: 2, unread: total - 2 });
		expect(await rpc(people.ana, 'public.cert_notifications_mark_read($1::uuid[])', [ids])).toEqual({ ok: true, marked: total - 2, unread: 0 });
		expect(await rpc(people.ana, 'public.cert_notifications_mark_read(null)')).toEqual({ ok: true, marked: 0, unread: 0 });
		expect(await rpc<number>(people.ana, 'public.cert_notifications_unread()')).toBe(0);
		expect((await rpc<Json[]>(people.ana, 'public.cert_notifications_mine(50)')).every((n) => n.read_at !== null)).toBe(true);
		// Ben's newest rows are his: the revocation and the two awards; the corrected YEAR-1 award's rows stay addressed to the address they were written to.
		const bens = await rpc<Json[]>(people.ben, 'public.cert_notifications_mine(50)');
		expect(bens.slice(0, 3).map((n) => n.kind)).toEqual(['revoked', 'awarded', 'awarded']);
		expect(bens.length).toBeGreaterThan(3);
		expect(await rpc<Json[]>(people.bystander, 'public.cert_notifications_mine(50)')).toEqual([]);
		expect(await rpc<number>(people.bystander, 'public.cert_notifications_unread()')).toBe(0);
		// The queue rows the flow wrote reached every certifier of SAFE-1 and YEAR-1: the granted certifier, every admin on the roster and the owner, nobody else (not the MILL-1 certifier).
		const { rows } = await db.sql<{ email: string; n: number }>(`select email, count(*)::int as n from public.cert_notifications where kind like 'queue_%' group by email order by email`);
		const { rows: staff } = await db.sql<{ email: string }>(`select email from public.app_admins union select public.admin_owner_email() union select $1::text order by 1`, [people.certifier.email]);
		expect(rows.map((r) => r.email)).toEqual(staff.map((r) => r.email));
		expect(rows.some((r) => r.email === millOnly.email)).toBe(false);
		expect(new Set(rows.map((r) => r.n)).size).toBe(1);
	});
});
