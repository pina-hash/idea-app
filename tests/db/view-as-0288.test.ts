// tests/db/view-as-0288.test.ts
//
// VIEW AS, ACT AS AND TEST ACCOUNTS (ledger 0422, migrations 0288 and 0289,
// feedback d1c9ed15). The chain is booted SHORT of 0288, a class with graded
// and submitted work is made through the real RPCs, and both files are applied
// over the top.
//
// Silent-regression guarantees, each with its positive control:
//   - a view session writes NOTHING: a definer RPC and a direct table write
//     are both refused, while the same student's own session still writes;
//   - only the target's own fresh session can claim a grant, once;
//   - an act session's writes land, are logged with the admin, mark the
//     submission, and leave the student a notice that counts them;
//   - an expired act session is read-only; an admin cannot be acted as;
//   - every public table carries the guard, including one made later;
//   - a test account is in no roster, coin list, balance or stock board
//     anybody else reads, and still sees itself.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const F288 = ALL.find((f) => f.startsWith('0288_'))!;
const F289 = ALL.find((f) => f.startsWith('0289_'))!;
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < '0288')];

let db: TestDb;
let admin: SeededUser, teacher: SeededUser, ana: SeededUser, ben: SeededUser, tess: SeededUser;
let section: string;
let item: string;

const as = <T = Json>(u: SeededUser, call: string, params: unknown[] = [], session?: string) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r, session ? { session_id: session } : undefined);

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

/** Grant as the admin, then claim as the target in a fresh session; answers the session id. */
async function start(target: SeededUser, mode: 'view' | 'act'): Promise<string> {
	const g = await as<{ grant: string }>(admin, `public.view_as_grant($1::uuid, $2)`, [target.id, mode]);
	const sid = randomUUID();
	const cur = await as<Json>(target, `public.view_as_claim($1::uuid)`, [g.grant], sid);
	expect(cur.mode).toBe(mode);
	return sid;
}

const submissionOf = async (email: string) =>
	(await db.sql<{ state: string; acted_by: string | null }>(
		`select state, acted_by from public.classroom_submissions where item_id = $1 and student_email = $2`, [item, email])).rows[0];

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	section = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	for (const s of [ana, ben]) await enrollStudent(db, { as: teacher, sectionId: section, email: s.email, displayName: s.email.split('@')[0] });
	const created = await as<{ item_id: string }>(teacher,
		`public.classroom_create_item('assignment', $1::uuid[], 'Bridge', 'Do it.', 50, null, null, true, '[]'::jsonb, false)`, [[section]]);
	item = created.item_id;
	// A spec with no blocks, so a student can hand in with nothing attached.
	await db.sql(`insert into public.classroom_assignment_specs (item_id, spec, imported_by) values ($1, '{"modules": []}'::jsonb, 'seed')`, [item]);
	// The world before the files: Ben has handed in already.
	expect(await as<Json>(ben, `public.classroom_submit_assignment($1::uuid)`, [item])).toMatchObject({ ok: true });
	for (const s of [ana, ben]) {
		await db.sql(`insert into public.coin_transactions (student_email, category_id, amount, actor_email, medium)
			values ($1, 'above_and_beyond', 3, 'seed', 'digital')`, [s.email]);
	}

	await db.sql(readFileSync(join(DIR, F288), 'utf8'));
	await db.sql(readFileSync(join(DIR, F289), 'utf8'));

	// A test student, made the way the server makes one: an auth user at the
	// test domain, then registered by the admin.
	tess = await createUser(db, 'tess-1@test.ideabosco.com', 'whatever');
	const reg = await as<Json>(admin, `public.test_account_register($1::uuid, 'Test Student One')`, [tess.id]);
	expect(reg.ok).toBe(true);
	await enrollStudent(db, { as: teacher, sectionId: section, email: tess.email, displayName: 'Test Student One' });
	await db.sql(`insert into public.coin_transactions (student_email, category_id, amount, actor_email, medium)
		values ($1, 'above_and_beyond', 9, 'seed', 'digital')`, [tess.email]);
}, 600_000);

afterAll(async () => db?.stop());

describe('0288 and 0289 apply over real work', () => {
	test('both re-apply cleanly', async () => {
		await db.sql(readFileSync(join(DIR, F288), 'utf8'));
		await db.sql(readFileSync(join(DIR, F289), 'utf8'));
	});

	test('control: an ordinary session is untouched (no session id, and a session id nobody granted)', async () => {
		expect(await as(ana, 'public.view_as_current()')).toBeNull();
		expect(await as(ana, 'public.view_as_current()', [], randomUUID())).toBeNull();
		expect(await as<boolean>(ana, 'public.view_as_write_allowed()', [], randomUUID())).toBe(true);
	});
});

