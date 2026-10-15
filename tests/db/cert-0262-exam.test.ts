// tests/db/cert-0262-exam.test.ts
//
// 0262, THE EXAM, on the whole tree with the five cert files applied. What
// would fail silently:
//
//   - the answer key, or the explanation, reaching a student's browser through
//     cert_exam_open or cert_exam_answer (the one leak the whole lockdown
//     exists to prevent);
//   - a seat requested before the guided project is done, inside a cooldown,
//     or twice; a window overbooked or booked for another certification;
//   - a certifier releasing, deciding or ending their OWN exam;
//   - a release past its window still opening; an answer past the deadline
//     still counting; answers taken out of order;
//   - a draw that skips a topic, repeats a question, or never shuffles;
//   - the 7-day cooldown not starting on a fail, or starting on a pass.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	CERT_FILES, WITH_CERT, certSql, pasteTrap, catalogFingerprint, procCount, tableSurface,
	rpcAs, rpcAnon, seedPeople, samplePool, publishSample, keyFor, VIDEO_KEY, type CertPeople, type Json, type SampleCert
} from './cert-chain';

const FILE = CERT_FILES[2];
const SQL = certSql(FILE);

const TABLES = ['cert_sittings', 'cert_seats', 'cert_exam_attempts'];
const CLIENT_FUNCTIONS = [
	'cert_sitting_post(jsonb)', 'cert_sitting_cancel(uuid)', 'cert_sittings()', 'cert_seat_request(uuid, uuid, text)',
	'cert_seat_decide(uuid, text, timestamptz, text)', 'cert_seat_cancel(uuid)', 'cert_exam_release(uuid)', 'cert_exam_open(uuid)',
	'cert_exam_answer(uuid, integer, jsonb)', 'cert_exam_flag(uuid, text)', 'cert_exam_submit(uuid)', 'cert_exam_end(uuid, text)',
	'cert_exam_live(uuid)', 'cert_exam_result(uuid)'
];
const PRIVATE_FUNCTIONS = [
	'_cert_cooldown_until(uuid)', '_cert_exam_draw(uuid, uuid)', '_cert_exam_score_one(text, jsonb, jsonb, jsonb)',
	'_cert_exam_question_json(uuid, integer)', '_cert_exam_result_json(uuid)', '_cert_exam_finish(uuid, text, text)'
];
/** Exactly what a student's browser may receive for one question. */
const QUESTION_KEYS = ['deadline', 'index', 'options', 'prompt', 'total', 'type', 'unit'];
const WEEKDAY = /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/;

let db: TestDb;
let people: CertPeople;
let safe: SampleCert;
let millOnly: SeededUser;

const rpc = <T = Json>(user: SeededUser, call: string, params: unknown[] = []) => rpcAs<T>(db, user, call, params);

