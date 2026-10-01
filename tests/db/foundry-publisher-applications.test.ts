// tests/db/foundry-publisher-applications.test.ts
//
// 0230 PART B2: TRUSTED PUBLISHER APPLICATIONS (report 6d076258). What would
// fail SILENTLY, and so is asserted here:
//
//   1. THE TRICK QUESTIONS STAY SECRET. A student read that grew an is_trick
//      flag, a flag_choices list or a reviewer note renders nothing different
//      on a form that ignores the keys, and hands every applicant the answer
//      key. So the student payload is swept for those keys AT ANY DEPTH, and
//      for the reviewer notes' own text, with the admin editor read as the
//      positive control that the instrument sees them when they are there.
//   2. APPROVAL WRITES THE EXISTING FLAG AND NOTHING ELSE. An approve puts a
//      row in 0173's foundry_trusted_publishers and foundry_is_trusted() turns
//      true for that student; a decline writes no such row.
//   3. ONE PENDING APPLICATION PER PERSON, under concurrency, and a cooldown
//      after a decline, each beside the case that is let through.
//   4. EDITING RETIRES AND NEVER DELETES, and an application keeps the prompt
//      it answered after the question is edited.
//   5. EVERY ADMIN DOOR IS SHUT TO EVERYBODY ELSE, and a second paste neither
//      duplicates the seeded questions nor overwrites an edited set.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	PRE_0230,
	SQL_0230,
	canExecute,
	catalogFingerprint,
	keysDeep,
	overloads,
	refusal,
	tablePrivileges
} from './chain-0230';

const STATUS = 'select public.foundry_publisher_status() as r';
const APPLY = 'select public.foundry_publisher_apply($1::jsonb) as r';
const LIST = 'select public.foundry_publisher_applications($1) as r';
const COUNT = 'select public.foundry_publisher_pending_count() as r';
const DECIDE = 'select public.foundry_publisher_decide($1::uuid, $2, $3) as r';
const QADMIN = 'select public.foundry_publisher_questions_admin() as r';
const SETQ = 'select public.foundry_publisher_set_questions($1::jsonb) as r';
const FAKE = '00000000-0000-4000-8000-000000000000';

const FNS = [
	'foundry_publisher_status()',
	'foundry_publisher_apply(jsonb)',
	'foundry_publisher_applications(text)',
	'foundry_publisher_pending_count()',
	'foundry_publisher_decide(uuid, text, text)',
	'foundry_publisher_questions_admin()',
	'foundry_publisher_set_questions(jsonb)'
] as const;
const ADMIN_KEYS = ['is_trick', 'flag_choices', 'reviewer_note'];

type Json = Record<string, any>;
interface Question {
	id: string;
	position: number;
	prompt: string;
	kind: 'text' | 'choice';
	choices: string[];
}
interface AdminQuestion extends Question {
	flag_choices: string[];
	is_trick: boolean;
	reviewer_note: string | null;
	active: boolean;
}

let db: TestDb;
let admin: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cam: SeededUser;
let dee: SeededUser;
let eve: SeededUser;
let trusted: SeededUser;
let visitor: SeededUser;
let teacher: SeededUser;

async function call<T = Json>(u: SeededUser, sql: string, args: unknown[] = []): Promise<T> {
	return db.asUser(u.id, async (q) => (await q<{ r: T }>(sql, args)).rows[0].r);
}
const status = (u: SeededUser) => call<Json>(u, STATUS);
const apply = (u: SeededUser, answers: unknown) => call<Json>(u, APPLY, [JSON.stringify(answers)]);
const adminQuestions = () => call<AdminQuestion[]>(admin, QADMIN);
const decide = (id: string, decision: string, note: string | null = null) => call<Json>(admin, DECIDE, [id, decision, note]);

/**
 * A complete, harmless set of answers to whatever is active right now: the
 * questions as the STUDENT reads them, and for a choice the first answer the
 * admin read does not list as a red flag.
 */
async function goodAnswers(u: SeededUser): Promise<Record<string, string>> {
	const s = await status(u);
	const flags = new Map((await adminQuestions()).map((q) => [q.id, q.flag_choices]));
	const out: Record<string, string> = {};
	for (const q of s.questions as Question[]) {
		out[q.id] =
			q.kind === 'choice'
				? q.choices.find((c) => !(flags.get(q.id) ?? []).includes(c))!
				: `My honest answer to question ${q.position}.`;
	}
	return out;
}