describe('view as: read-only, enforced by the database', () => {
	test('a view session reads as the student and writes nothing; the student\'s own session still writes', async () => {
		const sid = await start(ana, 'view');
		const cur = await as<Json>(ana, 'public.view_as_current()', [], sid);
		expect(cur).toMatchObject({ mode: 'view', target_email: ana.email, admin_email: admin.email, expired: false });
		// Reads answer as Ana (her own post is readable to her).
		expect(await as<boolean>(ana, 'public.classroom_is_enrolled($1::uuid)', [section], sid)).toBe(true);
		// Absent: a definer RPC write, a direct table write, a storage write.
		const viaRpc = await refusal(as(ana, `public.classroom_submit_assignment($1::uuid)`, [item], sid));
		expect(viaRpc).toMatch(/read-only, so nothing was changed/);
		expect(await refusal(db.asUser(ana.id, (q) => q(`update public.profiles set display_name = 'x' where id = $1`, [ana.id]), { session_id: sid })))
			.toMatch(/read-only/);
		expect(await as<boolean>(ana, 'public.view_as_write_allowed()', [], sid)).toBe(false);
		expect(await submissionOf(ana.email)).toBeUndefined();
		// Present: her own session submits.
		expect((await as<Json>(ana, `public.classroom_submit_assignment($1::uuid)`, [item], randomUUID())).ok).toBe(true);
		expect((await submissionOf(ana.email)).acted_by).toBeNull();
		// Ending it hands the session back to ordinary.
		expect((await as<Json>(ana, 'public.view_as_end()', [], sid)).ended).toBe(true);
		expect(await as(ana, 'public.view_as_current()', [], sid)).toBeNull();
	});

	test('a grant is claimed only by its own target, only once, only while fresh', async () => {
		const g = await as<{ grant: string }>(admin, `public.view_as_grant($1::uuid, 'view')`, [ana.id]);
		expect(await refusal(as(ben, `public.view_as_claim($1::uuid)`, [g.grant], randomUUID()))).toMatch(/Not found/);
		expect(await refusal(as(ana, `public.view_as_claim($1::uuid)`, [g.grant]))).toMatch(/Not found/); // no session id
		await as(ana, `public.view_as_claim($1::uuid)`, [g.grant], randomUUID());
		expect(await refusal(as(ana, `public.view_as_claim($1::uuid)`, [g.grant], randomUUID()))).toMatch(/Not found/);
		const stale = await as<{ grant: string }>(admin, `public.view_as_grant($1::uuid, 'view')`, [ana.id]);
		await db.sql(`update public.view_as_grants set created_at = now() - interval '5 minutes' where id = $1`, [stale.grant]);
		expect(await refusal(as(ana, `public.view_as_claim($1::uuid)`, [stale.grant], randomUUID()))).toMatch(/Not found/);
	});

	test('only an admin can grant, list or read the record (student and teacher refused; admin answers)', async () => {
		for (const u of [ana, teacher]) {
			expect(await refusal(as(u, `public.view_as_grant($1::uuid, 'view')`, [ben.id]))).toMatch(/Not found/);
			expect(await refusal(as(u, `public.view_as_history()`))).toMatch(/Not found/);
			expect(await refusal(as(u, `public.test_accounts_list()`))).toMatch(/Not found/);
			expect(await refusal(as(u, `public.test_account_register($1::uuid, 'x')`, [tess.id]))).toMatch(/Not found/);
		}
		expect(Array.isArray(await as(admin, 'public.view_as_history()'))).toBe(true);
		expect(await refusal(as(admin, `public.view_as_grant($1::uuid, 'view')`, [admin.id]))).toMatch(/other than yourself/);
	});
});

