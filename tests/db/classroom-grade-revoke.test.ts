// tests/db/classroom-grade-revoke.test.ts
//
// TAKING A GRADE BACK (ledger 0392, migration 0265). The chain is booted SHORT
// of 0265, grades are written through the REAL grading RPCs (one perfect and
// paid, one ordinary, one handed in by the student first), and 0265 is applied
// over the top, so every assertion is about grades that existed before it.
//
// Silent-regression guarantees, each with a planted control:
//   - only a reviewer of the student can unreturn, revoke or restore; a student
//     and a teacher of another class are refused, and anon cannot even call;
//   - an unreturn keeps the grade and takes it away from the student;
//   - a revoke clears every grading column and keeps an exact snapshot;
//   - a restore puts back exactly what was revoked and never overwrites a
//     grade saved since;
//   - a paid Perfect Score is reversed through the one coin path when the grade
//     leaves 'returned', and pays again when it comes back;
//   - bought extra credit survives a revoke.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = '0265_classroom_grade_revoke.sql';
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < '0265')];

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let other: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cal: SeededUser;
let s1: string;
let item: string;

const rpc = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

type Row = {
	state: string;
	score: string | null;
	direct_score: string | null;
	extra_credit: string | null;
	rubric_scores: unknown;
	teacher_comment: string | null;
	graded_at: string | null;
	returned_at: string | null;
	submitted_at: string | null;
};
async function row(email: string): Promise<Row> {
	const { rows } = await db.sql<Row>(
		`select state, score::text, direct_score::text, extra_credit::text, rubric_scores, teacher_comment,
		        graded_at::text, returned_at::text, submitted_at::text
		 from public.classroom_submissions where item_id = $1 and student_email = $2`,
		[item, email]
	);
	return rows[0];
}
async function perfectNet(email: string): Promise<{ n: number; net: number }> {
	const { rows } = await db.sql<{ n: string; s: string | null }>(
		`select count(*)::text n, sum(amount)::text s from public.coin_transactions
		 where student_email = $1 and (category_id = 'perfect_score_graded_work'
			or (category_id = 'reversal' and meta ->> 'reversed_category' = 'perfect_score_graded_work'))`,
		[email]
	);
	return { n: Number(rows[0].n), net: Number(rows[0].s ?? 0) };
}
const grade = (email: string, score: number, ret = true, comment: string | null = 'Nice work.') =>
	rpc<Json>(teacher, `public.classroom_grade_direct($1::uuid, $2, $3::numeric, $4, $5, null)`, [item, email, score, comment, ret]);

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	other = await createUser(db, 'other@boscotech.edu', 'Oth Er');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	cal = await createUser(db, 'cal@boscotech.net', 'Cal Ng');
	s1 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	const s2 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: other.email });
	const longAgo = new Date(Date.now() - 90 * 86400000).toISOString();
	for (const s of [ana, ben, cal]) {
		await enrollStudent(db, { as: admin, sectionId: s1, email: s.email, displayName: s.email.split('@')[0], createdAt: longAgo });
	}
	await enrollStudent(db, { as: admin, sectionId: s2, email: 'zed@boscotech.net', displayName: 'zed', createdAt: longAgo });
	await db.sql(`
		insert into public.coin_settings (key, value) values ('semesters', jsonb_build_array(jsonb_build_object(
			'key', 'test-term', 'start', to_char(current_date - 120, 'YYYY-MM-DD'), 'end', to_char(current_date + 120, 'YYYY-MM-DD'))))
		on conflict (key) do update set value = excluded.value`);
	await db.sql(`insert into public.coin_settings (key, value) values ('autopay_paused', 'false'::jsonb)
		on conflict (key) do update set value = excluded.value`);

	const created = await rpc<{ item_id: string }>(
		teacher,
		`public.classroom_create_item('assignment', $1::uuid[], 'Bridge', 'Do it.', 50, null, null, true, '[]'::jsonb, false)`,
		[[s1]]
	);
	item = created.item_id;
	const t = await rpc<Json>(teacher, `public.classroom_set_posting_perfect_score($1::uuid, $2::uuid, true)`, [item, s1]);
	expect(t.ok).toBe(true);

	// THE WORLD BEFORE 0265, through the real grading writes.
	await grade(ana.email, 50); // perfect, returned, paid
	await grade(ben.email, 31); // ordinary, returned
	// Cal handed it in first (the student's own stamp), then was graded.
	await db.sql(
		`insert into public.classroom_submissions (item_id, student_email, state, submitted_at) values ($1, $2, 'submitted', now())`,
		[item, cal.email]
	);
	await grade(cal.email, 40);

	await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

