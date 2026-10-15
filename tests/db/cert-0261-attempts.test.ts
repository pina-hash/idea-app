// tests/db/cert-0261-attempts.test.ts
//
// 0261, ATTEMPTS, on the whole tree with the five cert files applied. What
// would fail silently:
//
//   - a start on a draft, a retired certification, a second live attempt, or
//     with a prerequisite unheld;
//   - a part accepted out of order, a waived part accepted, or a submission
//     missing required evidence or an unchecked self-inspection line;
//   - a watch report above 2x or at 95% counting the wrong way;
//   - a certifier reviewing their OWN attempt, a bystander reviewing at all,
//     or a fail without feedback;
//   - the evidence bucket's predicates admitting the wrong person;
//   - the desk showing a certifier a certification they do not certify.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	CERT_FILES, WITH_CERT, certSql, pasteTrap, catalogFingerprint, procCount, tableSurface,
	rpcAs, rpcAnon, seedPeople, samplePackage, samplePool, publishSample, VIDEO_KEY, type CertPeople, type Json, type SampleCert
} from './cert-chain';

const FILE = CERT_FILES[1];
const SQL = certSql(FILE);

const TABLES = ['cert_attempts', 'cert_checks', 'cert_submissions', 'cert_reviews', 'cert_training_progress', 'cert_watch_sessions', 'cert_practice_results'];
const CLIENT_FUNCTIONS = [
	'cert_can_write_evidence_object(text)', 'cert_can_read_evidence_object(text)', 'cert_start(text)', 'cert_withdraw(uuid)', 'cert_me()',
	'cert_submit(uuid, text, jsonb, jsonb)', 'cert_review(uuid, text, text)', 'cert_checkout_in_person(uuid, text, text)',
	'cert_watch_report(uuid, text, numeric, jsonb, numeric, integer, numeric)', 'cert_lesson_complete(uuid, text)',
	'cert_practice_record(uuid, text, text, boolean)', 'cert_student_view(text)', 'cert_desk()'
];
const PRIVATE_FUNCTIONS = [
	'_cert_attempt_owner(uuid)', '_cert_can_read_evidence(uuid)', '_cert_storage_prefix_uuid(text)', '_cert_touch(uuid)', '_cert_holds(text, uuid)',
	'_cert_next_part(uuid)', '_cert_part_unlocked(uuid, text)', '_cert_part_word(text)', '_cert_certifier_emails(uuid)',
	'_cert_training_revision(text, uuid)', '_cert_merge_ranges(jsonb, numeric)', '_cert_attempt_json(uuid)',
	'_cert_check_done(uuid, text, text, text)', '_cert_training_rollup(text, uuid)'
];

let db: TestDb;
let people: CertPeople;
let safe: SampleCert;
let mill: SampleCert;
/** A second certifier with authority on MILL only, for the scope checks. */
let millOnly: SeededUser;

const rpc = <T = Json>(user: SeededUser, call: string, params: unknown[] = []) => rpcAs<T>(db, user, call, params);