beforeAll(async () => {
	db = await startTestDb(PRE_0230);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Applicant');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Applicant');
	cam = await createUser(db, 'cam@boscotech.net', 'Cam Applicant');
	dee = await createUser(db, 'dee@boscotech.net', 'Dee Racer');
	eve = await createUser(db, 'eve@boscotech.net', 'Eve Applicant');
	trusted = await createUser(db, 'already@boscotech.net', 'Al Ready');
	visitor = await createUser(db, 'someone@gmail.com', 'Vis Itor');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tea Cher');
	// THROUGH THE REAL 0173 WRITE, before 0230: an already-trusted student.
	await db.asUser(admin.id, (q) => q(`select public.foundry_trusted_grant($1, 'Seeded before 0230')`, [trusted.email]));
	await db.sql(SQL_0230);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the seeded questions and what a student may read of them', () => {
	test('six drafted questions, two of them tricks, every trick a choice with red-flag answers among its choices', async () => {
		const qs = await adminQuestions();
		expect(qs).toHaveLength(6);
		expect(qs.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6]);
		const tricks = qs.filter((q) => q.is_trick);
		expect(tricks).toHaveLength(2);
		for (const q of tricks) {
			expect(q.kind).toBe('choice');
			expect(q.flag_choices.length).toBeGreaterThan(0);
			for (const f of q.flag_choices) expect(q.choices).toContain(f);
			expect(q.choices.length).toBeGreaterThan(q.flag_choices.length);
		}
		for (const q of qs) expect(q.reviewer_note).toBeTruthy();
		// No em dash in anything a student reads.
		expect(JSON.stringify(qs.map((q) => [q.prompt, q.choices]))).not.toMatch(/\u2014/);
	});

	test('the student read carries no trick flag, no red-flag list and no reviewer note, at any depth', async () => {
		const s = await status(ana);
		const keys = keysDeep(s);
		for (const k of ADMIN_KEYS) expect([...keys], k).not.toContain(k);
		for (const q of s.questions as Json[]) {
			expect(Object.keys(q).sort()).toEqual(['choices', 'id', 'kind', 'position', 'prompt']);
		}
		const text = JSON.stringify(s);
		for (const q of await adminQuestions()) {
			expect(text).not.toContain(q.reviewer_note!);
		}
		// POSITIVE CONTROL: the same sweep over the admin read finds all three.
		const adminKeys = keysDeep(await adminQuestions());
		for (const k of ADMIN_KEYS) expect([...adminKeys], k).toContain(k);
	});

	test('the student read says who may apply, and is otherwise empty for somebody new', async () => {
		expect(await status(ana)).toMatchObject({ ok: true, eligible: true, trusted: false, application: null, cooldown_until: null });
		expect(await status(teacher)).toMatchObject({ eligible: true });
		expect(await status(visitor)).toMatchObject({ eligible: false });
		expect(await status(trusted)).toMatchObject({ trusted: true });
		expect(await refusal(() => db.sql(STATUS))).toBe('You must be signed in.');
	});
});