describe('act as: real, logged, marked, and told', () => {
	test('an act session\'s submission lands, carries the admin, is logged, and the student is told', async () => {
		// Ben was handed back his submission first so he can submit again.
		await db.sql(`update public.classroom_submissions set state = 'returned', returned_at = now() where item_id = $1 and student_email = $2`, [item, ben.email]);
		const sid = await start(ben, 'act');
		expect((await as<Json>(ben, `public.classroom_submit_assignment($1::uuid)`, [item], sid)).ok).toBe(true);
		expect(await submissionOf(ben.email)).toMatchObject({ state: 'submitted', acted_by: admin.email });
		const log = await db.sql<{ table_name: string; admin_email: string }>(`select table_name, admin_email from public.act_as_log where session_id = $1`, [sid]);
		expect(log.rows.map((r) => r.table_name)).toContain('classroom_submissions');
		expect(new Set(log.rows.map((r) => r.admin_email))).toEqual(new Set([admin.email]));
		const notices = await as<{ title: string; body: string }[]>(ben, 'public.account_notices_mine()', [], randomUUID());
		expect(notices).toHaveLength(1);
		expect(notices[0].title).toMatch(/worked on your account/);
		// The admin acting as Ben cannot clear Ben's notice.
		const id = (await as<{ id: string }[]>(ben, 'public.account_notices_mine()', [], sid))[0].id;
		expect(await refusal(as(ben, 'public.account_notice_dismiss($1::uuid)', [id], sid))).toMatch(/account holder/);
		const end = await as<Json>(ben, 'public.view_as_end()', [], sid);
		expect(end.changes).toBe(log.rows.length);
		const after = await as<{ body: string }[]>(ben, 'public.account_notices_mine()');
		expect(after[0].body).toMatch(/change/);
		// The admin's record names the change.
		const hist = await as<{ session: string; changes: unknown[] }[]>(admin, 'public.view_as_history()');
		expect(hist.find((h) => h.session === sid)?.changes.length).toBe(log.rows.length);
		// A view session leaves no notice (Ana has none).
		expect(await as<unknown[]>(ana, 'public.account_notices_mine()')).toEqual([]);
	});

	test('the student submitting again themselves clears the mark; the teacher grading does not', async () => {
		await as(teacher, `public.classroom_grade_direct($1::uuid, $2, 40::numeric, 'ok', true, null)`, [item, ben.email]);
		expect((await submissionOf(ben.email)).acted_by).toBe(admin.email);
		expect(await as<Json>(ben, `public.classroom_submit_assignment($1::uuid)`, [item])).toMatchObject({ ok: true });
		expect((await submissionOf(ben.email)).acted_by).toBeNull();
	});

	test('an expired act session is read-only; an admin cannot be acted as', async () => {
		const sid = await start(ben, 'act');
		await db.sql(`update public.view_as_sessions set expires_at = now() - interval '1 minute' where session_id = $1`, [sid]);
		expect(await refusal(db.asUser(ben.id, (q) => q(`update public.profiles set display_name = 'x' where id = $1`, [ben.id]), { session_id: sid })))
			.toMatch(/read-only/);
		// A teacher who is not an admin can be acted as; once an admin, cannot (viewing still can).
		expect(await refusal(as(admin, `public.view_as_grant($1::uuid, 'act')`, [teacher.id]))).toBeNull();
		await db.sql(`insert into public.app_admins (email, granted_by) values ('teach@boscotech.edu', 'apina@boscotech.edu')`);
		expect(await refusal(as(admin, `public.view_as_grant($1::uuid, 'act')`, [teacher.id]))).toMatch(/cannot act as another site admin/);
		expect(await refusal(as(admin, `public.view_as_grant($1::uuid, 'view')`, [teacher.id]))).toBeNull();
		await db.sql(`delete from public.app_admins where email = 'teach@boscotech.edu'`);
	});
});

describe('the guard is on every table', () => {
	test('every ordinary public table but the three it writes for itself carries the guard, a later table too', async () => {
		const missing = async () => (await db.sql<{ t: string }>(`
			select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relkind in ('r','p') and not c.relispartition
				and c.relname not in ('view_as_grants','view_as_sessions','act_as_log')
				and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'zz_view_as_guard')`)).rows.map((r) => r.t);
		expect(await missing()).toEqual([]);
		const guarded = await db.sql<{ n: number }>(`select count(*)::int n from pg_trigger where tgname = 'zz_view_as_guard'`);
		expect(guarded.rows[0].n).toBeGreaterThan(100);
		await db.sql(`create table public.zz_later_table (id int)`);
		expect(await missing()).toEqual(['zz_later_table']);
		await start(ana, 'view'); // starting any session attaches it
		expect(await missing()).toEqual([]);
		await db.sql(`drop table public.zz_later_table`);
	});
});

