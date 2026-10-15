// tests/db/cert-chain.ts
//
// What the IDEA Certification Portal suites share (ledger 0391, migrations
// 0260 to 0264), and nothing they assert. The whole tree, read off disk,
// behind the fixture completion (the chain-0230 shape): WITH_CERT is exactly
// what production holds once the five files are applied, PRE_CERT is what it
// held before, and every suite boots one or the other.
//
// The fixtures here build a certification THROUGH THE REAL RPCs (save, pool,
// publish, grant) rather than by raw insert, for the reason the harness applies
// real migrations: what the tests exercise is the repo's own SQL.

import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, type SeededUser, type TestDb } from './harness';

export {
	pasteTrap,
	keysDeep,
	catalogFingerprint,
	canExecute,
	overloads,
	tablePrivileges,
	refusal
} from './chain-0230';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

/** The five certification files, in apply order. */
export const CERT_FILES: readonly string[] = ALL.filter((f) => f >= '0260' && f < '0265');
if (CERT_FILES.length !== 5) {
	throw new Error(`expected the five certification migrations 0260..0264, found ${CERT_FILES.length}`);
}

/** Every migration before 0260, behind the fixture completion. */
export const PRE_CERT: readonly string[] = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < '0260')];

/** The whole tree with the five files applied. */
export const WITH_CERT: readonly string[] = [FIXTURE_COMPLETION, ...ALL];

