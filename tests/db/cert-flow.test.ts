// tests/db/cert-flow.test.ts
//
// THE WHOLE EARNING FLOW, END TO END, through the real RPCs as the people who
// press them: an admin builds and publishes a certification and grants a
// certifier; a student watches the training, hands in the guided project, is
// reviewed, books and sits the exam, hands in the autonomous project, is
// checked out in person and is awarded; the award verifies with no session,
// prints, lands on the holders board and in the frc-app mirror. Then the
// failure path: a second student fails the exam and is told the topics and
// the day, nothing more, and cannot sit again inside the cooldown.
//
// What would fail silently is a step whose refusal or answer changed shape
// between two files: every step here reads what the NEXT step needs off the
// previous step's answer, so a drifted key breaks the chain where it drifted.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	WITH_CERT, rpcAs, rpcAnon, rpcService, seedPeople, publishSample, keyFor, signedPayload, serialFor, VIDEO_KEY,
	type CertPeople, type Json, type SampleCert
} from './cert-chain';

const WEEKDAY = /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/;
/** What an exam question's key looks like on the wire; cert_exam_open, _answer and _submit must carry none of it. */
const KEY_WORDS = /"answer"|"explain"|"accept"|e-stop|estop/;
/** The exam POOL's own words (a prompt, an accepted spelling): no student-facing page or desk read carries them. The
 * practice quiz and the quick checks legitimately carry an answer and an explanation, so those keys are not pinned there. */
const EXAM_WORDS = /"accept"|e-stop|estop|PPE question|PPE number|Stops word|Stops pick/;

let db: TestDb;
let people: CertPeople;
let safe: SampleCert;
let attemptId: string;
let examId: string;
let serial: string;

const rpc = <T = Json>(user: SeededUser, call: string, params: unknown[] = []) => rpcAs<T>(db, user, call, params);