beforeAll(async () => {
	expect(FILE).toMatch(/^0261_/);
	db = await startTestDb(WITH_CERT);
	people = await seedPeople(db);
	safe = await publishSample(db, people, 'SAFE-1', { overrides: { parts: { guided: true, exam: true, autonomous: true, checkout: false } } });
	mill = await publishSample(db, people, 'MILL-1', { overrides: { prerequisites: ['SAFE-1'], category: 'Machining', sort_order: 20 } });
	millOnly = await createUser(db, 'millonly@boscotech.edu', 'Mill Only');
	await rpc(people.admin, 'public.cert_authority_grant($1::uuid, $2, null)', [mill.id, millOnly.email]);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the file', () => {
	test('no paste trap; the apply tool sends it; the first object is the cert_attempts table; undo names everything', () => {
		expect(pasteTrap(SQL)).toEqual([]);
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.statements).toBeGreaterThan(60);
		const code = SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
		const first = code.match(/create\s+(?:table|function|or replace function|index|unique index|type|view)\s+(?:if not exists\s+)?([\w.]+)/i);
		expect(first?.[1]).toBe('public.cert_attempts');
		const head = SQL.slice(0, SQL.indexOf('-- ===== PART A BEGIN ====='));
		for (const t of TABLES) expect(head, t).toContain(`drop table if exists public.${t};`);
		for (const f of [...CLIENT_FUNCTIONS, ...PRIVATE_FUNCTIONS]) expect(head, f).toContain(`drop function if exists public.${f};`);
	});

	test('one row per function, RLS on every table with no client privilege, anon refused, re-apply changes nothing', async () => {
		for (const f of [...CLIENT_FUNCTIONS, ...PRIVATE_FUNCTIONS]) expect(await procCount(db, f.slice(0, f.indexOf('('))), f).toBe(1);
		for (const t of TABLES) expect(await tableSurface(db, t), t).toEqual({ rls: true, grants: [] });
		for (const f of CLIENT_FUNCTIONS) {
			const { rows } = await db.sql<{ a: boolean; b: boolean }>(`select has_function_privilege('anon', $1, 'execute') as a, has_function_privilege('authenticated', $1, 'execute') as b`, [`public.${f}`]);
			expect(rows[0], f).toEqual({ a: false, b: true });
		}
		for (const f of PRIVATE_FUNCTIONS) {
			const { rows } = await db.sql<{ a: boolean; b: boolean }>(`select has_function_privilege('anon', $1, 'execute') as a, has_function_privilege('authenticated', $1, 'execute') as b`, [`public.${f}`]);
			expect(rows[0], f).toEqual({ a: false, b: false });
		}
		await expect(rpcAnon(db, `public.cert_start('SAFE-1')`)).rejects.toThrow(/permission denied/i);
		await expect(rpcAnon(db, 'public.cert_me()')).rejects.toThrow(/permission denied/i);
		await expect(db.asUser(people.certifier.id, (q) => q('select * from public.cert_attempts'))).rejects.toThrow(/permission denied/i);
		const before = await catalogFingerprint(db);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toBe(before);
	});
});

// ===========================================================================
describe('start and withdraw', () => {
	test('locked by a prerequisite, with the missing codes named', async () => {
		const locked = await rpc(people.ana, `public.cert_start('MILL-1')`);
		expect(locked).toMatchObject({ ok: false, reason: 'locked', missing: ['SAFE-1'] });
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_attempts`)).rows[0].n).toBe(0);
	});

	test('a start pins the revision, creates one check per part with the disabled part waived, and is one per person', async () => {
		const started = await rpc(people.ana, `public.cert_start('safe-1')`);
		expect(started.ok).toBe(true);
		const attempt = started.attempt as Json;
		expect(attempt).toMatchObject({ state: 'active', revision_id: safe.revisionId, email: people.ana.email, next_part: 'training', cooldown_until: null, seat: null, award: null });
		expect((attempt.checks as Json[]).map((c) => `${c.part}:${c.state}`)).toEqual(['training:pending', 'guided:pending', 'exam:pending', 'autonomous:pending', 'checkout:waived']);
		const again = await rpc(people.ana, `public.cert_start('SAFE-1')`);
		expect(again).toMatchObject({ ok: false, reason: 'already_started', attempt_id: attempt.id });
		expect(await rpc(people.ana, `public.cert_start('NOPE-1')`)).toMatchObject({ ok: false, reason: 'not_found' });
		const catalog = await rpc<Json[]>(people.ana, 'public.cert_catalog()');
		expect(catalog.find((c) => c.code === 'SAFE-1')?.my).toMatchObject({ state: 'active', attempt_id: attempt.id, held: false });
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_events where kind = 'attempt.started' and subject_email = $1`, [people.ana.email])).rows[0].n).toBe(1);
	});

	test('withdraw is the owner alone, keeps the history, and a restart is a new attempt', async () => {
		const started = await rpc(people.ben, `public.cert_start('SAFE-1')`);
		const id = (started.attempt as Json).id as string;
		expect(await rpc(people.ana, 'public.cert_withdraw($1::uuid)', [id])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.certifier, 'public.cert_withdraw($1::uuid)', [id])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ben, 'public.cert_withdraw($1::uuid)', [id])).toEqual({ ok: true });
		expect(await rpc(people.ben, 'public.cert_withdraw($1::uuid)', [id])).toMatchObject({ ok: false, reason: 'not_active' });
		const restarted = await rpc(people.ben, `public.cert_start('SAFE-1')`);
		expect(restarted.ok).toBe(true);
		expect((restarted.attempt as Json).id).not.toBe(id);
		const me = await rpc(people.ben, 'public.cert_me()');
		expect((me.attempts as Json[]).map((a) => a.state)).toEqual(['active', 'withdrawn']);
		expect(me.notifications_unread).toBe(0);
	});
});