// ===========================================================================
describe('applying', () => {
	test('every refusal a student can produce, each with its reason', async () => {
		const good = await goodAnswers(ben);
		const qs = (await status(ben)).questions as Question[];
		const text = qs.find((q) => q.kind === 'text')!;
		const choice = qs.find((q) => q.kind === 'choice')!;

		expect(await apply(visitor, good)).toEqual({ ok: false, reason: 'not_eligible' });
		expect(await apply(trusted, good)).toEqual({ ok: false, reason: 'already_trusted' });
		expect(await apply(ben, [])).toEqual({ ok: false, reason: 'incomplete', question_id: null });
		expect(await apply(ben, 'yes')).toEqual({ ok: false, reason: 'incomplete', question_id: null });
		expect(await apply(ben, { ...good, [qs[0].id]: ' \n\t ' })).toEqual({ ok: false, reason: 'incomplete', question_id: qs[0].id });
		const missing = { ...good };
		delete missing[qs[1].id];
		expect(await apply(ben, missing)).toEqual({ ok: false, reason: 'incomplete', question_id: qs[1].id });
		expect(await apply(ben, { ...good, [text.id]: 'x'.repeat(2001) })).toEqual({
			ok: false,
			reason: 'too_long',
			question_id: text.id,
			limit: 2000
		});
		expect(await apply(ben, { ...good, [choice.id]: 'Something else entirely' })).toEqual({
			ok: false,
			reason: 'bad_choice',
			question_id: choice.id
		});
		// Nothing was written by any of them.
		expect((await db.sql(`select count(*)::int as n from public.foundry_publisher_applications`)).rows[0].n).toBe(0);
	});

	test('a complete application lands, with a snapshot that marks a red-flag answer', async () => {
		const qs = (await adminQuestions()).filter((q) => q.active);
		const answers = await goodAnswers(ana);
		const trick = qs.find((q) => q.is_trick)!;
		answers[trick.id] = trick.flag_choices[0];
		const r = await apply(ana, answers);
		expect(r).toMatchObject({ ok: true });
		expect(r.application_id).toBeTruthy();

		const { rows } = await db.sql(`select answers, status, applicant_email from public.foundry_publisher_applications where id = $1`, [
			r.application_id
		]);
		expect(rows[0].status).toBe('pending');
		expect(rows[0].applicant_email).toBe(ana.email);
		const snap = rows[0].answers as Json[];
		expect(snap).toHaveLength(qs.length);
		expect(snap.map((a) => a.question_id)).toEqual(qs.map((q) => q.id));
		expect(snap.find((a) => a.question_id === trick.id)).toMatchObject({ flagged: true, is_trick: true, answer: trick.flag_choices[0] });
		expect(snap.filter((a) => a.flagged)).toHaveLength(1);
		expect(await status(ana)).toMatchObject({ application: { status: 'pending', id: r.application_id } });
	});

	test('a second application while one is pending is refused', async () => {
		expect(await apply(ana, await goodAnswers(ana))).toEqual({ ok: false, reason: 'pending' });
	});

	test('two applications at once from one student: exactly one lands', async () => {
		const answers = await goodAnswers(cam);
		const results = await Promise.all([apply(cam, answers), apply(cam, answers), apply(cam, answers)]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.filter((r) => !r.ok).map((r) => r.reason)).toEqual(['pending', 'pending']);
		const { rows } = await db.sql(
			`select count(*)::int as n from public.foundry_publisher_applications where applicant_email = $1`,
			[cam.email]
		);
		expect(rows[0].n).toBe(1);
	});

	test('while the whole Foundry is off, nobody can apply', async () => {
		await call(admin, 'select public.foundry_set_site_open(false, null)');
		expect(await apply(eve, await goodAnswers(eve))).toEqual({ ok: false, reason: 'foundry_off' });
		await call(admin, 'select public.foundry_set_site_open(true, null)');
	});

	test('with no active question there is nothing to apply with', async () => {
		await db.sql(`update public.foundry_publisher_questions set active = false`);
		try {
			expect(await apply(eve, {})).toEqual({ ok: false, reason: 'no_questions' });
		} finally {
			await db.sql(`update public.foundry_publisher_questions set active = true`);
		}
	});
});