beforeAll(async () => {
	db = await startTestDb(WITH_CERT);
	people = await seedPeople(db);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the earning flow', () => {
	test('an admin publishes SAFE-1 and grants a certifier; a student sees it in the catalog and nobody else can start on it before it is published', async () => {
		// Before anything is published, the catalog is empty for a student.
		expect(await rpc<Json[]>(people.ana, 'public.cert_catalog()')).toEqual([]);
		expect(await rpc(people.ana, `public.cert_start('SAFE-1')`)).toMatchObject({ ok: false, reason: 'not_found' });
		safe = await publishSample(db, people, 'SAFE-1');
		const catalog = await rpc<Json[]>(people.ana, 'public.cert_catalog()');
		expect(catalog.map((c) => c.code)).toEqual(['SAFE-1']);
		expect(catalog[0]).toMatchObject({ name: 'Sample SAFE-1', level: 1, category: 'Safety', state: 'published' });
		expect(await rpc(people.certifier, 'public.cert_is_certifier()')).toBe(true);
		expect(await rpc(people.ana, 'public.cert_is_certifier()')).toBe(false);
		// The student's read of the certification carries no exam key.
		const page = await rpc(people.ana, `public.cert_get('SAFE-1')`);
		expect(page.ok).not.toBe(false);
		expect(JSON.stringify(page)).not.toMatch(EXAM_WORDS);
	});

	test('the student starts, watches the training to coverage, and the training checks itself off', async () => {
		const started = await rpc(people.ana, `public.cert_start('SAFE-1')`);
		expect(started.ok, JSON.stringify(started)).toBe(true);
		attemptId = (started.attempt as Json).id as string;
		expect((started.attempt as Json).next_part).toBe('training');
		expect(await rpc(people.ana, `public.cert_start('SAFE-1')`)).toMatchObject({ ok: false });
		// A fast watch is refused; a short one does not finish; coverage finishes it.
		expect((await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 100]]'::jsonb, 2.5, 0, 100)`, [safe.id, VIDEO_KEY])).ok).toBe(false);
		const half = await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 50]]'::jsonb, 1, 0, 50)`, [safe.id, VIDEO_KEY]);
		expect(half.ok).toBe(true);
		expect(half.training_done).toBe(false);
		const rest = await rpc(people.ana, `public.cert_watch_report($1::uuid, $2, 100, '[[48, 100]]'::jsonb, 1, 0, 52)`, [safe.id, VIDEO_KEY]);
		expect(rest.training_done).toBe(true);
		const mine = await rpc(people.ana, 'public.cert_me()');
		const attempt = (mine.attempts as Json[]).find((a) => a.id === attemptId) as Json;
		expect(attempt.next_part).toBe('guided');
		expect(mine.awards).toEqual([]);
	});

	test('the guided project is handed in, reaches the certifier’s desk, and a pass checks it off; the certifier cannot review their own work', async () => {
		const sub = await rpc(people.ana, `public.cert_submit($1::uuid, 'guided', '{"text": "12.5 mm"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [attemptId]);
		expect(sub.ok, JSON.stringify(sub)).toBe(true);
		const desk = await rpc(people.certifier, 'public.cert_desk()');
		const queue = desk.queue as Json[];
		expect(queue.some((q) => q.submission_id === sub.submission_id || q.id === sub.submission_id)).toBe(true);
		expect(JSON.stringify(desk)).not.toMatch(EXAM_WORDS);
		// A student sees no desk.
		expect(await rpc(people.ana, 'public.cert_desk()')).toMatchObject({ ok: false, reason: 'not_found' });
		// The certifier's own attempt: a hand-in they cannot pass themselves.
		const own = await rpc(people.certifier, `public.cert_start('SAFE-1')`);
		await rpc(people.certifier, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 100]]'::jsonb, 1, 0, 100)`, [safe.id, VIDEO_KEY]);
		const ownSub = await rpc(people.certifier, `public.cert_submit($1::uuid, 'guided', '{"text": "mine"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [(own.attempt as Json).id]);
		expect(ownSub.ok).toBe(true);
		expect(await rpc(people.certifier, `public.cert_review($1::uuid, 'pass', '')`, [ownSub.submission_id])).toMatchObject({ ok: false, reason: 'self' });
		// A fail needs feedback; a pass checks the part off.
		expect(await rpc(people.certifier, `public.cert_review($1::uuid, 'fail', '')`, [sub.submission_id])).toMatchObject({ ok: false });
		const review = await rpc(people.certifier, `public.cert_review($1::uuid, 'pass', 'Nice work')`, [sub.submission_id]);
		expect(review.ok, JSON.stringify(review)).toBe(true);
		const attempt = ((await rpc(people.ana, 'public.cert_me()')).attempts as Json[]).find((a) => a.id === attemptId) as Json;
		expect(attempt.next_part).toBe('exam');
		const notes = await rpc<Json[]>(people.ana, 'public.cert_notifications_mine(10)');
		expect(notes.some((n) => n.kind === 'part_checked')).toBe(true);
	});

	test('a seat is requested, approved and released; the exam is opened, answered and passed, and the key never reaches the student', async () => {
		const seat = await rpc(people.ana, 'public.cert_seat_request($1::uuid, null, null)', [attemptId]);
		expect(seat.ok, JSON.stringify(seat)).toBe(true);
		const seatId = (seat.seat as Json).id as string;
		expect(await rpc(people.ana, 'public.cert_exam_release($1::uuid)', [seatId])).toMatchObject({ ok: false });
		expect((await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [seatId])).ok).toBe(true);
		// An approved seat for today is on the desk's release list (the Sittings page's rows) until it is used.
		const before = await rpc(people.certifier, 'public.cert_desk()');
		expect((before.seats_today as Json[]).map((x) => x.seat_id)).toEqual([seatId]);
		expect((before.seats_today as Json[])[0]).toMatchObject({ state: 'approved', student: { email: people.ana.email }, certification: { code: 'SAFE-1' } });
		const released = await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [seatId]);
		expect(released.ok, JSON.stringify(released)).toBe(true);
		expect((await rpc(people.certifier, 'public.cert_desk()')).seats_today).toEqual([]);
		examId = released.exam_id as string;
		const total = released.total as number;
		expect(total).toBe(2);
		const opened = await rpc(people.ana, 'public.cert_exam_open($1::uuid)', [examId]);
		expect(opened.ok).toBe(true);
		expect(JSON.stringify(opened)).not.toMatch(KEY_WORDS);
		for (let i = 0; i < total; i += 1) {
			const answered = await rpc(people.ana, 'public.cert_exam_answer($1::uuid, $2, $3::jsonb)', [examId, i, JSON.stringify(await keyFor(db, examId, i))]);
			expect(answered.ok, JSON.stringify(answered)).toBe(true);
			expect(JSON.stringify(answered)).not.toMatch(KEY_WORDS);
		}
		const result = await rpc(people.ana, 'public.cert_exam_submit($1::uuid)', [examId]);
		expect(result).toMatchObject({ ok: true, passed: true, correct: 2, total: 2, missed_topics: [], cooldown_until: null });
		expect(Object.keys(result).sort()).toEqual(['cooldown_until', 'correct', 'missed_topics', 'notify', 'ok', 'passed', 'total']);
		const attempt = ((await rpc(people.ana, 'public.cert_me()')).attempts as Json[]).find((a) => a.id === attemptId) as Json;
		expect(attempt.next_part).toBe('autonomous');
		expect(attempt.cooldown_until).toBeNull();
	});

	test('the autonomous project and the in-person checkout close the last two parts, and the award is prepared, signed and committed', async () => {
		const auto = await rpc(people.ana, `public.cert_submit($1::uuid, 'autonomous', '{"text": "alone"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [attemptId]);
		expect(auto.ok).toBe(true);
		// Not yet: the award waits for every part.
		expect(await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [attemptId])).toMatchObject({ ok: false, reason: 'incomplete', next_part: 'autonomous' });
		expect((await rpc(people.certifier, `public.cert_review($1::uuid, 'pass', '')`, [auto.submission_id])).ok).toBe(true);
		expect(await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [attemptId])).toMatchObject({ ok: false, reason: 'incomplete', next_part: 'checkout' });
		expect((await rpc(people.certifier, `public.cert_checkout_in_person($1::uuid, 'pass', 'Smooth')`, [attemptId])).ok).toBe(true);
		const prepared = await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [attemptId]);
		expect(prepared.ok, JSON.stringify(prepared)).toBe(true);
		serial = serialFor('flow-ana');
		const committed = await rpc(people.certifier, 'public.cert_award_commit($1::uuid, $2, $3, $4, $5::jsonb)', [
			attemptId, serial, 'c2lnbmF0dXJl', 'key-2026', JSON.stringify(signedPayload(prepared.record as Json, serial))
		]);
		expect(committed.ok, JSON.stringify(committed)).toBe(true);
		expect((committed.award as Json).status).toBe('valid');
		const mine = await rpc(people.ana, 'public.cert_me()');
		expect((mine.attempts as Json[]).find((a) => a.id === attemptId)).toMatchObject({ state: 'complete', next_part: null });
		expect(mine.awards as Json[]).toHaveLength(1);
		expect((mine.awards as Json[])[0]).toMatchObject({ serial, code: 'SAFE-1', name: 'Sample SAFE-1', level: 1, status: 'valid', awarded_by_name: 'Cee Certifier' });
		expect(Object.keys((mine.awards as Json[])[0]).sort()).toEqual(['awarded_at', 'awarded_by_name', 'category', 'code', 'expires_at', 'id', 'level', 'name', 'revision_id', 'serial', 'status']);
		expect(mine.notifications_unread).toBeGreaterThan(0);
	});

	test('the award verifies with no session, prints for its holder, sits on the holders board and rides the frc-app mirror', async () => {
		const verify = await rpcAnon(db, 'public.cert_verify($1)', [serial.toLowerCase().replace(/-/g, '')]);
		expect(verify).toMatchObject({ found: true, holder_name: 'Ana Reyes', code: 'SAFE-1', status: 'valid' });
		expect(JSON.stringify(verify)).not.toContain('@');
		const certificate = await rpc(people.ana, 'public.cert_certificate($1)', [serial]);
		expect(certificate).toMatchObject({ serial, holder_name: 'Ana Reyes', definition: 'Knows the rules.', verify_url_path: `/certifications/verify?serial=${serial}` });
		expect(await rpc(people.ben, 'public.cert_certificate($1)', [serial])).toMatchObject({ ok: false, reason: 'not_found' });
		const holders = await rpc(people.ben, 'public.cert_holders()');
		expect(((holders.by_certification as Json[])[0].holders as Json[])[0]).toMatchObject({ name: 'Ana Reyes', status: 'valid' });
		expect(JSON.stringify(holders)).not.toContain('@');
		const snapshot = await rpcService(db, 'public.cert_mirror_snapshot()');
		expect(Object.keys(snapshot).sort()).toEqual(['catalog', 'holders', 'source_revision']);
		expect(snapshot.holders).toEqual([{
			serial, email: people.ana.email, holder_name: 'Ana Reyes', code: 'SAFE-1', status: 'active',
			awarded_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/), awarded_by_name: 'Cee Certifier', expires_at: null
		}]);
		expect((snapshot.catalog as Json[]).map((c) => c.code)).toEqual(['SAFE-1']);
		const telemetry = await rpc(people.certifier, 'public.cert_telemetry()');
		expect(telemetry.completion_days).toEqual([{ code: 'SAFE-1', average: 0, count: 1 }]);
		expect((telemetry.active_by_certification as Json[])[0]).toMatchObject({ code: 'SAFE-1', active: 1, dormant: 0 });
	});
});