/** Start, train and pass the guided project for one student on SAFE-1: the exam is then the next part. */
async function readyForExam(student: SeededUser): Promise<string> {
	const started = await rpc(student, `public.cert_start('SAFE-1')`);
	expect(started.ok, JSON.stringify(started)).toBe(true);
	const attemptId = (started.attempt as Json).id as string;
	await rpc(student, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 100]]'::jsonb, 1, 0, 100)`, [safe.id, VIDEO_KEY]);
	const sub = await rpc(student, `public.cert_submit($1::uuid, 'guided', '{"text": "ok"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [attemptId]);
	expect(sub.ok, JSON.stringify(sub)).toBe(true);
	// The admin reviews, so the certifier's own attempt can be built this way too.
	const rev = await rpc(people.admin, `public.cert_review($1::uuid, 'pass', '')`, [sub.submission_id]);
	expect(rev.ok, JSON.stringify(rev)).toBe(true);
	return attemptId;
}

async function examState(examId: string): Promise<Json> {
	const { rows } = await db.sql<Json>(`select state, passed, current_index, jsonb_array_length(draw)::int as total, answers, flags from public.cert_exam_attempts where id = $1`, [examId]);
	return rows[0];
}

beforeAll(async () => {
	expect(FILE).toMatch(/^0262_/);
	db = await startTestDb(WITH_CERT);
	people = await seedPeople(db);
	safe = await publishSample(db, people, 'SAFE-1');
	millOnly = await createUser(db, 'millonly@boscotech.edu', 'Mill Only');
	const mill = await publishSample(db, people, 'MILL-1', { overrides: { category: 'Machining', sort_order: 20 }, grant: false });
	await rpc(people.admin, 'public.cert_authority_grant($1::uuid, $2, null)', [mill.id, millOnly.email]);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the file', () => {
	test('no paste trap; the apply tool sends it; the first object is the cert_sittings table; undo names everything', () => {
		expect(pasteTrap(SQL)).toEqual([]);
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.statements).toBeGreaterThan(50);
		const code = SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
		const first = code.match(/create\s+(?:table|function|or replace function|index|unique index|type|view)\s+(?:if not exists\s+)?([\w.]+)/i);
		expect(first?.[1]).toBe('public.cert_sittings');
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
		await expect(rpcAnon(db, 'public.cert_sittings()')).rejects.toThrow(/permission denied/i);
		await expect(rpcAnon(db, `public.cert_exam_open('00000000-0000-0000-0000-000000000000'::uuid)`)).rejects.toThrow(/permission denied/i);
		await expect(db.asUser(people.ana.id, (q) => q('select * from public.cert_exam_attempts'))).rejects.toThrow(/permission denied/i);
		const before = await catalogFingerprint(db);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toBe(before);
	});
});

// ===========================================================================
describe('sitting windows', () => {
	let seriesIds: string[];

	test('an admin posts a window, repeated weekly under one series; anyone signed in lists the open ones', async () => {
		const body = { starts_at: '2030-01-07T22:00:00Z', ends_at: '2030-01-07T23:30:00Z', seat_limit: 2, location: 'Room 12', note: null, certification_id: null, repeat_weeks: 2 };
		expect(await rpc(people.certifier, 'public.cert_sitting_post($1::jsonb)', [JSON.stringify(body)])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.admin, 'public.cert_sitting_post($1::jsonb)', [JSON.stringify({ ...body, ends_at: '2030-01-07T21:00:00Z' })])).toMatchObject({ ok: false, reason: 'invalid' });
		expect(await rpc(people.admin, 'public.cert_sitting_post($1::jsonb)', [JSON.stringify({ ...body, seat_limit: 0 })])).toMatchObject({ ok: false, reason: 'invalid' });
		expect(await rpc(people.admin, 'public.cert_sitting_post($1::jsonb)', [JSON.stringify({ ...body, repeat_weeks: 27 })])).toMatchObject({ ok: false, reason: 'invalid' });
		const posted = await rpc(people.admin, 'public.cert_sitting_post($1::jsonb)', [JSON.stringify(body)]);
		expect(posted.ok).toBe(true);
		seriesIds = posted.sitting_ids as string[];
		expect(seriesIds).toHaveLength(3);
		const { rows } = await db.sql<{ starts_at: string; series: number }>(
			`select starts_at::text, (select count(distinct series_id)::int from public.cert_sittings) as series from public.cert_sittings order by starts_at`
		);
		expect(rows.map((r) => r.starts_at.slice(0, 10))).toEqual(['2030-01-07', '2030-01-14', '2030-01-21']);
		expect(rows[0].series).toBe(1);
		const listed = await rpc<Json[]>(people.ana, 'public.cert_sittings()');
		expect(listed).toHaveLength(3);
		expect(listed[0]).toMatchObject({ seat_limit: 2, seats_taken: 0, location: 'Room 12', certification: null, state: 'open' });
	});
});

// ===========================================================================
describe('seats', () => {
	let anaAttempt: string;
	let benAttempt: string;
	let anaSeat: string;
	let benSeat: string;
	let firstSitting: string;

	beforeAll(async () => {
		firstSitting = (await db.sql<{ id: string }>(`select id from public.cert_sittings order by starts_at limit 1`)).rows[0].id;
	});

	test('a seat needs the guided project done first, and a stranger cannot ask on another attempt', async () => {
		const started = await rpc(people.ana, `public.cert_start('SAFE-1')`);
		anaAttempt = (started.attempt as Json).id as string;
		expect(await rpc(people.ana, 'public.cert_seat_request($1::uuid, null, null)', [anaAttempt])).toMatchObject({ ok: false, reason: 'locked' });
		expect(await rpc(people.ben, 'public.cert_seat_request($1::uuid, null, null)', [anaAttempt])).toMatchObject({ ok: false, reason: 'not_found' });
		await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 100]]'::jsonb, 1, 0, 100)`, [safe.id, VIDEO_KEY]);
		const sub = await rpc(people.ana, `public.cert_submit($1::uuid, 'guided', '{"text": "ok"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [anaAttempt]);
		await rpc(people.certifier, `public.cert_review($1::uuid, 'pass', '')`, [sub.submission_id]);
		benAttempt = await readyForExam(people.ben);
	});

	test('a window books a seat at its time, counts it, refuses a second open seat, a full window and the wrong certification', async () => {
		const mismatchWindow = await rpc(people.admin, 'public.cert_sitting_post($1::jsonb)', [JSON.stringify({ starts_at: '2030-02-01T22:00:00Z', ends_at: '2030-02-01T23:00:00Z', seat_limit: 5, certification_id: (await db.sql<{ id: string }>(`select id from public.cert_certifications where code = 'MILL-1'`)).rows[0].id })]);
		expect(await rpc(people.ana, 'public.cert_seat_request($1::uuid, $2::uuid, null)', [anaAttempt, (mismatchWindow.sitting_ids as string[])[0]])).toMatchObject({ ok: false, reason: 'sitting_mismatch' });
		const tiny = await rpc(people.admin, 'public.cert_sitting_post($1::jsonb)', [JSON.stringify({ starts_at: '2030-03-01T22:00:00Z', ends_at: '2030-03-01T23:00:00Z', seat_limit: 1 })]);
		const tinyId = (tiny.sitting_ids as string[])[0];
		const booked = await rpc(people.ana, "public.cert_seat_request($1::uuid, $2::uuid, 'first one')", [anaAttempt, tinyId]);
		expect(booked.ok).toBe(true);
		expect(booked.seat).toMatchObject({ state: 'booked', sitting_id: tinyId, scheduled_at: '2030-03-01T22:00:00+00:00' });
		expect(booked.notify).toEqual([]);
		anaSeat = (booked.seat as Json).id as string;
		expect(await rpc(people.ana, 'public.cert_seat_request($1::uuid, $2::uuid, null)', [anaAttempt, firstSitting])).toMatchObject({ ok: false, reason: 'seat_open' });
		expect(await rpc(people.ben, 'public.cert_seat_request($1::uuid, $2::uuid, null)', [benAttempt, tinyId])).toMatchObject({ ok: false, reason: 'sitting_full' });
		const listed = await rpc<Json[]>(people.ben, 'public.cert_sittings()');
		expect(listed.find((w) => w.id === tinyId)).toMatchObject({ seats_taken: 1, seat_limit: 1 });
		// A booked seat is not a request: nothing to decide.
		expect(await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [anaSeat])).toMatchObject({ ok: false, reason: 'decided' });
		const got = await rpc(people.ana, `public.cert_get('SAFE-1')`);
		expect(got.seat).toMatchObject({ id: anaSeat, state: 'booked' });
	});

	test('a plain request reaches every certifier; deciding is theirs alone, never their own, with a time to approve and a note to decline', async () => {
		const requested = await rpc(people.ben, "public.cert_seat_request($1::uuid, null, 'after school')", [benAttempt]);
		expect(requested.ok).toBe(true);
		benSeat = (requested.seat as Json).id as string;
		const recipients = (requested.notify as Json[]).map((n) => n.email).sort();
		expect(recipients).toContain(people.certifier.email);
		expect(recipients).toContain(people.admin.email);
		expect(recipients).not.toContain(millOnly.email);
		expect((requested.notify as Json[]).every((n) => n.kind === 'queue_request')).toBe(true);
		const desk = await rpc(people.certifier, 'public.cert_desk()');
		expect((desk.requests as Json[]).map((r) => r.seat_id)).toEqual([benSeat]);

		expect(await rpc(people.bystander, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [benSeat])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(millOnly, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [benSeat])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'approve', null, null)`, [benSeat])).toMatchObject({ ok: false, reason: 'time_required' });
		expect(await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'decline', null, '')`, [benSeat])).toMatchObject({ ok: false, reason: 'note_required' });
		await expect(rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'maybe', null, null)`, [benSeat])).rejects.toThrow(/approve or decline/);
		const approved = await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'approve', '2030-04-01T22:30:00Z'::timestamptz, 'Room 12')`, [benSeat]);
		expect(approved.ok).toBe(true);
		const note = (approved.notify as Json[])[0];
		expect(note).toMatchObject({ kind: 'sitting_approved', email: people.ben.email });
		expect(note.body).toContain('April 1, 2030');
		expect(note.body).not.toMatch(WEEKDAY);
		expect(await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'decline', null, 'late')`, [benSeat])).toMatchObject({ ok: false, reason: 'decided' });

		// A certifier's own request: self.
		const own = await readyForExam(people.certifier);
		const ownSeat = await rpc(people.certifier, 'public.cert_seat_request($1::uuid, null, null)', [own]);
		expect(ownSeat.ok).toBe(true);
		expect(await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [(ownSeat.seat as Json).id])).toMatchObject({ ok: false, reason: 'self' });
		expect(await rpc(people.admin, `public.cert_seat_decide($1::uuid, 'decline', null, 'Ask the other certifier.')`, [(ownSeat.seat as Json).id])).toMatchObject({ ok: true });
		expect(((await rpc(people.certifier, 'public.cert_me()')).attempts as Json[])[0].seat).toBeNull();
	});

	test('cancel is the owner or a certifier; cancelling a window frees its booked seats and tells each student', async () => {
		expect(await rpc(people.ben, 'public.cert_seat_cancel($1::uuid)', [anaSeat])).toMatchObject({ ok: false, reason: 'not_found' });
		const tinyId = (await db.sql<{ sitting_id: string }>(`select sitting_id from public.cert_seats where id = $1`, [anaSeat])).rows[0].sitting_id;
		expect(await rpc(people.certifier, 'public.cert_sitting_cancel($1::uuid)', [tinyId])).toMatchObject({ ok: false, reason: 'not_found' });
		const cancelled = await rpc(people.admin, 'public.cert_sitting_cancel($1::uuid)', [tinyId]);
		expect(cancelled.ok).toBe(true);
		expect((cancelled.notify as Json[]).map((n) => `${n.kind}:${n.email}`)).toEqual([`sitting_declined:${people.ana.email}`]);
		expect((cancelled.notify as Json[])[0].body).not.toMatch(WEEKDAY);
		expect((await db.sql<{ state: string }>(`select state from public.cert_seats where id = $1`, [anaSeat])).rows[0].state).toBe('cancelled');
		expect(await rpc(people.admin, 'public.cert_sitting_cancel($1::uuid)', [tinyId])).toMatchObject({ ok: false, reason: 'cancelled' });
		expect((await rpc<Json[]>(people.ana, 'public.cert_sittings()')).some((w) => w.id === tinyId)).toBe(false);
		// Ana asks again, plainly, and cancels it herself.
		const again = await rpc(people.ana, 'public.cert_seat_request($1::uuid, null, null)', [anaAttempt]);
		expect(again.ok).toBe(true);
		expect(await rpc(people.ana, 'public.cert_seat_cancel($1::uuid)', [(again.seat as Json).id])).toEqual({ ok: true });
	});
});