describe('0289: a test account is in nobody else\'s list', () => {
	test('it is a student, and a registered test account', async () => {
		const p = await db.sql<{ role: string; full_name: string }>(`select role, full_name from public.profiles where id = $1`, [tess.id]);
		expect(p.rows[0]).toEqual({ role: 'student', full_name: 'Test Student One' });
		const list = await as<{ email: string; classes: unknown[] }[]>(admin, 'public.test_accounts_list()');
		expect(list.map((t) => t.email)).toEqual([tess.email]);
		expect(list[0].classes).toHaveLength(1);
	});

	test('the teacher\'s roster lists the real students and not the test account', async () => {
		const r = await db.asUser(teacher.id, (q) => q<{ student_email: string }>(`select student_email from public.classroom_section_roster($1::uuid)`, [section]));
		const emails = r.rows.map((x) => x.student_email).sort();
		expect(emails).toEqual([ana.email, ben.email]);
	});

	test('the notebook roster (grid, live view) hides it from the teacher and shows it to itself', async () => {
		const rows = (u: SeededUser) => db.asUser(u.id, (q) => q<{ email: string }>(`select email from public._notebook_section_roster($1::uuid)`, [section])).then((r) => r.rows.map((x) => x.email).sort());
		await db.sql(`grant execute on function public._notebook_section_roster(uuid) to authenticated`);
		expect(await rows(teacher)).toEqual([ana.email, ben.email]);
		expect(await rows(tess)).toContain(tess.email);
		await db.sql(`revoke execute on function public._notebook_section_roster(uuid) from authenticated`);
	});

	test('coin: the economy roster, public roster, balances and stock board leave it out, except to itself', async () => {
		await db.sql(`grant execute on function public._coin_economy_enrollments() to authenticated; grant execute on function public._coin_public_roster() to authenticated`);
		const econ = (u: SeededUser) => db.asUser(u.id, (q) => q<{ student_email: string }>(`select student_email from public._coin_economy_enrollments()`)).then((r) => r.rows.map((x) => x.student_email));
		const pub = (u: SeededUser) => db.asUser(u.id, (q) => q<{ student_email: string }>(`select student_email from public._coin_public_roster()`)).then((r) => r.rows.map((x) => x.student_email));
		expect(await econ(ana)).toEqual(expect.arrayContaining([ana.email, ben.email]));
		expect(await econ(ana)).not.toContain(tess.email);
		expect(await econ(tess)).toContain(tess.email);
		expect(await pub(ana)).toEqual(expect.arrayContaining([ana.email, ben.email]));
		expect(await pub(ana)).not.toContain(tess.email);
		await db.sql(`revoke execute on function public._coin_economy_enrollments() from authenticated; revoke execute on function public._coin_public_roster() from authenticated`);
		const bal = await db.asUser(admin.id, (q) => q<{ student_email: string }>(`select student_email from public.coin_balances`));
		const balEmails = bal.rows.map((x) => x.student_email);
		expect(balEmails).toEqual(expect.arrayContaining([ana.email, ben.email]));
		expect(balEmails).not.toContain(tess.email);
		const own = await db.asUser(tess.id, (q) => q<{ student_email: string }>(`select student_email from public.coin_balances`));
		expect(own.rows.map((x) => x.student_email)).toEqual([tess.email]);

		const stock = (await db.sql<{ id: string }>(`select id from public.coin_stocks where active limit 1`)).rows[0]?.id;
		expect(stock, 'a stock to hold').toBeTruthy();
		for (const s of [ana, tess]) {
			await db.sql(`insert into public.coin_stock_positions (student_email, stock_id, shares, cost_basis) values ($1, $2, 2, 20)
				on conflict do nothing`, [s.email, stock]);
		}
		const board = (u: SeededUser) => as<{ leaderboard: { me: boolean }[] }>(u, 'public.coin_stocks_board()');
		expect((await board(ben)).leaderboard).toHaveLength(1); // Ana only
		expect((await board(tess)).leaderboard.filter((r) => r.me)).toHaveLength(1);
	});

	test('retiring takes it out of every class and keeps it hidden', async () => {
		expect((await as<Json>(admin, 'public.test_account_retire($1)', [tess.email])).ok).toBe(true);
		const e = await db.sql<{ active: boolean }>(`select active from public.classroom_enrollments where student_email = $1`, [tess.email]);
		expect(e.rows.every((r) => !r.active)).toBe(true);
		const bal = await db.asUser(admin.id, (q) => q<{ student_email: string }>(`select student_email from public.coin_balances`));
		expect(bal.rows.map((x) => x.student_email)).not.toContain(tess.email);
	});
});