describe('0265 applies over graded work', () => {
	test('re-applies cleanly', async () => {
		await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
	});

	test('control: the seeded world is what it claims to be', async () => {
		expect((await row(ana.email)).state).toBe('returned');
		expect(await perfectNet(ana.email)).toEqual({ n: 1, net: 2 });
		expect((await row(cal.email)).submitted_at).not.toBeNull();
	});
});

describe('who may take a grade back', () => {
	test('a student and a teacher of another class are refused; anon cannot call', async () => {
		expect(await refusal(rpc(ana, `public.classroom_revoke_grade($1::uuid, $2)`, [item, ben.email]))).toMatch(/teacher of record/);
		expect(await refusal(rpc(other, `public.classroom_revoke_grade($1::uuid, $2)`, [item, ben.email]))).toMatch(/teacher of record/);
		expect(await refusal(rpc(other, `public.classroom_unreturn_grade($1::uuid, $2)`, [item, ben.email]))).toMatch(/teacher of record/);
		expect(await refusal(rpc(other, `public.classroom_restore_grade($1::uuid, $2)`, [item, ben.email]))).toMatch(/teacher of record/);
		const anon = await refusal(db.asAnon((q) => q(`select public.classroom_revoke_grade($1::uuid, $2)`, [item, ben.email])));
		expect(anon).toMatch(/permission denied/);
		// Nothing moved for any of them.
		expect((await row(ben.email)).score).toBe('31');
		// The read answers null, never a raise, for a non-reviewer.
		expect(await rpc(other, `public.classroom_grade_revocation($1::uuid, $2)`, [item, ben.email])).toBeNull();
	});

	test('an admin may (control: the gate is the reviewer predicate, not a role list)', async () => {
		const r = await rpc<Json>(admin, `public.classroom_unreturn_grade($1::uuid, $2)`, [item, ben.email]);
		expect(r.ok).toBe(true);
		await grade(ben.email, 31);
		expect((await row(ben.email)).state).toBe('returned');
	});
});

describe('unreturn keeps the grade and takes it from the student', () => {
	test('a returned row the student never handed in goes to draft; the score stays', async () => {
		const r = await rpc<Json>(teacher, `public.classroom_unreturn_grade($1::uuid, $2)`, [item, ben.email]);
		expect(r).toMatchObject({ ok: true, state: 'draft' });
		const b = await row(ben.email);
		expect(b.state).toBe('draft');
		expect(b.score).toBe('31');
		expect(b.returned_at).toBeNull();
		expect(b.graded_at).not.toBeNull();
		const again = await rpc<Json>(teacher, `public.classroom_unreturn_grade($1::uuid, $2)`, [item, ben.email]);
		expect(again).toMatchObject({ ok: false, reason: 'not_returned' });
	});

	test('a row the student handed in goes back to submitted', async () => {
		const r = await rpc<Json>(teacher, `public.classroom_unreturn_grade($1::uuid, $2)`, [item, cal.email]);
		expect(r).toMatchObject({ ok: true, state: 'submitted' });
		await grade(cal.email, 40);
	});

	test('a paid Perfect Score is reversed, and returning it again pays again', async () => {
		const r = await rpc<Json>(teacher, `public.classroom_unreturn_grade($1::uuid, $2)`, [item, ana.email]);
		expect(r).toMatchObject({ ok: true, coins: 'reversed' });
		expect(await perfectNet(ana.email)).toEqual({ n: 2, net: 0 });
		await grade(ana.email, 50);
		expect(await perfectNet(ana.email)).toEqual({ n: 3, net: 2 });
	});
});