// ===========================================================================
describe('the exam', () => {
	let benAttempt: string;
	let benSeat: string;
	let benExam: string;

	beforeAll(async () => {
		const seat = (await db.sql<{ id: string; attempt_id: string }>(`select id, attempt_id from public.cert_seats where email = $1 and state = 'approved'`, [people.ben.email])).rows[0];
		benSeat = seat.id;
		benAttempt = seat.attempt_id;
	});

	test('release is a certifier of the certification, never the student, on an approved or booked seat, once', async () => {
		expect(await rpc(people.bystander, 'public.cert_exam_release($1::uuid)', [benSeat])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(millOnly, 'public.cert_exam_release($1::uuid)', [benSeat])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ben, 'public.cert_exam_release($1::uuid)', [benSeat])).toMatchObject({ ok: false, reason: 'not_found' });
		// The student IS a certifier of the same certification: still self.
		await rpc(people.admin, 'public.cert_authority_grant($1::uuid, $2, null)', [safe.id, people.ben.email]);
		expect(await rpc(people.ben, 'public.cert_exam_release($1::uuid)', [benSeat])).toMatchObject({ ok: false, reason: 'self' });
		await rpc(people.admin, 'public.cert_authority_revoke($1::uuid, $2)', [safe.id, people.ben.email]);
		const cancelledSeat = (await db.sql<{ id: string }>(`select id from public.cert_seats where state = 'cancelled' limit 1`)).rows[0].id;
		expect(await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [cancelledSeat])).toMatchObject({ ok: false, reason: 'seat_state' });

		const released = await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [benSeat]);
		expect(released).toMatchObject({ ok: true, total: 2 });
		benExam = released.exam_id as string;
		const { rows } = await db.sql<{ secs: number; seat: string; state: string }>(
			`select round(extract(epoch from (e.release_expires_at - e.released_at)))::int as secs, s.state as seat, e.state
			 from public.cert_exam_attempts e join public.cert_seats s on s.id = e.seat_id where e.id = $1`,
			[benExam]
		);
		expect(rows[0]).toEqual({ secs: 600, seat: 'used', state: 'released' });
		// A second release for the same attempt is refused while one is open; the seat is used anyway.
		await db.sql(`insert into public.cert_seats (attempt_id, certification_id, email, state) values ($1, $2, $3, 'approved')`, [benAttempt, safe.id, people.ben.email]);
		const second = (await db.sql<{ id: string }>(`select id from public.cert_seats where attempt_id = $1 and state = 'approved'`, [benAttempt])).rows[0].id;
		expect(await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [second])).toMatchObject({ ok: false, reason: 'exam_open' });
	});

	test('the question a student receives never carries the key or the explanation, and only the owner can open', async () => {
		expect(await rpc(people.ana, 'public.cert_exam_open($1::uuid)', [benExam])).toMatchObject({ ok: false, reason: 'not_found' });
		const opened = await rpc(people.ben, 'public.cert_exam_open($1::uuid)', [benExam]);
		expect(opened.ok).toBe(true);
		expect(opened.exam).toMatchObject({ id: benExam, state: 'in_progress', total: 2, current_index: 0 });
		const q = opened.question as Json;
		expect(Object.keys(q).sort()).toEqual(QUESTION_KEYS);
		const text = JSON.stringify(opened);
		expect(text).not.toMatch(/"answer"|"explain"|"accept"|e-stop|estop|"tolerance"|"value"/);
		expect(q.index).toBe(0);
		if (q.type === 'multiple_choice' || q.type === 'multiple_select') {
			expect(Array.isArray(q.options)).toBe(true);
			for (const o of q.options as Json[]) expect(Object.keys(o).sort()).toEqual(['key', 'text']);
		} else {
			expect(q.options).toBeNull();
		}
		// Resuming is the same answer.
		const resumed = await rpc(people.ben, 'public.cert_exam_open($1::uuid)', [benExam]);
		expect(resumed.exam).toMatchObject({ state: 'in_progress', current_index: 0 });
		expect((await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_events where kind = 'exam.opened'`)).rows[0].n).toBe(1);
	});

	test('answers are taken in order, flags are appended, the proctor sees them live, and the whole thing scores on submit', async () => {
		expect(await rpc(people.ben, `public.cert_exam_answer($1::uuid, 1, '"a"'::jsonb)`, [benExam])).toMatchObject({ ok: false, reason: 'out_of_order', current_index: 0 });
		expect(await rpc(people.ana, `public.cert_exam_answer($1::uuid, 0, '"a"'::jsonb)`, [benExam])).toMatchObject({ ok: false, reason: 'not_found' });
		await expect(rpc(people.ben, `public.cert_exam_flag($1::uuid, 'sneeze')`, [benExam])).rejects.toThrow(/unknown flag kind/);
		expect(await rpc(people.ben, `public.cert_exam_flag($1::uuid, 'blur')`, [benExam])).toEqual({ ok: true, flags_count: 1 });
		expect(await rpc(people.ben, `public.cert_exam_flag($1::uuid, 'fullscreen_exit')`, [benExam])).toEqual({ ok: true, flags_count: 2 });
		const live = await rpc<Json[]>(people.certifier, 'public.cert_exam_live(null)');
		expect(live).toHaveLength(1);
		expect(live[0]).toMatchObject({ exam_id: benExam, state: 'in_progress', current_index: 0, total: 2, student: { email: people.ben.email, name: 'Ben Ortiz' } });
		expect((live[0].flags as Json[]).map((f) => f.kind)).toEqual(['blur', 'fullscreen_exit']);
		expect(await rpc(millOnly, 'public.cert_exam_live(null)')).toEqual([]);
		expect(await rpc(people.bystander, 'public.cert_exam_live(null)')).toMatchObject({ ok: false, reason: 'not_found' });

		const a0 = await rpc(people.ben, 'public.cert_exam_answer($1::uuid, 0, $2::jsonb)', [benExam, JSON.stringify(await keyFor(db, benExam, 0))]);
		expect(a0.ok).toBe(true);
		expect(Object.keys(a0.question as Json).sort()).toEqual(QUESTION_KEYS);
		expect(JSON.stringify(a0)).not.toMatch(/"answer"|"explain"|"accept"|e-stop|estop/);
		// Submitting with one of two answered: the next describe reads this as a failed exam.
		expect(await rpc(people.ben, 'public.cert_exam_submit($1::uuid)', [benExam]).then((r) => r.ok)).toBe(true);
	});
});

// ===========================================================================
describe('pass, fail, cooldown and the result views', () => {
	test('a fail tells the student only the topics and the date, starts the 7-day cooldown, and the certifier sees every question', async () => {
		const exam = (await db.sql<{ id: string; attempt_id: string }>(`select id, attempt_id from public.cert_exam_attempts where email = $1`, [people.ben.email])).rows[0];
		const row = await examState(exam.id);
		expect(row).toMatchObject({ state: 'submitted', passed: false, current_index: 1 });
		const me = await rpc(people.ben, 'public.cert_me()');
		const attempt = (me.attempts as Json[]).find((a) => a.id === exam.attempt_id) as Json;
		const summary = (attempt.exams as Json[])[0];
		expect(summary).toMatchObject({ id: exam.id, state: 'submitted', passed: false, flags_count: 2 });
		expect(summary).not.toHaveProperty('detail');
		expect((summary.missed_topics as string[]).length).toBeGreaterThan(0);
		const cooldown = new Date(attempt.cooldown_until as string).getTime();
		const submitted = new Date(summary.submitted_at as string).getTime();
		expect(cooldown - submitted).toBe(7 * 24 * 3600 * 1000);
		expect(attempt.next_part).toBe('exam');
		// The notification named the topics and a date, never a weekday.
		const { rows: notes } = await db.sql<{ body: string }>(`select body from public.cert_notifications where email = $1 and kind = 'review_returned' and payload ->> 'exam' = 'failed'`, [people.ben.email]);
		expect(notes).toHaveLength(1);
		expect(notes[0].body).toMatch(/Topics to study: /);
		expect(notes[0].body).not.toMatch(WEEKDAY);
		expect(notes[0].body).not.toMatch(/e-stop|estop|"a"/);
		// Nothing new may be requested or released during the cooldown.
		expect(await rpc(people.ben, 'public.cert_seat_request($1::uuid, null, null)', [exam.attempt_id])).toMatchObject({ ok: false, reason: 'cooldown' });
		const spare = (await db.sql<{ id: string }>(`select id from public.cert_seats where attempt_id = $1 and state = 'approved'`, [exam.attempt_id])).rows[0].id;
		expect(await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [spare])).toMatchObject({ ok: false, reason: 'cooldown' });
		// The certifier's view: per question, with the student's answer and correct or not, and no key text.
		const result = await rpc(people.certifier, 'public.cert_exam_result($1::uuid)', [exam.id]);
		expect(result.passed).toBe(false);
		const per = result.per_question as Json[];
		expect(per).toHaveLength(2);
		for (const p of per) expect(Object.keys(p).sort()).toEqual(['answer_given', 'correct', 'index', 'prompt', 'topic', 'type']);
		expect(per.map((p) => p.correct)).toEqual([true, false]);
		expect(per[1].answer_given).toBeNull();
		expect(JSON.stringify(result)).not.toMatch(/"accept"|"explain"/);
		expect((result.flags as Json[]).length).toBe(2);
		// Ben holds no authority, so his own exam's question-level result is simply not there for him (the topics reach him through cert_me).
		expect(await rpc(people.ben, 'public.cert_exam_result($1::uuid)', [exam.id])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(millOnly, 'public.cert_exam_result($1::uuid)', [exam.id])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.bystander, 'public.cert_exam_result($1::uuid)', [exam.id])).toMatchObject({ ok: false, reason: 'not_found' });
		// The student view for a certifier carries the detail; for the student's own address it does not.
		const view = await rpc(people.certifier, 'public.cert_student_view($1)', [people.ben.email]);
		const viewed = ((view.attempts as Json[])[0].exams as Json[])[0];
		expect((viewed.detail as Json).per_question).toHaveLength(2);
	});

	test('a pass checks the exam off under the proctor and leaves no cooldown; a release past its window expires; a late answer is time up', async () => {
		const seat = (await db.sql<{ id: string; attempt_id: string }>(`select id, attempt_id from public.cert_seats where email = $1 and state = 'requested'`, [people.ana.email])).rows;
		// Ana cancelled hers; ask again and approve.
		let anaAttempt: string;
		if (seat.length === 0) {
			anaAttempt = (await db.sql<{ id: string }>(`select id from public.cert_attempts where email = $1 and state = 'active'`, [people.ana.email])).rows[0].id;
		} else {
			anaAttempt = seat[0].attempt_id;
		}
		const req = await rpc(people.ana, 'public.cert_seat_request($1::uuid, null, null)', [anaAttempt]);
		expect(req.ok).toBe(true);
		const seatId = (req.seat as Json).id as string;
		await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [seatId]);
		// First release, left to expire.
		const expired = await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [seatId]);
		await db.sql(`update public.cert_exam_attempts set release_expires_at = now() - interval '1 minute' where id = $1`, [expired.exam_id]);
		expect(await rpc(people.ana, 'public.cert_exam_open($1::uuid)', [expired.exam_id])).toMatchObject({ ok: false, reason: 'release_expired' });
		expect((await examState(expired.exam_id as string)).state).toBe('expired');
		// A second release goes through now (the seat is used, so a new approved seat is needed).
		await db.sql(`insert into public.cert_seats (attempt_id, certification_id, email, state) values ($1, $2, $3, 'approved')`, [anaAttempt, safe.id, people.ana.email]);
		const seat2 = (await db.sql<{ id: string }>(`select id from public.cert_seats where attempt_id = $1 and state = 'approved'`, [anaAttempt])).rows[0].id;
		const released = await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [seat2]);
		expect(released.ok).toBe(true);
		const examId = released.exam_id as string;
		await rpc(people.ana, 'public.cert_exam_open($1::uuid)', [examId]);
		for (let i = 0; i < 2; i += 1) {
			const answered = await rpc(people.ana, 'public.cert_exam_answer($1::uuid, $2, $3::jsonb)', [examId, i, JSON.stringify(await keyFor(db, examId, i))]);
			expect(answered.ok).toBe(true);
		}
		const result = await rpc(people.ana, 'public.cert_exam_submit($1::uuid)', [examId]);
		expect(result).toMatchObject({ ok: true, passed: true, total: 2, correct: 2, missed_topics: [], cooldown_until: null });
		expect(Object.keys(result).sort()).toEqual(['cooldown_until', 'correct', 'missed_topics', 'notify', 'ok', 'passed', 'total']);
		expect((result.notify as Json[]).map((n) => n.kind)).toEqual(['part_checked']);
		const { rows } = await db.sql<{ state: string; by: string; next: string }>(
			`select k.state, k.checked_by as by, public._cert_next_part($1) as next from public.cert_checks k where k.attempt_id = $1 and k.part = 'exam'`,
			[anaAttempt]
		);
		expect(rows[0]).toEqual({ state: 'done', by: people.certifier.email, next: 'autonomous' });
		expect(await rpc(people.ana, 'public.cert_exam_submit($1::uuid)', [examId])).toMatchObject({ ok: false, reason: 'not_open' });

		// Time up: a third person, deadline pushed into the past.
		const bysAttempt = await readyForExam(people.bystander);
		const r3 = await rpc(people.bystander, 'public.cert_seat_request($1::uuid, null, null)', [bysAttempt]);
		await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [(r3.seat as Json).id]);
		const rel3 = await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [(r3.seat as Json).id]);
		await rpc(people.bystander, 'public.cert_exam_open($1::uuid)', [rel3.exam_id]);
		await db.sql(`update public.cert_exam_attempts set deadline = now() - interval '1 minute' where id = $1`, [rel3.exam_id]);
		const late = await rpc(people.bystander, `public.cert_exam_answer($1::uuid, 0, '"a"'::jsonb)`, [rel3.exam_id]);
		expect(late).toMatchObject({ ok: false, reason: 'time_up' });
		expect((late.result as Json)).toMatchObject({ passed: false, correct: 0, total: 2 });
		expect((await examState(rel3.exam_id as string)).state).toBe('submitted');
		expect(await rpc(people.bystander, 'public.cert_exam_open($1::uuid)', [rel3.exam_id])).toMatchObject({ ok: false, reason: 'submitted' });
	});

	test('the proctor ends an open exam as it stands, and never their own', async () => {
		// The certifier's own attempt was readied earlier; a seat for it is approved by the admin and released by the admin.
		const ownAttempt = (await db.sql<{ id: string }>(`select id from public.cert_attempts where email = $1 and state = 'active'`, [people.certifier.email])).rows[0].id;
		const req = await rpc(people.certifier, 'public.cert_seat_request($1::uuid, null, null)', [ownAttempt]);
		expect(req.ok).toBe(true);
		await rpc(people.admin, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [(req.seat as Json).id]);
		const rel = await rpc(people.admin, 'public.cert_exam_release($1::uuid)', [(req.seat as Json).id]);
		expect(rel.ok).toBe(true);
		await rpc(people.certifier, 'public.cert_exam_open($1::uuid)', [rel.exam_id]);
		expect(await rpc(people.certifier, `public.cert_exam_end($1::uuid, 'done')`, [rel.exam_id])).toMatchObject({ ok: false, reason: 'self' });
		expect(await rpc(millOnly, `public.cert_exam_end($1::uuid, 'done')`, [rel.exam_id])).toMatchObject({ ok: false, reason: 'not_found' });
		const ended = await rpc(people.admin, `public.cert_exam_end($1::uuid, 'Left the room')`, [rel.exam_id]);
		expect(ended.ok).toBe(true);
		expect((ended.result as Json)).toMatchObject({ state: 'submitted', passed: false });
		expect(((ended.result as Json).per_question as Json[]).length).toBe(2);
		expect(await rpc(people.admin, `public.cert_exam_end($1::uuid, 'again')`, [rel.exam_id])).toMatchObject({ ok: false, reason: 'closed' });
		// A certifier reading their OWN exam's question-level result is refused as self; the admin reads it.
		expect(await rpc(people.certifier, 'public.cert_exam_result($1::uuid)', [rel.exam_id])).toMatchObject({ ok: false, reason: 'self' });
		expect((await rpc(people.admin, 'public.cert_exam_result($1::uuid)', [rel.exam_id])).passed).toBe(false);
		const { rows } = await db.sql<{ reason: string }>(`select reason from public.cert_events where kind = 'exam.submitted' and attempt_id = $1`, [ownAttempt]);
		expect(rows[0].reason).toBe('Left the room');
	});
});

// ===========================================================================
describe('the draw and the scorer', () => {
	test('every draw covers every topic, repeats nothing, fills to the exam length, and shuffles order and options', async () => {
		const pool = [...samplePool(4), { topic: 'ppe', type: 'multiple_choice', prompt: 'Extra', options: [{ key: 'a', text: '1' }, { key: 'b', text: '2' }, { key: 'c', text: '3' }, { key: 'd', text: '4' }], answer: 'd' }];
		const cert = await publishSample(db, people, 'DRAW-1', {
			overrides: { exam: { time_limit_minutes: 20, questions_per_exam: 4, topics: [{ id: 'ppe', name: 'PPE', minimum: 1 }, { id: 'stops', name: 'Stops', minimum: 2 }] } },
			pool,
			grant: false
		});
		const orders = new Set<string>();
		const optionOrders = new Set<string>();
		for (let i = 0; i < 25; i += 1) {
			const { rows } = await db.sql<{ d: Json[] }>(`select public._cert_exam_draw($1::uuid, $2::uuid) as d`, [cert.id, cert.revisionId]);
			const draw = rows[0].d;
			expect(draw).toHaveLength(4);
			const ids = draw.map((q) => q.question_id as string);
			expect(new Set(ids).size).toBe(4);
			expect(draw.filter((q) => q.topic === 'stops').length).toBeGreaterThanOrEqual(2);
			expect(draw.filter((q) => q.topic === 'ppe').length).toBeGreaterThanOrEqual(1);
			orders.add(ids.join(','));
			for (const q of draw) {
				if (q.type === 'multiple_choice' || q.type === 'multiple_select') {
					const { rows: opt } = await db.sql<{ keys: string[] }>(`select array_agg(o ->> 'key' order by o ->> 'key') as keys from public.cert_exam_questions q, jsonb_array_elements(q.options) o where q.id = $1`, [q.question_id]);
					expect([...(q.option_order as string[])].sort()).toEqual(opt[0].keys);
					optionOrders.add(`${q.question_id}:${(q.option_order as string[]).join('')}`);
				} else {
					expect(q.option_order).toBeNull();
				}
			}
		}
		expect(orders.size).toBeGreaterThan(1);
		expect(optionOrders.size).toBeGreaterThan(pool.filter((q) => q.type !== 'numeric' && q.type !== 'short').length);
		// A topic the pool cannot cover raises, and the release turns that into a refusal.
		await rpc(people.admin, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [cert.id, JSON.stringify(samplePool(1))]);
		await expect(db.sql(`select public._cert_exam_draw($1::uuid, $2::uuid)`, [cert.id, cert.revisionId])).rejects.toThrow(/pool cannot cover the exam/);
	});

	test('the scorer, per type, against planted right and wrong answers', async () => {
		const cases: [string, string, string, boolean][] = [
			['multiple_choice', '"a"', '"a"', true],
			['multiple_choice', '"b"', '"a"', false],
			['multiple_choice', '["a"]', '"a"', false],
			['multiple_select', '["c", "a"]', '["a", "c"]', true],
			['multiple_select', '["a", "a", "c"]', '["a", "c"]', true],
			['multiple_select', '["a"]', '["a", "c"]', false],
			['multiple_select', '"a"', '["a"]', false],
			['numeric', '12.6', '{"value": 12.5, "tolerance": 0.1}', true],
			['numeric', '"12.4"', '{"value": 12.5, "tolerance": 0.1}', true],
			['numeric', '12.7', '{"value": 12.5, "tolerance": 0.1}', false],
			['numeric', '"twelve"', '{"value": 12.5, "tolerance": 0.1}', false],
			['short', '"  A Reamer. "', '{"accept": ["reamer", "a reamer"]}', true],
			['short', '"reamer"', '{"accept": ["Reamer."]}', true],
			['short', '"drill"', '{"accept": ["reamer"]}', false],
			['short', 'null', '{"accept": ["reamer"]}', false]
		];
		for (const [type, answer, key, want] of cases) {
			const { rows } = await db.sql<{ ok: boolean }>(`select public._cert_exam_score_one($1, $2::jsonb, $3::jsonb, null) as ok`, [type, answer, key]);
			expect(rows[0].ok, `${type} ${answer} vs ${key}`).toBe(want);
		}
	});
});