// ===========================================================================
describe('the failure path', () => {
	let benAttempt: string;
	let benExam: string;

	test('a wrong exam fails: the student learns the topics to study and the day they may sit again, and nothing about the questions', async () => {
		const started = await rpc(people.ben, `public.cert_start('SAFE-1')`);
		benAttempt = (started.attempt as Json).id as string;
		await rpc(people.ben, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 100]]'::jsonb, 1, 0, 100)`, [safe.id, VIDEO_KEY]);
		const sub = await rpc(people.ben, `public.cert_submit($1::uuid, 'guided', '{"text": "ok"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [benAttempt]);
		expect((await rpc(people.certifier, `public.cert_review($1::uuid, 'pass', '')`, [sub.submission_id])).ok).toBe(true);
		const seat = await rpc(people.ben, 'public.cert_seat_request($1::uuid, null, null)', [benAttempt]);
		const seatId = (seat.seat as Json).id as string;
		await rpc(people.certifier, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [seatId]);
		const released = await rpc(people.certifier, 'public.cert_exam_release($1::uuid)', [seatId]);
		benExam = released.exam_id as string;
		expect((await rpc(people.ben, 'public.cert_exam_open($1::uuid)', [benExam])).ok).toBe(true);
		for (let i = 0; i < (released.total as number); i += 1) {
			expect((await rpc(people.ben, `public.cert_exam_answer($1::uuid, $2, '"wrong"'::jsonb)`, [benExam, i])).ok).toBe(true);
		}
		const result = await rpc(people.ben, 'public.cert_exam_submit($1::uuid)', [benExam]);
		expect(result).toMatchObject({ ok: true, passed: false, correct: 0, total: 2 });
		expect((result.missed_topics as string[]).sort()).toEqual(['ppe', 'stops']);
		expect(Object.keys(result).sort()).toEqual(['cooldown_until', 'correct', 'missed_topics', 'notify', 'ok', 'passed', 'total']);
		expect(JSON.stringify(result)).not.toMatch(KEY_WORDS);
		expect(JSON.stringify(result)).not.toMatch(/per_question|option_order|question_id/);
		const note = (result.notify as Json[])[0];
		expect(note).toMatchObject({ email: people.ben.email, kind: 'review_returned' });
		expect(note.body).toMatch(/Topics to study: (ppe, stops|stops, ppe)\. You can take it again on [A-Z][a-z]+ \d{1,2}, \d{4}\./);
		expect(note.body).not.toMatch(WEEKDAY);
		// The student's own view: a summary with the topics, no detail; a certifier's view carries every question.
		const attempt = ((await rpc(people.ben, 'public.cert_me()')).attempts as Json[]).find((a) => a.id === benAttempt) as Json;
		const exam = (attempt.exams as Json[])[0];
		expect(exam).toMatchObject({ id: benExam, passed: false, state: 'submitted' });
		expect(exam).not.toHaveProperty('detail');
		expect(attempt.next_part).toBe('exam');
		expect(new Date(attempt.cooldown_until as string).getTime() - new Date(exam.submitted_at as string).getTime()).toBe(7 * 24 * 3600 * 1000);
		expect(JSON.stringify(attempt)).not.toMatch(EXAM_WORDS);
		expect(JSON.stringify(attempt)).not.toMatch(/per_question|answer_given|option_order|question_id/);
		const staff = await rpc(people.certifier, 'public.cert_exam_result($1::uuid)', [benExam]);
		expect((staff.per_question as Json[]).map((q) => q.correct)).toEqual([false, false]);
		expect(JSON.stringify(staff)).not.toMatch(/"accept"|"explain"/);
	});

	test('inside the cooldown a seat and a release are refused with the day in words; the award is refused as incomplete', async () => {
		const again = await rpc(people.ben, 'public.cert_seat_request($1::uuid, null, null)', [benAttempt]);
		expect(again).toMatchObject({ ok: false, reason: 'cooldown' });
		expect(again.message).toMatch(/^You can take this exam again on [A-Z][a-z]+ \d{1,2}, \d{4}\./);
		expect(again.message).not.toMatch(WEEKDAY);
		expect(typeof again.cooldown_until).toBe('string');
		expect(await rpc(people.certifier, 'public.cert_award_prepare($1::uuid)', [benAttempt])).toMatchObject({ ok: false, reason: 'incomplete', next_part: 'exam' });
		expect(await rpc(people.ben, 'public.cert_exam_open($1::uuid)', [benExam])).toMatchObject({ ok: false, reason: 'submitted' });
		// Once the cooldown is over (moved by hand here), a seat can be asked for again.
		await db.sql(`update public.cert_exam_attempts set submitted_at = submitted_at - interval '8 days' where id = $1`, [benExam]);
		const later = await rpc(people.ben, 'public.cert_seat_request($1::uuid, null, null)', [benAttempt]);
		expect(later.ok, JSON.stringify(later)).toBe(true);
		expect(await rpc(people.ben, 'public.cert_holders()')).toMatchObject({});
		expect((await rpc(people.ben, 'public.cert_me()')).awards).toEqual([]);
	});
});