/** One file's text, read when asked, so a mutation run reads the mutant. */
export function certSql(file: string): string {
	return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

export type Json = Record<string, unknown>;

/** `select <call> as r` as one signed-in person; the function's jsonb back. */
export async function rpcAs<T = Json>(db: TestDb, user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
}

/** The same, as a signed-out request. */
export async function rpcAnon<T = Json>(db: TestDb, call: string, params: unknown[] = []): Promise<T> {
	return db.asAnon(async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
}

/** The same, as a server holding the service key (no subject). */
export async function rpcService<T = Json>(db: TestDb, call: string, params: unknown[] = []): Promise<T> {
	return db.asServiceRole(async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
}

export interface CertPeople {
	/** An admin BY ROSTER (app_admins), not the pinned owner. */
	admin: SeededUser;
	/** Granted authority on the sample certification by the fixture. */
	certifier: SeededUser;
	ana: SeededUser;
	ben: SeededUser;
	/** Signed in, no authority, no attempt. */
	bystander: SeededUser;
}

export async function seedPeople(db: TestDb): Promise<CertPeople> {
	const admin = await createUser(db, 'admin@boscotech.edu', 'Ad Min');
	await db.sql(`insert into public.app_admins (email, granted_by) values ($1, 'apina@boscotech.edu') on conflict do nothing`, [admin.email]);
	const certifier = await createUser(db, 'cert@boscotech.edu', 'Cee Certifier');
	const ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	const ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	const bystander = await createUser(db, 'bys@boscotech.net', 'By Stander');
	return { admin, certifier, ana, ben, bystander };
}

/** The 11 character id of a public video; the shape is all the database checks. */
export const VIDEO_ID = 'dQw4w9WgXcQ';
export const VIDEO_KEY = `yt:${VIDEO_ID}`;

/** A complete package. `code` is the identity; overrides are spread on top. */
export function samplePackage(code: string, overrides: Json = {}): Json {
	return {
		format: 'idea-certification',
		version: 1,
		code,
		name: `Sample ${code}`,
		level: 1,
		category: 'Safety',
		sort_order: 10,
		renewal: 'never',
		definition: 'Knows the rules.',
		allows: 'Working in the shop.',
		does_not_allow: 'Powered machines.',
		prerequisites: [],
		parts: { guided: true, exam: true, autonomous: true, checkout: true },
		training: {
			items: [{ kind: 'video', key: VIDEO_KEY, title: 'Part 1', youtube_id: VIDEO_ID, start: 0 }],
			quick_checks: [{ id: 'qc-1', after: VIDEO_KEY, prompt: 'Which way?', options: ['Toward you', 'Away'], answer: 0, explain: 'Fixed jaw.' }]
		},
		practice_quiz: [{ id: 'p1', prompt: 'What?', options: ['x', 'y'], answer: 1, explain: 'because' }],
		study_guide: 'Read this.',
		common_mistakes: [{ title: 'Rushing', body: 'Slow down.' }],
		exam: {
			time_limit_minutes: 30,
			questions_per_exam: 2,
			topics: [
				{ id: 'ppe', name: 'PPE', minimum: 1 },
				{ id: 'stops', name: 'Stops', minimum: 1 }
			]
		},
		guided_project: {
			objective: 'Make a thing',
			spec: 'Spec',
			acceptance: ['Flat'],
			references: [{ label: 'Drawing', href: 'https://example.test/drawing.pdf' }],
			steps: [{ title: 's1', body: 'b', fade: 'full' }, { title: 's2', body: '', fade: 'hint', hint: 'Think.' }],
			self_inspection: ['I checked'],
			evidence: [{ kind: 'text', label: 'Dims', required: true }, { kind: 'photo', label: 'Part', required: false }]
		},
		autonomous_project: {
			objective: 'Make another',
			spec: 'Spec',
			acceptance: ['Flat'],
			references: [],
			self_inspection: ['I checked'],
			evidence: [{ kind: 'text', label: 'Dims', required: true }]
		},
		checkout: { card: 'Do it', filming_guide: 'Film it' },
		...overrides
	};
}

/** A pool of `perTopic` questions for each of the two sample topics, mixed types. */
export function samplePool(perTopic = 2): Json[] {
	const out: Json[] = [];
	for (let i = 0; i < perTopic; i += 1) {
		out.push(
			i % 2 === 0
				? { topic: 'ppe', type: 'multiple_choice', prompt: `PPE question ${i}`, options: [{ key: 'a', text: 'yes' }, { key: 'b', text: 'no' }], answer: 'a' }
				: { topic: 'ppe', type: 'numeric', prompt: `PPE number ${i}`, answer: { value: 10, tolerance: 1, unit: 'mm' } }
		);
		out.push(
			i % 2 === 0
				? { topic: 'stops', type: 'short', prompt: `Stops word ${i}`, answer: { accept: ['e-stop', 'estop'] } }
				: { topic: 'stops', type: 'multiple_select', prompt: `Stops pick ${i}`, options: [{ key: 'a', text: '1' }, { key: 'b', text: '2' }, { key: 'c', text: '3' }], answer: ['a', 'c'] }
		);
	}
	return out;
}

export interface SampleCert {
	id: string;
	code: string;
	revisionId: string;
}

/**
 * Save, fill the pool, publish and grant `certifier` authority, all through
 * the real RPCs as the admin. Throws if any step refuses, so a suite cannot
 * run over a fixture that silently did not build.
 */
export async function publishSample(
	db: TestDb,
	people: CertPeople,
	code: string,
	opts: { overrides?: Json; pool?: Json[]; grant?: boolean } = {}
): Promise<SampleCert> {
	const saved = await rpcAs(db, people.admin, 'public.cert_admin_save(null, $1::jsonb, $2)', [
		JSON.stringify(samplePackage(code, opts.overrides ?? {})),
		'fixture'
	]);
	if (saved.ok !== true) throw new Error(`fixture save refused: ${JSON.stringify(saved)}`);
	const id = saved.id as string;
	const pool = await rpcAs(db, people.admin, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [id, JSON.stringify(opts.pool ?? samplePool())]);
	if (pool.ok !== true) throw new Error(`fixture pool refused: ${JSON.stringify(pool)}`);
	const published = await rpcAs(db, people.admin, 'public.cert_admin_publish($1::uuid)', [id]);
	if (published.ok !== true) throw new Error(`fixture publish refused: ${JSON.stringify(published)}`);
	if (opts.grant !== false) {
		const granted = await rpcAs(db, people.admin, 'public.cert_authority_grant($1::uuid, $2, null)', [id, people.certifier.email]);
		if (granted.ok !== true) throw new Error(`fixture grant refused: ${JSON.stringify(granted)}`);
	}
	return { id, code, revisionId: saved.revision_id as string };
}

/** The right answer for a drawn question, read off the pool as the connection owner (a fixture, never a client path). */
export async function keyFor(db: TestDb, examId: string, index: number): Promise<unknown> {
	const { rows } = await db.sql<{ answer: unknown }>(
		`select case q.type when 'short' then q.answer -> 'accept' -> 0 when 'numeric' then q.answer -> 'value' else q.answer end as answer
		 from public.cert_exam_attempts e, jsonb_array_elements(e.draw) with ordinality d(item, ord)
		 join public.cert_exam_questions q on q.id = (d.item ->> 'question_id')::uuid
		 where e.id = $1 and d.ord = $2 + 1`,
		[examId, index]
	);
	return rows[0].answer;
}

/**
 * The signed payload, computed HERE with Node's crypto rather than read back
 * from the database, so the commit's comparison is tested against an
 * independent implementation (the shape canonicalPayload in
 * signing-payload.ts builds).
 */
export function signedPayload(record: Json, serial: string): Json {
	const student = record.student as Json;
	const certification = record.certification as Json;
	const certifier = record.certifier as Json;
	const awardedAt = new Date(record.awarded_at as string).toISOString().replace(/\.\d{3}Z$/, 'Z');
	return {
		v: 1,
		serial,
		code: certification.code,
		level: certification.level,
		holder_name: student.name,
		email_sha256: createHash('sha256').update(String(student.email).trim().toLowerCase(), 'utf8').digest('hex'),
		awarded_at: awardedAt,
		certifier_name: certifier.name
	};
}

/** A real-looking serial: 16 Crockford characters in four groups. */
export function serialFor(seed: string): string {
	const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
	const digest = createHash('sha256').update(seed).digest();
	let body = '';
	for (let i = 0; i < 16; i += 1) body += alphabet[digest[i] % 32];
	return `IDEA-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

/** Every function in public with this name: should be exactly one. */
export async function procCount(db: TestDb, name: string): Promise<number> {
	const { rows } = await db.sql<{ n: number }>(
		`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
		[name]
	);
	return rows[0].n;
}

/** RLS flag plus every privilege anon and authenticated hold on a table, off information_schema. */
export async function tableSurface(db: TestDb, table: string): Promise<{ rls: boolean; grants: string[] }> {
	const { rows: r } = await db.sql<{ rls: boolean }>(
		`select c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = $1`,
		[table]
	);
	const { rows: g } = await db.sql<{ g: string }>(
		`select grantee || ':' || privilege_type as g from information_schema.role_table_grants
		 where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated') order by 1`,
		[table]
	);
	return { rls: r[0]?.rls ?? false, grants: g.map((x) => x.g) };
}

/** Walk the whole earning flow for one student up to (not including) the award. */
export async function earnUpToAward(
	db: TestDb,
	people: CertPeople,
	student: SeededUser,
	cert: SampleCert
): Promise<{ attemptId: string; examId: string }> {
	const started = await rpcAs(db, student, 'public.cert_start($1)', [cert.code]);
	if (started.ok !== true) throw new Error(`start refused: ${JSON.stringify(started)}`);
	const attemptId = ((started.attempt as Json).id as string);
	const watched = await rpcAs(db, student, `public.cert_watch_report($1::uuid, $2, 100, '[[0, 100]]'::jsonb, 1.5, 0, 100)`, [cert.id, VIDEO_KEY]);
	if (watched.training_done !== true) throw new Error(`training not done: ${JSON.stringify(watched)}`);
	const guided = await rpcAs(db, student, `public.cert_submit($1::uuid, 'guided', '{"text": "12.5 mm"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [attemptId]);
	if (guided.ok !== true) throw new Error(`guided submit refused: ${JSON.stringify(guided)}`);
	const review = await rpcAs(db, people.certifier, `public.cert_review($1::uuid, 'pass', 'Nice')`, [guided.submission_id]);
	if (review.ok !== true) throw new Error(`review refused: ${JSON.stringify(review)}`);
	const seat = await rpcAs(db, student, 'public.cert_seat_request($1::uuid, null, null)', [attemptId]);
	if (seat.ok !== true) throw new Error(`seat refused: ${JSON.stringify(seat)}`);
	const seatId = (seat.seat as Json).id as string;
	const decided = await rpcAs(db, people.certifier, `public.cert_seat_decide($1::uuid, 'approve', now(), null)`, [seatId]);
	if (decided.ok !== true) throw new Error(`decide refused: ${JSON.stringify(decided)}`);
	const released = await rpcAs(db, people.certifier, 'public.cert_exam_release($1::uuid)', [seatId]);
	if (released.ok !== true) throw new Error(`release refused: ${JSON.stringify(released)}`);
	const examId = released.exam_id as string;
	const opened = await rpcAs(db, student, 'public.cert_exam_open($1::uuid)', [examId]);
	if (opened.ok !== true) throw new Error(`open refused: ${JSON.stringify(opened)}`);
	const total = released.total as number;
	for (let i = 0; i < total; i += 1) {
		const key = await keyFor(db, examId, i);
		const answered = await rpcAs(db, student, 'public.cert_exam_answer($1::uuid, $2, $3::jsonb)', [examId, i, JSON.stringify(key)]);
		if (answered.ok !== true) throw new Error(`answer ${i} refused: ${JSON.stringify(answered)}`);
	}
	const result = await rpcAs(db, student, 'public.cert_exam_submit($1::uuid)', [examId]);
	if (result.passed !== true) throw new Error(`exam did not pass: ${JSON.stringify(result)}`);
	const auto = await rpcAs(db, student, `public.cert_submit($1::uuid, 'autonomous', '{"text": "alone"}'::jsonb, '[{"item": "I checked", "checked": true}]'::jsonb)`, [attemptId]);
	if (auto.ok !== true) throw new Error(`autonomous submit refused: ${JSON.stringify(auto)}`);
	const review2 = await rpcAs(db, people.certifier, `public.cert_review($1::uuid, 'pass', '')`, [auto.submission_id]);
	if (review2.ok !== true) throw new Error(`review 2 refused: ${JSON.stringify(review2)}`);
	const checkout = await rpcAs(db, people.certifier, `public.cert_checkout_in_person($1::uuid, 'pass', 'Smooth')`, [attemptId]);
	if (checkout.ok !== true) throw new Error(`checkout refused: ${JSON.stringify(checkout)}`);
	return { attemptId, examId };
}

/** Prepare and commit an award with a payload computed here. */
export async function awardAttempt(db: TestDb, people: CertPeople, attemptId: string, seed: string): Promise<Json> {
	const prepared = await rpcAs(db, people.certifier, 'public.cert_award_prepare($1::uuid)', [attemptId]);
	if (prepared.ok !== true) throw new Error(`prepare refused: ${JSON.stringify(prepared)}`);
	const serial = serialFor(seed);
	const payload = signedPayload(prepared.record as Json, serial);
	const committed = await rpcAs(db, people.certifier, 'public.cert_award_commit($1::uuid, $2, $3, $4, $5::jsonb)', [
		attemptId,
		serial,
		'c2lnbmF0dXJl',
		'abcd1234',
		JSON.stringify(payload)
	]);
	if (committed.ok !== true) throw new Error(`commit refused: ${JSON.stringify(committed)}`);
	return committed;
}