// ===========================================================================
describe('training', () => {
	let attemptId: string;
	beforeAll(async () => {
		attemptId = (await db.sql<{ id: string }>(`select id from public.cert_attempts where email = $1 and state = 'active'`, [people.ana.email])).rows[0].id;
	});

	test('a rate above 2x and a zero duration record nothing', async () => {
		expect(await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 100]]'::jsonb, 2.5, 0, 100)`, [safe.id, VIDEO_KEY])).toMatchObject({ ok: false, reason: 'rate' });
		expect(await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 0, '[[0, 100]]'::jsonb, 1, 0, 100)`, [safe.id, VIDEO_KEY])).toMatchObject({ ok: false, reason: 'duration' });
		expect(await rpc(people.ana, `public.cert_watch_report($1::uuid, 'yt:notavideoid', 100, '[[0, 100]]'::jsonb, 1, 0, 100)`, [safe.id])).toMatchObject({ ok: false, reason: 'not_found' });
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_watch_sessions`);
		expect(rows[0].n).toBe(0);
	});

	test('ranges are clamped and merged server-side; 95% completes and checks training off once; the guided project is then unlocked', async () => {
		const first = await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 30], [20, 50], [-10, 5], [120, 130]]'::jsonb, 1.5, 0, 50)`, [safe.id, VIDEO_KEY]);
		expect(first).toMatchObject({ ok: true, covered_seconds: 50, complete: false, training_done: false, notify: [] });
		expect(Number(first.coverage)).toBe(0.5);
		const second = await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[49, 94]]'::jsonb, 2.0, 1, 45)`, [safe.id, VIDEO_KEY]);
		expect(second).toMatchObject({ complete: false, training_done: false });
		expect(Number(second.coverage)).toBe(0.94);
		const third = await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[94, 95]]'::jsonb, 1, 0, 1)`, [safe.id, VIDEO_KEY]);
		expect(third).toMatchObject({ complete: true, training_done: true });
		expect(Number(third.coverage)).toBe(0.95);
		const notify = third.notify as Json[];
		expect(notify).toHaveLength(1);
		expect(notify[0]).toMatchObject({ kind: 'part_checked', email: people.ana.email });
		const { rows } = await db.sql<{ ranges: unknown; sessions: number; state: string; by: string }>(
			`select p.ranges, (select count(*)::int from public.cert_watch_sessions w where w.email = p.email) as sessions,
				k.state, k.checked_by as by
			 from public.cert_training_progress p join public.cert_checks k on k.attempt_id = $2 and k.part = 'training'
			 where p.email = $1 and p.item_key = $3`,
			[people.ana.email, attemptId, VIDEO_KEY]
		);
		expect(rows[0]).toEqual({ ranges: [[0, 95]], sessions: 3, state: 'done', by: 'system' });
		// A fourth report keeps it complete and sends no second notification.
		const fourth = await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 10]]'::jsonb, 1, 0, 10)`, [safe.id, VIDEO_KEY]);
		expect(fourth).toMatchObject({ complete: true, training_done: true, notify: [] });
		const got = await rpc(people.ana, `public.cert_get('SAFE-1')`);
		expect((got.my_training as Json[])[0]).toMatchObject({ item_key: VIDEO_KEY, duration_seconds: 100 });
		expect(Number(((got.my_training as Json[])[0]).covered_seconds)).toBe(95);
		expect((got.my_attempt as Json).next_part).toBe('guided');
	});

	test('a lesson completes its own item and a practice result is one row', async () => {
		// Built by hand: publishing needs the lesson document saved first.
		const saved = await rpc(people.admin, 'public.cert_admin_save(null, $1::jsonb, null)', [
			JSON.stringify(samplePackage('LESSON-1', { training: { items: [{ kind: 'video', key: VIDEO_KEY, title: 'v', youtube_id: 'dQw4w9WgXcQ' }, { kind: 'lesson', key: 'lesson:intro', title: 'Intro', slug: 'intro' }], quick_checks: [] } }))
		]);
		const certId = saved.id as string;
		await rpc(people.admin, `public.cert_lesson_save($1::uuid, 'intro', 'Intro', '<p>i</p>', '{}'::jsonb)`, [certId]);
		await rpc(people.admin, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [certId, JSON.stringify(samplePool())]);
		expect(await rpc(people.admin, 'public.cert_admin_publish($1::uuid)', [certId])).toMatchObject({ ok: true });
		expect((await rpc(people.ben, `public.cert_start('LESSON-1')`)).ok).toBe(true);
		expect(await rpc(people.ben, `public.cert_lesson_complete($1::uuid, 'nope')`, [certId])).toMatchObject({ ok: false, reason: 'not_found' });
		const lesson = await rpc(people.ben, `public.cert_lesson_complete($1::uuid, 'intro')`, [certId]);
		expect(lesson).toMatchObject({ ok: true, complete: true, training_done: false });
		const video = await rpc(people.ben, `public.cert_watch_report($1::uuid, $2, 60, '[[0, 60]]'::jsonb, 1, 0, 60)`, [certId, VIDEO_KEY]);
		expect(video).toMatchObject({ training_done: true });
		expect(await rpc(people.ben, `public.cert_practice_record($1::uuid, 'quick', 'qc-1', true)`, [certId])).toEqual({ ok: true });
		await expect(rpc(people.ben, `public.cert_practice_record($1::uuid, 'exam', 'qc-1', true)`, [certId])).rejects.toThrow(/quick or practice/);
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_practice_results where email = $1`, [people.ben.email])).rows[0].n).toBe(1);
	});
});

// ===========================================================================
describe('submissions and reviews', () => {
	let attemptId: string;
	let submissionId: string;
	beforeAll(async () => {
		attemptId = (await db.sql<{ id: string }>(`select id from public.cert_attempts where email = $1 and certification_id = $2 and state = 'active'`, [people.ana.email, safe.id])).rows[0].id;
	});

	test('a part out of order, a waived part, and an incomplete submission are refused in words', async () => {
		expect(await rpc(people.ana, `public.cert_submit($1::uuid, 'autonomous', '{"text": "x"}'::jsonb, '[]'::jsonb)`, [attemptId])).toMatchObject({ ok: false, reason: 'locked' });
		expect(await rpc(people.ana, `public.cert_submit($1::uuid, 'checkout', '{"youtube_id": "dQw4w9WgXcQ"}'::jsonb, '[]'::jsonb)`, [attemptId])).toMatchObject({ ok: false, reason: 'waived' });
		await expect(rpc(people.ana, `public.cert_submit($1::uuid, 'training', '{}'::jsonb, '[]'::jsonb)`, [attemptId])).rejects.toThrow(/guided, autonomous or checkout/);
		const incomplete = await rpc(people.ana, `public.cert_submit($1::uuid, 'guided', '{"text": "", "links": ["ftp://x"], "files": [{"path": "other/x.jpg", "name": "x.jpg", "size": 1}]}'::jsonb, '[{"item": "I checked", "checked": false}]'::jsonb)`, [attemptId]);
		expect(incomplete).toMatchObject({ ok: false, reason: 'invalid' });
		const problems = incomplete.problems as string[];
		expect(problems).toContain('links: every link starts with http:// or https://');
		expect(problems).toContain("files: a file path starts with this attempt's own id");
		expect(problems).toContain('evidence: Dims is required');
		expect(problems).toContain('self_inspection: not checked: I checked');
		expect(await rpc(people.ben, `public.cert_submit($1::uuid, 'guided', '{"text": "x"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [attemptId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_submissions`)).rows[0].n).toBe(0);
	});

	test('a complete submission lands once, tells every certifier and admin, and a second one waits', async () => {
		const ok = await rpc(people.ana, `public.cert_submit($1::uuid, 'guided', $2::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [
			attemptId,
			JSON.stringify({ text: '12.5 mm', links: ['https://example.test/x'], youtube_id: null, files: [{ path: `${attemptId}/photo.jpg`, name: 'photo.jpg', size: 1200 }] })
		]);
		expect(ok).toMatchObject({ ok: true });
		submissionId = ok.submission_id as string;
		const notify = ok.notify as Json[];
		const recipients = notify.map((n) => n.email as string).sort();
		expect(recipients).toContain(people.certifier.email);
		expect(recipients).toContain(people.admin.email);
		expect(recipients).toContain('apina@boscotech.edu');
		expect(recipients).not.toContain(people.ana.email);
		expect(recipients).not.toContain(millOnly.email);
		expect(notify.every((n) => n.kind === 'queue_submission')).toBe(true);
		expect(await rpc(people.ana, `public.cert_submit($1::uuid, 'guided', '{"text": "again"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [attemptId])).toMatchObject({ ok: false, reason: 'pending' });
	});

	test('the queue is scoped to the certifications a certifier holds', async () => {
		const desk = await rpc(people.certifier, 'public.cert_desk()');
		expect((desk.queue as Json[]).map((q) => q.submission_id)).toEqual([submissionId]);
		expect((desk.queue as Json[])[0]).toMatchObject({ part: 'guided', student: { email: people.ana.email, name: 'Ana Reyes' }, certification: { code: 'SAFE-1' } });
		// Ana's and Ben's SAFE-1 attempts; Ben's LESSON-1 attempt is outside this certifier's scope.
		expect(desk.tiles).toMatchObject({ pending_reviews: 1, active_attempts: 2, dormant_attempts: 0, awards_total: 0 });
		const narrow = await rpc(millOnly, 'public.cert_desk()');
		expect(narrow.queue).toEqual([]);
		expect(narrow.tiles).toMatchObject({ pending_reviews: 0, active_attempts: 0 });
		expect(await rpc(people.bystander, 'public.cert_desk()')).toMatchObject({ ok: false, reason: 'not_found' });
	});

	test('a review is a certifier of that certification, never the student, never a bystander; a fail needs feedback and reopens the part', async () => {
		expect(await rpc(people.bystander, `public.cert_review($1::uuid, 'pass', '')`, [submissionId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(millOnly, `public.cert_review($1::uuid, 'pass', '')`, [submissionId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, `public.cert_review($1::uuid, 'pass', '')`, [submissionId])).toMatchObject({ ok: false, reason: 'not_found' });
		await expect(rpc(people.certifier, `public.cert_review($1::uuid, 'maybe', '')`, [submissionId])).rejects.toThrow(/pass or fail/);
		expect(await rpc(people.certifier, `public.cert_review($1::uuid, 'fail', '   ')`, [submissionId])).toMatchObject({ ok: false, reason: 'feedback_required' });
		const failed = await rpc(people.certifier, `public.cert_review($1::uuid, 'fail', 'Measure the slot again.')`, [submissionId]);
		expect(failed.ok).toBe(true);
		const notify = failed.notify as Json[];
		expect(notify).toHaveLength(1);
		expect(notify[0]).toMatchObject({ kind: 'review_returned', email: people.ana.email });
		expect(notify[0].body).toContain('Measure the slot again.');
		expect(await rpc(people.certifier, `public.cert_review($1::uuid, 'pass', '')`, [submissionId])).toMatchObject({ ok: false, reason: 'decided' });
		// No cooldown on a project: the student resubmits at once.
		const again = await rpc(people.ana, `public.cert_submit($1::uuid, 'guided', '{"text": "12.6 mm"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [attemptId]);
		expect(again.ok).toBe(true);
		const passed = await rpc(people.certifier, `public.cert_review($1::uuid, 'pass', '')`, [again.submission_id]);
		expect(passed.ok).toBe(true);
		expect((passed.notify as Json[]).map((n) => n.kind)).toEqual(['review_returned', 'part_checked']);
		const me = await rpc(people.ana, 'public.cert_me()');
		const attempt = (me.attempts as Json[]).find((a) => a.id === attemptId) as Json;
		expect(attempt.next_part).toBe('exam');
		expect((attempt.submissions as Json[]).map((s) => `${s.state}:${(s.review as Json).decision}`)).toEqual(['failed:fail', 'passed:pass']);
		expect(((attempt.submissions as Json[])[0].review as Json).reviewer_name).toBe('Cee Certifier');
	});

	test('a certifier can never review their own attempt', async () => {
		// The certifier is also a student of MILL-1... which needs SAFE-1 held; use SAFE-1 directly.
		const started = await rpc(people.certifier, `public.cert_start('SAFE-1')`);
		const own = (started.attempt as Json).id as string;
		await rpc(people.certifier, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 100]]'::jsonb, 1, 0, 100)`, [safe.id, VIDEO_KEY]);
		const sub = await rpc(people.certifier, `public.cert_submit($1::uuid, 'guided', '{"text": "mine"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [own]);
		expect(sub.ok).toBe(true);
		expect(await rpc(people.certifier, `public.cert_review($1::uuid, 'pass', '')`, [sub.submission_id])).toMatchObject({ ok: false, reason: 'self' });
		expect(await rpc(people.admin, `public.cert_review($1::uuid, 'pass', '')`, [sub.submission_id])).toMatchObject({ ok: true });
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_reviews r join public.cert_submissions s on s.id = r.submission_id where s.attempt_id = $1 and r.reviewer_email = $2`, [own, people.certifier.email])).rows[0].n).toBe(0);
	});

	test('an in-person checkout is the certifier alone, never on their own attempt, and only once the part is unlocked', async () => {
		// Ana's SAFE-1 waives checkout; MILL-1 has one. Give Ben SAFE-1 so he can hold MILL-1 later; here just the gates.
		const own = (await db.sql<{ id: string }>(`select id from public.cert_attempts where email = $1 and certification_id = $2 and state = 'active'`, [people.certifier.email, safe.id])).rows[0].id;
		expect(await rpc(people.certifier, `public.cert_checkout_in_person($1::uuid, 'pass', '')`, [own])).toMatchObject({ ok: false, reason: 'self' });
		expect(await rpc(people.admin, `public.cert_checkout_in_person($1::uuid, 'pass', '')`, [own])).toMatchObject({ ok: false, reason: 'waived' });
		expect(await rpc(people.admin, `public.cert_checkout_in_person($1::uuid, 'pass', '')`, [attemptId])).toMatchObject({ ok: false, reason: 'waived' });
		// A MILL-1 attempt seeded straight at training (a fixture, not a client path) keeps the checkout locked.
		const millAttempt = await db.sql<{ id: string }>(
			`insert into public.cert_attempts (certification_id, revision_id, email) values ($1, $2, $3) returning id`,
			[mill.id, mill.revisionId, people.bystander.email]
		);
		await db.sql(`insert into public.cert_checks (attempt_id, part) select $1, p from unnest(array['training','guided','exam','autonomous','checkout']) p`, [millAttempt.rows[0].id]);
		expect(await rpc(millOnly, `public.cert_checkout_in_person($1::uuid, 'pass', '')`, [millAttempt.rows[0].id])).toMatchObject({ ok: false, reason: 'locked' });
		expect(await rpc(millOnly, `public.cert_checkout_in_person($1::uuid, 'fail', '')`, [millAttempt.rows[0].id])).toMatchObject({ ok: false, reason: 'locked' });
		expect(await rpc(people.bystander, `public.cert_checkout_in_person($1::uuid, 'pass', '')`, [millAttempt.rows[0].id])).toMatchObject({ ok: false, reason: 'not_found' });
		await db.sql(`update public.cert_checks set state = 'done', checked_by = 'system', checked_at = now() where attempt_id = $1 and part <> 'checkout'`, [millAttempt.rows[0].id]);
		expect(await rpc(millOnly, `public.cert_checkout_in_person($1::uuid, 'fail', '')`, [millAttempt.rows[0].id])).toMatchObject({ ok: false, reason: 'feedback_required' });
		const passed = await rpc(millOnly, `public.cert_checkout_in_person($1::uuid, 'pass', 'Clean')`, [millAttempt.rows[0].id]);
		expect(passed.ok).toBe(true);
		expect((passed.notify as Json[]).map((n) => n.kind)).toEqual(['review_returned', 'part_checked']);
		const { rows } = await db.sql<{ in_person: boolean; state: string; next: string | null }>(
			`select s.in_person, s.state, public._cert_next_part($1) as next from public.cert_submissions s where s.attempt_id = $1`,
			[millAttempt.rows[0].id]
		);
		expect(rows).toEqual([{ in_person: true, state: 'passed', next: null }]);
	});
});

// ===========================================================================
describe('the evidence bucket predicates and the student view', () => {
	test('write: the owner of a live attempt only; read: owner or a certifier of that certification', async () => {
		const attemptId = (await db.sql<{ id: string }>(`select id from public.cert_attempts where email = $1 and certification_id = $2 and state = 'active'`, [people.ana.email, safe.id])).rows[0].id;
		const key = `${attemptId}/${'11111111-2222-4333-8444-555555555555'}.jpg`;
		const can = async (user: SeededUser, fn: string, name: string) =>
			db.asUser(user.id, async (q) => (await q<{ ok: boolean }>(`select public.${fn}($1) as ok`, [name])).rows[0].ok);
		expect(await can(people.ana, 'cert_can_write_evidence_object', key)).toBe(true);
		expect(await can(people.ben, 'cert_can_write_evidence_object', key)).toBe(false);
		expect(await can(people.certifier, 'cert_can_write_evidence_object', key)).toBe(false);
		expect(await can(people.ana, 'cert_can_write_evidence_object', `not-a-uuid/${'x'}.jpg`)).toBe(false);
		expect(await can(people.ana, 'cert_can_read_evidence_object', key)).toBe(true);
		expect(await can(people.certifier, 'cert_can_read_evidence_object', key)).toBe(true);
		expect(await can(people.admin, 'cert_can_read_evidence_object', key)).toBe(true);
		expect(await can(millOnly, 'cert_can_read_evidence_object', key)).toBe(false);
		expect(await can(people.bystander, 'cert_can_read_evidence_object', key)).toBe(false);
		// Signed out, the predicates answer false rather than raising (a policy that throws errors the query).
		expect(await db.sql<{ ok: boolean }>(`select public.cert_can_write_evidence_object($1) as ok`, [key]).then((r) => r.rows[0].ok)).toBe(false);
		// The bucket row and its two policies, where the fixture let the storage half land.
		const { rows } = await db.sql<{ limit: string; pols: number }>(
			`select b.file_size_limit::text as limit,
				(select count(*)::int from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%cert-evidence%') as pols
			 from storage.buckets b where b.id = 'cert-evidence'`
		);
		expect(rows).toEqual([{ limit: '47185920', pols: 2 }]);
	});

	test('the student view is a certifier read, scoped, and a bystander gets not found', async () => {
		expect(await rpc(people.bystander, 'public.cert_student_view($1)', [people.ana.email])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, 'public.cert_student_view($1)', [people.ana.email])).toMatchObject({ ok: false, reason: 'not_found' });
		const view = await rpc(people.certifier, 'public.cert_student_view($1)', [' ANA@boscotech.net ']);
		expect(view).toMatchObject({ email: people.ana.email, name: 'Ana Reyes', awards: [] });
		expect((view.attempts as Json[]).map((a) => (a.certification as Json).code)).toEqual(['SAFE-1']);
		// A certifier of MILL only sees none of Ana's SAFE-1 attempts.
		const narrow = await rpc(millOnly, 'public.cert_student_view($1)', [people.ana.email]);
		expect(narrow.attempts).toEqual([]);
		// An admin sees every attempt, and a wrong address is an empty view, not an error.
		const admin = await rpc(people.admin, 'public.cert_student_view($1)', [people.ana.email]);
		expect((admin.attempts as Json[]).length).toBe(1);
		expect(await rpc(people.admin, 'public.cert_student_view($1)', ['nobody@boscotech.net'])).toMatchObject({ attempts: [], awards: [], name: null });
	});
});