// ===========================================================================
describe('the admin side', () => {
	test('every admin door is shut to a student, a teacher and anon', async () => {
		for (const u of [ana, teacher]) {
			expect(await refusal(() => call(u, LIST, ['pending']))).toBe('Only a site administrator can read publisher applications.');
			expect(await refusal(() => call(u, DECIDE, [FAKE, 'approve', null]))).toBe(
				'Only a site administrator can decide a publisher application.'
			);
			expect(await refusal(() => call(u, QADMIN))).toBe('Only a site administrator can edit the publisher questions.');
			expect(await refusal(() => call(u, SETQ, [JSON.stringify([])]))).toBe('Only a site administrator can edit the publisher questions.');
			expect(await call(u, COUNT)).toBeNull();
		}
		for (const fn of FNS) {
			expect(await overloads(db, fn.split('(')[0]), fn).toBe(1);
			expect(await canExecute(db, 'anon', fn), fn).toBe(false);
			expect(await canExecute(db, 'authenticated', fn), fn).toBe(true);
		}
	});

	test('the list: pending oldest first, with names, the trusted mark and the red-flag count', async () => {
		const list = await call<Json[]>(admin, LIST, ['pending']);
		expect(list.map((a) => a.applicant_email)).toEqual([ana.email, cam.email]);
		expect(list[0]).toMatchObject({
			applicant: ana.id,
			applicant_full_name: 'Ana Applicant',
			status: 'pending',
			trusted_now: false,
			flagged_count: 1
		});
		expect(list[1].flagged_count).toBe(0);
		expect(await call(admin, COUNT)).toBe(2);
		expect(await refusal(() => call(admin, LIST, ['everything']))).toBe('Status must be pending, decided or all.');
	});

	test('approve writes the EXISTING allowlist and the student becomes trusted; a repeat is refused', async () => {
		const [first] = await call<Json[]>(admin, LIST, ['pending']);
		expect(await call(ana, 'select public.foundry_is_trusted() as r')).toBe(false);
		expect(await decide(first.id, 'approve', 'Welcome aboard.')).toEqual({ ok: true, status: 'approved', email: ana.email });
		const { rows } = await db.sql(`select email, note from public.foundry_trusted_publishers where email = $1`, [ana.email]);
		expect(rows).toEqual([{ email: ana.email, note: 'Welcome aboard.' }]);
		expect(await call(ana, 'select public.foundry_is_trusted() as r')).toBe(true);
		expect(await status(ana)).toMatchObject({ trusted: true, application: { status: 'approved', decision_note: 'Welcome aboard.' } });
		expect(await decide(first.id, 'decline')).toEqual({ ok: false, reason: 'already_decided', status: 'approved' });
		expect(await decide(FAKE, 'approve')).toEqual({ ok: false, reason: 'not_found' });
		expect(await refusal(() => decide(first.id, 'maybe'))).toBe('Approve or decline?');
		expect(await refusal(() => decide(first.id, 'approve', 'n'.repeat(301)))).toBe('Keep the note to 300 characters.');
	});

	test('decline writes no allowlist row, and starts a seven-day cooldown', async () => {
		const pending = await call<Json[]>(admin, LIST, ['pending']);
		const camApp = pending.find((a) => a.applicant_email === cam.email)!;
		expect(await decide(camApp.id, 'decline', 'Try again after you publish one reviewed app.')).toMatchObject({
			ok: true,
			status: 'declined'
		});
		const { rows } = await db.sql(`select count(*)::int as n from public.foundry_trusted_publishers where email = $1`, [cam.email]);
		expect(rows[0].n).toBe(0);
		expect(await call(cam, 'select public.foundry_is_trusted() as r')).toBe(false);

		const s = await status(cam);
		expect(s.cooldown_until).toBeTruthy();
		const r = await apply(cam, await goodAnswers(cam));
		expect(r).toMatchObject({ ok: false, reason: 'cooldown' });
		expect(Date.parse(r.until)).toBe(Date.parse(s.cooldown_until));

		// POSITIVE CONTROL: eight days on, the same student may apply again.
		await db.sql(
			`update public.foundry_publisher_applications set decided_at = now() - interval '8 days', submitted_at = now() - interval '9 days' where id = $1`,
			[camApp.id]
		);
		expect((await status(cam)).cooldown_until).toBeNull();
		expect(await apply(cam, await goodAnswers(cam))).toMatchObject({ ok: true });
	});

	test('the decided list is newest decision first; all puts pending first', async () => {
		const decided = await call<Json[]>(admin, LIST, ['decided']);
		expect(decided.map((a) => a.status)).toEqual(['approved', 'declined']);
		const all = await call<Json[]>(admin, LIST, ['all']);
		expect(all.map((a) => a.status)).toEqual(['pending', 'approved', 'declined']);
	});
});