describe('revoke and restore', () => {
	test('revoke clears every grading column, reverses the Perfect Score, and keeps a snapshot', async () => {
		const before = await row(ana.email);
		const r = await rpc<Json>(teacher, `public.classroom_revoke_grade($1::uuid, $2)`, [item, ana.email]);
		expect(r).toMatchObject({ ok: true, state: 'draft', coins: 'reversed' });
		const a = await row(ana.email);
		expect(a).toMatchObject({ state: 'draft', score: null, direct_score: null, rubric_scores: null, teacher_comment: null, graded_at: null, returned_at: null });
		expect(await perfectNet(ana.email)).toEqual({ n: 4, net: 0 });
		const offer = await rpc<Json>(teacher, `public.classroom_grade_revocation($1::uuid, $2)`, [item, ana.email]);
		expect(offer).toMatchObject({ state: 'returned' });
		expect(Number(offer.score)).toBe(50);
		expect(before.score).toBe('50');
		// Control: Ben's grade was not touched by Ana's revoke.
		expect((await row(ben.email)).score).toBe('31');
		const nothing = await rpc<Json>(teacher, `public.classroom_revoke_grade($1::uuid, $2)`, [item, ana.email]);
		expect(nothing).toMatchObject({ ok: false, reason: 'nothing_to_revoke' });
	});

	test('restore puts back exactly what was revoked, and pays the Perfect Score again', async () => {
		const r = await rpc<Json>(teacher, `public.classroom_restore_grade($1::uuid, $2)`, [item, ana.email]);
		expect(r).toMatchObject({ ok: true, state: 'returned', coins: 'paid' });
		const a = await row(ana.email);
		expect(a.state).toBe('returned');
		expect(a.score).toBe('50');
		expect(a.direct_score).toBe('50');
		expect(a.teacher_comment).toBe('Nice work.');
		expect(a.returned_at).not.toBeNull();
		expect(await perfectNet(ana.email)).toEqual({ n: 5, net: 2 });
		expect(await rpc(teacher, `public.classroom_grade_revocation($1::uuid, $2)`, [item, ana.email])).toBeNull();
		const twice = await rpc<Json>(teacher, `public.classroom_restore_grade($1::uuid, $2)`, [item, ana.email]);
		expect(twice).toMatchObject({ ok: false, reason: 'nothing_to_restore' });
	});

	test('a restore never overwrites a grade saved since the revoke', async () => {
		await rpc<Json>(teacher, `public.classroom_revoke_grade($1::uuid, $2)`, [item, ben.email]);
		await grade(ben.email, 12, false);
		const r = await rpc<Json>(teacher, `public.classroom_restore_grade($1::uuid, $2)`, [item, ben.email]);
		expect(r).toMatchObject({ ok: false, reason: 'graded_since' });
		expect((await row(ben.email)).score).toBe('12');
	});

	test('bought extra credit survives a revoke', async () => {
		await db.sql(
			`update public.classroom_submissions set extra_credit = 3 where item_id = $1 and student_email = $2`,
			[item, cal.email]
		);
		const { rows: sub } = await db.sql<{ id: string }>(
			`select id from public.classroom_submissions where item_id = $1 and student_email = $2`,
			[item, cal.email]
		);
		// A purchase row, as coin_buy_extra_credit writes it (category and meta key).
		await db.sql(
			`insert into public.coin_transactions (student_email, category_id, amount, quantity, actor_email, medium, meta)
			 values ($1, 'extra_credit', -30, 2, $1, 'digital', jsonb_build_object('submission_id', $2::text))`,
			[cal.email, sub[0].id]
		);
		const bought = await db.sql<{ b: string }>(`select public._coin_purchased_extra_credit($1::uuid)::text b`, [sub[0].id]);
		const r = await rpc<Json>(teacher, `public.classroom_revoke_grade($1::uuid, $2)`, [item, cal.email]);
		expect(r.ok).toBe(true);
		const c = await row(cal.email);
		expect(c.score).toBeNull();
		expect(c.state).toBe('submitted');
		// The 2 bought points stay; the grader's 1 on top of them is gone.
		expect(Number(bought.rows[0].b)).toBe(2);
		expect(Number(c.extra_credit)).toBe(2);
	});
});