// ===========================================================================
describe('editing the questions', () => {
	test('a malformed set is refused with the index and a sentence, and writes nothing', async () => {
		const before = await adminQuestions();
		const ok = { prompt: 'Fine prompt', kind: 'text' };
		const bad: [unknown, Json][] = [
			[{}, { reason: 'invalid', index: null }],
			[[], { reason: 'invalid', index: null }],
			[Array.from({ length: 11 }, () => ok), { reason: 'invalid', index: null }],
			[[ok, { prompt: '   ', kind: 'text' }], { reason: 'invalid', index: 1 }],
			[[{ prompt: 'p', kind: 'essay' }], { reason: 'invalid', index: 0 }],
			[[{ prompt: 'p', kind: 'choice', choices: ['only one'] }], { reason: 'invalid', index: 0 }],
			[[{ prompt: 'p', kind: 'choice', choices: ['a', ' a '] }], { reason: 'invalid', index: 0 }],
			[[{ prompt: 'p', kind: 'choice', choices: ['a', 'b'], flag_choices: ['c'] }], { reason: 'invalid', index: 0 }],
			[[{ prompt: 'p', kind: 'text', choices: ['a'] }], { reason: 'invalid', index: 0 }],
			[[{ prompt: 'p', kind: 'text', reviewer_note: 'n'.repeat(501) }], { reason: 'invalid', index: 0 }],
			[[ok, { id: FAKE, ...ok }], { reason: 'unknown_question', index: 1 }],
			[[{ id: before[0].id, ...ok }, { id: before[0].id, ...ok }], { reason: 'invalid', index: 1 }]
		];
		for (const [payload, want] of bad) {
			const r = await call<Json>(admin, SETQ, [JSON.stringify(payload)]);
			expect(r, JSON.stringify(payload).slice(0, 80)).toMatchObject({ ok: false, ...want });
			if (r.reason === 'invalid') expect(typeof r.message).toBe('string');
		}
		expect(await adminQuestions()).toEqual(before);
	});

	test('a save edits in place, adds, reorders and RETIRES, and never deletes', async () => {
		const before = await adminQuestions();
		const [q1, q2, , q4] = before;
		const r = await call<Json>(admin, SETQ, [
			JSON.stringify([
				{ id: q2.id, prompt: q2.prompt, kind: q2.kind },
				{ id: q1.id, prompt: '  What will you publish first?  ', kind: 'text', reviewer_note: 'Edited.' },
				{
					id: q4.id,
					prompt: q4.prompt,
					kind: 'choice',
					choices: q4.choices,
					flag_choices: q4.flag_choices,
					is_trick: true,
					reviewer_note: q4.reviewer_note
				},
				{ prompt: 'A brand new question?', kind: 'choice', choices: [' Yes ', 'No'], flag_choices: ['Yes'], is_trick: true }
			])
		]);
		expect(r).toEqual({ ok: true, active: 4, retired: 3 });
		const after = await adminQuestions();
		expect(after).toHaveLength(before.length + 1);
		const active = after.filter((q) => q.active);
		expect(active.map((q) => q.position)).toEqual([1, 2, 3, 4]);
		expect(active[0].id).toBe(q2.id);
		expect(active[1]).toMatchObject({ id: q1.id, prompt: 'What will you publish first?', reviewer_note: 'Edited.' });
		expect(active[3]).toMatchObject({ prompt: 'A brand new question?', choices: ['Yes', 'No'], flag_choices: ['Yes'], is_trick: true });
		expect(after.filter((q) => !q.active)).toHaveLength(3);
		// Every row that existed is still there.
		for (const q of before) expect(after.map((a) => a.id)).toContain(q.id);
		// The student now reads the four, in the new order.
		expect(((await status(eve)).questions as Question[]).map((q) => q.id)).toEqual(active.map((q) => q.id));
	});

	test("an application keeps the prompt it answered after the question is edited", async () => {
		const { rows } = await db.sql(`select answers from public.foundry_publisher_applications where applicant_email = $1 and status = 'approved'`, [
			ana.email
		]);
		const prompts = (rows[0].answers as Json[]).map((a) => a.prompt);
		expect(prompts).toContain('What do you want to publish, and who is it for?');
		expect(prompts).not.toContain('What will you publish first?');
	});
});

// ===========================================================================
describe('the tables, and a second paste', () => {
	test('both tables: RLS on, no policy, no privilege for any client role or the service role', async () => {
		for (const table of ['foundry_publisher_questions', 'foundry_publisher_applications']) {
			const { rows } = await db.sql(
				`select relrowsecurity as rls, (select count(*)::int from pg_policies where schemaname = 'public' and tablename = $1) as policies
				 from pg_class where oid = ('public.' || $1)::regclass`,
				[table]
			);
			expect(rows[0], table).toEqual({ rls: true, policies: 0 });
			for (const role of ['anon', 'authenticated', 'service_role']) {
				expect(await tablePrivileges(db, role, table), `${role} ${table}`).toEqual([]);
			}
		}
	});

	test('re-applying 0230 adds no question and overwrites no edit', async () => {
		const before = await adminQuestions();
		const fp = await catalogFingerprint(db);
		await db.sql(SQL_0230);
		expect(await adminQuestions()).toEqual(before);
		expect(await catalogFingerprint(db)).toBe(fp);
	});
});
